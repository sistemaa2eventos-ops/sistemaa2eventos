/**
 * Regras puras do editor de etiquetas: camadas (z-index), grupos, seleção por área,
 * escala e alinhamento entre elementos. Nada aqui mexe em estado do React.
 */

export const Z_BASE = 10; // camadas começam em 10 (o fundo antigo usa 1)

/** Lista do fundo para a frente. */
export const ordenarPorCamada = (elements) =>
    [...elements].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));

/** Reescreve os z-index em sequência (10, 11, 12...) mantendo a ordem atual. */
export const normalizarCamadas = (elements) => {
    const ordem = ordenarPorCamada(elements);
    const zPorId = new Map(ordem.map((el, i) => [el.id, Z_BASE + i]));
    return elements.map(el => ({ ...el, zIndex: zPorId.get(el.id) }));
};

/** Se algum membro de um grupo estiver na lista, inclui o grupo inteiro. */
export const expandirGrupos = (ids, elements) => {
    const grupos = new Set(elements.filter(el => ids.includes(el.id) && el.groupId).map(el => el.groupId));
    if (grupos.size === 0) return [...new Set(ids)];
    const extra = elements.filter(el => el.groupId && grupos.has(el.groupId)).map(el => el.id);
    return [...new Set([...ids, ...extra])];
};

/**
 * Reordena as camadas dos selecionados.
 * acao: 'frente' | 'tras' | 'avancar' | 'recuar'
 */
export const reordenarCamadas = (elements, ids, acao) => {
    const sel = new Set(ids);
    let ordem = ordenarPorCamada(elements);

    if (acao === 'frente') {
        ordem = [...ordem.filter(el => !sel.has(el.id)), ...ordem.filter(el => sel.has(el.id))];
    } else if (acao === 'tras') {
        ordem = [...ordem.filter(el => sel.has(el.id)), ...ordem.filter(el => !sel.has(el.id))];
    } else if (acao === 'avancar') {
        for (let i = ordem.length - 2; i >= 0; i--) {
            if (sel.has(ordem[i].id) && !sel.has(ordem[i + 1].id)) {
                [ordem[i], ordem[i + 1]] = [ordem[i + 1], ordem[i]];
            }
        }
    } else if (acao === 'recuar') {
        for (let i = 1; i < ordem.length; i++) {
            if (sel.has(ordem[i].id) && !sel.has(ordem[i - 1].id)) {
                [ordem[i], ordem[i - 1]] = [ordem[i - 1], ordem[i]];
            }
        }
    }

    const zPorId = new Map(ordem.map((el, i) => [el.id, Z_BASE + i]));
    return elements.map(el => ({ ...el, zIndex: zPorId.get(el.id) }));
};

/** Agrupa: mesmo groupId e camadas encostadas na posição do membro mais à frente. */
export const agruparElementos = (elements, ids) => {
    if (ids.length < 2) return elements;
    const groupId = `g_${Date.now()}`;
    const sel = new Set(ids);
    const ordem = ordenarPorCamada(elements);
    const topo = Math.max(...ordem.map((el, i) => (sel.has(el.id) ? i : -1)));
    const membros = ordem.filter(el => sel.has(el.id));
    const resto = ordem.filter(el => !sel.has(el.id));
    const qtdAbaixo = ordem.slice(0, topo + 1).filter(el => !sel.has(el.id)).length;
    const novaOrdem = [...resto.slice(0, qtdAbaixo), ...membros, ...resto.slice(qtdAbaixo)];
    const zPorId = new Map(novaOrdem.map((el, i) => [el.id, Z_BASE + i]));
    return elements.map(el => ({
        ...el,
        zIndex: zPorId.get(el.id),
        ...(sel.has(el.id) ? { groupId } : {})
    }));
};

export const desagruparElementos = (elements, ids) => {
    const sel = new Set(ids);
    return elements.map(el => {
        if (!sel.has(el.id) || !el.groupId) return el;
        const { groupId: _g, ...resto } = el;
        return resto;
    });
};

/** Caixa que envolve os elementos. */
export const caixaDoGrupo = (lista) => {
    if (!lista.length) return null;
    const x = Math.min(...lista.map(e => e.x));
    const y = Math.min(...lista.map(e => e.y));
    const x2 = Math.max(...lista.map(e => e.x + e.width));
    const y2 = Math.max(...lista.map(e => e.y + e.height));
    return { x, y, width: x2 - x, height: y2 - y };
};

/** Elementos tocados pelo retângulo de seleção (coordenadas da prancheta). */
export const idsNaArea = (elements, area) => {
    const ax2 = area.x + area.width;
    const ay2 = area.y + area.height;
    return elements
        .filter(el => !el.oculto && !el.locked)
        .filter(el => el.x < ax2 && el.x + el.width > area.x && el.y < ay2 && el.y + el.height > area.y)
        .map(el => el.id);
};

/**
 * Escala um item a partir da caixa original do grupo para a nova caixa.
 * Itens com proporção travada (foto, QR) não deformam: usam o menor fator.
 */
export const escalarItem = (item, caixaOrig, caixaNova) => {
    const sx = caixaNova.width / (caixaOrig.width || 1);
    const sy = caixaNova.height / (caixaOrig.height || 1);
    const x = caixaNova.x + (item.x - caixaOrig.x) * sx;
    const y = caixaNova.y + (item.y - caixaOrig.y) * sy;
    let width = item.width * sx;
    let height = item.height * sy;
    if (item.lockAspectRatio && Math.abs(sx - sy) > 0.001) {
        const s = Math.min(sx, sy);
        width = item.width * s;
        height = item.height * s;
    }
    const novo = { x, y, width: Math.max(4, width), height: Math.max(2, height) };
    if (item.type === 'text' && item.fontSize) {
        novo.fontSize = Math.max(4, item.fontSize * Math.min(sx, sy));
    }
    return novo;
};

export const arredondarItem = (el) => ({
    ...el,
    x: Math.round(el.x),
    y: Math.round(el.y),
    width: Math.round(el.width),
    height: Math.round(el.height),
    ...(el.fontSize ? { fontSize: Math.round(el.fontSize * 10) / 10 } : {})
});

/**
 * Alinha os itens entre si (não em relação à prancheta).
 * modo: 'esquerda' | 'centro-h' | 'direita' | 'topo' | 'meio' | 'base' | 'distribuir-h' | 'distribuir-v'
 * Retorna mapa id → { x?, y? }.
 */
export const alinharEntreSi = (lista, modo) => {
    const caixa = caixaDoGrupo(lista);
    if (!caixa) return {};
    const out = {};
    if (modo === 'distribuir-h' || modo === 'distribuir-v') {
        if (lista.length < 3) return {};
        const h = modo === 'distribuir-h';
        const ord = [...lista].sort((a, b) => (h ? a.x - b.x : a.y - b.y));
        const soma = ord.reduce((s, e) => s + (h ? e.width : e.height), 0);
        const espaco = ((h ? caixa.width : caixa.height) - soma) / (ord.length - 1);
        let pos = h ? caixa.x : caixa.y;
        ord.forEach(e => {
            out[e.id] = h ? { x: Math.round(pos) } : { y: Math.round(pos) };
            pos += (h ? e.width : e.height) + espaco;
        });
        return out;
    }
    lista.forEach(e => {
        if (modo === 'esquerda') out[e.id] = { x: caixa.x };
        if (modo === 'direita') out[e.id] = { x: Math.round(caixa.x + caixa.width - e.width) };
        if (modo === 'centro-h') out[e.id] = { x: Math.round(caixa.x + (caixa.width - e.width) / 2) };
        if (modo === 'topo') out[e.id] = { y: caixa.y };
        if (modo === 'base') out[e.id] = { y: Math.round(caixa.y + caixa.height - e.height) };
        if (modo === 'meio') out[e.id] = { y: Math.round(caixa.y + (caixa.height - e.height) / 2) };
    });
    return out;
};

