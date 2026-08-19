---
name: dispatch
description: Fire-and-forget remote agent dispatcher. Syncs the repo, starts a detached agent task on the remote, verifies it is running, auto-starts PulseMonitor, and returns a summary immediately.
argument-hint: "[task] using <model> [same branch]"
allowed-tools:
  - read
  - grep
  - glob
  - exec
  - ask_user_question
permissions:
  allow:
    - Exec(ssh *)
    - Exec(git *)
    - Exec(gh *)
  ask:
    - Write(**)
triggers:
  - user
---

# Remote Agent Dispatcher

Dispatch an agent CLI task to a remote server, start it in the background, verify it is alive, and **stop the local agent immediately**. Do not wait for the remote task to finish. All findings are reported in the local chat summary or in the remote log file.

## Environment variables

- `DISPATCH_HOST` - target host. Required. Fallback IPs can be tried in order.
- `DISPATCH_USER` - SSH user (default: `root`)
- `DISPATCH_KEY` - SSH key path (default: `~/.ssh/id_rsa`)
- `DISPATCH_REPO_PATH` - repo path on remote (default: computed from origin URL as `/root/<reponame>`)

## Supported agent CLIs

This skill is agent-agnostic. It works with any CLI that:
1. Accepts a prompt via `--print` or `-p` flag
2. Runs non-interactively with `--permission-mode bypass` or equivalent
3. Can be launched in the background with `setsid`

Currently tested with:
- **Devin CLI** (`devin --model <model> --permission-mode bypass -p "<prompt>"`)

To add support for another CLI, extend the dispatch command in step 9.

## Preconditions

1. Local repo is a Git repo with a GitHub remote.
2. `DISPATCH_KEY` exists and has SSH access to `DISPATCH_HOST`.
3. The remote has `git`, the agent CLI, and `gh` installed and authenticated.
4. The remote has a GitHub SSH key (`~/.ssh/id_*`) so `git clone` with `git@github.com:` works.

## Branch safety rule (non-negotiable)

- The remote task must NEVER commit or push directly to `main` (or any main-equivalent: `master`, `trunk`, `production`).
- If the current branch is `main` / `master` / `trunk` / `production`, the dispatcher MUST force a new `dispatch-<timestamp>` branch and instruct the remote to open a PR instead.
- For any other branch, committing and pushing directly is permitted.
- Always confirm the dispatch plan with the user via `ask_user_question` before sending the task off.

## Step-by-step workflow

### 1. Extract model and task

- Parse the model from the prompt: `using <model>` or `with <model>`.
- If no model is found, ask the user with `ask_user_question`.
- The rest of the prompt is the task.
- Check if the user said `same branch` or `existing branch`. If so, reuse the current branch; otherwise create a new `dispatch-<timestamp>` branch.

### 2. Validate the remote model

Confirm the remote agent CLI accepts the model:

```bash
ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new -i "$DISPATCH_KEY" "$DISPATCH_USER@$DISPATCH_HOST" "devin --model '$MODEL' --permission-mode bypass --print 'hello' 2>&1 | head -3"
```

If the output is a non-error response, proceed. Otherwise stop and report.

### 3. Local repo snapshot

- Read current branch with `git rev-parse --abbrev-ref HEAD`.
- Push the current branch to origin.
- If the working tree has uncommitted changes, commit them or warn the user.

### 4. Remote prerequisites

```bash
ssh -i "$DISPATCH_KEY" "$DISPATCH_USER@$DISPATCH_HOST" "which git && which devin && which gh && gh auth status --hostname github.com"
```

### 5. Sync repo on remote

If the repo does not exist on the remote, clone it. If it exists, fetch and checkout the current branch.

### 6. Create work branch

```bash
BRANCH="dispatch-$(date +%Y%m%d-%H%M%S)"
ssh -i "$DISPATCH_KEY" "$DISPATCH_USER@$DISPATCH_HOST" "cd '$DISPATCH_REPO_PATH' && git checkout -b '$BRANCH'"
```

### 7. Build remote task prompt

Write the prompt to a file on the remote at `/tmp/dispatch-task-<uuid>.txt`.

### 8. Dispatch background session

```bash
ssh -i "$DISPATCH_KEY" "$DISPATCH_USER@$DISPATCH_HOST" \
  "cd '$DISPATCH_REPO_PATH'; \
   setsid devin --model '$MODEL' --permission-mode bypass --print --prompt-file '$PROMPT_FILE' > '$LOG' 2>&1 < /dev/null & \
   echo \$! > '$PIDFILE'; \
   sleep 3; \
   cat '$PIDFILE'"
```

Verify the process is running with `pgrep`.

### 9. Auto-start PulseMonitor

Check if PulseMonitor is already running on port 5656. If not, start it:

```bash
curl -s --max-time 2 http://127.0.0.1:5656/api/health 2>/dev/null | grep -q '"ok":true' || {
  MONITOR_DIR="$HOME/Desktop/PROG+HTML/PulseMonitor"
  if [ -f "$MONITOR_DIR/server.cjs" ]; then
    [ -d "$MONITOR_DIR/dist" ] || (cd "$MONITOR_DIR" && npm install --silent && npm run build 2>/dev/null)
    systemctl --user start pulsemonitor.service 2>/dev/null || \
      nohup setsid env AGENT_MONITOR_SSH_HOST="${DISPATCH_USER}@${DISPATCH_HOST}" \
        AGENT_MONITOR_SSH_KEY="${DISPATCH_KEY}" \
        AGENT_MONITOR_REPO_PATH="${DISPATCH_REPO_PATH:-}" \
        AGENT_MONITOR_PORT=5656 \
        node "$MONITOR_DIR/server.cjs" > /tmp/pulsemonitor.log 2>&1 &
  fi
}
```

### 10. Return summary

Report the dispatch details, branch, model, log file, and monitor URL. Stop immediately. Do not wait for completion.

## Failure handling

If any step fails, stop immediately and report the exact command, output, and step number. Do not retry unless it is a transient network error.

## Example invocations

```
/dispatch run the full test suite and fix failures using swe-1.7
/dispatch analyze the codebase for slop and clean it up with glm-5.2
/dispatch implement Redis-backed identity rate limiting using swe-1.7
/dispatch fix the failing API tests using swe-1.7 same branch
```
