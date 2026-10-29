/**
 * Tela cheia do navegador sem quebrar onde a API não existe (iPhone/Safari não tem
 * requestFullscreen fora de vídeo: chamar direto lançava erro e a tela travava).
 */

export const estaEmTelaCheia = () =>
    Boolean(document.fullscreenElement || document.webkitFullscreenElement);

export const suportaTelaCheia = () => {
    const el = document.documentElement;
    return Boolean(el.requestFullscreen || el.webkitRequestFullscreen);
};

/** Tenta entrar em tela cheia; devolve true se conseguiu. */
export const entrarTelaCheia = async (el = document.documentElement) => {
    const pedir = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!pedir) return false;
    try {
        await pedir.call(el);
        return true;
    } catch {
        return false;
    }
};

export const sairTelaCheia = async () => {
    if (!estaEmTelaCheia()) return;
    const sair = document.exitFullscreen || document.webkitExitFullscreen;
    try {
        await sair?.call(document);
    } catch {
        /* já saiu */
    }
};

/** Avisa quando o navegador entra/sai de tela cheia (inclusive pelo Esc ou gesto de voltar). */
export const ouvirTelaCheia = (callback) => {
    const aoMudar = () => callback(estaEmTelaCheia());
    document.addEventListener('fullscreenchange', aoMudar);
    document.addEventListener('webkitfullscreenchange', aoMudar);
    return () => {
        document.removeEventListener('fullscreenchange', aoMudar);
        document.removeEventListener('webkitfullscreenchange', aoMudar);
    };
};
