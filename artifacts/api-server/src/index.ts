import path from "node:path";
import app from "./app";
import { db } from "@workspace/db";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { logger } from "./lib/logger";
import { startCronJobs } from "./lib/cron.js";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Apply pending migrations in production only.
// In development, the schema is managed with `drizzle-kit push` instead.
if (process.env.NODE_ENV === "production") {
  const migrationsFolder = path.join(__dirname, "../migrations");
  logger.info({ migrationsFolder }, "Applying database migrations...");
  await migrate(db, { migrationsFolder });
  logger.info("Database migrations applied.");
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  startCronJobs();
});
