/**
 * O Supabase (PostgREST) devolve no máximo 1000 linhas por consulta, sem avisar.
 * Relatórios e estatísticas que somam em memória precisam de TODAS as linhas.
 */

const TAMANHO_PAGINA = 1000;
const LIMITE_SEGURANCA = 200000; // evita estourar memória num evento gigantesco

/**
 * Executa a consulta em páginas de 1000 até trazer tudo.
 * Uso: const { data, error } = await buscarTodos(supabase.from('x').select('a').eq(...));
 * A consulta é ordenada também por id para a paginação ser estável.
 */
async function buscarTodos(query, { ordenarPorId = true } = {}) {
    if (ordenarPorId) query = query.order('id', { ascending: true });
    const linhas = [];
    for (let de = 0; de < LIMITE_SEGURANCA; de += TAMANHO_PAGINA) {
        const { data, error } = await query.range(de, de + TAMANHO_PAGINA - 1);
        if (error) return { data: linhas.length ? linhas : null, error };
        linhas.push(...(data || []));
        if (!data || data.length < TAMANHO_PAGINA) break;
    }
    return { data: linhas, error: null };
}

/**
 * Busca por uma lista grande de ids em lotes (URL com milhares de ids estoura o limite).
 * montar(lote) deve devolver a consulta com .in('coluna', lote).
 */
async function buscarPorIdsEmLotes(ids, montar, tamanhoLote = 200) {
    const unicos = [...new Set((ids || []).filter(Boolean))];
    const linhas = [];
    for (let i = 0; i < unicos.length; i += tamanhoLote) {
        const { data, error } = await montar(unicos.slice(i, i + tamanhoLote));
        if (error) return { data: linhas, error };
        linhas.push(...(data || []));
    }
    return { data: linhas, error: null };
}

module.exports = { buscarTodos, buscarPorIdsEmLotes };
