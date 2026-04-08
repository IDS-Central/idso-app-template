# IDSO App Generator

Build internal apps by describing what you want in plain English. No coding required.

This template repo powers the IDSO app creation workflow. Click the button below to open Google Cloud Shell, where Claude Code will handle everything: provisioning GCP infrastructure, writing the code, and deploying to Cloud Run.

## Get Started

[![Open in Cloud Shell](https://gstatic.com/cloudssh/images/open-btn.svg)](https://console.cloud.google.com/cloudshell/open?git_repo=https://github.com/IDS-Central/idso-app-template&page=editor&tutorial=tutorial.md&cloudshell_open_run=teachme%20tutorial.md)

**What happens when you click:**

1. Cloud Shell clones this repo and opens a guided tutorial
2. You run the setup script (`source scripts/startup.sh`)
3. A menu shows your existing apps or lets you create a new one
4. Claude Code builds, deploys, and gives you the URL

## What gets built

Every app created from this template includes:

- **Next.js + TypeScript** web application with Tailwind CSS
- **Google OAuth** authentication (restricted to your org domain)
- **Prisma ORM** with PostgreSQL (Google Cloud SQL)
- **Cloud Run** deployment with automatic builds on push to `main`
- **Dedicated service account** with least-privilege IAM roles
- **Reusable components** — DataTable, DashboardCard, FormField, BulkActionBar

## Template Structure

```
src/
  app/
    (protected)/     ← Your app pages go here
    api/
      app/           ← Your app API routes go here
      auth/          ← OAuth flow (locked)
      health/        ← Health check (locked)
      setup/         ← DB migration endpoint (locked)
    login/           ← Login page (locked)
  components/
    app/             ← Your app components go here
    AppShell.tsx     ← Layout wrapper (locked)
    AuthProvider.tsx ← Auth context (locked)
    Sidebar.tsx      ← Navigation sidebar (locked)
    DataTable.tsx    ← Reusable table component
    DashboardCard.tsx← Metric card component
    BulkActionBar.tsx← Multi-select action bar
    FormField.tsx    ← Form input component
    LoadingState.tsx ← Loading spinner
  lib/               ← Core utilities (locked)
  types/
    app/             ← Your app types go here
  config/
    nav.ts           ← Navigation items (editable)
prisma/
  schema.prisma      ← Add your models here
scripts/
  startup.sh         ← Environment setup
  provision.sh       ← GCP provisioning
  deploy.sh          ← Build and deploy
```

## Prerequisites

- Access to the `central-workspace` GCP project
- A GitHub account with access to the `IDS-Central` org
- That's it — everything else is handled automatically

## Making changes later

Come back to Cloud Shell and run `source scripts/startup.sh`. Pick your app from the menu, and describe the change you want. Claude Code updates the code and redeploys.

## Architecture

All IDSO apps follow the same architecture:

- **Hosting:** Google Cloud Run (`us-central1`)
- **Auth:** Shared Google OAuth client, app-level session management
- **Data:** Prisma ORM with PostgreSQL on Cloud SQL
- **CI/CD:** Cloud Build triggers on push to `main`
- **Secrets:** Google Secret Manager (never in code or env files)

See [CLAUDE-standards.md](./CLAUDE-standards.md) for full development standards.
