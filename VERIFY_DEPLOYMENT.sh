#!/bin/bash
# Verifica se a VPS tem o código mais recente deployado
# Uso: bash VERIFY_DEPLOYMENT.sh

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}${BOLD}"
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║      ✅ VERIFICAÇÃO DE DEPLOYMENT - A2 EVENTOS                ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# ============================================
# 1. Verificar Git Status
# ============================================
echo -e "\n${YELLOW}1️⃣  GIT STATUS${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

CURRENT_BRANCH=$(git branch --show-current)
LATEST_COMMIT=$(git log -1 --oneline)

echo -e "Branch: ${GREEN}$CURRENT_BRANCH${NC}"
echo -e "Último commit: ${GREEN}$LATEST_COMMIT${NC}"

# Verificar commits não pusheados
UNPUSHED=$(git log origin/$CURRENT_BRANCH..$CURRENT_BRANCH --oneline | wc -l)
if [ "$UNPUSHED" -gt 0 ]; then
    echo -e "${YELLOW}⚠${NC} $UNPUSHED commits NÃO pushados para origin"
else
    echo -e "${GREEN}✓${NC} Todos commits estão sincronizados"
fi

# ============================================
# 2. Verificar Mudanças Não Commitadas
# ============================================
echo -e "\n${YELLOW}2️⃣  MUDANÇAS LOCAIS${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

CHANGES=$(git status --short | wc -l)
if [ "$CHANGES" -eq 0 ]; then
    echo -e "${GREEN}✓${NC} Sem mudanças não-commitadas"
else
    echo -e "${YELLOW}⚠${NC} $CHANGES arquivo(s) modificado(s):"
    git status --short | head -10
fi

# ============================================
# 3. Verificar Versão no Container
# ============================================
echo -e "\n${YELLOW}3️⃣  CÓDIGO NO CONTAINER${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if docker ps | grep -q "a2_eventos_api"; then
    # Verificar se foi adicionado suporte a emailService.sendOperatorInvite()
    if docker exec a2_eventos_api grep -r "sendOperatorInvite" src/ 2>/dev/null | grep -q "sendOperatorInvite"; then
        echo -e "${GREEN}✓${NC} SMTP customizado (sendOperatorInvite) está no container"
    else
        echo -e "${RED}✗${NC} SMTP customizado NÃO encontrado no container"
        echo "  → Precisa fazer rebuild com 'docker-compose build --no-cache'"
    fi

    # Verificar se tem novo endpoint de delete de operador
    if docker exec a2_eventos_api grep -r "DELETE.*users" src/modules/auth/ 2>/dev/null | grep -q "deleteUser"; then
        echo -e "${GREEN}✓${NC} Endpoint DELETE /auth/users/:userId está no container"
    else
        echo -e "${YELLOW}⚠${NC} Endpoint DELETE não encontrado (pode estar em git mas não deployado)"
    fi

    # Verificar se CPF foi removido
    if docker exec a2_eventos_api grep -r "cpf" src/modules/auth/auth.controller.js 2>/dev/null | grep -q "cpf"; then
        echo -e "${YELLOW}⚠${NC} CPF ainda referenciado em auth.controller.js (talvez em logs apenas)"
    else
        echo -e "${GREEN}✓${NC} CPF removido de auth.controller.js"
    fi
else
    echo -e "${RED}✗${NC} Container a2_eventos_api não está rodando"
    echo "  → Inicie com: docker-compose up -d"
fi

# ============================================
# 4. Comparar Commits
# ============================================
echo -e "\n${YELLOW}4️⃣  ÚLTIMOS COMMITS IMPORTANTES${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo "Esperado para estar deployado:"
echo -e "  ${GREEN}✓${NC} feat(auth): adicionar endpoint DELETE"
echo -e "  ${GREEN}✓${NC} feat(frontend): adicionar botão de deletar operador"
echo -e "  ${GREEN}✓${NC} feat: implementar SMTP customizado"
echo -e "  ${GREEN}✓${NC} fix(auth): corrigir sintaxe de query email"
echo ""

echo "Procurando nesses commits..."
if git log --oneline -20 | grep -q "SMTP customizado"; then
    echo -e "${GREEN}✓${NC} SMTP customizado encontrado"
else
    echo -e "${RED}✗${NC} SMTP customizado não encontrado nos últimos 20 commits"
fi

if git log --oneline -20 | grep -q "DELETE.*operador"; then
    echo -e "${GREEN}✓${NC} Delete operador encontrado"
else
    echo -e "${YELLOW}⚠${NC} Delete operador não encontrado (cheque git log)"
fi

# ============================================
# 5. Verificar Docker Images
# ============================================
echo -e "\n${YELLOW}5️⃣  DOCKER IMAGES${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

docker images | grep a2_eventos | while read line; do
    IMAGE_NAME=$(echo $line | awk '{print $1}')
    IMAGE_TAG=$(echo $line | awk '{print $2}')
    IMAGE_ID=$(echo $line | awk '{print $3}')
    CREATED=$(echo $line | awk '{print $4}')

    if [ "$IMAGE_TAG" == "latest" ]; then
        echo -e "  ${GREEN}✓${NC} $IMAGE_NAME:$IMAGE_TAG (criada há $CREATED)"
    fi
done

# ============================================
# 6. Tempo desde último rebuild
# ============================================
echo -e "\n${YELLOW}6️⃣  HISTÓRICO DE REBUILD${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

CONTAINER_CREATED=$(docker inspect a2_eventos_api --format='{{.Created}}' 2>/dev/null)
if [ ! -z "$CONTAINER_CREATED" ]; then
    echo -e "Container criado em: ${YELLOW}$CONTAINER_CREATED${NC}"
fi

LATEST_GIT_COMMIT_TIME=$(git log -1 --format=%ai)
echo -e "Último commit em: ${YELLOW}$LATEST_GIT_COMMIT_TIME${NC}"

# ============================================
# 7. Resumo de Ações Necessárias
# ============================================
echo -e "\n${BLUE}${BOLD}"
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                       📋 O QUE FAZER                          ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

NEEDS_REBUILD=0

# Se há mudanças não commitadas
if [ "$CHANGES" -gt 0 ]; then
    echo -e "${YELLOW}1. Commit mudanças locais:${NC}"
    echo "   git add ."
    echo "   git commit -m 'description'"
    echo ""
    NEEDS_REBUILD=1
fi

# Se há commits não pusheados
if [ "$UNPUSHED" -gt 0 ]; then
    echo -e "${YELLOW}2. Push commits para origin:${NC}"
    echo "   git push origin $CURRENT_BRANCH"
    echo ""
    NEEDS_REBUILD=1
fi

if [ "$NEEDS_REBUILD" -eq 1 ]; then
    echo -e "${YELLOW}3. Fazer rebuild na VPS:${NC}"
    echo "   docker-compose down"
    echo "   docker-compose build --no-cache"
    echo "   docker-compose up -d"
    echo ""
fi

if [ "$CHANGES" -eq 0 ] && [ "$UNPUSHED" -eq 0 ]; then
    echo -e "${GREEN}✅ Seu deployment está em sincronismo!${NC}"
    echo ""
    echo "Próximos passos:"
    echo "1. Verificar com: bash DIAGNOSE.sh"
    echo "2. Se houver erros, seguir: cat FIX_SUPABASE_PERSON.md"
fi

echo ""
