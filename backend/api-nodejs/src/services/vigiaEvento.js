const fs = require('fs');
const os = require('os');
const { supabase } = require('../config/supabase');
const logger = require('./logger');
const telegram = require('./telegramSistema');

/**
 * Vigia do evento: a cada 2 min confere o que pode parar a operação e avisa a administradora
 * no Telegram só quando algo MUDA (caiu / voltou), nunca a cada verificação.
 *   - leitor facial sem conexão (2 verificações seguidas, ~4 min) e quando volta;
 *   - evento ou área com 90%+ da capacidade (mesmo cálculo do Dashboard);
 *   - banco de dados sem responder (3 verificações seguidas) e quando volta;
 *   - disco da VPS acima de 90% ou memória livre abaixo de 8%.
 * O PC do evento (agente local) é avisado por alertaAgente.js.
 * Estado em memória: depois de um deploy começa do zero e só avisa o que mudar dali em diante.
 */
const INTERVALO_MS = 2 * 60 * 1000;
const LEITOR_OFFLINE_VERIFICACOES = 2;
const BANCO_FALHAS = 3;

const estado = {
    primeira: true,
    leitores: new Map(),   // id → { offline: n de verificações seguidas, alertado: bool, desde }
    lotacao: new Map(),    // evento:alerta → chave do que foi avisado
    bancoFalhas: 0,
    bancoAlertado: false,
    recursoAvisado: new Map() // 'disco' | 'memoria' → quando
};

const hora = (d = new Date()) => d.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
const esc = (t) => String(t ?? '').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));

async function verificarLeitores(eventos, avisar) {
    const ids = eventos.map(e => e.id);
    if (!ids.length) return;
    const { data, error } = await supabase.from('dispositivos_acesso')
        .select('id, nome, status_online, evento_id').in('evento_id', ids).eq('tipo', 'terminal_facial');
    if (error) throw error;
    const nomeEvento = Object.fromEntries(eventos.map(e => [e.id, e.nome]));
    for (const d of data || []) {
        const s = estado.leitores.get(d.id) || { offline: 0, alertado: false, desde: null };
        if (d.status_online === 'online') {
            if (s.alertado) await avisar(`🟢 <b>Leitor voltou</b>: ${esc(d.nome)} (${esc(nomeEvento[d.evento_id])}), fora desde ${hora(s.desde)}.`);
            estado.leitores.set(d.id, { offline: 0, alertado: false, desde: null });
            continue;
        }
        s.offline += 1;
        s.desde = s.desde || new Date();
        // na primeira verificação após um deploy não avisa (não se sabe há quanto tempo está assim)
        if (!estado.primeira && !s.alertado && s.offline >= LEITOR_OFFLINE_VERIFICACOES) {
            s.alertado = await avisar(`🔴 <b>Leitor sem conexão</b>: ${esc(d.nome)} (${esc(nomeEvento[d.evento_id])}) desde ${hora(s.desde)}.\nSem ele, quem passa nesse ponto não é registrado. Confira energia, cabo de rede e o PC do evento.`);
        }
        estado.leitores.set(d.id, s);
    }
}

async function verificarLotacao(eventos, avisar) {
    const operacao = require('../modules/system/operacao.service');
    for (const ev of eventos) {
        const r = await operacao.resumo(ev.id);
        for (const id of ['capacidade', 'areas_cheias']) {
            const chave = `${ev.id}:${id}`;
            const alerta = (r.alertas || []).find(a => a.id === id);
            if (!alerta) { estado.lotacao.delete(chave); continue; }
            const assinatura = `${alerta.nivel}|${(alerta.itens || []).join(',')}|${alerta.titulo}`;
            if (estado.lotacao.get(chave) === assinatura) continue;
            const icone = alerta.nivel === 'error' ? '🔴' : '🟠';
            const itens = (alerta.itens || []).slice(0, 6).map(i => `• ${esc(i)}`).join('\n');
            await avisar(`${icone} <b>${esc(alerta.titulo)}</b> (${esc(ev.nome)})${alerta.texto ? `\n${esc(alerta.texto)}` : ''}${itens ? `\n${itens}` : ''}`);
            estado.lotacao.set(chave, assinatura);
        }
    }
}

async function verificarBanco(avisar) {
    const { error } = await supabase.from('eventos').select('id', { head: true, count: 'exact' }).limit(1);
    if (error) {
        estado.bancoFalhas += 1;
        if (!estado.bancoAlertado && estado.bancoFalhas >= BANCO_FALHAS) {
            estado.bancoAlertado = await avisar(`🔴 <b>Banco de dados sem responder</b> há ~${estado.bancoFalhas * 2} min (${esc(error.message).slice(0, 120)}).\nCadastros e relatórios podem falhar. Confira status.supabase.com.`);
        }
        return false;
    }
    if (estado.bancoAlertado) await avisar('🟢 <b>Banco de dados voltou</b> a responder.');
    estado.bancoFalhas = 0;
    estado.bancoAlertado = false;
    return true;
}

/**
 * Fração da memória realmente disponível. No Linux, MemAvailable (conta o cache que o sistema
 * libera quando precisa); os.freemem() ignora esse cache e daria falso alarme na VPS.
 */
function memoriaDisponivel() {
    try {
        const info = fs.readFileSync('/proc/meminfo', 'utf8');
        const kb = (nome) => parseInt((info.match(new RegExp(`^${nome}:\\s+(\\d+)`, 'm')) || [])[1], 10);
        const total = kb('MemTotal');
        const disponivel = kb('MemAvailable');
        if (total > 0 && disponivel >= 0) return disponivel / total;
    } catch (_) { /* fora do Linux */ }
    return os.freemem() / os.totalmem();
}

async function verificarRecursos(avisar) {
    if (process.env.VIGIA_SEM_RECURSOS === 'true') return; // testes: não depende da máquina
    const avisarUmaVezPorHora = async (tipo, texto) => {
        const ultimo = estado.recursoAvisado.get(tipo) || 0;
        if (Date.now() - ultimo < 60 * 60 * 1000) return;
        if (await avisar(texto)) estado.recursoAvisado.set(tipo, Date.now());
    };
    try {
        const s = fs.statfsSync('/');
        const usado = 1 - s.bavail / s.blocks;
        if (usado > 0.9) await avisarUmaVezPorHora('disco', `🟠 <b>Disco do servidor ${Math.round(usado * 100)}% cheio</b>. Libere espaço antes que os deploys e os registros falhem.`);
    } catch (_) { /* statfs indisponível */ }
    const livre = memoriaDisponivel();
    if (livre < 0.08) await avisarUmaVezPorHora('memoria', `🟠 <b>Memória do servidor quase no fim</b> (${Math.round(livre * 100)}% livre). O sistema pode ficar lento.`);
}

async function verificar() {
    const avisar = (texto) => telegram.enviar(texto);
    try {
        const bancoOk = await verificarBanco(avisar);
        if (bancoOk) {
            const { data: eventos } = await supabase.from('eventos').select('id, nome').eq('status', 'ativo');
            await verificarLeitores(eventos || [], avisar);
            await verificarLotacao(eventos || [], avisar);
        }
        await verificarRecursos(avisar);
    } catch (err) {
        logger.warn(`[Vigia] Verificação falhou: ${err.message}`);
    } finally {
        estado.primeira = false;
    }
}

let timer = null;
function iniciar() {
    if (timer || process.env.VIGIA_DESLIGADO === 'true') return;
    // primeira leitura 30 s depois de subir (health check dos leitores já rodou)
    setTimeout(verificar, 30 * 1000).unref();
    timer = setInterval(verificar, INTERVALO_MS);
    timer.unref();
    logger.info('👁️  [Vigia] Alertas do sistema no Telegram a cada 2 min');
}

module.exports = { iniciar, verificar, _estado: estado };
