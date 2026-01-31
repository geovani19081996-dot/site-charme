# ==========================================
# CHARME | LIVE LOOP (Servidor)
# Gera JSONs a cada N segundos (config em .env) e copia pra C:\Charme\live
# ==========================================

$ErrorActionPreference = "Continue"

function Get-EnvValue([string]$path, [string]$key, [string]$defaultValue) {
  if (!(Test-Path $path)) { return $defaultValue }
  $line = Get-Content $path | Where-Object { $_ -match "^\s*$key\s*=" } | Select-Object -First 1
  if (-not $line) { return $defaultValue }
  return ($line -split "=", 2)[1].Trim()
}

$intervalSec = 15
$envFile = "C:\Charme\super_painel\.env"
$cfgValue = Get-EnvValue $envFile "LIVE_INTERVAL_SECONDS" ""
if ($cfgValue) {
  $parsed = 0
  if ([int]::TryParse($cfgValue, [ref]$parsed)) {
    if ($parsed -gt 0) { $intervalSec = $parsed }
  }
}
if ($env:LIVE_INTERVAL_SECONDS) {
  $parsed = 0
  if ([int]::TryParse($env:LIVE_INTERVAL_SECONDS, [ref]$parsed)) {
    if ($parsed -gt 0) { $intervalSec = $parsed }
  }
}

$liveRoot   = "C:\Charme\live"
$liveData   = Join-Path $liveRoot "data"
$livePrivate = Join-Path $liveData "private"

$promosScript   = "C:\Charme\git\site-charme\scripts\gerar_json_promocoes.ps1"
$produtosScript = "C:\Charme\git\site-charme\scripts\gerar_json_produtos.ps1"

$srcPromos   = "C:\Charme\export\promocoes_site.json"
$srcProdutos = "C:\Charme\export\produtos.json"
$srcAvisos   = "C:\Charme\export\avisos_site.json"

$dstPromos   = Join-Path $livePrivate "promocoes_site.json"
$dstPromosPublic = Join-Path $liveData "promocoes_site.json"
$dstProdutos = Join-Path $livePrivate "produtos.json"
$dstStatus   = Join-Path $livePrivate "status.json"
$dstAvisosPublic = Join-Path $liveData "avisos_site.json"

New-Item -ItemType Directory -Force -Path $livePrivate | Out-Null
New-Item -ItemType Directory -Force -Path $liveData | Out-Null

function Write-Status($ok, $msg, $extra) {
  $payload = [ordered]@{
    ok          = $ok
    message     = $msg
    updated_at  = (Get-Date).ToUniversalTime().ToString("o")
    interval_s  = $intervalSec
  }
  if ($extra) {
    foreach ($k in $extra.Keys) { $payload[$k] = $extra[$k] }
  }
  $json = $payload | ConvertTo-Json -Depth 5
  [System.IO.File]::WriteAllText($dstStatus, $json, (New-Object System.Text.UTF8Encoding($false)))
}

Write-Host "=== CHARME | LIVE LOOP ===" -ForegroundColor Cyan
Write-Host "Saida live: $livePrivate" -ForegroundColor DarkGray
Write-Host "Intervalo: $intervalSec s" -ForegroundColor DarkGray

while ($true) {
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  try {
    Write-Host ("[{0}] LIVE tick..." -f (Get-Date).ToString("HH:mm:ss")) -ForegroundColor Cyan

    # 1) Promos
    if (Test-Path $promosScript) {
      powershell -ExecutionPolicy Bypass -File $promosScript | Out-Null
      if ($LASTEXITCODE -ne 0) { throw "Promos falhou (exit $LASTEXITCODE)" }
    } else {
      throw "Nao achei: $promosScript"
    }

    # 2) Produtos
    if (Test-Path $produtosScript) {
      powershell -ExecutionPolicy Bypass -File $produtosScript | Out-Null
      if ($LASTEXITCODE -ne 0) { throw "Produtos falhou (exit $LASTEXITCODE)" }
    } else {
      throw "Nao achei: $produtosScript"
    }

    # 3) Copiar para live
    if (Test-Path $srcPromos)   { Copy-Item $srcPromos   $dstPromos   -Force } else { throw "Nao gerou: $srcPromos" }
    if (Test-Path $srcPromos)   { Copy-Item $srcPromos   $dstPromosPublic   -Force } else { throw "Nao gerou: $srcPromos" }
    if (Test-Path $srcProdutos) { Copy-Item $srcProdutos $dstProdutos -Force } else { throw "Nao gerou: $srcProdutos" }
    if (Test-Path $srcAvisos)   { Copy-Item $srcAvisos   $dstAvisosPublic -Force }

    $sw.Stop()
    Write-Status $true "ok" @{ took_ms = $sw.ElapsedMilliseconds }

  } catch {
    $sw.Stop()
    $err = $_.Exception.Message
    Write-Host "ERRO LIVE: $err" -ForegroundColor Red
    Write-Status $false "error" @{ error = $err; took_ms = $sw.ElapsedMilliseconds }
  }

  Start-Sleep -Seconds $intervalSec
}
