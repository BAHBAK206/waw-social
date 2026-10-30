# Qubedu: first-time setup on Windows. Docker Desktop must be installed and running.
# Right-click this file -> "Run with PowerShell", or run:  powershell -ExecutionPolicy Bypass -File scripts\windows-setup.ps1
param([string]$Domain = "", [string]$Email = "")
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Host "Docker is not installed. Install Docker Desktop from docker.com, restart the computer, open it, then run this again." -ForegroundColor Red
  Read-Host "Press Enter to close"; exit 1
}
docker info *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Host "Docker Desktop is not running yet. Open it, wait until it says Running, then run this again." -ForegroundColor Red
  Read-Host "Press Enter to close"; exit 1
}

function New-Secret([int]$n) {
  $bytes = New-Object byte[] ($n * 3)
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  return ([Convert]::ToBase64String($bytes) -replace '[^a-zA-Z0-9]', '').Substring(0, $n)
}

if (Test-Path .env) {
  Write-Host ".env already exists, keeping it (delete it first if you want a fresh one)."
} else {
  if (-not $Email) { $Email = Read-Host "Your email (you become the site administrator)" }
  if (-not $Domain) { $Domain = Read-Host "Your domain, for example qubedu.com (press Enter to try it only on this computer)" }
  $text = Get-Content .env.example -Raw
  function Set-Env([string]$key, [string]$value) {
    $script:text = [regex]::Replace($script:text, "(?m)^$key=.*$", { param($m) "$key=$value" })
  }
  Set-Env 'JWT_SECRET' (New-Secret 64)
  Set-Env 'INTERNAL_TOKEN' (New-Secret 48)
  Set-Env 'POSTGRES_PASSWORD' (New-Secret 32)
  Set-Env 'ROOT_ADMIN_EMAIL' $Email
  if ($Domain) {
    Set-Env 'APP_URL' "https://$Domain"
    Set-Env 'API_PUBLIC_URL' "https://$Domain"
    Set-Env 'REALTIME_PUBLIC_URL' "wss://$Domain/ws"
    Set-Env 'CORS_ORIGINS' "https://$Domain"
    Set-Env 'TRUST_PROXY_HOPS' '2'
  }
  [IO.File]::WriteAllText((Join-Path (Get-Location) '.env'), $text, (New-Object Text.UTF8Encoding $false))
  Write-Host ".env created with random secrets. Keep this file private and never send it to anyone." -ForegroundColor Green
}

Write-Host "Starting Qubedu. The first time takes 10-20 minutes..." -ForegroundColor Cyan
docker compose up -d --build
if ($LASTEXITCODE -ne 0) { Write-Host "Something failed. Copy the last lines above and send them to your helper." -ForegroundColor Red; Read-Host "Press Enter to close"; exit 1 }
Write-Host "Done. Open http://localhost:8080 in your browser." -ForegroundColor Green
Read-Host "Press Enter to close"
