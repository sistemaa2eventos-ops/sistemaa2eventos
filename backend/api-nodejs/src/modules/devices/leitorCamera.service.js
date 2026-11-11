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
    if (/^rtsps?:\/\//i.test(d.rtsp_url || '')) return d.rtsp_url; // informado no cadastro do leitor
    const usuario = d.user_device || 'admin';
    const senha = d.password_device || '';
    const auth = `${encodeURIComponent(usuario)}${senha ? `:${encodeURIComponent(senha)}` : ''}@`;
    const marca = String(d.marca || '').toLowerCase();
    const caminho = marca.includes('hik')
        ? '/Streaming/Channels/101'
        : '/cam/realmonitor?channel=1&subtype=0'; // Intelbras/Dahua
    return `rtsp://${auth}${d.ip_address}:554${caminho}`;
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
        porta: 554,
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
