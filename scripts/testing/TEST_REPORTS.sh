#!/bin/bash
# Script para testar os endpoints de relatórios

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}   TESTE DE ENDPOINTS DE RELATÓRIOS${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}\n"

# Carregar credenciais do .env
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
    echo -e "${GREEN}✓${NC} Arquivo .env carregado"
else
    echo -e "${RED}✗${NC} Arquivo .env não encontrado"
    exit 1
fi

API_URL="http://localhost:3001"

# Tenta obter um token (admin master)
echo -e "\n${YELLOW}1. Tentando fazer login como admin...${NC}"
LOGIN_RESPONSE=$(curl -s -X POST "$API_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@test.com",
    "senha": "password123"
  }')

TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
    echo -e "${YELLOW}⚠${NC} Não foi possível obter token de teste automaticamente"
    echo -e "${YELLOW}   Usando requerimento sem token (para testar RLS)${NC}"
    TOKEN=""
else
    echo -e "${GREEN}✓${NC} Token obtido com sucesso"
fi

# Função para testar endpoint
test_endpoint() {
    local endpoint=$1
    local method=${2:-GET}
    local description=$3

    echo -e "\n${BLUE}Testando: $description${NC}"
    echo -e "  Endpoint: $endpoint"

    if [ -z "$TOKEN" ]; then
        RESPONSE=$(curl -s -X $method "$API_URL$endpoint" \
          -H "Content-Type: application/json" \
          -w "\n%{http_code}")
    else
        RESPONSE=$(curl -s -X $method "$API_URL$endpoint" \
          -H "Content-Type: application/json" \
          -H "Authorization: Bearer $TOKEN" \
          -w "\n%{http_code}")
    fi

    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    BODY=$(echo "$RESPONSE" | head -n-1)

    if [ "$HTTP_CODE" = "200" ]; then
        echo -e "  Status: ${GREEN}$HTTP_CODE${NC}"
        # Mostrar primeiras 200 caracteres da resposta
        echo "  Response: $(echo $BODY | cut -c1-200)..."
    else
        echo -e "  Status: ${RED}$HTTP_CODE${NC}"
        echo "  Response: $BODY"
    fi
}

# Testes específicos para relatórios
# Para testar, é necessário ter um evento_id válido
# Usando header X-Evento-ID para contexto

echo -e "\n\n${YELLOW}═══════════════════════════════════════════════════════════${NC}"
echo -e "${YELLOW}TESTES DE ENDPOINTS DE RELATÓRIOS${NC}"
echo -e "${YELLOW}═══════════════════════════════════════════════════════════${NC}"

# Tester porArea (relatório por área)
echo -e "\n${BLUE}[1] Relatório por Área (porArea)${NC}"
curl -s -X GET "http://localhost:3001/api/reports/por-area" \
  -H "Content-Type: application/json" \
  -H "X-Evento-ID: test-evento-id" 2>&1 | head -20

# Test porEmpresa
echo -e "\n${BLUE}[2] Relatório por Empresa (porEmpresa)${NC}"
curl -s -X GET "http://localhost:3001/api/reports/por-empresa" \
  -H "Content-Type: application/json" \
  -H "X-Evento-ID: test-evento-id" 2>&1 | head -20

# Test porLeitor
echo -e "\n${BLUE}[3] Relatório por Leitor (porLeitor)${NC}"
curl -s -X GET "http://localhost:3001/api/reports/por-leitor" \
  -H "Content-Type: application/json" \
  -H "X-Evento-ID: test-evento-id" 2>&1 | head -20

echo -e "\n\n${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}TESTES COMPLETOS${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}\n"

echo -e "Dicas para testes futuros:"
echo -e "  1. Obtenha um evento_id válido do banco: SELECT id FROM eventos LIMIT 1;"
echo -e "  2. Obtenha um token válido fazendo login"
echo -e "  3. Use os headers: -H 'Authorization: Bearer TOKEN' -H 'X-Evento-ID: UUID'"
