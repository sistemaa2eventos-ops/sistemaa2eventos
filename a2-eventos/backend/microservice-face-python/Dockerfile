FROM python:3.12-slim-bookworm

WORKDIR /app

# Instalar dependências do sistema necessárias para compilar InsightFace (C++) e rodar OpenCV
RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    g++ \
    libgl1-mesa-glx \
    libglib2.0-0 \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY src/ ./src/
RUN mkdir -p logs

EXPOSE 8000

# Healthcheck que verifica se a API do worker está respondendo e se o modelo foi carregado (opcional no main.py)
HEALTHCHECK --interval=30s --timeout=15s --retries=3 \
  CMD curl -f http://localhost:8000/health || exit 1

CMD ["python", "src/main.py"]