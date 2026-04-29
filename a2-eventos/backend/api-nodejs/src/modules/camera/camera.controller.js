/**
 * Camera Module Controller
 * Webhook receiver para detecções do camera-service
 */

const { supabase } = require('../../config/supabase');
const logger = require('../../services/logger');
const websocketService = require('../../services/websocketService');

/**
 * POST /api/detections
 * Recebe webhook do camera-service com detecção facial ou de placa
 */
const handleDetection = async (req, res) => {
    try {
        const {
            tipo,           // 'face' ou 'plate'
            camera_id,      // ID da câmera
            camera_name,    // Nome da câmera
            location,       // Localização
            cpf,            // CPF detectado (se face)
            nome,           // Nome detectado (se face)
            plate,          // Placa detectada (se plate)
            confidence,     // Confiança da detecção
            snapshot_url,   // URL do snapshot no Supabase Storage
            is_watchlist,   // true se está em watchlist
            is_authorized,  // true se autorizado
            timestamp       // ISO timestamp da detecção
        } = req.body;

        // Validar campos obrigatórios
        if (!tipo || !camera_id) {
            return res.status(400).json({
                success: false,
                error: 'Campos obrigatórios faltando: tipo, camera_id'
            });
        }

        logger.info(`📷 Detecção recebida: ${tipo} ${cpf || plate} de ${camera_name}`);

        // 1. Registrar no Supabase (camera_detections)
        const { error: insertError } = await supabase
            .from('camera_detections')
            .insert({
                camera_id,
                tipo,
                cpf_detectado: cpf,
                nome_detectado: nome,
                placa_detectada: plate,
                localizacao: location || camera_name,
                confianca: confidence,
                snapshot_url,
                is_watchlist,
                is_authorized,
                metadata: {
                    camera_name,
                    timestamp
                },
                created_at: new Date().toISOString()
            });

        if (insertError) {
            logger.error(`❌ Erro ao registrar detecção: ${insertError.message}`);
        }

        // 2. Se for watchlist, emitir alerta via WebSocket
        if (is_watchlist) {
            const alert = {
                tipo: 'camera_watchlist_alert',
                detection_type: tipo,
                camera_id,
                camera_name,
                location,
                cpf,
                nome,
                plate,
                confidence,
                snapshot_url,
                timestamp: new Date().toISOString()
            };

            // Broadcast para todos os clientes WebSocket
            websocketService.emit('system:alert', alert);

            logger.warn(`🚨 ALERTA WATCHLIST: ${nome || plate} em ${camera_name}`);
        }

        // 3. Atualizar status do check-in se face autorizado
        if (tipo === 'face' && cpf && is_authorized && !is_watchlist) {
            try {
                // Buscar evento ativo
                const { data: evento } = await supabase
                    .from('eventos')
                    .select('id')
                    .eq('status', 'ativo')
                    .single();

                if (evento) {
                    // Buscar pessoa
                    const { data: pessoa } = await supabase
                        .from('pessoas')
                        .select('id')
                        .eq('cpf', cpf)
                        .single();

                    if (pessoa) {
                        // Registrar log de acesso
                        await supabase
                            .from('logs_acesso')
                            .insert({
                                evento_id: evento.id,
                                pessoa_id: pessoa.id,
                                tipo: 'checkin',
                                metodo: 'face',
                                dispositivo_id: camera_id,
                                confianca: confidence,
                                foto_capturada: snapshot_url,
                                created_at: new Date().toISOString()
                            });

                        logger.info(`✅ Check-in registrado: ${nome} (${cpf})`);
                    }
                }
            } catch (error) {
                logger.warn(`⚠️ Não foi possível registrar check-in automático: ${error.message}`);
                // Não falhar a requisição por isso
            }
        }

        // 4. Responder ao camera-service
        return res.status(200).json({
            success: true,
            message: 'Detecção processada com sucesso',
            detection_id: camera_id,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error(`❌ Erro ao processar detecção: ${error.message}`);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

/**
 * GET /api/detections
 * Lista detecções recentes
 */
const listDetections = async (req, res) => {
    try {
        const { tipo, camera_id, limit = 100, offset = 0 } = req.query;

        let query = supabase
            .from('camera_detections')
            .select('*')
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (tipo) {
            query = query.eq('tipo', tipo);
        }

        if (camera_id) {
            query = query.eq('camera_id', camera_id);
        }

        const { data, error } = await query;

        if (error) {
            throw error;
        }

        return res.status(200).json({
            success: true,
            count: data.length,
            data
        });

    } catch (error) {
        logger.error(`❌ Erro ao listar detecções: ${error.message}`);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

/**
 * GET /api/detections/watchlist
 * Lista apenas detecções de watchlist
 */
const listWatchlistDetections = async (req, res) => {
    try {
        const { limit = 100, offset = 0 } = req.query;

        const { data, error } = await supabase
            .from('camera_detections')
            .select('*')
            .eq('is_watchlist', true)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (error) {
            throw error;
        }

        return res.status(200).json({
            success: true,
            count: data.length,
            data
        });

    } catch (error) {
        logger.error(`❌ Erro ao listar watchlist: ${error.message}`);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
};

module.exports = {
    handleDetection,
    listDetections,
    listWatchlistDetections
};
