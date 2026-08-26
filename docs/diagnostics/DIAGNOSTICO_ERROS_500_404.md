# 🔍 Diagnóstico: Erros 500 e 404 do Sistema

**Data:** 2026-04-28  
**Erros Reportados:** 4 (3x 500, 1x 404)

---

## 📊 Resumo dos Erros

| Erro | Endpoint | Tipo | Causa Provável | Status |
|------|----------|------|-----------------|--------|
| 1 | `GET /api/access/consultar-pulseira/1488` | 404 | Código de pulseira não encontrado | ✅ Normal |
| 2 | `PUT /api/config/areas/{id}` | 500 | Bug no backend ou dados inválidos | ⚠️ Investigar |
| 3 | `PUT /api/settings` | 500 | Middleware de autenticação ou dados inválidos | ⚠️ Investigar |
| 4 | `GET /api/dispositivos/{id}/snapshot` | 500 | Dispositivo offline ou credenciais erradas | ⚠️ Esperado |

---

## 🔴 **ERRO 1: `GET /api/access/consultar-pulseira/1488` → 404**

### O que é esse endpoint?
```
GET /api/access/consultar-pulseira/:codigo
```

Procura uma pessoa na tabela `pessoas` que tem:
- `numero_pulseira = 1488` OU
- `qr_code = 1488`

No evento especificado em `?evento_id=UUID`

### Por que deu 404?
O código **1488 não existe** na tabela para aquele evento.

### Como Resolver:

**1. Verificar se existem pulseiras cadastradas**
```sql
SELECT id, nome, numero_pulseira, qr_code, evento_id 
FROM pessoas 
WHERE evento_id = '4e1b5934-034d-4e61-a3da-533b7da4f3a8'
  AND (numero_pulseira IS NOT NULL OR qr_code IS NOT NULL)
LIMIT 20;
```

**2. Se nenhuma pulseira, cadastrar participantes com pulseira**
- Ir ao portal de cadastro
- Preencher com código da pulseira RFID
- Sistema salvará em `numero_pulseira`

**3. Se a pulseira 1488 deve existir:**
```sql
UPDATE pessoas 
SET numero_pulseira = '1488' 
WHERE id = 'uuid-da-pessoa'
  AND evento_id = '4e1b5934-034d-4e61-a3da-533b7da4f3a8';
```

### ✅ Status
**NORMAL** - Erro 404 é esperado se a pulseira não foi cadastrada

---

## 🔴 **ERRO 2: `PUT /api/config/areas/{id}` → 500**

### O que é esse endpoint?
```
PUT /api/config/areas/{id}
```

Atualiza configuração de uma área (setor/zona do evento)

### Possíveis Causas:

#### Causa 1: Middleware de Autenticação
```
sessionMiddleware pode estar rejeitando o request
```

**Verificação:**
```bash
# Ver logs do backend
docker logs a2-eventos-api 2>&1 | grep -i "config/areas" | tail -20

# Procurar por: "sessionMiddleware", "auth", "unauthorized"
```

#### Causa 2: Dados Inválidos no Body
```json
// Possível payload inválido:
{
  "nome": "Área 01",
  "descricao": null,        // ← Pode estar inválido
  "config": "string",       // ← Deveria ser object
  "permissions": "invalid"  // ← Formato errado
}
```

#### Causa 3: Tabela areas_config Não Existe
```sql
-- Verificar se tabela existe
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_name = 'areas_config'
);
-- Deve retornar: true
```

### Como Resolver:

**1. Verificar logs detalhados**
```bash
docker logs a2-eventos-api --since 10m 2>&1 | grep -A 5 "config/areas"
```

**2. Testar manualmente com cURL**
```bash
curl -X PUT https://painel.nzt.app.br/api/config/areas/AREA_ID \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "nome": "Teste",
    "config": {}
  }' \
  -v  # Ver resposta detalhada
```

**3. Se middleware é o culpado:**
```javascript
// Arquivo: a2-eventos/backend/api-nodejs/src/middleware/session.js
// Adicionar logging:
console.log('sessionMiddleware:', {
  headers: req.headers,
  method: req.method,
  path: req.path
});
```

### 🔧 Status
**REQUER INVESTIGAÇÃO** - Precisa de logs do Docker

---

## 🔴 **ERRO 3: `PUT /api/settings` → 500**

### O que é esse endpoint?
```
PUT /api/settings
```

Atualiza configurações globais do sistema (SMTP, tema, etc)

### Possíveis Causas:

#### Causa 1: SMTP Inválido
Se está tentando salvar configuração SMTP errada:
```json
{
  "smtp_host": null,      // ← Não pode ser null
  "smtp_port": "text",    // ← Deve ser número
  "smtp_user": "",        // ← Não pode ser vazio
  "smtp_pass": "senha"
}
```

#### Causa 2: Middleware Rejeitando
```
sessionMiddleware ou authMiddleware bloqueando
```

#### Causa 3: RLS Policy Bloqueando
```
Row Level Security pode estar impedindo UPDATE
```

### Como Resolver:

**1. Ver que dados estão sendo enviados**
```javascript
// No browser console
const formData = { ... }; // dados que estava tentando salvar
console.log('Payload:', formData);
```

**2. Testar SMTP via endpoint específico**
```bash
curl -X POST https://painel.nzt.app.br/api/settings/verify-smtp \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "smtp_host": "smtp.gmail.com",
    "smtp_port": 587,
    "smtp_user": "seu-email@gmail.com",
    "smtp_pass": "app-password"
  }' \
  -v
```

**3. Verificar permissões RLS**
```sql
SELECT * FROM pg_policies 
WHERE tablename = 'saas_config_global';
-- Verificar se policy está bloqueando UPDATE
```

### 🔧 Status
**REQUER INVESTIGAÇÃO** - Provavelmente validação ou RLS

---

## 🔴 **ERRO 4: `GET /api/dispositivos/{id}/snapshot` → 500**

### O que é esse endpoint?
```
GET /api/dispositivos/{id}/snapshot
```

Captura uma imagem (snapshot) do dispositivo (câmera IP ou leitor biométrico)

### Por que dá 500?

#### Motivo 1: Dispositivo Desligado ou Offline ⭐ MAIS COMUM
```
A2 API tenta conectar ao Intelbras/Hikvision
Dispositivo não responde
Timeout ou Connection Refused → 500 Internal Server Error
```

#### Motivo 2: Credenciais Incorretas
```
Usuario/Senha não conferem
API retorna 401 Unauthorized
A2 Backend retorna 500
```

#### Motivo 3: IP Errado no Cadastro
```
Dispositivo cadastrado com IP: 192.168.1.200
Mas Intelbras está em: 192.168.1.17
Timeout → 500
```

#### Motivo 4: Porta Errada
```
Cadastrado com porta 8080
Mas dispositivo responde em porta 80
Connection refused → 500
```

### Como Resolver:

**✅ Passo 1: Verificar se Intelbras está online**
```bash
ping 192.168.1.17
# Deve retornar resposta (ms=XX)

# Se não responder:
# - Verificar conexão física (cabo RJ45)
# - Verificar alimentação
# - Verificar se está na mesma rede
```

**✅ Passo 2: Acessar painel web do Intelbras**
```bash
curl -v http://192.168.1.17
# Deve retornar HTML ou redirecionamento

# Se tiver erro:
# - IP está errado
# - Dispositivo desligado
# - Firewall bloqueando
```

**✅ Passo 3: Testar snapshot direto (sem API)**
```bash
# Acessar diretamente a URL do snapshot
curl http://192.168.1.17/cgi-bin/snapshot.cgi \
  --digest -u admin:admin123 \
  -o snapshot.jpg

# Se funcionar: arquivo screenshot.jpg é criado
# Se falhar: credenciais ou URL errados
```

**✅ Passo 4: Se tudo funciona, problema é na API**
```bash
# Ver logs detalhados
docker logs a2-eventos-api 2>&1 | grep -i "snapshot" | tail -50

# Procurar por:
# - "timeout"
# - "connection refused"
# - "401 unauthorized"
# - "404 not found"
```

**✅ Passo 5: Se timeout, aumentar tempo limite**
```javascript
// Arquivo: a2-eventos/backend/api-nodejs/src/config/timeouts.js

const TIMEOUT_CONFIG = {
    DEVICE_CONNECTION: 15000,  // ← Aumentar para 25000 (25s)
    HARDWARE_CALLBACK: 30000
};
```

Depois reconstruir:
```bash
docker-compose build --no-cache a2-eventos-api
docker-compose up -d
```

### 🔧 Status
**ESPERADO SE OFFLINE** - Verifique se Intelbras está ligado e na rede certa

---

## 📋 **CHECKLIST RÁPIDO**

```
Para Erro 404 (Pulseira):
[ ] Verificar se código 1488 foi cadastrado em pessoas
[ ] Confirmar evento_id está correto
[ ] Reinscrever participante com pulseira

Para Erro 500 (Config Areas):
[ ] Verificar logs: docker logs a2-eventos-api
[ ] Testar payload com cURL
[ ] Confirmar token tem permissões admin_master

Para Erro 500 (Settings):
[ ] Validar dados de SMTP antes de enviar
[ ] Verificar RLS policies em saas_config_global
[ ] Testar endpoint /verify-smtp

Para Erro 500 (Snapshot):
[ ] ping 192.168.1.17 (verificar se está online)
[ ] curl http://192.168.1.17 (verificar acesso ao painel)
[ ] curl /cgi-bin/snapshot.cgi (testar direto)
[ ] docker logs (ver se há timeout ou erro de auth)
[ ] Aumentar timeout se necessário
```

---

## 🛠️ **Próximos Passos (Sua Ação)**

1. **Executar checklist acima** para cada erro
2. **Coletar logs** do Docker
3. **Reportar resultado** de cada teste
4. Vou investigar erros 500 específicos com você

---

**Última atualização:** 2026-04-28  
**Versão:** 1.0

