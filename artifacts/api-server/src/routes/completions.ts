import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  completionRecordsTable,
  trainingsTable,
  eventsTable,
} from "@workspace/db/schema";
import { authenticate } from "../middlewares/auth.js";
import { requireMinRole } from "../middlewares/requireRole.js";
import type { Request, Response } from "express";

const router = Router();

// GET /users/:id/completions — completion history for a user
router.get(
  "/users/:id/completions",
  authenticate,
  async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };

    // Users can only see their own completions; managers/leads/admins can see anyone
    if (
      req.user!.role === "user" &&
      req.user!.id !== id
    ) {
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
      .leftJoin(trainingsTable, eq(completionRecordsTable.trainingId, trainingsTable.id))
      .leftJoin(eventsTable, eq(completionRecordsTable.eventId, eventsTable.id))
      .where(eq(completionRecordsTable.userId, id));

    res.json({ completions });
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
      .leftJoin(trainingsTable, eq(completionRecordsTable.trainingId, trainingsTable.id))
      .leftJoin(eventsTable, eq(completionRecordsTable.eventId, eventsTable.id));

    res.json({ completions });
  },
);

export default router;
