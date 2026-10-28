import { useEffect, useState } from 'react';
import api from '../services/api';

/**
 * Configuração da IA facial e do vídeo (Configurações > IA facial e câmeras), lida uma vez por aba e
 * compartilhada entre Monitor, Video wall e a tela de configuração.
 */
export const IA_CONFIG_PADRAO = {
    perfil: 'equilibrado',
    ajustes: {},
    video: { mini: { fps: 6, max_width: 480, quality: 55 }, foco: { fps: 12, max_width: 1280, quality: 70 } },
    painel: { max_streams_ao_vivo: 9, som_alerta: true, alerta_repetir_s: 30, rastreamento_expira_min: 120 }
};

export const NOMES_PERFIL = { leve: 'Leve', equilibrado: 'Equilibrado', maximo: 'Máximo' };

let cache = null;
let perfisCache = null;
let carregando = null;
const ouvintes = new Set();

const publicar = (cfg, perfis) => {
    cache = cfg;
    if (perfis) perfisCache = perfis;
    ouvintes.forEach(fn => fn({ config: cache, perfis: perfisCache }));
};

export function carregarIaConfig(forcar = false) {
    if (carregando && !forcar) return carregando;
    carregando = api.get('/cameras/ia-config', { hideDefaultError: true, timeout: 8000 })
        .then(({ data }) => {
            publicar(data?.data || IA_CONFIG_PADRAO, data?.perfis);
            return cache;
        })
        .catch(() => {
            publicar(cache || IA_CONFIG_PADRAO);
            carregando = null; // tenta de novo na próxima tela
            return cache;
        });
    return carregando;
}

/** Atualiza todas as telas abertas desta aba depois de salvar */
export const definirIaConfig = (cfg) => publicar(cfg);

export function useIaConfig() {
    const [estado, setEstado] = useState({ config: cache || IA_CONFIG_PADRAO, perfis: perfisCache });
    useEffect(() => {
        ouvintes.add(setEstado);
        if (!cache) carregarIaConfig();
        else setEstado({ config: cache, perfis: perfisCache });
        return () => ouvintes.delete(setEstado);
    }, []);
    return estado;
}

/**
 * Status do motor de IA do evento (GPU/CPU, fps e rostos por câmera), atualizado a cada `intervaloMs`
 * enquanto `ativo` e a aba estiver visível.
 */
export function useIaStatus(ativo = true, intervaloMs = 15000) {
    const [status, setStatus] = useState(null);
    const [erro, setErro] = useState(null);
    useEffect(() => {
        if (!ativo) return undefined;
        let cancelado = false;
        const buscar = async () => {
            if (document.hidden) return;
            try {
                const { data } = await api.get('/cameras/ia-status', { hideDefaultError: true, timeout: 10000 });
                if (cancelado) return;
                setStatus(data?.data || null);
                setErro(null);
            } catch (e) {
                if (cancelado) return;
                setErro(e.response?.data?.error || 'Motor de IA do evento indisponível');
            }
        };
        buscar();
        const timer = setInterval(buscar, intervaloMs);
        const aoVoltar = () => { if (!document.hidden) buscar(); };
        document.addEventListener('visibilitychange', aoVoltar);
        return () => {
            cancelado = true;
            clearInterval(timer);
            document.removeEventListener('visibilitychange', aoVoltar);
        };
    }, [ativo, intervaloMs]);
    return { status, erro };
}

/** Status de uma câmera dentro do status do motor */
export const statusDaCamera = (status, camId) => status?.cameras?.find(c => c.camera_id === camId) || null;
