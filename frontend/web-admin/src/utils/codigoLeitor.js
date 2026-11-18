// Espelho de backend/api-nodejs/src/modules/checkin/codigoLeitor.js.
// Usado no aparelho para não enfileirar texto que o servidor vai recusar de qualquer forma.
// Se a regra mudar lá, mudar aqui também.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CPF = /^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/;
// Sem espaço; letras, números e . _ - (pulseira, CPF, JWT do QR, UUID); até 2048 caracteres
const FORMATO_CODIGO = /^[A-Za-z0-9][A-Za-z0-9._-]{0,2047}$/;

/**
 * @returns {null | { pulseira: boolean, qr: boolean, cpf: string[]|null, id: boolean }}
 *   null quando o texto é nome ou lixo (não é código)
 */
export function classificarCodigoLeitor(texto) {
    const t = String(texto ?? '').trim();
    if (!FORMATO_CODIGO.test(t)) return null;
    if (UUID.test(t)) return { pulseira: false, qr: true, cpf: null, id: true };

    const ehCpf = CPF.test(t);
    // Código precisa ter dígito ou ser um token (JWT com pontos); palavra só de letras é nome
    if (!ehCpf && !/\d/.test(t) && !t.includes('.')) return null;

    const digitos = t.replace(/\D/g, '');
    const ehJwt = t.split('.').length === 3 && /[A-Za-z]/.test(t);
    return {
        pulseira: !ehJwt && !(ehCpf && t.includes('.')),
        qr: !ehCpf,
        cpf: ehCpf ? [digitos, digitos.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')] : null,
        id: false
    };
}

export const ehCodigoLeitor = (texto) => classificarCodigoLeitor(texto) !== null;
