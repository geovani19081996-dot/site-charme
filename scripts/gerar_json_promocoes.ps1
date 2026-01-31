Write-Host "Executando exportacao de PROMOCOES..." -ForegroundColor Cyan

function Invoke-WithRetry {
    param(
        [scriptblock]$Action,
        [string]$Label = "acao",
        [int]$Retries = 8,
        [int]$DelayMs = 250
    )
    for ($i = 0; $i -lt $Retries; $i++) {
        try {
            return & $Action
        } catch {
            if ($i -ge ($Retries - 1)) { throw "$Label falhou: $($_.Exception.Message)" }
            Start-Sleep -Milliseconds $DelayMs
        }
    }
}

function New-SharedStreamReader {
    param([string]$Path)
    $fs = [System.IO.File]::Open($Path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
    return New-Object System.IO.StreamReader($fs, [System.Text.Encoding]::Default)
}

function Write-TextSafe {
    param(
        [string]$Path,
        [string]$Content,
        [System.Text.Encoding]$Encoding
    )
    $tmp = "$Path.tmp"
    Invoke-WithRetry { [System.IO.File]::WriteAllText($tmp, $Content, $Encoding) } "Escrever $tmp"
    Invoke-WithRetry { Move-Item -Path $tmp -Destination $Path -Force } "Atualizar $Path"
}

# Caminho do TXT gerado pelo isql
$arquivoTxt = "C:\Charme\export\promocoes_site.txt"
$arquivoTxtTmp = Join-Path "C:\Charme\export" ("promocoes_site_tmp_{0}.txt" -f (Get-Date -Format "yyyyMMdd_HHmmss_fff"))

# Se o TXT ja existir de execucoes anteriores, apaga para nao acumular linhas
if (Test-Path $arquivoTxt) {
    try {
        Remove-Item $arquivoTxt -Force
    } catch {
        Write-Host "Aviso: nao foi possivel remover $arquivoTxt (em uso)." -ForegroundColor Yellow
    }
}

# 1) Rodar o isql para gerar o promocoes_site.txt
$isql = "C:\Program Files\Firebird\Firebird_5_0\isql.exe"
if (!(Test-Path $isql)) { $isql = "C:\Program Files\Firebird\Firebird_3_0\isql.exe" }
if (!(Test-Path $isql)) { throw "isql.exe nao encontrado (Firebird_5_0/Firebird_3_0)" }

& $isql `
  -q `
  -user SYSDBA `
  -password masterkey `
  -database "C:\Celta Sistemas\CELTA.FDB" `
  -i "C:\Charme\export\promocoes_site.sql" `
  -o $arquivoTxtTmp

if (-not (Test-Path $arquivoTxtTmp)) {
    Write-Host "ERRO: promocoes_site.txt nao encontrado." -ForegroundColor Red
    exit 1
}

try {
    Invoke-WithRetry { Copy-Item $arquivoTxtTmp $arquivoTxt -Force } "Copiar $arquivoTxtTmp"
} catch {
    Write-Host "Aviso: nao foi possivel atualizar $arquivoTxt (em uso)." -ForegroundColor Yellow
}

Write-Host "Lendo arquivo texto: $arquivoTxtTmp"


# Configuracao para parse de numeros com ponto como separador decimal
$cultura = [System.Globalization.CultureInfo]::InvariantCulture
$estilo  = [System.Globalization.NumberStyles]::Any

# Dicionario: chave = "PROM_CODIGO-PRO_CODIGO"
$itensPorPromoProduto = @{}

$reader = Invoke-WithRetry { New-SharedStreamReader $arquivoTxtTmp } "Abrir $arquivoTxtTmp"
try {
    while (($linha = $reader.ReadLine()) -ne $null) {
    $linha = $linha.Trim()
    if ([string]::IsNullOrWhiteSpace($linha)) {
        continue
    }

    $partes = $linha.Split('|')

    if ($partes.Count -lt 18) {
        Write-Host "Linha ignorada (colunas insuficientes): $linha" -ForegroundColor Yellow
        continue
    }

    # Mapeando as colunas (na ordem do SELECT)
    $empresa        = [int]$partes[0]
    $promoCodigo    = [int]$partes[1]
    $promoDescricao = $partes[2].Trim()
    $dataInicialStr = $partes[3].Trim()
    $dataFinalStr   = $partes[4].Trim()
    $durarEstoque   = $partes[5].Trim() -eq 'S'
    $somenteAvista  = $partes[6].Trim() -eq 'S'
    $ativaFlag      = $partes[7].Trim() -eq 'S'
    $proCodigo      = [int]$partes[8]
    $proDescricao   = $partes[9].Trim()
    $descResumida   = $partes[10].Trim()
    $unidade        = $partes[11].Trim()

    # ---- Conversao de numeros (preco_normal, preco_promo, estoque) ----
    $precoNormalTextoBruto = $partes[12].Trim()
    $precoPromoTextoBruto  = $partes[13].Trim()
    $estoqueTextoBruto     = $partes[14].Trim()

    $precoNormalTexto = $precoNormalTextoBruto.Replace(',', '.')
    $precoPromoTexto  = $precoPromoTextoBruto.Replace(',', '.')
    $estoqueTexto     = $estoqueTextoBruto.Replace(',', '.')

    [decimal]$precoNormal = 0
    [decimal]$precoPromo  = 0
    [decimal]$estoque     = 0

    [decimal]::TryParse($precoNormalTexto, $estilo, $cultura, [ref]$precoNormal) | Out-Null
    [decimal]::TryParse($precoPromoTexto,  $estilo, $cultura, [ref]$precoPromo)  | Out-Null
    [decimal]::TryParse($estoqueTexto,     $estilo, $cultura, [ref]$estoque)     | Out-Null

    $grupo      = if ($partes[15]) { $partes[15].Trim() } else { "Sem grupo" }
    $subgrupo   = if ($partes[16]) { $partes[16].Trim() } else { "Sem subgrupo" }
    $imagemNome = $partes[17].Trim()  # ex: "339.jpg"

    # Conversoes de data
    $dataInicial = $null
    $dataFinal   = $null

    if ($dataInicialStr) {
        try { $dataInicial = [datetime]::Parse($dataInicialStr) } catch { $dataInicial = $null }
    }
    if ($dataFinalStr) {
        try { $dataFinal = [datetime]::Parse($dataFinalStr) } catch { $dataFinal = $null }
    }

    # Chave para agrupar loja1 + loja2 do MESMO produto na MESMA promocao
    $chave = "$promoCodigo-$proCodigo"

    if (-not $itensPorPromoProduto.ContainsKey($chave)) {
        $obj = [ordered]@{
            promo_codigo        = $promoCodigo
            promo_nome          = $promoDescricao
            data_inicio         = if ($dataInicial) { $dataInicial.ToString("yyyy-MM-dd") } else { $null }
            data_fim            = if ($dataFinal)   { $dataFinal.ToString("yyyy-MM-dd") } else { $null }
            duracao_estoque     = $durarEstoque
            somente_a_vista     = $somenteAvista
            dias_restantes      = $null  # calcular depois
            codigo              = $proCodigo
            nome                = $proDescricao
            descricao_resumida  = $descResumida
            unidade             = $unidade
            preco_normal        = [math]::Round([double]$precoNormal, 2)
            preco_promo         = [math]::Round([double]$precoPromo,  2)
            desconto_percentual = $null  # calcular depois
            estoque_loja1       = 0.0
            estoque_loja2       = 0.0
            categoria           = $grupo
            subcategoria        = $subgrupo
            imagem              = $imagemNome
        }

        $itensPorPromoProduto[$chave] = New-Object PSObject -Property $obj
    }

    $item = $itensPorPromoProduto[$chave]

    if ($empresa -eq 1) {
        $item.estoque_loja1 += [double]$estoque
    }
    elseif ($empresa -eq 2) {
        $item.estoque_loja2 += [double]$estoque
    }
    }
} finally {
    $reader.Dispose()
}

# 2) Calcular dias_restantes e desconto_percentual
$hoje = Get-Date

foreach ($item in $itensPorPromoProduto.Values) {
    # dias_restantes
    if ($item.data_fim -and -not $item.duracao_estoque) {
        try {
            $dataFim = [datetime]::Parse($item.data_fim)
            $dias = [int][math]::Ceiling(($dataFim - $hoje).TotalDays)

            if ($dias -lt 0) { $dias = 0 }

            $item.dias_restantes = $dias
        } catch {
            $item.dias_restantes = $null
        }
    }
    else {
        # DURAR_ESTOQUE = 'S' ou sem data_fim -> deixa null
        $item.dias_restantes = $null
    }

    # desconto_percentual (so calcula se os dois precos > 0)
    if ($item.preco_normal -gt 0 -and $item.preco_promo -gt 0) {
        $item.desconto_percentual =
            [math]::Round((1 - ($item.preco_promo / $item.preco_normal)) * 100, 1)
    }
}

# 3) Ordenar e gerar JSON
$listaFinal = @($itensPorPromoProduto.Values | Sort-Object promo_codigo, nome)

# Caminhos de saída
$arquivoJsonSite   = "C:\Charme\git\site-charme\data\promocoes_site.json"
$arquivoJsonBackup = "C:\Charme\export\promocoes_site.json"

# Garante que a pasta do site existe
$dirSiteData = Split-Path $arquivoJsonSite -Parent
if (-not (Test-Path $dirSiteData)) {
    Write-Host "ERRO: Pasta do site nao encontrada: $dirSiteData" -ForegroundColor Red
    exit 1
}

# Gera o JSON em memoria uma vez
$json = ConvertTo-Json -Depth 5 -InputObject $listaFinal
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

# Salva nos dois lugares, em UTF-8 sem BOM
Write-TextSafe -Path $arquivoJsonSite -Content $json -Encoding $utf8NoBom
Write-TextSafe -Path $arquivoJsonBackup -Content $json -Encoding $utf8NoBom

Write-Host "JSON de promocoes gerado para o site em: $arquivoJsonSite" -ForegroundColor Green
Write-Host "Copia de backup gerada em: $arquivoJsonBackup" -ForegroundColor Green
Write-Host "Total de itens de promocao: $($listaFinal.Count)" -ForegroundColor Green

Invoke-WithRetry { Remove-Item $arquivoTxtTmp -Force -ErrorAction SilentlyContinue } "Remover $arquivoTxtTmp"




