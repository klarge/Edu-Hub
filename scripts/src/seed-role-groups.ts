/**
 * Seed the four fixed role groups.
 * Run this once after schema push: pnpm --filter @workspace/scripts run seed-role-groups
 */
import { db, roleGroupsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const ROLE_GROUPS = [
  {
    name: "Administrator",
    role: "admin" as const,
    description: "Full platform access. Manages users, groups, settings, and auth providers.",
  },
  {
    name: "Training Lead",
    role: "training_lead" as const,
    description: "Creates and manages online training, events, quizzes, and attendance.",
  },
  {
    name: "Manager",
    role: "manager" as const,
    description: "Views completion status for employees in their tag groups.",
  },
  {
    name: "User",
    role: "user" as const,
    description: "Signs up for and completes training; can view their own history and certificates.",
  },
];

for (const rg of ROLE_GROUPS) {
  const [existing] = await db
    .select()
    .from(roleGroupsTable)
    .where(eq(roleGroupsTable.role, rg.role));

  if (!existing) {
    await db.insert(roleGroupsTable).values(rg);
    console.log(`Created role group: ${rg.name}`);
  } else {
    console.log(`Role group already exists: ${rg.name}`);
  }
}

console.log("Role groups seeded.");
await db.$client.end();
