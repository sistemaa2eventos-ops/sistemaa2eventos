import React from 'react';
import { Box, Typography, Button, Container } from '@mui/material';
import { ErrorOutline as ErrorIcon } from '@mui/icons-material';

class GlobalErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error('🔴 Critical UI Crash:', error, errorInfo);
    }

    handleReload = () => {
        window.location.href = '/';
    };

    render() {
        if (this.state.hasError) {
            return (
                <Box
                    sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minHeight: '100vh',
                        bgcolor: '#050B18',
                        color: '#fff',
                        textAlign: 'center',
                        p: 3
                    }}
                >
                    <Container maxWidth="sm">
                        <ErrorIcon sx={{ fontSize: 80, color: '#FF3366', mb: 2 }} />
                        <Typography variant="h4" sx={{ fontWeight: 800, mb: 2, fontFamily: '"Orbitron", sans-serif' }}>
                            SISTEMA INTERCEPTADO
                        </Typography>
                        <Typography variant="body1" sx={{ color: 'text.secondary', mb: 4 }}>
                            Ocorreu uma falha crítica na renderização do módulo atual.
                            O núcleo do sistema permanece seguro, mas a interface precisa ser reiniciada.
                        </Typography>
                        <Button
                            variant="contained"
                            onClick={this.handleReload}
                            sx={{
                                bgcolor: '#00D4FF',
                                color: '#000',
                                fontWeight: 700,
                                '&:hover': { bgcolor: '#00FF88' }
                            }}
                        >
                            REINICIALIZAR INTERFACE
                        </Button>

                        {process.env.NODE_ENV === 'development' && (
                            <Box sx={{ mt: 4, textAlign: 'left', p: 2, bgcolor: 'rgba(255,51,102,0.1)', borderRadius: 2 }}>
                                <Typography variant="caption" sx={{ color: '#FF3366', fontFamily: 'monospace' }}>
                                    {this.state.error?.toString()}
                                </Typography>
                            </Box>
                        )}
                    </Container>
                </Box>
            );
        }

        return this.props.children;
    }
}

export default GlobalErrorBoundary;
