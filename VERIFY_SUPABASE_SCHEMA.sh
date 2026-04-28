#!/bin/bash
# Verifica e corrige o schema do Supabase
# Uso: bash VERIFY_SUPABASE_SCHEMA.sh

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

# Carregar variáveis de ambiente
if [ -f .env ]; then
    export $(cat .env | grep -E "^SUPABASE_URL|^SUPABASE_ANON_KEY|^SUPABASE_SERVICE_ROLE_KEY" | xargs)
else
    echo -e "${RED}❌ Arquivo .env não encontrado!${NC}"
    exit 1
fi

echo -e "${BLUE}${BOLD}"
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║     🔍 VERIFICAÇÃO COMPLETA DO SCHEMA SUPABASE - A2 EVENTOS   ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# ============================================
# FUNÇÃO: Fazer query no Supabase via API
# ============================================
query_supabase() {
    local query="$1"
    local method="${2:-GET}"

    if [ "$method" == "POST" ]; then
        curl -s "https://${SUPABASE_URL#https://}/rest/v1/rpc/execute_sql" \
            -H "apikey: $SUPABASE_ANON_KEY" \
            -H "Content-Type: application/json" \
            -d "{\"sql\": \"$query\"}" 2>/dev/null
    else
        curl -s "https://${SUPABASE_URL#https://}/rest/v1/pg_catalog" \
            -H "apikey: $SUPABASE_ANON_KEY" 2>/dev/null
    fi
}

# ============================================
# PASSO 1: Verificar Conectividade
# ============================================
echo -e "\n${YELLOW}1️⃣  VERIFICAR CONECTIVIDADE COM SUPABASE${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$SUPABASE_URL/rest/v1/" -H "apikey: test")

if [ "$HTTP_CODE" == "401" ] || [ "$HTTP_CODE" == "404" ]; then
    echo -e "${GREEN}✓${NC} Supabase acessível (HTTP $HTTP_CODE)"
    SUPABASE_ACCESSIBLE=1
else
    echo -e "${RED}✗${NC} Supabase não acessível (HTTP $HTTP_CODE)"
    SUPABASE_ACCESSIBLE=0
fi

# ============================================
# PASSO 2: Listar Tabelas Existentes
# ============================================
echo -e "\n${YELLOW}2️⃣  TABELAS EXISTENTES${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

TABLES=("pessoas" "eventos" "empresas" "pessoa_evento_empresa" "perfis")

for table in "${TABLES[@]}"; do
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
        "$SUPABASE_URL/rest/v1/$table?limit=1" \
        -H "apikey: $SUPABASE_ANON_KEY")

    if [ "$HTTP_CODE" == "200" ]; then
        echo -e "${GREEN}✓${NC} $table"
    else
        echo -e "${RED}✗${NC} $table (HTTP $HTTP_CODE - não existe)"
    fi
done

# ============================================
# PASSO 3: Verificar Registros na Pivot
# ============================================
echo -e "\n${YELLOW}3️⃣  DADOS NA PIVOT TABLE${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

PIVOT_COUNT=$(curl -s "$SUPABASE_URL/rest/v1/pessoa_evento_empresa?select=count()&limit=1" \
    -H "apikey: $SUPABASE_ANON_KEY" 2>/dev/null | jq '.[0].count' 2>/dev/null || echo "0")

if [ "$PIVOT_COUNT" == "null" ]; then
    echo -e "${RED}✗${NC} Tabela pessoa_evento_empresa ainda não existe (count=null)"
    PIVOT_EXISTS=0
else
    echo -e "${GREEN}✓${NC} Pivot table contém $PIVOT_COUNT registros"
    PIVOT_EXISTS=1
fi

# Contar por status
if [ "$PIVOT_EXISTS" == "1" ]; then
    PENDENTE=$(curl -s "$SUPABASE_URL/rest/v1/pessoa_evento_empresa?status_aprovacao=eq.pendente&select=count()&limit=1" \
        -H "apikey: $SUPABASE_ANON_KEY" 2>/dev/null | jq '.[0].count' 2>/dev/null || echo "0")

    APROVADO=$(curl -s "$SUPABASE_URL/rest/v1/pessoa_evento_empresa?status_aprovacao=eq.aprovado&select=count()&limit=1" \
        -H "apikey: $SUPABASE_ANON_KEY" 2>/dev/null | jq '.[0].count' 2>/dev/null || echo "0")

    RECUSADO=$(curl -s "$SUPABASE_URL/rest/v1/pessoa_evento_empresa?status_aprovacao=eq.recusado&select=count()&limit=1" \
        -H "apikey: $SUPABASE_ANON_KEY" 2>/dev/null | jq '.[0].count' 2>/dev/null || echo "0")

    echo "  Pendente: $PENDENTE"
    echo "  Aprovado: $APROVADO"
    echo "  Recusado: $RECUSADO"
fi

# ============================================
# PASSO 4: Informações da Migração
# ============================================
echo -e "\n${YELLOW}4️⃣  ARQUIVO DE MIGRAÇÃO${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

MIGRATION_FILE="a2-eventos/supabase/migrations/20260428_criar_pivot_pessoa_evento_empresa.sql"

if [ -f "$MIGRATION_FILE" ]; then
    echo -e "${GREEN}✓${NC} Arquivo de migração encontrado:"
    echo "  $MIGRATION_FILE"
    echo ""
    echo "Este arquivo contém:"
    echo "  ✓ Criação da tabela pessoa_evento_empresa"
    echo "  ✓ Índices para performance"
    echo "  ✓ Configuração de RLS (Row Level Security)"
    echo "  ✓ Policies de segurança por evento"
    echo "  ✓ Trigger para atualizar timestamp"
else
    echo -e "${RED}✗${NC} Arquivo de migração não encontrado"
fi

# ============================================
# PASSO 5: Próximos Passos
# ============================================
echo -e "\n${BLUE}${BOLD}"
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                       📋 PRÓXIMOS PASSOS                      ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

if [ "$PIVOT_EXISTS" == "0" ]; then
    echo -e "${YELLOW}A tabela pessoa_evento_empresa NÃO existe.${NC}"
    echo ""
    echo "Para criar:"
    echo "1. Abra o Supabase Console:"
    echo "   https://supabase.com/dashboard/project/zznrgwytywgjsjqdjfxn/sql/new"
    echo ""
    echo "2. Copie todo o conteúdo do arquivo:"
    echo "   cat $MIGRATION_FILE"
    echo ""
    echo "3. Cole no SQL Editor do Supabase e execute"
    echo ""
    echo "4. Depois volte e execute:"
    echo "   bash VERIFY_SUPABASE_SCHEMA.sh"
    echo ""
    echo "Ou, se tiver acesso direto ao Supabase CLI:"
    echo "   supabase db push"
else
    echo -e "${GREEN}✅ Tabela pessoa_evento_empresa já existe!${NC}"
    echo ""
    echo "Status:"
    echo "  - Total de registros: $PIVOT_COUNT"
    echo "  - Pendentes: $PENDENTE"
    echo "  - Aprovados: $APROVADO"
    echo "  - Recusados: $RECUSADO"
    echo ""
    echo "Próximas ações:"
    echo "1. Testar criação de pessoas:"
    echo "   bash a2-eventos/QUICK_LOGS.sh all"
    echo ""
    echo "2. Testar geração de QR code no painel"
fi

echo ""
