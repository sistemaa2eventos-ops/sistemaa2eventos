# 🔧 GUIA: Configurar Intelbras BIO-T SS5541 MF W no A2 Eventos

## 📋 Visão Geral

O Intelbras BIO-T SS5541 MF W é um leitor biométrico (rosto/impressão digital) com suporte a:
- ✅ Autenticação HTTP Digest Auth
- ✅ RTSP para livestream
- ✅ API REST para controle
- ✅ Captura de snapshots (JPEG)
- ✅ Registros de acesso (logs)

---

## ⚙️ **PASSO 1: Conectar Fisicamente o Dispositivo**

### Hardware
```
Intelbras BIO-T SS5541 MF W
├─ Porta RJ45 (Ethernet)
│   └─ Conecte em rede local (mesmo switch que VPS/PC)
├─ Fonte de Alimentação
│   └─ 12V DC, 2A (fornecido)
└─ Cabo de Saída (NO/NC relé)
    └─ Pino 7,8 = Controle de porta
```

### Rede Esperada
```
VPS/PC: 192.168.1.100
Intelbras: 192.168.1.17 (padrão de fábrica)
```

---

## 🌐 **PASSO 2: Configuração Inicial via Interface Web**

### 1. Acessar o Painel Web do Dispositivo
```
URL: http://192.168.1.17
Login padrão de fábrica:
- Usuário: admin
- Senha: admin
```

⚠️ **Se não conseguir acessar:**
1. Verifique se o dispositivo está na rede: `ping 192.168.1.17`
2. Verifique a porta (padrão é 80): `curl -I http://192.168.1.17`
3. Resete às configurações de fábrica (botão na traseira, pressione 10 segundos)

### 2. Configurar Endereço IP Fixo
No painel web:
```
Network → IPv4 Settings
- Static IP: 192.168.1.17 (ou qual for sua rede)
- Gateway: 192.168.1.1
- DNS: 8.8.8.8
Salvar e reiniciar
```

### 3. Habilitar RTSP
```
Media → RTSP Settings
- Enable RTSP: ✓ ON
- Port: 554 (padrão)
Salvar
```

### 4. Habilitar HTTP API
```
System → HTTP API Settings
- Enable HTTP API: ✓ ON
- Authentication: Digest Auth
- Admin User: admin
- Admin Password: sua-senha
Salvar
```

### 5. Configurar Webhook (Opcional, para alertas)
```
System → Network Events
- Enable: ✓ ON
- Event Type: Access Control, Face Detection
- Webhook URL: https://painel.nzt.app.br/api/intelbras/webhook
- Method: POST
Salvar
```

---

## 🗄️ **PASSO 3: Cadastrar Dispositivo no A2 Eventos**

### Via Dashboard (Painel Web)
1. Acesse: `https://painel.nzt.app.br`
2. Menu → **Dispositivos** → **Cadastrar Novo**
3. Preencha:
   ```
   Nome: "Terminal Entrada - Piso 1"
   Marca: "Intelbras" ← IMPORTANTE
   Tipo: "Leitor Biométrico"
   IP Address: 192.168.1.17
   Porta: 80
   Usuário: admin
   Senha: (a senha que você definiu)
   Área: Selecione uma área
   ```

4. Clique em **"Testar Conexão"**
   - Deve retornar: ✅ "Dispositivo conectado com sucesso"
   - Se falhar: Ver troubleshooting abaixo

5. Clique em **"Cadastrar"**

### Via API (cURL)
```bash
ADMIN_TOKEN="seu-token-jwt-aqui"
EVENTO_ID="uuid-do-seu-evento"

curl -X POST https://painel.nzt.app.br/api/dispositivos \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "nome": "Terminal Entrada",
    "marca": "intelbras",
    "tipo": "Leitor Biométrico",
    "ip_address": "192.168.1.17",
    "porta": 80,
    "user_device": "admin",
    "password_device": "sua-senha",
    "area_id": "uuid-da-area",
    "evento_id": "'$EVENTO_ID'"
  }'
```

---

## 📸 **PASSO 4: Testar Capture de Snapshot**

### Via Dashboard
1. Vá para **Dispositivos**
2. Procure o Intelbras cadastrado
3. Clique em **"Ver Câmera"** ou **"Capture"**
4. Deve exibir a imagem atual do leitor

### Via API
```bash
curl -X GET https://painel.nzt.app.br/api/dispositivos/DEVICE_ID/snapshot \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -o snapshot.jpg

file snapshot.jpg  # Deve ser: JPEG image data
```

**Se retornar erro 500:**
- Verifique logs: `docker logs a2-eventos-api | grep snapshot`
- Verifique conectividade: `curl http://192.168.1.17/cgi-bin/snapshot.cgi --digest -u admin:sua-senha`

---

## 👤 **PASSO 5: Cadastrar Usuários (Rostos) no Terminal**

### Via A2 Eventos - Fluxo Normal
1. **Participantes/Colaboradores** → Preencher cadastro com:
   - Nome completo
   - CPF
   - Foto (selfie)
   - Email

2. **Admin aprova** o cadastro

3. **Sistema automaticamente:**
   - Envia a foto para o Intelbras
   - Cria usuário biométrico no terminal
   - Ativa acesso no leitor

### Estrutura de Dados Enviados
```json
{
  "pessoa_id": "uuid-12345",
  "cpf": "12345678900",
  "nome": "João Silva",
  "foto_base64": "data:image/jpeg;base64,/9j/4AAQ...",
  "control_token": "token-unico-por-pessoa"
}
```

### Endpoint que Cadastra no Terminal
```
POST /api/dispositivos/{device_id}/enroll
Body: { pessoa_id, nome, cpf, foto_base64, control_token }
```

---

## 🎯 **PASSO 6: Testar Acesso/Check-in**

### Teste Manual
1. Aproxime seu rosto do terminal Intelbras
2. Terminal deve reconhecer e processar
3. Sistema A2 Eventos deve:
   - Registrar em `logs_acesso`
   - Atualizar status em `pessoas`
   - Gerar webhook (se configurado)

### Verificar Logs de Acesso
```bash
# Comando SQL
SELECT id, pessoa_id, tipo, metodo, created_at 
FROM logs_acesso 
WHERE created_at > now() - interval '5 minutes'
ORDER BY created_at DESC
LIMIT 10;
```

### Monitorar em Tempo Real
```bash
docker logs -f a2-eventos-api | grep -i "intelbras\|acesso"
```

---

## 🔐 **PASSO 7: Controlar Porta (Relé NO/NC)**

### Ligar/Desligar Porta após Reconhecimento
```bash
# Estrutura do comando para abrir porta por 3 segundos
curl -X POST http://192.168.1.17/cgi-bin/gpio.cgi?gpio=1&value=1 \
  --digest -u admin:sua-senha

# Aguardar 3 segundos
sleep 3

# Fechar porta
curl -X POST http://192.168.1.17/cgi-bin/gpio.cgi?gpio=1&value=0 \
  --digest -u admin:sua-senha
```

### Automático via Sistema
O backend detecta reconhecimento facial e:
1. Consulta permissões de acesso
2. Se autorizado: envia comando GPIO para abrir
3. Aguarda 3s
4. Fecha automaticamente
5. Registra evento

---

## 🐛 **TROUBLESHOOTING**

### ❌ Erro 1: "Dispositivo não encontrado (404)"

**Sintoma:**
```
GET /api/dispositivos/582b78e1-bdeb-4216-889a-702bc502dc14/snapshot 404
```

**Causas:**
1. Device ID incorreto no URL
2. Dispositivo foi deletado

**Solução:**
```bash
# Listar todos os dispositivos
curl -X GET https://painel.nzt.app.br/api/dispositivos \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Copiar o ID correto e tentar novamente
```

---

### ❌ Erro 2: "Falha ao obter imagem da câmera (500)"

**Sintoma:**
```
PUT/GET /api/dispositivos/...  500 Internal Server Error
```

**Causas Possíveis:**
1. Intelbras desligado
2. Credenciais incorretas
3. IP errado
4. Rede desconectada
5. Timeout de conexão

**Solução:**

```bash
# 1. Verificar se dispositivo está online
ping 192.168.1.17

# 2. Testar acesso ao painel web
curl -v http://192.168.1.17

# 3. Testar snapshot direto (sem API)
curl http://192.168.1.17/cgi-bin/snapshot.cgi \
  --digest -u admin:sua-senha \
  -o test-snapshot.jpg

# 4. Se funcionar, o problema é na API
# Verificar logs do backend:
docker logs a2-eventos-api 2>&1 | grep -i "snapshot\|intelbras" | tail -20

# 5. Se ainda não funcionar, aumentar timeout
# No arquivo: a2-eventos/backend/api-nodejs/src/config/timeouts.js
# Mudar DEVICE_CONNECTION de 15000 para 25000
```

---

### ❌ Erro 3: "Usuário/Senha inválido"

**Causa:** Credenciais no Intelbras não coincidem com as da API

**Solução:**
```bash
# 1. Redefinir senha do Intelbras no painel web
# ou resetar às configurações de fábrica

# 2. Atualizar credenciais no A2 Eventos:
curl -X PUT https://painel.nzt.app.br/api/dispositivos/DEVICE_ID \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "user_device": "admin",
    "password_device": "nova-senha"
  }'

# 3. Testar novamente
```

---

### ❌ Erro 4: "Webhook não recebido"

**Sintoma:** Pessoa se aproxima do terminal mas nada acontece no A2

**Causa:** Webhook não configurado ou endpoint não acessível

**Solução:**
```bash
# 1. Verificar endpoint do webhook está correto:
curl -X POST https://painel.nzt.app.br/api/intelbras/webhook \
  -H "Content-Type: application/json" \
  -d '{"event_id": "test", "device_id": "test"}'
# Deve retornar 200 ou ao menos não 404

# 2. Se 404, endpoint pode não existir
# Verificar arquivo: a2-eventos/backend/api-nodejs/src/modules/intelbras.routes.js

# 3. Configurar novamente no painel Intelbras:
# System → Network Events → Webhook URL
# Garantir HTTPS e certificado válido
```

---

## 📊 **TESTE COMPLETO (Checklist)**

- [ ] Intelbras conectado em rede (ping 192.168.1.17)
- [ ] Acessar painel web em http://192.168.1.17
- [ ] RTSP habilitado (porta 554)
- [ ] HTTP API habilitado (Digest Auth)
- [ ] Dispositivo cadastrado no A2 Eventos
- [ ] Teste de conexão passou (✅ verde)
- [ ] Snapshot funciona (consegue ver imagem)
- [ ] Usuário cadastrado com foto no sistema
- [ ] Rosto reconhecido no terminal
- [ ] Logs de acesso registrados
- [ ] Porta abre após reconhecimento (se configurada)

---

## 📝 **Variáveis de Ambiente (.env)**

```bash
# Intelbras padrão (se não fornecer credenciais)
INTELBRAS_DEFAULT_USER=admin
INTELBRAS_DEFAULT_PASS=admin123

# Timeout para conexão com dispositivo
DEVICE_CONNECTION_TIMEOUT=15000  # 15 segundos

# Webhook
HARDWARE_CALLBACK_PORT=443
HARDWARE_CALLBACK_HOST=painel.nzt.app.br
```

---

## 📞 **Suporte**

| Problema | Quem Contatar |
|----------|--------------|
| Hardware não funciona | Suporte Intelbras: +55 48 3281-9000 |
| API retorna 500 | Verificar logs do Docker: `docker logs a2-eventos-api` |
| Rede lenta/timeout | Verificar ping, aumentar timeout em timeouts.js |
| Webhook não funciona | Testar endpoint manualmente com cURL |

---

## 🎯 **Resultado Final Esperado**

Quando tudo estiver configurado:

```
┌─ Intelbras BIO-T SS5541 MF W (http://192.168.1.17)
│  ├─ Rosto se aproxima
│  ├─ Terminal reconhece (> 90% confiança)
│  └─ Webhook POST → A2 Eventos
│
└─ A2 Eventos API (https://painel.nzt.app.br)
   ├─ Recebe webhook
   ├─ Valida permissões
   ├─ Registra em logs_acesso
   ├─ Atualiza status da pessoa
   ├─ Abre relé de porta (3 segundos)
   └─ Dashboard mostra acesso em tempo real
```

---

**Última atualização:** 2026-04-28  
**Versão do Intelbras:** BIO-T SS5541 MF W  
**Status:** Pronto para uso
