import React from 'react';
import { Box, Typography, Breadcrumbs, Link } from '@mui/material';
import { styled } from '@mui/material/styles';
import { ChevronRight as ChevronRightIcon } from '@mui/icons-material';

const HeaderContainer = styled(Box)(({ theme }) => ({
    marginBottom: theme.spacing(4),
    padding: theme.spacing(1, 0),
}));

const Title = styled(Typography)(({ theme }) => ({
    fontFamily: '"Space Grotesk", "Inter", sans-serif',
    fontWeight: 700,
    fontSize: 'clamp(1.4rem, 2.5vw, 1.875rem)',
    color: theme.palette.text.primary,
    letterSpacing: '-0.02em',
    lineHeight: 1.2,
    marginBottom: theme.spacing(0.5),
}));

const Subtitle = styled(Typography)(({ theme }) => ({
    color: theme.palette.text.secondary,
    fontSize: '0.875rem',
    fontWeight: 400,
    lineHeight: 1.5,
}));

const Divider = styled(Box)(({ theme }) => ({
    width: 40,
    height: 3,
    borderRadius: 2,
    background: `linear-gradient(90deg, ${theme.palette.primary.main} 0%, ${theme.palette.secondary.main} 100%)`,
    marginTop: theme.spacing(1.5),
}));

const PageHeader = ({ title, subtitle, breadcrumbs = [], action }) => {
    return (
        <HeaderContainer>
            {breadcrumbs.length > 0 && (
                <Breadcrumbs
                    separator={<ChevronRightIcon sx={{ fontSize: 14, color: 'text.disabled' }} />}
                    sx={{ mb: 1.5 }}
                >
                    {breadcrumbs.map((crumb, index) => (
                        <Link
                            key={index}
                            underline="hover"
                            color={index === breadcrumbs.length - 1 ? 'primary.main' : 'text.secondary'}
                            href={crumb.path || '#'}
                            sx={{ fontSize: '0.75rem', fontWeight: 500 }}
                        >
                            {crumb.text}
                        </Link>
                    ))}
                </Breadcrumbs>
            )}

            <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2 }}>
                <Box>
                    <Title variant="h4">{title}</Title>
                    {subtitle && <Subtitle>{subtitle}</Subtitle>}
                    <Divider />
                </Box>
                {action && <Box sx={{ flexShrink: 0, pt: 0.5 }}>{action}</Box>}
            </Box>
        </HeaderContainer>
    );
};

export default PageHeader;
