'use strict';

/**
 * Diagnóstico de uma câmera pelo painel (botão "Diagnosticar"), no mesmo formato do dos leitores:
 * cada item tem estado (ok, alerta, erro, nao_testado), o que foi medido e a correção em linguagem
 * simples. Nunca mostra a senha da câmera (só IP e porta).
 *
 * Ordem: cadastro → PC do evento → retransmissor → rede (ping/porta) → imagem principal → miniatura →
 * IA → gravação. Cada passo usa o caminho de sempre do vídeo (agente do PC do evento ou motor local).
 */

const item = (chave, titulo, estado, detalhe, como_corrigir = null, acao = null) => ({ chave, titulo, estado, detalhe, como_corrigir, acao });
const PORTA_PADRAO = { 'rtsp:': 554, 'rtsps:': 322, 'http:': 80, 'https:': 443 };
const DICA_MODELO = 'Confira usuário, senha e o caminho do vídeo: edite a câmera ou escolha o modelo certo em Configurações > Modelos de câmera.';

/** Webcam USB do PC do evento ("webcam", "usb:0") ou OBS local: não tem rede para testar */
const ehWebcam = (url) => /^(webcam|usb)\b/i.test(String(url || '').trim()) || /^\d+$/.test(String(url || '').trim())
    || /^rtsps?:\/\/(?:[^@/]+@)?(127\.0\.0\.1|localhost)[:/]/i.test(String(url || ''));

/** Host, porta e se tem usuário, a partir da URL (rtsp:// ou http://). Nunca devolve a senha. */
function enderecoDaUrl(url) {
    try {
        const u = new URL(String(url || '').trim());
        if (!PORTA_PADRAO[u.protocol] || !u.hostname) return null;
        return { host: u.hostname.replace(/^\[|\]$/g, ''), porta: Number(u.port) || PORTA_PADRAO[u.protocol], protocolo: u.protocol.replace(':', ''), temUsuario: !!u.username };
    } catch {
        return null;
    }
}

const kb = (base64) => Math.round((String(base64 || '').length * 3) / 4 / 1024);

/**
 * @param {object} cam linha de cameras_ip (com stream_url e senha)
 * @param {object} deps { rota, rtsp, videoLocal, agentService, chamarIa, buscarImagemHttp, redeTeste }
 */
async function diagnosticarCamera(cam, deps) {
    const { rota, rtsp, videoLocal, agentService, chamarIa, buscarImagemHttp, redeTeste } = deps;
    const itens = [];
    const url = rtsp ? cam.stream_url : (cam.snapshot_url || cam.stream_url);
    const webcam = rtsp && ehWebcam(cam.stream_url);
    const end = webcam ? null : enderecoDaUrl(url);

    // 1. Cadastro
    if (cam.status === 'desativada' || cam.status === 'inativa') {
        itens.push(item('cadastro', 'Cadastro da câmera', 'alerta', 'Câmera desativada: não aparece no monitor nem grava.', 'Edite a câmera e ative-a.', 'editar'));
    } else if (!url) {
        itens.push(item('cadastro', 'Cadastro da câmera', 'erro', 'Sem endereço de vídeo.', 'Edite a câmera e preencha o IP, a porta e o modelo.', 'editar'));
    } else if (webcam) {
        itens.push(item('cadastro', 'Cadastro da câmera', 'ok', 'Webcam / OBS do PC do evento'));
    } else if (!end) {
        itens.push(item('cadastro', 'Cadastro da câmera', 'erro', 'O endereço do vídeo está em formato inválido.', 'Edite a câmera e escolha o modelo; o endereço é montado sozinho.', 'editar'));
    } else if (!end.temUsuario && !cam.usuario) {
        itens.push(item('cadastro', 'Cadastro da câmera', 'alerta', `${end.host}:${end.porta} sem usuário e senha`, 'Quase toda câmera exige login. Edite a câmera e preencha usuário e senha.', 'editar'));
    } else {
        itens.push(item('cadastro', 'Cadastro da câmera', 'ok', `${end.protocolo.toUpperCase()} ${end.host}:${end.porta}`));
    }

    // 2. PC do evento (na nuvem, a câmera só é alcançada por ele)
    if (!rota) {
        itens.push(item('agente', 'PC do evento', 'erro', 'Nenhum PC do evento conectado: a nuvem não alcança a câmera.',
            'No PC do evento, rode ligar-ia-facial.bat e confira a internet do PC.'));
    } else if (rota.tipo === 'agente') {
        itens.push(item('agente', 'PC do evento', 'ok', 'Agente conectado'));
    } else {
        itens.push(item('agente', 'PC do evento', 'ok', 'Servidor do evento (rede local)'));
    }

    // 3. Retransmissor de vídeo do PC do evento (go2rtc)
    if (rtsp && rota?.tipo === 'agente') {
        const rec = agentService.recursos(rota.agentId);
        if (!rec.video_local) {
            itens.push(item('retransmissor', 'Retransmissor de vídeo', 'alerta', 'Não instalado no PC do evento: o vídeo depende do motor de IA.',
                'No PC do evento, rode ligar-ia-facial.bat (instala o retransmissor).'));
        } else if (!rec.ffmpeg) {
            itens.push(item('retransmissor', 'Retransmissor de vídeo', 'alerta', 'Sem ffmpeg: não há fotos da câmera nem gravação.', 'No PC do evento, rode ligar-ia-facial.bat (baixa o ffmpeg).'));
        } else {
            itens.push(item('retransmissor', 'Retransmissor de vídeo', 'ok', 'Instalado'));
        }
    }

    // 4. Rede: a câmera responde? A porta do vídeo abre?
    let redeOk = null; // null = não testado
    if (end && rota) {
        try {
            const portas = end.porta === 80 ? [80] : [end.porta, 80];
            const r = await redeTeste.testar({ eventoId: cam.evento_id, agentId: rota.tipo === 'agente' ? rota.agentId : null, host: end.host, portas, timeoutMs: 2500 });
            const video = (r.portas || []).find(p => p.porta === end.porta);
            const web = (r.portas || []).find(p => p.porta === 80);
            if (video?.aberta) {
                redeOk = true;
                itens.push(item('rede', 'Rede até a câmera', video.ms > 300 ? 'alerta' : 'ok', `Porta ${end.porta} aberta em ${video.ms} ms${r.ping?.ok ? ` · ping ${r.ping.ms ?? '<1'} ms` : ''}`,
                    video.ms > 300 ? 'Rede lenta até a câmera: confira cabo, switch e Wi-Fi.' : null));
            } else if (r.ping?.ok || web?.aberta) {
                redeOk = false;
                itens.push(item('rede', 'Rede até a câmera', 'erro', `A câmera responde, mas a porta ${end.porta} do vídeo está ${video?.erro === 'recusada' ? 'fechada' : 'sem resposta'}.`,
                    `Ative o ${end.protocolo.toUpperCase()} no menu da câmera ou corrija a porta na câmera do painel (o modelo define a porta).`, 'editar'));
            } else {
                redeOk = false;
                itens.push(item('rede', 'Rede até a câmera', 'erro', `${end.host} não responde na rede do evento${r.resolvido === false ? ' (nome não encontrado)' : ''}.`,
                    'Confira se a câmera está ligada e no mesmo switch/roteador do PC do evento, e se o IP não mudou (reserve o IP no roteador). Use a ferramenta de rede para procurar.'));
            }
        } catch (err) {
            itens.push(item('rede', 'Rede até a câmera', 'nao_testado', err.message));
        }
    }

    // 5. Imagem do vídeo principal
    let imagemOk = false;
    const semImagem = (motivo) => item('imagem', 'Imagem da câmera', 'erro', `Sem imagem: ${motivo}`,
        redeOk ? `A porta abre, mas não vem imagem. ${DICA_MODELO}` : 'Corrija primeiro a rede até a câmera.', redeOk ? 'editar' : null);
    if (!rota || !url) {
        itens.push(item('imagem', 'Imagem da câmera', 'nao_testado', 'Sem caminho até a câmera.'));
    } else if (rtsp && videoLocal) {
        const t0 = Date.now();
        try {
            const r = await agentService.sendCommand(rota.agentId, 'snapshot_local', { camera_id: cam.id, qualidade: 'foco' }, 14000);
            imagemOk = true;
            const ms = Date.now() - t0;
            itens.push(item('imagem', 'Imagem da câmera', ms > 5000 ? 'alerta' : 'ok', `Imagem recebida em ${ms} ms (${kb(r.base64)} KB)`,
                ms > 5000 ? 'Imagem lenta: confira a rede da câmera ou baixe a resolução do vídeo principal no menu da câmera.' : null));
        } catch (err) {
            if (/não está no retransmissor/i.test(err.message)) {
                itens.push(item('imagem', 'Imagem da câmera', 'alerta', 'A câmera ainda não entrou no retransmissor do PC do evento.',
                    'Câmera recém-salva entra em até 1 minuto. Se continuar, confira se o PC do evento é o deste evento.'));
            } else {
                itens.push(semImagem(err.message));
            }
        }
    } else if (rtsp) {
        try {
            const { data } = await chamarIa(rota, '/api/camera/test', { stream_url: cam.stream_url, camera_id: cam.id }, { timeout: 10000 });
            if (data?.online) {
                imagemOk = true;
                itens.push(item('imagem', 'Imagem da câmera', 'ok', 'O motor de IA recebe o vídeo'));
            } else {
                itens.push(semImagem('o motor de IA não recebe o vídeo'));
            }
        } catch (err) {
            itens.push(err.iaOffline
                ? item('imagem', 'Imagem da câmera', 'nao_testado', 'Motor de IA desligado e sem retransmissor: não há como abrir o vídeo.', 'No PC do evento, rode ligar-ia-facial.bat.')
                : semImagem(err.message));
        }
    } else {
        const t0 = Date.now();
        try {
            const r = await buscarImagemHttp(cam, rota, 5000);
            imagemOk = true;
            itens.push(item('imagem', 'Imagem da câmera', 'ok', `Foto recebida em ${Date.now() - t0} ms (${Math.round((r.data?.length || 0) / 1024)} KB)`));
        } catch (err) {
            itens.push(semImagem(/401/.test(err.message) ? 'a câmera recusou usuário/senha' : err.message));
        }
    }

    // 6. Miniatura (sub-stream): a grade do monitor e a IA usam este vídeo mais leve
    if (rtsp && videoLocal && imagemOk && !webcam) {
        try {
            const r = await agentService.sendCommand(rota.agentId, 'snapshot_local', { camera_id: cam.id, qualidade: 'mini' }, 12000);
            itens.push(item('miniatura', 'Vídeo leve (miniatura)', 'ok', `Recebido (${kb(r.base64)} KB)${cam.url_substream ? '' : ' · endereço montado pelo modelo'}`));
        } catch (err) {
            itens.push(item('miniatura', 'Vídeo leve (miniatura)', 'alerta', `Não abre: ${err.message}. A grade do monitor e a IA usam o vídeo principal (mais pesado).`,
                'Edite a câmera e preencha o endereço do sub-stream, ou corrija o modelo em Configurações > Modelos de câmera.', 'editar'));
        }
    }

    // 7. IA facial desta câmera
    if (rtsp && cam.ia_ativa === true && rota) {
        try {
            const { data: st } = await chamarIa(rota, '/api/engine/status', {}, { timeout: 6000 });
            const c = (st?.cameras || []).find(x => String(x.camera_id) === String(cam.id));
            const rostosEvento = st?.rostos_por_evento?.[cam.evento_id];
            if (!c) {
                itens.push(item('ia', 'IA facial', 'alerta', 'O motor de IA ainda não recebeu esta câmera.', 'Aguarde 1 minuto após salvar. Se continuar, confira o modo de IA do evento (barra de câmeras).'));
            } else if (!c.conectada) {
                itens.push(item('ia', 'IA facial', 'erro', `O motor não recebe o vídeo (${c.reconexoes || 0} reconexões).`, imagemOk ? 'O vídeo abre no retransmissor: reinicie o motor pelo painel (Motor de IA do evento).' : 'Corrija primeiro a imagem da câmera.'));
            } else if (rostosEvento === 0) {
                itens.push(item('ia', 'IA facial', 'alerta', `Vídeo a ${c.video_fps} fps, mas nenhum rosto deste evento no motor: ninguém será reconhecido.`, 'Confira se as pessoas do evento têm foto aprovada.'));
            } else {
                itens.push(item('ia', 'IA facial', 'ok', `Vídeo a ${c.video_fps} fps · ${c.ia_analisando ? `analisando (${c.ia_ms} ms por análise)` : 'aguardando movimento'}${rostosEvento ? ` · ${rostosEvento} rostos do evento` : ''}`));
            }
        } catch (err) {
            itens.push(item('ia', 'IA facial', 'alerta', err.iaOffline || /desligado/i.test(err.message) ? 'Motor de IA desligado ou fora do ar.' : `Não deu para ler o motor: ${err.message}`,
                'Ligue o "Motor de IA do evento" na barra de câmeras, ou desligue a IA desta câmera se não for usar.'));
        }
    }

    // 8. Gravação no PC do evento
    if (rtsp && rota?.tipo === 'agente' && cam.gravacao_modo && cam.gravacao_modo !== 'desligada') {
        try {
            const st = await agentService.sendCommand(rota.agentId, 'gravacao_status', {}, 8000);
            const g = (st?.cameras || []).find(x => String(x.id) === String(cam.id));
            const livreGb = st?.livre_bytes ? st.livre_bytes / 1024 ** 3 : null;
            if (st?.ativa === false) {
                itens.push(item('gravacao', 'Gravação', 'alerta', 'Gravação desligada no evento.', 'Ligue a gravação nas chaves do evento (barra de câmeras).'));
            } else if (g?.erro) {
                itens.push(item('gravacao', 'Gravação', 'erro', `Falha ao gravar: ${g.erro}`, imagemOk ? 'Confira o espaço em disco do PC do evento.' : 'Corrija primeiro a imagem da câmera.'));
            } else if (cam.gravacao_modo === 'continua' && !g?.gravando) {
                itens.push(item('gravacao', 'Gravação', 'alerta', 'Modo contínuo, mas não está gravando agora.', 'Aguarde 1 minuto; se continuar, rode ligar-ia-facial.bat no PC do evento.'));
            } else {
                itens.push(item('gravacao', 'Gravação', livreGb !== null && livreGb < 10 ? 'alerta' : 'ok',
                    `${cam.gravacao_modo === 'continua' ? 'Gravando sem parar' : 'Grava nos alertas'}${livreGb !== null ? ` · ${livreGb.toFixed(0)} GB livres no PC` : ''}`,
                    livreGb !== null && livreGb < 10 ? 'Pouco espaço: as gravações mais antigas serão apagadas antes do prazo.' : null));
            }
        } catch (err) {
            itens.push(item('gravacao', 'Gravação', 'nao_testado', `Não deu para ler: ${err.message}`));
        }
    }

    // 9. Giro (ONVIF): só quando a câmera tem giro ligado
    if (cam.ptz_ativo && deps.verificarGiro) {
        try {
            await deps.verificarGiro();
            itens.push(item('giro', 'Giro da câmera (ONVIF)', 'ok', 'O serviço de giro responde'));
        } catch (err) {
            itens.push(item('giro', 'Giro da câmera (ONVIF)', 'erro', err.message,
                'Confira a porta ONVIF (2020 nas Mercusys/Tapo), o ONVIF ligado na câmera e a conta da câmera (usuário e senha).', 'editar'));
        }
    }

    const erros = itens.filter(i => i.estado === 'erro').length;
    const alertas = itens.filter(i => i.estado === 'alerta').length;
    const resumo = erros ? `${erros} problema(s) a corrigir` : alertas ? `${alertas} ponto(s) de atenção` : 'Tudo certo';
    return { resumo, itens, em: new Date().toISOString() };
}

module.exports = { diagnosticarCamera, enderecoDaUrl, ehWebcam };
