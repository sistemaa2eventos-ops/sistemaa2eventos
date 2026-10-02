import React, { useState } from 'react';
import {
    Box, Typography, Dialog, DialogTitle, DialogContent,
    DialogActions, List, ListItem, ListItemButton, ListItemText,
    Chip, TextField, CircularProgress, IconButton, Tooltip, Stack
} from '@mui/material';
import {
    Face as FaceIcon,
    Sensors as SensorsIcon,
    SensorsOff as SensorsOffIcon,
    Close as CloseIcon,
    CheckCircle as CheckCircleIcon,
    RadioButtonUnchecked as UncheckedIcon,
    Refresh as RefreshIcon
} from '@mui/icons-material';
import NeonButton from './NeonButton';
import GlassCard from './GlassCard';

export const EstacaoFacialSelector = ({
    sessaoAtiva,
    dispositivos = [],
    loading = false,
    onVincular,
    onDesvincular,
    onRecarregar
}) => {
    const [openModal, setOpenModal] = useState(false);
    const [selectedDispositivoId, setSelectedDispositivoId] = useState('');
    const [estacaoNome, setEstacaoNome] = useState('Baia 01');
    const [saving, setSaving] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    const handleOpen = () => {
        if (sessaoAtiva) {
            setSelectedDispositivoId(sessaoAtiva.dispositivo_id);
            setEstacaoNome(sessaoAtiva.estacao_nome || 'Baia 01');
        } else {
            const primeiroLivre = dispositivos.find(d => !d.ocupado);
            if (primeiroLivre) setSelectedDispositivoId(primeiroLivre.id);
        }
        setErrorMsg('');
        if (onRecarregar) onRecarregar();
        setOpenModal(true);
    };

    const handleClose = () => {
        if (!saving) setOpenModal(false);
    };

    const handleConfirmarVinculo = async () => {
        if (!selectedDispositivoId) {
            setErrorMsg('Selecione um leitor facial na lista.');
            return;
        }
        setSaving(true);
        setErrorMsg('');
        try {
            const res = await onVincular(selectedDispositivoId, estacaoNome.trim() || 'Baia Operador');
            if (res?.success) {
                setOpenModal(false);
            } else {
                setErrorMsg(res?.error || 'Falha ao vincular terminal facial');
            }
        } catch (err) {
            setErrorMsg(err.message || 'Erro de comunicação');
        } finally {
            setSaving(false);
        }
    };

    const handleConfirmarDesvinculo = async () => {
        setSaving(true);
        try {
            await onDesvincular();
            setOpenModal(false);
        } finally {
            setSaving(false);
        }
    };

    const dispositivoAtivo = sessaoAtiva?.dispositivos_acesso;

    return (
        <>
            {/* Status Bar / Widget no Topo */}
            <GlassCard
                sx={{
                    p: 1.5,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderRadius: 3,
                    border: sessaoAtiva ? '1px solid rgba(0, 255, 136, 0.4)' : '1px solid rgba(255, 255, 255, 0.1)',
                    background: sessaoAtiva 
                        ? 'linear-gradient(90deg, rgba(0, 255, 136, 0.08) 0%, rgba(0, 0, 0, 0.4) 100%)' 
                        : 'rgba(255, 255, 255, 0.03)',
                    mb: 2
                }}
            >
                <Stack direction="row" spacing={2} alignItems="center">
                    <Box
                        sx={{
                            width: 42,
                            height: 42,
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: sessaoAtiva ? 'rgba(0, 255, 136, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                            border: `2px solid ${sessaoAtiva ? '#00FF88' : 'rgba(255, 255, 255, 0.2)'}`,
                            boxShadow: sessaoAtiva ? '0 0 12px rgba(0, 255, 136, 0.5)' : 'none'
                        }}
                    >
                        {sessaoAtiva ? (
                            <SensorsIcon sx={{ color: '#00FF88', fontSize: 24 }} />
                        ) : (
                            <SensorsOffIcon sx={{ color: 'rgba(255, 255, 255, 0.4)', fontSize: 24 }} />
                        )}
                    </Box>

                    <Box>
                        <Stack direction="row" spacing={1} alignItems="center">
                            <Typography variant="subtitle1" fontWeight={700} sx={{ color: '#fff' }}>
                                {sessaoAtiva ? (sessaoAtiva.estacao_nome || 'Baia Operador') : 'Leitor Facial Desconectado'}
                            </Typography>
                            {sessaoAtiva && (
                                <Chip
                                    label="MODO LINHA DE MONTAGEM ATIVO"
                                    size="small"
                                    sx={{
                                        height: 20,
                                        fontSize: '0.65rem',
                                        fontWeight: 800,
                                        backgroundColor: 'rgba(0, 255, 136, 0.2)',
                                        color: '#00FF88',
                                        border: '1px solid #00FF88'
                                    }}
                                />
                            )}
                        </Stack>

                        <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.6)' }}>
                            {sessaoAtiva && dispositivoAtivo ? (
                                `Vinculado a: ${dispositivoAtivo.nome || 'Terminal'} (IP: ${dispositivoAtivo.ip_address || 'Rede'}) • Cadastros abrem automaticamente`
                            ) : (
                                'Vincule seu computador a um leitor Intelbras para que o rosto abra a tela instantaneamente'
                            )}
                        </Typography>
                    </Box>
                </Stack>

                <Stack direction="row" spacing={1}>
                    <NeonButton
                        neonColor={sessaoAtiva ? '#00FF88' : '#00E5FF'}
                        onClick={handleOpen}
                        disabled={loading}
                        sx={{ minHeight: 38, py: 0.5, px: 2, fontSize: '0.85rem' }}
                    >
                        {sessaoAtiva ? 'Trocar Estação' : '📡 Conectar Leitor Facial'}
                    </NeonButton>

                    {sessaoAtiva && (
                        <NeonButton
                            neonColor="#FF3366"
                            onClick={handleConfirmarDesvinculo}
                            disabled={loading || saving}
                            sx={{ minHeight: 38, py: 0.5, px: 2, fontSize: '0.85rem' }}
                        >
                            Desconectar
                        </NeonButton>
                    )}
                </Stack>
            </GlassCard>

            {/* Modal de Seleção de Leitor */}
            <Dialog
                open={openModal}
                onClose={handleClose}
                maxWidth="sm"
                fullWidth
                PaperProps={{
                    sx: {
                        background: 'rgba(18, 22, 36, 0.95)',
                        backdropFilter: 'blur(16px)',
                        border: '1px solid rgba(0, 229, 255, 0.3)',
                        borderRadius: 4,
                        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.8)'
                    }
                }}
            >
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
                    <Stack direction="row" spacing={1.5} alignItems="center">
                        <FaceIcon sx={{ color: '#00E5FF', fontSize: 28 }} />
                        <Box>
                            <Typography variant="h6" fontWeight={800} color="#fff">
                                Vincular Leitor Facial à Baia
                            </Typography>
                            <Typography variant="caption" color="rgba(255, 255, 255, 0.6)">
                                O colaborador olha para a câmera e o cadastro abre na sua tela em tempo real
                            </Typography>
                        </Box>
                    </Stack>
                    <IconButton onClick={handleClose} sx={{ color: 'rgba(255, 255, 255, 0.5)' }}>
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>

                <DialogContent dividers sx={{ borderColor: 'rgba(255, 255, 255, 0.1)', py: 2 }}>
                    <Stack spacing={2.5}>
                        <TextField
                            label="Identificação da Baia / Estação"
                            fullWidth
                            size="small"
                            value={estacaoNome}
                            onChange={(e) => setEstacaoNome(e.target.value)}
                            placeholder="Ex: Baia 01, Guichê A, Recepção 2"
                            helperText="Nome que identifica seu posto de atendimento"
                            sx={{
                                '& .MuiOutlinedInput-root': {
                                    color: '#fff',
                                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                                    borderRadius: 2,
                                    '& fieldset': { borderColor: 'rgba(255, 255, 255, 0.2)' },
                                    '&:hover fieldset': { borderColor: '#00E5FF' },
                                    '&.Mui-focused fieldset': { borderColor: '#00E5FF' }
                                },
                                '& .MuiInputLabel-root': { color: 'rgba(255, 255, 255, 0.6)' },
                                '& .MuiFormHelperText-root': { color: 'rgba(255, 255, 255, 0.4)' }
                            }}
                        />

                        <Box>
                            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
                                <Typography variant="subtitle2" fontWeight={700} color="#fff">
                                    Selecione o Leitor Facial Desta Baia:
                                </Typography>
                                <Tooltip title="Atualizar lista de leitores">
                                    <IconButton size="small" onClick={onRecarregar} sx={{ color: '#00E5FF' }}>
                                        <RefreshIcon fontSize="small" />
                                    </IconButton>
                                </Tooltip>
                            </Stack>

                            {dispositivos.length === 0 ? (
                                <Box sx={{ p: 3, textAlign: 'center', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 2 }}>
                                    <Typography variant="body2" color="rgba(255, 255, 255, 0.5)">
                                        Nenhum dispositivo cadastrado neste evento.
                                    </Typography>
                                    <Typography variant="caption" color="rgba(255, 255, 255, 0.4)">
                                        Cadastre os leitores faciais no menu Dispositivos.
                                    </Typography>
                                </Box>
                            ) : (
                                <List sx={{ maxHeight: 260, overflowY: 'auto', p: 0 }}>
                                    {dispositivos.map((dev) => {
                                        const isSelected = selectedDispositivoId === dev.id;
                                        const isOcupado = dev.ocupado;

                                        return (
                                            <ListItem
                                                key={dev.id}
                                                disablePadding
                                                sx={{ mb: 1 }}
                                            >
                                                <ListItemButton
                                                    selected={isSelected}
                                                    disabled={isOcupado}
                                                    onClick={() => setSelectedDispositivoId(dev.id)}
                                                    sx={{
                                                        borderRadius: 2,
                                                        border: isSelected 
                                                            ? '1px solid #00E5FF' 
                                                            : '1px solid rgba(255, 255, 255, 0.08)',
                                                        backgroundColor: isSelected 
                                                            ? 'rgba(0, 229, 255, 0.12) !important' 
                                                            : 'rgba(255, 255, 255, 0.03)',
                                                        '&:hover': {
                                                            backgroundColor: 'rgba(0, 229, 255, 0.06)'
                                                        }
                                                    }}
                                                >
                                                    <Box sx={{ mr: 1.5 }}>
                                                        {isSelected ? (
                                                            <CheckCircleIcon sx={{ color: '#00E5FF' }} />
                                                        ) : (
                                                            <UncheckedIcon sx={{ color: 'rgba(255, 255, 255, 0.3)' }} />
                                                        )}
                                                    </Box>

                                                    <ListItemText
                                                        primary={
                                                            <Stack direction="row" spacing={1} alignItems="center">
                                                                <Typography fontWeight={700} color="#fff">
                                                                    {dev.nome}
                                                                </Typography>
                                                                {dev.status_online === 'online' && (
                                                                    <Chip
                                                                        label="ONLINE"
                                                                        size="small"
                                                                        sx={{
                                                                            height: 18,
                                                                            fontSize: '0.6rem',
                                                                            bgcolor: 'rgba(0,255,136,0.15)',
                                                                            color: '#00FF88'
                                                                        }}
                                                                    />
                                                                )}
                                                                {isOcupado && (
                                                                    <Chip
                                                                        label="EM USO POR OUTRO OPERADOR"
                                                                        size="small"
                                                                        sx={{
                                                                            height: 18,
                                                                            fontSize: '0.6rem',
                                                                            bgcolor: 'rgba(255,51,102,0.15)',
                                                                            color: '#FF3366'
                                                                        }}
                                                                    />
                                                                )}
                                                            </Stack>
                                                        }
                                                        secondary={
                                                            <Typography variant="caption" color="rgba(255, 255, 255, 0.5)">
                                                                IP: {dev.ip_address || 'N/A'} • {dev.modelo || dev.fabricante || 'Intelbras Facial'}
                                                            </Typography>
                                                        }
                                                    />
                                                </ListItemButton>
                                            </ListItem>
                                        );
                                    })}
                                </List>
                            )}
                        </Box>

                        {errorMsg && (
                            <Typography variant="caption" sx={{ color: '#FF3366', fontWeight: 600 }}>
                                ⚠️ {errorMsg}
                            </Typography>
                        )}
                    </Stack>
                </DialogContent>

                <DialogActions sx={{ p: 2.5, borderColor: 'rgba(255, 255, 255, 0.1)' }}>
                    <NeonButton
                        neonColor="rgba(255, 255, 255, 0.4)"
                        onClick={handleClose}
                        disabled={saving}
                        sx={{ minHeight: 38 }}
                    >
                        Cancelar
                    </NeonButton>

                    <NeonButton
                        neonColor="#00E5FF"
                        onClick={handleConfirmarVinculo}
                        disabled={saving || !selectedDispositivoId}
                        loading={saving}
                        sx={{ minHeight: 38 }}
                    >
                        Vincular a Esta Baia
                    </NeonButton>
                </DialogActions>
            </Dialog>
        </>
    );
};

export default EstacaoFacialSelector;
