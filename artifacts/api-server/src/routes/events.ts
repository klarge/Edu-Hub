import { Router } from "express";
import { eq, and, inArray, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  eventsTable,
  eventRegistrationsTable,
  eventAttendanceTable,
  eventGroupAssignmentsTable,
  userTagGroupsTable,
  completionRecordsTable,
} from "@workspace/db/schema";
import { authenticate } from "../middlewares/auth.js";
import { requireMinRole, requireRole } from "../middlewares/requireRole.js";
import type { Request, Response } from "express";

const router = Router();

function generateAttendanceCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// ─── Events CRUD ──────────────────────────────────────────────────────────────

// GET /events
router.get("/events", authenticate, async (req: Request, res: Response) => {
  const { page = "1", limit = "20" } = req.query as Record<string, string>;
  const pageNum = Math.max(1, parseInt(page));
  const pageSize = Math.min(100, Math.max(1, parseInt(limit)));
  const offset = (pageNum - 1) * pageSize;

  let eventIds: string[] | null = null;

  if (req.user!.role === "user" || req.user!.role === "manager") {
    const userGroups = await db
      .select({ tagGroupId: userTagGroupsTable.tagGroupId })
      .from(userTagGroupsTable)
      .where(eq(userTagGroupsTable.userId, req.user!.id));

    const groupIds = userGroups.map((g) => g.tagGroupId);
    if (groupIds.length === 0) {
      res.json({ events: [], total: 0, page: pageNum, limit: pageSize });
      return;
    }

    const assignments = await db
      .select({ eventId: eventGroupAssignmentsTable.eventId })
      .from(eventGroupAssignmentsTable)
      .where(inArray(eventGroupAssignmentsTable.groupId, groupIds));

    eventIds = [...new Set(assignments.map((a) => a.eventId))];
    if (eventIds.length === 0) {
      res.json({ events: [], total: 0, page: pageNum, limit: pageSize });
      return;
    }
  }

  const conditions = [eq(eventsTable.isActive, true)];
  if (eventIds) conditions.push(inArray(eventsTable.id, eventIds));
  const where = and(...conditions);

  const [countResult, events] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(eventsTable).where(where),
    db.select().from(eventsTable).where(where).offset(offset).limit(pageSize),
  ]);

  // Strip attendance codes from response for non-leads
  const isLead = req.user!.role === "training_lead" || req.user!.role === "admin";
  const sanitized = isLead ? events : events.map(({ attendanceCode: _c, attendanceCodeExpiresAt: _e, ...e }) => e);

  res.json({
    events: sanitized,
    total: Number(countResult[0]?.count ?? 0),
    page: pageNum,
    limit: pageSize,
  });
});

// POST /events
router.post(
  "/events",
  authenticate,
  requireMinRole("training_lead"),
  async (req: Request, res: Response) => {
    const { title, description, location, startAt, endAt, estimatedDurationMinutes, maxCapacity } =
      req.body as {
        title?: string;
        description?: string;
        location?: string;
        startAt?: string;
        endAt?: string;
        estimatedDurationMinutes?: number;
        maxCapacity?: number;
      };

    if (!title || !startAt || !endAt) {
      res.status(400).json({ error: "title, startAt, and endAt are required" });
      return;
    }

    const [event] = await db
      .insert(eventsTable)
      .values({
        title,
        description,
        location,
        startAt: new Date(startAt),
        endAt: new Date(endAt),
        estimatedDurationMinutes,
        maxCapacity,
        createdBy: req.user!.id,
      })
      .returning();

    res.status(201).json({ event });
  },
);

// GET /events/:id
router.get("/events/:id", authenticate, async (req: Request, res: Response) => {
  const { id } = req.params as { id: string };
  const [event] = await db
    .select()
    .from(eventsTable)
    .where(and(eq(eventsTable.id, id), eq(eventsTable.isActive, true)));

  if (!event) {
    res.status(404).json({ error: "Event not found" });
    return;
  }

  const registrations = await db
    .select()
    .from(eventRegistrationsTable)
    .where(eq(eventRegistrationsTable.eventId, id));

  const attendance = await db
    .select()
    .from(eventAttendanceTable)
    .where(eq(eventAttendanceTable.eventId, id));

  const isLead = req.user!.role === "training_lead" || req.user!.role === "admin";
  const { attendanceCode: _c, attendanceCodeExpiresAt: _e, ...safeEvent } = event;
  const responseEvent = isLead ? event : safeEvent;

  res.json({ event: responseEvent, registrations, attendance });
});

// PUT /events/:id
router.put(
  "/events/:id",
  authenticate,
  requireMinRole("training_lead"),
  async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };
    const { title, description, location, startAt, endAt, estimatedDurationMinutes, maxCapacity, isActive } =
      req.body as {
        title?: string;
        description?: string;
        location?: string;
        startAt?: string;
        endAt?: string;
        estimatedDurationMinutes?: number;
        maxCapacity?: number;
        isActive?: boolean;
      };

    const updates: Partial<typeof eventsTable.$inferInsert> = {};
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (location !== undefined) updates.location = location;
    if (startAt !== undefined) updates.startAt = new Date(startAt);
    if (endAt !== undefined) updates.endAt = new Date(endAt);
    if (estimatedDurationMinutes !== undefined) updates.estimatedDurationMinutes = estimatedDurationMinutes;
    if (maxCapacity !== undefined) updates.maxCapacity = maxCapacity;
    if (isActive !== undefined) updates.isActive = isActive;
    updates.updatedAt = new Date();

    const [event] = await db
      .update(eventsTable)
      .set(updates)
      .where(eq(eventsTable.id, id))
      .returning();

    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }
    res.json({ event });
  },
);

// DELETE /events/:id (soft delete)
router.delete(
  "/events/:id",
  authenticate,
  requireMinRole("training_lead"),
  async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };
    const [event] = await db
      .update(eventsTable)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(eventsTable.id, id))
      .returning();

    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }
    res.json({ success: true });
  },
);

// ─── Event Registrations ──────────────────────────────────────────────────────

// POST /events/:id/register — self-register
router.post(
  "/events/:id/register",
  authenticate,
  async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };

    const [event] = await db
      .select()
      .from(eventsTable)
      .where(and(eq(eventsTable.id, id), eq(eventsTable.isActive, true)));

    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    const [existing] = await db
      .select()
      .from(eventRegistrationsTable)
      .where(
        and(
          eq(eventRegistrationsTable.eventId, id),
          eq(eventRegistrationsTable.userId, req.user!.id),
        ),
      );

    if (existing) {
      res.status(409).json({ error: "Already registered for this event" });
      return;
    }

    if (event.maxCapacity) {
      const [countRow] = await db
        .select({ count: sql<number>`count(*)` })
        .from(eventRegistrationsTable)
        .where(eq(eventRegistrationsTable.eventId, id));
      if (Number(countRow?.count ?? 0) >= event.maxCapacity) {
        res.status(409).json({ error: "Event is at full capacity" });
        return;
      }
    }

    const [reg] = await db
      .insert(eventRegistrationsTable)
      .values({ eventId: id, userId: req.user!.id })
      .returning();

    res.status(201).json({ registration: reg });
  },
);

// POST /events/:id/assign — Training Lead assigns a user
router.post(
  "/events/:id/assign",
  authenticate,
  requireMinRole("training_lead"),
  async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };
    const { userId } = req.body as { userId?: string };

    if (!userId) {
      res.status(400).json({ error: "userId is required" });
      return;
    }

    const [existing] = await db
      .select()
      .from(eventRegistrationsTable)
      .where(
        and(
          eq(eventRegistrationsTable.eventId, id),
          eq(eventRegistrationsTable.userId, userId),
        ),
      );

    if (existing) {
      res.status(409).json({ error: "User already registered for this event" });
      return;
    }

    const [reg] = await db
      .insert(eventRegistrationsTable)
      .values({ eventId: id, userId, assignedBy: req.user!.id })
      .returning();

    res.status(201).json({ registration: reg });
  },
);

// DELETE /events/:id/registrations/:userId — unregister
router.delete(
  "/events/:id/registrations/:userId",
  authenticate,
  async (req: Request, res: Response) => {
    const { id, userId } = req.params as { id: string; userId: string };

    // Users can unregister themselves; leads/admins can unregister anyone
    if (req.user!.role === "user" && req.user!.id !== userId) {
      res.status(403).json({ error: "Cannot unregister other users" });
      return;
    }

    await db
      .delete(eventRegistrationsTable)
      .where(
        and(
          eq(eventRegistrationsTable.eventId, id),
          eq(eventRegistrationsTable.userId, userId),
        ),
      );

    res.json({ success: true });
  },
);

// ─── Attendance ───────────────────────────────────────────────────────────────

// POST /events/:id/attendance-code — generate a one-time code
router.post(
  "/events/:id/attendance-code",
  authenticate,
  requireMinRole("training_lead"),
  async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };
    const { expiresInMinutes = 60 } = req.body as { expiresInMinutes?: number };

    const code = generateAttendanceCode();
    const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

    const [event] = await db
      .update(eventsTable)
      .set({ attendanceCode: code, attendanceCodeExpiresAt: expiresAt, updatedAt: new Date() })
      .where(eq(eventsTable.id, id))
      .returning();

    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    res.json({ code, expiresAt });
  },
);

// POST /events/:id/attend — user submits attendance code
router.post(
  "/events/:id/attend",
  authenticate,
  async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };
    const { code } = req.body as { code?: string };

    if (!code) {
      res.status(400).json({ error: "code is required" });
      return;
    }

    const [event] = await db
      .select()
      .from(eventsTable)
      .where(and(eq(eventsTable.id, id), eq(eventsTable.isActive, true)));

    if (!event) {
      res.status(404).json({ error: "Event not found" });
      return;
    }

    if (
      !event.attendanceCode ||
      event.attendanceCode.toUpperCase() !== code.toUpperCase().trim() ||
      !event.attendanceCodeExpiresAt ||
      event.attendanceCodeExpiresAt < new Date()
    ) {
      res.status(400).json({ error: "Invalid or expired attendance code" });
      return;
    }

    // Must be registered
    const [reg] = await db
      .select()
      .from(eventRegistrationsTable)
      .where(
        and(
          eq(eventRegistrationsTable.eventId, id),
          eq(eventRegistrationsTable.userId, req.user!.id),
        ),
      );

    if (!reg) {
      res.status(403).json({ error: "You are not registered for this event" });
      return;
    }

    // Idempotent — don't double-mark
    const [existingAttendance] = await db
      .select()
      .from(eventAttendanceTable)
      .where(
        and(
          eq(eventAttendanceTable.eventId, id),
          eq(eventAttendanceTable.userId, req.user!.id),
        ),
      );

    if (existingAttendance) {
      res.json({ success: true, alreadyMarked: true });
      return;
    }

    await db.insert(eventAttendanceTable).values({
      eventId: id,
      userId: req.user!.id,
      method: "code",
    });

    // Create completion record
    await db.insert(completionRecordsTable).values({
      userId: req.user!.id,
      eventId: id,
      durationMinutes: event.estimatedDurationMinutes,
    });

    res.json({ success: true });
  },
);

// POST /events/:id/attendance/:userId/mark — manual attendance by lead
router.post(
  "/events/:id/attendance/:userId/mark",
  authenticate,
  requireMinRole("training_lead"),
  async (req: Request, res: Response) => {
    const { id, userId } = req.params as { id: string; userId: string };
    const { attended } = req.body as { attended?: boolean };

    if (attended === false) {
      // Remove attendance
      await db
        .delete(eventAttendanceTable)
        .where(
          and(
            eq(eventAttendanceTable.eventId, id),
            eq(eventAttendanceTable.userId, userId),
          ),
        );
      // Remove completion record
      await db
        .delete(completionRecordsTable)
        .where(
          and(
            eq(completionRecordsTable.eventId, id),
            eq(completionRecordsTable.userId, userId),
          ),
        );
      res.json({ success: true });
      return;
    }

    // Upsert attendance
    const [existing] = await db
      .select()
      .from(eventAttendanceTable)
      .where(
        and(
          eq(eventAttendanceTable.eventId, id),
          eq(eventAttendanceTable.userId, userId),
        ),
      );

    if (!existing) {
      await db.insert(eventAttendanceTable).values({
        eventId: id,
        userId,
        method: "manual",
        markedBy: req.user!.id,
      });

      const [event] = await db.select().from(eventsTable).where(eq(eventsTable.id, id));
      const completionExists = await db
        .select()
        .from(completionRecordsTable)
        .where(
          and(
            eq(completionRecordsTable.eventId, id),
            eq(completionRecordsTable.userId, userId),
          ),
        );

      if (completionExists.length === 0) {
        await db.insert(completionRecordsTable).values({
          userId,
          eventId: id,
          durationMinutes: event?.estimatedDurationMinutes ?? null,
        });
      }
    }

    res.json({ success: true });
  },
);

// POST /events/:id/attendance/bulk-mark — mark all registered users as attended
router.post(
  "/events/:id/attendance/bulk-mark",
  authenticate,
  requireMinRole("training_lead"),
  async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };

    const registrations = await db
      .select()
      .from(eventRegistrationsTable)
      .where(eq(eventRegistrationsTable.eventId, id));

    const [event] = await db.select().from(eventsTable).where(eq(eventsTable.id, id));

    const existingAttendance = await db
      .select()
      .from(eventAttendanceTable)
      .where(eq(eventAttendanceTable.eventId, id));

    const alreadyMarked = new Set(existingAttendance.map((a) => a.userId));
    let marked = 0;

    for (const reg of registrations) {
      if (!alreadyMarked.has(reg.userId)) {
        await db.insert(eventAttendanceTable).values({
          eventId: id,
          userId: reg.userId,
          method: "manual",
          markedBy: req.user!.id,
        });

        await db.insert(completionRecordsTable).values({
          userId: reg.userId,
          eventId: id,
          durationMinutes: event?.estimatedDurationMinutes ?? null,
        });

        marked++;
      }
    }

    res.json({ success: true, marked });
  },
);

// ─── Event Group Assignments ──────────────────────────────────────────────────

// GET /events/:id/assignments
router.get("/events/:id/assignments", authenticate, requireMinRole("training_lead"), async (req: Request, res: Response) => {
  const { id } = req.params as { id: string };
  const assignments = await db
    .select()
    .from(eventGroupAssignmentsTable)
    .where(eq(eventGroupAssignmentsTable.eventId, id));
  res.json({ assignments });
});

// POST /events/:id/assignments
router.post(
  "/events/:id/assignments",
  authenticate,
  requireRole("admin"),
  async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };
    const { groupId } = req.body as { groupId?: string };

    if (!groupId) {
      res.status(400).json({ error: "groupId is required" });
      return;
    }

    const existing = await db
      .select()
      .from(eventGroupAssignmentsTable)
      .where(
        and(
          eq(eventGroupAssignmentsTable.eventId, id),
          eq(eventGroupAssignmentsTable.groupId, groupId),
        ),
      );

    if (existing.length > 0) {
      res.status(409).json({ error: "Event already assigned to this group" });
      return;
    }

    const [assignment] = await db
      .insert(eventGroupAssignmentsTable)
      .values({ eventId: id, groupId, assignedBy: req.user!.id })
      .returning();

    res.status(201).json({ assignment });
  },
);

// DELETE /events/:id/assignments/:assignmentId
router.delete(
  "/events/:id/assignments/:assignmentId",
  authenticate,
  requireRole("admin"),
  async (req: Request, res: Response) => {
    const { assignmentId } = req.params as { assignmentId: string };
    await db
      .delete(eventGroupAssignmentsTable)
      .where(eq(eventGroupAssignmentsTable.id, assignmentId));
    res.json({ success: true });
  },
);

export default router;
