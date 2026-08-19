# PulseMonitor

Real-time web dashboard for monitoring remote AI agent sessions over SSH.

## What This Is

PulseMonitor connects to a remote machine via SSH, reads the logs and session database of an AI agent CLI running there, and presents a live dashboard. Currently supports Devin CLI. Designed to be extensible to other harnesses.

## Build / Test

```bash
npm install
npm run build    # Build frontend
npm run dev      # Dev mode (Vite + API server)
npm run lint     # Lint
npm start        # Production start (requires build first)
```

## Architecture

- `server.cjs` - Node.js HTTP server. SSH to remote, parse logs, query session DB, serve frontend.
- `src/App.tsx` - React frontend (single file, all components).
- `src/App.css` - All styles via CSS custom properties.
- `scripts/remote-todos.py` - Deployed to remote. Extracts todos from session DB.
- `scripts/remote-details.py` - Deployed to remote. Extracts tool stats, commentary, system metrics.
- `scripts/install.sh` - Linux/macOS install script.
- `scripts/install.ps1` - Windows install script.
- `scripts/hook.sh` - Source-able hook for dispatch workflows.

## Configuration

All via environment variables. See `.env.example`. No hardcoded personal data.

## Conventions

- Conventional Commits for all commits and PR titles.
- No em dashes in user-visible text. Use standard hyphens.
- No emojis in code or UI.
- Keep `App.tsx` as a single file.
- CSS custom properties for all theming.
