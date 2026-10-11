import { Button, CircularProgress } from '@mui/material';
import { styled } from '@mui/material/styles';
import { cores, raios } from '../../styles/tokens';

/** Aplica transparência a uma cor #RRGGBB; outras notações (rgba...) voltam como estão. */
const comAlfa = (cor, alfaHex) => (/^#[0-9a-f]{6}$/i.test(cor) ? `${cor}${alfaHex}` : cor);

/**
 * Botão de ação do painel.
 * - Sem `neonColor` (ou com a cor primária) e sem variant="outlined": AÇÃO PRINCIPAL — preenchido.
 * - Com `neonColor` de estado (ex.: vermelho para desconectar) ou variant="outlined": contornado.
 */
const StyledButton = styled(Button, {
    shouldForwardProp: (prop) => !['cor', 'contornado'].includes(prop)
})(({ cor, contornado }) => ({
    minHeight: 40,
    padding: '8px 18px',
    borderRadius: raios.controle,
    fontWeight: 600,
    textTransform: 'none',
    letterSpacing: '0.01em',
    boxShadow: 'none',
    transition: 'background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease, filter 0.15s ease',
    ...(contornado ? {
        background: 'transparent',
        color: cor,
        border: `1px solid ${comAlfa(cor, '66')}`,
        '&:hover': { background: comAlfa(cor, '14'), borderColor: cor },
    } : {
        background: cor,
        color: cores.textoSobrePrimaria,
        border: `1px solid ${cor}`,
        '&:hover': { background: cor, filter: 'brightness(1.12)' },
    }),
    '&:focus-visible': { outline: `2px solid ${cor}`, outlineOffset: 2 },
    '&.Mui-disabled': {
        opacity: 0.45,
        color: contornado ? cor : cores.textoSobrePrimaria,
    },
}));

const NeonButton = ({ children, neonColor, loading, disabled, startIcon, variant, ...props }) => {
    const cor = neonColor || cores.primaria;
    const ehPrimaria = cor.toUpperCase() === cores.primaria;
    const contornado = variant === 'outlined' || variant === 'text' || !ehPrimaria;
    return (
        <StyledButton
            cor={cor}
            contornado={contornado ? 1 : 0}
            disabled={loading || disabled}
            startIcon={loading ? null : startIcon}
            {...props}
        >
            {loading ? <CircularProgress size={18} color="inherit" /> : children}
        </StyledButton>
    );
};

export default NeonButton;
