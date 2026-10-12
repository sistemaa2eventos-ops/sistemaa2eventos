const { supabase } = require('../../config/supabase');
const logger = require('../../services/logger');
const websocketService = require('../../services/websocketService');

/**
 * Notificações persistentes do painel (sino) + verificação diária de vencimento de documentos.
 */
class NotificacaoService {
    /**
     * Cria notificações ignorando as já existentes (chave_dedupe).
     * @returns {Promise<Array>} somente as notificações realmente novas
     */
    async criar(notificacoes) {
        if (!notificacoes.length) return [];
        const { data, error } = await supabase.from('notificacoes')
            .upsert(notificacoes, { onConflict: 'chave_dedupe', ignoreDuplicates: true })
            .select();
        if (error) {
            logger.warn(`[Notificações] Falha ao gravar: ${error.message}`);
            return [];
        }
        return data || [];
    }

    /** Tipos que só o Admin Master vê (ex.: operador pedindo nova senha) */
    get TIPOS_SO_ADMIN() { return ['SENHA_SOLICITADA']; }

    _semTiposAdmin(q, admin) {
        return admin ? q : q.not('tipo', 'in', `(${this.TIPOS_SO_ADMIN.join(',')})`);
    }

    async listar(eventoId, { naoLidas = false, limit = 50, admin = false } = {}) {
        let q = this._semTiposAdmin(supabase.from('notificacoes').select('*', { count: 'exact' })
            .eq('evento_id', eventoId), admin)
            .order('created_at', { ascending: false })
            .limit(limit);
        if (naoLidas) q = q.is('lida_em', null);
        const [{ data, error }, naoLidasRes] = await Promise.all([
            q,
            this._semTiposAdmin(supabase.from('notificacoes').select('id', { count: 'exact', head: true }).eq('evento_id', eventoId), admin).is('lida_em', null)
        ]);
        if (error) throw error;
        return { data: data || [], nao_lidas: naoLidasRes.count || 0 };
    }

    async marcarLida(eventoId, id = null, { admin = false } = {}) {
        let q = this._semTiposAdmin(supabase.from('notificacoes').update({ lida_em: new Date().toISOString() })
            .eq('evento_id', eventoId), admin).is('lida_em', null);
        if (id) q = q.eq('id', id);
        const { error } = await q;
        if (error) throw error;
    }

    /**
     * Verificação de vencimentos de todos os eventos ativos:
     * - marca como 'vencido' os documentos aprovados com validade passada;
     * - reavalia as pessoas afetadas (voltam a pendente se o documento era obrigatório);
     * - cria notificações de vencido / a vencer (sem repetir) e alerta o painel.
     */
    async verificarVencimentos() {
        const documentoService = require('../entities/documento.service');

        const { error: rpcErr } = await supabase.rpc('revogar_documentos_vencidos');
        if (rpcErr && rpcErr.code !== 'PGRST202') logger.warn(`[Vencimentos] revogar_documentos_vencidos: ${rpcErr.message}`);

        const { data: eventos } = await supabase.from('eventos').select('id, nome').eq('status', 'ativo');
        let total = 0;

        for (const ev of eventos || []) {
            try {
                const { data: docs, janela_dias } = await documentoService.listarVencimentos(ev.id);
                if (!docs.length) continue;

                const novas = await this.criar(docs.map(d => {
                    const vencido = d.situacao === 'vencido';
                    const quando = vencido
                        ? `venceu em ${d.data_validade.split('-').reverse().join('/')}`
                        : `vence em ${d.dias_restantes} dia(s) (${d.data_validade.split('-').reverse().join('/')})`;
                    return {
                        evento_id: ev.id,
                        tipo: vencido ? 'DOC_VENCIDO' : 'DOC_A_VENCER',
                        severidade: vencido ? 'critical' : 'warning',
                        titulo: `${d.tipo_nome || 'Documento'} de ${d.pessoa_nome} ${vencido ? 'VENCIDO' : 'a vencer'}`,
                        mensagem: `${d.tipo_nome || d.titulo} — ${quando}${d.empresa_nome ? ` · ${d.empresa_nome}` : ''}`,
                        referencia_tipo: 'pessoa_documento',
                        referencia_id: d.id,
                        chave_dedupe: `${vencido ? 'DOC_VENCIDO' : 'DOC_A_VENCER'}:${d.id}:${d.data_validade}`
                    };
                }));

                // Quem teve documento vencido pode voltar a pendente
                const pessoasVencidas = [...new Set(docs.filter(d => d.situacao === 'vencido').map(d => d.pessoa_id))];
                for (const pid of pessoasVencidas) await documentoService.sincronizarStatusPessoa(null, pid);

                if (novas.length) {
                    total += novas.length;
                    const vencidos = novas.filter(n => n.tipo === 'DOC_VENCIDO').length;
                    const alerta = {
                        type: 'DOC_VENCIMENTO',
                        severity: vencidos ? 'critical' : 'warning',
                        message: `📄 ${ev.nome}: ${vencidos} documento(s) vencido(s) e ${novas.length - vencidos} a vencer em até ${janela_dias} dias.`,
                        evento_id: ev.id,
                        total: novas.length
                    };
                    websocketService.emit('system:alert', alerta, 'system_admin');
                    websocketService.emit('notificacao_nova', alerta, ev.id);
                }
            } catch (err) {
                logger.warn(`[Vencimentos] Evento ${ev.id}: ${err.message}`);
            }
        }

        logger.info(`📄 [Vencimentos] Verificação concluída: ${total} notificação(ões) nova(s).`);
        return total;
    }
}

module.exports = new NotificacaoService();
