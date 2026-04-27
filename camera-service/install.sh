#!/bin/bash
# ============================================
# A2 EVENTOS - SCRIPT DE INSTALAÇÃO
# Módulo de Câmeras - Ubuntu 22.04 / Windows WSL2
# ============================================

set -e

echo "============================================"
echo "A2 EVENTOS - INSTALAÇÃO DO MÓDULO CÂMERAS"
echo "============================================"
echo ""

# Cores
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Detectar SO
detect_os() {
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        if grep -qEi "Microsoft|WSL" /proc/version; then
            echo "wsl"
        else
            echo "linux"
        fi
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        echo "macos"
    elif [[ "$OSTYPE" == "cygwin" ]] || [[ "$OSTYPE" == "msys" ]]; then
        echo "windows"
    else
        echo "unknown"
    fi
}

OS_TYPE=$(detect_os)
echo "🔍 Sistema detectado: $OS_TYPE"

# ============================================
# INSTALAÇÃO UBUNTU / DEBIAN / WSL
# ============================================
install_ubuntu() {
    echo ""
    echo "📦 Instalando dependências do sistema..."
    sudo apt update
    sudo apt install -y \
        python3.10 \
        python3.10-venv \
        python3.10-dev \
        build-essential \
        cmake \
        libgl1-mesa-glx \
        libglib2.0-0 \
        libsm6 \
        libxext6 \
        libxrender1 \
        libgomp1 \
        libgthread-2.0-0 \
        git \
        wget \
        curl \
        ffmpeg \
        redis-server

    echo ""
    echo "🐍 Configurando Python..."
    
    # Criar venv
    python3.10 -m venv venv
    
    # Ativar venv
    source venv/bin/activate
    
    # Upgrade pip
    pip install --upgrade pip setuptools wheel
    
    echo ""
    echo "📚 Instalando dependências Python..."
    pip install -r requirements.txt
    
    echo ""
    echo "${GREEN}✅ Instalação concluída!${NC}"
    echo ""
    echo "Próximos passos:"
    echo "  1. Copie .env.example para .env e configure as variáveis"
    echo "  2. Execute o SQL de migrations no Supabase"
    echo "  3. Inicie o servidor: uvicorn src.video_server:app --host 0.0.0.0 --port 8000"
}

# ============================================
# INSTALAÇÃO WINDOWS (NATIVO)
# ============================================
install_windows() {
    echo ""
    echo "⚠️ Para Windows, recomendamos usar WSL2 ou Docker."
    echo ""
    echo "Opção 1 - WSL2 (Recomendado):"
    echo "  1. Abra PowerShell como Administrador"
    echo "  2. Execute: wsl --install"
    echo "  3. Reinicie o computador"
    echo "  4. Execute este script novamente no WSL"
    echo ""
    echo "Opção 2 - Docker:"
    echo "  1. Instale Docker Desktop"
    echo "  2. Execute: docker-compose up -d"
    echo ""
    echo "Opção 3 - Python nativo (limitado):"
    echo "  1. Instale Python 3.10+"
    echo "  2. Execute: pip install -r requirements.txt"
}

# ============================================
# INSTALAÇÃO DOCKER (MULTI-PLATAFORMA)
# ============================================
install_docker() {
    echo ""
    echo "🐳 Verificando Docker..."
    
    if ! command -v docker &> /dev/null; then
        echo "${RED}❌ Docker não encontrado. Instale o Docker Desktop.${NC}"
        return 1
    fi
    
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        echo "${RED}❌ Docker Compose não encontrado.${NC}"
        return 1
    fi
    
    echo ""
    echo "📋 Configurações:"
    echo ""
    echo -n "Supabase URL: "
    read SUPABASE_URL
    echo -n "Supabase Service Key: "
    read -s SUPABASE_SERVICE_KEY
    echo ""
    echo -n "API A2 URL [http://localhost:3001]: "
    read A2_API_URL
    A2_API_URL=${A2_API_URL:-http://localhost:3001}
    
    # Gerar .env
    cat > .env << EOF
SUPABASE_URL=$SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_KEY
A2_API_URL=$A2_API_URL
REDIS_HOST=redis
REDIS_PORT=6379
FACE_TOLERANCE=0.6
MIN_FACE_SIZE=150
CONFIDENCE_THRESHOLD=0.65
FRAME_SKIP=3
HOST=0.0.0.0
PORT=8000
LOG_LEVEL=INFO
EOF
    
    echo ""
    echo "🐳 Construindo e iniciando containers..."
    docker-compose up -d --build
    
    echo ""
    echo "${GREEN}✅ Módulo de câmeras iniciado!${NC}"
    echo ""
    echo "Serviços disponíveis:"
    echo "  - Servidor de vídeo: http://localhost:8000"
    echo "  - Dashboard: arquivo src/dashboard/monitor.html"
    echo "  - Redis: localhost:6379"
    echo ""
    echo "Ver logs: docker-compose logs -f"
    echo "Parar: docker-compose down"
}

# ============================================
# VERIFICAÇÃO DO SISTEMA
# ============================================
verify_installation() {
    echo ""
    echo "🔍 Verificando instalação..."
    
    local errors=0
    
    # Python
    if command -v python3 &> /dev/null; then
        echo "${GREEN}✓${NC} Python encontrado: $(python3 --version)"
    else
        echo "${RED}✗${NC} Python não encontrado"
        errors=$((errors + 1))
    fi
    
    # pip
    if python3 -m pip --version &> /dev/null; then
        echo "${GREEN}✓${NC} pip encontrado"
    else
        echo "${RED}✗${NC} pip não encontrado"
        errors=$((errors + 1))
    fi
    
    # OpenCV
    if python3 -c "import cv2; print(cv2.__version__)" &> /dev/null; then
        echo "${GREEN}✓${NC} OpenCV encontrado"
    else
        echo "${YELLOW}⚠${NC} OpenCV não encontrado (instalar: pip install opencv-python)"
        errors=$((errors + 1))
    fi
    
    # Redis
    if command -v redis-server &> /dev/null; then
        echo "${GREEN}✓${NC} Redis encontrado"
    else
        echo "${YELLOW}⚠${NC} Redis não encontrado (opcional)"
    fi
    
    echo ""
    if [ $errors -eq 0 ]; then
        echo "${GREEN}✅ Verificação concluída sem erros${NC}"
    else
        echo "${YELLOW}⚠${NC} Verificação concluída com $errors aviso(s)"
    fi
}

# ============================================
# EXECUTAR MIGRATIONS
# ============================================
run_migrations() {
    echo ""
    echo "📄 Para executar as migrations no Supabase:"
    echo ""
    echo "1. Acesse o painel do Supabase"
    echo "2. Vá em SQL Editor"
    echo "3. Copie o conteúdo do arquivo: src/db/migrations.sql"
    echo "4. Execute o SQL"
    echo ""
    echo "Ou use o CLI:"
    echo "  supabase db execute -f src/db/migrations.sql"
}

# ============================================
# MENU PRINCIPAL
# ============================================
show_menu() {
    echo ""
    echo "============================================"
    echo "OPÇÕES DE INSTALAÇÃO"
    echo "============================================"
    echo "1. Instalar com Docker (Recomendado)"
    echo "2. Instalar no Ubuntu/WSL"
    echo "3. Verificar instalação"
    echo "4. Executar migrations"
    echo "5. Sair"
    echo ""
    echo -n "Escolha uma opção: "
    read choice
    
    case $choice in
        1)
            install_docker
            ;;
        2)
            install_ubuntu
            ;;
        3)
            verify_installation
            ;;
        4)
            run_migrations
            ;;
        5)
            echo "Saindo..."
            exit 0
            ;;
        *)
            echo "Opção inválida"
            ;;
    esac
}

# ============================================
# EXECUÇÃO PRINCIPAL
# ============================================
main() {
    echo "Instalação do Módulo de Câmeras - A2 Eventos"
    echo ""
    
    # Verificar se está no diretório correto
    if [ ! -f "requirements.txt" ]; then
        echo "${RED}❌ requirements.txt não encontrado.${NC}"
        echo "Execute este script dentro do diretório camera-service/"
        exit 1
    fi
    
    if [ "$OS_TYPE" == "unknown" ]; then
        echo "${YELLOW}⚠${NC} Sistema não identificado. Usando instalação genérica."
        show_menu
    else
        show_menu
    fi
}

main "$@"