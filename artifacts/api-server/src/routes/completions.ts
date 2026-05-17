import { Router } from "express";
import { eq, and, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  completionRecordsTable,
  trainingsTable,
  eventsTable,
  trainingGroupAssignmentsTable,
  userTagGroupsTable,
} from "@workspace/db/schema";
import { authenticate } from "../middlewares/auth.js";
import { requireMinRole } from "../middlewares/requireRole.js";
import type { Request, Response } from "express";

const router = Router();

// GET /users/:id/completions — completion history for a user (with overdue status)
router.get(
  "/users/:id/completions",
  authenticate,
  async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };

    // Users can only see their own; managers/leads/admins can see anyone
    if (req.user!.role === "user" && req.user!.id !== id) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const completions = await db
      .select({
        id: completionRecordsTable.id,
        userId: completionRecordsTable.userId,
        trainingId: completionRecordsTable.trainingId,
        eventId: completionRecordsTable.eventId,
        durationMinutes: completionRecordsTable.durationMinutes,
        score: completionRecordsTable.score,
        completedAt: completionRecordsTable.completedAt,
        trainingTitle: trainingsTable.title,
        eventTitle: eventsTable.title,
      })
      .from(completionRecordsTable)
      .leftJoin(
        trainingsTable,
        eq(completionRecordsTable.trainingId, trainingsTable.id),
      )
      .leftJoin(eventsTable, eq(completionRecordsTable.eventId, eventsTable.id))
      .where(eq(completionRecordsTable.userId, id));

    // For training completions, find the earliest dueDate from group assignments
    // for this user's groups, and compute overdue flag
    const userGroups = await db
      .select({ tagGroupId: userTagGroupsTable.tagGroupId })
      .from(userTagGroupsTable)
      .where(eq(userTagGroupsTable.userId, id));

    const groupIds = userGroups.map((g) => g.tagGroupId);

    const enriched = await Promise.all(
      completions.map(async (c) => {
        if (!c.trainingId || groupIds.length === 0) {
          return { ...c, dueDate: null, isOverdue: false };
        }

        // Find the earliest due date for this training across the user's groups
        const assignments = await db
          .select({ dueDate: trainingGroupAssignmentsTable.dueDate })
          .from(trainingGroupAssignmentsTable)
          .where(
            and(
              eq(trainingGroupAssignmentsTable.trainingId, c.trainingId),
              inArray(trainingGroupAssignmentsTable.groupId, groupIds),
            ),
          );

        const dueDates = assignments
          .map((a) => a.dueDate)
          .filter((d): d is Date => d !== null);

        if (dueDates.length === 0) {
          return { ...c, dueDate: null, isOverdue: false };
        }

        const earliestDue = dueDates.reduce((a, b) => (a < b ? a : b));
        const isOverdue = c.completedAt > earliestDue;

        return { ...c, dueDate: earliestDue, isOverdue };
      }),
    );

    res.json({ completions: enriched });
  },
);

// GET /completions — admin/lead summary of all completions
router.get(
  "/completions",
  authenticate,
  requireMinRole("training_lead"),
  async (_req: Request, res: Response) => {
    const completions = await db
      .select({
        id: completionRecordsTable.id,
        userId: completionRecordsTable.userId,
        trainingId: completionRecordsTable.trainingId,
        eventId: completionRecordsTable.eventId,
        durationMinutes: completionRecordsTable.durationMinutes,
        score: completionRecordsTable.score,
        completedAt: completionRecordsTable.completedAt,
        trainingTitle: trainingsTable.title,
        eventTitle: eventsTable.title,
      })
      .from(completionRecordsTable)
      .leftJoin(
        trainingsTable,
        eq(completionRecordsTable.trainingId, trainingsTable.id),
      )
      .leftJoin(eventsTable, eq(completionRecordsTable.eventId, eventsTable.id));

    res.json({ completions });
  },
);

export default router;
