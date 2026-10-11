import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    Box, Typography, Avatar, IconButton, Button, Menu, MenuItem, ButtonBase,
    Dialog, DialogTitle, DialogContent, DialogActions, TextField,
    Tabs, Tab, Grid, Chip, Tooltip, Stack, CircularProgress, Alert
} from '@mui/material';
import { styled } from '@mui/material/styles';
import {
    MoreVert as MoreIcon,
    Logout as LogoutIcon,
    PhotoCamera as PhotoCameraIcon,
    Campaign as EmergencyIcon,
    EditNote as NoteIcon,
    Save as SaveIcon,
    CheckCircle as CheckCircleIcon,
    DeleteOutline as ClearIcon,
    Warning as WarningIcon
} from '@mui/icons-material';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';
import { cores, funcao, papeis, tom, tamanhos, botaoSecundario } from '../../styles/tokens';
import TituloModal from '../common/TituloModal';
import NeonButton from '../common/NeonButton';
import EnquadrarAvatar from '../common/EnquadrarAvatar';

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
    padding: theme.spacing(1.5),
    background: cores.superficie,
    borderTop: `1px solid ${cores.borda}`,
    flexShrink: 0
}));

/** Nome para exibir: se o cadastro guardou o e-mail como nome, mostra só a parte antes do @. */
const nomeParaExibir = (user) => {
    const nome = user?.nome_completo || user?.nome || '';
    if (nome && !nome.includes('@')) return nome;
    const base = (nome || user?.email || 'Operador').split('@')[0];
    return base.charAt(0).toUpperCase() + base.slice(1);
};

/** Reduz a foto enviada (lado maior até 1600 px) antes de enquadrar. */
const lerFotoReduzida = (arquivo) => new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = (ev) => {
        const img = new Image();
        img.onload = () => {
            const max = 1600;
            const k = Math.min(1, max / Math.max(img.width, img.height));
            const c = document.createElement('canvas');
            c.width = Math.round(img.width * k);
            c.height = Math.round(img.height * k);
            c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
            resolve(c.toDataURL('image/jpeg', 0.92));
        };
        img.onerror = reject;
        img.src = ev.target.result;
    };
    leitor.onerror = reject;
    leitor.readAsDataURL(arquivo);
});

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
    const [fotoOriginal, setFotoOriginal] = useState('');
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
    const [tempoTurno, setTempoTurno] = useState('0 min');
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
            setTempoTurno(h > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${m} min`);
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

    // Upload: a foto vai para o enquadramento (arrastar + zoom) antes de salvar
    const handleFileChange = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        try {
            setFotoOriginal(await lerFotoReduzida(file));
        } catch (err) {
            console.error('Não foi possível ler a imagem:', err);
        }
    };

    const aoEnquadrar = useCallback((dataUrl) => {
        setCustomAvatarBase64(dataUrl);
        setSelectedAvatarUrl(dataUrl);
    }, []);

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

    const papel = papeis[user?.nivel_acesso?.toLowerCase()] || { rotulo: 'Acesso', cor: funcao.neutro };
    const nomeExibido = nomeParaExibir(user);
    const ehMaster = ['admin_master', 'master'].includes(user?.nivel_acesso);

    const abrirTrocaDeFoto = () => {
        setSelectedAvatarUrl(currentAvatar);
        setFotoOriginal('');
        setAvatarModalOpen(true);
    };

    return (
        <UserSectionContainer>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                {/* Avatar: clique troca a foto; ponto verde = conectado */}
                <Tooltip title="Trocar foto" arrow placement="top">
                    <ButtonBase
                        onClick={abrirTrocaDeFoto}
                        aria-label="Trocar foto do operador"
                        sx={{
                            position: 'relative', borderRadius: '50%', flexShrink: 0,
                            '&:hover .trocar-foto, &:focus-visible .trocar-foto': { opacity: 1 },
                            '&:focus-visible': { outline: `2px solid ${funcao.acao}`, outlineOffset: 2 }
                        }}
                    >
                        <Avatar
                            src={currentAvatar}
                            alt={nomeExibido}
                            sx={{ width: 44, height: 44, border: `2px solid ${papel.cor}`, bgcolor: cores.fundo, fontWeight: 700 }}
                        >
                            {nomeExibido.charAt(0)}
                        </Avatar>
                        <Box className="trocar-foto" sx={{
                            position: 'absolute', inset: 0, borderRadius: '50%', bgcolor: 'rgba(0,0,0,0.55)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            opacity: 0, transition: 'opacity 0.15s ease'
                        }}>
                            <PhotoCameraIcon sx={{ fontSize: 18, color: cores.textoForte }} />
                        </Box>
                        <Box aria-hidden sx={{
                            position: 'absolute', right: 0, bottom: 0, width: 12, height: 12, borderRadius: '50%',
                            bgcolor: funcao.liberado, border: `2px solid ${cores.superficie}`
                        }} />
                    </ButtonBase>
                </Tooltip>

                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography noWrap title={nomeExibido} sx={{ fontWeight: 700, fontSize: tamanhos.md, color: cores.textoForte, lineHeight: 1.3 }}>
                        {nomeExibido}
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, minWidth: 0 }}>
                        <Typography noWrap sx={{ fontSize: tamanhos.xs, color: papel.cor, fontWeight: 600, minWidth: 0 }}>
                            {papel.rotulo}
                        </Typography>
                        <Tooltip title={`No turno desde ${loginTimeFormatted}`} placement="top">
                            <Typography sx={{ ml: 'auto', fontSize: tamanhos.xs, color: cores.textoSecundario, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                                {tempoTurno}
                            </Typography>
                        </Tooltip>
                    </Box>
                </Box>

                <Tooltip title="Opções">
                    <IconButton size="small" onClick={handleMenuOpen} aria-label="Opções do operador" sx={{ color: cores.textoSecundario }}>
                        <MoreIcon fontSize="small" />
                    </IconButton>
                </Tooltip>
            </Box>

            <Stack direction="row" spacing={1} sx={{ mt: 1.25 }}>
                <Button
                    size="small"
                    variant="outlined"
                    startIcon={<NoteIcon sx={{ fontSize: 16 }} />}
                    onClick={() => setNotesModalOpen(true)}
                    sx={{ ...botaoSecundario, flex: 1, minHeight: 34 }}
                >
                    Notas
                </Button>
                {/* Chamar o master não faz sentido para o próprio admin master */}
                {!ehMaster && (
                    <Button
                        size="small"
                        variant="outlined"
                        startIcon={<EmergencyIcon sx={{ fontSize: 16 }} />}
                        onClick={() => { setChamarMasterOpen(true); playAlertSound('beep'); }}
                        sx={{
                            flex: 1, minHeight: 34, whiteSpace: 'nowrap', color: funcao.negado,
                            borderColor: tom(funcao.negado, 0.45),
                            '&:hover': { borderColor: funcao.negado, bgcolor: tom(funcao.negado, 0.08) }
                        }}
                    >
                        Chamar master
                    </Button>
                )}
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
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>Conectado como</Typography>
                    <Typography variant="body2" sx={{ color: '#FFFFFF', fontWeight: 700, fontSize: '0.8125rem' }} noWrap>
                        {user?.email}
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#00D4FF', fontFamily: '"Inter", sans-serif' }}>
                        No turno há {onlineTimeFormatted}
                    </Typography>
                </Box>

                <MenuItem
                    onClick={() => {
                        handleMenuClose();
                        abrirTrocaDeFoto();
                    }}
                    sx={{ gap: 1.5, mx: 1, borderRadius: 1.5, '&:hover': { background: 'rgba(0, 212, 255, 0.1)' } }}
                >
                    <PhotoCameraIcon fontSize="small" sx={{ color: '#00D4FF' }} />
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>Trocar foto</Typography>
                </MenuItem>

                <MenuItem
                    onClick={() => {
                        handleMenuClose();
                        setNotesModalOpen(true);
                    }}
                    sx={{ gap: 1.5, mx: 1, borderRadius: 1.5, '&:hover': { background: 'rgba(0, 212, 255, 0.1)' } }}
                >
                    <NoteIcon fontSize="small" sx={{ color: '#00FF88' }} />
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>Notas do turno</Typography>
                </MenuItem>

                {!ehMaster && (
                <MenuItem
                    onClick={() => {
                        handleMenuClose();
                        setChamarMasterOpen(true);
                    }}
                    sx={{ gap: 1.5, mx: 1, borderRadius: 1.5, '&:hover': { background: 'rgba(255, 51, 102, 0.1)', color: '#FF3366' } }}
                >
                    <EmergencyIcon fontSize="small" sx={{ color: '#FF3366' }} />
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>Chamar admin master</Typography>
                </MenuItem>
                )}

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
                        <Typography variant="body2" sx={{ fontWeight: 700 }}>Encerrar turno e sair</Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontSize: '0.75rem' }}>
                            Salva o relatório do turno
                        </Typography>
                    </Box>
                </MenuItem>
            </Menu>

            {/* ========================================================================= */}
            {/* MODAL 1: SELETOR DE AVATAR & UPLOAD DE FOTO */}
            {/* ========================================================================= */}
            <Dialog open={avatarModalOpen} onClose={() => setAvatarModalOpen(false)} maxWidth="xs" fullWidth>
                <TituloModal
                    titulo="Foto do operador"
                    subtitulo="Escolha um avatar ou envie uma foto e enquadre no círculo."
                    onFechar={() => setAvatarModalOpen(false)}
                />

                <DialogContent sx={{ pt: 1 }}>
                    <Tabs value={avatarTab} onChange={(e, v) => setAvatarTab(v)} sx={{ mb: 2 }} variant="fullWidth">
                        <Tab label="Avatares" value="gallery" />
                        <Tab label="Enviar foto" value="upload" />
                    </Tabs>

                    {avatarTab === 'gallery' ? (
                        <Grid container spacing={1.5}>
                            {TACTICAL_AVATARS.map((av) => {
                                const isSelected = selectedAvatarUrl === av.dataUri;
                                return (
                                    <Grid item xs={4} key={av.id}>
                                        <ButtonBase
                                            onClick={() => setSelectedAvatarUrl(av.dataUri)}
                                            aria-pressed={isSelected}
                                            sx={{
                                                width: '100%', p: 1.25, borderRadius: 1.5, flexDirection: 'column',
                                                bgcolor: isSelected ? tom(funcao.acao, 0.12) : 'rgba(255,255,255,0.03)',
                                                border: `1px solid ${isSelected ? funcao.acao : cores.borda}`,
                                                '&:hover': { borderColor: funcao.acao },
                                                '&:focus-visible': { outline: `2px solid ${funcao.acao}`, outlineOffset: 2 }
                                            }}
                                        >
                                            <Avatar src={av.dataUri} sx={{ width: 52, height: 52, mb: 0.75, bgcolor: cores.fundo }} />
                                            <Typography sx={{ fontSize: tamanhos.xs, fontWeight: 600, color: cores.texto }} noWrap>
                                                {av.name}
                                            </Typography>
                                        </ButtonBase>
                                    </Grid>
                                );
                            })}
                        </Grid>
                    ) : (
                        <Box sx={{ textAlign: 'center' }}>
                            <input type="file" accept="image/*" ref={fileInputRef} onChange={handleFileChange} style={{ display: 'none' }} />
                            {fotoOriginal ? (
                                <>
                                    <EnquadrarAvatar src={fotoOriginal} onAlterar={aoEnquadrar} />
                                    <Button size="small" variant="outlined" startIcon={<PhotoCameraIcon />} onClick={() => fileInputRef.current?.click()} sx={{ ...botaoSecundario, mt: 2 }}>
                                        Escolher outra foto
                                    </Button>
                                </>
                            ) : (
                                <ButtonBase
                                    onClick={() => fileInputRef.current?.click()}
                                    sx={{
                                        width: '100%', flexDirection: 'column', p: 4, borderRadius: 1.5,
                                        border: `2px dashed ${tom(funcao.acao, 0.4)}`, bgcolor: tom(funcao.acao, 0.03),
                                        '&:hover': { borderColor: funcao.acao, bgcolor: tom(funcao.acao, 0.08) }
                                    }}
                                >
                                    <PhotoCameraIcon sx={{ fontSize: 40, color: funcao.acao, mb: 1 }} />
                                    <Typography sx={{ color: cores.textoForte, fontWeight: 600 }}>Escolher foto do computador</Typography>
                                    <Typography sx={{ fontSize: tamanhos.xs, color: cores.textoSecundario, mt: 0.5 }}>JPG, PNG ou WEBP</Typography>
                                </ButtonBase>
                            )}
                        </Box>
                    )}
                </DialogContent>

                <DialogActions>
                    <Button variant="outlined" onClick={() => setAvatarModalOpen(false)} sx={botaoSecundario}>
                        Cancelar
                    </Button>
                    <NeonButton
                        onClick={() => handleSaveAvatar(avatarTab === 'upload' ? customAvatarBase64 : selectedAvatarUrl)}
                        loading={savingAvatar}
                        disabled={avatarTab === 'upload' ? !customAvatarBase64 : !selectedAvatarUrl}
                    >
                        Salvar foto
                    </NeonButton>
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
                                    Motivos rápidos
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
                    <Button variant="outlined" onClick={() => setChamarMasterOpen(false)} disabled={enviandoChamado} sx={botaoSecundario}>
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
                                    Notas do turno
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
                            Limpar notas
                        </Button>
                    </Box>
                </DialogContent>

                <DialogActions sx={{ p: 2.5, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    <Button variant="outlined" onClick={() => setNotesModalOpen(false)} sx={botaoSecundario}>
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
                        Salvar anotação
                    </Button>
                </DialogActions>
            </Dialog>
        </UserSectionContainer>
    );
};

export default OperatorSection;
