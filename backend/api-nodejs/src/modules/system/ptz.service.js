'use strict';

/**
 * Giro da câmera (PTZ) pelo ONVIF: conecta uma vez por câmera (endereço do serviço e perfil de vídeo,
 * guardados por 10 min) e depois só envia a ação. O envio (direto ou pelo agente do PC do evento) entra
 * como função: este módulo não sabe por onde a mensagem sai.
 */
const onvif = require('../../services/onvif');

const CACHE_MS = 10 * 60 * 1000;
const conexoes = new Map(); // camId → { servicos, token, ate }

const erroHttp = (status, msg) => Object.assign(new Error(msg), { status });

/** Resposta da câmera: lança erro legível se for Fault (senha, comando recusado...) */
function verificar(xml) {
    const f = onvif.falha(xml);
    if (!f) return xml;
    if (/NotAuthorized|not authorized|unauthori/i.test(f.motivo)) throw erroHttp(401, 'A câmera recusou o usuário e a senha (use a conta da câmera, criada no aplicativo).');
    throw erroHttp(422, `A câmera recusou o comando: ${f.motivo}`);
}

/**
 * @param cam linha de cameras_ip (com usuario, senha, ip_address, ptz_porta)
 * @param enviar async (url, xml) => texto da resposta
 */
async function conectar(cam, enviar) {
    const porta = Number(cam.ptz_porta) || 2020;
    const chave = `${cam.id}:${cam.ip_address}:${porta}`;
    const em = conexoes.get(chave);
    if (em && Date.now() < em.ate) return em;
    if (!cam.ip_address) throw erroHttp(422, 'Câmera sem IP cadastrado.');
    const cred = { usuario: cam.usuario, senha: cam.senha };

    const xmlServ = verificar(await enviar(onvif.urlServico(cam.ip_address, porta, '/onvif/device_service'), onvif.envelope(onvif.msgServicos(), cred)));
    const serv = onvif.extrairServicos(xmlServ);
    if (!serv.ptz) throw erroHttp(422, 'A câmera não tem o serviço de giro (ONVIF PTZ). Confira se o ONVIF está ligado na câmera.');
    if (!serv.midia) throw erroHttp(422, 'A câmera não informou o serviço de vídeo (ONVIF).');
    // Usa só o caminho do endereço que a câmera informou: o IP e a porta são os cadastrados
    const caminho = (u) => new URL(u).pathname;
    const ptzUrl = onvif.urlServico(cam.ip_address, porta, caminho(serv.ptz));
    const midiaUrl = onvif.urlServico(cam.ip_address, porta, caminho(serv.midia));

    const xmlPerfis = verificar(await enviar(midiaUrl, onvif.envelope(onvif.msgPerfis(), cred)));
    const token = onvif.extrairTokenPerfil(xmlPerfis);
    if (!token) throw erroHttp(422, 'A câmera não informou o perfil de vídeo (ONVIF).');

    const conexao = { ptzUrl, token, cred, ate: Date.now() + CACHE_MS };
    conexoes.set(chave, conexao);
    return conexao;
}

/**
 * Ações: { acao: 'mover', pan, tilt, zoom } | { acao: 'parar' } | { acao: 'listar' } |
 *        { acao: 'ir', token } | { acao: 'gravar', nome }
 */
async function executar(cam, enviar, pedido = {}) {
    let c;
    try {
        c = await conectar(cam, enviar);
    } catch (err) {
        // Conexão guardada pode ter ficado velha (câmera reiniciou): tenta de novo uma vez
        conexoes.delete(`${cam.id}:${cam.ip_address}:${Number(cam.ptz_porta) || 2020}`);
        if (err.status || !err.message) throw err;
        throw erroHttp(502, `Sem resposta da câmera: ${err.message}`);
    }
    const envia = (xml) => enviar(c.ptzUrl, onvif.envelope(xml, c.cred)).then(verificar);
    switch (pedido.acao) {
        case 'mover':
            await envia(onvif.msgMover(c.token, pedido));
            return { ok: true, tempo_limite_s: onvif.TIMEOUT_MOVIMENTO_S };
        case 'parar':
            await envia(onvif.msgParar(c.token));
            return { ok: true };
        case 'listar': {
            const xml = await envia(onvif.msgListarPresets(c.token));
            return { presets: onvif.extrairPresets(xml) };
        }
        case 'ir':
            if (!pedido.token) throw erroHttp(400, 'Escolha a posição.');
            await envia(onvif.msgIrPreset(c.token, String(pedido.token)));
            return { ok: true };
        case 'gravar': {
            const xml = await envia(onvif.msgGravarPreset(c.token, pedido.nome));
            return { ok: true, token: onvif.extrairTokenPreset(xml) };
        }
        default:
            throw erroHttp(400, 'Ação de giro desconhecida.');
    }
}

/** Diagnóstico: o serviço de giro responde? (usado pelo "Diagnosticar" da câmera) */
async function verificarGiro(cam, enviar) {
    await conectar(cam, enviar);
    return { ok: true };
}

module.exports = { executar, verificarGiro, conectar, _conexoes: conexoes };
