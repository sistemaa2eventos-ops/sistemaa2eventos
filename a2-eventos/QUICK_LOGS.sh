#!/bin/bash
# Quick Log Viewer - Visualizar logs com cores
# Uso: bash QUICK_LOGS.sh [api|db|gateway|all]

CONTAINER="${1:-api}"
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

case "$CONTAINER" in
    api)
        echo "📊 Mostrando logs da API (últimas 100 linhas)..."
        docker logs a2_eventos_api --tail=100 | tail -100 | grep -E "ERROR|error|WARN|warn|Exception|failed" --color=always
        echo ""
        echo "🔄 Monitorando em tempo real (Ctrl+C para parar)..."
        docker logs -f a2_eventos_api | grep -E "ERROR|error|WARN|warn|Exception|failed|❌|⚠️" --color=always
        ;;
    db)
        echo "📊 Mostrando logs do Banco de Dados (últimas 100 linhas)..."
        docker logs a2_eventos_pg_edge --tail=100 | tail -100 | grep -E "ERROR|error|FATAL|fatal" --color=always
        echo ""
        echo "🔄 Monitorando em tempo real (Ctrl+C para parar)..."
        docker logs -f a2_eventos_pg_edge | grep -E "ERROR|error|FATAL|fatal" --color=always
        ;;
    gateway)
        echo "📊 Mostrando logs do Gateway/Nginx (últimas 100 linhas)..."
        docker logs a2_eventos_gateway --tail=100 | tail -100 | grep -E "error|ERROR|502|503|504" --color=always
        echo ""
        echo "🔄 Monitorando em tempo real (Ctrl+C para parar)..."
        docker logs -f a2_eventos_gateway | grep -E "error|ERROR|502|503|504" --color=always
        ;;
    all)
        echo "📊 Mostrando TODOS os logs com erros..."
        echo -e "${YELLOW}=== API ===${NC}"
        docker logs a2_eventos_api --tail=50 | grep -i "error\|warn\|❌\|⚠️" --color=always
        echo ""
        echo -e "${YELLOW}=== Banco de Dados ===${NC}"
        docker logs a2_eventos_pg_edge --tail=50 | grep -i "error" --color=always
        echo ""
        echo -e "${YELLOW}=== Gateway ===${NC}"
        docker logs a2_eventos_gateway --tail=50 | grep -i "error" --color=always
        echo ""
        echo -e "${YELLOW}=== Admin Web ===${NC}"
        docker logs a2_eventos_admin_web --tail=50 | grep -i "error" --color=always
        ;;
    *)
        echo -e "${RED}Uso: bash QUICK_LOGS.sh [api|db|gateway|all]${NC}"
        echo ""
        echo "Exemplos:"
        echo "  bash QUICK_LOGS.sh api          # Monitorar API em tempo real"
        echo "  bash QUICK_LOGS.sh db           # Monitorar Banco de Dados"
        echo "  bash QUICK_LOGS.sh gateway      # Monitorar Nginx/Gateway"
        echo "  bash QUICK_LOGS.sh all          # Ver todos os erros de uma vez"
        ;;
esac
