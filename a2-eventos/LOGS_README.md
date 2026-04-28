# 🔍 Scripts de Monitoramento - A2 Eventos

Três scripts para monitorar logs e erros do sistema em tempo real.

---

## 1️⃣ QUICK_LOGS.sh (Recomendado para começar)

**Uso rápido e simples para visualizar erros.**

```bash
bash QUICK_LOGS.sh api          # Monitorar API em tempo real
bash QUICK_LOGS.sh db           # Monitorar Banco de Dados
bash QUICK_LOGS.sh gateway      # Monitorar Nginx/Gateway
bash QUICK_LOGS.sh all          # Ver todos os erros de uma vez
```

### Exemplos:

```bash
# Ver últimos 100 erros da API + monitorar em tempo real
bash QUICK_LOGS.sh api

# Ver apenas últimos 50 erros do banco de dados
bash QUICK_LOGS.sh db

# Snapshot de todos os erros do sistema
bash QUICK_LOGS.sh all
```

**Saída:**
```
📊 Mostrando logs da API (últimas 100 linhas)...
[13:45:22] [a2_eventos_api] ❌ ERROR: Email rate limit exceeded
[13:45:25] [a2_eventos_api] ⚠️ WARN: Slow query detected

🔄 Monitorando em tempo real (Ctrl+C para parar)...
```

---

## 2️⃣ MONITOR_ERROS.sh (Monitoramento avançado)

**Monitora TODOS os containers em paralelo com filtros inteligentes.**

```bash
bash MONITOR_ERROS.sh
```

### Características:

- ✅ Monitora: API, Frontend, Banco de Dados, Redis, Gateway
- ✅ Cores diferentes para: Erros (vermelho), Warnings (amarelo)
- ✅ Filtra automaticamente: ERROR, Exception, FAILED, WARN, FATAL
- ✅ Mostra timestamp e nome do container
- ✅ Paralelo = mais rápido

**Saída:**
```
[14:23:15] [a2_eventos_api] ❌ ERROR: Erro ao enviar convite
[14:23:16] [a2_eventos_pg_edge] ⚠️ WARN: Connection timeout
[14:23:17] [a2_eventos_gateway] ERROR: 502 Bad Gateway
```

---

## 3️⃣ MONITOR_DASHBOARD.sh (Dashboard com estatísticas)

**Dashboard em tempo real com contadores de erros.**

```bash
bash MONITOR_DASHBOARD.sh
```

### Características:

- 📊 Dashboard atualizado a cada 5 segundos
- 📈 Contadores de erros por container
- 📋 Lista dos 20 últimos erros
- ✅ Status de cada container
- 🎨 Cores e formatação visual

**Saída:**
```
╔════════════════════════════════════════════════════════════════╗
║        🔍 DASHBOARD DE MONITORAMENTO - A2 EVENTOS             ║
╚════════════════════════════════════════════════════════════════╝

Status dos Containers:
✓ a2_eventos_api     Up 2 hours
✓ a2_eventos_pg_edge Up 2 hours
✗ a2_eventos_redis   Exit 1

Contadores de Erros:
  API Errors: 3 | API Warnings: 7 | DB Errors: 1 | Gateway Errors: 0

Erros Mais Recentes:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[14:23:15] [api] Email rate limit exceeded
[14:23:16] [api] Erro ao enviar convite
[14:23:17] [api] Connection timeout
```

---

## 📋 Comparação

| Recurso | QUICK_LOGS | MONITOR_ERROS | MONITOR_DASHBOARD |
|---------|-----------|----------------|-------------------|
| Uso Rápido | ✅ | ❌ | ❌ |
| Monitoramento Paralelo | ❌ | ✅ | ✅ |
| Contadores de Erros | ❌ | ❌ | ✅ |
| Dashboard Visual | ❌ | ❌ | ✅ |
| Filtros Inteligentes | ✅ | ✅ | ✅ |
| Rápido de Executar | ✅ | ✅ | ✅ |

---

## 🚀 Recomendações

### Para começar a investigar:
```bash
bash QUICK_LOGS.sh all    # Ver panorama geral
```

### Para monitoramento contínuo:
```bash
bash MONITOR_ERROS.sh     # Melhor desempenho
```

### Para dashboard interativo:
```bash
bash MONITOR_DASHBOARD.sh # Melhor visualização
```

---

## 📌 Dicas

1. **Abra múltiplos terminais:**
   ```bash
   # Terminal 1: Monitor da API
   bash QUICK_LOGS.sh api
   
   # Terminal 2: Monitor do Banco
   bash QUICK_LOGS.sh db
   ```

2. **Salvar logs em arquivo:**
   ```bash
   bash QUICK_LOGS.sh all > /tmp/a2_errors.log
   ```

3. **Enviar logs por email:**
   ```bash
   bash QUICK_LOGS.sh all | mail -s "A2 Erros" admin@empresa.com
   ```

4. **Monitorar com grep customizado:**
   ```bash
   docker logs -f a2_eventos_api | grep -i "invite\|email\|error"
   ```

---

## 🔧 Troubleshooting

### "docker: command not found"
```bash
sudo docker logs ...     # Use sudo se necessário
```

### "Container not found"
```bash
docker ps -a            # Verificar containers disponíveis
```

### "Permission denied"
```bash
chmod +x QUICK_LOGS.sh
chmod +x MONITOR_ERROS.sh
chmod +x MONITOR_DASHBOARD.sh
```

---

**Última atualização:** 2026-04-28
