#!/bin/bash
# .cloudshell/prestart.sh
# If Cloud Shell sources this file from the cloned repo, schedule startup.sh
# to run on the first interactive prompt (so read/menu commands work).

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STARTUP="$REPO_DIR/scripts/startup.sh"

if [ -f "$STARTUP" ]; then
  export PROMPT_COMMAND="unset PROMPT_COMMAND; source '$STARTUP'"
fi
