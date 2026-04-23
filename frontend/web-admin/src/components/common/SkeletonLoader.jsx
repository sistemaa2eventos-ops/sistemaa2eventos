import React from 'react';
import { Box, Skeleton } from '@mui/material';
import { styled } from '@mui/material/styles';

const prefersReducedMotion = () => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

const StyledSkeleton = styled(Skeleton, {
    shouldForwardProp: (prop) => prop !== 'glowColor'
})(({ glowColor }) => ({
    background: 'linear-gradient(135deg, rgba(10,22,40,0.6) 0%, rgba(15,30,55,0.6) 100%)',
    border: `1px solid ${glowColor || 'rgba(0, 212, 255, 0.1)'}`,
    borderRadius: 16,
}));

const shimmerAnimation = (disabled) => disabled 
    ? 'none' 
    : 'shimmer 1.5s infinite';

const SkeletonCard = ({ height = 200, glowColor, sx, ...props }) => {
    const reduced = prefersReducedMotion();
    
    return (
        <StyledSkeleton
            variant="rectangular"
            width="100%"
            height={height}
            glowColor={glowColor}
            animation={reduced ? false : 'wave'}
            sx={{
                ...sx,
                '@keyframes shimmer': {
                    '0%': { backgroundPosition: '-200% 0' },
                    '100%': { backgroundPosition: '200% 0' },
                },
            }}
            {...props}
        />
    );
};

const SkeletonTable = ({ rows = 5, columns = 4, sx }) => {
    const reduced = prefersReducedMotion();
    
    return (
        <Box sx={{ width: '100%', ...sx }}>
            {Array.from({ length: rows }).map((_, rowIndex) => (
                <Box
                    key={rowIndex}
                    sx={{
                        display: 'grid',
                        gridTemplateColumns: `repeat(${columns}, 1fr)`,
                        gap: 2,
                        p: 2,
                        borderBottom: '1px solid rgba(0, 212, 255, 0.05)',
                    }}
                >
                    {Array.from({ length: columns }).map((_, colIndex) => (
                        <Skeleton
                            key={colIndex}
                            variant="text"
                            width={Math.random() * 40 + 60}
                            animation={reduced ? false : 'wave'}
                            sx={{ 
                                height: 24,
                                borderRadius: 1,
                            }}
                        />
                    ))}
                </Box>
            ))}
        </Box>
    );
};

const SkeletonStats = ({ count = 4, sx }) => {
    const reduced = prefersReducedMotion();
    
    return (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 3, ...sx }}>
            {Array.from({ length: count }).map((_, index) => (
                <StyledSkeleton
                    key={index}
                    variant="rectangular"
                    height={140}
                    animation={reduced ? false : 'wave'}
                />
            ))}
        </Box>
    );
};

export { SkeletonCard, SkeletonTable, SkeletonStats };
export default SkeletonCard;