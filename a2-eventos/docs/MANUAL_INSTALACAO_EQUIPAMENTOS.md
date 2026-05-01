# MANUAL DE INSTALAÇÃO E CONFIGURAÇÃO DE EQUIPAMENTOS
## A2 Eventos — Guia Completo de Campo

**Versão:** 1.0  
**Data:** 2026-04-30  
**Equipamentos cobertos:**
- Intelbras Bio-T SS 5541 MF W (leitor facial/biométrico)
- Webcam Intelbras (como câmera IP para testes de face tracking)

---

## ÍNDICE

1. [Entendendo a Arquitetura de Rede](#1-entendendo-a-arquitetura-de-rede)
2. [Descobrindo IPs na Rede](#2-descobrindo-ips-na-rede)
3. [Leitor Biométrico — Conexão via Cabo (Ethernet)](#3-leitor-biométrico--conexão-via-cabo-ethernet)
4. [Leitor Biométrico — Conexão via WiFi](#4-leitor-biométrico--conexão-via-wifi)
5. [Configurando o Leitor no Sistema A2 Eventos](#5-configurando-o-leitor-no-sistema-a2-eventos)
6. [Configurando para Cada Evento e Área](#6-configurando-para-cada-evento-e-área)
7. [Configuração de API e Webhook](#7-configuração-de-api-e-webhook)
8. [Liberando Permissões de Segurança (Firewall)](#8-liberando-permissões-de-segurança-firewall)
9. [Webcam como Câmera IP para Face Tracking](#9-webcam-como-câmera-ip-para-face-tracking)
10. [Cenários de Rede por Tipo de Local](#10-cenários-de-rede-por-tipo-de-local)
11. [Checklist por Evento](#11-checklist-por-evento)
12. [Troubleshooting Rápido](#12-troubleshooting-rápido)

---

## 1. ENTENDENDO A ARQUITETURA DE REDE

Antes de instalar qualquer equipamento, entenda como os dados fluem:

```
LOCAL DO EVENTO                         NUVEM (VPS)
──────────────────────────────          ─────────────────────────
                                        
 [Leitor Biométrico]                    [A2 Eventos API]
  IP: 192.168.X.Y  ──── Webhook ──────▶  painel.nzt.app.br
                   ◀─── Comandos ───────  (enrola face, abre porta)
        │
        │ Rede local
        │
 [Modem/Roteador]
  IP: 192.168.X.1
  DHCP: 192.168.X.2 ~ 192.168.X.254
        │
        │ Internet
        ▼
    [Cloudflare]
    [VPS Hostinger]
```

### Como a comunicação funciona

Existem **dois modos** de operação:

| Modo | Como funciona | Quando usar |
|------|--------------|-------------|
| **Webhook (Push)** | O leitor avisa o servidor quando alguém passa | **Recomendado.** Funciona sem VPN |
| **Polling (Pull)** | O servidor consulta o leitor periodicamente | Requer acesso direto ao IP do leitor |

**Para eventos em locais públicos, use sempre Webhook.** O leitor envia os eventos para `painel.nzt.app.br` via internet, sem precisar que o servidor acesse o IP local do leitor.

### Por que o servidor não consegue acessar o IP do leitor diretamente

O leitor tem um IP **privado** (ex: `192.168.1.17`). O VPS na nuvem não consegue acessar IPs privados a não ser que você configure:
- **Port forwarding** no modem do evento (abrir porta 80 do leitor para internet)
- **VPN** entre o local e o VPS

Para a maioria dos eventos, **usar apenas Webhook é suficiente e mais simples.**

---

## 2. DESCOBRINDO IPs NA REDE

### Método 1: Pelo painel do roteador/modem (mais fácil)

1. Conecte seu notebook na mesma rede do leitor (cabo ou WiFi)
2. Abra o navegador e acesse o painel do roteador:
   - Tente: `http://192.168.1.1`
   - Ou: `http://192.168.0.1`
   - Ou: `http://192.168.2.1`
   - (Veja o endereço no adesivo do modem)
3. Login: geralmente `admin / admin` ou `admin / (sem senha)` — veja no adesivo do modem
4. Procure: **"Clientes DHCP"**, **"Dispositivos Conectados"** ou **"Connected Devices"**
5. O leitor aparece como `Intelbras-XXXXXX` ou pelo MAC address (começa com `00:1E:6A` ou `D8:5D:4C`)

### Método 2: Pelo Windows (Prompt de Comando)

```cmd
rem Abra o Prompt de Comando como Administrador e execute:

rem Ver todos os dispositivos na rede
arp -a

rem Escanear a rede inteira (instale o nmap: nmap.org)
nmap -sn 192.168.1.0/24

rem Resultado mostra todos os IPs ativos. Procure o Intelbras.
```

### Método 3: App Intelbras

1. Baixe **"iSIC Mobile"** na Play Store ou App Store
2. Crie uma conta Intelbras (gratuita)
3. O app descobre automaticamente dispositivos Intelbras na rede

### Método 4: IP padrão de fábrica

O Intelbras Bio-T SS 5541 MF W sai de fábrica com:
```
IP padrão: 192.168.1.64
Porta: 80
Usuário: admin
Senha: admin
```

Se seu modem usa faixa `192.168.1.X`, tente acessar `http://192.168.1.64` direto no navegador.

### Método 5: Via tela do próprio leitor

O Bio-T SS 5541 tem uma tela. Acesse:
```
Menu → Configurações de Rede → Informações
Ou: Menu → Network → Network Information
```
O IP atual aparece na tela.

---

## 3. LEITOR BIOMÉTRICO — CONEXÃO VIA CABO (ETHERNET)

### Materiais necessários
- Cabo de rede Cat5e ou Cat6 (tamanho adequado à distância)
- Fonte de alimentação 12V DC 2A (fornecida com o leitor)
- Switch ou porta livre no modem

### Diagrama de conexão

```
[Leitor Bio-T SS5541]
      │
      │ Cabo RJ45
      │
[Switch ou Modem]────────[Seu notebook/PC]
      │
      │ Internet
      ▼
   [Nuvem / VPS]
```

### Passo a passo

**1. Conectar o hardware**
```
a) Conecte o cabo RJ45 na porta de rede do leitor (porta traseira, marcada LAN)
b) Conecte a outra ponta no switch ou na porta LAN do modem
c) Conecte a fonte de alimentação 12V no leitor
d) Aguarde ~60 segundos para o leitor inicializar (tela acende)
```

**2. Verificar se o cabo funcionou**

```cmd
rem No prompt do seu notebook (conectado na mesma rede):
ping 192.168.1.64

rem Se responder: ✅ Conexão OK
rem Se não responder: verifique o cabo e veja o IP na tela do leitor
```

**3. Acessar a interface web do leitor**

```
Abra o navegador
Digite: http://192.168.1.64  (use o IP que aparece na tela do leitor)

Login:
  Usuário: admin
  Senha:   admin
```

**4. Configurar IP estático (obrigatório)**

No painel web do leitor:
```
Caminho: Configuração → Rede → Configurações IPv4
  ou em inglês: Configuration → Network → IPv4 Settings

Preencha:
  Modo: Estático (Static)
  Endereço IP: 192.168.1.17   ← Escolha um número livre na faixa do modem
  Máscara: 255.255.255.0
  Gateway: 192.168.1.1        ← IP do seu modem
  DNS Preferencial: 8.8.8.8
  DNS Alternativo:  8.8.4.4

Salvar → Reiniciar
```

> **Por que IP estático?**  
> Sem IP estático, toda vez que o leitor reinicia ou o modem reinicia, ele pode ganhar um IP diferente. O sistema A2 precisa saber exatamente onde encontrar o leitor, então o IP deve ser sempre o mesmo.

> **Como escolher o IP?**  
> Verifique o painel do modem. Há uma faixa DHCP (ex: 192.168.1.100 a 192.168.1.200). Escolha um IP **fora** dessa faixa para não haver conflito, por exemplo `192.168.1.17`.

**5. Verificar após reiniciar**

```cmd
ping 192.168.1.17
rem Deve responder com o novo IP
```

---

## 4. LEITOR BIOMÉTRICO — CONEXÃO VIA WiFi

### Pré-requisitos
- Rede WiFi disponível no local (banda 2.4 GHz preferencial)
- Leitor deve estar a no máximo ~15 metros do roteador (sem paredes grossas entre eles)

### Passo a passo

**1. Ligar o leitor e acessar pela primeira vez**

Na primeira vez, você precisa conectar via cabo para configurar o WiFi. Se não tiver cabo:
- O leitor vem de fábrica com um IP padrão (`192.168.1.64`)
- Conecte seu notebook diretamente ao leitor com um cabo crossover, ou use um switch pequeno

**2. Configurar o WiFi no painel web**

Acesse `http://192.168.1.64` e vá em:
```
Configuração → Rede → WiFi
ou: Configuration → Network → Wireless / WiFi

Preencha:
  Ativar WiFi: ✅ Sim
  SSID: (nome da sua rede WiFi)
  Segurança: WPA2-PSK
  Senha: (senha do seu WiFi)

Salvar
```

**3. Verificar conexão WiFi**

```
Na tela do leitor: Menu → Rede → Info
O ícone de WiFi deve estar ativo e mostrar o IP recebido
```

**4. Definir IP estático via WiFi**

Após conectar ao WiFi, o leitor recebe um IP via DHCP. Fixe esse IP:
```
Configuração → Rede → Configurações IPv4
  Modo: Estático
  IP: (use o IP que o leitor recebeu via DHCP, ou escolha outro livre)
  Gateway: IP do roteador (ex: 192.168.1.1)
  DNS: 8.8.8.8

Salvar → Reiniciar
```

**5. Boas práticas para WiFi em eventos**

| Situação | Recomendação |
|----------|-------------|
| Local com sinal fraco | Use cabo ao invés de WiFi |
| Modem de chip (4G) | Configure IP estático no leitor após verificar faixa do modem |
| Muitos dispositivos na rede | Separe o leitor em rede 2.4GHz, deixe 5GHz para outros |
| Local sem switch | Conecte diretamente na porta LAN do modem |

---

## 5. CONFIGURANDO O LEITOR NO SISTEMA A2 EVENTOS

Depois de o leitor estar na rede com IP fixo, cadastre-o no sistema:

### Via Painel Web (forma visual)

1. Acesse `https://painel.nzt.app.br`
2. Vá em **Dispositivos** → **Cadastrar Novo**
3. Preencha:

| Campo | Valor |
|-------|-------|
| Nome | Nome descritivo do local (ex: "Entrada Principal - Galpão A") |
| Marca | `Intelbras` |
| Tipo | `Leitor Biométrico` |
| IP Address | IP fixo que você configurou (ex: `192.168.1.17`) |
| Porta | `80` |
| Usuário | `admin` |
| Senha | Senha que você configurou no leitor |
| Evento | Selecione o evento ativo |
| Área | Selecione a área que esse leitor controla |

4. Clique em **"Testar Conexão"**
   - ✅ Verde = leitor acessível e respondendo
   - ❌ Vermelho = problema de rede ou credencial (veja seção 12)

5. Clique em **"Cadastrar"**

### Via API (para automação ou múltiplos dispositivos)

Obtenha seu token JWT fazendo login:
```bash
TOKEN=$(curl -s -X POST https://painel.nzt.app.br/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"seu@email.com","senha":"sua-senha"}' \
  | jq -r '.token')
```

Cadastre o dispositivo:
```bash
curl -X POST https://painel.nzt.app.br/api/dispositivos \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "nome": "Entrada Principal",
    "marca": "intelbras",
    "tipo": "Leitor Biométrico",
    "ip_address": "192.168.1.17",
    "porta": 80,
    "user_device": "admin",
    "password_device": "sua-senha-do-leitor",
    "area_id": "uuid-da-area",
    "evento_id": "uuid-do-evento"
  }'
```

---

## 6. CONFIGURANDO PARA CADA EVENTO E ÁREA

### Conceito: Evento → Empresa → Área → Dispositivo

```
EVENTO (ex: "Show 15/05")
  ├─ Área: Palco VIP
  │    └─ Dispositivo: Leitor Entrada VIP (192.168.1.17)
  ├─ Área: Backstage
  │    └─ Dispositivo: Leitor Backstage (192.168.1.18)
  └─ Área: Geral
       └─ Dispositivo: Leitor Geral 1 (192.168.1.19)
                       Leitor Geral 2 (192.168.1.20)
```

Cada leitor controla uma **área**. Pessoas com permissão naquela área podem passar.

### Criando Áreas no Sistema

1. Acesse **Configurações** → **Áreas**
2. Clique em **Nova Área**
3. Preencha:
   - Nome: "Palco VIP"
   - Evento: selecione o evento
   - Capacidade máxima: (número de pessoas)
4. Salvar

### Associando o Leitor a uma Área

Ao cadastrar ou editar um dispositivo, selecione a **Área** correspondente. O sistema automaticamente enviará as faces autorizadas para esse leitor e registrará os acessos por área.

### Configurando Quem Pode Entrar em Cada Área

No cadastro de cada pessoa/colaborador:
- **Fases de Acesso**: quais áreas ela pode acessar
- **Dias de Acesso**: quais dias ela pode passar
- **Horário**: restrição de horário de entrada/saída

Quando você aprova o cadastro de uma pessoa, o sistema automaticamente envia a foto dela para **todos os leitores das áreas que ela tem permissão**.

---

## 7. CONFIGURAÇÃO DE API E WEBHOOK

### O que é API e o que é Webhook (explicação simples)

- **API**: Você chama o leitor para fazer algo (ex: "me dê o snapshot agora", "cadastre essa face")
- **Webhook**: O leitor avisa você automaticamente quando algo acontece (ex: "pessoa X acabou de passar")

Para funcionar em eventos, você precisa dos dois:
- **API** → usada para cadastrar faces no leitor (automático quando aprova o cadastro)
- **Webhook** → usado para receber notificação quando alguém passa pelo leitor

### Configurar a API no Leitor (Intelbras)

No painel web do leitor:
```
Caminho: Configuração → Sistema → API HTTP
ou: Configuration → System → HTTP API

Configure:
  Habilitar API HTTP: ✅ Sim
  Tipo de Autenticação: Digest Auth
  Usuário: admin
  Senha: (a senha do leitor)
Salvar
```

### Configurar o Webhook no Leitor

O webhook é o evento que o leitor dispara quando alguém passa pela câmera.

No painel web do leitor:
```
Caminho: Configuração → Rede → Eventos de Rede
ou: Configuration → Network → Network Events

Configure:
  Habilitar: ✅ Sim
  Tipo de Evento: Controle de Acesso (Access Control)
  URL do Webhook: https://painel.nzt.app.br/api/intelbras/webhook
  Método: POST
  Cabeçalho Content-Type: application/json
Salvar
```

> **Importante:** A URL do webhook precisa ser HTTPS e acessível pela internet. `painel.nzt.app.br` já é o endereço público do sistema A2, então isso funciona automaticamente.

### Testar se o Webhook está chegando

```bash
# No terminal do VPS ou em qualquer terminal com internet:
curl -X POST https://painel.nzt.app.br/api/intelbras/webhook \
  -H "Content-Type: application/json" \
  -d '{"test": true, "device_ip": "192.168.1.17"}'

# Deve retornar 200 ou algum JSON (não 404)
```

### Verificar recebimento no log do sistema

```bash
# No VPS, verificar se o webhook chegou:
docker logs a2-eventos-api 2>&1 | grep -i "webhook\|intelbras" | tail -20
```

### Fluxo completo da comunicação

```
1. Pessoa se aproxima do leitor Bio-T
       ↓
2. Leitor captura e reconhece o rosto
       ↓
3. Leitor envia webhook POST para:
   https://painel.nzt.app.br/api/intelbras/webhook
   {
     "device_id": "ID do leitor",
     "pessoa_id": "token da pessoa",
     "evento": "acesso_autorizado",
     "confiança": 95,
     "timestamp": "2026-05-01T10:30:00"
   }
       ↓
4. Sistema A2 recebe, valida permissões
       ↓
5. Se autorizado:
   - Registra check-in/checkout em logs_acesso
   - Envia comando para abrir porta (relé)
   - Atualiza dashboard em tempo real
6. Se bloqueado:
   - Registra tentativa negada
   - Leitor exibe "Acesso Negado"
```

---

## 8. LIBERANDO PERMISSÕES DE SEGURANÇA (FIREWALL)

### Problema mais comum: o sistema não consegue se comunicar com o leitor

Quando você clica em "Testar Conexão" e dá erro, o problema geralmente é um desses:

| Tipo de bloqueio | Causa | Como resolver |
|-----------------|-------|---------------|
| Roteador/Modem | "Client Isolation" ligado | Desligar no painel do roteador |
| Windows Firewall | Bloqueando saída na porta 80 | Adicionar regra de exceção |
| Antivírus | Bloqueando conexão HTTP | Desativar temporariamente para testar |
| VPS bloqueando | UFW bloqueando | Configurar UFW no VPS |

### Desligar Client Isolation no Roteador

Muitos roteadores e modems de chip 4G têm "isolamento de clientes" ativado por padrão. Isso impede que dispositivos na mesma rede WiFi se comuniquem entre si.

Para desligar:
```
Acesse o painel do roteador: http://192.168.1.1

Procure em: WiFi → Configurações Avançadas → Isolamento de Clientes
ou: Wireless → Advanced → AP Isolation / Client Isolation

Desative essa opção e salve.
```

### Liberar no Windows Firewall

```
1. Abra "Windows Defender Firewall"
   (Painel de Controle → Sistema e Segurança → Windows Defender Firewall)

2. Clique em "Configurações Avançadas" (lado esquerdo)

3. Em "Regras de Saída", clique em "Nova Regra"

4. Selecione:
   Tipo: Porta
   Protocolo: TCP
   Porta: 80, 554, 8080
   Ação: Permitir a conexão
   Nome: "A2 Eventos - Leitores Intelbras"

5. OK
```

Para verificar rápido se o firewall está bloqueando:
```cmd
rem Tente desativar temporariamente e testar:
netsh advfirewall set allprofiles state off

rem Teste a conexão
ping 192.168.1.17

rem Depois reative:
netsh advfirewall set allprofiles state on
```

### Configurar UFW no VPS (para webhooks chegarem)

No VPS (servidor Hostinger), verifique se as portas de entrada estão abertas:

```bash
# Ver status do firewall
sudo ufw status

# Deve mostrar algo como:
# 22/tcp   ALLOW   (SSH)
# 80/tcp   ALLOW   (HTTP)
# 443/tcp  ALLOW   (HTTPS)

# Se a porta 443 não estiver aberta:
sudo ufw allow 443/tcp
sudo ufw allow 80/tcp
sudo ufw reload
```

### Configuração de Port Forwarding (somente se precisar que o VPS acesse o leitor diretamente)

> Só é necessário se você quiser usar modo Pull (servidor consulta o leitor). Para Webhook, não precisa.

No painel do modem do evento:
```
Procure: "Port Forwarding", "Virtual Server" ou "Encaminhamento de Porta"

Nova regra:
  Protocolo: TCP
  Porta Externa (WAN): 8080   ← porta que vai abrir na internet
  IP Interno (LAN): 192.168.1.17  ← IP do leitor
  Porta Interna (LAN): 80

Salvar
```

Depois o VPS pode acessar o leitor via:
```
http://IP-PUBLICO-DO-MODEM:8080
```

Para descobrir o IP público do modem: acesse `http://meuip.com.br` de qualquer dispositivo conectado nele.

---

## 9. WEBCAM COMO CÂMERA IP PARA FACE TRACKING

A webcam Intelbras USB pode ser usada como câmera IP de testes enquanto você não tem uma câmera IP dedicada.

### O que você vai precisar

- Notebook com a webcam Intelbras conectada via USB
- Software para transmitir o vídeo como câmera IP (RTSP ou MJPEG)
- O notebook deve estar ligado durante o evento para funcionar

### Opção A: FFmpeg (método mais simples, linha de comando)

O FFmpeg transforma a webcam em um stream de rede que o sistema consegue consumir.

**1. Instale o FFmpeg**

```
Acesse: https://ffmpeg.org/download.html
Baixe o instalador para Windows
Ou via chocolatey: choco install ffmpeg
```

**2. Descobrir o nome da sua webcam no Windows**

```cmd
ffmpeg -list_devices true -f dshow -i dummy 2>&1

rem Procure algo como:
rem [dshow] "Intelbras SC 200" (video)
rem Anote o nome exato entre aspas
```

**3. Iniciar o stream MJPEG**

```cmd
rem Substitua "Intelbras SC 200" pelo nome real da sua webcam
ffmpeg -f dshow -i video="Intelbras SC 200" ^
  -q:v 5 -r 15 -f mjpeg ^
  -listen 1 http://0.0.0.0:8080

rem O stream ficará disponível em: http://SEU-IP-LOCAL:8080
```

**4. Descobrir seu IP local para passar ao sistema**

```cmd
ipconfig

rem Procure: "Adaptador Ethernet" ou "Adaptador de LAN sem Fio"
rem Endereço IPv4: 192.168.1.XXX ← esse é o seu IP
```

**5. Testar o stream no navegador**

```
Abra o Chrome e acesse:
http://192.168.1.XXX:8080

Deve aparecer a imagem da webcam
```

**6. Cadastrar a webcam como câmera no sistema A2**

No painel do A2 Eventos → Dispositivos → Cadastrar:
```
Nome: "Webcam Teste - Notebook"
Marca: Genérica
Tipo: Câmera IP
IP Address: 192.168.1.XXX   ← IP do notebook com a webcam
Porta: 8080
URL do Stream: http://192.168.1.XXX:8080
```

### Opção B: OBS Studio com plugin RTSP (stream RTSP profissional)

O OBS permite criar um stream RTSP com qualidade melhor, igual a uma câmera IP real.

**1. Instale o OBS Studio**
```
Acesse: https://obsproject.com/
Baixe e instale a versão para Windows
```

**2. Instale o plugin obs-rtspserver**
```
Acesse: https://github.com/iamscottxu/obs-rtspserver/releases
Baixe o instalador .exe para Windows
Instale
Reinicie o OBS
```

**3. Configure no OBS**

```
a) Abra o OBS
b) Em "Fontes", clique em "+" → "Dispositivo de Captura de Vídeo"
c) Selecione sua webcam Intelbras
d) No menu: Ferramentas → obs-rtspserver
e) Configure:
   Porta: 8554
   URL: rtsp://0.0.0.0:8554/stream
f) Clique em "Iniciar"
```

**4. URL para usar no sistema**
```
rtsp://192.168.1.XXX:8554/stream
```

Cadastre no sistema A2 com essa URL RTSP.

### Opção C: iSpy (câmera IP completa com interface visual)

O iSpy é um software gratuito que transforma qualquer webcam em câmera IP com interface visual.

```
1. Baixe em: https://www.ispyconnect.com/
2. Instale e abra
3. Clique em "Adicionar" → "Câmera Web Local"
4. Selecione sua webcam Intelbras
5. Em "Configurações" → "Streaming" → habilite MJPEG
6. Anote a URL gerada (ex: http://localhost:8090/mjpegfeed)
7. Substitua localhost pelo IP do seu notebook
```

### Comparação das opções

| Opção | Dificuldade | Qualidade | Estabilidade |
|-------|------------|-----------|-------------|
| FFmpeg | Média (linha de comando) | Boa | Alta |
| OBS + Plugin | Baixa (interface visual) | Ótima | Alta |
| iSpy | Baixa (interface visual) | Boa | Média |

**Recomendação:** Use OBS para testes rápidos, FFmpeg para uso em produção (roda em background sem interface).

### Rodando o FFmpeg em background (sem janela)

Para deixar o stream rodando sem ocupar o terminal:

```cmd
rem Crie um arquivo "stream_webcam.bat" com o conteúdo:
@echo off
ffmpeg -f dshow -i video="Intelbras SC 200" ^
  -q:v 5 -r 15 -f mjpeg ^
  -listen 1 http://0.0.0.0:8080

rem Salve e execute. Para parar, feche a janela.
```

---

## 10. CENÁRIOS DE REDE POR TIPO DE LOCAL

### Cenário A: Local com infraestrutura (switch disponível)

```
[Leitor 1] ─────┐
[Leitor 2] ──── [Switch] ──── [Modem] ──── Internet
[Webcam PC] ────┘
[Notebook] ─────┘

IPs: 192.168.1.17, 192.168.1.18, etc.
```

**Configuração:**
- Todos os dispositivos no mesmo switch
- Conectam ao modem via switch
- Use IPs estáticos fora da faixa DHCP do modem

### Cenário B: Sem switch, direto no modem

```
[Modem] ──── [Leitor 1]  (cabo direto na porta LAN 1)
       ──── [Notebook]   (cabo direto na porta LAN 2)
       ~~── [Leitor 2]   (WiFi)
```

Modems domésticos têm 4 portas LAN. Você pode conectar até 4 dispositivos direto no modem sem switch.

**Configuração:**
- Mesmo processo, IPs estáticos para cada leitor
- Se precisar de mais de 4 dispositivos com cabo, use um switch pequeno (5 portas, barato em qualquer loja de informática)

### Cenário C: Modem de chip 4G (sem banda larga fixa)

Muito comum em eventos em locais sem infraestrutura.

```
[Chip 4G] → [Modem WiFi portátil] ~~WiFi~~ [Leitor(es)]
                                  ~~WiFi~~ [Notebook]
                                  ──LAN──  [Leitor fixo]
```

**Atenção com modem de chip:**
- IP público muda a cada reconexão (IP dinâmico da operadora)
- Para Port Forwarding, isso é um problema (use DDNS ou webhook)
- Faixa interna costuma ser `192.168.0.X` ou `192.168.8.X`
- Verifique no painel do modem qual a faixa DHCP usada

**Configuração:**
```
1. Conecte no painel do modem: http://192.168.8.1 (ou 192.168.0.1)
2. Veja a faixa DHCP (ex: 192.168.8.100 a 192.168.8.200)
3. Configure o leitor com IP fora dessa faixa (ex: 192.168.8.17)
4. Configure o webhook do leitor para painel.nzt.app.br
5. ✅ Comunicação funciona via webhook, independente do IP público do chip
```

### Cenário D: Múltiplos eventos simultâneos, cada um com seu modem

Nesse cenário, cada evento tem sua própria rede local isolada:

```
EVENTO 1 (Galpão A)          EVENTO 2 (Galpão B)
────────────────────          ────────────────────
Modem 1 (192.168.1.X)        Modem 2 (192.168.2.X)
  └─ Leitor A (IP .17)         └─ Leitor B (IP .17)
  └─ Leitor B (IP .18)         └─ Leitor C (IP .18)

Ambos enviam webhooks para: painel.nzt.app.br
```

**Importante:** Você pode ter leitores com o mesmo IP privado (ex: `192.168.1.17`) em redes diferentes — não há conflito, porque cada rede é isolada. O sistema identifica o leitor pelo ID cadastrado no sistema A2, não pelo IP.

**Mas atenção:** Cadastre cada leitor com o IP correto para o evento correspondente. Se trocar o leitor de local, atualize o IP no sistema.

---

## 11. CHECKLIST POR EVENTO

Use este checklist antes de cada evento para garantir que os leitores estão funcionando.

### Dia anterior ao evento

```
□ Confirmar que todos os leitores estão com firmware atualizado
□ Conferir que o IP de cada leitor está configurado como estático
□ Confirmar credenciais (usuário/senha) de cada leitor
□ Acessar painel web de cada leitor (http://IP) — confirmar acesso
□ Verificar que RTSP e HTTP API estão habilitados
□ Verificar que Webhook está configurado para painel.nzt.app.br/api/intelbras/webhook
□ No sistema A2: todos os leitores cadastrados nas áreas corretas
□ Fazer Testar Conexão no sistema A2 para cada leitor → deve dar ✅
□ Confirmar que as pessoas/colaboradores têm fotos cadastradas e aprovadas
```

### No dia do evento (1-2 horas antes)

```
□ Ligar os leitores
□ Aguardar 2 minutos para inicialização completa
□ Ping em cada leitor (confirmar que estão na rede)
□ Fazer Snapshot de cada leitor no painel A2 — confirmar que a câmera está viva
□ Teste real: aproximar rosto cadastrado do leitor — confirmar check-in registrado
□ Teste de bloqueio: aproximar rosto de pessoa não cadastrada — confirmar negado
□ Verificar logs no sistema A2 — acessos aparecem em tempo real?
```

### Script de verificação rápida (rodar no notebook no local)

```cmd
@echo off
echo ====== VERIFICAÇÃO DE LEITORES ======

echo Testando Leitor 1 (Entrada Principal)...
ping -n 3 192.168.1.17
echo.

echo Testando Leitor 2 (Backstage)...
ping -n 3 192.168.1.18
echo.

echo Testando Leitor 3 (VIP)...
ping -n 3 192.168.1.19
echo.

echo Verificação concluída.
pause
```

---

## 12. TROUBLESHOOTING RÁPIDO

### ❌ "Testar Conexão" retorna erro no sistema A2

**Diagnóstico passo a passo:**
```
1. Você está na mesma rede do leitor?
   → O sistema A2 roda na nuvem, não na rede local
   → Para "Testar Conexão" funcionar, o leitor precisa ser acessível da internet
   → Configure Webhook (seção 7) ou Port Forwarding (seção 8)

2. Verifique se o leitor responde:
   ping 192.168.1.17     (do notebook na mesma rede)

3. Verifique se a interface web do leitor abre:
   → Abra http://192.168.1.17 no navegador

4. Se abre no navegador mas o sistema A2 não conecta:
   → Problema de firewall no VPS ou no modem
   → Verifique Port Forwarding (seção 8)
```

### ❌ Leitor não aparece na rede (ping não responde)

```
Verificações:
□ Leitor está ligado? (LED de rede piscando na traseira)
□ Cabo de rede está bem encaixado nos dois lados?
□ Se WiFi: está conectado à rede certa? Veja na tela do leitor
□ IP está correto? Veja o IP atual na tela do leitor (Menu → Rede)
□ O notebook está na mesma rede que o leitor?

Solução se IP errado:
→ Conecte um cabo direto do notebook ao leitor
→ Configure seu notebook com IP fixo 192.168.1.100
→ Acesse http://192.168.1.64 (IP padrão de fábrica)
→ Reconfigure o IP correto
```

### ❌ Leitor reconhece o rosto mas não registra no sistema

```
O webhook pode não estar chegando. Verifique:

1. O leitor está conseguindo acessar a internet?
   → No painel do leitor, acesse: Diagnóstico → Ping para 8.8.8.8
   → Se não pinga: problema na saída de internet do modem

2. O webhook está configurado com URL correta?
   → https://painel.nzt.app.br/api/intelbras/webhook
   → Deve ser HTTPS, não HTTP

3. Teste manual do webhook:
   curl -X POST https://painel.nzt.app.br/api/intelbras/webhook \
     -H "Content-Type: application/json" \
     -d '{"test":true}'
   → Deve retornar 200

4. Ver logs do sistema:
   docker logs a2-eventos-api 2>&1 | grep webhook | tail -20
```

### ❌ Leitor não reconhece o rosto / Reconhece com confiança baixa

```
Causas possíveis:

□ Foto do cadastro tem baixa qualidade
   → Substituir por foto mais nítida, com rosto centralizado
   → Iluminação adequada na foto

□ Iluminação ruim no local do leitor
   → Leitor precisa de boa iluminação frontal no rosto
   → Evitar contraluz (luz forte atrás da pessoa)

□ Ângulo do leitor errado
   → Câmera deve estar na altura dos olhos ou levemente abaixo
   → Pessoa não deve ter que abaixar ou erguer muito o pescoço

□ Threshold de confiança muito alto
   → No sistema A2: Configurações → Biometria → Confiança Mínima
   → Padrão: 75%. Pode reduzir para 65% em ambientes difíceis
```

### ❌ Webcam não aparece como câmera IP

```
Verificações:
□ O FFmpeg/OBS está rodando no notebook?
□ O notebook está na mesma rede que o sistema vai acessar?
□ A porta 8080 está aberta no firewall do Windows?

Liberar porta no Windows Firewall:
netsh advfirewall firewall add rule ^
  name="Webcam Stream" ^
  dir=in action=allow ^
  protocol=TCP localport=8080

Testar se o stream está ativo:
  Abra http://localhost:8080 no navegador do notebook
  Se aparecer a imagem: stream OK, problema é acesso externo
```

---

## REFERÊNCIAS RÁPIDAS

### IPs e Portas Padrão

| Equipamento | IP Padrão de Fábrica | Porta | Usuário | Senha |
|-------------|---------------------|-------|---------|-------|
| Bio-T SS 5541 MF W | 192.168.1.64 | 80 | admin | admin |
| Webcam (via FFmpeg) | IP do notebook | 8080 | — | — |
| Webcam (via OBS RTSP) | IP do notebook | 8554 | — | — |

### Portas que precisam estar abertas

| Porta | Protocolo | Para quê |
|-------|-----------|---------|
| 80 | TCP | Interface web do leitor |
| 554 | TCP | Stream RTSP do leitor |
| 443 | TCP | Webhook para o sistema (HTTPS) |
| 8080 | TCP | Webcam stream MJPEG (se usar) |
| 8554 | TCP | Webcam stream RTSP via OBS (se usar) |

### Guias complementares neste projeto

- [GUIA_INTELBRAS_BIOTSS5541.md](../../GUIA_INTELBRAS_BIOTSS5541.md) — Configuração detalhada via Ethernet
- [GUIA_INTELBRAS_WIFI.md](../../GUIA_INTELBRAS_WIFI.md) — Configuração detalhada via WiFi
- [hardware-integration/manuals/](../hardware-integration/manuals/) — Manuais PDF dos fabricantes

---

**Suporte Intelbras:** 0800 7284 788 (horário comercial)  
**Documentação Intelbras:** portal.intelbras.com.br  
**Última atualização:** 2026-04-30
