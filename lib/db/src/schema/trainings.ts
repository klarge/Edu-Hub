import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  pgEnum,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const trainingContentTypeEnum = pgEnum("training_content_type", [
  "scorm",
  "youtube",
  "slides",
  "pptx",
]);

export const trainingsTable = pgTable("trainings", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  description: text("description"),
  estimatedDurationMinutes: integer("estimated_duration_minutes"),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: uuid("created_by").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const trainingContentTable = pgTable("training_content", {
  id: uuid("id").primaryKey().defaultRandom(),
  trainingId: uuid("training_id")
    .notNull()
    .references(() => trainingsTable.id, { onDelete: "cascade" }),
  type: trainingContentTypeEnum("type").notNull(),
  title: text("title"),
  url: text("url"),
  filePath: text("file_path"),
  metadata: text("metadata"),
  displayOrder: integer("display_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Training = typeof trainingsTable.$inferSelect;
export type TrainingContent = typeof trainingContentTable.$inferSelect;
