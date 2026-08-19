# Harness Development Guide

PulseMonitor is designed to support multiple AI agent CLIs. This guide explains how to add support for a new harness.

## What is a Harness?

A harness is an AI agent CLI that runs on a remote machine. PulseMonitor reads its logs and session data to present a dashboard. Each harness has its own log format, session storage, and process detection method.

## Harness Config Shape

In `server.cjs`, each harness is defined as a config object:

```javascript
const HARNESS_MYAGENT = {
  name: 'myagent',
  displayName: 'My Agent CLI',
  processPattern: 'myagent --model',  // pgrep pattern to find the running process
  logDir: '~/.local/share/myagent/logs',  // where logs are stored
  sessionDbPath: '~/.local/share/myagent/sessions.db',  // session database (if any)
  todoScript: '/tmp/pulsemonitor-todos.py',  // deployed helper script
  detailsScript: '/tmp/pulsemonitor-details.py',

  // Log line patterns for tool call detection
  toolPatterns: [
    { regex: /Reading file: (.+)/, type: 'read', icon: 'read', label: 'Read' },
    // ... add patterns matching your agent's log format
  ],

  // Lifecycle event patterns
  startupPattern: /version=(\S+)/,
  sessionPattern: /Created new session: (\S+)/,
  shutdownPattern: /Session shutting down/,
  exportPattern: /Exported conversation to (\S+)/,
  modelPattern: /model=(\S+)/,

  // Wrapper noise to filter (e.g. usage trackers that wrap the CLI)
  wrapperNoise: [
    /my-wrapper/i,
    /^export\s+PATH=/,
  ],

  // Internal noise to filter from activity feed
  internalNoise: [
    'Saving session',
    'telemetry',
    // ... add strings that appear in your agent's internal log noise
  ],
};
```

## Helper Scripts

### remote-todos.py

If your agent has a todo system, write a Python script that:

1. Connects to the agent's session database (or reads from wherever todos are stored)
2. Finds the most recently active session
3. Extracts the latest todo list
4. Prints JSON in this shape:

```json
{
  "sessionId": "session-name",
  "todos": [
    {"index": 1, "status": "completed", "content": "Task name"},
    {"index": 2, "status": "in_progress", "content": "Another task"}
  ]
}
```

Status values: `completed`, `in_progress`, `pending`.

If your agent has no todo system, return `{"error": "no todos"}`.

### remote-details.py

Write a Python script that:

1. Connects to the session database
2. Extracts: session metadata, tool call distribution, recent agent commentary, system metrics
3. Prints JSON in this shape:

```json
{
  "sessionId": "session-name",
  "model": "model-name",
  "agentMode": "bypass",
  "ageSeconds": 300,
  "totalNodes": 150,
  "toolCalls": {"exec": 20, "read": 50, "grep": 30},
  "commentary": [{"nodeId": 42, "text": "Analyzing the codebase..."}],
  "recentToolResults": [{"nodeId": 43, "text": "Output from command..."}],
  "system": {
    "pid": 12345,
    "rss_kb": 16000,
    "load_1": 1.5,
    "mem_total_kb": 16000000,
    "mem_avail_kb": 8000000,
    "repo_disk": "3.6G"
  }
}
```

System metrics are read from `/proc` (Linux). If the remote is macOS, adapt to use `sysctl` or `ps` instead.

## Testing Your Harness

1. Add the harness config to `server.cjs`
2. Set `AGENT_MONITOR_HARNESS=myagent` in your environment
3. Run `npm run dev`
4. Start an agent task on the remote machine
5. Verify the dashboard shows activity, todos, and metrics correctly

## Deploying Helper Scripts

The install script (`scripts/install.sh`) deploys helper scripts to the remote via `scp`. Update it to deploy your harness's scripts to the correct paths.

Alternatively, manually deploy:

```bash
scp -i ~/.ssh/key scripts/remote-todos.py root@server:/tmp/pulsemonitor-todos.py
scp -i ~/.ssh/key scripts/remote-details.py root@server:/tmp/pulsemonitor-details.py
```
