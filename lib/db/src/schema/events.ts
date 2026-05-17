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

export const attendanceMethodEnum = pgEnum("attendance_method", [
  "manual",
  "code",
]);

export const eventsTable = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  description: text("description"),
  location: text("location"),
  startAt: timestamp("start_at", { withTimezone: true }).notNull(),
  endAt: timestamp("end_at", { withTimezone: true }).notNull(),
  estimatedDurationMinutes: integer("estimated_duration_minutes"),
  maxCapacity: integer("max_capacity"),
  attendanceCode: text("attendance_code"),
  attendanceCodeExpiresAt: timestamp("attendance_code_expires_at", {
    withTimezone: true,
  }),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: uuid("created_by").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const eventRegistrationsTable = pgTable("event_registrations", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id")
    .notNull()
    .references(() => eventsTable.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  assignedBy: uuid("assigned_by").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  registeredAt: timestamp("registered_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const eventAttendanceTable = pgTable("event_attendance", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id")
    .notNull()
    .references(() => eventsTable.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  method: attendanceMethodEnum("method").notNull(),
  markedBy: uuid("marked_by").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  attendedAt: timestamp("attended_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Event = typeof eventsTable.$inferSelect;
export type EventRegistration = typeof eventRegistrationsTable.$inferSelect;
export type EventAttendance = typeof eventAttendanceTable.$inferSelect;
