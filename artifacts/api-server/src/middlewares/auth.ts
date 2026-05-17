import type { Request, Response, NextFunction } from "express";
import { verifyToken, COOKIE_NAME } from "../lib/jwt.js";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { apiKeysTable } from "@workspace/db/schema";

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  firstName: string;
  lastName: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const token = req.cookies?.[COOKIE_NAME] as string | undefined;

  // Also support Bearer token for API key auth
  const authHeader = req.headers["authorization"];
  if (!token && authHeader?.startsWith("Bearer ")) {
    const apiKey = authHeader.slice(7);
    try {
      const [keyRow] = await db
        .select()
        .from(apiKeysTable)
        .where(eq(apiKeysTable.isActive, true));

      // Find matching key by brute-force comparison (small table)
      const allKeys = await db
        .select()
        .from(apiKeysTable)
        .where(eq(apiKeysTable.isActive, true));

      let matchedUserId: string | null = null;
      for (const k of allKeys) {
        if (await bcrypt.compare(apiKey, k.keyHash)) {
          matchedUserId = k.userId;
          // Update lastUsedAt in background
          db.update(apiKeysTable)
            .set({ lastUsedAt: new Date() })
            .where(eq(apiKeysTable.id, k.id))
            .catch(() => {});
          break;
        }
      }

      if (matchedUserId) {
        const [user] = await db
          .select()
          .from(usersTable)
          .where(eq(usersTable.id, matchedUserId));
        if (user && user.isActive) {
          req.user = {
            id: user.id,
            email: user.email,
            role: user.role,
            firstName: user.firstName,
            lastName: user.lastName,
          };
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

    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
    };
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
