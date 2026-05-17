import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db } from "@workspace/db";
import { trainingContentTable } from "@workspace/db/schema";
import { authenticate } from "../middlewares/auth.js";
import { canAccessTraining } from "../lib/trainingAccess.js";
import type { Request, Response, NextFunction } from "express";
import path from "path";
import fs from "fs";
import express from "express";

const UPLOAD_DIR = process.env["UPLOAD_DIR"] ?? "/tmp/training-uploads";

const router = Router();

// ──────────────────────────────────────────────────────────────────────────────
// /uploads/scorm/:contentId/...
// Authenticated, access-controlled serving for SCORM packages.
// The contentId is the first path segment after /uploads/scorm/.
// ──────────────────────────────────────────────────────────────────────────────
router.use(
  "/uploads/scorm",
  // Step 1: require a valid session cookie
  authenticate,
  // Step 2: verify the user may access the training that owns this content
  async (req: Request, res: Response, next: NextFunction) => {
    // req.path at this point is /:contentId/rest/of/path
    const segments = req.path.split("/").filter(Boolean);
    const contentId = segments[0];

    if (!contentId) {
      res.status(400).json({ error: "Missing content ID" });
      return;
    }

    const [contentItem] = await db
      .select()
      .from(trainingContentTable)
      .where(
        and(
          eq(trainingContentTable.id, contentId),
          eq(trainingContentTable.type, "scorm"),
        ),
      );

    if (!contentItem) {
      res.status(404).json({ error: "Content not found" });
      return;
    }

    const allowed = await canAccessTraining(
      req.user!.id,
      req.user!.role,
      contentItem.trainingId,
    );
    if (!allowed) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    next();
  },
  // Step 3: serve the file — express.static is safe here because the
  // path traversal check is baked into how static resolves within the root dir
  express.static(path.join(UPLOAD_DIR, "scorm"), {
    dotfiles: "deny",
    index: "index.html",
  }),
);

// ──────────────────────────────────────────────────────────────────────────────
// /uploads/pptx/:filename
// Authenticated, access-controlled serving for uploaded PPTX files.
// ──────────────────────────────────────────────────────────────────────────────
router.use(
  "/uploads/pptx",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    const filename = req.path.split("/").filter(Boolean)[0];

    if (!filename || filename.includes("..")) {
      res.status(400).json({ error: "Invalid filename" });
      return;
    }

    // Find the content item that owns this file
    const allPptx = await db
      .select()
      .from(trainingContentTable)
      .where(eq(trainingContentTable.type, "pptx"));

    const contentItem = allPptx.find(
      (r) =>
        r.filePath?.endsWith(path.sep + filename) ||
        r.filePath?.endsWith("/" + filename),
    );

    if (!contentItem) {
      res.status(404).json({ error: "Content not found" });
      return;
    }

    const allowed = await canAccessTraining(
      req.user!.id,
      req.user!.role,
      contentItem.trainingId,
    );
    if (!allowed) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    next();
  },
  express.static(path.join(UPLOAD_DIR, "pptx"), { dotfiles: "deny" }),
);

export default router;
