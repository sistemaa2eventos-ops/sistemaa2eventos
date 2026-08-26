#!/bin/bash
# Diagnóstico Completo - A2 Eventos
# Use: bash DIAGNOSE.sh

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}${BOLD}"
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║          🔍 DIAGNÓSTICO COMPLETO - A2 EVENTOS                 ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# ============================================
# 1. Verificar Variáveis de Ambiente
# ============================================
echo -e "\n${YELLOW}1️⃣  VARIÁVEIS DE AMBIENTE${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ -f .env ]; then
    echo -e "${GREEN}✓${NC} Arquivo .env encontrado"

    # Verificar Supabase
    SUPABASE_URL=$(grep "^SUPABASE_URL=" .env | cut -d'=' -f2)
    if [ -z "$SUPABASE_URL" ]; then
        echo -e "${RED}✗ SUPABASE_URL${NC} não definida"
    else
        echo -e "${GREEN}✓${NC} SUPABASE_URL: $SUPABASE_URL"
    fi

    SUPABASE_ANON_KEY=$(grep "^SUPABASE_ANON_KEY=" .env | cut -d'=' -f2 | cut -c1-20)...
    if [ -z "$SUPABASE_ANON_KEY" ]; then
        echo -e "${RED}✗ SUPABASE_ANON_KEY${NC} não definida"
    else
        echo -e "${GREEN}✓${NC} SUPABASE_ANON_KEY: ${SUPABASE_ANON_KEY}"
    fi

    NODE_ENV=$(grep "^NODE_ENV=" .env | cut -d'=' -f2)
    echo -e "${GREEN}✓${NC} NODE_ENV: $NODE_ENV"
else
    echo -e "${RED}✗${NC} Arquivo .env NÃO encontrado!"
fi

# ============================================
# 2. Verificar Conectividade de Rede
# ============================================
echo -e "\n${YELLOW}2️⃣  CONECTIVIDADE DE REDE${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Testar DNS
if ping -c 1 -W 2 8.8.8.8 &>/dev/null; then
    echo -e "${GREEN}✓${NC} Internet acessível (ping 8.8.8.8)"
else
    echo -e "${RED}✗${NC} Sem internet (ping 8.8.8.8 falhou)"
fi

# Testar DNS resolver
if nslookup supabase.co &>/dev/null; then
    echo -e "${GREEN}✓${NC} DNS funcionando"
else
    echo -e "${RED}✗${NC} DNS não funcionando"
fi

# Testar Supabase especificamente
if [ ! -z "$SUPABASE_URL" ]; then
    DOMAIN=$(echo "$SUPABASE_URL" | sed 's|https://||' | cut -d'/' -f1)
    if ping -c 1 -W 2 "$DOMAIN" &>/dev/null; then
        echo -e "${GREEN}✓${NC} Supabase ($DOMAIN) acessível via ping"
    else
        echo -e "${RED}✗${NC} Supabase ($DOMAIN) NÃO acessível via ping"
    fi
fi

# ============================================
# 3. Verificar Docker & Containers
# ============================================
echo -e "\n${YELLOW}3️⃣  DOCKER & CONTAINERS${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if docker --version &>/dev/null; then
    echo -e "${GREEN}✓${NC} Docker instalado: $(docker --version | cut -d' ' -f3)"
else
    echo -e "${RED}✗${NC} Docker NÃO instalado ou não acessível"
fi

if docker ps &>/dev/null; then
    COUNT=$(docker ps -a | wc -l)
    echo -e "${GREEN}✓${NC} Docker daemon respondendo ($((COUNT-1)) containers)"

    # Verificar status dos containers
    docker ps -a --format "table {{.Names}}\t{{.Status}}" | grep -E "a2_eventos" | while read line; do
        if [[ "$line" == *"Up"* ]]; then
            echo -e "  ${GREEN}✓${NC} $(echo $line | cut -d' ' -f1) $(echo $line | cut -d' ' -f2-)"
        else
            echo -e "  ${RED}✗${NC} $(echo $line | cut -d' ' -f1) $(echo $line | cut -d' ' -f2-)"
        fi
    done
else
    echo -e "${RED}✗${NC} Docker daemon NÃO respondendo"
fi

# ============================================
# 4. Verificar Logs de Erros
# ============================================
echo -e "\n${YELLOW}4️⃣  LOGS DE ERROS RECENTES${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if docker ps -a | grep -q "a2_eventos_api"; then
    echo -e "${BLUE}[API]${NC}"
    docker logs a2_eventos_api --tail=5 2>&1 | grep -i "error\|failed\|fatal" | head -3 || echo "  Nenhum erro grave encontrado"
fi

if docker ps -a | grep -q "a2_eventos_gateway"; then
    echo -e "${BLUE}[GATEWAY]${NC}"
    docker logs a2_eventos_gateway --tail=5 2>&1 | grep -i "error\|502\|503" | head -3 || echo "  Nenhum erro grave encontrado"
fi

# ============================================
# 5. Testar Conectividade com Supabase
# ============================================
echo -e "\n${YELLOW}5️⃣  TESTE DE CONECTIVIDADE SUPABASE${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ ! -z "$SUPABASE_URL" ]; then
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$SUPABASE_URL/rest/v1/" -H "apikey: test" -W 5)

    if [ "$HTTP_CODE" == "000" ]; then
        echo -e "${RED}✗${NC} Timeout ou sem conectividade com Supabase"
        echo "   URL testada: $SUPABASE_URL/rest/v1/"
    elif [ "$HTTP_CODE" == "401" ] || [ "$HTTP_CODE" == "404" ]; then
        echo -e "${GREEN}✓${NC} Supabase respondendo (HTTP $HTTP_CODE - esperado para teste sem auth)"
    else
        echo -e "${YELLOW}⚠${NC} Supabase respondendo com HTTP $HTTP_CODE"
    fi
else
    echo -e "${RED}✗${NC} SUPABASE_URL não definida, teste ignorado"
fi

# ============================================
# 6. Verificar Espaço em Disco
# ============================================
echo -e "\n${YELLOW}6️⃣  ESPAÇO EM DISCO${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

DISK_USAGE=$(df -h . | tail -1 | awk '{print $5}')
DISK_FREE=$(df -h . | tail -1 | awk '{print $4}')

echo -e "Uso: ${YELLOW}$DISK_USAGE${NC} | Livre: ${GREEN}$DISK_FREE${NC}"

if [ "${DISK_USAGE%\%}" -gt 90 ]; then
    echo -e "${RED}⚠${NC} ATENÇÃO: Disco > 90% cheio!"
fi

# ============================================
# 7. Resumo Final
# ============================================
echo -e "\n${BLUE}${BOLD}"
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                       📋 RESUMO                               ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

echo "Próximos passos:"
echo "1. Se Supabase não está acessível:"
echo "   - Verificar conectividade: curl https://supabase.co"
echo "   - Verificar .env contém SUPABASE_URL correto"
echo "   - Fazer rebuild dos containers: docker-compose build --no-cache"
echo ""
echo "2. Se containers estão com problemas:"
echo "   - Ver logs completos: docker logs a2_eventos_api --tail=100"
echo "   - Reiniciar: docker-compose restart"
echo ""
echo "3. Para monitorar em tempo real:"
echo "   - bash QUICK_LOGS.sh api"
echo "   - bash MONITOR_ERROS.sh"
echo ""
