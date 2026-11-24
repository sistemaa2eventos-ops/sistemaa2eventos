const { supabase } = require('../../config/supabase');

class AuditoriaService {
  /**
   * Verifica se pessoa está liberada HOJE para entrar
   */
  static async estaLiberadoHoje(eventoId, pessoaId) {
    if (!eventoId || !pessoaId) return false;

    try {
      const hoje = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

      const { data, error } = await supabase
        .from('documento_liberacoes')
        .select('id')
        .eq('pessoa_id', pessoaId)
        .eq('evento_id', eventoId)
        .eq('data_liberacao', hoje)
        .single();

      if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows
      return !!data;
    } catch (error) {
      console.error('Erro ao verificar liberação diária:', error.message);
      return false;
    }
  }

  /**
   * Busca status documental com informação de liberação diária
   * @returns { status, liberado_hoje, motivo_liberacao, pode_entrar }
   */
  static async statusDocumentalComLiberacao(eventoId, pessoaId) {
    if (!eventoId || !pessoaId) {
      return {
        status: 'desconhecido',
        liberado_hoje: false,
        motivo_liberacao: null,
        pode_entrar: false,
      };
    }

    try {
      const { data: pessoa, error } = await supabase
        .from('pessoas')
        .select('status_documentos')
        .eq('id', pessoaId)
        .eq('evento_id', eventoId)
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      const status = pessoa?.status_documentos || 'desconhecido';
      const liberado_hoje = await this.estaLiberadoHoje(eventoId, pessoaId);

      // Buscar motivo da liberação de hoje
      let motivo_liberacao = null;
      if (liberado_hoje) {
        const hoje = new Date().toISOString().split('T')[0];
        const { data: lib } = await supabase
          .from('documento_liberacoes')
          .select('motivo')
          .eq('pessoa_id', pessoaId)
          .eq('evento_id', eventoId)
          .eq('data_liberacao', hoje)
          .single();

        motivo_liberacao = lib?.motivo || null;
      }

      return {
        status,
        liberado_hoje,
        motivo_liberacao,
        pode_entrar: liberado_hoje || status === 'aprovado',
      };
    } catch (error) {
      console.error('Erro ao buscar status documental:', error.message);
      return {
        status: 'erro',
        liberado_hoje: false,
        motivo_liberacao: null,
        pode_entrar: false,
      };
    }
  }

  /**
   * Libera pessoa APENAS para hoje
   */
  static async liberarPorUmDia(eventoId, pessoaId, motivo, usuarioId) {
    if (!eventoId || !pessoaId) {
      throw new Error('evento_id e pessoa_id são obrigatórios');
    }

    try {
      const hoje = new Date().toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('documento_liberacoes')
        .upsert(
          {
            pessoa_id: pessoaId,
            evento_id: eventoId,
            data_liberacao: hoje,
            motivo: motivo || null,
            liberado_por: usuarioId || null,
          },
          { onConflict: 'pessoa_id,evento_id,data_liberacao' }
        )
        .select('data_liberacao, motivo')
        .single();

      if (error) throw error;

      // Auditoria
      await supabase
        .from('logs_auditoria')
        .insert({
          evento_id: eventoId,
          usuario_id: usuarioId,
          acao: 'DOCUMENTO_LIBERAR_UM_DIA',
          tabela: 'documento_liberacoes',
          registro_id: pessoaId,
          detalhes: { motivo, data_liberacao: hoje },
        });

      return {
        success: true,
        liberado_ate: data.data_liberacao,
        motivo: data.motivo,
      };
    } catch (error) {
      console.error('Erro ao liberar pessoa por um dia:', error.message);
      throw error;
    }
  }

  /**
   * Reverte liberações do dia anterior (cron job)
   */
  static async reverterLiberacoesDiaAnterior() {
    try {
      const hoje = new Date().toISOString().split('T')[0];

      const { data: deletadas, error } = await supabase
        .from('documento_liberacoes')
        .delete()
        .lt('data_liberacao', hoje)
        .select('pessoa_id, evento_id, data_liberacao');

      if (error) throw error;

      if (deletadas && deletadas.length > 0) {
        console.log(`[CRON] Revertidas ${deletadas.length} liberações do dia anterior`);
      }

      return deletadas || [];
    } catch (error) {
      console.error('[CRON] Erro ao reverter liberações:', error.message);
      throw error;
    }
  }
}

module.exports = AuditoriaService;
