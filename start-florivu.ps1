[CmdletBinding()]
param(
  [switch]$OpenBrowser
)

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSCommandPath
$logsDir = Join-Path $projectRoot 'logs'
$stdoutLog = Join-Path $logsDir '.vite-server.log'
$stderrLog = Join-Path $logsDir '.vite-server.err.log'
$port = 8081
$url = "http://localhost:$port"

New-Item -ItemType Directory -Path $logsDir -Force | Out-Null

function Get-FlorivuListener {
  $connection = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue |
    Select-Object -First 1

  if (-not $connection) {
    return $null
  }

  $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($connection.OwningProcess)" -ErrorAction SilentlyContinue

  [pscustomobject]@{
    ProcessId = $connection.OwningProcess
    Name = if ($process) { $process.Name } else { $null }
    CommandLine = if ($process) { $process.CommandLine } else { $null }
  }
}

function Open-FlorivuBrowser {
  if ($OpenBrowser) {
    Start-Process $url | Out-Null
  }
}

function Get-NpmCommandPath {
  $toolsDir = Join-Path $projectRoot '.tools'

  if (Test-Path $toolsDir) {
    $localNpm = Get-ChildItem $toolsDir -Filter npm.cmd -Recurse -ErrorAction SilentlyContinue |
      Select-Object -First 1 -ExpandProperty FullName

    if ($localNpm) {
      return $localNpm
    }
  }

  $globalNpm = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if ($globalNpm) {
    return $globalNpm.Source
  }

  $fallbackNpm = Get-Command npm -ErrorAction SilentlyContinue
  if ($fallbackNpm) {
    return $fallbackNpm.Source
  }

  throw 'Unable to locate npm. Install Node.js globally or keep the project-local toolchain in .tools.'
}

$listener = Get-FlorivuListener
if ($listener) {
  $commandLine = if ($listener.CommandLine) { $listener.CommandLine } else { '' }
  $projectPattern = [Regex]::Escape($projectRoot)
  $isFlorivuProcess =
    ($commandLine -match $projectPattern) -or
    (($commandLine -match 'vite') -and ($commandLine -match '\b8081\b'))

  if ($isFlorivuProcess) {
    Write-Host "Florivu is already running at $url (PID $($listener.ProcessId))."
    Write-Host "Logs: $stdoutLog"
    Open-FlorivuBrowser
    exit 0
  }

  throw "Port $port is already in use by PID $($listener.ProcessId) ($($listener.Name))."
}

$npmPath = Get-NpmCommandPath
$nodeDir = Split-Path -Parent $npmPath
if (Test-Path (Join-Path $nodeDir 'node.exe')) {
  $env:Path = "$nodeDir;$env:Path"
}

$starter = Start-Process -FilePath $npmPath -ArgumentList @('run', 'dev') -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru
$deadline = (Get-Date).AddSeconds(30)

do {
  Start-Sleep -Milliseconds 500
  $listener = Get-FlorivuListener
} while (-not $listener -and -not $starter.HasExited -and (Get-Date) -lt $deadline)

if (-not $listener) {
  if (-not $starter.HasExited) {
    Stop-Process -Id $starter.Id -Force -ErrorAction SilentlyContinue
  }

  $errorTail = ''
  if (Test-Path $stderrLog) {
    $errorTail = (Get-Content $stderrLog -Tail 20 -ErrorAction SilentlyContinue) -join [Environment]::NewLine
  }

  throw "Florivu did not start within 30 seconds.`nError log: $stderrLog`n$errorTail"
}

Write-Host "Florivu started at $url (PID $($listener.ProcessId))."
Write-Host "Logs: $stdoutLog"
Open-FlorivuBrowser
