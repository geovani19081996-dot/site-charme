# ============================================================
# PUBLICAR PROMOCOES + PRODUTOS (Servidor Charme)
# - Sincroniza repo com GitHub (reset hard)
# - Copia JSONs gerados em C:\Charme\export -> repo
# - (Opcional) Exporta imagens e publica tamb�m
#
# Modo/mode:
#   -Mode JSON  = publica s� JSON (r�pido)
#   -Mode FULL  = publica JSON + exporta imagens + publica imagens (pesado)
#
# Uso/use:
#   powershell -ExecutionPolicy Bypass -File C:\Charme\scripts\publicar_promocao_site.ps1 -Mode JSON
#   powershell -ExecutionPolicy Bypass -File C:\Charme\scripts\publicar_promocao_site.ps1 -Mode FULL
# ============================================================

param(
  [ValidateSet("JSON","FULL")]
  [string]$Mode = "JSON"
)

$ErrorActionPreference = "Stop"

# ---- Paths/caminhos
$repoPath   = "C:\Charme\git\site-charme"
$exportDir  = "C:\Charme\export"

$promosSrc  = Join-Path $exportDir "promocoes_site.json"
$promosDst  = Join-Path $repoPath  "data\promocoes_site.json"

$prodSrc    = Join-Path $exportDir "produtos.json"
$prodDstDir = Join-Path $repoPath  "data\private"
$prodDst    = Join-Path $prodDstDir "produtos.json"

$avisosSrc  = Join-Path $exportDir "avisos_site.json"
$avisosDst  = Join-Path $repoPath  "data\avisos_site.json"
$conteudoSrc = Join-Path $exportDir "site_content.json"
$conteudoDst = Join-Path $repoPath "data\site_content.json"

$customDir = Join-Path $exportDir "site_custom"

$imgDir     = Join-Path $repoPath "img\produtos"

$mainDb     = "C:\Celta Sistemas\CELTA.FDB"
$auxDb      = "C:\Celta Sistemas\CELTAAUXILIAR.FDB"
$pyExport   = "C:\Charme\git\site-charme\scripts\exportar_imagens_produtos.py"
$pyCandidates = @(
  "C:\Charme\super_painel\.venv\Scripts\python.exe",
  "C:\Python311\python.exe",
  "C:\Python310\python.exe",
  "C:\Python39\python.exe"
)
$python = $null

foreach ($candidate in $pyCandidates) {
  if (Test-Path $candidate) { $python = $candidate; break }
}
if (-not $python) {
  if (Get-Command py -ErrorAction SilentlyContinue) { $python = "py" }
}
if (-not $python) { throw "Python nao encontrado (venv, py ou instalacao padrao)." }

Write-Host "=== CHARME | PUBLICAR ($Mode) ===" -ForegroundColor Cyan

# ---- Validations/valida��es
if (!(Test-Path $repoPath)) { throw "Repo nao encontrado: $repoPath" }
if (!(Test-Path (Join-Path $repoPath ".git"))) { throw "Nao parece repo git: $repoPath" }

# ---- 1) Sync/sincronizar (reset/hard)
Write-Host "1) Sync/sincronizando repo (reset/hard)..." -ForegroundColor Cyan
git -C $repoPath fetch origin | Out-Null
git -C $repoPath checkout main | Out-Null
git -C $repoPath reset --hard origin/main | Out-Null
git -C $repoPath clean -fd | Out-Null

# ---- 2) Garantir pastas
Write-Host "2) Garantindo pastas..." -ForegroundColor Cyan
$null = New-Item -ItemType Directory -Force -Path (Join-Path $repoPath "data") | Out-Null
$null = New-Item -ItemType Directory -Force -Path $prodDstDir | Out-Null
$null = New-Item -ItemType Directory -Force -Path $imgDir | Out-Null

# ---- 3) Copiar JSONs
Write-Host "3) Copiando JSONs..." -ForegroundColor Cyan

if (Test-Path $promosSrc) {
  Copy-Item $promosSrc $promosDst -Force
  git -C $repoPath add "data/promocoes_site.json" | Out-Null
  Write-Host "OK promos: $promosDst" -ForegroundColor Green
} else {
  Write-Host "AVISO: promocoes_site.json nao existe em $exportDir" -ForegroundColor Yellow
}

if (Test-Path $prodSrc) {
  Copy-Item $prodSrc $prodDst -Force
  git -C $repoPath add "data/private/produtos.json" | Out-Null
  Write-Host "OK produtos: $prodDst" -ForegroundColor Green
} else {
  Write-Host "AVISO: produtos.json nao existe em $exportDir" -ForegroundColor Yellow
}

if (Test-Path $avisosSrc) {
  Copy-Item $avisosSrc $avisosDst -Force
  git -C $repoPath add "data/avisos_site.json" | Out-Null
  Write-Host "OK avisos: $avisosDst" -ForegroundColor Green
} else {
  Write-Host "AVISO: avisos_site.json nao existe em $exportDir" -ForegroundColor Yellow
}

if (Test-Path $conteudoSrc) {
  Copy-Item $conteudoSrc $conteudoDst -Force
  git -C $repoPath add "data/site_content.json" | Out-Null
  Write-Host "OK conteudo: $conteudoDst" -ForegroundColor Green
} else {
  Write-Host "AVISO: site_content.json nao existe em $exportDir" -ForegroundColor Yellow
}

# ---- 3.1) Custom site files (HTML/CSS/JS)

if (Test-Path $customDir) {

  Write-Host "3.1) Aplicando arquivos customizados..." -ForegroundColor Cyan

  $customFiles = @(

    @{ Src = (Join-Path $customDir "index.html"); Dst = (Join-Path $repoPath "index.html"); Git = "index.html" },

    @{ Src = (Join-Path $customDir "sobre.html"); Dst = (Join-Path $repoPath "sobre.html"); Git = "sobre.html" },

    @{ Src = (Join-Path $customDir "avisos.css"); Dst = (Join-Path $repoPath "css\avisos.css"); Git = "css/avisos.css" },

    @{ Src = (Join-Path $customDir "site_content.js"); Dst = (Join-Path $repoPath "js\site_content.js"); Git = "js/site_content.js" },

    @{ Src = (Join-Path $customDir "vitrine.css"); Dst = (Join-Path $repoPath "css\vitrine.css"); Git = "css/vitrine.css" },

    @{ Src = (Join-Path $customDir "vitrine.js"); Dst = (Join-Path $repoPath "js\vitrine.js"); Git = "js/vitrine.js" }

  )

  foreach ($file in $customFiles) {

    if (Test-Path $file.Src) {

      Copy-Item $file.Src $file.Dst -Force

      git -C $repoPath add $file.Git | Out-Null

      Write-Host "OK custom: $($file.Git)" -ForegroundColor Green

    }

  }

}




# ---- 4) (Opcional) Exportar imagens e publicar
if ($Mode -eq "FULL") {
  Write-Host "4) FULL: Exportando imagens..." -ForegroundColor Cyan

  if (!(Test-Path $pyExport)) { throw "Python script nao encontrado: $pyExport" }

  # Importante: sem --overwrite (n�o regrava tudo) -> r�pido e n�o suja o git
  & $python $pyExport `
    --main-db "$mainDb" `
    --aux-db  "$auxDb" `
    --out-dir "$imgDir"

  if ($LASTEXITCODE -ne 0) { throw "Falha exportar_imagens_produtos.py (exit $LASTEXITCODE)" }

  git -C $repoPath add "img/produtos" | Out-Null
}

# ---- 5) Commit/push se tiver mudan�a
Write-Host "5) Commit/push..." -ForegroundColor Cyan

$changes = git -C $repoPath status --porcelain
if ([string]::IsNullOrWhiteSpace($changes)) {
  Write-Host "Nada novo pra publicar." -ForegroundColor Green
  exit 0
}

$stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
git -C $repoPath commit -m "Update site ($Mode) - $stamp" | Out-Null
git -C $repoPath push origin main | Out-Null

Write-Host "Publicado com sucesso." -ForegroundColor Green


