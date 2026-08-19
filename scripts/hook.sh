#!/usr/bin/env bash
# PulseMonitor - Hook script
#
# Source this file in your shell profile or agent dispatch script to
# automatically start the monitor when you dispatch a remote agent task.
#
# Usage in your dispatch script:
#   source /path/to/pulsemonitor/scripts/hook.sh
#   agent_monitor_start "root@server" "~/.ssh/id_rsa" "my-repo"
#   # ... dispatch your agent task ...
#   agent_monitor_stop
#
# Or set environment variables and call agent_monitor_start with no args:
#   export AGENT_MONITOR_SSH_HOST="root@server"
#   export AGENT_MONITOR_SSH_KEY="~/.ssh/id_rsa"
#   source /path/to/pulsemonitor/scripts/hook.sh
#   agent_monitor_start

AGENT_MONITOR_DIR="${AGENT_MONITOR_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
AGENT_MONITOR_PID_FILE="/tmp/pulsemonitor.pid"

agent_monitor_start() {
  local host="${1:-$AGENT_MONITOR_SSH_HOST}"
  local key="${2:-$AGENT_MONITOR_SSH_KEY}"
  local repo="${3:-$AGENT_MONITOR_REPO_PATH}"
  local port="${AGENT_MONITOR_PORT:-5656}"

  if [[ -z "$host" ]]; then
    echo "pulsemonitor: no SSH host configured. Set AGENT_MONITOR_SSH_HOST or pass as arg." >&2
    return 1
  fi

  # Check if already running
  if [[ -f "$AGENT_MONITOR_PID_FILE" ]] && kill -0 "$(cat "$AGENT_MONITOR_PID_FILE")" 2>/dev/null; then
    echo "pulsemonitor: already running (PID $(cat "$AGENT_MONITOR_PID_FILE"))"
    echo "pulsemonitor: dashboard at http://localhost:$port"
    return 0
  fi

  # Start the monitor in the background
  AGENT_MONITOR_SSH_HOST="$host" \
  AGENT_MONITOR_SSH_KEY="$key" \
  AGENT_MONITOR_REPO_PATH="$repo" \
  AGENT_MONITOR_PORT="$port" \
    nohup node "$AGENT_MONITOR_DIR/server.cjs" > /tmp/pulsemonitor.log 2>&1 &

  local pid=$!
  echo "$pid" > "$AGENT_MONITOR_PID_FILE"
  sleep 2

  if kill -0 "$pid" 2>/dev/null; then
    echo "pulsemonitor: started (PID $pid)"
    echo "pulsemonitor: dashboard at http://localhost:$port"
  else
    echo "pulsemonitor: failed to start. Check /tmp/pulsemonitor.log" >&2
    return 1
  fi
}

agent_monitor_stop() {
  if [[ ! -f "$AGENT_MONITOR_PID_FILE" ]]; then
    echo "pulsemonitor: not running"
    return 0
  fi

  local pid
  pid=$(cat "$AGENT_MONITOR_PID_FILE")
  if kill -0 "$pid" 2>/dev/null; then
    kill "$pid"
    echo "pulsemonitor: stopped (PID $pid)"
  else
    echo "pulsemonitor: process $pid not found (already stopped)"
  fi
  rm -f "$AGENT_MONITOR_PID_FILE"
}

agent_monitor_status() {
  if [[ -f "$AGENT_MONITOR_PID_FILE" ]] && kill -0 "$(cat "$AGENT_MONITOR_PID_FILE")" 2>/dev/null; then
    echo "pulsemonitor: running (PID $(cat "$AGENT_MONITOR_PID_FILE"))"
    echo "pulsemonitor: dashboard at http://localhost:${AGENT_MONITOR_PORT:-5656}"
  else
    echo "pulsemonitor: not running"
  fi
}
