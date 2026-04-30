FROM nginx:alpine

# Limpar configurações padrão
RUN rm /etc/nginx/nginx.conf

# Copiar a nossa configuração de gateway centralizada
COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
