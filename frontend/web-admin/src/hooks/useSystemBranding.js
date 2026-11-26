import { useState, useEffect } from 'react';
import api from '../services/api';

const STORAGE_KEY = 'nzt_system_branding';
const EVENT_NAME = 'system-branding-updated';
const PADRAO = {
    system_name: 'NZT Eventos',
    logo_url: '',
    emblem_url: '',
    pwa_icon_general_url: '',
    pwa_icon_producao_url: '',
    pwa_icon_monitoramento_url: '',
    audio_feedback_enabled: true,
    performance_mode_enabled: false,
    offline_cache_enabled: true
};

let buscaEmAndamento = null;
let buscadoNestaSessao = false;

function lerCacheLocal() {
    try {
        const salvo = localStorage.getItem(STORAGE_KEY);
        if (!salvo) return PADRAO;
        const parsed = JSON.parse(salvo);
        return {
            system_name: String(parsed?.system_name || PADRAO.system_name).trim() || PADRAO.system_name,
            logo_url: String(parsed?.logo_url || '').trim(),
            emblem_url: String(parsed?.emblem_url || '').trim(),
            pwa_icon_general_url: String(parsed?.pwa_icon_general_url || '').trim(),
            pwa_icon_producao_url: String(parsed?.pwa_icon_producao_url || '').trim(),
            pwa_icon_monitoramento_url: String(parsed?.pwa_icon_monitoramento_url || '').trim(),
            audio_feedback_enabled: parsed?.audio_feedback_enabled !== false,
            performance_mode_enabled: Boolean(parsed?.performance_mode_enabled),
            offline_cache_enabled: parsed?.offline_cache_enabled !== false
        };
    } catch {
        return PADRAO;
    }
}

function aplicarTituloDocumento(nome) {
    if (typeof document === 'undefined') return;
    const base = String(nome || PADRAO.system_name).trim() || PADRAO.system_name;
    document.title = `${base} — Painel Operacional`;
}

function aplicarFavicon(url) {
    if (typeof document === 'undefined') return;
    if (!url) return;
    try {
        const links = document.querySelectorAll("link[rel*='icon']");
        links.forEach(l => { l.href = url; });
    } catch { /* ignora erro de DOM */ }
}

function aplicarModoPerformance(ativo) {
    if (typeof document === 'undefined') return;
    try {
        if (ativo) {
            document.documentElement.setAttribute('data-performance-mode', 'true');
        } else {
            document.documentElement.removeAttribute('data-performance-mode');
        }
    } catch { /* ignora */ }
}

export function notificarBrandingAtualizado(parcial = {}) {
    const atual = lerCacheLocal();
    const proximo = {
        system_name: parcial.system_name !== undefined
            ? (String(parcial.system_name || '').trim() || PADRAO.system_name)
            : atual.system_name,
        logo_url: parcial.logo_url !== undefined
            ? String(parcial.logo_url || '').trim()
            : atual.logo_url,
        emblem_url: parcial.emblem_url !== undefined
            ? String(parcial.emblem_url || '').trim()
            : atual.emblem_url,
        pwa_icon_general_url: parcial.pwa_icon_general_url !== undefined
            ? String(parcial.pwa_icon_general_url || '').trim()
            : atual.pwa_icon_general_url,
        pwa_icon_producao_url: parcial.pwa_icon_producao_url !== undefined
            ? String(parcial.pwa_icon_producao_url || '').trim()
            : atual.pwa_icon_producao_url,
        pwa_icon_monitoramento_url: parcial.pwa_icon_monitoramento_url !== undefined
            ? String(parcial.pwa_icon_monitoramento_url || '').trim()
            : atual.pwa_icon_monitoramento_url,
        audio_feedback_enabled: parcial.audio_feedback_enabled !== undefined
            ? Boolean(parcial.audio_feedback_enabled)
            : atual.audio_feedback_enabled,
        performance_mode_enabled: parcial.performance_mode_enabled !== undefined
            ? Boolean(parcial.performance_mode_enabled)
            : atual.performance_mode_enabled,
        offline_cache_enabled: parcial.offline_cache_enabled !== undefined
            ? Boolean(parcial.offline_cache_enabled)
            : atual.offline_cache_enabled
    };
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(proximo));
    } catch { /* storage indisponível */ }
    aplicarTituloDocumento(proximo.system_name);
    if (proximo.emblem_url) aplicarFavicon(proximo.emblem_url);
    aplicarModoPerformance(proximo.performance_mode_enabled);
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: proximo }));
}

export function useSystemBranding() {
    const [branding, setBranding] = useState(lerCacheLocal);

    useEffect(() => {
        let montado = true;
        aplicarTituloDocumento(branding.system_name);
        if (branding.emblem_url) aplicarFavicon(branding.emblem_url);
        aplicarModoPerformance(branding.performance_mode_enabled);

        const aoAtualizar = (ev) => {
            if (!montado) return;
            setBranding(ev?.detail || lerCacheLocal());
        };
        window.addEventListener(EVENT_NAME, aoAtualizar);

        if (!buscadoNestaSessao) {
            if (!buscaEmAndamento) {
                buscaEmAndamento = api.get('/public/branding', { hideDefaultError: true })
                    .then((res) => {
                        const dados = res.data?.data;
                        buscadoNestaSessao = true;
                        if (dados) notificarBrandingAtualizado(dados);
                    })
                    .catch(() => { /* mantém cache local */ })
                    .finally(() => { buscaEmAndamento = null; });
            }
        }

        return () => {
            montado = false;
            window.removeEventListener(EVENT_NAME, aoAtualizar);
        };
    }, []);

    return branding;
}
