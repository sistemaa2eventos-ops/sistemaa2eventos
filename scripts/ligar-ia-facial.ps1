<#
  NZT Intelligent Control System — liga os motores da IA de rastreamento facial
  no servidor local do evento e fica vigiando (religa o que cair).

  Uso:  ligar-ia-facial.bat                     liga tudo e vigia
        ligar-ia-facial.bat parar               desliga vigia, motor de IA e agente local
        ligar-ia-facial.bat instalar-autostart  ativa inicialização automática no login do Windows
        ligar-ia-facial.bat remover-autostart   remove inicialização automática

  Peças:
    1. Câmera      OBS com servidor RTSP em localhost:8554 ou leitura direta da Webcam USB (fallback automático)
    2. Motor de IA backend/microservice-face-python (porta 8000): InsightFace + FAISS,
                   carrega os rostos do Supabase, lê as câmeras e reconhece quem passa
                   (perfil e ajustes vêm do painel: Configurações > IA facial)
    3. Agente local backend/agent-local: conexão de saída com o servidor na nuvem; leva ao painel
                   a IA facial, as câmeras e os leitores faciais da rede do evento
                   (só sobe se backend/agent-local/.env tiver AGENT_TOKEN)
#>
param([string]$Acao = 'ligar')

$ErrorActionPreference = 'Stop'
$Raiz      = Split-Path -Parent $PSScriptRoot
$DirMotor  = Join-Path $Raiz 'backend\microservice-face-python'
$DirAgente = Join-Path $Raiz 'backend\agent-local'
$DirLogs   = Join-Path $Raiz 'logs\ia-facial'
$PortaMotor = 8000
$PortaCamera = 8554
$UrlSaude  = "http://127.0.0.1:$PortaMotor/health"
$IntervaloVigia = 15      # segundos entre verificações
$FalhasParaReiniciar = 4  # verificações seguidas sem resposta antes de reiniciar o motor
$EsperaCargaModelo = 180  # segundos para o InsightFace carregar

try { $Host.UI.RawUI.WindowTitle = 'NZT - IA de rastreamento facial' } catch {}
New-Item -ItemType Directory -Force $DirLogs | Out-Null
$LogVigia = Join-Path $DirLogs ("vigia-{0:yyyyMMdd}.log" -f (Get-Date))
# Logs com mais de 7 dias saem (cada reinício do motor cria um arquivo novo)
Get-ChildItem $DirLogs -File -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-7) } |
    Remove-Item -Force -ErrorAction SilentlyContinue

function Escrever([string]$msg, [string]$cor = 'Gray') {
    $linha = "[{0:HH:mm:ss}] {1}" -f (Get-Date), $msg
    Write-Host $linha -ForegroundColor $cor
    Add-Content -Path $LogVigia -Value $linha -Encoding UTF8
}

function Ler-Env([string]$arquivo) {
    $vars = @{}
    if (Test-Path $arquivo) {
        foreach ($l in Get-Content $arquivo -Encoding UTF8) {
            if ($l -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
                $vars[$matches[1]] = $matches[2].Trim().Trim('"').Trim("'")
            }
        }
    }
    return $vars
}

function Pid-NaPorta([int]$porta) {
    $c = Get-NetTCPConnection -LocalPort $porta -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($c) { return [int]$c.OwningProcess } else { return $null }
}

function Saude-Motor {
    try { return Invoke-RestMethod -Uri $UrlSaude -TimeoutSec 5 } catch { return $null }
}

# Python que consegue rodar o motor (numpy/faiss/insightface íntegros).
# venv-ia: com placa de vídeo (DirectML, ver requirements-windows-gpu.txt). Os demais são reserva.
function Achar-Python {
    $candidatos = @(
        (Join-Path $DirMotor 'venv-ia\Scripts\python.exe'),
        (Join-Path $DirMotor 'venv\Scripts\python.exe'),
        (Join-Path $Raiz 'venv\Scripts\python.exe')
    )
    $ErrorActionPreference = 'Continue'
    foreach ($py in $candidatos) {
        if (-not (Test-Path $py)) { continue }
        & $py -I -c "import numpy, faiss, cv2, insightface, onnxruntime, fastapi, uvicorn, loguru" 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) { return $py }
    }
    return $null
}

# ---------------------------------------------------------------- autostart
if ($Acao -eq 'instalar-autostart') {
    $startup = [Environment]::GetFolderPath('Startup')
    $atalho  = Join-Path $startup 'NZT-IA-Facial.lnk'
    $vbs     = Join-Path $PSScriptRoot 'iniciar-ia-oculto.vbs'
    $conteudoVbs = @"
Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "$Raiz"
WshShell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -File ""$PSCommandPath""", 0, False
"@
    [System.IO.File]::WriteAllText($vbs, $conteudoVbs, [System.Text.Encoding]::ASCII)
    $wsh     = New-Object -ComObject WScript.Shell
    $lnk     = $wsh.CreateShortcut($atalho)
    $lnk.TargetPath       = 'wscript.exe'
    $lnk.Arguments        = "`"$vbs`""
    $lnk.WorkingDirectory = $Raiz
    $lnk.Description      = 'NZT Intelligent Control System - IA de rastreamento facial e Agente Local'
    $lnk.Save()
    Escrever "Inicialização automática ativada em: $atalho" 'Green'
    exit 0
}
if ($Acao -eq 'remover-autostart') {
    $atalho = Join-Path ([Environment]::GetFolderPath('Startup')) 'NZT-IA-Facial.lnk'
    if (Test-Path $atalho) { Remove-Item $atalho -Force; Escrever 'Inicialização automática removida.' 'Yellow' }
    else { Escrever 'Inicialização automática não estava instalada.' 'Gray' }
    exit 0
}

function Outros-Vigias {
    $meusPids = @($PID)
    $atual = Get-CimInstance Win32_Process -Filter "ProcessId=$PID" -ErrorAction SilentlyContinue
    if ($atual -and $atual.ParentProcessId) { $meusPids += [int]$atual.ParentProcessId }
    Get-CimInstance Win32_Process -Filter "Name='powershell.exe' or Name='pwsh.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.ProcessId -notin $meusPids -and $_.CommandLine -match 'ligar-ia-facial\.ps1' }
}

# ---------------------------------------------------------------- parar
if ($Acao -eq 'parar') {
    Outros-Vigias | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue; Escrever "Vigia desligado (PID $($_.ProcessId))." 'Yellow' }
    $p = Pid-NaPorta $PortaMotor
    if ($p) { Stop-Process -Id $p -Force; Escrever "Motor de IA desligado (PID $p)." 'Yellow' }
    else { Escrever 'Motor de IA já estava desligado.' }
    Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -match 'agent\.js' } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force; Escrever "Agente local desligado (PID $($_.ProcessId))." 'Yellow' }
    exit 0
}

# Evitar duas instâncias do vigia rodando ao mesmo tempo
$outroVigia = Outros-Vigias | Select-Object -First 1
if ($outroVigia -and $Acao -ne 'unico') {
    Escrever "Vigia já está em execução (PID $($outroVigia.ProcessId)). Garantindo que os serviços estejam ativos..." 'Cyan'
    $Acao = 'unico'
}

Write-Host ''
Write-Host '  ==========================================================' -ForegroundColor Cyan
Write-Host '    NZT Intelligent Control System - IA de rastreamento facial' -ForegroundColor Cyan
Write-Host '  ==========================================================' -ForegroundColor Cyan
Write-Host ''

# ---------------------------------------------------------------- 1. câmera
function Garantir-Camera {
    if (Pid-NaPorta $PortaCamera) { Escrever "[1/3] Câmera: vídeo RTSP disponível em localhost:$PortaCamera." 'Green'; return }
    $obs = 'C:\Program Files\obs-studio\bin\64bit\obs64.exe'
    if (Test-Path $obs) {
        Escrever '[1/3] Câmera: abrindo o OBS (servidor RTSP)...' 'Yellow'
        Start-Process -FilePath $obs -WorkingDirectory (Split-Path $obs) -ArgumentList '--minimize-to-tray' -WindowStyle Minimized
        for ($i = 0; $i -lt 15 -and -not (Pid-NaPorta $PortaCamera); $i++) { Start-Sleep 1 }
    }
    if (Pid-NaPorta $PortaCamera) { Escrever "[1/3] Câmera: vídeo RTSP disponível em localhost:$PortaCamera." 'Green' }
    else { Escrever "[1/3] Câmera: RTSP em localhost:$PortaCamera indisponível; o Motor de IA usará leitura direta da Webcam USB (fallback automático)." 'Cyan' }
}

# ---------------------------------------------------------------- 2. motor de IA
$script:Python = $null
$script:ProcMotor = $null

function Iniciar-Motor {
    if (-not $script:Python) { $script:Python = Achar-Python }
    if (-not $script:Python) {
        Escrever '[2/3] Motor de IA: nenhum Python com as bibliotecas da IA. Siga backend\microservice-face-python\requirements-windows-gpu.txt (cria o venv-ia).' 'Red'
        return $false
    }
    # onnxruntime só-CPU instalado junto com o DirectML: a IA pode cair na CPU (12x mais lenta)
    $ErrorActionPreference = 'Continue'
    $pacotes = & $script:Python -I -c "import importlib.metadata as m; print(' '.join(sorted(d.metadata['Name'].lower() for d in m.distributions() if d.metadata['Name'] and d.metadata['Name'].lower().startswith('onnxruntime'))))" 2>$null
    $ErrorActionPreference = 'Stop'
    if ("$pacotes" -match '(^| )onnxruntime( |$)' -and "$pacotes" -match 'onnxruntime-directml') {
        Escrever '      Atenção: "onnxruntime" (só CPU) está instalado junto com o "onnxruntime-directml". Rode: venv-ia\Scripts\pip uninstall -y onnxruntime  e depois  venv-ia\Scripts\pip install --force-reinstall --no-deps onnxruntime-directml==1.24.4' 'Yellow'
    }

    # Credenciais: .env do microservice; o que faltar vem do .env do backend
    $envMotor = Ler-Env (Join-Path $DirMotor '.env')
    $envApi   = Ler-Env (Join-Path $Raiz 'backend\api-nodejs\.env')
    foreach ($k in 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY') {
        $v = if ($envMotor[$k]) { $envMotor[$k] } else { $envApi[$k] }
        if ($v) { Set-Item "env:$k" $v }
    }
    if (-not $env:SUPABASE_SERVICE_ROLE_KEY) {
        Escrever '[2/3] Motor de IA: SUPABASE_SERVICE_ROLE_KEY não encontrada (backend\api-nodejs\.env). Sem ela a IA não carrega os rostos cadastrados.' 'Red'
    }
    $env:PYTHONUNBUFFERED = '1'
    $env:PYTHONIOENCODING = 'utf-8'
    Remove-Item Env:PYTHONPATH -ErrorAction SilentlyContinue

    $carimbo = '{0:yyyyMMdd-HHmmss}' -f (Get-Date)
    $saida = Join-Path $DirLogs "motor-$carimbo.log"
    $erros = Join-Path $DirLogs "motor-$carimbo-erros.log"
    Escrever "[2/3] Motor de IA: iniciando (carregar o modelo leva até 1-2 min)..." 'Yellow'
    $script:ProcMotor = Start-Process -FilePath $script:Python -ArgumentList '-I', 'src\main.py' `
        -WorkingDirectory $DirMotor -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput $saida -RedirectStandardError $erros
    # Prioridade acima do normal: navegador/OBS abertos no mesmo PC não atrasam o reconhecimento
    try { $script:ProcMotor.PriorityClass = 'AboveNormal' } catch {}

    $limite = (Get-Date).AddSeconds($EsperaCargaModelo)
    while ((Get-Date) -lt $limite) {
        Start-Sleep 3
        if ($script:ProcMotor.HasExited) {
            Escrever "[2/3] Motor de IA: fechou durante a carga (código $($script:ProcMotor.ExitCode)). Veja $erros" 'Red'
            Get-Content $erros -Tail 8 -ErrorAction SilentlyContinue | ForEach-Object { Escrever "      $_" 'DarkRed' }
            return $false
        }
        if (Saude-Motor) { Mostrar-Motor; return $true }
    }
    Escrever "[2/3] Motor de IA: não respondeu em $EsperaCargaModelo s. Veja $saida" 'Red'
    return $false
}

function Mostrar-Motor {
    $s = Saude-Motor
    if (-not $s) { return }
    $faiss = $null
    try { $faiss = Invoke-RestMethod "http://127.0.0.1:$PortaMotor/api/engine/status" -TimeoutSec 5 } catch {}
    $hw = if ($faiss -and $faiss.hardware_acceleration) { $faiss.hardware_acceleration } else { 'CPU' }
    Escrever ("[2/3] Motor de IA: LIGADO em http://localhost:{0}  |  {1}  |  perfil {2}  |  {3} rostos indexados  |  {4}/{5} câmera(s) com vídeo" -f `
        $PortaMotor, $hw, $s.perfil, $s.registered_persons, $s.cameras_com_video, $s.cameras_em_uso) 'Green'
    if ($s.engine -ne 'insightface_onnx') { Escrever '      Atenção: InsightFace não carregou; o motor está em modo simulado.' 'Red' }
    if ($hw -eq 'CPU') { Escrever '      Atenção: IA rodando na CPU (lenta). Veja backend\microservice-face-python\requirements-windows-gpu.txt para usar a placa de vídeo.' 'Yellow' }
    if ($faiss -and $faiss.faiss_total_vectors -eq 0) { Escrever '      Atenção: nenhum rosto no índice. Confira a chave do Supabase e se há pessoas com biometria.' 'Yellow' }
}

function Garantir-Motor {
    if (Saude-Motor) { Escrever '[2/3] Motor de IA: já estava ligado, mantendo.' 'Green'; Mostrar-Motor; return }
    $ocupante = Pid-NaPorta $PortaMotor
    if ($ocupante) {
        $nome = (Get-Process -Id $ocupante -ErrorAction SilentlyContinue).ProcessName
        if ($nome -ne 'python') {
            Escrever "[2/3] Motor de IA: a porta $PortaMotor está ocupada por '$nome' (PID $ocupante). Libere a porta e rode de novo." 'Red'
            return
        }
        Escrever "[2/3] Motor de IA: processo travado na porta $PortaMotor (PID $ocupante), reiniciando." 'Yellow'
        Stop-Process -Id $ocupante -Force; Start-Sleep 2
    }
    [void](Iniciar-Motor)
}

# ---------------------------------------------------------------- 3. agente local
$script:ProcAgente = $null
$script:AgenteAtivo = $false

function Agente-Rodando {
    [bool](Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'agent\.js' })
}

function Iniciar-Agente {
    $carimbo = '{0:yyyyMMdd-HHmmss}' -f (Get-Date)
    $script:ProcAgente = Start-Process -FilePath 'node' -ArgumentList 'src\agent.js' -WorkingDirectory $DirAgente `
        -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput (Join-Path $DirLogs "agente-$carimbo.log") `
        -RedirectStandardError (Join-Path $DirLogs "agente-$carimbo-erros.log")
}

function Garantir-Agente {
    $envAgente = Ler-Env (Join-Path $DirAgente '.env')
    if (-not $envAgente['AGENT_TOKEN']) {
        Escrever '[3/3] Agente local: não configurado, então o painel na nuvem NÃO enxerga a IA nem as câmeras. Para ativar: copie backend\agent-local\.env.example para .env e cole o token gerado no painel (Configurações > Dispositivos > Agentes locais).' 'Red'
        return
    }
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Escrever '[3/3] Agente local: Node.js não instalado.' 'Red'; return }
    if (-not (Test-Path (Join-Path $DirAgente 'node_modules'))) {
        Escrever '[3/3] Agente local: instalando dependências...' 'Yellow'
        $ErrorActionPreference = 'Continue'
        Push-Location $DirAgente; try { npm ci --omit=dev 2>&1 | Out-Null } finally { Pop-Location }
    }
    $script:AgenteAtivo = $true
    if (Agente-Rodando) { Escrever '[3/3] Agente local: já estava ligado, mantendo.' 'Green'; return }
    Iniciar-Agente
    Start-Sleep 3
    if ($script:ProcAgente.HasExited) { Escrever "[3/3] Agente local: fechou ao iniciar (código $($script:ProcAgente.ExitCode)). Veja logs\ia-facial\agente-*-erros.log" 'Red' }
    else { Escrever "[3/3] Agente local: LIGADO, levando IA, câmeras e leitores ao painel em $($envAgente['VPS_URL'])." 'Green' }
}

# ---------------------------------------------------------------- execução
Garantir-Camera
Garantir-Motor
Garantir-Agente

if ($Acao -eq 'unico') {
    exit 0
}

Write-Host ''
Escrever "Vigia ativo: verifica a cada $IntervaloVigia s e religa o que cair. Mantenha esta janela aberta durante o evento." 'Cyan'
Escrever "Logs em $DirLogs   |   Para desligar: rode 'ligar-ia-facial.bat parar'." 'DarkGray'
Write-Host ''

$falhas = 0
while ($true) {
    Start-Sleep $IntervaloVigia

    if (Saude-Motor) {
        if ($falhas -gt 0) { Escrever 'Motor de IA voltou a responder.' 'Green' }
        $falhas = 0
    } else {
        $falhas++
        Escrever "Motor de IA sem resposta ($falhas/$FalhasParaReiniciar)." 'Yellow'
        if ($falhas -ge $FalhasParaReiniciar -or -not (Pid-NaPorta $PortaMotor)) {
            Escrever 'Reiniciando o motor de IA...' 'Yellow'
            $falhas = 0
            Garantir-Motor
        }
    }

    if ($script:AgenteAtivo -and -not (Agente-Rodando)) {
        Escrever 'Agente local caiu, religando...' 'Yellow'
        Iniciar-Agente
    }
}
