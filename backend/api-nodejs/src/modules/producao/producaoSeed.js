'use strict';

const { v4: uuidv4 } = require('uuid');
const { cifrarDadosBancarios } = require('./producaoCalculos');

/**
 * Cria o estado completo de demonstração ("Festival NZT Arena") para o evento.
 */
function criarDadosDemonstracao(eventoId, usuario = {}) {
    const agora = new Date();
    const horasAtras = (h) => new Date(agora.getTime() - h * 3600000).toISOString();
    const horasFrente = (h) => new Date(agora.getTime() + h * 3600000).toISOString();
    const hojeStr = agora.toISOString().slice(0, 10);

    // Áreas
    const areaPalcoId = uuidv4();
    const areaInfraId = uuidv4();
    const areaSomLuzId = uuidv4();
    const areaABId = uuidv4();
    const areaSegurancaId = uuidv4();

    const areas = [
        { id: areaPalcoId, evento_id: eventoId, nome: 'Palco principal', cor: '#00D4FF', descricao: 'Estrutura de treliças, cobertura e praticáveis', responsavel_nome: 'Marcos Oliveira', ativo: true },
        { id: areaInfraId, evento_id: eventoId, nome: 'Infraestrutura e tendas', cor: '#FFB800', descricao: 'Geradores, tendas médicas, banheiros e gradis', responsavel_nome: 'Carla Mendes', ativo: true },
        { id: areaSomLuzId, evento_id: eventoId, nome: 'Som e iluminação', cor: '#A855F7', descricao: 'Line arrays, mesas digitais e painéis de LED', responsavel_nome: 'Rafael Costa', ativo: true },
        { id: areaABId, evento_id: eventoId, nome: 'Alimentação e bebidas', cor: '#00FF88', descricao: 'Bares, praça de alimentação e câmara fria', responsavel_nome: 'Juliana Rocha', ativo: true },
        { id: areaSegurancaId, evento_id: eventoId, nome: 'Segurança e portaria', cor: '#FF8800', descricao: 'Pórticos, revistas e rotas de evacuação', responsavel_nome: 'André Santos', ativo: true }
    ];

    // Produtores
    const prodGeralId = uuidv4();
    const prodArquitetoId = uuidv4();
    const prodFinanceiroId = uuidv4();
    const prodAuditoriaId = uuidv4();
    const prodPalcoId = uuidv4();
    const prodInfraId = uuidv4();
    const prodSomId = uuidv4();

    const produtores = [
        {
            id: prodGeralId, evento_id: eventoId, user_id: null, nome: 'Helena Duarte',
            email: 'helena.geral@nzt.com.br', telefone: '11991112233', documento: '345.120.890-10',
            area_id: null, papel_producao: 'produtor_geral', tipo_cache: 'evento_fechado',
            valor_cache_centavos: 1850000, dados_bancarios_cifrados: cifrarDadosBancarios('PIX CNPJ 12.345.678/0001-90'),
            historico_cache: [{ data: horasAtras(72), valor_centavos: 1850000, motivo: 'Contrato inicial do festival' }],
            periodo_inicio: hojeStr, periodo_fim: hojeStr, termo_lgpd_aceito: true, termo_lgpd_data: horasAtras(72),
            status: 'ativo', ativo: true
        },
        {
            id: prodArquitetoId, evento_id: eventoId, user_id: null, nome: 'Eduardo Arquiteto',
            email: 'eduardo.arq@nzt.com.br', telefone: '11992223344', documento: '211.456.789-00',
            area_id: null, papel_producao: 'arquiteto_evento', tipo_cache: 'evento_fechado',
            valor_cache_centavos: 1400000, dados_bancarios_cifrados: cifrarDadosBancarios('PIX eduardo@arqstudio.com.br'),
            historico_cache: [], periodo_inicio: hojeStr, periodo_fim: hojeStr,
            termo_lgpd_aceito: true, termo_lgpd_data: horasAtras(70), status: 'ativo', ativo: true
        },
        {
            id: prodFinanceiroId, evento_id: eventoId, user_id: null, nome: 'Fernanda Lima',
            email: 'fernanda.fin@nzt.com.br', telefone: '11993334455', documento: '198.765.432-11',
            area_id: null, papel_producao: 'financeiro', tipo_cache: 'diaria',
            valor_cache_centavos: 95000, dados_bancarios_cifrados: cifrarDadosBancarios('PIX 11993334455'),
            historico_cache: [], periodo_inicio: hojeStr, periodo_fim: hojeStr,
            termo_lgpd_aceito: true, termo_lgpd_data: horasAtras(68), status: 'ativo', ativo: true
        },
        {
            id: prodAuditoriaId, evento_id: eventoId, user_id: null, nome: 'Roberto Auditor',
            email: 'roberto.aud@nzt.com.br', telefone: '11994445566', documento: '456.789.123-22',
            area_id: null, papel_producao: 'auditoria', tipo_cache: 'diaria',
            valor_cache_centavos: 85000, dados_bancarios_cifrados: cifrarDadosBancarios('PIX 45678912322'),
            historico_cache: [], periodo_inicio: hojeStr, periodo_fim: hojeStr,
            termo_lgpd_aceito: true, termo_lgpd_data: horasAtras(65), status: 'ativo', ativo: true
        },
        {
            id: prodPalcoId, evento_id: eventoId, user_id: null, nome: 'Marcos Oliveira',
            email: 'marcos.palco@nzt.com.br', telefone: '11995556677', documento: '555.444.333-12',
            area_id: areaPalcoId, papel_producao: 'produtor_area', tipo_cache: 'diaria',
            valor_cache_centavos: 110000, dados_bancarios_cifrados: cifrarDadosBancarios('PIX marcos.palco@gmail.com'),
            historico_cache: [], periodo_inicio: hojeStr, periodo_fim: hojeStr,
            termo_lgpd_aceito: true, termo_lgpd_data: horasAtras(60), status: 'ativo', ativo: true
        },
        {
            id: prodInfraId, evento_id: eventoId, user_id: null, nome: 'Carla Mendes',
            email: 'carla.infra@nzt.com.br', telefone: '11996667788', documento: '666.555.444-33',
            area_id: areaInfraId, papel_producao: 'produtor_area', tipo_cache: 'diaria',
            valor_cache_centavos: 105000, dados_bancarios_cifrados: cifrarDadosBancarios('PIX 11996667788'),
            historico_cache: [], periodo_inicio: hojeStr, periodo_fim: hojeStr,
            termo_lgpd_aceito: true, termo_lgpd_data: horasAtras(60), status: 'ativo', ativo: true
        },
        {
            id: prodSomId, evento_id: eventoId, user_id: null, nome: 'Rafael Costa',
            email: 'rafael.som@nzt.com.br', telefone: '11997778899', documento: '777.888.999-44',
            area_id: areaSomLuzId, papel_producao: 'produtor_area', tipo_cache: 'diaria',
            valor_cache_centavos: 120000, dados_bancarios_cifrados: cifrarDadosBancarios('PIX rafael.audio@uol.com.br'),
            historico_cache: [], periodo_inicio: hojeStr, periodo_fim: hojeStr,
            termo_lgpd_aceito: true, termo_lgpd_data: horasAtras(58), status: 'ativo', ativo: true
        }
    ];

    // Projetos e Arquivos versionados
    const proj1Id = uuidv4();
    const proj2Id = uuidv4();
    const projetos = [
        {
            id: proj1Id, evento_id: eventoId, area_id: areaPalcoId,
            titulo: 'Projeto estrutural palco principal e house mix', categoria: 'estrutural',
            descricao: 'Detalhamento de treliças Q30/Q50, lastros e memorial de carga de vento.',
            status: 'aprovado',
            arquivos: [
                { id: uuidv4(), versao: 1, nome_original: 'planta_palco_v1.pdf', extensao: 'PDF', tamanho_bytes: 4250000, observacao: 'Emissão preliminar', criado_em: horasAtras(96) },
                { id: uuidv4(), versao: 2, nome_original: 'planta_palco_v2_revisado_ART.pdf', extensao: 'PDF', tamanho_bytes: 5120000, observacao: 'Aprovado com lastros adicionais', criado_em: horasAtras(48) }
            ]
        },
        {
            id: proj2Id, evento_id: eventoId, area_id: areaInfraId,
            titulo: 'Implantação geral de tendas, geradores e A&B', categoria: 'arquitetura',
            descricao: 'Layout completo da esplanada com rotas de fuga e pontos de energia.',
            status: 'revisao',
            arquivos: [
                { id: uuidv4(), versao: 1, nome_original: 'implantacao_arena_2026.dxf', extensao: 'DXF', tamanho_bytes: 8340000, observacao: 'Planta cadastral base', criado_em: horasAtras(72) }
            ]
        }
    ];

    // Planta Baixa, Setores e Propostas
    const plantaId = uuidv4();
    const versao1Id = uuidv4();
    const setorPalcoId = uuidv4();
    const setorInfraId = uuidv4();
    const setorABId = uuidv4();

    const elemPalcoId = 'elem-palco-1';
    const elemGerador1Id = 'elem-gerador-1';
    const elemTendaMedId = 'elem-tenda-med-1';
    const elemBar1Id = 'elem-bar-1';
    const elemExtintor1Id = 'elem-ext-1';

    const elementosOficiaisV1 = [
        { id: elemPalcoId, tipo: 'palco', rotulo: 'Palco Principal (18x12m)', x: 260, y: 60, largura: 280, altura: 130, rotacao: 0, cor: '#00D4FF', texto: 'Carga 12 ton' },
        { id: elemGerador1Id, tipo: 'gerador', rotulo: 'Gerador 500 kVA #01', x: 640, y: 120, largura: 80, altura: 55, rotacao: 0, cor: '#FFB800', texto: 'Backstage' },
        { id: elemTendaMedId, tipo: 'tenda', rotulo: 'Posto Médico 10x10m', x: 110, y: 260, largura: 130, altura: 110, rotacao: 0, cor: '#FF3366', texto: 'Ambulância anexa' },
        { id: elemBar1Id, tipo: 'tenda', rotulo: 'Bar Central 15x5m', x: 520, y: 310, largura: 180, altura: 70, rotacao: 0, cor: '#00FF88', texto: '24 torneiras' },
        { id: elemExtintor1Id, tipo: 'extintor', rotulo: 'Extintor CO2', x: 565, y: 95, largura: 28, altura: 28, rotacao: 0, cor: '#FF3366', texto: 'House' }
    ];

    const setores = [
        { id: setorPalcoId, planta_versao_id: versao1Id, area_id: areaPalcoId, nome: 'Setor Norte • Palco e Backstage', cor_hex: '#00D4FF', poligono_coordenadas: [{ x: 210, y: 35 }, { x: 600, y: 35 }, { x: 600, y: 225 }, { x: 210, y: 225 }], responsavel_nome: 'Marcos Oliveira', capacidade_maxima: 120 },
        { id: setorInfraId, planta_versao_id: versao1Id, area_id: areaInfraId, nome: 'Setor Oeste • Saúde e Energia', cor_hex: '#FFB800', poligono_coordenadas: [{ x: 60, y: 230 }, { x: 280, y: 230 }, { x: 280, y: 440 }, { x: 60, y: 440 }], responsavel_nome: 'Carla Mendes', capacidade_maxima: 60 },
        { id: setorABId, planta_versao_id: versao1Id, area_id: areaABId, nome: 'Setor Leste • Praça A e B', cor_hex: '#00FF88', poligono_coordenadas: [{ x: 470, y: 260 }, { x: 750, y: 260 }, { x: 750, y: 450 }, { x: 470, y: 450 }], responsavel_nome: 'Juliana Rocha', capacidade_maxima: 1500 }
    ];

    const plantas = [
        {
            id: plantaId, evento_id: eventoId, projeto_id: proj2Id,
            titulo: 'Planta baixa oficial — Arena NZT 2026',
            escala_pixels_por_metro: 15, largura_px: 840, altura_px: 500,
            versoes: [
                {
                    id: versao1Id, planta_id: plantaId, numero_versao: 1,
                    eh_oficial: true, publicada_por_nome: 'Eduardo Arquiteto',
                    publicada_em: horasAtras(48), notas_versao: 'Planta oficial aprovada pré-montagem',
                    imagem_fundo_url: null,
                    nome_arquivo_base: null,
                    camadas_arquitetura: [],
                    elementos_json: elementosOficiaisV1,
                    setores
                }
            ]
        }
    ];

    // Tarefas com etapas, dependências e caminho crítico
    const tarefa1Id = uuidv4();
    const tarefa2Id = uuidv4();
    const tarefa3Id = uuidv4();
    const tarefa4Id = uuidv4();

    const tarefas = [
        {
            id: tarefa1Id, evento_id: eventoId, area_id: areaInfraId, setor_id: setorInfraId,
            planta_id: plantaId, elemento_planta_id: elemGerador1Id, elemento_planta_rotulo: 'Gerador 500 kVA #01',
            fase_operacional: 'montagem',
            titulo: 'Nivelamento de solo e posicionamento dos geradores principais',
            objetivo: 'Posicionar 2 geradores de 500 kVA com aterramento e bandeja de contenção.',
            sugestoes_levar: ['Multímetro calibrado', 'Hastes de aterramento 2,4m', 'EPIs dielétricos', '2 auxiliares'],
            prioridade: 'critica', status: 'concluida', produtor_atribuido_id: prodInfraId,
            data_inicio_planejada: horasAtras(24), data_fim_planejada: horasAtras(14),
            data_inicio_real: horasAtras(24), data_fim_real: horasAtras(13),
            requer_aprovacao_conclusao: true, aprovado_em: horasAtras(12),
            etapas: [
                { id: uuidv4(), ordem: 1, descricao: 'Demarcar área isolada com gradil e extintor CO2', obrigatoria: true, concluida: true, concluida_em: horasAtras(20), evidencias: [{ id: uuidv4(), tipo: 'texto', texto_comentario: 'Área isolada e sinalizada conforme norma.', criado_em: horasAtras(20) }] },
                { id: uuidv4(), ordem: 2, descricao: 'Instalar hastes de aterramento e medir resistência', obrigatoria: true, concluida: true, concluida_em: horasAtras(13), evidencias: [] }
            ]
        },
        {
            id: tarefa2Id, evento_id: eventoId, area_id: areaPalcoId, setor_id: setorPalcoId,
            planta_id: plantaId, elemento_planta_id: elemPalcoId, elemento_planta_rotulo: 'Palco Principal (18x12m)',
            fase_operacional: 'montagem',
            titulo: 'Montagem da cobertura box truss Q50 e lastro do palco',
            objetivo: 'Erguer 4 torres Q50 com talhas certificadas e aplicar 12 toneladas de lastro.',
            sugestoes_levar: ['Cinto paraquedista', 'Talhas 1 ton inspecionadas', 'Chave catraca 19mm', '6 montadores'],
            prioridade: 'critica', status: 'em_andamento', produtor_atribuido_id: prodPalcoId,
            data_inicio_planejada: horasAtras(12), data_fim_planejada: horasFrente(4),
            data_inicio_real: horasAtras(11), data_fim_real: null,
            requer_aprovacao_conclusao: true,
            etapas: [
                { id: uuidv4(), ordem: 1, descricao: 'Conferir recebimento das treliças e pinos de segurança', obrigatoria: true, concluida: true, concluida_em: horasAtras(9), evidencias: [{ id: uuidv4(), tipo: 'texto', texto_comentario: 'Pinos e cupilhas 100% conferidos no romaneio.', criado_em: horasAtras(9) }] },
                { id: uuidv4(), ordem: 2, descricao: 'Montar grid superior em solo e fixar motorização', obrigatoria: true, concluida: false, evidencias: [] },
                { id: uuidv4(), ordem: 3, descricao: 'Subir cobertura e travar sapatas com contrapeso', obrigatoria: true, concluida: false, evidencias: [] }
            ]
        },
        {
            id: tarefa3Id, evento_id: eventoId, area_id: areaSomLuzId, setor_id: setorPalcoId,
            planta_id: plantaId, elemento_planta_id: elemPalcoId, elemento_planta_rotulo: 'Palco Principal (18x12m)',
            fase_operacional: 'evento',
            titulo: 'Içamento e operação do PA de áudio (Line Array L/R) e iluminação',
            objetivo: 'Içar 16 caixas por lado após liberação da estrutura do palco e operar durante os shows.',
            sugestoes_levar: ['Inclinômetro digital', 'Cabo DMX reserva', 'Manilhas certificadas'],
            prioridade: 'alta', status: 'disponivel', produtor_atribuido_id: prodSomId,
            data_inicio_planejada: horasFrente(4), data_fim_planejada: horasFrente(14),
            requer_aprovacao_conclusao: true,
            etapas: [
                { id: uuidv4(), ordem: 1, descricao: 'Testar bumper e células de carga antes de içar', obrigatoria: true, concluida: false, evidencias: [] },
                { id: uuidv4(), ordem: 2, descricao: 'Alinhar ângulos do PA conforme projeto acústico', obrigatoria: true, concluida: false, evidencias: [] }
            ]
        },
        {
            id: tarefa4Id, evento_id: eventoId, area_id: areaInfraId, setor_id: setorInfraId,
            planta_id: plantaId, elemento_planta_id: elemTendaMedId, elemento_planta_rotulo: 'Posto Médico 10x10m',
            fase_operacional: 'montagem',
            titulo: 'Ligação hidráulica da tenda médica e instalação de gradis de proteção',
            objetivo: 'Garantir acesso livre para ambulância e 120m de gradil isolando bastidores.',
            sugestoes_levar: ['Mangueira alimentadora 3/4', 'Abraçadeiras de aço'],
            prioridade: 'alta', status: 'em_andamento', produtor_atribuido_id: prodInfraId,
            data_inicio_planejada: horasAtras(10), data_fim_planejada: horasAtras(1), // Já atrasada!
            data_inicio_real: horasAtras(9),
            requer_aprovacao_conclusao: true,
            etapas: [
                { id: uuidv4(), ordem: 1, descricao: 'Posicionar tenda 10x10m e fixar estacas', obrigatoria: true, concluida: true, concluida_em: horasAtras(6), evidencias: [] },
                { id: uuidv4(), ordem: 2, descricao: 'Instalar ponto de água e iluminação de emergência', obrigatoria: true, concluida: false, evidencias: [] }
            ]
        }
    ];

    const dependencias_tarefas = [
        { id: uuidv4(), tarefa_origem_id: tarefa1Id, tarefa_dependente_id: tarefa2Id, tipo: 'fim_para_inicio' },
        { id: uuidv4(), tarefa_origem_id: tarefa2Id, tarefa_dependente_id: tarefa3Id, tipo: 'fim_para_inicio' }
    ];

    // Proposta pendente na planta para o Arquiteto revisar (move gerador e adiciona novo banheiro)
    const propostas_planta = [
        {
            id: uuidv4(),
            planta_id: plantaId,
            planta_versao_base_id: versao1Id,
            autor_produtor_id: prodInfraId,
            autor_nome: 'Carla Mendes',
            tarefa_id: tarefa4Id,
            titulo: 'Realocar Gerador #01 e incluir tenda de apoio técnico',
            justificativa: 'Árvore existente no Setor Leste impede manobra do caminhão munck; deslocamos o gerador 4m para oeste e incluímos tenda de apoio.',
            elementos_alterados_json: [
                ...elementosOficiaisV1.filter((e) => e.id !== elemGerador1Id),
                { id: elemGerador1Id, tipo: 'gerador', rotulo: 'Gerador 500 kVA #01', x: 580, y: 140, largura: 80, altura: 55, rotacao: 0, cor: '#FFB800', texto: 'Movido 4m' },
                { id: 'elem-apoio-novo', tipo: 'tenda', rotulo: 'Tenda Apoio Elétrica 5x5m', x: 560, y: 215, largura: 90, altura: 65, rotacao: 0, cor: '#00D4FF', texto: 'Proposta Infra' }
            ],
            status: 'pendente',
            created_at: horasAtras(3)
        }
    ];

    // Materiais + Sessão de contagem por IA
    const matTrussId = uuidv4();
    const matPratId = uuidv4();
    const matGradeId = uuidv4();
    const materiais = [
        { id: matTrussId, evento_id: eventoId, codigo_catalogo: 'TR-Q30-2M', nome: 'Treliça alumínio Q30 2m', categoria: 'box_truss', subtipo: 'Q30 2m', dimensoes: '2,00 x 0,30 x 0,30m', peso_kg: 12.5, fornecedor_nome: 'Estruturas Brasil Ltda', classe_deteccao_ia: 'truss_q30_2m', quantidade_planejada: 40, quantidade_recebida: 38, quantidade_avariada: 0, status_movimentacao: 'recebido' },
        { id: matPratId, evento_id: eventoId, codigo_catalogo: 'PR-2X1', nome: 'Praticável pantográfico 2x1m', categoria: 'praticavel', subtipo: '2x1m alumínio', dimensoes: '2,00 x 1,00m', peso_kg: 32.0, fornecedor_nome: 'Estruturas Brasil Ltda', classe_deteccao_ia: 'praticavel_2x1', quantidade_planejada: 24, quantidade_recebida: 24, quantidade_avariada: 0, status_movimentacao: 'montado' },
        { id: matGradeId, evento_id: eventoId, codigo_catalogo: 'GR-CONT', nome: 'Grade de contenção 2m galvanizada', categoria: 'grades', subtipo: '2,00 x 1,10m', dimensoes: '2,00 x 1,10m', peso_kg: 18.0, fornecedor_nome: 'Segurança e Gradis SA', classe_deteccao_ia: 'grade_contencao', quantidade_planejada: 80, quantidade_recebida: 0, quantidade_avariada: 0, status_movimentacao: 'previsto' }
    ];

    const recebimento1Id = uuidv4();
    const sessao1Id = uuidv4();
    const recebimentos = [
        {
            id: recebimento1Id, evento_id: eventoId, fornecedor_nome: 'Estruturas Brasil Ltda',
            numero_nota_romaneio: 'NF-004892', data_hora_chegada: horasAtras(10),
            conferente_produtor_id: prodAuditoriaId, status: 'aprovado_divergencia',
            observacoes: 'Faltaram 2 peças Q30 2m no romaneio da primeira carreta.'
        }
    ];
    const sessoes_contagem = [
        {
            id: sessao1Id, recebimento_id: recebimento1Id, origem_midia: 'video_gravado',
            modelo_ia_versao: 'rt-detr-apache2-v1 + supervision-linezone', modo_contagem: 'line_zone',
            status_processamento: 'concluido', iniciado_em: horasAtras(10), finalizado_em: horasAtras(10),
            itens_contados: [
                { id: uuidv4(), material_id: matTrussId, classe_identificada: 'truss_q30_2m', reconhecido_catalogo: true, quantidade_esperada: 40, quantidade_ia: 38, quantidade_corrigida_humano: 38, confianca_media: 0.94, justificativa_correcao: 'Confirmado visualmente na pilha lateral' },
                { id: uuidv4(), material_id: matPratId, classe_identificada: 'praticavel_2x1', reconhecido_catalogo: true, quantidade_esperada: 24, quantidade_ia: 24, quantidade_corrigida_humano: 24, confianca_media: 0.97, justificativa_correcao: null },
                { id: uuidv4(), material_id: null, classe_identificada: 'cubo_aluminio_q30_5_faces', reconhecido_catalogo: false, quantidade_esperada: 0, quantidade_ia: 4, quantidade_corrigida_humano: null, confianca_media: 0.81, justificativa_correcao: null }
            ]
        }
    ];

    // Orçamentos
    const orcamentos = [
        { id: uuidv4(), evento_id: eventoId, area_id: areaPalcoId, fornecedor_nome: 'Estruturas Brasil Ltda', titulo: 'Locação de palco 18x12m e cobertura Q50', valor_previsto_centavos: 8500000, valor_realizado_centavos: 8320000, status: 'aprovado' },
        { id: uuidv4(), evento_id: eventoId, area_id: areaInfraId, fornecedor_nome: 'Potência Geradores', titulo: '2 Geradores 500 kVA + combustível 72h', valor_previsto_centavos: 4200000, valor_realizado_centavos: 4480000, status: 'aprovado' },
        { id: uuidv4(), evento_id: eventoId, area_id: areaSomLuzId, fornecedor_nome: 'ÁudioPro Eventos', titulo: 'Sonorização Line Array + Painel LED P3', valor_previsto_centavos: 11200000, valor_realizado_centavos: 11200000, status: 'liquidado' }
    ];

    // Presença e Dobra
    const registros_presenca = [
        { id: uuidv4(), evento_id: eventoId, produtor_id: prodPalcoId, tipo: 'checkin', data_hora: horasAtras(11), metodo: 'qrcode', eh_dobra_detectada: false },
        { id: uuidv4(), evento_id: eventoId, produtor_id: prodInfraId, tipo: 'checkin', data_hora: horasAtras(13), metodo: 'qrcode', eh_dobra_detectada: false },
        { id: uuidv4(), evento_id: eventoId, produtor_id: prodInfraId, tipo: 'checkout', data_hora: horasAtras(4), metodo: 'qrcode', eh_dobra_detectada: false },
        { id: uuidv4(), evento_id: eventoId, produtor_id: prodInfraId, tipo: 'checkin', data_hora: horasAtras(2), metodo: 'manual', eh_dobra_detectada: true, motivo_ocorrencia: 'Segundo turno no mesmo dia (dobra de escala)' }
    ];

    // Escalas programadas
    const escalas = [
        { id: uuidv4(), evento_id: eventoId, area_id: areaPalcoId, produtor_id: prodPalcoId, nome_turno: 'Montagem Manhã', data_inicio_turno: horasAtras(12), data_fim_turno: horasFrente(2), tipo_turno: 'normal', status: 'presente' },
        { id: uuidv4(), evento_id: eventoId, area_id: areaInfraId, produtor_id: prodInfraId, nome_turno: 'Plantão Elétrica e Infra', data_inicio_turno: horasAtras(14), data_fim_turno: horasFrente(4), tipo_turno: 'dobra_planejada', status: 'presente' },
        { id: uuidv4(), evento_id: eventoId, area_id: areaSomLuzId, produtor_id: prodSomId, nome_turno: 'Passagem de Som', data_inicio_turno: horasFrente(2), data_fim_turno: horasFrente(14), tipo_turno: 'normal', status: 'agendado' },
        { id: uuidv4(), evento_id: eventoId, area_id: areaPalcoId, produtor_id: prodGeralId, nome_turno: 'Coordenação Geral', data_inicio_turno: horasAtras(10), data_fim_turno: horasFrente(10), tipo_turno: 'plantao', status: 'presente' }
    ];

    // Marcos do evento (Milestones)
    const marcos = [
        { id: uuidv4(), titulo: 'Liberação do terreno e cercamento', data_prevista: horasAtras(28), concluido: true, concluido_em: horasAtras(26), area_id: areaInfraId },
        { id: uuidv4(), titulo: 'Término da estrutura de palco Q50', data_prevista: horasFrente(5), concluido: false, area_id: areaPalcoId },
        { id: uuidv4(), titulo: 'Vistoria Corpo de Bombeiros (AVCB)', data_prevista: horasFrente(12), concluido: false, area_id: areaSegurancaId },
        { id: uuidv4(), titulo: 'Passagem de som geral', data_prevista: horasFrente(16), concluido: false, area_id: areaSomLuzId },
        { id: uuidv4(), titulo: 'Abertura de portões (Showday)', data_prevista: horasFrente(22), concluido: false, area_id: null },
        { id: uuidv4(), titulo: 'Desmontagem concluída e devolução', data_prevista: horasFrente(46), concluido: false, area_id: null }
    ];

    // Movimentações iniciais de materiais
    const movimentacoes_materiais = [
        { id: uuidv4(), material_id: matTrussId, estagio_anterior: 'previsto', estagio_novo: 'recebido', setor_destino: 'Doca Carga 01', quantidade: 38, observacao: 'Recebido com divergência de 2 unidades', registrado_por_nome: 'Roberto Auditor', criado_em: horasAtras(10) },
        { id: uuidv4(), material_id: matPratId, estagio_anterior: 'em_estoque', estagio_novo: 'montado', setor_destino: 'Setor Norte • Palco e Backstage', quantidade: 24, observacao: 'Nivelamento concluído no palco', registrado_por_nome: 'Marcos Oliveira', criado_em: horasAtras(5) }
    ];

    return {
        seed_versao: 2,
        areas,
        produtores,
        projetos,
        plantas,
        propostas_planta,
        tarefas,
        dependencias_tarefas,
        marcos,
        materiais,
        recebimentos,
        sessoes_contagem,
        movimentacoes_materiais,
        orcamentos,
        escalas,
        registros_presenca,
        template_relatorio: {
            nome: 'Padrão Oficial Festival NZT',
            cor_cabecalho_hex: '#0A1628',
            rodape_personalizado: 'Relatório oficial de produção • NZT Eventos',
            marca_dagua_texto: 'USO INTERNO • PRODUÇÃO NZT',
            marca_dagua_opacidade: 0.08,
            horario_diario_automatico: '22:00',
            exibir_fotos_evidencia: true,
            exibir_financeiro: true
        },
        relatorios_gerados: [],
        auditoria: [
            {
                id: uuidv4(),
                usuario_nome: usuario?.nome || 'Sistema',
                acao: 'SEED_DEMONSTRACAO',
                entidade: 'MODULO_PRODUCAO',
                depois: { areas: areas.length, produtores: produtores.length, tarefas: tarefas.length },
                criado_em: agora.toISOString()
            }
        ]
    };
}

const TEMPLATES_TAREFAS = {
    festival_show: {
        rotulo: 'Festival e show ao vivo',
        tarefas: [
            {
                titulo: 'Montagem e nivelamento de grid e cobertura do palco',
                objetivo: 'Inspecionar talhas, pinos, lastros e laudo ART antes da liberação de carga.',
                prioridade: 'critica',
                sugestoes_levar: ['Cinto paraquedista', 'Talhas 1t certificadas', 'Anemômetro'],
                etapas: ['Conferir romaneio de treliças', 'Montar base e sapatas niveladas', 'Subir cobertura e fixar contrapesos']
            },
            {
                titulo: 'Alinhamento de PA, subgraves e passagem de som',
                objetivo: 'Garantir cobertura sonora uniforme dentro dos limites de decibéis da prefeitura.',
                prioridade: 'alta',
                sugestoes_levar: ['Decibelímetro', 'Rádio comunicador', 'Microfone de medição'],
                etapas: ['Içar Line Array L/R', 'Testar comunicação de house mix ao palco', 'Realizar passagem de som geral']
            },
            {
                titulo: 'Vistoria final de segurança, extintores e rotas de fuga',
                objetivo: 'Assegurar conformidade total para abertura de portões (AVCB).',
                prioridade: 'critica',
                sugestoes_levar: ['Checklist Bombeiros', 'Lacres de extintor', 'Placas fotoluminescentes'],
                etapas: ['Verificar sinalização de saídas de emergência', 'Checar validade e pressão dos extintores', 'Liberar portões para operação']
            }
        ]
    },
    feira_exposicao: {
        rotulo: 'Feira e exposição',
        tarefas: [
            {
                titulo: 'Demarcação de piso e montagem de estandes modulados',
                objetivo: 'Delimitar corredores conforme planta oficial dos bombeiros.',
                prioridade: 'alta',
                sugestoes_levar: ['Trena a laser', 'Fita de demarcação', 'Planta impressa'],
                etapas: ['Marcar quadras e corredores principais', 'Montar octanorm e testes de estabilidade', 'Entregar estandes aos expositores']
            },
            {
                titulo: 'Distribuição elétrica trifásica e pontos de rede dos expositores',
                objetivo: 'Balancear fases por ilha de estandes e testar conectividade.',
                prioridade: 'critica',
                sugestoes_levar: ['Alicate amperímetro', 'Testador de cabo RJ45', 'Disjuntores reserva'],
                etapas: ['Passar cabeamento subterrâneo com passa-fio', 'Medir tensão por tomada', 'Registrar leitura final em foto']
            }
        ]
    },
    corporativo_congresso: {
        rotulo: 'Corporativo e congresso',
        tarefas: [
            {
                titulo: 'Setup de plenária, telão de LED e tradução simultânea',
                objetivo: 'Testar projeção, passador de slides e receptores de áudio.',
                prioridade: 'critica',
                sugestoes_levar: ['Cabos HDMI/SDI redundantes', 'Notebook backup', 'Baterias alcalinas'],
                etapas: ['Calibrar processadora do painel de LED', 'Testar cabines de tradução', 'Validar apresentações dos palestrantes']
            },
            {
                titulo: 'Montagem da recepção VIP e credenciamento executivo',
                objetivo: 'Organizar balcões, impressoras de crachás e sinalização de salas.',
                prioridade: 'media',
                sugestoes_levar: ['Bobinas térmicas', 'Leitores QR Code', 'Totens de orientação'],
                etapas: ['Posicionar balcões e totens', 'Testar emissão de etiqueta e leitor facial', 'Conferir kit de boas-vindas']
            }
        ]
    }
};

module.exports = { criarDadosDemonstracao, TEMPLATES_TAREFAS };
