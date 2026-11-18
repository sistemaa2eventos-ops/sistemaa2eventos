'use strict';

const { supabase } = require('../../config/supabase');
const logger = require('../../services/logger');

/**
 * "Usar também como câmera" (config.usar_como_camera do leitor facial): cria/atualiza uma câmera
 * ligada ao leitor (cameras_ip.dispositivo_id) com o RTSP do próprio leitor. A câmera nasce em
 * "Só monitorar" e sem gravação; IA e gravação se escolhem na tela de câmeras, como qualquer outra.
 * Desligar a opção remove a câmera (excluir o leitor também, por ON DELETE CASCADE).
 */
function urlRtsp(d) {
    const cfg = d.config || {};
    const temConfigVideo = Boolean(cfg.canal || cfg.rtsp_porta || cfg.rtsp_caminho);
    if (!temConfigVideo && /^rtsps?:\/\//i.test(d.rtsp_url || '')) return d.rtsp_url;

    const usuario = d.user_device || 'admin';
    const senha = d.password_device || '';
    const auth = `${encodeURIComponent(usuario)}${senha ? `:${encodeURIComponent(senha)}` : ''}@`;
    const marca = String(d.marca || '').toLowerCase();
    const canal = Math.max(1, parseInt(cfg.canal, 10) || 1);
    const rtspPorta = Math.max(1, parseInt(cfg.rtsp_porta, 10) || 554);
    const caminhoCustom = typeof cfg.rtsp_caminho === 'string' ? cfg.rtsp_caminho.trim() : '';
    const caminhoPadrao = marca.includes('hik')
        ? `/Streaming/Channels/${canal * 100 + 1}`
        : `/cam/realmonitor?channel=${canal}&subtype=0`; // Intelbras/Dahua
    const caminho = caminhoCustom
        ? (caminhoCustom.startsWith('/') ? caminhoCustom : `/${caminhoCustom}`)
        : caminhoPadrao;
    return `rtsp://${auth}${d.ip_address}:${rtspPorta}${caminho}`;
}

async function sincronizar(dispositivo) {
    if (!dispositivo?.id || !dispositivo.evento_id) return;
    const usar = dispositivo.config?.usar_como_camera === true;
    const { data: atual, error: erroBusca } = await supabase.from('cameras_ip').select('id')
        .eq('dispositivo_id', dispositivo.id).maybeSingle();
    if (erroBusca) {
        if (/dispositivo_id/.test(erroBusca.message)) logger.warn('[Leitor como câmera] aplique a migration 20261111 no banco');
        return;
    }
    if (!usar) {
        if (atual) {
            await supabase.from('cameras_ip').delete().eq('id', atual.id);
            require('../system/vigilancia.service').eventoAlterado(dispositivo.evento_id).catch(() => {});
        }
        return;
    }
    if (!dispositivo.ip_address) return;
    const conexao = {
        nome: `${dispositivo.nome} (câmera do leitor)`.slice(0, 120),
        ip_address: dispositivo.ip_address,
        porta: Math.max(1, parseInt(dispositivo.config?.rtsp_porta, 10) || 554),
        protocolo: 'rtsp',
        fabricante: String(dispositivo.marca || '').toLowerCase().includes('hik') ? 'Hikvision' : 'Intelbras',
        usuario: dispositivo.user_device || 'admin',
        senha: dispositivo.password_device || null,
        stream_url: urlRtsp(dispositivo),
        area_id: dispositivo.area_id || null
    };
    const { error } = atual
        ? await supabase.from('cameras_ip').update(conexao).eq('id', atual.id)
        : await supabase.from('cameras_ip').insert({
            ...conexao, evento_id: dispositivo.evento_id, dispositivo_id: dispositivo.id,
            status: 'offline', ia_ativa: false, vigilancia_ativa: false, gravacao_modo: 'desligada'
        });
    if (error) {
        logger.warn(`[Leitor como câmera] ${dispositivo.nome}: ${error.message}`);
        return;
    }
    require('../system/vigilancia.service').eventoAlterado(dispositivo.evento_id).catch(() => {});
}

module.exports = { sincronizar, urlRtsp };
