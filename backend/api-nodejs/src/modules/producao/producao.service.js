'use strict';

const { v4: uuidv4 } = require('uuid');
const { supabase } = require('../../config/supabase');
const logger = require('../../services/logger');
const calculos = require('./producaoCalculos');
const portalAuth = require('./producaoPortalAuth');
const { gerarRelatorioPdfBuffer } = require('./producaoPdf.service');
const { criarDadosDemonstracao, TEMPLATES_TAREFAS } = require('./producaoSeed');
const producaoRepositorio = require('./producaoRepositorio');

const ESTADO_VAZIO = () => ({
    areas: [],
    produtores: [],
    projetos: [],
    plantas: [],
    propostas_planta: [],
    tarefas: [],
    dependencias_tarefas: [],
    marcos: [],
    materiais: [],
    recebimentos: [],
    sessoes_contagem: [],
    movimentacoes_materiais: [],
    orcamentos: [],
    escalas: [],
    registros_presenca: [],
    template_relatorio: {
        nome: 'Padrão NZT',
        cor_cabecalho_hex: '#0A1628',
        rodape_personalizado: 'Relatório oficial de produção • NZT Eventos',
        marca_dagua_texto: 'USO INTERNO • PRODUÇÃO NZT',
        marca_dagua_opacidade: 0.08,
        horario_diario_automatico: '22:00',
        exibir_fotos_evidencia: true,
        exibir_financeiro: false
    },
    relatorios_gerados: [],
    auditoria: []
});

// Cache/fallback em memória (útil para testes unitários ou Supabase offline)
const memoriaEventos = new Map();

function erroHttp(mensagem, status = 400) {
    const err = new Error(mensagem);
    err.status = status;
    return err;
}

function registrarAuditoria(estado, ctx, acao, entidade, entidadeId, antes = null, depois = null) {
    estado.auditoria = estado.auditoria || [];
    estado.auditoria.unshift({
        id: uuidv4(),
        usuario_id: ctx?.userId || null,
        usuario_nome: ctx?.nome || 'Sistema',
        acao,
        entidade,
        entidade_id: entidadeId || null,
        antes,
        depois,
        criado_em: new Date().toISOString()
    });
    if (estado.auditoria.length > 250) {
        estado.auditoria = estado.auditoria.slice(0, 250);
    }
}

async function carregarEstadoEvento(eventoId, { criarSeVazio = false, usuario = {} } = {}) {
    if (!eventoId) throw erroHttp('Selecione um evento ativo para acessar a Produção.', 400);

    try {
        const { data, error } = await supabase
            .from('eventos')
            .select('id, nome, config')
            .eq('id', eventoId)
            .maybeSingle();

        if (!error && data) {
            const mod = data.config?.modulo_producao;
            if (mod && typeof mod === 'object') {
                memoriaEventos.set(eventoId, { evento: data, estado: mod });
                return { evento: data, estado: mod };
            }
            if (criarSeVazio) {
                const novoEstado = criarDadosDemonstracao(eventoId, usuario);
                await salvarEstadoEvento(eventoId, novoEstado, data.config || {});
                return { evento: data, estado: novoEstado };
            }
            const vazio = ESTADO_VAZIO();
            memoriaEventos.set(eventoId, { evento: data, estado: vazio });
            return { evento: data, estado: vazio };
        }
    } catch (err) {
        logger.debug(`[Produção] Fallback memória para evento ${eventoId}: ${err.message}`);
    }

    if (memoriaEventos.has(eventoId)) {
        return memoriaEventos.get(eventoId);
    }

    const estadoInicial = criarSeVazio ? criarDadosDemonstracao(eventoId, usuario) : ESTADO_VAZIO();
    const registro = { evento: { id: eventoId, nome: 'Evento em produção', config: {} }, estado: estadoInicial };
    memoriaEventos.set(eventoId, registro);
    return registro;
}

async function salvarEstadoEvento(eventoId, estado, configAtual = null) {
    const atualMem = memoriaEventos.get(eventoId);
    const eventoBase = atualMem?.evento || { id: eventoId, nome: 'Evento em produção', config: {} };
    let baseConfig = configAtual || eventoBase.config || {};

    try {
        if (!configAtual) {
            const { data } = await supabase.from('eventos').select('config').eq('id', eventoId).maybeSingle();
            if (data?.config) baseConfig = data.config;
        }
        const novoConfig = { ...baseConfig, modulo_producao: estado };
        const { error } = await supabase
            .from('eventos')
            .update({ config: novoConfig, updated_at: new Date().toISOString() })
            .eq('id', eventoId);
        if (!error) {
            eventoBase.config = novoConfig;
        }
        await producaoRepositorio.sincronizarTabelasRelacionais(eventoId, estado);
    } catch (err) {
        logger.debug(`[Produção] Persistência em memória mantida (${err.message})`);
    }

    memoriaEventos.set(eventoId, { evento: eventoBase, estado });
}

function verificarAcessoTarefa(tarefa, ctx) {
    if (!tarefa) throw erroHttp('Tarefa não encontrada.', 404);
    if (['admin_master', 'master', 'produtor_geral', 'arquiteto_evento', 'auditoria', 'financeiro'].includes(ctx.papel_producao)) {
        return;
    }
    if (ctx.papel_producao === 'produtor_area') {
        if (ctx.area_id && tarefa.area_id === ctx.area_id) return;
        if (ctx.produtorId && tarefa.produtor_atribuido_id === ctx.produtorId) return;
        throw erroHttp('Acesso negado: você só pode operar tarefas da sua área de atuação.', 403);
    }
    if (ctx.papel_producao === 'staff') {
        if (ctx.produtorId && tarefa.produtor_atribuido_id === ctx.produtorId) return;
        throw erroHttp('Acesso negado: esta tarefa não está atribuída a você.', 403);
    }
    throw erroHttp('Perfil sem permissão para operar tarefas.', 403);
}

/**
 * Monta o resumo completo respeitando rigorosamente as permissões de área e cachê no servidor.
 */
async function obterResumo(eventoId, user, headers = {}) {
    const { evento, estado } = await carregarEstadoEvento(eventoId, { criarSeVazio: false, usuario: user });
    const ctx = calculos.resolverContextoUsuario(estado, user, headers);

    const todasTarefasAnalisadas = calculos.calcularCaminhoCritico(
        (estado.tarefas || []).map((t) => ({ ...t, fase_operacional: t.fase_operacional || 'montagem' })),
        estado.dependencias_tarefas || []
    );
    const tarefasPermitidas = calculos.filtrarTarefasPorPermissao(todasTarefasAnalisadas, ctx);

    const resumoFases = ['montagem', 'evento', 'desmontagem'].reduce((acc, fase) => {
        const lista = tarefasPermitidas.filter((t) => (t.fase_operacional || 'montagem') === fase);
        acc.contagem[fase] = lista.length;
        acc.progresso[fase] = lista.length > 0
            ? Math.round(lista.reduce((s, t) => s + Number(t.percentual_concluido || 0), 0) / lista.length)
            : 0;
        return acc;
    }, { contagem: {}, progresso: {} });

    const produtoresSanitizados = (estado.produtores || []).map((p) =>
        calculos.sanitizarProdutorParaUsuario(p, ctx)
    );

    const plantaPrincipal = (estado.plantas || [])[0] || null;
    const versaoOficialAtual = plantaPrincipal
        ? [...(plantaPrincipal.versoes || [])].sort((a, b) => b.numero_versao - a.numero_versao)[0]
        : null;

    const propostasComDiff = (estado.propostas_planta || []).map((prop) => {
        const versaoBase = plantaPrincipal?.versoes?.find((v) => v.id === prop.planta_versao_base_id) || versaoOficialAtual;
        const diff = versaoBase ? calculos.compararPropostaPlanta(versaoBase, prop) : null;
        const conflitos = versaoBase
            ? calculos.detectarConflitosPropostas(versaoBase, prop, estado.propostas_planta || [])
            : [];
        return { ...prop, diff, conflitos };
    });

    const podeFinanceiro = calculos.podeVerOrcamentos(ctx);
    const orcamentos = podeFinanceiro ? (estado.orcamentos || []) : [];
    const totalOrcPrev = orcamentos.reduce((s, o) => s + Number(o.valor_previsto_centavos || 0), 0);
    const totalOrcReal = orcamentos.reduce((s, o) => s + Number(o.valor_realizado_centavos || 0), 0);

    const progressoGeral = tarefasPermitidas.length > 0
        ? Math.round(tarefasPermitidas.reduce((acc, t) => acc + Number(t.percentual_concluido || 0), 0) / tarefasPermitidas.length)
        : 0;

    const presencas = estado.registros_presenca || [];
    const ultimoPorProdutor = new Map();
    for (const r of presencas) {
        if (!ultimoPorProdutor.has(r.produtor_id)) ultimoPorProdutor.set(r.produtor_id, r);
    }
    const presentesAgora = [...ultimoPorProdutor.values()].filter((r) => r.tipo === 'checkin').length;

    const itensNaoReconhecidos = (estado.sessoes_contagem || [])
        .flatMap((s) => (s.itens_contados || []).map((i) => ({ ...i, sessao_id: s.id })))
        .filter((i) => !i.reconhecido_catalogo && !i.cadastrado_em);

    // Métricas avançadas de engenharia de produção (lead time, retrabalho, aderência e custo de dobras)
    const concluidasComTempo = tarefasPermitidas.filter((t) => t.status === 'concluida' && t.data_inicio_real && t.data_fim_real);
    const leadTimeMedioHoras = concluidasComTempo.length > 0
        ? Math.round((concluidasComTempo.reduce((acc, t) => acc + Math.max(0, (new Date(t.data_fim_real) - new Date(t.data_inicio_real)) / 3600000), 0) / concluidasComTempo.length) * 10) / 10
        : 0;
    const totalReaberturas = tarefasPermitidas.filter((t) => t.status === 'reaberta' || t.motivo_reabertura).length;
    const noPrazoCount = tarefasPermitidas.filter((t) => t.saude_prazo === 'no_prazo' || (t.saude_prazo === 'concluida' && Number(t.atraso_previsto_horas || 0) <= 0)).length;
    const aderenciaCronogramaPct = tarefasPermitidas.length > 0
        ? Math.round((noPrazoCount / tarefasPermitidas.length) * 100)
        : 100;

    const custoDobrasCentavos = (presencas.filter((r) => r.eh_dobra_detectada)).reduce((acc, r) => {
        const prod = (estado.produtores || []).find((p) => p.id === r.produtor_id);
        return acc + Number(prod?.valor_cache_centavos || 80000);
    }, 0);

    const tabelasRelacionaisAtivas = await producaoRepositorio.verificarTabelasRelacionais();

    return {
        evento: { id: evento.id, nome: evento.nome },
        status_banco: {
            tabelas_relacionais_ativas: tabelasRelacionaisAtivas,
            modo_persistencia: tabelasRelacionaisAtivas ? 'relacional_e_config' : 'config_jsonb',
            arquivo_migration: 'supabase/migrations/20261119b_modulo_producao.sql'
        },
        contexto_usuario: ctx,
        kpis: {
            progresso_geral: progressoGeral,
            total_tarefas: tarefasPermitidas.length,
            tarefas_concluidas: tarefasPermitidas.filter((t) => t.status === 'concluida').length,
            tarefas_atrasadas: tarefasPermitidas.filter((t) => t.saude_prazo === 'atrasada').length,
            tarefas_em_risco: tarefasPermitidas.filter((t) => t.saude_prazo === 'em_risco').length,
            progresso_por_fase: resumoFases.progresso,
            contagem_por_fase: resumoFases.contagem,
            lead_time_medio_horas: leadTimeMedioHoras,
            total_reaberturas: totalReaberturas,
            aderencia_cronograma_pct: aderenciaCronogramaPct,
            propostas_pendentes: propostasComDiff.filter((p) => p.status === 'pendente').length,
            presentes_agora: presentesAgora,
            dobras_detectadas: presencas.filter((r) => r.eh_dobra_detectada).length,
            custo_dobras_centavos: podeFinanceiro ? custoDobrasCentavos : null,
            materiais_divergentes: (estado.materiais || []).filter((m) =>
                Number(m.quantidade_recebida || 0) !== Number(m.quantidade_planejada || 0) && Number(m.quantidade_recebida || 0) > 0
            ).length,
            itens_nao_reconhecidos: itensNaoReconhecidos.length,
            orcamento_previsto_centavos: podeFinanceiro ? totalOrcPrev : null,
            orcamento_realizado_centavos: podeFinanceiro ? totalOrcReal : null
        },
        areas: estado.areas || [],
        produtores: produtoresSanitizados,
        projetos: estado.projetos || [],
        plantas: estado.plantas || [],
        propostas_planta: propostasComDiff,
        tarefas: tarefasPermitidas,
        dependencias_tarefas: estado.dependencias_tarefas || [],
        marcos: estado.marcos || [],
        templates_disponiveis: Object.entries(TEMPLATES_TAREFAS).map(([chave, val]) => ({
            chave,
            rotulo: val.rotulo,
            quantidade_tarefas: val.tarefas.length
        })),
        materiais: estado.materiais || [],
        recebimentos: estado.recebimentos || [],
        sessoes_contagem: estado.sessoes_contagem || [],
        itens_nao_reconhecidos: itensNaoReconhecidos,
        movimentacoes_materiais: estado.movimentacoes_materiais || [],
        orcamentos,
        orcamentos_restrito: !podeFinanceiro,
        escalas: estado.escalas || [],
        registros_presenca: presencas,
        template_relatorio: estado.template_relatorio,
        relatorios_gerados: estado.relatorios_gerados || [],
        auditoria: (estado.auditoria || []).slice(0, 60)
    };
}

async function carregarSeed(eventoId, user, headers = {}) {
    if (user?.eh_portal_produtor) {
        throw erroHttp('Acesso negado para operação administrativa.', 403);
    }
    const novoEstado = criarDadosDemonstracao(eventoId, user);
    await salvarEstadoEvento(eventoId, novoEstado);
    return obterResumo(eventoId, user, headers);
}

async function criarArea(eventoId, dados, user, headers = {}) {
    const { estado } = await carregarEstadoEvento(eventoId, { usuario: user });
    const ctx = calculos.resolverContextoUsuario(estado, user, headers);
    if (!['admin_master', 'master', 'produtor_geral'].includes(ctx.papel_producao)) {
        throw erroHttp('Apenas o Produtor Geral ou Admin Master pode criar áreas.', 403);
    }
    const nome = String(dados.nome || '').trim();
    if (!nome) throw erroHttp('Informe o nome da área de atuação.', 400);

    const nova = {
        id: uuidv4(),
        evento_id: eventoId,
        nome,
        cor: dados.cor || '#00D4FF',
        descricao: dados.descricao || '',
        responsavel_nome: dados.responsavel_nome || '',
        ativo: true
    };
    estado.areas.push(nova);
    registrarAuditoria(estado, ctx, 'CRIAR_AREA', 'AREA', nova.id, null, nova);
    await salvarEstadoEvento(eventoId, estado);
    return nova;
}

/**
 * Define ou atualiza o login e o hash de senha exclusivos do Portal dos Produtores,
 * mantendo os produtores totalmente isolados dos usuários operadores do Painel NZT.
 */
function prepararCredencialPortalProdutor(estado, produtor, { loginInformado, senhaBruta }) {
    const loginLimpo = String(loginInformado !== undefined ? loginInformado : (produtor.login_acesso || produtor.email || ''))
        .trim()
        .toLowerCase();

    if (!loginLimpo || loginLimpo.length < 3 || /\s/.test(loginLimpo)) {
        throw erroHttp('Informe um login ou e-mail válido para o portal do produtor (mínimo 3 caracteres, sem espaços).', 400);
    }

    const senhaLimpa = String(senhaBruta || '').trim();
    if (senhaLimpa.length < 6) {
        throw erroHttp('A senha de acesso do produtor deve ter no mínimo 6 caracteres.', 400);
    }

    const duplicado = (estado?.produtores || []).find((p) => {
        if (p.id === produtor.id) return false;
        if (p.status === 'inativo' || p.ativo === false) return false;
        const existente = String(p.login_acesso || p.email || '').trim().toLowerCase();
        return Boolean(existente && existente === loginLimpo);
    });
    if (duplicado) {
        throw erroHttp(`O login "${loginLimpo}" já está em uso pelo produtor "${duplicado.nome}".`, 400);
    }

    return {
        login_acesso: loginLimpo,
        email: (loginLimpo.includes('@') && !produtor.email) ? loginLimpo : (produtor.email || null),
        senha_hash: portalAuth.gerarHashSenha(senhaLimpa),
        possui_login: true,
        login_atualizado_em: new Date().toISOString()
    };
}

async function criarProdutor(eventoId, dados, user, headers = {}) {
    const { estado } = await carregarEstadoEvento(eventoId, { usuario: user });
    const ctx = calculos.resolverContextoUsuario(estado, user, headers);
    if (!['admin_master', 'master', 'produtor_geral'].includes(ctx.papel_producao)) {
        throw erroHttp('Apenas o Produtor Geral ou Admin Master pode cadastrar produtores.', 403);
    }
    const nome = String(dados.nome || '').trim();
    if (!nome) throw erroHttp('Informe o nome do produtor.', 400);

    const emailLimpo = dados.email ? String(dados.email).trim().toLowerCase() : null;
    const loginLimpo = dados.login_acesso ? String(dados.login_acesso).trim().toLowerCase() : emailLimpo;
    const valorCentavos = Math.max(0, Math.round(Number(dados.valor_cache_centavos || 0)));

    const novo = {
        id: uuidv4(),
        evento_id: eventoId,
        user_id: dados.user_id || null,
        nome,
        email: emailLimpo,
        login_acesso: loginLimpo,
        telefone: dados.telefone || null,
        documento: dados.documento || null,
        foto_url: dados.foto_url || null,
        area_id: dados.area_id || null,
        papel_producao: dados.papel_producao || 'produtor_area',
        tipo_cache: dados.tipo_cache || 'diaria',
        valor_cache_centavos: valorCentavos,
        dados_bancarios_cifrados: calculos.cifrarDadosBancarios(dados.chave_pix || ''),
        historico_cache: valorCentavos > 0 ? [{ data: new Date().toISOString(), valor_centavos: valorCentavos, motivo: 'Cadastro inicial' }] : [],
        periodo_inicio: dados.periodo_inicio || null,
        periodo_fim: dados.periodo_fim || null,
        termo_lgpd_aceito: Boolean(dados.termo_lgpd_aceito),
        termo_lgpd_data: dados.termo_lgpd_aceito ? new Date().toISOString() : null,
        senha_hash: null,
        possui_login: false,
        login_atualizado_em: null,
        status: 'ativo',
        ativo: true
    };

    const senhaInicial = dados.senha_acesso || dados.senha;
    if (senhaInicial && String(senhaInicial).trim() !== '') {
        const credencial = prepararCredencialPortalProdutor(estado, novo, {
            loginInformado: loginLimpo,
            senhaBruta: senhaInicial
        });
        novo.login_acesso = credencial.login_acesso;
        novo.email = credencial.email;
        novo.senha_hash = credencial.senha_hash;
        novo.possui_login = true;
        novo.login_atualizado_em = credencial.login_atualizado_em;
    }

    estado.produtores.push(novo);
    registrarAuditoria(estado, ctx, 'CRIAR_PRODUTOR', 'PRODUTOR', novo.id, null, {
        nome: novo.nome,
        papel: novo.papel_producao,
        login_acesso: novo.login_acesso,
        possui_login: novo.possui_login
    });
    await salvarEstadoEvento(eventoId, estado);
    return calculos.sanitizarProdutorParaUsuario(novo, ctx);
}

async function atualizarProdutor(eventoId, produtorId, dados, user, headers = {}) {
    const { estado } = await carregarEstadoEvento(eventoId, { usuario: user });
    const ctx = calculos.resolverContextoUsuario(estado, user, headers);
    if (!['admin_master', 'master', 'produtor_geral', 'financeiro'].includes(ctx.papel_producao)) {
        throw erroHttp('Apenas Produtor Geral, Financeiro ou Admin Master pode alterar cadastro/cachê de produtor.', 403);
    }
    const produtor = (estado.produtores || []).find((p) => p.id === produtorId);
    if (!produtor) throw erroHttp('Produtor não encontrado.', 404);

    const antes = { papel: produtor.papel_producao, area_id: produtor.area_id, valor_cache_centavos: produtor.valor_cache_centavos, status: produtor.status };

    if (dados.nome !== undefined) produtor.nome = String(dados.nome).trim() || produtor.nome;
    if (dados.email !== undefined) produtor.email = dados.email ? String(dados.email).trim().toLowerCase() : null;
    if (dados.login_acesso !== undefined) {
        produtor.login_acesso = dados.login_acesso ? String(dados.login_acesso).trim().toLowerCase() : null;
    }
    if (dados.telefone !== undefined) produtor.telefone = dados.telefone || null;
    if (dados.documento !== undefined) produtor.documento = dados.documento || null;
    if (dados.area_id !== undefined) produtor.area_id = dados.area_id || null;
    if (dados.papel_producao !== undefined) produtor.papel_producao = dados.papel_producao;
    if (dados.tipo_cache !== undefined) produtor.tipo_cache = dados.tipo_cache;
    if (dados.status !== undefined) {
        produtor.status = dados.status;
        produtor.ativo = dados.status === 'ativo';
    }
    if (dados.periodo_inicio !== undefined) produtor.periodo_inicio = dados.periodo_inicio || null;
    if (dados.periodo_fim !== undefined) produtor.periodo_fim = dados.periodo_fim || null;
    if (dados.chave_pix !== undefined && dados.chave_pix !== '') {
        produtor.dados_bancarios_cifrados = calculos.cifrarDadosBancarios(dados.chave_pix);
    }
    if (dados.valor_cache_centavos !== undefined) {
        const novoValor = Math.max(0, Math.round(Number(dados.valor_cache_centavos)));
        if (novoValor !== Number(produtor.valor_cache_centavos || 0)) {
            produtor.historico_cache = produtor.historico_cache || [];
            produtor.historico_cache.unshift({
                data: new Date().toISOString(),
                valor_anterior_centavos: Number(produtor.valor_cache_centavos || 0),
                valor_centavos: novoValor,
                alterado_por: ctx.nome,
                motivo: dados.motivo_cache || 'Reajuste de cachê'
            });
            produtor.valor_cache_centavos = novoValor;
        }
    }

    const senhaNova = dados.senha_acesso || dados.senha;
    if (senhaNova && String(senhaNova).trim() !== '') {
        if (!['admin_master', 'master', 'produtor_geral'].includes(ctx.papel_producao)) {
            throw erroHttp('Apenas o Produtor Geral ou Admin Master pode definir login e senha de produtores.', 403);
        }
        const credencial = prepararCredencialPortalProdutor(estado, produtor, {
            loginInformado: dados.login_acesso !== undefined ? dados.login_acesso : (dados.email !== undefined ? dados.email : produtor.login_acesso),
            senhaBruta: senhaNova
        });
        produtor.login_acesso = credencial.login_acesso;
        produtor.email = credencial.email;
        produtor.senha_hash = credencial.senha_hash;
        produtor.possui_login = true;
        produtor.login_atualizado_em = credencial.login_atualizado_em;
    }

    registrarAuditoria(estado, ctx, 'ATUALIZAR_PRODUTOR', 'PRODUTOR', produtor.id, antes, {
        papel: produtor.papel_producao,
        area_id: produtor.area_id,
        valor_cache_centavos: produtor.valor_cache_centavos,
        status: produtor.status,
        possui_login: Boolean(produtor.senha_hash || produtor.possui_login)
    });
    await salvarEstadoEvento(eventoId, estado);
    return calculos.sanitizarProdutorParaUsuario(produtor, ctx);
}

async function definirAcessoProdutor(eventoId, produtorId, dados, user, headers = {}) {
    const { evento, estado } = await carregarEstadoEvento(eventoId, { usuario: user });
    const ctx = calculos.resolverContextoUsuario(estado, user, headers);
    if (!['admin_master', 'master', 'produtor_geral'].includes(ctx.papel_producao)) {
        throw erroHttp('Apenas o Produtor Geral ou Admin Master pode definir login e senha de produtores.', 403);
    }
    const produtor = (estado.produtores || []).find((p) => p.id === produtorId);
    if (!produtor) throw erroHttp('Produtor não encontrado.', 404);

    const loginInformado = dados.login_acesso !== undefined ? dados.login_acesso : dados.email;
    const senha = dados.senha_acesso || dados.senha;
    const credencial = prepararCredencialPortalProdutor(estado, produtor, {
        loginInformado,
        senhaBruta: senha
    });

    produtor.login_acesso = credencial.login_acesso;
    produtor.email = credencial.email;
    produtor.senha_hash = credencial.senha_hash;
    produtor.possui_login = true;
    produtor.login_atualizado_em = credencial.login_atualizado_em;

    registrarAuditoria(estado, ctx, 'DEFINIR_ACESSO_PRODUTOR', 'PRODUTOR', produtor.id, null, {
        login_acesso: produtor.login_acesso,
        possui_login: true
    });
    await salvarEstadoEvento(eventoId, estado);

    const baseUrl = (process.env.FRONTEND_URL || (process.env.NODE_ENV === 'production' ? 'https://painel.nzt.app.br' : 'http://localhost:5173')).replace(/\/+$/, '');
    const linkPortal = `${baseUrl}/portal-produtor?evento_id=${eventoId}`;

    return {
        produtor: calculos.sanitizarProdutorParaUsuario(produtor, ctx),
        acesso_provisionado: true,
        login_acesso: produtor.login_acesso,
        email: produtor.email,
        link_portal: linkPortal,
        mensagem_whatsapp: `Olá ${produtor.nome}! Seu acesso ao Portal Exclusivo de Produção do evento "${evento?.nome || 'NZT Eventos'}" está ativo.\nLink do portal: ${linkPortal}\nLogin: ${produtor.login_acesso}\nSenha: ${String(senha).trim()}`
    };
}

async function gerarConviteProdutor(eventoId, produtorId, user, headers = {}) {
    const { evento, estado } = await carregarEstadoEvento(eventoId, { usuario: user });
    const ctx = calculos.resolverContextoUsuario(estado, user, headers);
    if (!['admin_master', 'master', 'produtor_geral'].includes(ctx.papel_producao)) {
        throw erroHttp('Apenas o Produtor Geral ou Admin Master pode gerar convites.', 403);
    }
    const produtor = (estado.produtores || []).find((p) => p.id === produtorId);
    if (!produtor) throw erroHttp('Produtor não encontrado.', 404);

    const tokenConvite = produtor.convite_token || uuidv4();
    produtor.convite_token = tokenConvite;
    produtor.convite_gerado_em = new Date().toISOString();

    const baseUrl = (process.env.FRONTEND_URL || (process.env.NODE_ENV === 'production' ? 'https://painel.nzt.app.br' : 'http://localhost:5173')).replace(/\/+$/, '');
    const link = `${baseUrl}/portal-produtor?evento_id=${eventoId}&convite_producao=${tokenConvite}`;
    const mensagemWhatsapp = `Olá ${produtor.nome}! Você foi convidado(a) para atuar na produção do evento "${evento?.nome || 'NZT Eventos'}". Acesse o Portal Exclusivo de Produtores pelo link: ${link}`;

    registrarAuditoria(estado, ctx, 'GERAR_CONVITE_PRODUTOR', 'PRODUTOR', produtor.id, null, { login_acesso: produtor.login_acesso || produtor.email });
    await salvarEstadoEvento(eventoId, estado);
    return { produtor_id: produtor.id, nome: produtor.nome, link, mensagem_whatsapp: mensagemWhatsapp };
}

async function anonimizarProdutorLgpd(eventoId, produtorId, user, headers = {}) {
    const { estado } = await carregarEstadoEvento(eventoId, { usuario: user });
    const ctx = calculos.resolverContextoUsuario(estado, user, headers);
    if (!['admin_master', 'master', 'produtor_geral'].includes(ctx.papel_producao)) {
        throw erroHttp('Apenas o Produtor Geral ou Admin Master pode executar anonimização LGPD.', 403);
    }
    const produtor = (estado.produtores || []).find((p) => p.id === produtorId);
    if (!produtor) throw erroHttp('Produtor não encontrado.', 404);

    produtor.nome = `Produtor Anonimizado (${produtor.id.slice(0, 6)})`;
    produtor.email = null;
    produtor.login_acesso = null;
    produtor.senha_hash = null;
    produtor.possui_login = false;
    produtor.telefone = null;
    produtor.documento = null;
    produtor.foto_url = null;
    produtor.dados_bancarios_cifrados = null;
    produtor.status = 'inativo';
    produtor.ativo = false;
    produtor.lgpd_anonimizado_em = new Date().toISOString();

    registrarAuditoria(estado, ctx, 'LGPD_ANONIMIZAR_PRODUTOR', 'PRODUTOR', produtor.id, null, { anonimizado: true });
    await salvarEstadoEvento(eventoId, estado);
    return calculos.sanitizarProdutorParaUsuario(produtor, ctx);
}

/**
 * Autentica um produtor diretamente no Portal Separado (/portal-produtor) usando
 * as credenciais armazenadas no Módulo de Produção (sem criar usuário operador no Painel NZT).
 */
async function autenticarPortalProdutor({ login, email, senha, evento_id } = {}) {
    const loginLimpo = String(login || email || '').trim().toLowerCase();
    const senhaLimpa = String(senha || '').trim();

    if (!loginLimpo || !senhaLimpa) {
        throw erroHttp('Informe seu login e sua senha de acesso.', 400);
    }

    const candidatos = [];

    if (evento_id) {
        const reg = await carregarEstadoEvento(evento_id, { criarSeVazio: false });
        if (reg?.estado) {
            candidatos.push({ evento: reg.evento, estado: reg.estado });
        }
    } else {
        for (const reg of memoriaEventos.values()) {
            if (reg?.evento?.id && reg?.estado) {
                candidatos.push(reg);
            }
        }
        try {
            const { data: eventosDb, error } = await supabase
                .from('eventos')
                .select('id, nome, config');
            if (!error && Array.isArray(eventosDb)) {
                for (const ev of eventosDb) {
                    const mod = ev?.config?.modulo_producao;
                    if (mod && typeof mod === 'object' && !candidatos.some((c) => c.evento?.id === ev.id)) {
                        candidatos.push({ evento: ev, estado: mod });
                    }
                }
            }
        } catch {
            // Fallback em memória já carregado acima
        }
    }

    const matches = [];
    for (const item of candidatos) {
        const produtoresAtivos = (item.estado?.produtores || []).filter(
            (p) => p && p.status !== 'inativo' && p.ativo !== false
        );
        for (const p of produtoresAtivos) {
            const pLogin = String(p.login_acesso || '').trim().toLowerCase();
            const pEmail = String(p.email || '').trim().toLowerCase();
            if ((pLogin && pLogin === loginLimpo) || (pEmail && pEmail === loginLimpo)) {
                if (portalAuth.verificarSenha(senhaLimpa, p.senha_hash)) {
                    matches.push({ evento: item.evento, estado: item.estado, produtor: p });
                }
            }
        }
    }

    if (matches.length === 0) {
        throw erroHttp('Login ou senha inválidos. Verifique suas credenciais com a coordenação de produção.', 401);
    }

    const escolhido = matches[0];
    const { evento, estado, produtor } = escolhido;
    const token = portalAuth.assinarTokenProdutor({
        produtor_id: produtor.id,
        evento_id: evento.id,
        nome: produtor.nome,
        login_acesso: produtor.login_acesso || produtor.email,
        email: produtor.email || produtor.login_acesso,
        papel_producao: produtor.papel_producao,
        area_id: produtor.area_id
    });

    const ctx = calculos.resolverContextoUsuario(estado, {
        eh_portal_produtor: true,
        produtor_id: produtor.id,
        login_acesso: produtor.login_acesso || produtor.email,
        email: produtor.email,
        nome: produtor.nome
    });

    registrarAuditoria(estado, ctx, 'LOGIN_PORTAL_PRODUTOR', 'PRODUTOR', produtor.id, null, {
        login_acesso: produtor.login_acesso || produtor.email
    });
    await salvarEstadoEvento(evento.id, estado);

    return {
        token,
        evento: { id: evento.id, nome: evento.nome || 'Evento em produção' },
        produtor: calculos.sanitizarProdutorParaUsuario(produtor, ctx),
        eventos_disponiveis: matches.map((m) => ({
            id: m.evento.id,
            nome: m.evento.nome || 'Evento em produção',
            papel_producao: m.produtor.papel_producao,
            area_id: m.produtor.area_id || null
        }))
    };
}

async function criarProjeto(eventoId, dados, user, headers = {}) {
    const { estado } = await carregarEstadoEvento(eventoId, { usuario: user });
    const ctx = calculos.resolverContextoUsuario(estado, user, headers);
    const titulo = String(dados.titulo || '').trim();
    if (!titulo) throw erroHttp('Informe o título do projeto.', 400);

    const novo = {
        id: uuidv4(),
        evento_id: eventoId,
        area_id: dados.area_id || ctx.area_id || null,
        titulo,
        categoria: dados.categoria || 'arquitetura',
        descricao: dados.descricao || '',
        status: 'em_elaboracao',
        arquivos: dados.nome_arquivo ? [{
            id: uuidv4(),
            versao: 1,
            nome_original: dados.nome_arquivo,
            extensao: (dados.nome_arquivo.split('.').pop() || 'PDF').toUpperCase(),
            tamanho_bytes: Number(dados.tamanho_bytes || 0),
            url_arquivo: dados.url_arquivo || null,
            largura_px: Number(dados.largura_px || 0) || null,
            altura_px: Number(dados.altura_px || 0) || null,
            observacao: dados.observacao_arquivo || 'Versão inicial',
            criado_em: new Date().toISOString()
        }] : []
    };
    estado.projetos.unshift(novo);
    registrarAuditoria(estado, ctx, 'CRIAR_PROJETO', 'PROJETO', novo.id, null, { titulo: novo.titulo });
    await salvarEstadoEvento(eventoId, estado);
    return novo;
}

async function adicionarArquivoProjeto(eventoId, projetoId, dados, user, headers = {}) {
    const { estado } = await carregarEstadoEvento(eventoId, { usuario: user });
    const ctx = calculos.resolverContextoUsuario(estado, user, headers);
    const projeto = (estado.projetos || []).find((p) => p.id === projetoId);
    if (!projeto) throw erroHttp('Projeto não encontrado.', 404);

    const nomeOriginal = String(dados.nome_original || '').trim();
    if (!nomeOriginal) throw erroHttp('Informe o nome do arquivo.', 400);

    const maiorVersao = (projeto.arquivos || []).reduce((m, a) => Math.max(m, Number(a.versao || 0)), 0);
    const novoArq = {
        id: uuidv4(),
        versao: maiorVersao + 1,
        nome_original: nomeOriginal,
        extensao: (nomeOriginal.split('.').pop() || 'PDF').toUpperCase(),
        tamanho_bytes: Number(dados.tamanho_bytes || 0),
        url_storage: dados.url_storage || null,
        url_arquivo: dados.url_arquivo || dados.url_storage || null,
        largura_px: Number(dados.largura_px || 0) || null,
        altura_px: Number(dados.altura_px || 0) || null,
        observacao: dados.observacao || `Versão ${maiorVersao + 1}`,
        criado_por: ctx.nome,
        criado_em: new Date().toISOString()
    };
    projeto.arquivos = projeto.arquivos || [];
    projeto.arquivos.push(novoArq);
    registrarAuditoria(estado, ctx, 'NOVA_VERSAO_ARQUIVO', 'PROJETO', projeto.id, null, novoArq);
    await salvarEstadoEvento(eventoId, estado);
    return novoArq;
}

async function criarTarefa(eventoId, dados, user, headers = {}) {
    const { estado } = await carregarEstadoEvento(eventoId, { usuario: user });
    const ctx = calculos.resolverContextoUsuario(estado, user, headers);

    const titulo = String(dados.titulo || '').trim();
    const areaId = dados.area_id || ctx.area_id;
    if (!titulo) throw erroHttp('Informe o título da tarefa.', 400);
    if (!areaId) throw erroHttp('Selecione a área responsável pela tarefa.', 400);
    if (ctx.papel_producao === 'produtor_area' && ctx.area_id && areaId !== ctx.area_id) {
        throw erroHttp('Produtor de área só pode criar tarefas na própria área.', 403);
    }

    const etapas = (Array.isArray(dados.etapas) ? dados.etapas : ['Execução principal'])
        .filter((e) => String(typeof e === 'string' ? e : e?.descricao || '').trim())
        .map((e, idx) => ({
            id: uuidv4(),
            ordem: idx + 1,
            descricao: typeof e === 'string' ? e.trim() : e.descricao.trim(),
            obrigatoria: true,
            concluida: false,
            evidencias: []
        }));

    const faseValida = ['montagem', 'evento', 'desmontagem'].includes(dados.fase_operacional)
        ? dados.fase_operacional
        : 'montagem';

    const nova = {
        id: uuidv4(),
        evento_id: eventoId,
        area_id: areaId,
        setor_id: dados.setor_id || null,
        planta_id: dados.planta_id || null,
        elemento_planta_id: dados.elemento_planta_id || null,
        elemento_planta_rotulo: dados.elemento_planta_rotulo || null,
        fase_operacional: faseValida,
        titulo,
        objetivo: dados.objetivo || '',
        sugestoes_levar: Array.isArray(dados.sugestoes_levar) ? dados.sugestoes_levar : [],
        prioridade: dados.prioridade || 'media',
        status: 'disponivel',
        produtor_atribuido_id: dados.produtor_atribuido_id || null,
        data_inicio_planejada: dados.data_inicio_planejada || new Date().toISOString(),
        data_fim_planejada: dados.data_fim_planejada || new Date(Date.now() + 8 * 3600000).toISOString(),
        requer_aprovacao_conclusao: dados.requer_aprovacao_conclusao !== false,
        etapas
    };

    estado.tarefas.unshift(nova);
    if (dados.tarefa_predecessora_id) {
        estado.dependencias_tarefas = estado.dependencias_tarefas || [];
        estado.dependencias_tarefas.push({
            id: uuidv4(),
            tarefa_origem_id: dados.tarefa_predecessora_id,
            tarefa_dependente_id: nova.id,
            tipo: 'fim_para_inicio'
        });
    }

    registrarAuditoria(estado, ctx, 'CRIAR_TAREFA', 'TAREFA', nova.id, null, { titulo: nova.titulo });
    await salvarEstadoEvento(eventoId, estado);
    return { ...nova, ...calculos.calcularAnalisePrazoTarefa(nova) };
}

async function iniciarTarefa(eventoId, tarefaId, dados, user, headers = {}) {
    const { estado } = await carregarEstadoEvento(eventoId, { usuario: user });
    const ctx = calculos.resolverContextoUsuario(estado, user, headers);
    const tarefa = (estado.tarefas || []).find((t) => t.id === tarefaId);
    verificarAcessoTarefa(tarefa, ctx);

    const antes = { status: tarefa.status, produtor_atribuido_id: tarefa.produtor_atribuido_id };
    tarefa.status = 'em_andamento';
    tarefa.produtor_atribuido_id = tarefa.produtor_atribuido_id || ctx.produtorId || dados?.produtor_id || null;
    tarefa.data_inicio_real = tarefa.data_inicio_real || new Date().toISOString();
    if (dados?.geolocalizacao) tarefa.geolocalizacao_inicio = dados.geolocalizacao;

    registrarAuditoria(estado, ctx, 'INICIAR_TAREFA', 'TAREFA', tarefa.id, antes, { status: tarefa.status });
    await salvarEstadoEvento(eventoId, estado);
    return { ...tarefa, ...calculos.calcularAnalisePrazoTarefa(tarefa) };
}

async function alternarEtapaTarefa(eventoId, tarefaId, etapaId, dados, user, headers = {}) {
    const { estado } = await carregarEstadoEvento(eventoId, { usuario: user });
    const ctx = calculos.resolverContextoUsuario(estado, user, headers);
    const tarefa = (estado.tarefas || []).find((t) => t.id === tarefaId);
    verificarAcessoTarefa(tarefa, ctx);

    const etapa = (tarefa.etapas || []).find((e) => e.id === etapaId);
    if (!etapa) throw erroHttp('Etapa não encontrada.', 404);

    etapa.concluida = dados?.concluida !== undefined ? Boolean(dados.concluida) : !etapa.concluida;
    etapa.concluida_em = etapa.concluida ? new Date().toISOString() : null;
    etapa.concluida_por_nome = etapa.concluida ? ctx.nome : null;
    if (dados?.geolocalizacao) etapa.geolocalizacao = dados.geolocalizacao;

    if (!tarefa.data_inicio_real) tarefa.data_inicio_real = new Date().toISOString();

    const todasConcluidas = (tarefa.etapas || []).length > 0 && tarefa.etapas.every((e) => e.concluida);
    if (todasConcluidas) {
        if (tarefa.requer_aprovacao_conclusao) {
            tarefa.status = 'em_revisao';
        } else {
            tarefa.status = 'concluida';
            tarefa.data_fim_real = new Date().toISOString();
        }
    } else if (tarefa.status === 'disponivel' || tarefa.status === 'concluida' || tarefa.status === 'em_revisao') {
        tarefa.status = 'em_andamento';
        tarefa.data_fim_real = null;
    }

    const analise = calculos.calcularAnalisePrazoTarefa(tarefa);
    tarefa.percentual_concluido = analise.percentual_concluido;

    registrarAuditoria(estado, ctx, 'ATUALIZAR_ETAPA', 'TAREFA', tarefa.id, null, { etapa_id: etapa.id, concluida: etapa.concluida });
    await salvarEstadoEvento(eventoId, estado);
    return { ...tarefa, ...analise };
}

async function adicionarEvidenciaEtapa(eventoId, tarefaId, etapaId, dados, user, headers = {}) {
    const { estado } = await carregarEstadoEvento(eventoId, { usuario: user });
    const ctx = calculos.resolverContextoUsuario(estado, user, headers);
    const tarefa = (estado.tarefas || []).find((t) => t.id === tarefaId);
    verificarAcessoTarefa(tarefa, ctx);

    const etapa = (tarefa.etapas || []).find((e) => e.id === etapaId);
    if (!etapa) throw erroHttp('Etapa não encontrada.', 404);

    etapa.evidencias = etapa.evidencias || [];
    if (dados.sync_id) {
        const existente = etapa.evidencias.find((ev) => ev.sync_id === dados.sync_id);
        if (existente) return existente;
    }

    const novaEvidencia = {
        id: uuidv4(),
        sync_id: dados.sync_id || uuidv4(),
        tipo: dados.tipo || 'foto',
        url_arquivo: dados.url_arquivo || null,
        texto_comentario: dados.texto_comentario || null,
        transcricao_audio: dados.transcricao_audio || null,
        geolocalizacao: dados.geolocalizacao || null,
        autor_nome: ctx.nome,
        criado_em: dados.criado_em || new Date().toISOString()
    };
    etapa.evidencias.unshift(novaEvidencia);
    registrarAuditoria(estado, ctx, 'ANEXAR_EVIDENCIA', 'ETAPA', etapa.id, null, { tipo: novaEvidencia.tipo });
    await salvarEstadoEvento(eventoId, estado);
    return novaEvidencia;
}

async function avaliarTarefa(eventoId, tarefaId, { decisao, motivo }, user, headers = {}) {
    const { estado } = await carregarEstadoEvento(eventoId, { usuario: user });
    const ctx = calculos.resolverContextoUsuario(estado, user, headers);
    const tarefa = (estado.tarefas || []).find((t) => t.id === tarefaId);
    if (!tarefa) throw erroHttp('Tarefa não encontrada.', 404);

    if (decisao === 'bloquear') {
        verificarAcessoTarefa(tarefa, ctx);
        tarefa.status = 'bloqueada';
        tarefa.motivo_bloqueio = motivo || 'Impedimento reportado em campo';
    } else if (decisao === 'aprovar' || decisao === 'reabrir') {
        if (!calculos.podeAprovarTarefa(ctx)) {
            throw erroHttp('Apenas o Produtor Geral ou Admin Master pode aprovar ou reabrir tarefas.', 403);
        }
        if (decisao === 'aprovar') {
            tarefa.status = 'concluida';
            tarefa.data_fim_real = new Date().toISOString();
            tarefa.aprovado_em = new Date().toISOString();
            tarefa.aprovado_por_nome = ctx.nome;
            tarefa.percentual_concluido = 100;
        } else {
            tarefa.status = 'reaberta';
            tarefa.motivo_reabertura = motivo || 'Ajuste solicitado pela produção geral';
            tarefa.data_fim_real = null;
        }
    } else {
        throw erroHttp('Decisão inválida para tarefa.', 400);
    }

    registrarAuditoria(estado, ctx, `TAREFA_${String(decisao).toUpperCase()}`, 'TAREFA', tarefa.id, null, { motivo });
    await salvarEstadoEvento(eventoId, estado);
    return { ...tarefa, ...calculos.calcularAnalisePrazoTarefa(tarefa) };
}

async function criarPropostaPlanta(eventoId, plantaId, dados, user, headers = {}) {
    const { estado } = await carregarEstadoEvento(eventoId, { usuario: user });
    const ctx = calculos.resolverContextoUsuario(estado, user, headers);
    const planta = (estado.plantas || []).find((p) => p.id === plantaId);
    if (!planta) throw erroHttp('Planta não encontrada.', 404);

    const versaoAtual = [...(planta.versoes || [])].sort((a, b) => b.numero_versao - a.numero_versao)[0];
    if (!versaoAtual) throw erroHttp('Planta sem versão oficial publicada.', 400);

    const titulo = String(dados.titulo || '').trim();
    if (!titulo) throw erroHttp('Informe um título para a proposta de intervenção.', 400);

    const novaProposta = {
        id: uuidv4(),
        planta_id: planta.id,
        planta_versao_base_id: dados.planta_versao_base_id || versaoAtual.id,
        autor_produtor_id: ctx.produtorId || null,
        autor_nome: ctx.nome,
        tarefa_id: dados.tarefa_id || null,
        titulo,
        justificativa: dados.justificativa || 'Ajuste operacional solicitado em campo.',
        elementos_alterados_json: Array.isArray(dados.elementos_alterados_json)
            ? dados.elementos_alterados_json
            : versaoAtual.elementos_json,
        status: 'pendente',
        created_at: new Date().toISOString()
    };

    estado.propostas_planta = estado.propostas_planta || [];
    estado.propostas_planta.unshift(novaProposta);
    registrarAuditoria(estado, ctx, 'CRIAR_PROPOSTA_PLANTA', 'PLANTA', planta.id, null, { titulo: novaProposta.titulo });
    await salvarEstadoEvento(eventoId, estado);

    const diff = calculos.compararPropostaPlanta(versaoAtual, novaProposta);
    const conflitos = calculos.detectarConflitosPropostas(versaoAtual, novaProposta, estado.propostas_planta);
    return { ...novaProposta, diff, conflitos };
}

async function avaliarPropostaPlanta(eventoId, propostaId, { decisao, parecer }, user, headers = {}) {
    const { estado } = await carregarEstadoEvento(eventoId, { usuario: user });
    const ctx = calculos.resolverContextoUsuario(estado, user, headers);

    if (!calculos.podeAprovarPlanta(ctx)) {
        throw erroHttp('Acesso negado: apenas o Arquiteto do Evento ou Admin Master pode aprovar ou rejeitar intervenções na planta.', 403);
    }

    const proposta = (estado.propostas_planta || []).find((p) => p.id === propostaId);
    if (!proposta) throw erroHttp('Proposta de intervenção não encontrada.', 404);
    if (proposta.status !== 'pendente' && proposta.status !== 'em_analise') {
        throw erroHttp('Esta proposta já foi finalizada.', 400);
    }

    const planta = (estado.plantas || []).find((p) => p.id === proposta.planta_id) || (estado.plantas || [])[0];
    if (!planta) throw erroHttp('Planta vinculada não encontrada.', 404);

    if (decisao === 'rejeitar') {
        proposta.status = 'rejeitada';
        proposta.parecer_arquiteto = parecer || 'Intervenção rejeitada pelo arquiteto.';
        proposta.analisado_em = new Date().toISOString();
        proposta.analisado_por_nome = ctx.nome;
        registrarAuditoria(estado, ctx, 'REJEITAR_PROPOSTA_PLANTA', 'PROPOSTA_PLANTA', proposta.id, null, { parecer });
        await salvarEstadoEvento(eventoId, estado);
        return { proposta, nova_versao: null };
    }

    if (decisao !== 'aprovar') throw erroHttp('Decisão inválida. Informe aprovar ou rejeitar.', 400);

    const versaoAtual = [...(planta.versoes || [])].sort((a, b) => b.numero_versao - a.numero_versao)[0];
    const versaoBase = planta.versoes.find((v) => v.id === proposta.planta_versao_base_id) || versaoAtual;

    proposta.status = 'aprovada';
    proposta.parecer_arquiteto = parecer || 'Aprovada e incorporada à planta oficial.';
    proposta.analisado_em = new Date().toISOString();
    proposta.analisado_por_nome = ctx.nome;

    const novaVersao = {
        id: uuidv4(),
        planta_id: planta.id,
        numero_versao: (versaoAtual?.numero_versao || 1) + 1,
        eh_oficial: true,
        publicada_por_nome: ctx.nome,
        publicada_em: new Date().toISOString(),
        notas_versao: `Aprovação de proposta: ${proposta.titulo}`,
        imagem_fundo_url: versaoBase?.imagem_fundo_url || versaoAtual?.imagem_fundo_url || null,
        nome_arquivo_base: versaoBase?.nome_arquivo_base || versaoAtual?.nome_arquivo_base || null,
        camadas_arquitetura: (versaoBase?.camadas_arquitetura || versaoAtual?.camadas_arquitetura || []).map((c) => ({ ...c })),
        elementos_json: proposta.elementos_alterados_json,
        setores: versaoBase?.setores || versaoAtual?.setores || []
    };

    planta.versoes.forEach((v) => { v.eh_oficial = false; });
    planta.versoes.push(novaVersao);

    registrarAuditoria(estado, ctx, 'APROVAR_PROPOSTA_PLANTA', 'PLANTA', planta.id, { versao_anterior: versaoAtual?.numero_versao }, { versao_nova: novaVersao.numero_versao });
    await salvarEstadoEvento(eventoId, estado);
    return { proposta, nova_versao: novaVersao };
}

async function criarPlanta(eventoId, dados, user, headers = {}) {
    const { estado } = await carregarEstadoEvento(eventoId, { usuario: user });
    const ctx = calculos.resolverContextoUsuario(estado, user, headers);
    if (!['admin_master', 'master', 'produtor_geral', 'arquiteto_evento'].includes(ctx.papel_producao)) {
        throw erroHttp('Apenas o Arquiteto do Evento, Produtor Geral ou Admin Master pode criar pranchas de planta.', 403);
    }

    const titulo = String(dados.titulo || '').trim() || `Planta do projeto (${new Date().toLocaleDateString('pt-BR')})`;
    const plantaId = uuidv4();
    const versaoId = uuidv4();

    const camadasIniciais = Array.isArray(dados.camadas_arquitetura)
        ? dados.camadas_arquitetura.map((c, idx) => ({
            id: c.id || uuidv4(),
            nome: String(c.nome || `Camada ${idx + 1}`).trim(),
            categoria: c.categoria || 'arquitetura',
            imagem_url: c.imagem_url || null,
            visivel: c.visivel !== false,
            opacidade: Math.min(1, Math.max(0.1, Number(c.opacidade ?? 0.85))),
            area_id: c.area_id || null,
            nome_arquivo: c.nome_arquivo || null,
            criado_por: ctx.nome,
            criado_em: new Date().toISOString()
        })).filter((c) => c.imagem_url)
        : [];

    const novaPlanta = {
        id: plantaId,
        evento_id: eventoId,
        projeto_id: dados.projeto_id || null,
        titulo,
        escala_pixels_por_metro: Math.max(1, Number(dados.escala_pixels_por_metro || 15)),
        largura_px: Math.max(400, Number(dados.largura_px || 960)),
        altura_px: Math.max(300, Number(dados.altura_px || 600)),
        versoes: [
            {
                id: versaoId,
                planta_id: plantaId,
                numero_versao: 1,
                eh_oficial: true,
                publicada_por_nome: ctx.nome,
                publicada_em: new Date().toISOString(),
                notas_versao: dados.notas_versao || 'Importação inicial do projeto arquitetônico',
                imagem_fundo_url: dados.imagem_fundo_url || null,
                nome_arquivo_base: dados.nome_arquivo_base || null,
                camadas_arquitetura: camadasIniciais,
                elementos_json: Array.isArray(dados.elementos_json) ? dados.elementos_json : [],
                setores: Array.isArray(dados.setores) ? dados.setores : []
            }
        ]
    };

    estado.plantas = estado.plantas || [];
    estado.plantas.push(novaPlanta);
    registrarAuditoria(estado, ctx, 'CRIAR_PLANTA', 'PLANTA', plantaId, null, {
        titulo: novaPlanta.titulo,
        camadas: camadasIniciais.length,
        arquivo: novaPlanta.versoes[0].nome_arquivo_base
    });
    await salvarEstadoEvento(eventoId, estado);
    return novaPlanta;
}

async function adicionarCamadaPlanta(eventoId, plantaId, dados, user, headers = {}) {
    const { estado } = await carregarEstadoEvento(eventoId, { usuario: user });
    const ctx = calculos.resolverContextoUsuario(estado, user, headers);
    if (!['admin_master', 'master', 'produtor_geral', 'arquiteto_evento'].includes(ctx.papel_producao)) {
        throw erroHttp('Apenas o Arquiteto do Evento, Produtor Geral ou Admin Master pode alterar a planta base ou camadas.', 403);
    }

    const planta = (estado.plantas || []).find((p) => p.id === plantaId);
    if (!planta) throw erroHttp('Planta não encontrada.', 404);
    const versaoAtual = [...(planta.versoes || [])].sort((a, b) => b.numero_versao - a.numero_versao)[0];
    if (!versaoAtual) throw erroHttp('Planta sem versão publicada.', 400);

    if (dados.largura_px) planta.largura_px = Math.max(400, Number(dados.largura_px));
    if (dados.altura_px) planta.altura_px = Math.max(300, Number(dados.altura_px));
    if (dados.escala_pixels_por_metro) planta.escala_pixels_por_metro = Math.max(1, Number(dados.escala_pixels_por_metro));

    if (dados.definir_como_base && dados.imagem_url) {
        versaoAtual.imagem_fundo_url = dados.imagem_url;
        versaoAtual.nome_arquivo_base = dados.nome_arquivo || versaoAtual.nome_arquivo_base || 'projeto_base';
        if (dados.notas_versao) versaoAtual.notas_versao = dados.notas_versao;
    }

    versaoAtual.camadas_arquitetura = versaoAtual.camadas_arquitetura || [];
    const adicionadas = [];

    const criarItemCamada = (item, idx = 0) => ({
        id: uuidv4(),
        nome: String(item.nome || `Camada ${versaoAtual.camadas_arquitetura.length + idx + 1}`).trim(),
        categoria: item.categoria || 'arquitetura',
        imagem_url: item.imagem_url,
        visivel: item.visivel !== false,
        opacidade: Math.min(1, Math.max(0.1, Number(item.opacidade ?? 0.85))),
        area_id: item.area_id || null,
        nome_arquivo: item.nome_arquivo || null,
        criado_por: ctx.nome,
        criado_em: new Date().toISOString()
    });

    if (Array.isArray(dados.camadas_lote) && dados.camadas_lote.length > 0) {
        dados.camadas_lote.forEach((item, idx) => {
            if (item?.imagem_url) {
                const nova = criarItemCamada(item, idx);
                versaoAtual.camadas_arquitetura.push(nova);
                adicionadas.push(nova);
            }
        });
    } else if (!dados.definir_como_base && dados.imagem_url) {
        const nova = criarItemCamada(dados, 0);
        versaoAtual.camadas_arquitetura.push(nova);
        adicionadas.push(nova);
    }

    if (!dados.definir_como_base && adicionadas.length === 0) {
        throw erroHttp('Envie a imagem ou camada para adicionar à planta.', 400);
    }

    registrarAuditoria(estado, ctx, 'IMPORTAR_DESENHO_CAMADA', 'PLANTA', planta.id, null, {
        definir_como_base: Boolean(dados.definir_como_base),
        camadas_adicionadas: adicionadas.length
    });
    await salvarEstadoEvento(eventoId, estado);
    return {
        planta_id: planta.id,
        versao_id: versaoAtual.id,
        imagem_fundo_url: versaoAtual.imagem_fundo_url,
        camadas_adicionadas: adicionadas
    };
}

async function atualizarCamadaPlanta(eventoId, plantaId, camadaId, dados, user, headers = {}) {
    const { estado } = await carregarEstadoEvento(eventoId, { usuario: user });
    const ctx = calculos.resolverContextoUsuario(estado, user, headers);
    if (!['admin_master', 'master', 'produtor_geral', 'arquiteto_evento'].includes(ctx.papel_producao)) {
        throw erroHttp('Sem permissão para alterar camadas da planta.', 403);
    }
    const planta = (estado.plantas || []).find((p) => p.id === plantaId);
    if (!planta) throw erroHttp('Planta não encontrada.', 404);
    const versaoAtual = [...(planta.versoes || [])].sort((a, b) => b.numero_versao - a.numero_versao)[0];
    const camada = (versaoAtual?.camadas_arquitetura || []).find((c) => c.id === camadaId);
    if (!camada) throw erroHttp('Camada não encontrada.', 404);

    if (dados.nome !== undefined) camada.nome = String(dados.nome).trim() || camada.nome;
    if (dados.visivel !== undefined) camada.visivel = Boolean(dados.visivel);
    if (dados.opacidade !== undefined) camada.opacidade = Math.min(1, Math.max(0.1, Number(dados.opacidade)));
    if (dados.area_id !== undefined) camada.area_id = dados.area_id || null;

    await salvarEstadoEvento(eventoId, estado);
    return camada;
}

async function excluirCamadaPlanta(eventoId, plantaId, camadaId, user, headers = {}) {
    const { estado } = await carregarEstadoEvento(eventoId, { usuario: user });
    const ctx = calculos.resolverContextoUsuario(estado, user, headers);
    if (!['admin_master', 'master', 'produtor_geral', 'arquiteto_evento'].includes(ctx.papel_producao)) {
        throw erroHttp('Sem permissão para remover camadas da planta.', 403);
    }
    const planta = (estado.plantas || []).find((p) => p.id === plantaId);
    if (!planta) throw erroHttp('Planta não encontrada.', 404);
    const versaoAtual = [...(planta.versoes || [])].sort((a, b) => b.numero_versao - a.numero_versao)[0];
    if (!versaoAtual) throw erroHttp('Planta sem versão oficial.', 400);

    versaoAtual.camadas_arquitetura = (versaoAtual.camadas_arquitetura || []).filter((c) => c.id !== camadaId);
    registrarAuditoria(estado, ctx, 'EXCLUIR_CAMADA_PLANTA', 'PLANTA', planta.id, { camada_id: camadaId }, null);
    await salvarEstadoEvento(eventoId, estado);
    return { camada_id: camadaId };
}

async function criarSetorPlanta(eventoId, plantaId, dados, user, headers = {}) {
    const { estado } = await carregarEstadoEvento(eventoId, { usuario: user });
    const ctx = calculos.resolverContextoUsuario(estado, user, headers);
    if (!['admin_master', 'master', 'produtor_geral', 'arquiteto_evento'].includes(ctx.papel_producao)) {
        throw erroHttp('Apenas o Arquiteto ou Produtor Geral pode definir setores na planta.', 403);
    }
    const planta = (estado.plantas || []).find((p) => p.id === plantaId);
    if (!planta) throw erroHttp('Planta não encontrada.', 404);

    const versaoAtual = [...(planta.versoes || [])].sort((a, b) => b.numero_versao - a.numero_versao)[0];
    if (!versaoAtual) throw erroHttp('Planta sem versão oficial.', 400);

    const nome = String(dados.nome || '').trim();
    if (!nome) throw erroHttp('Informe o nome do setor.', 400);

    const setor = {
        id: uuidv4(),
        planta_versao_id: versaoAtual.id,
        area_id: dados.area_id || null,
        nome,
        cor_hex: dados.cor_hex || '#00D4FF',
        poligono_coordenadas: Array.isArray(dados.poligono_coordenadas) ? dados.poligono_coordenadas : [
            { x: 120, y: 120 }, { x: 300, y: 120 }, { x: 300, y: 260 }, { x: 120, y: 260 }
        ],
        responsavel_nome: dados.responsavel_nome || ctx.nome,
        capacidade_maxima: Number(dados.capacidade_maxima || 0) || null
    };
    versaoAtual.setores = versaoAtual.setores || [];
    versaoAtual.setores.push(setor);
    registrarAuditoria(estado, ctx, 'CRIAR_SETOR_PLANTA', 'PLANTA', planta.id, null, { nome: setor.nome });
    await salvarEstadoEvento(eventoId, estado);
    return setor;
}

async function atualizarSetorPlanta(eventoId, plantaId, setorId, dados, user, headers = {}) {
    const { estado } = await carregarEstadoEvento(eventoId, { usuario: user });
    const ctx = calculos.resolverContextoUsuario(estado, user, headers);
    if (!['admin_master', 'master', 'produtor_geral', 'arquiteto_evento'].includes(ctx.papel_producao)) {
        throw erroHttp('Apenas o Arquiteto ou Produtor Geral pode editar setores na planta.', 403);
    }
    const planta = (estado.plantas || []).find((p) => p.id === plantaId);
    if (!planta) throw erroHttp('Planta não encontrada.', 404);
    const versaoAtual = [...(planta.versoes || [])].sort((a, b) => b.numero_versao - a.numero_versao)[0];
    const setor = (versaoAtual?.setores || []).find((s) => s.id === setorId);
    if (!setor) throw erroHttp('Setor não encontrado.', 404);

    if (dados.nome !== undefined) setor.nome = String(dados.nome).trim() || setor.nome;
    if (dados.area_id !== undefined) setor.area_id = dados.area_id || null;
    if (dados.cor_hex !== undefined) setor.cor_hex = dados.cor_hex || setor.cor_hex;
    if (dados.responsavel_nome !== undefined) setor.responsavel_nome = dados.responsavel_nome;
    if (Array.isArray(dados.poligono_coordenadas) && dados.poligono_coordenadas.length >= 3) {
        setor.poligono_coordenadas = dados.poligono_coordenadas;
    }

    registrarAuditoria(estado, ctx, 'ATUALIZAR_SETOR_PLANTA', 'PLANTA', planta.id, null, { setor_id: setor.id, nome: setor.nome });
    await salvarEstadoEvento(eventoId, estado);
    return setor;
}

async function excluirSetorPlanta(eventoId, plantaId, setorId, user, headers = {}) {
    const { estado } = await carregarEstadoEvento(eventoId, { usuario: user });
    const ctx = calculos.resolverContextoUsuario(estado, user, headers);
    if (!['admin_master', 'master', 'produtor_geral', 'arquiteto_evento'].includes(ctx.papel_producao)) {
        throw erroHttp('Apenas o Arquiteto ou Produtor Geral pode remover setores.', 403);
    }
    const planta = (estado.plantas || []).find((p) => p.id === plantaId);
    if (!planta) throw erroHttp('Planta não encontrada.', 404);
    const versaoAtual = [...(planta.versoes || [])].sort((a, b) => b.numero_versao - a.numero_versao)[0];
    if (!versaoAtual) throw erroHttp('Planta sem versão oficial.', 400);

    versaoAtual.setores = (versaoAtual.setores || []).filter((s) => s.id !== setorId);
    registrarAuditoria(estado, ctx, 'EXCLUIR_SETOR_PLANTA', 'PLANTA', planta.id, { setor_id: setorId }, null);
    await salvarEstadoEvento(eventoId, estado);
    return { setor_id: setorId };
}

async function publicarVersaoOficialPlanta(eventoId, plantaId, dados, user, headers = {}) {
    const { estado } = await carregarEstadoEvento(eventoId, { usuario: user });
    const ctx = calculos.resolverContextoUsuario(estado, user, headers);
    if (!calculos.podeAprovarPlanta(ctx)) {
        throw erroHttp('Acesso negado: apenas o Arquiteto do Evento ou Admin Master publica versão oficial.', 403);
    }
    const planta = (estado.plantas || []).find((p) => p.id === plantaId);
    if (!planta) throw erroHttp('Planta não encontrada.', 404);
    const versaoAtual = [...(planta.versoes || [])].sort((a, b) => b.numero_versao - a.numero_versao)[0];

    if (dados.escala_pixels_por_metro) {
        planta.escala_pixels_por_metro = Number(dados.escala_pixels_por_metro);
    }
    if (dados.largura_px) planta.largura_px = Math.max(400, Number(dados.largura_px));
    if (dados.altura_px) planta.altura_px = Math.max(300, Number(dados.altura_px));

    const novaVersao = {
        id: uuidv4(),
        planta_id: planta.id,
        numero_versao: (versaoAtual?.numero_versao || 0) + 1,
        eh_oficial: true,
        publicada_por_nome: ctx.nome,
        publicada_em: new Date().toISOString(),
        notas_versao: dados.notas_versao || 'Publicação direta do arquiteto',
        imagem_fundo_url: dados.imagem_fundo_url !== undefined ? dados.imagem_fundo_url : (versaoAtual?.imagem_fundo_url || null),
        nome_arquivo_base: dados.nome_arquivo_base !== undefined ? dados.nome_arquivo_base : (versaoAtual?.nome_arquivo_base || null),
        camadas_arquitetura: Array.isArray(dados.camadas_arquitetura)
            ? dados.camadas_arquitetura
            : (versaoAtual?.camadas_arquitetura || []).map((c) => ({ ...c })),
        elementos_json: Array.isArray(dados.elementos_json) ? dados.elementos_json : (versaoAtual?.elementos_json || []),
        setores: Array.isArray(dados.setores) ? dados.setores : (versaoAtual?.setores || [])
    };
    planta.versoes.forEach((v) => { v.eh_oficial = false; });
    planta.versoes.push(novaVersao);
    registrarAuditoria(estado, ctx, 'PUBLICAR_PLANTA_OFICIAL', 'PLANTA', planta.id, { versao: versaoAtual?.numero_versao }, { versao: novaVersao.numero_versao });
    await salvarEstadoEvento(eventoId, estado);
    return novaVersao;
}

/**
 * Gera automaticamente o ciclo completo de 3 fases (Montagem -> Evento -> Desmontagem)
 * encadeado por dependências para qualquer elemento ou setor mapeado sobre o projeto.
 */
async function gerarPlanoFasesElemento(eventoId, plantaId, dados, user, headers = {}) {
    const { estado } = await carregarEstadoEvento(eventoId, { usuario: user });
    const ctx = calculos.resolverContextoUsuario(estado, user, headers);

    const rotuloAlvo = String(dados.elemento_planta_rotulo || dados.rotulo || '').trim();
    const areaId = dados.area_id || ctx.area_id || estado.areas?.[0]?.id;
    if (!rotuloAlvo) throw erroHttp('Informe o elemento ou setor de referência.', 400);
    if (!areaId) throw erroHttp('Cadastre ou selecione uma área de atuação antes de gerar o plano de fases.', 400);
    if (ctx.papel_producao === 'produtor_area' && ctx.area_id && areaId !== ctx.area_id) {
        throw erroHttp('Produtor de área só pode gerar etapas para a própria área.', 403);
    }

    const tipo = String(dados.tipo_elemento || 'geral').toLowerCase();
    const checklistsPorTipo = {
        palco: {
            montagem: ['Marcar gabarito no piso conforme planta', 'Ergue torres e cobertura com lastro', 'Conferir aterramento e laudo ART'],
            evento: ['Checklist técnico pré-abertura e passagem de som', 'Monitorar carga de vento e estabilidade', 'Apoiar trocas de banda e horários'],
            desmontagem: ['Desligar energia e desconectar cabeamento', 'Rebaixar grid e desmontar treliças', 'Conferir romaneio e carregar caminhão']
        },
        gerador: {
            montagem: ['Posicionar gerador com bandeja de contenção', 'Instalar hastes de aterramento e testar tensão', 'Isolar área com gradil e extintor CO2'],
            evento: ['Monitorar nível de diesel e temperatura por turno', 'Manter operador de plantão para chaveamento', 'Registrar leituras de carga'],
            desmontagem: ['Desligar quadros em sequência segura', 'Recolher cabos e protetores passacabos', 'Liberar retirada do equipamento']
        },
        tenda: {
            montagem: ['Demarcar perímetro em metros na planta', 'Montar estrutura metálica e tensionar lona', 'Instalar estacas, lastros e iluminação interna'],
            evento: ['Vistoria diária de amarração e limpeza', 'Monitorar pontos de energia e piso'],
            desmontagem: ['Desenergizar pontos internos', 'Remover lona seca e dobrar lonas', 'Recolher ferragens e conferir quantitativo']
        },
        geral: {
            montagem: [`Demarcar posição de ${rotuloAlvo} no projeto`, `Executar instalação completa de ${rotuloAlvo}`, 'Registrar foto de conformidade'],
            evento: [`Acompanhar operação contínua de ${rotuloAlvo}`, 'Atender ajustes solicitados durante o evento'],
            desmontagem: [`Desenergizar e desmontar ${rotuloAlvo}`, 'Conferir avarias e devolução dos materiais']
        }
    };
    const roteiro = checklistsPorTipo[tipo] || checklistsPorTipo.geral;

    const agoraMs = dados.data_inicio_montagem ? new Date(dados.data_inicio_montagem).getTime() : Date.now();
    const definicoes = [
        {
            fase: 'montagem',
            titulo: `Montagem • ${rotuloAlvo}`,
            objetivo: `Implantação e preparação completa de ${rotuloAlvo} conforme posição marcada na planta.`,
            prioridade: 'alta',
            inicio: new Date(agoraMs).toISOString(),
            fim: new Date(agoraMs + 8 * 3600000).toISOString(),
            etapas: roteiro.montagem
        },
        {
            fase: 'evento',
            titulo: `Evento (operação) • ${rotuloAlvo}`,
            objetivo: `Monitoramento, operação assistida e suporte técnico de ${rotuloAlvo} durante o evento.`,
            prioridade: 'media',
            inicio: new Date(agoraMs + 8 * 3600000).toISOString(),
            fim: new Date(agoraMs + 20 * 3600000).toISOString(),
            etapas: roteiro.evento
        },
        {
            fase: 'desmontagem',
            titulo: `Desmontagem • ${rotuloAlvo}`,
            objetivo: `Desmobilização segura, conferência de retorno e limpeza da área de ${rotuloAlvo}.`,
            prioridade: 'media',
            inicio: new Date(agoraMs + 20 * 3600000).toISOString(),
            fim: new Date(agoraMs + 28 * 3600000).toISOString(),
            etapas: roteiro.desmontagem
        }
    ];

    const criadas = [];
    estado.tarefas = estado.tarefas || [];
    estado.dependencias_tarefas = estado.dependencias_tarefas || [];

    for (const def of definicoes) {
        const nova = {
            id: uuidv4(),
            evento_id: eventoId,
            area_id: areaId,
            setor_id: dados.setor_id || null,
            planta_id: plantaId || null,
            elemento_planta_id: dados.elemento_planta_id || null,
            elemento_planta_rotulo: rotuloAlvo,
            fase_operacional: def.fase,
            titulo: def.titulo,
            objetivo: def.objetivo,
            sugestoes_levar: Array.isArray(dados.sugestoes_levar) ? dados.sugestoes_levar : ['EPI padrão', 'Rádio comunicador', 'Projeto impresso ou celular'],
            prioridade: def.prioridade,
            status: 'disponivel',
            produtor_atribuido_id: dados.produtor_atribuido_id || null,
            data_inicio_planejada: def.inicio,
            data_fim_planejada: def.fim,
            requer_aprovacao_conclusao: true,
            etapas: def.etapas.map((desc, idx) => ({
                id: uuidv4(),
                ordem: idx + 1,
                descricao: desc,
                obrigatoria: true,
                concluida: false,
                evidencias: []
            }))
        };
        estado.tarefas.unshift(nova);
        if (criadas.length > 0) {
            estado.dependencias_tarefas.push({
                id: uuidv4(),
                tarefa_origem_id: criadas[criadas.length - 1].id,
                tarefa_dependente_id: nova.id,
                tipo: 'fim_para_inicio'
            });
        }
        criadas.push(nova);
    }

    registrarAuditoria(estado, ctx, 'GERAR_PLANO_3_FASES', 'TAREFA', plantaId, null, {
        elemento: rotuloAlvo,
        tarefas_criadas: criadas.length
    });
    await salvarEstadoEvento(eventoId, estado);
    return {
        elemento: rotuloAlvo,
        tarefas: criadas.map((t) => ({ ...t, ...calculos.calcularAnalisePrazoTarefa(t) }))
    };
}

const ACOES_MONITORAMENTO_MATERIAL_VALIDAS = [
    'contar_entrada',
    'contar_saida',
    'monitorar_presenca',
    'alertar_saida_indevida',
    'alertar_divergencia'
];
const MODOS_CONTAGEM_MATERIAL_VALIDOS = ['line_zone', 'polygon_zone', 'sahi_estatico'];

function normalizarFotosReferencia(fotos, fotoPrincipalInformada) {
    const listaBruta = Array.isArray(fotos) ? fotos : [];
    const agora = new Date().toISOString();
    const validas = [];

    for (const item of listaBruta) {
        if (!item || typeof item !== 'object') continue;
        const url = typeof item.url === 'string' ? item.url.trim() : '';
        if (!url || url.length > 620000) continue;
        validas.push({
            id: String(item.id || uuidv4()),
            url,
            angulo: String(item.angulo || 'frontal').trim() || 'frontal',
            legenda: String(item.legenda || '').trim().slice(0, 120),
            principal: Boolean(item.principal),
            assinatura_visual: (item.assinatura_visual && typeof item.assinatura_visual === 'object')
                ? item.assinatura_visual
                : null,
            adicionada_em: item.adicionada_em || agora
        });
        if (validas.length >= 6) break;
    }

    const fotoFallback = typeof fotoPrincipalInformada === 'string' ? fotoPrincipalInformada.trim() : '';
    if (validas.length === 0 && fotoFallback && fotoFallback.length <= 620000) {
        validas.push({
            id: uuidv4(),
            url: fotoFallback,
            angulo: 'frontal',
            legenda: 'Referência principal',
            principal: true,
            assinatura_visual: null,
            adicionada_em: agora
        });
    }

    if (validas.length > 0) {
        let idxPrincipal = -1;
        if (fotoFallback) {
            idxPrincipal = validas.findIndex((f) => f.url === fotoFallback);
        }
        if (idxPrincipal < 0) {
            idxPrincipal = validas.findIndex((f) => f.principal);
        }
        if (idxPrincipal < 0) idxPrincipal = 0;

        validas.forEach((f, idx) => {
            f.principal = idx === idxPrincipal;
        });
    }

    const principal = validas.find((f) => f.principal) || validas[0] || null;
    return {
        fotos_referencia: validas,
        foto_referencia_url: principal ? principal.url : null
    };
}

function normalizarCaracteristicasMaterial(dados = {}, atual = {}) {
    const src = (dados?.caracteristicas && typeof dados.caracteristicas === 'object')
        ? dados.caracteristicas
        : (dados || {});
    const base = (atual && typeof atual === 'object') ? atual : {};

    const palavrasBrutas = src.palavras_chave_ia !== undefined
        ? src.palavras_chave_ia
        : (base.palavras_chave_ia ?? []);
    const listaPalavras = Array.isArray(palavrasBrutas)
        ? palavrasBrutas
        : String(palavrasBrutas || '').split(/[,;\n]+/);
    const palavras_chave_ia = Array.from(new Set(
        listaPalavras.map((p) => String(p || '').trim()).filter(Boolean)
    )).slice(0, 20);

    return {
        cor_predominante: String(src.cor_predominante ?? base.cor_predominante ?? '').trim(),
        cor_hex_referencia: String(src.cor_hex_referencia ?? base.cor_hex_referencia ?? '').trim(),
        formato_geometria: String(src.formato_geometria ?? base.formato_geometria ?? '').trim(),
        material_composicao: String(src.material_composicao ?? base.material_composicao ?? '').trim(),
        unidade_medida: String(src.unidade_medida ?? base.unidade_medida ?? 'un').trim() || 'un',
        codigo_etiqueta: String(src.codigo_etiqueta ?? base.codigo_etiqueta ?? '').trim(),
        marcas_distintivas: String(src.marcas_distintivas ?? base.marcas_distintivas ?? '').trim(),
        palavras_chave_ia
    };
}

function normalizarRegraMonitoramento(dados = {}, atual = {}) {
    const src = (dados?.regra_monitoramento && typeof dados.regra_monitoramento === 'object')
        ? dados.regra_monitoramento
        : (dados || {});
    const base = (atual && typeof atual === 'object') ? atual : {};

    const acaoInformada = String(src.acao_ao_detectar ?? base.acao_ao_detectar ?? 'contar_entrada').trim();
    const modoInformado = String(src.modo_preferido ?? base.modo_preferido ?? 'line_zone').trim();
    const confBruta = Number(src.confianca_minima ?? base.confianca_minima ?? 0.65);
    const confLimitada = Number.isFinite(confBruta)
        ? Math.min(0.98, Math.max(0.4, confBruta))
        : 0.65;

    return {
        acao_ao_detectar: ACOES_MONITORAMENTO_MATERIAL_VALIDAS.includes(acaoInformada)
            ? acaoInformada
            : 'contar_entrada',
        modo_preferido: MODOS_CONTAGEM_MATERIAL_VALIDOS.includes(modoInformado)
            ? modoInformado
            : 'line_zone',
        confianca_minima: Math.round(confLimitada * 100) / 100,
        area_alvo_id: (src.area_alvo_id !== undefined ? src.area_alvo_id : base.area_alvo_id) || null,
        notificar_alerta: src.notificar_alerta !== undefined
            ? Boolean(src.notificar_alerta)
            : (base.notificar_alerta !== undefined ? Boolean(base.notificar_alerta) : true),
        instrucao_operacional: String(src.instrucao_operacional ?? base.instrucao_operacional ?? '').trim()
    };
}

async function criarMaterial(eventoId, dados, user, headers = {}) {
    const { estado } = await carregarEstadoEvento(eventoId, { usuario: user });
    const ctx = calculos.resolverContextoUsuario(estado, user, headers);
    if (!calculos.podeGerenciarCatalogo(ctx)) {
        throw erroHttp('Apenas Auditoria, Produtor Geral ou Admin Master pode alterar o catálogo.', 403);
    }
    const nome = String(dados.nome || '').trim();
    if (!nome) throw erroHttp('Informe o nome do material.', 400);

    const fotosNorm = normalizarFotosReferencia(dados.fotos_referencia, dados.foto_referencia_url);
    const caracteristicas = normalizarCaracteristicasMaterial(dados);
    const regra_monitoramento = normalizarRegraMonitoramento(dados);
    const agora = new Date().toISOString();

    const novo = {
        id: uuidv4(),
        evento_id: eventoId,
        codigo_catalogo: dados.codigo_catalogo || `MAT-${String((estado.materiais || []).length + 1).padStart(3, '0')}`,
        nome,
        categoria: dados.categoria || 'estrutura',
        subtipo: dados.subtipo || '',
        dimensoes: dados.dimensoes || '',
        peso_kg: Number(dados.peso_kg || 0),
        fornecedor_nome: dados.fornecedor_nome || '',
        classe_deteccao_ia: String(dados.classe_deteccao_ia || '').trim() || nome.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
        foto_referencia_url: fotosNorm.foto_referencia_url,
        fotos_referencia: fotosNorm.fotos_referencia,
        caracteristicas,
        regra_monitoramento,
        quantidade_planejada: Number(dados.quantidade_planejada || 0),
        quantidade_recebida: Number(dados.quantidade_recebida || 0),
        quantidade_avariada: Number(dados.quantidade_avariada || 0),
        status_movimentacao: 'previsto',
        atualizado_em: agora
    };
    estado.materiais.push(novo);
    registrarAuditoria(estado, ctx, 'CADASTRAR_MATERIAL', 'MATERIAL', novo.id, null, {
        nome: novo.nome,
        codigo_catalogo: novo.codigo_catalogo,
        fotos: novo.fotos_referencia.length,
        acao_monitoramento: novo.regra_monitoramento.acao_ao_detectar
    });
    await salvarEstadoEvento(eventoId, estado);
    return novo;
}

async function atualizarMaterial(eventoId, materialId, dados, user, headers = {}) {
    const { estado } = await carregarEstadoEvento(eventoId, { usuario: user });
    const ctx = calculos.resolverContextoUsuario(estado, user, headers);
    if (!calculos.podeGerenciarCatalogo(ctx)) {
        throw erroHttp('Apenas Auditoria, Produtor Geral ou Admin Master pode alterar o catálogo.', 403);
    }
    const material = (estado.materiais || []).find((m) => m.id === materialId);
    if (!material) throw erroHttp('Material não encontrado.', 404);

    const antes = {
        nome: material.nome,
        acao: material.regra_monitoramento?.acao_ao_detectar || 'contar_entrada',
        fotos: (material.fotos_referencia || []).length
    };

    if (dados.nome !== undefined) {
        const nomeLimpo = String(dados.nome || '').trim();
        if (!nomeLimpo) throw erroHttp('O nome do material não pode ficar vazio.', 400);
        material.nome = nomeLimpo;
    }
    if (dados.codigo_catalogo !== undefined) {
        material.codigo_catalogo = String(dados.codigo_catalogo || '').trim() || material.codigo_catalogo;
    }
    if (dados.categoria !== undefined) material.categoria = dados.categoria || material.categoria;
    if (dados.subtipo !== undefined) material.subtipo = String(dados.subtipo || '');
    if (dados.dimensoes !== undefined) material.dimensoes = String(dados.dimensoes || '');
    if (dados.peso_kg !== undefined) material.peso_kg = Number(dados.peso_kg || 0);
    if (dados.fornecedor_nome !== undefined) material.fornecedor_nome = String(dados.fornecedor_nome || '');
    if (dados.classe_deteccao_ia !== undefined) {
        const cls = String(dados.classe_deteccao_ia || '').trim();
        material.classe_deteccao_ia = cls || material.nome.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    }
    if (dados.quantidade_planejada !== undefined) {
        material.quantidade_planejada = Number(dados.quantidade_planejada || 0);
    }

    if (dados.fotos_referencia !== undefined || dados.foto_referencia_url !== undefined) {
        const listaFotos = dados.fotos_referencia !== undefined
            ? dados.fotos_referencia
            : (material.fotos_referencia || []);
        const fotosNorm = normalizarFotosReferencia(listaFotos, dados.foto_referencia_url);
        material.fotos_referencia = fotosNorm.fotos_referencia;
        material.foto_referencia_url = fotosNorm.foto_referencia_url;
    }

    if (dados.caracteristicas !== undefined || dados.cor_predominante !== undefined || dados.formato_geometria !== undefined || dados.palavras_chave_ia !== undefined) {
        material.caracteristicas = normalizarCaracteristicasMaterial(dados, material.caracteristicas);
    }

    if (dados.regra_monitoramento !== undefined || dados.acao_ao_detectar !== undefined || dados.confianca_minima !== undefined) {
        material.regra_monitoramento = normalizarRegraMonitoramento(dados, material.regra_monitoramento);
    }

    material.atualizado_em = new Date().toISOString();

    registrarAuditoria(estado, ctx, 'ATUALIZAR_MATERIAL', 'MATERIAL', material.id, antes, {
        nome: material.nome,
        acao: material.regra_monitoramento?.acao_ao_detectar,
        fotos: (material.fotos_referencia || []).length
    });
    await salvarEstadoEvento(eventoId, estado);
    return material;
}

async function obterCatalogoVisaoMateriais(eventoId, user, headers = {}) {
    const { estado } = await carregarEstadoEvento(eventoId, { usuario: user });
    calculos.resolverContextoUsuario(estado, user, headers);

    const materiaisAtivos = (estado.materiais || [])
        .filter((m) => m.ativo !== false)
        .map((m) => ({
            id: m.id,
            codigo_catalogo: m.codigo_catalogo,
            nome: m.nome,
            categoria: m.categoria,
            subtipo: m.subtipo || '',
            dimensoes: m.dimensoes || '',
            peso_kg: Number(m.peso_kg || 0),
            classe_deteccao_ia: m.classe_deteccao_ia || '',
            foto_referencia_url: m.foto_referencia_url || null,
            fotos_referencia: Array.isArray(m.fotos_referencia) ? m.fotos_referencia : [],
            caracteristicas: normalizarCaracteristicasMaterial(m.caracteristicas || {}),
            regra_monitoramento: normalizarRegraMonitoramento(m.regra_monitoramento || {}),
            quantidade_planejada: Number(m.quantidade_planejada || 0),
            quantidade_recebida: Number(m.quantidade_recebida || 0),
            status_movimentacao: m.status_movimentacao || 'previsto'
        }));

    return {
        evento_id: eventoId,
        atualizado_em: new Date().toISOString(),
        total_materiais: materiaisAtivos.length,
        materiais: materiaisAtivos
    };
}

/**
 * Processa sessão de conferência assistida por IA (LineZone / PolygonZone / SAHI).
 */
async function registrarConferenciaIa(eventoId, dados, user, headers = {}) {
    const { estado } = await carregarEstadoEvento(eventoId, { usuario: user });
    const ctx = calculos.resolverContextoUsuario(estado, user, headers);

    const recebimentoId = uuidv4();
    const recebimento = {
        id: recebimentoId,
        evento_id: eventoId,
        fornecedor_nome: dados.fornecedor_nome || 'Fornecedor em conferência',
        numero_nota_romaneio: dados.numero_nota_romaneio || `ROM-${Date.now().toString().slice(-5)}`,
        data_hora_chegada: new Date().toISOString(),
        conferente_produtor_id: ctx.produtorId || null,
        status: 'em_conferencia',
        observacoes: dados.observacoes || ''
    };

    const itens = (Array.isArray(dados.itens) && dados.itens.length > 0 ? dados.itens : []).map((item) => {
        const mat = (estado.materiais || []).find((m) =>
            m.id === item.material_id || (item.classe_identificada && m.classe_deteccao_ia === item.classe_identificada)
        );
        return {
            id: uuidv4(),
            material_id: mat?.id || null,
            classe_identificada: item.classe_identificada || mat?.classe_deteccao_ia || 'objeto_nao_catalogado',
            reconhecido_catalogo: Boolean(mat),
            quantidade_esperada: Number(item.quantidade_esperada ?? mat?.quantidade_planejada ?? 0),
            quantidade_ia: Number(item.quantidade_ia || 0),
            quantidade_corrigida_humano: null,
            confianca_media: Number(item.confianca_media || 0.91),
            quadro_chave_evidencia_url: item.quadro_chave_evidencia_url || null,
            acao_aplicada: item.acao_aplicada || mat?.regra_monitoramento?.acao_ao_detectar || 'contar_entrada',
            justificativa_correcao: null
        };
    });

    const acoesExecutadas = (Array.isArray(dados.acoes_executadas) ? dados.acoes_executadas : [])
        .slice(0, 100)
        .map((a) => ({
            id: String(a.id || uuidv4()),
            tipo: String(a.tipo || 'contar_entrada'),
            material_id: a.material_id || null,
            material_nome: String(a.material_nome || ''),
            mensagem: String(a.mensagem || ''),
            timestamp: a.timestamp || new Date().toISOString(),
            evidencia_url: a.evidencia_url || null
        }));

    const sessao = {
        id: uuidv4(),
        recebimento_id: recebimentoId,
        origem_midia: dados.origem_midia || 'video_gravado',
        modelo_ia_versao: dados.modelo_ia_versao || 'rt-detr-apache2-v1 + supervision-linezone',
        modo_contagem: dados.modo_contagem || 'line_zone',
        status_processamento: 'concluido',
        iniciado_em: new Date().toISOString(),
        finalizado_em: new Date().toISOString(),
        itens_contados: itens,
        acoes_executadas: acoesExecutadas
    };

    estado.recebimentos.unshift(recebimento);
    estado.sessoes_contagem.unshift(sessao);
    registrarAuditoria(estado, ctx, 'CONFERENCIA_IA_MATERIAIS', 'RECEBIMENTO', recebimento.id, null, { itens: itens.length });
    await salvarEstadoEvento(eventoId, estado);
    return { recebimento, sessao };
}

async function confirmarItemContagem(eventoId, sessaoId, itemId, dados, user, headers = {}) {
    const { estado } = await carregarEstadoEvento(eventoId, { usuario: user });
    const ctx = calculos.resolverContextoUsuario(estado, user, headers);
    const sessao = (estado.sessoes_contagem || []).find((s) => s.id === sessaoId);
    if (!sessao) throw erroHttp('Sessão de contagem não encontrada.', 404);
    const item = (sessao.itens_contados || []).find((i) => i.id === itemId);
    if (!item) throw erroHttp('Item contado não encontrado.', 404);

    const qtdFinal = Number(dados.quantidade_corrigida_humano ?? item.quantidade_ia);
    item.quantidade_corrigida_humano = qtdFinal;
    item.justificativa_correcao = dados.justificativa_correcao || 'Confirmado pela auditoria/operação';
    item.corrigido_por_nome = ctx.nome;
    item.disponivel_para_retreino = qtdFinal !== item.quantidade_ia;

    if (item.material_id) {
        const mat = (estado.materiais || []).find((m) => m.id === item.material_id);
        if (mat) {
            mat.quantidade_recebida = qtdFinal;
            if (mat.status_movimentacao === 'previsto') mat.status_movimentacao = 'recebido';
        }
    }

    const recebimento = (estado.recebimentos || []).find((r) => r.id === sessao.recebimento_id);
    if (recebimento) {
        const temDivergencia = (sessao.itens_contados || []).some((i) =>
            Number(i.quantidade_corrigida_humano ?? i.quantidade_ia) !== Number(i.quantidade_esperada || 0)
        );
        recebimento.status = temDivergencia ? 'aprovado_divergencia' : 'aprovado_total';
    }

    registrarAuditoria(estado, ctx, 'CONFIRMAR_CONTAGEM_IA', 'ITEM_CONTADO', item.id, null, { qtdFinal });
    await salvarEstadoEvento(eventoId, estado);
    return item;
}

async function cadastrarMaterialNaoReconhecido(eventoId, itemId, dados, user, headers = {}) {
    const { estado } = await carregarEstadoEvento(eventoId, { usuario: user });
    const ctx = calculos.resolverContextoUsuario(estado, user, headers);
    if (!calculos.podeGerenciarCatalogo(ctx)) {
        throw erroHttp('Apenas Auditoria, Produtor Geral ou Admin Master pode catalogar itens não reconhecidos.', 403);
    }

    let itemAlvo = null;
    for (const s of estado.sessoes_contagem || []) {
        const encontrado = (s.itens_contados || []).find((i) => i.id === itemId);
        if (encontrado) {
            itemAlvo = encontrado;
            break;
        }
    }
    if (!itemAlvo) throw erroHttp('Item não reconhecido não encontrado.', 404);

    const novoMaterial = await criarMaterial(eventoId, {
        nome: dados.nome || itemAlvo.classe_identificada.replace(/_/g, ' '),
        categoria: dados.categoria || 'geral',
        subtipo: dados.subtipo || '',
        classe_deteccao_ia: itemAlvo.classe_identificada,
        foto_referencia_url: dados.foto_referencia_url || itemAlvo.quadro_chave_evidencia_url || null,
        quantidade_planejada: Number(dados.quantidade_planejada || itemAlvo.quantidade_ia || 0),
        quantidade_recebida: Number(itemAlvo.quantidade_ia || 0)
    }, user, headers);

    itemAlvo.material_id = novoMaterial.id;
    itemAlvo.reconhecido_catalogo = true;
    itemAlvo.cadastrado_em = new Date().toISOString();
    await salvarEstadoEvento(eventoId, estado);
    return novoMaterial;
}

async function movimentarMaterial(eventoId, materialId, dados, user, headers = {}) {
    const { estado } = await carregarEstadoEvento(eventoId, { usuario: user });
    const ctx = calculos.resolverContextoUsuario(estado, user, headers);
    const material = (estado.materiais || []).find((m) => m.id === materialId);
    if (!material) throw erroHttp('Material não encontrado.', 404);

    const anterior = material.status_movimentacao;
    const novoEstagio = dados.estagio_novo || 'em_estoque';
    material.status_movimentacao = novoEstagio;

    const mov = {
        id: uuidv4(),
        material_id: material.id,
        estagio_anterior: anterior,
        estagio_novo: novoEstagio,
        setor_destino: dados.setor_destino || null,
        quantidade: Number(dados.quantidade || material.quantidade_recebida || 0),
        observacao: dados.observacao || '',
        registrado_por_nome: ctx.nome,
        criado_em: new Date().toISOString()
    };
    estado.movimentacoes_materiais = estado.movimentacoes_materiais || [];
    estado.movimentacoes_materiais.unshift(mov);
    registrarAuditoria(estado, ctx, 'MOVIMENTAR_MATERIAL', 'MATERIAL', material.id, { estagio: anterior }, { estagio: novoEstagio });
    await salvarEstadoEvento(eventoId, estado);
    return { material, movimentacao: mov };
}

async function registrarPresenca(eventoId, dados, user, headers = {}) {
    const { estado } = await carregarEstadoEvento(eventoId, { usuario: user });
    const ctx = calculos.resolverContextoUsuario(estado, user, headers);

    let produtorId = dados.produtor_id || null;

    // Integração com QR Code da credencial ou CPF
    if (!produtorId && (dados.qr_code_credencial || dados.cpf)) {
        const codigo = String(dados.qr_code_credencial || dados.cpf || '').trim().toLowerCase();
        const digitos = codigo.replace(/\D/g, '');
        let encontrado = (estado.produtores || []).find((p) =>
            (p.documento && p.documento.replace(/\D/g, '') === digitos && digitos.length >= 6) ||
            (p.email && p.email.toLowerCase() === codigo) ||
            p.id === codigo
        );
        if (!encontrado) {
            try {
                const { data: pessoa } = await supabase
                    .from('pessoas')
                    .select('id, nome, cpf, email, qr_code')
                    .eq('evento_id', eventoId)
                    .or(`qr_code.eq.${codigo},cpf.eq.${digitos}`)
                    .maybeSingle();
                if (pessoa) {
                    encontrado = (estado.produtores || []).find((p) =>
                        p.pessoa_id === pessoa.id ||
                        (pessoa.email && p.email?.toLowerCase() === pessoa.email.toLowerCase()) ||
                        (pessoa.cpf && p.documento?.replace(/\D/g, '') === pessoa.cpf.replace(/\D/g, ''))
                    );
                }
            } catch {}
        }
        if (encontrado) produtorId = encontrado.id;
    }

    produtorId = produtorId || ctx.produtorId;
    if (!produtorId) throw erroHttp('Produtor não localizado. Selecione na lista ou informe um código válido.', 400);

    if (dados.sync_id) {
        const dup = (estado.registros_presenca || []).find((r) => r.sync_id === dados.sync_id);
        if (dup) return dup;
    }

    const dataHora = dados.data_hora || new Date().toISOString();
    const tipo = dados.tipo || 'checkin';

    let dobraInfo = { ehDobra: false, motivo: null };
    if (tipo === 'checkin' || tipo === 'checkout') {
        dobraInfo = calculos.avaliarDobraPresenca(estado.registros_presenca || [], produtorId, dataHora);
    }

    const registro = {
        id: uuidv4(),
        evento_id: eventoId,
        produtor_id: produtorId,
        tipo,
        data_hora: dataHora,
        metodo: dados.metodo || (dados.qr_code_credencial ? 'qrcode' : 'manual'),
        geolocalizacao: dados.geolocalizacao || null,
        eh_dobra_detectada: Boolean(dados.eh_dobra_detectada || dobraInfo.ehDobra),
        motivo_ocorrencia: dados.motivo_ocorrencia || dobraInfo.motivo || null,
        registrado_por_nome: ctx.nome,
        sync_id: dados.sync_id || uuidv4()
    };

    estado.registros_presenca = estado.registros_presenca || [];
    estado.registros_presenca.unshift(registro);

    // Atualiza status da escala programada do dia, se existir
    const escalaMatch = (estado.escalas || []).find((e) => e.produtor_id === produtorId);
    if (escalaMatch) {
        if (tipo === 'checkin') escalaMatch.status = 'presente';
        else if (['falta', 'atraso', 'expulsao'].includes(tipo)) escalaMatch.status = tipo === 'expulsao' ? 'expulso' : tipo;
        else if (tipo === 'substituicao') escalaMatch.status = 'substituido';
    }

    registrarAuditoria(estado, ctx, `PRESENCA_${tipo.toUpperCase()}`, 'PRESENCA', registro.id, null, { eh_dobra: registro.eh_dobra_detectada });
    await salvarEstadoEvento(eventoId, estado);
    return registro;
}

async function criarEscala(eventoId, dados, user, headers = {}) {
    const { estado } = await carregarEstadoEvento(eventoId, { usuario: user });
    const ctx = calculos.resolverContextoUsuario(estado, user, headers);
    if (!['admin_master', 'master', 'produtor_geral', 'produtor_area'].includes(ctx.papel_producao)) {
        throw erroHttp('Sem permissão para criar escalas de equipe.', 403);
    }
    if (!dados.produtor_id) throw erroHttp('Selecione o produtor para a escala.', 400);

    const escala = {
        id: uuidv4(),
        evento_id: eventoId,
        area_id: dados.area_id || ctx.area_id || estado.areas?.[0]?.id || null,
        produtor_id: dados.produtor_id,
        nome_turno: dados.nome_turno || 'Turno de montagem',
        data_inicio_turno: dados.data_inicio_turno || new Date().toISOString(),
        data_fim_turno: dados.data_fim_turno || new Date(Date.now() + 8 * 3600000).toISOString(),
        tipo_turno: dados.tipo_turno || 'normal',
        status: 'agendado'
    };
    estado.escalas = estado.escalas || [];
    estado.escalas.unshift(escala);
    registrarAuditoria(estado, ctx, 'CRIAR_ESCALA', 'ESCALA', escala.id, null, { nome_turno: escala.nome_turno });
    await salvarEstadoEvento(eventoId, estado);
    return escala;
}

async function atualizarTarefa(eventoId, tarefaId, dados, user, headers = {}) {
    const { estado } = await carregarEstadoEvento(eventoId, { usuario: user });
    const ctx = calculos.resolverContextoUsuario(estado, user, headers);
    const tarefa = (estado.tarefas || []).find((t) => t.id === tarefaId);
    verificarAcessoTarefa(tarefa, ctx);

    const antes = { titulo: tarefa.titulo, prioridade: tarefa.prioridade, produtor_atribuido_id: tarefa.produtor_atribuido_id };
    if (dados.titulo !== undefined) tarefa.titulo = String(dados.titulo).trim() || tarefa.titulo;
    if (dados.objetivo !== undefined) tarefa.objetivo = dados.objetivo;
    if (dados.prioridade !== undefined) tarefa.prioridade = dados.prioridade;
    if (dados.produtor_atribuido_id !== undefined) tarefa.produtor_atribuido_id = dados.produtor_atribuido_id || null;
    if (dados.setor_id !== undefined) tarefa.setor_id = dados.setor_id || null;
    if (dados.planta_id !== undefined) tarefa.planta_id = dados.planta_id || null;
    if (dados.elemento_planta_id !== undefined) tarefa.elemento_planta_id = dados.elemento_planta_id || null;
    if (dados.elemento_planta_rotulo !== undefined) tarefa.elemento_planta_rotulo = dados.elemento_planta_rotulo || null;
    if (dados.fase_operacional !== undefined && ['montagem', 'evento', 'desmontagem'].includes(dados.fase_operacional)) {
        tarefa.fase_operacional = dados.fase_operacional;
    }
    if (dados.data_inicio_planejada !== undefined) tarefa.data_inicio_planejada = dados.data_inicio_planejada;
    if (dados.data_fim_planejada !== undefined) tarefa.data_fim_planejada = dados.data_fim_planejada;

    registrarAuditoria(estado, ctx, 'ATUALIZAR_TAREFA', 'TAREFA', tarefa.id, antes, { titulo: tarefa.titulo, prioridade: tarefa.prioridade });
    await salvarEstadoEvento(eventoId, estado);
    return { ...tarefa, ...calculos.calcularAnalisePrazoTarefa(tarefa) };
}

async function excluirTarefa(eventoId, tarefaId, user, headers = {}) {
    const { estado } = await carregarEstadoEvento(eventoId, { usuario: user });
    const ctx = calculos.resolverContextoUsuario(estado, user, headers);
    if (!['admin_master', 'master', 'produtor_geral'].includes(ctx.papel_producao)) {
        throw erroHttp('Apenas Produtor Geral ou Admin Master pode excluir tarefas.', 403);
    }
    const idx = (estado.tarefas || []).findIndex((t) => t.id === tarefaId);
    if (idx === -1) throw erroHttp('Tarefa não encontrada.', 404);
    const removida = estado.tarefas[idx];
    estado.tarefas.splice(idx, 1);
    estado.dependencias_tarefas = (estado.dependencias_tarefas || []).filter(
        (d) => d.tarefa_origem_id !== tarefaId && d.tarefa_dependente_id !== tarefaId
    );
    registrarAuditoria(estado, ctx, 'EXCLUIR_TAREFA', 'TAREFA', tarefaId, { titulo: removida.titulo }, null);
    await salvarEstadoEvento(eventoId, estado);
    return { id: tarefaId };
}

async function aplicarTemplateTarefas(eventoId, { tipo_template, area_id }, user, headers = {}) {
    const { estado } = await carregarEstadoEvento(eventoId, { usuario: user });
    const ctx = calculos.resolverContextoUsuario(estado, user, headers);
    const tpl = TEMPLATES_TAREFAS[tipo_template];
    if (!tpl) throw erroHttp('Template de evento inválido.', 400);

    const areaAlvo = area_id || ctx.area_id || estado.areas?.[0]?.id;
    if (!areaAlvo) throw erroHttp('Crie ao menos uma área antes de aplicar um template.', 400);

    const criadas = [];
    let cursorInicio = Date.now();
    for (const item of tpl.tarefas) {
        const inicio = new Date(cursorInicio);
        const fim = new Date(cursorInicio + 6 * 3600000);
        const nova = {
            id: uuidv4(),
            evento_id: eventoId,
            area_id: areaAlvo,
            titulo: item.titulo,
            objetivo: item.objetivo,
            sugestoes_levar: item.sugestoes_levar || [],
            prioridade: item.prioridade || 'media',
            status: 'disponivel',
            data_inicio_planejada: inicio.toISOString(),
            data_fim_planejada: fim.toISOString(),
            requer_aprovacao_conclusao: true,
            etapas: (item.etapas || []).map((desc, idx) => ({
                id: uuidv4(),
                ordem: idx + 1,
                descricao: desc,
                obrigatoria: true,
                concluida: false,
                evidencias: []
            }))
        };
        estado.tarefas.unshift(nova);
        if (criadas.length > 0) {
            estado.dependencias_tarefas = estado.dependencias_tarefas || [];
            estado.dependencias_tarefas.push({
                id: uuidv4(),
                tarefa_origem_id: criadas[criadas.length - 1].id,
                tarefa_dependente_id: nova.id,
                tipo: 'fim_para_inicio'
            });
        }
        criadas.push(nova);
        cursorInicio = fim.getTime();
    }

    registrarAuditoria(estado, ctx, 'APLICAR_TEMPLATE_TAREFAS', 'TAREFA', eventoId, null, { tipo_template, quantidade: criadas.length });
    await salvarEstadoEvento(eventoId, estado);
    return { rotulo: tpl.rotulo, criadas: criadas.length, tarefas: criadas };
}

async function criarDependenciaTarefa(eventoId, { tarefa_origem_id, tarefa_dependente_id, tipo = 'fim_para_inicio' }, user, headers = {}) {
    const { estado } = await carregarEstadoEvento(eventoId, { usuario: user });
    const ctx = calculos.resolverContextoUsuario(estado, user, headers);
    if (!tarefa_origem_id || !tarefa_dependente_id || tarefa_origem_id === tarefa_dependente_id) {
        throw erroHttp('Selecione duas tarefas distintas para criar dependência.', 400);
    }
    estado.dependencias_tarefas = estado.dependencias_tarefas || [];
    const existe = estado.dependencias_tarefas.some(
        (d) => d.tarefa_origem_id === tarefa_origem_id && d.tarefa_dependente_id === tarefa_dependente_id
    );
    if (existe) throw erroHttp('Esta dependência já existe.', 400);

    const cicloInverso = estado.dependencias_tarefas.some(
        (d) => d.tarefa_origem_id === tarefa_dependente_id && d.tarefa_dependente_id === tarefa_origem_id
    );
    if (cicloInverso) throw erroHttp('Dependência circular não permitida.', 400);

    const dep = { id: uuidv4(), tarefa_origem_id, tarefa_dependente_id, tipo };
    estado.dependencias_tarefas.push(dep);
    registrarAuditoria(estado, ctx, 'CRIAR_DEPENDENCIA', 'CRONOGRAMA', dep.id, null, dep);
    await salvarEstadoEvento(eventoId, estado);
    return dep;
}

async function criarMarco(eventoId, dados, user, headers = {}) {
    const { estado } = await carregarEstadoEvento(eventoId, { usuario: user });
    const ctx = calculos.resolverContextoUsuario(estado, user, headers);
    const titulo = String(dados.titulo || '').trim();
    if (!titulo) throw erroHttp('Informe o título do marco.', 400);

    const marco = {
        id: uuidv4(),
        titulo,
        data_prevista: dados.data_prevista || new Date().toISOString(),
        area_id: dados.area_id || null,
        concluido: false,
        concluido_em: null
    };
    estado.marcos = estado.marcos || [];
    estado.marcos.push(marco);
    registrarAuditoria(estado, ctx, 'CRIAR_MARCO', 'CRONOGRAMA', marco.id, null, { titulo: marco.titulo });
    await salvarEstadoEvento(eventoId, estado);
    return marco;
}

async function alternarMarco(eventoId, marcoId, user, headers = {}) {
    const { estado } = await carregarEstadoEvento(eventoId, { usuario: user });
    const ctx = calculos.resolverContextoUsuario(estado, user, headers);
    const marco = (estado.marcos || []).find((m) => m.id === marcoId);
    if (!marco) throw erroHttp('Marco não encontrado.', 404);
    marco.concluido = !marco.concluido;
    marco.concluido_em = marco.concluido ? new Date().toISOString() : null;
    registrarAuditoria(estado, ctx, 'ATUALIZAR_MARCO', 'CRONOGRAMA', marco.id, null, { concluido: marco.concluido });
    await salvarEstadoEvento(eventoId, estado);
    return marco;
}

async function dispararAlertasPrazos(eventoId, user, headers = {}) {
    const { estado } = await carregarEstadoEvento(eventoId, { usuario: user });
    const ctx = calculos.resolverContextoUsuario(estado, user, headers);
    const tarefas = calculos.calcularCaminhoCritico(estado.tarefas || [], estado.dependencias_tarefas || []);
    const criticas = tarefas.filter((t) => t.saude_prazo === 'atrasada' || t.saude_prazo === 'em_risco');
    const propostasPendentes = (estado.propostas_planta || []).filter((p) => p.status === 'pendente');

    const notificacoes = [];
    const hoje = new Date().toISOString().slice(0, 13); // dedupe por hora
    for (const t of criticas) {
        notificacoes.push({
            evento_id: eventoId,
            tipo: t.saude_prazo === 'atrasada' ? 'PRODUCAO_ATRASO' : 'PRODUCAO_RISCO',
            severidade: t.saude_prazo === 'atrasada' ? 'critical' : 'warning',
            titulo: t.saude_prazo === 'atrasada' ? `Tarefa atrasada: ${t.titulo}` : `Prazo em risco: ${t.titulo}`,
            mensagem: `${t.percentual_concluido}% concluído com ${t.percentual_prazo_consumido}% do prazo decorrido.`,
            referencia_tipo: 'producao_tarefa',
            referencia_id: t.id,
            chave_dedupe: `PROD_${t.saude_prazo}_${t.id}_${hoje}`
        });
    }
    for (const p of propostasPendentes) {
        notificacoes.push({
            evento_id: eventoId,
            tipo: 'PRODUCAO_PLANTA_PROPOSTA',
            severidade: 'info',
            titulo: `Proposta na planta aguardando Arquiteto: ${p.titulo}`,
            mensagem: `Enviada por ${p.autor_nome || 'Produtor'} para análise técnica.`,
            referencia_tipo: 'producao_proposta',
            referencia_id: p.id,
            chave_dedupe: `PROD_PROP_${p.id}_${hoje}`
        });
    }

    let gravadas = 0;
    if (notificacoes.length > 0) {
        try {
            const notificacaoService = require('../system/notificacao.service');
            const inseridas = await notificacaoService.criar(notificacoes);
            gravadas = inseridas.length;
        } catch (err) {
            logger.debug(`[Produção] Notificações pendentes em modo offline: ${err.message}`);
        }
    }

    registrarAuditoria(estado, ctx, 'DISPARAR_ALERTAS_PRAZO', 'CRONOGRAMA', eventoId, null, { total_alertas: notificacoes.length });
    await salvarEstadoEvento(eventoId, estado);
    return { alertas_identificados: notificacoes.length, notificacoes_criadas: gravadas, alertas: notificacoes };
}

async function atualizarOrcamento(eventoId, orcamentoId, dados, user, headers = {}) {
    const { estado } = await carregarEstadoEvento(eventoId, { usuario: user });
    const ctx = calculos.resolverContextoUsuario(estado, user, headers);
    if (!['admin_master', 'master', 'produtor_geral', 'financeiro'].includes(ctx.papel_producao)) {
        throw erroHttp('Acesso negado: apenas Financeiro, Produtor Geral ou Admin Master edita orçamentos.', 403);
    }
    const orc = (estado.orcamentos || []).find((o) => o.id === orcamentoId);
    if (!orc) throw erroHttp('Orçamento não encontrado.', 404);

    const antes = { status: orc.status, valor_realizado_centavos: orc.valor_realizado_centavos };
    if (dados.status !== undefined) orc.status = dados.status;
    if (dados.valor_previsto_centavos !== undefined) orc.valor_previsto_centavos = Math.max(0, Math.round(Number(dados.valor_previsto_centavos)));
    if (dados.valor_realizado_centavos !== undefined) orc.valor_realizado_centavos = Math.max(0, Math.round(Number(dados.valor_realizado_centavos)));
    if (dados.titulo !== undefined) orc.titulo = String(dados.titulo).trim() || orc.titulo;

    registrarAuditoria(estado, ctx, 'ATUALIZAR_ORCAMENTO', 'ORCAMENTO', orc.id, antes, { status: orc.status, valor_realizado_centavos: orc.valor_realizado_centavos });
    await salvarEstadoEvento(eventoId, estado);
    return orc;
}

async function excluirOrcamento(eventoId, orcamentoId, user, headers = {}) {
    const { estado } = await carregarEstadoEvento(eventoId, { usuario: user });
    const ctx = calculos.resolverContextoUsuario(estado, user, headers);
    if (!['admin_master', 'master', 'produtor_geral', 'financeiro'].includes(ctx.papel_producao)) {
        throw erroHttp('Acesso negado: apenas Financeiro, Produtor Geral ou Admin Master exclui orçamentos.', 403);
    }
    const idx = (estado.orcamentos || []).findIndex((o) => o.id === orcamentoId);
    if (idx === -1) throw erroHttp('Orçamento não encontrado.', 404);
    estado.orcamentos.splice(idx, 1);
    registrarAuditoria(estado, ctx, 'EXCLUIR_ORCAMENTO', 'ORCAMENTO', orcamentoId, null, null);
    await salvarEstadoEvento(eventoId, estado);
    return { id: orcamentoId };
}

async function criarOrcamento(eventoId, dados, user, headers = {}) {
    const { estado } = await carregarEstadoEvento(eventoId, { usuario: user });
    const ctx = calculos.resolverContextoUsuario(estado, user, headers);
    if (!['admin_master', 'master', 'produtor_geral', 'financeiro'].includes(ctx.papel_producao)) {
        throw erroHttp('Acesso negado: apenas Financeiro, Produtor Geral ou Admin Master gerencia orçamentos.', 403);
    }
    const titulo = String(dados.titulo || '').trim();
    if (!titulo) throw erroHttp('Informe o título do item orçamentário.', 400);

    const novo = {
        id: uuidv4(),
        evento_id: eventoId,
        area_id: dados.area_id || null,
        fornecedor_nome: dados.fornecedor_nome || '',
        titulo,
        valor_previsto_centavos: Math.max(0, Math.round(Number(dados.valor_previsto_centavos || 0))),
        valor_realizado_centavos: Math.max(0, Math.round(Number(dados.valor_realizado_centavos || 0))),
        status: dados.status || 'rascunho'
    };
    estado.orcamentos = estado.orcamentos || [];
    estado.orcamentos.unshift(novo);
    registrarAuditoria(estado, ctx, 'CRIAR_ORCAMENTO', 'ORCAMENTO', novo.id, null, { titulo: novo.titulo });
    await salvarEstadoEvento(eventoId, estado);
    return novo;
}

async function salvarTemplateRelatorio(eventoId, dados, user, headers = {}) {
    const { estado } = await carregarEstadoEvento(eventoId, { usuario: user });
    const ctx = calculos.resolverContextoUsuario(estado, user, headers);
    estado.template_relatorio = {
        ...(estado.template_relatorio || {}),
        nome: dados.nome || estado.template_relatorio?.nome || 'Padrão NZT',
        cor_cabecalho_hex: dados.cor_cabecalho_hex || '#0A1628',
        rodape_personalizado: dados.rodape_personalizado || 'Relatório oficial de produção • NZT Eventos',
        marca_dagua_texto: dados.marca_dagua_texto ?? 'USO INTERNO • PRODUÇÃO NZT',
        marca_dagua_opacidade: Number(dados.marca_dagua_opacidade ?? 0.08),
        horario_diario_automatico: dados.horario_diario_automatico || '22:00',
        exibir_fotos_evidencia: dados.exibir_fotos_evidencia !== false,
        exibir_financeiro: Boolean(dados.exibir_financeiro)
    };
    registrarAuditoria(estado, ctx, 'ATUALIZAR_TEMPLATE_PDF', 'RELATORIO', eventoId, null, estado.template_relatorio);
    await salvarEstadoEvento(eventoId, estado);
    return estado.template_relatorio;
}

async function gerarRelatorioPdf(eventoId, opcoes, user, headers = {}) {
    const { evento, estado } = await carregarEstadoEvento(eventoId, { usuario: user });
    const ctx = calculos.resolverContextoUsuario(estado, user, headers);
    const buffer = await gerarRelatorioPdfBuffer(evento, estado, opcoes, ctx);

    estado.relatorios_gerados = estado.relatorios_gerados || [];
    estado.relatorios_gerados.unshift({
        id: uuidv4(),
        tipo: opcoes.tipo || 'diario_automatico',
        data_referencia: opcoes.dataReferencia || new Date().toISOString().slice(0, 10),
        tamanho_bytes: buffer.length,
        gerado_por_nome: ctx.nome,
        gerado_em: new Date().toISOString()
    });
    if (estado.relatorios_gerados.length > 30) estado.relatorios_gerados = estado.relatorios_gerados.slice(0, 30);
    await salvarEstadoEvento(eventoId, estado);
    return buffer;
}

async function sincronizarFilaOffline(eventoId, itens = [], user, headers = {}) {
    const resultados = [];
    for (const item of Array.isArray(itens) ? itens : []) {
        try {
            const { acao, payload = {} } = item;
            if (acao === 'evidencia') {
                const res = await adicionarEvidenciaEtapa(eventoId, payload.tarefa_id, payload.etapa_id, { ...payload, sync_id: item.sync_id || payload.sync_id }, user, headers);
                resultados.push({ sync_id: item.sync_id, ok: true, id: res.id });
            } else if (acao === 'etapa_toggle') {
                const res = await alternarEtapaTarefa(eventoId, payload.tarefa_id, payload.etapa_id, payload, user, headers);
                resultados.push({ sync_id: item.sync_id, ok: true, id: res.id });
            } else if (acao === 'presenca') {
                const res = await registrarPresenca(eventoId, { ...payload, sync_id: item.sync_id || payload.sync_id }, user, headers);
                resultados.push({ sync_id: item.sync_id, ok: true, id: res.id });
            } else {
                resultados.push({ sync_id: item.sync_id, ok: false, erro: 'Ação offline desconhecida' });
            }
        } catch (err) {
            resultados.push({ sync_id: item.sync_id, ok: false, erro: err.message });
        }
    }
    return { sincronizados: resultados.filter((r) => r.ok).length, resultados };
}

module.exports = {
    ...calculos,
    autenticarPortalProdutor,
    obterResumo,
    carregarSeed,
    criarArea,
    criarProdutor,
    atualizarProdutor,
    definirAcessoProdutor,
    gerarConviteProdutor,
    anonimizarProdutorLgpd,
    criarProjeto,
    adicionarArquivoProjeto,
    criarTarefa,
    atualizarTarefa,
    excluirTarefa,
    aplicarTemplateTarefas,
    criarDependenciaTarefa,
    iniciarTarefa,
    alternarEtapaTarefa,
    adicionarEvidenciaEtapa,
    avaliarTarefa,
    criarMarco,
    alternarMarco,
    dispararAlertasPrazos,
    criarPropostaPlanta,
    avaliarPropostaPlanta,
    criarPlanta,
    adicionarCamadaPlanta,
    atualizarCamadaPlanta,
    excluirCamadaPlanta,
    criarSetorPlanta,
    atualizarSetorPlanta,
    excluirSetorPlanta,
    publicarVersaoOficialPlanta,
    gerarPlanoFasesElemento,
    criarMaterial,
    atualizarMaterial,
    obterCatalogoVisaoMateriais,
    registrarConferenciaIa,
    confirmarItemContagem,
    cadastrarMaterialNaoReconhecido,
    movimentarMaterial,
    registrarPresenca,
    criarEscala,
    criarOrcamento,
    atualizarOrcamento,
    excluirOrcamento,
    salvarTemplateRelatorio,
    gerarRelatorioPdf,
    sincronizarFilaOffline,
    _limparMemoriaTestes: () => memoriaEventos.clear()
};
