import {
  pgTable,
  text,
  uuid,
  timestamp,
  pgEnum,
  primaryKey,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const tagGroupTypeEnum = pgEnum("tag_group_type", [
  "location",
  "job_type",
]);

export const tagGroupsTable = pgTable("tag_groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  type: tagGroupTypeEnum("type").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const userTagGroupsTable = pgTable(
  "user_tag_groups",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    tagGroupId: uuid("tag_group_id")
      .notNull()
      .references(() => tagGroupsTable.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.userId, table.tagGroupId] })],
);

export const insertTagGroupSchema = createInsertSchema(tagGroupsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertTagGroup = z.infer<typeof insertTagGroupSchema>;
export type TagGroup = typeof tagGroupsTable.$inferSelect;
