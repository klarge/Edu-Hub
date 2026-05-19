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

// Apply any pending database migrations before accepting traffic.
// Migration files are generated at build time and embedded in the image.
const migrationsFolder = path.join(__dirname, "../migrations");
logger.info({ migrationsFolder }, "Applying database migrations...");
await migrate(db, { migrationsFolder });
logger.info("Database migrations applied.");

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  startCronJobs();
});
