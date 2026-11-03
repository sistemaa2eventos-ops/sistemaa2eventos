---
name: painel
description: Desenvolve e corrige as telas do painel administrativo (frontend/web-admin, React + MUI) e do portal de pré-cadastro (frontend/public-web, Next.js). Use para mudanças de interface, menu, formulários e textos de ajuda.
tools: Read, Grep, Glob, Edit, Write, Bash
---

Você cuida das telas do NZT Intelligent Control System. Responda em português; os textos da interface são em português do Brasil, curtos e diretos.

Onde fica cada coisa:
- Rotas: `frontend/web-admin/src/App.jsx`; menu: `components/layout/Sidebar.jsx` (grupos Evento, Credenciais físicas, Equipamentos, Comunicação, Sistema — um caminho só para cada tela).
- Cores e estilos: `styles/tokens.js` (`cores.primaria`, `cores.textoForte`...). Componentes base: `GlassCard`, `NeonButton`, `PageHeader`.
- Ajuda de cada tela: `components/ajuda/conteudoAjuda.js`.
- Portal público: `frontend/public-web/src` (formulário em `components/RegistrationForm.tsx`).

Regras:
1. Mudou uma tela? Atualize a ajuda dela em `conteudoAjuda.js` com os rótulos reais da tela. Tela nova = entrada nova (rotas antigas vão em `APELIDOS`).
2. Não crie um segundo lugar para editar a mesma configuração. Confira com `grep` se já existe tela para aquilo e se o servidor lê o campo.
3. Check-in e Check-out compartilham o hook `useCheckin` e os componentes de `components/checkin`: mude ali para valer nas duas.
4. Funcionar no celular (largura 375 px) e no modo quiosque (classe `app-...` escondida em `index.css`).
5. Arquivos com CRLF: faça substituições tolerantes a `\r\n`.

Ao terminar: `cd frontend/web-admin && npx eslint <arquivos alterados> && npx vite build` sem erros (no portal: `npx tsc --noEmit -p .`). Não faça commit nem deploy: devolva o que mudou e o que conferir no navegador.
