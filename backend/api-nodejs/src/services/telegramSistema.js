const { supabase } = require('../config/supabase');
const logger = require('./logger');

/**
 * Alertas do SISTEMA no Telegram (leitor caído, PC do evento desconectado, lotação, servidor):
 * vão só para o Chat ID dos alertas do sistema (a administradora). Os alertas da watchlist
 * continuam no Chat ID global / contatos da watchlist (o grupo da equipe).
 * Nunca lança: alerta que falha não pode derrubar quem chamou.
 */
const CACHE_MS = 60 * 1000;
const REPETICAO_MS = 10 * 60 * 1000; // mesma mensagem não sai de novo em 10 min
let cache = null;
const enviadas = new Map(); // texto → quando

async function config() {
    if (cache && cache.expira > Date.now()) return cache.valor;
    const { data } = await supabase.from('system_settings').select('telegram_bot_token, config').eq('id', 1).maybeSingle();
    const c = data?.config || {};
    const valor = {
        token: data?.telegram_bot_token || c.telegram_bot_token || process.env.TELEGRAM_BOT_TOKEN || null,
        // Sem Chat ID próprio, usa o global (hoje o da administradora)
        chatId: c.telegram_chat_id_sistema || c.telegram_chat_id || process.env.TELEGRAM_CHAT_ID || null,
        ligado: c.telegram_alertas_sistema !== false
    };
    cache = { valor, expira: Date.now() + CACHE_MS };
    return valor;
}

const limparCache = () => { cache = null; };

/** Envia um alerta do sistema. Devolve true se saiu. */
async function enviar(texto) {
    try {
        const agora = Date.now();
        if (enviadas.get(texto) > agora - REPETICAO_MS) return false;
        const { token, chatId, ligado } = await config();
        if (!ligado || !token || !chatId) return false;
        const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: String(chatId).trim(), text: texto, parse_mode: 'HTML', disable_web_page_preview: true }),
            signal: AbortSignal.timeout(8000)
        });
        if (!resp.ok) {
            const corpo = await resp.json().catch(() => ({}));
            logger.warn(`[Telegram sistema] Falha ao enviar: ${corpo.description || resp.status}`);
            return false;
        }
        if (enviadas.size > 200) enviadas.clear();
        enviadas.set(texto, agora);
        return true;
    } catch (err) {
        logger.warn(`[Telegram sistema] ${err.message}`);
        return false;
    }
}

module.exports = { enviar, limparCache };
