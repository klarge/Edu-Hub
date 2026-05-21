# EduHub

A self-hostable professional training platform with role-based groups, online training (SCORM, YouTube, Google Slides / PPTX), quizzes, in-person events with attendance codes, training assignment to groups, completion certificates, and SMTP notifications.

---

## Quick start (Docker Compose)

### Prerequisites
- [Docker](https://docs.docker.com/get-docker/) 24+
- [Docker Compose](https://docs.docker.com/compose/install/) v2

### 1. Clone the repository

```bash
git clone https://github.com/your-org/eduhub.git
cd eduhub
```

### 2. Configure environment

```bash
cp .env.example .env
```

Open `.env` and, at minimum, set a strong `SESSION_SECRET`:

```
SESSION_SECRET=replace-with-a-long-random-secret
```

All other defaults work for a local install. Change the Postgres credentials if you are exposing the database externally.

### 3. Start the stack

```bash
docker compose up -d
```

This starts three services:

| Service    | Description                             | Default port |
|------------|-----------------------------------------|-------------|
| `postgres`  | PostgreSQL 16 database                 | internal    |
| `api`       | Node.js / Express API server           | internal    |
| `web`       | Vite-built frontend served by nginx    | **80**      |

The web frontend proxies all `/api/*` requests to the API server automatically.

### 4. First-run admin setup

On the first start, navigate to your install URL — the setup wizard will appear automatically to create your admin account and set the platform name.

---

## Production deployment (pre-built images)

Use `docker-compose.prod.yml` to pull images from GHCR instead of building locally. The file is self-contained and requires no source code on the server.

### Portainer (recommended)

1. In Portainer, go to **Stacks → Add stack**.
2. Paste the contents of `docker-compose.prod.yml`.
3. Under **Environment variables**, add at minimum:
   - `SESSION_SECRET` — a long random string, e.g. `openssl rand -hex 32`
4. Deploy the stack.

### Docker Compose CLI

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

---

## Updating

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

Postgres data is stored in a named volume and is preserved across updates.

---

## Environment variable reference

| Variable            | Required | Default          | Description                                        |
|---------------------|----------|------------------|----------------------------------------------------|
| `POSTGRES_USER`     | No       | `eduhub`         | PostgreSQL username                                |
| `POSTGRES_PASSWORD` | **Yes**  | `eduhub_secret`  | PostgreSQL password — change for production        |
| `POSTGRES_DB`       | No       | `eduhub`         | PostgreSQL database name                           |
| `SESSION_SECRET`    | **Yes**  | —                | Long random string used to sign session cookies    |
| `PORT`              | No       | `8080`           | Port the API server listens on (inside container)  |
| `UPLOAD_DIR`        | No       | `/data/uploads`  | Path for SCORM / PPTX upload storage               |
| `HTTP_PORT`         | No       | `80`             | Host port mapped to the nginx frontend             |
| `IMAGE_TAG`         | No       | `latest`         | Image tag to pull in production                    |

---

## SMTP / email notifications

Configure SMTP via **Admin → SMTP Settings** in the web UI after logging in. The following notification types are supported:

- **Training assigned** — sent when a training is assigned to a group a user belongs to.
- **Event registration** — sent when a user registers or is assigned to an in-person event.
- **Due-date reminder** — sent daily (midnight UTC) to users with incomplete trainings due within the configured reminder window (default: 3 days). Configure the window in Admin → SMTP Settings → Reminder days before due date.

---

## Completion certificates

After completing a training, users can download a PDF certificate from their training history page. Certificates include:

- Platform name and logo (configured in Admin → Settings)
- User full name
- Training title
- Completion date
- Duration in hours
- Unique verification ID

---

## Development

```bash
# Install dependencies
pnpm install

# Start API server (port 8080) and web dev server (port 22333)
pnpm --filter @workspace/api-server run dev &
pnpm --filter @workspace/web run dev
```

Push database schema changes:

```bash
pnpm --filter @workspace/db run push
```

Generate migration files (run after schema changes, commit the output):

```bash
pnpm --filter @workspace/db run generate
```

---

## GitHub Actions — automated image builds

On every push to `main` and on version tags (`v*`), the workflow at `.github/workflows/docker.yml` builds both images and pushes them to GHCR tagged with the commit SHA, semver version (from the tag), and `latest` (for `main`).

Make sure the repository's **Actions → Settings → Workflow permissions** are set to *Read and write*.
