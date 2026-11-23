const logger = require('../services/logger');

/**
 * Bloqueia a ação quando o administrador DESLIGOU o módulo para o usuário em Usuários → Permissões
 * (permissão efetiva === false no evento da requisição).
 *
 * Diferente de checkPermission: módulo sem configuração (undefined) segue normalmente, sem consultar a
 * tabela de políticas por papel. Assim a regra configurada pelo admin passa a valer nas rotas que só
 * conferiam o papel (authorize), sem barrar quem já trabalha hoje com o módulo liberado ou sem ajuste.
 * Admin e admin_master não são afetados.
 */
function bloquearSeModuloDesligado(modulo) {
    return (req, res, next) => {
        const papel = req.user?.nivel_acesso || req.user?.role;
        if (papel === 'admin' || papel === 'admin_master' || papel === 'master') return next();

        const eventoId = req.event?.id || req.tenantId || req.user?.evento_id || null;
        const efetivas = typeof req.user?.getEffectivePermissions === 'function'
            ? req.user.getEffectivePermissions(eventoId)
            : null;

        if (efetivas && efetivas[modulo] === false) {
            logger.warn(`Acesso bloqueado: usuário ${req.user?.id} com o módulo '${modulo}' desligado no evento ${eventoId}`);
            return res.status(403).json({ error: `Acesso negado: o módulo ${modulo} está desligado para o seu usuário neste evento.` });
        }
        return next();
    };
}

module.exports = { bloquearSeModuloDesligado };
