import { funcao } from '../../styles/tokens';

export const PAPEIS_PRODUCAO = [
    { valor: 'admin_master', rotulo: 'Admin master', cor: funcao.alerta },
    { valor: 'produtor_geral', rotulo: 'Produtor geral', cor: funcao.acao },
    { valor: 'arquiteto_evento', rotulo: 'Arquiteto do evento', cor: funcao.fiscalizacao },
    { valor: 'financeiro', rotulo: 'Financeiro', cor: funcao.liberado },
    { valor: 'auditoria', rotulo: 'Auditoria', cor: funcao.fiscalizacao },
    { valor: 'produtor_area', rotulo: 'Produtor de área', cor: funcao.entrada },
    { valor: 'staff', rotulo: 'Equipe e staff', cor: funcao.neutro }
];

export const ROTULO_STATUS_TAREFA = {
    rascunho: { texto: 'Rascunho', cor: funcao.neutro },
    disponivel: { texto: 'Disponível', cor: funcao.acao },
    em_andamento: { texto: 'Em andamento', cor: funcao.alerta },
    bloqueada: { texto: 'Bloqueada', cor: funcao.negado },
    em_revisao: { texto: 'Em revisão', cor: funcao.fiscalizacao },
    concluida: { texto: 'Concluída', cor: funcao.liberado },
    reaberta: { texto: 'Reaberta', cor: funcao.saida }
};

export const ROTULO_SAUDE_PRAZO = {
    no_prazo: { texto: 'No prazo', cor: funcao.liberado },
    em_risco: { texto: 'Prazo em risco', cor: funcao.alerta },
    atrasada: { texto: 'Atrasada', cor: funcao.negado },
    concluida: { texto: 'Concluída', cor: funcao.liberado }
};

export const ROTULO_PRIORIDADE = {
    baixa: { texto: 'Baixa', cor: funcao.neutro },
    media: { texto: 'Média', cor: funcao.acao },
    alta: { texto: 'Alta', cor: funcao.alerta },
    critica: { texto: 'Crítica', cor: funcao.negado }
};

export const ROTULO_MOVIMENTACAO = [
    { valor: 'previsto', texto: 'Previsto' },
    { valor: 'recebido', texto: 'Recebido' },
    { valor: 'em_estoque', texto: 'Em estoque' },
    { valor: 'separado_setor', texto: 'Separado por setor' },
    { valor: 'montado', texto: 'Montado' },
    { valor: 'desmontado', texto: 'Desmontado' },
    { valor: 'devolvido', texto: 'Devolvido' }
];

export const FASES_OPERACIONAIS = [
    { valor: 'montagem', rotulo: 'Montagem', cor: funcao.alerta },
    { valor: 'evento', rotulo: 'Evento', cor: funcao.acao },
    { valor: 'desmontagem', rotulo: 'Desmontagem', cor: funcao.saida }
];

export const obterInfoFase = (fase) =>
    FASES_OPERACIONAIS.find((f) => f.valor === fase) || FASES_OPERACIONAIS[0];

export const formatarMoedaCentavos = (centavos) => {
    if (centavos === null || centavos === undefined) return 'Restrito';
    return (Number(centavos) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

export const formatarDataHoraCurta = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
};

export const obterNomeArea = (areas = [], areaId) =>
    areas.find((a) => a.id === areaId)?.nome || 'Geral';

export const obterCorArea = (areas = [], areaId) =>
    areas.find((a) => a.id === areaId)?.cor || funcao.acao;

export const obterNomeProdutor = (produtores = [], produtorId) =>
    produtores.find((p) => p.id === produtorId)?.nome || 'Sem atribuição';

export const obterRotuloPapel = (papel) =>
    PAPEIS_PRODUCAO.find((p) => p.valor === papel)?.rotulo || 'Produtor';
