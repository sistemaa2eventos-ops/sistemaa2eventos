FROM nginx:alpine

# openssl: gera certificado provisório se o de origem Cloudflare não estiver montado
RUN apk add --no-cache openssl

# Limpar configurações padrão
RUN rm /etc/nginx/nginx.conf

# Copiar a nossa configuração de gateway centralizada
COPY nginx.conf /etc/nginx/nginx.conf
COPY entrypoint.sh /entrypoint.sh
# sed: remove CRLF caso o arquivo venha de checkout no Windows
RUN sed -i 's/\r$//' /entrypoint.sh && chmod +x /entrypoint.sh

EXPOSE 80 443

CMD ["/entrypoint.sh"]
