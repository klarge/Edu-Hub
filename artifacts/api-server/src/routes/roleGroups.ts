import { Router } from "express";
import { eq, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import { roleGroupsTable, usersTable } from "@workspace/db/schema";
import { authenticate } from "../middlewares/auth.js";
import { requireMinRole } from "../middlewares/requireRole.js";
import type { Request, Response } from "express";

const router = Router();

// GET /groups/roles — list the four fixed role groups
router.get("/groups/roles", authenticate, requireMinRole("manager"), async (_req: Request, res: Response) => {
  const groups = await db.select().from(roleGroupsTable);
  res.json({ roleGroups: groups });
});

// GET /groups/roles/:role — get a specific role group with its members
router.get("/groups/roles/:role", authenticate, requireMinRole("manager"), async (req: Request, res: Response) => {
  const { role } = req.params as { role: string };
  const validRoles = ["admin", "training_lead", "manager", "user"];
  if (!validRoles.includes(role)) {
    res.status(404).json({ error: "Role group not found" });
    return;
  }

  const [group] = await db
    .select()
    .from(roleGroupsTable)
    .where(eq(roleGroupsTable.role, role as "admin" | "training_lead" | "manager" | "user"));

  if (!group) {
    res.status(404).json({ error: "Role group not found — run DB seed to initialize role groups" });
    return;
  }

  const members = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      isActive: usersTable.isActive,
    })
    .from(usersTable)
    .where(eq(usersTable.role, role as "admin" | "training_lead" | "manager" | "user"));

  res.json({ roleGroup: group, members });
});

export default router;
