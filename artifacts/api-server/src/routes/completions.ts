import { Router } from "express";
import { eq, and, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  completionRecordsTable,
  trainingsTable,
  eventsTable,
  trainingGroupAssignmentsTable,
  userTagGroupsTable,
  usersTable,
  appSettingsTable,
} from "@workspace/db/schema";
import { authenticate } from "../middlewares/auth.js";
import { requireMinRole } from "../middlewares/requireRole.js";
import { randomUUID } from "crypto";
import type { Request, Response } from "express";

const router = Router();

// GET /users/:id/completions — completion history for a user (with overdue status)
router.get(
  "/users/:id/completions",
  authenticate,
  async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };

    // Users can only see their own; managers/leads/admins can see anyone
    if (req.user!.role === "user" && req.user!.id !== id) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const completions = await db
      .select({
        id: completionRecordsTable.id,
        userId: completionRecordsTable.userId,
        trainingId: completionRecordsTable.trainingId,
        eventId: completionRecordsTable.eventId,
        durationMinutes: completionRecordsTable.durationMinutes,
        score: completionRecordsTable.score,
        completedAt: completionRecordsTable.completedAt,
        trainingTitle: trainingsTable.title,
        eventTitle: eventsTable.title,
      })
      .from(completionRecordsTable)
      .leftJoin(
        trainingsTable,
        eq(completionRecordsTable.trainingId, trainingsTable.id),
      )
      .leftJoin(eventsTable, eq(completionRecordsTable.eventId, eventsTable.id))
      .where(eq(completionRecordsTable.userId, id));

    // For training completions, find the earliest dueDate from group assignments
    // for this user's groups, and compute overdue flag
    const userGroups = await db
      .select({ tagGroupId: userTagGroupsTable.tagGroupId })
      .from(userTagGroupsTable)
      .where(eq(userTagGroupsTable.userId, id));

    const groupIds = userGroups.map((g) => g.tagGroupId);

    const enriched = await Promise.all(
      completions.map(async (c) => {
        if (!c.trainingId || groupIds.length === 0) {
          return { ...c, dueDate: null, isOverdue: false };
        }

        // Find the earliest due date for this training across the user's groups
        const assignments = await db
          .select({ dueDate: trainingGroupAssignmentsTable.dueDate })
          .from(trainingGroupAssignmentsTable)
          .where(
            and(
              eq(trainingGroupAssignmentsTable.trainingId, c.trainingId),
              inArray(trainingGroupAssignmentsTable.groupId, groupIds),
            ),
          );

        const dueDates = assignments
          .map((a) => a.dueDate)
          .filter((d): d is Date => d !== null);

        if (dueDates.length === 0) {
          return { ...c, dueDate: null, isOverdue: false };
        }

        const earliestDue = dueDates.reduce((a, b) => (a < b ? a : b));
        const isOverdue = c.completedAt > earliestDue;

        return { ...c, dueDate: earliestDue, isOverdue };
      }),
    );

    res.json({ completions: enriched });
  },
);

// GET /completions — admin/lead summary of all completions
router.get(
  "/completions",
  authenticate,
  requireMinRole("training_lead"),
  async (_req: Request, res: Response) => {
    const completions = await db
      .select({
        id: completionRecordsTable.id,
        userId: completionRecordsTable.userId,
        trainingId: completionRecordsTable.trainingId,
        eventId: completionRecordsTable.eventId,
        durationMinutes: completionRecordsTable.durationMinutes,
        score: completionRecordsTable.score,
        completedAt: completionRecordsTable.completedAt,
        trainingTitle: trainingsTable.title,
        eventTitle: eventsTable.title,
      })
      .from(completionRecordsTable)
      .leftJoin(
        trainingsTable,
        eq(completionRecordsTable.trainingId, trainingsTable.id),
      )
      .leftJoin(eventsTable, eq(completionRecordsTable.eventId, eventsTable.id));

    res.json({ completions });
  },
);

// GET /completions/:id/certificate — download PDF certificate for a training completion
router.get(
  "/completions/:id/certificate",
  authenticate,
  async (req: Request, res: Response) => {
    const { id } = req.params as { id: string };

    const [record] = await db
      .select({
        id: completionRecordsTable.id,
        userId: completionRecordsTable.userId,
        trainingId: completionRecordsTable.trainingId,
        durationMinutes: completionRecordsTable.durationMinutes,
        completedAt: completionRecordsTable.completedAt,
        verificationCode: completionRecordsTable.verificationCode,
        trainingTitle: trainingsTable.title,
        userFirstName: usersTable.firstName,
        userLastName: usersTable.lastName,
      })
      .from(completionRecordsTable)
      .leftJoin(trainingsTable, eq(completionRecordsTable.trainingId, trainingsTable.id))
      .leftJoin(usersTable, eq(completionRecordsTable.userId, usersTable.id))
      .where(eq(completionRecordsTable.id, id));

    if (!record) {
      res.status(404).json({ error: "Completion record not found" });
      return;
    }

    // Only owner or elevated role can access
    if (req.user!.role === "user" && req.user!.id !== record.userId) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    if (!record.trainingId || !record.trainingTitle) {
      res.status(422).json({ error: "Certificates are only available for training completions" });
      return;
    }

    // Ensure verification code exists (lazy generate)
    let verCode = record.verificationCode;
    if (!verCode) {
      verCode = randomUUID();
      await db
        .update(completionRecordsTable)
        .set({ verificationCode: verCode })
        .where(eq(completionRecordsTable.id, id));
    }

    // Read app settings for branding
    const settingsRows = await db.select().from(appSettingsTable);
    const settings: Record<string, string> = {};
    for (const row of settingsRows) settings[row.key] = row.value;
    const appName = settings["app_name"] || "TrainHub";
    const appLogoUrl = settings["app_logo_url"] ?? "";

    // Optionally fetch logo as buffer (graceful fallback on failure).
    // SSRF guard: reject URLs that resolve to loopback or RFC-1918 private addresses.
    let logoBuffer: Buffer | null = null;
    if (appLogoUrl) {
      try {
        const parsed = new URL(appLogoUrl);
        if (parsed.protocol === "https:" || parsed.protocol === "http:") {
          const { promises: dns } = await import("dns");
          const { address } = await dns.lookup(parsed.hostname);
          const isPrivate =
            /^127\./.test(address) ||
            /^10\./.test(address) ||
            /^172\.(1[6-9]|2\d|3[01])\./.test(address) ||
            /^192\.168\./.test(address) ||
            address === "::1" ||
            /^fd/.test(address) ||
            /^fe80:/.test(address);
          if (!isPrivate) {
            const resp = await fetch(appLogoUrl, { signal: AbortSignal.timeout(5000) });
            if (resp.ok) logoBuffer = Buffer.from(await resp.arrayBuffer());
          }
        }
      } catch {
        // silently skip logo if unreachable or DNS fails
      }
    }

    // Generate PDF
    const PDFDocument = (await import("pdfkit")).default;
    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 60 });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="certificate-${id}.pdf"`,
    );
    doc.pipe(res);

    const W = doc.page.width;
    const H = doc.page.height;
    const M = 60;

    // Outer border
    doc.rect(M - 10, M - 10, W - 2 * (M - 10), H - 2 * (M - 10))
      .lineWidth(3)
      .strokeColor("#1e3a5f")
      .stroke();

    // Inner border
    doc.rect(M - 4, M - 4, W - 2 * (M - 4), H - 2 * (M - 4))
      .lineWidth(1)
      .strokeColor("#4a90d9")
      .stroke();

    // Logo (centered at top, max 48×48 — silently skipped if no URL or fetch failed)
    const yOffset = logoBuffer ? 56 : 0;
    if (logoBuffer) {
      const logoSize = 48;
      doc.image(logoBuffer, W / 2 - logoSize / 2, M + 8, { fit: [logoSize, logoSize] });
    }

    // Platform name header
    doc
      .font("Helvetica-Bold")
      .fontSize(13)
      .fillColor("#4a90d9")
      .text(appName.toUpperCase(), M, M + 14 + yOffset, { align: "center", width: W - 2 * M });

    // "Certificate of Completion" title
    doc
      .font("Helvetica-Bold")
      .fontSize(32)
      .fillColor("#1e3a5f")
      .text("Certificate of Completion", M, M + 55 + yOffset, { align: "center", width: W - 2 * M });

    // Thin divider
    const divY = M + 105 + yOffset;
    doc.moveTo(M + 40, divY).lineTo(W - M - 40, divY).lineWidth(1).strokeColor("#4a90d9").stroke();

    // "This certifies that"
    doc
      .font("Helvetica")
      .fontSize(14)
      .fillColor("#555")
      .text("This certifies that", M, divY + 20, { align: "center", width: W - 2 * M });

    // User full name
    const userName = `${record.userFirstName ?? ""} ${record.userLastName ?? ""}`.trim();
    doc
      .font("Helvetica-Bold")
      .fontSize(28)
      .fillColor("#1e3a5f")
      .text(userName, M, divY + 45, { align: "center", width: W - 2 * M });

    // "has successfully completed"
    doc
      .font("Helvetica")
      .fontSize(14)
      .fillColor("#555")
      .text("has successfully completed", M, divY + 88, { align: "center", width: W - 2 * M });

    // Training title
    doc
      .font("Helvetica-Bold")
      .fontSize(20)
      .fillColor("#1e3a5f")
      .text(record.trainingTitle, M, divY + 112, { align: "center", width: W - 2 * M });

    // Details row — date + duration
    const completedStr = record.completedAt.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const durationHrs = record.durationMinutes
      ? `${(record.durationMinutes / 60).toFixed(1)} hours`
      : null;

    const detailY = divY + 155;
    doc
      .font("Helvetica")
      .fontSize(12)
      .fillColor("#444")
      .text(`Date Completed: ${completedStr}`, M, detailY, { align: "center", width: W - 2 * M });

    if (durationHrs) {
      doc
        .font("Helvetica")
        .fontSize(12)
        .fillColor("#444")
        .text(`Duration: ${durationHrs}`, M, detailY + 18, { align: "center", width: W - 2 * M });
    }

    // Verification ID footer
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor("#999")
      .text(`Verification ID: ${verCode}`, M, H - M - 10, {
        align: "center",
        width: W - 2 * M,
      });

    doc.end();
  },
);

export default router;
