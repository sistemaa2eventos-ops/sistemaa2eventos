# criar-componentes.ps1
Write-Host "🎨 CRIANDO TODOS OS COMPONENTES DO FRONTEND" -ForegroundColor Cyan

$basePath = "C:\Users\SD_Ad\OneDrive\Área de Trabalho\Projeto_A2_Eventos\a2-eventos\frontend\web-admin"

# Criar estrutura de pastas
$pastas = @(
    "src\components\layout",
    "src\components\empresa",
    "src\components\funcionario",
    "src\components\access-control",
    "src\components\common"
)

foreach ($pasta in $pastas) {
    New-Item -ItemType Directory -Path "$basePath\$pasta" -Force | Out-Null
}

Write-Host "✅ Pastas criadas" -ForegroundColor Green

# Copie e cole cada um dos componentes acima nos arquivos correspondentes
Write-Host ""
Write-Host "📝 Agora copie cada componente para seu respectivo arquivo:" -ForegroundColor Yellow
Write-Host "   • src/components/layout/Header.jsx"
Write-Host "   • src/components/layout/DashboardLayout.jsx"
Write-Host "   • src/components/empresa/EmpresaForm.jsx"
Write-Host "   • src/components/empresa/EmpresaList.jsx"
Write-Host "   • src/components/funcionario/FuncionarioForm.jsx"
Write-Host "   • src/components/funcionario/FuncionarioList.jsx"
Write-Host "   • src/components/funcionario/BadgePrint.jsx"
Write-Host "   • src/components/access-control/CheckinCheckout.jsx"
Write-Host "   • src/components/access-control/QRScanner.jsx"
Write-Host "   • src/components/common/ConfirmDialog.jsx"
Write-Host "   • src/components/common/LoadingOverlay.jsx"
