import React from 'react';
import {
    Box,
    Typography,
    Stack,
    TextField,
    Avatar,
    CircularProgress,
    List,
    ListItem,
    ListItemAvatar,
    ListItemText,
    Chip
} from '@mui/material';
import {
    Search as SearchIcon,
    QrCodeScanner as ScannerIcon,
    CheckCircle as SuccessIcon,
    Error as ErrorIcon
} from '@mui/icons-material';
import { styled } from '@mui/material/styles';
import NeonButton from '../common/NeonButton';
import GlassCard from '../common/GlassCard';

const CameraFeed = styled(Box, {
    shouldForwardProp: (prop) => !['active', 'result'].includes(prop)
})(({ theme, active, result }) => ({
    width: '100%',
    height: 480,
    background: '#000',
    borderRadius: 24,
    position: 'relative',
    overflow: 'hidden',
    border: active ? '2px solid #FF3366' : (result?.success ? '2px solid #00FF88' : '2px solid rgba(255,255,255,0.05)'),
    boxShadow: active ? '0 0 30px rgba(255, 51, 102, 0.2)' : (result?.success ? '0 0 30px rgba(0, 255, 136, 0.2)' : 'none'),
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: '0.3s'
}));

const CheckoutLiveFeed = ({
    active,
    setActive,
    result,
    setResult,
    loading,
    searchQuery,
    handleSearch,
    searchResults,
    handleManualCheckout
}) => {
    return (
        <CameraFeed active={active} result={result}>
            {!active && !result && (
                <Stack alignItems="center" spacing={3} sx={{ width: '80%' }}>
                    <ScannerIcon sx={{ fontSize: 80, opacity: 0.2, color: '#FF3366' }} />
                    <Typography sx={{ opacity: 0.5, letterSpacing: 2, fontWeight: 700 }}>AGUARDANDO LEITURA</Typography>

                    <Box sx={{ width: '100%', position: 'relative' }}>
                        <TextField
                            fullWidth
                            placeholder="Pesquisar por Nome ou CPF..."
                            value={searchQuery}
                            onChange={(e) => handleSearch(e.target.value)}
                            InputProps={{
                                startAdornment: <SearchIcon sx={{ color: 'text.secondary', mr: 1 }} />,
                                sx: { height: 56, borderRadius: 4, fontSize: '1.1rem' }
                            }}
                        />
                        {loading && <CircularProgress size={20} sx={{ position: 'absolute', right: 10, top: 18 }} />}

                        {searchResults.length > 0 && (
                            <GlassCard sx={{ position: 'absolute', top: '110%', left: 0, right: 0, zIndex: 10, p: 0, maxHeight: 200, overflow: 'auto' }}>
                                <List>
                                    {searchResults.map((f) => (
                                        <ListItem
                                            key={f.id}
                                            button
                                            onClick={() => handleManualCheckout(f.id)}
                                            sx={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                                        >
                                            <ListItemAvatar><Avatar>{f.nome[0]}</Avatar></ListItemAvatar>
                                            <ListItemText
                                                primary={f.nome}
                                                secondary={f.cpf}
                                                primaryTypographyProps={{ fontWeight: 700 }}
                                            />
                                            <Chip label={f.status || 'pendente'} size="small" />
                                        </ListItem>
                                    ))}
                                </List>
                            </GlassCard>
                        )}
                    </Box>

                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>OU</Typography>
                    <NeonButton onClick={() => setActive(true)} sx={{ minHeight: 56, borderRadius: 4, width: '100%', fontSize: '1.1rem', borderColor: '#FF3366', color: '#FF3366', '&:hover': { borderColor: '#FF0044', color: '#FF0044', boxShadow: '0 0 15px rgba(255, 0, 68, 0.4)' } }}>
                        INICIAR SCANNER ÓPTICO
                    </NeonButton>
                </Stack>
            )}

            {active && (
                <>
                    <div id="reader-checkout" style={{ width: '100%', height: '100%' }}></div>
                    <Box sx={{ position: 'absolute', bottom: 40, width: '100%', display: 'flex', justifyContent: 'center', zIndex: 10 }}>
                        <NeonButton variant="outlined" color="error" onClick={() => setActive(false)} sx={{ minHeight: 56, width: '80%', borderRadius: 4 }}>ENCERRAR SCANNER</NeonButton>
                    </Box>
                </>
            )}

            {result && (
                <Stack alignItems="center" spacing={2} sx={{ animation: 'counterUp 0.4s ease-out' }}>
                    {result.type === 'success' ? (
                        <>
                            <SuccessIcon sx={{ fontSize: 100, color: '#00FF88', filter: 'drop-shadow(0 0 10px rgba(0,255,136,0.3))' }} />
                            <Typography variant="h3" sx={{ fontWeight: 900, fontFamily: '"Orbitron", sans-serif', color: '#fff' }}>SAÍDA CONFIRMADA</Typography>
                            <Box sx={{ p: 2, background: 'rgba(0,255,136,0.1)', borderRadius: 4, textAlign: 'center', border: '1px solid rgba(0,255,136,0.2)' }}>
                                <Typography variant="h5" sx={{ color: '#00FF88', fontWeight: 800 }}>{result.nome || result.data?.pessoa?.nome || 'Participante'}</Typography>
                            </Box>
                        </>
                    ) : (
                        <>
                            <ErrorIcon sx={{ fontSize: 100, color: '#FF3366', filter: 'drop-shadow(0 0 10px rgba(255,51,102,0.3))' }} />
                            <Typography variant="h3" sx={{ fontWeight: 900, fontFamily: '"Orbitron", sans-serif', color: '#fff' }}>ERRO</Typography>
                            <Typography variant="subtitle1" sx={{ color: '#FF3366' }}>{result.error}</Typography>
                        </>
                    )}
                    <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
                        <NeonButton variant="outlined" onClick={() => setResult(null)} sx={{ minHeight: 56, width: '80%' }}>PRÓXIMO</NeonButton>
                    </Stack>
                </Stack>
            )}
        </CameraFeed>
    );
};

export default CheckoutLiveFeed;
