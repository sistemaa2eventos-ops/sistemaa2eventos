#!/bin/sh

# 🛡️ A2 Eventos - Gateway Entrypoint
# Este script garante que o Nginx suba mesmo sem certificados externos.

CERT_PATH="/etc/nginx/certs/origin.pem"
KEY_PATH="/etc/nginx/certs/origin.key"

# Verificar se os certificados válidos existem
if [ -f "$CERT_PATH" ] && [ -f "$KEY_PATH" ]; then
    # Verificar se é da Cloudflare (certificado de produção)
    if grep -q "CloudFlare" "$CERT_PATH" 2>/dev/null; then
        echo "🔐 Certificado Cloudflare Origin encontrado. Iniciando com segurança máxima."
    else
        echo "🔐 Certificados SSL encontrados. Iniciando Nginx."
    fi
else
    # Se não existem certificados, gerar temporários
    echo "⚠️ Certificados SSL não encontrados em $CERT_PATH"
    echo "🛠️ Gerando certificados auto-assinados temporários..."
    
    mkdir -p /etc/nginx/certs
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout "$KEY_PATH" \
        -out "$CERT_PATH" \
        -subj "/C=BR/ST=SP/L=SaoPaulo/O=A2Eventos/OU=IT/CN=*.nzt.app.br"
    
    echo "✅ Certificados temporários gerados com sucesso."
fi

# Iniciar Nginx em primeiro plano
exec nginx -g "daemon off;"
