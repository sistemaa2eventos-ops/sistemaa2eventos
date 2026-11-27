---
name: nzt-design-public-web
description: Use ao criar, alterar ou revisar qualquer página, seção ou componente do frontend/public-web do NZT (Next.js + Tailwind v4 + TypeScript): landing, páginas institucionais, formulários públicos. Garante que o site público pareça da mesma família do painel NZT, com layout limpo, alinhado e sem dados inventados.
---

# NZT Public Web

## 1. Identidade
Mesma família do painel (`nzt-design-system`), com mais respiro: o visitante é público, não está operando sob pressão. Personalidade: técnica, confiável, direta. Ciano sobre azul-noite como assinatura. Sem estética de template de IA (gradiente roxo, glow, cards todos iguais, ícone em círculo colorido).

## 2. Stack
- Next.js 16 (**App Router**) + React 19 + TypeScript + **Tailwind v4**. Ícones: `lucide-react`.
- Componentes são Server Components por padrão. Use `"use client"` só quando houver estado, evento ou API do navegador.
- Tokens em `src/app/globals.css`, dentro de `@theme`. Remova as variáveis `--background` e `--foreground` do template e use os tokens abaixo.
- Fontes via `next/font` (Inter + Space Grotesk), aplicadas por variável CSS. **Nunca** `font-family: Arial` no `body`.
- Nunca classe arbitrária de cor (`bg-[#...]`) nem paleta padrão do Tailwind (`cyan-400`, `slate-300`) fora dos tokens.
- i18n: **i18next + react-i18next**, provedor em `src/components/I18nProvider.tsx`, traduções em `public/locales/{pt-BR,en,es,de}/common.json`.
- Biblioteca de componentes: **nenhuma**. Componentes próprios em `src/components` (`RegistrationForm`, `PhotoCapture`, `PhotoEditor`, `I18nProvider`).

## 3. Tokens (mesmos valores do painel)
```css
@theme {
  --color-fundo: #050B18;
  --color-superficie: #0A1628;
  --color-superficie-elevada: #0F1E37;
  --color-borda: rgb(148 163 184 / 0.16);
  --color-borda-destaque: rgb(0 212 255 / 0.35);
  --color-primaria: #00D4FF;
  --color-primaria-hover: #33DDFF;
  --color-sucesso: #00FF88;
  --color-alerta: #FFB800;
  --color-erro: #FF3366;
  --color-texto: #E8F4FD;
  --color-texto-forte: #FFFFFF;
  --color-texto-secundario: #94A3B8;
  --color-texto-fraco: #7A8BA3;
  --color-sobre-primaria: #000000;
  --font-sans: "Inter", ui-sans-serif, system-ui, sans-serif;
  --font-display: "Space Grotesk", ui-sans-serif, system-ui, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  --radius-controle: 8px;
  --radius-cartao: 12px;
}
```
- Fontes via `next/font` (Inter + Space Grotesk). Sem Arial/Geist.
- Escala de texto: 14, 16, 20, 24, 32, 48, 64px (display só em hero). Nada abaixo de 12px.
- Raios: só 8, 12, 999, 50%. Bordas 1px. Sem sombra colorida.
- Movimento: 150/200ms, `cubic-bezier(0.4,0,0.2,1)`, só `opacity`/`transform`/cores, com `motion-reduce:` respeitado. Sem animação infinita decorativa.

## 4. Layout (regras físicas)
- **Container único** em todas as seções: `mx-auto w-full max-w-6xl px-6 md:px-8`. Nenhuma seção fora dele.
- Estrutura só com **flex/grid no fluxo**. `absolute` apenas para microdetalhe (badge, ícone em input). Sem margem negativa nem `translate` para sobrepor card.
- **Eixo consistente**: se o título da seção é à esquerda, tudo na seção é à esquerda. Centralizado só em hero ou CTA final, se a seção inteira for.
- **Cards lado a lado**: `grid items-stretch` + `flex flex-col justify-between` no card, para rodapés alinhados.
- Variedade sem caos: variar a proporção em `grid-cols-12` (7/5, 8/4) e usar listas com `divide-y` em vez de tudo em card.
- Altura: `min-h-*` ou automática, nunca altura fixa em contêiner de texto.
- Parágrafos com `max-w-[65ch]`. Títulos com `tracking-tight`.
- Sem modal, drawer ou popup aberto por padrão.

## 5. Mobile-first
Escrever do mobile para cima (`md:`, `lg:`). Alvos de toque ≥ 44px. Menu mobile acessível (botão com `aria-expanded`). `env(safe-area-inset-*)` em barras fixas. Inputs com 16px. Testar em 360px.

## 6. Componentes e estados
Botão primário: fundo `primaria`, texto `sobre-primaria`, `min-h-11`, raio 8. Secundário: contorno `borda`. Todo interativo tem hover, `focus-visible` (outline 2px ciano, offset 2px), active, disabled (opacidade 0,45), loading, erro (borda + texto, nunca só cor). Formulário: label sempre visível, erro abaixo do campo, mensagem de sucesso explícita.

## 7. Conteúdo (zero invenção)
- **Nunca inventar** clientes, depoimentos, números, prêmios, endereços, telefones, preços. Sem lorem ipsum.
- Sem dado real: placeholder claro `[Depoimento real do cliente]`, `[Métrica real, ex.: +42%]`. Descrever só o que o sistema faz de verdade, com base no que o usuário informou.
- Português do Brasil, frases curtas, verbo + objeto nos botões, sentence case.

## 8. Acessibilidade e SEO
Um `h1` por página, hierarquia de títulos, `alt` em imagens, contraste ≥ 4,5:1, `next/image` com dimensões, `metadata` por página, links com texto descritivo.

## 9. Protocolo
- Alteração: respeitar a estrutura, mexer só no pedido, entregar o arquivo completo sem `// ...resto igual`.
- Checklist: container único · só tokens · raios 8/12 · sem glow/gradiente decorativo · estados completos · mobile 360px · sem dado inventado · parece do mesmo sistema do painel.

## 10. Dívida conhecida
- `body { font-family: Arial }` anula a fonte carregada (Geist). Remover.
- Fundo `#020617`, ciano `#06B6D4`, `text-cyan-400` e `slate-*`: migrar para os tokens ao tocar em cada página.
- Raio e espaçamento estão no padrão do Tailwind. Padronizar em 8/12/999 e na escala da seção 3.
