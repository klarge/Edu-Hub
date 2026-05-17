import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { trainingsTable } from "./trainings";
import { eventsTable } from "./events";

export const completionRecordsTable = pgTable("completion_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  trainingId: uuid("training_id").references(() => trainingsTable.id, {
    onDelete: "set null",
  }),
  eventId: uuid("event_id").references(() => eventsTable.id, {
    onDelete: "set null",
  }),
  durationMinutes: integer("duration_minutes"),
  score: integer("score"),
  verificationCode: text("verification_code"),
  completedAt: timestamp("completed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type CompletionRecord = typeof completionRecordsTable.$inferSelect;
