#!/usr/bin/env python3
"""PulseMonitor - Details extractor.

Deployed to the remote machine by the install script. Reads the agent
session database and /proc to extract:
  - Session metadata (model, age, total messages)
  - Tool call distribution
  - Recent agent commentary (assistant messages with content)
  - System metrics (memory, load, disk)

Currently supports Devin CLI's SQLite session database.
To add a harness, implement custom queries and return the same JSON shape.
"""

import sqlite3
import json
import os
import subprocess
import time
import sys

DB = os.path.expanduser("~/.local/share/devin/cli/sessions.db")
REPO_PATH = os.environ.get("AGENT_MONITOR_REPO_PATH", os.path.expanduser("~"))

conn = sqlite3.connect(DB)
conn.row_factory = sqlite3.Row
cur = conn.cursor()

# Active session
row = cur.execute(
    "SELECT id, model, agent_mode, created_at, last_activity_at FROM sessions ORDER BY last_activity_at DESC LIMIT 1"
).fetchone()
if not row:
    print(json.dumps({"error": "no session"}))
    sys.exit(0)

sess = row["id"]
created_at = row["created_at"]
now = int(time.time())
age_s = now - created_at if created_at else 0

# Total message nodes
total_nodes = cur.execute(
    "SELECT COUNT(*) FROM message_nodes WHERE session_id=?", (sess,)
).fetchone()[0]

# Tool call distribution
cur.execute(
    "SELECT chat_message FROM message_nodes WHERE session_id=? AND chat_message LIKE ?",
    (sess, "%tool_calls%"),
)
tools = {}
for r in cur.fetchall():
    msg = json.loads(r["chat_message"])
    for tc in msg.get("tool_calls", []):
        name = tc.get("name", "?")
        tools[name] = tools.get(name, 0) + 1

# Recent assistant messages (commentary)
# Filter out: commit messages, status updates, markdown headers, very long messages
# These are "thinking out loud" messages, not final summaries or commit text.
import re as _re

def is_reasoning(text):
    """Check if a message is agent reasoning, not a summary or status update."""
    if not text or len(text) < 10:
        return False
    # Skip commit messages and PR-related text
    if text.startswith("Committed") or text.startswith("Pushed") or text.startswith("Created PR"):
        return False
    # Skip messages about lock files, pnpm, etc (commit-related reasoning)
    if "pnpm-lock" in text or "lock file" in text.lower() or "deprecated annotations" in text:
        return False
    # Skip messages that are mostly markdown headers/structure (summaries)
    if text.startswith("## ") or text.startswith("# Summary"):
        return False
    # Skip messages with high markdown density (lists, bold, headers)
    md_markers = text.count("**") + text.count("##") + text.count("- ")
    if md_markers > 5 and len(text) > 200:
        return False
    # Skip very long messages (likely summaries, not quick reasoning)
    if len(text) > 400:
        return False
    # Skip messages that look like status reports
    status_words = ["Typecheck passed", "Lint passed", "Build passed", "Tests passed"]
    if any(text.startswith(w) for w in status_words):
        return False
    return True

def clean_text(text):
    """Light cleanup: strip excessive whitespace, keep it readable."""
    # Collapse multiple newlines
    text = _re.sub(r'\n{3,}', '\n\n', text)
    # Strip leading/trailing whitespace
    text = text.strip()
    return text

cur.execute(
    "SELECT node_id, chat_message FROM message_nodes WHERE session_id=? AND chat_message LIKE ? ORDER BY node_id DESC LIMIT 30",
    (sess, "%assistant%"),
)
commentary = []
seen = set()
for r in cur.fetchall():
    msg = json.loads(r["chat_message"])
    content = msg.get("content", "")
    if content and content not in seen and is_reasoning(content):
        seen.add(content)
        cleaned = clean_text(content[:300])
        commentary.append({"nodeId": r["node_id"], "text": cleaned})
        if len(commentary) >= 4:
            break

# Recent tool results
cur.execute(
    "SELECT node_id, chat_message FROM message_nodes WHERE session_id=? AND chat_message LIKE ? ORDER BY node_id DESC LIMIT 30",
    (sess, "%tool%"),
)
tool_results = []
for r in cur.fetchall():
    msg = json.loads(r["chat_message"])
    content = msg.get("content", "")
    if content and len(content) > 10:
        tool_results.append({"nodeId": r["node_id"], "text": content[:400]})
        if len(tool_results) >= 3:
            break

# System metrics
sys_metrics = {}
try:
    pid_out = subprocess.run(
        ["pgrep", "-f", "devin --model"], capture_output=True, text=True
    ).stdout.strip()
    if pid_out:
        pid = pid_out.split("\n")[0]
        stat = open(f"/proc/{pid}/stat").read().split()
        sys_metrics["pid"] = int(pid)
        sys_metrics["cpu_ticks"] = int(stat[13]) + int(stat[14])
        status = open(f"/proc/{pid}/status").read()
        for line in status.split("\n"):
            if line.startswith("VmRSS"):
                sys_metrics["rss_kb"] = int(line.split()[1])
            elif line.startswith("VmSize"):
                sys_metrics["vsize_kb"] = int(line.split()[1])
            elif line.startswith("Threads"):
                sys_metrics["threads"] = int(line.split()[1])
except Exception:
    pass

try:
    load = open("/proc/loadavg").read().strip().split()
    sys_metrics["load_1"] = float(load[0])
    sys_metrics["load_5"] = float(load[1])
    sys_metrics["load_15"] = float(load[2])
except Exception:
    pass

try:
    meminfo = open("/proc/meminfo").read()
    for line in meminfo.split("\n"):
        if line.startswith("MemTotal"):
            sys_metrics["mem_total_kb"] = int(line.split()[1])
        elif line.startswith("MemAvailable"):
            sys_metrics["mem_avail_kb"] = int(line.split()[1])
except Exception:
    pass

try:
    du = subprocess.run(
        ["du", "-sh", REPO_PATH], capture_output=True, text=True
    ).stdout.strip().split()[0]
    sys_metrics["repo_disk"] = du
except Exception:
    pass

print(json.dumps({
    "sessionId": sess,
    "model": row["model"],
    "agentMode": row["agent_mode"],
    "ageSeconds": age_s,
    "totalNodes": total_nodes,
    "toolCalls": tools,
    "commentary": commentary,
    "recentToolResults": tool_results,
    "system": sys_metrics,
}))
