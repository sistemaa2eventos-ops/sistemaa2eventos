import React from 'react';
import { Box, Typography, Breadcrumbs, Link } from '@mui/material';
import { styled } from '@mui/material/styles';
import { ChevronRight as ChevronRightIcon } from '@mui/icons-material';

const HeaderContainer = styled(Box)(({ theme }) => ({
    marginBottom: theme.spacing(4),
    padding: theme.spacing(1, 0),
    animation: 'slideInLeft 0.4s ease-out forwards',
}));

const Title = styled(Typography)(({ theme }) => ({
    fontFamily: '"Orbitron", sans-serif',
    fontWeight: 700,
    background: 'linear-gradient(90deg, #00D4FF 0%, #7B2FBE 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    marginBottom: theme.spacing(1),
    textTransform: 'uppercase',
    letterSpacing: '2px',
}));

const PageHeader = ({ title, subtitle, breadcrumbs = [] }) => {
    return (
        <HeaderContainer>
            {breadcrumbs.length > 0 && (
                <Breadcrumbs
                    separator={<ChevronRightIcon sx={{ fontSize: 16, color: 'rgba(0,212,255,0.4)' }} />}
                    sx={{ mb: 1 }}
                >
                    {breadcrumbs.map((crumb, index) => (
                        <Link
                            key={index}
                            underline="hover"
                            color={index === breadcrumbs.length - 1 ? 'primary' : 'text.secondary'}
                            href={crumb.path || '#'}
                            sx={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px' }}
                        >
                            {crumb.text}
                        </Link>
                    ))}
                </Breadcrumbs>
            )}
            <Title variant="h4">{title}</Title>
            {subtitle && (
                <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500 }}>
                    {subtitle}
                </Typography>
            )}
        </HeaderContainer>
    );
};

export default PageHeader;
