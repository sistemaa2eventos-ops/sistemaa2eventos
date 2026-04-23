# 📋 GUIA DE IMPLEMENTAÇÃO — Correções Críticas

**Data:** 2026-04-23  
**Status:** EM EXECUÇÃO  
**Completado:** 3/6

---

## ✅ CONCLUÍDO

### **1. Validação de Variáveis de Ambiente**
```
✅ Arquivo criado: src/config/env.js
✅ Integrado ao app.js
✅ Valida 4 vars obrigatórias
✅ Valida 10 vars opcionais com fallback
✅ Falha com erro claro se algo falta
```

**Como funciona:**
```javascript
// No app.js (linha 8-9):
const { validateEnvironment } = require('./config/env');
const ENV = validateEnvironment();

// Se falta SUPABASE_URL, irá retornar:
// ❌ ERRO CRÍTICO: Variáveis de ambiente faltando: SUPABASE_URL
```

---

### **2. Global Error Handler**
```
✅ Arquivo criado: src/middleware/errorHandler.js
✅ Integrado ao app.js
✅ Centraliza tratamento de erros
✅ Nunca retorna stack trace em produção
✅ Estrutura de resposta padrão
```

**Como funciona:**
```javascript
// Qualquer erro agora retorna:
{
  "success": false,
  "error": "Mensagem amigável",
  "statusCode": 500,
  "timestamp": "2026-04-23T10:30:00Z"
}

// Em produção, NUNCA retorna stack trace
// Em desenvolvimento, retorna stack trace para debugging
```

---

### **3. Configuração Padrão de Timeouts**
```
✅ Arquivo criado: src/config/timeouts.js
✅ 9 constantes de timeout documentadas
✅ Integrado ao device.controller.js
✅ 2 usos já substituídos (testConnection, health check)
```

**Constantes disponíveis:**
```javascript
const { TIMEOUT_CONFIG } = require('./config/timeouts');

TIMEOUT_CONFIG.DEVICE_CONNECTION    // 15s - Teste de conexão
TIMEOUT_CONFIG.DEVICE_SNAPSHOT      // 25s - Captura de câmera
TIMEOUT_CONFIG.DEVICE_HEALTH_CHECK  // 12s - Health check
TIMEOUT_CONFIG.API_REQUEST          // 10s - Request normal
TIMEOUT_CONFIG.LONG_OPERATION       // 60s - Relatórios, sync
TIMEOUT_CONFIG.FILE_OPERATION       // 30s - Upload/download
TIMEOUT_CONFIG.HARDWARE_CALLBACK    // 25s - Intelbras/Hikvision
TIMEOUT_CONFIG.SMTP_TEST            // 15s - Email test
TIMEOUT_CONFIG.EMAIL_SEND           // 20s - Email send
```

---

## 🔄 EM PROGRESSO

### **4. Validação de Input com Express-Validator**
```
✅ Arquivo criado: src/middleware/validators.js
⏳ Precisa ser aplicado nas rotas
```

**Próximo passo:**

Adicionar as validações nas rotas. Exemplo para device.routes.js:

```javascript
// ANTES:
const deviceRoutes = require('./device.routes');
router.post('/', authorize('admin', 'supervisor'), deviceController.create);

// DEPOIS:
const { deviceValidators, handleValidationErrors } = require('../../middleware/validators');
router.post('/', 
  authorize('admin', 'supervisor'),
  deviceValidators.create,           // Validação
  handleValidationErrors,             // Tratamento de erros
  deviceController.create
);
```

---

## 📝 TODO - Próximos Passos

### **HOJE (Continuação)**

#### **Passo A: Aplicar Validações em Routes Críticas**

**Arquivos a atualizar:**
```
1. src/modules/devices/device.routes.js
   - create (POST /)
   - testConnection (POST /test-connection)
   - update (PUT /:id)

2. src/modules/entities/pessoa.routes.js
   - create (POST /)
   - update (PUT /:id)

3. src/modules/system/settings.routes.js
   - verify-smtp (POST /verify-smtp)
```

**Exemplo de implementação:**
```javascript
// device.routes.js
const { deviceValidators, handleValidationErrors } = require('../../middleware/validators');

// Adicionar no POST /:
router.post('/', 
  authorize('admin', 'supervisor'),
  deviceValidators.create,           // ← ADD THIS
  handleValidationErrors,             // ← ADD THIS
  deviceController.create
);

// Adicionar no POST /test-connection:
router.post('/test-connection', 
  authorize('admin', 'supervisor'),
  deviceValidators.testConnection,   // ← ADD THIS
  handleValidationErrors,             // ← ADD THIS
  deviceController.testConnection
);

// Adicionar no PUT /:id:
router.put('/:id', 
  authorize('admin', 'supervisor'),
  deviceValidators.update,           // ← ADD THIS
  handleValidationErrors,             // ← ADD THIS
  deviceController.update
);
```

**Tempo estimado:** 2-3 horas

---

#### **Passo B: Remover Console.log em Produção**

**393 ocorrências encontradas. Estratégia:**

1. **Identificar padrão:**
   ```javascript
   // NÃO fazer:
   console.log('Debug info')
   
   // FAZER:
   logger.debug('Debug info')
   ```

2. **Arquivos com mais ocorrências:**
   - `src/config/` (múltiplos)
   - `src/scripts/tests/` (múltiplos)
   - `src/modules/**/*` (distribuído)

3. **Automação (opcional):**
   ```bash
   # Encontrar todos:
   grep -r "console\.log" src/
   
   # Substituição em massa (CUIDADO!):
   sed -i 's/console\.log/logger.debug/g' src/modules/**/*.js
   ```

4. **Verificação manual:**
   - [ ] Remover console.log em produção
   - [ ] Manter console.error → logger.error
   - [ ] Testar que logs ainda funcionam

**Tempo estimado:** 3-4 horas (ou 30 min se usar automação)

---

#### **Passo C: Audit de RLS Policies Supabase**

**Arquivo existente:** `src/scripts/audit-rls.js`

**Comando:**
```bash
node src/scripts/audit-rls.js
```

**O que verifica:**
- Policies em cada tabela
- Permissões de read/write/update/delete
- Isolamento de eventos (event_id)
- Isolamento de empresas (empresa_id)

**Ação:**
- [ ] Executar audit
- [ ] Documentar resultado
- [ ] Se houver problemas, criar issue

**Tempo estimado:** 1-2 horas

---

#### **Passo D: Standardizar Uso de Timeouts em Todo Backend**

**Arquivos a revisar:**
```
- src/modules/devices/hikvision.controller.js
- src/modules/devices/intelbras.controller.js
- src/modules/devices/sync.service.js
- src/modules/checkin/terminal.controller.js
```

**Para cada arquivo:**
```javascript
// ANTES:
const timeout = setTimeout(..., 5000);

// DEPOIS:
const { TIMEOUT_CONFIG } = require('../../config/timeouts');
const timeout = setTimeout(..., TIMEOUT_CONFIG.APPROPRIATE_TIMEOUT);
```

**Tempo estimado:** 2-3 horas

---

### **PRÓXIMA SEMANA**

#### **Passo E: Estruturar Logs em JSON**

Converter logs de emoji/string para formato estruturado JSON.

**ANTES:**
```javascript
logger.info(`📸 Dispositivo adicionado: ${nome} (${marca})`);
```

**DEPOIS:**
```javascript
logger.info('Device created', {
  device_id: data.id,
  device_name: nome,
  device_brand: marca,
  event_id: req.event.id,
  timestamp: new Date().toISOString()
});
```

**Tempo estimado:** 2-3 horas

---

#### **Passo F: Remover Código Deprecated**

**Pasta a deletar:**
```
src/scripts/_deprecated/
  ├── check-database_MSSQL_DEPRECATED.js
  ├── debug_schema.js
  ├── debug_tables.js
  ├── fix-storage-access.js
  ├── fix-table-names.js
  ├── monitor_MSSQL_DEPRECATED.js
  ├── reset-database.js
  └── seed_nexus.js
```

**Verificar:**
- [ ] Nenhum arquivo ativo usa código da pasta deprecated
- [ ] Documentar que MSSQL foi substituído por Supabase
- [ ] Deletar pasta

**Tempo estimado:** 30 min - 1 hora

---

## 🎯 CHECKLIST DE CONCLUSÃO

### **Hoje (Críticos)**
- [x] Validação de env vars
- [x] Global error handler
- [x] Config de timeouts
- [ ] Aplicar validações nas routes (2-3h)
- [ ] Remover console.log (3-4h)
- [ ] Audit RLS (1-2h)
- [ ] Standardizar timeouts (2-3h)

**Total hoje:** ~8-12 horas

### **Próxima semana (Altos)**
- [ ] Estruturar logs JSON (2-3h)
- [ ] Remover deprecated (30min-1h)
- [ ] Adicionar testes (8-12h)
- [ ] Documentação (4-6h)

**Total:** ~15-22 horas

---

## 📞 COMO USAR OS ARQUIVOS CRIADOS

### **Em Device Controller:**
```javascript
const { TIMEOUT_CONFIG } = require('../../config/timeouts');
const { validateEnvironment } = require('../../config/env');
const { errorHandler } = require('../../middleware/errorHandler');
```

### **Em Routes:**
```javascript
const { deviceValidators, handleValidationErrors } = require('../../middleware/validators');

router.post('/', 
  deviceValidators.create,
  handleValidationErrors,
  controller.create
);
```

### **Em Environment:**
```javascript
// Em app.js:
const { validateEnvironment } = require('./config/env');
const ENV = validateEnvironment();

// Usar ENV.SUPABASE_URL em vez de process.env.SUPABASE_URL
```

---

## 🚀 PRÓXIMO PASSO

**Execute agora:**
```bash
cd c:\Projetos\Projeto_A2_Eventos

# Atualizar device.routes.js com validações
# Seguir exemplo acima

# Testar:
npm run dev
```

---

**Documentação criada:** 2026-04-23  
**Status:** Aguardando implementação de validações nas routes
