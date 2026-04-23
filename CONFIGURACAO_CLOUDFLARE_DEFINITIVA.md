# 🌐 CONFIGURAÇÃO CLOUDFLARE - A2 EVENTOS PRODUÇÃO

## ⚡ RESUMO DO PLANO

Vamos configurar seu sistema para rodar de forma **definitiva e segura** com Cloudflare:

1. ✅ Gerar Token API do Cloudflare com permissões mínimas
2. ✅ Verificar/Configurar DNS Records (A e CNAME)
3. ✅ Configurar SSL/TLS em Full Strict Mode
4. ✅ Automação de certificado com ACME (Let's Encrypt via Cloudflare)
5. ✅ Configurar Firewall básico
6. ✅ Integrar token no projeto para automação

---

## 📋 PASSO 1: GERAR TOKEN API DO CLOUDFLARE

### 1a. Acessar Painel Cloudflare
1. Acesse: https://dash.cloudflare.com/
2. Login com sua conta
3. Selecione seu domínio **nzt.app.br**
4. No canto direito, clique em **"Conta"** (ícone de pessoa)

### 1b. Criar Token com Permissões Específicas
1. Vá para: **"API Tokens"** (não use Global API Key)
2. Clique em: **"Create Token"**
3. Selecione template: **"Edit zone DNS"** (mais seguro)
4. Ou crie customizado com estas permissões:

```
Permissões necessárias:
├─ Zone
│  ├─ DNS: Read
│  ├─ DNS: Edit
│  ├─ SSL and Certificates: Read
│  └─ SSL and Certificates: Edit
├─ Account
│  └─ Cloudflare Tunnel: Read (opcional, para Workers)
```

5. **Zone Resources:** Selecione `nzt.app.br` (e adicione outros se tiver)
6. **TTL:** Sem expiração (ou 90 dias)
7. Clique: **"Create Token"**

### 1c. Copiar e Guardar Seu Token

```
CLOUDFLARE_API_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**⚠️ IMPORTANTE:** Guarde em local seguro! Não compartilhe!

---

## 📝 PASSO 2: VERIFICAR DNS RECORDS

Acesse: https://dash.cloudflare.com/  
Selecione domínio: **nzt.app.br**  
Vá para: **"DNS"** (na sidebar)

Você deve ver algo assim:

```
Type    Name                    Content              Proxy Status
────────────────────────────────────────────────────────────────────
A       nzt.app.br              187.127.9.59         🔶 Proxied
A       painel                  187.127.9.59         🔶 Proxied
A       api                     187.127.9.59         🔶 Proxied
A       cadastro                187.127.9.59         🔶 Proxied
CNAME   www                     nzt.app.br           🔶 Proxied
```

### Se não tiver estes records, crie agora:

**Record 1: Raiz**
- Type: A
- Name: nzt.app.br (ou deixar @ vazio)
- IPv4 address: 187.127.9.59
- Proxy status: 🔶 Proxied (ativa Cloudflare)
- TTL: Auto

**Record 2: Painel (admin)**
- Type: A
- Name: painel
- IPv4 address: 187.127.9.59
- Proxy status: 🔶 Proxied
- TTL: Auto

**Record 3: API**
- Type: A
- Name: api
- IPv4 address: 187.127.9.59
- Proxy status: 🔶 Proxied
- TTL: Auto

**Record 4: Cadastro (portal)**
- Type: A
- Name: cadastro
- IPv4 address: 187.127.9.59
- Proxy status: 🔶 Proxied
- TTL: Auto

---

## 🔒 PASSO 3: CONFIGURAR SSL/TLS

### Via Cloudflare Dashboard:

1. Vá para: **"SSL/TLS"** (sidebar)
2. **Encryption mode:** Selecione **"Full (strict)"**
   - Isso exige certificado válido no servidor
   - Cloudflare verifica certificado de origem
   - Mais seguro

3. **Minimum TLS Version:** 1.2

4. **TLS 1.3:** Enabled

### ⚠️ PROBLEMA: Você usa certificado Cloudflare Origin (self-signed)

**Solução:** Gerar certificado Let's Encrypt no servidor

```bash
# SSH no servidor
ssh root@187.127.9.59

# Instalar certbot
apt-get install -y certbot python3-certbot-dns-cloudflare

# Criar arquivo de credenciais Cloudflare
cat > ~/.secrets/cloudflare.ini << 'EOF'
dns_cloudflare_api_token = SEU_TOKEN_AQUI
EOF

chmod 600 ~/.secrets/cloudflare.ini

# Gerar certificado via DNS challenge
certbot certonly \
  --dns-cloudflare \
  --dns-cloudflare-credentials ~/.secrets/cloudflare.ini \
  -d nzt.app.br \
  -d *.nzt.app.br \
  -d painel.nzt.app.br \
  -d api.nzt.app.br \
  -d cadastro.nzt.app.br \
  --non-interactive \
  --agree-tos \
  -m nataliaalvesengenharia@gmail.com

# Certificado fica em:
# /etc/letsencrypt/live/nzt.app.br/fullchain.pem
# /etc/letsencrypt/live/nzt.app.br/privkey.pem
```

Depois atualizar docker-compose ou Nginx para usar esses certificados.

---

## 🚀 PASSO 4: AUTOMAÇÃO DE CERTIFICADO (OPCIONAL - MAS RECOMENDADO)

Se fizer o Let's Encrypt acima, crie renovação automática:

```bash
# SSH no servidor
ssh root@187.127.9.59

# Criar cron de renovação
cat > /etc/cron.d/certbot-renewal << 'EOF'
0 3 * * * /usr/bin/certbot renew --quiet --dns-cloudflare --dns-cloudflare-credentials ~/.secrets/cloudflare.ini && docker restart a2_eventos_gateway
EOF

chmod 644 /etc/cron.d/certbot-renewal
```

Resultado: Certificado renovado automaticamente 3x por dia, gateway restartado se houver mudanças.

---

## 🛡️ PASSO 5: CONFIGURAR FIREWALL BÁSICO

Acesse: **"Security"** → **"WAF"** (Cloudflare Free oferece regras básicas)

### Recomendações:
```
✅ Modo: High Sensitivity (bloqueia mais, falsos positivos possíveis)
✅ Rate Limiting: 50 requests/10 segundos por IP (Free plan limite)
✅ CAPTCHA Challenge: Habilitado
✅ Browser Check: Habilitado
```

### Criar Regra Customizada (opcional):
**Block bots conhecidos:**
- API para endpoints críticos
- Exigir rate limit

---

## 🔑 PASSO 6: INTEGRAR TOKEN NO PROJETO

### Arquivo: `.env.cloudflare` (NÃO versionado)

```bash
# Cloudflare API Configuration
CLOUDFLARE_ZONE_ID=sua_zone_id_aqui
CLOUDFLARE_API_TOKEN=seu_token_aqui
CLOUDFLARE_EMAIL=seu_email@cloudflare.com

# Domain Management
CF_DOMAINS=nzt.app.br,painel.nzt.app.br,api.nzt.app.br,cadastro.nzt.app.br

# SSL/TLS
CF_SSL_MODE=full_strict
CF_MINIMUM_TLS_VERSION=1.2
```

### Script de Validação (opcional):
```bash
#!/bin/bash
# File: backend/api-nodejs/scripts/validate_cloudflare.js

const axios = require('axios');

const cfToken = process.env.CLOUDFLARE_API_TOKEN;
const zoneId = process.env.CLOUDFLARE_ZONE_ID;

async function validateCloudflareSetup() {
  try {
    const response = await axios.get(
      `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`,
      { headers: { 'Authorization': `Bearer ${cfToken}` } }
    );
    
    console.log('✅ Cloudflare API conectado');
    console.log('📋 DNS Records:', response.data.result.length);
    
    response.data.result.forEach(record => {
      console.log(`  - ${record.type} ${record.name} → ${record.content}`);
    });
    
  } catch (error) {
    console.error('❌ Erro Cloudflare:', error.message);
    process.exit(1);
  }
}

validateCloudflareSetup();
```

---

## 📊 PASSO 7: ATUALIZAR DOCKER-COMPOSE

Se usar Let's Encrypt, update `docker-compose.yml`:

```yaml
  gateway:
    build:
      context: ./gateway
    container_name: a2_eventos_gateway
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./gateway/nginx.conf:/etc/nginx/nginx.conf:ro
      # Substituir certificado Cloudflare por Let's Encrypt:
      - /etc/letsencrypt/live/nzt.app.br:/etc/nginx/certs:ro
    networks:
      - a2_net
```

---

## ✅ PASSO 8: VALIDAR CONFIGURAÇÃO

Após todos os passos, execute no servidor:

```bash
# Testar certificado
curl -vI https://api.nzt.app.br/health

# Verificar SSL via SSL Labs
# Acesse: https://www.ssllabs.com/ssltest/analyze.html?d=api.nzt.app.br

# Validar DNS propagação
dig api.nzt.app.br
nslookup painel.nzt.app.br

# Testar endpoints
curl https://api.nzt.app.br/health
curl https://painel.nzt.app.br/
curl https://cadastro.nzt.app.br/
```

---

## 🎯 CHECKLIST FINAL

- [ ] Conta Cloudflare ativa
- [ ] Token API gerado com permissões DNS + SSL
- [ ] DNS records criados/verificados (A records para 187.127.9.59)
- [ ] SSL/TLS mode: Full Strict
- [ ] Certificado Let's Encrypt gerado no servidor
- [ ] Renovação automática configurada (cron)
- [ ] Firewall básico habilitado
- [ ] Endpoints testados (health, frontend, portal)
- [ ] Token salvo em `.env.cloudflare` (gitignored)
- [ ] Docker-compose atualizado com novos certs

---

## 🚨 PRÓXIMOS PASSOS COM SUA AJUDA

Você vai:
1. **Gerar token API** no Cloudflare (como descrito acima)
2. **Enviar o token** para mim

Eu vou:
1. **Criar script de validação** para testar token
2. **Gerar certificado Let's Encrypt** no servidor via Cloudflare DNS
3. **Configurar renovação automática** (cron job)
4. **Atualizar docker-compose** para usar novos certificados
5. **Testar tudo** e gerar relatório final

---

## 📞 PRÓXIMA AÇÃO

**Você pronto?** 

1. Acesse: https://dash.cloudflare.com/profile/api-tokens
2. Clique: "Create Token"
3. Template: "Edit zone DNS" (ou custom com DNS + SSL read/write)
4. Selecione zona: nzt.app.br
5. Copie o token gerado
6. **Cole aqui ou diga que está pronto para confirmar**

Quando eu receber seu token (você pode enviar aqui mesmo), vou:
- Validar acesso
- Gerar certificado Let's Encrypt automático
- Configurar renovação automática
- Deixar seu sistema **100% definitivo e seguro** 🚀

