'use strict';

/**
 * Leitor rápido (POST /access/leitor-rapido): o que foi lido é código, e de que tipo?
 * Só código faz check-in/check-out: pulseira, CPF (11 dígitos, com ou sem máscara), QR (JWT) ou id.
 * Nome ou texto livre → null (o operador usa a busca por nome).
 *
 * @param {string} texto valor lido, já sem espaços nas pontas
 * @returns {null | { pulseira: boolean, qr: boolean, cpf: string[]|null, id: boolean }}
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CPF = /^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/;
// Sem espaço; letras, números e . _ - (pulseira, CPF, JWT do QR, UUID); até 2048 caracteres
const FORMATO_CODIGO = /^[A-Za-z0-9][A-Za-z0-9._-]{0,2047}$/;

function classificarCodigoLeitor(texto) {
    const t = String(texto ?? '').trim();
    if (!FORMATO_CODIGO.test(t)) return null;           // espaço, acento, símbolo: é nome/texto
    if (UUID.test(t)) return { pulseira: false, qr: true, cpf: null, id: true };

    const ehCpf = CPF.test(t);
    // Código precisa ter dígito ou ser um token (JWT com pontos); palavra só de letras é nome
    if (!ehCpf && !/\d/.test(t) && !t.includes('.')) return null;

    const digitos = t.replace(/\D/g, '');
    const ehJwt = t.split('.').length === 3 && /[A-Za-z]/.test(t);
    return {
        pulseira: !ehJwt && !(ehCpf && t.includes('.')),  // CPF com máscara não é número de pulseira
        qr: !ehCpf,
        cpf: ehCpf ? [digitos, digitos.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')] : null,
        id: false
    };
}

const MSG_NAO_E_CODIGO = 'Código não reconhecido. Use a busca por nome.';

/**
 * Busca a pessoa do evento pelo código lido (pulseira, CPF, QR ou id), só pelos campos que o formato
 * permite. Cada valor vai como parâmetro (.eq/.in): o texto lido nunca é montado num filtro .or().
 * Usada por leitor-rapido, consultar-pulseira e fiscalizar.
 *
 * @param {object} cliente cliente Supabase
 * @param {string} eventoId
 * @param {string} codigo texto lido
 * @param {string} colunas select da pessoa
 * @returns {Promise<{ pessoa: object } | { status: 400|404|409, erro: string }>}
 */
async function buscarPessoaPorCodigo(cliente, eventoId, codigo, colunas) {
    const texto = String(codigo ?? '').trim();
    const tipo = classificarCodigoLeitor(texto);
    if (!tipo) return { status: 400, erro: MSG_NAO_E_CODIGO };

    const base = () => cliente.from('pessoas').select(colunas).eq('evento_id', eventoId);
    const vazio = Promise.resolve({ data: [], error: null });
    const [porPulseira, porQr, porCpf, porId] = await Promise.all([
        tipo.pulseira ? base().eq('numero_pulseira', texto).limit(2) : vazio,
        tipo.qr ? base().eq('qr_code', texto).limit(2) : vazio,
        tipo.cpf ? base().in('cpf', tipo.cpf).limit(2) : vazio,
        tipo.id ? base().eq('id', texto).limit(1) : vazio
    ]);
    const erroBusca = [porPulseira, porQr, porCpf, porId].find(r => r.error)?.error;
    if (erroBusca) throw erroBusca;

    // Pulseira com o mesmo número em duas pessoas: não escolhe uma delas
    if ((porPulseira.data || []).length > 1) {
        return { status: 409, erro: `A pulseira ${texto} está registrada para mais de uma pessoa neste evento. Corrija no credenciamento antes de liberar.` };
    }

    const encontradas = new Map();
    for (const r of [porQr, porCpf, porId, porPulseira]) {
        for (const p of r.data || []) if (!encontradas.has(p.id)) encontradas.set(p.id, p);
    }
    if (encontradas.size === 0) return { status: 404, erro: `Participante não encontrado para o código "${texto}"` };
    if (encontradas.size > 1) {
        return { status: 409, erro: 'Este código corresponde a mais de uma pessoa neste evento. Use a busca por nome.' };
    }
    return { pessoa: [...encontradas.values()][0] };
}

module.exports = { classificarCodigoLeitor, buscarPessoaPorCodigo, MSG_NAO_E_CODIGO };
