'use strict';

jest.mock('../../../config/supabase', () => ({
    supabase: {
        from: () => ({
            select: () => ({
                eq: () => ({
                    maybeSingle: async () => ({ data: null, error: { message: 'mock' } })
                })
            }),
            update: () => ({
                eq: async () => ({ error: null })
            })
        })
    }
}));

const producaoService = require('../producao.service');
const portalAuth = require('../producaoPortalAuth');

const EVENTO_ID = '11111111-1111-4111-8111-111111111111';
const ADMIN_USER = { id: 'admin-1', email: 'master@nzt.com.br', nivel_acesso: 'admin_master', nome: 'Admin Master' };

describe('Módulo de Produção — Regras de Negócio, Segurança e Cálculos', () => {
    beforeEach(async () => {
        producaoService._limparMemoriaTestes();
        await producaoService.carregarSeed(EVENTO_ID, ADMIN_USER);
    });

    test('1. Segurança de cachê e PIX: produtor de área vê apenas o próprio cachê e nunca o de terceiros', async () => {
        const resumoAdmin = await producaoService.obterResumo(EVENTO_ID, ADMIN_USER);
        const produtorPalco = resumoAdmin.produtores.find((p) => p.email === 'marcos.palco@nzt.com.br');
        const produtorInfra = resumoAdmin.produtores.find((p) => p.email === 'carla.infra@nzt.com.br');

        expect(produtorPalco.valor_cache_centavos).toBe(110000);
        expect(produtorPalco.chave_pix).toContain('marcos.palco');

        // Simular requisição autenticada como produtor de área (Palco)
        const userPalco = { id: 'u-palco', email: 'marcos.palco@nzt.com.br', nivel_acesso: 'operador', nome: 'Marcos Oliveira' };
        const resumoPalco = await producaoService.obterResumo(EVENTO_ID, userPalco);

        const proprio = resumoPalco.produtores.find((p) => p.id === produtorPalco.id);
        const outro = resumoPalco.produtores.find((p) => p.id === produtorInfra.id);

        expect(proprio.cache_restrito).toBe(false);
        expect(proprio.valor_cache_centavos).toBe(110000);
        expect(proprio.chave_pix).toContain('marcos.palco');

        expect(outro.cache_restrito).toBe(true);
        expect(outro.valor_cache_centavos).toBeNull();
        expect(outro.chave_pix).toBeUndefined();
        expect(resumoPalco.orcamentos_restrito).toBe(true);
        expect(resumoPalco.orcamentos).toEqual([]);

        // Arquiteto também não vê cachês de terceiros nem orçamentos
        const userArq = { id: 'u-arq', email: 'eduardo.arq@nzt.com.br', nivel_acesso: 'operador', nome: 'Eduardo Arquiteto' };
        const resumoArq = await producaoService.obterResumo(EVENTO_ID, userArq);
        const outroNoArq = resumoArq.produtores.find((p) => p.id === produtorPalco.id);
        expect(outroNoArq.cache_restrito).toBe(true);
        expect(outroNoArq.valor_cache_centavos).toBeNull();

        // Financeiro e Auditoria veem todos os cachês e orçamentos
        const userFin = { id: 'u-fin', email: 'fernanda.fin@nzt.com.br', nivel_acesso: 'operador', nome: 'Fernanda Lima' };
        const resumoFin = await producaoService.obterResumo(EVENTO_ID, userFin);
        expect(resumoFin.orcamentos_restrito).toBe(false);
        expect(resumoFin.orcamentos.length).toBeGreaterThan(0);
        expect(resumoFin.produtores.every((p) => p.cache_restrito === false)).toBe(true);
    });

    test('2. Isolamento de área: produtor de Palco vê apenas tarefas de Palco e é bloqueado (403) ao tentar iniciar tarefa de Som', async () => {
        const resumoAdmin = await producaoService.obterResumo(EVENTO_ID, ADMIN_USER);
        const areaPalco = resumoAdmin.areas.find((a) => a.nome.includes('Palco'));
        const areaSom = resumoAdmin.areas.find((a) => a.nome.includes('Som'));
        const tarefaSom = resumoAdmin.tarefas.find((t) => t.area_id === areaSom.id);

        const userPalco = { id: 'u-palco', email: 'marcos.palco@nzt.com.br', nivel_acesso: 'operador', nome: 'Marcos Oliveira' };
        const resumoPalco = await producaoService.obterResumo(EVENTO_ID, userPalco);

        expect(resumoPalco.tarefas.length).toBeGreaterThan(0);
        expect(resumoPalco.tarefas.every((t) => t.area_id === areaPalco.id)).toBe(true);

        await expect(
            producaoService.iniciarTarefa(EVENTO_ID, tarefaSom.id, {}, userPalco)
        ).rejects.toMatchObject({ status: 403 });
    });

    test('3. Análise de prazo por etapa e caminho crítico', () => {
        const agora = new Date('2026-11-19T18:00:00Z');
        const tarefaEmRisco = {
            id: 't-risco',
            status: 'em_andamento',
            prioridade: 'critica',
            data_inicio_planejada: '2026-11-19T10:00:00Z',
            data_fim_planejada: '2026-11-19T20:00:00Z', // 80% decorrido
            etapas: [
                { id: 'e1', concluida: true },
                { id: 'e2', concluida: false },
                { id: 'e3', concluida: false },
                { id: 'e4', concluida: false }
            ] // 25% concluído
        };

        const tarefaSucessora = {
            id: 't-suc',
            status: 'disponivel',
            prioridade: 'alta',
            data_inicio_planejada: '2026-11-19T20:00:00Z',
            data_fim_planejada: '2026-11-20T04:00:00Z',
            etapas: [{ id: 'e5', concluida: false }]
        };

        const resultado = producaoService.calcularCaminhoCritico(
            [tarefaEmRisco, tarefaSucessora],
            [{ tarefa_origem_id: 't-risco', tarefa_dependente_id: 't-suc', tipo: 'fim_para_inicio' }],
            agora
        );

        const r1 = resultado.find((t) => t.id === 't-risco');
        const r2 = resultado.find((t) => t.id === 't-suc');

        expect(r1.percentual_prazo_consumido).toBe(80);
        expect(r1.percentual_concluido).toBe(25);
        expect(r1.saude_prazo).toBe('em_risco');
        expect(r1.eh_caminho_critico).toBe(true);
        expect(r2.bloqueada_por_dependencia).toBe(true);
        expect(r2.impacto_atraso_horas).toBeGreaterThan(0);
    });

    test('4. Fluxo de proposta na planta, diff, conflito e aprovação exclusiva do Arquiteto (N -> N+1)', async () => {
        const resumo = await producaoService.obterResumo(EVENTO_ID, ADMIN_USER);
        const planta = resumo.plantas[0];
        const v1 = planta.versoes[0];
        const propostaPendente = resumo.propostas_planta[0];

        expect(v1.numero_versao).toBe(1);
        expect(propostaPendente.diff.resumo.modificados).toBe(1);
        expect(propostaPendente.diff.resumo.adicionados).toBe(1);

        // Criar segunda proposta mexendo no mesmo gerador deve sinalizar conflito
        const userPalco = { id: 'u-palco', email: 'marcos.palco@nzt.com.br', nivel_acesso: 'operador', nome: 'Marcos Oliveira' };
        const propConflito = await producaoService.criarPropostaPlanta(EVENTO_ID, planta.id, {
            titulo: 'Alterar mesmo gerador para outro lado',
            justificativa: 'Conflito proposital',
            elementos_alterados_json: [
                ...v1.elementos_json.filter((e) => e.id !== 'elem-gerador-1'),
                { id: 'elem-gerador-1', tipo: 'gerador', rotulo: 'Gerador 500 kVA #01', x: 700, y: 180, largura: 80, altura: 55, rotacao: 0, cor: '#FFB800', texto: 'Outro local' }
            ]
        }, userPalco);

        expect(propConflito.conflitos.length).toBe(1);
        expect(propConflito.conflitos[0].elementos_em_conflito).toContain('elem-gerador-1');

        // Produtor de área não pode aprovar proposta
        await expect(
            producaoService.avaliarPropostaPlanta(EVENTO_ID, propostaPendente.id, { decisao: 'aprovar' }, userPalco)
        ).rejects.toMatchObject({ status: 403 });

        // Arquiteto aprova e publica versão oficial v2
        const userArq = { id: 'u-arq', email: 'eduardo.arq@nzt.com.br', nivel_acesso: 'operador', nome: 'Eduardo Arquiteto' };
        const avaliacao = await producaoService.avaliarPropostaPlanta(EVENTO_ID, propostaPendente.id, {
            decisao: 'aprovar',
            parecer: 'Layout validado com rota de caminhão.'
        }, userArq);

        expect(avaliacao.proposta.status).toBe('aprovada');
        expect(avaliacao.nova_versao.numero_versao).toBe(2);
        expect(avaliacao.nova_versao.eh_oficial).toBe(true);
    });

    test('5. Conferência IA de materiais e detecção automática de dobra na presença', async () => {
        const resumo = await producaoService.obterResumo(EVENTO_ID, ADMIN_USER);
        const matGrade = resumo.materiais.find((m) => m.codigo_catalogo === 'GR-CONT');

        const { recebimento, sessao } = await producaoService.registrarConferenciaIa(EVENTO_ID, {
            fornecedor_nome: 'Segurança e Gradis SA',
            numero_nota_romaneio: 'NF-9901',
            itens: [
                { material_id: matGrade.id, quantidade_esperada: 80, quantidade_ia: 76, confianca_media: 0.92 }
            ]
        }, ADMIN_USER);

        expect(sessao.itens_contados[0].quantidade_ia).toBe(76);
        const item = sessao.itens_contados[0];
        await producaoService.confirmarItemContagem(EVENTO_ID, sessao.id, item.id, {
            quantidade_corrigida_humano: 77,
            justificativa_correcao: '1 grade estava atrás do pilar'
        }, ADMIN_USER);

        const resumoPos = await producaoService.obterResumo(EVENTO_ID, ADMIN_USER);
        const gradeAtualizada = resumoPos.materiais.find((m) => m.id === matGrade.id);
        expect(gradeAtualizada.quantidade_recebida).toBe(77);
        const recAtualizado = resumoPos.recebimentos.find((r) => r.id === recebimento.id);
        expect(recAtualizado.status).toBe('aprovado_divergencia');

        // Detecção de dobra para produtor que já fez check-in e check-out hoje
        const prodPalco = resumoPos.produtores.find((p) => p.email === 'marcos.palco@nzt.com.br');
        // O seed põe o check-in "11 h atrás": antes das 11h UTC ele cai no dia anterior. Cria o primeiro turno aqui.
        const hoje = new Date().toISOString().slice(0, 10);
        await producaoService.registrarPresenca(EVENTO_ID, {
            produtor_id: prodPalco.id,
            tipo: 'checkin',
            data_hora: `${hoje}T08:00:00.000Z`,
            metodo: 'qrcode'
        }, ADMIN_USER);
        await producaoService.registrarPresenca(EVENTO_ID, {
            produtor_id: prodPalco.id,
            tipo: 'checkout',
            data_hora: `${hoje}T18:00:00.000Z`,
            metodo: 'qrcode'
        }, ADMIN_USER);

        const segundoTurno = await producaoService.registrarPresenca(EVENTO_ID, {
            produtor_id: prodPalco.id,
            tipo: 'checkin',
            data_hora: `${hoje}T19:00:00.000Z`,
            metodo: 'qrcode'
        }, ADMIN_USER);

        expect(segundoTurno.eh_dobra_detectada).toBe(true);
    });

    test('6. Edição de produtor com histórico de cachê, convite WhatsApp e anonimização LGPD', async () => {
        const resumo = await producaoService.obterResumo(EVENTO_ID, ADMIN_USER);
        const prodSom = resumo.produtores.find((p) => p.email === 'rafael.som@nzt.com.br');

        const atualizado = await producaoService.atualizarProdutor(EVENTO_ID, prodSom.id, {
            valor_cache_centavos: 150000,
            motivo_cache: 'Inclusão de turno extra'
        }, ADMIN_USER);

        expect(atualizado.valor_cache_centavos).toBe(150000);
        expect(atualizado.historico_cache.length).toBe(1);
        expect(atualizado.historico_cache[0].valor_anterior_centavos).toBe(120000);

        const convite = await producaoService.gerarConviteProdutor(EVENTO_ID, prodSom.id, ADMIN_USER);
        expect(convite.link).toContain(`evento_id=${EVENTO_ID}`);
        expect(convite.link).toContain('convite_producao=');
        expect(convite.mensagem_whatsapp).toContain('Rafael Costa');

        const anonimizado = await producaoService.anonimizarProdutorLgpd(EVENTO_ID, prodSom.id, ADMIN_USER);
        expect(anonimizado.nome).toContain('Anonimizado');
        expect(anonimizado.email).toBeNull();
        expect(anonimizado.chave_pix).toBeNull();
        expect(anonimizado.status).toBe('inativo');
    });

    test('7. Templates de tarefas, criação de dependências e marcos do evento', async () => {
        const resumo = await producaoService.obterResumo(EVENTO_ID, ADMIN_USER);
        const areaPalco = resumo.areas.find((a) => a.nome.includes('Palco'));

        const aplicacao = await producaoService.aplicarTemplateTarefas(EVENTO_ID, {
            tipo_template: 'festival_show',
            area_id: areaPalco.id
        }, ADMIN_USER);
        expect(aplicacao.criadas).toBe(3);

        const tA = aplicacao.tarefas[0];
        const tB = aplicacao.tarefas[1];
        // Dependência inversa deve falhar por ciclo circular
        await expect(
            producaoService.criarDependenciaTarefa(EVENTO_ID, {
                tarefa_origem_id: tB.id,
                tarefa_dependente_id: tA.id
            }, ADMIN_USER)
        ).rejects.toMatchObject({ status: 400 });

        const marco = await producaoService.criarMarco(EVENTO_ID, {
            titulo: 'Teste de geradores em carga máxima',
            area_id: areaPalco.id
        }, ADMIN_USER);
        expect(marco.concluido).toBe(false);
        const marcoConcluido = await producaoService.alternarMarco(EVENTO_ID, marco.id, ADMIN_USER);
        expect(marcoConcluido.concluido).toBe(true);
    });

    test('8. Escalas, check-in por CPF/QR e métricas avançadas de cronograma', async () => {
        const resumo = await producaoService.obterResumo(EVENTO_ID, ADMIN_USER);
        const prodSom = resumo.produtores.find((p) => p.email === 'rafael.som@nzt.com.br');
        const areaSom = resumo.areas.find((a) => a.nome.includes('Som'));

        const escala = await producaoService.criarEscala(EVENTO_ID, {
            area_id: areaSom.id,
            produtor_id: prodSom.id,
            nome_turno: 'Montagem Som Noite',
            tipo_turno: 'normal'
        }, ADMIN_USER);
        expect(escala.status).toBe('agendado');

        // Registrar falta pelo CPF do produtor atualiza a escala
        const regFalta = await producaoService.registrarPresenca(EVENTO_ID, {
            cpf: prodSom.documento,
            tipo: 'falta',
            motivo_ocorrencia: 'Atestado médico'
        }, ADMIN_USER);
        expect(regFalta.produtor_id).toBe(prodSom.id);

        const resumoFinal = await producaoService.obterResumo(EVENTO_ID, ADMIN_USER);
        const escalaAtualizada = resumoFinal.escalas.find((e) => e.id === escala.id);
        expect(escalaAtualizada.status).toBe('falta');
        expect(typeof resumoFinal.kpis.lead_time_medio_horas).toBe('number');
        expect(typeof resumoFinal.kpis.aderencia_cronograma_pct).toBe('number');
        expect(resumoFinal.kpis.custo_dobras_centavos).toBeGreaterThan(0);
    });

    test('9. Criação de produtor com login e senha e redefinição segura via definirAcessoProdutor', async () => {
        const resumo = await producaoService.obterResumo(EVENTO_ID, ADMIN_USER);
        const areaPalco = resumo.areas.find((a) => a.nome.includes('Palco'));

        // Senha curta (< 6 caracteres) deve ser recusada
        await expect(
            producaoService.criarProdutor(EVENTO_ID, {
                nome: 'Lucas Luz',
                email: 'lucas.luz@nzt.com.br',
                area_id: areaPalco.id,
                papel_producao: 'produtor_area',
                senha_acesso: '123'
            }, ADMIN_USER)
        ).rejects.toMatchObject({ status: 400 });

        // Criar produtor com login e senha válidos provisiona acesso exclusivo no portal (sem criar usuário NZT)
        const criado = await producaoService.criarProdutor(EVENTO_ID, {
            nome: 'Lucas Luz',
            login_acesso: 'lucas.luz@nzt.com.br',
            area_id: areaPalco.id,
            papel_producao: 'produtor_area',
            valor_cache_centavos: 95000,
            chave_pix: 'pix-lucas@nzt.com.br',
            senha_acesso: 'Luz@2026'
        }, ADMIN_USER);

        expect(criado.possui_login).toBe(true);
        expect(criado.login_acesso).toBe('lucas.luz@nzt.com.br');
        expect(criado.email).toBe('lucas.luz@nzt.com.br');
        expect(criado.login_atualizado_em).toBeTruthy();
        expect(criado.senha_hash).toBeUndefined();

        // Produtor de área não pode definir senha de outro produtor
        const userPalco = { id: 'u-palco', email: 'marcos.palco@nzt.com.br', nivel_acesso: 'operador', nome: 'Marcos Oliveira' };
        await expect(
            producaoService.definirAcessoProdutor(EVENTO_ID, criado.id, {
                login_acesso: 'lucas.luz@nzt.com.br',
                senha_acesso: 'Nova@2026'
            }, userPalco)
        ).rejects.toMatchObject({ status: 403 });

        // Admin define/redefine login e senha com sucesso e gera mensagem com link do portal separado
        const prodSemLogin = await producaoService.criarProdutor(EVENTO_ID, {
            nome: 'Juliana Camera',
            area_id: areaPalco.id,
            papel_producao: 'produtor_area'
        }, ADMIN_USER);
        expect(prodSemLogin.possui_login).toBe(false);

        const acessoDefinido = await producaoService.definirAcessoProdutor(EVENTO_ID, prodSemLogin.id, {
            login_acesso: 'juliana.cam',
            senha_acesso: 'Cam@2026'
        }, ADMIN_USER);

        expect(acessoDefinido.acesso_provisionado).toBe(true);
        expect(acessoDefinido.login_acesso).toBe('juliana.cam');
        expect(acessoDefinido.link_portal).toContain(`evento_id=${EVENTO_ID}`);
        expect(acessoDefinido.produtor.possui_login).toBe(true);
        expect(acessoDefinido.produtor.senha_hash).toBeUndefined();
        expect(acessoDefinido.mensagem_whatsapp).toContain('juliana.cam');
        expect(acessoDefinido.mensagem_whatsapp).toContain('Cam@2026');
    });

    test('10. Login isolado no Portal do Produtor (JWT separado, isolamento de área e bloqueio de cachê alheio)', async () => {
        const resumo = await producaoService.obterResumo(EVENTO_ID, ADMIN_USER);
        const areaPalco = resumo.areas.find((a) => a.nome.includes('Palco'));
        const areaSom = resumo.areas.find((a) => a.nome.includes('Som'));
        const outroProd = resumo.produtores.find((p) => p.area_id === areaSom.id);

        const prod = await producaoService.criarProdutor(EVENTO_ID, {
            nome: 'Produtor Portal Teste',
            login_acesso: 'portal.palco',
            area_id: areaPalco.id,
            papel_producao: 'produtor_area',
            valor_cache_centavos: 130000,
            chave_pix: 'pix-portal-palco',
            senha_acesso: 'Palco@2026'
        }, ADMIN_USER);

        // Senha incorreta deve falhar com 401
        await expect(
            producaoService.autenticarPortalProdutor({ login: 'portal.palco', senha: 'Errada', evento_id: EVENTO_ID })
        ).rejects.toMatchObject({ status: 401 });

        // Login válido sem passar evento_id também deve encontrar o evento e autenticar
        const authResp = await producaoService.autenticarPortalProdutor({
            login: 'portal.palco',
            senha: 'Palco@2026'
        });

        expect(authResp.token).toBeTruthy();
        expect(authResp.evento.id).toBe(EVENTO_ID);
        expect(authResp.produtor.id).toBe(prod.id);
        expect(authResp.produtor.senha_hash).toBeUndefined();

        const decoded = portalAuth.verificarTokenProdutor(authResp.token);
        expect(decoded).toBeTruthy();
        expect(decoded.escopo).toBe('portal_produtor');
        expect(decoded.produtor_id).toBe(prod.id);

        const portalUser = {
            id: decoded.produtor_id,
            produtor_id: decoded.produtor_id,
            login_acesso: decoded.login_acesso,
            nome: decoded.nome,
            eh_portal_produtor: true
        };

        // Mesmo se tentar forjar header de simulação, portal mantém isolamento estrito do produtor
        const resumoPortal = await producaoService.obterResumo(EVENTO_ID, portalUser, {
            'x-producao-perfil-simulacao': 'produtor_geral'
        });
        expect(resumoPortal.contexto_usuario.eh_portal_produtor).toBe(true);
        expect(resumoPortal.contexto_usuario.papel_producao).toBe('produtor_area');
        expect(resumoPortal.tarefas.length).toBeGreaterThan(0);
        expect(resumoPortal.tarefas.every((t) => t.area_id === areaPalco.id)).toBe(true);

        const proprioNoResumo = resumoPortal.produtores.find((p) => p.id === prod.id);
        const outroNoResumo = resumoPortal.produtores.find((p) => p.id === outroProd.id);
        expect(proprioNoResumo.cache_restrito).toBe(false);
        expect(proprioNoResumo.chave_pix).toBe('pix-portal-palco');
        expect(outroNoResumo.cache_restrito).toBe(true);
        expect(outroNoResumo.valor_cache_centavos).toBeNull();

        // Usuário do portal não pode resetar o seed administrativo
        await expect(
            producaoService.carregarSeed(EVENTO_ID, portalUser)
        ).rejects.toMatchObject({ status: 403 });

        // Após anonimização LGPD, login no portal é bloqueado
        await producaoService.anonimizarProdutorLgpd(EVENTO_ID, prod.id, ADMIN_USER);
        await expect(
            producaoService.autenticarPortalProdutor({ login: 'portal.palco', senha: 'Palco@2026', evento_id: EVENTO_ID })
        ).rejects.toMatchObject({ status: 401 });
    });

    test('11. Importação de projeto/camadas na planta e geração do plano de 3 fases (Montagem, Evento, Desmontagem)', async () => {
        const resumo = await producaoService.obterResumo(EVENTO_ID, ADMIN_USER);
        const areaPalco = resumo.areas.find((a) => a.nome.includes('Palco'));

        // Criar nova prancha a partir de arquivo do arquiteto
        const prancha = await producaoService.criarPlanta(EVENTO_ID, {
            titulo: 'Planta Arquitetura VIP',
            largura_px: 1200,
            altura_px: 800,
            escala_pixels_por_metro: 20,
            imagem_fundo_url: 'data:image/png;base64,iVBORw0KGgo=',
            nome_arquivo_base: 'vip_arquitetura.pdf'
        }, ADMIN_USER);

        expect(prancha.largura_px).toBe(1200);
        expect(prancha.versoes[0].imagem_fundo_url).toBe('data:image/png;base64,iVBORw0KGgo=');

        // Adicionar camadas sobrepostas (ex.: elétrica e hidráulica)
        const camadaResp = await producaoService.adicionarCamadaPlanta(EVENTO_ID, prancha.id, {
            camadas_lote: [
                { nome: 'Camada Elétrica', categoria: 'eletrica', imagem_url: 'data:image/svg+xml,<svg/>', opacidade: 0.75 },
                { nome: 'Camada Hidráulica', categoria: 'hidraulica', imagem_url: 'data:image/svg+xml,<svg/>', opacidade: 0.65 }
            ]
        }, ADMIN_USER);
        expect(camadaResp.camadas_adicionadas.length).toBe(2);

        const camId = camadaResp.camadas_adicionadas[0].id;
        const camAtualizada = await producaoService.atualizarCamadaPlanta(EVENTO_ID, prancha.id, camId, {
            visivel: false,
            opacidade: 0.5
        }, ADMIN_USER);
        expect(camAtualizada.visivel).toBe(false);
        expect(camAtualizada.opacidade).toBe(0.5);

        // Ao publicar nova versão oficial, imagem base e camadas são preservadas
        const v2 = await producaoService.publicarVersaoOficialPlanta(EVENTO_ID, prancha.id, {
            notas_versao: 'Posicionamento dos bares na prancha VIP'
        }, ADMIN_USER);
        expect(v2.numero_versao).toBe(2);
        expect(v2.imagem_fundo_url).toBe('data:image/png;base64,iVBORw0KGgo=');
        expect(v2.camadas_arquitetura.length).toBe(2);

        await producaoService.excluirCamadaPlanta(EVENTO_ID, prancha.id, camId, ADMIN_USER);

        // Gerar plano encadeado de 3 fases (Montagem -> Evento -> Desmontagem) para elemento da planta
        const plano = await producaoService.gerarPlanoFasesElemento(EVENTO_ID, prancha.id, {
            area_id: areaPalco.id,
            elemento_planta_id: 'elem-vip-palco',
            elemento_planta_rotulo: 'Palco VIP',
            tipo_elemento: 'palco'
        }, ADMIN_USER);

        expect(plano.tarefas.length).toBe(3);
        expect(plano.tarefas.map((t) => t.fase_operacional)).toEqual(['montagem', 'evento', 'desmontagem']);
        expect(plano.tarefas[0].elemento_planta_id).toBe('elem-vip-palco');

        const resumoFinal = await producaoService.obterResumo(EVENTO_ID, ADMIN_USER);
        expect(resumoFinal.kpis.contagem_por_fase.montagem).toBeGreaterThanOrEqual(1);
        expect(resumoFinal.kpis.contagem_por_fase.evento).toBeGreaterThanOrEqual(1);
        expect(resumoFinal.kpis.contagem_por_fase.desmontagem).toBeGreaterThanOrEqual(1);
        expect(typeof resumoFinal.kpis.progresso_por_fase.desmontagem).toBe('number');
    });

    test('12. Cadastro visual de material (fotos, características, regra de ação), edição e catálogo para visão computacional', async () => {
        const criado = await producaoService.criarMaterial(EVENTO_ID, {
            nome: 'Caixa Line Array VTX A8',
            codigo_catalogo: 'SOM-VTX-A8',
            categoria: 'som',
            dimensoes: '0,76 x 0,28 x 0,48m',
            peso_kg: 29.5,
            quantidade_planejada: 16,
            fotos_referencia: [
                {
                    url: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
                    angulo: 'frontal',
                    legenda: 'Frente com tela metálica',
                    principal: false,
                    assinatura_visual: { cor_media_rgb: [30, 32, 36], hist_hsv: [0, 0, 0], aspecto: 2.1, densidade_bordas: 0.42 }
                },
                {
                    url: 'data:image/jpeg;base64,/9j/4AAQSkZJRg22==',
                    angulo: 'lateral',
                    legenda: 'Bumper lateral amarelo',
                    principal: true
                }
            ],
            caracteristicas: {
                cor_predominante: 'Preto / Grafite',
                cor_hex_referencia: '#1E293B',
                formato_geometria: 'caixa_cubica',
                material_composicao: 'Compensado naval com pintura poliureia',
                unidade_medida: 'un',
                codigo_etiqueta: 'NZT-VTX08',
                marcas_distintivas: 'Logo lateral branco e alças pretas embutidas',
                palavras_chave_ia: 'line array, caixa som, speaker, vtx'
            },
            regra_monitoramento: {
                acao_ao_detectar: 'alertar_divergencia',
                modo_preferido: 'line_zone',
                confianca_minima: 0.75,
                notificar_alerta: true,
                instrucao_operacional: 'Contar cada caixa descendo da carreta e avisar se vier menos que 16.'
            }
        }, ADMIN_USER);

        expect(criado.foto_referencia_url).toBe('data:image/jpeg;base64,/9j/4AAQSkZJRg22==');
        expect(criado.fotos_referencia.length).toBe(2);
        expect(criado.fotos_referencia.filter((f) => f.principal).length).toBe(1);
        expect(criado.caracteristicas.palavras_chave_ia).toEqual(['line array', 'caixa som', 'speaker', 'vtx']);
        expect(criado.regra_monitoramento.acao_ao_detectar).toBe('alertar_divergencia');
        expect(criado.regra_monitoramento.confianca_minima).toBe(0.75);

        const atualizado = await producaoService.atualizarMaterial(EVENTO_ID, criado.id, {
            foto_referencia_url: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==',
            caracteristicas: { marcas_distintivas: 'Grade frontal hexagonal com selo azul' },
            regra_monitoramento: { acao_ao_detectar: 'alertar_saida_indevida', confianca_minima: 0.82 }
        }, ADMIN_USER);

        expect(atualizado.foto_referencia_url).toBe('data:image/jpeg;base64,/9j/4AAQSkZJRg==');
        expect(atualizado.caracteristicas.marcas_distintivas).toContain('selo azul');
        expect(atualizado.regra_monitoramento.acao_ao_detectar).toBe('alertar_saida_indevida');
        expect(atualizado.regra_monitoramento.confianca_minima).toBe(0.82);

        const catalogo = await producaoService.obterCatalogoVisaoMateriais(EVENTO_ID, ADMIN_USER);
        const itemCat = catalogo.materiais.find((m) => m.id === criado.id);
        expect(itemCat).toBeDefined();
        expect(itemCat.fotos_referencia.length).toBe(2);
        expect(itemCat.regra_monitoramento.acao_ao_detectar).toBe('alertar_saida_indevida');

        const conf = await producaoService.registrarConferenciaIa(EVENTO_ID, {
            fornecedor_nome: 'ÁudioPro Eventos',
            numero_nota_romaneio: 'NF-VTX-01',
            origem_midia: 'video_gravado',
            modo_contagem: 'line_zone',
            itens: [
                {
                    material_id: criado.id,
                    classe_identificada: criado.classe_deteccao_ia,
                    quantidade_esperada: 16,
                    quantidade_ia: 14,
                    confianca_media: 0.86,
                    quadro_chave_evidencia_url: 'data:image/jpeg;base64,/9j/evidencia=='
                }
            ],
            acoes_executadas: [
                {
                    tipo: 'alertar_saida_indevida',
                    material_id: criado.id,
                    material_nome: criado.nome,
                    mensagem: 'Caixa detectada saindo da doca fora da janela.'
                }
            ]
        }, ADMIN_USER);

        expect(conf.sessao.itens_contados[0].quadro_chave_evidencia_url).toBe('data:image/jpeg;base64,/9j/evidencia==');
        expect(conf.sessao.itens_contados[0].acao_aplicada).toBe('alertar_saida_indevida');
        expect(conf.sessao.acoes_executadas.length).toBe(1);
    });

    test('gera convite com link e QR Code, e autentica via convite mágico', async () => {
        const prod = await producaoService.criarProdutor(EVENTO_ID, {
            nome: 'Produtor Teste Convite',
            papel_producao: 'produtor_area',
            email: 'convite@teste.com'
        }, ADMIN_USER);

        const convite = await producaoService.gerarConviteProdutor(EVENTO_ID, prod.id, ADMIN_USER);
        expect(convite.link).toContain('convite_producao=');
        expect(convite.qr_code_url).toMatch(/^data:image\/png;base64,/);

        // Extrai o token do convite do link
        const urlObj = new URL(convite.link);
        const tokenConvite = urlObj.searchParams.get('convite_producao');

        // Autentica no portal usando o convite mágico
        const sessao = await producaoService.autenticarPorConviteProdutor({
            evento_id: EVENTO_ID,
            convite_token: tokenConvite
        });

        expect(sessao.token).toBeTruthy();
        expect(sessao.produtor.nome).toBe('Produtor Teste Convite');
        expect(sessao.politicas.exigir_lgpd_primeiro_acesso).toBe(true);

        // Aceita o termo LGPD
        const termo = await producaoService.aceitarTermoLgpdProdutor(EVENTO_ID, prod.id, { id: prod.id, produtor_id: prod.id });
        expect(termo.ok).toBe(true);
        expect(termo.termo_lgpd_aceito).toBe(true);
    });
});
