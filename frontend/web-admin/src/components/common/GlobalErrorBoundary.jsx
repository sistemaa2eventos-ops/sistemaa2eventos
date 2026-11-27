import React from 'react';
import { Box, Typography, Button, Container } from '@mui/material';
import { ErrorOutline as ErrorIcon } from '@mui/icons-material';
import { ehErroDeVersao, recarregarUmaVez } from '../../utils/atualizacaoApp';
import { cores } from '../../styles/tokens';

class GlobalErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        // Tela de versão antiga (deploy com a aba aberta): recarrega em vez de mostrar erro
        if (ehErroDeVersao(error) && recarregarUmaVez()) return;
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
                        minHeight: '100dvh',
                        bgcolor: cores.fundo,
                        color: cores.textoForte,
                        textAlign: 'center',
                        p: 3
                    }}
                >
                    <Container maxWidth="sm">
                        <ErrorIcon sx={{ fontSize: 80, color: cores.erro, mb: 2 }} />
                        <Typography variant="h4" sx={{ fontWeight: 700, mb: 2, fontFamily: '"Space Grotesk", sans-serif' }}>
                            Sistema interceptado
                        </Typography>
                        <Typography variant="body1" sx={{ color: 'text.secondary', mb: 4 }}>
                            Ocorreu uma falha crítica na renderização do módulo atual.
                            O núcleo do sistema permanece seguro, mas a interface precisa ser reiniciada.
                        </Typography>
                        <Button
                            variant="contained"
                            onClick={this.handleReload}
                            sx={{
                                bgcolor: cores.primaria,
                                color: '#000000',
                                fontWeight: 700,
                                '&:hover': { bgcolor: cores.sucesso }
                            }}
                        >
                            Reinicializar interface
                        </Button>

                        {true && (
                            <Box sx={{ mt: 4, textAlign: 'left', p: 2, bgcolor: 'rgba(255,51,102,0.1)', borderRadius: 1.5 }}>
                                <Typography variant="caption" sx={{ color: cores.erro, fontFamily: '"Inter", sans-serif' }}>
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
