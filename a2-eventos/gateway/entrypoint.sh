#!/bin/sh

# 🛡️ A2 Eventos - Gateway Entrypoint
# Este script garante que o Nginx suba mesmo sem certificados externos.

CERT_PATH="/etc/nginx/certs/origin.pem"
KEY_PATH="/etc/nginx/certs/origin.key"

if [ ! -f "$CERT_PATH" ]; then
    echo "⚠️ Certificados SSL não encontrados em $CERT_PATH"
    echo "🛠️ Gerando certificados auto-assinados temporários para evitar Erro 522..."
    
    mkdir -p /etc/nginx/certs
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout "$KEY_PATH" \
        -out "$CERT_PATH" \
        -subj "/C=BR/ST=SP/L=SaoPaulo/O=A2Eventos/OU=IT/CN=*.nzt.app.br"
    
    echo "✅ Certificados temporários gerados com sucesso."
else
    echo "🔐 Certificados SSL encontrados. Iniciando com segurança máxima."
fi

# Iniciar Nginx em primeiro plano
exec nginx -g "daemon off;"
