# Motor de IA facial (NZT Intelligent Control System)

Roda no computador do evento (porta 8000). Lê as câmeras RTSP, detecta e reconhece rostos
(InsightFace SCRFD + ArcFace, índice FAISS) e entrega vídeo anotado e detecções ao agente local,
que leva tudo ao painel na nuvem. Todo o código está em `src/main.py`.

## Ligar

Use `scripts\ligar-ia-facial.bat` na raiz do projeto: escolhe o Python certo, sobe o motor e o
agente local e religa o que cair. Instalação com placa de vídeo: ver `requirements-windows-gpu.txt`.

## Como economiza

- **Um escalonador de IA para todas as câmeras**: o teto de análises/s (`ia_fps_total`) é dividido
  entre as câmeras; a mais atrasada (pesando a prioridade) é analisada primeiro.
- **IA só quando precisa**: câmera aberta em tela grande > miniatura > vigilância com movimento.
  Cena parada sem ninguém assistindo não gasta IA.
- **Sub-stream**: miniaturas e vigilância usam o stream de baixa resolução (Intelbras/Dahua
  `subtype=1`, Hikvision `102`, ou a URL cadastrada). Se não existir, cai no principal sozinho.
- **Reconhecimento por rastro**: o mesmo rosto rastreado só é reconhecido de novo a cada
  `reconhecer_s`; a identidade precisa de `confirmacoes` leituras (ou uma muito forte).
- **JPEG codificado uma vez por quadro** e servido a todos; o agente pede com `apos_seq` e recebe
  204 quando o quadro não mudou.

## Configuração

Perfis `leve`, `equilibrado` (padrão) e `maximo`, com ajuste fino, vêm do painel
(Configurações > IA facial e câmeras) pelo agente: `POST /api/config`. Por câmera (IA ligada,
vigilância 24 h, prioridade, sub-stream): `POST /api/vigilancia`.

Variáveis de ambiente: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (obrigatória), `IA_PERFIL`,
`IA_GPU=off`, `IA_CAMERA_OCIOSA_S` (120), `IA_SEM_QUADRO_S` (8), `IA_RECARGA_ROSTOS_S` (300),
`IA_CAMERA_PADRAO`.

## Rotas

| Rota | Uso |
|---|---|
| `GET /health` | saúde (nunca bloqueia) |
| `GET /api/engine/status` | GPU/CPU, fps e IA por câmera, fila, rostos indexados |
| `GET/POST /api/config` | perfil e ajustes |
| `GET /api/camera/snapshot` | quadro JPEG (`qualidade=mini/foco`, `annotate`, `max_width`, `quality`, `apos_seq`) |
| `GET /api/camera/stream` | MJPEG direto (API no próprio servidor do evento) |
| `GET /api/camera/test` | a câmera manda vídeo? |
| `GET /api/track/live` | últimos resultados da IA da câmera (sem análise extra) |
| `POST /api/vigilancia` | câmeras do evento e opções por câmera |
| `GET /api/vigilancia/deteccoes` | pessoas reconhecidas (`desde`, `max_idade_s`) |
| `POST /api/extract` | vetor da foto de cadastro; recusa foto ruim com `motivo` |
| `POST /api/reload-faces` | agenda a recarga do índice |
