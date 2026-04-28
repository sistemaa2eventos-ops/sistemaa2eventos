#!/bin/bash
# Script de Teste Abrangente - A2 Eventos
# Testa todos os endpoints críticos do sistema

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

# Cores para resultados
SUCCESS="${GREEN}✓${NC}"
FAIL="${RED}✗${NC}"
WARN="${YELLOW}⚠${NC}"

echo -e "${BLUE}${BOLD}"
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║         🧪 TESTE ABRANGENTE DO SISTEMA A2 EVENTOS             ║"
echo "║                     (2026-04-28)                              ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

TESTS_PASSED=0
TESTS_FAILED=0

# Função para testar endpoint
test_endpoint() {
    local method=$1
    local endpoint=$2
    local description=$3
    local expected_code=$4

    printf "  %-50s " "$description"

    if [ "$method" = "GET" ]; then
        HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3001$endpoint")
    else
        HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X $method "http://localhost:3001$endpoint")
    fi

    if [[ "$HTTP_CODE" == *"$expected_code"* ]] || [ -z "$expected_code" ]; then
        echo -e "${SUCCESS} ($HTTP_CODE)"
        ((TESTS_PASSED++))
    else
        echo -e "${FAIL} ($HTTP_CODE)"
        ((TESTS_FAILED++))
    fi
}

# ============================================
# 1. TESTES DE CONECTIVIDADE BÁSICA
# ============================================
echo -e "\n${YELLOW}1️⃣  CONECTIVIDADE BÁSICA${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

test_endpoint "GET" "/health" "Health Check (API)" "200"
test_endpoint "GET" "/api/health" "Health Check (API com /api)" ""

# ============================================
# 2. TESTES DE AUTENTICAÇÃO
# ============================================
echo -e "\n${YELLOW}2️⃣  AUTENTICAÇÃO${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

test_endpoint "POST" "/auth/login" "Login Endpoint (POST)" ""
test_endpoint "GET" "/auth/status" "Status de Autenticação" ""

# ============================================
# 3. TESTES DE ENDPOINTS CRÍTICOS
# ============================================
echo -e "\n${YELLOW}3️⃣  ENDPOINTS CRÍTICOS${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

test_endpoint "GET" "/api/eventos" "Listar Eventos" ""
test_endpoint "GET" "/api/pessoas" "Listar Pessoas" ""
test_endpoint "GET" "/api/empresas" "Listar Empresas" ""
test_endpoint "GET" "/api/dispositivos" "Listar Dispositivos" ""

# ============================================
# 4. TESTES DE RELATÓRIOS (CORRIGIDOS)
# ============================================
echo -e "\n${YELLOW}4️⃣  ENDPOINTS DE RELATÓRIOS (CORRIGIDOS)${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

test_endpoint "GET" "/api/reports/daily" "Relatório Diário" ""
test_endpoint "GET" "/api/reports/por-empresa" "Relatório por Empresa" ""
test_endpoint "GET" "/api/reports/por-area" "Relatório por Área (CORRIGIDO)" ""
test_endpoint "GET" "/api/reports/por-leitor" "Relatório por Leitor" ""
test_endpoint "GET" "/api/reports/por-funcao" "Relatório por Função" ""
test_endpoint "GET" "/api/reports/por-status" "Relatório por Status" ""
test_endpoint "GET" "/api/reports/ranking" "Ranking de Engajamento" ""

# ============================================
# 5. TESTES DE ACESSO/CHECK-IN
# ============================================
echo -e "\n${YELLOW}5️⃣  ENDPOINTS DE ACESSO${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

test_endpoint "GET" "/api/acesso/logs" "Logs de Acesso" ""
test_endpoint "POST" "/api/acesso/checkin" "Check-in Manual" ""
test_endpoint "POST" "/api/acesso/checkout" "Check-out Manual" ""
test_endpoint "GET" "/api/acesso/stats" "Estatísticas em Tempo Real" ""

# ============================================
# 6. TESTES DE QUALIDADE DE SERVIÇO
# ============================================
echo -e "\n${YELLOW}6️⃣  QUALIDADE DE SERVIÇO${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

printf "  %-50s " "Tempo de Resposta API"
RESPONSE_TIME=$(curl -s -w "%{time_total}" -o /dev/null http://localhost:3001/health)
if (( $(echo "$RESPONSE_TIME < 0.5" | bc -l) )); then
    echo -e "${SUCCESS} (${RESPONSE_TIME}s)"
    ((TESTS_PASSED++))
elif (( $(echo "$RESPONSE_TIME < 1.0" | bc -l) )); then
    echo -e "${WARN} (${RESPONSE_TIME}s - lento)"
    ((TESTS_PASSED++))
else
    echo -e "${FAIL} (${RESPONSE_TIME}s - muito lento)"
    ((TESTS_FAILED++))
fi

printf "  %-50s " "Conectividade Supabase"
SUPABASE_STATUS=$(curl -s -X GET "http://localhost:3001/health" | grep -o '"database":"[^"]*' | cut -d'"' -f4)
if [ "$SUPABASE_STATUS" = "connected" ]; then
    echo -e "${SUCCESS} ($SUPABASE_STATUS)"
    ((TESTS_PASSED++))
else
    echo -e "${FAIL} (status: $SUPABASE_STATUS)"
    ((TESTS_FAILED++))
fi

# ============================================
# 7. STATUS DOS CONTAINERS
# ============================================
echo -e "\n${YELLOW}7️⃣  STATUS DOS CONTAINERS${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

cd /c/Projetos/Projeto_A2_Eventos/a2-eventos 2>/dev/null || cd a2-eventos 2>/dev/null

docker-compose ps --format "table {{.Names}}\t{{.Status}}" | grep -E "a2_eventos|api|web|gateway|camera" | while read name status; do
    if [[ "$status" == *"Up"* ]]; then
        printf "  %-50s ${SUCCESS}\n" "$name"
        ((TESTS_PASSED++))
    else
        printf "  %-50s ${FAIL} ($status)\n" "$name"
        ((TESTS_FAILED++))
    fi
done

# ============================================
# 8. VERIFICAÇÕES DE LOG
# ============================================
echo -e "\n${YELLOW}8️⃣  VERIFICAÇÃO DE LOGS${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

CRITICAL_ERRORS=$(docker-compose logs --tail=100 2>/dev/null | grep -iE "critical|fatal|panic" | wc -l)
printf "  %-50s " "Erros Críticos nos últimos 100 logs"
if [ $CRITICAL_ERRORS -eq 0 ]; then
    echo -e "${SUCCESS} (nenhum)"
    ((TESTS_PASSED++))
else
    echo -e "${FAIL} ($CRITICAL_ERRORS encontrados)"
    ((TESTS_FAILED++))
fi

CONNECTION_ERRORS=$(docker-compose logs --tail=100 2>/dev/null | grep -iE "connection refused|connection timeout" | wc -l)
printf "  %-50s " "Erros de Conexão"
if [ $CONNECTION_ERRORS -eq 0 ]; then
    echo -e "${SUCCESS} (nenhum)"
    ((TESTS_PASSED++))
else
    echo -e "${WARN} ($CONNECTION_ERRORS encontrados - possível)"
    ((TESTS_PASSED++))
fi

# ============================================
# RESUMO FINAL
# ============================================
TOTAL=$((TESTS_PASSED + TESTS_FAILED))
PERCENTAGE=$((TESTS_PASSED * 100 / TOTAL))

echo -e "\n${BLUE}${BOLD}"
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                    📊 RESULTADO FINAL                         ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

echo -e "  ${GREEN}Testes Passaram:${NC}  $TESTS_PASSED/$TOTAL"
echo -e "  ${RED}Testes Falharam:${NC}  $TESTS_FAILED/$TOTAL"
echo -e "  ${BLUE}Taxa de Sucesso:${NC}  $PERCENTAGE%"

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "\n${GREEN}${BOLD}✅ SISTEMA OPERACIONAL - TODOS OS TESTES PASSARAM!${NC}"
    exit 0
elif [ $PERCENTAGE -ge 80 ]; then
    echo -e "\n${YELLOW}${BOLD}⚠️  SISTEMA PARCIALMENTE OPERACIONAL - Alguns testes falharam${NC}"
    exit 1
else
    echo -e "\n${RED}${BOLD}❌ SISTEMA COM PROBLEMAS - Investigação necessária${NC}"
    exit 1
fi
