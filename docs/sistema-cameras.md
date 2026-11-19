# Sistema de câmeras, leitores e IA facial — descritivo técnico

**Para quem é:** quem vai analisar o sistema para decidir melhorias ou mudanças conforme o cenário do evento.
**Estado:** descrição do código como está em 19/11/2026 (commit `77aa7b6` e anteriores).
**Como ler:** a seção 1 mostra o mapa geral. As seções 2 a 6 descrevem cada peça. A seção 7 segue um dado do início ao fim. A seção 9 lista o que hoje limita o sistema e pontos onde dá para mexer.

---

## 0. Resumo em uma página

O sistema tem **três computadores ou serviços** que conversam entre si:

| Peça | Onde roda | O que faz |
|---|---|---|
| **API (VPS)** | Servidor na nuvem (Hostinger), `backend/api-nodejs` | Cadastro de câmeras e leitores, permissões, watchlist, relatórios, painel. Fala com o banco Supabase. |
| **Agente local** | PC do evento (Windows), `backend/agent-local` | Ponte entre a rede do evento e a VPS. Hospeda o **retransmissor de vídeo** (go2rtc), a **gravação**, a **Central de Monitoramento** e repassa tudo o que a IA encontra. |
| **Motor de IA** | PC do evento, `backend/microservice-face-python` (FastAPI em `127.0.0.1:8000`) | Lê o vídeo, acha rostos, reconhece pessoas cadastradas e gera detecções. Usa a GPU (DirectML ou CUDA). |

Além disso há o **painel** (`frontend/web-admin`, React) que a equipe usa no navegador, a **Central de Monitoramento local** (página servida pelo agente, em `http://localhost:8766/central/`) e os **leitores faciais Intelbras/Hikvision** (catracas e portarias), que podem ser cadastrados também como câmera.

Princípio central: **o vídeo fica na rede do evento**. A VPS só recebe alertas, metadados e, quando preciso, trechos pequenos. A imagem vai para o navegador direto do PC do evento quando o navegador está nele (ou na rede local, se liberado).

---

## 1. Mapa geral e fluxo de dados

```
                         ┌──────────────── NUVEM (Hostinger VPS) ────────────────┐
                         │  API Node (api-nodejs)                                  │
  Supabase (Postgres) ◄──┤  • cameras_ip, dispositivos_acesso, pessoas, watchlist  │
                         │  • biometria p/ IA (biometriaAgente.service.js)         │
                         │  • vigilância (vigilancia.service.js)                   │
                         │  • gravação: metadados (gravacao.service.js)            │
                         └───────▲─────────────────────────────▲──────────────────┘
                                 │ Socket.IO (WebSocket)        │ HTTPS (painel)
                                 │ comandos, rostos, detecções  │
  ┌──────────────── PC DO EVENTO (Windows) ──────────────────────┼────────────────────┐
  │                              │                                │                   │
  │  AGENTE LOCAL (agent-local)  │                                │                   │
  │   ├─ video.js ── go2rtc ─────┼── RTSP ◄── câmeras IP (Mercusys, Intelbras...)     │
  │   │      :1984 API, :8555 RTSP, :8557 WebRTC ◄── webcam USB (ffmpeg/dshow)        │
  │   ├─ gravador.js ── lê o go2rtc ── grava MP4 em NZT-Gravacoes\                      │
  │   ├─ visor-local.js :8766 ── WebRTC / MP4 / caixas / Central (/central/)           │
  │   └─ agent.js ── comandos da VPS, rostos p/ motor, detecções p/ VPS                │
  │            │  HTTP 127.0.0.1:8000 (chave X-IA-Chave)                                │
  │            ▼                                                                        │
  │  MOTOR DE IA (microservice-face-python, FastAPI)                                    │
  │   ├─ Leitor (1 thread por fonte RTSP) ── último quadro                              │
  │   ├─ Escalonador (1 thread) ── escolhe a câmera mais atrasada                       │
  │   ├─ SCRFD (detecção) → Rastreador → ArcFace (512-D) → índice FAISS por evento      │
  │   └─ Detecções (fila) ── /api/vigilancia/deteccoes ── agente ── VPS                 │
  │                                                                                     │
  │  NAVEGADOR no PC do evento:  Central (localhost:8766)  ou  painel (nuvem)           │
  └─────────────────────────────────────────────────────────────────────────────────────┘
```

Caminhos do vídeo, do mais direto para o mais longo:

1. **Central local (navegador no PC do evento):** câmera → go2rtc → WebRTC → tela. Sem internet. Atraso de dezenas de milissegundos.
2. **Painel no PC do evento, com permissão de rede local do Chrome:** igual ao 1, pelo visor local.
3. **Painel de fora do evento (ou sem permissão):** câmera → go2rtc → agente → Socket.IO → VPS → HTTPS → navegador, em MP4 fragmentado. Atraso de segundos.

Caminho da IA: câmera → go2rtc (RTSP local) → Leitor do motor → SCRFD/ArcFace → detecção → fila do agente → VPS → painel/alertas.

---

## 2. Câmeras IP e leitores faciais

### 2.1 Tipos de equipamento

| Tipo | Como entra no sistema | Tabela/campo | Observações |
|---|---|---|---|
| **Câmera IP** (Mercusys, Tapo, Intelbras, Hikvision, Dahua) | Cadastro no painel com `stream_url` (RTSP) | `cameras_ip` | Usa RTSP. Pode ter **sub-stream** (`url_substream`) menor, para IA e miniaturas. |
| **Leitor facial/biométrico** (Intelbras, Hikvision) | Cadastro em dispositivos de acesso com IP, usuário e senha | `dispositivos_acesso` (campo `config` em JSON) | Serve para catraca/portaria. Pode **também** virar câmera (ver 2.3). |
| **Webcam USB** (do PC do evento) | Cadastro com `stream_url = webcam` (ou `webcam:1`, `usb:0`) | `cameras_ip` | Lida pelo ffmpeg (DirectShow), no próprio PC. Sem sub-stream. |
| **OBS local** (legado) | `rtsp://127.0.0.1:8554` | `cameras_ip` | Se o OBS não responde, o agente cai para a webcam direta (`origemDaCamera` em `video.js`). |

### 2.2 Campos da câmera (`cameras_ip`)

Campos relevantes (migrations em `supabase/migrations`):

- `stream_url`: RTSP principal. Ex.: `rtsp://usuario:senha@192.168.1.88:554/stream1`.
- `url_substream`: RTSP do sub-stream (opcional). Se vazio, o agente tenta **derivar** pelo padrão da marca (`derivarSubstream` em `video.js`).
- `ia_ativa` (padrão `true`): reconhecimento facial nesta câmera.
- `vigilancia_ativa` (padrão `true`): IA 24 h, mesmo com o painel fechado.
- `prioridade`: 0 baixa, 1 normal, 2 alta, 3 crítica (o escalonador da IA usa isso).
- `gravacao_modo`: `desligada` · `continua` · `alertas`.
- `gravacao_stream`: `sub` (leve) ou `principal` (nítido).
- `gravacao_drive`: copia os trechos de alerta ao Drive.
- `camera_ids`, `dispositivo_id`: vínculos com estações e leitores.
- `ia_onde` (no evento): `local` (este PC), `auto` (o PC tenta o servidor central e cai para local) ou `direto_servidor` (o servidor central analisa; ver seção 9).

Tabelas relacionadas: `cameras_evento_config` (chaves do evento: motor ligado, gravação, limites), `gravacoes` e `gravacoes_acessos` (metadados e quem baixou), `servidores_ia` (servidores de IA central), `sessoes_operador` (estação de check-in/check-out com câmera ou leitor).

### 2.3 Leitor usado também como câmera

`backend/api-nodejs/src/modules/devices/leitorCamera.service.js`:

- Se o leitor tem `config.usar_como_camera`, o sistema cria uma câmera em `cameras_ip` ligada ao leitor (`dispositivo_id`).
- O RTSP é montado pela marca:
  - Hikvision: `/Streaming/Channels/<canal*100+1>`.
  - Intelbras/Dahua (padrão): `/cam/realmonitor?channel=<canal>&subtype=0`.
  - Porta padrão 554; caminho customizado pode ser informado em `config.rtsp_caminho`.
- A câmera nasce com "só monitorar" e sem gravação. IA e gravação são escolhidas depois, como qualquer câmera.
- Desligar a opção remove a câmera. Excluir o leitor também remove (cascade).

Trecho de `urlRtsp`:

```js
const caminhoPadrao = marca.includes('hik')
    ? `/Streaming/Channels/${canal * 100 + 1}`
    : `/cam/realmonitor?channel=${canal}&subtype=0`; // Intelbras/Dahua
return `rtsp://${auth}${d.ip_address}:${rtspPorta}${caminho}`;
```

### 2.4 Leitores como fonte de confirmação da IA

- O campo `config.ia_confirmacao` de um leitor faz com que a catraca só libere depois que a IA confirma a foto da pessoa.
- Quando há pelo menos um leitor com essa opção, o agente liga o motor mesmo sem câmera com IA (`vigilancia_configurar` em `agent.js`: `precisa = ... || evento.leitores_ia > 0`).

---

## 3. Agente local (`backend/agent-local`)

Processo Node.js que roda no PC do evento. Arquivos:

| Arquivo | Função |
|---|---|
| `src/agent.js` | Conexão Socket.IO com a VPS, comandos, sincronização de rostos e detecções, saúde do vídeo, fila de detecções em disco. |
| `src/video.js` | Retransmissor go2rtc: gera o `go2rtc.yaml`, configura câmeras, abre WebRTC, MP4, snapshot e MJPEG. |
| `src/gravador.js` | Gravação em MP4 no PC (contínua e em alertas). |
| `src/visor-local.js` | Servidor HTTP em `127.0.0.1:8766` (porta `VISOR_LOCAL_PORTA`). Vídeo para o painel no PC do evento e a Central. |
| `src/central.js` + `central/` | Central de Monitoramento (página, API, sessões, watchlist local). |
| `bin/` | `go2rtc.exe`, `ffmpeg.exe`, `go2rtc.yaml` (gerado). Baixados pelo `ligar-ia-facial.bat`. |

### 3.1 Comandos que a VPS envia ao agente (`handlers` em `agent.js`)

| Comando | O que faz |
|---|---|
| `vigilancia_configurar` | Recebe câmeras e chaves do evento. Configura o retransmissor, liga/desliga o motor, envia a lista ao motor, configura a gravação. Salva em `.config-cameras.json` para o PC religado aplicar sozinho. |
| `ia_config` / `ia_status` / `ia_iniciar` / `ia_post` / `ia` | Ajustes e consultas ao motor. |
| `motor_definir` | Liga ou desliga o motor (o interruptor do painel manda). |
| `video_iniciar` / `video_parar` | Vídeo para o painel por socket (modo antigo, sem o visor). |
| `snapshot_local` | Uma imagem JPEG de uma câmera (miniaturas, quando não há visor). |
| `camera_testar` | Testa o RTSP de uma câmera. |
| `gravacao_marcar` / `gravacao_ler` / `gravacao_status` | Marca alertas na gravação, entrega trechos ao painel, status. |
| `http` / `cgi` | Requisições a equipamentos na rede (leitores Intelbras). |
| `ping` | Diagnóstico. |

### 3.2 Eventos que o agente emite à VPS

| Evento | Quando | Conteúdo |
|---|---|---|
| `agent:ready` | Ao conectar | Capacidades do PC: `video_local`, `ffmpeg`, `gravacao`, `rostos_pelo_agente`. |
| `agent:rostos` (pedido) | A cada 60 s | `modo: 'ids'` (lista completa, a cada 15 min), `'desde'` (o que mudou), `'pessoas'` (dados), `'watchlist'` (alvos). |
| `agent:deteccao` | Cada detecção da IA | Pessoa reconhecida, câmera, cena (JPEG anotado). Vai para a fila em disco se a conexão cair. |
| `agent:saude` | A cada 10 s | FPS, reconexões, resolução e tempo de IA por câmera. |
| `agent:gravacao` / `agent:gravacao_apagadas` | Ao gravar ou apagar trechos | Metadados de gravação. |
| `agent:ia_reconhecer` | Modo `auto` (servidor central) | Rosto alinhado 112×112 para o servidor de IA central. |

### 3.3 Arquivos de estado (no PC do evento, gitignored)

- `.config-cameras.json`: última configuração recebida (câmeras, evento, gravação).
- `.deteccoes-pendentes.json`: fila de detecções ainda não entregues.
- `.estado.json`: contadores e cursores (`desde`, `inicio`).
- `.motor-desligado`: marca que o painel desligou o motor.
- `.central-chave`, `.central-alvos.json`: acesso à Central e lista de alvos (ver seção 6).
- `.gravacoes-reportadas.json`: trechos já informados à VPS.

---

## 4. Retransmissor de vídeo (`video.js` + go2rtc)

### 4.1 O que é

O **go2rtc** (binário em `bin/`) é o único processo que **abre conexão com as câmeras**. Todas as outras partes (motor, gravador, navegador) leem dele. Assim cada câmera recebe **uma** conexão RTSP, o que importa porque câmeras baratas aceitam poucas conexões ao mesmo tempo.

Portas (locais, só `127.0.0.1`, exceto a de mídia WebRTC):

| Porta | Uso |
|---|---|
| `1984` | API do go2rtc (com usuário e senha, `local_auth: true`) |
| `8555` | RTSP local (usado pelo motor e pelo gravador) |
| `8557` | Mídia WebRTC (UDP/TCP). Só transporta vídeo; a negociação passa pela API. |

Usuário e senha do go2rtc são gerados pelo agente e gravados em `bin/go2rtc.yaml` (permissão 0600). Nunca aparecem nos logs (`registrar` mascara `//usuario:senha@`).

### 4.2 Como o `go2rtc.yaml` é gerado (`escreverConfig`)

Para cada câmera são criados **três streams**:

```yaml
streams:
  c_<id>:          "rtsp://.../stream1"          # principal (copiado, sem recodificar)
  c_<id>_sub:      "rtsp://.../stream2"          # sub-stream (se existir)
  c_<id>_jpeg:     "ffmpeg:c_<id>_sub#video=mjpeg"   # JPEG sob demanda (snapshots/reserva)
```

Webcam USB vira um stream que o ffmpeg abre no DirectShow e codifica em H.264:

```yaml
c_<id>: "ffmpeg:device?video=0&rtbufsize=256M&pixel_format=nv12#video=h264#raw=-vf scale=1280:-2,fps=30"
```

Parâmetros de codificação do H.264 (quando o go2rtc precisa recodificar, como na webcam). A escolha do encoder é automática (`obterEncoderH264`: NVENC se houver, depois AMF, senão libx264):

```
NVENC : -c:v h264_nvenc -preset p1 -tune ull -b:v 1800k -maxrate 2500k -g 30 -bf 0
AMF   : -c:v h264_amf -b:v 1800k -g 30 -bf 0
x264  : -c:v libx264 -preset ultrafast -tune zerolatency -crf 26 -maxrate 1200k -g 30 -keyint_min 30 -bf 0
```

`-g 30` (quadro-chave a cada 1 s) e `-bf 0` (sem quadros B) fazem o navegador conseguir avançar sem esperar muito.

### 4.3 Ciclo de vida

- `configurarCameras(lista)`: monta o conjunto de streams e calcula uma **assinatura** (SHA-256). Se a assinatura mudou, reinicia o go2rtc (1,5 s de espera para agrupar mudanças). Se não mudou, nada acontece. Quem estava assistindo reconecta sozinho.
- `iniciarProcesso`: sobe o go2rtc com `-config`, espera a API responder e marca `pronto`. Se cair, reabre com espera crescente (2 s, 4 s... até 30 s).
- `encerrarProcesso`: no Windows usa `taskkill /T /F` para derrubar também o ffmpeg filho (senão ele segura a webcam).
- `encerrarOrfaos`: ao iniciar, mata go2rtc ou ffmpeg que sobraram de uma execução anterior.

### 4.4 Formatos entregues ao navegador

| Função | Uso | Latência típica |
|---|---|---|
| `abrirWebrtc(id, qualidade, sdp)` | Ao vivo (Central e visor). Negocia com `POST /api/webrtc`. | **~25–30 ms** de buffer |
| `abrirMp4(id, qualidade)` | Reserva ao vivo (MP4 fragmentado). Usado pelo painel quando o WebRTC não abre. | ~2 s |
| `abrirMjpeg(id)` | Reserva para navegador que não toca MP4 (exige ffmpeg). | ~1 s, mais banda |
| `snapshot(id, qualidade)` | Uma imagem JPEG (miniaturas quando não há visor). | sob demanda |

`qualidade`: `foco` = stream principal (tela grande); `mini` = sub-stream, se existir (miniaturas, grade).

### 4.5 Medidas feitas nesta conversa (PC do evento)

| Câmera | Stream | Resolução | FPS medido | Maior intervalo entre quadros (20 s) |
|---|---|---|---|---|
| Mercusys MC210 | principal (`stream1`) | 2304×1296 | 14,6 | 0,08 s |
| Mercusys MC210 | sub (`stream2`) | 1280×720 | 13,7 | 0,12 s |
| Webcam USB (via ffmpeg/H.264) | `c_2dff...` | 1280×720 | 28,9 | 0,03 s |

Decodificação dos 4 MP da Mercusys no OpenCV: 0,35 s de CPU por segundo e 15,8 fps em CPU; 0,32 s de CPU por segundo e 17,6 fps com `CAP_PROP_HW_ACCELERATION`. A aceleração por GPU reduziu pouco o custo nesse teste.

---

## 5. Motor de IA (`microservice-face-python`)

### 5.1 Stack

- **FastAPI + Uvicorn** em `127.0.0.1:8000`. Só aceita chamadas com o cabeçalho `X-IA-Chave` (chave em `.chave-interna`, criada na primeira execução).
- **InsightFace `buffalo_l`**: detector **SCRFD 10G** (localizar rostos) e **ArcFace 512-D** (vetor de identidade), em ONNX.
- **Aceleração:** DirectML (qualquer GPU Windows) ou CUDA, conforme `IA_GPU` (`auto` por padrão; `off` força CPU). O `/api/engine/status` informa qual está ativa.
- **Índice vetorial:** um índice por evento (FAISS `IndexFlatIP`, produto interno sobre vetores normalizados, ou seja, similaridade de cosseno). Cada pessoa pode ter até 5 vetores aprendidos ao vivo (`aprender: True`).

### 5.2 Perfis (`PERFIS`) e ajustes comuns (`COMUNS`)

| Ajuste | leve | equilibrado (padrão) | máximo |
|---|---|---|---|
| `ia_fps_total` (análises/s do motor inteiro) | 15 | 30 | 60 |
| `ia_fps_foco` (câmera em tela grande) | 6 | 10 | 25 |
| `ia_fps_mini` (câmera em miniatura) | 3 | 4 | 12 |
| `ia_fps_vigilancia` (ninguém assistindo, só movimento) | 2 | 3 | 6 |
| `det_size` (entrada do detector) | 480 | 640 | 640 |
| `ia_stream` (de onde a IA lê) | `sub` | `sub` | `sub` (desde 19/11; `auto`/`principal` só com `IA_STREAM_DIAGNOSTICO=1`) |
| `limiar` (similaridade mínima) | 0,50 | 0,48 | 0,46 |
| `margem` (diferença para o 2º candidato) | 0,06 | 0,06 | 0,05 |
| `confirmacoes` (quadros para confirmar) | 2 | 2 | 2 |
| `video_fps_max` (leitura de quadros por câmera) | 12 | 15 | 30 |

Comuns a todos:

- `min_face_px` = 36 (rosto menor que isso é "distante").
- `min_det_score` = 0,60 (confiança do detector).
- `min_nitidez` = 25,0 (variância do Laplaciano no rosto 112×112; abaixo é borrado).
- `max_yaw` = 45° (rosto virado demais não é reconhecido).
- `reconhecer_s` = 1,0 (mesmo rosto rastreado é reconhecido de novo a cada 1 s).
- `movimento` = True, `movimento_limiar` = 0,004, `movimento_janela_s` = 3,0, `cena_parada_s` = 2,0 (câmera parada sem espectador: a IA dorme).
- `vigilancia_repetir_s` = 30 (a mesma pessoa na mesma câmera gera detecção no máximo a cada 30 s).
- `alerta_min_face_px` = 64 e `alerta_limiar` = 0,55 (desde 19/11): para **disparar alerta** (watchlist ou bloqueado), o rosto precisa ter pelo menos 64 px e a semelhança pelo menos 55%. Abaixo disso a pessoa continua reconhecida e contada, mas sai como "possível" (amarelo, sem alarme). O motor manda `matched_person.alerta_ok` e `rosto_px`.

Ajustes mudam ao vivo com `POST /api/config`. Os limites aceitos estão em `FAIXAS`.

### 5.3 Câmeras no motor (classes `Camera`, `Leitor`, `Rastreador`)

**`Leitor`:** uma thread por fonte RTSP (ou webcam). Guarda **só o quadro mais recente** (`quadro`, `seq`, `quadro_ts`). Chama `grab()` em todo quadro e `retrieve()` só no ritmo de `video_fps_max`. **Atenção:** no OpenCV com FFmpeg, a decodificação do H.264 acontece no `grab()`; o `retrieve()` só converte a cor. Ou seja, o motor **decodifica todos os quadros** de toda fonte aberta, mesmo os que não analisa. Reduzir o custo exige um stream menor na origem (sub-stream em resolução e fps menores), e não um `retrieve()` mais espaçado.

Opções de abertura do FFmpeg (definidas uma vez, valem para todas as câmeras):

```python
os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp|fflags;nobuffer|flags;low_delay|max_delay;500000"
```

TCP para o RTSP (mais estável na rede do evento), sem buffer, baixa latência.

**`Camera`:** estado da câmera (`camera_id`, `evento_id`, `prioridade`, `vigilancia`, `ia_ativa`, último resultado, `uso_foco`/`uso_mini` com a hora de quem está assistindo).

**`intervalo_ia(agora)`** decide quando analisar a câmera:

- Sem espectador e sem vigilância: não analisa.
- Com espectador (foco ou mini): intervalo = 1 / `ia_fps_foco` ou `ia_fps_mini`.
- Só vigilância: 1 / `ia_fps_vigilancia`, e só se houve movimento nos últimos 3 s.
- Cena parada com espectador: no máximo 1 análise a cada 2 s, mas se há rosto na tela, mantém o ritmo normal (o quadrado não pisca).

**`fonte_ia(cam)`** escolhe de qual stream a IA lê, conforme `ia_stream`:

- `sub`: sempre o sub-stream (leve).
- `auto`: o principal se alguém assiste em tela grande; senão o sub.
- `principal`: sempre o principal (mais nítido, mais caro).

**Zelador (a cada 10 s):** garante os leitores de vigilância, desliga leitores sem uso há 120 s, remove câmeras sem uso há 1 h da memória.

### 5.4 Escalonador (`_escalonador`)

Uma única thread decide qual câmera analisar a cada passo:

1. Para cada câmera com intervalo definido, calcula o **atraso** = (agora − última análise) / intervalo. Só entra quem tem atraso ≥ 1.
2. **Nota** = atraso × (1 + 0,5 × prioridade). A câmera com maior nota é escolhida.
3. Lê o quadro mais recente da fonte escolhida. Se não há quadro novo, tenta de novo em meio intervalo.
4. Analisa (`analisar`). Depois dorme o que sobrar do orçamento global (1 / `ia_fps_total`).
5. Mantém estatísticas: `ocupacao` (fração do orçamento usada) e `ia_ms` (tempo médio de análise).

Isso faz o motor respeitar um teto total de análises por segundo, independente do número de câmeras, e priorizar câmeras atrasadas e de maior prioridade.

### 5.5 Análise de um quadro (`analisar`)

```
quadro
  │
  ├─ detectar (SCRFD, entrada det_size)  → rostos (caixa, score, pontos-chave)
  │
  ├─ Rastreador (IoU com rastros anteriores) → cada rosto ganha um "track_id" estável
  │     (rastro some depois de 2,5 s sem ser visto)
  │
  ├─ Qualidade: min_face_px, min_det_score, nitidez, yaw → status
  │     (optimal · profile_view · low_resolution · blurry)
  │
  ├─ Para rosto de qualidade boa e que precisa de (novo) reconhecimento:
  │     alinhar 112×112 → ArcFace → vetor 512-D
  │     busca no índice do evento: melhor (s1) e segunda (s2)
  │     aceita se s1 ≥ limiar  E  (s1 − s2) ≥ margem
  │     exige `confirmacoes` quadros seguidos com a mesma pessoa
  │
  ├─ Modo remoto (ia_onde = auto): se o servidor central responde em 2,5 s, a
  │     decisão vem de lá; senão este PC reconhece sozinho (reserva de 30 s)
  │
  ├─ aplicar_reconhecimento → rastro recebe matched_person
  │
  └─ registrar_deteccoes → pessoa confirmada vira detecção
        (no máximo 1 a cada 30 s por pessoa e câmera; cena JPEG de 640 px)
```

`diagnostico_comparacao` guarda o motivo de cada decisão (`reconhecido`, `sem_cadastro_no_evento`, `abaixo_do_limiar`, `margem_insuficiente`) e a melhor e a segunda similaridade. Isso aparece em `/api/engine/status` e ajuda a afinar limiar e margem.

### 5.6 Cadastro de rostos (biometrias)

- O motor **não fala com o banco** no modo normal. Quem entrega as pessoas é a VPS, pelo agente: `POST /api/rostos` com `{completo: true, ids}` (lista completa, a cada 15 min) ou `{pessoas: [...]}` (o que mudou, a cada 60 s).
- Cada pessoa leva `id`, `nome`, `cpf`, `status_acesso`, `bloqueado`, `foto_url`, `face_encoding` (512 valores) e `evento_id`.
- O agente **carimba o `evento_id`** ao repassar (`comEventoDoAgente`). O motor só põe a pessoa no índice de um evento que tem o mesmo `evento_id` da câmera.
- Se o motor não tem vetor (`face_encoding` nulo), ele tenta gerar a partir da foto (`sincronizar_biometrias_pendentes`, só para fotos do armazenamento do sistema).
- **Watchlist:** a VPS inclui na lista do evento as pessoas de **outro** evento que estão na watchlist ativa, e nunca duplica uma pessoa que já está no evento (duplicar zera a margem; isso foi um bug corrigido).

### 5.7 Vigilância (detecções para a VPS)

- `POST /api/vigilancia`: recebe a lista de câmeras (com `camera_id`, `evento_id`, `stream_url`, `ia_ativa`, `vigilancia_ativa`, `prioridade`, `url_substream`). Motor sem essa lista não analisa nada.
- `GET /api/vigilancia/deteccoes?desde=N&max_idade_s=M`: devolve as detecções com `seq > N` e menos de M segundos de idade, e o carimbo `inicio` (para o agente saber se o motor reiniciou).
- O agente consulta a cada 1 s, guarda em `filaDeteccoes`, entrega à VPS (`agent:deteccao`) e só então avança o cursor. Se a VPS está fora, a fila fica em disco.

### 5.8 Endpoints do motor

| Método e caminho | Uso |
|---|---|
| `GET /health` | Status, GPU, base carregada. Usado pelo vigia do `ligar-ia-facial`. |
| `GET /api/engine/status` | Estado completo: câmeras, FPS, IA por câmera, perfil, `ocupacao`, `rostos_por_evento`. Alimenta a aba Saúde. |
| `GET /api/config` / `POST /api/config` | Ler e alterar perfil e ajustes ao vivo. |
| `POST /api/vigilancia` | Recebe a lista de câmeras do evento. |
| `GET /api/vigilancia/deteccoes` | Detecções para o agente. |
| `POST /api/rostos` | Recebe biometrias (completo ou incremental). |
| `GET /api/track/live` | Caixas da IA de **uma** câmera (marca como assistida). |
| `POST /api/track/lote` | Caixas de **várias** câmeras numa chamada (usado pela Central). |
| `GET /api/camera/snapshot` / `GET /api/camera/stream` | JPEG e MJPEG direto do motor (com caixas desenhadas). |
| `GET /api/camera/test` | Testa o RTSP de uma câmera. |
| `POST /api/extract` / `POST /api/verificar` | Extrai vetor de uma foto e verifica uma pessoa (cadastro e confirmação). |
| `POST /api/remoto/*` | Modo `auto`: troca rostos com o servidor central. |
| `POST /api/central/*` | Modo de servidor central (`ia-servidor/`): rostos, reconhecimento, descarga, status. |
| `GET /api/pc-compatibilidade` | Diagnóstico do PC (GPU, drivers, versões). |

### 5.9 Motor de IA central (`backend/ia-servidor`)

Modo para eventos grandes ou quando o PC do evento é fraco: um servidor separado que faz o reconhecimento. O PC do evento acha os rostos, envia o recorte 112×112 (~4 KB) pelo agente e recebe a identidade. Sem resposta em 2,5 s, reconhece sozinho (reserva). A escolha fica em `ia_onde` por evento.

---

## 6. Central de Monitoramento local (novo, 18/11/2026)

Página servida pelo agente em `http://localhost:8766/central/`. Não depende da permissão de rede local do Chrome, porque é a mesma origem do vídeo.

### 6.1 Arquivos

- `backend/agent-local/src/central.js`: acesso, API, watchlist local.
- `backend/agent-local/central/index.html`, `central.css`, `central.js`: interface (sem build, sem dependências).
- `abrir-central.bat` (raiz): abre a página com a chave.
- `backend/agent-local/test/central.test.js`: 11 testes (`npm test` em `backend/agent-local`).

### 6.2 Acesso

- Chave de 48 caracteres em `.central-chave` (criada no primeiro uso, permissão 0600, fora do Git).
- `GET /central/entrar?chave=...` ou `POST` com formulário: se a chave bate (comparação em tempo constante), cria sessão e redireciona para `/central/` sem a chave na barra de endereço.
- Cookie `nzt_central`: `HttpOnly`, `SameSite=Strict`, `Path=/central`, 12 horas.
- Dez tentativas erradas em um minuto bloqueiam novas tentativas por um minuto (429).
- Só aceita `Host: 127.0.0.1:8766` ou `localhost:8766` (protege contra DNS rebinding). Com acesso "Rede local" (painel: Agentes locais > Central; ou `CENTRAL_REDE=1` sem escolha no painel), escuta em todas as interfaces e deixa de conferir o Host (use só com necessidade).
- Cabeçalhos: `Content-Security-Policy` restrito, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: no-referrer`.

### 6.3 API da Central (todas exigem sessão)

| Método e caminho | O que faz |
|---|---|
| `GET /central/api/estado` | Câmeras que o retransmissor conhece, status do retransmissor, contagem de alvos. |
| `POST /central/api/camera/:id/webrtc?qualidade=foco\|mini` | Negocia WebRTC (corpo: oferta SDP; resposta: SDP 201). |
| `GET /central/api/caixas?foco=ids&mini=ids` | Caixas da IA de várias câmeras numa chamada, com alvo marcado. |
| `GET /central/api/reconhecimentos?desde=N` | Detecções novas do motor, com a cena só nos alertas. |
| `GET /central/api/saude` | GPU, perfil, ocupação, FPS e tempo de IA por câmera. |
| `POST /central/sair` | Encerra a sessão. |

IDs de câmera são validados (`[A-Za-z0-9-]`, até 64 caracteres) antes de ir ao motor.

### 6.4 Comportamento

- **Grade**: layouts Auto, 1, 4, 9 e 16 câmeras, com paginação. A escolha fica no navegador.
- **Foco**: clique em uma câmera. Ela usa o stream principal (`foco`), e as outras viram uma coluna de miniaturas (`mini`).
- **Conexões**: só as câmeras visíveis têm conexão WebRTC. Fora da tela, a conexão é fechada.
- **Reconexão**: esperas de 1, 2, 5 e 10 s. Conectado mas sem quadros novos por 5 s: reconecta (imagem parada).
- **Caixas da IA**: intervalos de 150 ms (foco) e 300 ms (grade).
- **Alertas da watchlist**: alvo visto no quadro ao vivo pisca a câmera, toca alarme (Web Audio, sem arquivo) e abre o alerta com cena e rosto. "Ciente" silencia o alvo por 5 min.
- **Lista de alertas**: registra cada aparição de alvo e de pessoa reconhecida (até 60 itens por lista).
- **Sem internet**: a lista de alvos fica em `.central-alvos.json` e continua valendo.

### 6.5 Watchlist no PC (fluxo)

```
VPS (a cada 60 s): pedido 'watchlist' ao agente
   → biometriaAgente.alvosDaWatchlist(evento)
        • lê watchlist ativa (CPF, motivo, nível)
        • acha pessoas com rosto que estão no evento OU são trazidas pela watchlist
        • devolve só {pessoa_id, motivo, nivel}
   → agente guarda em central.definirAlvos() e em disco
   → Central marca na caixa da IA: { pessoa.watchlist = {motivo, nivel} }
```

---

## 7. Fluxos completos

### 7.1 Cadastro de câmera

1. Painel → `POST /api/cameras` (`cameraController.create`): valida, grava em `cameras_ip`.
2. VPS → agente: `vigilancia_configurar` com a lista de câmeras do evento (`configurarAgente`).
3. Agente → `video.configurarCameras`: atualiza o `go2rtc.yaml`. Se a lista mudou, reinicia o go2rtc.
4. Agente → motor: `POST /api/vigilancia` com as câmeras e `evento_id`.
5. Motor: cria `Camera`. Só abre o leitor quando alguém assiste ou a vigilância pede.

### 7.2 Assistir uma câmera (Central)

1. Navegador → `GET /central/api/estado` → lista de câmeras.
2. Para cada câmera visível: cria `RTCPeerConnection` (recvonly), gera a oferta, espera os candidatos ICE (até 800 ms).
3. `POST /central/api/camera/:id/webrtc?qualidade=...` → agente → `video.abrirWebrtc` → `POST 127.0.0.1:1984/api/webrtc?src=c_<id>` (go2rtc).
4. go2rtc devolve a resposta SDP. O navegador recebe o vídeo direto da porta 8557 do PC.
5. Enquanto isso, o motor recebe `GET /api/track/lote` (a cada 150–300 ms) para desenhar as caixas.
6. Quando a câmera sai da tela, a conexão é fechada e o go2rtc deixa de enviar.

### 7.3 Reconhecimento de uma pessoa (ponta a ponta)

1. Câmera entrega H.264 ao go2rtc, que repassa ao RTSP local (8555).
2. `Leitor` do motor lê o quadro. O escalonador escolhe a câmera.
3. `analisar`: detecta o rosto, rastreia, avalia qualidade, gera vetor 512-D, busca no índice do evento.
4. Confirmado: `registrar_deteccoes` cria uma detecção com a cena JPEG.
5. Agente → `GET /api/vigilancia/deteccoes` → fila → `agent:deteccao` à VPS.
6. VPS grava o alerta (conforme a regra de alertas) e envia ao painel.
7. Central: `GET /central/api/reconhecimentos` traz a detecção; se for alvo, toca o alarme e abre o alerta.

### 7.4 Gravação

1. `gravador.configurar` recebe as câmeras com `gravacao_modo` ≠ `desligada`.
2. Modo `continua`: ffmpeg copia o go2rtc para blocos de 5 min em `NZT-Gravacoes\continua\<câmera>\`.
3. Modo `alertas`: buffer de blocos de 10 s. Quando chega um alerta (IA ou leitor), junta de 10 s antes a 30 s depois em `alertas\<câmera>\…_alerta.mp4`. Alertas seguidos estendem o trecho, até 3 min.
4. Sem recodificar (`-c copy`), sem áudio, MP4 fragmentado (queda de energia não perde o bloco).
5. Limites: deixa 2 GB livres; apaga os mais antigos (contínuas antes das de alerta); prazo de guarda configurável.
6. Painel baixa um trecho: `gravacao_ler` (pedaço por pedaço, pelo socket).

### 7.5 Leitor facial (catraca) com confirmação da IA

1. Leitor manda o evento de identificação à API (`intelbras.service`, `leitorCamera`).
2. Se `ia_confirmacao`, a API pede ao motor a confirmação da foto (`/api/verificar`).
3. O motor compara o vetor da foto com o cadastro do evento. Sim: libera; não: nega.
4. Se a câmera do leitor também está em IA, o motor pode gerar detecção no mesmo evento.

### 7.6 PC religado ou motor caiu

- **PC religado:** `agent.js` lê `.config-cameras.json` e reaplica a última configuração antes de conectar à VPS.
- **Motor caiu:** `ligar-ia-facial.ps1` (vigia) confere a saúde a cada `IntervaloVigia` segundos. Após `FalhasParaReiniciar` falhas, reinicia o motor.
- **Go2rtc caiu:** `iniciarProcesso` reabre com espera crescente.
- **Câmera caiu:** o `Leitor` tenta de novo com esperas de 2, 5, 10 e 30 s. Sem quadro por `SEM_QUADRO_S` (8 s), reconecta.

---

## 8. Painel (`frontend/web-admin`)

| Arquivo | Função |
|---|---|
| `pages/Monitor.jsx` | Monitor com a aba CFTV (mosaico, miniaturas, foco), KPIs, alertas, botão "Central em tempo real". |
| `pages/CftvWall.jsx` | Parede CFTV (várias câmeras, modo grande). |
| `components/cameras/CameraVideo.jsx` | Componente de vídeo: escolhe visor (WebRTC) ou MP4 pela VPS, desenha caixas, reconecta. |
| `components/cameras/GerenciarCamerasModal.jsx`, `CameraFormDialog.jsx` | Cadastro e edição de câmeras. |
| `components/cameras/SeletorArquiteturaIa.jsx` | Escolha do modo de IA do evento (local, híbrido, central remota). |
| `components/cameras/GravacoesPainel.jsx` | Gravações (buscar e baixar trechos). |
| `components/cameras/ServidoresIaPainel.jsx` | Servidores de IA central. |
| `components/monitor/AbaSaude.jsx` | Saúde do sistema: motor, GPU, FPS por câmera, "Saúde do vídeo (PC do evento)". |
| `utils/visorLocal.js` | Cliente do visor: `visorDisponivel`, `tokenVisor`, `abrirWebrtcVisor`, `urlVisorMp4`, `urlVisorDeteccoes`. |
| `utils/cameraMedia.js` | Ingresso assinado para mídia pela VPS (`pedirIngressoCamera`, `urlComIngresso`). |

Ordem de escolha do vídeo no `CameraVideo.jsx`:

1. Se o visor local responde (`/health` em até 1,5 s) e há token: **WebRTC pelo visor** (`abrirWebrtcVisor`). Se não abre em 8 s: cai para o MP4 do visor.
2. Senão: **MP4 pela VPS** (ingresso assinado de 2 min). Mostra o aviso "Vídeo pela internet (com atraso)".
3. Modo `snapshot`: uma imagem a cada `intervaloSnapshotMs`, só enquanto visível.

---

## 9. Pontos de atenção e oportunidades

Esta seção reúne o que os testes desta conversa mostraram. Cada item diz o tamanho do problema, o que já foi feito e o que dá para mudar, conforme o cenário.

### 9.1 Carga de CPU no motor (principal gargalo com muitas câmeras)

- **Medido:** o processo Python de IA ficou com **um núcleo inteiro** (10,4 s de CPU em 10 s) com 2 câmeras. A Mercusys estava em `ia_stream: principal` (perfil máximo), decodificando 2304×1296 a 15 fps no processador.
- **Impacto:** com 10 câmeras de 4 MP, o motor não acompanha. O escalonador respeita o orçamento, mas a decodificação já consome a CPU antes da IA.
- **Opções:**
  - Trocar para `ia_stream: auto` ou `sub` (o sub-stream de 1280×720 é bem mais leve). Testar se o reconhecimento continua bom na distância da porta.
  - Decodificar com a GPU (NVDEC). No OpenCV a aceleração reduziu pouco o custo no teste (ver 4.5), então o caminho mais provável é o ffmpeg com `-hwaccel cuda` entregando quadros já reduzidos ao motor. Precisa ser testado antes de adotar.
  - Separar a decodificação em um processo próprio por câmera, que entrega só quadros reduzidos.

### 9.2 Webcam

- Medição atual: **28,9 fps** (antes estava em 16 fps; o MJPG e o `CAP_PROP_FPS=30` resolveram a parte do driver).
- A codificação do H.264 da webcam fica no encoder que `obterEncoderH264` escolher. Vale confirmar no `go2rtc.yaml` gerado se está `h264_nvenc` (GPU) e não `libx264` (CPU). Se for libx264, o ffmpeg usa um núcleo inteiro.

### 9.3 Motor com fonte de vídeo única por câmera

- O go2rtc é o único que conecta na câmera. Isso é bom (uma conexão), mas significa que **se o go2rtc cair, todas as câmeras param** até reabrir. O tempo de reabertura é de 2 s a 30 s.
- Melhoria possível: vigia do go2rtc mais rápido e reabertura imediata quando a assinatura não mudou.

### 9.4 Watchlist e cadastro

- A watchlist entra no motor pela **sincronização completa a cada 15 min** e pela incremental a cada 60 s. Uma pessoa acrescentada à watchlist só é reconhecida no PC após até 60 s (ou 15 min, se a incremental não pegar).
- Melhoria possível: forçar uma sincronização incremental quando a watchlist muda.

### 9.5 Modo central remoto (`ia_onde = direto_servidor`)

- Há um estado no painel ("Central Remota / Fibra") que, segundo o registro de 17/11 (`revisao_nov2026`), **ainda não tem efeito completo no agente**: o agente trata como `local`. Antes de usar, confirmar.

### 9.6 Segurança

- Chaves: `.chave-interna` (motor), `.central-chave` (Central), go2rtc (usuário e senha em `bin/go2rtc.yaml`), senhas das câmeras (no `go2rtc.yaml` e no banco). Todos locais e fora do Git.
- O motor só aceita `X-IA-Chave`. A Central exige sessão e Host local.
- O painel nunca recebe senha de câmera (o cadastro mostra campo em branco; ver `19b5e23`).
- Vale revisar: permissões do `bin/go2rtc.yaml` no Windows (o `mode 0600` não tem efeito pleno no Windows) e quem tem acesso ao PC do evento.

### 9.7 Atraso no painel de fora do evento

- Pela VPS, o atraso é de segundos (MP4 fragmentado). Não há como zerar isso sem levar o vídeo da rede do evento para a internet. A Central local resolve o tempo real dentro do evento.
- Se a equipe de monitoramento estiver em outro lugar, a opção é WebRTC pela VPS (exige um servidor de mídia com TURN). Não implementado.

### 9.9 Leitores sem internet (verificado em 19/11)

- Os leitores Intelbras estão em **modo online** (`DeviceMode=1`): a cada passagem perguntam ao servidor (`/api/intelbras/online`). Sem resposta, **negam** o acesso. Já estava registrado em `docs/PRODUCAO_LEITORES_FACIAIS.md`.
- O campo "Modo offline" (`dispositivos_acesso.offline_mode`, `fail_open`/`fail_closed`) era salvo, mas **nenhum código o aplicava no leitor**. A tela prometia "libera se o sistema estiver fora do ar", o que não acontecia. Desde 19/11 a escolha está travada em "negar", com explicação na tela.
- Caminho para resolver (próxima fase, com o equipamento na mão): o leitor decide sozinho com os rostos que já recebe na sincronização, e o sistema recebe os eventos de passagem; ou configurar no próprio leitor a verificação local quando o servidor não responde. As duas mudam regras de acesso (área, antirretorno, pulseira) e precisam de teste no local.
- A confirmação pela IA (`ia_confirmacao`) já libera pelo leitor quando o motor está fora, a menos que `ia_falha = 'negar'`.

**Lista dentro do leitor sempre atualizada (20261119_fila_sync_leitores):** antes, expulsar, recusar, áreas gravadas no check-in, troca de pulseira e áreas de um lote não avisavam os leitores (só a varredura das 01:00 corrigia). Agora gatilhos no banco anotam a pessoa em `fila_sync_leitores` a cada mudança de status, bloqueio, ativo, pulseira, áreas (da pessoa ou do lote), foto ou evento, venha de qualquer tela. A API (`filaSyncLeitores.service.js`) esvazia a fila a cada 3 s: cadastra nos leitores das áreas, remove dos demais, remove de todos se bloqueado/expulso/recusado/inativo, e do evento antigo se trocou de evento. Leitor fora do ar recebe pela fila dele quando voltar. Isso é o pré-requisito para o leitor decidir sozinho sem internet: ele só pode decidir com uma lista que está sempre certa.

Ainda não coberto: empresa bloqueada (o modo online nega, mas os funcionários continuam cadastrados no leitor).

### 9.8 Limites conhecidos do código

- `Leitor` guarda um quadro (não uma fila). Isso é intencional (atualidade), mas significa que quadros antigos se perdem se a IA estiver lenta.
- O índice FAISS é do tipo "força bruta" (`IndexFlatIP`). Com dezenas de milhares de vetores, será mais lento; um índice aproximado (IVF/HNSW) resolveria, ao custo de um pouco de precisão.
- Detecção e reconhecimento usam o mesmo `det_size` para todas as câmeras do perfil. Câmeras em grande angular poderiam usar entrada maior.

---

## 10. Como verificar tudo isso no seu PC

| O que verificar | Como |
|---|---|
| Motor no ar, GPU e perfil | `GET http://127.0.0.1:8000/health` com `X-IA-Chave` (ou a aba Saúde do painel) |
| Câmeras no motor e FPS | `GET /api/engine/status` (campo `cameras`) |
| Retransmissor e streams | API do go2rtc `127.0.0.1:1984` (com usuário e senha de `bin/go2rtc.yaml`) |
| Codificador da webcam | Abrir `bin/go2rtc.yaml` e procurar `h264:` (nvenc, amf ou x264) |
| Central | `http://localhost:8766/central/` (com `abrir-central.bat`) |
| Testes do agente | `npm test` em `backend/agent-local` (11 testes) |
| Testes da API | `npx jest` em `backend/api-nodejs` (268 testes; watchlist em `biometriaWatchlistEvento.test.js`) |
| Frames por câmera (medida) | Script de amostragem por ffmpeg sobre `rtsp://127.0.0.1:8555/c_<id>` (ver `scratchpad` desta sessão) |

---

## 11. Mudanças da fase 1 (19/11/2026, seguindo a análise do PDF)

| Mudança | Onde | Efeito |
|---|---|---|
| IA sempre no sub-stream | motor `PERFIS`, `montar_config`, `leitor_para` | Corta a decodificação de 4 MP. Ajuste antigo salvo com `principal` é ignorado. A tela grande também deixa de abrir o principal no motor. |
| Dois limites para alerta | motor `alerta_confiavel`; API `processarDeteccoesCamera`; Central | Falso alerta de watchlist/bloqueado com rosto pequeno ou semelhança baixa vira "possível", sem alarme. |
| go2rtc sem reinício à toa | API `camerasDoEvento` (ordem fixa por id); agente `melhorModo` (modo da webcam salvo em `bin/webcam-modos.json`) | A assinatura da configuração só muda quando muda URL de câmera. |
| Fora do evento sem vídeo pela VPS | painel `CameraVideo.jsx` | Sem visor local: 1 imagem/s na tela grande, 1 a cada 2 s nas miniaturas, com aviso. O vídeo via Socket.IO não é mais pedido. |
| Central pelo Tailscale | agente `visor-local.js` + `central.js` (painel: Agentes locais > Central, gravado em `.central-acesso.json`; sem escolha, `CENTRAL_TAILSCALE=1`) | Segundo servidor só no IP 100.x, só com a Central (chave + sessão). Rotas do painel e IP da rede local continuam fechados. |
| Tela honesta | `DispositivosPage.jsx`, `ConfigIAFacial.jsx` | "Modo offline" travado em negar (ver 9.9); escolha de stream da IA substituída pela orientação de configurar o sub-stream na câmera. |

Testes: motor `tests/test_config_alerta.py` (11 verificações), agente `npm test` (13), API `npx jest` (5 novos em `alertaConfiavelCamera.test.js`).

## 12. Glossário

- **RTSP:** protocolo que a câmera usa para entregar o vídeo na rede.
- **Sub-stream:** versão menor do vídeo da mesma câmera (ex.: 1280×720, em vez de 2304×1296).
- **go2rtc:** programa que lê câmeras e reentrega o vídeo em outros formatos (WebRTC, MP4, MJPEG, RTSP).
- **WebRTC:** tecnologia de vídeo em tempo real entre navegador e servidor, com buffer mínimo.
- **MP4 fragmentado:** arquivo de vídeo que pode ser tocado enquanto é gravado; tem mais atraso no navegador.
- **SCRFD:** modelo que acha rostos numa imagem.
- **ArcFace:** modelo que transforma o rosto em um vetor de 512 números (a "assinatura" da pessoa).
- **Similaridade de cosseno:** medida entre dois vetores; 1,0 é igual, perto de 0 é diferente. O motor usa `limiar` e `margem`.
- **Margem:** diferença entre o melhor e o segundo candidato. Evita aceitar alguém quando dois cadastros parecem iguais.
- **DirectML:** caminho de aceleração por GPU no Windows, qualquer fabricante.
- **NVENC / NVDEC:** codificação e decodificação de vídeo na GPU NVIDIA.
- **LNA (Local Network Access):** regra do Chrome (142+) que pede permissão para uma página da internet acessar a rede local.
- **Watchlist:** lista de pessoas de interesse; quando reconhecidas, geram alerta.
- **Visor local:** servidor do agente em `127.0.0.1:8766` que entrega o vídeo ao navegador do PC do evento.
