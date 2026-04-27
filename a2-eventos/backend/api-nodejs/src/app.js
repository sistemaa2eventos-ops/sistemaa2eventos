// ⏰ CRÍTICO: Definir timezone ANTES de qualquer outro código
process.env.TZ = 'America/Sao_Paulo';

const dotenv = require('dotenv');
dotenv.config();

// 🔒 CRÍTICO: Validar environment variables IMEDIATAMENTE após dotenv.config()
const { validateEnvironment } = require('./config/env');
const ENV = validateEnvironment();

// FIX 4.2: Sentry deve ser inicializado antes de qualquer outro módulo
const Sentry = require('@sentry/node');
if (ENV.SENTRY_DSN) {
    Sentry.init({
        dsn: ENV.SENTRY_DSN,
        environment: ENV.NODE_ENV,
        tracesSampleRate: ENV.NODE_ENV === 'production' ? 0.1 : 1.0,
        integrations: [Sentry.httpIntegration()]
    });
}

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const http = require('http');

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
const cameraWebhookRoutes = require('./modules/camera/camera-webhook.routes');

const app = express();
app.set('trust proxy', 1);

// --- MIDDLEWARE DE FORÇAR HTTPS (Proxy Aware) ---
app.use((req, res, next) => {
    const isHealthcheck = req.path === '/health' || req.path === '/health/';
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


const { i18next, middleware } = require('./config/i18n');
app.use(middleware.handle(i18next));

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

const { isOriginAllowed } = require('./config/cors');
const corsOptions = {
    origin: function (origin, callback) {
        if (process.env.NODE_ENV === 'development') return callback(null, true);
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

app.use(cors(corsOptions));
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
// Permite que controllers usem RLS nativamente via `req.supabase || supabase`
const { injectSupabaseClient } = require('./middleware/supabaseClient');
app.use(injectSupabaseClient);

app.use(require('./modules/system/health.routes'));

// Rotas
app.use('/api/auth', authRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/empresas', empresaRoutes);
app.use('/api/pessoas', pessoaRoutes);
app.use('/api/eventos', eventoRoutes);
app.use('/api/access', accessRoutes);
app.use('/api/monitor', monitorRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/dispositivos', deviceRoutes); // Alias para compatibilidade
app.use('/api/excel', excelRoutes);
app.use('/api/intelbras', intelbrasRoutes);
app.use('/api/hikvision', hikvisionRoutes);
app.use('/api/config', configRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/veiculos', veiculosRoutes);
app.use('/api/documentos', documentosRoutes);
app.use('/api/portal/empresa', portalEmpresaRoutes);
app.use('/api/portal/cliente', portalClienteRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/lgpd', lgpdRoutes);
app.use('/api/watchlist', watchlistRoutes);
app.use('/api/cameras', cameraRoutes);
app.use('/api/camera', cameraWebhookRoutes); // Camera Service webhooks
app.use('/api/public', rateLimiter.public, publicRoutes); // FIX I-10: rate limiter dedicado para rotas públicas

// ============================================
// GLOBAL ERROR HANDLER — FIX CRÍTICO #3
// Deve vir APÓS todas as rotas.
// Previne stack traces em produção, centraliza logs e reporta ao Sentry.
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
let server = http.createServer(app);
logger.info('🌐 Modulo: HTTP ativo (Terminação SSL gerada pelo Nginx / Reverse Proxy)');

server.listen(PORT, async () => {
    try {
        logger.info(`🚀 Servidor A2 Eventos rodando na porta ${PORT}`);
        await websocketService.init(server);
        const agentService = require('./services/agentService');
        agentService.init(websocketService.io);
        // Teste de conexão com PostgreSQL Edge (Apenas se habilitado)
        if (process.env.ENABLE_PG_EDGE === 'true') {
            await testPgConnection().catch(() => logger.warn('⚠️ Postgres Edge offline'));
        }
        
        if (process.env.ENABLE_SQL_SYNC === 'true') {
            syncScheduler.start();
            cloudSyncWorker.start();
            healthService.start();
        }
        cronController.start();
    } catch (err) {
        logger.error('❌ Erro no boot:', err.message);
    }
});
