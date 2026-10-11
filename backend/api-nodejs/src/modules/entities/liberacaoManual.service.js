const { supabase } = require('../../config/supabase');
const logger = require('../../services/logger');
const websocketService = require('../../services/websocketService');
const cacheService = require('../../services/cacheService');
const { proximaOcorrenciaHorario } = require('../../utils/dateUtils');

/**
 * Liberação manual por turno: o operador libera quem está com documentação pendente.
 * Vale até o checkout da pessoa ou até o horário de reset do evento (o que vier primeiro).
 */
class LiberacaoManualService {
    /** A liberação está valendo agora? */
    ativa(pessoa, agora = new Date()) {
        return !!(pessoa?.liberacao_manual_ate && new Date(pessoa.liberacao_manual_ate) > agora);
    }

    /**
     * Libera a pessoa até o próximo horário de reset do evento.
     * @returns {Promise<{ liberacao_manual_ate: string, ja_liberada: boolean }>}
     */
    async liberar({ pessoaId, eventoId, operadorId, motivo }) {
        const [{ data: pessoa, error: pErr }, { data: evento }] = await Promise.all([
            supabase.from('pessoas').select('id, nome_completo, evento_id, liberacao_manual_ate').eq('id', pessoaId).eq('evento_id', eventoId).single(),
            supabase.from('eventos').select('horario_reset').eq('id', eventoId).single()
        ]);
        if (pErr || !pessoa) throw Object.assign(new Error('Pessoa não encontrada neste evento'), { status: 404 });

        if (this.ativa(pessoa)) return { liberacao_manual_ate: pessoa.liberacao_manual_ate, ja_liberada: true };

        const ate = proximaOcorrenciaHorario(evento?.horario_reset || '00:00:00').toISOString();
        const { error } = await supabase.from('pessoas').update({
            liberacao_manual_ate: ate,
            liberacao_manual_por: operadorId || null,
            liberacao_manual_motivo: (motivo || 'Liberação manual do operador').substring(0, 500)
        }).eq('id', pessoaId);
        if (error) throw error;

        cacheService.invalidatePessoa(pessoaId);
        logger.info(`🟢 [Liberação manual] ${pessoa.nome_completo} liberado(a) até ${ate} por ${operadorId || 'sistema'} — ${motivo || '-'}`);
        websocketService.emit('pessoa_atualizada', { pessoa_id: pessoaId, liberacao_manual_ate: ate }, eventoId);
        return { liberacao_manual_ate: ate, ja_liberada: false };
    }

    /** Encerra a liberação (checkout, revogação manual ou expiração). */
    async encerrar(pessoaId, motivo = 'checkout') {
        const { data, error } = await supabase.from('pessoas')
            .update({ liberacao_manual_ate: null, liberacao_manual_por: null, liberacao_manual_motivo: null })
            .eq('id', pessoaId)
            .not('liberacao_manual_ate', 'is', null)
            .select('id, evento_id, nome_completo');
        if (error) {
            logger.warn(`[Liberação manual] Falha ao encerrar (${pessoaId}): ${error.message}`);
            return false;
        }
        if (data?.length) {
            cacheService.invalidatePessoa(pessoaId);
            logger.info(`🔴 [Liberação manual] Encerrada para ${data[0].nome_completo} (${motivo})`);
            websocketService.emit('pessoa_atualizada', { pessoa_id: pessoaId, liberacao_manual_ate: null }, data[0].evento_id);
        }
        return !!data?.length;
    }

    /** Limpa as liberações cujo horário limite já passou (chamado pelo agendador). */
    async expirarVencidas() {
        const { data, error } = await supabase.from('pessoas')
            .update({ liberacao_manual_ate: null, liberacao_manual_por: null, liberacao_manual_motivo: null })
            .lt('liberacao_manual_ate', new Date().toISOString())
            .select('id, evento_id');
        if (error) {
            logger.debug(`[Liberação manual] Expiração não executada: ${error.message}`);
            return 0;
        }
        for (const p of data || []) {
            cacheService.invalidatePessoa(p.id);
            websocketService.emit('pessoa_atualizada', { pessoa_id: p.id, liberacao_manual_ate: null }, p.evento_id);
        }
        if (data?.length) logger.info(`⏰ [Liberação manual] ${data.length} liberação(ões) expirada(s) no horário limite do evento`);
        return data?.length || 0;
    }
}

module.exports = new LiberacaoManualService();
