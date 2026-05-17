import {
  pgTable,
  uuid,
  timestamp,
} from "drizzle-orm/pg-core";
import { trainingsTable } from "./trainings";
import { eventsTable } from "./events";
import { tagGroupsTable } from "./tagGroups";
import { usersTable } from "./users";

export const trainingGroupAssignmentsTable = pgTable(
  "training_group_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    trainingId: uuid("training_id")
      .notNull()
      .references(() => trainingsTable.id, { onDelete: "cascade" }),
    groupId: uuid("group_id")
      .notNull()
      .references(() => tagGroupsTable.id, { onDelete: "cascade" }),
    dueDate: timestamp("due_date", { withTimezone: true }),
    assignedBy: uuid("assigned_by").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    assignedAt: timestamp("assigned_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);

export const eventGroupAssignmentsTable = pgTable("event_group_assignments", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id")
    .notNull()
    .references(() => eventsTable.id, { onDelete: "cascade" }),
  groupId: uuid("group_id")
    .notNull()
    .references(() => tagGroupsTable.id, { onDelete: "cascade" }),
  assignedBy: uuid("assigned_by").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  assignedAt: timestamp("assigned_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type TrainingGroupAssignment =
  typeof trainingGroupAssignmentsTable.$inferSelect;
export type EventGroupAssignment =
  typeof eventGroupAssignmentsTable.$inferSelect;
