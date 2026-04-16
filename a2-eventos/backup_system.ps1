param(
    [string]$BackupPath = "C:\Projetos\Projeto_A2_Eventos\backups",
    [switch]$DatabaseOnly,
    [switch]$FilesOnly,
    [switch]$All
)

# ============================================
# SCRIPT DE BACKUP - A2 EVENTOS
# ============================================

$ErrorActionPreference = "Stop"
$data = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$backupName = "a2eventos_backup_$data"

# Criar diretório de backup
if (!(Test-Path $BackupPath)) {
    New-Item -ItemType Directory -Path $BackupPath -Force | Out-Null
}

Write-Host "===========================================" -ForegroundColor Cyan
Write-Host "  BACKUP - A2 EVENTOS" -ForegroundColor Cyan
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host ""

# Função para copiar arquivos
function Copy-Files {
    param($Source, $Dest)
    
    $sourcePath = $Source -replace '\\', '/'
    $destPath = Join-Path $BackupPath "$backupName\$Dest"
    
    if (Test-Path $sourcePath) {
        New-Item -ItemType Directory -Path $destPath -Force | Out-Null
        
        Write-Host "  Copiando: $Source" -ForegroundColor Yellow
        
        # Exclude patterns
        $exclude = @("node_modules", ".git", ".next", "dist", "build", "*.log", "tmp", "temp")
        
        Get-ChildItem -Path $sourcePath -Recurse -File -Exclude $exclude | Where-Object { 
            $_.FullName -notmatch 'node_modules|\.git|\.next|dist|build' 
        } | ForEach-Object {
            $relativePath = $_.FullName.Replace($sourcePath, "")
            $targetFile = Join-Path $destPath $relativePath
            $targetDir = Split-Path $targetFile -Parent
            
            if (!(Test-Path $targetDir)) {
                New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
            }
            
            Copy-Item $_.FullName -Destination $targetFile -Force
        }
    }
}

# 1. Backup do Código Fonte
if (!$DatabaseOnly) {
    Write-Host "[1/4] Copiando código fonte..." -ForegroundColor Green
    
    # Backend
    Copy-Files "C:\Projetos\Projeto_A2_Eventos\a2-eventos\backend" "backend"
    
    # Frontend
    Copy-Files "C:\Projetos\Projeto_A2_Eventos\a2-eventos\frontend\web-admin" "frontend\web-admin"
    Copy-Files "C:\Projetos\Projeto_A2_Eventos\a2-eventos\frontend\public-web" "frontend\public-web"
    
    # Gateway
    Copy-Files "C:\Projetos\Projeto_A2_Eventos\a2-eventos\gateway" "gateway"
    
    # Docker
    Copy-Files "C:\Projetos\Projeto_A2_Eventos\a2-eventos" "docker-compose.yml"
}

# 2. Backup do Banco de Dados (SQL)
if (!$FilesOnly -or $All) {
    Write-Host "[2/4] Gerando backup SQL..." -ForegroundColor Green
    
    # O backup do banco precisa ser feito via Supabase
    $sqlFile = Join-Path $BackupPath "$backupName\database\instrucoes_backup.sql"
    
    $sqlContent = @"
-- ============================================
-- INSTRUÇÕES PARA BACKUP DO BANCO - SUPABASE
-- ============================================

-- Para fazer backup do banco, você precisa:
-- 1. Acessar o painel do Supabase (https://supabase.com)
-- 2. Ir para SQL Editor
-- 3. Executar:

-- Backup da tabela de usuários (perfis)
SELECT * FROM public.perfis;

-- Backup de pessoas
SELECT * FROM public.pessoas;

-- Backup de empresas
SELECT * FROM public.empresas;

-- Backup de eventos
SELECT * FROM public.eventos;

-- Backup de logs de acesso
SELECT * FROM public.logs_acesso WHERE created_at > NOW() - INTERVAL '30 days';

-- Para restaurar:
-- 1. Acesse o SQL Editor do Supabase
-- 2. Use INSERT INTO para restaurar os dados

-- ============================================
-- CREATE TABLE (_SCHEMA)
-- ============================================

-- Execute o conteúdo do arquivo:
-- a2-eventos\database\supabase\migrations\01_initial_schema.sql
"@

    New-Item -ItemType Directory -Path (Split-Path $sqlFile) -Force | Out-Null
    Set-Content -Path $sqlFile -Value $sqlContent -Encoding UTF8
    
    Write-Host "  Arquivo de instruções criado: instrucoes_backup.sql" -ForegroundColor Yellow
}

# 3. Backup de Configurações
Write-Host "[3/4] Copiando configurações..." -ForegroundColor Green

$envFiles = @(
    "backend\api-nodejs\.env"
    "frontend\web-admin\.env"
    "frontend\web-admin\.env.production"
    "frontend\public-web\.env.production"
    "docker-compose.yml"
)

foreach ($envFile in $envFiles) {
    $source = "C:\Projetos\Projeto_A2_Eventos\a2-eventos\$envFile"
    if (Test-Path $source) {
        $dest = Join-Path $BackupPath "$backupName\config"
        New-Item -ItemType Directory -Path $dest -Force | Out-Null
        Copy-Item $source -Destination $dest -Force
        Write-Host "  Copiado: $envFile" -ForegroundColor Yellow
    }
}

# 4. Backup de Scripts
Write-Host "[4/4] Copiando scripts..." -ForegroundColor Green

Copy-Files "C:\Projetos\Projeto_A2_Eventos\a2-eventos\backend\api-nodejs\scripts" "scripts"
Copy-Files "C:\Projetos\Projeto_A2_Eventos\a2-eventos\database" "database"

# Criar arquivo de manifesto
$manifest = @"
===========================================
MANIFESTO DO BACKUP - A2 EVENTOS
===========================================

Data: $data
Hostname: $env:COMPUTERNAME

ARQUIVOS COPIADOS:
- backend/ (código fonte API)
- frontend/web-admin/ (painel-admin)
- frontend/public-web/ (portal público)
- gateway/ (configuração nginx)
- database/ (SQL scripts)
- docker-compose.yml

VARIÁVEIS DE AMBIENTE (sensíveis):
- SUPABASE_URL
- SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY
- JWT_SECRET
- DATABASE_URL

NOTAS:
- O backup do banco de dados deve ser feito manualmente via painel Supabase
- Execute o arquivo instrucoes_backup.sql para ver os comandos

RESTAURAÇÃO:
1. Extraia o backup
2. Copie os arquivos para os locais originais
3. Configure as variáveis de ambiente
4. Execute docker-compose up -d

===========================================
"@

$manifestFile = Join-Path $BackupPath "$backupName\MANIFESTO.txt"
Set-Content -Path $manifestFile -Value $manifest -Encoding UTF8

# Compactar
Write-Host ""
Write-Host "Compactando backup..." -ForegroundColor Cyan

$zipFile = "$BackupPath\$backupName.zip"
if (Test-Path $zipFile) { Remove-Item $zipFile -Force }

Compress-Archive -Path (Join-Path $BackupPath $backupName) -DestinationPath $zipFile -Force

# Limpar pasta temporária
Remove-Item -Path (Join-Path $BackupPath $backupName) -Recurse -Force

Write-Host ""
Write-Host "===========================================" -ForegroundColor Green
Write-Host "  BACKUP CONCLUÍDO COM SUCESSO!" -ForegroundColor Green
Write-Host "===========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Local: $zipFile" -ForegroundColor Cyan
Write-Host ""
Write-Host "Para restaurar:" -ForegroundColor Yellow
Write-Host "  1. Extraia o arquivo .zip" -ForegroundColor White
Write-Host "  2. Copie os arquivos para seus destinos" -ForegroundColor White
Write-Host "  3. Configure as variáveis de ambiente" -ForegroundColor White
Write-Host "  4. Execute: docker-compose up -d" -ForegroundColor White
Write-Host ""