# TODO - Multi-Harness Support

This file tracks the work needed to support multiple agent harnesses beyond Devin CLI.

## Current State

Only Devin CLI is supported. The harness config system in `server.cjs` is designed to be extensible, but only `HARNESS_DEVIN` is implemented.

## Harnesses to Support

### Claude Code (`@anthropic-ai/claude-code`)

- [ ] Find log directory and format
- [ ] Find session storage (file-based or SQLite?)
- [ ] Determine process detection pattern (`pgrep -f 'claude'`)
- [ ] Write `remote-todos.py` equivalent (if Claude Code has a todo system)
- [ ] Write `remote-details.py` equivalent
- [ ] Add `HARNESS_CLAUDE` config to `server.cjs`
- [ ] Update install script to deploy harness-specific helper scripts
- [ ] Test end-to-end with a running Claude Code session

### Codex (OpenAI Codex CLI)

- [ ] Find log directory and format
- [ ] Find session storage
- [ ] Determine process detection pattern
- [ ] Write helper scripts
- [ ] Add `HARNESS_CODEX` config
- [ ] Test end-to-end

### OpenCode

- [ ] Find log directory and format
- [ ] Find session storage
- [ ] Determine process detection pattern
- [ ] Write helper scripts
- [ ] Add `HARNESS_OPENCODE` config
- [ ] Test end-to-end

## Implementation Notes

- Each harness needs a config object in `server.cjs` with the shape documented in `docs/harness-development.md`
- The `AGENT_MONITOR_HARNESS` env var selects the active harness
- Helper scripts (todos, details) are harness-specific and deployed to `/tmp/` on the remote
- The install script should detect which harnesses are available on the remote and deploy the right scripts
- Consider auto-detection: if `devin --model` is running, use Devin harness; if `claude` is running, use Claude harness

## Priority

1. Claude Code (most popular alternative to Devin CLI)
2. Codex (OpenAI's CLI)
3. OpenCode

## Not Started

This is a planning document. No implementation work has been done on multi-harness support yet. The current Devin CLI support is complete and tested.
