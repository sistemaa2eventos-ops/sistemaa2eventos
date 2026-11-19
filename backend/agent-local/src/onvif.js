'use strict';

/**
 * Controle de giro (PTZ) de câmeras pelo padrão ONVIF (serviço SOAP, porta 2020 nas Mercusys/Tapo).
 * Só monta e lê as mensagens: quem envia é quem chama (direto, ou pelo agente do PC do evento).
 *
 * Segurança: cada movimento leva um Timeout na própria câmera, então ela para sozinha se o painel
 * sumir no meio do comando. O painel repete o movimento enquanto o botão estiver apertado.
 */
const crypto = require('crypto');

const NS = {
    s: 'http://www.w3.org/2003/05/soap-envelope',
    tds: 'http://www.onvif.org/ver10/device/wsdl',
    trt: 'http://www.onvif.org/ver10/media/wsdl',
    tptz: 'http://www.onvif.org/ver20/ptz/wsdl',
    tt: 'http://www.onvif.org/ver10/schema'
};
const NS_PTZ = 'http://www.onvif.org/ver20/ptz/wsdl';
const NS_MEDIA = 'http://www.onvif.org/ver10/media/wsdl';
const TIMEOUT_MOVIMENTO_S = 1; // a câmera para sozinha depois disso, se não receber nova ordem
const CONTENT_TYPE = 'application/soap+xml; charset=utf-8';

const escapar = (t) => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));

/**
 * Cabeçalho WS-Security (UsernameToken com senha em digest), exigido pela câmera.
 * digest = base64(SHA1(nonce + data + senha)) — padrão OASIS.
 */
function cabecalhoSeguranca(usuario, senha, { agora = new Date(), nonce = crypto.randomBytes(16) } = {}) {
    const criado = agora.toISOString();
    const digest = crypto.createHash('sha1').update(Buffer.concat([nonce, Buffer.from(criado), Buffer.from(String(senha || ''))])).digest('base64');
    return `<s:Header><Security s:mustUnderstand="1" xmlns="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">`
        + `<UsernameToken><Username>${escapar(usuario || '')}</Username>`
        + `<Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordDigest">${digest}</Password>`
        + `<Nonce EncodingType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-soap-message-security-1.0#Base64Binary">${nonce.toString('base64')}</Nonce>`
        + `<Created xmlns="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">${criado}</Created>`
        + `</UsernameToken></Security></s:Header>`;
}

/** Envelope SOAP 1.2 com a operação ONVIF dentro */
function envelope(corpo, credenciais = {}, opcoes = {}) {
    const cabecalho = credenciais.usuario ? cabecalhoSeguranca(credenciais.usuario, credenciais.senha, opcoes) : '';
    return `<?xml version="1.0" encoding="UTF-8"?>`
        + `<s:Envelope xmlns:s="${NS.s}" xmlns:tds="${NS.tds}" xmlns:trt="${NS.trt}" xmlns:tptz="${NS.tptz}" xmlns:tt="${NS.tt}">`
        + cabecalho + `<s:Body>${corpo}</s:Body></s:Envelope>`;
}

// ---------------------------------------------------------------- mensagens
const msgServicos = () => `<tds:GetServices><tds:IncludeCapability>false</tds:IncludeCapability></tds:GetServices>`;
const msgPerfis = () => `<trt:GetProfiles/>`;

/** Velocidade -1..1 (pan/tilt/zoom). Parada e tempo limite na câmera para não travar o motor. */
function msgMover(token, { pan = 0, tilt = 0, zoom = 0 }) {
    const n = (v) => Math.max(-1, Math.min(1, Number(v) || 0)).toFixed(3);
    return `<tptz:ContinuousMove><tptz:ProfileToken>${escapar(token)}</tptz:ProfileToken>`
        + `<tptz:Velocity><tt:PanTilt x="${n(pan)}" y="${n(tilt)}"/><tt:Zoom x="${n(zoom)}"/></tptz:Velocity>`
        + `<tptz:Timeout>PT${TIMEOUT_MOVIMENTO_S}S</tptz:Timeout></tptz:ContinuousMove>`;
}
const msgParar = (token) => `<tptz:Stop><tptz:ProfileToken>${escapar(token)}</tptz:ProfileToken>`
    + `<tptz:PanTilt>true</tptz:PanTilt><tptz:Zoom>true</tptz:Zoom></tptz:Stop>`;
const msgListarPresets = (token) => `<tptz:GetPresets><tptz:ProfileToken>${escapar(token)}</tptz:ProfileToken></tptz:GetPresets>`;
const msgIrPreset = (token, presetToken) => `<tptz:GotoPreset><tptz:ProfileToken>${escapar(token)}</tptz:ProfileToken>`
    + `<tptz:PresetToken>${escapar(presetToken)}</tptz:PresetToken></tptz:GotoPreset>`;
const msgGravarPreset = (token, nome) => `<tptz:SetPreset><tptz:ProfileToken>${escapar(token)}</tptz:ProfileToken>`
    + `<tptz:PresetName>${escapar(String(nome || 'Posição').slice(0, 40))}</tptz:PresetName></tptz:SetPreset>`;

// ---------------------------------------------------------------- leitura das respostas
const semPrefixo = (nome) => nome.replace(/^[a-z0-9]+:/i, '');

/** Falha SOAP (Fault) ou erro de autenticação na resposta da câmera */
function falha(xml) {
    const m = String(xml || '').match(/<(?:[a-z0-9]+:)?Text[^>]*>([^<]+)</i) || String(xml || '').match(/<(?:[a-z0-9]+:)?Reason[^>]*>[\s\S]*?<(?:[a-z0-9]+:)?Text[^>]*>([^<]+)</i);
    const codigo = (String(xml || '').match(/<(?:[a-z0-9]+:)?Value>([^<]+)</i) || [])[1];
    if (/<(?:[a-z0-9]+:)?Fault[\s>]/i.test(String(xml || ''))) return { erro: true, motivo: [codigo, m && m[1]].filter(Boolean).join(': ') || 'a câmera recusou o comando' };
    return null;
}

/** Endereço do serviço PTZ e de mídia (GetServices) */
function extrairServicos(xml) {
    const achar = (ns) => {
        const blocos = String(xml || '').match(/<(?:[a-z0-9]+:)?Service[\s>][\s\S]*?<\/(?:[a-z0-9]+:)?Service>/gi) || [];
        for (const b of blocos) {
            if (!b.includes(ns)) continue;
            const x = b.match(/<(?:[a-z0-9]+:)?XAddr>([^<]+)</i);
            if (x) return x[1].trim();
        }
        return null;
    };
    return { ptz: achar(NS_PTZ), midia: achar(NS_MEDIA) };
}

/** Token do primeiro perfil de vídeo (usado em todos os comandos de giro) */
function extrairTokenPerfil(xml) {
    const m = String(xml || '').match(/<(?:[a-z0-9]+:)?Profiles\b[^>]*\btoken="([^"]+)"/i);
    return m ? m[1] : null;
}

function extrairPresets(xml) {
    const lista = [];
    for (const m of String(xml || '').matchAll(/<(?:[a-z0-9]+:)?Preset\b([^>]*)>([\s\S]*?)<\/(?:[a-z0-9]+:)?Preset>/gi)) {
        const token = (m[1].match(/token="([^"]+)"/) || [])[1];
        const nome = ((m[2].match(/<(?:[a-z0-9]+:)?Name>([^<]*)</i) || [])[1]) || `Posição ${token}`;
        if (token) lista.push({ token, nome });
    }
    return lista;
}

const extrairTokenPreset = (xml) => ((String(xml || '').match(/<(?:[a-z0-9]+:)?PresetToken>([^<]+)</i) || [])[1]) || null;

/** Endereço SOAP de uma câmera (porta do ONVIF, geralmente 2020) */
const urlServico = (ip, porta, caminho) => `http://${ip}:${porta || 2020}${caminho}`;

module.exports = {
    NS, TIMEOUT_MOVIMENTO_S, CONTENT_TYPE,
    cabecalhoSeguranca, envelope, falha, extrairServicos, extrairTokenPerfil, extrairPresets, extrairTokenPreset,
    msgServicos, msgPerfis, msgMover, msgParar, msgListarPresets, msgIrPreset, msgGravarPreset,
    urlServico, semPrefixo
};
