const cron = require('node-cron');
const { supabase } = require('../../config/supabase');
const logger = require('../../services/logger');
const reportController = require('../reports/report.controller');
const emailService = require('../../services/emailService');
const { getHojeLocal, getNowLocal } = require('../../utils/dateUtils');

class CronController {
    constructor() {
        this._resetTask     = null;
        this._relatorioTask = null;
        this._ultimoResetPorEvento = {}; // evento_id → 'YYYY-MM-DD' (evita reset duplicado no mesmo dia)
    }

    // Converte "HH:mm" para expressão cron "mm HH * * *"
    /** Ontem no fuso local (YYYY-MM-DD) */
    _ontemLocal() {
        const d = new Date(`${getHojeLocal()}T12:00:00Z`);
        d.setUTCDate(d.getUTCDate() - 1);
        return d.toISOString().slice(0, 10);
    }

    /**
     * Envia a planilha do dia para os e-mails configurados (Configurações → relatorio_emails)
     * ou, se não houver, para os administradores ativos do evento.
     */
    async _enviarRelatorioDiario(ev, dataFmt, emailsConfigurados = []) {
        let emails = emailsConfigurados.filter(Boolean);
        if (emails.length === 0) {
            const { data: admins } = await supabase
                .from('perfis')
                .select('email')
                .eq('evento_id', ev.id)
                .in('nivel_acesso', ['admin', 'admin_master', 'master'])
                .neq('ativo', false);
            emails = (admins || []).map(a => a.email).filter(Boolean);
        }
        emails = [...new Set(emails.map(e => String(e).trim().toLowerCase()))];
        if (emails.length === 0) {
            logger.info(`[CRON] Relatório diário de ${ev.nome}: nenhum destinatário configurado.`);
            return;
        }

        const workbook = await reportController.gerarWorkbookRelatorioDiario(ev.id, ev.nome, dataFmt);
        const buffer = await workbook.xlsx.writeBuffer();
        for (const email of emails) {
            await emailService.sendDailyReport(email, ev.nome || 'Evento', dataFmt, buffer);
        }
        logger.info(`📧 [CRON] Relatório diário de ${ev.nome} (${dataFmt}) enviado para ${emails.length} destinatário(s).`);
    }

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
        // Vencimento de documentos: marca vencidos, reavalia pessoas e notifica o painel
        cron.schedule('0 7 * * *', () => {
            logger.info('🔄 [CRON] Verificação de vencimento de documentos...');
            this.verificarVencimentos().catch(e => logger.error('[CRON] verificarVencimentos falhou:', e));
        }, { timezone: 'America/Sao_Paulo' });
        setTimeout(() => this.verificarVencimentos().catch(e => logger.error('[CRON] verificarVencimentos (início) falhou:', e)), 60000);

        // A cada minuto: expira liberações manuais e roda o fechamento de turno
        // de cada evento no seu horario_reset
        cron.schedule('* * * * *', () => {
            this.tickMinuto().catch(e => logger.error('[CRON] tickMinuto falhou:', e));
        });
    }

    /**
     * Liberações manuais vencidas + fechamento de turno por evento (eventos.horario_reset).
     */
    async tickMinuto() {
        const liberacaoManual = require('../entities/liberacaoManual.service');
        await liberacaoManual.expirarVencidas();

        const horaAtual = getNowLocal().slice(11, 16); // HH:MM local
        const hoje = getHojeLocal();
        const { data: eventos, error } = await supabase.from('eventos').select('id, nome, horario_reset').eq('status', 'ativo');
        if (error) return;

        for (const ev of eventos || []) {
            const horaReset = String(ev.horario_reset || '').slice(0, 5);
            if (!horaReset || horaReset !== horaAtual) continue;
            if (this._ultimoResetPorEvento[ev.id] === hoje) continue;
            this._ultimoResetPorEvento[ev.id] = hoje;
            logger.info(`🔄 [CRON] Fechamento de turno do evento ${ev.nome} (${horaReset})...`);
            await this.resetTurnos(ev.id).catch(e => logger.error(`[CRON] resetTurnos(${ev.id}) falhou:`, e));
        }
    }

    async verificarVencimentos() {
        return require('../system/notificacao.service').verificarVencimentos();
    }

    // Agenda (ou reagenda) apenas os jobs configuráveis pelo usuário
    _scheduleConfigurableJobs(resetH, relatorioH) {
        if (this._resetTask)     { this._resetTask.stop();     this._resetTask = null; }
        if (this._relatorioTask) { this._relatorioTask.stop(); this._relatorioTask = null; }

        // O fechamento de turno agora roda por evento, no horario_reset de cada um (tickMinuto).
        // cron_reset_hora (global) fica sem efeito.

        this._relatorioTask = cron.schedule(this._toCron(relatorioH), () => {
            logger.info(`🔄 [CRON] Relatórios Diários (${relatorioH})...`);
            this.enviarRelatoriosGlobais().catch(e => logger.error('[CRON] enviarRelatoriosGlobais falhou:', e));
        });

        logger.info(`⏰ [CRON] Reagendado: Relatório=${relatorioH} (fechamento de turno: horario_reset de cada evento)`);
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
            const { data: eventos } = await supabase.from('eventos').select('id, nome').eq('status', 'ativo');
            if (!eventos?.length) return;

            const dataFmt = this._ontemLocal();
            const { data: settings } = await supabase.from('system_settings').select('relatorio_emails').eq('id', 1).maybeSingle();
            const emailsConfigurados = Array.isArray(settings?.relatorio_emails) ? settings.relatorio_emails : [];

            for (const ev of eventos) {
                try {
                    await this._enviarRelatorioDiario(ev, dataFmt, emailsConfigurados);
                } catch (evErr) {
                    logger.error(`Erro ao enviar relatório diário do evento ${ev.id}:`, evErr);
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
                .select('id, nome_completo, evento_id')
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
                .update({ status_acesso: 'autorizado', updated_at: new Date().toISOString() })
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
    async resetTurnos(eventoId = null) {
        try {
            // Busca pessoas que estão com check-in pendente (não deram checkout)
            let query = supabase
                .from('pessoas')
                .select('id, nome_completo, evento_id, numero_pulseira, status_acesso')
                .in('status_acesso', ['checkin_feito', 'checkout_feito']);
            if (eventoId) query = query.eq('evento_id', eventoId);
            const { data: presas, error: fetchErr } = await query;

            if (fetchErr) throw fetchErr;

            if (!presas || presas.length === 0) {
                logger.info('✅ [CRON] Nenhum status pendente de checkout encontrado.');
                return;
            }

            logger.info(`🚨 [CRON] Encontradas ${presas.length} pessoas no fechamento de turno. Aplicando reset diário.`);

            // Transição para status autorizado para quem tem pulseira ou pendente para entrar no dia seguinte normalmente.
            const checkoutLogs = presas.filter(p => p.status_acesso === 'checkin_feito').map(p => ({
                pessoa_id: p.id,
                evento_id: p.evento_id,
                tipo: 'checkout',
                metodo: 'manual',
                observacao: 'CHECKOUT_FORCADO_CRON',
                confianca: null,
                created_at: new Date().toISOString()
            }));

            // 1. Inserir logs de checkout automático apenas para quem ainda estava dentro
            if (checkoutLogs.length > 0) {
                const { error: logsErr } = await supabase
                    .from('logs_acesso')
                    .insert(checkoutLogs);

                if (logsErr) {
                    logger.error('[CRON] Erro ao salvar logs de checkout forçado:', logsErr);
                }
            }

            // 2. Atualizar status na tabela pessoas (volta para autorizado para o novo dia)
            const pessoasIds = presas.map(p => p.id);
            const { error: updateErr } = await supabase
                .from('pessoas')
                .update({ 
                    status_acesso: 'autorizado',
                    updated_at: new Date().toISOString()
                })
                .in('id', pessoasIds);

            if (updateErr) throw updateErr;

            // 2.1 Fim do turno: encerra liberações manuais e reavalia a documentação
            //     (quem tem pendência volta a "pendente" para o próximo turno)
            const documentoService = require('../entities/documento.service');
            const liberacaoManual = require('../entities/liberacaoManual.service');
            for (const id of pessoasIds) {
                await liberacaoManual.encerrar(id, 'fechamento de turno');
                await documentoService.sincronizarStatusPessoa(null, id);
            }

            // 3. Arquivar o fechamento diário de cada evento afetado.
            // O e-mail com a planilha sai uma única vez por dia, no horário do relatório (enviarRelatoriosGlobais).
            const eventosAtingidos = [...new Set(presas.map(p => p.evento_id))];
            const dataFmt = this._ontemLocal();
            for (const evId of eventosAtingidos) {
                try {
                    await reportController.salvarFechamentoDiario(evId, dataFmt, null, 'automatico');
                } catch (evErr) {
                    logger.error(`❌ [CRON] Falha ao arquivar o fechamento do evento ${evId}:`, evErr);
                }
            }

            logger.info('✅ [CRON] Fechamento de turno concluído.');

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
