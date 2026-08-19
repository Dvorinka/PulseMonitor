# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-08-19

### Added

- Real-time activity feed with tool call detection (read, exec, edit, grep, glob, write, todo, MCP)
- Todo list panel with progress bar and per-item status tracking
- Tool call statistics with horizontal bar chart
- Agent reasoning panel showing recent assistant commentary
- System metrics panel (session age, memory, load, disk, threads)
- Git panel (branch, recent commits, working tree changes)
- Status badge with live duration counter
- Noise filtering for wrapper artifacts and internal log noise
- Devin CLI harness support (logs, session database, todos, commentary)
- SSH-based remote data collection with single round-trip per poll
- Cross-platform install scripts (bash for Linux/macOS, PowerShell for Windows)
- Hook script for integration with agent dispatch workflows
- systemd user service support (Linux)
- launchd service support (macOS)
- Environment variable configuration (no hardcoded personal data)
- Vite + React + TypeScript frontend
- Read-only HTTP API (/api/status, /api/todos, /api/details, /api/health)
