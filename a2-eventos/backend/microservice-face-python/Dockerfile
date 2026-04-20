FROM python:3.12-slim-bookworm

WORKDIR /app

RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    libgl1-mesa-glx \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY src/ ./src/
# O .env agora é injetado via docker-compose para flexibilidade total
# COPY .env .

RUN mkdir -p logs

EXPOSE 8000

CMD ["python", "src/main.py"]