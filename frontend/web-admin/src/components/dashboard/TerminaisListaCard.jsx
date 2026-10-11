import React from 'react';
import {
    Box, Typography, Stack, Chip
} from '@mui/material';
import {
    Devices as DevicesIcon,
    Place as PlaceIcon,
    ArrowForward as ArrowForwardIcon,
    ArrowBack as ArrowBackIcon,
    SyncAlt as SyncAltIcon,
    Circle as CircleIcon,
    CameraAlt as CameraIcon,
    Sensors as SensorsIcon,
    Fingerprint as BiometricIcon
} from '@mui/icons-material';
import GlassCard from '../common/GlassCard';

/**
 * TerminaisListaCard
 * Quadro do Dashboard exibindo a lista de todos os terminais do evento
 * mostrando Local, Nome do Equipamento, Tipo de Fluxo (so entrada, entrada e saida, so saida)
 * e Status do Equipamento.
 */
const TerminaisListaCard = ({ terminais = [] }) => {
    const totalOnline = (terminais || []).filter(t => t.status === 'online').length;

    // Helper para ícone por tipo de equipamento
    const getDeviceIcon = (tipo) => {
        const t = String(tipo || '').toLowerCase();
        if (t.includes('facial') || t.includes('cam')) return <CameraIcon sx={{ fontSize: 18 }} />;
        if (t.includes('catraca') || t.includes('leitor')) return <SensorsIcon sx={{ fontSize: 18 }} />;
        return <BiometricIcon sx={{ fontSize: 18 }} />;
    };

    // Helper para badge de tipo de fluxo
    const renderFluxoBadge = (tipoFluxo) => {
        const f = String(tipoFluxo || '').toLowerCase();
        if (f === 'so entrada' || f === 'entrada') {
            return (
                <Chip
                    icon={<ArrowForwardIcon sx={{ fontSize: 13, color: '#00FF88 !important' }} />}
                    label="Só entrada"
                    size="small"
                    sx={{
                        fontFamily: '"Space Grotesk", sans-serif',
                        fontWeight: 700,
                        fontSize: '0.75rem',
                        height: 22,
                        bgcolor: 'rgba(0, 255, 136, 0.12)',
                        color: '#00FF88',
                        border: '1px solid rgba(0, 255, 136, 0.3)'
                    }}
                />
            );
        }
        if (f === 'so saida' || f === 'saida') {
            return (
                <Chip
                    icon={<ArrowBackIcon sx={{ fontSize: 13, color: '#FFB800 !important' }} />}
                    label="Só saída"
                    size="small"
                    sx={{
                        fontFamily: '"Space Grotesk", sans-serif',
                        fontWeight: 700,
                        fontSize: '0.75rem',
                        height: 22,
                        bgcolor: 'rgba(255, 184, 0, 0.12)',
                        color: '#FFB800',
                        border: '1px solid rgba(255, 184, 0, 0.3)'
                    }}
                />
            );
        }
        return (
            <Chip
                icon={<SyncAltIcon sx={{ fontSize: 13, color: '#00D4FF !important' }} />}
                label="Entrada e saída"
                size="small"
                sx={{
                    fontFamily: '"Space Grotesk", sans-serif',
                    fontWeight: 700,
                    fontSize: '0.75rem',
                    height: 22,
                    bgcolor: 'rgba(0, 212, 255, 0.12)',
                    color: '#00D4FF',
                    border: '1px solid rgba(0, 212, 255, 0.3)'
                }}
            />
        );
    };

    return (
        <GlassCard sx={{ 
            p: { xs: 1.8, sm: 2.5 }, 
            minHeight: { xs: 380, sm: 420 }, 
            maxHeight: { xs: 520, md: 470 }, 
            height: '100%', 
            display: 'flex', 
            flexDirection: 'column' 
        }}>
            {/* Cabeçalho do Quadro */}
            <Box sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                mb: 2
            }}>
                <Stack direction="row" spacing={1.5} alignItems="center">
                    <Box sx={{
                        p: 1,
                        borderRadius: 1.5,
                        bgcolor: 'rgba(0, 255, 136, 0.12)',
                        color: '#00FF88',
                        display: 'flex',
                        alignItems: 'center'
                    }}>
                        <DevicesIcon sx={{ fontSize: 22 }} />
                    </Box>
                    <Box>
                        <Typography variant="h6" sx={{
                            fontWeight: 700,
                            color: '#FFFFFF',
                            fontSize: '1rem',
                            fontFamily: '"Space Grotesk", sans-serif',
                            lineHeight: 1.2
                        }}>
                            Terminais e equipamentos
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', display: 'block' }}>
                            Catracas, leitores faciais e postos de controle
                        </Typography>
                    </Box>
                </Stack>

                {/* Badge Online/Total */}
                <Chip
                    icon={<CircleIcon sx={{
                        fontSize: '0.75rem !important',
                        color: totalOnline > 0 ? '#00FF88 !important' : '#FF3366 !important'
                    }} />}
                    label={`${totalOnline} / ${terminais.length} ONLINE`}
                    size="small"
                    sx={{
                        fontFamily: '"Inter", sans-serif',
                        fontWeight: 700,
                        fontSize: '0.75rem',
                        height: 26,
                        bgcolor: totalOnline > 0 ? 'rgba(0, 255, 136, 0.12)' : 'rgba(255, 51, 102, 0.12)',
                        color: totalOnline > 0 ? '#00FF88' : '#FF3366',
                        border: '1px solid',
                        borderColor: totalOnline > 0 ? 'rgba(0, 255, 136, 0.3)' : 'rgba(255, 51, 102, 0.3)'
                    }}
                />
            </Box>

            {/* Lista com Rolagem Suave */}
            <Box sx={{
                flexGrow: 1,
                maxHeight: { xs: 300, sm: 340 },
                overflowY: 'auto',
                pr: 0.5,
                '&::-webkit-scrollbar': { width: 6, height: 6 },
                '&::-webkit-scrollbar-thumb': { bgcolor: 'rgba(0, 255, 136, 0.2)', borderRadius: 1.5 }
            }}>
                {terminais.length === 0 ? (
                    <Box sx={{ textAlign: 'center', py: 8 }}>
                        <DevicesIcon sx={{ fontSize: 44, color: 'rgba(255,255,255,0.2)', mb: 1.5 }} />
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 700 }}>
                            Nenhum equipamento conectado ao evento
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', display: 'block', maxWidth: 280, mx: 'auto', mt: 0.5 }}>
                            Cadastre os leitores em Configurações → Leitores e dispositivos.
                        </Typography>
                    </Box>
                ) : (
                    <Stack spacing={1.5}>
                        {terminais.map((t) => {
                            const isOnline = t.status === 'online';
                            const isSync = t.status === 'sincronizando';

                            return (
                                <Box
                                    key={t.id}
                                    sx={{
                                        p: 1.8,
                                        borderRadius: 1.5,
                                        bgcolor: 'rgba(255,255,255,0.03)',
                                        border: '1px solid rgba(255,255,255,0.06)',
                                        borderLeft: '4px solid',
                                        borderLeftColor: isOnline ? '#00FF88' : (isSync ? '#FFB800' : '#FF3366'),
                                        transition: 'all 0.2s',
                                        '&:hover': {
                                            bgcolor: 'rgba(255,255,255,0.06)',
                                            transform: 'translateX(3px)'
                                        }
                                    }}
                                >
                                    <Box sx={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        mb: 1
                                    }}>
                                        {/* Nome do Equipamento com Ícone */}
                                        <Stack direction="row" spacing={1} alignItems="center">
                                            <Box sx={{
                                                color: isOnline ? '#00FF88' : '#94A3B8',
                                                display: 'flex',
                                                alignItems: 'center'
                                            }}>
                                                {getDeviceIcon(t.tipo)}
                                            </Box>
                                            <Typography variant="body2" sx={{
                                                fontWeight: 700,
                                                color: '#FFFFFF',
                                                fontSize: '0.875rem',
                                                fontFamily: '"Space Grotesk", sans-serif'
                                            }}>
                                                {t.nome}
                                            </Typography>
                                        </Stack>

                                        {/* Status do Equipamento */}
                                        <Stack direction="row" spacing={0.6} alignItems="center">
                                            <CircleIcon sx={{
                                                fontSize: '0.75rem',
                                                color: isOnline ? '#00FF88' : (isSync ? '#FFB800' : '#FF3366')
                                            }} />
                                            <Typography variant="caption" sx={{
                                                fontWeight: 700,
                                                fontSize: '0.75rem',
                                                fontFamily: '"Inter", sans-serif',
                                                color: isOnline ? '#00FF88' : (isSync ? '#FFB800' : '#FF3366')
                                            }}>
                                                {isOnline ? 'Online' : (isSync ? 'Sincronizando' : 'Offline')}
                                            </Typography>
                                        </Stack>
                                    </Box>

                                    {/* Linha Inferior: Local e Tipo de Fluxo */}
                                    <Box sx={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        flexWrap: 'wrap',
                                        gap: 1
                                    }}>
                                        {/* Local do Equipamento */}
                                        <Typography variant="caption" sx={{
                                            color: 'rgba(255,255,255,0.6)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 0.5
                                        }}>
                                            <PlaceIcon sx={{ fontSize: 14, color: '#00D4FF' }} />
                                            <strong>Local:</strong> {t.local || 'Portaria Principal'}
                                        </Typography>

                                        {/* Tipo de Fluxo (so entrada, entrada e saida, so saida) */}
                                        {renderFluxoBadge(t.tipo_fluxo)}
                                    </Box>
                                </Box>
                            );
                        })}
                    </Stack>
                )}
            </Box>

            {/* Rodapé Informativo */}
            <Box sx={{
                mt: 1.5,
                pt: 1.5,
                borderTop: '1px solid rgba(255,255,255,0.08)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
            }}>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.75rem' }}>
                    Status atualizado automaticamente
                </Typography>
            </Box>
        </GlassCard>
    );
};

export default TerminaisListaCard;
