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

interface ThemeConfig {
  name: string
  displayName: string
  accent: string
  accentLight?: string
  accentDim?: string
  accentGlow?: string
  accentBorder?: string
  shadowGlow?: string
  logo: string
  logoTitle: string
}

interface ConfigResponse {
  theme: ThemeConfig
  harness: string
  harnessDisplayName: string
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
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label="PulseMonitor">
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

function ProxmoxLogo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" role="img" aria-label="Proxmox">
      <path d="M4.928 1.825c-1.09.553-1.09.64-.07 1.78 5.655 6.295 7.004 7.782 7.107 7.782.139.017 7.971-8.542 8.058-8.801.034-.07-.208-.312-.519-.536-.415-.312-.864-.433-1.712-.467-1.59-.104-2.144.242-4.115 2.455-.899 1.003-1.66 1.833-1.66 1.833-.017 0-.76-.813-1.642-1.798S8.473 2.1 8.127 1.91c-.796-.45-2.421-.484-3.2-.086zM1.297 4.367C.45 4.695 0 5.007 0 5.248c0 .121 1.331 1.678 2.94 3.459 1.625 1.78 2.939 3.268 2.939 3.302 0 .035-1.331 1.522-2.94 3.303C1.314 17.11.017 18.683.035 18.822c.086.467 1.504 1.055 2.541 1.055 1.678-.018 2.058-.312 5.603-4.202 1.78-1.954 3.233-3.614 3.233-3.666 0-.069-1.435-1.694-3.199-3.63-2.3-2.508-3.423-3.632-3.96-3.874-.812-.398-2.126-.467-2.956-.138zm18.467.12c-.502.26-1.764 1.505-3.943 3.891-1.763 1.937-3.199 3.562-3.199 3.631 0 .07 1.453 1.712 3.234 3.666 3.544 3.89 3.925 4.184 5.602 4.202 1.038 0 2.455-.588 2.542-1.055.017-.156-1.28-1.712-2.905-3.493-1.608-1.78-2.94-3.285-2.94-3.32 0-.034 1.332-1.539 2.94-3.32C22.72 6.91 24.017 5.352 24 5.214c-.087-.45-1.366-.968-2.473-1.038-.795-.034-1.21.035-1.763.312zM7.954 16.973c-2.144 2.369-3.908 4.374-3.943 4.46-.034.07.208.312.52.537.414.311.864.432 1.711.467 1.574.103 2.161-.26 4.15-2.508.864-.968 1.608-1.78 1.625-1.78s.761.812 1.643 1.798c2.023 2.248 2.559 2.576 4.132 2.49.848-.035 1.297-.156 1.712-.467.311-.225.553-.467.519-.536-.087-.26-7.92-8.819-8.058-8.801-.069 0-1.867 1.954-4.011 4.34z"/>
    </svg>
  )
}

function ThemeLogo({ logo, size }: { logo: string; size: number }) {
  if (logo === 'proxmox') return <ProxmoxLogo size={size} />
  return <MonitorLogo size={size} />
}

function useTheme() {
  const [theme, setTheme] = useState<ThemeConfig | null>(null)

  useEffect(() => {
    let cancelled = false
    const fetchConfig = async () => {
      try {
        const res = await fetch('/api/config')
        if (!res.ok) return
        const data: ConfigResponse = await res.json()
        if (cancelled || !data.theme) return
        setTheme(data.theme)
        // Apply CSS variables from theme
        const root = document.documentElement
        root.style.setProperty('--accent', data.theme.accent)
        if (data.theme.accentLight) root.style.setProperty('--accent-light', data.theme.accentLight)
        if (data.theme.accentDim) root.style.setProperty('--accent-dim', data.theme.accentDim)
        if (data.theme.accentGlow) root.style.setProperty('--accent-glow', data.theme.accentGlow)
        if (data.theme.accentBorder) root.style.setProperty('--accent-border', data.theme.accentBorder)
        if (data.theme.shadowGlow) root.style.setProperty('--shadow-glow', data.theme.shadowGlow)
      } catch { /* ignore */ }
    }
    fetchConfig()
    return () => { cancelled = true }
  }, [])

  return theme
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

function TodoPanel({ todos }: { todos: TodoItem[] | null }) {
  if (!todos || todos.length === 0) return null

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

function ToolStatsPanel({ details }: { details: DetailsResponse | null }) {
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

function SystemPanel({ details }: { details: DetailsResponse | null }) {
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

function CommentaryPanel({ details }: { details: DetailsResponse | null }) {
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

// ── Settings Panel ──────────────────────────────────────────────────────────
function SettingsPanel({ theme, onClose }: { theme: ThemeConfig; onClose: () => void }) {
  const [form, setForm] = useState<ThemeConfig>(theme)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const update = (field: keyof ThemeConfig, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }))
    setSaved(false)
  }

  const applyLive = (field: keyof ThemeConfig, value: string) => {
    update(field, value)
    const root = document.documentElement
    if (field === 'accent') root.style.setProperty('--accent', value)
    if (field === 'accentLight') root.style.setProperty('--accent-light', value)
    if (field === 'accentDim') root.style.setProperty('--accent-dim', value)
    if (field === 'accentGlow') root.style.setProperty('--accent-glow', value)
    if (field === 'accentBorder') root.style.setProperty('--accent-border', value)
    if (field === 'shadowGlow') root.style.setProperty('--shadow-glow', value)
  }

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/theme', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      }
    } catch { /* ignore */ }
    setSaving(false)
  }

  const reset = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/theme/reset', { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        setForm(data.theme)
        const root = document.documentElement
        root.style.setProperty('--accent', data.theme.accent)
        if (data.theme.accentLight) root.style.setProperty('--accent-light', data.theme.accentLight)
        if (data.theme.accentDim) root.style.setProperty('--accent-dim', data.theme.accentDim)
        if (data.theme.accentGlow) root.style.setProperty('--accent-glow', data.theme.accentGlow)
        if (data.theme.accentBorder) root.style.setProperty('--accent-border', data.theme.accentBorder)
        if (data.theme.shadowGlow) root.style.setProperty('--shadow-glow', data.theme.shadowGlow)
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      }
    } catch { /* ignore */ }
    setSaving(false)
  }

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={e => e.stopPropagation()}>
        <div className="settings-header">
          <span className="settings-title">THEME SETTINGS</span>
          <button className="settings-close" onClick={onClose}>x</button>
        </div>
        <div className="settings-body">
          <label className="settings-field">
            <span>Display Name</span>
            <input type="text" value={form.displayName} onChange={e => update('displayName', e.target.value)} />
          </label>
          <label className="settings-field">
            <span>Logo Title</span>
            <input type="text" value={form.logoTitle} onChange={e => update('logoTitle', e.target.value)} />
          </label>
          <label className="settings-field">
            <span>Logo</span>
            <select value={form.logo} onChange={e => update('logo', e.target.value)}>
              <option value="radar">Radar / Scope</option>
              <option value="proxmox">Proxmox</option>
            </select>
          </label>
          <label className="settings-field">
            <span>Accent Color</span>
            <input type="color" value={form.accent} onChange={e => applyLive('accent', e.target.value)} />
            <input type="text" className="color-hex" value={form.accent} onChange={e => applyLive('accent', e.target.value)} />
          </label>
          <label className="settings-field">
            <span>Accent Light</span>
            <input type="color" value={form.accentLight || form.accent} onChange={e => applyLive('accentLight', e.target.value)} />
          </label>
          <label className="settings-field">
            <span>Accent Dim</span>
            <input type="color" value={form.accentDim || form.accent} onChange={e => applyLive('accentDim', e.target.value)} />
          </label>
        </div>
        <div className="settings-footer">
          <button className="settings-btn settings-reset" onClick={reset} disabled={saving}>Reset to Preset</button>
          <button className="settings-btn settings-save" onClick={save} disabled={saving}>
            {saving ? 'Saving...' : saved ? 'Saved!' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main App ────────────────────────────────────────────────────────────────
interface AllResponse {
  status: StatusResponse
  todos: TodosResponse
  details: DetailsResponse
}

export default function App() {
  const [status, setStatus] = useState<StatusResponse | null>(null)
  const [todos, setTodos] = useState<TodoItem[] | null>(null)
  const [details, setDetails] = useState<DetailsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const theme = useTheme()

  const poll = useCallback(async () => {
    try {
      const res = await fetch('/api/all')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: AllResponse = await res.json()
      setStatus(data.status)
      setTodos(data.todos?.todos ?? null)
      setDetails(data.details?.error ? null : data.details)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    }
  }, [])

  useEffect(() => {
    // Poll immediately, then every 8 seconds.
    // The /api/all endpoint does 3 SSH calls which can take 3-10 seconds,
    // so we use a longer interval than the fetch duration to avoid piling up.
    let active = true
    let timer: ReturnType<typeof setTimeout>
    const loop = async () => {
      if (active) await poll()
      if (active) timer = setTimeout(loop, 8000)
    }
    loop()
    return () => { active = false; clearTimeout(timer) }
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
            <div className="logo-icon"><ThemeLogo logo={theme?.logo || 'radar'} size={28} /></div>
            <div className="logo-text">
              <div className="logo-title">{theme?.logoTitle || 'PULSEMONITOR'}</div>
              <div className="logo-subtitle">{theme?.displayName || status.harnessDisplayName || status.harness}</div>
            </div>
            <button className="settings-toggle" onClick={() => setShowSettings(true)} title="Theme settings" aria-label="Theme settings">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
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

        <TodoPanel todos={todos} />

        <ToolStatsPanel details={details} />

        <SystemPanel details={details} />

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

        <CommentaryPanel details={details} />

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
      {showSettings && theme && <SettingsPanel theme={theme} onClose={() => setShowSettings(false)} />}
    </div>
  )
}
