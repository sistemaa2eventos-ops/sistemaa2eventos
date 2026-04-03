# Fase 1: Build (A Fábrica Digital)
FROM node:18-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Fase 2: Produção (O Trono de Entrega)
FROM nginx:alpine

# Remove o index default do nginx
RUN rm -rf /usr/share/nginx/html/*

# Copia a pasta /dist gerada na Fase 1 para o Nginx
COPY --from=build /app/dist /usr/share/nginx/html

# Copiar nosso arquivo de configuração personalizado do Nginx que suporta PWA e React Router (try_files)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# A porta 80 é exposta
EXPOSE 80

# healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost/ || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
