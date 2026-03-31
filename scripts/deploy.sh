#!/bin/bash
# IDSO App Generator — Deploy Script
#
# Builds and deploys the app to Cloud Run via Cloud Build.
# Reads app configuration from app.config.json.
#
# Usage: bash scripts/deploy.sh [app-name]
# If app-name is not provided, reads from app.config.json.

set -euo pipefail

# ─── Configuration ───
PROJECT_ID="central-workspace"
REGION="us-central1"

# ─── Colors ───
BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# ─── Determine app name ───
APP_NAME="${1:-}"

if [ -z "$APP_NAME" ] && [ -f "app.config.json" ]; then
  APP_NAME=$(python3 -c "import json; print(json.load(open('app.config.json'))['name'])" 2>/dev/null || true)
fi

if [ -z "$APP_NAME" ]; then
  echo -e "${RED}ERROR:${NC} Could not determine app name."
  echo "  Either pass it as an argument: bash scripts/deploy.sh <app-name>"
  echo "  Or ensure app.config.json has a 'name' field."
  exit 1
fi

SERVICE_NAME="${APP_NAME}-app-dev"

echo ""
echo -e "${BOLD}═══════════════════════════════════════════════${NC}"
echo -e "${BOLD}  Deploying: ${APP_NAME}${NC}"
echo -e "${BOLD}═══════════════════════════════════════════════${NC}"
echo ""

# ─── Step 1: Generate Prisma client ───
echo -e "[1/3] Generating Prisma client..."
npx prisma generate
echo -e "  ${GREEN}✓${NC} Prisma client generated"

# ─── Step 2: Submit Cloud Build ───
echo -e "[2/3] Submitting Cloud Build..."
echo "  This will build the Docker image and deploy to Cloud Run."
echo ""

gcloud builds submit \
  --config cloudbuild.yaml \
  --project="$PROJECT_ID" \
  --quiet

echo ""
echo -e "  ${GREEN}✓${NC} Build submitted and deployed"

# ─── Step 3: Get live URL ───
echo -e "[3/3] Fetching deployment URL..."
CLOUD_RUN_URL=$(gcloud run services describe "$SERVICE_NAME" \
  --region="$REGION" --project="$PROJECT_ID" \
  --format="value(status.url)" 2>/dev/null || echo "")

echo ""
echo -e "${BOLD}═══════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Deploy complete!${NC}"
echo -e "${BOLD}═══════════════════════════════════════════════${NC}"
echo ""

if [ -n "$CLOUD_RUN_URL" ]; then
  echo -e "  URL: ${BOLD}${CLOUD_RUN_URL}${NC}"
  echo ""
  # Health check
  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${CLOUD_RUN_URL}/api/health" 2>/dev/null || echo "000")
  if [ "$HTTP_STATUS" = "200" ]; then
    echo -e "  Health check: ${GREEN}✓ Healthy${NC}"
  else
    echo -e "  Health check: ${YELLOW}⚠ Got HTTP ${HTTP_STATUS} (may need a moment to start)${NC}"
  fi
else
  echo -e "  ${YELLOW}Could not fetch URL. Check Cloud Run console.${NC}"
fi
echo ""
