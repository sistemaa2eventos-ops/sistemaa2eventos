import React from 'react';
import { Button, CircularProgress } from '@mui/material';
import { styled } from '@mui/material/styles';

const StyledButton = styled(Button, {
    shouldForwardProp: (prop) => prop !== 'neonColor'
})(({ theme, neonColor }) => {
    const color = neonColor || theme.palette.primary.main;

    return {
        position: 'relative',
        background: 'transparent',
        color: color,
        border: `1px solid ${color}`,
        padding: '8px 24px',
        borderRadius: '8px',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '1px',
        overflow: 'hidden',
        transition: 'all 0.3s ease',
        boxShadow: `0 0 10px ${color}33`,

        '&:hover': {
            background: color,
            color: '#000',
            boxShadow: `0 0 20px ${color}88`,
            border: `1px solid ${color}`,
        },

        '&:active': {
            transform: 'scale(0.96)',
        }
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
