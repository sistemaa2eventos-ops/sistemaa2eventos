# ADR 0002: Licenciamento e Arquitetura de Visão Computacional para Contagem de Materiais
**Status:** Proposto  
**Data:** 19/11/2026  
**Decisores:** Arquiteto de Software / Tech Lead, Diretoria Técnica  

---

## Contexto
O Módulo de Produção oferece contagem assistida por IA para recebimento e conferência de materiais pesados de evento (treliças de alumínio Q30/Q50 de 1m a 5m, praticáveis pantográficos, caixas acústicas, grades de contenção, tendas modulares).
A contagem ocorre por gravação de vídeo no celular, câmeras IP (RTSP) no portão de carga ou vídeo gravado enviado pelo usuário.
O algoritmo precisa:
1. Detectar e classificar o material com alta precisão.
2. Rastrear cada objeto em movimento (descarregamento) ou segmentar pilhas estáticas sem contar o mesmo objeto duas vezes.
3. Operar em um produto comercial SaaS de código fechado sem violar termos de licença de software livre.

## Avaliação de Licenças e Modelos

### 1. Ultralytics YOLO (YOLOv8, YOLO11, YOLO26)
- **Licença**: **AGPL-3.0 (GNU Affero General Public License v3)**.
- **Risco**: A licença AGPL-3.0 estabelece que, se o software for executado em um servidor acessível via rede (SaaS), todo o código-fonte da aplicação que interage com ele deve ser tornado público sob AGPL. Para uso comercial em produto fechado, a Ultralytics exige a contratação da **Enterprise License** direta ou via **Roboflow** (licenciador oficial autorizado).
- **Custo Comercial**: Uma licença Ultralytics Enterprise custa tipicamente a partir de **US$ 5.000 a US$ 15.000 / ano** por aplicação ou limites de instâncias.

### 2. Modelos Permissivos Apache 2.0 (RT-DETR / RF-DETR / YOLOv9/v10 variantes permissivas)
- **Licença**: **Apache 2.0**.
- **Vantagens**: Licença totalmente permissiva para produtos comerciais fechados sem taxa de royalties ou obrigação de abertura de código. O RT-DETR (Real-Time Detection Transformer da Baidu) possui precisão e velocidade equivalentes ou superiores ao YOLOv8 sem a restrição da AGPL.

### 3. Biblioteca Roboflow Supervision (MIT)
- **Licença**: **MIT (totalmente permissiva)**.
- **Vantagens**: Fornece de forma nativa e agnóstica de modelo: `LineZone` (contagem de itens cruzando uma linha imaginária), `PolygonZone` (contagem dentro de área demarcada), `ByteTrack` integrado e ferramentas de anotação de vídeo.

## Decisão
1. **Adotamos a biblioteca Roboflow Supervision (MIT)** como o motor padrão de contagem, rastreamento e zonas espaciais (`LineZone`, `PolygonZone`, `ByteTrack`).
2. Para o modelo de inferência:
   - **Fase de Desenvolvimento e Prova de Conceito (PoC)**: Utilizaremos a biblioteca Ultralytics em ambiente interno de homologação isolado (sem distribuição comercial).
   - **Fase de Produção Comercial (SaaS)**: Adotaremos o **RT-DETR (Apache 2.0)** ou modelo exportado em **ONNX Runtime**, eliminando qualquer risco jurídico ou custo proibitivo de licenciamento AGPL-3.0. Caso a empresa opte por uma parceria comercial formal com a Roboflow para anotação e pipeline gerenciado, a licença do YOLO poderá ser ativada por essa via autorizada.
3. **Arquitetura de Microsserviço Isolado**: O serviço de visão computacional de materiais será implementado em Python (FastAPI), hospedado separadamente da API principal Node.js, comunicando-se via fila assíncrona (Redis) e webhooks.

## Consequências
- Proteção legal absoluta do código proprietário do sistema NZT.
- Custo zero de licenças no início da comercialização.
- Facilidade de deploy com contêiner Docker contendo ONNX Runtime / PyTorch com aceleração GPU (NVIDIA CUDA / TensorRT).
