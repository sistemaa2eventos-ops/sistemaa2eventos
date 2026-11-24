'use strict';

const axios = require('axios');
const logger = require('../../services/logger');

const GEMINI_ENDPOINT_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const MODELO_PADRAO = 'gemini-2.5-flash';
const MAX_MATERIAIS_REFERENCIA = 10;
const MAX_FOTOS_POR_MATERIAL = 2;
const MAX_TOTAL_FOTOS_REF = 10;

function erroHttp(mensagem, status = 400) {
    const err = new Error(mensagem);
    err.status = status;
    return err;
}

/**
 * Extrai mimeType e dados base64 puros de um Data URL (data:image/...;base64,...).
 */
function extrairDataUrlImagem(dataUrl) {
    if (!dataUrl || typeof dataUrl !== 'string') return null;
    const match = dataUrl.trim().match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/);
    if (!match) return null;
    const mimeType = match[1].toLowerCase();
    const data = match[2].replace(/\s+/g, '');
    if (!data || data.length < 32) return null;
    return { mimeType, data };
}

function normalizarBox2d(box) {
    if (!Array.isArray(box) || box.length !== 4) return null;
    const nums = box.map((v) => Math.max(0, Math.min(1000, Math.round(Number(v) || 0))));
    const [ymin, xmin, ymax, xmax] = nums;
    if (ymax <= ymin + 4 || xmax <= xmin + 4) return null;
    return [ymin, xmin, ymax, xmax];
}

function extrairJsonRespostaGemini(textoBruto) {
    if (!textoBruto || typeof textoBruto !== 'string') {
        throw erroHttp('A IA de visão retornou uma resposta vazia.', 502);
    }
    const limpo = textoBruto
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim();

    try {
        return JSON.parse(limpo);
    } catch {
        const inicio = limpo.indexOf('{');
        const fim = limpo.lastIndexOf('}');
        if (inicio >= 0 && fim > inicio) {
            try {
                return JSON.parse(limpo.slice(inicio, fim + 1));
            } catch {
                // cai no erro abaixo
            }
        }
        throw erroHttp('Não foi possível interpretar o retorno estruturado da IA de visão.', 502);
    }
}

function montarCatalogoPrompt(materiais = []) {
    const selecionados = (materiais || []).slice(0, MAX_MATERIAIS_REFERENCIA);
    const descricoes = [];
    const imagensReferencia = [];
    let fotosAdicionadas = 0;

    for (const mat of selecionados) {
        const car = mat.caracteristicas || {};
        const fotos = Array.isArray(mat.fotos_referencia) ? mat.fotos_referencia : [];
        const urlsRef = [];

        for (const f of fotos) {
            if (urlsRef.length >= MAX_FOTOS_POR_MATERIAL || fotosAdicionadas >= MAX_TOTAL_FOTOS_REF) break;
            const parsed = extrairDataUrlImagem(f?.url);
            if (parsed) {
                urlsRef.push({ ...parsed, angulo: f.angulo || 'frontal', legenda: f.legenda || '' });
                fotosAdicionadas += 1;
            }
        }

        if (urlsRef.length === 0 && fotosAdicionadas < MAX_TOTAL_FOTOS_REF && mat.foto_referencia_url) {
            const parsed = extrairDataUrlImagem(mat.foto_referencia_url);
            if (parsed) {
                urlsRef.push({ ...parsed, angulo: 'principal', legenda: '' });
                fotosAdicionadas += 1;
            }
        }

        const idxInicio = imagensReferencia.length + 2; // imagem 1 é a cena principal
        urlsRef.forEach((u) => imagensReferencia.push({ materialNome: mat.nome, materialId: mat.id, ...u }));
        const idxFim = imagensReferencia.length + 1;

        const refFotosTexto = urlsRef.length > 0
            ? `Fotos de referência anexadas: imagens #${idxInicio}${idxFim > idxInicio ? ` a #${idxFim}` : ''}.`
            : 'Sem foto de referência anexada (use a descrição visual abaixo).';

        descricoes.push([
            `- ID: "${mat.id}"`,
            `  Nome: "${mat.nome}" (Código: ${mat.codigo_catalogo || 'N/A'}, Unidade: ${car.unidade_medida || 'un'})`,
            `  Categoria: ${mat.categoria || 'outros'} | Subtipo: ${mat.subtipo || 'geral'} | Dimensões: ${mat.dimensoes || 'N/I'}`,
            `  Cor: ${car.cor_predominante || 'N/I'} | Geometria: ${car.formato_geometria || 'N/I'}`,
            car.marcas_distintivas ? `  Detalhes visuais: ${car.marcas_distintivas}` : null,
            car.palavras_chave_ia ? `  Palavras-chave: ${Array.isArray(car.palavras_chave_ia) ? car.palavras_chave_ia.join(', ') : car.palavras_chave_ia}` : null,
            `  ${refFotosTexto}`
        ].filter(Boolean).join('\n'));
    }

    return { selecionados, descricoes, imagensReferencia };
}

/**
 * Analisa uma foto estática de pilha, pallet, caminhão ou estoque usando Gemini Vision,
 * cruzando com as fotos de referência do catálogo de materiais do evento.
 */
async function analisarFotoPilhaGemini({
    imagemBase64,
    materiais = [],
    contextoLocal = 'Estoque / Carga',
    observacaoOperador = ''
} = {}) {
    const apiKey = (process.env.GEMINI_API_KEY || '').trim();
    if (!apiKey) {
        throw erroHttp(
            'Chave GEMINI_API_KEY não configurada no servidor. Crie uma chave gratuita em https://aistudio.google.com/apikey e adicione GEMINI_API_KEY no arquivo .env do backend.',
            503
        );
    }

    const imagemPrincipal = extrairDataUrlImagem(imagemBase64);
    if (!imagemPrincipal) {
        throw erroHttp('Envie uma imagem válida em formato base64 (JPEG, PNG ou WebP).', 400);
    }

    const modelo = (process.env.GEMINI_VISION_MODEL || MODELO_PADRAO).trim();
    const { selecionados, descricoes, imagensReferencia } = montarCatalogoPrompt(materiais);

    const textoCatalogo = descricoes.length > 0
        ? descricoes.join('\n\n')
        : 'Nenhum material pré-cadastrado selecionado. Identifique e conte os principais materiais/equipamentos de evento visíveis na foto como itens não catalogados.';

    const promptInstrucao = [
        'Você é um especialista em visão computacional e inventário de materiais e equipamentos de eventos (palco, box truss, grades, caixas, pallets, cadeiras, mesas, tendas, som, iluminação, geradores).',
        '',
        'TAREFA:',
        'Analise a IMAGEM #1 (FOTO PRINCIPAL DA CENA) e conte com precisão todas as unidades e pilhas dos materiais presentes.',
        'As imagens seguintes (se houver) são FOTOS DE REFERÊNCIA dos materiais cadastrados no catálogo do evento.',
        '',
        `LOCAL / CONTEXTO: ${contextoLocal}`,
        observacaoOperador ? `OBSERVAÇÃO DO OPERADOR: ${observacaoOperador}` : '',
        '',
        'CATÁLOGO DE MATERIAIS DO EVENTO:',
        textoCatalogo,
        '',
        'REGRAS IMPORTANTES DE CONTAGEM E CAIXAS (box_2d):',
        '1. Para pilhas grandes (ex.: pallets de caixas, pilhas de grades, pilhas de cadeiras ou treliças), envolva cada pilha/bloco com um box_2d bem ajustado, informe o rótulo curto (ex.: "48 caixas", "12 grades", "8 treliças Q30") e explique brevemente o cálculo em raciocinio_contagem (ex.: "6 camadas x 8 caixas por camada").',
        '2. Para unidades individuais bem separadas, você pode marcar cada unidade com seu próprio box_2d (quantidade: 1) ou agrupar se estiverem empilhadas.',
        '3. Coordenadas box_2d devem estar SEMPRE no formato [ymin, xmin, ymax, xmax] em inteiros de 0 a 1000 relativos à IMAGEM #1.',
        '4. Se um item corresponder ao catálogo, use EXATAMENTE o "material_id" listado no catálogo.',
        '5. Se houver materiais relevantes na foto que NÃO pertencem ao catálogo, liste em "itens_nao_catalogados".',
        '6. Não invente itens que não existem na foto. Seja conservador e realista na contagem.',
        '',
        'RESPONDA APENAS EM JSON VÁLIDO seguindo exatamente este esquema:',
        '{',
        '  "local_identificado": "string curta (ex: Armazém, Caminhão, Doca Palco)",',
        '  "observacao_geral": "resumo curto em português sobre a cena e eventuais oclusões",',
        '  "itens_identificados": [',
        '    {',
        '      "material_id": "id exato do catálogo",',
        '      "nome_material": "nome do material",',
        '      "unidade": "un | cx | m | kit",',
        '      "quantidade": 48,',
        '      "confianca": 0.92,',
        '      "raciocinio_contagem": "ex.: 3 pilhas visíveis (16 + 16 + 16)",',
        '      "grupos": [',
        '        {',
        '          "rotulo": "48 caixas",',
        '          "quantidade": 48,',
        '          "confianca": 0.92,',
        '          "box_2d": [180, 120, 820, 410]',
        '        }',
        '      ]',
        '    }',
        '  ],',
        '  "itens_nao_catalogados": [',
        '    {',
        '      "descricao": "nome curto do objeto",',
        '      "quantidade": 4,',
        '      "confianca": 0.80,',
        '      "box_2d": [200, 500, 600, 750]',
        '    }',
        '  ]',
        '}'
    ].filter(Boolean).join('\n');

    const parts = [
        { text: promptInstrucao },
        { text: 'IMAGEM #1 — FOTO PRINCIPAL DA CENA PARA CONTAGEM:' },
        {
            inline_data: {
                mime_type: imagemPrincipal.mimeType,
                data: imagemPrincipal.data
            }
        }
    ];

    imagensReferencia.forEach((ref, idx) => {
        parts.push({
            text: `IMAGEM #${idx + 2} — Referência do catálogo: "${ref.materialNome}" (ID: ${ref.materialId}, ângulo: ${ref.angulo})`
        });
        parts.push({
            inline_data: {
                mime_type: ref.mimeType,
                data: ref.data
            }
        });
    });

    let respostaApi;
    try {
        const url = `${GEMINI_ENDPOINT_BASE}/${encodeURIComponent(modelo)}:generateContent?key=${encodeURIComponent(apiKey)}`;
        respostaApi = await axios.post(
            url,
            {
                contents: [{ role: 'user', parts }],
                generationConfig: {
                    temperature: 0.1,
                    topP: 0.9,
                    responseMimeType: 'application/json'
                }
            },
            {
                timeout: 60000,
                headers: { 'Content-Type': 'application/json' }
            }
        );
    } catch (err) {
        const statusUpstream = err.response?.status;
        const msgUpstream = err.response?.data?.error?.message || err.message || 'Erro desconhecido';
        logger.error(`[Produção/VisãoIA] Falha Gemini (${statusUpstream || 'net'}): ${msgUpstream}`);

        if (statusUpstream === 400 || statusUpstream === 401 || statusUpstream === 403) {
            throw erroHttp(`Chave Gemini inválida ou sem permissão (${msgUpstream}).`, 502);
        }
        if (statusUpstream === 429) {
            throw erroHttp('Limite gratuito da Gemini API atingido no momento. Aguarde alguns segundos e tente novamente.', 429);
        }
        throw erroHttp(`Falha ao comunicar com a Gemini API: ${msgUpstream}`, 502);
    }

    const textoResposta = respostaApi?.data?.candidates?.[0]?.content?.parts
        ?.map((p) => p?.text || '')
        .join('\n')
        .trim();

    const jsonBruto = extrairJsonRespostaGemini(textoResposta);
    const mapaMateriais = new Map(selecionados.map((m) => [m.id, m]));

    const itensIdentificados = (Array.isArray(jsonBruto.itens_identificados) ? jsonBruto.itens_identificados : [])
        .map((item) => {
            const mat = mapaMateriais.get(item.material_id) || null;
            const grupos = (Array.isArray(item.grupos) ? item.grupos : [])
                .map((g) => {
                    const box = normalizarBox2d(g?.box_2d);
                    const qtdGrupo = Math.max(0, Math.round(Number(g?.quantidade || 0)));
                    if (!box && qtdGrupo <= 0) return null;
                    return {
                        rotulo: String(g?.rotulo || `${qtdGrupo} ${item.unidade || mat?.caracteristicas?.unidade_medida || 'un'}`).slice(0, 60),
                        quantidade: qtdGrupo || 1,
                        confianca: Math.max(0.1, Math.min(0.99, Number(g?.confianca ?? item.confianca ?? 0.85))),
                        box_2d: box
                    };
                })
                .filter(Boolean);

            const somaGrupos = grupos.reduce((acc, g) => acc + g.quantidade, 0);
            const quantidadeFinal = Math.max(0, Math.round(Number(item.quantidade ?? somaGrupos) || 0));

            return {
                material_id: mat ? mat.id : null,
                codigo_catalogo: mat?.codigo_catalogo || '',
                nome_material: mat?.nome || String(item.nome_material || 'Material identificado'),
                unidade: item.unidade || mat?.caracteristicas?.unidade_medida || 'un',
                quantidade_esperada: Number(mat?.quantidade_planejada || 0),
                quantidade: quantidadeFinal > 0 ? quantidadeFinal : somaGrupos,
                confianca: Math.max(0.1, Math.min(0.99, Number(item.confianca ?? 0.85))),
                raciocinio_contagem: String(item.raciocinio_contagem || '').slice(0, 240),
                grupos
            };
        })
        .filter((it) => it.quantidade > 0 || it.grupos.length > 0);

    const itensNaoCatalogados = (Array.isArray(jsonBruto.itens_nao_catalogados) ? jsonBruto.itens_nao_catalogados : [])
        .map((nr, idx) => ({
            id: `nr-ia-${Date.now()}-${idx}`,
            descricao: String(nr?.descricao || 'Objeto não catalogado').slice(0, 80),
            quantidade: Math.max(1, Math.round(Number(nr?.quantidade || 1))),
            confianca: Math.max(0.1, Math.min(0.99, Number(nr?.confianca ?? 0.72))),
            box_2d: normalizarBox2d(nr?.box_2d)
        }))
        .filter((nr) => nr.quantidade > 0);

    const totalCatalogo = itensIdentificados.reduce((acc, it) => acc + it.quantidade, 0);
    const totalNaoCatalogado = itensNaoCatalogados.reduce((acc, it) => acc + it.quantidade, 0);

    return {
        modelo_ia_versao: modelo,
        modo_contagem: 'sahi_estatico',
        local_identificado: String(jsonBruto.local_identificado || contextoLocal).slice(0, 60),
        observacao_geral: String(jsonBruto.observacao_geral || '').slice(0, 400),
        total_geral: totalCatalogo + totalNaoCatalogado,
        total_catalogo: totalCatalogo,
        total_nao_catalogado: totalNaoCatalogado,
        itens_identificados: itensIdentificados,
        itens_nao_catalogados: itensNaoCatalogados,
        analisado_em: new Date().toISOString()
    };
}

module.exports = {
    analisarFotoPilhaGemini,
    extrairDataUrlImagem,
    normalizarBox2d
};
