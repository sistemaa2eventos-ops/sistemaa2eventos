# PLANO DE CORREÇÕES PENDENTES — A2 EVENTOS

> Gerado em: 2026-04-20
> Contexto: Auditoria completa do sistema identificou 8 problemas de média/alta severidade que não foram corrigidos na sprint atual.
> Cada item contém: o problema, o arquivo exato, o código atual, o código corrigido, e a justificativa.

---

## ITEM 1: Dockerfiles rodam como root (ALTO)

### Problema
Os containers `api` e `admin-web` rodam como usuário root. Se a aplicação for comprometida, o atacante tem root no container, facilitando escalação de privilégios.

### Arquivos
- `a2-eventos/backend/api-nodejs/Dockerfile`
- `a2-eventos/frontend/web-admin/Dockerfile`

### Correção — backend/api-nodejs/Dockerfile

**Código atual (completo):**
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN mkdir -p logs
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3001/health', (r) => {r.statusCode === 200 ? process.exit(0) : process.exit(1)})" || exit 1
CMD ["node", "src/app.js"]
```

**Código corrigido:**
```dockerfile
FROM node:20-alpine
WORKDIR /app

RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN mkdir -p logs && chown -R nodejs:nodejs logs

USER nodejs

EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3001/health', (r) => {r.statusCode === 200 ? process.exit(0) : process.exit(1)})" || exit 1
CMD ["node", "src/app.js"]
```

**Mudanças:**
1. Adicionar `RUN addgroup/adduser` ANTES do COPY (para não invalidar cache de npm ci)
2. `chown` no diretório `logs` (único lugar onde a app escreve em disco)
3. `USER nodejs` DEPOIS de todos os COPY/RUN que precisam de root

### Correção — frontend/web-admin/Dockerfile

**Código atual:**
```dockerfile
FROM node:18-alpine AS builder
ARG VITE_API_URL=https://api.nzt.app.br/api
WORKDIR /app
COPY package*.json ./
RUN npm install --legacy-peer-deps && npm install @rollup/rollup-linux-x64-musl
COPY . .
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM nginx:alpine
RUN rm -rf /usr/share/nginx/html/*
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/ || exit 1
CMD ["nginx", "-g", "daemon off;"]
```

**Código corrigido:**
```dockerfile
FROM node:20-alpine AS builder
ARG VITE_API_URL=https://api.nzt.app.br/api
WORKDIR /app
COPY package*.json ./
RUN npm install --legacy-peer-deps && npm install @rollup/rollup-linux-x64-musl
COPY . .
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM nginx:alpine
RUN rm -rf /usr/share/nginx/html/*
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/ || exit 1
CMD ["nginx", "-g", "daemon off;"]
```

**Mudanças:**
1. `node:18-alpine` atualizado para `node:20-alpine` (resolve ITEM 8 simultaneamente)
2. Nginx já roda como user `nginx` por padrão na imagem oficial, então não precisa de ajuste extra na stage de produção

> **Nota:** O build stage (builder) pode rodar como root sem risco — é descartado na imagem final.

### Teste
```bash
docker-compose build --no-cache api admin-web
docker-compose up -d --no-deps api admin-web
# Verificar que a API responde normalmente:
curl http://localhost:3001/health
# Verificar que o admin-web serve a SPA:
curl -I http://localhost:80
```

---

## ITEM 2: depends_on não espera healthcheck (ALTO)

### Problema
No `docker-compose.yml`, a API depende do Redis e PostgreSQL com `condition: service_started`. Isso significa que o Docker inicia a API assim que os containers de dependência INICIAM, não quando estão PRONTOS. Se o Redis ou PostgreSQL demorar para aceitar conexões, a API pode crashar no boot.

### Arquivo
`a2-eventos/docker-compose.yml`

### Correção

**Código atual (linhas 44-48):**
```yaml
    depends_on:
      redis:
        condition: service_started
      postgres_edge:
        condition: service_started
```

**Código corrigido:**
```yaml
    depends_on:
      redis:
        condition: service_healthy
      postgres_edge:
        condition: service_healthy
```

**PRÉ-REQUISITO:** Os serviços `redis` e `postgres_edge` precisam ter healthchecks definidos. Verificar se já possuem:

Para `redis`, adicionar healthcheck se não existir:
```yaml
  redis:
    image: redis:7-alpine
    # ... (manter tudo que já existe) ...
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
```

Para `postgres_edge`, verificar se já tem healthcheck (provavelmente tem via `pg_isready`). Se não tiver:
```yaml
  postgres_edge:
    # ... (manter tudo que já existe) ...
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5
```

### Teste
```bash
docker-compose down
docker-compose up -d
# Observar que a API só inicia após Redis e PG estarem healthy:
docker-compose ps
# Deve mostrar redis e postgres como "(healthy)" antes da API subir
```

---

## ITEM 3: Portal empresa/stats faz 5 queries sequenciais (MÉDIO)

### Problema
A rota `GET /api/portal/empresa/stats` faz 5 queries ao Supabase em SEQUÊNCIA (uma esperando a outra). Cada query tem latência de rede (~20-50ms para Supabase), totalizando ~100-250ms por request. Pode ser reduzido para ~50ms com paralelização.

### Arquivo
`a2-eventos/backend/api-nodejs/src/modules/portal/empresa.routes.js` — linhas 57-118

### Código atual
```javascript
router.get('/stats', async (req, res) => {
    try {
        const empresaId = req.user.id;

        // Query 1: Info da Empresa (Cota)
        const { data: empresa } = await req.userClient
            .from('empresas').select('quota').eq('id', empresaId).single();
        const cotaTotal = empresa?.quota || 0;

        // Query 2: Colaboradores Aprovados
        const { data: pivotAprovados } = await req.userClient
            .from('pessoa_evento_empresa').select('pessoa_id')
            .eq('status_aprovacao', 'aprovado');
        const totalCredenciados = pivotAprovados ? pivotAprovados.length : 0;

        // Query 3: Documentos Pendentes
        const { data: docsPendentes } = await req.userClient
            .from('pessoa_documentos').select('id', { count: 'exact', head: true })
            .eq('status', 'pendente');

        // Query 4: Pessoas com Check-in
        const { data: listCheckins } = await req.userClient
            .from('pessoa_evento_empresa')
            .select('pessoa_id, pessoas!inner(id, nome, status_acesso)')
            .eq('status_aprovacao', 'aprovado')
            .eq('pessoas.status_acesso', 'checkin_feito');
        const presentesDesteMomento = listCheckins ? listCheckins.length : 0;

        // Query 5: Últimos Check-ins
        const { data: recentLogs } = await req.userClient
            .from('logs_acesso').select('*, pessoas!inner(nome, cpf)')
            .eq('tipo', 'CHECKIN').order('data_hora', { ascending: false }).limit(5);

        res.json({ success: true, stats: { ... }, recent_activity: recentLogs || [] });
    } catch (error) { ... }
});
```

### Código corrigido
```javascript
router.get('/stats', async (req, res) => {
    try {
        const empresaId = req.user.id;

        // Paralelizar todas as queries — nenhuma depende do resultado de outra
        const [empresaRes, aprovadosRes, docsRes, checkinsRes, logsRes] = await Promise.all([
            req.userClient.from('empresas').select('quota').eq('id', empresaId).single(),
            req.userClient.from('pessoa_evento_empresa').select('pessoa_id', { count: 'exact', head: true })
                .eq('status_aprovacao', 'aprovado'),
            req.userClient.from('pessoa_documentos').select('id', { count: 'exact', head: true })
                .eq('status', 'pendente'),
            req.userClient.from('pessoa_evento_empresa')
                .select('pessoa_id, pessoas!inner(id, nome, status_acesso)')
                .eq('status_aprovacao', 'aprovado')
                .eq('pessoas.status_acesso', 'checkin_feito'),
            req.userClient.from('logs_acesso').select('*, pessoas!inner(nome, cpf)')
                .eq('tipo', 'CHECKIN').order('data_hora', { ascending: false }).limit(5)
        ]);

        const cotaTotal = empresaRes.data?.quota || 0;
        const totalCredenciados = aprovadosRes.count || 0;
        const presentesDesteMomento = checkinsRes.data ? checkinsRes.data.length : 0;

        res.json({
            success: true,
            stats: {
                cotaTotal,
                totalCredenciados,
                cotaUsadaPerc: cotaTotal > 0 ? ((totalCredenciados / cotaTotal) * 100).toFixed(1) : 0,
                presentesAgora: presentesDesteMomento,
                ecmPendentes: docsRes.count || 0
            },
            recent_activity: logsRes.data || []
        });
    } catch (error) {
        logger.error('Portal B2B: Erro nos stats em tempo real:', error);
        res.status(500).json({ error: 'Falha ao processar métricas de inteligência.' });
    }
});
```

**Mudanças:**
1. `Promise.all()` em vez de 5 `await` sequenciais
2. Query 2 (aprovados) usa `count: 'exact', head: true` ao invés de baixar todos os IDs — muito mais leve
3. Performance estimada: ~50ms (1 round-trip) ao invés de ~250ms (5 round-trips)

### Teste
Acessar o portal de empresa como usuário B2B e verificar que o dashboard carrega com os dados corretos.

---

## ITEM 4: EventContext nunca é utilizado — dead code (MÉDIO)

### Problema
O `EventContext.jsx` define um provider com `{ nome: 'Evento Exemplo' }` hardcoded, mas NENHUM componente da aplicação o importa ou consome. Todo o código real usa `localStorage.getItem('active_evento_id')` diretamente nos hooks. Isso causa confusão para desenvolvedores.

### Arquivo
`a2-eventos/frontend/web-admin/src/contexts/EventContext.jsx`

### Correção
**Opção A (Recomendada): Deletar o arquivo.**

```bash
rm a2-eventos/frontend/web-admin/src/contexts/EventContext.jsx
```

Verificar se algum arquivo importa `EventContext` ou `EventProvider` ou `useEvent`:
```bash
grep -r "EventContext\|EventProvider\|useEvent" a2-eventos/frontend/web-admin/src/ --include="*.jsx" --include="*.js"
```

Se retornar resultados, remover os imports correspondentes. Se não retornar nada (esperado), é seguro deletar.

**Opção B (Futuro): Transformar em gerenciador real do evento ativo.**

Se no futuro quiser centralizar o evento ativo via Context ao invés de localStorage, o arquivo pode ser refatorado. Mas isso exigiria mudar TODOS os hooks que leem `localStorage.getItem('active_evento_id')` — um refactoring grande, não urgente.

---

## ITEM 5: LocalCheckinService listener não removível — memory leak (MÉDIO)

### Problema
O método `iniciarListenerConexao()` adiciona um `addEventListener('online', ...)` usando arrow function anônima. Como a referência da função é perdida, não há como remover o listener. Em React StrictMode (desenvolvimento), isso causa listeners duplicados.

### Arquivo
`a2-eventos/frontend/web-admin/src/services/LocalCheckinService.js` — linhas 127-137

### Código atual
```javascript
iniciarListenerConexao(onSyncStart, onSyncEnd) {
    window.addEventListener('online', async () => {
        log('[LocalCheckinService] Conexão restaurada.');
        const count = await this.getPendenteCount();
        if (count > 0) {
            if (onSyncStart) onSyncStart(count);
            await this.sincronizarFila();
            if (onSyncEnd) onSyncEnd();
        }
    });
}
```

### Código corrigido
```javascript
iniciarListenerConexao(onSyncStart, onSyncEnd) {
    // Remover listener anterior se existir
    if (this._onlineHandler) {
        window.removeEventListener('online', this._onlineHandler);
    }

    this._onlineHandler = async () => {
        log('[LocalCheckinService] Conexão restaurada.');
        const count = await this.getPendenteCount();
        if (count > 0) {
            if (onSyncStart) onSyncStart(count);
            await this.sincronizarFila();
            if (onSyncEnd) onSyncEnd();
        }
    };

    window.addEventListener('online', this._onlineHandler);
}

pararListenerConexao() {
    if (this._onlineHandler) {
        window.removeEventListener('online', this._onlineHandler);
        this._onlineHandler = null;
    }
}
```

**Mudanças:**
1. Armazenar referência do handler em `this._onlineHandler`
2. Antes de adicionar novo listener, remover o anterior (idempotente)
3. Novo método `pararListenerConexao()` para cleanup explícito
4. Quem chamar `iniciarListenerConexao` em um useEffect pode chamar `pararListenerConexao` no cleanup

**No hook que chama (provavelmente useCheckin.js ou App.jsx):**
```javascript
useEffect(() => {
    localCheckinService.iniciarListenerConexao(onStart, onEnd);
    return () => localCheckinService.pararListenerConexao();
}, []);
```

---

## ITEM 6: WebSocket rate limiter em memória — perde em restart (MÉDIO)

### Problema
O rate limiter do WebSocket usa um `Map()` em memória. Se o container reinicia, todos os contadores resetam. Em ambiente multi-node (futuro), cada instância teria seu próprio counter, tornando o rate limit ineficaz.

### Arquivo
`a2-eventos/backend/api-nodejs/src/services/websocketService.js` — linhas 17, 90-114

### Código atual (simplificado)
```javascript
async init(httpServer) {
    const rateLimitMap = new Map(); // ← Em memória, morre com o processo

    // ... mais adiante ...

    this.io.use((socket, next) => {
        const ip = socket.handshake.address;
        const now = Date.now();
        const limit = 20;

        if (!rateLimitMap.has(ip)) {
            rateLimitMap.set(ip, { count: 1, resetTime: now + 60000 });
            return next();
        }
        // ... contagem, bloqueio, etc ...
    });
}
```

### Código corrigido
```javascript
async init(httpServer) {
    const rateLimitMap = new Map(); // Fallback in-memory

    // ... após setup do Redis (this.redisEnabled já foi setado) ...

    this.io.use(async (socket, next) => {
        const ip = socket.handshake.address;
        const limit = 20;
        const windowSec = 60;

        try {
            if (this.redisEnabled && this.pubClient) {
                // Rate limit via Redis (cluster-safe, persiste entre restarts)
                const key = `ws_rate:${ip}`;
                const count = await this.pubClient.incr(key);
                if (count === 1) await this.pubClient.expire(key, windowSec);

                if (count > limit) {
                    logger.warn(`Rate Limit WS Excedido (Redis) para IP: ${ip}`);
                    return next(new Error('Rate limit exceeded. Try again later.'));
                }
                return next();
            }

            // Fallback: in-memory (single-node)
            const now = Date.now();
            if (!rateLimitMap.has(ip)) {
                rateLimitMap.set(ip, { count: 1, resetTime: now + windowSec * 1000 });
                return next();
            }
            const record = rateLimitMap.get(ip);
            if (now > record.resetTime) {
                record.count = 1;
                record.resetTime = now + windowSec * 1000;
                return next();
            }
            if (record.count > limit) {
                logger.warn(`Rate Limit WS Excedido (Memory) para IP: ${ip}`);
                return next(new Error('Rate limit exceeded. Try again later.'));
            }
            record.count++;
            next();
        } catch (err) {
            // Se Redis falhar, permite a conexão (fail-open)
            logger.error('Erro no rate limiter WS:', err.message);
            next();
        }
    });
}
```

**Mudanças:**
1. Se Redis está disponível (`this.redisEnabled`), usa `INCR` + `EXPIRE` no Redis — atômico, cluster-safe
2. Se Redis não está disponível, mantém o fallback em memória (comportamento atual)
3. Middleware agora é `async` para suportar chamadas ao Redis
4. Fail-open: se o Redis falhar no momento da verificação, permite a conexão (melhor do que bloquear por erro interno)

### Teste
```bash
# Verificar que USE_REDIS=true no docker-compose.yml (já está)
docker-compose restart api
# Testar conexão WebSocket no navegador — deve funcionar normalmente
# Verificar logs: deve aparecer "(Redis)" nos logs de rate limit se configurado
```

---

## ITEM 7: Python 3.10 em EOL no ai_worker (BAIXO)

### Problema
O Dockerfile do ai_worker usa `python:3.10-slim-bullseye`. Python 3.10 atingiu fim de suporte em outubro 2024. Não receberá mais patches de segurança.

### Arquivo
`a2-eventos/backend/microservice-face-python/Dockerfile` — linha 1

### Correção

**Código atual (linha 1):**
```dockerfile
FROM python:3.10-slim-bullseye
```

**Código corrigido:**
```dockerfile
FROM python:3.12-slim-bookworm
```

**Mudanças:**
1. Python 3.10 → 3.12 (LTS até outubro 2028)
2. Debian Bullseye → Bookworm (base OS atualizada, recebe patches de segurança)

### Cuidados
- Verificar se o `requirements.txt` tem dependências incompatíveis com Python 3.12
- O `dlib` e `face_recognition` podem precisar de compilação — testar o build:
```bash
docker-compose build --no-cache ai_worker
```
- Se falhar com erro de compilação em `dlib`, adicionar ao Dockerfile:
```dockerfile
RUN pip install --no-cache-dir dlib==19.24.2
```
antes do `RUN pip install -r requirements.txt`

### Teste
```bash
docker-compose build --no-cache ai_worker
docker-compose up -d --no-deps ai_worker
docker-compose logs ai_worker --tail=20
# Verificar que inicia sem erros de importação
```

---

## ITEM 8: Node 18 no web-admin Dockerfile (BAIXO)

### Problema
O Dockerfile do admin-web usa `node:18-alpine` no builder stage. Node 18 entra em End-of-Life em abril 2025 (já EOL).

### Arquivo
`a2-eventos/frontend/web-admin/Dockerfile` — linha 1

### Correção
Já incluída no ITEM 1 acima — a correção muda `node:18-alpine` para `node:20-alpine` (LTS até abril 2026).

---

## ORDEM DE EXECUÇÃO RECOMENDADA

| Prioridade | Item | Risco se não corrigir | Esforço |
|---|---|---|---|
| 1 | ITEM 1 — USER non-root | Segurança — escalação de privilégios | 5 min |
| 2 | ITEM 2 — service_healthy | Estabilidade — API pode crashar no boot | 5 min |
| 3 | ITEM 3 — Promise.all no stats | Performance — 250ms → 50ms | 10 min |
| 4 | ITEM 5 — Listener removível | Memory leak em dev/StrictMode | 10 min |
| 5 | ITEM 6 — Redis rate limit WS | Rate limit ineficaz em cluster | 15 min |
| 6 | ITEM 4 — EventContext dead code | Confusão — nenhum impacto funcional | 2 min |
| 7 | ITEM 7 — Python 3.12 | Segurança — sem patches | 5 min + teste |
| 8 | ITEM 8 — Node 20 | Segurança — sem patches | Incluído no Item 1 |

---

## DEPLOY APÓS TODAS AS CORREÇÕES

```bash
cd /home/nzt-painel/a2-eventos/a2-eventos

# Rebuild TODOS os containers alterados
docker-compose build --no-cache api admin-web gateway ai_worker

# Restart com nova ordem de dependências
docker-compose down
docker-compose up -d

# Verificar saúde
docker-compose ps
docker-compose logs api --tail=30
```
