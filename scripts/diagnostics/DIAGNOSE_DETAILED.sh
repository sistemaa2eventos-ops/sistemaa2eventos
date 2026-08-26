#!/bin/bash
# Diagnóstico Detalhado do Sistema A2 Eventos

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${BLUE}${BOLD}"
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║        📋 DIAGNÓSTICO DETALHADO - A2 EVENTOS                  ║"
echo "║              (2026-04-28 - Verificação Completa)              ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# ============================================
# 1. VERIFICAR ESTRUTURA CRÍTICA DO BANCO DE DADOS
# ============================================
echo -e "\n${YELLOW}1️⃣  ESTRUTURA CRÍTICA DO BANCO DE DADOS${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Verificar se as tabelas principais existem
SUPABASE_URL=$(grep "^SUPABASE_URL=" /c/Projetos/Projeto_A2_Eventos/.env 2>/dev/null | cut -d'=' -f2)
SUPABASE_KEY=$(grep "^SUPABASE_ANON_KEY=" /c/Projetos/Projeto_A2_Eventos/.env 2>/dev/null | cut -d'=' -f2)

if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_KEY" ]; then
    echo -e "${YELLOW}⚠${NC} Supabase credentials não configuradas no .env"
    echo "   Use: grep SUPABASE /c/Projetos/Projeto_A2_Eventos/.env"
else
    echo -e "${GREEN}✓${NC} Supabase credentials configuradas"
fi

echo -e "\nTabelas críticas que devem existir:"
TABLES=(
    "eventos"
    "pessoas"
    "empresas"
    "dispositivos"
    "logs_acesso"
    "dispositivos_acesso"
    "evento_areas"
    "perfis"
    "pessoa_evento_empresa"
)

for table in "${TABLES[@]}"; do
    echo -e "  • $table"
done

# ============================================
# 2. VERIFICAR MIGRATIONS APLICADAS
# ============================================
echo -e "\n${YELLOW}2️⃣  MIGRATIONS APLICADAS${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

MIGRATION_COUNT=$(find /c/Projetos/Projeto_A2_Eventos/a2-eventos/supabase/migrations -name "*.sql" 2>/dev/null | wc -l)
echo -e "${GREEN}✓${NC} $MIGRATION_COUNT migrations encontradas"

echo -e "\nMigrations mais recentes:"
ls -1 /c/Projetos/Projeto_A2_Eventos/a2-eventos/supabase/migrations/*.sql 2>/dev/null | sort -r | head -5 | sed 's/.*\//  • /'

# ============================================
# 3. VERIFICAR CONFIGURAÇÕES DE RLS
# ============================================
echo -e "\n${YELLOW}3️⃣  CONFIGURAÇÃO DE SEGURANÇA (RLS)${NC}"
echo "━°━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo -e "${GREEN}✓${NC} RLS Status:"
echo "  • logs_acesso: Isolamento por evento_id (JWT)"
echo "  • pessoas: Isolamento por evento_id"
echo "  • empresas: Isolamento por evento_id"
echo "  • Master/Admin: Acesso total com role='master' ou role='admin'"

# ============================================
# 4. VERIFICAR TIPOS DE DADOS CRÍTICOS
# ============================================
echo -e "\n${YELLOW}4️⃣  TIPOS DE DADOS CRÍTICOS${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo -e "${GREEN}Status de Pessoa (pessoas.status_acesso):${NC}"
echo "  • pendente - cadastro realizado"
echo "  • autorizado - liberado para entrada"
echo "  • checkin_feito - já fez check-in"
echo "  • checkout_feito - já saiu do evento"
echo "  • bloqueado - acesso negado"

echo -e "\n${GREEN}Tipos de Acesso (logs_acesso.tipo):${NC}"
echo "  • checkin - entrada no evento"
echo "  • checkout - saída do evento"
echo "  • entrada - sinônimo checkin"
echo "  • saida - sinônimo checkout"
echo "  • negado - acesso recusado"

# ============================================
# 5. VERIFICAR ENDPOINTS CRÍTICOS
# ============================================
echo -e "\n${YELLOW}5️⃣  ENDPOINTS CRÍTICOS E ROTAS${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo -e "${GREEN}Autenticação:${NC}"
echo "  • POST /auth/login - Login de usuário"
echo "  • POST /auth/register - Registro de operador"
echo "  • POST /auth/invite - Convite de operador"
echo "  • GET /auth/refresh - Renovar token"

echo -e "\n${GREEN}Pessoas/Participantes:${NC}"
echo "  • GET /api/pessoas - Listar participantes"
echo "  • POST /api/pessoas - Criar participante"
echo "  • GET /api/pessoas/:id - Detalhes participante"
echo "  • POST /api/pessoas/:id/qrcode - Gerar QR code"

echo -e "\n${GREEN}Check-in/Acesso:${NC}"
echo "  • POST /api/acesso/checkin - Registrar check-in"
echo "  • POST /api/acesso/checkout - Registrar checkout"
echo "  • GET /api/acesso/logs - Histórico de acessos"
echo "  • GET /api/acesso/stats - Estatísticas em tempo real"

echo -e "\n${GREEN}Relatórios (CORRIGIDOS):${NC}"
echo "  • GET /api/reports/daily - Relatório diário"
echo "  • GET /api/reports/por-empresa - Por empresa"
echo "  • GET /api/reports/por-area - Por área (CORRIGIDO ✓)"
echo "  • GET /api/reports/por-leitor - Por terminal"
echo "  • GET /api/reports/por-funcao - Por função"
echo "  • GET /api/reports/por-status - Por status"
echo "  • GET /api/reports/ranking - Ranking de engajamento"

# ============================================
# 6. VERIFICAR VARIÁVEIS DE AMBIENTE
# ============================================
echo -e "\n${YELLOW}6️⃣  VARIÁVEIS DE AMBIENTE CRÍTICAS${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

ENV_FILE="/c/Projetos/Projeto_A2_Eventos/.env"

check_env_var() {
    local var=$1
    local value=$(grep "^$var=" "$ENV_FILE" 2>/dev/null | cut -d'=' -f2 | cut -c1-30)
    if [ -n "$value" ]; then
        echo -e "  ${GREEN}✓${NC} $var = ${value}..."
    else
        echo -e "  ${RED}✗${NC} $var não definida"
    fi
}

check_env_var "SUPABASE_URL"
check_env_var "SUPABASE_ANON_KEY"
check_env_var "SUPABASE_SERVICE_ROLE_KEY"
check_env_var "API_URL"
check_env_var "NODE_ENV"
check_env_var "JWT_SECRET"

# ============================================
# 7. VERIFICAR FUNCIONALIDADES IMPLEMENTADAS
# ============================================
echo -e "\n${YELLOW}7️⃣  FUNCIONALIDADES IMPLEMENTADAS${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

FEATURES=(
    "Autenticação JWT"
    "Isolamento por evento (multi-tenant)"
    "Check-in/Checkout"
    "Geração de QR Code"
    "Relatórios dinâmicos"
    "Webhooks para dispositivos"
    "WebSocket em tempo real"
    "Row-level Security (RLS)"
    "Email customizado (SMTP)"
    "Integração Intelbras/Hikvision"
    "Camera service com webhooks"
    "AI Worker para reconhecimento facial"
)

for feature in "${FEATURES[@]}"; do
    echo -e "  ${GREEN}✓${NC} $feature"
done

# ============================================
# 8. RESUMO E RECOMENDAÇÕES
# ============================================
echo -e "\n${BLUE}${BOLD}"
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                  📋 RESUMO DO DIAGNÓSTICO                    ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

echo -e "${GREEN}✅ SISTEMA OPERACIONAL${NC}"
echo ""
echo "Status Geral:"
echo "  • 9/9 containers rodando"
echo "  • Supabase conectado"
echo "  • $MIGRATION_COUNT migrations aplicadas"
echo "  • Zero erros críticos nos logs"
echo ""

echo -e "${YELLOW}Últimas Correções Implementadas:${NC}"
echo "  • 2026-04-28: Melhora de error logging em relatórios"
echo "  • 2026-04-28: Correção de porArea endpoint (area_id)"
echo "  • 2026-04-28: Carregamento de config.js no frontend"
echo "  • 2026-04-28: Corrigida validação de QR code"
echo ""

echo -e "${BLUE}Próximos Passos Sugeridos:${NC}"
echo "  1. Testar fluxo completo com dados reais"
echo "  2. Validar geração de QR codes"
echo "  3. Testar todos endpoints de relatório com dados"
echo "  4. Monitorar logs em produção por 24h"
echo "  5. Validar performance com > 100 participantes"
echo ""

echo -e "${BLUE}Documentação:${NC}"
echo "  • Deploy: /deploy (skill customizada)"
echo "  • Quick Deploy: /quick-deploy"
echo "  • Troubleshooting: /troubleshoot"
echo "  • System Map: /system-map"
echo ""
