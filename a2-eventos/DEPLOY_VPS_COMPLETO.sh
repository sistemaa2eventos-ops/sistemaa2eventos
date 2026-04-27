#!/bin/bash
# Script de Deploy Completo para VPS (Backend + Frontend)
# Execute como: bash DEPLOY_VPS_COMPLETO.sh

set -e

echo "======================================"
echo "🚀 DEPLOY COMPLETO A2 EVENTOS - VPS HOSTINGER"
echo "======================================"
echo ""

# 1. Verificar se está no diretório correto
if [ ! -f "docker-compose.yml" ]; then
    echo "❌ Erro: docker-compose.yml não encontrado"
    echo "Execute este script no diretório raiz do projeto"
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
git log --oneline -3

echo ""
echo "🔍 PASSO 3: Verificando Docker..."
docker --version
docker-compose --version

echo ""
echo "🐳 PASSO 4: Reconstruindo Backend (API)..."
docker-compose build --no-cache api
if [ $? -ne 0 ]; then
    echo "❌ Erro na compilação da imagem Backend"
    exit 1
fi
echo "✅ Backend build concluído"

echo ""
echo "🎨 PASSO 5: Reconstruindo Frontend (Admin Web)..."
docker-compose build --no-cache admin-web
if [ $? -ne 0 ]; then
    echo "❌ Erro na compilação da imagem Frontend"
    exit 1
fi
echo "✅ Frontend build concluído"

echo ""
echo "🔄 PASSO 6: Reiniciando serviços..."
docker-compose down api admin-web || true
sleep 3
docker-compose up -d api admin-web
if [ $? -ne 0 ]; then
    echo "❌ Erro ao iniciar containers"
    exit 1
fi
echo "✅ Containers iniciados"

echo ""
echo "⏳ PASSO 7: Aguardando serviços inicializarem (20 segundos)..."
for i in {20..1}; do
    echo -n "."
    sleep 1
done
echo ""

echo ""
echo "🔍 PASSO 8: Testando API Health..."
HEALTH=$(curl -s -m 5 http://localhost:3001/health 2>/dev/null)
if echo "$HEALTH" | grep -q "OK"; then
    echo "✅ API está saudável!"
    echo "   Resposta: $HEALTH"
else
    echo "⚠️  Resposta da API:"
    echo "   $HEALTH"
fi

echo ""
echo "🌐 PASSO 9: Testando Frontend..."
FRONTEND=$(curl -s -m 5 http://localhost 2>/dev/null | head -c 50)
if [ ! -z "$FRONTEND" ]; then
    echo "✅ Frontend respondendo!"
else
    echo "⚠️  Sem resposta do frontend"
fi

echo ""
echo "📊 PASSO 10: Status dos containers..."
docker-compose ps

echo ""
echo "📋 PASSO 11: Últimos logs..."
docker logs a2_eventos_api --tail=15
echo ""
docker logs a2_eventos_admin_web --tail=15

echo ""
echo "======================================"
echo "✅ DEPLOY COMPLETO CONCLUÍDO!"
echo "======================================"
echo ""
echo "📍 Próximos passos:"
echo "1. Verificar https://painel.nzt.app.br no navegador"
echo "2. Fazer login com credenciais de admin_master"
echo "3. Ir para 'Controle de Operadores'"
echo "4. Clicar em 'Novo Operador'"
echo "5. Verificar que NÃO aparecem campos: CPF, Data Nascimento, Foto"
echo "6. Verificar que aparecem campos: Email, Nome, Telefone, Evento"
echo ""
echo "⚠️  Se houver erros, execute:"
echo "   docker logs a2_eventos_api"
echo "   docker logs a2_eventos_admin_web"
echo ""
