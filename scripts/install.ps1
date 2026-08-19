# Agent Monitor - Install script for Windows (PowerShell)
#
# Deploys helper scripts to the remote machine and starts the monitor.
# Requires Node.js 18+ and SSH (OpenSSH client built into Windows 10+).
#
# Usage:
#   .\scripts\install.ps1                          # interactive
#   .\scripts\install.ps1 -SshHost "root@10.0.0.1"
#   .\scripts\install.ps1 -SshKey "$env:USERPROFILE\.ssh\id_rsa"
#   .\scripts\install.ps1 -Port 8080

param(
    [string]$SshHost = "",
    [string]$SshKey = "",
    [int]$Port = 5656
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = Split-Path -Parent $ScriptDir

# Interactive prompts
if ([string]::IsNullOrWhiteSpace($SshHost)) {
    $SshHost = Read-Host "SSH host (e.g. root@10.0.0.1)"
}
if ([string]::IsNullOrWhiteSpace($SshKey)) {
    $DefaultKey = Join-Path $env:USERPROFILE ".ssh\id_rsa"
    $Input = Read-Host "SSH key path [$DefaultKey]"
    $SshKey = if ([string]::IsNullOrWhiteSpace($Input)) { $DefaultKey } else { $Input }
}

if ([string]::IsNullOrWhiteSpace($SshHost)) {
    Write-Error "SSH host is required"
    exit 1
}

Write-Host ""
Write-Host "=== Agent Monitor Install ==="
Write-Host "  SSH host: $SshHost"
Write-Host "  SSH key:  $SshKey"
Write-Host "  Port:     $Port"
Write-Host ""

# 1. Install dependencies
Write-Host "[1/3] Installing dependencies..."
Push-Location $ProjectDir
npm install --silent

# 2. Build frontend
Write-Host "[2/3] Building frontend..."
npm run build
Pop-Location

# 3. Deploy helper scripts to remote
Write-Host "[3/3] Deploying helper scripts to remote..."
$SshOpts = "-i", $SshKey, "-o", "ConnectTimeout=10", "-o", "StrictHostKeyChecking=accept-new"

scp @SshOpts "$ScriptDir\remote-todos.py" "${SshHost}:/tmp/agent-monitor-todos.py" 2>$null
scp @SshOpts "$ScriptDir\remote-details.py" "${SshHost}:/tmp/agent-monitor-details.py" 2>$null

Write-Host "  Helper scripts deployed to /tmp/agent-monitor-*.py on remote"

# Set environment and start
Write-Host ""
Write-Host "=== Install complete ==="
Write-Host ""
Write-Host "Starting Agent Monitor..."
Write-Host "Dashboard: http://localhost:$Port"
Write-Host ""
Write-Host "To run manually:"
Write-Host "  `$env:AGENT_MONITOR_SSH_HOST='$SshHost'"
Write-Host "  `$env:AGENT_MONITOR_SSH_KEY='$SshKey'"
Write-Host "  `$env:AGENT_MONITOR_PORT='$Port'"
Write-Host "  npm start"
Write-Host ""

# Start the server
$env:AGENT_MONITOR_SSH_HOST = $SshHost
$env:AGENT_MONITOR_SSH_KEY = $SshKey
$env:AGENT_MONITOR_PORT = $Port
Push-Location $ProjectDir
npm start
Pop-Location
