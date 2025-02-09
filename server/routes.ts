import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { generateChatResponse } from "./openai";
import { setupWebSocket } from "./websocket";
import { rateLimit } from 'express-rate-limit';

export function registerRoutes(app: Express): Server {
  // Rate limiting
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
  });

  app.use("/api/", apiLimiter);

  setupAuth(app);

  // Create HTTP server
  const httpServer = createServer(app);

  // Setup WebSocket server
  const ws = setupWebSocket(httpServer);

  // Message routes
  app.get("/api/messages/search", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const { query } = req.query;
      const messages = await storage.searchMessages(req.user!.id, query as string);
      res.json(messages);
    } catch (error) {
      res.status(500).json({ error: "Failed to search messages" });
    }
  });

  app.get("/api/messages/date-range", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const { start, end } = req.query;
      const messages = await storage.getMessagesByDateRange(
        req.user!.id,
        new Date(start as string),
        new Date(end as string)
      );
      res.json(messages);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch messages by date range" });
    }
  });

  app.get("/api/messages/favorites", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const messages = await storage.getFavoriteMessages(req.user!.id);
      res.json(messages);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch favorite messages" });
    }
  });

  app.patch("/api/messages/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const messageId = parseInt(req.params.id);
      const { content } = req.body;

      await storage.editMessage(messageId, content);
      const message = await storage.getMessage(messageId);

      if (message) {
        ws.notifyMessageUpdate(req.user!.id, message);
      }

      res.json({ message: "Message updated" });
    } catch (error) {
      res.status(500).json({ error: "Failed to update message" });
    }
  });

  app.delete("/api/messages/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const messageId = parseInt(req.params.id);
      await storage.deleteMessage(messageId);
      ws.notifyMessageDelete(req.user!.id, messageId);
      res.json({ message: "Message deleted" });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete message" });
    }
  });

  app.post("/api/messages/:id/favorite", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const messageId = parseInt(req.params.id);
      await storage.toggleFavoriteMessage(messageId);
      const message = await storage.getMessage(messageId);
      if (message) {
        ws.notifyMessageUpdate(req.user!.id, message);
      }
      res.json({ message: "Message favorite status updated" });
    } catch (error) {
      res.status(500).json({ error: "Failed to update favorite status" });
    }
  });

  app.post("/api/messages/:id/reaction", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const messageId = parseInt(req.params.id);
      const { reaction, remove } = req.body;
      if (remove) {
        await storage.removeMessageReaction(messageId, req.user!.id, reaction);
      } else {
        await storage.addMessageReaction(messageId, req.user!.id, reaction);
      }
      const message = await storage.getMessage(messageId);
      if (message) {
        ws.notifyMessageUpdate(req.user!.id, message);
      }
      res.json({ message: "Reaction updated" });
    } catch (error) {
      res.status(500).json({ error: "Failed to update reaction" });
    }
  });

  // Theme preference
  app.post("/api/user/theme", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const { theme } = req.body;
      await storage.updateUserTheme(req.user!.id, theme);
      res.json({ message: "Theme updated" });
    } catch (error) {
      res.status(500).json({ error: "Failed to update theme" });
    }
  });

  // Admin routes
  const isAdmin = (req: any, res: any, next: any) => {
    if (!req.isAuthenticated() || !req.user.isAdmin) {
      return res.sendStatus(403);
    }
    next();
  };

  app.get("/api/admin/users", isAdmin, async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      res.json(users);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  app.post("/api/admin/users/:id/verify", isAdmin, async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      const { verified } = req.body;

      if (verified) {
        await storage.verifyUser(userId);
      } else {
        await storage.unverifyUser(userId);
      }

      res.json({ message: "User verification status updated" });
    } catch (error) {
      res.status(500).json({ error: "Failed to update user verification status" });
    }
  });

  // Modified chat route to support real-time updates
  app.post("/api/chat", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    const { message, contentType = "text", tags = [], metadata = {} } = req.body;
    if (!message) return res.status(400).send("Message is required");

    try {
      const messages = await storage.getUserMessages(req.user!.id);
      const chatHistory = messages.map(m => ({
        role: m.role,
        content: m.content
      }));

      chatHistory.push({ role: "user", content: message });

      const response = await generateChatResponse(chatHistory);

      // Save user message
      const userMessage = await storage.saveMessage(
        req.user!.id,
        message,
        "user",
        contentType,
        tags,
        metadata
      );
      ws.notifyMessageUpdate(req.user!.id, userMessage);

      // Save assistant response
      const assistantMessage = await storage.saveMessage(
        req.user!.id,
        response!,
        "assistant"
      );
      ws.notifyMessageUpdate(req.user!.id, assistantMessage);

      res.json({ response });
    } catch (error) {
      console.error('Chat error:', error);
      res.status(500).json({ error: "Failed to generate response" });
    }
  });

  app.get("/api/chat/history", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const messages = await storage.getUserMessages(req.user!.id);
      res.json(messages);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch chat history" });
    }
  });

  return httpServer;
}