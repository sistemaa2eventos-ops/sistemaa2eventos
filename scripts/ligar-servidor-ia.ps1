<#
  NZT - Servidor de IA central (PC com placa de vídeo, fora da rede do evento)

  Uso:  ligar-servidor-ia.bat          liga o motor de IA e o programa do servidor e fica vigiando
        ligar-servidor-ia.bat parar    desliga os dois

  Peças:
    1. Motor de IA   backend/microservice-face-python (porta 8000, só neste PC, com chave interna).
                     Aqui ele só reconhece rostos enviados pelos eventos (sem câmeras, sem chave do banco).
    2. Servidor      backend/ia-servidor: conexão de SAÍDA para a nuvem (nenhuma porta aberta no
                     roteador). Precisa do backend/ia-servidor/.env com o token gerado no painel.
#>
param([string]$Acao = 'ligar')

$ErrorActionPreference = 'Stop'
$Raiz        = Split-Path -Parent $PSScriptRoot
$DirMotor    = Join-Path $Raiz 'backend\microservice-face-python'
$DirServidor = Join-Path $Raiz 'backend\ia-servidor'
$DirLogs     = Join-Path $Raiz 'logs\servidor-ia'
$PortaMotor  = 8000
$UrlSaude    = "http://127.0.0.1:$PortaMotor/health"
$IntervaloVigia = 15

try { $Host.UI.RawUI.WindowTitle = 'NZT - Servidor de IA central' } catch {}
New-Item -ItemType Directory -Force $DirLogs | Out-Null
$LogVigia = Join-Path $DirLogs ("vigia-{0:yyyyMMdd}.log" -f (Get-Date))
Get-ChildItem $DirLogs -File -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-7) } | Remove-Item -Force -ErrorAction SilentlyContinue

function Escrever([string]$msg, [string]$cor = 'Gray') {
    $linha = "[{0:HH:mm:ss}] {1}" -f (Get-Date), $msg
    Write-Host $linha -ForegroundColor $cor
    Add-Content -Path $LogVigia -Value $linha -Encoding UTF8
}

function Get-PidNaPorta([int]$porta) {
    $c = Get-NetTCPConnection -LocalPort $porta -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($c) { return [int]$c.OwningProcess } else { return $null }
}
function Get-SaudeMotor { try { return Invoke-RestMethod -Uri $UrlSaude -TimeoutSec 5 } catch { return $null } }
function Get-ProcServidor {
    Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -match 'servidor\.js' }
}

function Find-PythonIA {
    $candidatos = @((Join-Path $DirMotor 'venv-ia\Scripts\python.exe'), (Join-Path $DirMotor 'venv\Scripts\python.exe'))
    $ErrorActionPreference = 'Continue'
    foreach ($py in $candidatos) {
        if (-not (Test-Path $py)) { continue }
        & $py -I -c "import numpy, faiss, cv2, insightface, onnxruntime, fastapi, uvicorn, loguru" 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) { return $py }
    }
    return $null
}

if ($Acao -eq 'parar') {
    $p = Get-PidNaPorta $PortaMotor
    if ($p) { Stop-Process -Id $p -Force; Escrever "Motor de IA desligado (PID $p)." 'Yellow' }
    Get-ProcServidor | ForEach-Object { Stop-Process -Id $_.ProcessId -Force; Escrever "Servidor desligado (PID $($_.ProcessId))." 'Yellow' }
    exit 0
}

Write-Host ''
Write-Host '  ==================================================' -ForegroundColor Cyan
Write-Host '    NZT - Servidor de IA central' -ForegroundColor Cyan
Write-Host '  ==================================================' -ForegroundColor Cyan
Write-Host ''

# ---------------------------------------------------------------- pré-requisitos
$envServidor = Join-Path $DirServidor '.env'
if (-not (Test-Path $envServidor)) {
    Escrever 'Falta backend\ia-servidor\.env. Copie o .env.example para .env e cole o token gerado no painel (Configurações > Câmeras e IA facial > Motor de IA > Servidores de IA).' 'Red'
    exit 1
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Escrever 'Node.js não instalado (https://nodejs.org).' 'Red'; exit 1 }
if (-not (Test-Path (Join-Path $DirServidor 'node_modules'))) {
    Escrever 'Instalando dependências do servidor...' 'Yellow'
    $ErrorActionPreference = 'Continue'
    Push-Location $DirServidor; try { npm install --omit=dev 2>&1 | Out-Null } finally { Pop-Location }
    $ErrorActionPreference = 'Stop'
}
$script:Python = Find-PythonIA
if (-not $script:Python) {
    Escrever 'Nenhum Python com as bibliotecas da IA. Siga backend\microservice-face-python\requirements-windows-gpu.txt (cria o venv-ia).' 'Red'
    exit 1
}

# ---------------------------------------------------------------- motor de IA
function Start-Motor {
    # Sem chave do banco: no servidor central os cadastrados chegam pela nuvem, só na memória
    Remove-Item Env:SUPABASE_SERVICE_ROLE_KEY -ErrorAction SilentlyContinue
    Remove-Item Env:SUPABASE_URL -ErrorAction SilentlyContinue
    $env:PYTHONUNBUFFERED = '1'; $env:PYTHONIOENCODING = 'utf-8'
    Remove-Item Env:PYTHONPATH -ErrorAction SilentlyContinue
    $carimbo = '{0:yyyyMMdd-HHmmss}' -f (Get-Date)
    Escrever 'Motor de IA: iniciando (carregar o modelo leva até 1-2 min)...' 'Yellow'
    Start-Process -FilePath $script:Python -ArgumentList '-I', 'src\main.py' -WorkingDirectory $DirMotor -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $DirLogs "motor-$carimbo.log") -RedirectStandardError (Join-Path $DirLogs "motor-$carimbo-erros.log") | Out-Null
    for ($i = 0; $i -lt 60; $i++) {
        Start-Sleep 3
        $s = Get-SaudeMotor
        if ($s) {
            try { (Get-Process -Id (Get-PidNaPorta $PortaMotor)).PriorityClass = 'AboveNormal' } catch {}
            Escrever "Motor de IA: LIGADO ($($s.engine), perfil $($s.perfil))." 'Green'
            return
        }
    }
    Escrever "Motor de IA: não respondeu em 180 s. Veja $DirLogs" 'Red'
}

function Confirm-Motor {
    if (Get-SaudeMotor) { Escrever 'Motor de IA: já estava ligado.' 'Green'; return }
    $p = Get-PidNaPorta $PortaMotor
    if ($p) { Stop-Process -Id $p -Force -ErrorAction SilentlyContinue; Start-Sleep 2 }
    Start-Motor
}

function Start-Servidor {
    $carimbo = '{0:yyyyMMdd-HHmmss}' -f (Get-Date)
    Start-Process -FilePath 'node' -ArgumentList 'src\servidor.js' -WorkingDirectory $DirServidor -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $DirLogs "servidor-$carimbo.log") -RedirectStandardError (Join-Path $DirLogs "servidor-$carimbo-erros.log") | Out-Null
    Escrever 'Servidor: LIGADO (conectando na nuvem; nenhuma porta aberta neste PC).' 'Green'
}

Confirm-Motor
if (-not (Get-ProcServidor)) { Start-Servidor } else { Escrever 'Servidor: já estava ligado.' 'Green' }

Write-Host ''
Escrever "Vigia ativo: verifica a cada $IntervaloVigia s e religa o que cair. Mantenha esta janela aberta." 'Cyan'
Escrever "Logs em $DirLogs   |   Para desligar: ligar-servidor-ia.bat parar" 'DarkGray'
$falhas = 0
while ($true) {
    Start-Sleep $IntervaloVigia
    if (Get-SaudeMotor) { $falhas = 0 } else {
        $falhas++
        if ($falhas -ge 4 -or -not (Get-PidNaPorta $PortaMotor)) { Escrever 'Motor sem resposta, reiniciando...' 'Yellow'; $falhas = 0; Confirm-Motor }
    }
    if (-not (Get-ProcServidor)) { Escrever 'Servidor caiu, religando...' 'Yellow'; Start-Servidor }
}
