/**
 * Colunas de `pessoas` usadas na validação e no registro de acesso.
 * É o `*` sem face_encoding (~10 KB por pessoa, nunca usado no acesso)
 * e sem o token do link de cadastro — que vinham em toda leitura de leitor/QR/pulseira.
 * Coluna nova em `pessoas` que a validação precise ler deve entrar aqui.
 */
const COLUNAS_PESSOA_ACESSO = [
    'id', 'nome_completo', 'cpf', 'email', 'funcao', 'tipo_pessoa', 'empresa_id', 'evento_id',
    'nome_mae', 'data_nascimento', 'telefone', 'documento', 'dias_trabalho', 'foto_url', 'qr_code',
    'numero_pulseira', 'tipo_fluxo', 'status_acesso', 'origem_cadastro', 'fase_montagem', 'fase_showday',
    'fase_desmontagem', 'bloqueado', 'motivo_bloqueio', 'observacao', 'ativo', 'created_by', 'created_at',
    'updated_at', 'nome_credencial', 'passaporte', 'trabalho_area_tecnica', 'trabalho_altura',
    'pagamento_validado', 'aceite_lgpd', 'atualizado_em', 'parecer_documentos', 'status', 'origem',
    'documento_foto', 'codigo_ingresso', 'origem_pagamento', 'fases_acesso', 'dias_acesso',
    'documentos_trabalho', 'areas_autorizadas', 'tipo_pulseira_id', 'status_documentos',
    'liberacao_manual_ate', 'liberacao_manual_por', 'liberacao_manual_motivo'
].join(',');

module.exports = { COLUNAS_PESSOA_ACESSO };
