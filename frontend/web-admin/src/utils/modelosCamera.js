import { useEffect, useState } from 'react';
import api from '../services/api';

/**
 * Modelos de câmera (Configurações > Modelos de câmera): padrão de endereço RTSP por fabricante.
 * Marcadores: {auth} → "usuario:senha@", {ip}, {porta}, {canal}.
 */

/** Tipo especial: webcam do PC do evento ou OBS (não é um modelo do banco) */
export const WEBCAM_OBS = 'RTSP / OBS / Webcam';

/** Reserva se a API não responder (mesmos modelos de fábrica da migration) */
export const MODELOS_RESERVA = [
    { nome: 'Mercusys / Tapo', porta_padrao: 554, rtsp_principal: 'rtsp://{auth}{ip}:{porta}/stream1', rtsp_sub: 'rtsp://{auth}{ip}:{porta}/stream2' },
    { nome: 'Intelbras', porta_padrao: 554, rtsp_principal: 'rtsp://{auth}{ip}:{porta}/cam/realmonitor?channel={canal}&subtype=0', rtsp_sub: 'rtsp://{auth}{ip}:{porta}/cam/realmonitor?channel={canal}&subtype=1' },
    { nome: 'Dahua', porta_padrao: 554, rtsp_principal: 'rtsp://{auth}{ip}:{porta}/cam/realmonitor?channel={canal}&subtype=0', rtsp_sub: 'rtsp://{auth}{ip}:{porta}/cam/realmonitor?channel={canal}&subtype=1' },
    { nome: 'Hikvision', porta_padrao: 554, rtsp_principal: 'rtsp://{auth}{ip}:{porta}/Streaming/Channels/{canal}01', rtsp_sub: 'rtsp://{auth}{ip}:{porta}/Streaming/Channels/{canal}02' },
    { nome: 'Genérica', porta_padrao: 554, rtsp_principal: null, rtsp_sub: null }
];

/**
 * Monta o endereço a partir do padrão do modelo. Usuário e senha vão codificados (caracteres como @ e :
 * na senha não quebram o endereço). Devolve null se o modelo não tem padrão (Genérica).
 */
export function montarEnderecoRtsp(padrao, { usuario, senha, ip, porta, canal } = {}) {
    if (!padrao || !ip) return null;
    // Como antes: usuário e senha só entram juntos no endereço
    const auth = usuario && senha ? `${encodeURIComponent(usuario)}:${encodeURIComponent(senha)}@` : '';
    const valores = { auth, ip: String(ip).trim(), porta: String(porta || 554), canal: String(canal || 1) };
    return padrao.replace(/\{(auth|ip|porta|canal)\}/g, (_, chave) => valores[chave]);
}

/** Mesmo endereço com a senha escondida, para mostrar na tela */
export const esconderSenha = (url) => (url ? url.replace(/(\/\/[^:/@]+:)[^@]*@/, '$1****@') : url);

/** Lista de modelos ativos (com reserva local se a API falhar) */
export function useModelosCamera(ativo = true) {
    const [modelos, setModelos] = useState(MODELOS_RESERVA);
    useEffect(() => {
        if (!ativo) return undefined;
        let cancelado = false;
        api.get('/modelos-camera', { hideDefaultError: true })
            .then(({ data }) => { if (!cancelado && Array.isArray(data?.modelos) && data.modelos.length) setModelos(data.modelos); })
            .catch(() => { /* fica a reserva */ });
        return () => { cancelado = true; };
    }, [ativo]);
    return modelos;
}
