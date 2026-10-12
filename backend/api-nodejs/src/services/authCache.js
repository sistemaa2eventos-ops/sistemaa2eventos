const crypto = require('crypto');

/**
 * Cache curto da validação de token + perfil.
 *
 * Sem ele, cada requisição fazia 2 idas ao Supabase (auth.getUser + perfis) antes de
 * qualquer trabalho. O token continua sendo validado pelo Supabase na 1ª vez; depois,
 * por até TTL_MS, o resultado é reaproveitado. Logout, bloqueio, troca de papel e
 * "deslogar todos" limpam o cache na hora (invalidarUsuario / invalidarTodos).
 */
const TTL_MS = 60 * 1000;
const MAX_ENTRADAS = 5000;

const porToken = new Map(); // hash do token → { userId, user, role, expiraEm }

const hash = (token) => crypto.createHash('sha256').update(token).digest('hex');

/** exp do JWT em ms (sem validar assinatura; só para não cachear além da validade) */
function expiracaoDoToken(token) {
    try {
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
        return payload.exp ? payload.exp * 1000 : null;
    } catch {
        return null;
    }
}

function obter(token) {
    const chave = hash(token);
    const item = porToken.get(chave);
    if (!item) return null;
    if (item.expiraEm <= Date.now()) {
        porToken.delete(chave);
        return null;
    }
    return item;
}

function guardar(token, { user, role, statusPerfil = null, perfil = null }) {
    const expToken = expiracaoDoToken(token);
    const expiraEm = Math.min(Date.now() + TTL_MS, expToken || Infinity);
    if (expiraEm <= Date.now()) return;

    if (porToken.size >= MAX_ENTRADAS) {
        // Remove o mais antigo (Map mantém ordem de inserção)
        porToken.delete(porToken.keys().next().value);
    }
    porToken.set(hash(token), { userId: user.id, user, role, statusPerfil, perfil, expiraEm });
}

function invalidarUsuario(userId) {
    if (!userId) return;
    for (const [chave, item] of porToken) {
        if (item.userId === userId) porToken.delete(chave);
    }
}

function invalidarTodos() {
    porToken.clear();
}

module.exports = { obter, guardar, invalidarUsuario, invalidarTodos };
