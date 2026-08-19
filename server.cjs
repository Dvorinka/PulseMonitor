#!/usr/bin/env node
'use strict';

// pulsemonitor: read-only web dashboard for remote AI agent sessions.
// Connects to a remote machine via SSH, reads agent CLI logs and session
// databases, and presents a real-time dashboard.
//
// Currently supports Devin CLI. Designed to be extensible to other
// harnesses (Claude Code, Codex, etc.) via the harness config system.
//
// Serves the built Vite/React app + API on port 5656.
// In dev mode, run `npm run dev` (Vite on 5656, this server on 5657).

const http = require('http');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Guard against SIGPIPE from piped clients
process.on('uncaughtException', (e) => {
  if (e.code === 'EPIPE') return;
  console.error('Uncaught:', e.message);
});

// ── Config ──────────────────────────────────────────────────────────────────
// All config is via environment variables. No hardcoded personal data.
// See .env.example or README for documentation.

const PORT = process.env.AGENT_MONITOR_PORT || process.env.AGENT_MONITOR_API_PORT || 5656;
const SSH_KEY = process.env.AGENT_MONITOR_SSH_KEY || path.join(process.env.HOME, '.ssh', 'id_rsa');
const SSH_HOST = process.env.AGENT_MONITOR_SSH_HOST || 'localhost';
const REMOTE_REPO = process.env.AGENT_MONITOR_REPO_PATH || null;
const MAX_LOG_LINES = parseInt(process.env.AGENT_MONITOR_MAX_LOG_LINES || '300', 10);

// ── Theme ───────────────────────────────────────────────────────────────────
// Loads a theme preset from themes/<name>.json. The theme controls accent
// colors, logo, and display name. Set AGENT_MONITOR_THEME to switch presets.
// Custom themes can be placed in themes/ and selected by name.

const THEME_NAME = process.env.AGENT_MONITOR_THEME || 'default';
const THEMES_DIR = path.join(__dirname, 'themes');

function loadTheme(name) {
  const themePath = path.join(THEMES_DIR, `${name}.json`);
  try {
    const raw = fs.readFileSync(themePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    console.warn(`Theme "${name}" not found, falling back to default`);
    if (name !== 'default') {
      try {
        return JSON.parse(fs.readFileSync(path.join(THEMES_DIR, 'default.json'), 'utf8'));
      } catch {
        return { name: 'default', displayName: 'PulseMonitor', accent: '#06b6d4', logo: 'radar', logoTitle: 'PULSEMONITOR' };
      }
    }
    return { name: 'default', displayName: 'PulseMonitor', accent: '#06b6d4', logo: 'radar', logoTitle: 'PULSEMONITOR' };
  }
}

// Load user overrides that persist changes made via the web UI.
// Stored in themes/local-overrides.json, merged on top of the base theme.
const OVERRIDES_PATH = path.join(THEMES_DIR, 'local-overrides.json');

function loadOverrides() {
  try {
    return JSON.parse(fs.readFileSync(OVERRIDES_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function saveOverrides(overrides) {
  fs.writeFileSync(OVERRIDES_PATH, JSON.stringify(overrides, null, 2), 'utf8');
}

function mergeTheme(base, overrides) {
  return { ...base, ...overrides };
}

let activeOverrides = loadOverrides();
let THEME = mergeTheme(loadTheme(THEME_NAME), activeOverrides);

function reloadTheme() {
  activeOverrides = loadOverrides();
  THEME = mergeTheme(loadTheme(THEME_NAME), activeOverrides);
}

// ── Harness config ──────────────────────────────────────────────────────────
// Defines how to find and parse logs for each supported agent harness.
// Currently only Devin CLI is supported. To add a harness, add a config
// here and implement the log/DB parsing. See docs/harness-development.md.

const HARNESS_DEVIN = {
  name: 'devin',
  displayName: 'Devin CLI',
  processPattern: 'devin --model',
  logDir: '~/.local/share/devin/cli/logs',
  sessionDbPath: '~/.local/share/devin/cli/sessions.db',
  todoScript: '/tmp/pulsemonitor-todos.py',
  detailsScript: '/tmp/pulsemonitor-details.py',
  // Log line patterns for tool call detection
  toolPatterns: [
    { regex: /Reading file: (.+)/, type: 'read', icon: 'read', label: 'Read' },
    { regex: /Searching for pattern: (.+) in: (.+)/, type: 'grep', icon: 'search', label: 'Grep' },
    { regex: /Searching for files matching pattern: (.+) in (.+)/, type: 'glob', icon: 'glob', label: 'Glob' },
    { regex: /command: "([^"]+)"/, type: 'exec', icon: 'terminal', label: 'Exec' },
    { regex: /Editing file: (.+)/, type: 'edit', icon: 'edit', label: 'Edit' },
    { regex: /Writing to file: (.+)/, type: 'write', icon: 'write', label: 'Write' },
    { regex: /Updated todo list with (\d+) items/, type: 'todo', icon: 'todo', label: 'Todo' },
    { regex: /server="([^"]+)"/, type: 'mcp', icon: 'mcp', label: 'MCP' },
  ],
  // Lifecycle event patterns
  startupPattern: /version=(\S+)/,
  sessionPattern: /Created new session: (\S+)/,
  shutdownPattern: /Session writer shutting down/,
  exportPattern: /Exported conversation to (\S+)/,
  modelPattern: /model_input=(\S+)/,
  // Wrapper noise to filter out (e.g. usage trackers that wrap the CLI)
  wrapperNoise: [
    /devin-track/i,
    /^export\s+PATH=/,
  ],
  // Internal noise to filter from activity feed
  internalNoise: [
    'MessageChain tree duplication',
    'Unexpected stale event',
    'unleash_sampling',
    'Saving session:',
    'Session persisted on first message',
    'Team settings',
    'telemetry_state',
    'handoff',
    'stop token',
    'create_session',
    'sandboxing disabled',
    'shell ready',
    'RawExec session',
    'PTY session',
    'additional_env lock',
    'sandbox_manager lock',
  ],
};

// Active harness (configurable via env, defaults to devin)
const HARNESS = process.env.AGENT_MONITOR_HARNESS === 'devin' || !process.env.AGENT_MONITOR_HARNESS
  ? HARNESS_DEVIN
  : null; // Future: HARNESS_CLAUDE, HARNESS_CODEX, etc.

if (!HARNESS) {
  console.error(`Unknown harness: ${process.env.AGENT_MONITOR_HARNESS}. Supported: devin`);
  process.exit(1);
}

const LOG_DIR = HARNESS.logDir;

// ── SSH helper ──────────────────────────────────────────────────────────────
// Uses SSH ControlMaster for connection reuse. The first call opens a master
// connection; subsequent calls reuse it, avoiding repeated key exchange.
// The control socket is created in /tmp and auto-expires after 30s of idle.

const SSH_CONTROL_PATH = `/tmp/pulsemonitor-ssh-${process.pid}`;
const SSH_BASE_OPTS = [
  '-i', SSH_KEY,
  '-o', 'ConnectTimeout=5',
  '-o', 'StrictHostKeyChecking=no',
  '-o', `ControlPath=${SSH_CONTROL_PATH}`,
  '-o', 'ControlMaster=auto',
  '-o', 'ControlPersist=30',
];

// Ensure the control socket dir exists
try { fs.mkdirSync('/tmp', { recursive: true }); } catch {}

function ssh(cmd) {
  const escaped = cmd.replace(/'/g, "'\\''");
  const opts = SSH_BASE_OPTS.map(o => `"${o}"`).join(' ');
  try {
    return execSync(
      `ssh ${opts} "${SSH_HOST}" '${escaped}'`,
      { encoding: 'utf8', timeout: 15000, maxBuffer: 4 * 1024 * 1024 }
    ).trim();
  } catch {
    return null;
  }
}

// Run multiple SSH commands in a single round-trip using a separator.
// Returns an array of strings, one per command.
function sshBatch(commands) {
  const SEP = '__BATCH_SEP__';
  const combined = commands.join(`; echo ${SEP}; `);
  const raw = ssh(combined);
  if (!raw) return commands.map(() => '');
  return raw.split(SEP).map(s => s.trim());
}

// ── Log parser ──────────────────────────────────────────────────────────────
function parseLogLine(line) {
  const match = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z)\s+(\w+)\s+(.+)$/);
  if (!match) return null;

  const [, ts, level, rest] = match;
  const colonIdx = rest.indexOf(':');
  if (colonIdx === -1) return null;

  const module = rest.slice(0, colonIdx).trim();
  const message = rest.slice(colonIdx + 1).trim();

  let eventType = 'info';
  let detail = message;
  let toolLabel = null;
  let toolIcon = null;
  let filePath = null;

  for (const pat of HARNESS.toolPatterns) {
    const m = message.match(pat.regex);
    if (m) {
      eventType = pat.type;
      toolLabel = pat.label;
      toolIcon = pat.icon;
      if (pat.type === 'read') { detail = m[1]; filePath = m[1]; }
      else if (pat.type === 'grep') detail = `/${m[1]}/ in ${m[2]}`;
      else if (pat.type === 'glob') detail = `${m[1]} in ${m[2]}`;
      else if (pat.type === 'exec') detail = m[1];
      else if (pat.type === 'edit') { detail = m[1]; filePath = m[1]; }
      else if (pat.type === 'write') { detail = m[1]; filePath = m[1]; }
      else if (pat.type === 'todo') detail = `${m[1]} items updated`;
      else if (pat.type === 'mcp') detail = `server: ${m[1]}`;
      break;
    }
  }

  if (message.includes('version=') && message.includes('startup')) {
    eventType = 'startup';
    toolLabel = 'Startup';
    toolIcon = 'startup';
    const ver = message.match(HARNESS.startupPattern);
    detail = ver ? `${HARNESS.displayName} ${ver[1]}` : `${HARNESS.displayName} started`;
  } else if (message.includes('Created new session:')) {
    eventType = 'session';
    toolLabel = 'Session';
    toolIcon = 'session';
    detail = message.match(HARNESS.sessionPattern)?.[1] || message;
  } else if (message.includes('Session writer shutting down')) {
    eventType = 'shutdown';
    toolLabel = 'Shutdown';
    toolIcon = 'shutdown';
    detail = 'Session writer shutting down';
  } else if (message.includes('Exported conversation to')) {
    eventType = 'export';
    toolLabel = 'Export';
    toolIcon = 'export';
    detail = message.match(HARNESS.exportPattern)?.[1] || message;
  } else if (level === 'WARN') {
    eventType = eventType === 'info' ? 'warn' : eventType;
  }

  return { timestamp: ts, level, module, eventType, toolLabel, toolIcon, detail, filePath, raw: message };
}

function isWrapperNoise(parsed) {
  return HARNESS.wrapperNoise.some(pat => {
    if (pat instanceof RegExp) {
      return pat.test(parsed.detail) || pat.test(parsed.raw);
    }
    return parsed.detail.includes(pat) || parsed.raw.includes(pat);
  });
}

function isInternalNoise(parsed) {
  return HARNESS.internalNoise.some(s => parsed.raw.includes(s));
}

function parseLog(logContent) {
  const lines = logContent.split('\n').filter(Boolean);
  const events = [];
  let sessionName = null, startTime = null, endTime = null, model = null, version = null;
  const editedFiles = new Set();

  for (const line of lines) {
    const parsed = parseLogLine(line);
    if (!parsed) continue;

    if (parsed.eventType === 'startup') {
      startTime = parsed.timestamp;
      const ver = parsed.raw.match(HARNESS.startupPattern);
      if (ver) version = ver[1];
    }
    if (parsed.eventType === 'session') sessionName = parsed.detail;
    if (parsed.eventType === 'shutdown' || (parsed.eventType === 'export' && parsed.detail && parsed.detail.includes('/transcripts/'))) endTime = parsed.timestamp;
    if (!model) {
      const m = parsed.raw.match(HARNESS.modelPattern);
      if (m) model = m[1];
    }
    if (parsed.filePath && (parsed.eventType === 'edit' || parsed.eventType === 'write')) {
      editedFiles.add(parsed.filePath);
    }

    const isToolCall = ['read','grep','glob','exec','edit','write','todo','mcp','startup','session','shutdown','export'].includes(parsed.eventType);
    const noise = isWrapperNoise(parsed) || (!isToolCall && isInternalNoise(parsed));

    if (!noise && (parsed.eventType !== 'info' || parsed.level === 'WARN')) {
      events.push(parsed);
    }
  }

  return { events, sessionName, startTime, endTime, model, version, editedFiles: [...editedFiles] };
}

// ── Status collector (single SSH round-trip) ───────────────────────────────
const SEP = '__SEP_XYZ__';

function collectStatus() {
  const procPat = HARNESS.processPattern;
  const repoResolve = REMOTE_REPO
    ? `REPO='${REMOTE_REPO.replace(/'/g, "'\\''")}'`
    : `PID=$(pgrep -f '${procPat}' 2>/dev/null | head -1); REPO=$(readlink /proc/$PID/cwd 2>/dev/null || echo '')`;

  const remoteScript = [
    `pgrep -af '${procPat}' 2>/dev/null | grep -v pgrep | grep -v 'bash -c' || true`,
    // Find latest log: prefer one with a live PID, fall back to most recent file
    `LATEST=''; for f in $(ls -t ${LOG_DIR} 2>/dev/null); do pid=$(echo "$f" | sed -E 's/.*_([0-9]+)\\.log/\\1/'); if [ -d "/proc/$pid" ] 2>/dev/null; then LATEST="$f"; break; fi; done; if [ -z "$LATEST" ]; then LATEST=$(ls -t ${LOG_DIR} 2>/dev/null | head -1); fi; echo "$LATEST"`,
    `LATEST=''; for f in $(ls -t ${LOG_DIR} 2>/dev/null); do pid=$(echo "$f" | sed -E 's/.*_([0-9]+)\\.log/\\1/'); if [ -d "/proc/$pid" ] 2>/dev/null; then LATEST="$f"; break; fi; done; if [ -z "$LATEST" ]; then LATEST=$(ls -t ${LOG_DIR} 2>/dev/null | head -1); fi; if [ -n "$LATEST" ]; then head -n 30 ${LOG_DIR}/$LATEST 2>/dev/null; echo ${SEP}; tail -n ${MAX_LOG_LINES} ${LOG_DIR}/$LATEST 2>/dev/null; fi`,
    `${repoResolve}; cd "$REPO" 2>/dev/null && git branch --show-current 2>/dev/null || echo unknown`,
    `${repoResolve}; cd "$REPO" 2>/dev/null && basename -s .git "$(git remote get-url origin 2>/dev/null)" 2>/dev/null || echo unknown`,
    `${repoResolve}; cd "$REPO" 2>/dev/null && git log --oneline -5 2>/dev/null || echo none`,
    `${repoResolve}; cd "$REPO" 2>/dev/null && git status --short 2>/dev/null | head -20 || echo none`,
    `${repoResolve}; echo "$REPO"`,
  ].join(`; echo ${SEP}; `);

  const raw = ssh(remoteScript);
  if (!raw) {
    return {
      timestamp: new Date().toISOString(),
      status: 'connecting',
      error: 'SSH connection failed',
      host: SSH_HOST,
      harness: HARNESS.name,
      events: [],
      editedFiles: [],
      git: { repo: 'unknown', branch: 'unknown', recentCommits: [], status: [] },
    };
  }

  const parts = raw.split(SEP).map(s => s.trim());
  const pgrepOut = parts[0] || '';
  const latestLog = parts[1] || '';
  const logContent = (parts[2] || '') + '\n' + (parts[3] || '');
  const gitBranch = parts[4] || 'unknown';
  const gitRepo = parts[5] || 'unknown';
  const gitLog = parts[6] || 'none';
  const gitStatus = parts[7] || 'none';
  const resolvedRepoPath = parts[8] || '';

  let isRunning = false, pid = null, cmdLine = null;
  const procLines = pgrepOut.split('\n').filter(l =>
    l.includes(procPat) && !l.includes('pgrep') && !l.includes('bash -c')
  );
  if (procLines.length > 0) {
    isRunning = true;
    const p = procLines[0].split(/\s+/);
    pid = p[0];
    cmdLine = procLines[0];
  }

  const parsed = parseLog(logContent);

  // If the process is gone but no shutdown event was captured in the log
  // (kill, crash, log truncation), synthesize endTime from the last log
  // event timestamp so the duration card freezes instead of counting to now.
  let endTime = parsed.endTime;
  if (!isRunning && parsed.startTime && !endTime) {
    endTime = parsed.events.length > 0
      ? parsed.events[parsed.events.length - 1].timestamp
      : parsed.startTime;
  }

  let status = 'idle';
  if (isRunning && parsed.startTime) status = 'running';
  else if (!isRunning && parsed.startTime) status = 'stopped';
  else if (!isRunning && !parsed.startTime) status = 'connecting';

  let model = parsed.model;
  if (!model && cmdLine) {
    const m = cmdLine.match(/--model\s+(\S+)/);
    if (m) model = m[1];
  }

  let promptFile = null;
  if (cmdLine) {
    const m = cmdLine.match(/--prompt-file\s+(\S+)/);
    if (m) promptFile = m[1];
  }

  const repoPath = resolvedRepoPath || REMOTE_REPO || 'unknown';

  return {
    timestamp: new Date().toISOString(),
    status, pid, cmdLine, model,
    version: parsed.version,
    sessionName: parsed.sessionName,
    startTime: parsed.startTime,
    endTime,
    promptFile,
    logFileName: latestLog,
    host: SSH_HOST,
    harness: HARNESS.name,
    harnessDisplayName: HARNESS.displayName,
    repoPath,
    repoName: gitRepo !== 'unknown' ? gitRepo : 'unknown',
    events: parsed.events,
    editedFiles: parsed.editedFiles,
    git: {
      repo: gitRepo,
      branch: gitBranch,
      recentCommits: gitLog ? gitLog.split('\n').filter(Boolean) : [],
      status: gitStatus ? gitStatus.split('\n').filter(Boolean) : [],
    },
  };
}

// ── Todo extractor (reads remote session DB) ────────────────────────────────
function collectTodos() {
  const raw = ssh(`python3 ${HARNESS.todoScript} 2>/dev/null`);
  if (!raw) return { error: 'SSH failed or script missing' };
  try {
    return JSON.parse(raw.trim());
  } catch {
    return { error: 'parse failed', raw: raw.slice(0, 200) };
  }
}

// ── Details extractor (session metadata, tool stats, commentary, system) ────
function collectDetails() {
  const raw = ssh(`python3 ${HARNESS.detailsScript} 2>/dev/null`);
  if (!raw) return { error: 'SSH failed or script missing' };
  try {
    return JSON.parse(raw.trim());
  } catch {
    return { error: 'parse failed', raw: raw.slice(0, 200) };
  }
}

// ── HTTP server ─────────────────────────────────────────────────────────────
const DIST_DIR = path.join(__dirname, 'dist');
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

const server = http.createServer((req, res) => {
  res.on('error', (e) => { if (e.code !== 'EPIPE') throw e; });

  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === '/api/config') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      theme: THEME,
      harness: HARNESS.name,
      harnessDisplayName: HARNESS.displayName,
    }));
  } else if (url.pathname === '/api/theme' && req.method === 'POST') {
    // Save theme overrides from the web UI settings panel.
    // Accepts partial theme fields and merges them into the overrides file.
    let body = '';
    req.on('data', (chunk) => { body += chunk; if (body.length > 4096) req.destroy(); });
    req.on('end', () => {
      try {
        const updates = JSON.parse(body);
        // Only allow known theme fields
        const allowed = ['displayName', 'accent', 'accentLight', 'accentDim', 'accentGlow', 'accentBorder', 'shadowGlow', 'logo', 'logoTitle'];
        const filtered = {};
        for (const key of allowed) {
          if (key in updates) filtered[key] = updates[key];
        }
        activeOverrides = { ...activeOverrides, ...filtered };
        saveOverrides(activeOverrides);
        THEME = mergeTheme(loadTheme(THEME_NAME), activeOverrides);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, theme: THEME }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
  } else if (url.pathname === '/api/theme/reset' && req.method === 'POST') {
    // Reset theme overrides back to the preset defaults.
    try {
      activeOverrides = {};
      saveOverrides({});
      THEME = mergeTheme(loadTheme(THEME_NAME), {});
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, theme: THEME }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  } else if (url.pathname === '/api/all') {
    // Combined endpoint: fetches status + todos + details in parallel.
    // Uses SSH ControlMaster so all three share one SSH connection.
    // This is the primary endpoint the frontend polls.
    try {
      const [status, todos, details] = [
        collectStatus(),
        collectTodos(),
        collectDetails(),
      ];
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status, todos, details }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  } else if (url.pathname === '/api/status') {
    try {
      const status = collectStatus();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(status));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  } else if (url.pathname === '/api/todos') {
    try {
      const todos = collectTodos();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(todos));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  } else if (url.pathname === '/api/details') {
    try {
      const details = collectDetails();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(details));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  } else if (url.pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, host: SSH_HOST, harness: HARNESS.name }));
  } else {
    // Serve static files from dist/
    let filePath = url.pathname === '/' ? '/index.html' : url.pathname;
    const fullPath = path.join(DIST_DIR, filePath);

    // Prevent path traversal
    if (!fullPath.startsWith(DIST_DIR)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    try {
      const content = fs.readFileSync(fullPath);
      const ext = path.extname(fullPath);
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
      res.end(content);
    } catch {
      // SPA fallback
      try {
        const html = fs.readFileSync(path.join(DIST_DIR, 'index.html'), 'utf8');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
      } catch {
        res.writeHead(404);
        res.end('Not found. Run "npm run build" first.');
      }
    }
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`PulseMonitor - http://localhost:${PORT}`);
  console.log(`Theme: ${THEME.name} (${THEME.displayName})`);
  console.log(`Harness: ${HARNESS.displayName}`);
  console.log(`SSH target: ${SSH_HOST} (key: ${SSH_KEY})`);
  console.log(`Remote repo: ${REMOTE_REPO || 'auto-detect from agent process CWD'}`);
  if (PORT === 5657) console.log('API-only mode (Vite dev server on 5656)');
});
