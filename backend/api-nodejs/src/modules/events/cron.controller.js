const cron = require('node-cron');
const { supabase } = require('../../config/supabase');
const logger = require('../../services/logger');

class CronController {
    /**
     * Inicia as rotinas agendadas (CRON Jobs)
     */
    start() {
        logger.info('⏰ Inicializando CRON Jobs...');

        // Rodar todos os dias às 03:00 da manhã
        cron.schedule('0 3 * * *', async () => {
            logger.info('🔄 [CRON] Iniciando rotina de Fechamento de Turno Diário...');
            await this.resetTurnos();
        });

        // Rodar a cada 5 minutos para monitorar a trava do Auto Check-out Global
        cron.schedule('*/5 * * * *', async () => {
            await this.autoCheckoutRoutine();
        });

        // Rodar todos os dias às 04:00 da manhã para invalidar documentos vencidos
        cron.schedule('0 4 * * *', async () => {
            logger.info('🔄 [CRON] Iniciando rotina de Revogação de Documentos (ECM)...');
            await this.revogarDocumentosVencidos();
        });
    }

    /**
     * Varrer a tabela system_settings para descobrir se existe uma Trava de Auto Checkout.
     * Se houver, busca pessoas com "checkin_feito" a mais tempo do que a trava.
     */
    async autoCheckoutRoutine() {
        try {
            // system_settings está no SQL Server, não no Supabase.
            // Auto-checkout automático desabilitado por padrão (timeout = 0).
            const timeoutStr = null;
            if (!timeoutStr || parseInt(timeoutStr) <= 0) return; // Sem trava global.


            const timeoutMinutes = parseInt(timeoutStr);
            const checkTimeLimit = new Date();
            checkTimeLimit.setMinutes(checkTimeLimit.getMinutes() - timeoutMinutes);

            // Supabase: Buscar pessoas onde o updated_at é MENOR (mais velho) que checkTimeLimit
            const { data: overstayed, error: fetchErr } = await supabase
                .from('pessoas')
                .select('id, nome, evento_id')
                .eq('status_acesso', 'checkin_feito')
                .lt('updated_at', checkTimeLimit.toISOString());

            if (fetchErr) throw fetchErr;

            if (overstayed.length === 0) return;

            logger.info(`🚨 [CRON] Aplicando Auto-Checkout em ${overstayed.length} pessoas (Timeout: ${timeoutMinutes}min)`);

            const checkoutLogs = overstayed.map(p => ({
                pessoa_id: p.id,
                evento_id: p.evento_id,
                tipo: 'checkout',
                metodo: 'sistema_timeout',
                status: 'sucesso',
                criado_em: new Date().toISOString()
            }));

            const { error: logsErr } = await supabase.from('logs_acesso').insert(checkoutLogs);
            if (logsErr) logger.error('[CRON] Erro ao salvar logs de timeout:', logsErr);

            const pessoasIds = overstayed.map(p => p.id);
            const { error: updateErr } = await supabase
                .from('pessoas')
                .update({ status_acesso: 'pendente', updated_at: new Date().toISOString() })
                .in('id', pessoasIds);

            if (updateErr) throw updateErr;

        } catch (error) {
            logger.error('❌ [CRON] Falha na execução do Auto-Checkout:', error);
        }
    }

    /**
     * Força o checkout de pessoas que ficaram presas com 'checkin_feito' no final do dia
     * para evitar bloqueio de "Double Entry" no dia seguinte.
     */
    async resetTurnos() {
        try {
            // Busca pessoas que estão com check-in pendente (não deram checkout)
            const { data: presas, error: fetchErr } = await supabase
                .from('pessoas')
                .select('id, nome, evento_id')
                .eq('status_acesso', 'checkin_feito');

            if (fetchErr) throw fetchErr;

            if (presas.length === 0) {
                logger.info('✅ [CRON] Nenhum status pendente de checkout encontrado.');
                return;
            }

            logger.info(`🚨 [CRON] Encontradas ${presas.length} pessoas com checkin preso. Aplicando 'checkout_forcado'.`);

            // Transição para status pendente para entrar no dia seguinte normalmente.
            // Poderíamos usar 'checkout_feito' ou 'pendente'.
            // Vamos logar na tabela logs_acesso que houve um checkout forçado.
            const checkoutLogs = presas.map(p => ({
                pessoa_id: p.id,
                evento_id: p.evento_id,
                tipo: 'checkout',
                metodo: 'sistema_cron',
                status: 'sucesso',
                confianca: null,
                criado_em: new Date().toISOString()
            }));

            // 1. Inserir logs de checkout automático
            const { error: logsErr } = await supabase
                .from('logs_acesso')
                .insert(checkoutLogs);

            if (logsErr) {
                logger.error('[CRON] Erro ao salvar logs de checkout forçado:', logsErr);
            }

            // 2. Atualizar status na tabela pessoas
            const pessoasIds = presas.map(p => p.id);
            const { error: updateErr } = await supabase
                .from('pessoas')
                .update({ status_acesso: 'pendente' })
                .in('id', pessoasIds);

            if (updateErr) throw updateErr;

            logger.info('✅ [CRON] Rotina de Fechamento de Turno concluída com sucesso.');

        } catch (error) {
            logger.error('❌ [CRON] Falha na execução do Reset de Turnos:', error);
        }
    }

    /**
     * Chama a procedure do Supabase para revogar documentos (NRs, ASOs) que já passaram da data de validade.
     */
    async revogarDocumentosVencidos() {
        try {
            const { error } = await supabase.rpc('revogar_documentos_vencidos');

            if (error) {
                // Se a procedure ainda não foi rodada no SQL (migration pendente), ignora o fluxo crasso ou loga.
                if (error.code !== 'PGRST202') throw error;
            } else {
                logger.info('✅ [CRON] Rotina de Revogação de ECM concluída. Status de expiração atualizados.');
            }
        } catch (error) {
            logger.error('❌ [CRON] Falha na execução da Revogação de Documentos:', error);
        }
    }

    /**
     * Endpoint para gatilho manual do Reset de Turnos
     */
    manualTrigger = async (req, res) => {
        try {
            await this.resetTurnos();
            res.json({ success: true, message: 'Reset de turnos disparado com sucesso' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }
}

module.exports = new CronController();
