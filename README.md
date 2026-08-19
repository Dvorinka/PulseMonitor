# Agent Monitor

Real-time web dashboard for monitoring remote AI agent sessions over SSH.

Agent Monitor connects to a remote machine where your AI coding agent runs, reads its logs and session database, and presents a live dashboard with activity feed, todo tracking, tool call statistics, agent reasoning, and system metrics.

## Screenshots

![Dashboard - Running](docs/screenshots/dashboard-running.png)
![Dashboard - Sidebar](docs/screenshots/dashboard-sidebar.png)
![Dashboard - Todo List](docs/screenshots/dashboard-todos.png)

> Screenshots are in `docs/screenshots/`. Run the monitor and capture your own with `scripts/screenshot.sh`.

## Features

- **Activity Feed** - Real-time stream of tool calls (read, exec, edit, grep, etc.) with timestamps and color-coded tags
- **Todo List** - Live todo list extracted from the agent's session database, with progress bar and per-item status
- **Tool Call Statistics** - Horizontal bar chart showing the distribution of tool calls (read, grep, exec, edit, etc.)
- **Agent Reasoning** - Recent assistant commentary messages showing what the agent is thinking and doing
- **System Metrics** - Session age, message count, process memory, thread count, system load, RAM usage, repo disk size
- **Git Panel** - Current branch, recent commits, working tree changes on the remote repo
- **Status Badge** - Running, stopped, connecting, or idle state with live duration counter
- **Noise Filtering** - Filters out wrapper artifacts (usage trackers) and internal noise from the activity feed

## Supported Harnesses

| Harness | Status | Notes |
|---------|--------|-------|
| Devin CLI | Supported | Full support: logs, session DB, todos, commentary, tool stats |
| Claude Code | Planned | See [Roadmap](#roadmap) |
| Codex | Planned | See [Roadmap](#roadmap) |
| OpenCode | Planned | See [Roadmap](#roadmap) |

To add a harness, see [docs/harness-development.md](docs/harness-development.md).

## Quick Start

### Prerequisites

- Node.js 18 or later
- SSH access to a remote machine running an AI agent CLI
- The agent CLI must write logs to a known directory and/or a session database

### Install

**Linux / macOS:**

```bash
git clone https://github.com/Dvorinka/agent-monitor.git
cd agent-monitor
chmod +x scripts/install.sh
./scripts/install.sh
```

**Windows (PowerShell):**

```powershell
git clone https://github.com/Dvorinka/agent-monitor.git
cd agent-monitor
.\scripts\install.ps1
```

The install script will:
1. Install npm dependencies
2. Build the frontend
3. Deploy helper scripts to the remote machine
4. Set up a systemd (Linux) or launchd (macOS) service, or print instructions for manual start

### Manual Start

```bash
npm install
npm run build
AGENT_MONITOR_SSH_HOST=root@server AGENT_MONITOR_SSH_KEY=~/.ssh/id_rsa npm start
```

Then open http://localhost:5656 in your browser.

### Development

```bash
npm install
npm run dev
```

This starts Vite (frontend) on port 5656 and the API server on port 5657. The Vite dev server proxies `/api` requests to the API server.

## Configuration

All configuration is via environment variables. Copy `.env.example` to `.env` and fill in your values, or set them inline.

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_MONITOR_SSH_HOST` | `localhost` | SSH target (e.g. `root@10.0.0.1`) |
| `AGENT_MONITOR_SSH_KEY` | `~/.ssh/id_rsa` | SSH private key path |
| `AGENT_MONITOR_PORT` | `5656` | Local port for the dashboard |
| `AGENT_MONITOR_REPO_PATH` | auto-detect | Remote repo path (auto-detected from agent process CWD if not set) |
| `AGENT_MONITOR_HARNESS` | `devin` | Agent harness to monitor |
| `AGENT_MONITOR_THEME` | `default` | Theme preset (`default`, `proxmox`, or custom) |
| `AGENT_MONITOR_MAX_LOG_LINES` | `300` | Max log lines to fetch per poll |

## Themes

Agent Monitor supports theme presets for customization. Themes control the accent color, logo, and display name.

### Built-in Themes

| Theme | Accent | Logo | Description |
|-------|--------|------|-------------|
| `default` | Cyan (#06b6d4) | Radar/scope | Clean, generic monitoring look |
| `proxmox` | Orange (#e8700f) | Proxmox | Proxmox-branded monitoring |

### Custom Themes

Create a JSON file in `themes/` with any name:

```json
{
  "name": "mytheme",
  "displayName": "My Dashboard",
  "accent": "#8b5cf6",
  "accentLight": "#a78bfa",
  "accentDim": "#7c3aed",
  "accentGlow": "rgba(139, 92, 246, 0.12)",
  "accentBorder": "rgba(139, 92, 246, 0.25)",
  "shadowGlow": "0 0 24px rgba(139, 92, 246, 0.12)",
  "logo": "radar",
  "logoTitle": "MY MONITOR"
}
```

Set `AGENT_MONITOR_THEME=mytheme` to activate it.

The `logo` field accepts `"radar"` (default) or `"proxmox"`. To add a custom logo, extend the `ThemeLogo` component in `src/App.tsx`.

## Hook Script

For easy integration with your agent dispatch workflow, source the hook script:

```bash
source /path/to/agent-monitor/scripts/hook.sh

# Start the monitor before dispatching an agent task
agent_monitor_start "root@server" "~/.ssh/my-key" "/root/my-repo"

# ... dispatch your agent task ...

# Stop the monitor when done
agent_monitor_stop
```

Commands:
- `agent_monitor_start [host] [key] [repo]` - Start the monitor in the background
- `agent_monitor_stop` - Stop the running monitor
- `agent_monitor_status` - Check if the monitor is running

## API

The monitor exposes a simple HTTP API:

| Endpoint | Description |
|----------|-------------|
| `GET /api/status` | Session status, activity feed, git info |
| `GET /api/todos` | Todo list from the agent's session database |
| `GET /api/details` | Tool call stats, agent commentary, system metrics |
| `GET /api/health` | Health check |

All endpoints return JSON. The API is read-only - it only reads data from the remote machine, never writes.

## How It Works

```
Browser (React) <--HTTP/4s poll--> API Server (Node.js) <--SSH/20s timeout--> Remote Machine
                                      |                                      |
                                      |                                      +-- Agent CLI logs
                                      |                                      +-- Session database (SQLite)
                                      |                                      +-- /proc metrics
                                      |                                      +-- Git repo state
                                      |
                                      +-- Parses logs into events
                                      +-- Queries session DB for todos/commentary
                                      +-- Returns JSON to frontend
```

The API server makes a single SSH round-trip per poll to collect all data, minimizing latency and SSH connection overhead. The frontend polls every 4 seconds.

## Roadmap

- [ ] **Claude Code harness** - Parse Claude Code's log format and session storage
- [ ] **Codex harness** - Parse OpenAI Codex CLI logs
- [ ] **OpenCode harness** - Parse OpenCode logs
- [ ] **WebSocket streaming** - Replace polling with real-time SSH log tail
- [ ] **Multi-session view** - Monitor multiple agent sessions simultaneously
- [ ] **Token usage tracking** - Display token consumption and cost estimates
- [ ] **Notification system** - Desktop notifications on session completion or errors
- [ ] **Dark/light theme toggle** - Currently dark-only

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT - See [LICENSE](LICENSE).
