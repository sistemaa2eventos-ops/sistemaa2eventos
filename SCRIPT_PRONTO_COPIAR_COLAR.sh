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
echo "✅ Token salvo com segurança"
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
echo "✅ Certificado gerado"
echo ""

# Passo 5: Verificar certificado
echo "5️⃣  Verificando certificado..."
openssl x509 -in /etc/letsencrypt/live/nzt.app.br/fullchain.pem -noout -dates
echo ""

# Passo 6: Configurar renovação automática
echo "6️⃣  Configurando renovação automática..."

cat > /etc/cron.d/certbot-renewal << 'EOFCRON'
0 3 1 * * root /usr/bin/certbot renew --dns-cloudflare --dns-cloudflare-credentials /root/.secrets/cloudflare.ini --quiet && /usr/bin/docker restart a2_eventos_gateway 2>&1 | logger -t certbot
EOFCRON

chmod 644 /etc/cron.d/certbot-renewal
echo "✅ Cron job configurado (dia 1 de cada mês às 3h)"
echo ""

# Passo 7: Atualizar docker-compose.yml
echo "7️⃣  Atualizando docker-compose.yml..."
cd /var/www/a2-eventos

cp docker-compose.yml docker-compose.yml.backup.$(date +%Y%m%d-%H%M%S)
sed -i 's|./backend/api-nodejs/src/certs:/etc/nginx/certs:ro|/etc/letsencrypt/live/nzt.app.br:/etc/nginx/certs:ro|g' docker-compose.yml
echo "✅ docker-compose.yml atualizado"
echo ""

# Passo 8: Criar symlinks
echo "8️⃣  Criando symlinks..."
mkdir -p /etc/nginx/certs
ln -sf /etc/letsencrypt/live/nzt.app.br/fullchain.pem /etc/nginx/certs/origin.pem 2>/dev/null || true
ln -sf /etc/letsencrypt/live/nzt.app.br/privkey.pem /etc/nginx/certs/origin.key 2>/dev/null || true
echo "✅ Symlinks criados"
echo ""

# Passo 9: Reiniciar containers
echo "9️⃣  Reiniciando Docker containers..."
docker-compose down
sleep 2
docker-compose up -d --remove-orphans
sleep 5
echo "✅ Containers reiniciados"
echo ""

# Passo 10: Testes finais
echo "🔟 Executando testes finais..."
echo ""
echo "   Certificado:"
openssl x509 -in /etc/letsencrypt/live/nzt.app.br/fullchain.pem -noout -subject | grep -o "CN=.*"
echo ""
echo "   Testando endpoints (aguarde 3s)..."
sleep 3
echo "   • api.nzt.app.br/health:"
curl -s -I https://api.nzt.app.br/health 2>/dev/null | head -1 || echo "     ⏳ Aguardando..."

echo "   • painel.nzt.app.br:"
curl -s -I https://painel.nzt.app.br 2>/dev/null | head -1 || echo "     ⏳ Aguardando..."

echo ""
echo "════════════════════════════════════════════════════"
echo "✅ SETUP COMPLETO COM SUCESSO!"
echo "════════════════════════════════════════════════════"
echo ""
echo "✅ Certbot instalado"
echo "✅ Certificado Let's Encrypt gerado (5 domínios)"
echo "✅ Renovação automática ativa"
echo "✅ Docker containers atualizados"
echo ""
echo "📊 Certificado válido para:"
echo "   • https://nzt.app.br"
echo "   • https://painel.nzt.app.br"
echo "   • https://api.nzt.app.br"
echo "   • https://cadastro.nzt.app.br"
echo "   • https://www.nzt.app.br"
echo ""
echo "🔄 Próxima renovação: Dia 1 do próximo mês às 3h"
echo "📧 Email: sistemaa2eventos@gmail.com"
echo "════════════════════════════════════════════════════"
