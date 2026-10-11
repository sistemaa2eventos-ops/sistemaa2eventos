const { supabase, uploadImage } = require('../../config/supabase');
const logger = require('../../services/logger');
const requisitos = require('./documentoRequisitos.service');
const { normalizarFuncao, FUNCAO_PADRAO } = require('./documentoRequisitos.service');
const { getHojeLocal } = require('../../utils/dateUtils');

const STATUS_AUDITORIA = ['aprovado', 'reprovado', 'reenvio_solicitado'];
const STATUS_EM_FILA = ['pendente', 'em_analise'];

class DocumentoService {
    /**
     * Valida assinatura de arquivo (Magic Numbers)
     */
    isValidBuffer(buffer, mimetype) {
        const hex = buffer.toString('hex', 0, 4).toUpperCase();
        if (mimetype === 'application/pdf' && hex.startsWith('25504446')) return true;
        if (mimetype === 'image/jpeg' && hex.startsWith('FFD8FF')) return true;
        if (mimetype === 'image/png' && hex.startsWith('89504E47')) return true;
        return false;
    }

    /**
     * Upload e registro de documento
     */
    async uploadDocumento(supabaseClient, { entityType, entityId, titulo, tipo_doc, tipo_documento_id, file }) {
        if (!this.isValidBuffer(file.buffer, file.mimetype)) {
            throw new Error('Arquivo corrompido ou formato forjado (Spoofing detectado).');
        }

        const BUCKET_NAME = 'documentos_operacionais';
        const fileExt = file.originalname.split('.').pop();
        const fileName = `${entityType}_${entityId}_${Date.now()}.${fileExt}`;
        const filePath = `${entityType}s/${entityId}/${fileName}`;

        // Upload to Storage
        const uploadResult = await uploadImage(BUCKET_NAME, filePath, file.buffer, file.mimetype);
        if (!uploadResult.success) throw new Error(`Falha no upload do Supabase: ${uploadResult.error}`);

        const tableName = entityType === 'empresa' ? 'empresa_documentos' : 'pessoa_documentos';
        const idCol = entityType === 'empresa' ? 'empresa_id' : 'pessoa_id';

        const registro = {
            [idCol]: entityId,
            titulo,
            tipo_doc,
            url_arquivo: uploadResult.url,
            status: 'pendente'
        };
        if (tipo_documento_id) registro.tipo_documento_id = tipo_documento_id;

        const { data, error } = await supabaseClient.from(tableName).insert([registro]).select().single();

        if (error) throw error;
        logger.info(`📄 Documento '${tipo_doc}' submetido para aprovação (${entityType}: ${entityId})`);

        // Documento novo pode mudar a situação da pessoa (ex.: de "não enviado" para "em análise")
        if (entityType === 'pessoa') await this.sincronizarStatusPessoa(supabaseClient, entityId);
        return data;
    }

    /** 'rejeitado' (legado) e 'reprovado' são o mesmo status. */
    normalizarStatus(status) {
        return status === 'rejeitado' ? 'reprovado' : status;
    }

    /**
     * Exige data de validade ao aprovar documento cujo tipo a requer.
     * Considera o tipo informado na auditoria ou o já gravado no documento.
     */
    async validarValidade({ status, data_validade, tipo_documento_id }, docsAtuais = []) {
        if (status !== 'aprovado' || data_validade) return;
        const tipoIds = new Set([tipo_documento_id, ...docsAtuais.map(d => d.tipo_documento_id)].filter(Boolean));
        if (tipoIds.size === 0) return;
        const { data: tipos } = await supabase.from('evento_tipos_documento')
            .select('nome, exige_validade').in('id', [...tipoIds]);
        const exigem = (tipos || []).filter(t => t.exige_validade).map(t => t.nome);
        if (exigem.length > 0) {
            const err = new Error(`Informe a data de validade (obrigatória para: ${exigem.join(', ')}).`);
            err.status = 400;
            throw err;
        }
    }

    montarPayloadAuditoria({ status, notas_auditoria, data_emissao, data_validade, tipo_documento_id }, auditorId) {
        const payload = {
            status: this.normalizarStatus(status),
            notas_auditoria: notas_auditoria || null,
            revisado_por_user_id: auditorId,
            data_revisao: new Date().toISOString()
        };
        if (tipo_documento_id) payload.tipo_documento_id = tipo_documento_id;
        if (payload.status === 'aprovado') {
            if (data_emissao) payload.data_emissao = data_emissao;
            if (data_validade) payload.data_validade = data_validade;
        }
        return payload;
    }

    /**
     * Audita um único documento e sincroniza status do participante
     */
    async auditarDocumento(supabaseClient, entityType, docId, auditData, auditorId) {
        const tableName = entityType === 'empresa' ? 'empresa_documentos' : 'pessoa_documentos';
        const status = this.normalizarStatus(auditData.status);

        const { data: atual } = await supabase.from(tableName).select('tipo_documento_id').eq('id', docId).maybeSingle();
        await this.validarValidade({ ...auditData, status }, atual ? [atual] : []);

        const { data, error } = await supabaseClient
            .from(tableName)
            .update(this.montarPayloadAuditoria({ ...auditData, status }, auditorId))
            .eq('id', docId)
            .select()
            .single();

        if (error) throw error;

        // Automação de Status do Participante
        if (entityType === 'pessoa') {
            await this.sincronizarStatusPessoa(supabaseClient, data.pessoa_id);
        }

        return data;
    }

    /**
     * Auditoria em lote de documentos
     */
    async batchAudit(supabaseClient, body, auditorId) {
        const { documentos } = body;
        const status = this.normalizarStatus(body.status);
        const empDocs = documentos.filter(d => d.tipo_entidade === 'empresa').map(d => d.id);
        const pesDocs = documentos.filter(d => d.tipo_entidade === 'pessoa').map(d => d.id);

        const atuais = [];
        if (pesDocs.length) atuais.push(...((await supabase.from('pessoa_documentos').select('tipo_documento_id').in('id', pesDocs)).data || []));
        if (empDocs.length) atuais.push(...((await supabase.from('empresa_documentos').select('tipo_documento_id').in('id', empDocs)).data || []));
        await this.validarValidade({ ...body, status }, atuais);

        const updatePayload = this.montarPayloadAuditoria({ ...body, status }, auditorId);

        const promises = [];
        if (empDocs.length > 0) promises.push(supabaseClient.from('empresa_documentos').update(updatePayload).in('id', empDocs));
        if (pesDocs.length > 0) promises.push(supabaseClient.from('pessoa_documentos').update(updatePayload).in('id', pesDocs));

        const results = await Promise.allSettled(promises);
        const errors = results
            .filter(r => r.status === 'rejected' || (r.value && r.value.error))
            .map(r => r.reason || (r.value && r.value.error));
        if (errors.length > 0) {
            const detailErrors = errors.map(e => e.message || e);
            logger.error('Erros parciais no Batch Audit:', JSON.stringify(detailErrors));
            throw new Error(`Algumas atualizações falharam no processamento em lote: ${detailErrors.join('; ')}`);
        }

        // Sincronizar status de pessoas afetadas
        if (pesDocs.length > 0) {
            const { data: afetados } = await supabaseClient.from('pessoa_documentos').select('pessoa_id').in('id', pesDocs);
            if (afetados) {
                const uniqueIds = [...new Set(afetados.map(a => a.pessoa_id))];
                for (const pId of uniqueIds) {
                    await this.sincronizarStatusPessoa(supabaseClient, pId);
                }
            }
        }

        return true;
    }

    /**
     * Regra de negócio: status documental e de acesso da pessoa a partir dos documentos
     * exigidos para a função dela (ver documentoRequisitos.service).
     *
     * - Documentação ok → autorizado (ou mantém checkin_feito).
     * - Reprovado → recusado.
     * - Demais casos → pendente (o operador pode liberar por turno; ver liberacao_manual_ate).
     */
    async sincronizarStatusPessoa(_supabaseClient, pessoaId) {
        if (!pessoaId) return null;

        try {
            const { data: pessoa } = await supabase
                .from('pessoas')
                .select('id, evento_id, funcao, status_acesso, status_documentos')
                .eq('id', pessoaId)
                .single();
            if (!pessoa) return null;

            const avaliacao = await requisitos.avaliarPessoa(pessoa);
            const novoStatusDocs = avaliacao.status_documentos;

            // Status de acesso (preserva quem está dentro do evento e bloqueios manuais)
            let novoStatusAcesso = pessoa.status_acesso || 'pendente';
            const intocavel = ['checkin_feito', 'bloqueado'].includes(pessoa.status_acesso);
            if (!intocavel) {
                if (novoStatusDocs === 'aprovado') novoStatusAcesso = 'autorizado';
                else if (novoStatusDocs === 'reprovado') novoStatusAcesso = 'recusado';
                else if (avaliacao.regras_ativas || novoStatusDocs !== 'pendente') novoStatusAcesso = 'pendente';
            }

            const { error: updateErr } = await supabase.from('pessoas')
                .update({ status_documentos: novoStatusDocs, status_acesso: novoStatusAcesso, updated_at: new Date().toISOString() })
                .eq('id', pessoaId);
            if (updateErr) {
                await supabase.from('pessoas').update({ status_acesso: novoStatusAcesso }).eq('id', pessoaId);
            }

            logger.info(`🔄 Pessoa [${pessoaId}] sincronizada: Docs=${novoStatusDocs.toUpperCase()} | Acesso=${novoStatusAcesso.toUpperCase()}${avaliacao.pendencias.length ? ` | Pendências: ${avaliacao.pendencias.map(p => p.nome).join(', ')}` : ''}`);
            return { ...avaliacao, status_acesso: novoStatusAcesso };
        } catch (err) {
            logger.warn(`⚠️ [DocumentoService] Falha ao sincronizar status da pessoa ${pessoaId}: ${err.message}`);
            return null;
        }
    }

    /**
     * Pessoas/empresas do evento e seus documentos (sem FK no banco, então sem join embutido).
     * @returns {{ pessoasPorId: Object, empresasPorId: Object, pesDocs: Array, empDocs: Array }}
     */
    async _documentosDoEvento(eventoId, filtrarDocs = (q) => q) {
        const [pesRes, empRes] = await Promise.all([
            supabase.from('pessoas').select('id, nome_completo, cpf, email, telefone, funcao, empresas(nome, cnpj)').eq('evento_id', eventoId),
            supabase.from('empresas').select('id, nome, cnpj').eq('evento_id', eventoId)
        ]);
        if (pesRes.error) throw pesRes.error;
        if (empRes.error) throw empRes.error;

        const pessoasPorId = Object.fromEntries((pesRes.data || []).map(p => [p.id, p]));
        const empresasPorId = Object.fromEntries((empRes.data || []).map(e => [e.id, e]));

        const buscar = async (tabela, coluna, ids) => {
            const linhas = [];
            for (let i = 0; i < ids.length; i += 200) {
                const { data, error } = await filtrarDocs(supabase.from(tabela).select('*').in(coluna, ids.slice(i, i + 200)));
                if (error) throw error;
                linhas.push(...(data || []));
            }
            return linhas;
        };

        const [pesDocs, empDocs] = await Promise.all([
            buscar('pessoa_documentos', 'pessoa_id', Object.keys(pessoasPorId)),
            buscar('empresa_documentos', 'empresa_id', Object.keys(empresasPorId))
        ]);
        return { pessoasPorId, empresasPorId, pesDocs, empDocs };
    }

    /** Recalcula todas as pessoas do evento (após mudar as regras). */
    async recalcularEvento(eventoId) {
        const { data: pessoas } = await supabase.from('pessoas').select('id').eq('evento_id', eventoId);
        for (const p of pessoas || []) await this.sincronizarStatusPessoa(null, p.id);
        logger.info(`🔄 [Documentos] Situação documental recalculada para ${pessoas?.length || 0} pessoas do evento ${eventoId}`);
    }

    async listDocumentos(supabaseClient, entityType, entityId) {
        const tableName = entityType === 'empresa' ? 'empresa_documentos' : 'pessoa_documentos';
        const idCol = entityType === 'empresa' ? 'empresa_id' : 'pessoa_id';

        let query = supabaseClient.from(tableName).select('*').order('data_inclusao', { ascending: false });
        if (entityId) query = query.eq(idCol, entityId);

        const { data, error } = await query;
        if (error) throw error;
        return data;
    }

    /**
     * Fila de análise do evento (pendentes e em análise), com busca por nome, CPF/CNPJ,
     * e-mail, telefone, função, empresa, título ou tipo do documento.
     */
    async listPendentes(_supabaseClient, { evento_id, page = 1, limit = 20, search = '' }) {
        const { pessoasPorId, empresasPorId, pesDocs, empDocs } =
            await this._documentosDoEvento(evento_id, q => q.in('status', STATUS_EM_FILA));

        const linhas = [
            ...pesDocs.map(d => ({ ...d, pessoas: pessoasPorId[d.pessoa_id] })).map(d => ({
                ...d,
                tipo_entidade: 'pessoa',
                entity_type: 'pessoa',
                entity_id: d.pessoa_id,
                entidade_nome: d.pessoas?.nome_completo,
                entidade_doc: d.pessoas?.cpf,
                empresa_vinculada: d.pessoas?.empresas?.nome,
                created_at: d.data_inclusao,
                _busca: [d.titulo, d.tipo_doc, d.pessoas?.nome_completo, d.pessoas?.cpf, d.pessoas?.email,
                    d.pessoas?.telefone, d.pessoas?.funcao, d.pessoas?.empresas?.nome, d.pessoas?.empresas?.cnpj]
            })),
            ...empDocs.map(d => ({ ...d, empresas: empresasPorId[d.empresa_id] })).map(d => ({
                ...d,
                tipo_entidade: 'empresa',
                entity_type: 'empresa',
                entity_id: d.empresa_id,
                entidade_nome: d.empresas?.nome,
                entidade_doc: d.empresas?.cnpj,
                created_at: d.data_inclusao,
                _busca: [d.titulo, d.tipo_doc, d.empresas?.nome, d.empresas?.cnpj]
            }))
        ];

        const filtradas = this.filtrarPorBusca(linhas, search)
            .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

        const from = (page - 1) * limit;
        return {
            data: filtradas.slice(from, from + limit).map(({ _busca, pessoas, empresas, ...resto }) => resto),
            total: filtradas.length,
            page: parseInt(page),
            limit: parseInt(limit)
        };
    }

    /** Filtro de texto que também compara só os dígitos (CPF/CNPJ/telefone formatados). */
    filtrarPorBusca(linhas, search) {
        const termo = String(search || '').trim().toLowerCase();
        if (!termo) return linhas;
        const digitos = termo.replace(/\D/g, '');
        return linhas.filter(l => l._busca.some(v => {
            if (!v) return false;
            const s = String(v).toLowerCase();
            return s.includes(termo) || (digitos.length >= 3 && s.replace(/\D/g, '').includes(digitos));
        }));
    }

    /**
     * Colaboradores do evento com documentos entregues, pendências e validade.
     * Busca por nome, CPF, e-mail, telefone, função, nome/CNPJ da empresa.
     */
    async listarColaboradores(eventoId, { search = '', page = 1, limit = 30, somentePendentes = false }) {
        const [config, pessoasRes] = await Promise.all([
            requisitos.getConfig(eventoId),
            supabase.from('pessoas')
                .select('id, nome_completo, cpf, email, telefone, funcao, foto_url, evento_id, empresa_id, status_acesso, status_documentos, liberacao_manual_ate, liberacao_manual_por, liberacao_manual_motivo, empresas(nome, cnpj)')
                .eq('evento_id', eventoId)
                .order('nome_completo')
        ]);
        if (pessoasRes.error) throw pessoasRes.error;

        const linhas = (pessoasRes.data || []).map(p => ({
            ...p,
            _busca: [p.nome_completo, p.cpf, p.email, p.telefone, p.funcao, p.empresas?.nome, p.empresas?.cnpj]
        }));
        let filtradas = this.filtrarPorBusca(linhas, search);

        // Documentos só das pessoas filtradas
        const ids = filtradas.map(p => p.id);
        const docsPorPessoa = {};
        for (let i = 0; i < ids.length; i += 200) {
            const { data } = await supabase.from('pessoa_documentos').select('*').in('pessoa_id', ids.slice(i, i + 200))
                .order('data_inclusao', { ascending: false });
            for (const d of data || []) (docsPorPessoa[d.pessoa_id] = docsPorPessoa[d.pessoa_id] || []).push(d);
        }

        const tiposPorId = Object.fromEntries(config.tipos.map(t => [t.id, t]));
        const agora = Date.now();
        let resultado = filtradas.map(({ _busca, ...p }) => {
            const docs = docsPorPessoa[p.id] || [];
            const avaliacao = requisitos.avaliar(config, p, docs);
            return {
                ...p,
                empresa_nome: p.empresas?.nome || null,
                empresa_cnpj: p.empresas?.cnpj || null,
                liberacao_ativa: !!(p.liberacao_manual_ate && new Date(p.liberacao_manual_ate).getTime() > agora),
                documentos: docs.map(d => ({ ...d, tipo_nome: tiposPorId[d.tipo_documento_id]?.nome || null })),
                exigidos: avaliacao.exigidos.map(t => ({ id: t.id, nome: t.nome, exige_validade: t.exige_validade })),
                pendencias: avaliacao.pendencias,
                vencendo: avaliacao.vencendo.map(d => d.id),
                situacao_documental: avaliacao.status_documentos
            };
        });

        if (somentePendentes) resultado = resultado.filter(p => p.situacao_documental !== 'aprovado');

        const from = (page - 1) * limit;
        return { data: resultado.slice(from, from + limit), total: resultado.length, page: Number(page), limit: Number(limit) };
    }

    /**
     * Documentos vencidos e a vencer nos próximos `dias` (padrão: configuração do evento).
     */
    async listarVencimentos(eventoId, dias = null) {
        const config = await requisitos.getConfig(eventoId);
        const janela = Number(dias) || config.aviso_vencimento_dias;
        const hoje = getHojeLocal();
        const limite = new Date(Date.now() + janela * 86400000).toISOString().slice(0, 10);

        const { pessoasPorId, pesDocs } = await this._documentosDoEvento(eventoId, q => q
            .in('status', ['aprovado', 'vencido'])
            .not('data_validade', 'is', null)
            .lte('data_validade', limite));
        const data = pesDocs
            .map(d => ({ ...d, pessoas: pessoasPorId[d.pessoa_id] }))
            .sort((a, b) => a.data_validade.localeCompare(b.data_validade));

        const tiposPorId = Object.fromEntries(config.tipos.map(t => [t.id, t]));
        return {
            janela_dias: janela,
            data: data.map(({ pessoas, ...d }) => {
                const diasRestantes = Math.round((new Date(d.data_validade) - new Date(hoje)) / 86400000);
                return {
                    ...d,
                    tipo_nome: tiposPorId[d.tipo_documento_id]?.nome || d.titulo,
                    pessoa_nome: pessoas?.nome_completo,
                    pessoa_cpf: pessoas?.cpf,
                    pessoa_funcao: pessoas?.funcao,
                    empresa_nome: pessoas?.empresas?.nome || null,
                    dias_restantes: diasRestantes,
                    situacao: diasRestantes < 0 || d.status === 'vencido' ? 'vencido' : 'a_vencer'
                };
            })
        };
    }

    /**
     * URL assinada (10 min) para visualizar o arquivo, funcione o bucket público ou privado.
     */
    async gerarUrlAssinada(entityType, docId) {
        const tableName = entityType === 'empresa' ? 'empresa_documentos' : 'pessoa_documentos';
        const { data: doc, error } = await supabase.from(tableName).select('url_arquivo').eq('id', docId).maybeSingle();
        if (error || !doc) throw Object.assign(new Error('Documento não encontrado'), { status: 404 });

        const match = String(doc.url_arquivo || '').match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/([^?]+)/);
        if (!match) return { url: doc.url_arquivo, assinada: false };

        const [, bucket, path] = match;
        const { data: signed, error: signErr } = await supabase.storage.from(bucket).createSignedUrl(decodeURIComponent(path), 600);
        if (signErr || !signed?.signedUrl) {
            logger.warn(`[Documentos] Falha ao assinar URL (${bucket}/${path}): ${signErr?.message}`);
            return { url: doc.url_arquivo, assinada: false };
        }
        return { url: signed.signedUrl, assinada: true, expira_em_segundos: 600 };
    }

    /** Configuração documental do evento + funções em uso. */
    async obterConfiguracao(eventoId) {
        const [config, funcoesRes] = await Promise.all([
            requisitos.getConfig(eventoId),
            supabase.from('pessoas').select('funcao').eq('evento_id', eventoId)
        ]);
        const funcoes = [...new Set((funcoesRes.data || []).map(p => normalizarFuncao(p.funcao)).filter(Boolean))].sort();
        for (const f of Object.keys(config.regras)) if (f !== FUNCAO_PADRAO && !funcoes.includes(f)) funcoes.push(f);
        return { ...config, funcoes, funcao_padrao: FUNCAO_PADRAO };
    }

    /**
     * Salva catálogo de tipos, regras por função e antecedência do aviso.
     * @param {{ tipos: Array, regras: Object<string, string[]>, aviso_vencimento_dias: number }} body
     */
    async salvarConfiguracao(eventoId, { tipos = [], regras = {}, aviso_vencimento_dias }) {
        // 1. Tipos: atualiza os existentes e cria os novos
        const idsPorNome = {};
        for (const [i, t] of tipos.entries()) {
            const nome = String(t.nome || '').trim();
            if (!nome) continue;
            const row = { evento_id: eventoId, nome, exige_validade: !!t.exige_validade, ativo: t.ativo !== false, ordem: t.ordem ?? i };
            const q = t.id
                ? supabase.from('evento_tipos_documento').update(row).eq('id', t.id).eq('evento_id', eventoId).select('id').single()
                : supabase.from('evento_tipos_documento').upsert(row, { onConflict: 'evento_id,nome' }).select('id').single();
            const { data, error } = await q;
            if (error) throw error;
            idsPorNome[nome] = data.id;
            if (t.tempId) idsPorNome[t.tempId] = data.id;
        }

        // 2. Regras: substitui todas as do evento
        const linhas = [];
        for (const [funcao, lista] of Object.entries(regras || {})) {
            const f = funcao === FUNCAO_PADRAO ? FUNCAO_PADRAO : normalizarFuncao(funcao);
            if (!f) continue;
            for (const ref of lista || []) {
                const tipoId = idsPorNome[ref] || ref;
                if (tipoId) linhas.push({ evento_id: eventoId, funcao: f, tipo_documento_id: tipoId });
            }
        }
        const del = await supabase.from('evento_documentos_funcao').delete().eq('evento_id', eventoId);
        if (del.error) throw del.error;
        if (linhas.length > 0) {
            const ins = await supabase.from('evento_documentos_funcao').upsert(linhas, { onConflict: 'evento_id,funcao,tipo_documento_id' });
            if (ins.error) throw ins.error;
        }

        // 3. Antecedência do aviso (eventos.config JSONB)
        if (aviso_vencimento_dias !== undefined) {
            const { data: ev } = await supabase.from('eventos').select('config').eq('id', eventoId).single();
            const novoConfig = { ...(ev?.config || {}), aviso_vencimento_dias: Math.max(1, parseInt(aviso_vencimento_dias, 10) || 15) };
            const up = await supabase.from('eventos').update({ config: novoConfig }).eq('id', eventoId);
            if (up.error) throw up.error;
            require('../../middleware/eventMiddleware').invalidarEvento(eventoId);
        }

        requisitos.invalidarConfig(eventoId);
        // Recalcula a situação de todos (em segundo plano)
        this.recalcularEvento(eventoId).catch(e => logger.error(`[Documentos] Falha ao recalcular evento: ${e.message}`));
        return this.obterConfiguracao(eventoId);
    }

    /**
     * Listagem legada (sem paginação) usada pela fila de auditoria em produção.
     * Une empresa_documentos e pessoa_documentos com os vínculos de nome.
     */
    async listPendentesLegado(supabaseClient) {
        const { data: empDocs, error: err1 } = await supabaseClient
            .from('empresa_documentos')
            .select('*, empresas(nome, cnpj)')
            .eq('status', 'pendente');

        if (err1) throw err1;

        const { data: pesDocs, error: err2 } = await supabaseClient
            .from('pessoa_documentos')
            .select('*, pessoas(nome_completo, cpf, empresas(nome))')
            .eq('status', 'pendente');

        if (err2) throw err2;

        const formatadosEmp = (empDocs || []).map(d => ({
            id: d.id,
            tipo_entidade: 'empresa',
            entidade_nome: d.empresas?.nome,
            entidade_doc: d.empresas?.cnpj,
            titulo: d.titulo,
            tipo_doc: d.tipo_doc,
            url_arquivo: d.url_arquivo,
            status: d.status,
            data_inclusao: d.data_inclusao,
            empresa_id: d.empresa_id
        }));

        const formatadosPes = (pesDocs || []).map(d => ({
            id: d.id,
            tipo_entidade: 'pessoa',
            entidade_nome: d.pessoas?.nome_completo,
            entidade_doc: d.pessoas?.cpf,
            empresa_vinculada: d.pessoas?.empresas?.nome,
            titulo: d.titulo,
            tipo_doc: d.tipo_doc,
            url_arquivo: d.url_arquivo,
            status: d.status,
            data_inclusao: d.data_inclusao,
            pessoa_id: d.pessoa_id
        }));

        return [...formatadosEmp, ...formatadosPes]
            .sort((a, b) => new Date(a.data_inclusao) - new Date(b.data_inclusao));
    }

    /**
     * Estatísticas de auditoria documental para métricas do analista
     * Quando eventoId é informado, restringe aos documentos das pessoas/empresas do evento.
     */
    async obterEstatisticas(supabaseClient, eventoId) {
        const vazio = { total: 0, pendentes: 0, aprovados: 0, reprovados: 0, reenvio_solicitado: 0, vencidos: 0 };

        try {
            let pessoaQuery = supabaseClient.from('pessoa_documentos').select('status, pessoa_id');
            let empresaQuery = supabaseClient.from('empresa_documentos').select('status, empresa_id');

            if (eventoId) {
                const [pesRes, empRes] = await Promise.all([
                    supabaseClient.from('pessoas').select('id').eq('evento_id', eventoId),
                    supabaseClient.from('empresas').select('id').eq('evento_id', eventoId)
                ]);

                if (pesRes.error) throw pesRes.error;
                if (empRes.error) throw empRes.error;

                const pessoaIds = (pesRes.data || []).map(p => p.id);
                const empresaIds = (empRes.data || []).map(e => e.id);

                if (pessoaIds.length === 0 && empresaIds.length === 0) return vazio;

                pessoaQuery = pessoaIds.length > 0 ? pessoaQuery.in('pessoa_id', pessoaIds) : null;
                empresaQuery = empresaIds.length > 0 ? empresaQuery.in('empresa_id', empresaIds) : null;
            }

            const [pRes, eRes] = await Promise.all([
                pessoaQuery ? pessoaQuery : Promise.resolve({ data: [] }),
                empresaQuery ? empresaQuery : Promise.resolve({ data: [] })
            ]);

            if (pRes.error) throw pRes.error;
            if (eRes.error) throw eRes.error;

            const todosDocs = [...(pRes.data || []), ...(eRes.data || [])];

            return {
                total: todosDocs.length,
                pendentes: todosDocs.filter(d => d.status === 'pendente' || d.status === 'em_analise').length,
                aprovados: todosDocs.filter(d => d.status === 'aprovado').length,
                reprovados: todosDocs.filter(d => d.status === 'rejeitado' || d.status === 'reprovado').length,
                reenvio_solicitado: todosDocs.filter(d => d.status === 'reenvio_solicitado').length,
                vencidos: todosDocs.filter(d => d.status === 'vencido').length
            };
        } catch (err) {
            logger.warn(`⚠️ [DocumentoService] Falha ao calcular estatísticas${eventoId ? ` do evento ${eventoId}` : ''}: ${err.message}`);
            return vazio;
        }
    }
}

module.exports = new DocumentoService();
module.exports.STATUS_AUDITORIA = STATUS_AUDITORIA;
