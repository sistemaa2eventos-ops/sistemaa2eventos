'use strict';

/**
 * Fronteira de armazenamento (fotos e documentos) do backend.
 *
 * As URLs já gravadas no banco são públicas (/storage/v1/object/public/<bucket>/<caminho>) e continuam
 * valendo para escrita e para dados antigos. Para LER um arquivo, o backend usa o service role:
 * - urlAssinada / assinarLinhas / assinarFotos: links temporários (padrão 600 s);
 * - baixarArquivo: bytes do arquivo, para o motor e os terminais (bucket público ou privado).
 *
 * Regras de segurança:
 * - URL só é aceita se o host for o do SUPABASE_URL (URL de outro host não é "nosso" arquivo);
 * - cada uso informa os buckets permitidos (fotos ≠ documentos); fora da lista, nada é assinado/baixado;
 * - caminho com ".." (mesmo codificado várias vezes) é recusado;
 * - mensagens de erro e log não levam o caminho do arquivo (contém CPF): no máximo o bucket.
 */

const { supabase } = require('../config/supabase');
const logger = require('./logger');

const REGEX_STORAGE = /\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/([^?#]+)/;
const SEGUNDOS_PADRAO = 600;
const TIMEOUT_DOWNLOAD_MS = 15000;

const BUCKETS_FOTO = Object.freeze(['selfies', 'avatars', 'fotos-perfil']);
const BUCKETS_DOCUMENTO = Object.freeze(['documentos', 'documentos_operacionais']);

const decodificarUmaVez = (texto) => {
    try { return decodeURIComponent(texto); } catch { return texto; }
};

/** Decodifica até não mudar mais (ex.: %252e%252e → %2e%2e → ..) */
const decodificarTudo = (texto) => {
    let atual = texto;
    for (let i = 0; i < 5; i++) {
        const prox = decodificarUmaVez(atual);
        if (prox === atual) break;
        atual = prox;
    }
    return atual;
};

/** Caminho não vazio, sem barra inicial, sem segmento vazio, sem ".." nem "\" (após decodificar tudo) */
const caminhoValido = (path) => {
    if (!path || path.startsWith('/')) return false;
    const total = decodificarTudo(path);
    if (total.includes('..') || total.includes('\\') || total.includes('\0')) return false;
    return !path.split('/').some(p => p === '');
};

/** Host do projeto Supabase (lido a cada chamada: os testes trocam o ambiente) */
const hostDoProjeto = () => {
    try { return new URL(process.env.SUPABASE_URL || '').host || null; } catch { return null; }
};

const normalizarOpcoes = (opcoes) => (typeof opcoes === 'string' ? { bucketPadrao: opcoes } : (opcoes || {}));

/**
 * Converte URL do storage do projeto, ou "bucket/caminho", em { bucket, path }; null quando não é do storage.
 * @param {string} urlOuCaminho
 * @param {{ bucketPadrao?: string, buckets?: string[] } | string} [opcoes]
 *   bucketPadrao: bucket para caminho puro sem bucket (ex.: 'avatars');
 *   buckets: buckets permitidos (fora da lista → null). String = bucketPadrao (compatibilidade).
 */
function caminhoDeStorage(urlOuCaminho, opcoes = {}) {
    const { bucketPadrao = null, buckets = null } = normalizarOpcoes(opcoes);
    const texto = String(urlOuCaminho ?? '').trim();
    if (!texto || /^data:/i.test(texto)) return null;

    let ref = null;
    if (/^https?:\/\//i.test(texto)) {
        // O parser de URL resolve "%2e%2e" sozinho (selfies/%2e%2e/outro-bucket → outro-bucket):
        // ".." no texto bruto, mesmo codificado, já recusa
        if (decodificarTudo(texto.split(/[?#]/)[0]).includes('..')) return null;
        let url;
        try { url = new URL(texto); } catch { return null; }
        const host = hostDoProjeto();
        if (!host || url.host !== host) return null; // outro host: não é arquivo deste projeto
        const m = url.pathname.match(REGEX_STORAGE);
        if (!m) return null;
        ref = { bucket: decodificarUmaVez(m[1]), path: decodificarUmaVez(m[2]) };
    } else {
        const semBarra = texto.replace(/^\/+/, '');
        if (bucketPadrao) {
            ref = { bucket: bucketPadrao, path: semBarra };
        } else {
            const i = semBarra.indexOf('/');
            if (i <= 0) return null;
            ref = { bucket: semBarra.slice(0, i), path: semBarra.slice(i + 1) };
        }
    }

    if (!ref.bucket || !caminhoValido(ref.path) || !caminhoValido(ref.bucket)) return null;
    if (Array.isArray(buckets) && !buckets.includes(ref.bucket)) return null;
    return ref;
}

/** É URL do storage deste projeto (qualquer bucket)? */
const ehDoNossoStorage = (url) => /^https?:\/\//i.test(String(url || '')) && !!caminhoDeStorage(url);

/**
 * foto_url aceitável na escrita: vazio, data URI de imagem, ou arquivo do nosso storage em bucket de foto.
 * URL de outro host ou de bucket de documentos é recusada.
 */
function fotoUrlAceitavel(valor) {
    return arquivoAceitavel(valor, BUCKETS_FOTO, /^data:image\//i);
}

/**
 * documento_foto aceitável na escrita: vazio, data URI de imagem ou PDF, ou arquivo do nosso storage
 * em bucket de foto ou de documento. Outro host ou bucket → recusa.
 */
function documentoFotoAceitavel(valor) {
    return arquivoAceitavel(valor, [...BUCKETS_FOTO, ...BUCKETS_DOCUMENTO], /^data:(image\/|application\/pdf)/i);
}

function arquivoAceitavel(valor, buckets, dataUriPermitida) {
    if (valor === undefined || valor === null || valor === '') return true;
    if (typeof valor !== 'string') return false;
    const texto = valor.trim();
    if (dataUriPermitida.test(texto)) return true;
    return !!caminhoDeStorage(texto, { buckets });
}

/**
 * Outra pessoa (que não pessoaId) usa este mesmo arquivo em foto_url ou documento_foto?
 * Antes de apagar do Storage: cadastro copiado/duplicado aponta para o mesmo arquivo.
 * Se a consulta falhar, responde true (na dúvida, não apaga).
 */
const COLUNAS_ARQUIVO_PESSOA = ['foto_url', 'documento_foto'];
const LIMITE_CANDIDATAS = 50;
/** Escapa % _ e \ para usar o texto dentro de um padrão ILIKE */
const escaparLike = (t) => String(t).replace(/[\\%_]/g, (c) => `\\${c}`);

async function arquivoUsadoPorOutraPessoa(valor, pessoaId) {
    if (!valor) return false;
    try {
        const ref = caminhoDeStorage(valor);
        if (!ref) {
            // Data URI ou endereço de fora: só a igualdade exata faz sentido
            const rs = await Promise.all(COLUNAS_ARQUIVO_PESSOA.map(c =>
                supabase.from('pessoas').select('id').eq(c, valor).neq('id', pessoaId).limit(1)));
            const erro = rs.find(r => r.error)?.error;
            if (erro) throw erro;
            return rs.some(r => Array.isArray(r.data) && r.data.length > 0);
        }

        // Arquivo do storage: o mesmo arquivo pode estar gravado como /object/public/, /sign/ ou
        // /authenticated/, com ou sem query. Busca candidatas pelo nome do arquivo (como gravado ou
        // codificado na URL) e compara o par bucket/caminho normalizado.
        const nomeArquivo = ref.path.split('/').pop();
        const padroes = [...new Set([nomeArquivo, encodeURIComponent(nomeArquivo)])].map(n => `%${escaparLike(n)}%`);
        const consultas = [];
        for (const coluna of COLUNAS_ARQUIVO_PESSOA) {
            for (const padrao of padroes) {
                consultas.push(supabase.from('pessoas').select(`id, ${coluna}`).ilike(coluna, padrao)
                    .neq('id', pessoaId).limit(LIMITE_CANDIDATAS)
                    .then(r => ({ ...r, coluna })));
            }
        }
        const rs = await Promise.all(consultas);
        const erro = rs.find(r => r.error)?.error;
        if (erro) throw erro;

        for (const r of rs) {
            const linhas = Array.isArray(r.data) ? r.data : [];
            for (const linha of linhas) {
                const outro = caminhoDeStorage(linha[r.coluna]);
                if (outro && outro.bucket === ref.bucket && outro.path === ref.path) return true;
            }
            // Muitas candidatas com o mesmo nome: sem certeza, não apaga
            if (linhas.length >= LIMITE_CANDIDATAS) return true;
        }
        return false;
    } catch (err) {
        logger.warn(`[Storage] não foi possível conferir se o arquivo é compartilhado; mantido no Storage`);
        return true;
    }
}

/**
 * Forma canônica de um arquivo do nosso storage para gravar no banco: URL pública do projeto
 * (/storage/v1/object/public/<bucket>/<caminho>), sem query. Data URI e endereços de fora voltam iguais.
 */
function formaCanonica(valor) {
    if (typeof valor !== 'string' || !/^https?:\/\//i.test(valor.trim())) return valor;
    const ref = caminhoDeStorage(valor);
    if (!ref) return valor;
    let origem;
    try { origem = new URL(process.env.SUPABASE_URL).origin; } catch { return valor; }
    return `${origem}/storage/v1/object/public/${ref.bucket}/${encodeURI(ref.path)}`;
}

/**
 * Link assinado (service role). Lança erro (sem o caminho na mensagem) se o storage recusar.
 */
async function urlAssinada(bucket, path, segundos = SEGUNDOS_PADRAO) {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, segundos);
    if (error || !data?.signedUrl) {
        throw Object.assign(new Error(`Falha ao assinar arquivo do bucket ${bucket}`), { cause: error });
    }
    return data.signedUrl;
}

/**
 * Bytes do arquivo (service role), com timeout. Lança erro se não for do storage, se o bucket não
 * estiver na lista, se o download falhar ou se passar do tempo (protege a fila dos leitores).
 * @param {string} urlOuCaminho
 * @param {{ bucketPadrao?: string, buckets?: string[], timeoutMs?: number } | string} [opcoes]
 * @returns {Promise<Buffer>}
 */
async function baixarArquivo(urlOuCaminho, opcoes = {}) {
    const op = normalizarOpcoes(opcoes);
    const ref = caminhoDeStorage(urlOuCaminho, op);
    if (!ref) throw new Error('Endereço de arquivo fora do armazenamento permitido');

    const timeoutMs = op.timeoutMs || TIMEOUT_DOWNLOAD_MS;
    let timer;
    const limite = new Promise((_, rejeitar) => {
        timer = setTimeout(() => rejeitar(new Error(`Tempo esgotado (${Math.round(timeoutMs / 1000)} s) ao baixar arquivo do bucket ${ref.bucket}`)), timeoutMs);
    });
    try {
        const { data, error } = await Promise.race([supabase.storage.from(ref.bucket).download(ref.path), limite]);
        if (error || !data) {
            throw Object.assign(new Error(`Falha ao baixar arquivo do bucket ${ref.bucket}`), { cause: error });
        }
        return Buffer.from(await data.arrayBuffer());
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Assina caminhos em lote por bucket. Devolve Map(chave → link assinado) só para o que assinou.
 * @param {Array<{ chave: any, valor: string }>} itens
 */
async function assinarEmLote(itens, buckets, segundos) {
    const porBucket = new Map();
    for (const { chave, valor } of itens) {
        const ref = caminhoDeStorage(valor, { buckets });
        if (!ref) continue;
        if (!porBucket.has(ref.bucket)) porBucket.set(ref.bucket, []);
        porBucket.get(ref.bucket).push({ chave, path: ref.path });
    }

    const assinados = new Map();
    for (const [bucket, lista] of porBucket) {
        for (let i = 0; i < lista.length; i += 500) {
            const lote = lista.slice(i, i + 500);
            try {
                const { data, error } = await supabase.storage.from(bucket).createSignedUrls(lote.map(x => x.path), segundos);
                if (error) throw error;
                const porCaminho = new Map((data || []).filter(r => r.signedUrl).map(r => [r.path, r.signedUrl]));
                let faltaram = 0;
                for (const { chave, path } of lote) {
                    const link = porCaminho.get(path);
                    if (link) assinados.set(chave, link);
                    else faltaram++;
                }
                if (faltaram) logger.warn(`[Storage] ${faltaram} arquivo(s) do bucket ${bucket} sem link assinado`);
            } catch (err) {
                logger.warn(`[Storage] falha ao assinar lote do bucket ${bucket}`);
            }
        }
    }
    return assinados;
}

/**
 * Troca o campo (padrão url_arquivo) de cada linha por link assinado, em lote por bucket.
 * Só assina os buckets da lista (padrão: documentos). Linha que não assinar mantém o valor gravado.
 * Altera as linhas no lugar e as devolve.
 * @param {object[]} linhas
 * @param {{ campo?: string, buckets?: string[], segundos?: number }} [opcoes]
 */
async function assinarLinhas(linhas, { campo = 'url_arquivo', buckets = BUCKETS_DOCUMENTO, segundos = SEGUNDOS_PADRAO } = {}) {
    const lista = linhas || [];
    const assinados = await assinarEmLote(lista.map((linha, i) => ({ chave: i, valor: linha?.[campo] })), buckets, segundos);
    for (const [i, link] of assinados) lista[i][campo] = link;
    return lista;
}

/**
 * Links assinados das fotos (buckets de foto), em lote.
 * @param {Array<{ id: string, foto_url: string }>} pessoas
 * @returns {Promise<Map<string, string>>} id → link assinado (só os que assinaram)
 */
async function assinarFotos(pessoas, segundos = SEGUNDOS_PADRAO) {
    return assinarEmLote((pessoas || []).map(p => ({ chave: p.id, valor: p.foto_url })), BUCKETS_FOTO, segundos);
}

module.exports = {
    caminhoDeStorage, ehDoNossoStorage, fotoUrlAceitavel, documentoFotoAceitavel, arquivoUsadoPorOutraPessoa, formaCanonica,
    urlAssinada, baixarArquivo, assinarLinhas, assinarFotos,
    SEGUNDOS_PADRAO, TIMEOUT_DOWNLOAD_MS, BUCKETS_FOTO, BUCKETS_DOCUMENTO
};
