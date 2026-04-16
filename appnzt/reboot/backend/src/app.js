// A2 Eventos Backend (NZT - Intelligent Control Systems)
require('dotenv').config();
process.env.TZ = 'America/Sao_Paulo';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const logger = require('./services/logger');

const healthRoutes = require('./routes/health');
const authRoutes = require('./routes/auth');
const publicRoutes = require('./routes/public');
const checkinRoutes = require('./routes/checkin');
const eventsRoutes = require('./routes/events');
const companiesRoutes = require('./routes/companies');
const peopleRoutes = require('./routes/people');
const vehiclesRoutes = require('./routes/vehicles');
const documentsRoutes = require('./routes/documents');
const reportsRoutes = require('./routes/reports');
const usersRoutes = require('./routes/users');
const devicesRoutes = require('./routes/devices');
const monitorRoutes = require('./routes/monitor');

const app = express();
const PORT = process.env.PORT || 3001;

app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            connectSrc: ["'self'", "*"],
            imgSrc: ["'self'", "data:", "blob:", "*"],
            styleSrc: ["'self'", "'unsafe-inline'"],
        },
    },
}));

// CORS
const corsOptions = {
    origin: process.env.FRONTEND_URL || true,
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization']
};
app.use(cors(corsOptions));

// Rate limiting
const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false
});
app.use(apiLimiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Routes - Health & Public
app.use('/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/public', publicRoutes);

// Routes - Protected
app.use('/api/checkin', checkinRoutes);
app.use('/api/events', eventsRoutes);
app.use('/api/companies', companiesRoutes);
app.use('/api/people', peopleRoutes);
app.use('/api/vehicles', vehiclesRoutes);
app.use('/api/documents', documentsRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/devices', devicesRoutes);
app.use('/api/monitor', monitorRoutes);

// Error handler
app.use((err, req, res, next) => {
    logger.error(err);
    res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
    logger.info(`🚀 A2 Eventos (NZT) backend listening on port ${PORT}`);
});

module.exports = app;