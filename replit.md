# Training Platform

A self-hostable professional training platform supporting online courses (SCORM, YouTube, Google Slides/PowerPoint), in-person events, quizzes, attendance tracking, certificates, and role-based access control.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/scripts run seed-admin` — seed an initial admin user (set ADMIN_EMAIL/ADMIN_PASSWORD env vars first)
- Required env: `DATABASE_URL` — Postgres connection string; `SESSION_SECRET` — JWT signing secret; `PORT` — API server port (default: 5000)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 (artifacts/api-server)
- DB: PostgreSQL + Drizzle ORM
- Auth: JWT (httpOnly cookies) + SAML SSO + OAuth (Google/Microsoft)
- Validation: Zod (zod/v4), drizzle-zod
- API codegen: Orval (from OpenAPI spec in lib/api-spec/openapi.yaml)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — single source of truth for all API contracts
- `lib/db/src/schema/` — Drizzle ORM table definitions (users, tagGroups, authProviders, appSettings, auditLog, apiKeys)
- `artifacts/api-server/src/routes/` — Express route handlers (auth, users, groups, settings)
- `artifacts/api-server/src/middlewares/` — JWT auth middleware, role authorization
- `artifacts/api-server/src/lib/jwt.ts` — JWT sign/verify helpers
- `lib/api-client-react/src/generated/` — generated React Query hooks (do not edit)
- `lib/api-zod/src/generated/` — generated Zod schemas (do not edit)
- `scripts/src/seed-admin.ts` — one-time admin seeding script

## Architecture decisions

- **JWT + httpOnly cookies**: Stateless auth after login; avoids XSS token theft. Cookie named `auth_token`. Expires in 7 days.
- **No passport for local auth**: bcryptjs + jsonwebtoken directly, simpler and fewer dependencies.
- **SAML implemented at HTTP level**: Basic SAML AuthnRequest redirect and SAMLResponse decoding without a full passport strategy, suitable for initial setup. Production deployments should add @node-saml/passport-saml for full validation.
- **OAuth implemented with native fetch**: Direct code exchange flow for Google and Microsoft — no passport needed. Uses state cookie for CSRF protection.
- **Roles are fixed enums**: admin, training_lead, manager, user. Users belong to exactly one role.
- **Tag groups for Location/Job Type**: Users can belong to multiple tag groups. Managers see only users sharing their tag groups.
- **API keys**: Stored as bcrypt hashes; raw key returned only at creation time. Used for programmatic access via `Authorization: Bearer` header.

## Product

- **Users**: Create, update, deactivate users; bulk import via CSV or JSON API. API key support for automation.
- **Auth**: Local email/password (bcrypt + JWT), SAML SSO, Google/Microsoft OAuth — all configurable by admin.
- **Groups**: Tag groups by Location and Job Type. Admin manages; managers see their group's users.
- **Settings**: App name/logo, SMTP config, auth provider config — all admin-managed. Public settings endpoint for login page.
- **Audit log**: All admin actions (create/update/deactivate user) recorded.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Always run `pnpm --filter @workspace/api-spec run codegen` after changing `lib/api-spec/openapi.yaml`
- `lib/api-zod/src/index.ts` only exports from `./generated/api` (not `./generated/types`) to avoid duplicate export conflicts with Orval
- `SESSION_SECRET` is used as JWT signing secret — keep it strong in production
- The api-server's `dev` script rebuilds before starting (`build && start`), so changes require restart
- `bcrypt` (native) is externalized in build.mjs; use `bcryptjs` (pure JS) instead
