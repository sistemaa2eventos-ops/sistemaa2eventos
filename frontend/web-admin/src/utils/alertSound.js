import { useEffect, useState } from 'react';

/**
 * Som dos alertas de câmera/watchlist. Um único AudioContext para a aba inteira (antes era um novo a
 * cada bipe e o Chrome passa a recusar depois de alguns) e uma preferência de silenciar que vale em
 * todas as telas (Monitor e Video wall).
 */
const CHAVE = 'nzt_som_alertas';
const EVENTO = 'nzt-som-alertas';
let ctx = null;

export const somAtivo = () => {
    try {
        return localStorage.getItem(CHAVE) !== 'off';
    } catch {
        return true;
    }
};

export const definirSomAtivo = (ativo) => {
    try {
        localStorage.setItem(CHAVE, ativo ? 'on' : 'off');
    } catch {
        // armazenamento indisponível: vale só até recarregar
    }
    window.dispatchEvent(new Event(EVENTO));
};

/** [ativo, definir]: estado sincronizado entre os componentes e as abas abertas */
export const useSomAlertas = () => {
    const [ativo, setAtivo] = useState(somAtivo);
    useEffect(() => {
        const atualizar = () => setAtivo(somAtivo());
        window.addEventListener(EVENTO, atualizar);
        window.addEventListener('storage', atualizar);
        return () => {
            window.removeEventListener(EVENTO, atualizar);
            window.removeEventListener('storage', atualizar);
        };
    }, []);
    return [ativo, definirSomAtivo];
};

/**
 * AudioContext único da aba, para qualquer bipe (check-in, checkout, fiscalização...).
 * Criar um por bipe esgotava o limite do navegador (iOS/Chrome) e o som parava no meio do turno.
 * @returns {AudioContext|null}
 */
export function obterAudioContext() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    ctx = ctx || new Ctx();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
}

/**
 * @param {'discreto'|'sirene'} tipo discreto: bipe suave (Monitor) · sirene: video wall
 * @param {boolean} forcar toca mesmo silenciado (botão "Sirene" do alerta)
 */
export function tocarAlerta(tipo = 'discreto', forcar = false) {
    if (!forcar && !somAtivo()) return;
    try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        ctx = ctx || new Ctx();
        if (ctx.state === 'suspended') ctx.resume().catch(() => {});
        const agora = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        if (tipo === 'sirene') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(850, agora);
            osc.frequency.exponentialRampToValueAtTime(420, agora + 0.35);
            gain.gain.setValueAtTime(0.18, agora);
            gain.gain.linearRampToValueAtTime(0.01, agora + 0.35);
        } else {
            osc.type = 'sine';
            osc.frequency.setValueAtTime(659.25, agora); // E5
            osc.frequency.setValueAtTime(880, agora + 0.1); // A5
            gain.gain.setValueAtTime(0.08, agora);
            gain.gain.exponentialRampToValueAtTime(0.001, agora + 0.32);
        }
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(agora + 0.36);
        osc.onended = () => { osc.disconnect(); gain.disconnect(); };
    } catch {
        // áudio desabilitado no navegador
    }
}

/**
 * Mesmo alvo chegando de novo (outra câmera, outra tela): só alerta outra vez depois de `repetirS`.
 * Antes: tocava a cada repetição, ou nunca mais tocava se o alerta fosse dispensado.
 */
export function criarFiltroAlertas() {
    const vistos = new Map(); // chave → ms
    return {
        novo(chave, repetirS = 30) {
            if (!chave) return true;
            const agora = Date.now();
            const ultimo = vistos.get(chave) || 0;
            if (vistos.size > 500) for (const [k, t] of vistos) if (agora - t > repetirS * 1000) vistos.delete(k);
            if (agora - ultimo < repetirS * 1000) return false;
            vistos.set(chave, agora);
            return true;
        },
        esquecer(chave) {
            vistos.delete(chave);
        }
    };
}
