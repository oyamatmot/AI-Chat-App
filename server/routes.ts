import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { generateChatResponse } from "./openai";

export function registerRoutes(app: Express): Server {
  setupAuth(app);

  app.post("/api/chat", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    const { message } = req.body;
    if (!message) return res.status(400).send("Message is required");

    try {
      const messages = await storage.getUserMessages(req.user!.id);
      const chatHistory = messages.map(m => ({
        role: m.role,
        content: m.content
      }));

      chatHistory.push({ role: "user", content: message });

      const response = await generateChatResponse(chatHistory);

      await storage.saveMessage(req.user!.id, message, "user");
      await storage.saveMessage(req.user!.id, response!, "assistant");

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

  const httpServer = createServer(app);
  return httpServer;
}