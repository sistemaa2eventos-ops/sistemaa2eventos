/**
 * Base dos robôs de teste: configuração, chamadas HTTP cronometradas e placar.
 * Os robôs só falam HTTP com a API, então rodam contra a cópia local ou a produção.
 *
 * Variáveis (ou arquivo scripts/robos/.env.robos):
 *   ROBO_API_URL          ex.: http://localhost:3001 ou https://api.nzt.app.br
 *   ROBO_EMAIL / ROBO_SENHA   usuário admin ou supervisor do evento de teste
 *   ROBO_EVENTO_ID        evento de teste (nunca o evento real)
 *   ROBO_EMPRESA_ID       empresa do evento de teste
 *   ROBO_TOKEN_ACESSO     control_token do leitor de acesso de teste
 *   ROBO_TOKEN_CREDENCIAMENTO  control_token do leitor de credenciamento (opcional)
 */
const fs = require('fs');
const path = require('path');

const arquivoEnv = path.join(__dirname, '.env.robos');
if (fs.existsSync(arquivoEnv)) {
    for (const linha of fs.readFileSync(arquivoEnv, 'utf8').split(/\r?\n/)) {
        const m = linha.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
        if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
}

const cfg = {
    api: (process.env.ROBO_API_URL || 'http://localhost:3001').replace(/\/$/, ''),
    // Na VPS os leitores chamam leitores.nzt.app.br (worker api_intelbras); local, a própria API
    leitor: (process.env.ROBO_LEITOR_URL || process.env.ROBO_API_URL || 'http://localhost:3001').replace(/\/$/, ''),
    email: process.env.ROBO_EMAIL,
    senha: process.env.ROBO_SENHA,
    eventoId: process.env.ROBO_EVENTO_ID,
    empresaId: process.env.ROBO_EMPRESA_ID,
    tokenAcesso: process.env.ROBO_TOKEN_ACESSO,
    tokenCredenciamento: process.env.ROBO_TOKEN_CREDENCIAMENTO
};

function exigir(...chaves) {
    const nomes = { email: 'ROBO_EMAIL', senha: 'ROBO_SENHA', eventoId: 'ROBO_EVENTO_ID', empresaId: 'ROBO_EMPRESA_ID', tokenAcesso: 'ROBO_TOKEN_ACESSO' };
    const faltando = chaves.filter(c => !cfg[c]).map(c => nomes[c] || c);
    if (faltando.length) {
        console.error(`Faltam variáveis: ${faltando.join(', ')} (veja scripts/robos/README.md)`);
        process.exit(2);
    }
}

/** Chamada HTTP que nunca lança: devolve status, corpo e tempo em ms. */
async function chamar(metodo, rota, { corpo, token, headers = {}, base = cfg.api } = {}) {
    const inicio = performance.now();
    try {
        const resp = await fetch(base + rota, {
            method: metodo,
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                ...(cfg.eventoId ? { 'x-evento-id': cfg.eventoId } : {}),
                ...headers
            },
            body: corpo === undefined ? undefined : JSON.stringify(corpo)
        });
        const texto = await resp.text();
        let json = null;
        try { json = JSON.parse(texto); } catch (_) { /* resposta não-JSON */ }
        return { status: resp.status, json, texto, ms: performance.now() - inicio };
    } catch (err) {
        return { status: 0, json: null, texto: err.message, ms: performance.now() - inicio, erroRede: true };
    }
}

async function login() {
    const r = await chamar('POST', '/api/auth/login', { corpo: { email: cfg.email, password: cfg.senha } });
    const token = r.json?.session?.access_token || r.json?.data?.session?.access_token || r.json?.access_token || r.json?.data?.access_token;
    if (!token) {
        console.error(`Login falhou (${r.status}): ${r.texto.slice(0, 200)}`);
        process.exit(1);
    }
    return token;
}

/** CPF válido (dígitos verificadores corretos), começando por 999 para ser reconhecível. */
function gerarCpf() {
    const n = [9, 9, 9, ...Array.from({ length: 6 }, () => Math.floor(Math.random() * 10))];
    for (const pesoInicial of [10, 11]) {
        const soma = n.reduce((s, d, i) => s + d * (pesoInicial - i), 0);
        const resto = (soma * 10) % 11;
        n.push(resto === 10 ? 0 : resto);
    }
    return n.join('');
}

/** Placar: cada verificação vira uma linha ✓/✗ e o resumo sai no fim. */
function criarPlacar(titulo) {
    const linhas = [];
    console.log(`\n=== ${titulo} ===  (${cfg.api})\n`);
    return {
        ok(condicao, descricao, r) {
            linhas.push(!!condicao);
            const detalhe = r ? `  [${r.status} • ${Math.round(r.ms)} ms]` : '';
            const motivo = !condicao && r ? `\n      → ${(r.json?.error || r.json?.message || r.texto || '').toString().slice(0, 160)}` : '';
            console.log(`  ${condicao ? '✓' : '✗'} ${descricao}${detalhe}${motivo}`);
            return !!condicao;
        },
        fim() {
            const falhas = linhas.filter(x => !x).length;
            console.log(`\n${falhas === 0 ? 'TUDO OK' : `${falhas} FALHA(S)`} — ${linhas.length - falhas}/${linhas.length} verificações\n`);
            process.exitCode = falhas === 0 ? 0 : 1;
        }
    };
}

module.exports = { cfg, exigir, chamar, login, gerarCpf, criarPlacar };
