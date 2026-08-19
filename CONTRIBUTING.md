# Contributing to PulseMonitor

Thank you for your interest in contributing.

## Development Setup

```bash
git clone https://github.com/Dvorinka/pulsemonitor.git
cd pulsemonitor
npm install
npm run dev
```

This starts Vite on port 5656 and the API server on port 5657.

## Architecture

- `server.cjs` - Node.js HTTP server. Makes SSH calls to the remote machine, parses logs, queries the session database, serves the built frontend.
- `src/App.tsx` - React frontend. Single-file app with all components.
- `src/App.css` - All styles. CSS custom properties for theming.
- `scripts/remote-todos.py` - Deployed to the remote. Extracts todos from the agent's session database.
- `scripts/remote-details.py` - Deployed to the remote. Extracts tool call stats, commentary, and system metrics.

## Adding a Harness

To support a new agent CLI, you need to:

1. Add a harness config object in `server.cjs` (see `HARNESS_DEVIN` for the shape)
2. Write a `remote-todos.py` equivalent if the harness has a todo system
3. Write a `remote-details.py` equivalent if the harness has a session database
4. Update the install script to deploy the new helper scripts
5. Add the harness to the supported table in README.md

See `docs/harness-development.md` for detailed guidance.

## Code Style

- No em dashes in user-visible text. Use standard hyphens.
- No emojis in code or UI.
- Conventional Commits for all commits.
- Keep `App.tsx` as a single file - do not split into multiple component files unless it becomes unwarrantably large.
- CSS custom properties for all colors, spacing, and typography.

## Pull Requests

1. Fork the repo and create a branch from `main`
2. Run `npm run build` to verify the frontend compiles
3. Run `npm run lint` to check for lint errors
4. Write a clear PR description explaining what and why
5. One concern per PR

## Reporting Bugs

Open an issue with:
- What you expected
- What actually happened
- Your config (SSH host, harness, OS) - redact personal info
- Browser console errors if applicable
