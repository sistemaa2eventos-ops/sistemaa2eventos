/**
 * Catálogo de documentos comuns em eventos (NRs e certificados). Ao adicionar, o nome vira um
 * tipo de documento do evento; a validade é só sugestão (o evento pode mudar).
 */
export const CATALOGO_DOCUMENTOS = [
    { nome: 'NR-1', descricao: 'GRO/PGR: gerenciamento de riscos da empresa', exige_validade: false },
    { nome: 'NR-6', descricao: 'EPI: ficha e treinamento de equipamento de proteção', exige_validade: false },
    { nome: 'NR-7', descricao: 'PCMSO: ASO (atestado de saúde ocupacional) periódico', exige_validade: true },
    { nome: 'NR-10', descricao: 'Eletricidade: curso básico ou SEP (instalações e serviços)', exige_validade: true },
    { nome: 'NR-11', descricao: 'Movimentação de cargas: empilhadeira, ponte rolante, munck', exige_validade: true },
    { nome: 'NR-12', descricao: 'Máquinas e equipamentos (geradores, elevadores de carga, rebocadores)', exige_validade: false },
    { nome: 'NR-17', descricao: 'Ergonomia: levantamento e transporte manual de carga', exige_validade: false },
    { nome: 'NR-18', descricao: 'Construção: montagem de palcos, estruturas e coberturas', exige_validade: false },
    { nome: 'NR-20', descricao: 'Inflamáveis e combustíveis (gás, geradores, pirotecnia)', exige_validade: false },
    { nome: 'NR-23', descricao: 'Proteção contra incêndio: brigada e extintores', exige_validade: true },
    { nome: 'NR-33', descricao: 'Espaço confinado (tanques, poços, dutos)', exige_validade: true },
    { nome: 'NR-35', descricao: 'Trabalho em altura (montagem de treliças, palcos e torres)', exige_validade: true },
    { nome: 'Primeiros socorros', descricao: 'Certificado de primeiros socorros', exige_validade: true },
    { nome: 'Seguro de acidentes pessoais', descricao: 'Apólice individual do participante', exige_validade: true }
];
