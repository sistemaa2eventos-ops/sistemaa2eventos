// ⏰ CRÍTICO: Definir timezone ANTES de qualquer outro código
process.env.TZ = 'America/Sao_Paulo';

const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const dotenv = require('dotenv');
const { createServer } = require('http');

dotenv.config();

const Sentry = require("@sentry/node");
const { nodeProfilingIntegration } = require("@sentry/profiling-node");

Sentry.init({
  dsn: process.env.SENTRY_DSN_BACKEND || "https://f69531af6f2fb198152abfc419c690bc@o4511978719346688.ingest.us.sentry.io/4511978757554176",
  integrations: [
    nodeProfilingIntegration(),
  ],
  tracesSampleRate: 1.0, 
  profilesSampleRate: 1.0,
});

const { testConnection } = require('./config/database');
const logger = require('./services/logger');
const intelbrasRoutes = require('./modules/devices/intelbras.routes');
const errorHandler = require('./middleware/errorHandler');

const app = express();

app.use(Sentry.Handlers.requestHandler());
app.use(Sentry.Handlers.tracingHandler());

const httpServer = createServer(app);

// 🛡️ SEGURANÇA E PARSERS
app.use(helmet());
app.use(compression());
// Permitir corpos maiores porque as catracas enviam fotos em base64/form-data
app.use(express.json({ limit: '20mb' })); 
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// 🔍 LOG DE REQUESTS (Hardware)
if (process.env.NODE_ENV === 'development') {
    app.use((req, res, next) => {
        logger.info(`[INTELBRAS-WORKER] ➡️  ${req.method} ${req.path} | IP: ${req.ip}`);
        next();
    });
}

// 🚦 ROTA EXCLUSIVA DO WORKER
app.use('/api/intelbras', intelbrasRoutes);

// Rota de Healthcheck do Worker
app.get('/api/intelbras/ping', (req, res) => {
    res.json({
        success: true,
        message: 'Intelbras Dedicated Worker is alive!',
        port: process.env.PORT || 3002
    });
});

app.use(Sentry.Handlers.errorHandler());
app.use(errorHandler);

// A porta do Worker será passada pelo docker-compose (ex: 3002)
const PORT = process.env.PORT || 3002;

httpServer.listen(PORT, async () => {
    logger.info(`🤖 [INTELBRAS-WORKER] Servidor Dedicado rodando na porta ${PORT}`);
    
    // Testa apenas o banco, sem carregar cronjobs ou websockets desnecessários
    await testConnection();
});
