import { defineConfig } from "drizzle-kit";
import path from "path";

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  out: path.join(__dirname, "./migrations"),
  dialect: "postgresql",
  dbCredentials: {
    // DATABASE_URL is only required at runtime (push/migrate commands).
    // drizzle-kit generate does not connect to the database and will work
    // without it, so we use a placeholder to avoid a hard crash during
    // the Docker build step.
    url: process.env.DATABASE_URL ?? "postgres://placeholder/placeholder",
  },
});
