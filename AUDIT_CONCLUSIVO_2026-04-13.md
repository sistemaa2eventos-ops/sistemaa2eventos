# AUDIT_CONCLUSIVO_2026-04-13.md

# Relatório de Auditoria Técnica Unificada - Sistema A2 Eventos

**Data:** 13 de Abril de 2026  
**Versão:** 2.0  
**Objetivo:** Consolidar auditorias de Backend, Frontend, Hardware e Banco de Dados

---

## 1. Tabela de Riscos Críticos

| ID | Severidade | Categoria | Título | Arquivo Referência |
|----|------------|-----------|--------|-------------------|
| B-01 | 🔴 CRÍTICO | Backend | Ausência de Validação de Fases (QR/Barcode/Manual) | accessController.js |
| B-02 | 🔴 CRÍTICO | Backend | Falha de Rollback na Catraca (Hardware) | accessController.js |
| B-03 | 🟠 ALTO | Backend | Ausência de Bloqueio por Cota/Capacidade | accessController.js |
| F-01 | 🔴 CRÍTICO | Frontend | Race Conditions - Cliques Duplicados | NeonButton, Pessoas.jsx |
| F-02 | 🟠 ALTO | Frontend | PWA Modo Offline - Sem Refresh Automático | LocalCheckinService |
| F-03 | 🟡 MÉDIO | Frontend | Error Boundary Ausente e alert() | App.jsx, api.js |
| H-01 | 🔴 CRÍTICO | Hardware | Ausência de Timeouts em Drivers | intelbrasService.js |
| H-02 | 🟠 ALTO | Hardware | Impressora Bloqueante | printerService.js |
| H-03 | 🟡 MÉDIO | Hardware | Biometria - Threshold Fixo | facial recognition |
| D-01 | 🔴 CRÍTICO | Database | Race Condition na Sincronização | SyncService.js |
| D-02 | 🟠 ALTO | Database | Integridade Referencial Pulseira/Evento | migrations |
| D-03 | 🟡 MÉDIO | Database | Performance - Índices Faltantes | 01_initial_schema.sql |

---

## 2. Análise Detalhada dos Riscos

### 🔴 B-01: Ausência de Validação de Fases (QR/Barcode/Manual)

**Onde está o código problemático:**
- `accessController.js` - função `verificarFaseEvento()` é chamada apenas no reconhecimento facial

**Cenário de Falha:**
Um usuário com permissão apenas para "Fase Montagem" consegue entrar durante o "Showday" se apresentar o QR Code ou se o operador fizer Check-in Manual, pois esses fluxos ignoram a validação de data/fase do evento.

**Impacto no Negócio:**
- Segurança física comprometida (pessoas não autorizadas no evento)
- Responsabilidade civil em caso de incidentes
- Perda de receita por acesso não autorizado

**Solução Proposta:**
```javascript
// Dentro de registrarAcesso (accessController.js)
// Antes de registrar o log no Supabase:

const fasePermitida = await this.verificarFaseEvento(evento_id, pessoa);
if (!fasePermitida && tipo === 'checkin') {
    const motivo = 'Acesso negado: Fase do evento não permitida para este perfil';
    logger.warn(`🛑 ACESSO NEGADO: ${pessoa.nome} - Motivo: ${motivo}`);
    // ... registrar log de negado ...
    const error = new Error(motivo);
    error.status = 403;
    throw error;
}
```

---

### 🔴 B-02: Falha de Rollback na Catraca (Hardware)

**Onde está o código problemático:**
- `processFaceRecognition()` em `accessController.js`

**Cenário de Falha:**
O sistema executa `registrarAcesso` (escreve no banco) e DEPOIS `acionarCatraca`. Se a catraca falhar (timeout ou queda de luz), o banco marca a pessoa como "Dentro", mas ela ficou do lado de fora.

**Impacto no Negócio:**
- Dados inconsistentes no painel de presença
- Impossibilidade de rastreamento real de pessoas dentro do evento
- Relatórios financeiros incorretos para clientes corporativos

**Solução Proposta:**
```javascript
// No processFaceRecognition:
try {
    const result = await this.registrarAcesso({ ... });
    
    try {
        await this.acionarCatraca(dispositivo_id, 'liberar');
    } catch (hwError) {
        logger.error('Falha de Hardware - Revertendo Check-in:', hwError);
        // Ação Compensatória: Reverte status e marca o log como falha de hardware
        await supabase.from('pessoas').update({ status_acesso: 'pendente' }).eq('id', pessoa_id);
        await supabase.from('logs_acesso').update({ tipo: 'falha_hardware' }).eq('id', result.log.id);
        throw new Error('Falha ao acionar dispositivo físico. Acesso não concluído.');
    }
} catch (error) { ... }
```

---

### 🔴 B-03: Ausência de Bloqueio por Cota/Capacidade

**Onde está o código problemático:**
- `registrarAcesso()` em `accessController.js`

**Cenário de Falha:**
O sistema possui tabelas de quotas empresas e capacidade total do evento, mas o controlador de acesso JAMAIS checa se a cota estourou antes de deixar entrar. Isso pode gerar superlotamento.

**Impacto no Negócio:**
- Violação de alvará do evento
- Multas e interdições
- Riscos de segurança em caso de emergência

**Solução Proposta:**
```javascript
// Validar Cota da Empresa e Capacidade Global
if (tipo === 'checkin') {
    const stats = await this.getRealtimeStats({ event: { id: evento_id } }, { json: (d) => d });
    const empresaInfo = stats.data.empresas.find(e => e.id === pessoa.empresa_id);
    
    if (stats.data.presentes >= stats.data.capacidade) {
        throw new Error('Capacidade máxima do evento atingida.');
    }
    
    if (empresaInfo && empresaInfo.quota > 0 && empresaInfo.total >= empresaInfo.quota) {
        throw new Error('Cota da empresa atingida para este evento.');
    }
}
```

---

### 🔴 F-01: Race Conditions - Cliques Duplicados

**Onde está o código problemático:**
- `NeonButton` (componente) vs `Pessoas.jsx` (página sem gestão de estado)

**Cenário de Falha:**
Um operador impaciente clica 3 vezes em "Sincronizar Dados". A API recebe 3 requisições POST, gerando logs ou registros duplicados se o backend não for idempotente.

**Impacto no Negócio:**
- Duplicidade de registros no banco
- Contagem errada de presença
- Relatórios duplicados para clientes

**Solução Proposta:**
Implementar `setSaving(true)` em todos os handlers de salvamento e vinculá-lo ao `disabled` do `NeonButton`.

---

### 🟠 F-02: PWA Modo Offline - Sem Refresh Automático

**Onde está o código problemático:**
- `LocalCheckinService` - sincroniza mas não notifica UI

**Cenário de Falha:**
O `LocalCheckinService` sincroniza os dados quando a rede volta, mas a UI não "percebe" que deve recarregar a lista de check-ins recentes ou as estatísticas do painel sem um F5.

**Impacto no Negócio:**
- Operador não vê que a sincronização ocorreu
- Decisões tomadas com dados desatualizados
- Perda de tempo recarregando página manualmente

**Solução Proposta:**
Emitir um Cross-Tab Event ou usar o `WebSocketService` para dispara um `sync_complete` que force o recarregamento dos componentes afetados.

---

### 🟡 F-03: Error Boundary Ausente

**Onde está o código problemático:**
- `App.jsx` - não envolve componentes em ErrorBoundary
- `api.js` - usa `alert()` para erros

**Cenário de Falha:**
Se um componente falhar no render (ex: dado nulo inesperado), a aplicação inteira fica em branco. Além disso, erros 403 (Bloqueado) e 500 (Banco Offline) são mostrados via `alert()`, o que quebra a estética.

**Impacto no Negócio:**
- Telas em branco frustam operadores
- Perda de produtividade durante o evento
- Aparência amadora para clientes

**Solução Proposta:**
- Envolver o `<App />` num `ErrorBoundary` customizado
- Criar um interceptor no `api.js` que use o `Snackbar` do `notistack` para erros globais

---

### 🔴 H-01: Ausência de Timeouts em Drivers

**Onde está o código problemático:**
- `intelbrasService.js` - usa `fetch` via Digest Auth sem limite de tempo

**Cenário de Falha:**
Se uma câmera perder o cabo de rede durante um comando de "Abrir Porta", a thread do Node.js pode ficar aguardando o socket por minutos, gerando lentidão no backend inteiro.

**Impacto no Negócio:**
- Backend travado para todos os operadores
- Perda de acesso ao sistema durante o evento
- Impacto em cascata em todos os terminais

**Solução Proposta:**
```javascript
async _get(path, params = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000); // 5 segundos de limite
    try {
        const res = await this.digestClient.fetch(url, { signal: controller.signal });
        // ...
    } finally {
        clearTimeout(timeout);
    }
}
```

---

### 🟠 H-02: Impressora Bloqueante

**Onde está o código problemático:**
- `printerService.js` - executa de forma síncrona

**Cenário de Falha:**
O fluxo de check-in não deve esperar a impressora confirmar que "terminou de imprimir" para liberar a catraca. Se a impressora travar ou acaba o papel, a catraca deve abrir e o erro deve ser logado apenas no monitor.

**Impacto no Negócio:**
- Pessoa fica parada esperando impressão
- Formação de fila no portão
- Experiência ruim para o participante

**Solução Proposta:**
A impressão deve ser despachada para um `setImmediate` ou processada por um "Worker" separado, garantindo que o acesso físico do participante seja a prioridade zero.

---

### 🟡 H-03: Biometria - Threshold Fixo

**Onde está o código problemático:**
- Sistema de reconhecimento facial

**Cenário de Falha:**
O sistema recebe o score de `confianca`, mas não tem um "piso" de segurança configurável por evento. Gêmeos ou irmãos podem conseguir entrar um no lugar do outro.

**Impacto no Negócio:**
- Furto de identidade
- Acesso não autorizado a áreas restritas
- Responsabilidade jurídica

**Solução Proposta:**
Adicionar um campo `min_face_score` na configuração do evento. Se o match facial for < 70%, o sistema deve emitir um `negado_biometria` e disparar um som de alerta imediato no dashboard de monitoramento via WebSocket.

---

### 🔴 D-01: Race Condition na Sincronização

**Onde está o código problemático:**
- `SyncService.js` linha ~132 - usa `upsert` sem verificação prévia

**Cenário de Falha:**
Se 2 catracas offline registrarem o Checkin simultâneo da mesma pessoa num espaço de milissegundos, ao voltarem online ambas enviarão o log, criando duplicidade de Check-In.

**Impacto no Negócio:**
- Contagem dupla de presença
- Cobrança indevida de clientes corporativos
- Dados inconsistentes para relatórios

**Solução Proposta:**
```javascript
// No SyncService.js antes de fazer o Upsert:
const _recent = await supabase.from('logs_acesso')
    .select('id').eq('funcionario_id', logData.pessoa_id).eq('tipo', logData.tipo)
    .gte('created_at', new Date(new Date(logData.created_at).getTime() - 10000).toISOString())
    .limit(1);

if (_recent.data && _recent.data.length > 0) {
    logger.warn(`Race Condition Bloqueada: Log Duplicado ${logData.pessoa_id}`);
    syncedIds.push(log.id);
    continue;
}
```

---

### 🟠 D-02: Integridade Referencial Pulseira/Evento

**Onde está o código problemático:**
- `evento_tipos_pulseira` e `pulseira_areas_permitidas`

**Cenário de Falha:**
Um Bug no front (criação de um payload mal-formatado) poderia vincular uma pulseira do "Rock in Rio" à área "Camarote" do "Lollapalooza".

**Impacto no Negócio:**
- Erro de configuração causing accesso indevido
- Dados corrompidos no banco
- Dificuldade para auditoria

**Solução Proposta:**
```sql
CREATE OR REPLACE FUNCTION check_pulseira_area_evento_match()
RETURNS TRIGGER AS $$
BEGIN
    IF (SELECT evento_id FROM evento_tipos_pulseira WHERE id = NEW.pulseira_id) != 
       (SELECT evento_id FROM evento_areas WHERE id = NEW.area_id) THEN
        RAISE EXCEPTION 'A Pulseira e a Área devem pertencer ao mesmo Evento.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_same_event_pulseiras
BEFORE INSERT OR UPDATE ON pulseira_areas_permitidas
FOR EACH ROW EXECUTE FUNCTION check_pulseira_area_evento_match();
```

---

### 🟡 D-03: Performance - Índices Faltantes

**Onde está o código problemático:**
- `01_initial_schema.sql` - sem índice para busca textual

**Cenário de Falha:**
Busca textual no frontend do Pessoas.jsx ("Digite o nome...") usa table scan, deixando a busca lenta com grandes volumes.

**Impacto no Negócio:**
- Interface lenta para operadores
- Perda de produtividade
- Experiência ruim durante eventos de alto movimento

**Solução Proposta:**
```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_pessoas_nome_trgm 
    ON pessoas USING GIN (nome gin_trgm_ops);
```

---

## 3. Recomendação de Tarefas para o Board de Desenvolvimento

### Prioridade CRÍTICA (Corrigir antes do próximo evento)

| ID | Tarefa | Responsável | Estimativa |
|----|--------|-------------|------------|
| TASK-001 | Implementar validação de fase em todos os fluxos (QR/Manual) | Backend Team | 2 dias |
| TASK-002 | Implementar rollback de catraca com ação compensatória | Backend Team | 2 dias |
| TASK-003 | Adicionar timeout de 5s nos drivers Intelbras | DevOps/IoT | 1 dia |
| TASK-004 | Implementar proteção contra race condition no SyncService | Backend Team | 1 dia |
| TASK-005 | Adicionar ErrorBoundary no App.jsx | Frontend Team | 1 dia |

### Prioridade ALTA (Corrigir no próximo sprint)

| ID | Tarefa | Responsável | Estimativa |
|----|--------|-------------|------------|
| TASK-006 | Implementar verificação de cota/capacidade no check-in | Backend Team | 2 dias |
| TASK-007 | Adicionar refresh automático após sync offline | Frontend Team | 1 dia |
| TASK-008 | Implementar fila assíncrona para impressão | Backend Team | 2 dias |
| TASK-009 | Criar trigger de integridade pulseira/evento | DBA | 1 dia |
| TASK-010 | Adicionar índice trigram para busca de nomes | DBA | 1 dia |

### Prioridade MÉDIO (Corrigir no sprint atual)

| ID | Tarefa | Responsável | Estimativa |
|----|--------|-------------|------------|
| TASK-011 | Configurar campo `min_face_score` por evento | Backend Team | 2 dias |
| TASK-012 | Substituir alerts por Snackbar/notistack | Frontend Team | 1 dia |
| TASK-013 | Adicionar proteção contra cliques duplos em todas as páginas | Frontend Team | 1 dia |

---

## 4. Conclusão

O sistema possui uma arquitetura sólida, mas apresenta pontos críticos que devem ser tratados antes do próximo evento de grande porte. As correções propostas seguem a "Regra de Ouro" de NÃO sugerir remoções estruturais, apenas alterações cirúrgicas no código existente.

A implementação das tarefas de PRIORIDADE CRÍTICA é mandatória para garantir a operação segura e confiável do sistema durante eventos.

---

*Relatório gerado automaticamente com base nas auditorias: BACKEND_AUDIT_REPORT.txt, FRONTEND_QA_REPORT.txt, HARDWARE_AUDIT_REPORT.txt, DB_AUDIT_REPORT.txt*