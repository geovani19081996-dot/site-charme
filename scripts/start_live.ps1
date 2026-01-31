# ==========================================
# CHARME | START LIVE (local)
# Inicia serve_live.py + run_live_loop.ps1 em background
# ==========================================

$ErrorActionPreference = "Stop"

$logDir = "C:\Charme\logs"
if (!(Test-Path $logDir)) { New-Item -ItemType Directory -Force -Path $logDir | Out-Null }

$serverOut = Join-Path $logDir "live_server.out.log"
$serverErr = Join-Path $logDir "live_server.err.log"
$loopOut = Join-Path $logDir "live_loop.out.log"
$loopErr = Join-Path $logDir "live_loop.err.log"

function Resolve-PythonCmd {
  $cmdPython = Get-Command python -ErrorAction SilentlyContinue
  if ($cmdPython -and $cmdPython.Source -notlike "*WindowsApps*") {
    return @{ Exe = $cmdPython.Source; Args = "" }
  }

  $cmdPy = Get-Command py -ErrorAction SilentlyContinue
  if ($cmdPy) {
    return @{ Exe = $cmdPy.Source; Args = "-3" }
  }

  $candidates = Get-ChildItem -Path "C:\Users\*\AppData\Local\Programs\Python\Python3*\python.exe" -ErrorAction SilentlyContinue |
    Sort-Object -Property FullName -Descending
  if ($candidates) {
    return @{ Exe = $candidates[0].FullName; Args = "" }
  }

  throw "Python nao encontrado (python/py)"
}

$pyInfo = Resolve-PythonCmd
$pythonExe = $pyInfo.Exe
$pythonArgs = $pyInfo.Args

$servePy = "C:\Charme\git\site-charme\scripts\serve_live.py"
$loopPs1 = "C:\Charme\git\site-charme\scripts\run_live_loop.ps1"

if (!(Test-Path $servePy)) { throw "Nao achei: $servePy" }
if (!(Test-Path $loopPs1)) { throw "Nao achei: $loopPs1" }

try {
  $procs = Get-CimInstance Win32_Process -Filter "Name='python.exe' or Name='pythonw.exe' or Name='py.exe' or Name='powershell.exe'" `
    -ErrorAction SilentlyContinue
  foreach ($p in $procs) {
    if (-not $p.CommandLine) { continue }
    if ($p.CommandLine -like "*serve_live.py*" -or $p.CommandLine -like "*run_live_loop.ps1*") {
      Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
    }
  }
} catch {
  # Best effort, ignore
}

$serverArgs = @()
if ($pythonArgs) { $serverArgs += $pythonArgs }
$serverArgs += "`"$servePy`""
Start-Process -FilePath $pythonExe -ArgumentList ($serverArgs -join " ") -WorkingDirectory "C:\Charme\git\site-charme\scripts" -WindowStyle Hidden `
  -RedirectStandardOutput $serverOut -RedirectStandardError $serverErr
Start-Process -FilePath "powershell.exe" -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$loopPs1`"" `
  -WorkingDirectory "C:\Charme\git\site-charme\scripts" -WindowStyle Hidden -RedirectStandardOutput $loopOut -RedirectStandardError $loopErr

Write-Host "LIVE iniciado."
