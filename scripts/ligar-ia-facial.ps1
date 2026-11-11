<#
  NZT Intelligent Control System — liga os motores da IA de rastreamento facial
  no servidor local do evento e fica vigiando (religa o que cair).

  Uso:  ligar-ia-facial.bat                     verifica compatibilidade, liga tudo e vigia
        ligar-ia-facial.bat verificar           faz apenas a verificação de compatibilidade e recomendações
        ligar-ia-facial.bat parar               desliga vigia, motor de IA e agente local
        ligar-ia-facial.bat instalar-autostart  ativa inicialização automática no login do Windows
        ligar-ia-facial.bat remover-autostart   remove inicialização automática
        ligar-ia-facial.bat instalar-tarefa     (admin) sobe no login por tarefa agendada, reiniciada se falhar
        ligar-ia-facial.bat remover-tarefa      (admin) remove a tarefa agendada

  Peças:
    1. Câmera      OBS com servidor RTSP em localhost:8554 ou leitura direta da Webcam USB (fallback automático)
    2. Motor de IA backend/microservice-face-python (porta 8000): InsightFace + FAISS,
                   carrega os rostos do Supabase, lê as câmeras e reconhece quem passa
                   (perfil e ajustes vêm do painel: Configurações > IA facial)
    3. Agente local backend/agent-local: conexão de saída com o servidor na nuvem; leva ao painel
                   a IA facial, as câmeras e os leitores faciais da rede do evento
                   (só sobe se backend/agent-local/.env tiver AGENT_TOKEN)
#>
param(
    [string]$Acao = 'ligar',
    [string]$Token = '',
    [string]$VpsUrl = '',
    [string]$AgentName = ''
)

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

# Suporte a chamada via protocolo customizado do navegador: nzt-ia://iniciar?token=...&vps=...&name=...
if ($Acao -match '^nzt-ia://') {
    try {
        $uriObj = [System.Uri]$Acao
        $caminho = ($uriObj.Host + $uriObj.AbsolutePath).Trim('/')
        $q = $uriObj.Query.TrimStart('?')
        foreach ($par in ($q -split '&')) {
            if ($par -match '^([^=]+)=(.*)$') {
                $k = [System.Uri]::UnescapeDataString($matches[1])
                $v = [System.Uri]::UnescapeDataString($matches[2])
                if ($k -eq 'token' -and $v) { $Token = $v }
                # Qualquer site pode abrir um link nzt-ia://: só aceita servidor do próprio sistema
                # (senão uma página maliciosa ligaria o agente deste PC a um servidor de terceiros)
                elseif ($k -eq 'vps' -and $v -match '^https://([a-z0-9-]+\.)*nzt\.app\.br/?$|^http://(localhost|127\.0\.0\.1)(:\d+)?/?$') { $VpsUrl = $v }
                elseif ($k -eq 'name' -and $v) { $AgentName = $v }
            }
        }
        $Acao = if ($caminho -eq 'verificar') { 'verificar' } elseif ($caminho -eq 'parar') { 'parar' } else { 'ligar' }
    } catch {
        $Acao = 'ligar'
    }
}

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

function Register-ProtocoloNztIa {
    try {
        $chaveBase = 'HKCU:\Software\Classes\nzt-ia'
        $chaveCmd  = 'HKCU:\Software\Classes\nzt-ia\shell\open\command'
        if (-not (Test-Path $chaveCmd)) { New-Item -Path $chaveCmd -Force | Out-Null }
        Set-ItemProperty -Path $chaveBase -Name '(Default)' -Value 'URL:NZT IA Facial Protocol' -Force
        Set-ItemProperty -Path $chaveBase -Name 'URL Protocol' -Value '' -Force
        $cmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" `"%1`""
        Set-ItemProperty -Path $chaveCmd -Name '(Default)' -Value $cmd -Force
    } catch {}
}
Register-ProtocoloNztIa

if ($Acao -eq 'registrar-protocolo') {
    Escrever 'Protocolo nzt-ia:// registrado no Windows com sucesso.' 'Green'
    exit 0
}

function Read-ArquivoEnv([string]$arquivo) {
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

function Set-TokenAgenteLocal([string]$novoToken, [string]$novaVps, [string]$novoNome) {
    if (-not $novoToken) { return $false }
    $arqEnv = Join-Path $DirAgente '.env'
    $atuais = Read-ArquivoEnv $arqEnv
    $vpsFinal  = if ($novaVps) { $novaVps.TrimEnd('/') } elseif ($atuais['VPS_URL']) { $atuais['VPS_URL'] } else { 'https://painel.nzt.app.br' }
    $nomeFinal = if ($novoNome) { $novoNome } elseif ($atuais['AGENT_NAME']) { $atuais['AGENT_NAME'] } else { "PC-IA-$env:COMPUTERNAME" }
    $iaFinal   = if ($atuais['IA_URL']) { $atuais['IA_URL'] } else { "http://127.0.0.1:$PortaMotor" }
    $mudou     = ($atuais['AGENT_TOKEN'] -ne $novoToken) -or ($atuais['VPS_URL'] -ne $vpsFinal)
    $conteudo  = @(
        "VPS_URL=$vpsFinal",
        "AGENT_TOKEN=$novoToken",
        "AGENT_NAME=$nomeFinal",
        "IA_URL=$iaFinal"
    ) -join "`r`n"
    [System.IO.File]::WriteAllText($arqEnv, "$conteudo`r`n", (New-Object System.Text.UTF8Encoding($false)))
    return $mudou
}

if ($Token) {
    $tokenMudou = Set-TokenAgenteLocal $Token $VpsUrl $AgentName
    if ($tokenMudou) {
        Escrever "Token do Agente Local atualizado para este evento em backend\agent-local\.env." 'Cyan'
        Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
            Where-Object { $_.CommandLine -match 'agent\.js' } |
            ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    }
}

if ($Acao -eq 'reiniciar-agente') {
    Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -match 'agent\.js' } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    $Acao = 'unico'
}

$FlagMotorDesligado = Join-Path $DirAgente '.motor-desligado'
function Test-MotorDesligadoPeloPainel { Test-Path $FlagMotorDesligado }

function Get-PidNaPorta([int]$porta) {
    $c = Get-NetTCPConnection -LocalPort $porta -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($c) { return [int]$c.OwningProcess } else { return $null }
}

function Get-SaudeMotor {
    try { return Invoke-RestMethod -Uri $UrlSaude -TimeoutSec 5 } catch { return $null }
}

# Python que consegue rodar o motor (numpy/faiss/insightface íntegros).
# venv-ia: com placa de vídeo (DirectML, ver requirements-windows-gpu.txt). Os demais são reserva.
function Find-PythonIA {
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

# ---------------------------------------------------------------- tarefa agendada (recomendado)
# No lugar do atalho de Inicialização: a tarefa sobe no login, sem janela, com privilégio de
# administrador, e o Windows a reinicia sozinha se o vigia falhar. Precisa ser instalada como admin.
$NomeTarefa = 'NZT-IA-Facial'
$AtalhoAntigo = Join-Path ([Environment]::GetFolderPath('Startup')) 'NZT-IA-Facial.lnk'

function Test-Administrador {
    $p = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if ($Acao -eq 'instalar-tarefa') {
    if (-not (Test-Administrador)) {
        Escrever 'Esta ação precisa de administrador. Feche esta janela, clique com o botão direito em ligar-ia-facial.bat e escolha "Executar como administrador". Depois rode de novo: ligar-ia-facial.bat instalar-tarefa' 'Red'
        exit 1
    }
    $usuario = "$env:USERDOMAIN\$env:USERNAME"
    $acao = New-ScheduledTaskAction -Execute 'powershell.exe' `
        -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$PSCommandPath`"" -WorkingDirectory $Raiz
    $gatilho = New-ScheduledTaskTrigger -AtLogOn -User $usuario
    $ajustes = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
        -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) `
        -StartWhenAvailable -MultipleInstances IgnoreNew
    $principal = New-ScheduledTaskPrincipal -UserId $usuario -LogonType Interactive -RunLevel Highest
    Register-ScheduledTask -TaskName $NomeTarefa -Action $acao -Trigger $gatilho -Settings $ajustes `
        -Principal $principal -Description 'NZT: motor de IA facial e agente local do evento' -Force | Out-Null
    # Evita dois vigias: o atalho antigo sai quando a tarefa entra
    if (Test-Path $AtalhoAntigo) { Remove-Item $AtalhoAntigo -Force }
    Escrever "Tarefa '$NomeTarefa' instalada: sobe no login de $usuario e é reiniciada se falhar." 'Green'
    Escrever 'Para subir agora sem reiniciar: Start-ScheduledTask -TaskName NZT-IA-Facial' 'DarkGray'
    exit 0
}
if ($Acao -eq 'remover-tarefa') {
    if (-not (Test-Administrador)) { Escrever 'Precisa de administrador para remover a tarefa.' 'Red'; exit 1 }
    if (Get-ScheduledTask -TaskName $NomeTarefa -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $NomeTarefa -Confirm:$false
        Escrever "Tarefa '$NomeTarefa' removida." 'Yellow'
    } else { Escrever 'A tarefa não estava instalada.' 'Gray' }
    exit 0
}

function Get-OutrosVigias {
    $meusPids = @($PID)
    $atual = Get-CimInstance Win32_Process -Filter "ProcessId=$PID" -ErrorAction SilentlyContinue
    if ($atual -and $atual.ParentProcessId) { $meusPids += [int]$atual.ParentProcessId }
    Get-CimInstance Win32_Process -Filter "Name='powershell.exe' or Name='pwsh.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.ProcessId -notin $meusPids -and $_.CommandLine -match 'ligar-ia-facial\.ps1' }
}

# ---------------------------------------------------------------- parar
if ($Acao -eq 'parar') {
    Get-OutrosVigias | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue; Escrever "Vigia desligado (PID $($_.ProcessId))." 'Yellow' }
    $p = Get-PidNaPorta $PortaMotor
    if ($p) { Stop-Process -Id $p -Force; Escrever "Motor de IA desligado (PID $p)." 'Yellow' }
    else { Escrever 'Motor de IA já estava desligado.' }
    Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -match 'agent\.js' } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force; Escrever "Agente local desligado (PID $($_.ProcessId))." 'Yellow' }
    exit 0
}

# Painel desligou o motor de IA do evento (o agente cria .motor-desligado e chama esta ação):
# desliga só o motor; vídeo, gravação e leitores seguem pelo agente
if ($Acao -eq 'parar-motor') {
    $p = Get-PidNaPorta $PortaMotor
    if ($p) { Stop-Process -Id $p -Force -ErrorAction SilentlyContinue; Escrever "Motor de IA desligado pelo painel (PID $p)." 'Yellow' }
    exit 0
}

# Evitar duas instâncias do vigia rodando ao mesmo tempo
$outroVigia = Get-OutrosVigias | Select-Object -First 1
if ($outroVigia -and $Acao -ne 'unico') {
    Escrever "Vigia já está em execução (PID $($outroVigia.ProcessId)). Garantindo que os serviços estejam ativos..." 'Cyan'
    $Acao = 'unico'
}

Write-Host ''
Write-Host '  ==========================================================' -ForegroundColor Cyan
Write-Host '    NZT Intelligent Control System - IA de rastreamento facial' -ForegroundColor Cyan
Write-Host '  ==========================================================' -ForegroundColor Cyan
Write-Host ''

function Invoke-VerificacaoCompatibilidade {
    Escrever '--- VERIFICAÇÃO DE COMPATIBILIDADE DESTE COMPUTADOR ---' 'Cyan'
    $cpu = Get-CimInstance Win32_Processor -ErrorAction SilentlyContinue | Select-Object -First 1
    $cs  = Get-CimInstance Win32_ComputerSystem -ErrorAction SilentlyContinue
    $os  = Get-CimInstance Win32_OperatingSystem -ErrorAction SilentlyContinue
    $gpus = @(Get-CimInstance Win32_VideoController -ErrorAction SilentlyContinue)
    $disco = Get-PSDrive -Name ($Raiz.Substring(0, 1)) -ErrorAction SilentlyContinue

    $cpuNome = if ($cpu) { $cpu.Name.Trim() } else { 'Desconhecido' }
    $cores   = if ($cpu) { [int]$cpu.NumberOfCores } else { 2 }
    $threads = if ($cpu) { [int]$cpu.NumberOfLogicalProcessors } else { 4 }
    $ramGb   = if ($cs) { [math]::Round($cs.TotalPhysicalMemory / 1GB, 1) } else { 0 }
    $ramLivreGb = if ($os) { [math]::Round(($os.FreePhysicalMemory * 1KB) / 1GB, 1) } else { 0 }
    $discoLivreGb = if ($disco) { [math]::Round($disco.Free / 1GB, 1) } else { 0 }

    $corCpu = if ($threads -ge 8) { 'Green' } elseif ($threads -ge 4) { 'Yellow' } else { 'Red' }
    $corRam = if ($ramGb -ge 12) { 'Green' } elseif ($ramGb -ge 7) { 'Yellow' } else { 'Red' }
    $corDisco = if ($discoLivreGb -ge 5) { 'Green' } else { 'Yellow' }

    Escrever "  • Sistema Operacional : $($os.Caption) ($($os.OSArchitecture))" 'Green'
    Escrever "  • Processador (CPU)   : $cpuNome ($cores núcleos / $threads threads)" $corCpu
    Escrever "  • Memória RAM         : $ramGb GB total ($ramLivreGb GB livre agora)" $corRam
    Escrever "  • Espaço em Disco     : $discoLivreGb GB livres" $corDisco

    $temGpuForte = $false
    $temGpuEntrada = $false
    $temGpuIntegrada = $false
    foreach ($g in $gpus) {
        $vramGb = if ($g.AdapterRAM -gt 0) { [math]::Round($g.AdapterRAM / 1GB, 1) } else { 0 }
        $nomeGpu = "$($g.Name)"
        if ($nomeGpu -match 'RTX|GTX 1[60]|GTX [2345]|Radeon RX') {
            $temGpuForte = $true
            Escrever "  • Placa de Vídeo (GPU): $nomeGpu (~$vramGb GB) [Dedicada Forte - DirectML]" 'Green'
        } elseif ($nomeGpu -match 'GeForce MX|GTX|Quadro|Radeon') {
            $temGpuEntrada = $true
            Escrever "  • Placa de Vídeo (GPU): $nomeGpu (~$vramGb GB) [Dedicada Entrada - DirectML]" 'Yellow'
        } elseif ($nomeGpu -match 'Intel|Iris|UHD|HD Graphics|Vega') {
            $temGpuIntegrada = $true
            Escrever "  • Placa de Vídeo (GPU): $nomeGpu [Integrada - DirectML básico]" 'Yellow'
        } else {
            Escrever "  • Placa de Vídeo (GPU): $nomeGpu" 'Gray'
        }
    }

    $pyOk = Find-PythonIA
    if ($pyOk) {
        Escrever "  • Ambiente Python IA  : OK ($pyOk)" 'Green'
    } else {
        Escrever "  • Ambiente Python IA  : Pendente (venv-ia em backend\microservice-face-python)" 'Red'
    }

    $envAgente = Read-ArquivoEnv (Join-Path $DirAgente '.env')
    $temToken  = [bool]$envAgente['AGENT_TOKEN']
    if ($temToken) {
        Escrever '  • Biometrias          : enviadas pelo painel ao agente (sem chave do banco neste PC)' 'Green'
    } else {
        $envMotor = Read-ArquivoEnv (Join-Path $DirMotor '.env')
        $temSupa  = [bool]$envMotor['SUPABASE_SERVICE_ROLE_KEY']
        Escrever ("  • Chave Supabase      : " + $(if ($temSupa) { 'Configurada no .env do motor (modo sem agente)' } else { 'Ausente (configure o agente local)' })) $(if ($temSupa) { 'Yellow' } else { 'Red' })
    }
    $temGo2rtc = Test-Path (Join-Path $DirAgente 'bin\go2rtc.exe')
    $temFfmpeg = Test-Path (Join-Path $DirAgente 'bin\ffmpeg.exe')
    Escrever ("  • Vídeo sem IA        : " + $(if ($temGo2rtc) { 'go2rtc instalado' } else { 'go2rtc será instalado ao ligar' })) $(if ($temGo2rtc) { 'Green' } else { 'Yellow' })
    Escrever ("  • Gravação            : " + $(if ($temFfmpeg) { 'ffmpeg instalado' } else { 'ffmpeg será instalado ao ligar' })) $(if ($temFfmpeg) { 'Green' } else { 'Yellow' })
    Escrever ("  • Token Agente Local  : " + $(if ($temToken) { "Configurado ($($envAgente['AGENT_NAME']))" } else { 'Ausente em backend\agent-local\.env' })) $(if ($temToken) { 'Green' } else { 'Yellow' })

    # Recomendações de configuração baseadas no hardware
    $perfilRec = 'leve'
    $fpsRec    = '15 análises/s'
    $streamRec = 'Sempre o sub-stream (leve)'
    $videosRec = 'até 6 vídeos ao vivo no mosaico'
    $motivoRec = 'Computador de entrada/notebook ou sem GPU dedicada forte: o perfil Leve mantém o reconhecimento fluido sem travar o vídeo.'

    if ($temGpuForte -and $threads -ge 8 -and $ramGb -ge 15) {
        $perfilRec = 'maximo'
        $fpsRec    = '45 análises/s'
        $streamRec = 'Sempre o stream principal (nítido)'
        $videosRec = 'até 16 vídeos ao vivo no mosaico'
        $motivoRec = 'Placa de vídeo dedicada forte + CPU de 8+ threads e 16+ GB RAM detectados.'
    } elseif (($temGpuForte -or $temGpuEntrada) -and $threads -ge 4 -and $ramGb -ge 7.5) {
        if ($temGpuEntrada -and $threads -le 4) {
            $perfilRec = 'leve'
            $fpsRec    = '15 a 20 análises/s'
            $streamRec = 'Sempre o sub-stream (leve) ou Automático (até 3 câmeras)'
            $videosRec = 'até 6 vídeos ao vivo no mosaico'
            $motivoRec = 'Notebook com CPU de 4 threads e GPU MX dedicada: prefira o perfil Leve (ou Equilibrado até 3 câmeras) para não sobrecarregar o processador.'
        } else {
            $perfilRec = 'equilibrado'
            $fpsRec    = '30 análises/s'
            $streamRec = 'Automático (sub-stream no mosaico, principal em tela grande)'
            $videosRec = 'até 9 vídeos ao vivo no mosaico'
            $motivoRec = 'Boa combinação de GPU DirectML e memória RAM para operação equilibrada.'
        }
    }

    Write-Host ''
    Escrever '--- RECOMENDAÇÕES DE CONFIGURAÇÃO PARA ESTE PC ---' 'Cyan'
    Escrever "  ★ Perfil recomendado  : $($perfilRec.ToUpper())" 'Green'
    Escrever "  • Taxa de análise IA  : $fpsRec" 'Gray'
    Escrever "  • Stream para a IA    : $streamRec" 'Gray'
    Escrever "  • Mosaico CFTV        : $videosRec" 'Gray'
    Escrever "  • Diagnóstico         : $motivoRec" 'Cyan'
    Write-Host ''
}

Invoke-VerificacaoCompatibilidade
if ($Acao -eq 'verificar') {
    exit 0
}

# ---------------------------------------------------------------- 1. câmera
function Confirm-Camera {
    if (Get-PidNaPorta $PortaCamera) { Escrever "[1/3] Câmera: vídeo RTSP disponível em localhost:$PortaCamera." 'Green'; return }
    $obs = 'C:\Program Files\obs-studio\bin\64bit\obs64.exe'
    if (Test-Path $obs) {
        Escrever '[1/3] Câmera: abrindo o OBS (servidor RTSP)...' 'Yellow'
        Start-Process -FilePath $obs -WorkingDirectory (Split-Path $obs) -ArgumentList '--minimize-to-tray' -WindowStyle Minimized
        for ($i = 0; $i -lt 15 -and -not (Get-PidNaPorta $PortaCamera); $i++) { Start-Sleep 1 }
    }
    if (Get-PidNaPorta $PortaCamera) { Escrever "[1/3] Câmera: vídeo RTSP disponível em localhost:$PortaCamera." 'Green' }
    else { Escrever "[1/3] Câmera: RTSP em localhost:$PortaCamera indisponível; o Motor de IA usará leitura direta da Webcam USB (fallback automático)." 'Cyan' }
}

# ---------------------------------------------------------------- 2. motor de IA
$script:Python = $null
$script:ProcMotor = $null

function Start-Motor {
    if (-not $script:Python) { $script:Python = Find-PythonIA }
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

    # Biometrias: com o agente configurado, o painel as envia pelo agente e o motor NÃO recebe a chave
    # de serviço do banco (acesso total). Sem agente (motor isolado), usa a chave do .env do motor.
    $envAgenteM = Read-ArquivoEnv (Join-Path $DirAgente '.env')
    Remove-Item Env:SUPABASE_SERVICE_ROLE_KEY -ErrorAction SilentlyContinue
    Remove-Item Env:SUPABASE_URL -ErrorAction SilentlyContinue
    if (-not $envAgenteM['AGENT_TOKEN']) {
        $envMotor = Read-ArquivoEnv (Join-Path $DirMotor '.env')
        foreach ($k in 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY') { if ($envMotor[$k]) { Set-Item "env:$k" $envMotor[$k] } }
        if (-not $env:SUPABASE_SERVICE_ROLE_KEY) {
            Escrever '[2/3] Motor de IA: sem agente local e sem chave no .env do motor: a IA não terá rostos cadastrados.' 'Red'
        }
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

    $limite = (Get-Date).AddSeconds($EsperaCargaModelo)
    while ((Get-Date) -lt $limite) {
        Start-Sleep 3
        if ($script:ProcMotor.HasExited) {
            Escrever "[2/3] Motor de IA: fechou durante a carga (código $($script:ProcMotor.ExitCode)). Veja $erros" 'Red'
            Get-Content $erros -Tail 8 -ErrorAction SilentlyContinue | ForEach-Object { Escrever "      $_" 'DarkRed' }
            return $false
        }
        if (Get-SaudeMotor) {
            # Prioridade acima do normal: navegador/OBS abertos no mesmo PC não atrasam o reconhecimento.
            # No processo que atende a porta: o python.exe do venv é só um lançador do Python real.
            try { (Get-Process -Id (Get-PidNaPorta $PortaMotor)).PriorityClass = 'AboveNormal' } catch {}
            Show-Motor
            return $true
        }
    }
    Escrever "[2/3] Motor de IA: não respondeu em $EsperaCargaModelo s. Veja $saida" 'Red'
    return $false
}

function Show-Motor {
    $s = Get-SaudeMotor
    if (-not $s) { return }
    $faiss = $null
    $arqChave = Join-Path $DirMotor '.chave-interna'
    $cab = if (Test-Path $arqChave) { @{ 'X-IA-Chave' = (Get-Content $arqChave -Raw).Trim() } } else { @{} }
    try { $faiss = Invoke-RestMethod "http://127.0.0.1:$PortaMotor/api/engine/status" -Headers $cab -TimeoutSec 5 } catch {}
    $hw = if ($faiss -and $faiss.hardware_acceleration) { $faiss.hardware_acceleration } else { 'CPU' }
    Escrever ("[2/3] Motor de IA: LIGADO em http://localhost:{0}  |  {1}  |  perfil {2}  |  {3} rostos indexados  |  {4}/{5} câmera(s) com vídeo" -f `
        $PortaMotor, $hw, $s.perfil, $s.registered_persons, $s.cameras_com_video, $s.cameras_em_uso) 'Green'
    if ($s.engine -ne 'insightface_onnx') { Escrever '      Atenção: InsightFace não carregou; o motor está em modo simulado.' 'Red' }
    if ($hw -eq 'CPU') { Escrever '      Atenção: IA rodando na CPU (lenta). Veja backend\microservice-face-python\requirements-windows-gpu.txt para usar a placa de vídeo.' 'Yellow' }
    if ($faiss -and $faiss.faiss_total_vectors -eq 0) { Escrever '      Atenção: nenhum rosto no índice. Confira a chave do Supabase e se há pessoas com biometria.' 'Yellow' }
}

# Processo iniciado antes da última atualização do arquivo? (código novo no disco, versão antiga rodando)
function Test-ProcessoDesatualizado([int]$processId, [string]$arquivo) {
    try {
        $p = Get-CimInstance Win32_Process -Filter "ProcessId=$processId" -ErrorAction Stop
        return ((Get-Item $arquivo).LastWriteTime -gt $p.CreationDate)
    } catch { return $false }
}

function Confirm-Motor {
    if (Test-MotorDesligadoPeloPainel) {
        Escrever '[2/3] Motor de IA: desligado pelo painel (Câmeras > Motor de IA do evento). Câmeras seguem com vídeo.' 'Cyan'
        return
    }
    $pidAtual = Get-PidNaPorta $PortaMotor
    if ($pidAtual -and (Test-ProcessoDesatualizado $pidAtual (Join-Path $DirMotor 'src\main.py'))) {
        Escrever '[2/3] Motor de IA: código atualizado no disco, reiniciando o motor para a versão nova...' 'Yellow'
        Stop-Process -Id $pidAtual -Force -ErrorAction SilentlyContinue; Start-Sleep 2
    }
    if (Get-SaudeMotor) { Escrever '[2/3] Motor de IA: já estava ligado, mantendo.' 'Green'; Show-Motor; return }
    $ocupante = Get-PidNaPorta $PortaMotor
    if ($ocupante) {
        $nome = (Get-Process -Id $ocupante -ErrorAction SilentlyContinue).ProcessName
        if ($nome -ne 'python') {
            Escrever "[2/3] Motor de IA: a porta $PortaMotor está ocupada por '$nome' (PID $ocupante). Libere a porta e rode de novo." 'Red'
            return
        }
        Escrever "[2/3] Motor de IA: processo travado na porta $PortaMotor (PID $ocupante), reiniciando." 'Yellow'
        Stop-Process -Id $ocupante -Force; Start-Sleep 2
    }
    [void](Start-Motor)
}

# ---------------------------------------------------------------- 3. agente local
$script:ProcAgente = $null
$script:AgenteAtivo = $false

function Test-AgenteRodando {
    [bool](Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'agent\.js' })
}

function Start-Agente {
    $carimbo = '{0:yyyyMMdd-HHmmss}' -f (Get-Date)
    $script:ProcAgente = Start-Process -FilePath 'node' -ArgumentList 'src\agent.js' -WorkingDirectory $DirAgente `
        -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput (Join-Path $DirLogs "agente-$carimbo.log") `
        -RedirectStandardError (Join-Path $DirLogs "agente-$carimbo-erros.log")
}

function Confirm-Agente {
    $envAgente = Read-ArquivoEnv (Join-Path $DirAgente '.env')
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
    # Agente antigo rodando com código novo no disco (ex.: motor novo exige a chave interna): reinicia
    $antigos = Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -match 'agent\.js' -and (Test-ProcessoDesatualizado $_.ProcessId (Join-Path $DirAgente 'src\agent.js')) }
    foreach ($a in $antigos) {
        Escrever '[3/3] Agente local: código atualizado no disco, reiniciando o agente para a versão nova...' 'Yellow'
        Stop-Process -Id $a.ProcessId -Force -ErrorAction SilentlyContinue
    }
    if ($antigos) { Start-Sleep 2 }
    if (Test-AgenteRodando) { Escrever '[3/3] Agente local: já estava ligado, mantendo.' 'Green'; return }
    Start-Agente
    Start-Sleep 3
    if ($script:ProcAgente.HasExited) { Escrever "[3/3] Agente local: fechou ao iniciar (código $($script:ProcAgente.ExitCode)). Veja logs\ia-facial\agente-*-erros.log" 'Red' }
    else { Escrever "[3/3] Agente local: LIGADO, levando IA, câmeras e leitores ao painel em $($envAgente['VPS_URL'])." 'Green' }
}

# ---------------------------------------------------------------- vídeo sem IA e gravação
# go2rtc (retransmissor: vídeo das câmeras sem o motor de IA) e ffmpeg (gravação e vídeo de reserva).
# Versões fixas, baixadas do GitHub e conferidas pelo SHA-256 publicado: arquivo diferente é recusado.
$Binarios = @(
    @{ Nome = 'go2rtc.exe'; Url = 'https://github.com/AlexxIT/go2rtc/releases/download/v1.9.14/go2rtc_win64.zip';
       Sha256 = 'dd4167d75cb04abe618855b7c71f8658bd009f60c1a71835d134d2c11c939907'; Descricao = 'go2rtc 1.9.14 (7 MB)' },
    @{ Nome = 'ffmpeg.exe'; Url = 'https://github.com/GyanD/codexffmpeg/releases/download/8.0/ffmpeg-8.0-essentials_build.zip';
       Sha256 = '647e467caf82b9fa200a562769b5ff4d736aaf725804ed2c64ea9752106fa569'; Descricao = 'ffmpeg 8.0 (100 MB)' }
)

function Install-VideoLocal {
    $dirBin = Join-Path $DirAgente 'bin'
    New-Item -ItemType Directory -Force $dirBin | Out-Null
    foreach ($b in $Binarios) {
        $destino = Join-Path $dirBin $b.Nome
        if (Test-Path $destino) { continue }
        $tmp = Join-Path $env:TEMP ("nzt-" + [guid]::NewGuid().ToString('N'))
        New-Item -ItemType Directory -Force $tmp | Out-Null
        try {
            Escrever "      Baixando $($b.Descricao)..." 'Yellow'
            $zip = Join-Path $tmp 'pacote.zip'
            $ProgressPreference = 'SilentlyContinue'
            Invoke-WebRequest -Uri $b.Url -OutFile $zip -UseBasicParsing -TimeoutSec 900
            $hash = (Get-FileHash -Algorithm SHA256 $zip).Hash.ToLower()
            if ($hash -ne $b.Sha256) { throw "hash não confere ($hash): download recusado" }
            Expand-Archive -Path $zip -DestinationPath (Join-Path $tmp 'x') -Force
            $exe = Get-ChildItem (Join-Path $tmp 'x') -Recurse -Filter $b.Nome | Select-Object -First 1
            if (-not $exe) { throw "$($b.Nome) não encontrado no pacote" }
            Copy-Item $exe.FullName $destino -Force
            Escrever "      $($b.Nome) instalado em backend\agent-local\bin." 'Green'
        } catch {
            Escrever "      Não foi possível instalar $($b.Nome): $($_.Exception.Message)" 'Red'
        } finally {
            Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
}

function Confirm-VideoLocal {
    $ErrorActionPreference = 'Continue'
    Install-VideoLocal
    $ok = (Test-Path (Join-Path $DirAgente 'bin\go2rtc.exe'))
    if ($ok) { Escrever '[+] Vídeo das câmeras sem IA: retransmissor local pronto (o agente o liga).' 'Green' }
    else { Escrever '[+] Vídeo das câmeras sem IA: indisponível; o vídeo seguirá pelo motor de IA.' 'Yellow' }
    $ErrorActionPreference = 'Stop'
}

# ---------------------------------------------------------------- execução
Confirm-Camera
Confirm-VideoLocal
Confirm-Motor
Confirm-Agente

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

    if (Test-MotorDesligadoPeloPainel) {
        $falhas = 0
    } elseif (Get-SaudeMotor) {
        if ($falhas -gt 0) { Escrever 'Motor de IA voltou a responder.' 'Green' }
        $falhas = 0
    } else {
        $falhas++
        Escrever "Motor de IA sem resposta ($falhas/$FalhasParaReiniciar)." 'Yellow'
        if ($falhas -ge $FalhasParaReiniciar -or -not (Get-PidNaPorta $PortaMotor)) {
            Escrever 'Reiniciando o motor de IA...' 'Yellow'
            $falhas = 0
            Confirm-Motor
        }
    }

    if ($script:AgenteAtivo -and -not (Test-AgenteRodando)) {
        Escrever 'Agente local caiu, religando...' 'Yellow'
        Start-Agente
    }
}
