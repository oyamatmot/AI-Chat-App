import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User as SelectUser } from "@shared/schema";
import { sendVerificationEmail, sendPasswordResetEmail, sendAdminNotification } from "./email";

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
    cookie: {
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  };

  if (app.get("env") === "production") {
    app.set("trust proxy", 1);
    sessionSettings.cookie!.secure = true;
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
        // Remove verification check to allow unverified users to login
        return done(null, user);
      },
    ),
  );

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id: number, done) => {
    const user = await storage.getUser(id);
    done(null, user);
  });

  app.post("/api/register", async (req, res, next) => {
    try {
      const existingUser = await storage.getUserByEmail(req.body.email);
      if (existingUser) {
        return res.status(400).send("Email already registered");
      }

      const verificationCode = generateVerificationCode();
      const user = await storage.createUser({
        ...req.body,
        password: await hashPassword(req.body.password),
        verificationCode,
      });

      await sendVerificationEmail(user.email, verificationCode);
      await sendAdminNotification("new_user", user.email);

      // Log the user in immediately after registration
      req.login(user, (err) => {
        if (err) return next(err);
        res.status(201).json(user);
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/verify", async (req, res, next) => {
    try {
      const { email, code } = req.body;
      const user = await storage.getUserByEmail(email);

      if (!user || user.verificationCode !== code) {
        return res.status(400).send("Invalid verification code");
      }

      await storage.verifyUser(user.id);
      res.status(200).json({ message: "Email verified successfully" });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/resend-verification", async (req, res, next) => {
    try {
      if (!req.isAuthenticated()) return res.sendStatus(401);

      const verificationCode = generateVerificationCode();
      await storage.updateVerificationCode(req.user!.id, verificationCode);
      await sendVerificationEmail(req.user!.email, verificationCode);

      res.status(200).json({ message: "Verification code sent" });
    } catch (error) {
      next(error);
    }
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

  app.post("/api/username", async (req, res, next) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const { username } = req.body;
      await storage.updateUsername(req.user!.id, username);
      res.status(200).json({ ...req.user, username });
    } catch (error) {
      next(error);
    }
  });
}