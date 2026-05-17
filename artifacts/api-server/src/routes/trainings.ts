import { Router } from "express";
import { eq, and, inArray, sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  trainingsTable,
  trainingContentTable,
  trainingGroupAssignmentsTable,
  userTagGroupsTable,
  contentViewsTable,
} from "@workspace/db/schema";
import { authenticate } from "../middlewares/auth.js";
import { requireMinRole, requireRole } from "../middlewares/requireRole.js";
import { canAccessTraining } from "../lib/trainingAccess.js";
import { maybeCompleteTraining } from "../lib/completionHelper.js";
import type { Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import unzipper from "unzipper";

const UPLOAD_DIR = process.env["UPLOAD_DIR"] ?? "/tmp/training-uploads";

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const scormStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(UPLOAD_DIR, "scorm-tmp");
    ensureDir(dir);
    cb(null, dir);
  },
  filename: (_req, _file, cb) => cb(null, `${crypto.randomUUID()}.zip`),
});

const pptxStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = path.join(UPLOAD_DIR, "pptx");
    ensureDir(dir);
    cb(null, dir);
  },
  filename: (_req, _file, cb) => cb(null, `${crypto.randomUUID()}.pptx`),
});

const uploadScorm = multer({
  storage: scormStorage,
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, file.originalname.endsWith(".zip") || file.mimetype === "application/zip");
  },
});

const uploadPptx = multer({
  storage: pptxStorage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok =
      file.originalname.endsWith(".pptx") ||
      file.mimetype ===
        "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    cb(null, ok);
  },
});

const router = Router();

// ─── Training CRUD ────────────────────────────────────────────────────────────

// GET /trainings — list trainings visible to current user
router.get("/trainings", authenticate, async (req: Request, res: Response) => {
  const { page = "1", limit = "20" } = req.query as Record<string, string>;
  const pageNum = Math.max(1, parseInt(page));
  const pageSize = Math.min(100, Math.max(1, parseInt(limit)));
  const offset = (pageNum - 1) * pageSize;

  let trainingIds: string[] | null = null;

  if (req.user!.role === "user" || req.user!.role === "manager") {
    const userGroups = await db
      .select({ tagGroupId: userTagGroupsTable.tagGroupId })
      .from(userTagGroupsTable)
      .where(eq(userTagGroupsTable.userId, req.user!.id));

    const groupIds = userGroups.map((g) => g.tagGroupId);
    if (groupIds.length === 0) {
      res.json({ trainings: [], total: 0, page: pageNum, limit: pageSize });
      return;
    }

    const assignments = await db
      .select({ trainingId: trainingGroupAssignmentsTable.trainingId })
      .from(trainingGroupAssignmentsTable)
      .where(inArray(trainingGroupAssignmentsTable.groupId, groupIds));

    trainingIds = [...new Set(assignments.map((a) => a.trainingId))];
    if (trainingIds.length === 0) {
      res.json({ trainings: [], total: 0, page: pageNum, limit: pageSize });
      return;
    }
  }

  const conditions = [eq(trainingsTable.isActive, true)];
  if (trainingIds) conditions.push(inArray(trainingsTable.id, trainingIds));
  const where = and(...conditions);

  const [countResult, trainings] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(trainingsTable).where(where),
    db.select().from(trainingsTable).where(where).offset(offset).limit(pageSize),
  ]);

  res.json({
    trainings,
    total: Number(countResult[0]?.count ?? 0),
    page: pageNum,
    limit: pageSize,
  });
});

// POST /trainings
router.post(
  "/trainings",
  authenticate,
  requireMinRole("training_lead"),
  async (req: Request, res: Response) => {
    const { title, description, estimatedDurationMinutes } = req.body as {
      title?: string;
      description?: string;
      estimatedDurationMinutes?: number;
    };

    if (!title) {
      res.status(400).json({ error: "title is required" });
      return;
    }

    const [training] = await db
      .insert(trainingsTable)
      .values({
        title,
        description,
        estimatedDurationMinutes,
        createdBy: req.user!.id,
      })
      .returning();

    res.status(201).json({ training });
  },
);

// GET /trainings/:id
router.get("/trainings/:id", authenticate, async (req: Request, res: Response) => {
  const { id } = req.params as { id: string };

  const allowed = await canAccessTraining(req.user!.id, req.user!.role, id);
  if (!allowed) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const [training] = await db
    .select()
    .from(trainingsTable)
    .where(and(eq(trainingsTable.id, id), eq(trainingsTable.isActive, true)));

  if (!training) {
    res.status(404).json({ error: "Training not found" });
    return;
  }

  const content = await db
    .select()
    .from(trainingContentTable)
    .where(eq(trainingContentTable.trainingId, id));

  res.json({ training, content });
});

// PUT /trainings/:id
router.put(
  "/trainings/:id",
  authenticate,
  requireMinRole("training_lead"),
  async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };
    const { title, description, estimatedDurationMinutes, isActive } = req.body as {
      title?: string;
      description?: string;
      estimatedDurationMinutes?: number;
      isActive?: boolean;
    };

    const updates: Partial<typeof trainingsTable.$inferInsert> = {};
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (estimatedDurationMinutes !== undefined)
      updates.estimatedDurationMinutes = estimatedDurationMinutes;
    if (isActive !== undefined) updates.isActive = isActive;
    updates.updatedAt = new Date();

    const [training] = await db
      .update(trainingsTable)
      .set(updates)
      .where(eq(trainingsTable.id, id))
      .returning();

    if (!training) {
      res.status(404).json({ error: "Training not found" });
      return;
    }
    res.json({ training });
  },
);

// DELETE /trainings/:id (soft delete)
router.delete(
  "/trainings/:id",
  authenticate,
  requireMinRole("training_lead"),
  async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };
    const [training] = await db
      .update(trainingsTable)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(trainingsTable.id, id))
      .returning();

    if (!training) {
      res.status(404).json({ error: "Training not found" });
      return;
    }
    res.json({ success: true });
  },
);

// ─── Training Content ─────────────────────────────────────────────────────────

// POST /trainings/:id/content (add youtube/slides URL)
router.post(
  "/trainings/:id/content",
  authenticate,
  requireMinRole("training_lead"),
  async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };
    const { type, title, url, displayOrder } = req.body as {
      type?: string;
      title?: string;
      url?: string;
      displayOrder?: number;
    };

    const validTypes = ["youtube", "slides"];
    if (!type || !validTypes.includes(type)) {
      res.status(400).json({ error: `type must be one of: ${validTypes.join(", ")}` });
      return;
    }
    if (!url) {
      res.status(400).json({ error: "url is required for youtube/slides content" });
      return;
    }

    const [content] = await db
      .insert(trainingContentTable)
      .values({
        trainingId: id,
        type: type as "youtube" | "slides",
        title,
        url,
        displayOrder: displayOrder ?? 0,
      })
      .returning();

    res.status(201).json({ content });
  },
);

// POST /trainings/:id/content/scorm (upload SCORM zip)
router.post(
  "/trainings/:id/content/scorm",
  authenticate,
  requireMinRole("training_lead"),
  uploadScorm.single("file"),
  async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };

    if (!req.file) {
      res.status(400).json({ error: "No file uploaded or invalid file type (must be .zip)" });
      return;
    }

    const contentId = crypto.randomUUID();
    const scormDir = path.join(UPLOAD_DIR, "scorm", contentId);
    ensureDir(scormDir);

    try {
      // ── Zip Slip prevention ──────────────────────────────────────────────
      // Two-pass approach using unzipper (pure Node.js — no shell dependency):
      //   Pass 1: open the archive and validate every entry path before writing
      //           any bytes to disk.
      //   Pass 2: stream-extract only after all paths have been validated.
      const validateArchive = (): Promise<void> =>
        new Promise((resolve, reject) => {
          fs.createReadStream(req.file!.path)
            .pipe(unzipper.Parse({ forceStream: true }))
            .on("entry", (entry: unzipper.Entry) => {
              const entryPath: string = entry.path;
              const normalized = path.normalize(entryPath);
              const resolved = path.resolve(scormDir, normalized);
              if (
                normalized.startsWith("..") ||
                path.isAbsolute(normalized) ||
                !resolved.startsWith(scormDir + path.sep) && resolved !== scormDir
              ) {
                entry.autodrain();
                reject(new Error(`Unsafe path in archive: ${entryPath}`));
              } else {
                entry.autodrain();
              }
            })
            .on("finish", resolve)
            .on("error", reject);
        });

      const extractArchive = (): Promise<void> =>
        new Promise((resolve, reject) => {
          fs.createReadStream(req.file!.path)
            .pipe(unzipper.Extract({ path: scormDir }))
            .on("close", resolve)
            .on("error", reject);
        });

      await validateArchive();
      await extractArchive();
      fs.unlinkSync(req.file.path);
    } catch (err: unknown) {
      if (res.headersSent) return;
      fs.rmSync(scormDir, { recursive: true, force: true });
      try { fs.unlinkSync(req.file.path); } catch { /* ignore */ }
      const msg =
        err instanceof Error && err.message.startsWith("Unsafe path")
          ? "SCORM package contains unsafe file paths"
          : "Failed to extract SCORM package";
      res.status(400).json({ error: msg });
      return;
    }

    const originalTitle = req.file.originalname.replace(/\.zip$/i, "");

    const [content] = await db
      .insert(trainingContentTable)
      .values({
        id: contentId,
        trainingId: id,
        type: "scorm",
        title: originalTitle,
        filePath: scormDir,
        url: `/api/uploads/scorm/${contentId}/`,
      })
      .returning();

    res.status(201).json({ content });
  },
);

// POST /trainings/:id/content/pptx (upload PPTX file)
router.post(
  "/trainings/:id/content/pptx",
  authenticate,
  requireMinRole("training_lead"),
  uploadPptx.single("file"),
  async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };

    if (!req.file) {
      res.status(400).json({ error: "No file uploaded or invalid file type (must be .pptx)" });
      return;
    }

    const [content] = await db
      .insert(trainingContentTable)
      .values({
        trainingId: id,
        type: "pptx",
        title: req.file.originalname.replace(/\.pptx$/i, ""),
        filePath: req.file.path,
        url: `/api/uploads/pptx/${path.basename(req.file.path)}`,
      })
      .returning();

    res.status(201).json({ content });
  },
);

// DELETE /trainings/:id/content/:contentId
router.delete(
  "/trainings/:id/content/:contentId",
  authenticate,
  requireMinRole("training_lead"),
  async (req: Request, res: Response) => {
    const { contentId } = req.params as { contentId: string };
    const [content] = await db
      .delete(trainingContentTable)
      .where(eq(trainingContentTable.id, contentId))
      .returning();

    if (!content) {
      res.status(404).json({ error: "Content not found" });
      return;
    }

    if (content.filePath) {
      try {
        const stat = fs.statSync(content.filePath);
        if (stat.isDirectory()) {
          fs.rmSync(content.filePath, { recursive: true, force: true });
        } else {
          fs.unlinkSync(content.filePath);
        }
      } catch { /* ignore */ }
    }

    res.json({ success: true });
  },
);

// ─── Content Progress Tracking ────────────────────────────────────────────────

// POST /trainings/:id/content/:contentId/viewed — user marks a content item as viewed
router.post(
  "/trainings/:id/content/:contentId/viewed",
  authenticate,
  async (req: Request, res: Response) => {
    const { id, contentId } = req.params as { id: string; contentId: string };

    const allowed = await canAccessTraining(req.user!.id, req.user!.role, id);
    if (!allowed) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    // Verify the content item belongs to this training
    const [contentItem] = await db
      .select()
      .from(trainingContentTable)
      .where(
        and(
          eq(trainingContentTable.id, contentId),
          eq(trainingContentTable.trainingId, id),
        ),
      );

    if (!contentItem) {
      res.status(404).json({ error: "Content item not found" });
      return;
    }

    // Idempotent — don't duplicate
    const [existing] = await db
      .select()
      .from(contentViewsTable)
      .where(
        and(
          eq(contentViewsTable.userId, req.user!.id),
          eq(contentViewsTable.contentId, contentId),
        ),
      );

    if (!existing) {
      await db.insert(contentViewsTable).values({
        userId: req.user!.id,
        contentId,
        trainingId: id,
      });
    }

    const completed = await maybeCompleteTraining(req.user!.id, id);
    res.json({ success: true, trainingCompleted: completed });
  },
);

// ─── SCORM Progress ───────────────────────────────────────────────────────────

// POST /trainings/:id/scorm-complete
// SCORM packages call this to report completion.
// This counts as both content-viewed and triggers completion check.
router.post(
  "/trainings/:id/scorm-complete",
  authenticate,
  async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };
    const { score, contentId } = req.body as { score?: number; contentId?: string };

    const allowed = await canAccessTraining(req.user!.id, req.user!.role, id);
    if (!allowed) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const [training] = await db
      .select()
      .from(trainingsTable)
      .where(and(eq(trainingsTable.id, id), eq(trainingsTable.isActive, true)));

    if (!training) {
      res.status(404).json({ error: "Training not found" });
      return;
    }

    // Mark the SCORM content item as viewed if contentId supplied,
    // otherwise mark ALL scorm items for this training as viewed.
    const scormItems = await db
      .select()
      .from(trainingContentTable)
      .where(
        and(
          eq(trainingContentTable.trainingId, id),
          contentId
            ? eq(trainingContentTable.id, contentId)
            : eq(trainingContentTable.type, "scorm"),
        ),
      );

    for (const item of scormItems) {
      const [existingView] = await db
        .select()
        .from(contentViewsTable)
        .where(
          and(
            eq(contentViewsTable.userId, req.user!.id),
            eq(contentViewsTable.contentId, item.id),
          ),
        );

      if (!existingView) {
        await db.insert(contentViewsTable).values({
          userId: req.user!.id,
          contentId: item.id,
          trainingId: id,
        });
      }
    }

    const completed = await maybeCompleteTraining(req.user!.id, id);
    res.json({ success: true, trainingCompleted: completed });
  },
);

// ─── Group Assignments ────────────────────────────────────────────────────────

// GET /trainings/:id/assignments
router.get(
  "/trainings/:id/assignments",
  authenticate,
  requireMinRole("training_lead"),
  async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };
    const assignments = await db
      .select()
      .from(trainingGroupAssignmentsTable)
      .where(eq(trainingGroupAssignmentsTable.trainingId, id));
    res.json({ assignments });
  },
);

// POST /trainings/:id/assignments
router.post(
  "/trainings/:id/assignments",
  authenticate,
  requireRole("admin"),
  async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };
    const { groupId, dueDate } = req.body as { groupId?: string; dueDate?: string };

    if (!groupId) {
      res.status(400).json({ error: "groupId is required" });
      return;
    }

    const existing = await db
      .select()
      .from(trainingGroupAssignmentsTable)
      .where(
        and(
          eq(trainingGroupAssignmentsTable.trainingId, id),
          eq(trainingGroupAssignmentsTable.groupId, groupId),
        ),
      );

    if (existing.length > 0) {
      res.status(409).json({ error: "Training already assigned to this group" });
      return;
    }

    const [assignment] = await db
      .insert(trainingGroupAssignmentsTable)
      .values({
        trainingId: id,
        groupId,
        dueDate: dueDate ? new Date(dueDate) : null,
        assignedBy: req.user!.id,
      })
      .returning();

    res.status(201).json({ assignment });
  },
);

// DELETE /trainings/:id/assignments/:assignmentId
router.delete(
  "/trainings/:id/assignments/:assignmentId",
  authenticate,
  requireRole("admin"),
  async (req: Request, res: Response) => {
    const { assignmentId } = req.params as { assignmentId: string };
    await db
      .delete(trainingGroupAssignmentsTable)
      .where(eq(trainingGroupAssignmentsTable.id, assignmentId));
    res.json({ success: true });
  },
);

export default router;
