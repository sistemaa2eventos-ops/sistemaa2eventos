/**
 * buscarTodos: primeira página sozinha e as seguintes em lotes paralelos (relatórios ~4x mais rápidos).
 * O builder falso imita o postgrest-js: o construtor copia a REFERÊNCIA da URL e o .range() escreve nela.
 * Sem a cópia da URL por página, as páginas paralelas sairiam todas com o mesmo intervalo.
 */
const { buscarTodos } = require('../src/utils/buscarTodos');

class BuilderFalso {
    constructor(b) {
        this.url = b.url;          // mesma referência, como o postgrest-js
        this.linhas = b.linhas;
        this.pedidos = b.pedidos;
        this.emVoo = b.emVoo;
    }
    order() { return this; }
    range(de, ate) {
        this.url.searchParams.set('offset', String(de));
        this.url.searchParams.set('limit', String(ate - de + 1));
        return this;
    }
    then(ok, ko) {
        const de = Number(this.url.searchParams.get('offset'));
        const qtd = Number(this.url.searchParams.get('limit'));
        this.pedidos.push(de);
        this.emVoo.agora += 1;
        this.emVoo.max = Math.max(this.emVoo.max, this.emVoo.agora);
        return new Promise(r => setTimeout(r, 5)).then(() => {
            this.emVoo.agora -= 1;
            return { data: this.linhas.slice(de, de + qtd), error: null };
        }).then(ok, ko);
    }
}

const novaConsulta = (total) => new BuilderFalso({
    url: new URL('http://x/rest/v1/logs_acesso?select=id'),
    linhas: Array.from({ length: total }, (_, i) => ({ id: i })),
    pedidos: [],
    emVoo: { agora: 0, max: 0 }
});

describe('buscarTodos', () => {
    it('traz todas as linhas na ordem, sem repetir nem pular página', async () => {
        const q = novaConsulta(4500);
        const { data, error } = await buscarTodos(q, { paralelo: 4 });
        expect(error).toBeNull();
        expect(data).toHaveLength(4500);
        expect(data.every((l, i) => l.id === i)).toBe(true);
        expect([...q.pedidos].sort((a, b) => a - b)).toEqual([0, 1000, 2000, 3000, 4000]);
    });

    it('busca as páginas seguintes em paralelo', async () => {
        const q = novaConsulta(9000);
        await buscarTodos(q, { paralelo: 4 });
        expect(q.emVoo.max).toBe(4);
    });

    it('relatório pequeno continua custando uma requisição', async () => {
        const q = novaConsulta(300);
        const { data } = await buscarTodos(q, { paralelo: 4 });
        expect(data).toHaveLength(300);
        expect(q.pedidos).toEqual([0]);
    });

    it('total múltiplo de 1000 termina na página vazia', async () => {
        const q = novaConsulta(3000);
        const { data } = await buscarTodos(q, { paralelo: 4 });
        expect(data).toHaveLength(3000);
    });

    it('consulta que não é do Supabase segue uma página por vez', async () => {
        const linhas = Array.from({ length: 2500 }, (_, i) => ({ id: i }));
        let emVoo = 0, max = 0;
        const mock = {
            order() { return this; },
            range(de, ate) {
                return (async () => {
                    emVoo += 1; max = Math.max(max, emVoo);
                    await new Promise(r => setTimeout(r, 2));
                    emVoo -= 1;
                    return { data: linhas.slice(de, ate + 1), error: null };
                })();
            }
        };
        const { data } = await buscarTodos(mock, { paralelo: 4 });
        expect(data).toHaveLength(2500);
        expect(max).toBe(1);
    });

    it('erro numa página devolve o erro e o que já veio', async () => {
        const q = novaConsulta(5000);
        const original = q.then;
        BuilderFalso.prototype.then = function (ok, ko) {
            if (Number(this.url.searchParams.get('offset')) === 2000) {
                return Promise.resolve({ data: null, error: { message: 'falhou' } }).then(ok, ko);
            }
            return original.call(this, ok, ko);
        };
        try {
            const { data, error } = await buscarTodos(q, { paralelo: 4 });
            expect(error).toEqual({ message: 'falhou' });
            expect(data).toHaveLength(2000);
        } finally {
            BuilderFalso.prototype.then = original;
        }
    });
});
