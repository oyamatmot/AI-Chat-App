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
      const userMessage = await storage.createMessage({
        userId: req.user.id,
        content: message,
        isAi: false,
      });

      const aiResponse = await generateChatResponse(message);
      const aiMessage = await storage.createMessage({
        userId: req.user.id,
        content: aiResponse,
        isAi: true,
      });

      res.json({ userMessage, aiMessage });
    } catch (error) {
      res.status(500).json({ error: "Failed to process message" });
    }
  });

  app.get("/api/chat/history", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const messages = await storage.getUserMessages(req.user.id);
      res.json(messages);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch chat history" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
