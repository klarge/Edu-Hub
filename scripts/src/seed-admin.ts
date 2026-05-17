/**
 * Seed an initial admin user.
 * Usage: pnpm --filter @workspace/scripts run seed-admin
 * Env: ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_FIRST_NAME, ADMIN_LAST_NAME
 */

import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const email = (process.env["ADMIN_EMAIL"] ?? "admin@example.com").toLowerCase();
const password = process.env["ADMIN_PASSWORD"] ?? "ChangeMe123!";
const firstName = process.env["ADMIN_FIRST_NAME"] ?? "Admin";
const lastName = process.env["ADMIN_LAST_NAME"] ?? "User";

const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, email));

if (existing) {
  console.log(`Admin user already exists: ${email}`);
  process.exit(0);
}

const passwordHash = await bcrypt.hash(password, 12);

const [user] = await db
  .insert(usersTable)
  .values({ email, passwordHash, firstName, lastName, role: "admin" })
  .returning();

console.log(`Created admin user: ${user!.email}`);
console.log(`Password: ${password}`);
console.log("Please change the password after first login.");

await db.$client.end();
