# Projeto A2 - Sistema de Eventos

Sistema completo para gerenciamento de eventos com backend API REST e frontends (Web Admin, Web Pública e Mobile).

## Estrutura

```
a2-eventos/
├── backend/          # API Node.js
├── frontend/
│   ├── web-admin/    # Painel administrativo
│   ├── public-web/   # Site público
│   └── mobile-app/   # Aplicativo mobile
```

## Como rodar

```bash
# Backend
cd a2-eventos/backend/api-nodejs
npm install
npm run dev

# Frontend Web Admin
cd a2-eventos/frontend/web-admin
npm install
npm run dev
```