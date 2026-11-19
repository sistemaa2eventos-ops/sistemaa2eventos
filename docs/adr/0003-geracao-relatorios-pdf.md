# ADR 0003: Estratégia e Tecnologia para Geração de Relatórios em PDF Personalizados
**Status:** Proposto  
**Data:** 19/11/2026  
**Decisores:** Arquiteto de Software / Tech Lead, Time Backend  

---

## Contexto
O Módulo de Produção requer relatórios executivos e operacionais de alta complexidade:
- **Diário de Produção Automático**: Cronograma do dia, etapas concluídas, próximas atividades, incidentes, mural de fotos de evidência com legendas e metadados, presenças/dobras e divergências de materiais.
- **Relatórios Técnicos com Marca d'Água**: Exportação de projetos, propostas de plantas aprovadas e auditoria financeira com cabeçalhos dinâmicos, numeração "Página X de Y" e marcas d'água de confidencialidade com opacidade configurável.

## Opções Avaliadas
1. **Manter estritamente o PDFKit (Stack Atual)**:
   - *Prós*: Já instalado e em uso no sistema (`pdf.service.js`); leve em memória e rápido para tabelas simples de credenciamento.
   - *Contras*: Programação imperativa baseada em coordenadas absolutas (`doc.text(..., x, y)`). Construir layouts dinâmicos complexos com grids de fotos responsivos, quebras automáticas de página respeitando blocos lógicos e marcas d'água estilizadas torna o código extremamente verboso, difícil de testar e sujeito a sobreposição de conteúdo em relatórios extensos.
2. **Navegador Headless com HTML/CSS (Playwright / Puppeteer)**:
   - *Prós*: Desenvolvimento do relatório utilizando padrões modernos da web (HTML5, CSS3, Flexbox/Grid, `@media print`, CSS Paged Media). Permite que designers ou frontends ajustem o template com visualização instantânea no navegador. Geração idêntica ao que se vê na tela.
   - *Contras*: Consome mais memória RAM por processo (~100-200 MB por instância de Chromium) e exige execução em fila desacoplada do servidor HTTP.

## Decisão
Adotamos uma **estratégia híbrida em duas fases**:
1. **Fase 1 (MVP)**: Reaproveitar o **`pdfkit`** existente para os relatórios tabulares operacionais (lista de presença da produção, catálogo básico de materiais e romaneios de carga), estendendo o `pdf.service.js` já existente.
2. **Fase 2 (V1 - Relatórios Executivos & Diário com Fotos)**: Introduzir um micro-worker com **Playwright / Chromium Headless** executado em background via fila Redis. O backend renderiza uma página HTML estilizada (com cabeçalhos, logos, marcas d'água e galeria de fotos) e o Playwright emite o PDF com precisão visual absoluta (`page.pdf({ format: 'A4', printBackground: true })`).

A geração de qualquer relatório com fotos ou histórico completo será estritamente **assíncrona**: a API aceita a requisição, enfileira o job, e emite notificação WebSocket/Push com o link de download pronto quando o arquivo for gravado no Supabase Storage.

## Consequências
- A API principal do Express nunca sofrerá bloqueio de CPU ou pico de memória ao gerar relatórios pesados.
- Relatórios elegantes e dignos de apresentação para clientes corporativos e patrocinadores de festivais.
