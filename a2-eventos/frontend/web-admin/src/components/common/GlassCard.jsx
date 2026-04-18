import React from 'react';
import { Card, CardContent, Box } from '@mui/material';
import { styled } from '@mui/material/styles';

const prefersReducedMotion = () => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

const getTransition = (reduced) => reduced 
    ? 'none' 
    : 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';

const StyledCard = styled(Card, {
    shouldForwardProp: (prop) => !['glowcolor', 'active', 'result'].includes(prop)
})(({ theme, glowcolor }) => {
    const reduced = prefersReducedMotion();
    return {
        background: 'linear-gradient(135deg, rgba(10,22,40,0.8) 0%, rgba(15,30,55,0.8) 100%)',
        backdropFilter: 'blur(20px)',
        border: `1px solid ${glowcolor || 'rgba(0, 212, 255, 0.15)'}`,
        borderRadius: 16,
        boxShadow: `0 8px 32px rgba(0,0,0,0.4), 0 0 15px ${glowcolor ? `${glowcolor}20` : 'rgba(0,212,255,0.05)'}`,
        transition: getTransition(reduced),
        overflow: 'hidden',
        position: 'relative',
        '&:hover': {
            border: `1px solid ${glowcolor || 'rgba(0, 212, 255, 0.3)'}`,
            boxShadow: `0 12px 40px rgba(0,0,0,0.6), 0 0 30px ${glowcolor ? `${glowcolor}40` : 'rgba(0,212,255,0.15)'}`,
            transform: reduced ? 'none' : 'translateY(-4px)',
        },
        '&:focus-visible': {
            outline: `2px solid ${glowcolor || '#00D4FF'}`,
            outlineOffset: 2,
        },
        '&::before': {
            content: '""',
            position: 'absolute',
            top: 0,
            left: '-100%',
            width: '100%',
            height: '100%',
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.05), transparent)',
            transition: reduced ? 'none' : '0.5s',
            opacity: reduced ? 0 : 1,
        },
        '&:hover::before': {
            left: '100%',
        },
        ...(reduced && {
            transform: 'none',
            '&::before': { display: 'none' },
        }),
    };
});

const GlassCard = ({ children, glowColor, sx, onClick, ...props }) => {
    return (
        <StyledCard
            glowcolor={glowColor} // Lowercase to avoid React warning
            sx={sx}
            onClick={onClick}
            {...props}
        >
            <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
                {children}
            </CardContent>
        </StyledCard>
    );
};

export default GlassCard;
