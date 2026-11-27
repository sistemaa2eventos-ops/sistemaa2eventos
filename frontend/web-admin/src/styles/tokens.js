/**
 * Design tokens do NZT Intelligent Control System.
 * Fonte única de cores, tipografia, raios e sombras — use estes valores em vez de
 * escrever cores/tamanhos à mão nas telas.
 *
 * DIREÇÕES DE PRÉVIA: a direção visual pode ser trocada para comparar propostas.
 *   ?direcao=atual | a | b | c   (fica guardada no navegador até trocar de novo)
 *   atual — visual em produção (padrão)
 *   a     — Sala de controle editorial (escuro, grafite e ciano)
 *   b     — Swiss industrial (claro, grade rígida e azul-cobalto)
 *   c     — Papel e tinta (claro, quente, serifa nos títulos)
 */

const CORES_ATUAL = {
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
    textoFraco: '#7A8BA3', // antes #64748B, que reprovava contraste AA sobre o fundo
    textoSobrePrimaria: '#000000',

    // Marcas de terceiros
    whatsapp: '#25D366'
};

const FONTES_ATUAL = {
    texto: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    titulo: '"Space Grotesk", "Inter", sans-serif',
    mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
};

const DIRECOES = {
    atual: {
        nome: 'Atual (produção)',
        modo: 'dark',
        pesoTitulo: 700,
        cores: CORES_ATUAL,
        fontes: FONTES_ATUAL
    },
    a: {
        nome: 'A · Sala de controle editorial',
        modo: 'dark',
        pesoTitulo: 600,
        cores: {
            ...CORES_ATUAL,
            primaria: '#7CE7FF', primariaHover: '#A4F0FF', primariaEscura: '#3CC7E8',
            secundaria: '#6B4FA0', secundariaClara: '#A99BD6',
            sucesso: '#3DDC97', alerta: '#F5B942', erro: '#FF5470', saida: '#FF9A3D',
            fundo: '#0B0D12', superficie: '#11141B', superficieElevada: '#171B24',
            borda: 'rgba(233, 236, 241, 0.09)', bordaDestaque: 'rgba(124, 231, 255, 0.35)',
            texto: '#E9ECF1', textoForte: '#FFFFFF', textoSuave: '#C9CED8',
            textoSecundario: '#8A93A3', textoFraco: '#5C6575', textoSobrePrimaria: '#05161C'
        },
        fontes: {
            texto: '"Inter", system-ui, -apple-system, "Segoe UI", sans-serif',
            titulo: '"Space Grotesk", "Inter", sans-serif',
            mono: '"JetBrains Mono", ui-monospace, Consolas, monospace'
        }
    },
    b: {
        nome: 'B · Swiss industrial',
        modo: 'light',
        pesoTitulo: 800,
        cores: {
            ...CORES_ATUAL,
            primaria: '#1D4ED8', primariaHover: '#2563EB', primariaEscura: '#1E3A8A',
            secundaria: '#3F3F46', secundariaClara: '#52525B',
            sucesso: '#15803D', alerta: '#B45309', erro: '#B91C1C', saida: '#C2410C',
            fundo: '#ECECE7', superficie: '#FFFFFF', superficieElevada: '#F5F5F2',
            borda: 'rgba(17, 17, 20, 0.14)', bordaDestaque: 'rgba(29, 78, 216, 0.45)',
            texto: '#111114', textoForte: '#000000', textoSuave: '#2A2A30',
            textoSecundario: '#5B5F69', textoFraco: '#8A8F9A', textoSobrePrimaria: '#FFFFFF'
        },
        fontes: {
            texto: '"Inter", system-ui, -apple-system, "Segoe UI", sans-serif',
            titulo: '"Archivo", "Inter", sans-serif',
            mono: '"JetBrains Mono", ui-monospace, Consolas, monospace'
        }
    },
    c: {
        nome: 'C · Papel e tinta',
        modo: 'light',
        pesoTitulo: 500,
        cores: {
            ...CORES_ATUAL,
            primaria: '#1F4D3A', primariaHover: '#2A6249', primariaEscura: '#163A2B',
            secundaria: '#7A5C3E', secundariaClara: '#9C7A55',
            sucesso: '#2F7D4F', alerta: '#A86A12', erro: '#A8322A', saida: '#B4531F',
            fundo: '#F4EFE6', superficie: '#FBF8F2', superficieElevada: '#EFE9DD',
            borda: 'rgba(30, 27, 22, 0.14)', bordaDestaque: 'rgba(31, 77, 58, 0.4)',
            texto: '#1E1B16', textoForte: '#000000', textoSuave: '#3A352C',
            textoSecundario: '#6B6356', textoFraco: '#948B7B', textoSobrePrimaria: '#FBF8F2'
        },
        fontes: {
            texto: '"Inter", system-ui, -apple-system, "Segoe UI", sans-serif',
            titulo: '"Newsreader", Georgia, "Times New Roman", serif',
            mono: '"JetBrains Mono", ui-monospace, Consolas, monospace'
        }
    }
};

function lerDirecao() {
    if (typeof window === 'undefined') return 'atual';
    try {
        const pela_url = new URLSearchParams(window.location.search).get('direcao');
        if (pela_url && DIRECOES[pela_url]) {
            window.localStorage.setItem('nzt_direcao', pela_url);
            return pela_url;
        }
        const guardada = window.localStorage.getItem('nzt_direcao');
        if (guardada && DIRECOES[guardada]) return guardada;
    } catch {
        // navegador sem acesso ao armazenamento: segue com o visual atual
    }
    return 'atual';
}

const ativa = lerDirecao();
const direcaoEscolhida = DIRECOES[ativa];

/** Direção de visual em uso. `editorial` = true quando a prévia de layout está ligada. */
export const direcao = {
    id: ativa,
    nome: direcaoEscolhida.nome,
    modo: direcaoEscolhida.modo,
    pesoTitulo: direcaoEscolhida.pesoTitulo,
    editorial: ativa !== 'atual',
    todas: Object.entries(DIRECOES).map(([id, d]) => ({ id, nome: d.nome }))
};

export const cores = { ...direcaoEscolhida.cores };

export const fontes = { ...direcaoEscolhida.fontes };

/** Gradientes dos círculos de indicador (protótipo). Os outros temas usam os mesmos. */
export const gradientes = {
    azul: 'linear-gradient(135deg, #3B82F6, #22D3EE)',
    verde: 'linear-gradient(135deg, #10B981, #34D399)',
    laranja: 'linear-gradient(135deg, #F97316, #FBBF24)',
    vermelho: 'linear-gradient(135deg, #E11D48, #F472B6)',
    violeta: 'linear-gradient(135deg, #7C3AED, #A78BFA)'
};

// Variáveis CSS para o que não passa pelo tema MUI (fundo e texto do corpo da página)
if (typeof document !== 'undefined') {
    const raiz = document.documentElement;
    raiz.dataset.direcao = ativa;
    raiz.style.setProperty('--nzt-fundo', cores.fundo);
    raiz.style.setProperty('--nzt-texto', cores.texto);
}

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
