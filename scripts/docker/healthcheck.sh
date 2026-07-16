#!/usr/bin/env sh
# Health check used by compose.yaml and as a standalone diagnostic.
#
# node is always PID 1 in API mode (API_MODE=true); cron is always PID 1 in
# scheduler mode (API_MODE unset).  Checking for either covers both modes
# without needing to inspect API_MODE.
pgrep -x node >/dev/null 2>&1 || pgrep -x cron >/dev/null 2>&1
