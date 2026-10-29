/**
 * Versão nova do painel publicada com abas abertas (quiosques, tablets):
 * os pedaços de código antigos deixam de existir no servidor e a próxima tela
 * aberta quebrava. Aqui a aba recarrega sozinha — uma vez — e sem interromper
 * um atendimento em andamento.
 */

const CHAVE_RECARGA = 'nzt_recarga_versao_em';
const OCIOSO_MS = 60 * 1000;
const VERIFICAR_VERSAO_MS = 30 * 60 * 1000;

/** Recarrega no máximo 1x a cada 30 s (evita laço se o problema for outro). */
export const recarregarUmaVez = () => {
  try {
    const ultima = Number(sessionStorage.getItem(CHAVE_RECARGA) || 0);
    if (Date.now() - ultima < 30000) return false;
    sessionStorage.setItem(CHAVE_RECARGA, String(Date.now()));
  } catch (_) { /* storage bloqueado: recarrega mesmo assim */ }
  window.location.reload();
  return true;
};

export const ehErroDeVersao = (error) => /dynamically imported module|Importing a module script failed|error loading dynamically imported|ChunkLoadError|Loading chunk/i
  .test(String(error?.message || error || ''));

let ultimaInteracao = Date.now();

/** Recarrega quando a aba ficar oculta ou o operador parar de mexer por 1 min. */
const recarregarQuandoOcioso = () => {
  const tentar = () => {
    if (document.hidden || Date.now() - ultimaInteracao > OCIOSO_MS) recarregarUmaVez();
  };
  document.addEventListener('visibilitychange', tentar);
  setInterval(tentar, 15000);
};

export const iniciarAtualizacaoAutomatica = () => {
  ['keydown', 'pointerdown', 'touchstart'].forEach((evento) =>
    window.addEventListener(evento, () => { ultimaInteracao = Date.now(); }, { passive: true, capture: true }));

  // Arquivo da versão antiga sumiu do servidor ao trocar de tela
  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault();
    recarregarUmaVez();
  });
  window.addEventListener('unhandledrejection', (event) => {
    if (ehErroDeVersao(event.reason)) recarregarUmaVez();
  });
};

/** Chamado depois de registrar o service worker. */
export const acompanharServiceWorker = (registro) => {
  if (!registro || !('serviceWorker' in navigator)) return;
  const tinhaControle = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Primeira instalação não é versão nova
    if (tinhaControle) recarregarQuandoOcioso();
  });
  setInterval(() => registro.update().catch(() => {}), VERIFICAR_VERSAO_MS);
};
