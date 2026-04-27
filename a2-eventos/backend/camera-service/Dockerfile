FROM python:3.10-slim

LABEL maintainer="A2 Eventos <contato@a2eventos.com.br>"
LABEL description="Microsserviço de Câmeras - Reconhecimento Facial e de Placas"

# Variáveis de ambiente
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV DEBIAN_FRONTEND=noninteractive

# Atualizar sistema e instalar dependências do sistema
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    cmake \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender1 \
    libgomp1 \
    curl \
    git \
    wget \
    && rm -rf /var/lib/apt/lists/*

# Criar usuário não-root
RUN useradd -m -s /bin/bash camera && \
    mkdir -p /app/logs && \
    chown -R camera:camera /app

WORKDIR /app

# Copiar dependências primeiro (cache Docker)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copiar código-fonte
COPY src/ ./src/
COPY tests/ ./tests/

# Criar diretórios de trabalho
RUN mkdir -p /tmp/camera-snapshots && \
    chmod 777 /tmp/camera-snapshots

# Trocar para usuário não-root
USER camera

# Expor portas
EXPOSE 8000 8765

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Comando padrão
CMD ["uvicorn", "src.video_server:app", "--host", "0.0.0.0", "--port", "8000"]