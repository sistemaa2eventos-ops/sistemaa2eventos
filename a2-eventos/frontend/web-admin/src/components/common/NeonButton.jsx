import React from 'react';
import { Button, CircularProgress } from '@mui/material';
import { styled } from '@mui/material/styles';

const prefersReducedMotion = () => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

const StyledButton = styled(Button, {
    shouldForwardProp: (prop) => prop !== 'neonColor'
})(({ theme, neonColor }) => {
    const color = neonColor || theme.palette.primary.main;
    const reduced = prefersReducedMotion();
    const transition = reduced ? 'none' : 'all 0.3s ease';

    return {
        position: 'relative',
        background: 'transparent',
        color: color,
        border: `1px solid ${color}`,
        padding: '12px 24px',
        minHeight: 44,
        borderRadius: '10px',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '1px',
        overflow: 'hidden',
        transition: transition,
        boxShadow: `0 0 10px ${color}33`,

        '&:hover': {
            background: color,
            color: '#000',
            boxShadow: `0 0 20px ${color}88`,
            border: `1px solid ${color}`,
        },

        '&:focus-visible': {
            outline: `2px solid ${color}`,
            outlineOffset: 2,
        },

        '&:active': {
            transform: reduced ? 'none' : 'scale(0.96)',
        },

        '&:disabled': {
            opacity: 0.5,
            cursor: 'not-allowed',
            '&:hover': {
                background: 'transparent',
                color: color,
                boxShadow: `0 0 10px ${color}33`,
            },
        },
    };
});

const NeonButton = ({ children, neonColor, loading, disabled, startIcon, ...props }) => {
    return (
        <StyledButton
            neonColor={neonColor}
            disabled={loading || disabled}
            startIcon={loading ? null : startIcon}
            {...props}
        >
            {loading ? <CircularProgress size={20} color="inherit" /> : children}
        </StyledButton>
    );
};

export default NeonButton;
