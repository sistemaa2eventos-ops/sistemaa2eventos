# 🚀 DEPLOY A2 EVENTOS - PRODUÇÃO

## Informações do Servidor
- **IP:** 187.127.9.59
- **SSH User:** root
- **SSH Port:** 22
- **OS:** Ubuntu 24.04 LTS
- **Domínios:**
  - Frontend: https://painel.nzt.app.br
  - API: https://api.nzt.app.br
  - Raiz: https://nzt.app.br

---

## ⚡ DEPLOY RÁPIDO (Execute no seu servidor)

### 1. Conectar ao servidor via SSH
```bash
ssh root@187.127.9.59
# Senha: hoot
```

### 2. Executar script de deploy
Copie e cole no terminal do servidor (após conectar):

```bash
#!/bin/bash
set -e

echo "🚀 DEPLOY A2 EVENTOS - PRODUÇÃO"

# Atualizar sistema
apt-get update && apt-get upgrade -y

# Instalar dependências
apt-get install -y curl wget git build-essential certbot python3-certbot-nginx nginx ufw

# Node.js v24
curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
apt-get install -y nodejs

# Firewall
ufw allow 22/tcp && ufw allow 80/tcp && ufw allow 443/tcp && ufw --force enable

# Estrutura de diretórios
mkdir -p /var/www/a2-eventos /var/www/certbot
cd /var/www/a2-eventos

# Clone do repositório (OPÇÃO A: Git)
git clone https://github.com/seu-usuario/Projeto_A2_Eventos.git .

# OU OPÇÃO B: Se não conseguir clonar, copie os arquivos manualmente via SCP
# (ver instruções abaixo)

# Instalar backend
cd /var/www/a2-eventos/a2-eventos/backend/api-nodejs
sed -i 's/NODE_ENV=.*/NODE_ENV=production/' .env
npm install --production --legacy-peer-deps
npm run check:all

# Instalar frontend
cd /var/www/a2-eventos/a2-eventos/frontend/web-admin
npm install --legacy-peer-deps
npm run build

# Configurar Nginx
cat > /etc/nginx/sites-available/a2-eventos << 'EOFNGINX'
upstream backend {
    server 127.0.0.1:3001;
    keepalive 64;
}

server {
    listen 80;
    listen [::]:80;
    server_name nzt.app.br painel.nzt.app.br api.nzt.app.br www.nzt.app.br;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$server_name$request_uri;
    }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name painel.nzt.app.br www.nzt.app.br nzt.app.br;

    ssl_certificate /etc/letsencrypt/live/nzt.app.br/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/nzt.app.br/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    client_max_body_size 10M;
    root /var/www/a2-eventos/a2-eventos/frontend/web-admin/dist;
    index index.html;

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location /api/ {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_redirect off;
    }

    location /health {
        proxy_pass http://backend;
        access_log off;
    }

    location /socket.io {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name api.nzt.app.br;

    ssl_certificate /etc/letsencrypt/live/api.nzt.app.br/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.nzt.app.br/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;

    client_max_body_size 10M;

    location / {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }
}
EOFNGINX

ln -sf /etc/nginx/sites-available/a2-eventos /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t

# Systemd service API
cat > /etc/systemd/system/a2-eventos-api.service << 'EOFSVC'
[Unit]
Description=A2 Eventos API Backend
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/var/www/a2-eventos/a2-eventos/backend/api-nodejs
ExecStart=/usr/bin/node src/app.js
Restart=always
RestartSec=10
Environment="NODE_ENV=production"
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOFSVC

# Systemd service Frontend
cat > /etc/systemd/system/a2-eventos-web.service << 'EOFSVC'
[Unit]
Description=A2 Eventos Frontend (Build Estático)
After=network.target

[Service]
Type=oneshot
ExecStart=/bin/true
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOFSVC

# Certificados SSL
mkdir -p /var/www/certbot
certbot certonly --webroot -w /var/www/certbot \
    -d nzt.app.br \
    -d www.nzt.app.br \
    -d painel.nzt.app.br \
    -d api.nzt.app.br \
    --non-interactive \
    --agree-tos \
    -m nataliaalvesengenharia@gmail.com \
    --keep-until-expiring

# Iniciar serviços
systemctl daemon-reload
systemctl enable a2-eventos-api.service
systemctl restart a2-eventos-api.service
systemctl reload nginx

# Criar renewal automático
cat > /etc/cron.d/certbot-renewal << 'EOFCRON'
0 3 * * * /usr/bin/certbot renew --quiet && /usr/sbin/systemctl reload nginx
EOFCRON

echo -e "\n✅ DEPLOY CONCLUÍDO!"
echo -e "\n🌐 Acessar:"
echo -e "   Frontend: https://painel.nzt.app.br"
echo -e "   API: https://api.nzt.app.br"
echo -e "   Health: https://api.nzt.app.br/health"
echo -e "\n📊 Status:"
echo -e "   systemctl status a2-eventos-api"
echo -e "\n📝 Logs:"
echo -e "   journalctl -u a2-eventos-api -f"
```

---

## 📋 OPÇÃO B: Copiar arquivos via SCP (se Git não funcionar)

Abra um terminal NO SEU COMPUTADOR (não no servidor) e execute:

```bash
# Copiar backend
scp -r a2-eventos/backend/api-nodejs root@187.127.9.59:/var/www/a2-eventos/backend/

# Copiar frontend (dist)
scp -r a2-eventos/frontend/web-admin/dist root@187.127.9.59:/var/www/a2-eventos/frontend/web-admin/

# Copiar .env do backend
scp a2-eventos/backend/api-nodejs/.env root@187.127.9.59:/var/www/a2-eventos/backend/api-nodejs/
```

Depois continue com a instalação npm no servidor.

---

## ✅ Verificar se está funcionando

### No servidor, execute:
```bash
# Status do API
systemctl status a2-eventos-api

# Ver logs da API
journalctl -u a2-eventos-api -f

# Testar health check
curl https://api.nzt.app.br/health -k

# Testar login
curl https://api.nzt.app.br/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"test"}' -k
```

### No seu navegador:
- https://painel.nzt.app.br ← Frontend
- https://api.nzt.app.br/health ← Health check
- https://api.nzt.app.br ← API docs

---

## 🔧 Troubleshooting

### API não inicia
```bash
cd /var/www/a2-eventos/a2-eventos/backend/api-nodejs
npm run check:all
node src/app.js
```

### Nginx com erro
```bash
nginx -t
systemctl restart nginx
```

### Certificado SSL falha
```bash
certbot certonly --webroot -w /var/www/certbot \
    -d nzt.app.br -d painel.nzt.app.br -d api.nzt.app.br \
    --non-interactive --agree-tos -m nataliaalvesengenharia@gmail.com
```

### Ver porta 3001 em uso
```bash
lsof -i :3001
# Matar processo se necessário
kill -9 <PID>
```

---

## 📞 Suporte
Email: nataliaalvesengenharia@gmail.com
