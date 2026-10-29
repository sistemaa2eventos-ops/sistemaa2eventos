import { useEffect, useRef } from 'react';

// Modais abertos, do mais antigo ao mais recente: o "voltar" fecha só o de cima
const pilha = [];
let ignorarVoltas = 0;
let ouvindo = false;

const aoVoltar = () => {
    if (ignorarVoltas > 0) {
        ignorarVoltas -= 1;
        return;
    }
    const topo = pilha.pop();
    if (topo) topo.fechar();
};

/**
 * Faz o botão/gesto "voltar" do celular fechar o modal em vez de sair da página.
 * Com o painel instalado (PWA) não existe barra do navegador, e o voltar do Android
 * levava a pessoa para fora da tela com o modal aberto.
 */
export const useFecharComVoltar = (aberto, fechar) => {
    const fecharRef = useRef(fechar);
    fecharRef.current = fechar;

    useEffect(() => {
        if (!aberto) return undefined;
        const item = { fechar: () => { item.fechadoPeloVoltar = true; fecharRef.current(); }, fechadoPeloVoltar: false };

        // Mesma URL e mesmo estado do roteador (+ marca do modal): só um passo a mais no histórico
        const marca = `${Date.now()}-${Math.random()}`;
        window.history.pushState({ ...(window.history.state || {}), __modalNzt: marca }, '');
        if (!ouvindo) {
            window.addEventListener('popstate', aoVoltar);
            ouvindo = true;
        }
        pilha.push(item);

        return () => {
            const i = pilha.indexOf(item);
            if (i !== -1) pilha.splice(i, 1);
            // Fechou pelo X/botão: desfaz o passo extra sem disparar outro fechamento.
            // Se a página já navegou para outro lugar, não mexe no histórico.
            if (!item.fechadoPeloVoltar && window.history.state?.__modalNzt === marca) {
                ignorarVoltas += 1;
                window.history.back();
            }
        };
    }, [aberto]);
};

export default useFecharComVoltar;
