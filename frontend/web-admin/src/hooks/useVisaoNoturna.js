import { useEffect, useState } from 'react';
import { urlMidiaCamera } from '../utils/cameraMedia';

const LADO = 48; // a imagem é reduzida para 48×27: rápido e suficiente para ver se há cor

/**
 * Mede a cor de uma imagem já reduzida (RGBA). Câmera no infravermelho sai em preto e branco: quase
 * nenhuma cor (saturação baixa), mas com brilho (não é só escuridão total).
 */
export function avaliarQuadro(rgba) {
    let saturacao = 0;
    let brilho = 0;
    let n = 0;
    for (let i = 0; i + 2 < rgba.length; i += 4) {
        const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        saturacao += max > 0 ? (max - min) / max : 0;
        brilho += (r + g + b) / 3;
        n++;
    }
    if (!n) return null;
    const sat = saturacao / n;
    const bri = brilho / n;
    return { saturacao: sat, brilho: bri, noturno: sat < 0.06 && bri > 20 };
}

/**
 * Visão noturna: a cada intervalo, lê uma miniatura da câmera e diz se ela está em preto e branco
 * (infravermelho). Devolve null enquanto não sabe. Não depende de nada da câmera: é a imagem que decide.
 */
export default function useVisaoNoturna(cameraId, ativo = true, intervaloMs = 8000) {
    const [estado, setEstado] = useState(null);

    useEffect(() => {
        if (!cameraId || !ativo) { setEstado(null); return undefined; }
        let vivo = true;
        const ler = async () => {
            try {
                const url = await urlMidiaCamera(cameraId, 'snapshot', { qualidade: 'mini', t: Date.now() });
                const img = await new Promise((ok, falha) => {
                    const i = new Image();
                    i.onload = () => ok(i);
                    i.onerror = () => falha(new Error('imagem'));
                    i.src = url;
                });
                const canvas = document.createElement('canvas');
                canvas.width = LADO;
                canvas.height = Math.round(LADO * 9 / 16);
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                const r = avaliarQuadro(ctx.getImageData(0, 0, canvas.width, canvas.height).data);
                if (vivo) setEstado(r);
            } catch {
                if (vivo) setEstado(null); // sem imagem agora: não afirma nada
            }
        };
        ler();
        const t = setInterval(ler, intervaloMs);
        return () => { vivo = false; clearInterval(t); };
    }, [cameraId, ativo, intervaloMs]);

    return estado;
}
