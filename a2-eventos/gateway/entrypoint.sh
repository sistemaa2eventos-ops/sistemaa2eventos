#!/bin/sh

echo "🔐 Verificando certificados SSL..."

# Verificar se certificados existem
if [ -f /etc/nginx/certs/origin.pem ] && [ -f /etc/nginx/certs/origin.key ]; then
    echo "🔐 Certificados SSL encontrados. Iniciando Nginx."
else
    echo "⚠️  Certificados SSL não encontrados em /etc/nginx/certs"
    echo "   Os endpoints HTTPS não funcionarão."
fi

# Verificar sintaxe do nginx.conf
echo "🔍 Validando configuração do Nginx..."
nginx -t

# Iniciar nginx em foreground
exec nginx -g 'daemon off;'
