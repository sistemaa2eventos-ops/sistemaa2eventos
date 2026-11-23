/**
 * O Supabase (PostgREST) devolve no máximo 1000 linhas por consulta, sem avisar.
 * Relatórios e estatísticas que somam em memória precisam de TODAS as linhas.
 */

const TAMANHO_PAGINA = 1000;
const LIMITE_SEGURANCA = 200000; // evita estourar memória num evento gigantesco

// Páginas buscadas ao mesmo tempo depois da primeira. Medido em 23/11/2026 com 150 mil registros e 80 ms
// de latência: 1 por vez 20,4 s; 4 por vez 5,3 s; 8 por vez 2,9 s. 4 é o padrão para não ocupar o pool de
// conexões do Supabase quando várias telas pedem relatório juntas. BUSCAR_TODOS_PARALELO muda (1 a 8).
const PARALELO = Math.min(8, Math.max(1, Number(process.env.BUSCAR_TODOS_PARALELO) || 4));

/**
 * Cópia independente da consulta: o .range() do Supabase escreve na URL do próprio objeto, então páginas
 * em paralelo precisam cada uma da sua. Só para o builder real do postgrest-js (url do tipo URL);
 * qualquer outra coisa (ex.: mocks de teste) devolve null e a busca segue uma página por vez.
 */
function clonarConsulta(query) {
    try {
        if (!(query?.url instanceof URL) || typeof query.constructor !== 'function') return null;
        const copia = new query.constructor(query);
        copia.url = new URL(query.url.toString());
        return copia;
    } catch {
        return null;
    }
}

async function paginaUnica(query, de) {
    return query.range(de, de + TAMANHO_PAGINA - 1);
}

/**
 * Executa a consulta em páginas de 1000 até trazer tudo.
 * Uso: const { data, error } = await buscarTodos(supabase.from('x').select('a').eq(...));
 * A consulta é ordenada também por id para a paginação ser estável. A ordem do resultado é a da consulta.
 * A primeira página vem sozinha (relatório pequeno continua custando 1 requisição); se vier cheia,
 * as seguintes vêm em lotes paralelos.
 */
async function buscarTodos(query, { ordenarPorId = true, paralelo = PARALELO } = {}) {
    if (ordenarPorId) query = query.order('id', { ascending: true });
    const linhas = [];

    // 1ª página
    const primeira = clonarConsulta(query) || query;
    {
        const { data, error } = await paginaUnica(primeira, 0);
        if (error) return { data: null, error };
        linhas.push(...(data || []));
        if (!data || data.length < TAMANHO_PAGINA) return { data: linhas, error: null };
    }

    const podeParalelo = paralelo > 1 && clonarConsulta(query) !== null;

    for (let de = TAMANHO_PAGINA; de < LIMITE_SEGURANCA;) {
        const lote = podeParalelo ? Math.min(paralelo, Math.ceil((LIMITE_SEGURANCA - de) / TAMANHO_PAGINA)) : 1;
        const respostas = await Promise.all(Array.from({ length: lote }, (_, i) =>
            paginaUnica(podeParalelo ? clonarConsulta(query) : query, de + i * TAMANHO_PAGINA)));
        de += lote * TAMANHO_PAGINA;

        // Junta na ordem das páginas; para na primeira página curta (fim dos dados) ou no primeiro erro
        for (const { data, error } of respostas) {
            if (error) return { data: linhas.length ? linhas : null, error };
            linhas.push(...(data || []));
            if (!data || data.length < TAMANHO_PAGINA) return { data: linhas, error: null };
        }
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
