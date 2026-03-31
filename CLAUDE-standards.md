# IDSO Development Standards

> **App-specific configuration is in [CLAUDE-app.md](./CLAUDE-app.md).** This file defines org-wide standards shared by all IDSO repositories. CLAUDE-app.md defines configuration specific to this repository (service name, datasets, table schemas, etc.).

This file defines the architecture, conventions, and best practices for all IDSO-built applications. Claude Code should follow these standards when scaffolding new projects, adding features, or making architectural decisions.

---

## Organization

- **GitHub Org:** IDS-Central
- **Google Cloud Project:** central-workspace
- **Region:** us-central1
- **Package Manager:** npm

---

## Tech Stack

- **Framework:** Next.js with TypeScript (App Router)
- **Frontend:** React with TypeScript, Tailwind CSS
- **Backend / API:** Next.js API routes (TypeScript)
- **Data Scripts / ETL:** Python (reserved for BigQuery pipelines and data transformations only)
- **Hosting:** Google Cloud Run (containerized)
- **CI/CD:** Google Cloud Build, triggered from GitHub
- **Authentication:** Google OAuth 2.0 via google-auth-library
- **Secrets:** Google Secret Manager

---

## Data Architecture

Not all apps need the same database. Choose based on the type of data the app manages.

### Dimensional / Reference Data → BigQuery Direct

If the app manages dimensional or reference data (mapping tables, lookup values, categorizations), read and write directly to BigQuery. This data is small, changes infrequently, and needs to be accessible to other apps and pipelines. No intermediate database. BigQuery is the source of truth.

Examples: bank account → location mapping, payment description → category mapping, chart of accounts lookups.

### Transactional / High-Frequency App Data → Cloud SQL (PostgreSQL)

If the app involves high-frequency interactive reads and writes (users rapidly updating records, confirming actions, working through queues), use Cloud SQL (PostgreSQL) as the app's transactional database. The app reads/writes to Cloud SQL for fast performance. Data flows to BigQuery via scheduled sync for reporting and analytics.

Examples: reconciliation match confirmations, user workflow state, approval queues.

### BigQuery Details

- **Project:** central-workspace
- When creating new BigQuery tables, always include `created_at`, `updated_at`, and `updated_by` columns for audit tracking.
- Dataset names, table naming conventions, and seeding procedures are app-specific — define them in `CLAUDE-app.md`.

---

## Repo Naming

All repos follow the pattern: `idso-{app-name}`

| Repo | Purpose |
|------|---------|
| `idso-data-pipelines` | Sage, bank, PMS data sync services |
| `idso-reconciliation` | Bank-to-PMS transaction matching app |
| `idso-data-mapping` | Dimensional data mapping UI and tables |
| `idso-portal` | SSO dashboard (future) |

Each repo may contain multiple Cloud Run services if they are tightly coupled (e.g., an API and a background job for the same app).

---

## Cloud Run Service Naming

Services follow the pattern: `{app}-{service}`

Examples:
- `pipelines-sage-api-sync`
- `pipelines-sage-gl-sync`
- `recon-api`
- `recon-matching-job`
- `mapping-app`

**Never use version numbers in service names** (no `-v2`, `-v3`). Use Cloud Run's built-in revision system for versioning and rollbacks.

### Environment Suffixes

When deploying to multiple stages, append the environment:
- `{service-name}-dev`
- `{service-name}-staging`
- `{service-name}-prod`

---

## Project Structure

### Single-service app (e.g., data mapping)

```
idso-data-mapping/
├── src/
│   ├── app/                  ← Next.js App Router pages
│   ├── components/           ← React components
│   ├── lib/                  ← Shared utilities, DB clients, auth helpers
│   └── types/                ← TypeScript type definitions
├── Dockerfile
├── cloudbuild.yaml
├── package.json
├── tsconfig.json
├── CLAUDE.md
└── README.md
```

### Multi-service app (e.g., data pipelines)

```
idso-data-pipelines/
├── services/
│   ├── sage-api-sync/
│   │   ├── Dockerfile
│   │   └── src/
│   ├── sage-gl-sync/
│   │   ├── Dockerfile
│   │   └── src/
│   ├── bank-account-sync/
│   │   ├── Dockerfile
│   │   └── src/
│   └── csv-to-bigquery/
│       ├── Dockerfile
│       └── src/
├── shared/                   ← Shared utilities across services
├── cloudbuild.yaml
├── CLAUDE.md
└── README.md
```

---

## Deployment Pipeline

Each app should have a Cloud Build trigger connected to its GitHub repo.

### Stages

| Stage | Trigger | Purpose |
|-------|---------|---------|
| **dev** | Push to feature branch | Auto-deploy for testing. Preview URL generated. |
| **staging** | Merge to `main` | Pre-production QA. Mirrors prod configuration. |
| **prod** | Manual approval | Live environment. Intentional promotion only. |

Each stage gets its own Cloud Run service, environment variables, and database connections (if applicable).

### Dockerfile Conventions

- Use multi-stage builds to keep images small.
- Base image: `node:20-alpine` for Next.js apps, `python:3.12-slim` for data pipeline services.
- Always include a health check endpoint at `/api/health`.
- Never bake secrets into the image. Pull from Secret Manager at runtime.

### cloudbuild.yaml Conventions

- Use substitution variables for environment-specific values.
- Tag images with both the git SHA and the environment name.
- Push images to Artifact Registry (not Container Registry, which is deprecated).

---

## Authentication

Two auth patterns exist depending on the app framework.

### Python/Flask Apps → Google OAuth via authlib

For Python/Flask services deployed on Cloud Run:
- Use `authlib.integrations.flask_client` with Google OpenID Connect
- OAuth Client ID must be set to "Internal" in GCP Console (API & Services → Credentials) to restrict login to org users
- Every route that reads or writes data MUST have the `@login_required` decorator — no exceptions
- Use `get_current_user()` to populate `updated_by` fields on all database writes
- The `SECRET_KEY` must come from an environment variable — never hardcode, never use a fallback default
- Session cookies must be Secure, HttpOnly, SameSite=Lax

### Next.js/TypeScript Apps → Google OAuth via google-auth-library

For Next.js apps deployed on Cloud Run:
- Use `google-auth-library` `OAuth2Client` for the Google OAuth 2.0 flow
- OAuth Client ID must be set to "Internal" in GCP Console (API & Services → Credentials) to restrict login to org users
- Use Next.js middleware to enforce auth on ALL routes — no unprotected data routes
- API routes use `requireAuth()` to verify the session and get the user email
- Use `getCurrentUser()` to populate `updated_by` fields on all database writes
- Sessions are stored in encrypted httpOnly cookies (AES-256-GCM)
- The `SECRET_KEY` must come from an environment variable — never hardcode, never use a fallback default
- Session cookies must be Secure, HttpOnly, SameSite=Lax

#### Auth Implementation Details

**OAuth flow:**
1. `/api/auth/login` — generates a random `state` parameter, stores it in a short-lived cookie, redirects to Google OAuth consent screen
2. Google redirects back to `/api/auth/authorize` — exchanges the authorization code for tokens, verifies the ID token, validates the `hd` (hosted domain) claim against `IDSO_ALLOWED_DOMAIN`, creates an encrypted session cookie, redirects to `/`
3. `/api/auth/logout` — clears the session cookie
4. `/api/auth/me` — returns the current user profile from the session

**Session cookie:** Cookie name is `idso_session`. Value is AES-256-GCM encrypted JSON containing `{ email, name, picture, hd, loggedInAt }`. The encryption key is derived from `SECRET_KEY` via SHA-256. Cookie format: `base64(iv + authTag + ciphertext)`.

**Two crypto paths:** Route handlers use Node.js `crypto` module. Middleware uses Web Crypto API because Next.js middleware runs in the Edge Runtime which lacks Node.js `crypto`.

**Middleware behavior:** Checks session on every request. Public routes (`/login`, `/api/auth/*`, `/api/health`) are excluded. For unauthenticated API requests, returns 401 JSON. For unauthenticated browser requests, redirects to `/login`.

**Domain validation:** The `hd` claim from the Google ID token is compared against `IDSO_ALLOWED_DOMAIN` to ensure only org users can log in. This is defense-in-depth on top of the "Internal" OAuth client setting.

**Dev bypass:** When `IDSO_OAUTH_BYPASS_AUTH=true`, middleware passes all requests through and `requireAuth()` returns `dev@local` as the user email. This is for local development only — never enable in deployed environments.

#### Auth File Structure

```
src/app/api/auth/
├── login/route.ts       — Initiates OAuth flow (generates state, redirects to Google)
├── authorize/route.ts   — OAuth callback (exchanges code, verifies token, creates session)
├── logout/route.ts      — Clears session cookie
└── me/route.ts          — Returns current user profile from session

src/lib/
├── auth.ts              — OAuth2Client setup, requireAuth(), getCurrentUser(), validateHostedDomain()
└── session.ts           — encrypt/decrypt (AES-256-GCM), getSession(), setSession(), buildSessionCookie()

src/middleware.ts         — Enforces auth on all routes (Edge Runtime, uses Web Crypto API)
```

### Cloud Run IAM for Browser-Facing Apps

Browser-facing apps on Cloud Run require `allUsers` to have `roles/run.invoker` because browsers cannot send Google IAM identity tokens. This makes the Cloud Run URL publicly accessible at the infrastructure level — authentication is enforced entirely by the application.

Because of this:
- App-level auth must be present and correct on EVERY route
- Never deploy a browser-facing Cloud Run app without auth middleware
- For service-to-service (backend-to-backend) communication, use Cloud Run IAM auth instead — do NOT grant `allUsers` invoker access

### Security Non-Negotiables

- Never use string interpolation or f-strings in SQL queries — always use parameterized queries
- Never hardcode or use a fallback secret key
- Every data-modifying endpoint must enforce auth
- Every data-modifying endpoint must record `updated_by` from the authenticated user

### New App Auth Setup Checklist

When creating a new browser-facing app on Cloud Run:
1. Add your app's redirect URI (`https://<cloud-run-url>/api/auth/authorize`) to the **existing** IDSO OAuth Client ID in GCP Console (API & Services → Credentials → Authorized redirect URIs). All IDSO apps share one OAuth Client.
2. Copy the auth files from an existing IDSO Next.js app (`src/lib/auth.ts`, `src/lib/session.ts`, `src/middleware.ts`, and `src/app/api/auth/*`). These are 100% reusable without modification.
3. Set environment variables on Cloud Run: `IDSO_OAUTH_CLIENT_ID`, `IDSO_OAUTH_CLIENT_SECRET`, `SECRET_KEY`, `IDSO_ALLOWED_DOMAIN`
4. Generate a strong SECRET_KEY: `python -c "import secrets; print(secrets.token_hex(32))"`
5. Verify the Cloud Run service has `allUsers` with `roles/run.invoker` (required for browser access)
6. Test: `curl` any API route without credentials — should get 401 or redirect to /login
7. Test: authenticated browser session reaches all protected routes
8. Verify no routes are missing auth enforcement

---

## Code Conventions

### TypeScript

- Strict mode enabled (`"strict": true` in tsconfig).
- No `any` types. Use proper typing or `unknown` with type guards.
- Use `interface` for object shapes, `type` for unions and intersections.
- Prefer named exports over default exports (except for Next.js pages/layouts).

### API Routes

- Always validate request bodies. Use Zod for schema validation.
- Return consistent response shapes: `{ data: T }` on success, `{ error: string }` on failure.
- Include proper HTTP status codes.
- Wrap handlers in try/catch with meaningful error messages.

### Components

- Use functional components with hooks.
- Co-locate component-specific types in the same file.
- Keep components focused. If a component file exceeds ~200 lines, break it up.

### Environment Variables

- Prefix all custom env vars with `IDSO_` (e.g., `IDSO_BQ_PROJECT`, `IDSO_DB_HOST`). Exception: `SECRET_KEY` and `SESSION_LIFETIME_HOURS` are not prefixed.
- Never commit `.env` files. Use `.env.example` with placeholder values.
- In production, all env vars come from Secret Manager or Cloud Run environment config.

**Standard auth env vars (all Next.js apps):**

| Variable | Required | Description |
|----------|----------|-------------|
| `IDSO_OAUTH_CLIENT_ID` | Yes* | Google OAuth 2.0 client ID (shared across all IDSO apps) |
| `IDSO_OAUTH_CLIENT_SECRET` | Yes* | Google OAuth 2.0 client secret |
| `SECRET_KEY` | Yes | Session encryption key (hex string, no fallback) |
| `IDSO_ALLOWED_DOMAIN` | Yes | Google Workspace domain to restrict login |
| `IDSO_APP_URL` | No | App URL for OAuth redirect (auto-detected from request if not set) |
| `SESSION_LIFETIME_HOURS` | No | Session TTL in hours (default: `8`) |
| `IDSO_OAUTH_BYPASS_AUTH` | No | Set to `true` for local dev only (bypasses OAuth) |

*Not required when `IDSO_OAUTH_BYPASS_AUTH=true`.

**BigQuery env vars (apps that read/write BigQuery):**

| Variable | Required | Description |
|----------|----------|-------------|
| `IDSO_BQ_PROJECT` | Yes | BigQuery project ID (default: `central-workspace`) |
| `IDSO_BQ_DATASET` | Yes | BigQuery dataset name (set per app in `CLAUDE-app.md`) |

App-specific env vars follow the same `IDSO_` prefix convention. See `CLAUDE-app.md` for this app's additional env vars.

---

## BigQuery Client Usage

When connecting to BigQuery from a Next.js app:

```typescript
import { BigQuery } from '@google-cloud/bigquery';

const PROJECT_ID = process.env.IDSO_BQ_PROJECT || 'central-workspace';
const DATASET_ID = process.env.IDSO_BQ_DATASET!;

const bigquery = new BigQuery({
  projectId: PROJECT_ID,
});

// Always specify the dataset explicitly using the env var
const dataset = bigquery.dataset(DATASET_ID);
```

- Use parameterized queries to prevent SQL injection.
- For read-heavy pages, consider caching BigQuery results with short TTLs.
- Never use `SELECT *` in production queries. Specify columns explicitly.

---

## Reusable File Templates

The following files are identical across all IDSO Next.js apps and should be copied from an existing app when starting a new one:

**Auth (copy exactly, no changes needed):**
- `src/lib/auth.ts` — OAuth2Client setup, requireAuth(), getCurrentUser()
- `src/lib/session.ts` — AES-256-GCM encrypt/decrypt, session cookie management
- `src/middleware.ts` — Auth enforcement on all routes (add app-specific public routes to `PUBLIC_ROUTES` as needed)
- `src/app/api/auth/login/route.ts` — Initiates OAuth flow
- `src/app/api/auth/authorize/route.ts` — OAuth callback
- `src/app/api/auth/logout/route.ts` — Clears session
- `src/app/api/auth/me/route.ts` — Returns current user profile

**Infrastructure (copy, then update service name in cloudbuild.yaml):**
- `Dockerfile` — Multi-stage Node.js build, no changes needed
- `cloudbuild.yaml` — Update `_SERVICE_NAME` substitution variable only
- `tsconfig.json` — No changes needed
- `next.config.ts` — No changes needed (must include `output: 'standalone'`)
- `src/app/api/health/route.ts` — No changes needed

---

## What NOT to Do

- **Don't use BigQuery as a transactional database.** If your app needs fast row-level reads/writes with user interactions, use Cloud SQL.
- **Don't write raw source data directly to BigQuery from an app.** That's the data pipeline's job.
- **Don't create new Google Cloud projects per app.** All apps live in `central-workspace` for now.
- **Don't use Vercel, Firebase Hosting, or other hosting platforms.** Everything goes to Cloud Run.
- **Don't put version numbers in Cloud Run service names.** Use revisions.
- **Don't deploy without a GitHub repo.** Every Cloud Run service must be backed by a repo with a Cloud Build trigger.
- **Don't store secrets in code, environment files, or container images.** Use Secret Manager.
- **Don't build custom authentication from scratch.** Copy the auth files from an existing IDSO app and use the google-auth-library OAuth pattern described in the Authentication section.
- **Don't create a new OAuth Client ID per app.** All IDSO apps share one OAuth Client. Just add your redirect URI.
