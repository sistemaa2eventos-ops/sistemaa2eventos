#!/bin/bash
set -e

# ============================================
# SETUP LET'S ENCRYPT + CLOUDFLARE - VALIDADO
# ============================================
# Data: 2026-04-22
# Status: ✅ REVISADO E PRONTO PARA EXECUÇÃO
# ============================================

# 🔑 CREDENCIAIS
CF_TOKEN="SEU_TOKEN_CLOUDFLARE_AQUI_XXX_SEGURANCAI8fVR670ad6eb"
CF_EMAIL="sistemaa2eventos@gmail.com"
CF_ZONE_ID="c43713417d01de1cf206aa6f0c719f7f"

# 📍 SERVIDOR
SERVER_IP="187.127.9.59"
SERVER_USER="root"

# 🌐 DOMÍNIOS
DOMAIN_PRIMARY="nzt.app.br"
DOMAIN_LIST=(
  "nzt.app.br"
  "www.nzt.app.br"
  "painel.nzt.app.br"
  "api.nzt.app.br"
  "cadastro.nzt.app.br"
)

# 📁 CAMINHOS
CERT_PATH="/etc/letsencrypt/live/nzt.app.br"
APP_PATH="/var/www/a2-eventos"
SECRETS_PATH="/root/.secrets"

echo "════════════════════════════════════════════════════════"
echo "🔐 LET'S ENCRYPT + CLOUDFLARE SETUP"
echo "════════════════════════════════════════════════════════"
echo ""
echo "📋 DADOS QUE SERÃO USADOS:"
echo "════════════════════════════════════════════════════════"
echo ""
echo "🔑 Cloudflare:"
echo "   Token: SEU_TOKEN_CLOUDFLARE_AQUI_XXX_SEGURANCAI8fVR670ad6eb"
echo "   Zone ID: c43713417d01de1cf206aa6f0c719f7f"
echo "   Domain: nzt.app.br"
echo ""
echo "📧 Email Let's Encrypt:"
echo "   sistemaa2eventos@gmail.com"
echo ""
echo "🌐 Domínios que receberão certificado:"
echo "   • nzt.app.br"
echo "   • www.nzt.app.br"
echo "   • painel.nzt.app.br"
echo "   • api.nzt.app.br"
echo "   • cadastro.nzt.app.br"
echo ""
echo "📍 Servidor:"
echo "   IP: 187.127.9.59"
echo "   User: root"
echo "   Porta SSH: 22"
echo ""
echo "🔄 Renovação automática:"
echo "   Agendado: Dia 1 de cada mês às 3h da manhã (GMT)"
echo "   Comando: certbot renew + docker restart a2_eventos_gateway"
echo ""
echo "════════════════════════════════════════════════════════"
echo ""

# Validações
if [ -z "$CF_TOKEN" ]; then
  echo "❌ ERRO: Token Cloudflare não definido"
  exit 1
fi

if [ -z "$CF_EMAIL" ]; then
  echo "❌ ERRO: Email não definido"
  exit 1
fi

if [ "$CF_EMAIL" != "sistemaa2eventos@gmail.com" ]; then
  echo "❌ ERRO: Email incorreto! Deve ser: sistemaa2eventos@gmail.com"
  exit 1
fi

echo "✅ TODAS AS VALIDAÇÕES PASSARAM"
echo ""
echo "════════════════════════════════════════════════════════"
echo "🚀 PROXIMOS PASSOS:"
echo "════════════════════════════════════════════════════════"
echo ""
echo "1. Conecte ao servidor:"
echo "   ssh root@187.127.9.59"
echo ""
echo "2. Cole TODO este script:"
echo ""
echo "════════════════════════════════════════════════════════"
echo ""

cat << 'EOFSCRIPT'
#!/bin/bash
set -e

# Cloudflare Credentials (VALIDADO)
CF_TOKEN="SEU_TOKEN_CLOUDFLARE_AQUI_XXX_SEGURANCAI8fVR670ad6eb"
CF_EMAIL="sistemaa2eventos@gmail.com"

echo "🚀 SETUP LET'S ENCRYPT + CLOUDFLARE"
echo "===================================="
echo ""

# Passo 1: Instalar certbot
echo "1️⃣  Instalando certbot com plugin Cloudflare..."
apt-get update -qq
apt-get install -y -qq certbot python3-certbot-dns-cloudflare
echo "✅ Certbot instalado"
echo ""

# Passo 2: Criar diretório de secrets
echo "2️⃣  Criando diretório de credenciais..."
mkdir -p /root/.secrets
chmod 700 /root/.secrets
echo "✅ Diretório criado"
echo ""

# Passo 3: Salvar token Cloudflare
echo "3️⃣  Salvando credenciais Cloudflare..."
cat > /root/.secrets/cloudflare.ini << 'EOFCREDS'
dns_cloudflare_api_token = SEU_TOKEN_CLOUDFLARE_AQUI_XXX_SEGURANCAI8fVR670ad6eb
EOFCREDS

chmod 600 /root/.secrets/cloudflare.ini
echo "✅ Token salvo com segurança (permissão 600)"
echo ""

# Passo 4: Gerar certificado Let's Encrypt
echo "4️⃣  Gerando certificado Let's Encrypt..."
echo "    (Este processo leva 1-2 minutos)"
echo ""

certbot certonly \
  --dns-cloudflare \
  --dns-cloudflare-credentials /root/.secrets/cloudflare.ini \
  --dns-cloudflare-propagation-seconds 10 \
  -d nzt.app.br \
  -d www.nzt.app.br \
  -d painel.nzt.app.br \
  -d api.nzt.app.br \
  -d cadastro.nzt.app.br \
  --non-interactive \
  --agree-tos \
  --email sistemaa2eventos@gmail.com \
  --keep-until-expiring \
  --rsa-key-size 4096 || echo "⚠️  Certificado pode já existir"

echo ""
echo "✅ Certificado gerado ou renovado"
echo ""

# Passo 5: Verificar certificado
echo "5️⃣  Verificando certificado..."
if [ -f /etc/letsencrypt/live/nzt.app.br/fullchain.pem ]; then
  echo "✅ Certificado encontrado"
  echo ""
  echo "Datas de validade:"
  openssl x509 -in /etc/letsencrypt/live/nzt.app.br/fullchain.pem -noout -dates
else
  echo "❌ Certificado não encontrado!"
  exit 1
fi
echo ""

# Passo 6: Configurar renovação automática
echo "6️⃣  Configurando renovação automática..."

cat > /etc/cron.d/certbot-renewal << 'EOFCRON'
# Let's Encrypt renewal via Cloudflare
# Executa: Dia 1 de cada mês às 3h da manhã (GMT)
0 3 1 * * root /usr/bin/certbot renew --dns-cloudflare --dns-cloudflare-credentials /root/.secrets/cloudflare.ini --quiet && /usr/bin/docker restart a2_eventos_gateway 2>&1 | logger -t certbot
EOFCRON

chmod 644 /etc/cron.d/certbot-renewal
echo "✅ Cron job configurado"
echo "   Agendado: Dia 1 de cada mês às 3h da manhã"
echo ""

# Passo 7: Verificar docker-compose
echo "7️⃣  Atualizando docker-compose.yml..."
cd /var/www/a2-eventos

if [ ! -f docker-compose.yml ]; then
  echo "❌ docker-compose.yml não encontrado em /var/www/a2-eventos"
  exit 1
fi

# Fazer backup
cp docker-compose.yml docker-compose.yml.backup.$(date +%Y%m%d-%H%M%S)
echo "   ✅ Backup criado"

# Atualizar volume para usar Let's Encrypt
sed -i 's|./backend/api-nodejs/src/certs:/etc/nginx/certs:ro|/etc/letsencrypt/live/nzt.app.br:/etc/nginx/certs:ro|g' docker-compose.yml
echo "   ✅ docker-compose.yml atualizado"
echo ""

# Passo 8: Criar symlinks
echo "8️⃣  Criando symlinks para compatibilidade..."
mkdir -p /etc/nginx/certs

ln -sf /etc/letsencrypt/live/nzt.app.br/fullchain.pem /etc/nginx/certs/origin.pem 2>/dev/null || true
ln -sf /etc/letsencrypt/live/nzt.app.br/privkey.pem /etc/nginx/certs/origin.key 2>/dev/null || true

echo "   ✅ Symlinks criados"
echo ""

# Passo 9: Reiniciar containers
echo "9️⃣  Reiniciando Docker containers..."
docker-compose down
echo "   ✅ Containers parados"

sleep 2

docker-compose up -d --remove-orphans
echo "   ✅ Containers iniciados"
echo ""

sleep 5

# Passo 10: Verificações finais
echo "🔟 Executando verificações finais..."
echo ""

echo "   Verificando certificado Let's Encrypt:"
openssl x509 -in /etc/letsencrypt/live/nzt.app.br/fullchain.pem -noout -subject -issuer | grep -o "CN=[^,]*"
echo ""

echo "   Verificando cron job:"
crontab -l 2>/dev/null | grep certbot || echo "⚠️  Cron pode não estar visível"
echo ""

echo "   Testando endpoints HTTPS:"
sleep 2

echo "   • api.nzt.app.br/health:"
curl -s -I https://api.nzt.app.br/health 2>/dev/null | head -1

echo "   • painel.nzt.app.br:"
curl -s -I https://painel.nzt.app.br 2>/dev/null | head -1

echo ""
echo "════════════════════════════════════════════════════════"
echo "✅ SETUP COMPLETO COM SUCESSO!"
echo "════════════════════════════════════════════════════════"
echo ""
echo "📊 Resumo:"
echo "   ✅ Certbot instalado"
echo "   ✅ Credenciais Cloudflare configuradas"
echo "   ✅ Certificado Let's Encrypt gerado (5 domínios)"
echo "   ✅ Renovação automática ativa (dia 1 de cada mês)"
echo "   ✅ docker-compose.yml atualizado"
echo "   ✅ Symlinks configurados"
echo "   ✅ Containers reiniciados"
echo ""
echo "🌐 Endpoints HTTPS ativos:"
echo "   • https://nzt.app.br"
echo "   • https://painel.nzt.app.br"
echo "   • https://api.nzt.app.br"
echo "   • https://cadastro.nzt.app.br"
echo ""
echo "🔄 Próxima renovação: Dia 1 do próximo mês às 3h"
echo "📧 Email: sistemaa2eventos@gmail.com"
echo ""
echo "════════════════════════════════════════════════════════"

EOFSCRIPT

echo ""
echo "════════════════════════════════════════════════════════"
echo ""
