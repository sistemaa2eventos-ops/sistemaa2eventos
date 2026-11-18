import { useEffect, useRef, useState } from 'react';
import { obterUrlFoto } from '../services/fotosPessoa';

/** Foto ainda não salva (captura da câmera ou arquivo local): usa direto, sem assinar. */
const ehLocal = (src) => typeof src === 'string' && /^(data:|blob:)/.test(src);

/**
 * Resolve a foto de uma pessoa para exibição.
 * - Sem pessoaId, sem src, ou foto local: devolve o src como veio.
 * - Com pessoaId e foto guardada: devolve a URL assinada (pedida em lote, ver services/fotosPessoa.js);
 *   se a rota falhar ou devolver null, devolve o src original.
 *   Com preguicoso (padrão), só busca quando o elemento entra na tela (listas longas).
 *
 * Devolve { ref, url }. Ponha `ref` no elemento que ocupa o espaço da foto.
 * Enquanto não há URL, `url` é null e o chamador mostra o fallback (inicial, placeholder).
 */
export default function useFotoPessoa(pessoaId, src, { preguicoso = true } = {}) {
  const ref = useRef(null);
  const assinada = !!pessoaId && !!src && !ehLocal(src);
  const [vistoEm, setVistoEm] = useState(null); // id da pessoa que já entrou na tela
  const [resolvida, setResolvida] = useState({ chave: null, url: null });

  const visivel = !assinada || !preguicoso || vistoEm === pessoaId;

  // Lazy: observa o elemento até ele aparecer na tela (margem de 200 px para já começar a carregar)
  useEffect(() => {
    if (!assinada || visivel) return undefined;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setVistoEm(pessoaId);
      return undefined;
    }
    const io = new IntersectionObserver((entradas) => {
      if (entradas.some((e) => e.isIntersecting)) {
        setVistoEm(pessoaId);
        io.disconnect();
      }
    }, { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, [assinada, visivel, pessoaId]);

  const chave = `${pessoaId}|${src}`;

  useEffect(() => {
    if (!assinada || !visivel) return undefined;
    // Desmontou ou trocou de pessoa/foto: cancela, e o pedido sai da fila do lote
    const controle = new AbortController();
    obterUrlFoto(pessoaId, src, { signal: controle.signal })
      .catch(() => null)
      .then((url) => {
        // Rota falhou ou devolveu null: usa a foto_url original (funciona enquanto o bucket for público)
        if (!controle.signal.aborted) setResolvida({ chave, url: url || src });
      });
    return () => controle.abort();
  }, [assinada, visivel, pessoaId, src, chave]);

  if (!assinada) return { ref, url: src || null };
  return { ref, url: resolvida.chave === chave ? resolvida.url : null };
}
