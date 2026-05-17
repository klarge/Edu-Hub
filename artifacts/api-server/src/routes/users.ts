import { Router } from "express";
import bcrypt from "bcryptjs";
import { eq, like, and, inArray, sql, or, gte, lte } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  usersTable,
  userTagGroupsTable,
  apiKeysTable,
  auditLogTable,
  completionRecordsTable,
  trainingGroupAssignmentsTable,
  tagGroupsTable,
} from "@workspace/db/schema";
import { authenticate } from "../middlewares/auth.js";
import { requireRole, requireMinRole } from "../middlewares/requireRole.js";
import type { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import multer from "multer";
import { parse } from "csv-parse/sync";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

function safeUser(user: typeof usersTable.$inferSelect) {
  const { passwordHash: _ph, ...safe } = user;
  return safe;
}

// ─── Users ────────────────────────────────────────────────────────────────────

// GET /users
router.get("/users", authenticate, requireMinRole("manager"), async (req: Request, res: Response) => {
  const { search, role, groupId, page = "1", limit = "20" } = req.query as Record<string, string>;
  const pageNum = Math.max(1, parseInt(page));
  const pageSize = Math.min(100, Math.max(1, parseInt(limit)));
  const offset = (pageNum - 1) * pageSize;

  // ── Resolve base user ID set based on role ──────────────────────────────────

  let allowedUserIds: string[] | null = null;
  if (req.user?.role === "manager") {
    const managerGroups = await db
      .select({ tagGroupId: userTagGroupsTable.tagGroupId })
      .from(userTagGroupsTable)
      .where(eq(userTagGroupsTable.userId, req.user.id));

    const groupIds = managerGroups.map((g) => g.tagGroupId);

    if (groupIds.length === 0) {
      // Manager with no tag groups sees no users
      res.json({ users: [], total: 0, page: pageNum, limit: pageSize });
      return;
    }

    const usersInGroups = await db
      .select({ userId: userTagGroupsTable.userId })
      .from(userTagGroupsTable)
      .where(inArray(userTagGroupsTable.tagGroupId, groupIds));

    allowedUserIds = [...new Set(usersInGroups.map((u) => u.userId))];
  }

  // ── Resolve groupId filter ────────────────────────────────────────────────

  let groupFilterIds: string[] | null = null;
  if (groupId) {
    const usersInGroup = await db
      .select({ userId: userTagGroupsTable.userId })
      .from(userTagGroupsTable)
      .where(eq(userTagGroupsTable.tagGroupId, groupId));

    if (usersInGroup.length === 0) {
      res.json({ users: [], total: 0, page: pageNum, limit: pageSize });
      return;
    }
    groupFilterIds = usersInGroup.map((u) => u.userId);
  }

  // ── Build WHERE conditions ────────────────────────────────────────────────

  type Condition = Parameters<typeof and>[0];
  const conditions: Condition[] = [];

  if (role) conditions.push(eq(usersTable.role, role as "admin" | "training_lead" | "manager" | "user"));
  if (allowedUserIds) conditions.push(inArray(usersTable.id, allowedUserIds));
  if (groupFilterIds) conditions.push(inArray(usersTable.id, groupFilterIds));

  if (search) {
    const term = `%${search}%`;
    conditions.push(
      or(
        like(usersTable.email, term),
        like(usersTable.firstName, term),
        like(usersTable.lastName, term),
      )!,
    );
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // ── Execute count + data with same WHERE clause ───────────────────────────

  const [countResult, users] = await Promise.all([
    whereClause
      ? db.select({ count: sql<number>`count(*)` }).from(usersTable).where(whereClause)
      : db.select({ count: sql<number>`count(*)` }).from(usersTable),
    whereClause
      ? db.select().from(usersTable).where(whereClause).offset(offset).limit(pageSize)
      : db.select().from(usersTable).offset(offset).limit(pageSize),
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

  // Managers may only access users who share at least one tag group with them
  if (req.user?.role === "manager") {
    const managerGroups = await db
      .select({ tagGroupId: userTagGroupsTable.tagGroupId })
      .from(userTagGroupsTable)
      .where(eq(userTagGroupsTable.userId, req.user.id));

    const groupIds = managerGroups.map((g) => g.tagGroupId);

    // Manager with zero tag groups: deny access to all users
    if (groupIds.length === 0) {
      res.status(403).json({ error: "Access denied: no shared tag groups" });
      return;
    }

    const [membership] = await db
      .select()
      .from(userTagGroupsTable)
      .where(and(eq(userTagGroupsTable.userId, id), inArray(userTagGroupsTable.tagGroupId, groupIds)));

    if (!membership) {
      res.status(403).json({ error: "Access denied: user is not in your groups" });
      return;
    }
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

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
      isActive: apiKeysTable.isActive,
      lastUsedAt: apiKeysTable.lastUsedAt,
      createdAt: apiKeysTable.createdAt,
    });

  res.status(201).json({ key: { ...key, rawKey } });
});

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

// ─── Manager Team Completion Status ──────────────────────────────────────────

router.get("/users/team/completion-status", authenticate, requireRole("manager"), async (req: Request, res: Response) => {
  const { trainingId, fromDate, toDate } = req.query as Record<string, string | undefined>;

  const managerGroups = await db
    .select({ tagGroupId: userTagGroupsTable.tagGroupId })
    .from(userTagGroupsTable)
    .where(eq(userTagGroupsTable.userId, req.user!.id));

  const groupIds = managerGroups.map((g) => g.tagGroupId);

  if (groupIds.length === 0) {
    res.json({ users: [] });
    return;
  }

  const usersInGroups = await db
    .select({ userId: userTagGroupsTable.userId })
    .from(userTagGroupsTable)
    .where(inArray(userTagGroupsTable.tagGroupId, groupIds));

  const userIds = [...new Set(usersInGroups.map((u) => u.userId))];

  const [teamUsers, allAssignments] = await Promise.all([
    db
      .select()
      .from(usersTable)
      .where(and(inArray(usersTable.id, userIds), eq(usersTable.isActive, true))),
    db
      .select({
        trainingId: trainingGroupAssignmentsTable.trainingId,
        groupId: trainingGroupAssignmentsTable.groupId,
        dueDate: trainingGroupAssignmentsTable.dueDate,
      })
      .from(trainingGroupAssignmentsTable)
      .where(
        and(
          inArray(trainingGroupAssignmentsTable.groupId, groupIds),
          ...(trainingId ? [eq(trainingGroupAssignmentsTable.trainingId, trainingId)] : []),
        ),
      ),
  ]);

  const assignedTrainingIds = [...new Set(allAssignments.map((a) => a.trainingId))];

  const dueDateByTraining = new Map<string, Date | null>();
  for (const a of allAssignments) {
    const existing = dueDateByTraining.get(a.trainingId);
    if (a.dueDate) {
      if (!existing || a.dueDate < existing) {
        dueDateByTraining.set(a.trainingId, a.dueDate);
      }
    } else if (!dueDateByTraining.has(a.trainingId)) {
      dueDateByTraining.set(a.trainingId, null);
    }
  }

  const completionConditions = [
    inArray(completionRecordsTable.userId, userIds),
    ...(trainingId ? [eq(completionRecordsTable.trainingId, trainingId)] : []),
    ...(fromDate ? [gte(completionRecordsTable.completedAt, new Date(fromDate))] : []),
    ...(toDate ? [lte(completionRecordsTable.completedAt, new Date(toDate + "T23:59:59Z"))] : []),
  ];

  const allCompletions = await db
    .select({
      userId: completionRecordsTable.userId,
      trainingId: completionRecordsTable.trainingId,
    })
    .from(completionRecordsTable)
    .where(and(...completionConditions));

  const completionsByUser = new Map<string, Set<string>>();
  for (const c of allCompletions) {
    if (c.trainingId) {
      if (!completionsByUser.has(c.userId)) completionsByUser.set(c.userId, new Set());
      completionsByUser.get(c.userId)!.add(c.trainingId);
    }
  }

  const now = new Date();

  res.json({
    users: teamUsers.map((u) => {
      const completedTrainings = completionsByUser.get(u.id) ?? new Set<string>();
      const completed = assignedTrainingIds.filter((tid) => completedTrainings.has(tid)).length;
      const overdueCount = assignedTrainingIds.filter((tid) => {
        if (completedTrainings.has(tid)) return false;
        const due = dueDateByTraining.get(tid);
        return !!due && new Date(due) < now;
      }).length;
      const pending = Math.max(0, assignedTrainingIds.length - completed - overdueCount);
      return {
        id: u.id,
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        role: u.role,
        completionSummary: {
          completed,
          pending,
          overdue: overdueCount,
          total: assignedTrainingIds.length,
        },
      };
    }),
  });
});

// GET /users/:id/groups — list groups a user belongs to (admin only)
router.get("/users/:id/groups", authenticate, requireRole("admin"), async (req: Request, res: Response) => {
  const { id } = req.params as { id: string };

  const memberships = await db
    .select({
      groupId: userTagGroupsTable.tagGroupId,
      groupName: tagGroupsTable.name,
    })
    .from(userTagGroupsTable)
    .innerJoin(tagGroupsTable, eq(userTagGroupsTable.tagGroupId, tagGroupsTable.id))
    .where(eq(userTagGroupsTable.userId, id));

  res.json({ groups: memberships });
});

export default router;
