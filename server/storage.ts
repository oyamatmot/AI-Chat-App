import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { users, type User, type InsertUser, messages, type Message } from "@shared/schema";
import * as pg from '@neondatabase/serverless';
import session from "express-session";
import connectPg from "connect-pg-simple";
import createMemoryStore from "memorystore";

const MemoryStore = createMemoryStore(session);

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser & { verificationCode?: string }): Promise<User>;
  verifyUser(id: number): Promise<void>;
  updateUsername(id: number, username: string): Promise<void>;
  setResetCode(id: number, code: string, expiry: Date): Promise<void>;
  updatePassword(id: number, password: string): Promise<void>;
  getUserMessages(userId: number): Promise<Message[]>;
  getMessage(id: number): Promise<Message | undefined>;
  saveMessage(
    userId: number,
    content: string,
    role: "user" | "assistant",
    contentType?: "text" | "code" | "file",
    tags?: string[],
    metadata?: Record<string, unknown>
  ): Promise<Message>;
  sessionStore: session.Store;
  updateVerificationCode(id: number, code: string): Promise<void>;
  getAllUsers(): Promise<User[]>;
  unverifyUser(id: number): Promise<void>;
  editMessage(id: number, content: string): Promise<void>;
  deleteMessage(id: number): Promise<void>;
  toggleFavoriteMessage(id: number): Promise<void>;
  addMessageReaction(id: number, userId: number, reaction: string): Promise<void>;
  removeMessageReaction(id: number, userId: number, reaction: string): Promise<void>;
  searchMessages(userId: number, query: string): Promise<Message[]>;
  getMessagesByDateRange(userId: number, startDate: Date, endDate: Date): Promise<Message[]>;
  getMessagesByTags(userId: number, tags: string[]): Promise<Message[]>;
  getFavoriteMessages(userId: number): Promise<Message[]>;
  updateUserTheme(userId: number, theme: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  private pool;
  private db;
  sessionStore: session.Store;

  constructor() {
    this.pool = pg.neon(process.env.DATABASE_URL!);
    this.db = drizzle(this.pool);

    const PostgresStore = connectPg(session);
    this.sessionStore = new PostgresStore({
      conObject: {
        connectionString: process.env.DATABASE_URL,
      },
      createTableIfMissing: true,
    });
  }

  async getUser(id: number): Promise<User | undefined> {
    const result = await this.db.select().from(users).where(sql`${users.id} = ${id}`);
    return result[0];
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const result = await this.db.select().from(users).where(sql`${users.email} = ${email}`);
    return result[0];
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await this.db.select().from(users).where(sql`${users.username} = ${username}`);
    return result[0];
  }

  async getMessage(id: number): Promise<Message | undefined> {
    const result = await this.db.select().from(messages).where(sql`${messages.id} = ${id}`);
    return result[0];
  }

  async createUser(user: InsertUser & { verificationCode?: string }): Promise<User> {
    const result = await this.db.insert(users).values({
      email: user.email,
      password: user.password,
      verificationCode: user.verificationCode,
      verified: false,
      createdAt: new Date(),
      theme: "system",
    }).returning();
    return result[0];
  }

  async saveMessage(
    userId: number,
    content: string,
    role: "user" | "assistant",
    contentType: "text" | "code" | "file" = "text",
    tags: string[] = [],
    metadata: Record<string, unknown> = {}
  ): Promise<Message> {
    const result = await this.db.insert(messages).values({
      userId,
      content,
      role,
      contentType,
      tags,
      metadata,
      timestamp: new Date(),
    }).returning();
    return result[0];
  }

  async verifyUser(id: number): Promise<void> {
    await this.db
      .update(users)
      .set({ verified: true, verificationCode: null })
      .where(sql`${users.id} = ${id}`);
  }

  async updateUsername(id: number, username: string): Promise<void> {
    await this.db
      .update(users)
      .set({ username })
      .where(sql`${users.id} = ${id}`);
  }

  async setResetCode(id: number, code: string, expiry: Date): Promise<void> {
    await this.db
      .update(users)
      .set({ resetCode: code, resetCodeExpiry: expiry })
      .where(sql`${users.id} = ${id}`);
  }

  async updatePassword(id: number, password: string): Promise<void> {
    await this.db
      .update(users)
      .set({ password, resetCode: null, resetCodeExpiry: null })
      .where(sql`${users.id} = ${id}`);
  }

  async getUserMessages(userId: number): Promise<Message[]> {
    return await this.db
      .select()
      .from(messages)
      .where(sql`${messages.userId} = ${userId}`)
      .orderBy(sql`${messages.timestamp} asc`);
  }

  async updateVerificationCode(id: number, code: string): Promise<void> {
    await this.db
      .update(users)
      .set({ verificationCode: code })
      .where(sql`${users.id} = ${id}`);
  }
  async getAllUsers(): Promise<User[]> {
    return await this.db.select().from(users).orderBy(sql`${users.createdAt} desc`);
  }

  async unverifyUser(id: number): Promise<void> {
    await this.db
      .update(users)
      .set({ verified: false })
      .where(sql`${users.id} = ${id}`);
  }

  async editMessage(id: number, content: string): Promise<void> {
    const message = await this.db
      .update(messages)
      .set({ 
        content,
        edited: true,
        editHistory: sql`array_append(${messages.editHistory}, jsonb_build_object('timestamp', now(), 'content', ${messages.content}))`
      })
      .where(sql`${messages.id} = ${id}`);
  }

  async deleteMessage(id: number): Promise<void> {
    await this.db
      .update(messages)
      .set({ deleted: true })
      .where(sql`${messages.id} = ${id}`);
  }

  async toggleFavoriteMessage(id: number): Promise<void> {
    await this.db
      .update(messages)
      .set({ favorite: sql`NOT ${messages.favorite}` })
      .where(sql`${messages.id} = ${id}`);
  }

  async addMessageReaction(id: number, userId: number, reaction: string): Promise<void> {
    await this.db
      .update(messages)
      .set({
        reactions: sql`jsonb_set(
          COALESCE(${messages.reactions}, '{"count": 0, "users": []}'::jsonb),
          '{count}',
          (COALESCE((${messages.reactions}->>'count')::int, 0) + 1)::text::jsonb
        )`
      })
      .where(sql`${messages.id} = ${id}`);
  }

  async removeMessageReaction(id: number, userId: number, reaction: string): Promise<void> {
    await this.db
      .update(messages)
      .set({
        reactions: sql`jsonb_set(
          COALESCE(${messages.reactions}, '{"count": 0, "users": []}'::jsonb),
          '{count}',
          (GREATEST(COALESCE((${messages.reactions}->>'count')::int, 0) - 1, 0))::text::jsonb
        )`
      })
      .where(sql`${messages.id} = ${id}`);
  }

  async searchMessages(userId: number, query: string): Promise<Message[]> {
    return await this.db
      .select()
      .from(messages)
      .where(sql`${messages.userId} = ${userId} AND ${messages.content} ILIKE ${`%${query}%`}`)
      .orderBy(sql`${messages.timestamp} desc`);
  }

  async getMessagesByDateRange(userId: number, startDate: Date, endDate: Date): Promise<Message[]> {
    return await this.db
      .select()
      .from(messages)
      .where(sql`${messages.userId} = ${userId} 
        AND ${messages.timestamp} >= ${startDate} 
        AND ${messages.timestamp} <= ${endDate}`)
      .orderBy(sql`${messages.timestamp} desc`);
  }

  async getMessagesByTags(userId: number, tags: string[]): Promise<Message[]> {
    return await this.db
      .select()
      .from(messages)
      .where(sql`${messages.userId} = ${userId} AND ${messages.tags} && ${tags}`)
      .orderBy(sql`${messages.timestamp} desc`);
  }

  async getFavoriteMessages(userId: number): Promise<Message[]> {
    return await this.db
      .select()
      .from(messages)
      .where(sql`${messages.userId} = ${userId} AND ${messages.favorite} = true`)
      .orderBy(sql`${messages.timestamp} desc`);
  }

  async updateUserTheme(userId: number, theme: string): Promise<void> {
    await this.db
      .update(users)
      .set({ theme })
      .where(sql`${users.id} = ${userId}`);
  }
}

// In-memory implementation for development
export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private messages: Map<number, Message[]>;
  currentId: number;
  sessionStore: session.Store;

  constructor() {
    this.users = new Map();
    this.messages = new Map();
    this.currentId = 1;
    this.sessionStore = new MemoryStore({
      checkPeriod: 86400000, // prune expired entries every 24h
    });
  }

  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.email === email,
    );
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async getMessage(id: number): Promise<Message | undefined> {
    const userMessages = this.messages.get(id);
    return userMessages?.find(msg => msg.id === id);
  }

  async createUser(insertUser: InsertUser & { verificationCode?: string }): Promise<User> {
    const id = this.currentId++;
    const user: User = {
      id,
      email: insertUser.email,
      password: insertUser.password,
      username: null,
      verified: false,
      verificationCode: insertUser.verificationCode || null,
      resetCode: null,
      resetCodeExpiry: null,
      createdAt: new Date(),
      theme: "system", //added theme
    };
    this.users.set(id, user);
    return user;
  }

  async saveMessage(
    userId: number,
    content: string,
    role: "user" | "assistant",
    contentType: "text" | "code" | "file" = "text",
    tags: string[] = [],
    metadata: Record<string, unknown> = {}
  ): Promise<Message> {
    const userMessages = this.messages.get(userId) || [];
    const newMessage: Message = {
      id: userMessages.length + 1,
      userId,
      content,
      role,
      contentType,
      tags,
      metadata,
      timestamp: new Date(),
      edited: false,
      editHistory: [],
      deleted: false,
      favorite: false,
      reactions: {count: 0, users: []},
    };
    userMessages.push(newMessage);
    this.messages.set(userId, userMessages);
    return newMessage;
  }

  async verifyUser(id: number): Promise<void> {
    const user = await this.getUser(id);
    if (user) {
      user.verified = true;
      user.verificationCode = null;
    }
  }

  async updateUsername(id: number, username: string): Promise<void> {
    const user = await this.getUser(id);
    if (user) {
      user.username = username;
    }
  }

  async setResetCode(id: number, code: string, expiry: Date): Promise<void> {
    const user = await this.getUser(id);
    if (user) {
      user.resetCode = code;
      user.resetCodeExpiry = expiry;
    }
  }

  async updatePassword(id: number, password: string): Promise<void> {
    const user = await this.getUser(id);
    if (user) {
      user.password = password;
      user.resetCode = null;
      user.resetCodeExpiry = null;
    }
  }

  async getUserMessages(userId: number): Promise<Message[]> {
    return this.messages.get(userId) || [];
  }

  async updateVerificationCode(id: number, code: string): Promise<void> {
    const user = await this.getUser(id);
    if (user) {
      user.verificationCode = code;
    }
  }
  async getAllUsers(): Promise<User[]> {
    return Array.from(this.users.values()).sort((a, b) => 
      b.createdAt.getTime() - a.createdAt.getTime()
    );
  }

  async unverifyUser(id: number): Promise<void> {
    const user = await this.getUser(id);
    if (user) {
      user.verified = false;
    }
  }

  async editMessage(id: number, content: string): Promise<void> {
    const userMessages = this.messages.get(id);
    if(userMessages){
        const message = userMessages.find(msg => msg.id === id);
        if(message){
            message.content = content;
            message.edited = true;
            message.editHistory.push({timestamp: new Date(), content: content});
        }
    }
  }

  async deleteMessage(id: number): Promise<void> {
    const userMessages = this.messages.get(id);
    if(userMessages){
        const messageIndex = userMessages.findIndex(msg => msg.id === id);
        if(messageIndex > -1){
            userMessages[messageIndex].deleted = true;
        }
    }
  }

  async toggleFavoriteMessage(id: number): Promise<void> {
    const userMessages = this.messages.get(id);
    if(userMessages){
        const message = userMessages.find(msg => msg.id === id);
        if(message){
            message.favorite = !message.favorite;
        }
    }
  }

  async addMessageReaction(id: number, userId: number, reaction: string): Promise<void> {
    const userMessages = this.messages.get(id);
    if(userMessages){
        const message = userMessages.find(msg => msg.id === id);
        if(message){
            message.reactions.count++;
            message.reactions.users.push(userId);
        }
    }
  }

  async removeMessageReaction(id: number, userId: number, reaction: string): Promise<void> {
    const userMessages = this.messages.get(id);
    if(userMessages){
        const message = userMessages.find(msg => msg.id === id);
        if(message){
            message.reactions.count = Math.max(0, message.reactions.count -1);
            message.reactions.users = message.reactions.users.filter(uid => uid !== userId);
        }
    }
  }

  async searchMessages(userId: number, query: string): Promise<Message[]> {
    const userMessages = this.messages.get(userId) || [];
    return userMessages.filter(msg => !msg.deleted && msg.content.toLowerCase().includes(query.toLowerCase()));
  }

  async getMessagesByDateRange(userId: number, startDate: Date, endDate: Date): Promise<Message[]> {
    const userMessages = this.messages.get(userId) || [];
    return userMessages.filter(msg => !msg.deleted && msg.timestamp >= startDate && msg.timestamp <= endDate);
  }

  async getMessagesByTags(userId: number, tags: string[]): Promise<Message[]> {
    const userMessages = this.messages.get(userId) || [];
    return userMessages.filter(msg => !msg.deleted && msg.tags?.some(tag => tags.includes(tag)));
  }

  async getFavoriteMessages(userId: number): Promise<Message[]> {
    const userMessages = this.messages.get(userId) || [];
    return userMessages.filter(msg => !msg.deleted && msg.favorite);
  }

  async updateUserTheme(userId: number, theme: string): Promise<void> {
    const user = await this.getUser(userId);
    if (user) {
      user.theme = theme;
    }
  }
}

// Use PostgreSQL in production, MemStorage in development
export const storage = process.env.NODE_ENV === 'production'
  ? new DatabaseStorage()
  : new MemStorage();