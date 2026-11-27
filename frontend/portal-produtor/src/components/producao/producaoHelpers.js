import { funcao, cores } from '../../styles/tokens';

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

export const CATEGORIAS_MATERIAL = [
    { valor: 'box_truss', rotulo: 'Box truss e treliças' },
    { valor: 'praticavel', rotulo: 'Praticáveis' },
    { valor: 'grades', rotulo: 'Grades e barricadas' },
    { valor: 'som', rotulo: 'Áudio e sonorização' },
    { valor: 'iluminacao', rotulo: 'Iluminação e LED' },
    { valor: 'gerador', rotulo: 'Geradores e energia' },
    { valor: 'tenda', rotulo: 'Tendas e coberturas' },
    { valor: 'mobiliario', rotulo: 'Mobiliário e bares' },
    { valor: 'sinalizacao', rotulo: 'Sinalização e comunicação' },
    { valor: 'outros', rotulo: 'Outros materiais' }
];

export const CORES_MATERIAL = [
    { rotulo: 'Alumínio / Prata', hex: cores.textoSuave },
    { rotulo: 'Preto / Grafite', hex: cores.superficieElevada },
    { rotulo: 'Branco', hex: cores.textoForte },
    { rotulo: 'Cinza / Galvanizado', hex: cores.textoSecundario },
    { rotulo: 'Amarelo', hex: '#FACC15' },
    { rotulo: 'Laranja', hex: '#FB923C' },
    { rotulo: 'Azul', hex: cores.primaria },
    { rotulo: 'Vermelho', hex: '#F87171' },
    { rotulo: 'Verde', hex: '#4ADE80' }
];

export const FORMATOS_MATERIAL = [
    { valor: 'barra_retangular', rotulo: 'Barra / Perfil retangular longo' },
    { valor: 'estrutura_vazada', rotulo: 'Estrutura metálica vazada (treliça/gradil)' },
    { valor: 'painel_plano', rotulo: 'Painel / Tampo plano (praticável/LED)' },
    { valor: 'caixa_cubica', rotulo: 'Caixa / Case / Módulo cúbico' },
    { valor: 'cilindrico', rotulo: 'Cilíndrico / Tubo / Cabo em rolo' },
    { valor: 'irregular', rotulo: 'Formato irregular / Peça especial' }
];

export const ANGULOS_FOTO_MATERIAL = [
    { valor: 'frontal', rotulo: 'Vista frontal' },
    { valor: 'lateral', rotulo: 'Vista lateral' },
    { valor: 'superior', rotulo: 'Vista superior' },
    { valor: 'empilhado', rotulo: 'Pilha / Agrupado' },
    { valor: 'detalhe', rotulo: 'Detalhe (logo/conexão)' },
    { valor: 'embalagem', rotulo: 'Case / Embalagem' }
];

export const ACOES_MONITORAMENTO_MATERIAL = [
    {
        valor: 'contar_entrada',
        rotulo: 'Contar entrada / descarga',
        descricao: 'Soma unidades que cruzam a linha de entrada ou entram na zona e atualiza o recebimento.',
        cor: funcao.liberado
    },
    {
        valor: 'contar_saida',
        rotulo: 'Contar saída / carregamento',
        descricao: 'Soma unidades que saem da área monitorada durante expedição ou desmontagem.',
        cor: funcao.saida
    },
    {
        valor: 'monitorar_presenca',
        rotulo: 'Monitorar presença contínua',
        descricao: 'Mantém a contagem em tempo real de quantos itens permanecem dentro da área demarcada.',
        cor: funcao.acao
    },
    {
        valor: 'alertar_divergencia',
        rotulo: 'Contar e alertar divergência',
        descricao: 'Conta as unidades e dispara alerta visual imediato se houver sobra ou falta frente ao previsto.',
        cor: funcao.alerta
    },
    {
        valor: 'alertar_saida_indevida',
        rotulo: 'Alertar movimentação / saída indevida',
        descricao: 'Captura evidência e gera alerta prioritário sempre que este objeto deixar a área ou cruzar o corte.',
        cor: funcao.negado
    }
];

export const obterInfoAcaoMaterial = (acao) =>
    ACOES_MONITORAMENTO_MATERIAL.find((a) => a.valor === acao) || ACOES_MONITORAMENTO_MATERIAL[0];

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
