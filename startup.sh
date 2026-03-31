#!/bin/bash
# IDSO App Generator — Cloud Shell startup script
# Sets up the environment and presents an interactive app menu.
# Usage: source startup.sh

set -e

# ─── Configuration ───
GCP_PROJECT="central-workspace"
GH_ORG="IDS-Central"
REGION="us-central1"
TEMPLATE_REPO="idso-app-template"

# ─── Colors ───
BOLD='\033[1m'
BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo ""
echo -e "${BOLD}═══════════════════════════════════════════════${NC}"
echo -e "${BOLD}  IDSO App Generator — Setting up...${NC}"
echo -e "${BOLD}═══════════════════════════════════════════════${NC}"
echo ""

# ─── Step 1: Verify gcloud auth ───
echo -e "${BLUE}[1/5]${NC} Checking Google Cloud authentication..."
ACTIVE_ACCOUNT=$(gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>/dev/null || true)
if [ -z "$ACTIVE_ACCOUNT" ]; then
  echo -e "${RED}ERROR:${NC} No active Google Cloud account."
  echo "  Run: gcloud auth login"
  return 1 2>/dev/null || exit 1
fi
echo -e "  ${GREEN}✓${NC} Authenticated as: $ACTIVE_ACCOUNT"

gcloud config set project "$GCP_PROJECT" --quiet 2>/dev/null
echo -e "  ${GREEN}✓${NC} Project set to: $GCP_PROJECT"

# ─── Step 2: Install/verify GitHub CLI ───
echo -e "${BLUE}[2/5]${NC} Checking GitHub CLI..."
if ! command -v gh &> /dev/null; then
  echo "  Installing GitHub CLI..."
  (type -p curl >/dev/null || (sudo apt update -qq && sudo apt install curl -y -qq)) 2>/dev/null
  curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
    | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg 2>/dev/null
  sudo chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
    | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null
  sudo apt update -qq && sudo apt install gh -y -qq
fi

if ! gh auth status &> /dev/null 2>&1; then
  echo ""
  echo -e "${YELLOW}GitHub CLI needs authentication.${NC}"
  # Try stored PAT from Secret Manager
  GH_TOKEN=$(gcloud secrets versions access latest --secret=github-pat --project="$GCP_PROJECT" 2>/dev/null || true)
  if [ -n "$GH_TOKEN" ]; then
    echo "$GH_TOKEN" | gh auth login --with-token 2>/dev/null
    echo -e "  ${GREEN}✓${NC} GitHub CLI authenticated via stored token."
  else
    echo "  Please authenticate with GitHub:"
    echo ""
    gh auth login
    echo ""
  fi
else
  echo -e "  ${GREEN}✓${NC} GitHub CLI authenticated."
fi

# ─── Step 3: Install/verify Claude Code ───
echo -e "${BLUE}[3/5]${NC} Checking Claude Code..."
if ! command -v claude &> /dev/null; then
  echo "  Installing Claude Code (this may take a minute)..."
  npm install -g @anthropic-ai/claude-code 2>/dev/null
fi
echo -e "  ${GREEN}✓${NC} Claude Code installed."

# ─── Step 4: Pull Anthropic API key ───
echo -e "${BLUE}[4/5]${NC} Configuring API access..."
ANTHROPIC_API_KEY=$(gcloud secrets versions access latest --secret=anthropic-api-key --project="$GCP_PROJECT" 2>/dev/null || true)
if [ -z "$ANTHROPIC_API_KEY" ]; then
  echo -e "${RED}ERROR:${NC} Could not retrieve Anthropic API key from Secret Manager."
  echo "  Ensure the secret 'anthropic-api-key' exists in project '$GCP_PROJECT'."
  return 1 2>/dev/null || exit 1
fi
export ANTHROPIC_API_KEY
echo -e "  ${GREEN}✓${NC} API access configured."

# ─── Step 5: Configure Claude Code permissions ───
echo -e "${BLUE}[5/5]${NC} Configuring Claude Code permissions..."
# Claude Code needs to run gcloud, bq, gh, docker, npm, git, etc. without
# prompting the non-technical user for approval on every command.
# We use --dangerously-skip-permissions when launching claude below.
echo -e "  ${GREEN}✓${NC} Permissions configured."

echo ""
echo -e "${GREEN}Environment ready!${NC}"
echo ""

# ═══════════════════════════════════════════════
# Interactive App Menu
# ═══════════════════════════════════════════════

# Build list of existing apps
declare -a APP_DIRS=()
declare -a APP_NAMES=()
declare -a APP_DESCS=()
declare -a APP_URLS=()

echo -e "Scanning for existing apps..."
echo ""

for dir in "$HOME"/idso-*/; do
  [ -d "$dir" ] || continue
  dirname=$(basename "$dir")

  # Skip the template repo
  [ "$dirname" = "$TEMPLATE_REPO" ] && continue

  app_name="${dirname#idso-}"
  APP_DIRS+=("$dir")
  APP_NAMES+=("$app_name")

  # Read description from CLAUDE-app.md
  desc="No description"
  if [ -f "$dir/CLAUDE-app.md" ]; then
    line=$(grep -m1 '^\- \*\*Description:\*\*' "$dir/CLAUDE-app.md" 2>/dev/null || true)
    if [ -n "$line" ]; then
      desc=$(echo "$line" | sed 's/^- \*\*Description:\*\* //')
    fi
  fi
  APP_DESCS+=("$desc")

  # Get Cloud Run URL (quick check, don't block on failure)
  url=$(gcloud run services describe "${app_name}-app-dev" \
    --region="$REGION" --project="$GCP_PROJECT" \
    --format="value(status.url)" 2>/dev/null || echo "Not yet deployed")
  APP_URLS+=("$url")
done

# Display menu
echo -e "${BOLD}═══════════════════════════════════════════════${NC}"
echo -e "${BOLD}  IDSO App Generator${NC}"
echo -e "${BOLD}═══════════════════════════════════════════════${NC}"
echo ""

if [ ${#APP_NAMES[@]} -gt 0 ]; then
  echo "  Your apps:"
  echo ""
  for i in "${!APP_NAMES[@]}"; do
    num=$((i + 1))
    echo -e "  ${BOLD}${num}.${NC} ${APP_NAMES[$i]} — ${APP_DESCS[$i]}"
    echo -e "     ${BLUE}${APP_URLS[$i]}${NC}"
    echo ""
  done
fi

echo -e "  ${BOLD}N.${NC} Create a new app"
echo ""
echo "─────────────────────────────────────────────"

# Get user choice
while true; do
  if [ ${#APP_NAMES[@]} -gt 0 ]; then
    read -rp "  Enter a number to open an app, or N to create a new one: " choice
  else
    read -rp "  Press Enter to create your first app: " choice
    [ -z "$choice" ] && choice="N"
  fi

  # "N" or "n" → create new app
  if [[ "$choice" =~ ^[Nn]$ ]]; then
    echo ""
    echo -e "${GREEN}Starting new app creation...${NC}"
    echo ""

    TEMPLATE_DIR="$HOME/$TEMPLATE_REPO"
    if [ ! -d "$TEMPLATE_DIR" ]; then
      # Fallback: we're probably already in the template dir
      TEMPLATE_DIR="$(pwd)"
    fi

    cd "$TEMPLATE_DIR"
    claude --dangerously-skip-permissions
    break
  fi

  # Numeric choice → open existing app
  if [[ "$choice" =~ ^[0-9]+$ ]] && [ "$choice" -ge 1 ] 2>/dev/null && [ "$choice" -le "${#APP_NAMES[@]}" ] 2>/dev/null; then
    idx=$((choice - 1))
    echo ""
    echo -e "${GREEN}Opening ${APP_NAMES[$idx]}...${NC}"
    echo ""
    cd "${APP_DIRS[$idx]}"
    claude --dangerously-skip-permissions
    break
  fi

  echo -e "  ${RED}Invalid choice.${NC} Please try again."
done
