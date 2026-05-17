import { Router } from "express";
import bcrypt from "bcryptjs";
import { eq, like, and, inArray, sql, or } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  usersTable,
  userTagGroupsTable,
  apiKeysTable,
  auditLogTable,
} from "@workspace/db/schema";
import { authenticate } from "../middlewares/auth.js";
import { requireRole, requireMinRole } from "../middlewares/requireRole.js";
import type { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import multer from "multer";
import { parse } from "csv-parse/sync";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// Helper to strip passwordHash from user
function safeUser(user: typeof usersTable.$inferSelect) {
  const { passwordHash: _ph, ...safe } = user;
  return safe;
}

// GET /users
router.get("/users", authenticate, requireMinRole("manager"), async (req: Request, res: Response) => {
  const { search, role, groupId, page = "1", limit = "20" } = req.query as Record<string, string>;
  const pageNum = Math.max(1, parseInt(page));
  const pageSize = Math.min(100, Math.max(1, parseInt(limit)));
  const offset = (pageNum - 1) * pageSize;

  // Managers can only see users in their tag groups
  let allowedUserIds: string[] | null = null;
  if (req.user?.role === "manager") {
    const managerGroups = await db
      .select({ tagGroupId: userTagGroupsTable.tagGroupId })
      .from(userTagGroupsTable)
      .where(eq(userTagGroupsTable.userId, req.user.id));
    const groupIds = managerGroups.map((g) => g.tagGroupId);
    if (groupIds.length === 0) {
      res.json({ users: [], total: 0, page: pageNum, limit: pageSize });
      return;
    }
    const usersInGroups = await db
      .select({ userId: userTagGroupsTable.userId })
      .from(userTagGroupsTable)
      .where(inArray(userTagGroupsTable.tagGroupId, groupIds));
    allowedUserIds = [...new Set(usersInGroups.map((u) => u.userId))];
  }

  const conditions: ReturnType<typeof eq>[] = [];
  if (role) conditions.push(eq(usersTable.role, role as "admin" | "training_lead" | "manager" | "user"));
  if (allowedUserIds) conditions.push(inArray(usersTable.id, allowedUserIds));

  let query = db.select().from(usersTable);

  if (search) {
    const term = `%${search}%`;
    const combined = conditions.length > 0
      ? and(...conditions, or(like(usersTable.email, term), like(usersTable.firstName, term), like(usersTable.lastName, term)))
      : or(like(usersTable.email, term), like(usersTable.firstName, term), like(usersTable.lastName, term));
    query = query.where(combined) as typeof query;
  } else if (conditions.length > 0) {
    query = query.where(and(...conditions)) as typeof query;
  }

  if (groupId) {
    const usersInGroup = await db
      .select({ userId: userTagGroupsTable.userId })
      .from(userTagGroupsTable)
      .where(eq(userTagGroupsTable.tagGroupId, groupId));
    const ids = usersInGroup.map((u) => u.userId);
    if (ids.length === 0) {
      res.json({ users: [], total: 0, page: pageNum, limit: pageSize });
      return;
    }
    query = query.where(inArray(usersTable.id, ids)) as typeof query;
  }

  const [countResult, users] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(usersTable),
    query.offset(offset).limit(pageSize),
  ]);

  res.json({
    users: users.map(safeUser),
    total: Number(countResult[0]?.count ?? 0),
    page: pageNum,
    limit: pageSize,
  });
});

// POST /users
router.post("/users", authenticate, requireRole("admin"), async (req: Request, res: Response) => {
  const { email, password, firstName, lastName, role = "user" } = req.body as Record<string, string>;

  if (!email || !firstName || !lastName) {
    res.status(400).json({ error: "email, firstName, and lastName are required" });
    return;
  }

  const passwordHash = password ? await bcrypt.hash(password, 12) : null;

  const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase()));
  if (existing) {
    res.status(409).json({ error: "Email already in use" });
    return;
  }

  const [user] = await db
    .insert(usersTable)
    .values({
      email: email.toLowerCase(),
      passwordHash,
      firstName,
      lastName,
      role: role as "admin" | "training_lead" | "manager" | "user",
    })
    .returning();

  await db.insert(auditLogTable).values({
    userId: req.user!.id,
    action: "create_user",
    resourceType: "user",
    resourceId: user!.id,
  });

  res.status(201).json({ user: safeUser(user!) });
});

// GET /users/:id
router.get("/users/:id", authenticate, requireMinRole("manager"), async (req: Request, res: Response) => {
  const { id } = req.params as { id: string };

  // Managers can only access users in their groups
  if (req.user?.role === "manager") {
    const managerGroups = await db
      .select({ tagGroupId: userTagGroupsTable.tagGroupId })
      .from(userTagGroupsTable)
      .where(eq(userTagGroupsTable.userId, req.user.id));
    const groupIds = managerGroups.map((g) => g.tagGroupId);
    if (groupIds.length > 0) {
      const [membership] = await db
        .select()
        .from(userTagGroupsTable)
        .where(and(eq(userTagGroupsTable.userId, id), inArray(userTagGroupsTable.tagGroupId, groupIds)));
      if (!membership) {
        res.status(403).json({ error: "Access denied" });
        return;
      }
    }
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  // Get tag groups
  const tagGroups = await db
    .select({ tagGroupId: userTagGroupsTable.tagGroupId })
    .from(userTagGroupsTable)
    .where(eq(userTagGroupsTable.userId, id));

  res.json({ user: { ...safeUser(user), tagGroupIds: tagGroups.map((g) => g.tagGroupId) } });
});

// PUT /users/:id
router.put("/users/:id", authenticate, requireMinRole("admin"), async (req: Request, res: Response) => {
  const { id } = req.params as { id: string };
  const { email, password, firstName, lastName, role, isActive } = req.body as Record<string, unknown>;

  const updates: Partial<typeof usersTable.$inferInsert> = {};
  if (typeof email === "string") updates.email = email.toLowerCase();
  if (typeof password === "string") updates.passwordHash = await bcrypt.hash(password, 12);
  if (typeof firstName === "string") updates.firstName = firstName;
  if (typeof lastName === "string") updates.lastName = lastName;
  if (typeof role === "string") updates.role = role as "admin" | "training_lead" | "manager" | "user";
  if (typeof isActive === "boolean") updates.isActive = isActive;
  updates.updatedAt = new Date();

  const [user] = await db
    .update(usersTable)
    .set(updates)
    .where(eq(usersTable.id, id))
    .returning();

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  await db.insert(auditLogTable).values({
    userId: req.user!.id,
    action: "update_user",
    resourceType: "user",
    resourceId: id,
  });

  res.json({ user: safeUser(user) });
});

// DELETE /users/:id — deactivates the user
router.delete("/users/:id", authenticate, requireRole("admin"), async (req: Request, res: Response) => {
  const { id } = req.params as { id: string };

  const [user] = await db
    .update(usersTable)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(usersTable.id, id))
    .returning();

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  await db.insert(auditLogTable).values({
    userId: req.user!.id,
    action: "deactivate_user",
    resourceType: "user",
    resourceId: id,
  });

  res.json({ success: true });
});

// POST /users/import
router.post(
  "/users/import",
  authenticate,
  requireRole("admin"),
  upload.single("file"),
  async (req: Request, res: Response) => {
    let records: Array<Record<string, string>> = [];

    if (req.file) {
      // CSV upload
      const csv = req.file.buffer.toString("utf-8");
      records = parse(csv, { columns: true, trim: true, skip_empty_lines: true });
    } else if (req.body && Array.isArray((req.body as { users?: unknown }).users)) {
      records = (req.body as { users: Record<string, string>[] }).users;
    } else {
      res.status(400).json({ error: "Provide a CSV file or JSON body with users array" });
      return;
    }

    const results: Array<{ email: string; status: "created" | "exists" | "error"; error?: string }> = [];

    for (const record of records) {
      const email = record["email"]?.toLowerCase();
      if (!email) {
        results.push({ email: "", status: "error", error: "Missing email" });
        continue;
      }
      try {
        const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, email));
        if (existing) {
          results.push({ email, status: "exists" });
          continue;
        }

        const passwordHash = record["password"] ? await bcrypt.hash(record["password"], 12) : null;
        await db.insert(usersTable).values({
          email,
          passwordHash,
          firstName: record["firstName"] ?? record["first_name"] ?? "Unknown",
          lastName: record["lastName"] ?? record["last_name"] ?? "User",
          role: (record["role"] as "admin" | "training_lead" | "manager" | "user") ?? "user",
        });
        results.push({ email, status: "created" });
      } catch (err) {
        results.push({ email, status: "error", error: String(err) });
      }
    }

    res.json({
      total: records.length,
      created: results.filter((r) => r.status === "created").length,
      existing: results.filter((r) => r.status === "exists").length,
      errors: results.filter((r) => r.status === "error").length,
      results,
    });
  },
);

// ─── API Keys ─────────────────────────────────────────────────────────────────

// GET /users/:id/api-keys
router.get("/users/:id/api-keys", authenticate, async (req: Request, res: Response) => {
  const { id } = req.params as { id: string };
  if (req.user!.role !== "admin" && req.user!.id !== id) {
    res.status(403).json({ error: "Access denied" });
    return;
  }
  const keys = await db
    .select({
      id: apiKeysTable.id,
      name: apiKeysTable.name,
      lastUsedAt: apiKeysTable.lastUsedAt,
      isActive: apiKeysTable.isActive,
      createdAt: apiKeysTable.createdAt,
    })
    .from(apiKeysTable)
    .where(and(eq(apiKeysTable.userId, id), eq(apiKeysTable.isActive, true)));

  res.json({ keys });
});

// POST /users/:id/api-keys
router.post("/users/:id/api-keys", authenticate, async (req: Request, res: Response) => {
  const { id } = req.params as { id: string };
  if (req.user!.role !== "admin" && req.user!.id !== id) {
    res.status(403).json({ error: "Access denied" });
    return;
  }
  const { name } = req.body as { name?: string };
  if (!name) {
    res.status(400).json({ error: "name is required" });
    return;
  }

  const rawKey = `tp_${uuidv4().replace(/-/g, "")}`;
  const keyHash = await bcrypt.hash(rawKey, 10);

  const [key] = await db
    .insert(apiKeysTable)
    .values({ userId: id, name, keyHash })
    .returning({
      id: apiKeysTable.id,
      name: apiKeysTable.name,
      createdAt: apiKeysTable.createdAt,
    });

  // Return the raw key only once
  res.status(201).json({ key: { ...key, rawKey } });
});

// DELETE /users/:id/api-keys/:keyId
router.delete("/users/:id/api-keys/:keyId", authenticate, async (req: Request, res: Response) => {
  const { id, keyId } = req.params as { id: string; keyId: string };
  if (req.user!.role !== "admin" && req.user!.id !== id) {
    res.status(403).json({ error: "Access denied" });
    return;
  }
  await db
    .update(apiKeysTable)
    .set({ isActive: false })
    .where(and(eq(apiKeysTable.id, keyId), eq(apiKeysTable.userId, id)));

  res.json({ success: true });
});

export default router;
