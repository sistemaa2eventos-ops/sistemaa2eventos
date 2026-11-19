/**
 * Endereço que os LEITORES usam para chamar o servidor (modo online), configurável pelo painel.
 *
 * Cada evento pode ter uma rede diferente (PC do evento num IP local, ou o subdomínio da VPS),
 * então o endereço fica por evento, com um padrão geral. Ordem usada no "Config Online":
 *   1. o que foi digitado na janela do Config Online
 *   2. o endereço deste evento (painel)
 *   3. o padrão geral (painel)
 *   4. HARDWARE_CALLBACK_HOST / HARDWARE_CALLBACK_PORT do servidor (.env)
 *
 * Guardado em system_settings.config.leitores_servidor = { padrao: {host, porta}, eventos: { <id>: {host, porta} } }
 */
const { supabase } = require('../../config/supabase');

const HOST_VALIDO = /^(?=.{1,253}$)[a-zA-Z0-9]([a-zA-Z0-9-]{0,62}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,62}[a-zA-Z0-9])?)*$/;

/** Aceita "192.168.1.129", "leitores.nzt.app.br", "http://x:3001" ou "x:3001"; devolve { host, porta } ou erro */
function validarEndereco(entrada) {
    if (!entrada || (entrada.host == null && entrada.porta == null)) return { valor: null };
    let host = String(entrada.host || '').trim();
    let porta = entrada.porta === '' || entrada.porta == null ? null : Number(entrada.porta);

    if (/^https?:\/\//i.test(host)) {
        try {
            const u = new URL(host);
            host = u.hostname;
            if (porta == null && u.port) porta = Number(u.port);
            if (porta == null) porta = u.protocol === 'https:' ? 443 : 80;
        } catch {
            return { erro: 'Endereço inválido' };
        }
    }
    const m = host.match(/^([^:/]+):(\d+)$/);
    if (m) {
        host = m[1];
        if (porta == null) porta = Number(m[2]);
    }
    if (!host) return { valor: null };
    if (!HOST_VALIDO.test(host)) return { erro: 'Use só o IP ou o domínio (ex.: 192.168.1.129 ou leitores.nzt.app.br), sem caminho' };
    if (porta != null && (!Number.isInteger(porta) || porta < 1 || porta > 65535)) return { erro: 'Porta deve ser um número de 1 a 65535' };
    return { valor: { host, porta } };
}

async function lerConfig() {
    const { data, error } = await supabase.from('system_settings').select('config').eq('id', 1).maybeSingle();
    if (error) throw error;
    return data?.config || {};
}

function doEnv() {
    const host = process.env.HARDWARE_CALLBACK_HOST || process.env.SERVER_IP || null;
    const p = parseInt(process.env.HARDWARE_CALLBACK_PORT || process.env.SERVER_PORT || '', 10);
    return host ? { host, porta: Number.isNaN(p) ? null : p } : null;
}

/** { evento, padrao, servidor, efetivo, origem } */
async function obter(eventoId) {
    const cfg = (await lerConfig()).leitores_servidor || {};
    const evento = (eventoId && cfg.eventos?.[eventoId]) || null;
    const padrao = cfg.padrao || null;
    const servidor = doEnv();
    const efetivo = evento || padrao || servidor;
    const origem = evento ? 'evento' : padrao ? 'padrao' : servidor ? 'servidor' : null;
    return { evento, padrao, servidor, efetivo, origem };
}

/** Endereço a usar quando a janela do Config Online veio em branco (null = deixa a regra antiga decidir) */
async function enderecoPara(eventoId) {
    try {
        const { evento, padrao } = await obter(eventoId);
        return evento || padrao || null;
    } catch {
        return null; // tabela fora do ar: segue com o .env, como antes
    }
}

/**
 * Grava o endereço do evento e/ou o padrão. Campo ausente = não mexe; host vazio = apaga.
 * @param {{ evento?: {host, porta}, padrao?: {host, porta} }} dados
 */
async function salvar(eventoId, dados, usuario) {
    const config = await lerConfig();
    const atual = { padrao: null, eventos: {}, ...(config.leitores_servidor || {}) };
    atual.eventos = { ...(atual.eventos || {}) };

    if (dados && 'evento' in dados) {
        if (!eventoId) throw Object.assign(new Error('Selecione um evento'), { status: 400 });
        const r = validarEndereco(dados.evento);
        if (r.erro) throw Object.assign(new Error(r.erro), { status: 400 });
        if (r.valor) atual.eventos[eventoId] = r.valor; else delete atual.eventos[eventoId];
    }
    if (dados && 'padrao' in dados) {
        const r = validarEndereco(dados.padrao);
        if (r.erro) throw Object.assign(new Error(r.erro), { status: 400 });
        atual.padrao = r.valor;
    }
    atual.atualizado_em = new Date().toISOString();
    atual.atualizado_por = usuario?.email || usuario?.id || null;

    const { error } = await supabase.from('system_settings').update({ config: { ...config, leitores_servidor: atual } }).eq('id', 1);
    if (error) throw error;
    return obter(eventoId);
}

module.exports = { validarEndereco, obter, enderecoPara, salvar };
