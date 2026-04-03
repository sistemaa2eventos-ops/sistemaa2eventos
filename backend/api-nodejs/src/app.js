// ⏰ CRÍTICO: Definir timezone ANTES de qualquer outro código
// Garante que new Date() e Intl usem sempre o horário de Brasília
process.env.TZ = 'America/Sao_Paulo';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const dotenv = require('dotenv');
const { createServer } = require('http');
const { i18next, middleware } = require('./config/i18n');

dotenv.config();

const { testConnection } = require('./config/database');
const { testPgConnection } = require('./config/pgEdge');
const { supabase } = require('./config/supabase');
const syncScheduler = require('./modules/devices/syncScheduler.service');
const cloudSyncWorker = require('./workers/cloud_sync_worker');
const logger = require('./services/logger');
const cronController = require('./modules/events/cron.controller');
const rateLimiter = require('./middleware/rateLimiter');

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
const configRoutes = require('./modules/system/config.routes');
const settingsRoutes = require('./modules/system/settings.routes');
const veiculosRoutes = require('./modules/entities/veiculo.routes');
const documentosRoutes = require('./modules/entities/documento.routes');
const portalEmpresaRoutes = require('./modules/portal/empresa.routes');
const portalClienteRoutes = require('./modules/portal/cliente.routes');

const app = express();
const httpServer = createServer(app);

// 🌍 INTERNACIONALIZAÇÃO (i18n)
app.use(middleware.handle(i18next));

// 🛡️ SEGURANÇA GLOBAL
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // Permite eval para dev
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
    credentials: true
};

app.use(cors(corsOptions));
app.use(compression());
app.use(express.json({ limit: '10mb' })); // Limite de 10mb para segurança
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
app.use('/api/dispositivos', deviceRoutes); // Alias para compatibilidade com front antigo/específico
app.use('/api/excel', excelRoutes);
app.use('/api/intelbras', intelbrasRoutes);
app.use('/api/config', configRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/veiculos', veiculosRoutes);
app.use('/api/documentos', documentosRoutes);
app.use('/api/portal/empresa', portalEmpresaRoutes);
app.use('/api/portal/cliente', portalClienteRoutes);
app.use('/public', publicRoutes);

const websocketService = require('./services/websocketService');

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, async () => {
    logger.info(`🚀 Servidor rodando na porta ${PORT}`);

    // Inicializar WebSocket
    websocketService.init(httpServer);

    await testConnection();
    await testPgConnection();
    syncScheduler.start();
    cloudSyncWorker.start();
    cronController.start();
});