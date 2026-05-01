const cron = require('node-cron');
const { supabase } = require('../../config/supabase');
const logger = require('../../services/logger');
const excelController = require('../reports/excel.controller');
const emailService = require('../../services/emailService');

class CronController {
    constructor() {
        this._resetTask     = null;
        this._relatorioTask = null;
    }

    // Converte "HH:mm" para expressão cron "mm HH * * *"
    _toCron(hhmm) {
        const [h, m] = (hhmm || '03:00').split(':');
        return `${m || '00'} ${h || '03'} * * *`;
    }

    async start() {
        logger.info('⏰ Inicializando CRON Jobs...');

        let resetH = '03:00';
        let relatorioH = '03:30';

        try {
            const { data } = await supabase
                .from('system_settings')
                .select('cron_reset_hora, cron_relatorio_hora')
                .eq('id', 1)
                .single();
            if (data) {
                resetH    = data.cron_reset_hora    || resetH;
                relatorioH = data.cron_relatorio_hora || relatorioH;
            }
        } catch (err) {
            logger.error('Erro ao buscar horários de CRON no banco:', err);
        }

        this._scheduleConfigurableJobs(resetH, relatorioH);

        // Jobs fixos (não configuráveis pelo usuário) — Promise não awaited intencionalmente;
        // erros capturados internamente via try/catch em cada método.
        cron.schedule('*/5 * * * *', () => {
            this.autoCheckoutRoutine().catch(e => logger.error('[CRON] autoCheckoutRoutine falhou:', e));
        });
        cron.schedule('0 4 * * *', () => {
            logger.info('🔄 [CRON] Revogação de Documentos (ECM)...');
            this.revogarDocumentosVencidos().catch(e => logger.error('[CRON] revogarDocumentosVencidos falhou:', e));
        });
    }

    // Agenda (ou reagenda) apenas os jobs configuráveis pelo usuário
    _scheduleConfigurableJobs(resetH, relatorioH) {
        if (this._resetTask)     { this._resetTask.stop();     this._resetTask = null; }
        if (this._relatorioTask) { this._relatorioTask.stop(); this._relatorioTask = null; }

        this._resetTask = cron.schedule(this._toCron(resetH), () => {
            logger.info(`🔄 [CRON] Fechamento de Turno (${resetH})...`);
            this.resetTurnos().catch(e => logger.error('[CRON] resetTurnos falhou:', e));
        });

        this._relatorioTask = cron.schedule(this._toCron(relatorioH), () => {
            logger.info(`🔄 [CRON] Relatórios Diários (${relatorioH})...`);
            this.enviarRelatoriosGlobais().catch(e => logger.error('[CRON] enviarRelatoriosGlobais falhou:', e));
        });

        logger.info(`⏰ [CRON] Reagendado: Reset=${resetH}, Relatório=${relatorioH}`);
    }

    // Chamado pelo settings.controller quando cron_reset_hora ou cron_relatorio_hora mudam
    reschedule(resetH, relatorioH) {
        this._scheduleConfigurableJobs(resetH, relatorioH);
    }

    /**
     * Envia relatórios de todos os eventos ativos para os admins configurados
     */
    async enviarRelatoriosGlobais() {
        try {
            const { data: eventos } = await supabase.from('eventos').select('id, nome').eq('ativo', true);
            if (!eventos) return;

            const dataOntem = new Date();
            dataOntem.setDate(dataOntem.getDate() - 1);
            const dataFmt = dataOntem.toISOString().split('T')[0];

            for (const ev of eventos) {
                try {
                    // Buscar emails configurados em system_settings para este evento (ou global)
                    const { data: settings } = await supabase.from('system_settings').select('relatorio_emails').eq('id', 1).single();
                    const emails = settings?.relatorio_emails || [];

                    if (emails.length > 0) {
                        const workbook = await excelController.gerarRelatorioDiario(ev.id, dataFmt);
                        const buffer = await workbook.xlsx.writeBuffer();
                        for (const email of emails) {
                            await emailService.sendDailyReport(email, ev.nome, dataFmt, buffer);
                        }
                    }
                } catch (evErr) {
                    logger.error(`Erro ao enviar relatório global para evento ${ev.id}:`, evErr);
                }
            }
        } catch (error) {
            logger.error('Erro na rotina de relatórios globais:', error);
        }
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
                metodo: 'manual',
                observacao: 'AUTO_CHECKOUT_TIMEOUT',
                created_at: new Date().toISOString()
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
            const checkoutLogs = presas.map(p => ({
                pessoa_id: p.id,
                evento_id: p.evento_id,
                tipo: 'checkout',
                metodo: 'manual',
                observacao: 'CHECKOUT_FORCADO_CRON',
                confianca: null,
                created_at: new Date().toISOString()
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

            // 3. Gerar e enviar relatórios diários por evento
            const eventosAtingidos = [...new Set(presas.map(p => p.evento_id))];
            const dataOntem = new Date();
            dataOntem.setDate(dataOntem.getDate() - 1);
            const dataFmt = dataOntem.toISOString().split('T')[0];

            for (const evId of eventosAtingidos) {
                try {
                    const workbook = await excelController.gerarRelatorioDiario(evId, dataFmt);
                    const buffer = await workbook.xlsx.writeBuffer();

                    const { data: evento } = await supabase.from('eventos').select('nome').eq('id', evId).single();
                    const { data: admins } = await supabase.from('usuarios').select('email').or('role.eq.admin,role.eq.master').eq('evento_id', evId);

                    const emails = (admins || []).map(a => a.email).filter(e => e);
                    if (emails.length > 0) {
                        for (const email of emails) {
                            await emailService.sendDailyReport(email, evento?.nome || 'Evento', dataFmt, buffer);
                        }
                    }
                } catch (evErr) {
                    logger.error(`❌ [CRON] Falha ao enviar relatório para o evento ${evId}:`, evErr);
                }
            }

            logger.info('✅ [CRON] Rotina de Fechamento de Turno e envio de relatórios concluída.');

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
