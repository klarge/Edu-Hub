import { pgTable, uuid, boolean, timestamp, pgEnum, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const authProviderEnum = pgEnum("auth_provider_type", [
  "saml",
  "google",
  "microsoft",
]);

export const authProvidersTable = pgTable("auth_providers", {
  id: uuid("id").primaryKey().defaultRandom(),
  provider: authProviderEnum("provider").notNull().unique(),
  enabled: boolean("enabled").notNull().default(false),
  config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAuthProviderSchema = createInsertSchema(authProvidersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAuthProvider = z.infer<typeof insertAuthProviderSchema>;
export type AuthProvider = typeof authProvidersTable.$inferSelect;
