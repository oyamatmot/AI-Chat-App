import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { users, type User, type InsertUser, messages, type Message } from "@shared/schema";
import * as pg from '@neondatabase/serverless';
import session from "express-session";
import connectPg from "connect-pg-simple";
import createMemoryStore from "memorystore";

const MemoryStore = createMemoryStore(session);

// modify the interface with any CRUD methods
// you might need
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
  saveMessage(userId: number, content: string, role: "user" | "assistant"): Promise<void>;
  sessionStore: session.Store;
  updateVerificationCode(id: number, code: string): Promise<void>;
}

// PostgreSQL implementation
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

  async createUser(user: InsertUser & { verificationCode?: string }): Promise<User> {
    const result = await this.db.insert(users).values({
      email: user.email,
      password: user.password,
      verificationCode: user.verificationCode,
      verified: false,
      createdAt: new Date()
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

  async saveMessage(userId: number, content: string, role: "user" | "assistant"): Promise<void> {
    await this.db.insert(messages).values({
      content,
      role,
      userId,
      timestamp: new Date()
    });
  }
  async updateVerificationCode(id: number, code: string): Promise<void> {
    await this.db
      .update(users)
      .set({ verificationCode: code })
      .where(sql`${users.id} = ${id}`);
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
    };
    this.users.set(id, user);
    return user;
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

  async saveMessage(userId: number, content: string, role: "user" | "assistant"): Promise<void> {
    const userMessages = this.messages.get(userId) || [];
    userMessages.push({
      id: userMessages.length + 1,
      userId,
      content,
      role,
      timestamp: new Date(),
    });
    this.messages.set(userId, userMessages);
  }
  async updateVerificationCode(id: number, code: string): Promise<void> {
    const user = await this.getUser(id);
    if (user) {
      user.verificationCode = code;
    }
  }
}

// Use PostgreSQL in production, MemStorage in development
export const storage = process.env.NODE_ENV === 'production'
  ? new DatabaseStorage()
  : new MemStorage();