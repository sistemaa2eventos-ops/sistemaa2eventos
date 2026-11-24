/**
 * Design tokens do NZT Intelligent Control System.
 * Fonte única de cores, tipografia, raios e sombras — use estes valores em vez de
 * escrever cores/tamanhos à mão nas telas.
 */

export const cores = {
    // Identidade
    primaria: '#00D4FF',
    primariaHover: '#33DDFF',
    primariaEscura: '#0099BB',
    secundaria: '#7B2FBE',
    secundariaClara: '#A855F7',

    // Estados (a cor indica significado, não enfeite)
    sucesso: '#00FF88',
    alerta: '#FFB800',
    erro: '#FF3366',
    saida: '#FF8800', // check-out / saída

    // Superfícies (do fundo para cima)
    fundo: '#050B18',
    superficie: '#0A1628',
    superficieElevada: '#0F1E37',
    borda: 'rgba(148, 163, 184, 0.16)',
    bordaDestaque: 'rgba(0, 212, 255, 0.35)',

    // Texto
    texto: '#E8F4FD',
    textoForte: '#FFFFFF',
    textoSuave: '#CBD5E1',
    textoSecundario: '#94A3B8',
    textoFraco: '#64748B',
    textoSobrePrimaria: '#000000',

    // Marcas de terceiros
    whatsapp: '#25D366'
};

/**
 * Cor por FUNÇÃO — a cor diz o que a coisa é/faz, igual em todas as telas.
 * Ex.: tudo que é saída é laranja; vermelho é só para negado/erro/excluir/emergência.
 */
export const funcao = {
    acao: cores.primaria,               // ação principal, links, foco, seleção
    entrada: cores.primaria,            // check-in / credenciamento (operação de entrada)
    saida: cores.saida,                 // check-out / baixa
    liberado: cores.sucesso,            // acesso liberado, salvo, online, aprovado
    negado: cores.erro,                 // acesso negado, erro, excluir, emergência, offline
    alerta: cores.alerta,               // pendente, atenção, vencendo, aguardando
    fiscalizacao: cores.secundariaClara, // fiscalização / auditoria
    neutro: cores.textoSecundario       // informação sem estado
};

/** Cor por perfil de acesso (chips de usuário, cartão do operador). */
export const papeis = {
    admin_master: { rotulo: 'Admin master', cor: cores.alerta },
    master: { rotulo: 'Admin master', cor: cores.alerta },
    admin: { rotulo: 'Admin', cor: cores.primaria },
    supervisor: { rotulo: 'Supervisor', cor: cores.secundariaClara },
    operador: { rotulo: 'Operador', cor: cores.sucesso }
};

/** Fundo translúcido de uma cor de estado (chips, ícones, destaques) */
export const tom = (hex, alfa = 0.12) => {
    const n = parseInt(hex.replace('#', ''), 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alfa})`;
};

export const fontes = {
    texto: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    titulo: '"Space Grotesk", "Inter", sans-serif'
};

// Escala de tamanhos (px → rem). Nada abaixo de 12 px.
export const tamanhos = {
    xs: '0.75rem',   // 12 — rótulos, legendas, chips
    sm: '0.8125rem', // 13 — texto secundário, tabelas
    md: '0.875rem',  // 14 — texto padrão de interface
    lg: '1rem',      // 16 — texto de destaque
    xl: '1.25rem',   // 20 — títulos de seção
    xxl: '1.5rem',   // 24 — título de página (mobile)
    display: '2rem'  // 32 — números de indicador / título de página
};

export const pesos = { normal: 400, medio: 500, semi: 600, negrito: 700 };

export const raios = {
    controle: '8px', // botões, campos, chips
    cartao: '12px',  // cards, modais, painéis
    pilula: '999px'
};

export const sombras = {
    cartao: '0 8px 24px rgba(0, 0, 0, 0.35)',
    modal: '0 24px 64px rgba(0, 0, 0, 0.6)',
    focoPrimaria: '0 0 0 3px rgba(0, 212, 255, 0.18)'
};

/**
 * Botão secundário (ações de apoio ao lado da ação principal): contorno neutro, texto claro.
 * Uso: <Button variant="outlined" sx={botaoSecundario}>…</Button>
 */
export const botaoSecundario = {
    minHeight: 40,
    borderColor: 'rgba(148, 163, 184, 0.35)',
    color: cores.texto,
    whiteSpace: 'nowrap',
    '&:hover': { borderColor: cores.primaria, bgcolor: 'rgba(0, 212, 255, 0.06)' }
};

/** Botões de ícone nas linhas de tabela: neutros (cor só no hover); excluir em vermelho. */
export const acaoTabela = {
    color: cores.textoSecundario,
    '&:hover': { color: cores.primaria, bgcolor: 'rgba(0, 212, 255, 0.08)' }
};
export const acaoTabelaPerigo = {
    color: cores.erro,
    '&:hover': { bgcolor: 'rgba(255, 51, 102, 0.1)' }
};
