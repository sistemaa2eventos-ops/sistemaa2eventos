FROM node:20-bullseye-slim

WORKDIR /app

# Copiar package.json e instalar dependências
COPY package*.json ./
RUN npm ci --only=production

# Copiar código fonte
COPY . .

EXPOSE 3001

CMD ["node", "src/app.js"]
