/**
 * Identificador do usuário dentro do terminal (Intelbras/Hikvision).
 *
 * Regra única para cadastro E remoção: CPF só com dígitos; sem CPF, os
 * primeiros 8 caracteres do UUID da pessoa.
 */
function getHwUserId(pessoa) {
    if (!pessoa) return null;
    const cpfDigits = pessoa.cpf ? String(pessoa.cpf).replace(/\D/g, '') : '';
    if (cpfDigits) return cpfDigits;
    return pessoa.id ? String(pessoa.id).split('-')[0] : null;
}

/**
 * Todos os IDs que a pessoa pode ter no terminal. Remoções usam a lista
 * para também limpar cadastros antigos feitos pelo prefixo do UUID.
 */
function getHwUserIdCandidates(pessoa) {
    if (!pessoa) return [];
    const ids = [getHwUserId(pessoa)];
    if (pessoa.id) ids.push(String(pessoa.id).split('-')[0]);
    return [...new Set(ids.filter(Boolean))];
}

module.exports = { getHwUserId, getHwUserIdCandidates };
