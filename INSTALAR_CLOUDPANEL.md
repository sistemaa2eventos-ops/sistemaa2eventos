# ☁️ INSTALAR CLOUDPANEL NO VPS HOSTINGER

**VPS:** srv1549402.hstgr.cloud  
**IP:** 187.127.9.59  
**Status:** Pronto para instalação

---

## 🎯 O QUE É CLOUDPANEL?

CloudPanel é um **painel de controle web moderno, gratuito e otimizado para servidores**:
- ✅ Interface web (não precisa mais de SSH)
- ✅ Gerenciar domínios
- ✅ Gerenciar SSL/TLS
- ✅ Suporta Docker (seu caso)
- ✅ Gerenciar arquivos
- ✅ Logs e monitoramento
- ✅ Backup automático
- ✅ 100% Gratuito

---

## 🚀 INSTALAÇÃO (3 PASSOS)

### **Passo 1: Conectar ao VPS via SSH**

```bash
ssh root@187.127.9.59
# Senha: hoot
```

---

### **Passo 2: Instalar CloudPanel**

Cole **TODO este comando** no terminal SSH:

```bash
curl -sS https://installer.cloudpanel.io/ce/install.sh -O install.sh; bash install.sh
```

O script vai:
1. ✅ Detectar seu OS (Ubuntu 24.04)
2. ✅ Instalar dependências
3. ✅ Configurar CloudPanel
4. ✅ Criar usuário admin
5. ⏱️ Levar ~10-15 minutos

**Aguarde a conclusão!**

---

### **Passo 3: Acessar CloudPanel**

Quando a instalação terminar, você verá algo como:

```
═══════════════════════════════════════════
✓ CloudPanel Installation Completed!
═══════════════════════════════════════════

CloudPanel:        https://187.127.9.59:8443
User:              admin@cloudpanel.io
Password:          [uma senha gerada]
═══════════════════════════════════════════
```

**Copie e guarde:**
- URL: https://187.127.9.59:8443
- Email: admin@cloudpanel.io
- Senha: (a que aparecer)

---

## 🌐 ACESSAR O PAINEL

1. Abra no navegador: **https://187.127.9.59:8443**
2. Login:
   - Email: `admin@cloudpanel.io`
   - Senha: (a que foi gerada)
3. **Aceite o certificado SSL** (será auto-assinado no início)

---

## ⚙️ APÓS INSTALAR - CONFIGURAÇÕES IMPORTANTES

### 1. Adicionar Domínio

No CloudPanel:
1. **Domains** → **Add Domain**
2. Preencha:
   - Domain: `nzt.app.br`
   - Root Path: `/var/www/a2-eventos` (caminho do seu app)
3. **Save**

### 2. Configurar SSL Let's Encrypt

1. Selecione o domínio
2. **SSL** → **Let's Encrypt**
3. Clique: **Issue Certificate**
4. CloudPanel vai usar o token Cloudflare automaticamente (se configurado)

### 3. Adicionar Subdomínios

Repita para cada:
- `api.nzt.app.br`
- `painel.nzt.app.br`
- `cadastro.nzt.app.br`
- `www.nzt.app.br`

---

## 🔧 INTEGRAÇÃO COM SEU SETUP ATUAL

CloudPanel permite:
- ✅ Gerenciar seus containers Docker
- ✅ Ver logs em tempo real
- ✅ Reiniciar serviços
- ✅ Gerenciar certificados SSL
- ✅ Firewall e segurança
- ✅ Backup automático

---

## 📝 PASSO A PASSO VISUAL

```
1. SSH no servidor
2. Cole comando de instalação
3. Aguarde ~15 minutos
4. Acesse: https://187.127.9.59:8443
5. Login e configure domínios
6. Ativa SSL Let's Encrypt
7. Gerenciar tudo via web!
```

---

## ⏱️ TIMING

- Agora: Inicia instalação CloudPanel
- +15 min: CloudPanel pronto + DNS propagado
- +5 min: Rodar Let's Encrypt para certificados
- **Total: ~20 minutos até tudo estar 100% pronto!**

---

## 🆘 SE DER ERRO

```bash
# Ver status de instalação
systemctl status cloudpanel

# Ver logs
tail -f /var/log/cloudpanel/install.log

# Reiniciar
systemctl restart cloudpanel
```

---

**Você quer rodar agora?** 🚀

Eu guio você passo-a-passo!

