import React, { useState } from 'react';
import {
    Box, Typography, Dialog, DialogTitle, DialogContent,
    DialogActions, List, ListItem, ListItemButton, ListItemText,
    Chip, TextField, IconButton, Tooltip, Stack, ButtonBase, Menu, MenuItem
} from '@mui/material';
import {
    Face as FaceIcon,
    Sensors as SensorsIcon,
    SensorsOff as SensorsOffIcon,
    Close as CloseIcon,
    CheckCircle as CheckCircleIcon,
    RadioButtonUnchecked as UncheckedIcon,
    Refresh as RefreshIcon,
    ExpandMore as ExpandMoreIcon
} from '@mui/icons-material';
import NeonButton from './NeonButton';
import GlassCard from './GlassCard';

export const EstacaoFacialSelector = ({
    sessaoAtiva,
    dispositivos = [],
    loading = false,
    onVincular,
    onDesvincular,
    onRecarregar,
    compacto = false
}) => {
    const [openModal, setOpenModal] = useState(false);
    const [menuAnchor, setMenuAnchor] = useState(null);
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
    const corStatus = sessaoAtiva ? '#00FF88' : 'rgba(255, 255, 255, 0.45)';

    // Versão de cabeçalho: um chip com o status; trocar/desconectar ficam no menu
    const chipCompacto = (
        <>
            <Tooltip title={sessaoAtiva && dispositivoAtivo
                ? `Leitor ${dispositivoAtivo.nome || 'facial'} (${dispositivoAtivo.ip_address || 'rede'}): o cadastro abre ao reconhecer o rosto`
                : 'Conecte um leitor facial a esta estação'}>
                <ButtonBase
                    onClick={(e) => (sessaoAtiva ? setMenuAnchor(e.currentTarget) : handleOpen())}
                    disabled={loading}
                    sx={{
                        display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.75,
                        borderRadius: 1.5,
                        border: `1px solid ${sessaoAtiva ? 'rgba(0, 255, 136, 0.4)' : 'rgba(255, 255, 255, 0.15)'}`,
                        bgcolor: sessaoAtiva ? 'rgba(0, 255, 136, 0.08)' : 'rgba(255, 255, 255, 0.03)',
                        '&:focus-visible': { outline: '2px solid #00D4FF', outlineOffset: 2 }
                    }}
                >
                    {sessaoAtiva
                        ? <SensorsIcon sx={{ color: corStatus, fontSize: 18 }} />
                        : <SensorsOffIcon sx={{ color: corStatus, fontSize: 18 }} />}
                    <Typography variant="body2" fontWeight={600} sx={{ color: '#FFFFFF', whiteSpace: 'nowrap' }}>
                        {sessaoAtiva ? (sessaoAtiva.estacao_nome || 'Estação') : 'Sem leitor facial'}
                    </Typography>
                    {sessaoAtiva && <ExpandMoreIcon sx={{ fontSize: 18, color: 'rgba(255,255,255,0.6)' }} />}
                </ButtonBase>
            </Tooltip>
            <Menu anchorEl={menuAnchor} open={!!menuAnchor} onClose={() => setMenuAnchor(null)}>
                <MenuItem onClick={() => { setMenuAnchor(null); handleOpen(); }}>Trocar leitor</MenuItem>
                <MenuItem
                    onClick={() => { setMenuAnchor(null); handleConfirmarDesvinculo(); }}
                    disabled={saving}
                    sx={{ color: '#FF3366' }}
                >
                    Desconectar
                </MenuItem>
            </Menu>
        </>
    );

    return (
        <>
            {compacto ? chipCompacto : (
            <GlassCard
                sx={{
                    p: 1.5,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 1.5,
                    borderRadius: 1.5,
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
                            <Typography variant="subtitle1" fontWeight={700} sx={{ color: '#FFFFFF' }}>
                                {sessaoAtiva ? (sessaoAtiva.estacao_nome || 'Baia Operador') : 'Leitor Facial Desconectado'}
                            </Typography>
                            {sessaoAtiva && (
                                <Chip
                                    label="Leitor conectado"
                                    size="small"
                                    sx={{
                                        height: 20,
                                        fontSize: '0.75rem',
                                        fontWeight: 700,
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
                        neonColor={sessaoAtiva ? '#00FF88' : '#00D4FF'}
                        onClick={handleOpen}
                        disabled={loading}
                        sx={{ minHeight: 38, py: 0.5, px: 2, fontSize: '0.875rem' }}
                    >
                        {sessaoAtiva ? 'Trocar estação' : 'Conectar leitor facial'}
                    </NeonButton>

                    {sessaoAtiva && (
                        <NeonButton
                            neonColor="#FF3366"
                            onClick={handleConfirmarDesvinculo}
                            disabled={loading || saving}
                            sx={{ minHeight: 38, py: 0.5, px: 2, fontSize: '0.875rem' }}
                        >
                            Desconectar
                        </NeonButton>
                    )}
                </Stack>
            </GlassCard>
            )}

            {/* Modal de Seleção de Leitor */}
            <Dialog
                open={openModal}
                onClose={handleClose}
                maxWidth="xs"
                fullWidth
            >
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1 }}>
                    <Stack direction="row" spacing={1.5} alignItems="center">
                        <FaceIcon sx={{ fontSize: 24 }} />
                        <Typography variant="subtitle1" fontWeight={700} color="#FFFFFF">
                            Leitor facial desta estação
                        </Typography>
                    </Stack>
                    <IconButton onClick={handleClose} sx={{ color: 'rgba(255, 255, 255, 0.5)' }}>
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>

                <DialogContent dividers sx={{ borderColor: 'rgba(255, 255, 255, 0.1)', py: 2 }}>
                    <Stack spacing={2}>
                        <TextField
                            label="Nome da estação"
                            fullWidth
                            size="small"
                            value={estacaoNome}
                            onChange={(e) => setEstacaoNome(e.target.value)}
                            placeholder="Ex: Baia 01, Guichê A, Recepção 2"
                            sx={{
                                '& .MuiOutlinedInput-root': {
                                    color: '#FFFFFF',
                                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                                    borderRadius: 1.5,
                                    '& fieldset': { borderColor: 'rgba(255, 255, 255, 0.2)' },
                                    '&:hover fieldset': { borderColor: '#00D4FF' },
                                    '&.Mui-focused fieldset': { borderColor: '#00D4FF' }
                                },
                                '& .MuiInputLabel-root': { color: 'rgba(255, 255, 255, 0.6)' },
                                '& .MuiFormHelperText-root': { color: 'rgba(255, 255, 255, 0.4)' }
                            }}
                        />

                        <Box>
                            <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
                                <Typography variant="subtitle2" fontWeight={700} color="#FFFFFF">
                                    Leitor facial
                                </Typography>
                                <Tooltip title="Atualizar lista de leitores">
                                    <IconButton size="small" onClick={onRecarregar} sx={{ color: '#00D4FF' }}>
                                        <RefreshIcon fontSize="small" />
                                    </IconButton>
                                </Tooltip>
                            </Stack>

                            {dispositivos.length === 0 ? (
                                <Box sx={{ p: 3, textAlign: 'center', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 1.5 }}>
                                    <Typography variant="body2" color="rgba(255, 255, 255, 0.5)">
                                        Nenhum dispositivo cadastrado neste evento.
                                    </Typography>
                                    <Typography variant="caption" color="rgba(255, 255, 255, 0.4)">
                                        Cadastre os leitores faciais no menu Dispositivos.
                                    </Typography>
                                </Box>
                            ) : (
                                <List sx={{ maxHeight: 220, overflowY: 'auto', p: 0 }}>
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
                                                        borderRadius: 1.5,
                                                        border: isSelected 
                                                            ? '1px solid #00D4FF' 
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
                                                            <CheckCircleIcon sx={{ color: '#00D4FF' }} />
                                                        ) : (
                                                            <UncheckedIcon sx={{ color: 'rgba(255, 255, 255, 0.3)' }} />
                                                        )}
                                                    </Box>

                                                    <ListItemText
                                                        primary={
                                                            <Stack direction="row" spacing={1} alignItems="center">
                                                                <Typography fontWeight={700} color="#FFFFFF">
                                                                    {dev.nome}
                                                                </Typography>
                                                                {dev.status_online === 'online' && (
                                                                    <Chip
                                                                        label="Online"
                                                                        size="small"
                                                                        sx={{
                                                                            height: 18,
                                                                            fontSize: '0.75rem',
                                                                            bgcolor: 'rgba(0,255,136,0.15)',
                                                                            color: '#00FF88'
                                                                        }}
                                                                    />
                                                                )}
                                                                {isOcupado && (
                                                                    <Chip
                                                                        label="Em uso por outro operador"
                                                                        size="small"
                                                                        sx={{
                                                                            height: 18,
                                                                            fontSize: '0.75rem',
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
                                {errorMsg}
                            </Typography>
                        )}
                    </Stack>
                </DialogContent>

                <DialogActions sx={{ px: 2.5, py: 1.5, borderColor: 'rgba(255, 255, 255, 0.1)' }}>
                    <NeonButton
                        neonColor="rgba(255, 255, 255, 0.4)"
                        onClick={handleClose}
                        disabled={saving}
                        sx={{ minHeight: 38 }}
                    >
                        Cancelar
                    </NeonButton>

                    <NeonButton
                        neonColor="#00D4FF"
                        onClick={handleConfirmarVinculo}
                        disabled={saving || !selectedDispositivoId}
                        loading={saving}
                        sx={{ minHeight: 38 }}
                    >
                        Conectar leitor
                    </NeonButton>
                </DialogActions>
            </Dialog>
        </>
    );
};

export default EstacaoFacialSelector;
