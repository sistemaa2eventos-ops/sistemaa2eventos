'use strict';

const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const ESCOPO_PORTAL_PRODUTOR = 'portal_produtor';

function obterSegredoJwt() {
    return process.env.JWT_SECRET || process.env.SUPABASE_JWT_SECRET || 'dev-secret-change-in-production';
}

/**
 * Deriva hash seguro de senha usando scrypt + salt aleatório por produtor.
 */
function gerarHashSenha(senha) {
    const senhaLimpa = String(senha || '').trim();
    const salt = crypto.randomBytes(16).toString('hex');
    const derivado = crypto.scryptSync(senhaLimpa, salt, 64).toString('hex');
    return `scrypt$${salt}$${derivado}`;
}

/**
 * Valida senha em texto plano contra hash armazenado no formato scrypt$salt$hash.
 */
function verificarSenha(senha, hashArmazenado) {
    if (!senha || !hashArmazenado || typeof hashArmazenado !== 'string') return false;
    const partes = hashArmazenado.split('$');
    if (partes.length !== 3 || partes[0] !== 'scrypt') return false;

    const [, salt, hashHex] = partes;
    if (!salt || !hashHex) return false;

    try {
        const senhaLimpa = String(senha).trim();
        const calculado = crypto.scryptSync(senhaLimpa, salt, 64);
        const esperado = Buffer.from(hashHex, 'hex');
        if (calculado.length !== esperado.length) return false;
        return crypto.timingSafeEqual(calculado, esperado);
    } catch {
        return false;
    }
}

/**
 * Assina JWT exclusivo para o Portal Separado dos Produtores.
 * Nunca deve ser aceito em rotas administrativas do Painel NZT.
 */
function assinarTokenProdutor({
    produtor_id,
    evento_id,
    nome,
    login_acesso,
    email,
    papel_producao,
    area_id
}) {
    return jwt.sign(
        {
            sub: produtor_id,
            escopo: ESCOPO_PORTAL_PRODUTOR,
            produtor_id,
            evento_id,
            nome,
            login_acesso: login_acesso || email || null,
            email: email || null,
            papel_producao: papel_producao || 'produtor_area',
            area_id: area_id || null
        },
        obterSegredoJwt(),
        { expiresIn: '24h' }
    );
}

/**
 * Verifica um JWT e confirma que pertence estritamente ao escopo do Portal do Produtor.
 */
function verificarTokenProdutor(token) {
    if (!token || typeof token !== 'string') return null;
    try {
        const decoded = jwt.verify(token, obterSegredoJwt());
        if (decoded?.escopo !== ESCOPO_PORTAL_PRODUTOR) return null;
        if (!decoded?.produtor_id || !decoded?.evento_id) return null;
        return decoded;
    } catch {
        return null;
    }
}

module.exports = {
    ESCOPO_PORTAL_PRODUTOR,
    gerarHashSenha,
    verificarSenha,
    assinarTokenProdutor,
    verificarTokenProdutor
};
