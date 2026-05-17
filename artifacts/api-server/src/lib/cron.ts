import cron from "node-cron";
import { eq, and, inArray, gte, lte, isNotNull } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  trainingGroupAssignmentsTable,
  userTagGroupsTable,
  usersTable,
  trainingsTable,
  completionRecordsTable,
} from "@workspace/db/schema";
import { getMailConfig, sendDueDateReminder } from "./mailer.js";
import { logger } from "./logger.js";

async function dispatchDueDateReminders() {
  try {
    const cfg = await getMailConfig();
    if (!cfg.remindersEnabled || !cfg.host) return;

    const days = cfg.reminderDaysBefore;
    const now = new Date();
    const windowEnd = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    // Find all assignments whose dueDate falls within [now, now + reminderDays]
    const assignments = await db
      .select({
        trainingId: trainingGroupAssignmentsTable.trainingId,
        groupId: trainingGroupAssignmentsTable.groupId,
        dueDate: trainingGroupAssignmentsTable.dueDate,
      })
      .from(trainingGroupAssignmentsTable)
      .where(
        and(
          isNotNull(trainingGroupAssignmentsTable.dueDate),
          gte(trainingGroupAssignmentsTable.dueDate, now),
          lte(trainingGroupAssignmentsTable.dueDate, windowEnd),
        ),
      );

    if (assignments.length === 0) return;

    // Batch-fetch training titles
    const trainingIds = [...new Set(assignments.map((a) => a.trainingId))];
    const trainings = await db
      .select({ id: trainingsTable.id, title: trainingsTable.title })
      .from(trainingsTable)
      .where(inArray(trainingsTable.id, trainingIds));
    const trainingMap = new Map(trainings.map((t) => [t.id, t.title]));

    for (const assignment of assignments) {
      if (!assignment.dueDate) continue;

      // Get members of this group
      const members = await db
        .select({ userId: userTagGroupsTable.userId })
        .from(userTagGroupsTable)
        .where(eq(userTagGroupsTable.tagGroupId, assignment.groupId));

      if (members.length === 0) continue;

      const userIds = members.map((m) => m.userId);

      // Filter out users who already completed this training
      const completions = await db
        .select({ userId: completionRecordsTable.userId })
        .from(completionRecordsTable)
        .where(
          and(
            eq(completionRecordsTable.trainingId, assignment.trainingId),
            inArray(completionRecordsTable.userId, userIds),
          ),
        );
      const completedUserIds = new Set(completions.map((c) => c.userId));
      const pendingUserIds = userIds.filter((id) => !completedUserIds.has(id));
      if (pendingUserIds.length === 0) continue;

      // Fetch user details
      const users = await db
        .select({
          id: usersTable.id,
          email: usersTable.email,
          firstName: usersTable.firstName,
        })
        .from(usersTable)
        .where(and(inArray(usersTable.id, pendingUserIds), eq(usersTable.isActive, true)));

      const trainingTitle = trainingMap.get(assignment.trainingId) ?? "a training";

      for (const user of users) {
        try {
          await sendDueDateReminder({
            to: user.email,
            firstName: user.firstName,
            trainingTitle,
            dueDate: assignment.dueDate,
            appName: cfg.appName,
          });
        } catch (err) {
          logger.warn({ err, userId: user.id, trainingId: assignment.trainingId }, "Failed to send reminder email");
        }
      }
    }
    logger.info("Due-date reminder job completed");
  } catch (err) {
    logger.error({ err }, "Due-date reminder cron job failed");
  }
}

export function startCronJobs() {
  // Run at midnight UTC every day
  cron.schedule("0 0 * * *", dispatchDueDateReminders, { timezone: "UTC" });
  logger.info("Cron jobs started");
}
