'use strict';

/**
 * Escopo de evento de quem chama, pelo mesmo critério do checkPermission:
 * admin e admin_master veem todos os eventos; os demais só os da própria lista (isAllowedEvent).
 */
const { extractRole } = require('../middleware/auth');

const ehSoberano = (user) => {
    const papel = extractRole(user);
    return papel === 'admin' || papel === 'admin_master';
};

/** Quem chama pode operar dados deste evento? (registro sem evento: só admin) */
function eventoPermitido(user, eventoId) {
    if (!user) return false;
    if (ehSoberano(user)) return true;
    if (!eventoId) return false;
    if (typeof user.isAllowedEvent === 'function') return user.isAllowedEvent(eventoId);
    return user.evento_id === eventoId;
}

module.exports = { ehSoberano, eventoPermitido };
