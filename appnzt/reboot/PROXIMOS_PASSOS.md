# Próximos Passos - NZT Intelligent Control Systems

## Fase 1: Banco de Dados (Supabase)

1. **Criar projeto Supabase**
   - Acesse https://supabase.com e crie um novo projeto
   - Anote as credenciais (URL e chaves)

2. **Executar Schema**
   - Abra o SQL Editor no painel do Supabase
   - Execute o conteúdo de: `supabase/schema.sql`
   - Execute o conteúdo de: `supabase/migration_additions.sql`

3. **Verificar tabelas criadas**
   - Confirme que as seguintes tabelas existem:
     - events, event_dates, event_areas, event_bracelet_types
     - empresas, pessoas, veiculos, documents
     - devices, checkins, users, user_invites, consent_records, audit_logs

---

## Fase 2: Backend

1. **Configurar variáveis de ambiente**
   ```bash
   cd backend
   cp .env.example .env
   ```

2. **Editar arquivo .env**
   Preencha com suas credenciais do Supabase:
   ```
   PORT=3001
   NODE_ENV=development
   SUPABASE_URL=https://seu-projeto.supabase.co
   SUPABASE_ANON_KEY=sua-anon-key
   SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key
   JWT_SECRET=uma-chave-segura-com-mais-de-32-caracteres
   FRONTEND_URL=http://localhost:5173
   FACE_SERVICE_URL=http://localhost:8000
   ```

3. **Instalar dependências**
   ```bash
   npm install
   ```

4. **Testar configuração**
   ```bash
   npm run check:env
   ```

5. **Iniciar o servidor**
   ```bash
   npm run dev
   ```
   O backend estará em: http://localhost:3001

---

## Fase 3: Frontend (Web Admin)

1. **Instalar dependências**
   ```bash
   cd frontend/web-admin
   npm install
   ```

2. **Configurar variáveis (se necessário)**
   ```bash
   cp .env.example .env
   ```

3. **Iniciar o frontend**
   ```bash
   npm run dev
   ```
   O frontend estará em: http://localhost:5173

---

## Fase 4: Face Service (Python/FastAPI) - Opcional

1. **Instalar dependências**
   ```bash
   cd face-service
   pip install -r requirements.txt
   ```

2. **Executar**
   ```bash
   python src/main.py
   ```
   O serviço estará em: http://localhost:8000

---

## Fase 5: Docker (Alternativo)

Se preferir usar Docker:

1. **Configure os arquivos .env** em cada pasta

2. **Execute o Docker Compose**
   ```bash
   docker-compose up --build
   ```

3. **Serviços disponíveis:**
   - Backend: http://localhost:3001
   - Frontend: http://localhost:5173
   - Face Service: http://localhost:8000

---

## Fase 6: Criar Usuário Administrador

Após o sistema estar rodando:

1. **Acesse o banco de dados** (via Supabase SQL Editor)
2. **Insira o usuário admin manualmente:**
   ```sql
   INSERT INTO users (id, email, name, role, active, password_hash)
   VALUES (
     gen_random_uuid(),
     'admin@seuemail.com',
     'Administrador',
     'admin',
     true,
     -- Hash bcrypt de uma senha temporária
   );
   ```

3. **Faça login** no frontend com o email e senha temporária

4. **Altere a senha** através do sistema

---

## Fase 7: Primeiro Evento

1. Faça login como admin
2. Crie um novo evento (nome, localização, configurações)
3. Crie uma empresa de teste
4. Gere o link de cadastro
5. Teste o fluxo completo de cadastro

---

## Verificações e Testes

### Testar API
```bash
# Health check
curl http://localhost:3001/health

# Login
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@seuemail.com","password":"sua-senha"}'
```

### Testar Frontend
- Acesse http://localhost:5173
- Faça login com as credenciais do admin

---

## Estrutura de Pastas

```
appnzt/reboot/
├── backend/              # API Node.js
│   ├── src/
│   │   ├── routes/      # Endpoints
│   │   ├── config/      # Configurações
│   │   └── services/    # Serviços
│   └── .env.example
├── frontend/
│   └── web-admin/       # Frontend React
│       └── src/
│           └── pages/  # Páginas
├── face-service/         # Microserviço facial Python
├── supabase/
│   ├── schema.sql       # Schema do banco
│   └── migration_additions.sql
├── docker-compose.yml
└── README.md
```

---

## Próximas Funcionalidades (Futuro)

- [ ] Portal público para cadastro de colaboradores
- [ ] Integração completa com leitores faciais Intelbras
- [ ] Integração completa com leitores faciais Hikvision
- [ ] Envio de emails (SMTP)
- [ ] Relatórios em PDF
- [ ] App mobile (Expo)
- [ ] Camera IPs
- [ ] Relatório de horas trabalhadas por dia (reset daily)

---

## Suporte

Em caso de erros:
1. Verifique os logs no terminal
2. Confirme as variáveis de ambiente
3. Verifique a conexão com o Supabase
4. Execute `npm run check:env` para validar configurações