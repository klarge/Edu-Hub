import { eq, and, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  trainingGroupAssignmentsTable,
  eventGroupAssignmentsTable,
  userTagGroupsTable,
} from "@workspace/db/schema";

/**
 * Returns true if the given user can access the training.
 * Admins and training leads can access any active training.
 * Managers and users can only access trainings assigned to their groups.
 */
export async function canAccessTraining(
  userId: string,
  role: string,
  trainingId: string,
): Promise<boolean> {
  if (role === "admin" || role === "training_lead") return true;

  const userGroups = await db
    .select({ tagGroupId: userTagGroupsTable.tagGroupId })
    .from(userTagGroupsTable)
    .where(eq(userTagGroupsTable.userId, userId));

  const groupIds = userGroups.map((g) => g.tagGroupId);
  if (groupIds.length === 0) return false;

  const assignments = await db
    .select()
    .from(trainingGroupAssignmentsTable)
    .where(
      and(
        eq(trainingGroupAssignmentsTable.trainingId, trainingId),
        inArray(trainingGroupAssignmentsTable.groupId, groupIds),
      ),
    );

  return assignments.length > 0;
}

/**
 * Returns true if the given user can access the event.
 */
export async function canAccessEvent(
  userId: string,
  role: string,
  eventId: string,
): Promise<boolean> {
  if (role === "admin" || role === "training_lead") return true;

  const userGroups = await db
    .select({ tagGroupId: userTagGroupsTable.tagGroupId })
    .from(userTagGroupsTable)
    .where(eq(userTagGroupsTable.userId, userId));

  const groupIds = userGroups.map((g) => g.tagGroupId);
  if (groupIds.length === 0) return false;

  const assignments = await db
    .select()
    .from(eventGroupAssignmentsTable)
    .where(
      and(
        eq(eventGroupAssignmentsTable.eventId, eventId),
        inArray(eventGroupAssignmentsTable.groupId, groupIds),
      ),
    );

  return assignments.length > 0;
}
