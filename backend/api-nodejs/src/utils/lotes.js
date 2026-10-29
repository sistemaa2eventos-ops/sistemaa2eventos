/** Divide uma lista em pedaços (ex.: milhares de ids num .in() estouram o tamanho da URL). */
const emLotes = (lista, tamanho) => {
    const lotes = [];
    for (let i = 0; i < lista.length; i += tamanho) lotes.push(lista.slice(i, i + tamanho));
    return lotes;
};

/**
 * Executa fn para cada item com no máximo `limite` ao mesmo tempo
 * (laços "um atrás do outro" sobre o banco levavam minutos; tudo junto sobrecarrega).
 */
async function emParalelo(lista, limite, fn) {
    let proximo = 0;
    const trabalhador = async () => {
        while (proximo < lista.length) await fn(lista[proximo++]);
    };
    await Promise.all(Array.from({ length: Math.min(limite, lista.length) }, trabalhador));
}

module.exports = { emLotes, emParalelo };
