# 🔑 GUIA: GERAR TOKEN CLOUDFLARE CORRETAMENTE

## ⚠️ IMPORTANTE: Seu token anterior é inválido

Vamos gerar um novo com permissões corretas.

---

## PASSO 1: Acessar Dashboard Cloudflare

1. Acesse: **https://dash.cloudflare.com/**
2. Login com sua conta
3. Clique no ícone de **"Conta"** (canto superior direito)
4. Vá em: **"API Tokens"** (não confunda com "API Keys")

---

## PASSO 2: Criar Novo Token (Método Recomendado)

### Opção A: Template "Edit Zone DNS" (MAIS FÁCIL)

1. Clique: **"Create Token"**
2. Procure template: **"Edit zone DNS"**
3. Clique nele
4. Em "Zone Resources", selecione: **nzt.app.br**
5. Deixe as permissões como padrão:
   - ✅ Zone > DNS > Edit
   - ✅ Zone > DNS > Read
6. TTL: Deixar vazio (sem expiração)
7. Clique: **"Create Token"**
8. **Copie o token completo** que aparecerá (vai começar com `cfat_`)

---

### Opção B: Token Customizado (Se A não funcionar)

1. Clique: **"Create Token"**
2. Em "Custom token", preencha:

```
Token name: A2 Eventos Deploy
Permissions:
  - Zone > DNS > Edit     ✅
  - Zone > DNS > Read     ✅
  - Zone > Zone Settings > Read ✅
  - Zone > SSL and Certificates > Read ✅
  - Zone > SSL and Certificates > Edit ✅

Zone Resources:
  - Include > Specific zone > nzt.app.br ✅

TTL: (deixar vazio para sem expiração)
```

3. Clique: **"Create Token"**
4. **Copie o token completo**

---

## PASSO 3: Copiar Token (ATENÇÃO!)

Quando o Cloudflare mostrar seu token:

```
Your API Token:
┌──────────────────────────────────────────────────────┐
│ cfat_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX      │
└──────────────────────────────────────────────────────┘
```

**IMPORTANTE:**
- ✅ Copie **TUDO** (começando com `cfat_`)
- ✅ **SEM espaços** antes ou depois
- ✅ **NÃO copie "Your API Token:" ou aspas**
- ✅ Use Ctrl+C para copiar
- ✅ Cole direto aqui

---

## PASSO 4: Testar Token Imediatamente

Depois de copiar, você pode testar em seu terminal:

```bash
curl -X GET "https://api.cloudflare.com/client/v4/user/tokens/verify" \
  -H "Authorization: Bearer SEU_TOKEN_AQUI"
```

Se retornar `"success":true`, seu token está correto!

---

## ❌ Se Aparecer Erro:

```json
{
  "success": false,
  "errors": [
    {
      "message": "Invalid API Token"
    }
  ]
}
```

Significa:
- Token com espaços extras
- Token incompleto
- Permissões erradas
- Token expirou

**Solução:** Gere um novo token seguindo exatamente este guia.

---

## ✅ Quando Funcionar:

```json
{
  "success": true,
  "errors": [],
  "result": {
    "id": "...",
    "status": "active",
    "...": "..."
  }
}
```

Aí sim! Cole aqui que eu configuro tudo 🚀

