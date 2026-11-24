const { supabase } = require('../../config/supabase');
const { getHojeLocal } = require('../../utils/dateUtils');
const requisitos = require('../entities/documentoRequisitos.service');

const COLUNAS_PESSOA = 'id, nome_completo, evento_id, funcao, origem_cadastro, status_acesso, liberacao_manual_ate, liberacao_manual_motivo';

class AuditoriaService {
    static async buscarPessoa(eventoId, pessoaId) {
        const { data, error } = await supabase.from('pessoas').select(COLUNAS_PESSOA)
            .eq('id', pessoaId).eq('evento_id', eventoId).maybeSingle();
        if (error) throw error;
        return data;
    }

    static async liberacaoDeHoje(eventoId, pessoaId) {
        const { data, error } = await supabase.from('documento_liberacoes')
            .select('motivo, liberado_em, liberado_por')
            .eq('pessoa_id', pessoaId).eq('evento_id', eventoId).eq('data_liberacao', getHojeLocal())
            .maybeSingle();
        if (error) throw error;
        return data;
    }

    /**
     * Situação documental para uma ENTRADA. Só exige liberação quando o evento tem documentos exigidos
     * para a função da pessoa (sem regras, quem não enviou nada também sai "pendente" e não pode travar o evento).
     * Liberação vale se for do dia (documento_liberacoes) ou do turno (liberacao_manual_ate vigente).
     */
    static async situacaoParaEntrada(eventoId, pessoa) {
        const avaliacao = await requisitos.avaliarPessoa({ ...pessoa, evento_id: eventoId });
        const base = {
            status: avaliacao.status_documentos,
            pendencias: (avaliacao.pendencias || []).map(p => p.nome).filter(Boolean),
        };
        if (!avaliacao.regras_ativas || avaliacao.status_documentos === 'aprovado') {
            return { ...base, exige_liberacao: false, liberado_hoje: false, motivo_liberacao: null, bloqueado: false };
        }

        const doDia = await this.liberacaoDeHoje(eventoId, pessoa.id);
        const noTurno = !!(pessoa.liberacao_manual_ate && new Date(pessoa.liberacao_manual_ate) > new Date());
        const liberado = !!doDia || noTurno;
        return {
            ...base,
            exige_liberacao: true,
            liberado_hoje: liberado,
            motivo_liberacao: doDia?.motivo || (noTurno ? pessoa.liberacao_manual_motivo : null) || null,
            bloqueado: !liberado,
        };
    }

    /** Libera a entrada só no dia de hoje (fuso do evento); no dia seguinte a pessoa volta a ser barrada. */
    static async liberarPorUmDia(eventoId, pessoaId, motivo, usuarioId) {
        const hoje = getHojeLocal();
        const { data, error } = await supabase.from('documento_liberacoes')
            .upsert({
                pessoa_id: pessoaId,
                evento_id: eventoId,
                data_liberacao: hoje,
                motivo,
                liberado_por: usuarioId || null,
                liberado_em: new Date().toISOString(),
            }, { onConflict: 'pessoa_id,evento_id,data_liberacao' })
            .select('data_liberacao, motivo')
            .single();
        if (error) throw error;
        return { liberado_ate: data.data_liberacao, motivo: data.motivo };
    }
}

module.exports = AuditoriaService;
