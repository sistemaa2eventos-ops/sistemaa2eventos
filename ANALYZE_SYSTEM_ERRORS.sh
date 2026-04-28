#!/bin/bash
# Analisador Completo de Erros - A2 Eventos
# Uso: bash ANALYZE_SYSTEM_ERRORS.sh

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${BLUE}${BOLD}"
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║       🔍 ANALISADOR COMPLETO DE ERROS - A2 EVENTOS            ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# ============================================
# 1. Verificar Variáveis de Ambiente
# ============================================
echo -e "\n${YELLOW}1️⃣  VARIÁVEIS DE AMBIENTE (.env)${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ -f .env ]; then
    echo -e "${GREEN}✓${NC} Arquivo .env encontrado"
    echo ""
    echo "Variáveis CRÍTICAS:"

    SUPABASE_URL=$(grep "^SUPABASE_URL=" .env | cut -d'=' -f2)
    SUPABASE_ANON_KEY=$(grep "^SUPABASE_ANON_KEY=" .env | cut -d'=' -f2 | cut -c1-20)
    API_URL=$(grep "^API_URL=" .env | cut -d'=' -f2)

    if [ -z "$SUPABASE_URL" ]; then
        echo -e "${RED}✗ SUPABASE_URL${NC} - NÃO DEFINIDA"
    else
        echo -e "${GREEN}✓ SUPABASE_URL${NC} - $SUPABASE_URL"
    fi

    if [ -z "$SUPABASE_ANON_KEY" ]; then
        echo -e "${RED}✗ SUPABASE_ANON_KEY${NC} - NÃO DEFINIDA"
    else
        echo -e "${GREEN}✓ SUPABASE_ANON_KEY${NC} - ${SUPABASE_ANON_KEY}..."
    fi

    if [ -z "$API_URL" ]; then
        echo -e "${RED}✗ API_URL${NC} - NÃO DEFINIDA"
    else
        echo -e "${GREEN}✓ API_URL${NC} - $API_URL"
    fi
else
    echo -e "${RED}✗${NC} Arquivo .env NÃO encontrado"
fi

# ============================================
# 2. Verificar Containers
# ============================================
echo -e "\n${YELLOW}2️⃣  STATUS DOS CONTAINERS${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

docker ps -a --format "table {{.Names}}\t{{.Status}}" | grep -E "a2_eventos" | while read line; do
    container=$(echo $line | awk '{print $1}')
    status=$(echo $line | awk '{print $2, $3, $4, $5}')

    if [[ "$status" == *"Healthy"* ]] || [[ "$status" == *"Up"* ]]; then
        echo -e "${GREEN}✓${NC} $container - $status"
    else
        echo -e "${RED}✗${NC} $container - $status"
    fi
done

# ============================================
# 3. Analisar Logs por Padrão de Erro
# ============================================
echo -e "\n${YELLOW}3️⃣  PADRÕES DE ERRO IDENTIFICADOS${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Função para contar erros
count_error() {
    local pattern="$1"
    local container="$2"
    local count=$(docker logs "$container" 2>/dev/null | grep -i "$pattern" | wc -l)
    echo "$count"
}

# API Errors
API_ERRORS=$(count_error "ERROR" "a2_eventos_api")
API_SUPABASE=$(count_error "supabase\|connection" "a2_eventos_api")

echo -e "${BLUE}[API - a2_eventos_api]${NC}"
echo "  Erros totais: $API_ERRORS"
echo "  Erros Supabase/conexão: $API_SUPABASE"

# Frontend Errors
FRONTEND_ERRORS=$(count_error "ERROR\|Supabase" "a2_eventos_admin_web")
echo -e "${BLUE}[Frontend - a2_eventos_admin_web]${NC}"
echo "  Erros identificados: $FRONTEND_ERRORS"

# Gateway Errors
GATEWAY_ERRORS=$(count_error "error\|502\|503\|504" "a2_eventos_gateway")
echo -e "${BLUE}[Gateway - a2_eventos_gateway]${NC}"
echo "  Erros HTTP: $GATEWAY_ERRORS"

# ============================================
# 4. Verificar Configurações do Frontend
# ============================================
echo -e "\n${YELLOW}4️⃣  CONFIGURAÇÃO DO FRONTEND${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ -f "a2-eventos/frontend/web-admin/.env" ]; then
    echo -e "${GREEN}✓${NC} Arquivo .env do frontend encontrado"
    grep "^VITE_\|^REACT_" "a2-eventos/frontend/web-admin/.env" | head -10
else
    echo -e "${YELLOW}⚠${NC} Arquivo .env do frontend não encontrado (pode ser gerado em build)"
fi

if [ -f "a2-eventos/frontend/web-admin/.env.example" ]; then
    echo ""
    echo "Variáveis esperadas (.env.example):"
    grep "^VITE_\|^REACT_" "a2-eventos/frontend/web-admin/.env.example" | head -10
fi

# ============================================
# 5. Verificar Configuração do Nginx
# ============================================
echo -e "\n${YELLOW}5️⃣  CONFIGURAÇÃO DO NGINX${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if docker exec a2_eventos_gateway nginx -T &>/dev/null; then
    echo -e "${GREEN}✓${NC} Configuração do Nginx válida"
else
    echo -e "${RED}✗${NC} Erro na configuração do Nginx"
fi

# ============================================
# 6. Teste de Conectividade
# ============================================
echo -e "\n${YELLOW}6️⃣  TESTE DE CONECTIVIDADE${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# API local
curl -s -o /dev/null -w "API Local (http://localhost:3001/health): %{http_code}\n" http://localhost:3001/health

# Frontend local
curl -s -o /dev/null -w "Frontend Local (http://localhost:3000): %{http_code}\n" http://localhost:3000

# Via Nginx
curl -s -o /dev/null -w "Via Nginx (http://localhost/): %{http_code}\n" http://localhost/

# ============================================
# 7. Sumário e Recomendações
# ============================================
echo -e "\n${BLUE}${BOLD}"
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                    📋 RECOMENDAÇÕES                           ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

ISSUES=0

if [ -z "$SUPABASE_URL" ]; then
    echo -e "${RED}1. SUPABASE_URL não está definida${NC}"
    echo "   → Adicione no .env: SUPABASE_URL=https://..."
    ISSUES=$((ISSUES+1))
fi

if [ -z "$SUPABASE_ANON_KEY" ]; then
    echo -e "${RED}2. SUPABASE_ANON_KEY não está definida${NC}"
    echo "   → Adicione no .env: SUPABASE_ANON_KEY=..."
    ISSUES=$((ISSUES+1))
fi

if [ "$API_ERRORS" -gt 10 ]; then
    echo -e "${YELLOW}3. API com muitos erros ($API_ERRORS)${NC}"
    echo "   → Verificar: docker logs a2_eventos_api --tail=100"
    ISSUES=$((ISSUES+1))
fi

if [ "$FRONTEND_ERRORS" -gt 0 ]; then
    echo -e "${YELLOW}4. Frontend reportando erros${NC}"
    echo "   → Verificar console do navegador (F12)"
    echo "   → Problema comum: Supabase URL não injetada no frontend"
    ISSUES=$((ISSUES+1))
fi

if [ "$ISSUES" -eq 0 ]; then
    echo -e "${GREEN}✅ Nenhum problema crítico identificado!${NC}"
    echo ""
    echo "Próximos passos:"
    echo "1. Monitorar logs: bash a2-eventos/QUICK_LOGS.sh all"
    echo "2. Verificar painel: https://painel.nzt.app.br"
    echo "3. Se houver erros, coletar logs: docker logs a2_eventos_api > /tmp/api.log"
fi

echo ""
