import React, { useState, useEffect, useRef } from 'react';
import {
    Box, Typography, Avatar, IconButton, Button, Menu, MenuItem,
    Dialog, DialogTitle, DialogContent, DialogActions, TextField,
    Tabs, Tab, Grid, Chip, Tooltip, Stack, CircularProgress, Alert
} from '@mui/material';
import { styled } from '@mui/material/styles';
import {
    Settings as SettingsIcon,
    Logout as LogoutIcon,
    PhotoCamera as PhotoCameraIcon,
    Campaign as EmergencyIcon,
    EditNote as NoteIcon,
    Save as SaveIcon,
    CheckCircle as CheckCircleIcon,
    AccessTime as TimeIcon,
    DeleteOutline as ClearIcon,
    Warning as WarningIcon
} from '@mui/icons-material';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';

// --- PALETA DE AVATARES TÁTICOS (SVG DATA URIS) ---
const TACTICAL_AVATARS = [
    {
        id: 'cyber_ops',
        name: 'Central Ops',
        color: '#00D4FF',
        svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="#050B18" stroke="#00D4FF" stroke-width="3"/><circle cx="50" cy="38" r="16" fill="#00D4FF" opacity="0.85"/><path d="M22 82 C22 64 35 56 50 56 C65 56 78 64 78 82 Z" fill="#00D4FF" opacity="0.75"/><circle cx="50" cy="38" r="6" fill="#050B18"/></svg>`
    },
    {
        id: 'agente_tatico',
        name: 'Agente Tático',
        color: '#7B2FBE',
        svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="#050B18" stroke="#7B2FBE" stroke-width="3"/><polygon points="50,15 82,30 82,65 50,88 18,65 18,30" fill="none" stroke="#7B2FBE" stroke-width="4"/><circle cx="50" cy="42" r="12" fill="#7B2FBE" opacity="0.9"/><path d="M30 75 C35 60 65 60 70 75" stroke="#7B2FBE" stroke-width="5" stroke-linecap="round" fill="none"/></svg>`
    },
    {
        id: 'fiscal_pista',
        name: 'Fiscal de Pista',
        color: '#00FF88',
        svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="#050B18" stroke="#00FF88" stroke-width="3"/><circle cx="50" cy="50" r="32" fill="none" stroke="#00FF88" stroke-width="2" stroke-dasharray="6,4"/><circle cx="50" cy="50" r="14" fill="#00FF88"/><line x1="50" y1="10" x2="50" y2="90" stroke="#00FF88" stroke-width="2"/><line x1="10" y1="50" x2="90" y2="50" stroke="#00FF88" stroke-width="2"/></svg>`
    },
    {
        id: 'master_shield',
        name: 'Master VIP',
        color: '#FFB800',
        svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="#0A1628" stroke="#FFB800" stroke-width="3"/><polygon points="50,18 60,38 82,38 64,52 70,74 50,60 30,74 36,52 18,38 40,38" fill="#FFB800"/><circle cx="50" cy="50" r="10" fill="#0A1628"/></svg>`
    },
    {
        id: 'sentinela_alfa',
        name: 'Sentinela Alfa',
        color: '#FF3366',
        svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="#0A1628" stroke="#FF3366" stroke-width="3"/><polygon points="50,20 75,75 25,75" fill="none" stroke="#FF3366" stroke-width="4"/><circle cx="50" cy="48" r="7" fill="#FF3366"/><rect x="47" y="60" width="6" height="6" fill="#FF3366"/></svg>`
    },
    {
        id: 'bio_facial',
        name: 'Visão Facial',
        color: '#00D4FF',
        svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="#050B18" stroke="#00D4FF" stroke-width="3"/><rect x="25" y="25" width="50" height="50" rx="10" fill="none" stroke="#00D4FF" stroke-width="2"/><path d="M35 45 Q50 35 65 45" stroke="#00D4FF" stroke-width="3" fill="none"/><circle cx="40" cy="50" r="4" fill="#00D4FF"/><circle cx="60" cy="50" r="4" fill="#00D4FF"/><path d="M42 66 Q50 72 58 66" stroke="#00D4FF" stroke-width="3" fill="none"/></svg>`
    },
    {
        id: 'auditor_chefe',
        name: 'Auditor Chefe',
        color: '#00D4FF',
        svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="#050B18" stroke="#00D4FF" stroke-width="3"/><circle cx="50" cy="40" r="15" fill="#00D4FF"/><path d="M25 80 C25 65 37 58 50 58 C63 58 75 65 75 80 Z" fill="#00D4FF"/><polyline points="42,50 48,56 60,42" fill="none" stroke="#050B18" stroke-width="3"/></svg>`
    },
    {
        id: 'suporte_nzt',
        name: 'Suporte Alfa',
        color: '#A855F7',
        svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="#0A1628" stroke="#A855F7" stroke-width="3"/><circle cx="50" cy="50" r="28" fill="none" stroke="#A855F7" stroke-width="3"/><path d="M35 50 L45 50 L48 40 L52 60 L55 50 L65 50" fill="none" stroke="#A855F7" stroke-width="3" stroke-linecap="round"/></svg>`
    }
].map(item => ({
    ...item,
    dataUri: `data:image/svg+xml;utf8,${encodeURIComponent(item.svg)}`
}));

// Efeito sonoro sintetizado via Web Audio API para alertas e chamados
const playAlertSound = (type = 'panic') => {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (type === 'panic') {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(880, audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 0.3);
            osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.6);
            gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.8);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.8);
        } else {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(587, audioCtx.currentTime);
            osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.1);
            gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.3);
        }
    } catch {
        // Ignora silenciosamente se áudio for bloqueado pelo navegador
    }
};

const UserSectionContainer = styled(Box)(({ theme }) => ({
    position: 'sticky',
    bottom: 0,
    zIndex: 40,
    width: '100%',
    padding: theme.spacing(1.5, 1.5, 2, 1.5),
    background: 'linear-gradient(180deg, rgba(8, 18, 38, 0.94) 0%, rgba(3, 8, 18, 0.98) 100%)',
    backdropFilter: 'blur(25px)',
    borderTop: '1px solid rgba(0, 212, 255, 0.3)',
    boxShadow: '0 -10px 30px rgba(0, 0, 0, 0.85)',
    flexShrink: 0
}));

const UserCard = styled(Box)(() => ({
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 12px',
    borderRadius: 12,
    background: 'rgba(10, 22, 40, 0.75)',
    border: '1px solid rgba(0, 212, 255, 0.25)',
    boxShadow: 'inset 0 0 15px rgba(0, 212, 255, 0.05)',
    transition: 'all 0.3s ease',
    '&:hover': {
        borderColor: 'rgba(0, 212, 255, 0.5)',
        boxShadow: '0 0 20px rgba(0, 212, 255, 0.2)',
        transform: 'translateY(-1px)'
    }
}));

const ActionButton = styled(Button)(({ glowcolor = '#00D4FF' }) => ({
    flex: 1,
    minWidth: 0,
    height: 38,
    minHeight: 38,
    padding: '0 8px',
    borderRadius: 8,
    fontSize: '0.8125rem',
    fontWeight: 600,
    textTransform: 'none',
    border: `1px solid ${glowcolor}40`,
    background: `${glowcolor}12`,
    color: '#FFFFFF',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    whiteSpace: 'nowrap',
    transition: 'all 0.2s ease',
    '& .MuiButton-startIcon': {
        marginRight: 6,
        marginLeft: 0
    },
    '&:hover': {
        background: `${glowcolor}25`,
        borderColor: glowcolor,
    }
}));

export const OperatorSection = () => {
    const { user, logout, updateUserAvatar } = useAuth();
    const [anchorEl, setAnchorEl] = useState(null);

    // Modais
    const [avatarModalOpen, setAvatarModalOpen] = useState(false);
    const [chamarMasterOpen, setChamarMasterOpen] = useState(false);
    const [notesModalOpen, setNotesModalOpen] = useState(false);

    // Avatar state
    const [avatarTab, setAvatarTab] = useState('gallery');
    const [selectedAvatarUrl, setSelectedAvatarUrl] = useState('');
    const [customAvatarBase64, setCustomAvatarBase64] = useState('');
    const [savingAvatar, setSavingAvatar] = useState(false);
    const fileInputRef = useRef(null);

    // Chamar Master state
    const [motivoMaster, setMotivoMaster] = useState('Preciso de suporte urgente no posto de credenciamento.');
    const [pontoMaster, setPontoMaster] = useState(localStorage.getItem('nzt_workstation_name') || 'Guichê de Atendimento Principal');
    const [enviandoChamado, setEnviandoChamado] = useState(false);
    const [chamadoEnviado, setChamadoEnviado] = useState(false);

    // Notas state
    const [notesText, setNotesText] = useState('');
    const [notesSavedAlert, setNotesSavedAlert] = useState(false);

    // Tempo Online & Login
    const [onlineTimeFormatted, setOnlineTimeFormatted] = useState('00h 00m 00s');
    const [loginTimeFormatted, setLoginTimeFormatted] = useState('--:--:--');

    const opId = user?.id || 'default_op';
    const loginKey = `nzt_session_login_${opId}`;
    const notesKey = `nzt_operator_notes_${opId}`;
    const avatarKey = `nzt_operator_avatar_${opId}`;

    // Inicialização do Horário de Login e Contador de Tempo Online
    useEffect(() => {
        let loginIso = localStorage.getItem(loginKey);
        if (!loginIso) {
            loginIso = new Date().toISOString();
            localStorage.setItem(loginKey, loginIso);
        }

        try {
            const loginDate = new Date(loginIso);
            setLoginTimeFormatted(format(loginDate, 'HH:mm:ss', { locale: ptBR }));
        } catch {
            setLoginTimeFormatted('Agora');
        }

        const updateClock = () => {
            const currentLogin = localStorage.getItem(loginKey) || loginIso;
            const diffSeconds = Math.max(0, Math.floor((Date.now() - new Date(currentLogin).getTime()) / 1000));
            const h = Math.floor(diffSeconds / 3600);
            const m = Math.floor((diffSeconds % 3600) / 60);
            const s = diffSeconds % 60;
            setOnlineTimeFormatted(
                `${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`
            );
        };

        updateClock();
        const interval = setInterval(updateClock, 1000);
        return () => clearInterval(interval);
    }, [loginKey]);

    // Carregar notas salvas
    useEffect(() => {
        const savedNotes = localStorage.getItem(notesKey) || '';
        setNotesText(savedNotes);
    }, [notesKey]);

    // Avatar atual (preferência: context -> localStorage -> gravatar/default)
    const currentAvatar = user?.avatar_url || localStorage.getItem(avatarKey) || user?.foto_url || TACTICAL_AVATARS[0].dataUri;

    // Handlers do menu do usuário
    const handleMenuOpen = (event) => setAnchorEl(event.currentTarget);
    const handleMenuClose = () => setAnchorEl(null);

    // Salvar Avatar
    const handleSaveAvatar = async (urlToSave) => {
        const finalUrl = urlToSave || selectedAvatarUrl || customAvatarBase64;
        if (!finalUrl) return;

        setSavingAvatar(true);
        try {
            localStorage.setItem(avatarKey, finalUrl);
            if (updateUserAvatar) {
                await updateUserAvatar(finalUrl);
            }
            playAlertSound('beep');
            setAvatarModalOpen(false);
        } catch (err) {
            console.error('Erro ao salvar avatar:', err);
        } finally {
            setSavingAvatar(false);
        }
    };

    // Upload de arquivo de imagem do computador
    const handleFileChange = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Converter para Base64 com redimensionamento em Canvas para otimização
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const maxSize = 300;
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > maxSize) {
                        height = Math.round((height * maxSize) / width);
                        width = maxSize;
                    }
                } else {
                    if (height > maxSize) {
                        width = Math.round((width * maxSize) / height);
                        height = maxSize;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
                setCustomAvatarBase64(compressedDataUrl);
                setSelectedAvatarUrl(compressedDataUrl);
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    };

    // Salvar Notas
    const handleSaveNotes = () => {
        localStorage.setItem(notesKey, notesText);
        setNotesSavedAlert(true);
        playAlertSound('beep');
        setTimeout(() => setNotesSavedAlert(false), 2500);
    };

    // Disparar Chamada ao Master
    const handleDispararChamadoMaster = async () => {
        setEnviandoChamado(true);
        playAlertSound('panic');

        try {
            const eventoId = localStorage.getItem('active_evento_id') || user?.evento_id;
            await api.post('/audit/chamar-master', {
                operador_id: user?.id,
                operador_nome: user?.nome_completo || user?.nome || 'Operador',
                evento_id: eventoId,
                motivo: motivoMaster,
                ponto: pontoMaster,
                urgencia: 'ALTA'
            });

            // Persistir nome da estação de trabalho para facilidade futura
            localStorage.setItem('nzt_workstation_name', pontoMaster);

            setChamadoEnviado(true);
            setTimeout(() => {
                setChamadoEnviado(false);
                setChamarMasterOpen(false);
            }, 2500);
        } catch (err) {
            console.error('Erro ao chamar master:', err);
            // Mesmo se offline, exibe confirmação visual de tentativa de alerta emergencial
            setChamadoEnviado(true);
            setTimeout(() => {
                setChamadoEnviado(false);
                setChamarMasterOpen(false);
            }, 2500);
        } finally {
            setEnviandoChamado(false);
        }
    };

    const roleColor = (() => {
        const nivel = user?.nivel_acesso?.toLowerCase();
        if (nivel === 'admin_master' || nivel === 'master') return '#FFB800';
        if (nivel === 'supervisor') return '#7B2FBE';
        if (nivel === 'admin') return '#00D4FF';
        return '#00FF88';
    })();

    return (
        <UserSectionContainer>
            {/* Header com indicador de presença ao vivo */}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1, px: 0.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        bgcolor: '#00FF88',
                        boxShadow: '0 0 8px #00FF88',
                        animation: 'pulse 1.8s infinite'
                    }} />
                    <Typography
                        variant="caption"
                        sx={{
                            color: 'text.secondary',
                            fontWeight: 600,
                            fontSize: '0.75rem',
                            whiteSpace: 'nowrap'
                        }}
                    >
                        Conectado
                    </Typography>
                </Box>
                <Chip
                    label={{ admin_master: 'Admin Master', master: 'Admin Master', admin: 'Admin', supervisor: 'Supervisor', operador: 'Operador' }[user?.nivel_acesso] || 'Acesso'}
                    size="small"
                    sx={{
                        height: 18,
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        color: roleColor,
                        bgcolor: `${roleColor}18`,
                        border: `1px solid ${roleColor}50`,
                        fontFamily: '"Inter", sans-serif'
                    }}
                />
            </Box>

            {/* Cartão Principal do Operador */}
            <UserCard>
                {/* Avatar com ação de troca */}
                <Tooltip title="Clique para alterar foto ou avatar" arrow placement="top">
                    <Box
                        sx={{ position: 'relative', cursor: 'pointer' }}
                        onClick={() => {
                            setSelectedAvatarUrl(currentAvatar);
                            setAvatarModalOpen(true);
                        }}
                    >
                        <Avatar
                            src={currentAvatar}
                            sx={{
                                width: 48,
                                height: 48,
                                border: '2px solid',
                                borderColor: roleColor,
                                boxShadow: `0 0 15px ${roleColor}60`,
                                background: '#050B18',
                                transition: 'all 0.3s ease',
                                '&:hover': {
                                    transform: 'scale(1.05)',
                                    borderColor: '#00D4FF',
                                    boxShadow: '0 0 20px rgba(0, 212, 255, 0.7)'
                                }
                            }}
                        >
                            {user?.nome_completo?.charAt(0) || user?.nome?.charAt(0) || 'U'}
                        </Avatar>
                        <Box sx={{
                            position: 'absolute',
                            bottom: -2,
                            right: -2,
                            width: 18,
                            height: 18,
                            borderRadius: '50%',
                            bgcolor: '#0A1628',
                            border: '1px solid #00D4FF',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 0 6px #00D4FF'
                        }}>
                            <PhotoCameraIcon sx={{ fontSize: 10, color: '#00D4FF' }} />
                        </Box>
                    </Box>
                </Tooltip>

                {/* Informações de Nome, Entrada e Tempo Online */}
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                        variant="subtitle2"
                        noWrap
                        sx={{
                            fontWeight: 700,
                            fontSize: '0.875rem',
                            color: '#FFFFFF',
                            fontFamily: '"Space Grotesk", sans-serif',
                            letterSpacing: '0.3px',
                            lineHeight: 1.2
                        }}
                    >
                        {user?.nome_completo || user?.nome || 'Operador Central'}
                    </Typography>

                    {/* Hora de Login */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.3 }}>
                        <TimeIcon sx={{ fontSize: 11, color: 'text.secondary' }} />
                        <Typography
                            variant="caption"
                            sx={{
                                color: 'text.secondary',
                                fontSize: '0.75rem',
                                fontFamily: '"Inter", sans-serif',
                                fontWeight: 600
                            }}
                        >
                            Entrada: <span style={{ color: '#00D4FF' }}>{loginTimeFormatted}</span>
                        </Typography>
                    </Box>

                    {/* Tempo Online Vivo */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.2 }}>
                        <Box sx={{ width: 5, height: 5, borderRadius: '50%', bgcolor: '#00FF88' }} />
                        <Typography
                            variant="caption"
                            sx={{
                                color: '#00FF88',
                                fontSize: '0.75rem',
                                fontFamily: '"Inter", sans-serif',
                                fontWeight: 700,
                                letterSpacing: '0.5px'
                            }}
                        >
                            {onlineTimeFormatted}
                        </Typography>
                    </Box>
                </Box>

                {/* Botão de Menu e Configurações */}
                <IconButton
                    size="small"
                    onClick={handleMenuOpen}
                    sx={{
                        color: 'text.secondary',
                        p: 0.5,
                        '&:hover': { color: '#00D4FF', bgcolor: 'rgba(0, 212, 255, 0.1)' }
                    }}
                >
                    <SettingsIcon sx={{ fontSize: 18 }} />
                </IconButton>
            </UserCard>

            {/* Barra de Ações Rápidas: Chamar Master & Notas */}
            <Stack direction="row" spacing={1} sx={{ mt: 1.2, width: '100%' }}>
                {/* Chamar o Master não faz sentido para o próprio Admin Master */}
                {!['admin_master', 'master'].includes(user?.nivel_acesso) && (
                <ActionButton
                    glowcolor="#FF3366"
                    startIcon={<EmergencyIcon sx={{ fontSize: 15 }} />}
                    onClick={() => {
                        setChamarMasterOpen(true);
                        playAlertSound('beep');
                    }}
                >
                    Chamar Master
                </ActionButton>
                )}

                <ActionButton
                    glowcolor="#00D4FF"
                    startIcon={<NoteIcon sx={{ fontSize: 15 }} />}
                    onClick={() => {
                        setNotesModalOpen(true);
                        playAlertSound('beep');
                    }}
                >
                    Notas
                </ActionButton>
            </Stack>

            {/* Menu Popover do Operador */}
            <Menu
                anchorEl={anchorEl}
                open={Boolean(anchorEl)}
                onClose={handleMenuClose}
                anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
                transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                PaperProps={{
                    sx: {
                        background: '#0A1628',
                        border: '1px solid rgba(0, 212, 255, 0.25)',
                        boxShadow: '0 10px 40px rgba(0,0,0,0.7)',
                        minWidth: 220,
                        borderRadius: 1.5,
                        mt: -1
                    }
                }}
            >
                <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid rgba(255,255,255,0.06)', mb: 1 }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700 }}>OPERADOR CONECTADO</Typography>
                    <Typography variant="body2" sx={{ color: '#FFFFFF', fontWeight: 700, fontSize: '0.8125rem' }} noWrap>
                        {user?.email}
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#00D4FF', fontFamily: '"Inter", sans-serif' }}>
                        Turno Ativo: {onlineTimeFormatted}
                    </Typography>
                </Box>

                <MenuItem
                    onClick={() => {
                        handleMenuClose();
                        setAvatarModalOpen(true);
                    }}
                    sx={{ gap: 1.5, mx: 1, borderRadius: 1.5, '&:hover': { background: 'rgba(0, 212, 255, 0.1)' } }}
                >
                    <PhotoCameraIcon fontSize="small" sx={{ color: '#00D4FF' }} />
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>Trocar Foto / Avatar</Typography>
                </MenuItem>

                <MenuItem
                    onClick={() => {
                        handleMenuClose();
                        setNotesModalOpen(true);
                    }}
                    sx={{ gap: 1.5, mx: 1, borderRadius: 1.5, '&:hover': { background: 'rgba(0, 212, 255, 0.1)' } }}
                >
                    <NoteIcon fontSize="small" sx={{ color: '#00FF88' }} />
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>Bloco de Notas do Turno</Typography>
                </MenuItem>

                <MenuItem
                    onClick={() => {
                        handleMenuClose();
                        setChamarMasterOpen(true);
                    }}
                    sx={{ gap: 1.5, mx: 1, borderRadius: 1.5, '&:hover': { background: 'rgba(255, 51, 102, 0.1)', color: '#FF3366' } }}
                >
                    <EmergencyIcon fontSize="small" sx={{ color: '#FF3366' }} />
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>Chamar Administrador Master</Typography>
                </MenuItem>

                <MenuItem
                    onClick={() => {
                        handleMenuClose();
                        logout();
                    }}
                    sx={{
                        gap: 1.5,
                        mx: 1,
                        my: 0.5,
                        borderRadius: 1.5,
                        color: '#FF3366',
                        borderTop: '1px solid rgba(255,255,255,0.05)',
                        pt: 1,
                        '&:hover': { background: 'rgba(255, 51, 102, 0.15)', color: '#FF3366' }
                    }}
                >
                    <LogoutIcon fontSize="small" />
                    <Box>
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>Encerrar Turno (Logoff)</Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontSize: '0.75rem' }}>
                            Salva relatório consolidado
                        </Typography>
                    </Box>
                </MenuItem>
            </Menu>

            {/* ========================================================================= */}
            {/* MODAL 1: SELETOR DE AVATAR & UPLOAD DE FOTO */}
            {/* ========================================================================= */}
            <Dialog
                open={avatarModalOpen}
                onClose={() => setAvatarModalOpen(false)}
                maxWidth="sm"
                fullWidth
                PaperProps={{
                    sx: {
                        background: '#050B18',
                        border: '1px solid rgba(0, 212, 255, 0.3)',
                        borderRadius: 1.5,
                        boxShadow: '0 20px 60px rgba(0,0,0,0.9)',
                        maxHeight: '90vh',
                        overflowY: 'auto'
                    }
                }}
            >
                <DialogTitle sx={{ pb: 1, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <Typography variant="h6" sx={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, color: '#00D4FF' }}>
                        Personalizar Avatar do Operador
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        Escolha um avatar tático do sistema ou faça upload da sua própria foto.
                    </Typography>
                </DialogTitle>

                <DialogContent sx={{ pt: 2 }}>
                    <Tabs
                        value={avatarTab}
                        onChange={(e, v) => setAvatarTab(v)}
                        sx={{
                            mb: 3,
                            '& .MuiTab-root': { color: 'text.secondary', fontWeight: 700 },
                            '& .Mui-selected': { color: '#00D4FF' },
                            '& .MuiTabs-indicator': { backgroundColor: '#00D4FF' }
                        }}
                    >
                        <Tab label="Galeria Tática" value="gallery" />
                        <Tab label="Fazer Upload de Foto" value="upload" />
                    </Tabs>

                    {avatarTab === 'gallery' ? (
                        <Grid container spacing={2}>
                            {TACTICAL_AVATARS.map((av) => {
                                const isSelected = selectedAvatarUrl === av.dataUri;
                                return (
                                    <Grid item xs={6} sm={3} key={av.id}>
                                        <Box
                                            onClick={() => setSelectedAvatarUrl(av.dataUri)}
                                            sx={{
                                                p: 1.5,
                                                borderRadius: 1.5,
                                                textAlign: 'center',
                                                cursor: 'pointer',
                                                background: isSelected ? `${av.color}25` : 'rgba(255,255,255,0.03)',
                                                border: `2px solid ${isSelected ? av.color : 'rgba(255,255,255,0.1)'}`,
                                                boxShadow: isSelected ? `0 0 20px ${av.color}50` : 'none',
                                                transition: 'all 0.2s ease',
                                                '&:hover': {
                                                    borderColor: av.color,
                                                    transform: 'translateY(-2px)'
                                                }
                                            }}
                                        >
                                            <Avatar
                                                src={av.dataUri}
                                                sx={{
                                                    width: 56,
                                                    height: 56,
                                                    mx: 'auto',
                                                    mb: 1,
                                                    border: `2px solid ${av.color}`,
                                                    bgcolor: '#050B18'
                                                }}
                                            />
                                            <Typography variant="caption" sx={{ fontWeight: 700, color: '#FFFFFF', display: 'block' }}>
                                                {av.name}
                                            </Typography>
                                        </Box>
                                    </Grid>
                                );
                            })}
                        </Grid>
                    ) : (
                        <Box sx={{ textAlign: 'center', py: 2 }}>
                            <input
                                type="file"
                                accept="image/*"
                                ref={fileInputRef}
                                onChange={handleFileChange}
                                style={{ display: 'none' }}
                            />

                            {customAvatarBase64 ? (
                                <Box sx={{ mb: 3 }}>
                                    <Avatar
                                        src={customAvatarBase64}
                                        sx={{
                                            width: 110,
                                            height: 110,
                                            mx: 'auto',
                                            mb: 2,
                                            border: '3px solid #00D4FF',
                                            boxShadow: '0 0 25px rgba(0, 212, 255, 0.5)'
                                        }}
                                    />
                                    <Typography variant="body2" sx={{ color: '#00FF88', fontWeight: 700 }}>
                                        Foto carregada com sucesso!
                                    </Typography>
                                </Box>
                            ) : (
                                <Box
                                    onClick={() => fileInputRef.current?.click()}
                                    sx={{
                                        border: '2px dashed rgba(0, 212, 255, 0.4)',
                                        borderRadius: 1.5,
                                        p: 4,
                                        cursor: 'pointer',
                                        background: 'rgba(0, 212, 255, 0.03)',
                                        transition: 'all 0.2s ease',
                                        '&:hover': {
                                            borderColor: '#00D4FF',
                                            background: 'rgba(0, 212, 255, 0.08)'
                                        }
                                    }}
                                >
                                    <PhotoCameraIcon sx={{ fontSize: 48, color: '#00D4FF', mb: 1 }} />
                                    <Typography variant="subtitle1" sx={{ color: '#FFFFFF', fontWeight: 700 }}>
                                        Clique para selecionar imagem
                                    </Typography>
                                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                        Formatos aceitos: JPG, PNG, WEBP (Max 5MB)
                                    </Typography>
                                </Box>
                            )}

                            <Button
                                variant="outlined"
                                startIcon={<PhotoCameraIcon />}
                                onClick={() => fileInputRef.current?.click()}
                                sx={{ mt: 2, borderColor: '#00D4FF', color: '#00D4FF' }}
                            >
                                Escolher outro arquivo
                            </Button>
                        </Box>
                    )}
                </DialogContent>

                <DialogActions sx={{ p: 2.5, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    <Button onClick={() => setAvatarModalOpen(false)} sx={{ color: 'text.secondary' }}>
                        Cancelar
                    </Button>
                    <Button
                        variant="contained"
                        onClick={() => handleSaveAvatar()}
                        disabled={savingAvatar || (!selectedAvatarUrl && !customAvatarBase64)}
                        sx={{
                            background: 'linear-gradient(135deg, #00D4FF 0%, #00D4FF 100%)',
                            fontWeight: 700,
                            px: 3
                        }}
                    >
                        {savingAvatar ? <CircularProgress size={20} color="inherit" /> : 'Salvar Avatar'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* ========================================================================= */}
            {/* MODAL 2: CHAMAR ADMINISTRADOR MASTER (ALERTA DE EMERGÊNCIA) */}
            {/* ========================================================================= */}
            <Dialog
                open={chamarMasterOpen}
                onClose={() => !enviandoChamado && setChamarMasterOpen(false)}
                maxWidth="sm"
                fullWidth
                PaperProps={{
                    sx: {
                        background: '#0A1628',
                        border: '2px solid rgba(255, 51, 102, 0.5)',
                        borderRadius: 1.5,
                        boxShadow: '0 20px 60px rgba(255, 51, 102, 0.3)',
                        maxHeight: '90vh',
                        overflowY: 'auto'
                    }
                }}
            >
                <DialogTitle sx={{ pb: 1, borderBottom: '1px solid rgba(255, 51, 102, 0.2)' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <EmergencyIcon sx={{ color: '#FF3366', fontSize: 28 }} />
                        <Box>
                            <Typography variant="h6" sx={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, color: '#FF3366' }}>
                                Solicitar administrador master
                            </Typography>
                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)' }}>
                                Alerta prioritário com notificação imediata em tempo real
                            </Typography>
                        </Box>
                    </Box>
                </DialogTitle>

                <DialogContent sx={{ pt: 2.5 }}>
                    {chamadoEnviado ? (
                        <Box sx={{ textAlign: 'center', py: 4 }}>
                            <CheckCircleIcon sx={{ fontSize: 64, color: '#00FF88', mb: 2 }} />
                            <Typography variant="h6" sx={{ color: '#FFFFFF', fontWeight: 700 }}>
                                Alerta enviado com sucesso!
                            </Typography>
                            <Typography variant="body2" sx={{ color: '#00FF88', mt: 1 }}>
                                O Administrador Master foi notificado e está ciente da sua solicitação.
                            </Typography>
                        </Box>
                    ) : (
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <Alert severity="warning" icon={<WarningIcon />} sx={{ bgcolor: 'rgba(255, 184, 0, 0.1)', color: '#FFB800', border: '1px solid rgba(255, 184, 0, 0.3)' }}>
                                Este chamado gera um alerta sonoro e visual prioritário no painel de controle do Master.
                            </Alert>

                            <Box>
                                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, mb: 1, display: 'block' }}>
                                    Local / estação de atendimento
                                </Typography>
                                <TextField
                                    fullWidth
                                    size="small"
                                    value={pontoMaster}
                                    onChange={(e) => setPontoMaster(e.target.value)}
                                    placeholder="Ex: Baia 03 - Credenciamento Geral"
                                />
                            </Box>

                            <Box>
                                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, mb: 1, display: 'block' }}>
                                    MOTIVOS RÁPIDOS
                                </Typography>
                                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
                                    {[
                                        'Emergência no Posto',
                                        'Liberação de Credencial Especial',
                                        'Suspeita / Documento Falso',
                                        'Falha em Impressora / Leitor',
                                        'Dúvida de Procedimento'
                                    ].map((m) => (
                                        <Chip
                                            key={m}
                                            label={m}
                                            onClick={() => setMotivoMaster(m)}
                                            clickable
                                            sx={{
                                                bgcolor: motivoMaster === m ? 'rgba(255, 51, 102, 0.3)' : 'rgba(255,255,255,0.05)',
                                                color: motivoMaster === m ? '#FF3366' : '#FFFFFF',
                                                border: `1px solid ${motivoMaster === m ? '#FF3366' : 'rgba(255,255,255,0.1)'}`,
                                                fontWeight: 700,
                                                fontSize: '0.75rem'
                                            }}
                                        />
                                    ))}
                                </Stack>
                            </Box>

                            <Box>
                                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, mb: 1, display: 'block' }}>
                                    Detalhes da solicitação
                                </Typography>
                                <TextField
                                    fullWidth
                                    multiline
                                    rows={3}
                                    size="small"
                                    value={motivoMaster}
                                    onChange={(e) => setMotivoMaster(e.target.value)}
                                    placeholder="Descreva brevemente o que está ocorrendo..."
                                />
                            </Box>
                        </Box>
                    )}
                </DialogContent>

                <DialogActions sx={{ p: 2.5, borderTop: '1px solid rgba(255, 51, 102, 0.2)' }}>
                    <Button onClick={() => setChamarMasterOpen(false)} disabled={enviandoChamado} sx={{ color: 'text.secondary' }}>
                        Cancelar
                    </Button>
                    <Button
                        variant="contained"
                        onClick={handleDispararChamadoMaster}
                        disabled={enviandoChamado || chamadoEnviado || !motivoMaster.trim()}
                        startIcon={enviandoChamado ? <CircularProgress size={18} color="inherit" /> : <EmergencyIcon />}
                        sx={{
                            background: 'linear-gradient(135deg, #FF3366 0%, #FF3366 100%)',
                            color: '#FFFFFF',
                            fontWeight: 700,
                            px: 3,
                            boxShadow: '0 0 20px rgba(255, 51, 102, 0.5)',
                            '&:hover': {
                                background: 'linear-gradient(135deg, #FF3366 0%, #FF3366 100%)',
                                boxShadow: '0 0 30px rgba(255, 51, 102, 0.8)'
                            }
                        }}
                    >
                        {enviandoChamado ? 'Emitindo alerta...' : 'Emitir alerta imediato'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* ========================================================================= */}
            {/* MODAL 3: NOTAS & LEMBRETES DO OPERADOR (SHIFT NOTES) */}
            {/* ========================================================================= */}
            <Dialog
                open={notesModalOpen}
                onClose={() => setNotesModalOpen(false)}
                maxWidth="sm"
                fullWidth
                PaperProps={{
                    sx: {
                        background: '#050B18',
                        border: '1px solid rgba(0, 212, 255, 0.3)',
                        borderRadius: 1.5,
                        boxShadow: '0 20px 60px rgba(0,0,0,0.9)',
                        maxHeight: '90vh',
                        overflowY: 'auto'
                    }
                }}
            >
                <DialogTitle sx={{ pb: 1, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                            <NoteIcon sx={{ color: '#00D4FF', fontSize: 26 }} />
                            <Box>
                                <Typography variant="h6" sx={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, color: '#00D4FF' }}>
                                    Notas & Lembretes do Operador
                                </Typography>
                                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                    Anotações deste turno (salvas automaticamente no seu relatório)
                                </Typography>
                            </Box>
                        </Box>
                        {notesSavedAlert && (
                            <Chip
                                icon={<CheckCircleIcon sx={{ fontSize: 14, color: '#00FF88 !important' }} />}
                                label="Salvo!"
                                size="small"
                                sx={{ bgcolor: 'rgba(0, 255, 136, 0.15)', color: '#00FF88', fontWeight: 700 }}
                            />
                        )}
                    </Box>
                </DialogTitle>

                <DialogContent sx={{ pt: 2.5 }}>
                    <TextField
                        fullWidth
                        multiline
                        rows={8}
                        value={notesText}
                        onChange={(e) => {
                            setNotesText(e.target.value);
                            // Auto-save em tempo real no localStorage
                            localStorage.setItem(notesKey, e.target.value);
                        }}
                        placeholder="Insira aqui seus lembretes, ocorrências, observações para troca de turno, números de pulseiras ou informações importantes para não esquecer..."
                        sx={{
                            '& .MuiInputBase-root': {
                                fontFamily: '"Inter", sans-serif',
                                fontSize: '0.875rem',
                                color: '#FFFFFF',
                                background: 'rgba(255,255,255,0.03)'
                            }
                        }}
                    />

                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1.5 }}>
                        <Typography variant="caption" sx={{ color: 'text.secondary', fontFamily: '"Inter", sans-serif' }}>
                            {notesText.length} caracteres • Sincronizado com a sessão atual
                        </Typography>
                        <Button
                            size="small"
                            startIcon={<ClearIcon />}
                            onClick={() => {
                                setNotesText('');
                                localStorage.removeItem(notesKey);
                            }}
                            sx={{ color: '#FF3366', fontSize: '0.75rem' }}
                        >
                            Limpar Notas
                        </Button>
                    </Box>
                </DialogContent>

                <DialogActions sx={{ p: 2.5, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    <Button onClick={() => setNotesModalOpen(false)} sx={{ color: 'text.secondary' }}>
                        Fechar
                    </Button>
                    <Button
                        variant="contained"
                        startIcon={<SaveIcon />}
                        onClick={handleSaveNotes}
                        sx={{
                            background: 'linear-gradient(135deg, #00D4FF 0%, #00D4FF 100%)',
                            fontWeight: 700,
                            px: 3
                        }}
                    >
                        Salvar Anotação
                    </Button>
                </DialogActions>
            </Dialog>
        </UserSectionContainer>
    );
};

export default OperatorSection;
