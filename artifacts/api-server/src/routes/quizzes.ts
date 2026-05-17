import { Router } from "express";
import { eq, and, asc } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  quizzesTable,
  quizQuestionsTable,
  quizAttemptsTable,
  trainingsTable,
} from "@workspace/db/schema";
import { authenticate } from "../middlewares/auth.js";
import { requireMinRole } from "../middlewares/requireRole.js";
import { canAccessTraining } from "../lib/trainingAccess.js";
import { maybeCompleteTraining } from "../lib/completionHelper.js";
import type { Request, Response } from "express";

const router = Router();

// ─── Quiz CRUD ────────────────────────────────────────────────────────────────

// GET /trainings/:id/quiz
router.get("/trainings/:id/quiz", authenticate, async (req: Request, res: Response) => {
  const { id } = req.params as { id: string };

  const allowed = await canAccessTraining(req.user!.id, req.user!.role, id);
  if (!allowed) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const [quiz] = await db
    .select()
    .from(quizzesTable)
    .where(eq(quizzesTable.trainingId, id));

  if (!quiz) {
    res.status(404).json({ error: "No quiz found for this training" });
    return;
  }

  const questions = await db
    .select()
    .from(quizQuestionsTable)
    .where(eq(quizQuestionsTable.quizId, quiz.id))
    .orderBy(asc(quizQuestionsTable.displayOrder), asc(quizQuestionsTable.id));

  // Strip correct answers for non-leads/admins
  const isLead = req.user!.role === "training_lead" || req.user!.role === "admin";
  const sanitizedQuestions = isLead
    ? questions
    : questions.map(({ correctAnswerIndex: _ca, ...q }) => q);

  res.json({ quiz, questions: sanitizedQuestions });
});

// POST /trainings/:id/quiz
router.post(
  "/trainings/:id/quiz",
  authenticate,
  requireMinRole("training_lead"),
  async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };
    const { title, passingScore } = req.body as {
      title?: string;
      passingScore?: number;
    };

    if (!title) {
      res.status(400).json({ error: "title is required" });
      return;
    }

    const [training] = await db
      .select()
      .from(trainingsTable)
      .where(eq(trainingsTable.id, id));
    if (!training) {
      res.status(404).json({ error: "Training not found" });
      return;
    }

    const [existing] = await db
      .select()
      .from(quizzesTable)
      .where(eq(quizzesTable.trainingId, id));
    if (existing) {
      res.status(409).json({
        error: "Training already has a quiz. Update or delete the existing one.",
      });
      return;
    }

    const [quiz] = await db
      .insert(quizzesTable)
      .values({ trainingId: id, title, passingScore: passingScore ?? 70 })
      .returning();

    res.status(201).json({ quiz });
  },
);

// PUT /trainings/:id/quiz
router.put(
  "/trainings/:id/quiz",
  authenticate,
  requireMinRole("training_lead"),
  async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };
    const { title, passingScore } = req.body as {
      title?: string;
      passingScore?: number;
    };

    const [quiz] = await db
      .select()
      .from(quizzesTable)
      .where(eq(quizzesTable.trainingId, id));

    if (!quiz) {
      res.status(404).json({ error: "No quiz found for this training" });
      return;
    }

    const updates: Partial<typeof quizzesTable.$inferInsert> = {};
    if (title !== undefined) updates.title = title;
    if (passingScore !== undefined) updates.passingScore = passingScore;
    updates.updatedAt = new Date();

    const [updated] = await db
      .update(quizzesTable)
      .set(updates)
      .where(eq(quizzesTable.id, quiz.id))
      .returning();

    res.json({ quiz: updated });
  },
);

// DELETE /trainings/:id/quiz
router.delete(
  "/trainings/:id/quiz",
  authenticate,
  requireMinRole("training_lead"),
  async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };
    const [quiz] = await db
      .select()
      .from(quizzesTable)
      .where(eq(quizzesTable.trainingId, id));

    if (!quiz) {
      res.status(404).json({ error: "No quiz found for this training" });
      return;
    }

    await db.delete(quizzesTable).where(eq(quizzesTable.id, quiz.id));
    res.json({ success: true });
  },
);

// ─── Quiz Questions ───────────────────────────────────────────────────────────

// POST /trainings/:id/quiz/questions
router.post(
  "/trainings/:id/quiz/questions",
  authenticate,
  requireMinRole("training_lead"),
  async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };
    const { question, options, correctAnswerIndex, displayOrder } = req.body as {
      question?: string;
      options?: string[];
      correctAnswerIndex?: number;
      displayOrder?: number;
    };

    if (!question || !options || !Array.isArray(options) || options.length < 2) {
      res.status(400).json({ error: "question and options (min 2) are required" });
      return;
    }
    if (
      correctAnswerIndex === undefined ||
      correctAnswerIndex < 0 ||
      correctAnswerIndex >= options.length
    ) {
      res
        .status(400)
        .json({ error: "correctAnswerIndex must be a valid option index" });
      return;
    }

    const [quiz] = await db
      .select()
      .from(quizzesTable)
      .where(eq(quizzesTable.trainingId, id));
    if (!quiz) {
      res.status(404).json({ error: "No quiz found for this training" });
      return;
    }

    const [q] = await db
      .insert(quizQuestionsTable)
      .values({
        quizId: quiz.id,
        question,
        options,
        correctAnswerIndex,
        displayOrder: displayOrder ?? 0,
      })
      .returning();

    res.status(201).json({ question: q });
  },
);

// PUT /trainings/:id/quiz/questions/:questionId
router.put(
  "/trainings/:id/quiz/questions/:questionId",
  authenticate,
  requireMinRole("training_lead"),
  async (req: Request, res: Response) => {
    const { questionId } = req.params as { questionId: string };
    const { question, options, correctAnswerIndex, displayOrder } = req.body as {
      question?: string;
      options?: string[];
      correctAnswerIndex?: number;
      displayOrder?: number;
    };

    const updates: Partial<typeof quizQuestionsTable.$inferInsert> = {};
    if (question !== undefined) updates.question = question;
    if (options !== undefined) updates.options = options;
    if (correctAnswerIndex !== undefined)
      updates.correctAnswerIndex = correctAnswerIndex;
    if (displayOrder !== undefined) updates.displayOrder = displayOrder;

    const [q] = await db
      .update(quizQuestionsTable)
      .set(updates)
      .where(eq(quizQuestionsTable.id, questionId))
      .returning();

    if (!q) {
      res.status(404).json({ error: "Question not found" });
      return;
    }
    res.json({ question: q });
  },
);

// DELETE /trainings/:id/quiz/questions/:questionId
router.delete(
  "/trainings/:id/quiz/questions/:questionId",
  authenticate,
  requireMinRole("training_lead"),
  async (req: Request, res: Response) => {
    const { questionId } = req.params as { questionId: string };
    await db
      .delete(quizQuestionsTable)
      .where(eq(quizQuestionsTable.id, questionId));
    res.json({ success: true });
  },
);

// ─── Quiz Submission ──────────────────────────────────────────────────────────

// POST /trainings/:id/quiz/submit
router.post(
  "/trainings/:id/quiz/submit",
  authenticate,
  async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };
    const { answers } = req.body as { answers?: number[] };

    if (!answers || !Array.isArray(answers)) {
      res.status(400).json({ error: "answers array is required" });
      return;
    }

    const allowed = await canAccessTraining(req.user!.id, req.user!.role, id);
    if (!allowed) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const [quiz] = await db
      .select()
      .from(quizzesTable)
      .where(eq(quizzesTable.trainingId, id));
    if (!quiz) {
      res.status(404).json({ error: "No quiz found for this training" });
      return;
    }

    const questions = await db
      .select()
      .from(quizQuestionsTable)
      .where(eq(quizQuestionsTable.quizId, quiz.id))
      .orderBy(asc(quizQuestionsTable.displayOrder), asc(quizQuestionsTable.id));

    if (answers.length !== questions.length) {
      res.status(400).json({
        error: `Expected ${questions.length} answers, got ${answers.length}`,
      });
      return;
    }

    let correct = 0;
    for (let i = 0; i < questions.length; i++) {
      if (answers[i] === questions[i]!.correctAnswerIndex) correct++;
    }

    const score =
      questions.length > 0
        ? Math.round((correct / questions.length) * 100)
        : 0;
    const passed = score >= quiz.passingScore;

    const [attempt] = await db
      .insert(quizAttemptsTable)
      .values({
        userId: req.user!.id,
        quizId: quiz.id,
        answers,
        score,
        passed,
      })
      .returning();

    // Trigger unified completion check — completes only if content is also viewed
    let trainingCompleted = false;
    if (passed) {
      trainingCompleted = await maybeCompleteTraining(req.user!.id, id);
    }

    res.json({
      attempt,
      score,
      passed,
      passingScore: quiz.passingScore,
      trainingCompleted,
    });
  },
);

// GET /trainings/:id/quiz/attempts — list my attempts
router.get(
  "/trainings/:id/quiz/attempts",
  authenticate,
  async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };

    const allowed = await canAccessTraining(req.user!.id, req.user!.role, id);
    if (!allowed) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const [quiz] = await db
      .select()
      .from(quizzesTable)
      .where(eq(quizzesTable.trainingId, id));
    if (!quiz) {
      res.status(404).json({ error: "No quiz found for this training" });
      return;
    }

    const attempts = await db
      .select()
      .from(quizAttemptsTable)
      .where(
        and(
          eq(quizAttemptsTable.userId, req.user!.id),
          eq(quizAttemptsTable.quizId, quiz.id),
        ),
      );

    res.json({ attempts });
  },
);

export default router;
