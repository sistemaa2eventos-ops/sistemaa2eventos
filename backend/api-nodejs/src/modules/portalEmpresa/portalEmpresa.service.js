'use strict';

const { supabase } = require('../../config/supabase');
const logger = require('../../services/logger');
const { assinarLinhas, assinarFotos } = require('../../services/storageSeguro');
const requisitos = require('../entities/documentoRequisitos.service');
const documentoService = require('../entities/documento.service');
const empresaResumo = require('../entities/empresaResumo.service');
const planilhaService = require('../planilha/planilha.service');
const { CAMPOS, cpfValido, lerData } = require('../planilha/planilhaModelo');
const auth = require('./portalEmpresaAuth');

const erroHttp = (mensagem, status) => Object.assign(new Error(mensagem), { status });

/** O que o responsável muda direto no portal (contato). Nome, CNPJ e e-mail (login) só por solicitação. */
const CAMPOS_EMPRESA_DIRETOS = ['responsavel', 'responsavel_legal', 'telefone', 'servico'];
/** O que pode ser pedido numa solicitação de edição da empresa. */
const CAMPOS_EMPRESA_SOLICITACAO = ['nome', 'cnpj', 'email', ...CAMPOS_EMPRESA_DIRETOS];
/** O que pode ser pedido numa solicitação de edição de participante (campos da planilha). */
const CAMPOS_PESSOA_SOLICITACAO = Object.keys(CAMPOS);

const TIPOS_SOLICITACAO = ['excluir_participante', 'editar_participante', 'excluir_documento', 'editar_empresa', 'outro'];

const URL_CADASTRO = () => process.env.PUBLIC_PORTAL_URL_CADASTRO || 'https://cadastro.nzt.app.br';

/** Só os campos permitidos, com texto limpo; valores vazios ficam de fora. */
function filtrarCampos(dados, permitidos) {
    const saida = {};
    for (const campo of permitidos) {
        if (dados?.[campo] === undefined) continue;
        const valor = String(dados[campo] ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
        saida[campo] = valor || null;
    }
    return saida;
}

/** Validação dos campos de participante (CPF, data e e-mail). Devolve o motivo do erro ou null. */
function validarCamposPessoa(dados) {
    if ('nome_completo' in dados && !dados.nome_completo) return 'O nome completo não pode ficar vazio.';
    if (dados.cpf !== undefined) {
        dados.cpf = String(dados.cpf || '').replace(/\D/g, '');
        if (!cpfValido(dados.cpf)) return 'CPF inválido.';
    }
    if (dados.data_nascimento) {
        const d = lerData(dados.data_nascimento);
        if (d.invalido) return 'Data de nascimento inválida.';
        dados.data_nascimento = d.valor;
    }
    if (dados.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dados.email)) return 'E-mail inválido.';
    if (dados.email) dados.email = dados.email.toLowerCase();
    return null;
}

class PortalEmpresaService {
    /**
     * Login do responsável: e-mail (o mesmo da empresa no painel) + chave de acesso.
     * O mesmo e-mail pode responder por empresas de eventos diferentes: vale a empresa cuja chave confere.
     */
    async login({ email, chave }) {
        const emailLimpo = String(email || '').trim().toLowerCase();
        if (!emailLimpo || !chave) throw erroHttp('Informe o e-mail e a chave de acesso.', 400);

        // ilike sem curingas: % e _ do texto digitado são escapados
        const padrao = emailLimpo.replace(/[%_\\]/g, (c) => `\\${c}`);
        const { data: candidatas, error } = await supabase.from('empresas')
            .select('id, evento_id, nome, ativo, portal_chave_hash, portal_chave_gerada_em, eventos(nome, status)')
            .ilike('email', padrao)
            .not('portal_chave_hash', 'is', null);
        if (error) throw error;

        const empresa = (candidatas || []).find(e => auth.conferirChave(chave, e.portal_chave_hash));
        if (!empresa) throw erroHttp('E-mail ou chave de acesso incorretos.', 401);
        if (empresa.ativo === false) throw erroHttp('Empresa desativada neste evento. Fale com a organização.', 403);
        // Evento encerrado: o login continua permitido (consulta); a escrita é bloqueada no middleware

        await supabase.from('empresas').update({ portal_ultimo_acesso: new Date().toISOString() }).eq('id', empresa.id);
        logger.info(`[PortalEmpresa] Login: ${empresa.nome} (evento ${empresa.evento_id})`);
        return {
            token: auth.assinarToken(empresa),
            empresa: { id: empresa.id, nome: empresa.nome },
            evento: { nome: empresa.eventos?.nome || '' }
        };
    }

    /** Dados da empresa, do evento, cota e link de cadastro da equipe. */
    async perfil({ id, evento_id }) {
        const { data: e, error } = await supabase.from('empresas')
            .select('id, nome, cnpj, email, responsavel, responsavel_legal, telefone, servico, max_colaboradores, datas_presenca, registration_token, registration_token_expires_at, eventos(nome, datas_montagem, datas_evento, datas_desmontagem)')
            .eq('id', id).eq('evento_id', evento_id).single();
        if (error) throw error;
        const { count } = await supabase.from('pessoas').select('id', { count: 'exact', head: true })
            .eq('empresa_id', id).eq('evento_id', evento_id);
        const { eventos, registration_token: token, registration_token_expires_at: expira, ...empresa } = e;
        return {
            empresa,
            evento: {
                nome: eventos?.nome || '',
                datas: [...new Set([...(eventos?.datas_montagem || []), ...(eventos?.datas_evento || []), ...(eventos?.datas_desmontagem || [])])].sort()
            },
            cota: { usados: count || 0, limite: e.max_colaboradores || 0 },
            link_cadastro: token ? `${URL_CADASTRO()}/register/${token}` : null,
            link_cadastro_expira_em: expira || null,
            campos_editaveis: CAMPOS_EMPRESA_DIRETOS,
            campos_solicitacao: CAMPOS_EMPRESA_SOLICITACAO
        };
    }

    async atualizarContato({ id, evento_id }, dados) {
        const invalidos = Object.keys(dados || {}).filter(c => !CAMPOS_EMPRESA_DIRETOS.includes(c));
        if (invalidos.length) throw erroHttp('Nome, CNPJ e e-mail mudam só por solicitação à organização.', 400);
        const mudancas = filtrarCampos(dados, CAMPOS_EMPRESA_DIRETOS);
        if (!Object.keys(mudancas).length) throw erroHttp('Nada para alterar.', 400);
        const { error } = await supabase.from('empresas')
            .update({ ...mudancas, updated_at: new Date().toISOString() }).eq('id', id).eq('evento_id', evento_id);
        if (error) throw error;
        logger.info(`[PortalEmpresa] Contato atualizado pela empresa ${id}: ${Object.keys(mudancas).join(', ')}`);
        return this.perfil({ id, evento_id });
    }

    /** Participantes com movimento de hoje e situação documental (mesma visão do painel). */
    resumo({ id, evento_id }) {
        return empresaResumo.resumoParticipantes(evento_id, id);
    }

    async _pessoaDaEmpresa({ id, evento_id }, pessoaId, colunas = 'id') {
        const { data, error } = await supabase.from('pessoas').select(colunas)
            .eq('id', pessoaId).eq('empresa_id', id).eq('evento_id', evento_id).maybeSingle();
        if (error) throw error;
        if (!data) throw erroHttp('Participante não encontrado nesta empresa.', 404);
        return data;
    }

    /** Ficha do participante: dados, documentos (com link temporário) e movimentos recentes. */
    async participante(empresa, pessoaId) {
        const colunas = [...Object.keys(CAMPOS), 'id', 'numero_pulseira', 'status_acesso', 'bloqueado', 'aceite_lgpd', 'origem_cadastro', 'foto_url', 'created_at'];
        const pessoa = await this._pessoaDaEmpresa(empresa, pessoaId, [...new Set(colunas)].join(', '));
        const [situacao, movimentos] = await Promise.all([
            documentoService.situacaoEntidade(empresa.evento_id, 'pessoa', pessoaId),
            supabase.from('logs_acesso').select('tipo, created_at')
                .eq('pessoa_id', pessoaId).eq('evento_id', empresa.evento_id)
                .in('tipo', ['checkin', 'checkout', 'expulsao'])
                .order('created_at', { ascending: false }).limit(30)
        ]);
        await assinarLinhas(situacao.documentos);
        if (pessoa.foto_url) {
            const assinados = await assinarFotos([{ id: pessoa.id, foto_url: pessoa.foto_url }]);
            if (assinados.has(pessoa.id)) pessoa.foto_url = assinados.get(pessoa.id);
        }
        const { aceite_lgpd: aceite, origem_cadastro: origem, ...dados } = pessoa;
        return {
            pessoa: { ...dados, cadastro_concluido: aceite === true || origem !== 'externo' },
            documentos: situacao.documentos.map(d => ({
                id: d.id, titulo: d.titulo, tipo_nome: d.tipo_nome, status: d.status, url: d.url_arquivo,
                data_inclusao: d.data_inclusao, data_validade: d.data_validade, motivo_recusa: ['reprovado', 'rejeitado', 'reenvio_solicitado'].includes(d.status) ? d.notas_auditoria : null
            })),
            obrigatorios: situacao.obrigatorios,
            situacao_documental: situacao.situacao,
            movimentos: movimentos.data || []
        };
    }

    /** Inclusão de participante pelo portal: entra como pré-cadastro (mesmas regras da planilha). */
    async incluirParticipante(empresa, dadosBrutos) {
        const dados = filtrarCampos(dadosBrutos, Object.keys(CAMPOS));
        if (!dados.nome_completo) throw erroHttp('Informe o nome completo.', 400);
        if (!dados.cpf) throw erroHttp('Informe o CPF.', 400);
        const erro = validarCamposPessoa(dados);
        if (erro) throw erroHttp(erro, 400);
        for (const k of Object.keys(dados)) if (dados[k] === null) delete dados[k];

        const { data: emp } = await supabase.from('empresas').select('id, nome, max_colaboradores').eq('id', empresa.id).single();
        const r = await planilhaService.gravarLinhas({ eventoId: empresa.evento_id, empresa: emp, linhas: [{ linha: 1, dados }] });
        if (r.erros.length) throw erroHttp(r.erros[0].motivo, 409);
        return { criado: r.criados === 1, atualizado: r.atualizados === 1 };
    }

    async _tipoDocumento(eventoId, tipoId) {
        const config = await requisitos.getConfig(eventoId);
        const tipo = config.tipos.find(t => t.id === tipoId && t.ativo !== false);
        if (!tipo) throw erroHttp('Escolha o tipo de documento.', 400);
        return tipo;
    }

    /** Documento novo (da empresa ou de um participante dela): entra na fila de análise. */
    async enviarDocumento(empresa, { entityType, entityId, tipo_documento_id, data_validade, file }) {
        if (!file) throw erroHttp('Envie o arquivo (PDF, JPG ou PNG).', 400);
        if (entityType === 'pessoa') await this._pessoaDaEmpresa(empresa, entityId);
        const tipo = await this._tipoDocumento(empresa.evento_id, tipo_documento_id);
        if (tipo.exige_validade && !/^\d{4}-\d{2}-\d{2}$/.test(String(data_validade || ''))) {
            throw erroHttp(`Informe a data de validade (obrigatória para ${tipo.nome}).`, 400);
        }
        const doc = await documentoService.uploadDocumento(supabase, {
            entityType,
            entityId: entityType === 'empresa' ? empresa.id : entityId,
            titulo: tipo.nome,
            tipo_doc: tipo.nome,
            tipo_documento_id: tipo.id,
            data_validade: data_validade || null,
            file
        });
        logger.info(`[PortalEmpresa] Documento ${tipo.nome} enviado pela empresa ${empresa.id} (${entityType} ${entityId || empresa.id})`);
        return { id: doc.id, status: doc.status };
    }

    async documentosDaEmpresa(empresa) {
        const situacao = await documentoService.situacaoEntidade(empresa.evento_id, 'empresa', empresa.id);
        await assinarLinhas(situacao.documentos);
        return {
            obrigatorios: situacao.obrigatorios,
            situacao_documental: situacao.situacao,
            documentos: situacao.documentos.map(d => ({
                id: d.id, titulo: d.titulo, tipo_nome: d.tipo_nome, status: d.status, url: d.url_arquivo,
                data_inclusao: d.data_inclusao, data_validade: d.data_validade,
                motivo_recusa: ['reprovado', 'rejeitado', 'reenvio_solicitado'].includes(d.status) ? d.notas_auditoria : null
            }))
        };
    }

    async tiposDocumento(eventoId) {
        const config = await requisitos.getConfig(eventoId);
        return config.tipos.filter(t => t.ativo !== false).map(t => ({ id: t.id, nome: t.nome, exige_validade: !!t.exige_validade }));
    }

    // ── Solicitações (exclusões e edições passam pela organização) ──

    async listarSolicitacoes({ id }) {
        const { data, error } = await supabase.from('empresa_solicitacoes')
            .select('id, tipo, alvo_tipo, alvo_id, alvo_resumo, dados, motivo, status, resposta, decidida_em, created_at')
            .eq('empresa_id', id).order('created_at', { ascending: false }).limit(200);
        if (error) throw error;
        return data || [];
    }

    /**
     * Pedido para a organização. Confere que o alvo é desta empresa e guarda um resumo legível.
     * @param {{ tipo, alvo_id?, alvo_tipo?, dados?, motivo? }} pedido
     */
    async criarSolicitacao(empresa, pedido) {
        const tipo = pedido?.tipo;
        if (!TIPOS_SOLICITACAO.includes(tipo)) throw erroHttp('Tipo de solicitação inválido.', 400);
        const motivo = String(pedido.motivo || '').trim().slice(0, 1000);
        let alvoTipo = null;
        let alvoId = null;
        let alvoResumo = null;
        let dados = {};

        if (tipo === 'excluir_participante' || tipo === 'editar_participante') {
            const p = await this._pessoaDaEmpresa(empresa, pedido.alvo_id, 'id, nome_completo');
            alvoTipo = 'pessoa';
            alvoId = p.id;
            alvoResumo = p.nome_completo;
            if (tipo === 'editar_participante') {
                dados = filtrarCampos(pedido.dados, CAMPOS_PESSOA_SOLICITACAO);
                const erro = validarCamposPessoa(dados);
                if (erro) throw erroHttp(erro, 400);
            }
        } else if (tipo === 'excluir_documento') {
            const ehEmpresa = pedido.alvo_tipo === 'documento_empresa';
            const tabela = ehEmpresa ? 'empresa_documentos' : 'pessoa_documentos';
            const { data: doc } = await supabase.from(tabela).select(ehEmpresa ? 'id, titulo, empresa_id' : 'id, titulo, pessoa_id')
                .eq('id', pedido.alvo_id).maybeSingle();
            if (!doc) throw erroHttp('Documento não encontrado.', 404);
            if (ehEmpresa ? doc.empresa_id !== empresa.id : !(await this._pessoaDaEmpresa(empresa, doc.pessoa_id, 'id').catch(() => null))) {
                throw erroHttp('Documento não encontrado nesta empresa.', 404);
            }
            alvoTipo = ehEmpresa ? 'documento_empresa' : 'documento_pessoa';
            alvoId = doc.id;
            alvoResumo = doc.titulo;
        } else if (tipo === 'editar_empresa') {
            alvoTipo = 'empresa';
            alvoId = empresa.id;
            alvoResumo = empresa.nome;
            dados = filtrarCampos(pedido.dados, CAMPOS_EMPRESA_SOLICITACAO);
            if (dados.cnpj) dados.cnpj = dados.cnpj.replace(/\D/g, '');
            if (dados.email) {
                dados.email = dados.email.toLowerCase();
                if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dados.email)) throw erroHttp('E-mail inválido.', 400);
            }
        }

        if (['editar_participante', 'editar_empresa'].includes(tipo) && !Object.keys(dados).length) {
            throw erroHttp('Informe o que deve ser alterado.', 400);
        }
        if ((tipo.startsWith('excluir') || tipo === 'outro') && motivo.length < 5) {
            throw erroHttp('Explique o motivo da solicitação.', 400);
        }

        if (alvoId) {
            const { data: aberta } = await supabase.from('empresa_solicitacoes').select('id')
                .eq('empresa_id', empresa.id).eq('tipo', tipo).eq('alvo_id', alvoId).eq('status', 'pendente').limit(1);
            if (aberta?.length) throw erroHttp('Já existe uma solicitação igual aguardando a organização.', 409);
        }

        const { data, error } = await supabase.from('empresa_solicitacoes').insert([{
            evento_id: empresa.evento_id, empresa_id: empresa.id, tipo,
            alvo_tipo: alvoTipo, alvo_id: alvoId, alvo_resumo: alvoResumo, dados, motivo: motivo || null
        }]).select('id, tipo, status, created_at').single();
        if (error) throw error;
        logger.info(`[PortalEmpresa] Solicitação ${tipo} criada pela empresa ${empresa.id}`);
        return data;
    }

    async cancelarSolicitacao({ id }, solicitacaoId) {
        const { data, error } = await supabase.from('empresa_solicitacoes')
            .update({ status: 'cancelada', decidida_em: new Date().toISOString() })
            .eq('id', solicitacaoId).eq('empresa_id', id).eq('status', 'pendente').select('id');
        if (error) throw error;
        if (!data?.length) throw erroHttp('Solicitação não encontrada ou já decidida.', 404);
        return { cancelada: true };
    }
}

module.exports = new PortalEmpresaService();
module.exports.CAMPOS_EMPRESA_SOLICITACAO = CAMPOS_EMPRESA_SOLICITACAO;
module.exports.CAMPOS_PESSOA_SOLICITACAO = CAMPOS_PESSOA_SOLICITACAO;
module.exports.validarCamposPessoa = validarCamposPessoa;
module.exports.filtrarCampos = filtrarCampos;
