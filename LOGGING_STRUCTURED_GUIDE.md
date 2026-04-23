# 📋 Guia de Logging Estruturado em JSON

**Objetivo:** Converter logs de string interpolation para formato JSON estruturado com Pino  
**Benefício:** Melhor observabilidade, parsing automático, compliance LGPD  
**Status:** Guia de implementação

---

## 🔄 Padrão de Conversão

### ANTES (String Interpolation com Emojis)
```javascript
logger.info(`📸 Dispositivo adicionado: ${nome} (${marca})`);
logger.error(`❌ Erro ao criar dispositivo: ${error.message}`);
logger.warn(`⚠️ Nenhuma impressora configurada para evento ${evento_id}`);
```

### DEPOIS (Structured JSON)
```javascript
logger.info('Device created', {
  device_name: nome,
  device_brand: marca,
  event_id: evento_id,
  user_id: req.user.id,
  timestamp: new Date().toISOString()
});

logger.error({ err: error, device_id: deviceId }, 'Failed to create device');

logger.warn({ event_id: evento_id }, 'No printers configured for event');
```

---

## 📐 Estrutura de Logs Estruturados

### 1. **Info Logs** (Operações bem-sucedidas)
```javascript
// Padrão: logger.info('Action completed', { contexto })
logger.info('Device created', {
  device_id: data.id,
  device_name: nome,
  device_brand: marca,
  device_type: tipo,
  device_ip: ip_address,
  port: porta,
  event_id: req.event.id,
  user_id: req.user.id
});

logger.info('Snapshot captured', {
  device_id: deviceId,
  device_name: deviceData.nome,
  image_size_bytes: buffer.length,
  duration_ms: Date.now() - startTime
});

logger.info('Command sent', {
  device_id: deviceId,
  command_type: 'REMOTE_OPEN',
  target_device: deviceData.nome,
  timestamp: new Date().toISOString()
});
```

### 2. **Debug Logs** (Detalhes técnicos)
```javascript
// Padrão: logger.debug('Internal operation', { contexto detalhado })
logger.debug('Connecting to device', {
  device_ip: ip,
  device_port: port,
  auth_user: user,
  attempt: 1,
  timeout_ms: TIMEOUT_CONFIG.DEVICE_CONNECTION
});

logger.debug('API request', {
  method: 'POST',
  endpoint: '/api/devices',
  query_params: { event_id: eventoId },
  duration_ms: responseTime
});
```

### 3. **Warn Logs** (Situações não-ideais mas funcionais)
```javascript
// Padrão: logger.warn('Situation detected', { contexto })
logger.warn('Device offline', {
  device_id: deviceId,
  device_name: deviceData.nome,
  last_seen: lastSeen,
  duration_offline_minutes: Math.floor((Date.now() - lastSeen) / 60000),
  health_status: 'OFFLINE'
});

logger.warn('Configuration fallback', {
  device_id: deviceId,
  expected_mode: 'online',
  fallback_mode: 'polling',
  reason: 'Push configuration failed'
});
```

### 4. **Error Logs** (Erros que precisam atenção)
```javascript
// Padrão: logger.error({ err: error, ...contexto }, 'User-friendly message')
logger.error(
  { err: error, device_id: deviceId, device_ip: ip_address },
  'Failed to connect to device'
);

logger.error(
  { err: error, event_id: eventoId, user_id: req.user.id },
  'Database error while creating device'
);

// Com stack trace (automático com 'err')
logger.error(
  { err: errorObj, endpoint: '/api/devices', method: 'POST' },
  'Unexpected error processing request'
);
```

---

## 🎯 Campos Comuns por Contexto

### **Device Operations**
```javascript
{
  device_id: 'uuid',
  device_name: 'string',
  device_ip: 'ip_address',
  device_port: number,
  device_brand: 'intelbras|hikvision|altro',
  device_type: 'camera|access_control|printer'
}
```

### **Event Context**
```javascript
{
  event_id: 'uuid',
  event_name: 'string',
  company_id: 'uuid'
}
```

### **User Context**
```javascript
{
  user_id: 'uuid',
  user_email: 'email@example.com',
  user_role: 'admin|supervisor|operador'
}
```

### **Operation Metrics**
```javascript
{
  duration_ms: number,
  status: 'success|failure|timeout',
  attempt: number,
  retry_count: number,
  response_code: number
}
```

### **Sensitive Data** (MASCARADO automaticamente)
```javascript
// Pino mascara automaticamente:
password, token, cpf, face_encoding, foto_base64_internal, session

// Resultado em log:
{
  "password": "*** MASCARADO ***",
  "token": "*** MASCARADO ***"
}
```

---

## 📁 Arquivos a Migrar (Prioridade)

### **Tier 1 - Crítico** (Controllers principais)
- [ ] `modules/devices/device.controller.js` (30+ logs)
- [ ] `modules/checkin/checkin.controller.js` (20+ logs)
- [ ] `modules/entities/pessoa.controller.js` (25+ logs)

### **Tier 2 - Alto** (Services principais)
- [ ] `modules/devices/intelbras.service.js` (15+ logs)
- [ ] `modules/devices/hikvision.service.js` (10+ logs)
- [ ] `modules/checkin/terminal.controller.js` (20+ logs)

### **Tier 3 - Médio** (Services auxiliares)
- [ ] `services/webhookDispatcher.js` (8+ logs)
- [ ] `config/supabase.js` (6+ logs)
- [ ] `modules/system/rbac.controller.js` (5+ logs)

---

## 🔍 Checklist de Migração

Para cada arquivo:
- [ ] Identificar todos os `logger.info/debug/warn/error`
- [ ] Converter para padrão estruturado
- [ ] Adicionar contexto relevante (device_id, event_id, user_id, etc)
- [ ] Testar em dev mode (pino-pretty mostra humanizado)
- [ ] Testar em prod mode (JSON puro)
- [ ] Verificar que informação sensível é mascarada

---

## 📊 Exemplo de Transformação Completa

### device.controller.js - list()

**ANTES:**
```javascript
async list(req, res) {
    try {
        const { data, error } = await supabase
            .from('dispositivos')
            .select('*')
            .eq('evento_id', req.event.id);
            
        if (error) {
            logger.error(`❌ Erro Supabase [DeviceController.list]: ${error.message}`, error);
            return apiResponse.error(res, 'Erro ao listar dispositivos');
        }
        
        logger.info(`✅ Listando ${data.length} dispositivos para evento ${req.event.id}`);
        return apiResponse.success(res, { dispositivos: data });
    } catch (error) {
        logger.error('Erro fatal ao listar dispositivos:', error);
        return apiResponse.error(res, 'Erro fatal ao listar dispositivos');
    }
}
```

**DEPOIS:**
```javascript
async list(req, res) {
    try {
        const { data, error } = await supabase
            .from('dispositivos')
            .select('*')
            .eq('evento_id', req.event.id);
            
        if (error) {
            logger.error(
                { err: error, event_id: req.event.id },
                'Failed to list devices from database'
            );
            return apiResponse.error(res, 'Erro ao listar dispositivos');
        }
        
        logger.info('Devices listed', {
            device_count: data.length,
            event_id: req.event.id,
            user_id: req.user.id,
            user_role: req.user.role
        });
        
        return apiResponse.success(res, { dispositivos: data });
    } catch (error) {
        logger.error(
            { err: error, event_id: req.event.id },
            'Unexpected error while listing devices'
        );
        return apiResponse.error(res, 'Erro fatal ao listar dispositivos');
    }
}
```

---

## 🧪 Verificação de Saída

### Dev Mode (pino-pretty - Humanizado)
```
[2026-04-23 08:15:23] INFO: Devices listed
    device_count: 5
    event_id: "550e8400-e29b-41d4-a716-446655440000"
    user_id: "f47ac10b-58cc-4372-a567-0e02b2c3d479"
    user_role: "admin"
```

### Prod Mode (JSON puro)
```json
{
  "level": "INFO",
  "timestamp": "2026-04-23T08:15:23.123Z",
  "message": "Devices listed",
  "device_count": 5,
  "event_id": "550e8400-e29b-41d4-a716-446655440000",
  "user_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "user_role": "admin"
}
```

---

## ⚡ Dicas de Implementação

### 1. **Converter em Lotes**
- Fazer Tier 1 primeiro (3 arquivos = ~70 logs)
- Depois Tier 2 (3 arquivos = ~45 logs)
- Depois Tier 3 (3 arquivos = ~19 logs)

### 2. **Preservar Mensagens Humanizáveis**
- Primeira string sempre é a mensagem "legível"
- Objeto é apenas contexto/metadados
- Pino-pretty concatena tudo de forma legível

### 3. **Ser Consistente com Nomes**
- `device_id` em vez de `deviceId` (snake_case)
- `event_id` em vez de `eventoId`
- `user_id` em vez de `userId`

### 4. **Adicionar Métricas**
- `duration_ms` para operações
- `attempt`, `retry_count` para tentativas
- `response_code` para respostas HTTP

### 5. **Contextualizar Erros**
- Sempre incluir `err: error` para stack trace
- Adicionar IDs relevantes (device, event, user)
- Mensagem deve descrever o que tentava fazer

---

## 🔗 Referências

**Documentação Pino:** https://getpino.io/#/docs/api  
**Pino Pretty (dev):** https://github.com/pinojs/pino-pretty  
**JSON Logging Best Practices:** https://www.elastic.co/guide/en/ecs/current/

---

## 📝 Próximos Passos

1. **Hoje:** Migrar device.controller.js como exemplo
2. **Amanhã:** Migrar tier 1 (checkin, pessoa controllers)
3. **Semana:** Migrar tiers 2 e 3
4. **Testes:** Verificar que logs aparecem estruturados em prod

---

**Status:** Documento de referência criado  
**Próximo:** Começar migração de device.controller.js
