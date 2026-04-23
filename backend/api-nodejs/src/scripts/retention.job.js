/**
 * 🧹 A2 Eventos - Job de Retenção Automática (LGPD)
 * Este script deve ser acionado por um Cron Job ou agendador externo.
 * Ex: node src/scripts/retention.job.js
 */
const lgpdService = require('../modules/system/lgpd.service');
const logger = require('../services/logger');

async function runRetention() {
    console.log('--- 🛡️ INICIANDO JOB DE RETENÇÃO LGPD ---');
    logger.info('[JOB] Iniciando verificação de retenção de dados...');

    try {
        // Configuração padrão: 90 dias após o fim do evento
        const RETENTION_DAYS = process.env.LGPD_RETENTION_DAYS || 90;
        
        const result = await lgpdService.processRetentionBatch(RETENTION_DAYS);
        
        console.log(`✅ Sucesso: ${result.processed} registros anonimizados.`);
        logger.info(`[JOB] Retenção concluída com sucesso. Processados: ${result.processed}`);
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Erro crítico no Job de Retenção:', error);
        logger.error('[JOB] Falha catastrófica na retenção:', error);
        process.exit(1);
    }
}

// Executar
runRetention();
