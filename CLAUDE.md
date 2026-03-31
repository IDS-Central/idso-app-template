# IDSO App Generator — Claude Code Instructions

> **Coding standards:** Follow all conventions in [CLAUDE-standards.md](./CLAUDE-standards.md) — naming, auth, project structure, API patterns, "what not to do" rules.
> **App config:** See [CLAUDE-app.md](./CLAUDE-app.md) for app-specific configuration (filled in during Phase 3).

You are helping a non-technical user build and manage internal apps. You handle everything: infrastructure provisioning, code generation, and deployment. **Never ask the user to run commands, edit files, or make technical decisions.** Only ask them about what the app should *do*.

You have been pre-configured with elevated permissions via `startup.sh`. Execute all `gcloud`, `bq`, `gh`, `npm`, `docker`, and `git` commands directly — never ask the user to approve or run them.

---

## Core Context

| Item | Value |
|------|-------|
| GCP Project | `central-workspace` |
| Region | `us-central1` |
| GitHub Org | `IDS-Central` |
| Artifact Registry | `us-central1-docker.pkg.dev/central-workspace/idso-apps` |
| Shared OAuth Client ID secret | `idso-oauth-client-id` |
| Shared OAuth Client Secret | `idso-oauth-client-secret` |
| Shared Cloud SQL instance | `idso-shared` (PostgreSQL 15, created on demand) |
| Allowed domain env var | `IDSO_ALLOWED_DOMAIN` |

---

## Phase 0 — Determine Intent

Read `CLAUDE-app.md` in the current directory.

**If it contains actual app configuration** (the App Name field is NOT "TODO"):
- This is an **existing app**. Read `CLAUDE-app.md` and `CLAUDE-standards.md` to understand it.
- Ask the user: "What would you like to change?"
- Make the requested changes following all conventions in `CLAUDE-standards.md`.
- When done, proceed to **Phase 5** to redeploy. Commit and push changes first:
  ```bash
  git add -A && git commit -m "Update: <description of changes>" && git push origin main
  ```

**If `CLAUDE-app.md` contains TODO placeholders:**
- This is a **new app**. Proceed to Phase 1.

---

## Phase 1 — Gather Requirements (New Apps Only)

Have a short conversation. Ask these questions one at a time:

1. **"What should this app do?"** — Get a plain-English description. Ask follow-up questions if vague.

2. **"What should we call it?"** — Suggest a name based on what they described.
   - Rules: lowercase letters and hyphens only, 3–30 characters
   - This name becomes: repo `idso-{name}`, service `{name}-app`, database `idso_{name_underscored}`

3. **"What data does this app need to track?"** — Understand the fields/columns.
   - All app data lives in **Cloud SQL (PostgreSQL)**. This is always the case — never create BigQuery tables for app data.
   - Also ask: "Does this app need to read any existing data from our data warehouse?" If yes, note which existing BigQuery datasets/tables it needs read access to.

4. **Summarize the plan** in plain language and confirm before proceeding:
   - App name and description
   - Pages/screens to build
   - Database tables and fields (Cloud SQL)
   - Any existing BigQuery data it will read (if applicable)
   - "Does this sound right? I'll start building it now."

After confirmation, establish these variables (used in all subsequent phases):

| Variable | Example |
|----------|---------|
| `APP_NAME` | `supply-requests` |
| `APP_NAME_UNDERSCORED` | `supply_requests` |
| `APP_DESCRIPTION` | One-line description |
| `TABLES` | List of Cloud SQL tables with columns and types |
| `PAGES` | List of pages/screens to build |
| `READS_BIGQUERY` | `true` or `false` — whether the app reads existing BQ data |
| `BQ_DATASETS` | List of existing BigQuery datasets to read (if applicable) |

---

## Phase 2 — Provision GCP Infrastructure

Execute every command directly. If a resource already exists, skip gracefully. If a command fails for any other reason, stop and explain the issue clearly.

### 2.1 — Verify environment

```bash
gcloud config get-value project
# Must be: central-workspace
# If not:
gcloud config set project central-workspace --quiet
```

### 2.2 — Create service account

```bash
gcloud iam service-accounts create idso-{APP_NAME} \
  --display-name="IDSO {APP_NAME} service account" \
  --project=central-workspace 2>/dev/null || echo "Service account already exists, continuing..."
```

### 2.3 — Grant IAM roles

```bash
SA="serviceAccount:idso-{APP_NAME}@central-workspace.iam.gserviceaccount.com"

# All apps get: BigQuery read access (for reading existing warehouse data),
# Secret Manager access, and Cloud SQL access.
# Note: BigQuery dataEditor is NOT granted — apps never write to BigQuery.
for ROLE in roles/bigquery.dataViewer roles/bigquery.jobUser roles/secretmanager.secretAccessor roles/cloudsql.client; do
  gcloud projects add-iam-policy-binding central-workspace \
    --member="$SA" --role="$ROLE" --condition=None --quiet 2>/dev/null
done
```

### 2.4 — Cloud SQL setup

All app data lives in Cloud SQL. Every app gets its own database on the shared `idso-shared` instance.

Check if the shared instance exists:

```bash
if ! gcloud sql instances describe idso-shared --project=central-workspace &>/dev/null; then
  echo "Creating shared Cloud SQL instance (this takes a few minutes)..."
  gcloud sql instances create idso-shared \
    --database-version=POSTGRES_15 \
    --tier=db-f1-micro \
    --region=us-central1 \
    --project=central-workspace \
    --storage-auto-increase \
    --availability-type=zonal \
    --quiet
fi
```

Create the app database and user:

```bash
# Create database
gcloud sql databases create idso_{APP_NAME_UNDERSCORED} \
  --instance=idso-shared --project=central-workspace 2>/dev/null || echo "Database already exists..."

# Generate password and create user
DB_PASSWORD=$(python3 -c "import secrets; print(secrets.token_urlsafe(32))")

gcloud sql users create idso_{APP_NAME_UNDERSCORED} \
  --instance=idso-shared --password="$DB_PASSWORD" \
  --project=central-workspace 2>/dev/null || echo "User already exists..."

# Get instance connection name
INSTANCE_CONNECTION=$(gcloud sql instances describe idso-shared \
  --project=central-workspace --format="value(connectionName)")

# Store connection string in Secret Manager
printf "postgresql://idso_%s:%s@/%s?host=/cloudsql/%s" \
  "{APP_NAME_UNDERSCORED}" "$DB_PASSWORD" "idso_{APP_NAME_UNDERSCORED}" "$INSTANCE_CONNECTION" | \
  gcloud secrets create idso-{APP_NAME}-db-url --data-file=- --project=central-workspace 2>/dev/null || \
  echo "Secret already exists, adding new version..." && \
  printf "postgresql://idso_%s:%s@/%s?host=/cloudsql/%s" \
    "{APP_NAME_UNDERSCORED}" "$DB_PASSWORD" "idso_{APP_NAME_UNDERSCORED}" "$INSTANCE_CONNECTION" | \
  gcloud secrets versions add idso-{APP_NAME}-db-url --data-file=- --project=central-workspace
```

### 2.5 — Generate and store SECRET_KEY

```bash
SECRET_KEY=$(python3 -c "import secrets; print(secrets.token_hex(32))")

echo -n "$SECRET_KEY" | \
  gcloud secrets create idso-{APP_NAME}-secret-key --data-file=- --project=central-workspace 2>/dev/null || \
  echo "Secret already exists, adding new version..." && \
  echo -n "$SECRET_KEY" | \
  gcloud secrets versions add idso-{APP_NAME}-secret-key --data-file=- --project=central-workspace
```

### 2.6 — Ensure Artifact Registry repo exists

```bash
gcloud artifacts repositories describe idso-apps \
  --location=us-central1 --project=central-workspace &>/dev/null || \
gcloud artifacts repositories create idso-apps \
  --repository-format=docker \
  --location=us-central1 \
  --description="IDSO application container images" \
  --project=central-workspace
```

### 2.7 — Create GitHub repo and clone it

```bash
cd "$HOME"

# Check if repo already exists
if gh repo view IDS-Central/idso-{APP_NAME} &>/dev/null; then
  echo "Repo already exists, cloning..."
  gh repo clone IDS-Central/idso-{APP_NAME}
else
  gh repo create IDS-Central/idso-{APP_NAME} \
    --template IDS-Central/idso-app-template \
    --public \
    --description "{APP_DESCRIPTION}" \
    --clone
fi

cd "$HOME/idso-{APP_NAME}"
```

After this step, all subsequent work happens in `~/idso-{APP_NAME}`.

---

## Phase 3 — Generate CLAUDE-app.md

Overwrite `CLAUDE-app.md` with the app-specific configuration:

```markdown
# App Configuration

## App Info
- **App Name:** {APP_NAME}
- **Description:** {APP_DESCRIPTION}
- **Cloud Run Service:** {APP_NAME}-app-dev
- **Service Account:** idso-{APP_NAME}@central-workspace.iam.gserviceaccount.com

## Data Architecture

### Cloud SQL (app data)
- **Instance:** idso-shared
- **Database:** idso_{APP_NAME_UNDERSCORED}
- **Tables:**
  - `{table1}` — {description} ({columns with types, always include created_at, updated_at, updated_by})
  - `{table2}` — {description} ({columns})

### BigQuery (read-only, if applicable)
- **Reads from:** {list existing datasets/tables this app reads, or "None"}
- **Note:** This app does NOT write to BigQuery. All app data lives in Cloud SQL.

## Environment Variables (app-specific)

{List any app-specific env vars beyond the standard set}

## Data Flow

{Describe how data flows: which pages read from where, which API routes write to where}
```

---

## Phase 4 — Scaffold the Application

### 4.1 — Initialize Next.js project

```bash
npx create-next-app@latest . --typescript --tailwind --app --src-dir --use-npm --import-alias "@/*" --yes 2>/dev/null || true
```

If this fails because the directory isn't empty, create manually:

```bash
# Create package.json and install
npm init -y
npm install next@latest react@latest react-dom@latest google-auth-library zod pg
npm install -D typescript @types/node @types/react @types/react-dom @types/pg tailwindcss @tailwindcss/postcss postcss
```

If the app reads existing BigQuery data (`READS_BIGQUERY` is true), also install:

```bash
npm install @google-cloud/bigquery
```

### 4.2 — Create infrastructure files

Create each of the following files exactly as shown. These are standardized across all IDSO apps.

#### `next.config.ts`

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
};

export default nextConfig;
```

#### `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

#### `Dockerfile`

```dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]
```

#### `cloudbuild.yaml`

Replace `{APP_NAME}` with the actual app name:

```yaml
steps:
  - name: "gcr.io/cloud-builders/docker"
    args:
      - "build"
      - "-t"
      - "us-central1-docker.pkg.dev/$PROJECT_ID/idso-apps/{APP_NAME}:$COMMIT_SHA"
      - "-t"
      - "us-central1-docker.pkg.dev/$PROJECT_ID/idso-apps/{APP_NAME}:latest"
      - "."
  - name: "gcr.io/cloud-builders/docker"
    args:
      - "push"
      - "--all-tags"
      - "us-central1-docker.pkg.dev/$PROJECT_ID/idso-apps/{APP_NAME}"
  - name: "gcr.io/google.com/cloudsdktool/cloud-sdk"
    entrypoint: gcloud
    args:
      - "run"
      - "deploy"
      - "{APP_NAME}-app-dev"
      - "--image"
      - "us-central1-docker.pkg.dev/$PROJECT_ID/idso-apps/{APP_NAME}:$COMMIT_SHA"
      - "--region"
      - "us-central1"
      - "--platform"
      - "managed"
      - "--quiet"

images:
  - "us-central1-docker.pkg.dev/$PROJECT_ID/idso-apps/{APP_NAME}:$COMMIT_SHA"
  - "us-central1-docker.pkg.dev/$PROJECT_ID/idso-apps/{APP_NAME}:latest"

substitutions:
  _SERVICE_NAME: "{APP_NAME}"
```

#### `.env.example`

```
# Auth (required in production — pulled from Secret Manager on Cloud Run)
IDSO_OAUTH_CLIENT_ID=
IDSO_OAUTH_CLIENT_SECRET=
SECRET_KEY=
IDSO_ALLOWED_DOMAIN=

# Database (Cloud SQL — all app data lives here)
IDSO_DB_URL=postgresql://user:password@localhost:5432/dbname

# BigQuery (only if app reads existing warehouse data)
# IDSO_BQ_PROJECT=central-workspace

# Optional
IDSO_APP_URL=
SESSION_LIFETIME_HOURS=8

# Local dev only
IDSO_OAUTH_BYPASS_AUTH=true
```

### 4.3 — Create auth system

These files are identical across all IDSO apps. Create each one exactly as shown.

#### `src/lib/auth.ts`

```typescript
import { OAuth2Client } from "google-auth-library";
import { cookies } from "next/headers";
import { getSession } from "./session";

const CLIENT_ID = process.env.IDSO_OAUTH_CLIENT_ID!;
const CLIENT_SECRET = process.env.IDSO_OAUTH_CLIENT_SECRET!;
const ALLOWED_DOMAIN = process.env.IDSO_ALLOWED_DOMAIN!;
const BYPASS_AUTH = process.env.IDSO_OAUTH_BYPASS_AUTH === "true";

export function getOAuth2Client(redirectUri: string): OAuth2Client {
  return new OAuth2Client(CLIENT_ID, CLIENT_SECRET, redirectUri);
}

export function validateHostedDomain(hd: string | undefined): boolean {
  if (!hd) return false;
  return hd === ALLOWED_DOMAIN;
}

export async function requireAuth(): Promise<string> {
  if (BYPASS_AUTH) return "dev@local";
  const cookieStore = await cookies();
  const session = await getSession(cookieStore);
  if (!session) throw new Error("Unauthorized");
  return session.email;
}

export async function getCurrentUser(): Promise<{
  email: string;
  name: string;
  picture: string;
} | null> {
  if (BYPASS_AUTH) return { email: "dev@local", name: "Dev User", picture: "" };
  const cookieStore = await cookies();
  return await getSession(cookieStore);
}
```

#### `src/lib/session.ts`

```typescript
import crypto from "crypto";
import type { ReadonlyRequestCookies } from "next/dist/server/web/spec-extension/adapters/request-cookies";

const SECRET_KEY = process.env.SECRET_KEY!;
const SESSION_LIFETIME_HOURS = parseInt(
  process.env.SESSION_LIFETIME_HOURS || "8",
  10,
);
const COOKIE_NAME = "idso_session";

interface SessionData {
  email: string;
  name: string;
  picture: string;
  hd: string;
  loggedInAt: string;
}

function deriveKey(): Buffer {
  return crypto.createHash("sha256").update(SECRET_KEY).digest();
}

export function encrypt(data: string): string {
  const key = deriveKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(data, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

export function decrypt(encoded: string): string {
  const key = deriveKey();
  const buf = Buffer.from(encoded, "base64");
  const iv = buf.subarray(0, 12);
  const authTag = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted) + decipher.final("utf8");
}

export async function getSession(
  cookieStore: ReadonlyRequestCookies,
): Promise<SessionData | null> {
  const cookie = cookieStore.get(COOKIE_NAME);
  if (!cookie) return null;
  try {
    const data = JSON.parse(decrypt(cookie.value)) as SessionData;
    const loggedInAt = new Date(data.loggedInAt);
    const expiresAt = new Date(
      loggedInAt.getTime() + SESSION_LIFETIME_HOURS * 60 * 60 * 1000,
    );
    if (new Date() > expiresAt) return null;
    return data;
  } catch {
    return null;
  }
}

export function buildSessionCookie(session: SessionData): {
  name: string;
  value: string;
  options: {
    httpOnly: boolean;
    secure: boolean;
    sameSite: "lax";
    path: string;
    maxAge: number;
  };
} {
  return {
    name: COOKIE_NAME,
    value: encrypt(JSON.stringify(session)),
    options: {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_LIFETIME_HOURS * 60 * 60,
    },
  };
}
```

#### `src/middleware.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "idso_session";
const BYPASS_AUTH = process.env.IDSO_OAUTH_BYPASS_AUTH === "true";
const SESSION_LIFETIME_HOURS = parseInt(
  process.env.SESSION_LIFETIME_HOURS || "8",
  10,
);

const PUBLIC_ROUTES = [
  "/login",
  "/api/auth/login",
  "/api/auth/authorize",
  "/api/auth/logout",
  "/api/auth/me",
  "/api/health",
];

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + "/"),
  );
}

async function deriveKey(): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(process.env.SECRET_KEY!),
  );
  return crypto.subtle.importKey(
    "raw",
    keyMaterial,
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );
}

async function decryptSession(
  encoded: string,
): Promise<Record<string, unknown> | null> {
  try {
    const buf = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
    const iv = buf.slice(0, 12);
    const authTag = buf.slice(12, 28);
    const encrypted = buf.slice(28);
    const combined = new Uint8Array(encrypted.length + authTag.length);
    combined.set(encrypted);
    combined.set(authTag, encrypted.length);
    const key = await deriveKey();
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      combined,
    );
    return JSON.parse(new TextDecoder().decode(decrypted));
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  if (isPublicRoute(request.nextUrl.pathname)) return NextResponse.next();
  if (BYPASS_AUTH) return NextResponse.next();

  const cookie = request.cookies.get(COOKIE_NAME);
  if (!cookie) return handleUnauthenticated(request);

  const session = await decryptSession(cookie.value);
  if (!session?.loggedInAt) return handleUnauthenticated(request);

  const loggedInAt = new Date(session.loggedInAt as string);
  const expiresAt = new Date(
    loggedInAt.getTime() + SESSION_LIFETIME_HOURS * 60 * 60 * 1000,
  );
  if (new Date() > expiresAt) return handleUnauthenticated(request);

  return NextResponse.next();
}

function handleUnauthenticated(request: NextRequest): NextResponse {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

#### `src/app/api/auth/login/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getOAuth2Client } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const appUrl =
    process.env.IDSO_APP_URL ||
    `${request.nextUrl.protocol}//${request.nextUrl.host}`;
  const redirectUri = `${appUrl}/api/auth/authorize`;
  const client = getOAuth2Client(redirectUri);

  const state = crypto.randomBytes(32).toString("hex");
  const authUrl = client.generateAuthUrl({
    access_type: "offline",
    scope: ["openid", "email", "profile"],
    state,
    prompt: "select_account",
  });

  const response = NextResponse.redirect(authUrl);
  response.cookies.set("oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return response;
}
```

#### `src/app/api/auth/authorize/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getOAuth2Client, validateHostedDomain } from "@/lib/auth";
import { buildSessionCookie } from "@/lib/session";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const storedState = request.cookies.get("oauth_state")?.value;

  if (!code || !state || state !== storedState) {
    return NextResponse.json({ error: "Invalid OAuth state" }, { status: 400 });
  }

  const appUrl =
    process.env.IDSO_APP_URL ||
    `${request.nextUrl.protocol}//${request.nextUrl.host}`;
  const redirectUri = `${appUrl}/api/auth/authorize`;
  const client = getOAuth2Client(redirectUri);

  try {
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token!,
      audience: process.env.IDSO_OAUTH_CLIENT_ID!,
    });
    const payload = ticket.getPayload()!;

    if (!validateHostedDomain(payload.hd)) {
      return NextResponse.json(
        { error: "Unauthorized domain" },
        { status: 403 },
      );
    }

    const sessionCookie = buildSessionCookie({
      email: payload.email!,
      name: payload.name || "",
      picture: payload.picture || "",
      hd: payload.hd || "",
      loggedInAt: new Date().toISOString(),
    });

    const response = NextResponse.redirect(new URL("/", request.url));
    response.cookies.set(
      sessionCookie.name,
      sessionCookie.value,
      sessionCookie.options,
    );
    response.cookies.set("oauth_state", "", { maxAge: 0, path: "/" });
    return response;
  } catch (error) {
    console.error("OAuth error:", error);
    return NextResponse.json(
      { error: "Authentication failed" },
      { status: 500 },
    );
  }
}
```

#### `src/app/api/auth/logout/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/login", request.url));
  response.cookies.set("idso_session", "", { maxAge: 0, path: "/" });
  return response;
}
```

#### `src/app/api/auth/me/route.ts`

```typescript
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 },
      );
    }
    return NextResponse.json({ data: user });
  } catch {
    return NextResponse.json(
      { error: "Not authenticated" },
      { status: 401 },
    );
  }
}
```

#### `src/app/api/health/route.ts`

```typescript
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ status: "ok" });
}
```

#### `src/app/login/page.tsx`

Replace `{APP_DISPLAY_NAME}` with a human-readable app name:

```tsx
export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 p-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">
            {APP_DISPLAY_NAME}
          </h1>
          <p className="mt-2 text-gray-600">
            Sign in with your organization account
          </p>
        </div>
        <a
          href="/api/auth/login"
          className="mt-8 w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          Sign in with Google
        </a>
      </div>
    </div>
  );
}
```

### 4.4 — Create app-specific files

Based on the user's requirements from Phase 1, create:

1. **Pages** (`src/app/*/page.tsx`) — React components for each screen. Use Tailwind CSS. Include a navigation header with logout button. Follow the component conventions in `CLAUDE-standards.md`.

2. **API routes** (`src/app/api/*/route.ts`) — For each data operation. Every route must:
   - Call `requireAuth()` to get the user email
   - Validate request bodies with Zod schemas
   - Return `{ data: T }` on success, `{ error: string }` on failure
   - Use parameterized queries (never string interpolation for SQL)
   - Include `updated_by` from the authenticated user on all writes

3. **Database client** (`src/lib/db.ts`) — Every app uses Cloud SQL for app data:
   ```typescript
   import { Pool } from "pg";

   export const pool = new Pool({
     connectionString: process.env.IDSO_DB_URL,
   });
   ```

   Also create a **database initialization script** (`src/lib/db-init.ts`) that creates the app's tables if they don't exist. Run this on app startup or via a `/api/db-init` route (protected by auth). Every table must include `created_at`, `updated_at`, and `updated_by` audit columns.

4. **BigQuery client** (`src/lib/bigquery.ts`) — Only if `READS_BIGQUERY` is true (app reads existing warehouse data):
   ```typescript
   import { BigQuery } from "@google-cloud/bigquery";

   const PROJECT_ID = process.env.IDSO_BQ_PROJECT || "central-workspace";

   export const bigquery = new BigQuery({ projectId: PROJECT_ID });
   ```
   Note: apps only READ from BigQuery. Never write app data to BigQuery.

5. **Root layout** (`src/app/layout.tsx`) — Standard Next.js layout with Tailwind globals import.

6. **Type definitions** (`src/types/`) — TypeScript interfaces for all data shapes.

### 4.5 — Verify build

```bash
npm run build
```

If the build fails, fix all errors before proceeding.

### 4.6 — Commit and push

```bash
git add -A
git commit -m "Initial app scaffold: {APP_DESCRIPTION}"
git push origin main
```

---

## Phase 5 — Deploy to Cloud Run

### 5.1 — Build and push container image

```bash
gcloud builds submit \
  --tag us-central1-docker.pkg.dev/central-workspace/idso-apps/{APP_NAME}:latest \
  --project=central-workspace \
  --quiet
```

### 5.2 — Deploy to Cloud Run

All apps use Cloud SQL. The deploy command always includes the Cloud SQL connection and database secret.

```bash
gcloud run deploy {APP_NAME}-app-dev \
  --image us-central1-docker.pkg.dev/central-workspace/idso-apps/{APP_NAME}:latest \
  --region us-central1 \
  --project central-workspace \
  --service-account idso-{APP_NAME}@central-workspace.iam.gserviceaccount.com \
  --set-secrets="IDSO_OAUTH_CLIENT_ID=idso-oauth-client-id:latest,IDSO_OAUTH_CLIENT_SECRET=idso-oauth-client-secret:latest,SECRET_KEY=idso-{APP_NAME}-secret-key:latest,IDSO_DB_URL=idso-{APP_NAME}-db-url:latest" \
  --set-env-vars="IDSO_ALLOWED_DOMAIN=${IDSO_ALLOWED_DOMAIN}" \
  --add-cloudsql-instances=central-workspace:us-central1:idso-shared \
  --port 3000 \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 3 \
  --allow-unauthenticated \
  --quiet
```

If `READS_BIGQUERY` is true, add BigQuery env vars to `--set-env-vars`:

```
  --set-env-vars="...,IDSO_BQ_PROJECT=central-workspace"
```

**Note:** `IDSO_ALLOWED_DOMAIN` must be set to the organization's Google Workspace domain. If you don't know the domain, ask the user: "What is your organization's email domain? (e.g., the part after @ in your work email)"

### 5.3 — Grant public access

```bash
gcloud run services add-iam-policy-binding {APP_NAME}-app-dev \
  --region=us-central1 \
  --member="allUsers" \
  --role="roles/run.invoker" \
  --project=central-workspace \
  --quiet
```

### 5.4 — Get the Cloud Run URL

```bash
CLOUD_RUN_URL=$(gcloud run services describe {APP_NAME}-app-dev \
  --region=us-central1 --project=central-workspace \
  --format="value(status.url)")
echo "App URL: $CLOUD_RUN_URL"
```

### 5.5 — Set up Cloud Build trigger

```bash
gcloud beta builds triggers create github \
  --repo-name="idso-{APP_NAME}" \
  --repo-owner="IDS-Central" \
  --branch-pattern="^main$" \
  --build-config="cloudbuild.yaml" \
  --name="idso-{APP_NAME}-deploy" \
  --project=central-workspace 2>/dev/null || echo "Trigger may already exist or GitHub connection needs setup."
```

If the trigger creation fails, note this for the user in the summary and explain it may need the Cloud Build GitHub App to be connected to the IDS-Central org (a one-time admin step).

---

## Phase 6 — Verify and Hand Off

### 6.1 — Health check

```bash
curl -s "$CLOUD_RUN_URL/api/health"
# Should return: {"status":"ok"}
```

If the health check fails, check the Cloud Run logs:

```bash
gcloud run services logs read {APP_NAME}-app-dev \
  --region=us-central1 --project=central-workspace --limit=20
```

### 6.2 — OAuth redirect URI (manual step)

This is the **one step that requires the GCP Console**. Tell the user:

> **One quick setup step:** I need you (or an admin) to add the OAuth redirect URI so login works.
>
> 1. Go to: https://console.cloud.google.com/apis/credentials?project=central-workspace
> 2. Click the **IDSO OAuth Client** (the existing Web Application client)
> 3. Under **Authorized redirect URIs**, click **Add URI**
> 4. Paste: `{CLOUD_RUN_URL}/api/auth/authorize`
> 5. Click **Save**
>
> This takes about 30 seconds. After that, login will work.

### 6.3 — Print summary

Display a clean summary:

```
═══════════════════════════════════════════════
  Your app is live!
═══════════════════════════════════════════════

  App:      {APP_DESCRIPTION}
  URL:      {CLOUD_RUN_URL}
  Repo:     https://github.com/IDS-Central/idso-{APP_NAME}
  Database: idso_{APP_NAME_UNDERSCORED} (on Cloud SQL instance idso-shared)

  To make changes later:
  1. Open Cloud Shell
  2. Run: source startup.sh
  3. Pick your app from the menu
  4. Describe what you want to change

═══════════════════════════════════════════════
```
