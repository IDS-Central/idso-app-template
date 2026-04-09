#!/bin/bash
# Debug: leave a marker so we know if this script ran
echo "cloudshell_open.sh ran at $(date)" > /tmp/cloudshell_open_debug.log
teachme .cloudshell/tutorial.md
