#!/bin/bash
# Script de Monitoramento de Erros - A2 Eventos
# Monitora logs de todos os containers em tempo real
# Execute: bash MONITOR_ERROS.sh

set +e

echo "======================================"
echo "🔍 MONITOR DE ERROS - A2 EVENTOS"
echo "======================================"
echo ""
echo "Monitorando logs de todos os containers..."
echo "Pressione Ctrl+C para parar"
echo ""
echo "Filtros aplicados:"
echo "  - ERROR, ERRO, erro"
echo "  - Exception, exception, EXCEPTION"
echo "  - FAILED, failed, Fail"
echo "  - WARN, warn, Warning"
echo "  - FATAL, fatal"
echo ""
echo "======================================"
echo ""

# Cores para output
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Array de containers
CONTAINERS=("a2_eventos_api" "a2_eventos_admin_web" "a2_eventos_pg_edge" "a2_eventos_redis" "a2_eventos_gateway")

# Função para colorir output
colorize_log() {
    local line="$1"
    local container="$2"

    # Adicionar cor de container
    if [[ "$line" == *"ERROR"* ]] || [[ "$line" == *"erro"* ]] || [[ "$line" == *"ERRO"* ]]; then
        echo -e "${RED}[$(date '+%H:%M:%S')]${NC} ${BLUE}[$container]${NC} ${RED}$line${NC}"
    elif [[ "$line" == *"Exception"* ]] || [[ "$line" == *"exception"* ]] || [[ "$line" == *"EXCEPTION"* ]]; then
        echo -e "${RED}[$(date '+%H:%M:%S')]${NC} ${BLUE}[$container]${NC} ${RED}$line${NC}"
    elif [[ "$line" == *"FAILED"* ]] || [[ "$line" == *"failed"* ]] || [[ "$line" == *"Fail"* ]]; then
        echo -e "${RED}[$(date '+%H:%M:%S')]${NC} ${BLUE}[$container]${NC} ${RED}$line${NC}"
    elif [[ "$line" == *"WARN"* ]] || [[ "$line" == *"warn"* ]] || [[ "$line" == *"Warning"* ]]; then
        echo -e "${YELLOW}[$(date '+%H:%M:%S')]${NC} ${BLUE}[$container]${NC} ${YELLOW}$line${NC}"
    elif [[ "$line" == *"FATAL"* ]] || [[ "$line" == *"fatal"* ]]; then
        echo -e "${RED}[$(date '+%H:%M:%S')]${NC} ${BLUE}[$container]${NC} ${RED}$line${NC}"
    else
        echo -e "${GREEN}[$(date '+%H:%M:%S')]${NC} ${BLUE}[$container]${NC} $line"
    fi
}

# Função para monitorar um container
monitor_container() {
    local container="$1"

    # Verificar se container existe
    if ! docker ps -a --format '{{.Names}}' | grep -q "^${container}$"; then
        return
    fi

    # Monitorar logs em tempo real
    docker logs -f "$container" 2>&1 | grep -i -E "ERROR|erro|exception|failed|fail|warn|fatal" | while read line; do
        colorize_log "$line" "$container"
    done &
}

# Iniciar monitoramento de todos os containers
echo -e "${GREEN}Iniciando monitoramento...${NC}\n"

for container in "${CONTAINERS[@]}"; do
    monitor_container "$container"
done

# Aguardar Ctrl+C
trap 'echo -e "\n${YELLOW}Monitor interrompido${NC}"; exit 0' SIGINT SIGTERM

wait
