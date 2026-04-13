const { supabase } = require('../config/supabase');
const logger = require('./logger');

/**
 * AuditService: Centraliza a persistência de trilhas de auditoria (Audit Trail).
 * Garante que ações administrativas sejam registradas para conformidade e segurança.
 */
class AuditService {
    /**
     * Máscara dados sensíveis para conformidade LGPD
     */
    maskSensitiveData(obj) {
        if (!obj || typeof obj !== 'object') return obj;
        
        const masked = { ...obj };
        const sensitiveKeys = ['cpf', 'password', 'newPassword', 'nome_mae', 'face_encoding', 'foto_base64'];

        Object.keys(masked).forEach(key => {
            if (sensitiveKeys.includes(key) && masked[key]) {
                if (key === 'cpf' && typeof masked[key] === 'string') {
                    const cpf = masked[key];
                    if (/^\d{11}$/.test(cpf)) {
                        // CPF sem formatação: 12345678901 -> ***456***01
                        masked[key] = `***${cpf.substring(3, 6)}***${cpf.substring(9)}`;
                    } else {
                        // CPF formatado: 123.456.789-01 -> ***.456.***-**
                        masked[key] = cpf.replace(/^(\d{3})\.(\d{3})\.(\d{3})-(\d{2})$/, '***.$2.***-**');
                    }
                } else {
                    masked[key] = '[CONFIDENCIAL]';
                }
            } else if (typeof masked[key] === 'object') {
                masked[key] = this.maskSensitiveData(masked[key]);
            }
        });

        return masked;
    }

    /**
     * Registra uma nova ação de auditoria
     * @param {Object} data {evento_id, user_id, nivel_acesso, acao, recurso, recurso_id, detalhes, ip, dispositivo}
     */
    async log(data) {
        try {
            const { evento_id, user_id, nivel_acesso, acao, recurso, recurso_id, detalhes, ip, dispositivo } = data;

            if (!acao || !recurso) {
                logger.warn('Tentativa de log de auditoria incompleto:', { acao, recurso });
                return;
            }
            // evento_id pode ser null para ações globais (ex: login, reset de senha)
            // Não bloqueamos o log, apenas registramos com evento_id null

            // Aplicar máscara LGPD nos detalhes
            const maskedDetails = this.maskSensitiveData(detalhes);

            // Mapear ações semânticas para os valores aceitos pelo CHECK CONSTRAINT
            const ACAO_MAP = {
                // Leituras (sem equivalente direto, usar INSERT como registro)
                'LOGIN': 'INSERT',
                'LOGOUT': 'DELETE',
                // Criações
                'CREATE_USER': 'INSERT',
                'CREATE_PERSON': 'INSERT',
                'CREATE_EVENT': 'INSERT',
                'CREATE_COMPANY': 'INSERT',
                // Atualizações
                'UPDATE_PERSON': 'UPDATE',
                'UPDATE_USER': 'UPDATE',
                'UPDATE_PERMISSIONS': 'UPDATE',
                'UPDATE_EVENT': 'UPDATE',
                'UPDATE_COMPANY': 'UPDATE',
                'AUDIT_DOCUMENT': 'UPDATE',
                'ADMIN_RESET_PASSWORD': 'UPDATE',
                'CHANGE_OWN_PASSWORD': 'UPDATE',
                'LGPD_ANONYMIZE': 'UPDATE',
                // Exclusões
                'DELETE_USER': 'DELETE',
                'DELETE_PERSON': 'DELETE',
                'DELETE_EVENT': 'DELETE',
                'DELETE_COMPANY': 'DELETE',
            };
            const acaoNormalizada = ACAO_MAP[acao.toUpperCase()] || 'UPDATE';

            // Preservar a ação semântica real dentro dos detalhes
            const detalhesComAcao = {
                ...maskedDetails,
                _acao_original: acao.toUpperCase()
            };

            const { error } = await supabase
                .from('audit_logs')
                .insert([{
                    evento_id,
                    user_id: user_id || null,
                    nivel_acesso: nivel_acesso || 'web-admin',
                    acao: acaoNormalizada,
                    recurso: recurso.toUpperCase(),
                    recurso_id: recurso_id || null,
                    detalhes: detalhesComAcao || {},
                    ip_origem: ip || '0.0.0.0',
                    dispositivo_id: dispositivo || 'web-ui',
                    created_at: new Date().toISOString()
                }]);

            if (error) throw error;

            logger.info(`🔍 [AUDIT] ${acao} em ${recurso} (ID: ${recurso_id}) por User: ${user_id}`);
        } catch (error) {
            // Falha no log de auditoria não deve travar a aplicação, apenas logar erro.
            logger.error('CRÍTICO: Falha ao registrar log de auditoria:', error);
        }
    }

    /**
     * Atalhos para ações comuns
     */
    async logAuth(req, action, targetUserId, details = {}) {
        return this.log({
            evento_id: req.event?.id,
            user_id: req.user?.id,
            nivel_acesso: req.user?.nivel_acesso,
            acao: action,
            recurso: 'USUARIOS',
            recurso_id: targetUserId,
            detalhes: details,
            ip: req.ip,
            dispositivo: req.headers['user-agent']
        });
    }

    async logEntity(req, action, resource, resourceId, details = {}) {
        return this.log({
            evento_id: req.event?.id,
            user_id: req.user?.id,
            nivel_acesso: req.user?.nivel_acesso,
            acao: action,
            recurso: resource,
            recurso_id: resourceId,
            detalhes: details,
            ip: req.ip,
            dispositivo: req.headers['user-agent']
        });
    }
}

module.exports = new AuditService();
