import { cores } from './styles/tokens';

export const formatarCpf = (v) => {
    const d = String(v || '').replace(/\D/g, '');
    return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : (v || '—');
};

export const formatarCnpj = (v) => {
    const d = String(v || '').replace(/\D/g, '');
    return d.length === 14 ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}` : (v || '—');
};

/** "AAAA-MM-DD" → "DD/MM/AAAA" sem passar por fuso. */
export const dataBr = (iso) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
};

export const dataHora = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
export const hora = (iso) => (iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—');

export const chipSx = (cor) => ({ fontWeight: 700, color: cor, bgcolor: `${cor}1F`, border: `1px solid ${cor}66` });

/** Situação de um documento enviado. */
export const STATUS_DOCUMENTO = {
    pendente: { rotulo: 'Em análise', cor: cores.alerta },
    em_analise: { rotulo: 'Em análise', cor: cores.alerta },
    aprovado: { rotulo: 'Aprovado', cor: cores.sucesso },
    reprovado: { rotulo: 'Recusado', cor: cores.erro },
    rejeitado: { rotulo: 'Recusado', cor: cores.erro },
    reenvio_solicitado: { rotulo: 'Enviar de novo', cor: cores.alerta },
    vencido: { rotulo: 'Vencido', cor: cores.erro }
};

/** Situação de um documento obrigatório. */
export const SITUACAO_OBRIGATORIO = {
    ok: { rotulo: 'Aprovado', cor: cores.sucesso },
    em_analise: { rotulo: 'Em análise', cor: cores.alerta },
    reenvio_solicitado: { rotulo: 'Enviar de novo', cor: cores.alerta },
    vencido: { rotulo: 'Vencido', cor: cores.erro },
    reprovado: { rotulo: 'Recusado', cor: cores.erro },
    falta_anexar: { rotulo: 'Falta enviar', cor: cores.erro }
};

/** Situação do participante no evento agora. */
export const situacaoMovimento = (p) => {
    if (p.expulso) return { rotulo: 'Expulso', cor: cores.erro };
    if (p.bloqueado) return { rotulo: 'Bloqueado', cor: cores.erro };
    if (p.dentro) return { rotulo: 'Dentro do evento', cor: cores.sucesso };
    if (p.checkouts_hoje > 0) return { rotulo: 'Saiu', cor: cores.saida };
    return { rotulo: 'Não entrou hoje', cor: cores.textoSecundario };
};

/** Indicadores da equipe: cada um também é um filtro da lista. */
export const METRICAS = [
    { key: 'todos', rotulo: 'Cadastrados', cor: cores.textoForte, filtro: () => true },
    { key: 'pendentes', rotulo: 'Documento pendente', cor: cores.alerta, filtro: (p) => p.pendente },
    { key: 'checkin', rotulo: 'Check-in hoje', cor: cores.primaria, filtro: (p) => p.checkins_hoje > 0 },
    { key: 'dentro', rotulo: 'Dentro agora (sem check-out)', cor: cores.sucesso, filtro: (p) => p.dentro },
    { key: 'checkout', rotulo: 'Check-out hoje', cor: cores.saida, filtro: (p) => p.checkouts_hoje > 0 },
    { key: 'pulseira', rotulo: 'Com pulseira', cor: cores.textoForte, filtro: (p) => !!p.numero_pulseira },
    { key: 'bloqueados', rotulo: 'Bloqueados', cor: cores.erro, filtro: (p) => p.bloqueado },
    { key: 'expulsos', rotulo: 'Expulsos', cor: cores.erro, filtro: (p) => p.expulso }
];

export const TIPO_SOLICITACAO = {
    excluir_participante: 'Excluir participante',
    editar_participante: 'Alterar dados do participante',
    excluir_documento: 'Excluir documento',
    editar_empresa: 'Alterar dados da empresa',
    outro: 'Outro pedido'
};

export const STATUS_SOLICITACAO = {
    pendente: { rotulo: 'Aguardando a organização', cor: cores.alerta },
    aprovada: { rotulo: 'Aprovada', cor: cores.sucesso },
    recusada: { rotulo: 'Recusada', cor: cores.erro },
    cancelada: { rotulo: 'Cancelada', cor: cores.textoSecundario }
};

export const ROTULO_CAMPO = {
    nome: 'Nome da empresa', cnpj: 'CNPJ', email: 'E-mail do responsável (login)', responsavel: 'Responsável',
    responsavel_legal: 'Responsável legal', telefone: 'Telefone', servico: 'Serviço prestado',
    nome_completo: 'Nome completo', cpf: 'CPF', funcao: 'Função', data_nascimento: 'Data de nascimento',
    nome_mae: 'Nome da mãe', nome_credencial: 'Nome no crachá', passaporte: 'Passaporte (estrangeiros)'
};
