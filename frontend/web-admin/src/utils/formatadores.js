/**
 * Formatação de documentos e contatos para exibição.
 * Valores fora do padrão (estrangeiros, incompletos, "000…") voltam como vieram.
 */
const digitos = (v) => String(v ?? '').replace(/\D/g, '');

export const formatarCpf = (v) => {
    const d = digitos(v);
    if (d.length !== 11) return v || '—';
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
};

export const formatarCnpj = (v) => {
    const d = digitos(v);
    if (d.length !== 14 || /^0+$/.test(d)) return v ? String(v) : '—';
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
};

export const formatarTelefone = (v) => {
    const d = digitos(v);
    if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return v || '—';
};

/**
 * Valor de status/tipo para exibir em selos: "checkin_feito" / "AUTORIZADO" -> "Checkin feito" / "Autorizado".
 * Use no lugar de .toUpperCase() — a interface não usa caixa alta.
 */
export const comoRotulo = (v) => {
    if (v === null || v === undefined || v === '') return '';
    const t = String(v).replace(/_/g, ' ').trim().toLowerCase();
    return t.charAt(0).toUpperCase() + t.slice(1);
};
