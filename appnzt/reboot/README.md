# NZT - Intelligent Control Systems (Reboot)

Sistema completo de credenciamento e controle de acesso para eventos.

## 🚀 Quick Start

### 1. Banco de Dados (Supabase)

1. Crie um projeto no [Supabase](https://supabase.com)
2. Execute o schema em `supabase/schema.sql` no SQL Editor
3. Execute as migrações em `supabase/migration_additions.sql`

### 2. Backend

```bash
cd backend
cp .env.example .env
# Edite o .env com suas chaves do Supabase
npm install
npm run dev
```

### 3. Frontend

```bash
cd frontend/web-admin
npm install
npm run dev
```

### 4. Docker (opcional)

```bash
docker-compose up --build
```

## 📡 API Endpoints

### Autenticação
- `POST /api/auth/login` - Login
- `POST /api/auth/register` - Registro (via convite)
- `POST /api/auth/forgot-password` - Recuperação de senha
- `POST /api/auth/change-password` - Alterar senha
- `GET /api/auth/me` - Perfil do usuário

### Público
- `GET /api/public/company/:token` - Dados da empresa por token
- `POST /api/public/register-employee/:token` - Cadastrar colaborador
- `POST /api/public/validate-invite` - Validar convite

### Check-in
- `POST /api/checkin/checkin` - Check-in manual
- `POST /api/checkin/checkout` - Check-out manual
- `POST /api/checkin/face-verify` - Verificação facial
- `GET /api/checkin/logs` - Logs de acesso

### Eventos (Admin)
- `GET /api/events` - Listar eventos
- `POST /api/events` - Criar evento
- `PUT /api/events/:id` - Atualizar evento
- `DELETE /api/events/:id` - Deletar evento

### Empresas
- `GET /api/companies` - Listar empresas
- `POST /api/companies` - Criar empresa
- `POST /api/companies/:id/regenerate-link` - Gerar novo link de cadastro

### Pessoas
- `GET /api/people` - Listar pessoas
- `POST /api/people` - Criar pessoa
- `PATCH /api/people/:id/status` - Alterar status (pendente/autorizado/negado/checkin/checkout/bloqueado)

### Veículos
- `GET /api/vehicles` - Listar veículos
- `POST /api/vehicles` - Criar veículo

### Documentos
- `GET /api/documents` - Listar documentos
- `GET /api/documents/pending` - Documentos pendentes
- `PATCH /api/documents/:id/review` - Revisar documento

### Dispositivos
- `GET /api/devices` - Listar dispositivos
- `POST /api/devices` - Adicionar dispositivo
- `POST /api/devices/:id/test` - Testar dispositivo
- `POST /api/devices/intelbras/push` - Push da Intelbras
- `POST /api/devices/hikvision/push` - Push da Hikvision

### Usuários (Admin)
- `GET /api/users` - Listar usuários
- `POST /api/users/invite` - Criar convite
- `PUT /api/users/:id` - Atualizar usuário
- `PATCH /api/users/:id/toggle-status` - Ativar/Desativar

### Relatórios
- `GET /api/reports/daily/:evento_id` - Relatório diário (Excel)
- `GET /api/reports/summary/:evento_id` - Resumo do evento

### Monitoramento
- `GET /api/monitor` - Status do servidor
- `GET /api/monitor/db` - Status do banco

## 🔐 Hierarquia de Usuários

- **admin**: Acesso total, cria eventos e usuários
- **operador**: Acesso ao evento assigned, CRUD de pessoas/empresas

## 📊 Fluxo de Cadastro

1. Admin cria evento
2. Admin cria empresa e gera link de cadastro
3. Empresa envia link para colaboradores
4. Colaborador se cadastra (status: pendente)
5. Admin/Operador analisa e aprova/nega
6. Se aprovado, colaborador pode fazer check-in

## 🔧 Variáveis de Ambiente

```env
PORT=3001
NODE_ENV=development
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxx
JWT_SECRET=xxx
FRONTEND_URL=http://localhost:5173
FACE_SERVICE_URL=http://localhost:8000
```

## 🛠️ Tecnologias

- **Backend**: Node.js, Express, Supabase
- **Frontend**: React, Vite, MUI
- **Database**: PostgreSQL (Supabase)
- **Face Service**: Python, FastAPI

## 📝 Licença

MIT - NZT Intelligent Control Systems