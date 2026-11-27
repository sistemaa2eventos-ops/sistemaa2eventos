# Plano de correção de design · NZT

Base: análise de 27/11/2026 com as três skills (`nzt-design-system`, `nzt-design-public-web`, `nzt-design-mobile-app`).
Nenhuma mudança foi feita ainda. Os números são de arquivos versionados no git. Parte das alterações de `web-admin` ainda não tem commit (prévia de direções e `textoFraco`).

## Como vamos trabalhar

- Uma fase por vez, com um commit por fase. Só commitar quando você pedir.
- Cada fase traz: arquivos, critério de aceite e verificação.
- Mudanças visuais aparecem em prévia (captura de tela antes e depois) para você aprovar.
- Nada muda em produção sem a sua aprovação.

## Status (atualizado após as respostas às decisões)

**Decisões tomadas**
- D1: sim. Login de produção sem orbes, grade, scanline e brilho neon do logo e do título. Cartão com `superficie`, borda 1px e `sombras.cartao`.
- D2: sim. Escuro atual em produção; A, B e C ficam como prévia.
- D3: pulsos de alerta mantidos. Removida a linha de scan decorativa de `PhotoCapture.jsx`. Leitura adotada porque a resposta foi ambígua ("mantenha até o scan decorativo").
- D4: sim, trocar Orbitron por Inter e Space Grotesk. **Pendente:** exige instalar dependências (`node_modules` do mobile não existe nesta máquina).
- D5: definido pelas skills. Painel: área de toque de 44px. Mobile: 48dp.

**Já executado (sem commit)**
- Fase 1: `textoFraco` trocado para `#7A8BA3` nos dois portais e nos arquivos do painel que usavam `#64748B`. Restou só o modelo de etiqueta impressa (`modelosPreProntos.js`), que não é cor de interface.
- Fase 1: removidos `app/modal.tsx`, `components/hello-wave.tsx` e as referências deles.
- Fase 4 parcial: removidas as animações `scanline` e `float` de `index.css`, que só o Login usava.
- Build do `web-admin` passou.

**Execução (rodada 2, sem commit)**
- Dependências instaladas: mobile (`npm ci`, 984 pacotes) e `@expo-google-fonts/inter` e `space-grotesk`.
- D4 mobile: `useFonts` com Inter e Space Grotesk em `app/_layout.tsx`, com splash segurada. Orbitron trocada por `fonte.*` em todas as telas.
- Mobile tokens: `constants/theme.ts` virou fonte única (`cores`, `raios`, `espaco`, `fonte`, `texto`, `toque`, `movimento`). `Colors.ts` agora só reexporta para os 17 arquivos antigos. Hex fora do tema no mobile: 146 → 0.
- Mobile toque: alvo do `brandButton` de `devices.tsx` para 48dp. Os cantos de 30px do scanner não são alvo de toque (moldura visual).
- Mobile a11y: `A2Button` com `accessibilityRole`, `accessibilityLabel` e `accessibilityState`.
- Painel tokens: 1.937 trocas de hex exato e `rgba(0,212,255)` para `cores.*` e `tom()`, mais 13 arquivos com hex fora de paleta mapeados para o token equivalente.
- Painel raios: `2`→`1.5`, `4`→`1.5`, `1.25`→`1`, `6px`/`10px`→`8px`.
- Painel texto: `0.68/0.7/0.72rem` → `0.75rem`.
- Painel movimento: `transition: all` trocado por propriedades específicas.
- Painel toque: tema do `MuiIconButton` com `sizeSmall` de 44px mínimo (vale para os 74 usos).
- Painel a11y: `prefers-reduced-motion` global em `index.css`. Novo componente `components/common/Skeleton.jsx`.
- Painel estado vazio: `DataTable` com ícone, título e orientação.
- Painel Login (D1): orbes, grade, scanline e brilho removidos.
- Painel captura (D3): linha de scan removida; pulsos mantidos.
- Portal-produtor: mesmos tokens aplicados; 96 trocas.
- Public-web fontes: Geist e Arial removidos; `next/font` com Inter e Space Grotesk.
- Public-web tokens: `globals.css` com `@theme` completo (skill nzt-design-public-web, seção 3). Classes `cyan`, `slate`, `red`, `green`, `amber` e `bg-[#020617]` mapeadas para os tokens (390 trocas).
- Public-web metadata: 3 páginas cliente ganharam `layout.tsx` de servidor com `metadata` (`privacy`, `privacy/confirmar` e `register/[token]`). `empresa/[token]` tem `metadata` direto.
- Verificações: `vite build` do painel e do portal-produtor passam; `next build` do public-web passa; `tsc` do mobile tem só os 13 erros antigos do módulo `services/supabase` (inexistente no repositório).

**Pendente**
- Mobile `TouchableOpacity` → `Pressable` (39 usos em 14 arquivos). Não feito: a troca tira o feedback de toque, e a skill exige estado de pressionado em cada um. Precisa de desenho por tela.
- Mobile háptico em check-in e check-out, e `isReduceMotionEnabled` nas animações.
- Mobile `ScrollView` em 8 arquivos: conferir se há lista com `.map`.
- Painel: 74 `IconButton` pequenos agora têm 44px pelo tema; conferir os que ficam apertados em tabela densa.
- Painel: tamanhos numéricos fora da escala (18, 22 e 28px); `#000000` (91 usos, quase todos de fundo); `#10B981`, `#EF4444` e demais valores sem token não mapeados.
- Painel: `transition` de propriedades ainda sem revisão visual.
- Public-web: container `max-w-6xl` não aplicado. Páginas `cliente` com cartão claro (convite e ingresso) mantidas com cinza e branco de propósito (decisão sua). Há `shadow` com `#00D4FF` e uma linha de scan decorativa em `cliente/page.tsx`. `metadataBase` ausente (depende do domínio público).
- Verificação visual: o navegador de automação continua ocupado, então não tirei capturas de antes e depois. Recomendo olhar Login, Dashboard, Check-in e a home do public-web antes de commitar.
- Nenhum commit foi feito.

## Fase 0 · Decisões suas (bloqueiam as fases seguintes)

| # | Pergunta | Recomendação |
|---|---|---|
| D1 | Login de produção: remover orbes, grade animada e scanline? | Sim. Manter o cartão e o fundo sólido. A skill proíbe e é a única tela que contradiz a regra de forma explícita. |
| D2 | Direção visual: escuro atual ou A, B ou C? | Escuro atual. A skill define o escuro como o único tema de produção. A, B e C ficam como prévia. |
| D3 | Pulsos e animações de alerta (CFTV, Veículos, captura de foto): manter? | Manter só o indicador "ao vivo" e alerta crítico. Remover o scan decorativo da captura. |
| D4 | Mobile: trocar Orbitron por Inter e Space Grotesk? | Sim. Orbitron não é carregada e não existe nos assets. |
| D5 | Alvo mínimo de toque: 44px (painel) e 48dp (mobile)? | Confirmar. São os valores das skills. |

## Fase 1 · Limpeza técnica (sem mudança visual)

Risco baixo. Não altera aparência, só consistência.

1. **`textoFraco`.** Trocar `#64748B` por `#7A8BA3` em:
   - `frontend/portal-empresa/src/styles/tokens.js`
   - `frontend/portal-produtor/src/styles/tokens.js`
   - Os 16 usos literais de `#64748B` em `frontend/web-admin/src` (ver lista com `git grep 64748B`).
   - Critério: nenhum `64748B` fora de comentário.
2. **Sobras do template Expo no mobile.**
   - Remover `frontend/mobile-app/app/modal.tsx` e a entrada dele no `_layout.tsx`.
   - Remover `hello-wave` de `frontend/mobile-app/app/(tabs)/index.tsx` e o componente, se não tiver outro uso.
   - Critério: nenhuma rota ou referência órfã; app compila.
3. **Cópia de tokens.** Definir como manter os três `tokens.js` iguais. Opções: script de cópia ou pacote compartilhado. Recomendação: script simples, por enquanto.
4. **Remover o `scanline` e a grade do Login (ver D1).** Só o trecho da direção atual. Não mexer nas direções A, B e C.

Verificação: `npm run lint` e `npm run build` em `web-admin`, `portal-empresa` e `portal-produtor`; `tsc --noEmit` no mobile.

## Fase 2 · Tipografia

Risco médio. Muda a aparência de textos.

1. **Mobile: Orbitron → Inter e Space Grotesk.**
   - Instalar `expo-font`, `@expo-google-fonts/inter` e `@expo-google-fonts/space-grotesk`.
   - Carregar em `app/_layout.tsx` com `useFonts`, segurando a splash até carregar.
   - Trocar `fontFamily: 'Orbitron-*'` (59 usos em 12 arquivos) por `fonte.*` do `theme.ts`.
   - Critério: nenhuma string `Orbitron` no código.
2. **Public-web: Arial e Geist → Inter e Space Grotesk.**
   - Em `globals.css`, remover `font-family: Arial` do corpo.
   - Em `layout.tsx`, trocar `Geist` por `Inter` e `Space_Grotesk` do `next/font/google`.
   - Critério: `getComputedStyle(body).fontFamily` começa com Inter.

Verificação: captura de tela das telas principais antes e depois, em desktop e 360px.

## Fase 3 · Tamanho de toque

Risco médio. Muda o tamanho de botões pequenos.

1. **Painel:** 74 `IconButton size="small"`. Prioridade pelos arquivos mais afetados:
   1. `components/producao/AbaProjetosPlantas.jsx` (7)
   2. `components/pessoa/PessoasTable.jsx` (5)
   3. `pages/config/DispositivosPage.jsx`, `pages/Usuarios.jsx`, `components/producao/AbaProdutoresPresenca.jsx`, `components/monitor/AbaOperadoresCentral.jsx` (4 cada)
   - Solução: `size="medium"` ou área de toque de 44px com `sx={{ p: 1.25 }}`. Manter o ícone em 18px.
2. **Mobile:** `scanner.tsx` (30×30) e `devices.tsx` (30 e 40) para 48dp, ou `hitSlop` quando o visual não puder crescer.
3. **Mobile:** trocar `TouchableOpacity` por `Pressable` em 14 arquivos, com estados `pressed` e `disabled`.

Verificação: medir a área de toque no navegador (painel) e no simulador (mobile).

## Fase 4 · Raios e escala de texto

Risco baixo a médio. Mudança sutil de forma e de tamanho.

**Atenção ao MUI:** `borderRadius` numérico vale 8px × valor. Então `2` = 16px, `1.25` = 10px, `4` = 32px.

| Hoje | Ocorrências | Trocar por |
|---|---|---|
| `borderRadius: 2` (16px) | ~72 | `1.5` (12px) |
| `borderRadius: 1.25` (10px) | 8 | `1` (8px) |
| `borderRadius: 4` (32px) | 9 | `1.5` (12px) |
| `'6px'` | 12 | `'8px'` |
| `'10px'` | 7 | `'8px'` |

Texto:

| Hoje | Trocar por | Onde |
|---|---|---|
| `0.68rem`, `0.7rem`, `0.72rem` (~75) | `0.75rem` (12px) | Painel, em todo `fontSize` |
| `18`, `22`, `28` (px) | valor da escala mais próximo, por contexto | Revisar caso a caso |

Verificação: captura de tela de Dashboard, Check-in, Pessoas e Monitor antes e depois.

## Fase 5 · Cores fora dos tokens

Risco alto em volume. Fazer por arquivo, do mais usado para o menos usado.

| Frente | Ocorrências | Arquivos mais afetados |
|---|---|---|
| Painel (`web-admin`) | 1.869 hex e 351 `rgba(0,212,255…)` | `Monitor.jsx` (178), `PermissoesAcesso.jsx` (85), `Veiculos.jsx` (63), `Usuarios.jsx` (51), `DispositivosPage.jsx` (50) |
| `portal-produtor` | 69 | `components/producao/*` |
| Mobile | 146 | `employee/[id].tsx` (21), `(tabs)/index.tsx` (21), `scanner.tsx` (19), `(tabs)/profile.tsx` (18) |
| Public-web | 305 classes do Tailwind e 8 `bg-[#…]` | `RegistrationForm.tsx` (70), `cliente/page.tsx` (37), `PhotoEditor.tsx` (20), `privacy/page.tsx` (20) |

Regras:
- Trocar por token, nunca por outro hex.
- Cores de função (verde, laranja, vermelho, amarelo, roxo de fiscalização) continuam por `funcao.*`.
- No mobile, consolidar `constants/Colors.ts` (17 importadores) em `constants/theme.ts` (2 importadores). Os valores do `Colors.ts` diferem, por exemplo `#E0E0E0` contra `#E8F4FD`. É mudança visual: entra na prévia.

Critério: `git grep` de hex e `rgba` fora de `tokens.js`, `theme.js` e `theme.ts` dá zero, ou só exceções listadas.

## Fase 6 · Estados e componentes

1. **Painel:**
   - Criar `Skeleton` com formato do conteúdo (hoje 0 usos).
   - `DataTable`: estado vazio com ícone, título curto, subtítulo com a ação e botão.
   - `prefers-reduced-motion` global em `index.css` (hoje 0).
2. **Mobile:**
   - `accessibilityLabel` em todo botão só com ícone (hoje 0).
   - `AccessibilityInfo.isReduceMotionEnabled` nas animações (hoje 0).
   - Háptico no check-in e check-out: curto no sucesso, longo no erro.
   - Faixa offline: trocar `#ff4444` e `paddingTop: 40` por `cores.erro` e safe area.
3. **Public-web:** completar estados de formulário (label visível, erro abaixo do campo, sucesso explícito).

## Fase 7 · Estrutura do public-web

1. Criar o container único (`mx-auto w-full max-w-6xl px-6 md:px-8`). Hoje 0 usos.
2. `@theme` em `globals.css` com os tokens da skill. Remover `--background` e `--foreground`.
3. `metadata` em todas as páginas (hoje em 3).
4. Decidir sobre `cliente/page.tsx` e `empresa/[token]/page.tsx`, que não têm `h1`. Confirmar se é intencional.

## Fase 8 · Animações

1. Trocar `transition: all` por propriedades específicas em 23 arquivos.
2. Remover `infinite` onde a decisão D3 não manteve.

## Ordem sugerida

| Ordem | Fase | Tamanho | Muda aparência |
|---|---|---|---|
| 1 | Fase 0 (decisões) | P | — |
| 2 | Fase 1 (técnica) | P | Não |
| 3 | Fase 2 (fontes) | M | Sim |
| 4 | Fase 3 (toque) | M | Sim, pequeno |
| 5 | Fase 4 (raios e texto) | M | Sim, pequeno |
| 6 | Fase 5 (cores), por arquivo | G | Sim |
| 7 | Fase 6 (estados) | M | Sim |
| 8 | Fase 7 (public-web) | M | Sim |
| 9 | Fase 8 (animações) | P | Sim, pequeno |

## Riscos

- **Volume de cores (Fase 5):** 1.869 ocorrências. Fazer por lotes pequenos, com captura de tela de cada lote.
- **Mobile sem simulador aqui:** a verificação do app depende de você ou de um emulador.
- **Navegador de automação ocupado:** as capturas de tela das fases visuais precisam do navegador livre. Se estiver ocupado, eu gero a prévia em HTML.
- **Painel em produção:** cada fase visual passa por aprovação antes do deploy.

## O que deixar como está

- Estrutura de tokens e tema em `tokens.js` e `theme.js`.
- `NeonButton` sem glow, `StatusBadge` com ícone e texto, `KpiCard`.
- Expo Router, banco offline e sincronização do mobile.
- Server Components por padrão no public-web.
- Roteador: `react-router-dom` 7.18 no painel e 6.30 nos portais.
