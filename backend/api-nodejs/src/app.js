// ⏰ Sincronização de timezone com o fuso horário real do computador operacional
try {
    const pcTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    process.env.TZ = process.env.TZ || pcTimezone || 'America/Sao_Paulo';
} catch (_) {
    process.env.TZ = process.env.TZ || 'America/Sao_Paulo';
}

const dotenv = require('dotenv');
dotenv.config();

// 🔒 CRÍTICO: Validar environment variables IMEDIATAMENTE após dotenv.config()
const { validateEnvironment } = require('./config/env');
const ENV = validateEnvironment();

// FIX 4.2: Sentry deve ser inicializado antes de qualquer outro módulo
const Sentry = require('@sentry/node');
const SENTRY_DSN = ENV.SENTRY_DSN || process.env.SENTRY_DSN_BACKEND || 'https://f69531af6f2fb198152abfc419c690bc@o4511978719346688.ingest.us.sentry.io/4511978757554176';
if (SENTRY_DSN) {
    Sentry.init({
        dsn: SENTRY_DSN,
        environment: ENV.NODE_ENV,
        // Erros vão 100%; rastreio de desempenho em 10% e sem profiling
        // (com 100% custava CPU em toda requisição e estourava a cota no pico do evento)
        tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_RATE || '0.1'),
        integrations: [
            Sentry.httpIntegration(),
        ],
    });
}

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const http = require('http');

const { testConnection } = require('./config/database');
const { testPgConnection } = require('./config/pgEdge');
const { supabase } = require('./config/supabase');
const syncScheduler = require('./modules/devices/syncScheduler.service');
const cloudSyncWorker = require('./workers/cloud_sync_worker');
const logger = require('./services/logger');
const cronController = require('./modules/events/cron.controller');
const rateLimiter = require('./middleware/rateLimiter');
const healthService = require('./modules/system/health.service');

const authRoutes = require('./modules/auth/auth.routes');
const syncRoutes = require('./modules/devices/sync.routes');
const empresaRoutes = require('./modules/entities/empresa.routes');
const pessoaRoutes = require('./modules/entities/pessoa.routes');
const eventoRoutes = require('./modules/events/event.routes');
const accessRoutes = require('./modules/checkin/checkin.routes');
const monitorRoutes = require('./modules/system/monitor.routes');
const reportRoutes = require('./modules/reports/report.routes');
const deviceRoutes = require('./modules/devices/device.routes');
const publicRoutes = require('./modules/system/public.routes');
const excelRoutes = require('./modules/reports/excel.routes');
const intelbrasRoutes = require('./modules/devices/intelbras.routes');
const hikvisionRoutes = require('./modules/devices/hikvision.routes');
const configRoutes = require('./modules/system/config.routes');
const settingsRoutes = require('./modules/system/settings.routes');
const veiculosRoutes = require('./modules/entities/veiculo.routes');
const documentosRoutes = require('./modules/entities/documento.routes');
const portalEmpresaRoutes = require('./modules/portal/empresa.routes');
const portalClienteRoutes = require('./modules/portal/cliente.routes');
const auditRoutes = require('./modules/audit/audit.routes');
const paymentRoutes = require('./modules/payments/payment.routes');
const messageRoutes = require('./modules/system/message.routes');
const lgpdRoutes = require('./modules/system/lgpd.routes');
const watchlistRoutes = require('./modules/system/watchlist.routes');
const cameraRoutes = require('./modules/system/camera.routes');

const app = express();
app.set('trust proxy', 1);

// --- MIDDLEWARE DE FORÇAR HTTPS (Proxy Aware) ---
app.use((req, res, next) => {
    const isHealthcheck = req.path === '/health' || req.path === '/health/' || req.path === '/ready';
    const isHardwareCallback = req.path.startsWith('/api/intelbras/') || req.path.startsWith('/api/hikvision/');
    const isSmtpVerification = req.path === '/api/settings/verify-smtp';
    const isLocalhost = req.get('host').includes('localhost') || req.get('host').includes('127.0.0.1');

    // Nao redirecionar healthcheck, callbacks de hardware, testes de SMTP ou localhost
    if (isHealthcheck || isHardwareCallback || isSmtpVerification || isLocalhost) {
        return next();
    }
    if (process.env.NODE_ENV === 'production' && !req.secure && req.get('X-Forwarded-Proto') !== 'https') {
        return res.redirect('https://' + req.get('host') + req.url);
    }
    next();
});

// 🌍 INTERNACIONALIZAÇÃO (i18n)
const { i18next, middleware } = require('./config/i18n');
app.use(middleware.handle(i18next));

// 🛡️ SEGURANÇA GLOBAL
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
            connectSrc: ["'self'", "*"],
            imgSrc: ["'self'", "data:", "blob:", "*"],
            styleSrc: ["'self'", "'unsafe-inline'"],
        },
    },
}));
app.use(rateLimiter.api);

// CONFIGURAÇÃO DE CORS CENTRALIZADA
const { isOriginAllowed } = require('./config/cors');
const corsOptions = {
    origin: function (origin, callback) {
        if (process.env.NODE_ENV === 'development') {
            return callback(null, true);
        }
        if (isOriginAllowed(origin)) {
            callback(null, true);
        } else {
            logger.warn(`🚫 Bloqueio CORS para origem: ${origin}`);
            callback(new Error('Bloqueado pelo CORS do A2 Eventos'));
        }
    },
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'x-evento-id', 'X-Requested-With', 'Accept', 'Origin'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH']
};

// Healthcheck routes (bypassa CORS e rate limiting)
app.use(require('./modules/system/health.routes'));

// app.use(cors(corsOptions)); // DESATIVADO: Gateway (Nginx) centraliza a autoridade de CORS (v15.0)
app.use(compression());
app.use(express.json({
    limit: '10mb',
    verify: (req, res, buf) => {
        // Preservar raw body para validação de assinatura de webhooks
        if (req.originalUrl && req.originalUrl.startsWith('/api/payments')) {
            req.rawBody = buf.toString('utf8');
        }
    }
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 🔍 LOG DE REQUESTS (apenas em desenvolvimento, sem logar body de rotas sensíveis)
if (process.env.NODE_ENV === 'development') {
    app.use((req, res, next) => {
        const isSensitive = req.path.includes('/auth/');
        const bodyPreview = isSensitive ? '[REDACTED]' : JSON.stringify(req.body).substring(0, 200);
        logger.info(`➡️  ${req.method} ${req.path} | IP: ${req.ip} | Body: ${bodyPreview}`);
        next();
    });
}

// --- MIDDLEWARE DE SANITIZAÇÃO GLOBAL (Evita falhas de conversão de UUID - 22P02) ---
app.use((req, res, next) => {
    const sanitize = (obj) => {
        if (!obj || typeof obj !== 'object') return;
        for (const key of Object.keys(obj)) {
            if (obj[key] === 'undefined' || obj[key] === 'null') {
                obj[key] = null;
            } else if (typeof obj[key] === 'object') {
                sanitize(obj[key]);
            }
        }
    };
    if (req.body) sanitize(req.body);
    if (req.query) sanitize(req.query);
    if (req.params) sanitize(req.params);
    if (req.headers) sanitize(req.headers);
    next();
});

// --- 🛡️ LGPD: Middleware de Auditoria ---
const auditMiddleware = require('./middleware/audit');
app.use(auditMiddleware);

// FIX 4.7: Injeta cliente Supabase escopado ao token do usuário em req.supabase
const { injectSupabaseClient } = require('./middleware/supabaseClient');
app.use(injectSupabaseClient);

// Rotas (o rate limiting é aplicado por rota em auth.routes e checkin.routes)
app.use('/api/auth', authRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/empresas', empresaRoutes);
app.use('/api/pessoas', pessoaRoutes);
app.use('/api/eventos', eventoRoutes);
app.use('/api/access', accessRoutes);
app.use('/api/pulseira', accessRoutes); // Alias para compatibilidade com rotas de pulseira
app.use('/api/checkin', accessRoutes); // Alias para compatibilidade com rotas de checkin/fiscalização
app.use('/api/monitor', monitorRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/dispositivos', deviceRoutes); // Alias para compatibilidade com front antigo/específico
app.use('/api/intelbras', intelbrasRoutes);
// Alias direto na raiz para Keepalive e Heartbeat de terminais Intelbras
const intelbrasController = require('./modules/devices/intelbras.controller');
app.get('/keepalive', (req, res) => intelbrasController.handleKeepalive(req, res));
app.post('/keepalive', (req, res) => intelbrasController.handleKeepalive(req, res));
app.use('/api/hikvision', hikvisionRoutes);
app.use('/api/config', configRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/veiculos', veiculosRoutes);
app.use('/api/documentos', documentosRoutes);
app.use('/api/excel', excelRoutes);
app.use('/api/notificacoes', require('./modules/system/notificacao.routes'));
app.use('/api/remuneracao', require('./modules/remuneracao/remuneracao.routes'));
app.use('/api/pulseiras', require('./modules/pulseiras/pulseira.routes'));
app.use('/api/agentes', require('./modules/devices/agent.routes'));
app.use('/api/portal/empresa', portalEmpresaRoutes);
app.use('/api/portal/cliente', portalClienteRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/lgpd', lgpdRoutes);
app.use('/api/watchlist', watchlistRoutes);
app.use('/api/cameras', cameraRoutes);
app.use('/public', rateLimiter.public, publicRoutes);
app.use('/api/public', rateLimiter.public, publicRoutes); // FIX I-10: rate limiter dedicado para rotas públicas

// ============================================
// GLOBAL ERROR HANDLER — FIX CRÍTICO #3
// ============================================
const { errorHandler } = require('./middleware/errorHandler');

// 404 handler (deve vir antes do error handler)
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Rota não encontrada',
        path: req.path,
        method: req.method
    });
});

// Global error handler (deve ser o último middleware)
app.use(errorHandler);

const websocketService = require('./services/websocketService');
const PORT = process.env.PORT || 3001;

// --- CONFIGURAÇÃO DE BOOT (Somente HTTP) ---
// O Nginx já é responsável pela terminação SSL.
// Subir em HTTPS internamente causa "502 Bad Gateway" no Nginx por mismatch de protocolo.
const server = http.createServer(app);
logger.info('🌐 Modulo: HTTP ativo (Terminação SSL gerada pelo Nginx / Reverse Proxy)');

const { protegerProcesso } = require('./utils/processo');
const encerrarProcesso = protegerProcesso({
    nome: 'API',
    server,
    websocket: websocketService,
    Sentry,
    aoEncerrar: [
        () => { for (const t of require('node-cron').getTasks().values()) t.stop(); },
        () => { cloudSyncWorker.isRunning = false; },
        () => require('./services/queue.service').getClient()?.quit(),
    ]
});

server.listen(PORT, async () => {
    logger.info(`🚀 Servidor rodando na porta ${PORT}`);

    try {
        // Inicializar WebSocket
        await websocketService.init(server);
        const agentService = require('./services/agentService');
        agentService.init(websocketService.io);
        // Alertas das câmeras com o painel fechado (agente local ou motor no próprio servidor)
        require('./modules/system/vigilancia.service').iniciar();
        syncScheduler.start();
        cloudSyncWorker.start();
        healthService.start();
        cronController.start();
    } catch (err) {
        // Sem WebSocket/rotinas a API parece saudável mas não funciona: sai para o Docker reiniciar
        logger.error(`❌ Erro no boot, reiniciando: ${err.stack || err.message}`);
        encerrarProcesso('erro no boot', 1);
        return;
    }

    // Testes de banco legados (MSSQL/edge desligados) só informam, não derrubam
    await testConnection().catch(e => logger.warn(`Teste MSSQL: ${e.message}`));
    await testPgConnection().catch(e => logger.warn(`Teste edge: ${e.message}`));
});
