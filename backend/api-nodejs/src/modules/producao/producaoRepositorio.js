'use strict';

const { supabase } = require('../../config/supabase');
const logger = require('../../services/logger');

const CACHE_VERIFICACAO_MS = 30000;
let ultimoCheck = { verificadoEm: 0, ativas: false };

const tabelaInexistente = (error) => !!error && (
    error.code === '42P01'
    || error.code === 'PGRST205'
    || /does not exist|Could not find the table|relation .* does not exist/i.test(error.message || '')
);

const uuidOuNull = (v) => (v && typeof v === 'string' && v.trim() !== '' && v !== 'undefined' && v !== 'null') ? v : null;

/**
 * Verifica se as tabelas relacionais da migration 20261119b_modulo_producao.sql já existem no Supabase.
 */
async function verificarTabelasRelacionais({ forcar = false } = {}) {
    const agora = Date.now();
    if (!forcar && ultimoCheck.verificadoEm && (agora - ultimoCheck.verificadoEm) < CACHE_VERIFICACAO_MS) {
        return ultimoCheck.ativas;
    }

    try {
        const res = await supabase.from('producao_areas').select('id').limit(1);
        if (res?.error) {
            const ativas = !tabelaInexistente(res.error) && !/mock/i.test(res.error.message || '');
            ultimoCheck = { verificadoEm: agora, ativas };
            return ativas;
        }
        ultimoCheck = { verificadoEm: agora, ativas: true };
        return true;
    } catch {
        ultimoCheck = { verificadoEm: agora, ativas: false };
        return false;
    }
}

async function upsertSeguro(tabela, linhas, onConflict = 'id') {
    if (!Array.isArray(linhas) || linhas.length === 0) return;
    const { error } = await supabase.from(tabela).upsert(linhas, { onConflict });
    if (error) {
        logger.debug(`[Produção/Sync] Falha em ${tabela}: ${error.message}`);
    }
}

/**
 * Espelha o estado operacional do evento nas tabelas relacionais `producao_*` do PostgreSQL/Supabase
 * quando a migration já foi aplicada no banco.
 */
async function sincronizarTabelasRelacionais(eventoId, estado) {
    if (!eventoId || !estado) return { sincronizado: false, motivo: 'parametros_invalidos' };
    const ativas = await verificarTabelasRelacionais();
    if (!ativas) return { sincronizado: false, motivo: 'migration_pendente' };

    try {
        // 1. Áreas
        const areas = (estado.areas || []).map((a) => ({
            id: a.id,
            evento_id: eventoId,
            nome: a.nome,
            cor: a.cor || '#00D4FF',
            descricao: a.descricao || null,
            responsavel_nome: a.responsavel_nome || null,
            ativo: a.ativo !== false
        }));
        await upsertSeguro('producao_areas', areas);

        // 2. Produtores
        const produtores = (estado.produtores || []).map((p) => ({
            id: p.id,
            evento_id: eventoId,
            pessoa_id: uuidOuNull(p.pessoa_id),
            user_id: uuidOuNull(p.user_id),
            nome: p.nome,
            email: p.email || null,
            telefone: p.telefone || null,
            documento: p.documento || null,
            foto_url: p.foto_url || null,
            area_id: uuidOuNull(p.area_id),
            papel_producao: p.papel_producao || 'produtor_area',
            tipo_cache: p.tipo_cache || 'diaria',
            valor_cache_centavos: Math.max(0, Number(p.valor_cache_centavos || 0)),
            dados_bancarios_cifrados: p.dados_bancarios_cifrados || null,
            historico_cache: Array.isArray(p.historico_cache) ? p.historico_cache : [],
            periodo_inicio: p.periodo_inicio || null,
            periodo_fim: p.periodo_fim || null,
            termo_lgpd_aceito: Boolean(p.termo_lgpd_aceito),
            termo_lgpd_data: p.termo_lgpd_data || null,
            status: p.status || 'ativo',
            ativo: p.ativo !== false
        }));
        await upsertSeguro('producao_produtores', produtores);

        // 3. Projetos
        const projetos = (estado.projetos || []).map((proj) => ({
            id: proj.id,
            evento_id: eventoId,
            area_id: uuidOuNull(proj.area_id),
            titulo: proj.titulo,
            categoria: proj.categoria || 'arquitetura',
            descricao: proj.descricao || null,
            status: proj.status || 'em_elaboracao'
        }));
        await upsertSeguro('producao_projetos', projetos);

        // 4. Plantas, versões, setores e propostas
        const plantas = (estado.plantas || []).map((pl) => ({
            id: pl.id,
            evento_id: eventoId,
            projeto_id: uuidOuNull(pl.projeto_id),
            titulo: pl.titulo,
            escala_pixels_por_metro: Number(pl.escala_pixels_por_metro || 20),
            largura_px: Number(pl.largura_px || 1200),
            altura_px: Number(pl.altura_px || 750)
        }));
        await upsertSeguro('producao_plantas', plantas);

        const versoes = [];
        const setores = [];
        for (const pl of estado.plantas || []) {
            for (const v of pl.versoes || []) {
                versoes.push({
                    id: v.id,
                    planta_id: pl.id,
                    numero_versao: Number(v.numero_versao || 1),
                    imagem_fundo_url: v.imagem_fundo_url || null,
                    elementos_json: Array.isArray(v.elementos_json) ? v.elementos_json : [],
                    eh_oficial: v.eh_oficial !== false,
                    notas_versao: v.notas_versao || null
                });
                for (const s of v.setores || []) {
                    setores.push({
                        id: s.id,
                        planta_versao_id: v.id,
                        area_id: uuidOuNull(s.area_id),
                        nome: s.nome,
                        cor_hex: s.cor_hex || '#00D4FF',
                        poligono_coordenadas: Array.isArray(s.poligono_coordenadas) ? s.poligono_coordenadas : [],
                        responsavel_nome: s.responsavel_nome || null,
                        capacidade_maxima: s.capacidade_maxima || null
                    });
                }
            }
        }
        await upsertSeguro('producao_planta_versoes', versoes);
        await upsertSeguro('producao_setores', setores);

        const propostas = (estado.propostas_planta || []).map((prop) => ({
            id: prop.id,
            planta_versao_base_id: prop.planta_versao_base_id,
            autor_produtor_id: uuidOuNull(prop.autor_produtor_id),
            tarefa_id: uuidOuNull(prop.tarefa_id),
            titulo: prop.titulo,
            justificativa: prop.justificativa || '',
            elementos_alterados_json: Array.isArray(prop.elementos_alterados_json) ? prop.elementos_alterados_json : [],
            status: prop.status || 'pendente',
            parecer_arquiteto: prop.parecer_arquiteto || null,
            analisado_em: prop.analisado_em || null
        })).filter((p) => uuidOuNull(p.planta_versao_base_id));
        await upsertSeguro('producao_planta_propostas', propostas);

        // 5. Tarefas, etapas, dependências e evidências
        const tarefas = (estado.tarefas || []).map((t) => ({
            id: t.id,
            evento_id: eventoId,
            area_id: t.area_id,
            setor_id: uuidOuNull(t.setor_id),
            titulo: t.titulo,
            objetivo: t.objetivo || null,
            sugestoes_levar: Array.isArray(t.sugestoes_levar) ? t.sugestoes_levar : [],
            prioridade: t.prioridade || 'media',
            status: t.status || 'disponivel',
            produtor_atribuido_id: uuidOuNull(t.produtor_atribuido_id),
            data_inicio_planejada: t.data_inicio_planejada || null,
            data_fim_planejada: t.data_fim_planejada || null,
            data_inicio_real: t.data_inicio_real || null,
            data_fim_real: t.data_fim_real || null,
            percentual_concluido: Number(t.percentual_concluido || 0),
            motivo_bloqueio: t.motivo_bloqueio || null,
            motivo_reabertura: t.motivo_reabertura || null,
            requer_aprovacao_conclusao: t.requer_aprovacao_conclusao !== false,
            aprovado_em: t.aprovado_em || null
        }));
        await upsertSeguro('producao_tarefas', tarefas);

        const etapas = [];
        const evidencias = [];
        for (const t of estado.tarefas || []) {
            for (const et of t.etapas || []) {
                etapas.push({
                    id: et.id,
                    tarefa_id: t.id,
                    ordem: Number(et.ordem || 1),
                    descricao: et.descricao,
                    obrigatoria: et.obrigatoria !== false,
                    concluida: Boolean(et.concluida),
                    concluida_em: et.concluida_em || null,
                    geolocalizacao: et.geolocalizacao || null
                });
                for (const ev of et.evidencias || []) {
                    evidencias.push({
                        id: ev.id,
                        etapa_id: et.id,
                        autor_produtor_id: uuidOuNull(ev.autor_produtor_id),
                        tipo: ev.tipo || 'texto',
                        url_arquivo: ev.url_arquivo || null,
                        texto_comentario: ev.texto_comentario || null,
                        transcricao_audio: ev.transcricao_audio || null,
                        geolocalizacao: ev.geolocalizacao || null,
                        sync_id: uuidOuNull(ev.sync_id)
                    });
                }
            }
        }
        await upsertSeguro('producao_etapas', etapas);
        await upsertSeguro('producao_evidencias', evidencias);
        await upsertSeguro('producao_tarefas_dependencias', estado.dependencias_tarefas || []);

        // 6. Materiais, recebimentos e sessões de contagem IA
        const materiais = (estado.materiais || []).map((m) => ({
            id: m.id,
            evento_id: eventoId,
            codigo_catalogo: m.codigo_catalogo || null,
            nome: m.nome,
            categoria: m.categoria || 'geral',
            subtipo: m.subtipo || null,
            dimensoes: m.dimensoes || null,
            peso_kg: m.peso_kg || null,
            fornecedor_nome: m.fornecedor_nome || null,
            foto_referencia_url: m.foto_referencia_url || null,
            classe_deteccao_ia: m.classe_deteccao_ia || null,
            quantidade_planejada: Number(m.quantidade_planejada || 0),
            quantidade_recebida: Number(m.quantidade_recebida || 0),
            quantidade_avariada: Number(m.quantidade_avariada || 0),
            status_movimentacao: m.status_movimentacao || 'previsto',
            ativo: m.ativo !== false
        }));
        await upsertSeguro('producao_materiais', materiais);

        const recebimentos = (estado.recebimentos || []).map((r) => ({
            id: r.id,
            evento_id: eventoId,
            fornecedor_nome: r.fornecedor_nome || null,
            numero_nota_romaneio: r.numero_nota_romaneio || null,
            data_hora_chegada: r.data_hora_chegada || new Date().toISOString(),
            conferente_produtor_id: uuidOuNull(r.conferente_produtor_id),
            status: r.status || 'em_conferencia',
            observacoes: r.observacoes || null
        }));
        await upsertSeguro('producao_recebimentos', recebimentos);

        const sessoes = [];
        const itensContados = [];
        for (const s of estado.sessoes_contagem || []) {
            sessoes.push({
                id: s.id,
                recebimento_id: s.recebimento_id,
                origem_midia: s.origem_midia || 'video_gravado',
                modelo_ia_versao: s.modelo_ia_versao || 'rt-detr-apache2-v1',
                modo_contagem: s.modo_contagem || 'line_zone',
                status_processamento: s.status_processamento || 'concluido',
                iniciado_em: s.iniciado_em || new Date().toISOString(),
                finalizado_em: s.finalizado_em || null
            });
            for (const i of s.itens_contados || []) {
                itensContados.push({
                    id: i.id,
                    sessao_contagem_id: s.id,
                    material_id: uuidOuNull(i.material_id),
                    classe_identificada: i.classe_identificada,
                    reconhecido_catalogo: Boolean(i.reconhecido_catalogo),
                    quantidade_esperada: Number(i.quantidade_esperada || 0),
                    quantidade_ia: Number(i.quantidade_ia || 0),
                    quantidade_corrigida_humano: i.quantidade_corrigida_humano ?? null,
                    confianca_media: i.confianca_media ?? null,
                    quadro_chave_evidencia_url: i.quadro_chave_evidencia_url || null,
                    justificativa_correcao: i.justificativa_correcao || null
                });
            }
        }
        await upsertSeguro('producao_sessoes_contagem', sessoes);
        await upsertSeguro('producao_itens_contados', itensContados);

        const movs = (estado.movimentacoes_materiais || []).map((mv) => ({
            id: mv.id,
            material_id: mv.material_id,
            evento_id: eventoId,
            estagio_anterior: mv.estagio_anterior || null,
            estagio_novo: mv.estagio_novo,
            setor_destino: mv.setor_destino || null,
            quantidade: Number(mv.quantidade || 0),
            observacao: mv.observacao || null,
            criado_em: mv.criado_em || new Date().toISOString()
        })).filter((mv) => uuidOuNull(mv.material_id));
        await upsertSeguro('producao_movimentacoes_materiais', movs);

        // 7. Orçamentos, escalas, presença e auditoria
        const orcamentos = (estado.orcamentos || []).map((o) => ({
            id: o.id,
            evento_id: eventoId,
            area_id: uuidOuNull(o.area_id),
            fornecedor_nome: o.fornecedor_nome || null,
            titulo: o.titulo,
            valor_previsto_centavos: Number(o.valor_previsto_centavos || 0),
            valor_realizado_centavos: Number(o.valor_realizado_centavos || 0),
            status: o.status || 'rascunho'
        }));
        await upsertSeguro('producao_orcamentos', orcamentos);

        const escalas = (estado.escalas || []).map((e) => ({
            id: e.id,
            evento_id: eventoId,
            area_id: e.area_id,
            produtor_id: e.produtor_id,
            data_inicio_turno: e.data_inicio_turno,
            data_fim_turno: e.data_fim_turno,
            tipo_turno: e.tipo_turno || 'normal',
            status: e.status || 'agendado'
        })).filter((e) => uuidOuNull(e.area_id) && uuidOuNull(e.produtor_id));
        await upsertSeguro('producao_escalas', escalas);

        const presencas = (estado.registros_presenca || []).map((r) => ({
            id: r.id,
            evento_id: eventoId,
            produtor_id: r.produtor_id,
            tipo: r.tipo,
            data_hora: r.data_hora,
            metodo: r.metodo || 'qrcode',
            geolocalizacao: r.geolocalizacao || null,
            eh_dobra_detectada: Boolean(r.eh_dobra_detectada),
            motivo_ocorrencia: r.motivo_ocorrencia || null,
            sync_id: uuidOuNull(r.sync_id)
        }));
        await upsertSeguro('producao_registros_presenca', presencas);

        const auditoria = (estado.auditoria || []).slice(0, 50).map((a) => ({
            id: a.id,
            evento_id: eventoId,
            usuario_id: uuidOuNull(a.usuario_id),
            usuario_nome: a.usuario_nome || null,
            acao: a.acao,
            entidade: a.entidade,
            entidade_id: uuidOuNull(a.entidade_id),
            antes: a.antes || null,
            depois: a.depois || null,
            criado_em: a.criado_em || new Date().toISOString()
        }));
        await upsertSeguro('producao_auditoria', auditoria);

        return { sincronizado: true };
    } catch (err) {
        logger.warn(`[Produção/Sync] Erro ao sincronizar tabelas relacionais: ${err.message}`);
        return { sincronizado: false, erro: err.message };
    }
}

module.exports = {
    verificarTabelasRelacionais,
    sincronizarTabelasRelacionais,
    _resetarCacheVerificacao: () => { ultimoCheck = { verificadoEm: 0, ativas: false }; }
};
