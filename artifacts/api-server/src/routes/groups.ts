import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db } from "@workspace/db";
import { tagGroupsTable, userTagGroupsTable, usersTable } from "@workspace/db/schema";
import { authenticate } from "../middlewares/auth.js";
import { requireRole, requireMinRole } from "../middlewares/requireRole.js";
import type { Request, Response } from "express";

const router = Router();

// GET /groups — list all tag groups
router.get("/groups", authenticate, requireMinRole("manager"), async (_req: Request, res: Response) => {
  const groups = await db.select().from(tagGroupsTable);
  res.json({ groups });
});

// POST /groups — create tag group (admin only)
router.post("/groups", authenticate, requireRole("admin"), async (req: Request, res: Response) => {
  const { name, type } = req.body as { name?: string; type?: string };
  if (!name || !type) {
    res.status(400).json({ error: "name and type are required" });
    return;
  }
  if (!["location", "job_type"].includes(type)) {
    res.status(400).json({ error: "type must be location or job_type" });
    return;
  }

  const [group] = await db
    .insert(tagGroupsTable)
    .values({ name, type: type as "location" | "job_type" })
    .returning();

  res.status(201).json({ group });
});

// GET /groups/:id
router.get("/groups/:id", authenticate, requireMinRole("manager"), async (req: Request, res: Response) => {
  const { id } = req.params as { id: string };
  const [group] = await db.select().from(tagGroupsTable).where(eq(tagGroupsTable.id, id));
  if (!group) {
    res.status(404).json({ error: "Group not found" });
    return;
  }
  res.json({ group });
});

// PUT /groups/:id
router.put("/groups/:id", authenticate, requireRole("admin"), async (req: Request, res: Response) => {
  const { id } = req.params as { id: string };
  const { name, type } = req.body as { name?: string; type?: string };

  const updates: Partial<typeof tagGroupsTable.$inferInsert> = { updatedAt: new Date() };
  if (name) updates.name = name;
  if (type) {
    if (!["location", "job_type"].includes(type)) {
      res.status(400).json({ error: "type must be location or job_type" });
      return;
    }
    updates.type = type as "location" | "job_type";
  }

  const [group] = await db
    .update(tagGroupsTable)
    .set(updates)
    .where(eq(tagGroupsTable.id, id))
    .returning();

  if (!group) {
    res.status(404).json({ error: "Group not found" });
    return;
  }
  res.json({ group });
});

// DELETE /groups/:id
router.delete("/groups/:id", authenticate, requireRole("admin"), async (req: Request, res: Response) => {
  const { id } = req.params as { id: string };
  const [group] = await db.delete(tagGroupsTable).where(eq(tagGroupsTable.id, id)).returning();
  if (!group) {
    res.status(404).json({ error: "Group not found" });
    return;
  }
  res.json({ success: true });
});

// GET /groups/:id/members
router.get("/groups/:id/members", authenticate, requireMinRole("manager"), async (req: Request, res: Response) => {
  const { id } = req.params as { id: string };

  const memberships = await db
    .select({
      userId: userTagGroupsTable.userId,
      email: usersTable.email,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      role: usersTable.role,
      isActive: usersTable.isActive,
    })
    .from(userTagGroupsTable)
    .innerJoin(usersTable, eq(userTagGroupsTable.userId, usersTable.id))
    .where(eq(userTagGroupsTable.tagGroupId, id));

  res.json({ members: memberships });
});

// POST /groups/:id/members — add user to group
router.post("/groups/:id/members", authenticate, requireRole("admin"), async (req: Request, res: Response) => {
  const { id } = req.params as { id: string };
  const { userId } = req.body as { userId?: string };
  if (!userId) {
    res.status(400).json({ error: "userId is required" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  await db
    .insert(userTagGroupsTable)
    .values({ userId, tagGroupId: id })
    .onConflictDoNothing();

  res.status(201).json({ success: true });
});

// DELETE /groups/:id/members/:userId — remove user from group
router.delete("/groups/:id/members/:userId", authenticate, requireRole("admin"), async (req: Request, res: Response) => {
  const { id, userId } = req.params as { id: string; userId: string };

  await db
    .delete(userTagGroupsTable)
    .where(and(eq(userTagGroupsTable.tagGroupId, id), eq(userTagGroupsTable.userId, userId)));

  res.json({ success: true });
});

export default router;
