import { pgTable, text, serial, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  username: text("username").unique(),
  password: text("password").notNull(),
  verified: boolean("verified").default(false).notNull(),
  isAdmin: boolean("is_admin").default(false).notNull(),
  verificationCode: text("verification_code"),
  resetCode: text("reset_code"),
  resetCodeExpiry: timestamp("reset_code_expiry"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  theme: text("theme").default("system").notNull(),
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  userId: serial("user_id").references(() => users.id),
  content: text("content").notNull(),
  contentType: text("content_type", { enum: ["text", "code", "file"] }).default("text").notNull(),
  role: text("role", { enum: ["user", "assistant"] }).notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  edited: boolean("edited").default(false).notNull(),
  deleted: boolean("deleted").default(false).notNull(),
  tags: text("tags").array(),
  favorite: boolean("favorite").default(false).notNull(),
  reactions: jsonb("reactions").default({ count: 0, users: [] }).notNull(),
  metadata: jsonb("metadata").default({}).notNull(),
  editHistory: jsonb("edit_history").default([]).notNull(),
});

export const insertUserSchema = createInsertSchema(users)
  .pick({
    email: true,
    password: true,
  })
  .extend({
    password: z.string().min(8),
  });

export const updateUsernameSchema = z.object({
  username: z.string().min(3).max(30),
});

export const resetPasswordSchema = z.object({
  email: z.string().email(),
  code: z.string().optional(),
  password: z.string().min(8).optional(),
});

export const messageSchema = z.object({
  content: z.string(),
  contentType: z.enum(["text", "code", "file"]).default("text"),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type InsertMessage = z.infer<typeof messageSchema>;