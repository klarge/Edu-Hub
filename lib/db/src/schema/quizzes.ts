import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
import { trainingsTable } from "./trainings";
import { usersTable } from "./users";

export const quizzesTable = pgTable("quizzes", {
  id: uuid("id").primaryKey().defaultRandom(),
  trainingId: uuid("training_id")
    .notNull()
    .references(() => trainingsTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  passingScore: integer("passing_score").notNull().default(70),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const quizQuestionsTable = pgTable("quiz_questions", {
  id: uuid("id").primaryKey().defaultRandom(),
  quizId: uuid("quiz_id")
    .notNull()
    .references(() => quizzesTable.id, { onDelete: "cascade" }),
  question: text("question").notNull(),
  options: jsonb("options").$type<string[]>().notNull(),
  correctAnswerIndex: integer("correct_answer_index").notNull(),
  displayOrder: integer("display_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const quizAttemptsTable = pgTable("quiz_attempts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  quizId: uuid("quiz_id")
    .notNull()
    .references(() => quizzesTable.id, { onDelete: "cascade" }),
  answers: jsonb("answers").$type<number[]>().notNull(),
  score: integer("score").notNull(),
  passed: boolean("passed").notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Quiz = typeof quizzesTable.$inferSelect;
export type QuizQuestion = typeof quizQuestionsTable.$inferSelect;
export type QuizAttempt = typeof quizAttemptsTable.$inferSelect;
