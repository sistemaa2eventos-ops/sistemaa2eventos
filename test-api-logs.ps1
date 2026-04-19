# Script para capturar logs detalhados do erro /api/auth/users
# Uso: .\test-api-logs.ps1 -Email "seu@email.com" -Password "sua_senha"

param(
    [string]$Email = "admin@example.com",
    [string]$Password = "123456",
    [string]$ApiUrl = "http://localhost:3001/api"
)

Write-Host "🔧 Script de Teste - API Logs" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan

# Arquivo de saída
$logFile = "c:\Projetos\Projeto_A2_Eventos\api-test-logs.txt"
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

# Iniciar captura de logs do Docker
Write-Host "`n📝 Iniciando captura de logs do Docker..." -ForegroundColor Yellow
$dockerProcess = Start-Process powershell -ArgumentList @"
cd 'c:\Projetos\Projeto_A2_Eventos\a2-eventos'
docker-compose logs -f a2_eventos_api
"@ -WindowStyle Hidden -PassThru

# Aguardar um momento para os logs começarem
Start-Sleep -Seconds 2

Write-Host "🔑 Obtendo token JWT..." -ForegroundColor Yellow

# Ignorar validação de certificado SSL
[System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12

# Fazer login para obter token
try {
    $loginResponse = Invoke-RestMethod -Uri "$ApiUrl/login" `
        -Method Post `
        -ContentType "application/json" `
        -Body (@{
            email = $Email
            password = $Password
        } | ConvertTo-Json) `
        -SkipCertificateCheck `
        -ErrorAction Stop

    $token = $loginResponse.session.access_token
    Write-Host "✅ Token obtido com sucesso!" -ForegroundColor Green
    Write-Host "Token: $($token.Substring(0, 20))..." -ForegroundColor Gray
}
catch {
    Write-Host "❌ Erro ao fazer login:" -ForegroundColor Red
    Write-Host "Detalhe: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Inner: $($_.Exception.InnerException.Message)" -ForegroundColor Red
    exit 1
}

# Aguardar antes de fazer a requisição
Start-Sleep -Seconds 2

Write-Host "`n🚀 Fazendo requisição para /api/auth/users..." -ForegroundColor Yellow

# Fazer requisição de teste
$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
}

try {
    $response = Invoke-RestMethod -Uri "$ApiUrl/auth/users?search=" `
        -Method Get `
        -Headers $headers `
        -SkipCertificateCheck `
        -ErrorAction Stop

    Write-Host "✅ Requisição bem-sucedida!" -ForegroundColor Green
    Write-Host "Usuários retornados: $($response.users.Count)" -ForegroundColor Green
}
catch {
    Write-Host "❌ Erro na requisição:" -ForegroundColor Red
    Write-Host "Status Code: $($_.Exception.Response.StatusCode)" -ForegroundColor Red
    Write-Host "Mensagem: $($_.Exception.Message)" -ForegroundColor Red

    if ($_.Exception.Response) {
        $responseStream = $_.Exception.Response.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($responseStream)
        $errorBody = $reader.ReadToEnd()
        Write-Host "Resposta: $errorBody" -ForegroundColor Red
    }
}

# Aguardar alguns segundos para os logs aparecerem
Write-Host "`n⏳ Capturando logs por 5 segundos..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# Parar captura de Docker
Stop-Process -Id $dockerProcess.Id -Force

# Capturar logs e salvar em arquivo
Write-Host "`n💾 Salvando logs em arquivo..." -ForegroundColor Yellow

$dockerLogs = & docker-compose -f "c:\Projetos\Projeto_A2_Eventos\a2-eventos\docker-compose.yml" logs a2_eventos_api --tail 100

$output = @"
═══════════════════════════════════════════════════════════
  TESTE DE DIAGNÓSTICO - API /auth/users
═══════════════════════════════════════════════════════════
Horário: $timestamp
Email usado: $Email
URL da API: $ApiUrl

═══════════════════════════════════════════════════════════
  PARÂMETROS DA REQUISIÇÃO
═══════════════════════════════════════════════════════════
Método: GET
URL: $ApiUrl/auth/users?search=
Headers:
  - Authorization: Bearer [TOKEN]
  - Content-Type: application/json

═══════════════════════════════════════════════════════════
  LOGS DO DOCKER (últimas 100 linhas)
═══════════════════════════════════════════════════════════
$dockerLogs

═══════════════════════════════════════════════════════════
  FIM DOS LOGS
═══════════════════════════════════════════════════════════
"@

# Salvar em arquivo
$output | Out-File -FilePath $logFile -Encoding UTF8
Write-Host "✅ Logs salvos em: $logFile" -ForegroundColor Green

# Abrir arquivo para o usuário ver
Write-Host "`n📂 Abrindo arquivo de logs..." -ForegroundColor Cyan
Start-Process notepad $logFile

Write-Host "`n✅ Teste completo! Verifique o arquivo para os logs detalhados." -ForegroundColor Green
