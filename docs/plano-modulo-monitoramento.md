# Módulo de monitoramento: como funciona hoje, por que tem lag e plano de separação

**Para quem é:** você (dono do produto) decidir o rumo. Depois, quem for implementar.
**Data:** 25/11/2026. **Base:** código do commit `e7b7c42` e o descritivo `docs/sistema-cameras.md` (19/11).
**Estado:** só análise e plano. Nenhum código foi alterado.

---

## 1. Resposta curta

- **Sim**, câmeras e motor de IA ficam no **PC do evento**. O vídeo do evento fica na rede local.
- **Não completamente** para os leitores faciais. Cada passagem de catraca **passa pela nuvem** (VPS). A nuvem pede a confirmação da foto ao PC do evento, com prazo de 1,5 s. Sem internet, o leitor depende do que já estiver configurado nele.
- **O lag não vem da placa de vídeo.** O vídeo ao vivo na rede local já é baixo (WebRTC, ~25–30 ms de buffer). O atraso aparece quando o vídeo ou o alerta **sai da rede local** e passa pela VPS, e no caminho da confirmação da catraca.
- **GPU e memória:** a GPU acelera a IA (detectar e reconhecer rostos). Ela não é o que faz o vídeo andar. Antes de comprar hardware, é preciso medir (seção 5).
- **Separar o módulo é viável**, porque o projeto já tem o padrão pronto: o módulo de produção tem subdomínio, container e rota no gateway. O ponto delicado é a **câmera e o leitor ligados à estação de check-in/check-out**, que ficam no núcleo (seção 4).

---

## 2. Como funciona hoje

### 2.1 As peças

| Peça | Onde roda | Função |
|---|---|---|
| **API Node** (`backend/api-nodejs`) | VPS (Hostinger) | Regras de acesso, check-in/out, pulseiras, leitores, watchlist, painel |
| **Banco** | Supabase (nuvem) | Pessoas, eventos, câmeras, leitores, permissões |
| **Agente local** (`backend/agent-local`) | PC do evento | Ponte entre a rede do evento e a VPS. Hospeda o **go2rtc** (vídeo), a **gravação** e a **Central** (`localhost:8766/central`) |
| **go2rtc** | PC do evento | **Único** processo que conecta nas câmeras. Entrega o vídeo em WebRTC, MP4, MJPEG e RTSP local |
| **Motor de IA** (`backend/microservice-face-python`) | PC do evento, `127.0.0.1:8000` | Lê o sub-stream, acha rostos (SCRFD), reconhece (ArcFace + FAISS), gera detecções |
| **Painel** (`frontend/web-admin`) | Nuvem (`painel.nzt.app.br`) | Operação, Monitor, cadastro |
| **Leitores Intelbras/Hikvision** | Portaria / catraca | Liberam acesso. Chamam `leitores.nzt.app.br/api/intelbras/online` a cada passagem |
| **Gateway Nginx** | VPS | Roteia subdomínios (painel, produtor, cadastro, leitores, api) |

### 2.2 Três caminhos de vídeo (do mais rápido ao mais lento)

1. **Central no PC do evento** (`localhost:8766`): câmera → go2rtc → WebRTC → tela. Sem internet. Atraso de dezenas de milissegundos.
2. **Painel no PC do evento** com permissão de rede local do Chrome: mesmo caminho pelo visor local.
3. **Painel de fora do evento**: câmera → go2rtc → agente → Socket.IO → VPS → HTTPS → navegador, em MP4 fragmentado. Atraso de **~2 s**. Desde 19/11, sem visor local, o painel mostra **1 imagem por segundo** (`CameraVideo.jsx`).

O navegador do painel (página pública) não alcança `localhost` nem a rede local sem permissão do Chrome (Private Network Access). Por isso o caminho 3 é o padrão quando a equipe abre o painel na nuvem. A Central foi criada justamente para contornar isso.

### 2.3 Caminho da detecção (quem reconheceu quem, e quando aparece na tela)

```
câmera → go2rtc (sub-stream, RTSP local)
  → motor: Leitor (guarda só o último quadro) → escalonador → SCRFD → ArcFace → FAISS
  → detecção na fila do motor
  → agente consulta o motor a cada 1 s
  → agente emite 'agent:deteccao' à VPS (ack em até 10 s; se cair, fila em disco)
  → VPS grava o alerta e envia ao painel por Socket.IO
  → Central local (não passa pela VPS): lê /central/api/reconhecimentos
```

### 2.4 Caminho da catraca (o ponto mais sensível)

```
pessoa passa no leitor
  → leitor chama a nuvem: leitores.nzt.app.br/api/intelbras/online
  → nuvem valida (pessoa, área, pulseira, antirretorno, bloqueio)
  → se ia_confirmacao: nuvem pede ao PC do evento (agente 'ia_post' → motor /api/verificar)
       prazo 1,5 s (intelbras.controller.js: _confirmarComIa)
       sem PC conectado / motor lento / sem foto → aplica ia_falha ('liberar' ou 'negar')
  → nuvem responde liberado/negado ao leitor
```

Ou seja, **a decisão da catraca atravessa a internet duas vezes e o PC do evento uma vez**.

---

## 3. Por que tem lag (ordem de impacto estimado)

Nenhum destes números foi medido aqui na sua rede. Os valores são do código e do descritivo de 19/11. A seção 5 mostra como medir.

| # | Onde | Atraso típico | Causa | Evidência |
|---|---|---|---|---|
| 1 | **Catraca com IA** | até 1,5 s e dependente de internet | Ida e volta à nuvem + PC do evento | `intelbras.controller.js` (`_confirmarComIa`, prazo 1,5 s) |
| 2 | **Vídeo fora do evento** | ~2 s, e 1 imagem/s sem visor | MP4 fragmentado pela VPS | `docs/sistema-cameras.md` §7/§9.7; `CameraVideo.jsx` |
| 3 | **Alerta de watchlist** | 1 a 3 s | Poll do agente (1 s) + ida à VPS + Socket.IO | `agent.js` (loop de 1 s); `emitWithAck` em 10 s |
| 4 | **Caixas da IA** | 150 ms (foco) a 300 ms (grade), mais o tempo de análise | Análise compartilhada entre câmeras; com 16 câmeras, cada uma é analisada poucas vezes por segundo | `ia_fps_total` 15/30/60; `Central` (intervalos) |
| 5 | **CPU do motor** | fica para trás com muitas câmeras | O OpenCV/FFmpeg **decodifica todos os quadros** de toda fonte aberta, mesmo os que não analisa | `main.py` (`Leitor`, §5.3 do descritivo) |
| 6 | **Watchlist nova** | até 60 s (ou 15 min) | Sincronização incremental a cada 60 s | `docs/sistema-cameras.md` §9.4 |
| 7 | **Queda de go2rtc** | 2 a 30 s sem vídeo de nenhuma câmera | Um único processo para todas as câmeras | §9.3 do descritivo |

**Leitura honesta:** se o lag que você vê é "o vídeo está atrasado", o caso mais provável é o **2** (painel fora do evento ou sem permissão de rede local). Se é "a catraca demora", é o **1**. Se é "a caixa vermelha aparece depois que a pessoa já passou", são o **3** e o **4**. Preciso que você confirme qual dos três é o seu, porque cada um tem solução diferente.

---

## 4. Sobre a separação do módulo

### 4.1 O que já existe e ajuda

- **Padrão de subdomínio pronto:** `produtor.nzt.app.br` → container `a2_eventos_portal_produtor` → `gateway/nginx.conf` (linhas ~221–240), com rota de API `/api/producao/` no mesmo backend.
- **Permissão por módulo:** `monitoramento` já é um módulo de permissão (`perfilAcesso.service.js`, `auth.js` mapeia `monitor` → `monitoramento`). `moduloDesligado.js` bloqueia módulo desligado por operador.
- **Central local** já é um protótipo de "produto autônomo no PC do evento": interface própria, chave de acesso, sessão, sem depender da nuvem.

### 4.2 O que falta

- **Não há conceito de cliente/licença.** O sistema tem **eventos** dentro de uma instalação (`req.tenantId` é o evento), não inquilinos. Vender "módulo adicional" para outro cliente hoje significa **uma instalação por cliente** ou uma refatoração multi-cliente. Essa decisão precisa ser sua (seção 7).
- **`cameras_ip` é compartilhada:** a estação de check-in usa câmera (`sessoes_operador.camera_ids`) e o leitor usa câmera (`leitorCamera.service.js`). Separar sem cuidado quebra o check-in.

### 4.3 Divisão proposta

**Fica no núcleo (não sai do sistema):**

- Pessoas, empresas, eventos, áreas, pulseiras, check-in, check-out, credenciamento, fiscalização.
- **Leitores faciais** (`dispositivos_acesso`) e a decisão de acesso entre áreas.
- **Webcams e câmeras das estações de check-in/check-out** (o que você pediu para manter). Elas ficam como *dispositivo de estação*, referenciado pelo núcleo.
- Produção (já separada).

**Sai para o módulo de monitoramento:**

- Monitor CFTV, parede de vídeo (CftvWall), Central, `CameraVideo`, `GerenciarCamerasModal` (parte de CFTV), gravações, `AbaSaude`, `ServidoresIaPainel`, `SeletorArquiteturaIa`.
- Vigilância (`vigilancia.service.js`), watchlist, alertas de watchlist, `saudeVideo`, `videoRelay`, `iaCentral`.
- Motor de IA, agente de vídeo (go2rtc, gravador, visor, Central) **no PC do evento**.

**Ponto de contrato (a costura entre os dois):**

| Direção | O que passa | Por quê |
|---|---|---|
| Núcleo → monitoramento | Lista de pessoas e biometria do evento (já vai pelo agente) | O motor precisa dos rostos |
| Núcleo → monitoramento | Identificação de passagem (quem passou em qual área/leitor) | Para o Monitor mostrar o fluxo |
| Monitoramento → núcleo | Confirmação da IA para a catraca (`ia_confirmacao`) | O núcleo decide; o motor só confirma |
| Monitoramento → núcleo | Alertas de watchlist (cópia assíncrona) | Histórico e relatórios, sem estar no caminho crítico |

Regra: **a costura é sempre por evento assíncrono ou por chamada ao motor, nunca por tabela compartilhada escrita pelos dois lados.**

**Decisão pendente sobre `cameras_ip`:** proponho que a tabela continue no núcleo (é o cadastro físico, usado pela estação), e que o módulo tenha sua própria tabela de configuração de monitoramento (`monitor_cameras`: IA ligada, gravação, prioridade, layout) que aponta para o `camera_id`. Assim cada lado tem o que precisa e nenhum apaga o outro.

### 4.4 Onde o módulo mora (no código e na VPS)

Mesmo padrão da produção:

- `frontend/monitoramento/` (app Vite separado, como `portal-produtor`), com PWA (manifest + service worker).
- Container novo no `docker-compose.yml` e rota `monitoramento.nzt.app.br` no `gateway/nginx.conf`.
- Rotas `/api/monitoramento/*` no **mesmo backend** (como `/api/producao`), protegidas por `exigirAlgumModulo(['monitoramento'])`.
- Login e senha de operador: o sistema já tem operadores com perfil. O subdomínio tem tela de login própria e só deixa entrar quem tem o módulo `monitoramento` ligado.
- **Entitlement por instalação:** `system_settings.config.modulos_contratados` (ex.: `{ producao: true, monitoramento: false }`). Sem isso, o módulo fica ligado para todos e não há como cobrar nem desligar por cliente.

---

## 5. Nova estratégia para tempo real (sem lag)

### 5.1 Princípio: o caminho crítico fica no PC do evento

| Coisa | Hoje | Proposta |
|---|---|---|
| Vídeo ao vivo para a equipe no evento | Central local (bom) ou painel pela VPS (lento) | **Sempre local.** O PWA do monitoramento é servido **pelo próprio PC do evento** (mesma origem, como a Central faz hoje). Sem Private Network Access e sem VPS |
| Caixas e alertas | Motor → agente → VPS → painel | **Motor → PWA local por WebSocket local.** A VPS recebe uma cópia assíncrona para histórico |
| Gravação | No PC | Igual, sem mudança |
| Acesso remoto (equipe fora do evento) | Painel pela VPS, com ~2 s | Opcional e separado. Usa WebRTC com servidor de mídia (TURN). Não é o caminho principal |
| Catraca | Ida e volta à nuvem | Ver 5.3 |

**Por que servir o PWA do próprio PC:** resolve três problemas de uma vez. (a) Chrome não bloqueia a conexão, porque é a mesma origem. (b) Funciona sem internet. (c) Tablet ou celular na rede do evento abre o endereço local (com HTTPS de rede local, por exemplo via Tailscale).

### 5.2 Medir antes de comprar hardware

Três números decidem tudo:

1. **Latência do vídeo** no ponto de vista do operador: câmera → tela (com relógio visível em câmera de referência).
2. **Latência do alerta**: pessoa entra no quadro → aparece na Central local → aparece no painel da nuvem.
3. **Tempo de confirmação da catraca**: passagem → resposta do leitor (já há o campo `idade do evento` no código).

Com isso, a GPU e a memória deixam de ser palpite. Como ponto de partida, use `GET /api/pc-compatibilidade` (motor) no PC do evento e envie o resultado.

**Sobre GPU e memória (orientação, não dimensionamento):**

- **Vídeo ao vivo:** quase zero de GPU ou CPU (é cópia do stream, sem recodificar). Custa pouco.
- **Decodificação:** é o que mais consome CPU hoje (o OpenCV decodifica tudo). Trocar para sub-stream já ajuda. Uma GPU com NVDEC ou DirectML pode aliviar, mas precisa de teste (o próprio descritivo mediu ganho pequeno com OpenCV).
- **Reconhecimento:** SCRFD e ArcFace se beneficiam de GPU (DirectML em qualquer GPU Windows, ou CUDA em NVIDIA).
- **Memória:** o índice FAISS de um evento é pequeno. A RAM vai para o motor, o go2rtc, o ffmpeg de gravação e o Chrome da Central.

Não recomendo comprar hardware antes da medição da seção 5.2.

### 5.3 Catraca sem depender da internet

Esta é a mudança de maior impacto, e a que mais mexe com regra de acesso. Opções, da mais simples à mais profunda:

- **A. Manter a decisão na nuvem, reduzir a ida-e-volta:** a IA confirma no PC e o resultado volta já pelo agente; medir primeiro. Ganho pequeno.
- **B. Decisão local com lista sincronizada:** o PC do evento recebe os leitores diretamente (o leitor manda o evento para o PC na rede local), e a regra de acesso roda no PC com uma cópia do estado. A fila de sincronização que já existe (`fila_sync_leitores`, 19/11) é o pré-requisito.
- **C. Leitor decide sozinho:** o leitor usa a lista que já tem. Exige que a lista esteja sempre certa (já está melhor com a fila) e uma decisão de regras (área, antirretorno, pulseira) feita com o equipamento na mão.

Recomendo **A agora (medição) e B como fase própria**, com teste no local. C só depois de B estar validado. Isso mexe com acesso, então cada passo precisa de teste com leitor real, e não só em navegador simulado.

---

## 6. Plano em fases

Cada fase termina com algo que funciona e pode ser desligado. Nada da fase anterior depende de sorte.

**Fase 0 — Medir (sem mudança de código para o cliente)**
- Medir os três números da seção 5.2 no PC do evento, com câmera real e leitor real.
- Registrar em `docs/producao/` ou `docs/diagnostics/`.
- *Saída:* decisão sobre hardware e sobre a catraca (A, B ou C).

**Fase 1 — Isolar o código, sem mudar comportamento**
- Mover os arquivos de monitoramento para `frontend/monitoramento/` e os módulos de vigilância para um diretório próprio no backend, mantendo as mesmas rotas.
- Nenhuma migração nova. Rotas antigas continuam no painel durante a transição.
- Testes existentes (`npx jest` e `npm test` do agente) precisam continuar passando.
- *Saída:* separação de código, sem risco de regressão.

**Fase 2 — PWA servido pelo PC do evento, com alerta local**
- O motor e o agente servem o PWA na mesma origem (generalização da Central).
- Alerta por WebSocket local, sem passar pela VPS.
- Cópia assíncrona para a VPS (histórico e relatórios).
- *Saída:* vídeo e alerta em tempo real dentro do evento, sem VPS no caminho.

**Fase 3 — Subdomínio, login e módulo contratado**
- `monitoramento.nzt.app.br` no gateway; login próprio; entitlement em `modulos_contratados`.
- Acesso remoto da equipe (opcional, com TURN).
- *Saída:* produto vendável como adicional.

**Fase 4 — Catraca com decisão local (opção B e depois C)**
- Só com teste no local e com os seus critérios de regra. Esta fase muda acesso e tem o maior risco; não deve ser misturada com as anteriores.

**Fase 5 — Venda multi-cliente (se você quiser)**
- Depende da decisão da seção 7. Pode ser só "uma instalação por cliente" (mais simples, já funciona) ou uma refatoração para inquilinos.

---

## 7. Decisões que dependem de você

1. **Como vender:** uma instalação por cliente (mais simples e já é como funciona) ou um sistema que atende vários clientes na mesma base (exige refatoração grande)?
2. **Onde fica o operador de monitoramento:** no evento (rede local, sem VPS) ou de fora? Isso decide se o vídeo precisa atravessar a internet e se vale investir em servidor de mídia.
3. **Catraca:** aceita começar pela opção A (medir e reduzir a ida-e-volta), ou quer já a decisão local (B)?
4. **Equipamento do evento:** qual PC e qual GPU? Rode `GET /api/pc-compatibilidade` no motor e me envie o resultado, ou o modelo do PC e da placa.
5. **O lag que você vê:** é o vídeo (painel ou Central), o alerta, ou a catraca? Isso define a prioridade da Fase 0.

---

## 8. O que não muda

- Check-in, check-out, pulseiras, áreas e leitores continuam no sistema. Você mantém a estação com webcam ou câmera e o controle de acesso entre áreas.
- Deploy continua pelo protocolo do `CLAUDE.md`: commit, tag de rollback e aprovação antes do push.
- Migrações são aplicadas pelo Supabase por você, como hoje.
