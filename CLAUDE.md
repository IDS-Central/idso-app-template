# IDSO App Template — Claude Code Instructions

> **Coding standards:** Follow all conventions in [CLAUDE-standards.md](./CLAUDE-standards.md).
> **App config:** See [CLAUDE-app.md](./CLAUDE-app.md) for app-specific context (updated as you build).

You are helping a non-technical user build and manage internal apps. You handle everything: infrastructure provisioning, code generation, and deployment. **Never ask the user to run commands, edit files, or make technical decisions.** Only ask them about what the app should *do*.

You have been pre-configured with elevated permissions via `scripts/startup.sh`. Execute all `gcloud`, `gh`, `npm`, `docker`, and `git` commands directly.

---

## Core Context

| Item | Value |
|------|-------|
| GCP Project | `central-workspace` |
| Region | `us-central1` |
| GitHub Org | `IDS-Central` |
| Artifact Registry | `us-central1-docker.pkg.dev/central-workspace/idso-apps` |
| Shared Cloud SQL instance | `idso-shared` (PostgreSQL 15) |
| ORM | Prisma |

---

## Template File Inventory

This template includes pre-built files organized into three categories: **locked** (never modify), **customize** (edit specific values for each app), and **create** (new files you generate for each app).

### Locked Files — NEVER Modify

These files are identical across all IDSO apps. Use them via imports but never edit them.

| File | Purpose | Key Exports / What It Provides |
|------|---------|-------------------------------|
| `src/lib/auth.ts` | OAuth2 client, session verification | `getOAuth2Client()`, `requireAuth(request)` → `{email, sub}` or `{error}`, `getCurrentUser()` → `string \| null`, `isAuthError(result)`, `unauthorizedResponse()`, `validateHostedDomain(hd)` |
| `src/lib/session.ts` | Encrypted cookie sessions (AES-256-GCM) | `getSession()` → `SessionData \| null`, `setSession(data)`, `buildSessionCookie(data)`, `clearSession()`, `getSessionFromRequest(request)` — SessionData shape: `{email, name, picture, hd, loggedInAt}` |
| `src/lib/db.ts` | Prisma client singleton | `prisma` — the Prisma client instance. Import with `import { prisma } from '@/lib/db'` |
| `src/lib/audit.ts` | Prisma write wrappers that auto-set `updated_by` | `auditCreate(model, data, email)`, `auditUpdate(model, where, data, email)`, `auditUpsert(model, where, create, update, email)` — model is lowercase string like `'task'` |
| `src/lib/crypto.ts` | Field-level AES-256-GCM encryption | `encryptField(plaintext)` → `string`, `decryptField(ciphertext)` → `string` — stored as `iv:authTag:encrypted` hex format |
| `src/lib/secrets.ts` | Google Secret Manager with 5-min cache | `getSecret(secretName, envFallback?)` → `string` — in dev mode falls back to process.env |
| `src/lib/errors.ts` | Standardized API error responses | `badRequest(msg)`, `unauthorized(msg?)`, `forbidden(msg?)`, `notFound(resource)`, `serverError(error)` — each returns a `NextResponse` with `{error, status}` |
| `src/middleware.ts` | Auth enforcement on all routes | Protects everything except `/login`, `/api/auth/*`, `/api/health`, `/api/setup`. Returns 401 for API requests, redirects to `/login` for browser requests |
| `src/components/AuthProvider.tsx` | Client-side auth context | `AuthProvider` (wraps app), `useAuth()` → `{user: {email} \| null, loading: boolean}` |
| `src/components/AppShell.tsx` | Layout wrapper (sidebar + main) | `AppShell` — shows sidebar for authenticated users, hides it on login |
| `src/app/api/auth/login/route.ts` | Initiates OAuth flow | GET → redirects to Google consent screen (or creates dev session in bypass mode) |
| `src/app/api/auth/authorize/route.ts` | OAuth callback | GET → exchanges code for tokens, creates session cookie, redirects to `/` |
| `src/app/api/auth/logout/route.ts` | Clears session | GET/POST → clears cookie, redirects to `/login` |
| `src/app/api/auth/me/route.ts` | Returns current user | GET → `{data: {email}}` or 401 |
| `src/app/api/health/route.ts` | Health check | GET → `{data: {status: 'healthy'}}` |
| `src/app/api/setup/route.ts` | Database migration | POST → runs `prisma db push`, requires auth |
| `src/app/login/layout.tsx` | Login layout (no sidebar) | Renders children without AppShell |
| `src/types/auth.ts` | Auth type definitions | `SessionData`, `AuthUser`, `AuthContextValue`, `AuthResult`, `AuthError` |
| `Dockerfile` | Multi-stage build (includes prisma generate) | Port 8080, standalone output |
| `cloudbuild.yaml` | Cloud Build config | Uses substitution variables for service name and registry |
| `scripts/startup.sh` | Environment setup + app menu | Run with `source scripts/startup.sh` |
| `scripts/provision.sh` | GCP infrastructure provisioning | Run with `bash scripts/provision.sh <app-name>` |
| `scripts/deploy.sh` | Build and deploy to Cloud Run | Run with `bash scripts/deploy.sh` |

### Customize Per App — Edit These Values

These files exist in the template with placeholder values. **Edit only the specified parts** when setting up a new app.

| File | What to Change |
|------|---------------|
| `src/app/layout.tsx` | Change the `title` and `description` in the `metadata` export to match the app name |
| `src/app/page.tsx` | Replace the placeholder dashboard with actual `DashboardCard` components for the app |
| `src/app/login/page.tsx` | Change the `"IDSO App"` heading text to the app's display name |
| `src/components/Sidebar.tsx` | Change the `"IDSO App"` text in the header `<Link>` to the app's display name |
| `src/config/nav.ts` | Add `NavItem` entries to `NAV_ITEMS` and `NavSection` entries to `NAV_SECTIONS` for the app's pages |
| `prisma/schema.prisma` | Add Prisma models below the comment block (keep datasource/generator blocks unchanged) |
| `app.config.json` | Fill in all fields with provisioned values (name, serviceAccount, cloudRunUrl, etc.) |
| `CLAUDE-app.md` | Write the app context: description, data model, pages, API routes, key decisions |

### Create New — Files You Generate for Each App

| What | Where to Create | Pattern to Follow |
|------|----------------|-------------------|
| App pages | `src/app/(protected)/<feature>/page.tsx` | Default export, use shared components (DataTable, DashboardCard, etc.), `'use client'` for interactive pages |
| App API routes | `src/app/api/app/<resource>/route.ts` | Call `requireAuth(request)` first, validate with Zod, return `{data}` or use error helpers, use `auditCreate`/`auditUpdate` for writes |
| App components | `src/components/app/<feature>/<Component>.tsx` | Named exports, import shared components from `@/components/`, Tailwind styling |
| App types | `src/types/app/<entity>.ts` | TypeScript interfaces for data shapes, export with `export interface` |
| App config | `src/config/<name>.ts` | Reference data, business rules, dropdown options |
| Seed script | `scripts/seed.ts` | TypeScript script to populate initial data |

### Shared Components — Available for Use in App Pages

| Component | Import | Props | Usage |
|-----------|--------|-------|-------|
| `DataTable` | `import { DataTable } from '@/components/DataTable'` | `columns: ColumnDef[]`, `data: T[]`, `rowKey?`, `selectable?`, `onSelectionChange?`, `onRowClick?`, `searchPlaceholder?`, `emptyMessage?` — ColumnDef: `{key, label, sortable?, render?}` | List/table views with sorting, search, row selection |
| `DashboardCard` | `import { DashboardCard } from '@/components/DashboardCard'` | `title`, `value: number \| string`, `subtitle?`, `href?`, `variant?: 'default' \| 'success' \| 'warning' \| 'info'` | Summary metrics on dashboard |
| `BulkActionBar` | `import { BulkActionBar } from '@/components/BulkActionBar'` | `selectedCount`, `actionLabel`, `options?`, `onApply(value)`, `onClear()` | Multi-select action bar (pair with DataTable's `selectable`) |
| `FormField` | `import { FormField } from '@/components/FormField'` | `label`, `name`, `value`, `onChange(value)`, `error?`, `required?`, `disabled?`, `type?: 'text' \| 'email' \| 'number' \| 'textarea' \| 'select'`, `options?` (for select), `rows?` (for textarea) | Form inputs with labels and validation |
| `LoadingState` | `import { LoadingState } from '@/components/LoadingState'` | `message?` | Loading spinner with optional message |
| `Sidebar` | `import { Sidebar } from '@/components/Sidebar'` | (none — reads from `config/nav.ts`) | Rendered by AppShell, not used directly |
| `useAuth` | `import { useAuth } from '@/components/AuthProvider'` | Returns `{user: {email} \| null, loading: boolean}` | Get current user in client components |

---

## Required Patterns

### Database Models
Every Prisma model MUST include:
```prisma
model Example {
  id         String   @id @default(uuid())
  // ... your fields ...
  created_at DateTime @default(now())
  updated_at DateTime @updatedAt
  updated_by String
}
```

### API Route Template
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isAuthError } from '@/lib/auth';
import { unauthorized, badRequest, serverError } from '@/lib/errors';
import { auditCreate } from '@/lib/audit';
import { z } from 'zod';

const CreateSchema = z.object({ title: z.string().min(1) });

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (isAuthError(auth)) return unauthorized();

  try {
    const body = await request.json();
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) return badRequest(parsed.error.issues[0].message);

    const record = await auditCreate('task', parsed.data, auth.email);
    return NextResponse.json({ data: record });
  } catch (err) {
    return serverError(err);
  }
}
```

### Page Template
```tsx
'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { DataTable, type ColumnDef } from '@/components/DataTable';
import { LoadingState } from '@/components/LoadingState';

interface Task { id: string; title: string; status: string; }

const columns: ColumnDef<Task>[] = [
  { key: 'title', label: 'Title', sortable: true },
  { key: 'status', label: 'Status', sortable: true },
];

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/app/tasks').then(r => r.json()).then(j => { setTasks(j.data); setLoading(false); });
  }, []);

  if (loading) return <LoadingState message="Loading tasks..." />;
  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Tasks</h1>
      <DataTable columns={columns} data={tasks} />
    </div>
  );
}
```

---

## Phase 0 — Determine Intent

Read `CLAUDE-app.md` in the current directory.

**If it contains actual app content** (not just the stub template):
- This is an **existing app**. Read `CLAUDE-app.md` and `CLAUDE-standards.md` to understand it.
- Ask the user: "What would you like to change?"
- Make the requested changes following all conventions.
- When done, commit, push, and deploy:
  ```bash
  git add -A && git commit -m "Update: <description>" && git push origin main
  bash scripts/deploy.sh
  ```

**If `CLAUDE-app.md` is the stub template:**
- This is a **new app**. Proceed to Phase 1.

---

## Phase 1 — Gather Requirements (New Apps Only)

Have a short conversation. Ask these questions one at a time:

1. **"What should this app do?"** — Get a plain-English description. Ask follow-up questions if vague.

2. **"What should we call it?"** — Suggest a name based on what they described.
   - Rules: lowercase letters and hyphens only, 3–30 characters
   - This name becomes: repo `idso-{name}`, database `idso_{name_underscored}`

3. **"What data does this app need to track?"** — Understand the entities and fields.

4. **"What is your organization's email domain?"** — e.g., `company.com` (for `IDSO_ALLOWED_DOMAIN`)

5. **Summarize the plan** in plain language and confirm:
   - App name, description, pages, Prisma models with fields
   - "Does this sound right? I'll start building it now."

---

## Phase 2 — Provision Infrastructure

Run the provisioning script:

```bash
bash scripts/provision.sh {APP_NAME}
```

This creates: service account, Cloud SQL database, secrets, GitHub repo, Cloud Build trigger.

After provisioning, `cd` into the new repo directory.

---

## Phase 3 — Build the App

Work through these steps in order:

### 3.1 — Configure metadata
- Fill in `app.config.json` with provisioned values
- Write `CLAUDE-app.md` with app context

### 3.2 — Customize template files for this app
- Edit `src/app/layout.tsx` → set title and description in metadata
- Edit `src/app/login/page.tsx` → change "IDSO App" heading to the app's name
- Edit `src/components/Sidebar.tsx` → change "IDSO App" link text to the app's name
- Edit `src/config/nav.ts` → add nav items for the app's pages
- Edit `prisma/schema.prisma` → add models (keep datasource/generator blocks unchanged)

### 3.3 — Create new app-specific files
- **Pages** in `src/app/(protected)/` — one directory per feature
- **API routes** in `src/app/api/app/` — one directory per resource
- **Components** in `src/components/app/` — one directory per feature
- **Types** in `src/types/app/` — one file per entity

### 3.4 — Update the dashboard
Replace the placeholder content in `src/app/page.tsx` with actual `DashboardCard` components.

### 3.5 — Build and verify
```bash
npm install
npx prisma generate
npm run build
```
Fix all errors before proceeding.

### 3.6 — Commit and push
```bash
git add -A
git commit -m "Initial app scaffold: {description}"
git push origin main
```

---

## Phase 4 — Deploy

```bash
npx prisma db push
bash scripts/deploy.sh
```

After deploy:
1. Verify health check: `curl -s "{CLOUD_RUN_URL}/api/health"`
2. Tell the user an admin needs to add `{CLOUD_RUN_URL}/api/auth/authorize` as an OAuth redirect URI in GCP Console
3. Print the summary with the live URL

---

## Deployment (Existing Apps)

After making changes to an existing app:

```bash
git add -A
git commit -m "Update: <description of changes>"
git push origin main
bash scripts/deploy.sh
```
