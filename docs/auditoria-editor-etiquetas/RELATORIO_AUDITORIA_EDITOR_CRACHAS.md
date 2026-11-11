# NZT — AUDITORIA VISUAL E TÉCNICA: EDITOR DE CRACHÁS E ETIQUETAS

**Data do Levantamento:** 11 de Novembro de 2026  
**Status do Módulo:** Operacional em Produção  
**Diretório de Auditoria:** `docs/auditoria-editor-etiquetas/`  
**Referência Visual Primária:** [`01_referencia_usuario_pagina_atual.jpg`](file:///c:/Users/Nat%C3%A1lia%20Alves/Desktop/Projeto_A2_Eventos/docs/auditoria-editor-etiquetas/01_referencia_usuario_pagina_atual.jpg)

---

## 1. IDENTIFICAÇÃO E REGISTRO DA PÁGINA

| Atributo | Definição no Projeto |
| :--- | :--- |
| **Nome da Página** | Etiquetas e crachás |
| **Rota do Frontend** | `/config/etiquetas` |
| **Arquivo Principal** | `frontend/web-admin/src/pages/config/ConfigEtiquetas.jsx` |
| **Serviço de Renderização e Impressão** | `frontend/web-admin/src/services/etiquetaService.js` |
| **Componente de Pré-Visualização** | `frontend/web-admin/src/components/credenciamento/PreviewEtiquetaDialog.jsx` |
| **Controller Backend** | `backend/api-nodejs/src/modules/system/config.controller.js` (`getEtiquetas`, `saveEtiquetas`, `getEtiquetaPessoa`) |
| **Tabela no Supabase** | `public.evento_etiqueta_layouts` (chave única: `evento_id`) |

---

## 2. AUDITORIA DA IDENTIDADE VISUAL DO NZT

A interface do NZT segue rigorosamente um **Design System Cyberpunk / High-Tech Dark Mode**. 
Com base em `src/styles/tokens.js` e na captura de referência, foram auditados os seguintes padrões:

### A. Paleta de Cores e Tokens Oficiais
* **Fundo da Aplicação:** `#050B18` e `#0A1628` (azul profundo escurecido).
* **Superfícies de Vidro (Cards e Modais):** `GlassCard` translúcido com `background: rgba(10, 22, 40, 0.7)`, `backdrop-filter: blur(12px)` e borda sutil `rgba(0, 212, 255, 0.2)`.
* **Cor Primária / Destaque / Ação:** `#00D4FF` (Ciano elétrico) com hover `#33DDFF`.
* **Cor Secundária / Acento:** `#7B2FBE` e `#A855F7` (Roxo neon).
* **Cores de Estado e Feedback:**
  * Sucesso / Liberado: `#00FF88` (Verde neon).
  * Atenção / Alerta: `#FFB800` (Âmbar).
  * Erro / Exclusão: `#FF3366` (Vermelho neon).
  * Linhas Guia Magnéticas: `#FF0077` (Magenta).
* **Tipografia Oficial:**
  * Títulos e Cabeçalhos: `"Space Grotesk", sans-serif`.
  * Textos, Rótulos e Dados: `"Inter", -apple-system, sans-serif`.
  * Tamanho base de interface: `14px` (`0.875rem`).

---

## 3. ANÁLISE ESTRUTURAL DA PÁGINA ATUAL (`ConfigEtiquetas.jsx`)

A tela está dividida em duas colunas principais no grid desktop:

### Coluna Esquerda (`Grid md={4.5} lg={4}`) — Painel de Controles
1. **Formato e Dimensões:**
   * Dropdown com presets: Zebra TLP ($100\times150\text{ mm}$), Crachá PVC CR-80 Vertical ($54\times86\text{ mm}$), Crachá PVC Horizontal ($86\times54\text{ mm}$), Credencial Grande Festival ($100\times140\text{ mm}$), Etiquetas adesivas e Customizado.
   * Campos numéricos de Largura ($mm$) e Altura ($mm$).
   * Seção de upload da Arte do Evento / Fundo (converte arquivo local para Base64 e insere no `background_url`).
2. **Adicionar Elementos:**
   * Botões compactos: `Texto / Dado`, `QR Code`, `Foto da Pessoa`, `Logo / Imagem` e `Tarja / Barra Colorida`.
3. **Propriedades da Seleção (Painel Contextual Dinâmico):**
   * *Alinhamento Rápido:* Botões para Centro X, Centro Y e Centro Total.
   * *Controle de Proporção:* Toggle entre Proporção Real Travada (Cadeado fechado) ou Redimensionamento Livre / Esticar (Cadeado aberto).
   * *Controles Específicos por Tipo:*
     * Texto: Conteúdo/Tags, Tamanho de fonte, Cor do texto (HEX), Peso (Normal/Negrito) e Alinhamento (Esq/Centro/Dir).
     * Foto: Raio da borda (quadrada a circular) e Cor da moldura.
     * Tarja: Cor de preenchimento e Slider de opacidade.
     * QR Code: Definição da tag `{qr_code}` ou `{cpf}`.
4. **Ações Globais:**
   * Botão `Salvar Layout do Evento` (NeonButton verde/ciano).
   * Botão `Imprimir Teste de Crachá` (abre a impressão direta com dados de teste).

### Coluna Direita (`Grid md={7.5} lg={8}`) — Mesa de Trabalho (Canvas)
1. **Barra Superior de Ferramentas:**
   * Título com dimensões ativas ($mm$).
   * Interruptor da **Grade** (ativa/desativa malha quadriculada).
   * Interruptor de **Alinhamento Automático** (*Snap to Grid*).
   * Seletor de precisão da grade ($5\text{px}$, $10\text{px}$, $20\text{px}$).
2. **Mesa de Trabalho Escura:**
   * Fundo escurecido translúcido (`rgba(0,0,0,0.6)`) com borda tracejada ciano.
3. **Prancheta do Crachá / Etiqueta:**
   * Cartão branco centralizado via CSS Flexbox (`m: 'auto'`), garantindo que modelos grandes não sejam cortados.
   * Escala milimétrica de tela: $1\text{mm} = 3\text{px}$.
   * Se for crachá de PVC (CR-80), aplica raio de cantos arredondados de $12\text{px}$.
   * Renderiza a imagem de fundo (se houver) e os nós interativos gerenciados pela biblioteca `react-rnd`.
4. **Guias Inteligentes Magnéticas:**
   * Linhas magenta neon de $1.5\text{px}$ que acendem dinamicamente durante o arrasto ao cruzar o centro da prancheta ou o alinhamento com outros elementos.

---

## 4. MAPEAMENTO DAS TRÊS SITUAÇÕES OPERACIONAIS

### 🔹 Situação A — Arte Completamente Pronta
* **Como opera hoje:** O operador faz o upload da arte completa em `Subir Arte (PNG/JPG)`. A imagem é aplicada ao fundo da prancheta. Em seguida, posiciona apenas os campos dinâmicos (`{nome_pessoa}`, `{empresa}`, `{qr_code}`) nos vazios reservados pelo designer da gráfica.
* **Avaliação:** Atende perfeitamente a impressão de cartões em branco onde a impressora estampa a arte junto com os dados.

### 🔹 Situação B — Criação Completa da Arte do Zero
* **Como opera hoje:** O operador pode desenhar o crachá adicionando tarjas coloridas para setorização (ex: VIP, Imprensa), logotipos dos patrocinadores, foto da pessoa, textos coloridos e QR Code.
* **Oportunidades de Evolução Identificadas:**
  * Ausência de formas adicionais (círculo, retângulo com borda, divisores e linhas finas).
  * Ausência de código de barras tradicional 1D (Code 128 / EAN).
  * Ausência de seleção de tipografias artísticas (Google Fonts pré-carregadas).

### 🔹 Situação C — Arte como Referência Visual (Crucial)
* **Gargalo Atual Identificado:**
  No arquivo `etiquetaService.js` (linha 47), a imagem de fundo é inserida diretamente na folha de impressão `@page`:
  ```javascript
  const bgUrl = papel.background_url || null;
  const bgStyle = bgUrl ? `background-image: url('${bgUrl}');` : 'background-color: #ffffff;';
  ```
  **Consequência:** Se o operador estiver imprimindo em cartões de PVC **que já vieram impressos da gráfica** (pré-impressos) e usou a arte apenas para posicionar os dados no lugar exato, a impressora de crachás tentará imprimir a arte por cima do cartão já impresso, borrando o crachá.
* **Arquitetura da Solução sem Quebra:**
  O JSON de `papel_config` aceita propriedades adicionais sem afetar o banco. Podemos incluir:
  * `modo_referencia: boolean` (quando ativo, a imagem funciona como guia visual).
  * `imprimir_fundo: boolean` (define se a imagem vai para o driver da impressora ou se é ignorada na geração do HTML).
  * `opacidade_referencia: number` (slider de $10\%$ a $100\%$ para esmaecer a arte guia durante a montagem).
  * `travar_referencia: boolean` (bloqueia qualquer interação acidental com a imagem de fundo).

---

## 5. RECURSOS TÉCNICOS E PERSISTÊNCIA

* **Frontend:** React 18, Vite, Material-UI (MUI v5).
* **Manipulação de Nós no Canvas:** `react-rnd` (React Resizable and Draggable).
* **Motor de Impressão:** Geração dinâmica de HTML no `etiquetaService.js` com dimensões CSS `@page { size: ${largura}mm ${altura}mm; margin: 0; }` enviado para iframe invisível com foco automático de impressão do Windows.
* **Estrutura do Banco no Supabase (`evento_etiqueta_layouts`):**
  ```json
  {
    "papel_config": {
      "layout": "cr80_vertical",
      "width": 54,
      "height": 86,
      "background_url": "data:image/png;base64,...",
      "modo_referencia": false,
      "imprimir_fundo": true
    },
    "elementos": [
      {
        "id": "1",
        "type": "text",
        "content": "{nome_pessoa}",
        "x": 10,
        "y": 15,
        "width": 220,
        "height": 35,
        "fontSize": 18,
        "fontWeight": "bold",
        "color": "#000000",
        "textAlign": "center"
      },
      {
        "id": "4",
        "type": "foto",
        "content": "{foto_url}",
        "x": 80,
        "y": 200,
        "width": 80,
        "height": 80,
        "borderRadius": 8,
        "borderColor": "#00D4FF",
        "borderWidth": 2,
        "lockAspectRatio": true
      }
    ]
  }
  ```

---

## 6. MAPA DE EVOLUÇÃO VISUAL PROPOSTO (SEM DESCARACTERIZAR O NZT)

Para manter $100\%$ da identidade visual do NZT e não criar uma página diferente, a evolução recomendada se dá por **organização em abas ou expansores sutis** na coluna esquerda existente:

1. **Camada de Referência Visual (Situação C):**
   * Logo abaixo do botão de arte de fundo, adicionar os seletores:
     * Chave: *Utilizar apenas como referência visual (Não imprimir)*.
     * Slider: *Transparência da Arte Guia*.
2. **Painel de Camadas e Ordenação (Layers):**
   * Uma mini lista sanfonada (Accordion) mostrando os elementos na ordem de empilhamento, permitindo:
     * Trazer para frente / Enviar para trás.
     * Ocultar / Exibir (olho).
     * Travar posição (cadeado de movimento).
3. **Biblioteca Expandida de Formas:**
   * Ícones vetoriais de crachás (VIP, Staff, Acesso Livre, Imprensa, Alimentação).
   * Linha divisória horizontal/vertical.
   * Suporte a Código de Barras 1D (`barcode_128`).
4. **Histórico de Edição:**
   * Botões discretos de `Desfazer (Ctrl+Z)` e `Refazer (Ctrl+Y)` posicionados na barra superior ao lado do switch da grade.

