FROM node:20-alpine AS builder

ARG VITE_API_URL=https://api.nzt.app.br/api

WORKDIR /app

COPY package*.json ./
RUN npm install --legacy-peer-deps && npm install @rollup/rollup-linux-x64-musl

COPY . .
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM nginx:alpine

RUN rm -rf /usr/share/nginx/html/*
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/ || exit 1

ENTRYPOINT ["/docker-entrypoint.sh"]