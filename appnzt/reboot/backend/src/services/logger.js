const pino = require('pino');
const isDev = process.env.NODE_ENV === 'development';
const logger = isDev ? pino({ transport: { target: 'pino-pretty' } }) : pino();
module.exports = logger;
