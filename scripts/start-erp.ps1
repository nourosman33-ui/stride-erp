<#
  Brings the permanent STRIDE ERP instance online: Docker (Postgres/Redis),
  backend (port 4000), frontend (port 4001). Safe to run repeatedly - every
  step first checks whether it's already satisfied and skips if so, so this
  can run silently at every Windows logon without piling up duplicate
  processes.

  Runs on 4000/4001, deliberately different from the 3000/3002 ports used by
  the dev servers (see ../.claude/launch.json), so the always-on instance
  never collides with an active development session.

  Usage:
    start-erp.ps1                launch/ensure everything is running, quietly
    start-erp.ps1 -OpenBrowser   also wait for the frontend to respond, then
                                  open it in the default browser (used by the
                                  desktop shortcut)
#>

param(
  [switch]$OpenBrowser
)

# Left at the default ("Continue") deliberately: docker.exe/npm.cmd write
# routine warnings to stderr, and PowerShell 5.1 turns a redirected native
# stderr line into a terminating NativeCommandError under EAP "Stop" even
# when the process exits 0. Exit codes / port checks below are the real
# signal of success, not exceptions.

$RepoRoot = Split-Path -Parent $PSScriptRoot
$BackendDir = Join-Path $RepoRoot "backend"
$FrontendDir = Join-Path $RepoRoot "frontend"
$LogDir = Join-Path $PSScriptRoot "logs"
$LogFile = Join-Path $LogDir "start-erp.log"
$BackendPort = 4000
$FrontendPort = 4001

if (-not (Test-Path $LogDir)) {
  New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
}

function Write-Log {
  param([string]$Message)
  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
  Add-Content -Path $LogFile -Value $line
}

function Test-PortOpen {
  param([int]$Port)
  try {
    $client = New-Object System.Net.Sockets.TcpClient
    $result = $client.BeginConnect("127.0.0.1", $Port, $null, $null)
    $ok = $result.AsyncWaitHandle.WaitOne(500)
    if ($ok -and $client.Connected) {
      $client.Close()
      return $true
    }
    $client.Close()
    return $false
  } catch {
    return $false
  }
}

function Wait-ForPort {
  param([int]$Port, [int]$TimeoutSeconds, [string]$Label)
  $elapsed = 0
  while (-not (Test-PortOpen -Port $Port)) {
    if ($elapsed -ge $TimeoutSeconds) {
      Write-Log "TIMEOUT waiting for $Label on port $Port after ${TimeoutSeconds}s"
      return $false
    }
    Start-Sleep -Seconds 2
    $elapsed += 2
  }
  Write-Log "$Label is up on port $Port (waited ${elapsed}s)"
  return $true
}

Write-Log "=== start-erp.ps1 invoked (OpenBrowser=$OpenBrowser) ==="

# 1. Docker engine - Docker Desktop already has "start at login" configured
# (Windows Run key), but launch it here too in case this script runs before
# that has happened, or the previous Docker session didn't survive a reboot.
try {
  docker info *> $null
  $dockerUp = $LASTEXITCODE -eq 0
} catch {
  $dockerUp = $false
}

if (-not $dockerUp) {
  Write-Log "Docker engine not responding - launching Docker Desktop"
  $dockerExe = "$env:LOCALAPPDATA\Programs\DockerDesktop\Docker Desktop.exe"
  if (Test-Path $dockerExe) {
    Start-Process -FilePath $dockerExe
  } else {
    Write-Log "ERROR: Docker Desktop.exe not found at $dockerExe"
  }

  # Cold boot (WSL2 VM + engine init) has been observed to take several
  # minutes on this machine - give it real room before giving up.
  $elapsed = 0
  $timeout = 600
  while ($true) {
    docker info *> $null
    if ($LASTEXITCODE -eq 0) {
      Write-Log "Docker engine up after ${elapsed}s"
      break
    }
    if ($elapsed -ge $timeout) {
      Write-Log "ERROR: Docker engine did not come up within ${timeout}s - aborting"
      exit 1
    }
    Start-Sleep -Seconds 10
    $elapsed += 10
  }
} else {
  Write-Log "Docker engine already up"
}

# 2. Postgres + Redis containers (restart: unless-stopped, so this is
# usually a no-op once Docker itself is up).
Push-Location $BackendDir
try {
  docker compose up -d *> $null
  Write-Log "docker compose up -d done (exit $LASTEXITCODE)"
} finally {
  Pop-Location
}

# Wait for Postgres to actually accept connections before starting the
# backend - Nest/Prisma hangs rather than retrying gracefully on a cold DB.
if (-not (Wait-ForPort -Port 5432 -TimeoutSeconds 60 -Label "Postgres")) {
  Write-Log "ERROR: Postgres never became reachable - aborting"
  exit 1
}

# 3. Backend (production build, port 4000)
if (Test-PortOpen -Port $BackendPort) {
  Write-Log "Backend already running on $BackendPort"
} else {
  Write-Log "Starting backend on $BackendPort"
  $env:PORT = "$BackendPort"
  # CORS now auto-trusts any origin on this port from localhost, the LAN, or a
  # Tailscale/VPN address (see backend/src/common/cors-origin.ts) - FRONTEND_PORT
  # is all it needs to know, no IP address to keep in sync here.
  $env:FRONTEND_PORT = "$FrontendPort"
  Start-Process -FilePath "node" -ArgumentList "dist\src\main.js" `
    -WorkingDirectory $BackendDir -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $LogDir "backend.out.log") `
    -RedirectStandardError (Join-Path $LogDir "backend.err.log")
  Wait-ForPort -Port $BackendPort -TimeoutSeconds 60 -Label "Backend" | Out-Null
}

# 4. Frontend (production build, port 4001)
if (Test-PortOpen -Port $FrontendPort) {
  Write-Log "Frontend already running on $FrontendPort"
} else {
  Write-Log "Starting frontend on $FrontendPort"
  Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "npm run start -- -p $FrontendPort" `
    -WorkingDirectory $FrontendDir -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $LogDir "frontend.out.log") `
    -RedirectStandardError (Join-Path $LogDir "frontend.err.log")
  Wait-ForPort -Port $FrontendPort -TimeoutSeconds 60 -Label "Frontend" | Out-Null
}

Write-Log "=== start-erp.ps1 done ==="

if ($OpenBrowser) {
  Wait-ForPort -Port $FrontendPort -TimeoutSeconds 120 -Label "Frontend (pre-open)" | Out-Null
  Start-Process "http://localhost:$FrontendPort"
}
