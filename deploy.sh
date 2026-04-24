#!/bin/bash

# ============================================================================
# 🚀 SCRIPT DE DEPLOY AUTOMÁTICO — A2 Eventos
# ============================================================================
# Uso: ./deploy.sh [opção]
#   ./deploy.sh full      → Deploy completo (limpeza + build + start)
#   ./deploy.sh quick     → Deploy rápido (só restart)
#   ./deploy.sh check     → Apenas verificações (sem mudanças)
#   ./deploy.sh logs      → Ver logs em tempo real
#   ./deploy.sh stop      → Parar serviços
#   ./deploy.sh help      → Ver ajuda
# ============================================================================

set -e  # Exit se houver erro

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Função de log
log_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

log_success() {
    echo -e "${GREEN}✓${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

log_error() {
    echo -e "${RED}✗${NC} $1"
}

# ============================================================================
# FASE 0: PRÉ-DEPLOY
# ============================================================================
pre_deploy_check() {
    log_info "Executando verificações pré-deploy..."
    echo ""

    # 1. Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker não instalado"
        exit 1
    fi
    log_success "Docker encontrado: $(docker --version)"

    # 2. Docker-compose
    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker-compose não instalado"
        exit 1
    fi
    log_success "Docker-compose encontrado: $(docker-compose --version)"

    # 3. Git
    if ! command -v git &> /dev/null; then
        log_error "Git não instalado"
        exit 1
    fi
    log_success "Git encontrado: $(git --version)"

    # 4. Status Git
    if [[ $(git status -s) ]]; then
        log_warn "Há mudanças não-commitadas:"
        git status -s
        read -p "Deseja continuar? (s/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Ss]$ ]]; then
            log_error "Deploy cancelado"
            exit 1
        fi
    else
        log_success "Repositório limpo"
    fi

    # 5. Variáveis de ambiente
    if [ ! -f .env ]; then
        log_error "Arquivo .env não encontrado!"
        exit 1
    fi
    log_success "Arquivo .env encontrado"

    # 6. Supabase
    if grep -q "^SUPABASE_URL=" .env; then
        SUPABASE_URL=$(grep "^SUPABASE_URL=" .env | cut -d '=' -f 2)
        log_success "SUPABASE_URL configurado"
    else
        log_error "SUPABASE_URL não configurado em .env"
        exit 1
    fi

    # 7. Espaço em disco
    DISK_USAGE=$(df . | awk 'NR==2 {print $4}')
    if [ "$DISK_USAGE" -lt 5000000 ]; then  # 5GB em KB
        log_warn "Pouco espaço em disco (<5GB)"
    else
        log_success "Espaço em disco: OK (>5GB)"
    fi

    echo ""
}

# ============================================================================
# FASE 1: PARAR SERVIÇOS
# ============================================================================
stop_services() {
    log_info "Parando containers..."
    docker-compose down --remove-orphans
    sleep 2
    log_success "Containers parados"
}

# ============================================================================
# FASE 2: LIMPEZA
# ============================================================================
cleanup() {
    log_info "Limpando sistema Docker..."

    log_info "  → Removendo imagens órfãs..."
    docker image prune -af --filter "until=24h" || true

    log_info "  → Removendo networks órfãs..."
    docker network prune -f || true

    log_info "  → Removendo volumes órfãs..."
    docker volume prune -f || true

    log_success "Limpeza concluída"
}

# ============================================================================
# FASE 3: ATUALIZAR GIT
# ============================================================================
update_git() {
    log_info "Atualizando código..."

    git fetch origin
    LOCAL=$(git rev-parse @)
    REMOTE=$(git rev-parse @{u})

    if [ "$LOCAL" != "$REMOTE" ]; then
        log_warn "Há mudanças remotas"
        git pull origin master
        log_success "Código atualizado"
    else
        log_success "Código já está atualizado"
    fi
}

# ============================================================================
# FASE 4: BUILD DOCKER
# ============================================================================
build_docker() {
    log_info "Building Docker images (sem cache)..."
    log_warn "Isso pode levar 10-15 minutos..."

    docker-compose build --no-cache

    log_success "Build concluído"
}

# ============================================================================
# FASE 5: START SERVIÇOS
# ============================================================================
start_services() {
    log_info "Iniciando containers..."

    docker-compose up -d

    log_warn "Aguardando inicialização dos serviços..."
    sleep 15

    log_success "Containers iniciados"
}

# ============================================================================
# FASE 6: VERIFICAÇÕES PÓS-DEPLOY
# ============================================================================
post_deploy_check() {
    log_info "Executando verificações pós-deploy..."
    echo ""

    # 1. Docker ps
    log_info "Status dos containers:"
    docker-compose ps
    echo ""

    # 2. Health check backend
    log_info "Testando backend..."
    if curl -s http://localhost:3001/health | grep -q "ok"; then
        log_success "Backend respondendo (http://localhost:3001/health)"
    else
        log_error "Backend não respondeu"
    fi

    # 3. Health check frontend (admin-web nao expoe porta — testar via container)
    log_info "Testando frontend..."
    if docker exec a2_eventos_admin_web wget -q --spider http://localhost/ 2>/dev/null; then
        log_success "Frontend respondendo (admin-web container)"
    else
        log_warn "Frontend pode estar inicializando..."
    fi

    # 4. Nginx proxy
    log_info "Testando Nginx proxy..."
    if curl -s -I http://localhost:80 | grep -q "200\|301\|302"; then
        log_success "Nginx respondendo"
    else
        log_error "Nginx não respondendo"
    fi

    # 5. Supabase connectivity
    log_info "Testando conectividade Supabase..."
    SUPABASE_URL=$(grep "^SUPABASE_URL=" .env | cut -d '=' -f 2)
    if curl -s -I "$SUPABASE_URL" | grep -q "200"; then
        log_success "Supabase acessível"
    else
        log_warn "Supabase pode estar em manutenção"
    fi

    # 6. Ver logs (últimas linhas)
    echo ""
    log_info "Últimas linhas dos logs:"
    echo "─────────────────────────"
    docker-compose logs --tail=10

    echo ""
    log_success "Verificações concluídas!"
}

# ============================================================================
# OPÇÕES
# ============================================================================
show_help() {
    cat << EOF
$BLUE════════════════════════════════════════════════════════════════════════════════$NC
  🚀 SCRIPT DE DEPLOY — A2 Eventos
$BLUE════════════════════════════════════════════════════════════════════════════════$NC

USO:
  ./deploy.sh [OPÇÃO]

OPÇÕES:
  ${GREEN}full${NC}     Deploy completo (pré-check → stop → clean → update → build → start → verify)
             ⏱️  Tempo: ~20-30 minutos

  ${GREEN}quick${NC}    Deploy rápido (build + start + verify)
             ⏱️  Tempo: ~10-15 minutos (sem limpeza)

  ${GREEN}check${NC}    Apenas verificações (sem mudanças)
             ⏱️  Tempo: ~2 minutos

  ${GREEN}logs${NC}     Ver logs em tempo real dos containers
             ⏱️  Pressione Ctrl+C para sair

  ${GREEN}stop${NC}     Parar todos os containers
             ⏱️  Tempo: ~2 minutos

  ${GREEN}restart${NC}  Restart rápido (para + limpar + start)
             ⏱️  Tempo: ~5 minutos

  ${GREEN}help${NC}    Mostrar esta mensagem

EXEMPLOS:
  ./deploy.sh full        # Deploy completo
  ./deploy.sh quick       # Deploy rápido
  ./deploy.sh check       # Apenas verificar
  ./deploy.sh logs        # Ver logs

BEFORE DEPLOY:
  ✅ Verificar Git status
  ✅ Committar mudanças locais
  ✅ Verificar arquivo .env
  ✅ Ter espaço em disco (>5GB)

TROUBLESHOOTING:
  Erro no build?     → Deletar .git/index.lock e tentar novamente
  Erro no docker?    → docker-compose down && docker system prune -af
  Erro Supabase?     → Verificar SUPABASE_URL e SUPABASE_ANON_KEY em .env

$BLUE════════════════════════════════════════════════════════════════════════════════$NC
EOF
}

# ============================================================================
# MAIN
# ============================================================================
main() {
    OPTION=${1:-help}

    case "$OPTION" in
        full)
            log_info "🚀 INICIANDO DEPLOY COMPLETO..."
            echo ""
            pre_deploy_check
            stop_services
            cleanup
            update_git
            build_docker
            start_services
            post_deploy_check
            log_success "✨ DEPLOY COMPLETO FINALIZADO COM SUCESSO!"
            ;;

        quick)
            log_info "⚡ INICIANDO DEPLOY RÁPIDO..."
            echo ""
            pre_deploy_check
            stop_services
            update_git
            build_docker
            start_services
            post_deploy_check
            log_success "✨ DEPLOY RÁPIDO FINALIZADO COM SUCESSO!"
            ;;

        check)
            log_info "🔍 EXECUTANDO VERIFICAÇÕES..."
            echo ""
            pre_deploy_check
            post_deploy_check
            ;;

        logs)
            log_info "📋 Mostrando logs em tempo real (Ctrl+C para sair)..."
            echo ""
            docker-compose logs -f --tail=50
            ;;

        stop)
            log_info "🛑 Parando containers..."
            stop_services
            log_success "Containers parados"
            ;;

        restart)
            log_info "🔄 Restarting serviços..."
            stop_services
            cleanup
            start_services
            post_deploy_check
            log_success "Restart concluído!"
            ;;

        help|--help|-h)
            show_help
            ;;

        *)
            log_error "Opção desconhecida: $OPTION"
            echo ""
            show_help
            exit 1
            ;;
    esac
}

main "$@"
