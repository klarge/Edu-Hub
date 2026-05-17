import { pgTable, text, uuid, timestamp } from "drizzle-orm/pg-core";
import { userRoleEnum } from "./users";

export const roleGroupsTable = pgTable("role_groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  role: userRoleEnum("role").notNull().unique(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type RoleGroup = typeof roleGroupsTable.$inferSelect;
