const { supabase } = require('../../config/supabase');
const logger = require('../../services/logger');
const websocketService = require('../../services/websocketService');
const cacheService = require('../../services/cacheService');
const ValidationService = require('./services/validation.service');
const DatabaseService = require('./services/database.service');
const { COLUNAS_PESSOA_ACESSO } = require('./services/colunasPessoa');
const { etapaDaPessoa, diaDoAcesso, bloqueioDeEntrada } = require('./services/entradaEtapa');
const { parseUtcSemFuso } = require('../../utils/dateUtils');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATS_TTL_MS = 3000;
const statsCache = new Map(); // evento_id -> { em, promessa }

class CheckinService {
    /**
     * Registra um acesso (Check-in ou Check-out)
     * Implementa lógica Smart Access (Toggle/Primeiro do Dia) e Log Sempre.
     */
    async registrarAcesso(supabaseClient, accessData) {
        const {
            pessoa_id, evento_id, metodo, 
            dispositivo_id, created_by, sync_id, offline_timestamp, area_id
        } = accessData;

        // 1. Obter dados completos da pessoa — SÓ deste evento. Pessoa de outro evento (pessoa_id de qualquer
        //    evento chega pelo /checkin/manual) responde 404 aqui, antes de qualquer gravação.
        const NAO_ACHADA = { error: 'Pessoa não encontrada neste evento', status: 404 };
        let pessoa = accessData.pessoa;
        if (pessoa && pessoa.evento_id && pessoa.evento_id !== evento_id) return NAO_ACHADA;
        if (!pessoa) {
            const { data: pData, error: pErr } = await supabase
                .from('pessoas')
                .select(`${COLUNAS_PESSOA_ACESSO}, empresas(*)`)
                .eq('id', pessoa_id)
                .eq('evento_id', evento_id)
                .single();
            // PGRST116 = nenhuma linha (pessoa de outro evento ou inexistente): 404. Outro erro é falha de banco.
            if (pErr && pErr.code !== 'PGRST116') throw pErr;
            if (!pData) return NAO_ACHADA;
            pessoa = pData;
        }



        // 2. Determinar tipo inteligente (Toggle ou Primeiro do Dia) — POR ÁREA
        const ctxValidacao = {}; // último log da pessoa, reaproveitado no anti-passback
        const tipoFinal = await ValidationService.determineSmartAccessType(pessoa_id, evento_id, accessData.tipo, area_id, ctxValidacao);
        const timestamp = offline_timestamp ? new Date(offline_timestamp) : new Date();

        // Etapa (fase do lote) e dia civil do acesso: a entrada usa para não repetir dentro da etapa (409),
        // e a saída também grava a etapa para fechar essa janela.
        const logId = UUID_RE.test(sync_id || '') ? sync_id : require('uuid').v4();
        const etapa = accessData.etapa || await etapaDaPessoa(supabase, pessoa);
        const dia = diaDoAcesso(timestamp);
        if (tipoFinal === 'checkin') {
            ctxValidacao.entrada = { etapa, dia, area_id: area_id || null, logId };
        }

        // Replay offline: acesso anterior ao último evento da pessoa vira só histórico (status não muda)
        let atualizarStatus = true;
        if (offline_timestamp) {
            const ultimo = await ValidationService.ultimoLogPessoa(pessoa_id, evento_id);
            if (ultimo && timestamp < parseUtcSemFuso(ultimo.created_at)) atualizarStatus = false;
        }

        // Saída registrada por operador de quem entrou num dia anterior: pede confirmação e o
        // horário real (a correção é feita em /checkout/corrigir-turno). Leitor sozinho (sem operador) não tem quem confirme.
        if (tipoFinal === 'checkout' && created_by && !accessData.confirmar_turno_anterior && !offline_timestamp) {
            const turno = await require('./turnoAnterior.service').verificar(pessoa_id, evento_id).catch(() => null);
            if (turno) {
                return {
                    error: 'Esta pessoa entrou num dia anterior e não registrou a saída. Confirme o horário de saída daquele turno.',
                    status: 409,
                    action: 'confirmar',
                    detalhes: { codigo: 'TURNO_ANTERIOR', pessoa: { id: pessoa_id, nome: pessoa?.nome_completo || pessoa?.nome || '' }, ...turno }
                };
            }
        }

        // 3. Validar políticas de acesso
        try {
            const validation = await ValidationService.validateAccessRules(evento_id, pessoa, tipoFinal, metodo, timestamp, accessData.confianca, area_id, ctxValidacao);
            
            // 4. Sucesso: Persistir no Banco de Dados
            // sync_id do painel vira o id do log: o reenvio da fila offline (ou de um timeout que
            // na verdade gravou) cai na duplicidade e não gera um segundo acesso.
            const new_status = tipoFinal === 'checkin' ? 'checkin_feito' : 'checkout_feito'; // FIX C-09: 'presente'/'saiu' violavam CHECK constraint

            const result = await DatabaseService.registerAccessTransaction(
                logId,
                timestamp,
                {
                    evento_id, pessoa_id, tipo: tipoFinal, metodo,
                    dispositivo_id, created_by, sync_id, area_id,
                    etapa, dia_civil: dia,
                    confianca: accessData.confianca || null,
                    foto_capturada: accessData.foto_capturada || null,
                    // Texto informativo: bypass de cota e origem (ex.: CREDENCIAMENTO) juntos, sem efeito nas regras
                    observacao: (validation && validation.quotaBypassed)
                        ? (accessData.observacao
                            ? `⚠️ BYPASS_COTA (Capacidade Excedida) · ${accessData.observacao}`
                            : '⚠️ BYPASS_COTA (Capacidade Excedida)')
                        : (accessData.observacao || null)
                },
                pessoa,
                new_status,
                { atualizarStatus }
            );

            // Segunda entrada na mesma etapa/dia (corrida entre duas leituras): 409 pelo caminho de negação
            if (result.entrada_duplicada) throw result.erro;
            if (!result.success) return { error: 'Falha ao persistir acesso' };
            cacheService.invalidatePessoa(pessoa_id);
            const resultData = { id: logId, evento_id, pessoa_id, tipo: tipoFinal,
                                 metodo, dispositivo_id, created_at: timestamp };

            // 5. Notificação via WebSocket — linha completa (como a de GET /access/logs):
            //    as estações inserem direto na lista, sem recarregar a lista inteira a cada acesso
            websocketService.emit('new_access', {
                ...resultData,
                pessoa_nome: pessoa.nome_completo,
                pessoas: {
                    id: pessoa.id, nome_completo: pessoa.nome_completo, cpf: pessoa.cpf, foto_url: pessoa.foto_url,
                    empresa_id: pessoa.empresa_id, empresas: pessoa.empresas?.nome ? { nome: pessoa.empresas.nome } : null,
                    funcao: pessoa.funcao, numero_pulseira: pessoa.numero_pulseira
                },
                numero_pulseira: pessoa.numero_pulseira || null,
                foto_capturada: accessData.foto_capturada || null,
                observacao: accessData.observacao || null,
                tipo_acesso: tipoFinal,
                area_id: area_id || null,
                area_nome: accessData.area_nome || null,
                dispositivo_nome: accessData.dispositivo_nome
                    || ({ 'web-dashboard': 'Painel (operador)', fiscalizacao: 'Fiscalização' })[dispositivo_id]
                    || dispositivo_id || null,
                completo: true
            }, evento_id);

            // 6. Integração Watchlist (Rastreamento de CPFs) — em segundo plano:
            //    a porta/estação recebe a resposta sem esperar a consulta e os alertas externos.
            (async () => {
            const watchlistService = require('../system/watchlist.service');
            const monitorado = await watchlistService.verificarCPF(pessoa.cpf, evento_id);

            if (monitorado) {
                logger.warn(`🚨 WATCHLIST: Alvo '${pessoa.nome_completo}' detectado no ${tipoFinal}!`);
                
                // Alerta em tempo real no Monitor
                websocketService.emit('watchlist_alert', {
                    pessoa: { 
                        id: pessoa.id, 
                        nome: pessoa.nome_completo, 
                        cpf: pessoa.cpf,
                        foto_url: pessoa.foto_url 
                    },
                    watchlist: monitorado,
                    tipo: tipoFinal,
                    area: accessData.area_nome || 'Portaria Principal',
                    terminal: accessData.dispositivo_nome || dispositivo_id,
                    hora: new Date()
                }, 'system_watchlist');

                // Disparar notificações externas (Telegram/WhatsApp)
                await watchlistService.registrarAlerta(monitorado, {
                    pessoa_id: pessoa.id,
                    nome: pessoa.nome_completo,
                    evento_id,
                    tipo: tipoFinal,
                    area_id: area_id,
                    area: accessData.area_nome,
                    dispositivo_id: dispositivo_id,
                    terminal: accessData.dispositivo_nome
                });
            }
            })().catch(e => logger.error(`[Watchlist] Falha na verificação: ${e.message}`));

            return { ...resultData, action: 'allow' };

        } catch (valErr) {
            logger.warn(`🚫 Acesso NEGADO para ${pessoa.nome_completo}: ${valErr.message}`);

            // Regra NZT: SEMPRE registrar o log, mesmo se negado
            // Grava e emite o aviso em tempo real (um único 'new_access')
            await DatabaseService.logDeniedAccess(
                evento_id,
                pessoa_id,
                metodo,
                dispositivo_id,
                created_by,
                valErr.message,
                { pessoa, area_id, area_nome: accessData.area_nome, dispositivo_nome: accessData.dispositivo_nome }
            );
            const resultNegado = { data: { evento_id, pessoa_id, tipo: 'negado',
                                           metodo, observacao: valErr.message } };


            // Verificação de Watchlist também em Acessos Negados (em segundo plano)
            (async () => {
                const watchlistService = require('../system/watchlist.service');
                const monitoradoVal = await watchlistService.verificarCPF(pessoa.cpf, evento_id);
                if (monitoradoVal) {
                    websocketService.emit('watchlist_alert', {
                        pessoa: { id: pessoa.id, nome: pessoa.nome_completo, cpf: pessoa.cpf, foto_url: pessoa.foto_url },
                        watchlist: monitoradoVal,
                        tipo: 'negado',
                        area: accessData.area_nome || 'Acesso Restrito',
                        terminal: accessData.dispositivo_nome || dispositivo_id,
                        hora: new Date()
                    }, 'system_watchlist');
                }
            })().catch(() => { /* silêncio */ });

            return {
                error: valErr.message,
                status: valErr.status || 403,
                action: 'deny',
                data: resultNegado.data,
                // Bloqueio de entrada (409): codigo, liberavel e etapa vão em detalhes → corpo da resposta (ApiResponse.error)
                ...(valErr.codigo ? { detalhes: { codigo: valErr.codigo, liberavel: valErr.liberavel === true, etapa: valErr.etapa ?? null } } : {})
            };
        }
    }

    /**
     * Pré-checagem da regra de entrada (portão / entrada única) SEM gravar nada. Usada por quem grava outra coisa
     * antes do acesso (credenciamento grava a pulseira e as áreas primeiro). Mesma decisão de registrarAcesso para
     * um tipo 'checkin': etapa (lote ou da pessoa), dia civil do instante e área.
     * @returns {Promise<Error|null>} erro 409 (ENTRADA_BLOQUEADA) se a entrada seria recusada; null se pode entrar
     */
    async verificarEntradaSemGravar({ evento_id, pessoa, etapa = null, area_id = null, sync_id = null, offline_timestamp = null }) {
        const timestamp = offline_timestamp ? new Date(offline_timestamp) : new Date();
        const etapaFinal = etapa || await etapaDaPessoa(supabase, pessoa);
        return bloqueioDeEntrada(supabase, {
            evento_id,
            pessoa_id: pessoa.id,
            etapa: etapaFinal,
            dia: diaDoAcesso(timestamp),
            area_id: area_id || null,
            logId: UUID_RE.test(sync_id || '') ? sync_id : null
        });
    }

    /**
     * Estatísticas do evento compartilhadas por alguns segundos: cada estação pede após cada
     * acesso, e o cálculo faz ~13 consultas. Pedidos simultâneos aproveitam o mesmo cálculo.
     */
    async getStats(supabaseClient, eventoId) {
        const agora = Date.now();
        const atual = statsCache.get(eventoId);
        if (atual && agora - atual.em < STATS_TTL_MS) return atual.promessa;

        const promessa = ValidationService.getRealtimeStatsInternal(eventoId);
        statsCache.set(eventoId, { em: agora, promessa });
        promessa.catch(() => statsCache.delete(eventoId));
        if (statsCache.size > 200) statsCache.delete(statsCache.keys().next().value);
        return promessa;
    }

    /**
     * B-02: Reverter Acesso em caso de Falha de Hardware (Rollback)
     */
    /**
     * A porta não abriu: desfaz o acesso já gravado.
     * @param {string} status_anterior status_acesso da pessoa antes deste acesso
     */
    async reverterAcesso(supabaseClient, { pessoa_id, log_id, motivo, status_anterior }) {
        try {
            logger.warn(`♻️ [Rollback] Revertendo acesso da pessoa ${pessoa_id}. Motivo: ${motivo}`);

            // 1. Status volta ao de antes do acesso (antes: sempre 'checkout_feito', mesmo desfazendo
            //    uma saída, e gravava a coluna inexistente last_access_at — a reversão sempre falhava)
            if (status_anterior) {
                const { error: pErr } = await supabaseClient
                    .from('pessoas')
                    .update({ status_acesso: status_anterior, atualizado_em: new Date().toISOString() })
                    .eq('id', pessoa_id);
                if (pErr) throw pErr;
            }

            // 2. Mantém o registro para auditoria, como recusado: a pessoa não passou
            //    (não conta como entrada/saída no anti-passback nem nos relatórios)
            if (log_id) {
                const { error: lErr } = await supabaseClient
                    .from('logs_acesso')
                    .update({ tipo: 'negado', observacao: `Falha de hardware: ${motivo}` })
                    .eq('id', log_id);
                if (lErr) throw lErr;
            }

            cacheService.invalidatePessoa(pessoa_id);
            return { success: true };
        } catch (error) {
            logger.error('Erro ao reverter acesso:', error.message);
            return { success: false, error: error.message };
        }
    }
}

module.exports = new CheckinService();
