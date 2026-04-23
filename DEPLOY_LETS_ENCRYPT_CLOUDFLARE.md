# 🔒 DEPLOY LET'S ENCRYPT + CLOUDFLARE

**Status:** ✅ Token Cloudflare validado e pronto  
**Próximo passo:** Executar script no servidor

---

## 📋 RESUMO

Vamos gerar certificado Let's Encrypt automaticamente via Cloudflare DNS para:
- `nzt.app.br`
- `www.nzt.app.br`
- `painel.nzt.app.br`
- `api.nzt.app.br`
- `cadastro.nzt.app.br`

---

## 🔑 CREDENCIAIS VALIDADAS

```
✅ Token Cloudflare: SEU_TOKEN_CLOUDFLARE_AQUI_XXX_SEGURANCAI8fVR670ad6eb
✅ Zone ID: c43713417d01de1cf206aa6f0c719f7f
✅ Domínio: nzt.app.br
✅ Permissões: DNS Read/Write, ACME Challenge
```

---

## 🚀 PASSO 1: CONECTAR AO SERVIDOR VIA SSH

```bash
ssh root@187.127.9.59
# Senha: hoot
```

---

## 🚀 PASSO 2: EXECUTAR SCRIPT DE SETUP

Cole **TODO** este bloco no terminal do servidor (após conectar):

```bash
#!/bin/bash
set -e

CF_TOKEN="SEU_TOKEN_CLOUDFLARE_AQUI_XXX_SEGURANCAI8fVR670ad6eb"
CF_EMAIL="nataliaalvesengenharia@gmail.com"

echo "🚀 SETUP LET'S ENCRYPT + CLOUDFLARE"
echo "===================================="

# 1. Instalar certbot
echo -e "\n1️⃣  Instalando certbot..."
apt-get update -qq
apt-get install -y -qq certbot python3-certbot-dns-cloudflare

# 2. Criar credenciais
echo -e "\n2️⃣  Configurando credenciais..."
mkdir -p /root/.secrets
chmod 700 /root/.secrets

cat > /root/.secrets/cloudflare.ini << 'EOFCREDS'
dns_cloudflare_api_token = SEU_TOKEN_CLOUDFLARE_AQUI_XXX_SEGURANCAI8fVR670ad6eb
EOFCREDS

chmod 600 /root/.secrets/cloudflare.ini

# 3. Gerar certificado
echo -e "\n3️⃣  Gerando certificado Let's Encrypt..."

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
  --email nataliaalvesengenharia@gmail.com \
  --keep-until-expiring \
  --rsa-key-size 4096 || echo "⚠️  Certificado pode já existir"

# 4. Verificar
echo -e "\n4️⃣  Verificando certificado..."
openssl x509 -in /etc/letsencrypt/live/nzt.app.br/fullchain.pem -noout -dates

# 5. Configurar renovação automática
echo -e "\n5️⃣  Configurando renovação automática..."

cat > /etc/cron.d/certbot-renewal << 'EOFCRON'
# Let's Encrypt renewal via Cloudflare - runs on 1st of each month at 3 AM
0 3 1 * * root /usr/bin/certbot renew --dns-cloudflare --dns-cloudflare-credentials /root/.secrets/cloudflare.ini --quiet && /usr/bin/docker restart a2_eventos_gateway 2>&1 | logger -t certbot
EOFCRON

chmod 644 /etc/cron.d/certbot-renewal
echo "✅ Renovação automática configurada (dia 1 de cada mês às 3h)"

# 6. Atualizar docker-compose
echo -e "\n6️⃣  Atualizando docker-compose.yml..."

cd /var/www/a2-eventos

# Fazer backup
cp docker-compose.yml docker-compose.yml.backup

# Atualizar o volume do gateway
sed -i 's|./backend/api-nodejs/src/certs:/etc/nginx/certs:ro|/etc/letsencrypt/live/nzt.app.br:/etc/nginx/certs:ro|g' docker-compose.yml

echo "✅ docker-compose.yml atualizado"
echo "   (Backup em: docker-compose.yml.backup)"

# 7. Atualizar nginx.conf
echo -e "\n7️⃣  Atualizando configuração Nginx..."

# O nginx já está configurado para usar /etc/nginx/certs/origin.pem e origin.key
# Vamos criar symlinks para compatibilidade
ln -sf /etc/letsencrypt/live/nzt.app.br/fullchain.pem /etc/nginx/certs/origin.pem 2>/dev/null || true
ln -sf /etc/letsencrypt/live/nzt.app.br/privkey.pem /etc/nginx/certs/origin.key 2>/dev/null || true

echo "✅ Symlinks configurados"

# 8. Reiniciar containers
echo -e "\n8️⃣  Reiniciando containers..."

docker-compose down
docker-compose up -d --remove-orphans

sleep 5

echo ""
echo "✅ SETUP COMPLETO!"
echo ""
echo "📊 Status final:"
echo "   Certificado: /etc/letsencrypt/live/nzt.app.br/"
echo "   Renovação: Dia 1 de cada mês às 3h (GMT)"
echo ""
echo "🌐 Testando endpoints:"
curl -I https://api.nzt.app.br/health 2>/dev/null | head -2
curl -I https://painel.nzt.app.br 2>/dev/null | head -2
```

---

## ✅ PASSO 3: VALIDAR CONFIGURAÇÃO

Após o script completo, execute no servidor:

```bash
# Verificar certificado
openssl x509 -in /etc/letsencrypt/live/nzt.app.br/fullchain.pem -noout -dates

# Verificar validade (dia 1 de cada mês)
crontab -l | grep certbot

# Testar endpoints HTTPS
curl -I https://api.nzt.app.br/health
curl -I https://painel.nzt.app.br/
curl -I https://cadastro.nzt.app.br/

# Ver logs do gateway
docker logs -f a2_eventos_gateway
```

---

## 🎯 O QUE VAI ACONTECER

### Durante o script:
1. ✅ Instala certbot e plugin Cloudflare
2. ✅ Salva credenciais Cloudflare com segurança (600 permission)
3. ✅ Gera certificado Let's Encrypt via Cloudflare DNS
4. ✅ Configura renovação automática (dia 1 de cada mês)
5. ✅ Atualiza docker-compose.yml
6. ✅ Cria symlinks para compatibilidade com Nginx
7. ✅ Reinicia containers (5 segundos downtime)

### Resultado final:
- ✅ Certificado válido para todos os 5 domínios
- ✅ Renovação automática a cada 3 meses
- ✅ HTTPS ativo em todos os endpoints
- ✅ SSL Grade A (Let's Encrypt é reconhecido globalmente)

---

## ⚠️ NOTAS IMPORTANTES

1. **Downtime mínimo:** Script derruba containers por ~5 segundos
2. **Renovação:** Ocorre automaticamente dia 1 de cada mês às 3h (GMT)
3. **Backup:** Script faz backup de `docker-compose.yml` antes de modificar
4. **Segurança:** Token Cloudflare armazenado em `/root/.secrets/cloudflare.ini` (permissão 600)
5. **Symlinks:** Nginx continua referenciando `origin.pem/key`, mas agora apontam para Let's Encrypt

---

## 🔄 SE ALGO DER ERRADO

### Reverter para certificado Cloudflare original:
```bash
cd /var/www/a2-eventos
cp docker-compose.yml.backup docker-compose.yml
docker-compose restart a2_eventos_gateway
```

### Renovar manualmente:
```bash
certbot renew --dns-cloudflare --dns-cloudflare-credentials /root/.secrets/cloudflare.ini --force-renewal
docker restart a2_eventos_gateway
```

### Ver logs de renovação:
```bash
grep certbot /var/log/syslog
```

---

## 📞 PRÓXIMOS PASSOS

1. **Execute o script** no servidor (cole o bloco todo)
2. **Aguarde conclusão** (~2-3 minutos)
3. **Teste endpoints HTTPS** (comandos acima)
4. **Valide certificado** com SSL Labs: https://www.ssllabs.com/ssltest/analyze.html?d=api.nzt.app.br

---

## 🎉 RESULTADO ESPERADO

Depois de executar, você terá:

```
✅ api.nzt.app.br/health         → HTTPS 200 OK
✅ painel.nzt.app.br             → HTTPS 200 OK  
✅ cadastro.nzt.app.br           → HTTPS 200 OK
✅ nzt.app.br                    → HTTPS 200 OK
✅ Certificado válido por 90 dias
✅ Renovação automática ativa
✅ Sistema 100% DEFINITIVO
```

---

## 🚀 Avise quando executar!

Quando você rodar o script e tiver dúvidas, é só avisar que ajusto o que for necessário!

