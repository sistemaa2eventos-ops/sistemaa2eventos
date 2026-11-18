import api from './api';

/**
 * URLs assinadas das fotos de pessoas, pedidas em lote (POST /fotos/urls, até 100 ids).
 * Resposta: { success, data: { urls: { [pessoaId]: url | null }, expira_em_segundos } }.
 *
 * - Pedidos feitos em até ATRASO_LOTE_MS viram uma só chamada; no máximo LOTES_SIMULTANEOS em voo.
 * - Cache por `${pessoaId}|${foto_url}`: foto recapturada (foto_url novo) não reaproveita a URL antiga.
 * - Quem cancela (componente desmontado) sai da espera; pedido sem ninguém esperando não é enviado.
 * - null (sem foto) e erro não entram no cache.
 */
const ATRASO_LOTE_MS = 50;
const MAX_POR_LOTE = 100;
const LOTES_SIMULTANEOS = 2;
const VALIDADE_PADRAO_S = 600;
const MARGEM_S = 60; // renova antes de a URL vencer

const cache = new Map(); // chave -> { url, expira }
const entradas = new Map(); // chave -> { chave, pessoaId, enviada, esperando: Set<{ resolve, reject }> }
let timer = null;
let lotesAtivos = 0;

const chaveDe = (pessoaId, fotoUrl) => `${pessoaId}|${fotoUrl || ''}`;

const finalizar = (entrada, acao) => {
  if (entradas.get(entrada.chave) === entrada) entradas.delete(entrada.chave);
  entrada.esperando.forEach(acao);
  entrada.esperando.clear();
};

const enviarLote = (lote) => {
  lotesAtivos += 1;
  const ids = [...new Set(lote.map((e) => e.pessoaId))];
  api.post('/fotos/urls', { ids }, { hideDefaultError: true })
    .then((resp) => {
      const urls = resp.data?.data?.urls || {};
      const validadeS = Number(resp.data?.data?.expira_em_segundos) || VALIDADE_PADRAO_S;
      const expira = Date.now() + Math.max(30, validadeS - MARGEM_S) * 1000;
      lote.forEach((entrada) => {
        const url = urls[entrada.pessoaId] ?? null;
        if (url) cache.set(entrada.chave, { url, expira });
        finalizar(entrada, (w) => w.resolve(url));
      });
    })
    .catch((erro) => {
      lote.forEach((entrada) => finalizar(entrada, (w) => w.reject(erro)));
    })
    .finally(() => {
      lotesAtivos -= 1;
      enviarPendentes();
    });
};

function enviarPendentes() {
  while (lotesAtivos < LOTES_SIMULTANEOS) {
    const lote = [];
    for (const entrada of entradas.values()) {
      if (entrada.enviada) continue;
      if (!entrada.esperando.size) { entradas.delete(entrada.chave); continue; }
      lote.push(entrada);
      if (lote.length >= MAX_POR_LOTE) break;
    }
    if (!lote.length) return;
    lote.forEach((e) => { e.enviada = true; });
    enviarLote(lote);
  }
}

const agendarEnvio = () => {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    enviarPendentes();
  }, ATRASO_LOTE_MS);
};

/**
 * URL assinada da foto (ou null se a pessoa não tem foto). Rejeita em erro de rede/permissão.
 * @param {string} pessoaId
 * @param {string} fotoUrl foto_url guardado (entra na chave do cache)
 * @param {{ signal?: AbortSignal }} [opcoes] cancelado: resolve null e sai da fila
 */
export function obterUrlFoto(pessoaId, fotoUrl, { signal } = {}) {
  const id = String(pessoaId || '');
  if (!id) return Promise.resolve(null);
  if (signal?.aborted) return Promise.resolve(null);

  const chave = chaveDe(id, fotoUrl);
  const cacheado = cache.get(chave);
  if (cacheado && cacheado.expira > Date.now()) return Promise.resolve(cacheado.url);

  return new Promise((resolve, reject) => {
    let entrada = entradas.get(chave);
    if (!entrada) {
      entrada = { chave, pessoaId: id, enviada: false, esperando: new Set() };
      entradas.set(chave, entrada);
    }
    const espera = { resolve, reject };
    entrada.esperando.add(espera);

    signal?.addEventListener('abort', () => {
      if (!entrada.esperando.delete(espera)) return;
      // Ninguém mais quer esta foto e ela ainda não saiu: tira da fila
      if (!entrada.enviada && !entrada.esperando.size && entradas.get(chave) === entrada) entradas.delete(chave);
      resolve(null);
    }, { once: true });

    if (!entrada.enviada) agendarEnvio();
  });
}

/** Esquece as URLs guardadas (logout e troca de usuário). */
export function limparCacheFotos() {
  cache.clear();
}
