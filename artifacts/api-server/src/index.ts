import path from "node:path";
import app from "./app";
import { db, pool } from "@workspace/db";
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

// Wait for the database to accept connections before proceeding.
// pg_isready (used in the compose healthcheck) only verifies the port is open;
// the actual application database may still be initialising for a few seconds
// after that. We retry with backoff so a transient failure doesn't crash the
// container permanently.
async function waitForDatabase(maxAttempts = 15, delayMs = 3000): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await pool.query("SELECT 1");
      logger.info({ attempt }, "Database connection established.");
      return;
    } catch (err) {
      logger.warn({ attempt, maxAttempts, err }, "Database not ready, retrying...");
      if (attempt === maxAttempts) throw new Error("Database connection failed after all retries.");
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

// Apply pending migrations in production only.
// In development, the schema is managed with `drizzle-kit push` instead.
if (process.env.NODE_ENV === "production") {
  await waitForDatabase();
  const migrationsFolder = path.join(__dirname, "../migrations");
  logger.info({ migrationsFolder }, "Applying database migrations...");
  try {
    await migrate(db, { migrationsFolder });
    logger.info("Database migrations applied successfully.");
  } catch (err) {
    logger.error({ err, migrationsFolder }, "Migration failed — check that the migrations folder exists in the image.");
    process.exit(1);
  }
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  startCronJobs();
});
