param(
  [string]$IP       = "187.127.9.59",
  [string]$User     = "root",
  [string]$AppPath  = "/home/nzt-painel/a2-eventos",
  [string]$AppName  = "a2_eventos_api",
  [int]   $WaitSec  = 15,
  [int]   $Retries  = 5
)

$ErrorActionPreference = "Stop"
$HealthUrl = "https://api.nzt.app.br/health"
$TAR_FILE = "deploy_nzt.tar.gz"

function Write-Step($n, $msg) {
  Write-Host "`n[$n/6] $msg" -ForegroundColor Cyan
}

function Abort($msg) {
  Write-Host "`nABORTADO: $msg" -ForegroundColor Red
  exit 1
}

Write-Step 1 "Verificacao de sintaxe local"
node backend/api-nodejs/scripts/check_syntax.js
if ($LASTEXITCODE -ne 0) { Abort "Corrija os erros de sintaxe antes de continuar." }

Write-Step 2 "Verificacao de variaveis de ambiente"
node backend/api-nodejs/scripts/check_env.js
if ($LASTEXITCODE -ne 0) { Abort "Configure as variaveis no .env antes de continuar." }

Write-Step 2.1 "Verificando .env para production"
(Get-Content backend/api-nodejs/.env) -replace 'NODE_ENV=development', 'NODE_ENV=production' | Set-Content backend/api-nodejs/.env

Write-Step 3 "Gerando Tarball e Enviando arquivos para a VPS"
if (Test-Path $TAR_FILE) { Remove-Item $TAR_FILE }
tar.exe -czf $TAR_FILE --exclude="node_modules" --exclude=".git" backend frontend gateway database supabase docker-compose.yml GUIA_IMPLANTACAO.md
scp $TAR_FILE ${User}@${IP}:${AppPath}

Write-Step 4 "Aplicando Build e Subindo via Docker Compose"
ssh "${User}@${IP}" @"
  set -e
  cd $AppPath
  echo '  Descompactando...'
  tar -xzf $TAR_FILE
  echo '  docker-compose build and up...'
  docker-compose up -d --build --remove-orphans
"@

Write-Step 5 "Aguardando inicializacao ($WaitSec segundos)"
Start-Sleep -Seconds $WaitSec
# Limpeza do TAR
ssh "${User}@${IP}" "rm $AppPath/$TAR_FILE"
if (Test-Path $TAR_FILE) { Remove-Item $TAR_FILE }

Write-Step 6 "Verificando health check da API Dockerizada"
for ($i = 1; $i -le $Retries; $i++) {
  try {
    $r = Invoke-WebRequest -Uri $HealthUrl -TimeoutSec 5 -UseBasicParsing
    if ($r.StatusCode -eq 200) {
      $body = $r.Content | ConvertFrom-Json
      Write-Host "`nDEPLOY OK" -ForegroundColor Green
      Write-Host "  Status : $($body.status)"
      Write-Host "  Uptime : $($body.uptime)s"
      Write-Host "  DB     : $($body.checks.database)"
      exit 0
    }
  } catch {
    Write-Host "  Tentativa $i/$Retries - aguardando 5s..." -ForegroundColor Yellow
    if ($i -lt $Retries) { Start-Sleep -Seconds 5 }
  }
}

Write-Host "`nHEALTH CHECK FALHOU. Ultimas 40 linhas de log do Container:" -ForegroundColor Red
ssh "${User}@${IP}" "docker logs --tail 40 $AppName"

Write-Host "`nO Servidor esta travado ou quebrado e precisarmos avaliar os logs acima!" -ForegroundColor Yellow
Abort "Deploy comprometido. Analise os logs do Docker."
