#!/bin/bash
# Script para reparar pessoas órfãs no Supabase
# Uso: bash REPARAR_PESSOAS_ORFAS.sh

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${BLUE}${BOLD}"
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║          🔧 REPARADOR DE PESSOAS ÓRFÃS - A2 EVENTOS           ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

echo -e "\n${YELLOW}O que são pessoas órfãs?${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Pessoas que foram criadas mas não têm registro na tabela pivot"
echo "pessoa_evento_empresa. Isso impede que gerem QR code."
echo ""

MIGRATION_FILE="a2-eventos/supabase/migrations/20260428_reparar_pessoas_orfas.sql"

if [ ! -f "$MIGRATION_FILE" ]; then
    echo -e "${RED}❌ Arquivo de migração não encontrado: $MIGRATION_FILE${NC}"
    exit 1
fi

echo -e "${YELLOW}📋 INSTRUÇÕES:${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "1️⃣  Abra o Supabase Console:"
echo "   https://supabase.com/dashboard/project/zznrgwytywgjsjqdjfxn/sql/new"
echo ""
echo "2️⃣  Copie este SQL (mostrando logo abaixo):"
echo ""
echo "   Primeiro, execute APENAS ESTA QUERY para ver quantas são:"
echo "   ─────────────────────────────────────────────────────────"
echo ""
cat "$MIGRATION_FILE" | head -15
echo ""
echo "   ─────────────────────────────────────────────────────────"
echo ""
echo "3️⃣  Se encontrar pessoas órfãs, execute o INSERT:"
echo ""
echo "   Procure no arquivo por: 'INSERT INTO pessoa_evento_empresa'"
echo ""
echo "4️⃣  Depois execute a verificação final (VERIFY_SUPABASE_SCHEMA.sh)"
echo ""
echo ""
echo -e "${YELLOW}Para copiar tudo de uma vez:${NC}"
echo "cat $MIGRATION_FILE"
echo ""
echo -e "${YELLOW}Depois:${NC}"
echo "bash VERIFY_SUPABASE_SCHEMA.sh"
echo ""
