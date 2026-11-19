# ADR 0001: Biblioteca de Canvas para o Editor de Planta Baixa Colaborativo
**Status:** Proposto  
**Data:** 19/11/2026  
**Decisores:** Arquiteto de Software / Tech Lead, Time de Desenvolvimento  

---

## Contexto
O Módulo de Produção exige a exibição de plantas baixas de eventos em alta resolução (PNG/SVG derivados de arquivos arquitetônicos ou PDFs de engenharia), com navegação fluida (zoom, pan), escala métrica calibrável, divisão em setores poligonais coloridos, inserção e manipulação de elementos da biblioteca (palco, tendas, banheiros químicos, geradores, grades, extintores) e marcação de intervenções técnicas com caixas de texto e medidas. Além disso, as intervenções devem ser salvas como camadas vetoriais em formato JSON para permitir a comparação visual de diferenças (*diff*) entre a planta oficial e a proposta do produtor.

## Opções Avaliadas
1. **Konva.js / React-Konva**:
   - *Prós*: Biblioteca de canvas 2D de alta performance baseada em renderização por nós (Stage, Layer, Group, Shape); bindings oficiais para React (`react-konva`); excelente gerenciamento de eventos de toque/arraste/redimensionamento (`Transformer`); serialização e deserialização nativa para JSON (`stage.toJSON()`); suporte nativo a camadas (layers) isoladas para separar a planta base das intervenções e dos setores.
   - *Contras*: Não inclui ferramentas prontas de desenho à mão livre (requer manipulação de eventos de mouse/toque com `Line`).
2. **Fabric.js**:
   - *Prós*: Muito rica em filtros e manipulação de SVG/pincéis de desenho livre.
   - *Contras*: Integração com React mais imperativa e complexa de sincronizar com o estado declarativo; peso maior de biblioteca; renderização de centenas de nós em zoom contínuo pode ter performance inferior a Konva em aparelhos móveis.
3. **tldraw**:
   - *Prós*: Experiência moderna de whiteboard/quadro branco estilo Figma/Miro pronta de fábrica.
   - *Contras*: Altamente opinativa na interface e no comportamento; difícil de restringir para a precisão métrica milimétrica de plantas de engenharia e cálculo de escala real; licença comercial específica para certas aplicações.

## Decisão
Adotamos **Konva.js (`react-konva` e `konva`)** para o editor de plantas baixas.

## Justificativa
- Integração natural com a stack React 18 do `web-admin`.
- Suporte nativo ao modelo mental de camadas (Layer 0: Imagem da planta base com escala calibrada; Layer 1: Polígonos dos setores; Layer 2: Blocos e elementos da biblioteca; Layer 3: Intervenções e anotações da proposta).
- Serialização declarativa JSON que viabiliza diretamente o fluxo de proposta (cópia do JSON da versão oficial + adições/remoções do produtor) e diff visual entre versões oficiais e propostas.
- Excelente performance em telas touch e celulares no campo.

## Consequências
- A conversão inicial de arquivos DWG/DXF/PDF em imagem base será realizada no backend ou via biblioteca de rasterização, servindo uma imagem limpa ao canvas.
- O time implementará um componente React encapsulado (`<EditorPlantaCanvas />`) que gerencia a escala, o histórico de comandos e os nós de transformação.
