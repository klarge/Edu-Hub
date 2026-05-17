import { eq, and } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  trainingsTable,
  trainingContentTable,
  contentViewsTable,
  quizzesTable,
  quizAttemptsTable,
  completionRecordsTable,
} from "@workspace/db/schema";

/**
 * After either quiz-pass or content-viewed events, check whether the user
 * now satisfies all completion criteria for the training and, if so, create
 * a completion record (idempotent).
 *
 * Criteria:
 *  - If the training has content items: ALL must have been viewed by the user.
 *  - If the training has a quiz: the user must have at least one passing attempt.
 *  - If neither exists (bare training): create completion immediately.
 *
 * Returns true when a new completion record was created.
 */
export async function maybeCompleteTraining(
  userId: string,
  trainingId: string,
): Promise<boolean> {
  // Already completed?
  const existing = await db
    .select()
    .from(completionRecordsTable)
    .where(
      and(
        eq(completionRecordsTable.userId, userId),
        eq(completionRecordsTable.trainingId, trainingId),
      ),
    );
  if (existing.length > 0) return false;

  const [training] = await db
    .select()
    .from(trainingsTable)
    .where(eq(trainingsTable.id, trainingId));
  if (!training) return false;

  // Content check
  const contentItems = await db
    .select()
    .from(trainingContentTable)
    .where(eq(trainingContentTable.trainingId, trainingId));

  if (contentItems.length > 0) {
    const views = await db
      .select()
      .from(contentViewsTable)
      .where(
        and(
          eq(contentViewsTable.userId, userId),
          eq(contentViewsTable.trainingId, trainingId),
        ),
      );
    const viewedIds = new Set(views.map((v) => v.contentId));
    const allViewed = contentItems.every((c) => viewedIds.has(c.id));
    if (!allViewed) return false;
  }

  // Quiz check
  const [quiz] = await db
    .select()
    .from(quizzesTable)
    .where(eq(quizzesTable.trainingId, trainingId));

  if (quiz) {
    const passingAttempt = await db
      .select()
      .from(quizAttemptsTable)
      .where(
        and(
          eq(quizAttemptsTable.userId, userId),
          eq(quizAttemptsTable.quizId, quiz.id),
          eq(quizAttemptsTable.passed, true),
        ),
      );
    if (passingAttempt.length === 0) return false;
  }

  // All criteria satisfied — create completion
  const passingScore = quiz
    ? await db
        .select()
        .from(quizAttemptsTable)
        .where(
          and(
            eq(quizAttemptsTable.userId, userId),
            eq(quizAttemptsTable.quizId, quiz.id),
            eq(quizAttemptsTable.passed, true),
          ),
        )
    : [];

  await db.insert(completionRecordsTable).values({
    userId,
    trainingId,
    durationMinutes: training.estimatedDurationMinutes,
    score: passingScore[0]?.score ?? null,
  });

  return true;
}
