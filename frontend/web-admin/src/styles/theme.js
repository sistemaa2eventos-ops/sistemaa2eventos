import { createTheme } from '@mui/material/styles';
import { ptBR } from '@mui/material/locale';
import { cores, fontes, raios, sombras, tamanhos } from './tokens';

/**
 * Tema do NZT Intelligent Control System.
 * Valores vêm de ./tokens.js — as telas devem usar o tema/tokens, não cores e tamanhos à mão.
 */
const theme = createTheme({
    palette: {
        mode: 'dark',
        primary: { main: cores.primaria, light: cores.primariaHover, dark: cores.primariaEscura, contrastText: cores.textoSobrePrimaria },
        secondary: { main: cores.secundaria, light: cores.secundariaClara, dark: '#5B1F8E', contrastText: '#FFFFFF' },
        success: { main: cores.sucesso, contrastText: '#000000' },
        warning: { main: cores.alerta, contrastText: '#000000' },
        error: { main: cores.erro, contrastText: '#FFFFFF' },
        info: { main: cores.primaria, contrastText: '#000000' },
        background: { default: cores.fundo, paper: cores.superficie },
        text: { primary: cores.texto, secondary: cores.textoSecundario, disabled: cores.textoFraco },
        divider: cores.borda,
    },
    typography: {
        fontFamily: fontes.texto,
        h1: { fontFamily: fontes.titulo, fontSize: '2.25rem', fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.2 },
        h2: { fontFamily: fontes.titulo, fontSize: '2rem', fontWeight: 700, letterSpacing: '-0.015em', lineHeight: 1.25 },
        h3: { fontFamily: fontes.titulo, fontSize: '1.75rem', fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.3 },
        h4: { fontFamily: fontes.titulo, fontSize: '1.5rem', fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.3 },
        h5: { fontFamily: fontes.titulo, fontSize: tamanhos.xl, fontWeight: 700, lineHeight: 1.35 },
        h6: { fontFamily: fontes.titulo, fontSize: '1.0625rem', fontWeight: 700, lineHeight: 1.4 },
        subtitle1: { fontSize: tamanhos.lg, fontWeight: 600, lineHeight: 1.5 },
        subtitle2: { fontSize: tamanhos.md, fontWeight: 600, lineHeight: 1.5 },
        body1: { fontSize: tamanhos.md, lineHeight: 1.6 },
        body2: { fontSize: tamanhos.sm, lineHeight: 1.55 },
        button: { textTransform: 'none', fontWeight: 600, letterSpacing: '0.01em' },
        caption: { fontSize: tamanhos.xs, letterSpacing: '0.01em', lineHeight: 1.45 },
        overline: { fontSize: tamanhos.xs, fontWeight: 600, letterSpacing: '0.02em', textTransform: 'none', lineHeight: 1.6 },
    },
    shape: {
        borderRadius: 8,
    },
    components: {
        MuiCssBaseline: {
            styleOverrides: {
                body: {
                    background: cores.fundo,
                    minHeight: '100vh',
                },
                '::-webkit-scrollbar': { width: '8px', height: '8px' },
                '::-webkit-scrollbar-track': { background: 'transparent' },
                '::-webkit-scrollbar-thumb': { background: 'rgba(148, 163, 184, 0.25)', borderRadius: '8px' },
                '::-webkit-scrollbar-thumb:hover': { background: 'rgba(0, 212, 255, 0.45)' },
            },
        },
        MuiDrawer: {
            styleOverrides: {
                paper: {
                    background: cores.fundo,
                    borderRight: `1px solid ${cores.borda}`,
                },
            },
        },
        MuiPaper: {
            styleOverrides: {
                root: {
                    backgroundImage: 'none',
                    backgroundColor: cores.superficie,
                    border: `1px solid ${cores.borda}`,
                    borderRadius: raios.cartao,
                },
            },
        },
        MuiCard: {
            styleOverrides: {
                root: {
                    backgroundImage: 'none',
                    backgroundColor: cores.superficie,
                    border: `1px solid ${cores.borda}`,
                    borderRadius: raios.cartao,
                    boxShadow: sombras.cartao,
                },
            },
        },
        MuiButton: {
            defaultProps: { disableElevation: true },
            styleOverrides: {
                root: {
                    borderRadius: raios.controle,
                    padding: '8px 18px',
                    fontWeight: 600,
                    transition: 'background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease',
                },
                sizeSmall: { padding: '4px 12px', fontSize: tamanhos.sm },
                sizeLarge: { padding: '11px 24px', fontSize: tamanhos.lg },
                containedPrimary: {
                    background: cores.primaria,
                    color: cores.textoSobrePrimaria,
                    '&:hover': { background: cores.primariaHover },
                },
                containedSecondary: {
                    background: cores.secundaria,
                    '&:hover': { background: cores.secundariaClara },
                },
                outlined: {
                    borderColor: cores.bordaDestaque,
                    '&:hover': { borderColor: cores.primaria, background: 'rgba(0, 212, 255, 0.06)' },
                },
            },
        },
        MuiIconButton: {
            styleOverrides: { root: { borderRadius: raios.controle } },
        },
        MuiOutlinedInput: {
            styleOverrides: {
                root: {
                    background: 'rgba(0, 0, 0, 0.22)',
                    borderRadius: raios.controle,
                    '& fieldset': { borderColor: cores.borda },
                    '&:hover fieldset': { borderColor: 'rgba(0, 212, 255, 0.4)' },
                    '&.Mui-focused fieldset': { borderColor: cores.primaria, boxShadow: sombras.focoPrimaria },
                },
            },
        },
        MuiInputLabel: {
            styleOverrides: {
                root: { fontSize: tamanhos.md, color: cores.textoSecundario, '&.Mui-focused': { color: cores.primaria } },
            },
        },
        MuiTableCell: {
            styleOverrides: {
                head: {
                    backgroundColor: cores.superficie,
                    color: cores.textoSecundario,
                    fontWeight: 600,
                    fontSize: tamanhos.sm,
                    whiteSpace: 'nowrap',
                    borderBottom: `1px solid ${cores.borda}`,
                },
                body: {
                    color: cores.texto,
                    fontSize: tamanhos.sm,
                    // Algarismos de largura fixa: números, horários e CPFs alinham nas colunas
                    fontVariantNumeric: 'tabular-nums',
                    borderBottom: '1px solid rgba(148, 163, 184, 0.08)',
                },
            },
        },
        MuiTablePagination: {
            styleOverrides: {
                root: { color: cores.textoSecundario },
                selectLabel: { fontSize: tamanhos.sm },
                displayedRows: { fontSize: tamanhos.sm },
            },
        },
        MuiChip: {
            styleOverrides: {
                root: { borderRadius: '6px', fontWeight: 600, fontSize: tamanhos.xs },
            },
        },
        MuiDialog: {
            styleOverrides: {
                paper: ({ theme: t }) => ({
                    backgroundColor: cores.superficie,
                    border: `1px solid ${cores.borda}`,
                    borderRadius: raios.cartao,
                    boxShadow: sombras.modal,
                    [t.breakpoints.down('sm')]: {
                        margin: 12,
                        width: 'calc(100% - 24px)',
                        maxHeight: 'calc(100dvh - 24px)',
                    },
                }),
                paperFullScreen: {
                    margin: '0 !important',
                    width: '100% !important',
                    maxHeight: '100dvh !important',
                    borderRadius: 0,
                },
            },
        },
        MuiDialogTitle: {
            styleOverrides: {
                root: ({ theme: t }) => ({
                    fontFamily: fontes.titulo,
                    fontSize: tamanhos.xl,
                    fontWeight: 700,
                    padding: '20px 24px 12px',
                    [t.breakpoints.down('sm')]: {
                        fontSize: tamanhos.lg,
                        padding: '14px 16px 10px',
                    },
                }),
            },
        },
        MuiDialogContent: {
            styleOverrides: {
                root: ({ theme: t }) => ({
                    padding: '12px 24px',
                    [t.breakpoints.down('sm')]: {
                        padding: '10px 16px',
                    },
                }),
            },
        },
        MuiDialogActions: {
            styleOverrides: {
                root: ({ theme: t }) => ({
                    padding: '12px 24px 20px',
                    gap: 8,
                    flexWrap: 'wrap',
                    [t.breakpoints.down('sm')]: {
                        padding: '10px 16px 14px',
                    },
                }),
            },
        },
        MuiTooltip: {
            styleOverrides: {
                tooltip: {
                    backgroundColor: cores.superficieElevada,
                    border: `1px solid ${cores.borda}`,
                    fontSize: tamanhos.xs,
                    fontWeight: 500,
                },
            },
        },
        // Interruptores sempre na cor de ação (antes havia roxo e ciano sem significado)
        MuiSwitch: {
            defaultProps: { color: 'primary' },
        },
        MuiTab: {
            styleOverrides: {
                root: ({ theme: t }) => ({
                    textTransform: 'none',
                    fontWeight: 600,
                    fontSize: tamanhos.md,
                    minHeight: 44,
                    [t.breakpoints.down('sm')]: {
                        fontSize: tamanhos.sm,
                        minHeight: 40,
                        padding: '6px 12px',
                    },
                }),
            },
        },
        MuiTabs: {
            styleOverrides: { indicator: { backgroundColor: cores.primaria, height: 2 } },
        },
        MuiAlert: {
            styleOverrides: { root: { borderRadius: raios.controle } },
        },
        MuiListItemButton: {
            styleOverrides: {
                root: {
                    borderRadius: raios.controle,
                    marginBottom: 2,
                    transition: 'background-color 0.15s ease',
                    '&:hover': { background: 'rgba(0, 212, 255, 0.06)' },
                    '&.Mui-selected': {
                        background: 'rgba(0, 212, 255, 0.12)',
                        boxShadow: `inset 3px 0 0 ${cores.primaria}`,
                        '&:hover': { background: 'rgba(0, 212, 255, 0.16)' },
                    },
                },
            },
        },
    },
}, ptBR); // textos padrão do MUI em português (paginação "1–10 de 50", etc.)

export default theme;
