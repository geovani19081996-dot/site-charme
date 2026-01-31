# ==========================================
# RUN ALL (FAST) - Charme Site (Servidor)
# 1) Gera JSON promo��es
# 2) Gera JSON produtos
# 3) Publica s� JSON (r�pido)
# ==========================================

$ErrorActionPreference = "Stop"
Write-Host "=== CHARME | RUN FAST ===" -ForegroundColor Cyan

Write-Host "1/3 Gerando JSON de promocoes..." -ForegroundColor Cyan
powershell -ExecutionPolicy Bypass -File "C:\Charme\git\site-charme\scripts\gerar_json_promocoes.ps1"
if ($LASTEXITCODE -ne 0) { throw "Falha ao gerar JSON de promocoes (exit $LASTEXITCODE)" }

Write-Host "2/3 Gerando JSON de produtos..." -ForegroundColor Cyan
powershell -ExecutionPolicy Bypass -File "C:\Charme\git\site-charme\scripts\gerar_json_produtos.ps1"
if ($LASTEXITCODE -ne 0) { throw "Falha ao gerar JSON de produtos (exit $LASTEXITCODE)" }

Write-Host "3/3 Publicando (JSON only)..." -ForegroundColor Cyan
powershell -ExecutionPolicy Bypass -File "C:\Charme\git\site-charme\scripts\publicar_promocao_site.ps1" -Mode JSON
if ($LASTEXITCODE -ne 0) { throw "Falha ao publicar JSON (exit $LASTEXITCODE)" }

Write-Host "=== FINALIZADO (FAST) ===" -ForegroundColor Green


