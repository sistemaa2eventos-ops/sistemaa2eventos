#!/bin/bash
# Script de Deploy para VPS (Hostinger)
# Execute como: bash DEPLOY_VPS.sh
# Ou: chmod +x DEPLOY_VPS.sh && ./DEPLOY_VPS.sh

set -e

echo "======================================"
echo "🚀 DEPLOY A2 EVENTOS - VPS HOSTINGER"
echo "======================================"
echo ""

# 1. Verificar se está no diretório correto
if [ ! -f "docker-compose.yml" ]; then
    echo "❌ Erro: docker-compose.yml não encontrado"
    echo "Execute este script no diretório raiz do projeto (/root/a2-eventos)"
    exit 1
fi

echo "📦 PASSO 1: Fazendo pull das mudanças do Git..."
git fetch origin
git pull origin master
if [ $? -eq 0 ]; then
    echo "✅ Pull concluído com sucesso"
else
    echo "❌ Erro ao fazer pull. Verifique conectividade."
    exit 1
fi

echo ""
echo "📋 PASSO 2: Últimos commits..."
git log --oneline -5

echo ""
echo "🔍 PASSO 3: Verificando Docker..."
docker --version
docker-compose --version

echo ""
echo "🐳 PASSO 4: Reconstruindo container API (pode levar ~30 segundos)..."
docker-compose build --no-cache api
if [ $? -ne 0 ]; then
    echo "❌ Erro na compilação da imagem Docker"
    exit 1
fi
echo "✅ Build concluído"

echo ""
echo "🔄 PASSO 5: Reiniciando API..."
docker-compose down api || true
sleep 3
docker-compose up -d api
if [ $? -ne 0 ]; then
    echo "❌ Erro ao iniciar container"
    exit 1
fi
echo "✅ Container iniciado"

echo ""
echo "⏳ PASSO 6: Aguardando API inicializar (15 segundos)..."
for i in {15..1}; do
    echo -n "."
    sleep 1
done
echo ""

echo ""
echo "🔍 PASSO 7: Testando API Health..."
HEALTH=$(curl -s -m 5 http://localhost:3001/health 2>/dev/null)
if echo "$HEALTH" | grep -q "status.*ok"; then
    echo "✅ API está saudável!"
    echo "   Resposta: $HEALTH"
else
    echo "⚠️  Resposta inesperada da API:"
    echo "   $HEALTH"
fi

echo ""
echo "📊 PASSO 8: Status dos containers..."
docker-compose ps

echo ""
echo "📋 PASSO 9: Últimos logs da API..."
docker logs a2_eventos_api --tail=20

echo ""
echo "======================================"
echo "✅ DEPLOY CONCLUÍDO!"
echo "======================================"
echo ""
echo "📍 Próximos passos:"
echo "1. Verificar https://painel.nzt.app.br no navegador"
echo "2. Fazer login com credenciais de admin_master"
echo "3. Testar criação de novo operador (sem CPF)"
echo ""
echo "⚠️  Se houver erros, execute:"
echo "   docker logs a2_eventos_api"
echo ""
