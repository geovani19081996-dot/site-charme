# ==========================================
# CHARME | START CLOUDFLARED (local)
# Inicia o tunnel "charme-live" em background
# ==========================================

$ErrorActionPreference = "Stop"

$logDir = "C:\Charme\logs"
if (!(Test-Path $logDir)) { New-Item -ItemType Directory -Force -Path $logDir | Out-Null }

$outLog = Join-Path $logDir "cloudflared.out.log"
$errLog = Join-Path $logDir "cloudflared.err.log"

$cloudflared = "C:\Cloudflared\bin\cloudflared.exe"
if (!(Test-Path $cloudflared)) {
  $cloudflared = "C:\Charme\tools\cloudflared\cloudflared.exe"
}
if (!(Test-Path $cloudflared)) { throw "cloudflared.exe nao encontrado." }

$cfgCandidates = @(
  (Join-Path $env:USERPROFILE ".cloudflared\config.yml"),
  "C:\Users\geova\.cloudflared\config.yml",
  "C:\Users\Administrator\.cloudflared\config.yml"
) | Where-Object { $_ -and (Test-Path $_) }
$configYml = $cfgCandidates | Select-Object -First 1
if (-not $configYml) { throw "config.yml nao encontrado em .cloudflared." }

try {
  $procs = Get-CimInstance Win32_Process -Filter "Name='cloudflared.exe'" -ErrorAction SilentlyContinue
  foreach ($p in $procs) {
    if (-not $p.CommandLine) { continue }
    if ($p.CommandLine -like "*tunnel*" -or $p.CommandLine -like "*charme-live*") {
      Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
    }
  }
} catch {
  # Best effort, ignore
}

Start-Process -FilePath $cloudflared -ArgumentList "tunnel --config `"$configYml`" run charme-live" `
  -WorkingDirectory (Split-Path $cloudflared -Parent) -WindowStyle Hidden `
  -RedirectStandardOutput $outLog -RedirectStandardError $errLog

Write-Host "Tunnel iniciado."
