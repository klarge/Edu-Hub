import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  authProvidersTable,
  appSettingsTable,
  auditLogTable,
  usersTable,
} from "@workspace/db/schema";
import { authenticate } from "../middlewares/auth.js";
import { requireRole } from "../middlewares/requireRole.js";
import type { Request, Response } from "express";

const router = Router();

// ─── Auth Providers ────────────────────────────────────────────────────────────

// GET /settings/auth-providers
router.get("/settings/auth-providers", authenticate, requireRole("admin"), async (_req: Request, res: Response) => {
  const providers = await db.select().from(authProvidersTable);
  // Never return clientSecret in the response
  const safe = providers.map(({ config, ...rest }) => ({
    ...rest,
    config: sanitizeConfig(config as Record<string, unknown>),
  }));
  res.json({ providers: safe });
});

// GET /settings/auth-providers/:provider
router.get("/settings/auth-providers/:provider", authenticate, requireRole("admin"), async (req: Request, res: Response) => {
  const { provider } = req.params as { provider: string };
  const validProviders = ["saml", "google", "microsoft"] as const;
  if (!validProviders.includes(provider as "saml" | "google" | "microsoft")) {
    res.status(400).json({ error: `Invalid provider. Must be one of: ${validProviders.join(", ")}` });
    return;
  }
  const [row] = await db
    .select()
    .from(authProvidersTable)
    .where(eq(authProvidersTable.provider, provider as "saml" | "google" | "microsoft"));

  if (!row) {
    res.status(404).json({ error: "Provider not found" });
    return;
  }

  res.json({
    provider: {
      ...row,
      config: sanitizeConfig(row.config as Record<string, unknown>),
    },
  });
});

// PUT /settings/auth-providers/:provider
router.put("/settings/auth-providers/:provider", authenticate, requireRole("admin"), async (req: Request, res: Response) => {
  const { provider } = req.params as { provider: string };
  const { enabled, config } = req.body as { enabled?: boolean; config?: Record<string, unknown> };

  if (!["saml", "google", "microsoft"].includes(provider)) {
    res.status(400).json({ error: "Invalid provider. Must be saml, google, or microsoft" });
    return;
  }

  // Upsert the provider
  const [existing] = await db
    .select()
    .from(authProvidersTable)
    .where(eq(authProvidersTable.provider, provider as "saml" | "google" | "microsoft"));

  let row;
  if (existing) {
    const newConfig =
      config !== undefined
        ? { ...(existing.config as Record<string, unknown>), ...config }
        : existing.config;
    const [updated] = await db
      .update(authProvidersTable)
      .set({
        enabled: enabled !== undefined ? enabled : existing.enabled,
        config: newConfig,
        updatedAt: new Date(),
      })
      .where(eq(authProvidersTable.provider, provider as "saml" | "google" | "microsoft"))
      .returning();
    row = updated;
  } else {
    const [created] = await db
      .insert(authProvidersTable)
      .values({
        provider: provider as "saml" | "google" | "microsoft",
        enabled: enabled ?? false,
        config: config ?? {},
      })
      .returning();
    row = created;
  }

  res.json({
    provider: {
      ...row,
      config: sanitizeConfig((row!.config as Record<string, unknown>)),
    },
  });
});

// ─── App Settings ──────────────────────────────────────────────────────────────

// GET /settings
router.get("/settings", authenticate, requireRole("admin"), async (_req: Request, res: Response) => {
  const rows = await db.select().from(appSettingsTable);
  const settings: Record<string, string> = {};
  for (const row of rows) {
    if (!row.key.includes("password") && !row.key.includes("secret")) {
      settings[row.key] = row.value;
    }
  }
  res.json({ settings });
});

// PUT /settings
router.put("/settings", authenticate, requireRole("admin"), async (req: Request, res: Response) => {
  const updates = req.body as Record<string, string>;
  if (typeof updates !== "object" || Array.isArray(updates)) {
    res.status(400).json({ error: "Body must be a flat key-value object" });
    return;
  }

  for (const [key, value] of Object.entries(updates)) {
    await db
      .insert(appSettingsTable)
      .values({ key, value: String(value) })
      .onConflictDoUpdate({
        target: appSettingsTable.key,
        set: { value: String(value), updatedAt: new Date() },
      });
  }

  res.json({ success: true });
});

// GET /settings/public — publicly readable settings (app name, logo, etc.)
router.get("/settings/public", async (_req: Request, res: Response) => {
  const publicKeys = ["app_name", "app_logo_url", "saml_enabled", "google_enabled", "microsoft_enabled"];
  const allRows = await db.select().from(appSettingsTable);
  const settings: Record<string, string> = {};
  for (const row of allRows) {
    if (publicKeys.includes(row.key)) {
      settings[row.key] = row.value;
    }
  }

  // Also include enabled status from auth_providers
  const providers = await db.select().from(authProvidersTable);
  for (const p of providers) {
    settings[`${p.provider}_enabled`] = String(p.enabled);
  }

  res.json({ settings });
});

// ─── Audit Log ─────────────────────────────────────────────────────────────────

// GET /settings/audit-log
router.get("/settings/audit-log", authenticate, requireRole("admin"), async (req: Request, res: Response) => {
  const { page = "1", limit = "50" } = req.query as Record<string, string>;
  const pageNum = Math.max(1, parseInt(page));
  const pageSize = Math.min(100, Math.max(1, parseInt(limit)));
  const offset = (pageNum - 1) * pageSize;

  const logs = await db
    .select({
      id: auditLogTable.id,
      action: auditLogTable.action,
      resourceType: auditLogTable.resourceType,
      resourceId: auditLogTable.resourceId,
      details: auditLogTable.details,
      createdAt: auditLogTable.createdAt,
      userEmail: usersTable.email,
      userFirstName: usersTable.firstName,
      userLastName: usersTable.lastName,
    })
    .from(auditLogTable)
    .leftJoin(usersTable, eq(auditLogTable.userId, usersTable.id))
    .orderBy(auditLogTable.createdAt)
    .offset(offset)
    .limit(pageSize);

  res.json({ logs, page: pageNum, limit: pageSize });
});

// ─── Helpers ───────────────────────────────────────────────────────────────────

function sanitizeConfig(config: Record<string, unknown>): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(config)) {
    if (k.toLowerCase().includes("secret") || k.toLowerCase().includes("password")) {
      safe[k] = v ? "***" : "";
    } else {
      safe[k] = v;
    }
  }
  return safe;
}

export default router;
