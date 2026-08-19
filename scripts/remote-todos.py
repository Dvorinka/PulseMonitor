#!/usr/bin/env python3
"""Agent Monitor - Todo extractor.

Deployed to the remote machine by the install script. Reads the agent
session database and extracts the latest todo list.

Currently supports Devin CLI's SQLite session database.
To add a harness, implement a custom query and return the same JSON shape.
"""

import sqlite3
import json
import sys
import re

DB = "~/.local/share/devin/cli/sessions.db"
# Expand ~ manually since we run via SSH
import os
DB = os.path.expanduser(DB)

conn = sqlite3.connect(DB)

# Find the most recently active session
row = conn.execute(
    "SELECT id FROM sessions ORDER BY last_activity_at DESC LIMIT 1"
).fetchone()
if not row:
    print(json.dumps({"error": "no session found"}))
    sys.exit(0)

sess = row[0]

# Get the latest message containing "Current todo list"
row = conn.execute(
    "SELECT chat_message FROM message_nodes WHERE session_id=? AND chat_message LIKE '%Current todo list%' ORDER BY node_id DESC LIMIT 1",
    (sess,),
).fetchone()
if not row:
    print(json.dumps({"error": "no todos found", "sessionId": sess}))
    sys.exit(0)

msg = json.loads(row[0])
content = msg.get("content", "")

# The content may contain multiple todo lists (agent appends new ones).
# Parse only the last occurrence by splitting on "Current todo list" markers.
sections = content.split("Current todo list")
if len(sections) > 1:
    content = sections[-1]

todos = []
for line in content.split("\n"):
    line = line.strip()
    if not line or line.startswith("Todos have been") or line.startswith("Current todo list:"):
        continue
    m = re.match(r"(\d+)\.\s+\[(.)\]\s+(.+?)(?:\s+\[(?:completed|in_progress|pending)\])?$", line)
    if m:
        status = "completed" if m.group(2) == "x" else ("in_progress" if m.group(2) == "~" else "pending")
        todos.append({"index": int(m.group(1)), "status": status, "content": m.group(3)})

print(json.dumps({"sessionId": sess, "todos": todos}))
