#!/bin/sh
set -e

CERT_DIR=/etc/nginx/certs
SSL_CERT=$CERT_DIR/origin.pem
SSL_KEY=$CERT_DIR/origin.key

echo "🔐 Verificando certificados SSL..."

if [ -f "$SSL_CERT" ] && [ -f "$SSL_KEY" ]; then
    echo "🔐 Certificado de origem encontrado em $CERT_DIR."
else
    # O volume é montado somente leitura: o provisório vai para outro diretório
    # e o nginx.conf é ajustado para apontar para ele.
    echo "⚠️  Certificado de origem não encontrado em $CERT_DIR."
    echo "   Gerando autoassinado provisório (funciona com Cloudflare SSL 'Full', não com 'Full (strict)')."
    TMP_DIR=/etc/nginx/certs-provisorio
    mkdir -p "$TMP_DIR"
    openssl req -x509 -nodes -newkey rsa:2048 -days 365 \
        -subj "/CN=*.nzt.app.br" \
        -keyout "$TMP_DIR/origin.key" -out "$TMP_DIR/origin.pem" 2>/dev/null
    sed -i "s#$CERT_DIR/#$TMP_DIR/#g" /etc/nginx/nginx.conf
fi

# Verificar sintaxe do nginx.conf
echo "🔍 Validando configuração do Nginx..."
nginx -t

# Iniciar nginx em foreground
exec nginx -g 'daemon off;'
