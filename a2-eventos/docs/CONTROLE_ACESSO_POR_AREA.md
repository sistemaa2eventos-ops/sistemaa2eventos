# 🔐 Controle de Acesso Biométrico por Área - Documentação de Implementação

## 📋 Resumo Executivo

Sistema completo para controle granular de acesso a dispositivos biométricos (Intelbras SS5541 MF W) baseado em áreas de um evento. Garante que cada leitor facial tenha cadastrado APENAS as faces de pessoas autorizadas para aquela área específica.

---

## ✅ O que foi implementado (4 Etapas)

### **Etapa 1: Estrutura de Banco de Dados** ✅
**Arquivo:** `database/supabase/migrations/20260420_area_based_access_control.sql`

**Tabelas criadas:**
- `pessoa_areas_acesso` - Vinculação N:N entre pessoas e áreas
- `dispositivo_sync_log` - Auditoria de todas as sincronizações
- Colunas adicionadas em `dispositivos_acesso`:
  - `offline_mode` - Comportamento quando dispositivo fica offline
  - `ultima_sincronizacao` - Timestamp da última sync
  - `faces_cadastradas` - Contador de rostos no dispositivo
  - `sync_status` - Estado atual da sincronização

**RLS (Row Level Security):** Ativado com isolamento por tenant

---

### **Etapa 2: Sincronização Inteligente (Backend)** ✅
**Arquivo:** `backend/api-nodejs/src/modules/devices/sync.service.js`

**Novas funções:**

#### 1. `syncEnrollmentByArea(pessoaId)`
```javascript
// Sincroniza pessoa para TODOS os dispositivos do evento
// Cadastra no leitor APENAS se pessoa tem acesso à área daquele leitor
// Remove de leitores onde pessoa não tem acesso

const result = await syncService.syncEnrollmentByArea(pessoa_id);
// return { cadastrados: 3, removidos: 1 }
```

**Regras implementadas:**
- ✅ Pessoa DEVE estar com `status_acesso = 'autorizado'`
- ✅ Pessoa DEVE ter `area_id` do leitor em `pessoa_areas_acesso`
- ✅ Se leitor estiver offline, comanda enfileirado em `terminal_sync_queue`
- ✅ Todas as operações registradas em `dispositivo_sync_log`

#### 2. `resetAndSyncDevice(dispositivoId)`
```javascript
// Limpa TODAS as faces do dispositivo
// Recadastra APENAS pessoas autorizadas para aquela área

const result = await syncService.resetAndSyncDevice(dispositivo_id);
// return { success: true, cleaned: true, cadastrados: 15, falhados: 0 }
```

**Casos de uso:**
- Quando dispositivo novo é ativado
- Quando você quer sincronizar forçadamente um leitor
- Botão "Resetar e Sincronizar" no painel de dispositivos

#### 3. `syncAreaChange(pessoaId, areaId, acao, eventoId)`
```javascript
// Chamada quando uma pessoa GANHA ou PERDE acesso a uma área

// Adicionar acesso
await syncService.syncAreaChange(pessoa_id, area_id, 'add', evento_id);

// Remover acesso
await syncService.syncAreaChange(pessoa_id, area_id, 'remove', evento_id);
```

---

### **Etapa 3: Integração com Fluxo de Aprovação** ✅
**Arquivo:** `backend/api-nodejs/src/modules/entities/pessoa.controller.js`

**Modificação do método `approve()`:**
```javascript
POST /api/pessoas/:id/approve
{
  "areas_autorizadas": ["uuid-area-1", "uuid-area-2", "uuid-area-3"]
}
```

**O que acontece:**
1. Valida que `areas_autorizadas` não está vazio (REGRA 5)
2. Gera QR Code (se não existir)
3. Vincula pessoa às áreas em `pessoa_areas_acesso`
4. **DISPARA ASSINCRONAMENTE** `syncEnrollmentByArea()` 
5. Pessoa é automaticamente sincronizada aos leitores das áreas selecionadas

---

### **Etapa 4: Interface (Frontend)** ✅

#### Componentes Criados:

**1. `PessoasAreaSelect.jsx`**
- Exibe todas as áreas do evento como checkboxes
- Validação visual em tempo real
- Suporta multi-seleção
- Design glassmorphism com gradient

**2. `AprovacaoPessoaDialog.jsx`**
- Dialog modal para aprovação obrigatória com seleção de áreas
- Integra `PessoasAreaSelect`
- Valida seleção antes de aprovar
- Exibe feedback visual

#### Endpoint criado:
```
GET /eventos/:id/areas
Response: { data: [ { id, nome, descricao }, ... ], total }
```

---

## 🔄 Fluxo Completo de Aprovação

```
1. Administrador clica "Aprovar" na pessoa
                      ↓
2. Dialog abre exibindo todas as áreas do evento
                      ↓
3. Admin seleciona áreas (obrigatório mínimo 1)
                      ↓
4. Admin clica "Aprovar" botão
                      ↓
5. Backend:
   - Insere em pessoa_areas_acesso
   - Muda status para 'autorizado'
   - Gera QR Code
   - Dispara syncEnrollmentByArea() ASSINCRONAMENTE
                      ↓
6. SyncEnrollmentByArea:
   - Busca todas as áreas autorizadas da pessoa
   - Itera cada dispositivo do evento
   - Se pessoa tem acesso: CADASTRA face no leitor
   - Se pessoa não tem acesso: REMOVE face do leitor
   - Registra tudo em dispositivo_sync_log
                      ↓
7. Se dispositivo offline:
   - Comando enfileirado em terminal_sync_queue
   - Será processado quando dispositivo voltar online
                      ↓
8. Admin vê confirmação: "✅ Pessoa aprovada com sucesso!"
```

---

## 📊 Tabelas de Banco de Dados

### `pessoa_areas_acesso`
```sql
id UUID PRIMARY KEY
pessoa_id UUID (FK pessoas)
area_id UUID (FK evento_areas)
evento_id UUID (FK eventos)
criado_em TIMESTAMP
criado_por UUID (FK auth.users)

UNIQUE(pessoa_id, area_id)
```

### `dispositivo_sync_log`
```sql
id UUID PRIMARY KEY
dispositivo_id UUID (FK dispositivos_acesso)
pessoa_id UUID (FK pessoas)
area_id UUID (FK evento_areas)
evento_id UUID (FK eventos)
operacao VARCHAR ('enroll', 'delete', 'verify')
status VARCHAR ('sucesso', 'falha', 'pendente')
mensagem_erro TEXT
criado_em TIMESTAMP
metadados JSONB { confidence: 0.95, ... }
```

---

## 🛡️ Regras de Negócio Implementadas

### REGRA 1: Nenhuma face sem autorização
```
✅ Pessoa está 'autorizado'
✅ Area_id do leitor está em pessoa_areas_acesso
→ Face é CADASTRADA no leitor

❌ Qualquer uma das condições falha
→ Face é REMOVIDA do leitor
```

### REGRA 2: Bloqueio é imediato e total
```
Ao bloquear pessoa:
→ deleteUserFromAllDevices() chamado
→ Face removida de TODOS os leitores
→ Independente de áreas
→ Prioridade máxima na fila
```

### REGRA 3: Remover área de pessoa
```
// Admin remove area_id de pessoa_areas_acesso
→ syncAreaChange(pessoa_id, area_id, 'remove')
→ Pessoa removida do leitor daquela área
→ Permanece nos outros leitores das áreas que tem acesso
```

### REGRA 4: Novo dispositivo
```
Ao ativar novo dispositivo:
→ resetAndSyncDevice(dispositivo_id) OBRIGATÓRIO
→ Nunca deixar com base do equipamento
→ Sempre sincronizar apenas autorizados
```

### REGRA 5: Pessoa sem área definida
```
// BLOQUEADO no fluxo de aprovação
if (areas_autorizadas.length === 0) {
    throw "Atenção: Pessoa aprovada sem área de acesso definida"
}

// Se pessoa ficou sem áreas:
→ Não vai para nenhum leitor
→ Alert visual no painel administrativo
```

---

## 📱 Como Usar - Passo a Passo

### Para Aprovar uma Pessoa:

1. **Painel Admin** → Menu **Pessoas** → Selecionar pessoa com status "Pendente"

2. **Clicar botão "Aprovar"**
   - Dialog abre com todas as áreas do evento
   - Cores visuais para feedback

3. **Selecionar Áreas**
   - Marcar checkbox em cada área onde pessoa pode ter acesso
   - Mínimo 1 área obrigatório
   - Visualizar resumo das selecionadas

4. **Clicar "✅ Aprovar"**
   - Sistema faz upload da aprovação
   - Sincronização inicia automaticamente
   - Mensagem de sucesso aparece

5. **Em tempo real:**
   - Leitor facial da área selecionada recebe face de pessoa
   - Leitor de outras áreas NÃO recebe
   - Tudo registrado em `dispositivo_sync_log`

---

## 🔧 Para Desenvolvedores

### Chamar Sync Manualmente:

```javascript
const syncService = require('./sync.service');

// Aprovar pessoa com áreas
await syncService.syncEnrollmentByArea(pessoaId);

// Resetar leitor
await syncService.resetAndSyncDevice(dispositivoId);

// Pessoa ganhou acesso a uma nova área
await syncService.syncAreaChange(pessoaId, areaId, 'add', eventoId);

// Pessoa perdeu acesso a uma área
await syncService.syncAreaChange(pessoaId, areaId, 'remove', eventoId);
```

### Consultar Logs de Sync:

```javascript
const { data: logs } = await supabase
    .from('dispositivo_sync_log')
    .select('*')
    .eq('pessoa_id', pessoaId)
    .order('criado_em', { ascending: false });

// Cada log mostra: 
// - Qual dispositivo
// - Qual pessoa
// - Qual área
// - operacao (enroll, delete)
// - status (sucesso, falha)
// - mensagem de erro (se houver)
```

---

## 🚀 Deploy Checklist

- [ ] Migration SQL aplicada no Supabase
- [ ] Backend redeploy (npm run build)
- [ ] Frontend redeploy (npm run build)
- [ ] Testar aprovação com 1 pessoa e 1 área
- [ ] Verificar logs em `dispositivo_sync_log`
- [ ] Testar com dispositivo offline (esperar voltar online)
- [ ] Testar remover pessoa de uma área
- [ ] Verificar leitor recebeu faces corretas

---

## 📞 Suporte

**Casos Comuns:**

1. **Pessoa aprovada mas não aparece no leitor**
   - Verificar se leitor está online
   - Verificar `dispositivo_sync_log` para erro específico
   - Clicar "Resetar e Sincronizar" no leitor

2. **Leitor com faces de pessoas não autorizadas**
   - Rodar `resetAndSyncDevice()`
   - Vai limpar tudo e recadastrar apenas autorizados

3. **Pessoa removida de área mas ainda abre leitor**
   - Leitor offline no momento - esperar reconectar
   - Verificar `terminal_sync_queue` para comando pendente
   - Se ficar travado, resetar leitor manualmente

---

**Versão:** 1.0  
**Data:** 2026-04-20  
**Status:** ✅ Completo
