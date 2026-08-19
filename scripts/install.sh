#!/usr/bin/env bash
# Agent Monitor - Install script for Linux and macOS
#
# Installs the monitor locally, deploys helper scripts to the remote
# machine, and optionally sets up a systemd/launchd service.
#
# Usage:
#   ./scripts/install.sh                          # interactive
#   ./scripts/install.sh --ssh-host root@server   # non-interactive
#   ./scripts/install.sh --ssh-key ~/.ssh/id_rsa
#   ./scripts/install.sh --port 8080

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Defaults
SSH_HOST=""
SSH_KEY=""
PORT="5656"
NO_SERVICE=false

# Parse args
while [[ $# -gt 0 ]]; do
  case $1 in
    --ssh-host) SSH_HOST="$2"; shift 2 ;;
    --ssh-key)  SSH_KEY="$2";  shift 2 ;;
    --port)     PORT="$2";     shift 2 ;;
    --no-service) NO_SERVICE=true; shift ;;
    --help)
      echo "Usage: $0 [options]"
      echo ""
      echo "Options:"
      echo "  --ssh-host HOST    SSH target (e.g. root@10.0.0.1)"
      echo "  --ssh-key PATH     SSH private key path"
      echo "  --port PORT        Local port for the dashboard (default: 5656)"
      echo "  --no-service       Skip systemd/launchd service setup"
      exit 0
      ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# Interactive prompts for missing values
if [[ -z "$SSH_HOST" ]]; then
  read -rp "SSH host (e.g. root@10.0.0.1): " SSH_HOST
fi
if [[ -z "$SSH_KEY" ]]; then
  DEFAULT_KEY="$HOME/.ssh/id_rsa"
  read -rp "SSH key path [$DEFAULT_KEY]: " SSH_KEY
  SSH_KEY="${SSH_KEY:-$DEFAULT_KEY}"
fi

if [[ -z "$SSH_HOST" ]]; then
  echo "Error: SSH host is required"
  exit 1
fi

echo ""
echo "=== Agent Monitor Install ==="
echo "  SSH host: $SSH_HOST"
echo "  SSH key:  $SSH_KEY"
echo "  Port:     $PORT"
echo ""

# 1. Install npm dependencies
echo "[1/4] Installing dependencies..."
cd "$PROJECT_DIR"
if ! command -v npm &>/dev/null; then
  echo "Error: npm is required. Install Node.js 18+ first."
  exit 1
fi
npm install --silent

# 2. Build the frontend
echo "[2/4] Building frontend..."
npm run build

# 3. Deploy helper scripts to remote
echo "[3/4] Deploying helper scripts to remote..."
SSH_CMD="ssh -i $SSH_KEY -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new $SSH_HOST"

$SSH_CMD "mkdir -p /tmp" 2>/dev/null
scp -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new \
  "$SCRIPT_DIR/remote-todos.py" \
  "$SSH_HOST:/tmp/agent-monitor-todos.py" 2>/dev/null
scp -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new \
  "$SCRIPT_DIR/remote-details.py" \
  "$SSH_HOST:/tmp/agent-monitor-details.py" 2>/dev/null

echo "  Helper scripts deployed to /tmp/agent-monitor-*.py on remote"

# 4. Set up service (optional)
if [[ "$NO_SERVICE" == "false" ]]; then
  echo "[4/4] Setting up service..."
  if command -v systemctl &>/dev/null && [[ -d ~/.config/systemd/user ]]; then
    # Linux systemd user service
    UNIT_FILE="$HOME/.config/systemd/user/agent-monitor.service"
    cat > "$UNIT_FILE" << EOF
[Unit]
Description=Agent Monitor - Remote agent session dashboard
After=network.target

[Service]
Type=simple
WorkingDirectory=$PROJECT_DIR
ExecStart=$(which node) $PROJECT_DIR/server.cjs
Environment=AGENT_MONITOR_SSH_HOST=$SSH_HOST
Environment=AGENT_MONITOR_SSH_KEY=$SSH_KEY
Environment=AGENT_MONITOR_PORT=$PORT
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
EOF
    systemctl --user daemon-reload
    systemctl --user enable agent-monitor.service
    systemctl --user start agent-monitor.service
    echo "  systemd service installed and started: agent-monitor.service"
    echo "  Dashboard: http://localhost:$PORT"
    echo "  Manage: systemctl --user {status|stop|restart} agent-monitor"
  elif [[ "$(uname)" == "Darwin" ]] && command -v launchctl &>/dev/null; then
    # macOS launchd
    PLIST_FILE="$HOME/Library/LaunchAgents/com.agent-monitor.plist"
    cat > "$PLIST_FILE" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.agent-monitor</string>
  <key>ProgramArguments</key>
  <array>
    <string>$(which node)</string>
    <string>$PROJECT_DIR/server.cjs</string>
  </array>
  <key>WorkingDirectory</key><string>$PROJECT_DIR</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>AGENT_MONITOR_SSH_HOST</key><string>$SSH_HOST</string>
    <key>AGENT_MONITOR_SSH_KEY</key><string>$SSH_KEY</string>
    <key>AGENT_MONITOR_PORT</key><string>$PORT</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
</dict>
</plist>
EOF
    launchctl load "$PLIST_FILE" 2>/dev/null || true
    echo "  launchd service installed: com.agent-monitor"
    echo "  Dashboard: http://localhost:$PORT"
  else
    echo "  No service manager detected. Run manually:"
    echo "  AGENT_MONITOR_SSH_HOST=$SSH_HOST AGENT_MONITOR_SSH_KEY=$SSH_KEY AGENT_MONITOR_PORT=$PORT npm start"
  fi
else
  echo "[4/4] Skipping service setup (--no-service)"
  echo "  Run manually:"
  echo "  AGENT_MONITOR_SSH_HOST=$SSH_HOST AGENT_MONITOR_SSH_KEY=$SSH_KEY AGENT_MONITOR_PORT=$PORT npm start"
fi

echo ""
echo "=== Install complete ==="
