import { useState, useEffect, useCallback } from 'react'
import './App.css'

// ── Types ───────────────────────────────────────────────────────────────────
interface LogEvent {
  timestamp: string
  level: string
  module: string
  eventType: string
  toolLabel: string | null
  toolIcon: string | null
  detail: string
  filePath: string | null
  raw: string
}

interface GitInfo {
  repo: string
  branch: string
  recentCommits: string[]
  status: string[]
}

interface TodoItem {
  index: number
  status: 'completed' | 'in_progress' | 'pending'
  content: string
}

interface TodosResponse {
  sessionId?: string
  todos?: TodoItem[]
  error?: string
}

interface CommentaryItem {
  nodeId: number
  text: string
}

interface DetailsResponse {
  sessionId?: string
  model?: string
  agentMode?: string
  ageSeconds?: number
  totalNodes?: number
  toolCalls?: Record<string, number>
  commentary?: CommentaryItem[]
  recentToolResults?: CommentaryItem[]
  system?: {
    pid?: number
    cpu_ticks?: number
    rss_kb?: number
    vsize_kb?: number
    threads?: number
    load_1?: number
    load_5?: number
    load_15?: number
    mem_total_kb?: number
    mem_avail_kb?: number
    repo_disk?: string
  }
  error?: string
}

interface StatusResponse {
  timestamp: string
  status: 'running' | 'stopped' | 'connecting' | 'idle'
  pid: string | null
  cmdLine: string | null
  model: string | null
  version: string | null
  sessionName: string | null
  startTime: string | null
  endTime: string | null
  promptFile: string | null
  logFileName: string | null
  host: string
  harness: string
  harnessDisplayName: string
  repoPath: string
  repoName: string
  events: LogEvent[]
  editedFiles: string[]
  git: GitInfo
  error?: string
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function MonitorLogo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label="Agent Monitor">
      <path d="M12 2 L12 6" />
      <path d="M12 18 L12 22" />
      <path d="M4.93 4.93 L7.76 7.76" />
      <path d="M16.24 16.24 L19.07 19.07" />
      <path d="M2 12 L6 12" />
      <path d="M18 12 L22 12" />
      <path d="M4.93 19.07 L7.76 16.24" />
      <path d="M16.24 7.76 L19.07 4.93" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function fmtTime(ts: string | null): string {
  if (!ts) return '--:--:--'
  try {
    const d = new Date(ts)
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch { return ts }
}

function fmtDuration(start: string | null, end: string | null): string {
  if (!start) return '--'
  const startMs = new Date(start).getTime()
  const endMs = end ? new Date(end).getTime() : Date.now()
  const diff = Math.max(0, endMs - startMs)
  const h = Math.floor(diff / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  const s = Math.floor((diff % 60000) / 1000)
  const pad = (n: number) => n.toString().padStart(2, '0')
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`
  return `${pad(m)}:${pad(s)}`
}

function fmtAge(s: number): string {
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${s % 60}s`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

function fmtMem(kb: number): string {
  if (kb > 1048576) return `${(kb / 1048576).toFixed(1)} GB`
  if (kb > 1024) return `${(kb / 1024).toFixed(0)} MB`
  return `${kb} KB`
}

// ── Tool metadata ───────────────────────────────────────────────────────────
const TOOL_META: Record<string, { color: string; label: string; tag: string }> = {
  read:      { color: '#3b82f6', label: 'Read',      tag: 'READ' },
  grep:      { color: '#8b5cf6', label: 'Grep',      tag: 'SRCH' },
  glob:      { color: '#8b5cf6', label: 'Glob',      tag: 'GLOB' },
  terminal:  { color: '#10b981', label: 'Exec',      tag: 'EXEC' },
  exec:      { color: '#10b981', label: 'Exec',      tag: 'EXEC' },
  edit:      { color: '#e8700f', label: 'Edit',      tag: 'EDIT' },
  write:     { color: '#e8700f', label: 'Write',     tag: 'WRITE' },
  todo:      { color: '#ef4444', label: 'Todo',      tag: 'TODO' },
  mcp:       { color: '#b67dea', label: 'MCP',       tag: 'MCP'  },
  startup:   { color: '#e8700f', label: 'Startup',   tag: 'INIT' },
  session:   { color: '#3b82f6', label: 'Session',   tag: 'SESS' },
  shutdown:  { color: '#ef4444', label: 'Shutdown',  tag: 'STOP' },
  export:    { color: '#ef4444', label: 'Export',    tag: 'DONE' },
  warn:      { color: '#f59e0b', label: 'Warning',   tag: 'WARN' },
  info:      { color: '#666666', label: 'Info',      tag: 'INFO' },
}

function getToolMeta(icon: string | null, eventType: string, level: string) {
  const key = icon || eventType || (level === 'WARN' ? 'warn' : 'info')
  return TOOL_META[key] || TOOL_META.info
}

const TOOL_COLORS: Record<string, string> = {
  exec: '#10b981', read: '#3b82f6', grep: '#8b5cf6', glob: '#8b5cf6',
  edit: '#e8700f', write: '#e8700f', todo_write: '#ef4444',
  mcp: '#b67dea', skill: '#f59e0b', run_subagent: '#06b6d4',
  get_output: '#10b981', read_subagent: '#3b82f6', find_file_by_name: '#8b5cf6',
}

// ── Components ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const labels: Record<string, string> = {
    running: 'RUNNING',
    stopped: 'STOPPED',
    connecting: 'CONNECTING',
    idle: 'IDLE',
  }
  return (
    <div className={`status-badge status-${status}`}>
      <span className="status-dot" />
      <span className="status-text">{labels[status] || status.toUpperCase()}</span>
    </div>
  )
}

function StatRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="stat-row">
      <span className="stat-label">{label}</span>
      <span className={`stat-value ${mono ? 'mono' : ''}`}>{value}</span>
    </div>
  )
}

function DurationCard({ start, end, status }: { start: string | null; end: string | null; status: string }) {
  const [duration, setDuration] = useState(fmtDuration(start, end))

  useEffect(() => {
    setDuration(fmtDuration(start, end))
    if (status === 'running' && start) {
      const interval = setInterval(() => setDuration(fmtDuration(start, end)), 1000)
      return () => clearInterval(interval)
    }
  }, [start, end, status])

  return (
    <div className={`duration-card ${status === 'stopped' ? 'stopped' : ''} ${status === 'running' ? 'running' : ''}`}>
      <div className="duration-label">DURATION</div>
      <div className="duration-value">{duration}</div>
    </div>
  )
}

function GitPanel({ git }: { git: GitInfo }) {
  if (!git || (git.branch === 'unknown' && git.recentCommits.length === 0 && git.repo === 'unknown')) return null

  const commits = git.recentCommits.filter(c => c && c !== 'none').slice(0, 3)
  const changes = git.status.filter(s => s && s !== 'none')

  return (
    <div className="git-panel">
      <div className="panel-title">REPOSITORY</div>
      {git.repo && git.repo !== 'unknown' && (
        <div className="git-repo-name">{git.repo}</div>
      )}
      <div className="git-branch">
        <span className="git-branch-mark" />
        <span className="git-branch-name">{git.branch}</span>
      </div>
      {commits.length > 0 && (
        <div className="git-commits">
          {commits.map((c, i) => {
            const parts = c.split(' ')
            const hash = parts[0]
            const msg = parts.slice(1).join(' ')
            return (
              <div key={i} className="git-commit">
                <span className="git-hash">{hash}</span>
                <span className="git-msg">{msg}</span>
              </div>
            )
          })}
        </div>
      )}
      {changes.length > 0 && (
        <div className="git-changes">
          <div className="git-changes-label">WORKING TREE / {changes.length} modified</div>
          <div className="git-status-list">
            {changes.slice(0, 8).map((s, i) => (
              <div key={i} className="git-status-line">
                <span className="git-status-flag">{s.charAt(0).trim() || 'M'}</span>
                <span className="git-status-path">{s.slice(1).trim()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ActivityBubble({ event }: { event: LogEvent }) {
  const meta = getToolMeta(event.toolIcon, event.eventType, event.level)

  return (
    <div className="bubble">
      <div className="bubble-tag" style={{ color: meta.color, borderColor: `${meta.color}40` }}>
        {meta.tag}
      </div>
      <div className="bubble-body">
        <div className="bubble-header">
          <span className="bubble-label" style={{ color: meta.color }}>{meta.label}</span>
          <span className="bubble-time">{fmtTime(event.timestamp)}</span>
        </div>
        <div className="bubble-detail">
          {event.detail}
        </div>
      </div>
    </div>
  )
}

function TodoPanel() {
  const [todos, setTodos] = useState<TodoItem[] | null>(null)
  const [todoError, setTodoError] = useState(false)

  useEffect(() => {
    let cancelled = false
    const fetchTodos = async () => {
      try {
        const res = await fetch('/api/todos')
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data: TodosResponse = await res.json()
        if (cancelled) return
        if (data.error) {
          setTodoError(true)
          setTodos(null)
        } else {
          setTodoError(false)
          setTodos(data.todos ?? [])
        }
      } catch {
        if (!cancelled) { setTodoError(true); setTodos(null) }
      }
    }
    fetchTodos()
    const interval = setInterval(fetchTodos, 5000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [])

  if (todoError || !todos || todos.length === 0) return null

  const done = todos.filter(t => t.status === 'completed').length
  const total = todos.length
  const pct = total > 0 ? Math.round((done / total) * 100) : 0

  return (
    <div className="todo-panel">
      <div className="panel-title">TODO LIST <span className="todo-count">{done}/{total}</span></div>
      <div className="todo-progress">
        <div className="todo-progress-bar" style={{ width: `${pct}%` }} />
      </div>
      <div className="todo-list">
        {todos.map((t) => (
          <div key={t.index} className={`todo-item todo-${t.status}`}>
            <span className="todo-check">
              {t.status === 'completed' ? '\u2713' : t.status === 'in_progress' ? '\u25CB' : '\u25CB'}
            </span>
            <span className="todo-text">{t.content}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ToolStatsPanel() {
  const [details, setDetails] = useState<DetailsResponse | null>(null)

  useEffect(() => {
    let cancelled = false
    const fetchDetails = async () => {
      try {
        const res = await fetch('/api/details')
        if (!res.ok) return
        const data: DetailsResponse = await res.json()
        if (!cancelled && !data.error) setDetails(data)
      } catch { /* ignore */ }
    }
    fetchDetails()
    const interval = setInterval(fetchDetails, 5000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [])

  if (!details || !details.toolCalls) return null
  const tools = details.toolCalls
  const total = Object.values(tools).reduce((a, b) => a + b, 0)
  if (total === 0) return null

  const sorted = Object.entries(tools).sort((a, b) => b[1] - a[1])
  const maxVal = sorted[0]?.[1] || 1

  return (
    <div className="tool-stats-panel">
      <div className="panel-title">TOOL CALLS <span className="todo-count">{total}</span></div>
      <div className="tool-stats-list">
        {sorted.map(([name, count]) => (
          <div key={name} className="tool-stat-row">
            <span className="tool-stat-name">{name}</span>
            <div className="tool-stat-bar-wrap">
              <div className="tool-stat-bar" style={{ width: `${(count / maxVal) * 100}%`, background: TOOL_COLORS[name] || '#666' }} />
            </div>
            <span className="tool-stat-count">{count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function SystemPanel() {
  const [details, setDetails] = useState<DetailsResponse | null>(null)

  useEffect(() => {
    let cancelled = false
    const fetchDetails = async () => {
      try {
        const res = await fetch('/api/details')
        if (!res.ok) return
        const data: DetailsResponse = await res.json()
        if (!cancelled && !data.error) setDetails(data)
      } catch { /* ignore */ }
    }
    fetchDetails()
    const interval = setInterval(fetchDetails, 5000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [])

  if (!details || !details.system) return null
  const sys = details.system
  const memPct = sys.mem_total_kb && sys.mem_avail_kb
    ? Math.round(((sys.mem_total_kb - sys.mem_avail_kb) / sys.mem_total_kb) * 100)
    : null

  return (
    <div className="system-panel">
      <div className="panel-title">SYSTEM</div>
      <div className="stat-list">
        {details.ageSeconds != null && <StatRow label="Session age" value={fmtAge(details.ageSeconds)} mono />}
        {details.totalNodes != null && <StatRow label="Messages" value={String(details.totalNodes)} mono />}
        {sys.rss_kb && <StatRow label="Memory" value={fmtMem(sys.rss_kb)} mono />}
        {sys.threads && <StatRow label="Threads" value={String(sys.threads)} mono />}
        {sys.load_1 != null && <StatRow label="Load (1m)" value={sys.load_1.toFixed(2)} mono />}
        {memPct != null && <StatRow label="RAM used" value={`${memPct}%`} mono />}
        {sys.repo_disk && <StatRow label="Repo disk" value={sys.repo_disk} mono />}
      </div>
    </div>
  )
}

function CommentaryPanel() {
  const [details, setDetails] = useState<DetailsResponse | null>(null)

  useEffect(() => {
    let cancelled = false
    const fetchDetails = async () => {
      try {
        const res = await fetch('/api/details')
        if (!res.ok) return
        const data: DetailsResponse = await res.json()
        if (!cancelled && !data.error) setDetails(data)
      } catch { /* ignore */ }
    }
    fetchDetails()
    const interval = setInterval(fetchDetails, 5000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [])

  if (!details || !details.commentary || details.commentary.length === 0) return null

  return (
    <div className="commentary-panel">
      <div className="panel-title">AGENT REASONING</div>
      <div className="commentary-list">
        {details.commentary.slice(0, 4).map((c) => (
          <div key={c.nodeId} className="commentary-item">
            {c.text}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main App ────────────────────────────────────────────────────────────────
export default function App() {
  const [status, setStatus] = useState<StatusResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const poll = useCallback(async () => {
    try {
      const res = await fetch('/api/status')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setStatus(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    }
  }, [])

  useEffect(() => {
    poll()
    const interval = setInterval(poll, 4000)
    return () => clearInterval(interval)
  }, [poll])

  if (!status) {
    return (
      <div className="app-loading">
        <div className="loading-spinner" />
        <div className="loading-text">Connecting to remote agent...</div>
      </div>
    )
  }

  const events = [...status.events].reverse()

  return (
    <div className="app">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="logo">
            <div className="logo-icon"><MonitorLogo size={28} /></div>
            <div className="logo-text">
              <div className="logo-title">AGENT MONITOR</div>
              <div className="logo-subtitle">{status.harnessDisplayName || status.harness}</div>
            </div>
          </div>
        </div>

        <div className="sidebar-status">
          <StatusBadge status={status.status} />
        </div>

        <div className="sidebar-stats">
          <DurationCard start={status.startTime} end={status.endTime} status={status.status} />
          <div className="stat-list">
            <StatRow label="Session" value={status.sessionName || '--'} mono />
            <StatRow label="Model" value={status.model || '--'} />
            <StatRow label="Started" value={fmtTime(status.startTime)} mono />
            <StatRow label="PID" value={status.pid || '--'} mono />
            <StatRow label="Version" value={status.version || '--'} mono />
          </div>
        </div>

        <GitPanel git={status.git} />

        <TodoPanel />

        <ToolStatsPanel />

        <SystemPanel />

        <div className="sidebar-footer">
          <div className="footer-label">REMOTE TARGET</div>
          <div className="footer-host">{status.host}</div>
          <div className="footer-repo">{status.repoName !== 'unknown' ? status.repoName : status.repoPath}</div>
        </div>
      </aside>

      {/* Main content */}
      <main className="main">
        {error && <div className="error-banner">Connection error: {error}</div>}

        <div className="main-header">
          <div className="main-title-group">
            <h1 className="main-title">Activity Feed</h1>
            <span className="main-session">{status.sessionName || '--'}</span>
          </div>
          <span className="main-meta">{events.length} events</span>
        </div>

        <CommentaryPanel />

        <div className="feed">
          {events.length === 0 ? (
            <div className="empty-state">
              <div className="empty-circle" />
              <div className="empty-text">No activity yet</div>
            </div>
          ) : (
            events.map((ev, i) => (
              <ActivityBubble key={i} event={ev} />
            ))
          )}
        </div>
      </main>
    </div>
  )
}
