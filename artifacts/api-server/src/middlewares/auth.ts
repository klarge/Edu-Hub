import type { Request, Response, NextFunction } from "express";
import { verifyToken, COOKIE_NAME } from "../lib/jwt.js";
import { db } from "@workspace/db";
import { usersTable, apiKeysTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  ssoProvider: string | null;
  ssoSubject: string | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

function toAuthUser(user: typeof usersTable.$inferSelect): AuthUser {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    firstName: user.firstName,
    lastName: user.lastName,
    isActive: user.isActive,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    ssoProvider: user.ssoProvider,
    ssoSubject: user.ssoSubject,
  };
}

export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const token = req.cookies?.[COOKIE_NAME] as string | undefined;

  // Support Bearer token for API key auth
  const authHeader = req.headers["authorization"];
  if (!token && authHeader?.startsWith("Bearer ")) {
    const apiKey = authHeader.slice(7);
    try {
      const allKeys = await db
        .select()
        .from(apiKeysTable)
        .where(eq(apiKeysTable.isActive, true));

      let matchedUserId: string | null = null;
      let matchedKeyId: string | null = null;
      for (const k of allKeys) {
        if (await bcrypt.compare(apiKey, k.keyHash)) {
          matchedUserId = k.userId;
          matchedKeyId = k.id;
          break;
        }
      }

      if (matchedUserId && matchedKeyId) {
        // Update lastUsedAt in background
        db.update(apiKeysTable)
          .set({ lastUsedAt: new Date() })
          .where(eq(apiKeysTable.id, matchedKeyId))
          .catch(() => {});

        const [user] = await db
          .select()
          .from(usersTable)
          .where(eq(usersTable.id, matchedUserId));

        if (user && user.isActive) {
          req.user = toAuthUser(user);
          next();
          return;
        }
      }
    } catch {
      // Fall through to 401
    }
    res.status(401).json({ error: "Invalid API key" });
    return;
  }

  if (!token) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  try {
    const payload = verifyToken(token);
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, payload.userId));

    if (!user || !user.isActive) {
      res.status(401).json({ error: "User not found or inactive" });
      return;
    }

    req.user = toAuthUser(user);
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
