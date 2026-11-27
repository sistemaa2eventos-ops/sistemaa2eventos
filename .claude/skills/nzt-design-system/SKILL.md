---
name: nzt-design-system
description: Use esta skill sempre que criar, alterar ou revisar qualquer interface do NZT Intelligent Control System (web-admin, portais, telas, componentes, dialogs, tabelas, dashboards, responsividade mobile). Garante consistência visual com os tokens, a personalidade "sala de controle de precisão" e as regras de layout, estados, acessibilidade e microcopy do projeto. Acione também para pedidos de "melhorar o visual", "padronizar" ou "criar tela nova".
---

# NZT Design System

## 1. Identidade

O NZT é uma **sala de controle de operação de eventos**: usado por portaria e operação, em pé, sob pressão, às vezes de madrugada, às vezes no celular. A interface precisa ser **lida em 1 segundo** e **nunca ambígua**.

Personalidade: técnica, precisa, sóbria, densa na medida certa, direta.

Assinatura visual (preservar sempre):
- Ciano `#00D4FF` sobre azul-noite `#050B18`.
- **Cor por função**: verde = liberado, laranja = saída, vermelho = negado, amarelo = alerta, roxo claro = fiscalização. Cor nunca é enfeite.
- Números grandes em Space Grotesk 700, rótulos pequenos em cinza.

Princípios:
1. **Informação antes de decoração.** Se um elemento não ajuda a ler, decidir ou agir, ele não existe.
2. **Contenção.** Poucas cores fortes por tela. A cor forte aparece onde há estado ou ação.
3. **Hierarquia por tamanho, peso e posição**, não por brilho.
4. **Consistência acima de novidade.** Reutilize componente existente antes de criar outro.
5. **Estrutura acima de efeito.** Nunca sacrifique alinhamento, legibilidade ou veracidade dos dados para parecer "chamativo".

## 2. Stack e fonte da verdade

- Painel: React 18 + Vite + JSX + **MUI 5 / Emotion** (`sx`, `styled`). **Não usar Tailwind no painel.**
- Tokens em `src/styles/tokens.js`; tema em `src/styles/theme.js`. Importar de lá. **Nunca escrever hex, rgba ou px de cor direto no componente.**
- Ícones: `@mui/icons-material`, importação nomeada, tamanho 16 (menu), 18 (botões), 20 (indicadores).
- Somente tema **escuro** em produção. Ignorar as "direções A/B/C" de prévia, a menos que o usuário peça.
- `frontend/public-web` (Next + Tailwind) e `mobile-app` (Expo) são outros contextos. Só aplique esta skill neles se o usuário pedir, e avise que usam stack diferente.
- Versões: `react-router-dom` 7.18 no `web-admin` e 6.30 nos portais (`portal-empresa`, `portal-produtor`). Não use API exclusiva do v7 nos portais. i18n com `i18next` 25.
- Os portais usam cópia idêntica de tokens e tema. Ao alterar um token, replique nos três projetos.

## 3. Tokens (valores fixos)

### Cores
| Token | Valor | Uso |
|---|---|---|
| fundo | `#050B18` | página, sidebar |
| superficie | `#0A1628` | cards, dialogs, cabeçalho de tabela |
| superficieElevada | `#0F1E37` | tooltip, realces |
| borda | `rgba(148,163,184,0.16)` | bordas 1px |
| bordaDestaque | `rgba(0,212,255,0.35)` | hover e foco |
| primaria | `#00D4FF` (hover `#33DDFF`) | ação principal, foco, seleção, links |
| sucesso | `#00FF88` | liberado, online, aprovado |
| alerta | `#FFB800` | pendente, atenção |
| erro | `#FF3366` | negado, erro, excluir |
| saida | `#FF8800` | check-out |
| secundariaClara | `#A855F7` | fiscalização, supervisor |
| texto | `#E8F4FD` | texto padrão |
| textoForte | `#FFFFFF` | títulos e números |
| textoSecundario | `#94A3B8` | rótulos e subtítulos |
| textoFraco | `#7A8BA3` | legendas e rodapés (**ajustado**: o antigo `#64748B` reprova AA) |
| textoSobrePrimaria | `#000000` | texto sobre ciano |

Regras de cor:
- Cor de status vem de `funcao.*` (tokens). Perfis vêm de `papeis.*`.
- **Texto sobre fundo preenchido de erro usa escuro** (`#050B18`), não branco (branco sobre `#FF3366` dá 3,55:1 e reprova).
- Proibido introduzir novos hex. Hoje existem variantes proibidas: `#EF4444`, `#FF0077`, `#F87171` (vermelhos); `#10B981` (verde); `#FBBF24`, `#F59E0B`, `#FFD400`, `#FFD700` (amarelos); `#00B0FF`, `#0EA5E9`, `#38BDF8`, `#0080FF` (cianos); `#0B132B`, `#0F172A`, `#0B1120`, `#1E293B` (azul-marinho). Ao tocar em um arquivo que as use, substitua pelo token equivalente.
- Tinta de status sobre superfície: `tom(cor, 0.10–0.12)` para fundo e `cor + "40"` para borda.
- Nunca `#000` ou `#FFF` em grandes áreas de fundo.

### Tipografia
- Títulos e números: **Space Grotesk** 600/700. Texto e UI: **Inter** 400/500/600. Dados técnicos (IP, MAC, códigos): fonte mono.
- Escala (única permitida): `0.75rem (12)`, `0.8125rem (13)`, `0.875rem (14, corpo)`, `1rem (16)`, `1.25rem (20)`, `1.5rem (24)`, `2rem (32)`.
- **Nada abaixo de 12px.** Proibido `0.65rem`–`0.72rem`.
- Título de página: usar `PageHeader` (1.25rem xs, 1.5rem sm, 1.75rem md). Não inventar H1 por tela.
- Números em tabelas e KPIs: `fontVariantNumeric: 'tabular-nums'`.
- Títulos: `letter-spacing` entre `-0.01em` e `-0.02em`. Texto corrido: máximo `65ch`.
- Caixa: **sentence case** em tudo. `uppercase` só em rótulo pequeno de seção, com `letter-spacing` de `0.06em`.

### Espaçamento
Base de 8px (`theme.spacing`). Valores permitidos: `0.5 · 1 · 1.5 · 2 · 2.5 · 3 · 4` (4, 8, 12, 16, 20, 24, 32px). Padding de card: 2 (16px) padrão, 1.5 em cards densos. Gap de grid: 2 no mobile, 3 no desktop. Entre seções: 3.

### Raios
Somente: **8px** (botões, inputs, **chips**, ícone-caixa), **12px** (cards, dialogs, itens de menu), **999px** (pílula) e **50%** (avatar/ponto). Proibido 6, 10, 16 ou qualquer outro valor. Ao tocar em arquivo com raio fora da lista, converter para o mais próximo.

### Bordas e profundidade
Profundidade vem de **borda 1px + diferença de superfície**, não de sombra. Sombras permitidas: `cartao`, `modal`, `focoPrimaria`. Nada de sombra colorida decorativa.

### Movimento
- Duração: **150ms** (hover, cor) e **200ms** (entrada de elementos, expandir). Easing único: `cubic-bezier(0.4, 0, 0.2, 1)`.
- Animar só `opacity`, `transform`, `background-color`, `border-color`. Nunca `all`.
- **Animação infinita só para estado ao vivo** (ponto "ao vivo", alerta crítico, loading). Proibido scanline, orbes flutuantes e pulso decorativo.
- Toda animação precisa respeitar `@media (prefers-reduced-motion: reduce)` (reduzir a ~0ms ou desligar).

### Glow (regra estrita)
Glow/neon é um **sinal**, não um estilo. Permitido apenas: halo de foco (`focoPrimaria`), ponto de status ao vivo e borda de alerta crítico. Proibido: `textShadow` neon, orbes com blur, sombras coloridas de 25–30px, gradientes decorativos em sidebar e fundo.Sem exceções por tela. A tela `/login` também segue: fundo sólido `fundo`, card com `superficie` + borda 1px, sem orbes, scanline, grade ou gradiente.

## 4. Layout e responsividade

Estrutura global (não alterar sem pedido): sidebar fixa de 280px no desktop; abaixo de **900px (`md`)** vira drawer com topbar fixa (56px xs, 60px sm).

- **Flexbox e CSS Grid (via `Grid`/`Box` do MUI) para toda estrutura.** `position: absolute` só para microdetalhes (badge no canto, ícone dentro de input, overlay de feedback). Sticky é permitido para cabeçalho de tabela e barras de ação.
- **Margens negativas e `translate` para sobrepor cards: proibido.**
- Padding lateral do conteúdo: `{ xs: 1.5, sm: 2.5, md: 3 }` (12/20/24px), igual em todas as telas. Sem container máximo definido: o conteúdo ocupa a área ao lado da sidebar.
- **Alinhamento à esquerda** em telas de trabalho. Centralizado só em estado vazio, login e feedback de check-in.
- **Cards lado a lado**: `Grid` com altura igual (`height: '100%'`) e `display: flex; flexDirection: column; justifyContent: space-between` quando houver rodapé ou ação.
- **Variedade sem caos**: varie a **proporção do grid de 12 colunas** (8/4, 7.5/4.5, 4/8) e use listas com divisórias de 1px em vez de transformar tudo em card. Nem todo bloco precisa de `GlassCard`: KPI e seção de dados usam card, mas listas longas e formulários podem usar divisória e espaço.
- **Altura**: nunca altura fixa em contêiner de texto. Use `minHeight` ou altura automática.
- Dialogs: não abrir nada por padrão sem pedido. Em `< md`, dialog médio/grande ocupa a tela toda; confirmação continua janela.

### Mobile (obrigatório em toda tela nova)
1. Alvos de toque **≥ 44px** (botões, itens de lista, ícones clicáveis). `IconButton size="small"` só com área expandida.
2. Grids empilham: KPIs 2 col (xs) → 3 (sm) → 5 (md). Tabelas largas rolam em um container próprio com `overflowX: 'auto'`.
3. Controle à direita em item de lista desce para a linha de baixo.
4. Respeitar **safe areas**: topbar, drawer e barras fixas usam `env(safe-area-inset-top/bottom)`.
5. Inputs com 16px de fonte (evita zoom no iOS).
6. Testar mentalmente em 360px de largura.

## 5. Componentes (reutilizar, não recriar)

| Necessidade | Usar |
|---|---|
| Botão de ação | `NeonButton` (preenchido ciano, texto preto, `minHeight` 44 em toque) |
| Botão de apoio | `botaoSecundario` (tokens) |
| Ação de linha | `acaoTabela` / `acaoTabelaPerigo` |
| Card | `GlassCard` (fundo superfície, borda 1px, raio 12) |
| Indicador | `KpiCard` (ícone em caixa de 8px com `tom(cor, 0.12)`, número Space Grotesk) |
| Cabeçalho | `PageHeader` |
| Status | `StatusBadge` |
| Confirmação | `ConfirmDialog` via `ConfirmacaoContext` |
| Tabela | `DataTable` |
| Feedback | `notistack` (máx. 3) |

Ordem de botões em dialog: **cancelar à esquerda, ação principal à direita**. Excluir usa vermelho e sempre passa por confirmação com a consequência escrita.

### Estados obrigatórios
Todo componente interativo novo implementa:
- **hover** (borda para `bordaDestaque` ou fundo +8%),
- **focus-visible** (outline 2px ciano com offset 2px, nunca remover outline sem substituto),
- **active** (leve escurecimento ou `translateY(1px)`),
- **disabled** (opacidade 0,45 + `cursor: not-allowed`),
- **loading** (spinner 18px, largura do botão preservada),
- **error** (borda `erro` + mensagem de texto, nunca só cor),
- **vazio** (ícone 60px a 20%, título curto, subtítulo com a ação, botão),
- **carregando de tela** (preferir `Skeleton` com o formato do conteúdo em vez de spinner solto).

Status nunca é comunicado só por cor: sempre cor + ícone ou texto.

## 6. Anti-padrões (o que evitar → o que fazer)

| Evitar | Fazer |
|---|---|
| Glow neon, orbes, scanline, gradiente decorativo | Borda 1px + superfície; glow só para estado |
| Tudo em card idêntico | Variar grid e usar listas com divisória |
| Ícone em círculo colorido | Ícone em caixa de 8px com fundo tingido |
| Roxo decorativo | Roxo só para fiscalização/supervisor |
| Cor nova "porque ficou bonito" | Token existente |
| `all 0.3s` em transição | Propriedades específicas, 150/200ms |
| Texto de 11px | Mínimo 12px |
| `textoFraco` antigo `#64748B` | `#7A8BA3` |
| Texto branco sobre vermelho preenchido | Texto escuro (`#050B18`) |
| Componente novo parecido com um existente | Estender o existente com variante |

Tela nova **deve parecer do mesmo sistema**: mesmo `PageHeader`, mesmo padding, mesmos cards, mesma ordem de ações.

## 7. Conteúdo e dados (zero invenção)

- **Nunca inventar** nomes, métricas, depoimentos, IPs, documentos ou dados de pessoas. Sem `lorem ipsum`.
- Se faltar dado real, usar placeholder explícito: `[Nome do participante]`, `[Total de check-ins]`. Dados mockados só se o usuário pedir, e marcados no código com `// MOCK`.
- Idioma: **português do Brasil**. Todo `t('chave', { defaultValue: '…' })` precisa de `defaultValue` em português.
- Tom: direto, operacional, explícito sobre consequência. Frases curtas.
  - Botões: verbo + objeto (`Salvar câmera`, `Confirmar exclusão`); criação: `Novo + substantivo`.
  - Erro: o que falhou + causa + o que fazer. Ex.: "Não foi possível salvar a câmera: {erro}".
  - Ação destrutiva: dizer o que será afetado. Ex.: "Quem não estiver no evento passa a 'ausente'. Continuar?"
  - Vazio: título curto + subtítulo com a próxima ação.
- Datas: `dd/MM/yyyy`; hora `HH:mm`. Sempre `toLocale…('pt-BR')` com locale explícito. Moeda: `pt-BR` com `BRL`.

## 8. Acessibilidade (mínimos)

- Contraste ≥ 4,5:1 para texto normal, ≥ 3:1 para texto grande e ícones de UI.
- `aria-label` em todo botão só com ícone; `alt` em imagens; hierarquia de títulos (um `h1` por tela).
- Gráficos com `role="img"` e `aria-label` resumindo o dado.
- Foco por teclado visível e ordem lógica em dialogs (foco entra e volta).

## 9. Protocolo de trabalho

### Ao criar uma tela nova
1. Leia `tokens.js`, `theme.js`, `PageHeader` e uma tela parecida antes de escrever.
2. Monte: `PageHeader` → indicadores (se houver) → conteúdo principal → ações.
3. Defina os estados (vazio, carregando, erro) **antes** do caso feliz.
4. Verifique mobile com o checklist da seção 4.

### Ao alterar uma tela existente
1. **Respeite a estrutura atual.** Mudou uma seção? Altere só ela.
2. **Não refatore o que não foi pedido.** Se encontrar hex fora dos tokens no trecho que você está editando, substitua. Fora dele, apenas **avise** em uma linha.
3. Verifique colisões: sem altura fixa em texto, sem `absolute` estrutural.
4. Entregue o código completo do arquivo alterado, sem `// ...resto igual`.

### Checklist final (rode mentalmente antes de entregar)
- [ ] Zero hex/rgba novos fora de `tokens.js`; só tokens.
- [ ] Raios só 8/12/999; fontes ≥ 12px e dentro da escala.
- [ ] Sem glow, gradiente ou animação decorativa; animação infinita só para estado ao vivo.
- [ ] Todos os estados do componente implementados.
- [ ] Alvos de toque ≥ 44px e safe areas no mobile.
- [ ] Contraste conferido (atenção ao texto sobre erro e ao `textoFraco`).
- [ ] Textos em pt-BR, sem dados inventados, ações destrutivas com confirmação.
- [ ] Parece da mesma família das outras telas.

## 10. Dívida conhecida (informar, não corrigir sem pedido)
- Tokens duplicados em `web-admin`, `portal-empresa` e `portal-produtor`: ajuste feito em um precisa ser replicado nos outros.
- `GlassCard` não tem vidro nem blur (nome legado). Não adicionar blur.
- `Monitor.jsx`, `PermissoesAcesso.jsx` e `Veiculos.jsx` concentram hex fora dos tokens.
- Falta `prefers-reduced-motion` global e `Skeleton`.
- `Login.jsx` ainda tem orbes, scanline e grade: precisa ser refeito para cumprir a regra de glow.
- `theme.js` L158 (chip com 6px) deve ir para 8px.
- `textoFraco` ainda está como `#64748B` em `portal-empresa` e `portal-produtor`. No `web-admin` já está `#7A8BA3` (alteração sem commit). Usar `#7A8BA3` no `tokens.js` dos três projetos.
- Router em versões diferentes entre admin e portais.

## 11. Tema claro (planejado, não ativo)

Só implementar quando o usuário pedir. Quando implementar, **todo componente lê cor do tema por modo** (`theme.palette.mode`), nunca hex direto. É por isso que a regra "zero hex fora de tokens" é pré-requisito.

A identidade se mantém: mesma cor por função, mesma estrutura, mesmas fontes, mesmos raios. Muda a paleta e a forma de dar profundidade.

| Token | Claro | Observação |
|---|---|---|
| fundo | `#EEF2F7` | nunca `#FFF` em área grande |
| superficie | `#FAFBFD` | cards, dialogs |
| superficieElevada | `#FFFFFF` | só realce pontual |
| borda | `rgba(15,30,55,0.12)` | 1px |
| bordaDestaque | `rgba(0,119,160,0.45)` | hover e foco |
| primaria (fundo de botão) | `#0077A0` | texto branco sobre ela (~5,1:1) |
| primariaTexto (links, ícones ativos) | `#0077A0` | o `#00D4FF` **não** serve como texto no claro |
| sucesso | `#007A52` | |
| alerta | `#9A5B00` | |
| erro | `#D1123F` | |
| saida | `#B54A00` | alerta e saída ficam próximos: **sempre** par com ícone/texto |
| secundariaClara | `#7E22CE` | fiscalização |
| texto | `#0B1B2E` | |
| textoForte | `#050B18` | |
| textoSecundario | `#4B5C73` | |
| textoFraco | `#5F6E85` | ~5:1 sobre superfície, ~4,6:1 sobre fundo |

Razões estimadas por cálculo manual: **validar com ferramenta de contraste antes de oficializar.**

Regras do claro:
- Profundidade por borda e diferença de superfície, como no escuro. Sombra só leve (`0 1px 2px rgba(15,30,55,0.08)`); modal `0 16px 48px rgba(15,30,55,0.18)`.
- Sem glow nenhum. Foco: outline 2px `primaria`, offset 2px.
- Tinta de status: `tom(cor, 0.10)` no fundo e borda `cor + "40"`, igual ao escuro.
- Sidebar no claro: `superficie` com borda direita 1px (não escurecer a sidebar para "parecer premium").
- Gráficos e SVG: ler cor do tema, nunca fixar.
- Escolha de tema: preferência do usuário salva e, na ausência, `prefers-color-scheme`. Nunca alternar sozinho durante operação.
