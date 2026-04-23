const { supabase } = require('../../config/supabase');
const logger = require('../../services/logger');
const websocketService = require('../../services/websocketService');
const ValidationService = require('./services/validation.service');
const DatabaseService = require('./services/database.service');

class CheckinService {
    /**
     * Verifica se um módulo específico está habilitado para o evento
     */
    async isModuleEnabled(supabaseClient, eventoId, moduleKey) {
        try {
            const { data, error } = await supabaseClient
                .from('event_modules')
                .select('is_enabled')
                .eq('evento_id', eventoId)
                .eq('module_key', moduleKey)
                .single();

            if (error || !data) return true; // Default behavior
            return data.is_enabled;
        } catch (error) {
            logger.error(`Erro ao verificar módulo ${moduleKey}:`, error);
            return true;
        }
    }

    /**
     * Registra um acesso (Check-in ou Check-out)
     * Implementa lógica Smart Access (Toggle/Primeiro do Dia) e Log Sempre.
     */
    async registrarAcesso(supabaseClient, accessData) {
        const {
            pessoa_id, evento_id, metodo, 
            dispositivo_id, created_by, sync_id, offline_timestamp, area_id
        } = accessData;

        // 1. Obter dados completos da pessoa
        let pessoa = accessData.pessoa;
        if (!pessoa) {
            const { data: pData } = await supabase
                .from('pessoas')
                .select('*, empresas(*)')
                .eq('id', pessoa_id)
                .single();
            pessoa = pData;
        }



        // 2. Determinar tipo inteligente (Toggle ou Primeiro do Dia)
        const tipoFinal = await ValidationService.determineSmartAccessType(pessoa_id, evento_id, accessData.tipo);
        const timestamp = offline_timestamp ? new Date(offline_timestamp) : new Date();

        // 3. Validar políticas de acesso
        try {
            const validation = await ValidationService.validateAccessRules(evento_id, pessoa, tipoFinal, metodo, timestamp, accessData.confianca, area_id);
            
            // 4. Sucesso: Persistir no Banco de Dados
            const logId = require('uuid').v4();
            const new_status = tipoFinal === 'checkin' ? 'checkin_feito' : 'checkout_feito'; // FIX C-09: 'presente'/'saiu' violavam CHECK constraint

            const result = await DatabaseService.registerAccessTransaction(
                logId,
                timestamp,
                {
                    evento_id, pessoa_id, tipo: tipoFinal, metodo,
                    dispositivo_id, created_by, sync_id,
                    confianca: accessData.confianca || null,
                    foto_capturada: accessData.foto_capturada || null,
                    observacao: (validation && validation.quotaBypassed) ? '⚠️ BYPASS_COTA (Capacidade Excedida)' : null
                },
                pessoa,
                new_status
            );

            if (!result.success) return { error: 'Falha ao persistir acesso' };
            const resultData = { id: logId, evento_id, pessoa_id, tipo: tipoFinal,
                                 metodo, dispositivo_id, created_at: timestamp };

                // 5. Notificação via WebSocket
            websocketService.emit('new_access', {
                ...resultData,
                pessoa_nome: pessoa.nome_completo,
                tipo_acesso: tipoFinal,
                area_id: area_id || null
            }, evento_id);

            // 6. Integração Watchlist (Rastreamento de CPFs)
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
                }, evento_id);

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

            return { ...resultData, action: 'allow' };

        } catch (valErr) {
            logger.warn(`🚫 Acesso NEGADO para ${pessoa.nome_completo}: ${valErr.message}`);

            // Regra NZT: SEMPRE registrar o log, mesmo se negado
            await DatabaseService.logDeniedAccess(
                evento_id,
                pessoa_id,
                metodo,
                dispositivo_id,
                created_by,
                valErr.message
            );
            const resultNegado = { data: { evento_id, pessoa_id, tipo: 'negado',
                                           metodo, observacao: valErr.message } };

            // Notifica o painel sobre o acesso negado em tempo real
            websocketService.emit('new_access', {
                ...(resultNegado.data || {}),
                pessoa_nome: pessoa.nome_completo,
                tipo_acesso: 'negado',
                erro: valErr.message,
                area_id: area_id || null
            }, evento_id);

            // Verificação de Watchlist também em Acessos Negados
            try {
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
                    }, evento_id);
                }
            } catch (wErr) { /* silêncio */ }

            return { 
                error: valErr.message, 
                status: valErr.status || 403, 
                action: 'deny',
                data: resultNegado.data 
            };
        }
    }

    /**
     * Processa reconhecimento facial (Integração com Motor Python)
     */
    async processFaceRecognition(supabaseClient, { faceBase64, eventoId, dispositivoId, sync_id }) {
        try {
            // Em um cenário real, chamamos o microservice-face-python aqui
            // axios.post(PYTHON_URL, { image: faceBase64 })
            logger.info(`👤 [FaceAuth] Processando biometria para evento ${eventoId} em ${dispositivoId}`);
            
            // Simulação de resposta do motor por enquanto
            return { success: true, target_id: 'auto-identified' };
        } catch (error) {
            logger.error('Erro no processamento facial:', error);
            return { success: false, error: 'Falha no motor biométrico' };
        }
    }

    async getStats(supabaseClient, eventoId) {
        return ValidationService.getRealtimeStatsInternal(eventoId);
    }

    /**
     * B-02: Reverter Acesso em caso de Falha de Hardware (Rollback)
     */
    async reverterAcesso(supabaseClient, { pessoa_id, log_id, motivo }) {
        try {
            logger.warn(`♻️ [Rollback] Revertendo check-in para pessoa ${pessoa_id}. Motivo: ${motivo}`);
            
            // 1. Reverter Status da Pessoa
            const { error: pErr } = await supabaseClient
                .from('pessoas')
                .update({ 
                    status_acesso: 'checkout_feito', // FIX C-09: 'checkout' não faz parte do CHECK constraint
                    last_access_at: null 
                })
                .eq('id', pessoa_id);

            if (pErr) throw pErr;

            // 2. Marcar log como FAILED ou Deletar
            // Optamos por manter o log mas marcado como erro de hardware para auditoria
            if (log_id) {
                await supabaseClient
                    .from('logs_acesso')
                    .update({ 
                        tipo: 'erro_hardware',
                        observacao: motivo 
                    })
                    .eq('id', log_id);
            }

            return { success: true };
        } catch (error) {
            logger.error('Erro ao reverter acesso:', error.message);
            return { success: false, error: error.message };
        }
    }
}

module.exports = new CheckinService();
