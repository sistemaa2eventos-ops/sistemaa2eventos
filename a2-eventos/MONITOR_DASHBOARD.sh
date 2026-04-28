#!/bin/bash
# Dashboard de Monitoramento de Erros - A2 Eventos
# Mostra erros em tempo real com contadores
# Execute: bash MONITOR_DASHBOARD.sh

set +e

# Cores
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# Arquivo temporário para contadores
COUNTER_FILE="/tmp/a2_error_counters_$$.txt"
LOG_FILE="/tmp/a2_errors_$$.log"

# Inicializar contadores
init_counters() {
    echo "0" > "$COUNTER_FILE.api_errors"
    echo "0" > "$COUNTER_FILE.api_warnings"
    echo "0" > "$COUNTER_FILE.db_errors"
    echo "0" > "$COUNTER_FILE.gateway_errors"
}

# Limpar arquivos ao sair
cleanup() {
    echo -e "\n${YELLOW}Limpando arquivos temporários...${NC}"
    rm -f "$COUNTER_FILE"* "$LOG_FILE"
    echo -e "${GREEN}Monitor interrompido${NC}"
    exit 0
}

trap cleanup SIGINT SIGTERM

# Mostrar cabeçalho
show_header() {
    clear
    echo -e "${BLUE}${BOLD}"
    echo "╔════════════════════════════════════════════════════════════════╗"
    echo "║        🔍 DASHBOARD DE MONITORAMENTO - A2 EVENTOS             ║"
    echo "╚════════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    echo -e "${CYAN}Status dos Containers:${NC}"
    docker ps --format "table {{.Names}}\t{{.Status}}" | grep -E "a2_eventos" | \
    while read line; do
        if [[ "$line" == *"Up"* ]]; then
            echo -e "${GREEN}✓${NC} $line"
        else
            echo -e "${RED}✗${NC} $line"
        fi
    done
    echo ""
    echo -e "${CYAN}Contadores de Erros:${NC}"
}

# Mostrar contadores
show_counters() {
    local api_errors=$(cat "$COUNTER_FILE.api_errors" 2>/dev/null || echo "0")
    local api_warnings=$(cat "$COUNTER_FILE.api_warnings" 2>/dev/null || echo "0")
    local db_errors=$(cat "$COUNTER_FILE.db_errors" 2>/dev/null || echo "0")
    local gateway_errors=$(cat "$COUNTER_FILE.gateway_errors" 2>/dev/null || echo "0")

    echo -e "  ${RED}API Errors: $api_errors${NC} | ${YELLOW}API Warnings: $api_warnings${NC} | ${RED}DB Errors: $db_errors${NC} | ${RED}Gateway Errors: $gateway_errors${NC}"
    echo ""
    echo -e "${CYAN}Erros Mais Recentes:${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

# Monitor API
monitor_api() {
    docker logs -f a2_eventos_api 2>&1 | while read line; do
        # Contar erros
        if [[ "$line" == *"ERROR"* ]] || [[ "$line" == *"❌"* ]]; then
            echo "ERROR|api|$line" >> "$LOG_FILE"
            count=$(cat "$COUNTER_FILE.api_errors" 2>/dev/null || echo "0")
            echo $((count + 1)) > "$COUNTER_FILE.api_errors"
        fi

        # Contar warnings
        if [[ "$line" == *"WARN"* ]] || [[ "$line" == *"⚠️"* ]]; then
            echo "WARN|api|$line" >> "$LOG_FILE"
            count=$(cat "$COUNTER_FILE.api_warnings" 2>/dev/null || echo "0")
            echo $((count + 1)) > "$COUNTER_FILE.api_warnings"
        fi
    done &
}

# Monitor Banco de Dados
monitor_db() {
    docker logs -f a2_eventos_pg_edge 2>&1 | while read line; do
        if [[ "$line" == *"ERROR"* ]] || [[ "$line" == *"error"* ]] || [[ "$line" == *"fatal"* ]]; then
            echo "ERROR|db|$line" >> "$LOG_FILE"
            count=$(cat "$COUNTER_FILE.db_errors" 2>/dev/null || echo "0")
            echo $((count + 1)) > "$COUNTER_FILE.db_errors"
        fi
    done &
}

# Monitor Gateway
monitor_gateway() {
    docker logs -f a2_eventos_gateway 2>&1 | while read line; do
        if [[ "$line" == *"error"* ]] || [[ "$line" == *"ERROR"* ]]; then
            echo "ERROR|gateway|$line" >> "$LOG_FILE"
            count=$(cat "$COUNTER_FILE.gateway_errors" 2>/dev/null || echo "0")
            echo $((count + 1)) > "$COUNTER_FILE.gateway_errors"
        fi
    done &
}

# Mostrar últimos erros
show_recent_errors() {
    if [ -f "$LOG_FILE" ]; then
        tail -20 "$LOG_FILE" | while read line; do
            IFS='|' read -r type container message <<< "$line"
            timestamp=$(date '+%H:%M:%S')

            case "$type" in
                ERROR)
                    echo -e "${RED}[$timestamp] [$container]${NC} $message"
                    ;;
                WARN)
                    echo -e "${YELLOW}[$timestamp] [$container]${NC} $message"
                    ;;
            esac
        done
    else
        echo -e "${GREEN}Nenhum erro registrado até agora${NC}"
    fi
}

# Loop principal
init_counters

while true; do
    show_header
    show_counters
    show_recent_errors

    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${YELLOW}Atualizando a cada 5 segundos... (Ctrl+C para parar)${NC}"

    sleep 5
done

# Iniciar monitores
monitor_api
monitor_db
monitor_gateway

# Aguardar
wait
