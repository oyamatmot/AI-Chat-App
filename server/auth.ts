import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User as SelectUser } from "@shared/schema";
import { sendVerificationEmail, sendPasswordResetEmail, notifyAdminNewUser, notifyAdminPasswordReset } from "./email";

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

function generateVerificationCode() {
  return randomBytes(3).toString("hex").toUpperCase();
}

export function setupAuth(app: Express) {
  const sessionSettings: session.SessionOptions = {
    secret: process.env.REPL_ID!,
    resave: false,
    saveUninitialized: false,
    store: storage.sessionStore,
  };

  if (app.get("env") === "production") {
    app.set("trust proxy", 1);
  }

  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(
      { usernameField: "email" },
      async (email, password, done) => {
        const user = await storage.getUserByEmail(email);
        if (!user || !(await comparePasswords(password, user.password))) {
          return done(null, false);
        }
        if (!user.isVerified) {
          return done(null, false, { message: "Please verify your email first" });
        }
        return done(null, user);
      }
    )
  );

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id: number, done) => {
    const user = await storage.getUser(id);
    done(null, user);
  });

  app.post("/api/register", async (req, res, next) => {
    const existingUser = await storage.getUserByEmail(req.body.email);
    if (existingUser) {
      return res.status(400).send("Email already exists");
    }

    const verificationCode = generateVerificationCode();
    const user = await storage.createUser({
      ...req.body,
      password: await hashPassword(req.body.password),
      verificationCode,
    });

    await sendVerificationEmail(req.body.email, verificationCode);
    await notifyAdminNewUser(req.body.username, req.body.email);

    res.status(201).json({ message: "Verification email sent" });
  });

  app.post("/api/verify", async (req, res) => {
    const { email, code } = req.body;
    const user = await storage.getUserByEmail(email);
    
    if (!user || user.verificationCode !== code) {
      return res.status(400).send("Invalid verification code");
    }

    await storage.verifyUser(user.id);
    res.json({ message: "Email verified" });
  });

  app.post("/api/forgot-password", async (req, res) => {
    const { email } = req.body;
    const user = await storage.getUserByEmail(email);
    
    if (!user) {
      return res.status(400).send("Email not found");
    }

    const resetCode = generateVerificationCode();
    await storage.setResetCode(user.id, resetCode);
    await sendPasswordResetEmail(email, resetCode);
    await notifyAdminPasswordReset(email);

    res.json({ message: "Reset code sent" });
  });

  app.post("/api/reset-password", async (req, res) => {
    const { email, code, newPassword } = req.body;
    const user = await storage.getUserByEmail(email);
    
    if (!user || user.resetCode !== code) {
      return res.status(400).send("Invalid reset code");
    }

    await storage.updatePassword(user.id, await hashPassword(newPassword));
    res.json({ message: "Password updated" });
  });

  app.post("/api/login", passport.authenticate("local"), (req, res) => {
    res.status(200).json(req.user);
  });

  app.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });

  app.get("/api/user", (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    res.json(req.user);
  });
}
