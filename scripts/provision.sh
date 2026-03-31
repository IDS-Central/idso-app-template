#!/bin/bash
# IDSO App Generator — Infrastructure Provisioning Script
#
# Creates all GCP resources for a new app:
#   - Service account with least-privilege IAM roles
#   - Cloud SQL database and user on the shared instance
#   - Secrets in Secret Manager (DB URL and encryption key)
#   - Per-secret IAM bindings (not project-wide)
#   - GitHub repo from template
#   - Cloud Build trigger
#
# Usage: bash scripts/provision.sh <app-name>
# Example: bash scripts/provision.sh supply-requests

set -euo pipefail

# ─── Configuration ───
PROJECT_ID="central-workspace"
REGION="us-central1"
GH_ORG="IDS-Central"
TEMPLATE_REPO="idso-app-template"
SQL_INSTANCE="idso-shared"
ARTIFACT_REGISTRY="us-central1-docker.pkg.dev/${PROJECT_ID}/idso-apps"

# ─── Colors ───
BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# ─── Validate input ───
APP_NAME="${1:-}"
if [ -z "$APP_NAME" ]; then
  echo -e "${RED}Usage:${NC} bash scripts/provision.sh <app-name>"
  echo "  Example: bash scripts/provision.sh supply-requests"
  exit 1
fi

# Validate naming rules: lowercase, hyphens, 3-30 chars
if ! echo "$APP_NAME" | grep -qE '^[a-z][a-z0-9-]{2,29}$'; then
  echo -e "${RED}ERROR:${NC} App name must be 3-30 characters, lowercase letters, numbers, and hyphens only."
  exit 1
fi

APP_NAME_UNDERSCORED=$(echo "$APP_NAME" | tr '-' '_')
SA_NAME="idso-${APP_NAME}"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
DB_NAME="idso_${APP_NAME_UNDERSCORED}"
DB_USER="idso_${APP_NAME_UNDERSCORED}"
REPO_NAME="idso-${APP_NAME}"

echo ""
echo -e "${BOLD}═══════════════════════════════════════════════${NC}"
echo -e "${BOLD}  Provisioning: ${APP_NAME}${NC}"
echo -e "${BOLD}═══════════════════════════════════════════════${NC}"
echo ""

# ─── Step 1: Verify project ───
echo -e "[1/9] Verifying GCP project..."
CURRENT_PROJECT=$(gcloud config get-value project 2>/dev/null)
if [ "$CURRENT_PROJECT" != "$PROJECT_ID" ]; then
  gcloud config set project "$PROJECT_ID" --quiet
fi
echo -e "  ${GREEN}✓${NC} Project: $PROJECT_ID"

# ─── Step 2: Create service account ───
echo -e "[2/9] Creating service account..."
gcloud iam service-accounts create "$SA_NAME" \
  --display-name="IDSO ${APP_NAME} service account" \
  --project="$PROJECT_ID" 2>/dev/null || echo -e "  ${YELLOW}Already exists, continuing...${NC}"
echo -e "  ${GREEN}✓${NC} Service account: $SA_EMAIL"

# ─── Step 3: Grant IAM roles ───
echo -e "[3/9] Granting IAM roles..."
for ROLE in roles/cloudsql.client roles/bigquery.dataViewer roles/bigquery.jobUser; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$SA_EMAIL" \
    --role="$ROLE" \
    --condition=None --quiet 2>/dev/null || true
done
echo -e "  ${GREEN}✓${NC} Roles granted (cloudsql.client, bigquery.dataViewer, bigquery.jobUser)"

# ─── Step 4: Ensure shared Cloud SQL instance exists ───
echo -e "[4/9] Checking Cloud SQL instance..."
if ! gcloud sql instances describe "$SQL_INSTANCE" --project="$PROJECT_ID" &>/dev/null; then
  echo "  Creating shared Cloud SQL instance (this takes a few minutes)..."
  gcloud sql instances create "$SQL_INSTANCE" \
    --database-version=POSTGRES_15 \
    --tier=db-f1-micro \
    --region="$REGION" \
    --project="$PROJECT_ID" \
    --storage-auto-increase \
    --availability-type=zonal \
    --quiet
fi
echo -e "  ${GREEN}✓${NC} Cloud SQL instance: $SQL_INSTANCE"

# ─── Step 5: Create database and user ───
echo -e "[5/9] Creating database and user..."
gcloud sql databases create "$DB_NAME" \
  --instance="$SQL_INSTANCE" --project="$PROJECT_ID" 2>/dev/null \
  || echo -e "  ${YELLOW}Database already exists, continuing...${NC}"

DB_PASSWORD=$(python3 -c "import secrets; print(secrets.token_urlsafe(32))")
gcloud sql users create "$DB_USER" \
  --instance="$SQL_INSTANCE" --password="$DB_PASSWORD" \
  --project="$PROJECT_ID" 2>/dev/null \
  || echo -e "  ${YELLOW}User already exists, continuing...${NC}"

INSTANCE_CONNECTION=$(gcloud sql instances describe "$SQL_INSTANCE" \
  --project="$PROJECT_ID" --format="value(connectionName)")

echo -e "  ${GREEN}✓${NC} Database: $DB_NAME, User: $DB_USER"

# ─── Step 6: Store secrets ───
echo -e "[6/9] Storing secrets in Secret Manager..."

# Database URL
DB_URL="postgresql://${DB_USER}:${DB_PASSWORD}@/${DB_NAME}?host=/cloudsql/${INSTANCE_CONNECTION}"
echo -n "$DB_URL" | gcloud secrets create "${APP_NAME}-db-url" \
  --data-file=- --project="$PROJECT_ID" 2>/dev/null \
  || (echo -e "  ${YELLOW}DB URL secret exists, adding new version...${NC}" && \
      echo -n "$DB_URL" | gcloud secrets versions add "${APP_NAME}-db-url" \
        --data-file=- --project="$PROJECT_ID")

# Encryption key
ENCRYPTION_KEY=$(python3 -c "import secrets; print(secrets.token_hex(32))")
echo -n "$ENCRYPTION_KEY" | gcloud secrets create "${APP_NAME}-encryption-key" \
  --data-file=- --project="$PROJECT_ID" 2>/dev/null \
  || (echo -e "  ${YELLOW}Encryption key secret exists, adding new version...${NC}" && \
      echo -n "$ENCRYPTION_KEY" | gcloud secrets versions add "${APP_NAME}-encryption-key" \
        --data-file=- --project="$PROJECT_ID")

# Secret key for session encryption
SECRET_KEY=$(python3 -c "import secrets; print(secrets.token_hex(32))")
echo -n "$SECRET_KEY" | gcloud secrets create "idso-${APP_NAME}-secret-key" \
  --data-file=- --project="$PROJECT_ID" 2>/dev/null \
  || (echo -e "  ${YELLOW}Secret key already exists, adding new version...${NC}" && \
      echo -n "$SECRET_KEY" | gcloud secrets versions add "idso-${APP_NAME}-secret-key" \
        --data-file=- --project="$PROJECT_ID")

echo -e "  ${GREEN}✓${NC} Secrets stored: ${APP_NAME}-db-url, ${APP_NAME}-encryption-key, idso-${APP_NAME}-secret-key"

# ─── Step 7: Grant per-secret access ───
echo -e "[7/9] Granting per-secret IAM bindings..."
for SECRET in "${APP_NAME}-db-url" "${APP_NAME}-encryption-key" "idso-${APP_NAME}-secret-key" "idso-oauth-client-id" "idso-oauth-client-secret"; do
  gcloud secrets add-iam-policy-binding "$SECRET" \
    --member="serviceAccount:$SA_EMAIL" \
    --role="roles/secretmanager.secretAccessor" \
    --project="$PROJECT_ID" --quiet 2>/dev/null || true
done
echo -e "  ${GREEN}✓${NC} Per-secret access granted"

# ─── Step 8: Create GitHub repo ───
echo -e "[8/9] Creating GitHub repo..."
if gh repo view "${GH_ORG}/${REPO_NAME}" &>/dev/null; then
  echo -e "  ${YELLOW}Repo already exists, cloning...${NC}"
  cd "$HOME"
  gh repo clone "${GH_ORG}/${REPO_NAME}" 2>/dev/null || true
else
  cd "$HOME"
  gh repo create "${GH_ORG}/${REPO_NAME}" \
    --template "${GH_ORG}/${TEMPLATE_REPO}" \
    --private \
    --clone
fi
cd "$HOME/${REPO_NAME}"
echo -e "  ${GREEN}✓${NC} Repo: ${GH_ORG}/${REPO_NAME}"

# ─── Step 9: Create Cloud Build trigger ───
echo -e "[9/9] Creating Cloud Build trigger..."
gcloud beta builds triggers create github \
  --repo-name="$REPO_NAME" \
  --repo-owner="$GH_ORG" \
  --branch-pattern="^main$" \
  --build-config="cloudbuild.yaml" \
  --name="idso-${APP_NAME}-deploy" \
  --project="$PROJECT_ID" 2>/dev/null \
  || echo -e "  ${YELLOW}Trigger may already exist or GitHub connection needs setup.${NC}"
echo -e "  ${GREEN}✓${NC} Cloud Build trigger configured"

# ─── Ensure Artifact Registry exists ───
gcloud artifacts repositories describe idso-apps \
  --location="$REGION" --project="$PROJECT_ID" &>/dev/null || \
gcloud artifacts repositories create idso-apps \
  --repository-format=docker \
  --location="$REGION" \
  --description="IDSO application container images" \
  --project="$PROJECT_ID"

# ─── Done ───
echo ""
echo -e "${BOLD}═══════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Provisioning complete!${NC}"
echo -e "${BOLD}═══════════════════════════════════════════════${NC}"
echo ""
echo "  App Name:        $APP_NAME"
echo "  Repo:            https://github.com/${GH_ORG}/${REPO_NAME}"
echo "  Service Account: $SA_EMAIL"
echo "  Database:        $DB_NAME on $SQL_INSTANCE"
echo "  Working Dir:     $HOME/${REPO_NAME}"
echo ""
echo "  Next steps:"
echo "  1. cd $HOME/${REPO_NAME}"
echo "  2. Update CLAUDE-app.md with your app config"
echo "  3. Add Prisma models, then run: npx prisma db push"
echo "  4. Deploy with: bash scripts/deploy.sh"
echo "  5. After deploy, add OAuth redirect URI in GCP Console:"
echo "     https://<cloud-run-url>/api/auth/authorize"
echo ""
