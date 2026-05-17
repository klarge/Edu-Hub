import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db } from "@workspace/db";
import { trainingContentTable } from "@workspace/db/schema";
import { authenticate } from "../middlewares/auth.js";
import { canAccessTraining } from "../lib/trainingAccess.js";
import type { Request, Response } from "express";
import path from "path";
import fs from "fs";

const UPLOAD_DIR = process.env["UPLOAD_DIR"] ?? "/tmp/training-uploads";

const router = Router();

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Returns true iff `s` is a well-formed UUID (avoids Postgres errors on invalid input). */
function isUUID(s: string): boolean {
  return UUID_RE.test(s);
}

/**
 * Iteratively decode a URL segment and reject it if any decode pass
 * reveals traversal patterns (dots, slashes, backslashes).
 * Handles single-encoded (%2e), double-encoded (%252e), and raw forms.
 * Returns `null` if the segment is unsafe; the fully-decoded value otherwise.
 */
function safeDecodeSegment(raw: string): string | null {
  let current = raw;
  const MAX_PASSES = 3; // prevent infinite decoding loops
  for (let i = 0; i < MAX_PASSES; i++) {
    const lowered = current.toLowerCase();
    // Hard-reject any traversal pattern at the current decode level
    if (
      lowered.includes("..") ||
      lowered.includes("%2e") ||
      lowered.includes("%2f") ||
      lowered.includes("%5c") ||
      current.includes("/") ||
      current.includes("\\")
    ) {
      return null;
    }
    // Try to decode one more level; if nothing changes we're done
    try {
      const next = decodeURIComponent(current);
      if (next === current) break; // fully decoded
      current = next;
    } catch {
      return null;
    }
  }
  return current;
}

/**
 * Resolve `relativePath` beneath `rootDir`, ensure the result is still inside
 * `rootDir`, and return the absolute path.  Returns `null` on any violation.
 */
function safeResolvePath(rootDir: string, relativePath: string): string | null {
  // Reject any raw traversal patterns before path.resolve()
  if (
    relativePath.includes("..") ||
    relativePath.includes("%2e") ||
    relativePath.toLowerCase().includes("%2f") ||
    relativePath.toLowerCase().includes("%5c")
  ) {
    return null;
  }

  const resolved = path.resolve(rootDir, relativePath);
  // Must start with rootDir + sep (or equal rootDir for directory requests)
  if (resolved !== rootDir && !resolved.startsWith(rootDir + path.sep)) {
    return null;
  }
  return resolved;
}

// ──────────────────────────────────────────────────────────────────────────────
// GET /uploads/scorm/:contentId/:subPath(*)
//
// Flow:
//   1. Authenticate session
//   2. Extract contentId from the path (first segment after /uploads/scorm/)
//   3. Verify content exists and user may access its parent training
//   4. Resolve the file path inside SCORM_DIR/<contentId>/, reject traversal
//   5. Stream the exact resolved file
// ──────────────────────────────────────────────────────────────────────────────
router.use(
  "/uploads/scorm",
  authenticate,
  async (req: Request, res: Response) => {
    // req.path is relative to the mount point: /<contentId>[/rest/of/path]
    const rawSegments = req.path.split("/").filter(Boolean);

    if (rawSegments.length === 0) {
      res.status(400).json({ error: "Missing content ID" });
      return;
    }

    // ── Step 1: validate and decode each URL segment individually ─────────
    const decodedSegments: string[] = [];
    for (const seg of rawSegments) {
      const decoded = safeDecodeSegment(seg);
      if (decoded === null) {
        res.status(400).json({ error: "Invalid path segment" });
        return;
      }
      decodedSegments.push(decoded);
    }

    const contentId = decodedSegments[0];
    const subPath = decodedSegments.slice(1).join("/");

    // Reject non-UUID content IDs immediately — prevents Postgres errors and
    // any encoding tricks that result in non-UUID strings.
    if (!isUUID(contentId)) {
      res.status(400).json({ error: "Invalid content ID" });
      return;
    }

    // ── Step 2: authorise the request against the content item's training ─
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

    // ── Step 3: resolve the exact file, confined to /<contentId>/ dir ─────
    // Authorization is bound to *this specific contentId directory*.
    // Any path that resolves outside it is rejected regardless of the auth check.
    const contentDir = path.resolve(UPLOAD_DIR, "scorm", contentId);
    const targetPath = safeResolvePath(contentDir, subPath || "index.html");

    if (!targetPath) {
      res.status(400).json({ error: "Invalid file path" });
      return;
    }

    if (!fs.existsSync(targetPath) || !fs.statSync(targetPath).isFile()) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    // Stream the exact resolved file — no dynamic static-serving, no normalization
    res.sendFile(targetPath);
  },
);

// ──────────────────────────────────────────────────────────────────────────────
// GET /uploads/pptx/:filename
//
// Flow:
//   1. Authenticate session
//   2. Extract and validate the filename (single segment, no traversal)
//   3. Verify content exists and user may access its parent training
//   4. Serve exactly the file at PPTX_DIR/<filename> — nothing else
// ──────────────────────────────────────────────────────────────────────────────
router.use(
  "/uploads/pptx",
  authenticate,
  async (req: Request, res: Response) => {
    const rawSegments = req.path.split("/").filter(Boolean);

    if (rawSegments.length !== 1) {
      res.status(400).json({ error: "Invalid path" });
      return;
    }

    const filename = safeDecodeSegment(rawSegments[0]);
    if (!filename) {
      res.status(400).json({ error: "Invalid filename" });
      return;
    }

    // Authorise — find the content item that owns this exact file
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

    // Serve the exact, pre-authorised file path (stored at upload time)
    const filePath = path.resolve(UPLOAD_DIR, "pptx", filename);
    // Final sanity check: must still be inside PPTX_DIR
    const pptxDir = path.resolve(UPLOAD_DIR, "pptx");
    if (!filePath.startsWith(pptxDir + path.sep) && filePath !== pptxDir) {
      res.status(400).json({ error: "Invalid file path" });
      return;
    }

    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    res.sendFile(filePath);
  },
);

export default router;
