FROM nginx:alpine

# Limpar configurações padrão
RUN rm /etc/nginx/nginx.conf

# Instalar openssl para permitir a geração de certificados temporários
RUN apk add --no-cache openssl

# Criar pasta de certificados
RUN mkdir -p /etc/nginx/certs

# Copiar a nossa configuração de gateway centralizada
COPY nginx.conf /etc/nginx/nginx.conf

# Copiar certificados (Se existirem localmente)
COPY certs* /etc/nginx/certs/

# Copiar script de entrada
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 80
EXPOSE 443

ENTRYPOINT ["/entrypoint.sh"]
