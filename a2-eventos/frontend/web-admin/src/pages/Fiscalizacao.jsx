import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import {
    Box, Typography, Grid, Stack, TextField, Avatar,
    CircularProgress, Chip, IconButton, Tooltip, FormControl,
    InputLabel, Select, MenuItem, Divider, Paper, Alert
} from '@mui/material';
import {
    QrCodeScanner as QrIcon,
    CheckCircle as SuccessIcon,
    Cancel as ErrorIcon,
    Warning as WarningIcon,
    Security as SecurityIcon,
    Place as AreaIcon,
    Badge as BadgeIcon,
    CorporateFare as CompanyIcon,
    History as HistoryIcon,
    Fullscreen as FullscreenIcon,
    FullscreenExit as FullscreenExitIcon,
    VolumeUp as SoundOnIcon,
    VolumeOff as SoundOffIcon,
    CameraAlt as CameraIcon,
    Close as CloseIcon
} from '@mui/icons-material';
import PageHeader from '../components/common/PageHeader';
import GlassCard from '../components/common/GlassCard';
import NeonButton from '../components/common/NeonButton';
import UniversalPulseiraInput from '../components/common/UniversalPulseiraInput';
import AuthorizedAreasChips from '../components/common/AuthorizedAreasChips';
import api from '../services/api';
import { useSnackbar } from 'notistack';

// Sons sintetizados via Web Audio API (sem dependência de arquivos mp3)
const playFeedbackSound = (type, soundEnabled = true) => {
    if (!soundEnabled) return;
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (type === 'liberado') {
            // Bipe agudo duplo harmônico (587Hz -> 880Hz)
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
            osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.08); // A5
            gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.25);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.25);
        } else if (type === 'negado') {
            // Buzzer grave de erro (150Hz)
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sawtooth';
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.frequency.setValueAtTime(150, audioCtx.currentTime);
            gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.4);
        }
    } catch (_) {}
};

const Fiscalizacao = () => {
    const { enqueueSnackbar } = useSnackbar();

    // Evento e Áreas
    const [areas, setAreas] = useState([]);
    const [selectedAreaId, setSelectedAreaId] = useState(() => {
        return localStorage.getItem('fiscal_area_id') || '';
    });

    // Leitura e Fiscalização
    const [codigoInput, setCodigoInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [resultado, setResultado] = useState(null);
    const [soundEnabled, setSoundEnabled] = useState(true);
    const [isKiosk, setIsKiosk] = useState(false);

    // Câmera QR Code
    const [cameraActive, setCameraActive] = useState(false);
    const html5QrCodeRef = useRef(null);
    const SCANNER_ID = 'fiscalizacao-qr-reader';

    // Métricas da Sessão
    const [historico, setHistorico] = useState([]);
    const [stats, setStats] = useState({ total: 0, liberados: 0, negados: 0 });

    const activeEventoId = localStorage.getItem('active_evento_id');

    // Carregar áreas do evento
    useEffect(() => {
        const carregarAreas = async () => {
            try {
                const resp = await api.get('/config/areas', { params: { evento_id: activeEventoId } });
                const lista = resp.data?.data || [];
                setAreas(lista);
                if (!selectedAreaId && lista.length > 0) {
                    setSelectedAreaId(lista[0].id);
                    localStorage.setItem('fiscal_area_id', lista[0].id);
                }
            } catch (err) {
                console.warn('Erro ao carregar áreas:', err.message);
            }
        };
        carregarAreas();
    }, [activeEventoId]);

    const handleAreaChange = (e) => {
        const val = e.target.value;
        setSelectedAreaId(val);
        localStorage.setItem('fiscal_area_id', val);
    };

    // Processar Código (Leitor USB, Digitação ou QR Câmera)
    const handleProcessarCodigo = useCallback(async (codigoBruto, origem = 'scanner') => {
        const codigoLimpo = (codigoBruto || '').trim();
        if (!codigoLimpo || loading) return;

        try {
            setLoading(true);
            const resp = await api.post('/checkin/fiscalizar', {
                codigo: codigoLimpo,
                area_id: selectedAreaId || null,
                metodo: origem
            });

            const data = resp.data?.data;
            if (data) {
                setResultado(data);

                // Som de feedback
                if (data.autorizado) {
                    playFeedbackSound('liberado', soundEnabled);
                    setStats(prev => ({ ...prev, total: prev.total + 1, liberados: prev.liberados + 1 }));
                } else {
                    playFeedbackSound('negado', soundEnabled);
                    setStats(prev => ({ ...prev, total: prev.total + 1, negados: prev.negados + 1 }));
                }

                // Adicionar ao histórico recente
                setHistorico(prev => [
                    {
                        id: Date.now(),
                        hora: new Date().toLocaleTimeString('pt-BR'),
                        codigo: codigoLimpo,
                        nome: data.pessoa?.nome_completo || 'Não identificado',
                        empresa: data.pessoa?.empresa_nome || '—',
                        autorizado: data.autorizado,
                        motivo: data.mensagem
                    },
                    ...prev.slice(0, 9)
                ]);
            }
        } catch (error) {
            enqueueSnackbar(error.response?.data?.error || 'Erro ao processar fiscalização.', { variant: 'error' });
            playFeedbackSound('negado', soundEnabled);
        } finally {
            setLoading(false);
            setCodigoInput('');
        }
    }, [selectedAreaId, loading, soundEnabled, enqueueSnackbar]);

    // Inicialização da Câmera QR
    useEffect(() => {
        if (cameraActive) {
            const qrScanner = new Html5Qrcode(SCANNER_ID);
            html5QrCodeRef.current = qrScanner;

            qrScanner.start(
                { facingMode: 'environment' },
                { fps: 10, qrbox: { width: 250, height: 250 } },
                (decodedText) => {
                    handleProcessarCodigo(decodedText, 'camera_qr');
                },
                () => {}
            ).catch(err => {
                enqueueSnackbar(`Câmera inacessível: ${err.message}`, { variant: 'warning' });
                setCameraActive(false);
            });

            return () => {
                if (qrScanner.isScanning) {
                    qrScanner.stop().catch(() => {}).finally(() => qrScanner.clear());
                }
            };
        }
    }, [cameraActive, handleProcessarCodigo, enqueueSnackbar]);

    const areaAtual = areas.find(a => a.id === selectedAreaId);

    return (
        <Box sx={{ p: { xs: 2, md: 4 } }}>
            {/* Header da Página */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 2 }}>
                <PageHeader
                    title="Fiscalização de Áreas & Controle de Acesso"
                    subtitle="Posto de fiscalização com validação instantânea de pulseira, áreas autorizadas e conferência facial do titular."
                    breadcrumbs={[{ text: 'Operação' }, { text: 'Fiscalização' }]}
                />

                <Stack direction="row" spacing={1.5} alignItems="center">
                    <Tooltip title={soundEnabled ? 'Silenciar avisos sonoros' : 'Ativar avisos sonoros'}>
                        <IconButton
                            onClick={() => setSoundEnabled(!soundEnabled)}
                            sx={{ color: soundEnabled ? '#00FF88' : '#888', bgcolor: 'rgba(255,255,255,0.05)' }}
                        >
                            {soundEnabled ? <SoundOnIcon /> : <SoundOffIcon />}
                        </IconButton>
                    </Tooltip>

                    <Tooltip title="Alternar modo Tela Cheia">
                        <IconButton
                            onClick={() => setIsKiosk(!isKiosk)}
                            sx={{ color: '#00D4FF', bgcolor: 'rgba(0,212,255,0.1)' }}
                        >
                            {isKiosk ? <FullscreenExitIcon /> : <FullscreenIcon />}
                        </IconButton>
                    </Tooltip>
                </Stack>
            </Box>

            {/* Painel Superior: Seletor de Área & Contadores */}
            <Grid container spacing={3} sx={{ mb: 3.5 }}>
                {/* Seletor do Posto / Área */}
                <Grid item xs={12} md={6}>
                    <GlassCard sx={{ p: 2.5, display: 'flex', alignItems: 'center', gap: 2 }}>
                        <AreaIcon sx={{ color: '#00D4FF', fontSize: 32 }} />
                        <FormControl fullWidth size="small">
                            <InputLabel sx={{ color: '#00D4FF', fontWeight: 700 }}>
                                ÁREA SOB SEU CONTROLE (POSTO DE FISCALIZAÇÃO)
                            </InputLabel>
                            <Select
                                value={selectedAreaId}
                                label="ÁREA SOB SEU CONTROLE (POSTO DE FISCALIZAÇÃO)"
                                onChange={handleAreaChange}
                                sx={{
                                    bgcolor: 'rgba(0,0,0,0.4)',
                                    color: '#fff',
                                    fontWeight: 800,
                                    borderRadius: 2,
                                    '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(0, 212, 255, 0.4)' }
                                }}
                            >
                                <MenuItem value=""><em>Todas as Áreas (Fiscalização Geral)</em></MenuItem>
                                {areas.map(a => (
                                    <MenuItem key={a.id} value={a.id}>
                                        🔒 {a.nome_area}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </GlassCard>
                </Grid>

                {/* Métricas da Sessão */}
                <Grid item xs={12} md={6}>
                    <Grid container spacing={2}>
                        <Grid item xs={4}>
                            <GlassCard sx={{ p: 1.8, textAlign: 'center', borderBottom: '3px solid #00D4FF' }}>
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 700 }}>
                                    TOTAL LIDOS
                                </Typography>
                                <Typography variant="h5" sx={{ color: '#00D4FF', fontWeight: 900 }}>
                                    {stats.total}
                                </Typography>
                            </GlassCard>
                        </Grid>

                        <Grid item xs={4}>
                            <GlassCard sx={{ p: 1.8, textAlign: 'center', borderBottom: '3px solid #00FF88' }}>
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 700 }}>
                                    LIBERADOS
                                </Typography>
                                <Typography variant="h5" sx={{ color: '#00FF88', fontWeight: 900 }}>
                                    {stats.liberados}
                                </Typography>
                            </GlassCard>
                        </Grid>

                        <Grid item xs={4}>
                            <GlassCard sx={{ p: 1.8, textAlign: 'center', borderBottom: '3px solid #FF3366' }}>
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 700 }}>
                                    NEGADOS
                                </Typography>
                                <Typography variant="h5" sx={{ color: '#FF3366', fontWeight: 900 }}>
                                    {stats.negados}
                                </Typography>
                            </GlassCard>
                        </Grid>
                    </Grid>
                </Grid>
            </Grid>

            {/* Layout Principal: Coluna Central de Decisão + Barra Lateral de Histórico */}
            <Grid container spacing={3.5}>
                {/* Coluna Principal: Entrada de Código & Card de Decisão */}
                <Grid item xs={12} lg={8}>
                    {/* Barra de Leitura Universal */}
                    <GlassCard sx={{ p: 2.5, mb: 3 }}>
                        <Grid container spacing={2} alignItems="center">
                            <Grid item xs={12} sm={9}>
                                <UniversalPulseiraInput
                                    value={codigoInput}
                                    onChange={setCodigoInput}
                                    onConfirm={(val, origem) => handleProcessarCodigo(val, origem)}
                                    loading={loading}
                                    autoFocus={true}
                                />
                            </Grid>

                            <Grid item xs={12} sm={3}>
                                <NeonButton
                                    fullWidth
                                    neonColor={cameraActive ? '#FF3366' : '#00D4FF'}
                                    onClick={() => setCameraActive(!cameraActive)}
                                    sx={{ height: 56, fontSize: '0.85rem' }}
                                >
                                    {cameraActive ? <CloseIcon sx={{ mr: 1 }} /> : <CameraIcon sx={{ mr: 1 }} />}
                                    {cameraActive ? 'Fechar Cam' : 'Scan QR Cam'}
                                </NeonButton>
                            </Grid>
                        </Grid>

                        {/* Visualizador de Câmera Embutido se ativo */}
                        {cameraActive && (
                            <Box sx={{ mt: 2.5, p: 2, bgcolor: 'rgba(0,0,0,0.6)', borderRadius: 2, textAlign: 'center' }}>
                                <Typography variant="caption" sx={{ color: '#00D4FF', display: 'block', mb: 1, fontWeight: 700 }}>
                                    Aponte a câmera para o QR Code da pulseira ou crachá
                                </Typography>
                                <div id={SCANNER_ID} style={{ width: '100%', maxWidth: '380px', margin: '0 auto', borderRadius: 8, overflow: 'hidden' }} />
                            </Box>
                        )}
                    </GlassCard>

                    {/* CARD GIGANTE DE DECISÃO VISUAL */}
                    {resultado ? (
                        <GlassCard
                            sx={{
                                p: { xs: 3, md: 4 },
                                border: '3px solid',
                                borderColor: resultado.autorizado ? '#00FF88' : '#FF3366',
                                boxShadow: resultado.autorizado ? '0 0 40px rgba(0,255,136,0.25)' : '0 0 40px rgba(255,51,102,0.25)',
                                background: resultado.autorizado
                                    ? 'linear-gradient(135deg, rgba(0,255,136,0.06) 0%, rgba(10,25,20,0.95) 100%)'
                                    : 'linear-gradient(135deg, rgba(255,51,102,0.06) 0%, rgba(25,10,15,0.95) 100%)',
                                borderRadius: 4,
                                position: 'relative',
                                overflow: 'hidden'
                            }}
                        >
                            {/* Barra de Status Grande */}
                            <Box sx={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 1.5,
                                py: 1.8,
                                px: 3,
                                mb: 3.5,
                                borderRadius: 3,
                                bgcolor: resultado.autorizado ? 'rgba(0,255,136,0.18)' : 'rgba(255,51,102,0.18)',
                                border: '1px solid',
                                borderColor: resultado.autorizado ? '#00FF88' : '#FF3366'
                            }}>
                                {resultado.autorizado ? (
                                    <SuccessIcon sx={{ color: '#00FF88', fontSize: 36 }} />
                                ) : (
                                    <ErrorIcon sx={{ color: '#FF3366', fontSize: 36 }} />
                                )}
                                <Typography variant="h5" sx={{
                                    fontWeight: 900,
                                    letterSpacing: '1px',
                                    color: resultado.autorizado ? '#00FF88' : '#FF3366',
                                    fontFamily: '"Orbitron", sans-serif'
                                }}>
                                    {resultado.mensagem}
                                </Typography>
                            </Box>

                            {/* Conteúdo do Titular (se encontrado) */}
                            {resultado.pessoa ? (
                                <Grid container spacing={3.5} alignItems="center">
                                    {/* Foto do Titular com Moldura de Conferência Facial */}
                                    <Grid item xs={12} sm={4} sx={{ textAlign: 'center' }}>
                                        <Avatar
                                            src={resultado.pessoa.foto_url}
                                            sx={{
                                                width: 170,
                                                height: 170,
                                                mx: 'auto',
                                                bgcolor: resultado.autorizado ? '#00FF88' : '#FF3366',
                                                fontSize: '3.5rem',
                                                fontWeight: 900,
                                                border: '4px solid',
                                                borderColor: resultado.autorizado ? '#00FF88' : '#FF3366',
                                                boxShadow: resultado.autorizado
                                                    ? '0 0 30px rgba(0,255,136,0.3)'
                                                    : '0 0 30px rgba(255,51,102,0.3)'
                                            }}
                                        >
                                            {resultado.pessoa.nome_completo?.[0]}
                                        </Avatar>
                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', display: 'block', mt: 1, fontWeight: 700 }}>
                                            CONFERÊNCIA FACIAL OBRIGATÓRIA
                                        </Typography>
                                    </Grid>

                                    {/* Dados do Colaborador */}
                                    <Grid item xs={12} sm={8}>
                                        <Typography variant="h4" sx={{ color: '#fff', fontWeight: 900, lineHeight: 1.2 }}>
                                            {resultado.pessoa.nome_completo}
                                        </Typography>

                                        <Stack spacing={1} sx={{ mt: 2 }}>
                                            <Typography variant="body1" sx={{ color: '#fff', display: 'flex', alignItems: 'center', gap: 1 }}>
                                                <CompanyIcon sx={{ color: '#00D4FF', fontSize: 20 }} />
                                                <b>Empresa:</b> {resultado.pessoa.empresa_nome}
                                            </Typography>
                                            <Typography variant="body1" sx={{ color: '#fff', display: 'flex', alignItems: 'center', gap: 1 }}>
                                                <BadgeIcon sx={{ color: '#00D4FF', fontSize: 20 }} />
                                                <b>Função:</b> {resultado.pessoa.funcao || 'Colaborador'}
                                            </Typography>
                                            <Typography variant="body1" sx={{ color: '#fff', display: 'flex', alignItems: 'center', gap: 1 }}>
                                                <QrIcon sx={{ color: '#00D4FF', fontSize: 20 }} />
                                                <b>Pulseira:</b> {resultado.pessoa.numero_pulseira || 'Sem Pulseira'}
                                            </Typography>
                                        </Stack>

                                        <Divider sx={{ borderColor: 'rgba(255,255,255,0.1)', my: 2 }} />

                                        {/* Áreas Autorizadas */}
                                        <Box>
                                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 800, letterSpacing: '1px', display: 'block', mb: 1 }}>
                                                ÁREAS AUTORIZADAS DESTE TITULAR:
                                            </Typography>
                                            {resultado.pessoa.areas_autorizadas?.length > 0 ? (
                                                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                                    {resultado.pessoa.areas_autorizadas.map(a => {
                                                        const isEstaArea = a.id === selectedAreaId;
                                                        return (
                                                            <Chip
                                                                key={a.id}
                                                                label={a.nome_area}
                                                                size="small"
                                                                sx={{
                                                                    fontWeight: 800,
                                                                    fontSize: '0.75rem',
                                                                    bgcolor: isEstaArea ? '#00FF88' : 'rgba(0,212,255,0.15)',
                                                                    color: isEstaArea ? '#000' : '#00D4FF',
                                                                    border: '1px solid',
                                                                    borderColor: isEstaArea ? '#00FF88' : 'rgba(0,212,255,0.3)'
                                                                }}
                                                            />
                                                        );
                                                    })}
                                                </Stack>
                                            ) : (
                                                <Typography variant="caption" sx={{ color: '#FF3366', fontWeight: 700 }}>
                                                    Nenhuma área restrita vinculada. Apenas portaria geral.
                                                </Typography>
                                            )}
                                        </Box>
                                    </Grid>
                                </Grid>
                            ) : (
                                <Box sx={{ textAlign: 'center', py: 3 }}>
                                    <WarningIcon sx={{ fontSize: 48, color: '#FFAA00', mb: 1 }} />
                                    <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.8)' }}>
                                        Nenhum registro encontrado para este código no evento atual.
                                    </Typography>
                                </Box>
                            )}
                        </GlassCard>
                    ) : (
                        /* Estado Inicial de Espera */
                        <GlassCard sx={{ p: 6, textAlign: 'center', borderRadius: 4 }}>
                            <SecurityIcon sx={{ fontSize: 72, color: '#00D4FF', opacity: 0.4, mb: 2 }} />
                            <Typography variant="h5" sx={{ color: '#fff', fontWeight: 800 }}>
                                POSTO DE FISCALIZAÇÃO PRONTO
                            </Typography>
                            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', mt: 1, maxWidth: 500, mx: 'auto' }}>
                                Bipe o código de barras da pulseira com o leitor USB ou aponte a câmera para o QR Code para validar o acesso imediato a{' '}
                                <b style={{ color: '#00D4FF' }}>{areaAtual ? areaAtual.nome_area : 'todas as áreas'}</b>.
                            </Typography>
                        </GlassCard>
                    )}
                </Grid>

                {/* Coluna Lateral: Histórico de Passagens Recentes */}
                <Grid item xs={12} lg={4}>
                    <GlassCard sx={{ p: 2.5, height: '100%' }}>
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
                            <HistoryIcon sx={{ color: '#00D4FF' }} />
                            <Typography variant="h6" sx={{ color: '#fff', fontWeight: 800, fontSize: '1rem' }}>
                                PASSAGENS RECENTES
                            </Typography>
                        </Stack>

                        {historico.length === 0 ? (
                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', display: 'block', textAlign: 'center', py: 4 }}>
                                Nenhuma leitura realizada nesta sessão ainda.
                            </Typography>
                        ) : (
                            <Stack spacing={1.5}>
                                {historico.map((h) => (
                                    <Box
                                        key={h.id}
                                        sx={{
                                            p: 1.5,
                                            borderRadius: 2,
                                            bgcolor: 'rgba(255,255,255,0.03)',
                                            borderLeft: '4px solid',
                                            borderLeftColor: h.autorizado ? '#00FF88' : '#FF3366',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center'
                                        }}
                                    >
                                        <Box sx={{ overflow: 'hidden', mr: 1 }}>
                                            <Typography variant="body2" sx={{ fontWeight: 800, color: '#fff', noWrap: true }}>
                                                {h.nome}
                                            </Typography>
                                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', display: 'block' }}>
                                                {h.empresa} • Pulseira: {h.codigo}
                                            </Typography>
                                        </Box>
                                        <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                                            <Chip
                                                label={h.autorizado ? 'LIBERADO' : 'NEGADO'}
                                                size="small"
                                                sx={{
                                                    fontSize: '0.65rem',
                                                    fontWeight: 900,
                                                    height: 20,
                                                    bgcolor: h.autorizado ? 'rgba(0,255,136,0.15)' : 'rgba(255,51,102,0.15)',
                                                    color: h.autorizado ? '#00FF88' : '#FF3366'
                                                }}
                                            />
                                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', display: 'block', mt: 0.5 }}>
                                                {h.hora}
                                            </Typography>
                                        </Box>
                                    </Box>
                                ))}
                            </Stack>
                        )}
                    </GlassCard>
                </Grid>
            </Grid>
        </Box>
    );
};

export default Fiscalizacao;
