const checkinService = require('../checkin/checkin.service');
const logger = require('../../services/logger');
const { supabase } = require('../../config/supabase');

class HikvisionController {
    /**
     * Receber eventos via HTTP Listener (ISAPI)
     */
    async handleEventPush(req, res) {
        try {
            // Hikvision envia XML ou JSON. O middleware express.json() / express.text() deve capturar.
            // Para simplificar, assumimos que o middleware de body-parser está configurado.
            const eventData = req.body;
            
            // ISAPI Alert Notification (JSON usualmente)
            if (!eventData || !eventData.AccessControllerEvent) {
                return res.json({ success: true });
            }

            const event = eventData.AccessControllerEvent;
            const { employeeNoString, currentVerifyMode, similarity } = event;

            logger.info(`🔔 [Hikvision] Identificação: UserID=${employeeNoString}, Method=${currentVerifyMode}, Confiança=${similarity}`);

            // 1. Resolver Dispositivo via Token ou IP
            const pushToken = req.query.token;
            const devIp = req.ip.replace('::ffff:', '');
            
            let query = supabase.from('dispositivos_acesso').select('*');
            if (pushToken) query = query.eq('control_token', pushToken);
            else query = query.ilike('ip_address', `%${devIp}%`);

            const { data: dispositivo } = await query.limit(1).single();

            if (!dispositivo) {
                if (pushToken) logger.error(`🚨 [Hikvision] PUSH SUSPEITO: Token inválido (${pushToken}) de ${devIp}`);
                return res.json({ success: true });
            }

            // Atualizar metadata de segurança
            await supabase.from('dispositivos_acesso').update({ 
                last_push_ip: devIp,
                last_push_at: new Date().toISOString()
            }).eq('id', dispositivo.id);

            // 2. Resolver Pessoa
            const { data: pessoa } = await supabase
                .from('pessoas')
                .select('*, empresas(nome)')
                .or(`cpf.eq.${employeeNoString},id.ilike.${employeeNoString}%`)
                .eq('evento_id', dispositivo.evento_id)
                .limit(1)
                .single();

            if (!pessoa) {
                logger.warn(`[Hikvision] Identidade desconhecida: ${employeeNoString}`);
                return res.json({ success: true });
            }

            // 3. Registrar Acesso
            const result = await checkinService.registrarAcesso(supabase, {
                pessoa_id: pessoa.id,
                pessoa: pessoa,
                evento_id: dispositivo.evento_id,
                tipo: dispositivo.config?.fluxo === 'toggle' ? null : (dispositivo.config?.fluxo || 'checkin'),
                metodo: this._mapMethod(currentVerifyMode),
                dispositivo_id: dispositivo.nome,
                confianca: similarity || 100,
                offline_timestamp: new Date().toISOString()
            });

            // 4. Feedback
            if (result.action === 'allow' && dispositivo.config?.controla_rele !== false) {
                try {
                    const HikvisionService = require('./hikvision.service');
                    const service = new HikvisionService(dispositivo);
                    await service.openDoor();
                } catch (hwError) {
                    logger.error(`🚨 [Hikvision] FALHA CRÍTICA DE HARDWARE: ${hwError.message}. Iniciando ROLLBACK.`);
                    await checkinService.reverterAcesso(supabase, {
                        pessoa_id: pessoa.id,
                        log_id: result.details?.id,
                        motivo: `Falha técnica no hardware Hikvision: ${hwError.message}`
                    });
                }
            }

            res.json({ success: true });
        } catch (error) {
            logger.error('❌ [Hikvision] Erro no push:', error.message);
            res.json({ success: true }); // Sempre responde OK pro hardware não travar
        }
    }

    _mapMethod(hikMethod) {
        // Mapeamento ISAPI para interno
        const map = {
            'face': 'face',
            'card': 'rfid',
            'fp': 'biometry',
            'pw': 'manual',
            'qr': 'qrcode'
        };
        return map[hikMethod] || 'face';
    }
}

module.exports = new HikvisionController();
