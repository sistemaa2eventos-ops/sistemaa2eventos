# 🔌 GUIA: Configurar Intelbras BIO-T SS5541 MF W via WiFi

## 🎯 Quick Start WiFi

Se seu Intelbras está conectado via WiFi (sem switch/Ethernet), siga este guia!

---

## **PASSO 1: Encontrar o IP do Intelbras na Rede WiFi**

### Opção A: Via Aplicativo Intelbras (Recomendado)
1. Baixe o app **"Intelbras SmartAccess"** ou **"Intelbras Pro"**
   - iOS: App Store
   - Android: Google Play
   - PC/Mac: https://www.intelbras.com.br/

2. Abra o app
3. Procure por **"Buscar Dispositivos"** ou **"Device Discovery"**
4. O app listará seu Intelbras com o IP na rede
5. Anote o IP (exemplo: `192.168.1.50`)

### Opção B: Via Roteador WiFi
1. Acesse o painel do seu roteador
   - Digite na URL: `192.168.1.1` ou `192.168.0.1`
   - Login: admin / admin (ou sua senha)

2. Procure por **"Dispositivos Conectados"** ou **"Connected Devices"**

3. Procure por um dispositivo com nome como:
   - `Intelbras-XXXXXX`
   - `BIO-T SS5541`
   - `IBRV-something`

4. Anote o IP dele

### Opção C: Via Comando (Windows/Mac/Linux)
```bash
# Escanear rede local (Windows)
arp -a | grep -i intelbras

# Ou procurar por portas abertas
nmap -p 80 192.168.1.0/24  # Escaneia todos IPs da sua rede

# Ou usar descoberta mDNS
dns-sd -B _http._tcp local.
```

---

## **PASSO 2: Acessar o Painel Web (WiFi)**

1. Abra seu navegador
2. Digite: `http://[IP-DO-INTELBRAS]`
   
   Exemplo se o IP for 192.168.1.50:
   ```
   http://192.168.1.50
   ```

3. **Login padrão:**
   - Usuário: `admin`
   - Senha: `admin` (ou mude depois)

4. Se aparecer aviso de certificado SSL, clique em **"Prosseguir de qualquer forma"**

---

## **PASSO 3: Configurar o Intelbras (igual ao guia anterior)**

Uma vez logado no painel web, faça:

### 3.1 - Definir IP Estático (Importante!)
```
Menu → Network / Rede → IPv4 Settings
- Mode: Static (Estático)
- IP Address: 192.168.1.50  ← Use o IP que encontrou
- Gateway: 192.168.1.1       ← Seu roteador
- DNS: 8.8.8.8               ← Google DNS
✅ Save
```

⚠️ **Por que IP estático?**
- WiFi pode mudar o IP automaticamente
- Se IP mudar, seu A2 não achará mais o dispositivo
- IP estático garante que sempre responda no mesmo endereço

### 3.2 - Habilitar RTSP
```
Menu → Media / Mídia → RTSP Settings
- Enable RTSP: ✅ ON
- Port: 554
✅ Save e reiniciar
```

### 3.3 - Confirmar HTTP API
```
Menu → System → HTTP API
- Enable HTTP API: ✅ ON
- Auth Type: Digest
✅ Save
```

### 3.4 - Webhook (Opcional, para alertas em tempo real)
```
Menu → System → Network Events
- Enable: ✅ ON
- Event Type: Access Control (Controle de Acesso)
- Webhook URL: https://painel.nzt.app.br/api/intelbras/webhook
- Method: POST
✅ Save
```

---

## **PASSO 4: Testar Conexão WiFi**

### 4.1 - Verifique se consegue pingar
```bash
ping 192.168.1.50
# Deve retornar: Reply from 192.168.1.50...
```

Se não conseguir:
- WiFi está desligado no Intelbras?
- Está na mesma rede WiFi que seu PC?
- Distância muito longe do roteador?

### 4.2 - Teste snapshot via WiFi
```bash
curl http://192.168.1.50/cgi-bin/snapshot.cgi \
  --digest -u admin:admin \
  -o snapshot.jpg

file snapshot.jpg  # Deve ser: JPEG image data
```

Se funcionar: ✅ WiFi está OK!

---

## **PASSO 5: Cadastrar no A2 Eventos**

No painel do A2: https://painel.nzt.app.br

### Opção 1: Via Dashboard (Recomendado)
1. Menu → **Dispositivos** → **Cadastrar Novo**
2. Preencha:
   ```
   Nome: "Terminal WiFi - Entrada"
   Marca: Intelbras
   Tipo: Leitor Biométrico
   IP Address: 192.168.1.50  ← Seu IP WiFi
   Porta: 80
   Usuário: admin
   Senha: admin (ou a que você configurou)
   Área: (selecione)
   ```
3. Clique em **"Testar Conexão"**
   - Deve mostrar: ✅ "Dispositivo conectado com sucesso"

4. Clique em **"Cadastrar"**

### Opção 2: Via API (cURL)
```bash
ADMIN_TOKEN="seu-token-jwt-aqui"
EVENTO_ID="uuid-do-seu-evento"

curl -X POST https://painel.nzt.app.br/api/dispositivos \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "nome": "Terminal WiFi",
    "marca": "intelbras",
    "tipo": "Leitor Biométrico",
    "ip_address": "192.168.1.50",
    "porta": 80,
    "user_device": "admin",
    "password_device": "admin",
    "evento_id": "'$EVENTO_ID'"
  }'
```

---

## **PASSO 6: Testar Snapshot via A2 Eventos**

1. Vá para **Dispositivos**
2. Procure seu Intelbras WiFi
3. Clique em **"Capturar Imagem"** ou **"Snapshot"**
4. Deve aparecer a imagem ao vivo do leitor

Se der erro 500:
- WiFi está instável (sinal fraco)
- Aumentar timeout em `config/timeouts.js` (de 15000 para 25000)

---

## 📱 **Dicas WiFi**

### ✅ Boas Práticas
- **IP estático** - Configure sempre para evitar problemas
- **Sinal forte** - Intelbras deve estar perto do roteador (mesma sala)
- **2.4GHz** - Use a banda 2.4GHz (mais alcance que 5GHz)
- **Canal livre** - Se WiFi cair muito, mude de canal no roteador

### ⚠️ Possíveis Problemas WiFi

| Problema | Causa | Solução |
|----------|-------|---------|
| Desconecta frequentemente | Sinal fraco | Aproxime roteador ou mude canal |
| IP muda todo dia | Sem IP estático | Configure IP estático no Intelbras |
| Ping lento | Roteador sobrecarregado | Reinicie roteador ou mude WiFi |
| Não consegue acessar | WiFi desligado no Intelbras | Ligue via app ou painel físico |

---

## 🔄 **Fluxo Completo (WiFi)**

```
1. Encontrar IP via app/roteador
   ↓
2. Acessar painel web (http://IP)
   ↓
3. Definir IP estático na rede
   ↓
4. Habilitar RTSP + HTTP API
   ↓
5. Testar: ping + snapshot via cURL
   ↓
6. Cadastrar em A2 Eventos
   ↓
7. Testar snapshot via Dashboard
   ↓
8. ✅ Pronto! Intelbras funciona via WiFi
```

---

## 📋 **Checklist WiFi**

- [ ] Intelbras conectado ao WiFi (LED de rede piscando)
- [ ] IP encontrado via app/roteador
- [ ] Consegue acessar painel web (http://IP)
- [ ] IP estático configurado no Intelbras
- [ ] RTSP habilitado (porta 554)
- [ ] HTTP API habilitado
- [ ] Ping funciona (`ping 192.168.X.X`)
- [ ] Snapshot funciona via cURL
- [ ] Dispositivo cadastrado no A2 Eventos
- [ ] Snapshot funciona no Dashboard A2
- [ ] Webhook configurado (opcional)

---

## 🆘 **Problemas Comuns WiFi**

### ❌ "Não consigo encontrar o IP"
```
Solução:
1. Verifique se Intelbras está ligado (LED de rede piscando)
2. Tente app Intelbras SmartAccess
3. Acesse roteador e procure por dispositivos Intelbras
4. Se não aparecer: reinicie Intelbras e roteador
```

### ❌ "Painel web não carrega"
```
Solução:
1. ping 192.168.1.50  ← Deve responder
2. Espere 30 segundos (Intelbras pode estar inicializando)
3. Tente http em vez de https: http://192.168.1.50
4. Limpe cache do navegador (Ctrl+Shift+Del)
```

### ❌ "Snapshot retorna erro 500"
```
Solução:
1. WiFi signal é fraco? Aproxime o roteador
2. Teste snapshot direto:
   curl http://192.168.1.50/cgi-bin/snapshot.cgi \
     --digest -u admin:admin
3. Se funciona no cURL mas falha em A2:
   - Aumentar timeout de 15000 para 25000ms
   - Arquivo: a2-eventos/backend/config/timeouts.js
```

### ❌ "Não consegue se conectar ao Intelbras"
```
Solução:
1. ping 192.168.1.50  ← Verificar conectividade
2. firewall do PC pode estar bloqueando
   - Windows: Permitir "curl" no firewall
   - Mac: System Preferences → Security & Privacy
3. Roteador WiFi pode estar bloqueando:
   - Verifique se isolamento de rede está desligado
```

---

## 🎯 **Resultado Final Esperado**

Quando tudo estiver certo:

```
┌─ WiFi
│  └─ Intelbras BIO-T SS5541 (192.168.1.50)
│     ├─ LED Rede: Piscando (conectado)
│     ├─ HTTP API: Online
│     └─ RTSP: Online (porta 554)
│
└─ A2 Eventos (painel.nzt.app.br)
   ├─ Dispositivo cadastrado
   ├─ Snapshot funciona
   ├─ Pessoas com fotos aparecem
   ├─ Check-in por facial funciona
   └─ Dashboard mostra acessos em tempo real
```

---

**Status:** ✅ Pronto para WiFi  
**Última atualização:** 2026-04-28

