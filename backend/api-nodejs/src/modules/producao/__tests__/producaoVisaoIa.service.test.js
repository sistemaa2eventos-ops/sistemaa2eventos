'use strict';

jest.mock('axios');
const axios = require('axios');
const {
    analisarFotoPilhaGemini,
    extrairDataUrlImagem,
    normalizarBox2d
} = require('../producaoVisaoIa.service');

const IMG_FAKE_DATA_URL = `data:image/jpeg;base64,${'A'.repeat(64)}`;

describe('producaoVisaoIa.service (Gemini Vision)', () => {
    const envOriginal = { ...process.env };

    beforeEach(() => {
        jest.clearAllMocks();
        process.env = { ...envOriginal };
    });

    afterAll(() => {
        process.env = envOriginal;
    });

    test('retorna erro 503 amigável quando GEMINI_API_KEY_2 e GEMINI_API_KEY não estão configuradas', async () => {
        delete process.env.GEMINI_API_KEY_2;
        delete process.env.GEMINI_API_KEY;
        await expect(
            analisarFotoPilhaGemini({ imagemBase64: IMG_FAKE_DATA_URL, materiais: [] })
        ).rejects.toMatchObject({
            status: 503,
            message: expect.stringContaining('GEMINI_API_KEY_2')
        });
    });

    test('extrairDataUrlImagem valida corretamente Data URLs', () => {
        expect(extrairDataUrlImagem(IMG_FAKE_DATA_URL)).toEqual({
            mimeType: 'image/jpeg',
            data: 'A'.repeat(64)
        });
        expect(extrairDataUrlImagem('nao-e-imagem')).toBeNull();
    });

    test('normalizarBox2d clampa coordenadas entre 0 e 1000 e rejeita caixas degeneradas', () => {
        expect(normalizarBox2d([-10, 50, 1200, 600])).toEqual([0, 50, 1000, 600]);
        expect(normalizarBox2d([500, 500, 501, 501])).toBeNull();
    });

    test('processa retorno estruturado do Gemini com caixas verdes e totais por material', async () => {
        process.env.GEMINI_API_KEY_2 = 'chave-teste-gemini';
        process.env.GEMINI_VISION_MODEL = 'gemini-3.1-flash-lite';

        axios.post.mockResolvedValueOnce({
            data: {
                candidates: [{
                    content: {
                        parts: [{
                            text: JSON.stringify({
                                local_identificado: 'Armazém',
                                observacao_geral: 'Três pallets de caixas bem iluminados.',
                                itens_identificados: [
                                    {
                                        material_id: 'mat-cx-1',
                                        nome_material: 'Caixa Padrão',
                                        unidade: 'cx',
                                        quantidade: 196,
                                        confianca: 0.94,
                                        raciocinio_contagem: '3 pallets visíveis: 48 + 96 + 52',
                                        grupos: [
                                            { rotulo: '48 caixas', quantidade: 48, confianca: 0.93, box_2d: [420, 210, 780, 390] },
                                            { rotulo: '96 caixas', quantidade: 96, confianca: 0.95, box_2d: [250, 420, 780, 610] },
                                            { rotulo: '52 caixas', quantidade: 52, confianca: 0.92, box_2d: [360, 640, 780, 810] }
                                        ]
                                    }
                                ],
                                itens_nao_catalogados: [
                                    { descricao: 'Pallet vazio de madeira', quantidade: 1, confianca: 0.81, box_2d: [700, 20, 860, 180] }
                                ]
                            })
                        }]
                    }
                }]
            }
        });

        const res = await analisarFotoPilhaGemini({
            imagemBase64: IMG_FAKE_DATA_URL,
            contextoLocal: 'Armazém',
            materiais: [{
                id: 'mat-cx-1',
                codigo_catalogo: 'CX-01',
                nome: 'Caixa Padrão',
                categoria: 'outros',
                quantidade_planejada: 200,
                foto_referencia_url: IMG_FAKE_DATA_URL,
                caracteristicas: { unidade_medida: 'cx', cor_predominante: 'Marrom' }
            }]
        });

        expect(axios.post).toHaveBeenCalledTimes(1);
        expect(res.modelo_ia_versao).toBe('gemini-3.1-flash-lite');
        expect(res.total_catalogo).toBe(196);
        expect(res.total_nao_catalogado).toBe(1);
        expect(res.total_geral).toBe(197);
        expect(res.itens_identificados[0].grupos).toHaveLength(3);
        expect(res.itens_identificados[0].quantidade_esperada).toBe(200);
        expect(res.itens_nao_catalogados).toHaveLength(1);
    });
});
