/**
 * Utilitários das rotinas em lote (fechamento de turno, recálculo de documentos).
 */
const { emLotes, emParalelo } = require('../src/utils/lotes');

describe('emLotes', () => {
    it('divide sem perder nem repetir itens', () => {
        const ids = Array.from({ length: 450 }, (_, i) => i);
        const lotes = emLotes(ids, 200);
        expect(lotes.map(l => l.length)).toEqual([200, 200, 50]);
        expect(lotes.flat()).toEqual(ids);
    });

    it('lista vazia não gera lote', () => {
        expect(emLotes([], 200)).toEqual([]);
    });
});

describe('emParalelo', () => {
    it('processa todos os itens, nunca mais que o limite ao mesmo tempo', async () => {
        let ativos = 0;
        let pico = 0;
        const feitos = [];
        await emParalelo([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 5, async (n) => {
            ativos++;
            pico = Math.max(pico, ativos);
            await new Promise(r => setTimeout(r, 5));
            feitos.push(n);
            ativos--;
        });
        expect(feitos.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
        expect(pico).toBe(5);
    });

    it('lista vazia termina na hora', async () => {
        await expect(emParalelo([], 5, async () => { throw new Error('não deveria rodar'); })).resolves.toBeUndefined();
    });
});
