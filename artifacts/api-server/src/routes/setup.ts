import { Router } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { usersTable, appSettingsTable } from "@workspace/db/schema";
import { signToken, COOKIE_NAME, COOKIE_OPTIONS } from "../lib/jwt.js";
import { sql } from "drizzle-orm";
import type { Request, Response } from "express";

const router = Router();

async function hasAnyUser(): Promise<boolean> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(usersTable);
  return (row?.count ?? 0) > 0;
}

// GET /setup/status — public, no auth required
router.get("/setup/status", async (_req: Request, res: Response) => {
  const exists = await hasAnyUser();
  res.json({ needsSetup: !exists });
});

// POST /setup — create the first admin account (only works when DB has no users)
router.post("/setup", async (req: Request, res: Response) => {
  if (await hasAnyUser()) {
    res.status(403).json({ error: "Setup has already been completed" });
    return;
  }

  const { firstName, lastName, email, password, platformName } = req.body as {
    firstName?: string;
    lastName?: string;
    email?: string;
    password?: string;
    platformName?: string;
  };

  if (!firstName || !lastName || !email || !password) {
    res.status(400).json({ error: "firstName, lastName, email and password are required" });
    return;
  }
  if (password.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const [user] = await db
    .insert(usersTable)
    .values({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.toLowerCase().trim(),
      passwordHash,
      role: "admin",
      isActive: true,
    })
    .returning();

  // Persist platform name if provided
  if (platformName?.trim()) {
    await db
      .insert(appSettingsTable)
      .values({ key: "app_name", value: platformName.trim() })
      .onConflictDoUpdate({ target: appSettingsTable.key, set: { value: platformName.trim() } });
  }

  const token = signToken(user);
  res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);
  const { passwordHash: _ph, ...safeUser } = user;
  res.status(201).json({ user: safeUser });
});

export default router;
