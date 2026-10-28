import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import {
    Box, Typography, Grid, Stack, TextField, CircularProgress,
    Chip, IconButton, Tooltip, FormControl, InputLabel, Select,
    MenuItem, Divider, Autocomplete, Button, useTheme, useMediaQuery
} from '@mui/material';
import {
    CheckCircle as SuccessIcon,
    Cancel as ErrorIcon,
    Place as AreaIcon,
    Fullscreen as FullscreenIcon,
    FullscreenExit as FullscreenExitIcon,
    VolumeUp as SoundOnIcon,
    VolumeOff as SoundOffIcon,
    CameraAlt as CameraIcon,
    Close as CloseIcon,
    PersonSearch as PersonSearchIcon,
    AccessTime as AccessTimeIcon,
    Badge as BadgeIcon,
    CorporateFare as CompanyIcon,
    Sensors as PulseiraIcon,
    Visibility as ViewDetailsIcon,
    MeetingRoom as PortariaIcon
} from '@mui/icons-material';
import PageHeader from '../components/common/PageHeader';
import GlassCard from '../components/common/GlassCard';
import KpiCard from '../components/common/KpiCard';
import { cores } from '../styles/tokens';
import { FactCheck as KpiFiscalizadosIcon, CheckCircle as KpiLiberadosIcon, Block as KpiNegadosIcon } from '@mui/icons-material';
import NeonButton from '../components/common/NeonButton';
import { UniversalPulseiraInput } from '../components/common/UniversalPulseiraInput';
import PessoaFoto from '../components/common/PessoaFoto';
import FiscalizacaoPessoaModal from '../components/credenciamento/FiscalizacaoPessoaModal';
import api from '../services/api';
import { useSnackbar } from 'notistack';

// Sons sintetizados via Web Audio API (tons discretos e elegantes)
const playFeedbackSound = (type, soundEnabled = true) => {
    if (!soundEnabled) return;
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (type === 'liberado') {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
            osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.08); // A5
            gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.22);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.22);
        } else if (type === 'negado') {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sawtooth';
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.frequency.setValueAtTime(180, audioCtx.currentTime);
            gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.3);
        }
    } catch (_) {
        // Ignora erros de áudio caso o navegador bloqueie autoplay
    }
};

const SCANNER_ID = 'reader-fiscalizacao-qr';

const Fiscalizacao = () => {
    const { enqueueSnackbar } = useSnackbar();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

    // Evento e Áreas
    const [areas, setAreas] = useState([]);
    const [selectedAreaId, setSelectedAreaId] = useState(() => {
        return localStorage.getItem('fiscal_area_id') || '';
    });

    // Leitura e Fiscalização ao Vivo
    const [codigoInput, setCodigoInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [resultado, setResultado] = useState(null);
    const [soundEnabled, setSoundEnabled] = useState(true);
    const [isKiosk, setIsKiosk] = useState(false);

    // Câmera Scanner QR
    const [cameraActive, setCameraActive] = useState(false);
    const html5QrCodeRef = useRef(null);

    // Estatísticas da Sessão de Fiscalização
    const [stats, setStats] = useState({
        total: 0,
        liberados: 0,
        negados: 0
    });

    // Modal de Detalhes da Pessoa (ao clicar na miniatura)
    const [cardPessoaModal, setCardPessoaModal] = useState(null);

    // Busca por Nome (Autocomplete)
    const [buscaNomeInput, setBuscaNomeInput] = useState('');
    const [buscaNomeOptions, setBuscaNomeOptions] = useState([]);
    const [loadingBuscaNome, setLoadingBuscaNome] = useState(false);

    const activeEventoId = localStorage.getItem('active_evento_id');

    // 1. Carregar Áreas do Evento
    const carregarAreas = useCallback(async () => {
        if (!activeEventoId) return;
        try {
            const resp = await api.get('/config/areas', { params: { evento_id: activeEventoId } });
            const list = resp.data?.data || [];
            setAreas(list);

            const savedAreaId = localStorage.getItem('fiscal_area_id');
            const exists = list.some(a => a.id === savedAreaId);
            if (savedAreaId && exists) {
                setSelectedAreaId(savedAreaId);
            } else if (list.length > 0) {
                setSelectedAreaId(list[0].id);
                localStorage.setItem('fiscal_area_id', list[0].id);
            } else {
                setSelectedAreaId('');
            }
        } catch (err) {
            console.warn('Erro ao carregar áreas:', err.message);
        }
    }, [activeEventoId]);

    useEffect(() => {
        carregarAreas();
    }, [carregarAreas]);

    const handleAreaChange = (e) => {
        const val = e.target.value;
        setSelectedAreaId(val);
        localStorage.setItem('fiscal_area_id', val);
    };

    // 2. Processar Fiscalização (por Pulseira, CPF, Barcode ou Busca)
    const handleProcessarCodigo = useCallback(async (codigoBruto, origem = 'scanner') => {
        const codigoLimpo = (codigoBruto || '').trim();
        if (!codigoLimpo || loading) return;

        try {
            setLoading(true);
            const resp = await api.post('/access/fiscalizar', {
                codigo: codigoLimpo,
                area_id: selectedAreaId || null,
                metodo: origem
            });

            const data = resp.data?.data;
            if (data) {
                setResultado(data);

                // Feedback sonoro e métricas operacionais
                if (data.autorizado) {
                    playFeedbackSound('liberado', soundEnabled);
                    setStats(prev => ({ ...prev, total: prev.total + 1, liberados: prev.liberados + 1 }));
                } else {
                    playFeedbackSound('negado', soundEnabled);
                    setStats(prev => ({ ...prev, total: prev.total + 1, negados: prev.negados + 1 }));
                }
            }
        } catch (error) {
            enqueueSnackbar(error.response?.data?.error || 'Erro ao processar fiscalização.', { variant: 'error' });
            playFeedbackSound('negado', soundEnabled);
        } finally {
            setLoading(false);
            setCodigoInput('');
        }
    }, [selectedAreaId, loading, soundEnabled, enqueueSnackbar]);

    // 3. Busca por Nome (Autocomplete)
    useEffect(() => {
        const termo = buscaNomeInput.trim();
        if (termo.length < 2) {
            setBuscaNomeOptions([]);
            return;
        }

        let ativo = true;
        setLoadingBuscaNome(true);

        const timer = setTimeout(async () => {
            try {
                const resp = await api.get('/pessoas/search', {
                    params: { q: termo, evento_id: activeEventoId }
                });
                if (ativo && resp.data?.data) {
                    setBuscaNomeOptions(resp.data.data);
                }
            } catch (err) {
                console.warn('Erro ao pesquisar colaborador:', err.message);
            } finally {
                if (ativo) setLoadingBuscaNome(false);
            }
        }, 300);

        return () => {
            ativo = false;
            clearTimeout(timer);
        };
    }, [buscaNomeInput, activeEventoId]);

    const handleSelectColaboradorNome = (colaborador) => {
        if (!colaborador) return;
        const codigo = colaborador.numero_pulseira || colaborador.cpf || colaborador.nome_completo;
        handleProcessarCodigo(codigo, 'busca_nome');
        setBuscaNomeInput('');
        setBuscaNomeOptions([]);
    };

    // 4. Câmera QR Code
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

    // Formatação de data/hora para visualização rápida no card
    const formatarHora = (isoStr) => {
        if (!isoStr) return null;
        try {
            return new Date(isoStr).toLocaleTimeString('pt-BR', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
        } catch {
            return isoStr;
        }
    };

    return (
        <Box sx={{ p: { xs: 1.5, sm: 2.5, md: 3 }, maxWidth: '100%', overflowX: 'hidden' }}>
            {/* Header da Página */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: { xs: 2, sm: 3 }, flexWrap: 'wrap', gap: 1.5 }}>
                <PageHeader
                    title="Fiscalização de áreas"
                    subtitle="Valide pulseiras e credenciais nas portarias e áreas internas."
                    breadcrumbs={[{ text: 'Operação' }, { text: 'Fiscalização de áreas' }]}
                    sx={{ mb: 0 }}
                />

                <Stack direction="row" spacing={1.25} alignItems="center" flexWrap="wrap">
                    {/* Status do Posto */}
                    <Chip
                        label="Posto ativo"
                        sx={{
                            fontFamily: '"Inter", sans-serif',
                            fontWeight: 700,
                            fontSize: '0.75rem',
                            bgcolor: 'rgba(0, 255, 136, 0.1)',
                            color: '#00FF88',
                            border: '1px solid rgba(0, 255, 136, 0.3)',
                            height: 36,
                            borderRadius: '10px'
                        }}
                    />

                    {/* Controle de Áudio */}
                    <Tooltip title={soundEnabled ? 'Silenciar bipes de áudio' : 'Ativar bipes de áudio'}>
                        <IconButton
                            onClick={() => setSoundEnabled(!soundEnabled)}
                            sx={{
                                color: soundEnabled ? '#00FF88' : '#94A3B8',
                                bgcolor: 'rgba(255,255,255,0.05)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                height: 36,
                                width: 36,
                                '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' }
                            }}
                        >
                            {soundEnabled ? <SoundOnIcon fontSize="small" /> : <SoundOffIcon fontSize="small" />}
                        </IconButton>
                    </Tooltip>

                    {/* Tela Cheia */}
                    <Tooltip title="Alternar modo tela cheia (kiosk)">
                        <IconButton
                            onClick={() => setIsKiosk(!isKiosk)}
                            sx={{
                                color: '#00D4FF',
                                bgcolor: 'rgba(0,212,255,0.08)',
                                border: '1px solid rgba(0,212,255,0.25)',
                                height: 36,
                                width: 36,
                                '&:hover': { bgcolor: 'rgba(0,212,255,0.18)' }
                            }}
                        >
                            {isKiosk ? <FullscreenExitIcon fontSize="small" /> : <FullscreenIcon fontSize="small" />}
                        </IconButton>
                    </Tooltip>
                </Stack>
            </Box>

            {/* Seletor de Posto de Fiscalização + Métricas Operacionais */}
            <Grid container spacing={{ xs: 1.5, sm: 2, md: 2.5 }} sx={{ mb: { xs: 2, sm: 2.5, md: 3 } }}>
                <Grid item xs={12} md={5}>
                    <GlassCard sx={{ p: { xs: 1.5, sm: 2 }, display: 'flex', alignItems: 'center', gap: 1.5, height: '100%' }}>
                        <AreaIcon sx={{ color: '#00D4FF', fontSize: { xs: 24, sm: 32 } }} />
                        <FormControl fullWidth size="small">
                            <InputLabel sx={{ color: '#00D4FF', fontWeight: 700, fontFamily: '"Space Grotesk", sans-serif', fontSize: { xs: '0.75rem', sm: '0.875rem' } }}>
                                POSTO DE FISCALIZAÇÃO
                            </InputLabel>
                            <Select
                                value={areas.some(a => a.id === selectedAreaId) ? selectedAreaId : ''}
                                label="Posto de fiscalização"
                                onChange={handleAreaChange}
                                sx={{
                                    bgcolor: 'rgba(0,0,0,0.4)',
                                    color: '#FFFFFF',
                                    fontWeight: 700,
                                    borderRadius: 1.5,
                                    fontFamily: '"Space Grotesk", sans-serif',
                                    fontSize: { xs: '0.8125rem', sm: '0.875rem' },
                                    '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(0, 212, 255, 0.4)' }
                                }}
                            >
                                <MenuItem value=""><em>Todas as áreas (portaria geral)</em></MenuItem>
                                {areas.map(a => (
                                    <MenuItem key={a.id} value={a.id}>
                                        {a.nome_area} {a.capacidade_maxima ? `(Capacidade: ${a.capacidade_maxima})` : ''}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </GlassCard>
                </Grid>

                <Grid item xs={12} md={7}>
                    <Grid container spacing={{ xs: 1.25, sm: 2 }}>
                        <Grid item xs={4}>
                            <KpiCard titulo="Fiscalizados" valor={stats.total} icone={<KpiFiscalizadosIcon />} />
                        </Grid>
                        <Grid item xs={4}>
                            <KpiCard titulo="Liberados" valor={stats.liberados} icone={<KpiLiberadosIcon />} cor={cores.sucesso} />
                        </Grid>
                        <Grid item xs={4}>
                            <KpiCard titulo="Negados" valor={stats.negados} icone={<KpiNegadosIcon />} cor={cores.erro} />
                        </Grid>
                    </Grid>
                </Grid>
            </Grid>

            {/* Bloco de Entrada: Leitor Universal e Busca Rápida por Nome */}
            <GlassCard sx={{ p: { xs: 1.75, sm: 2.5 }, mb: { xs: 2, sm: 2.5, md: 3 } }}>
                <Grid container spacing={{ xs: 1.5, sm: 2 }} alignItems="flex-end">
                    {/* Leitor de Pulseira / RFID / Barcode */}
                    <Grid item xs={12} md={8}>
                        <UniversalPulseiraInput
                            value={codigoInput}
                            onChange={setCodigoInput}
                            onConfirm={(val, origem) => handleProcessarCodigo(val, origem)}
                            loading={loading}
                            autoFocus={true}
                            label="Leitor de pulseira / crachá / RFID"
                            placeholder="Bipe a pulseira ou digite o código"
                            accentColor="#00D4FF"
                        />
                    </Grid>

                    {/* Botão Câmera QR */}
                    <Grid item xs={12} md={4}>
                        <Box sx={{ mb: { xs: 0, md: '28px' } }}>
                            <NeonButton
                                fullWidth
                                neonColor={cameraActive ? '#FF3366' : '#00D4FF'}
                                onClick={() => setCameraActive(!cameraActive)}
                                sx={{ 
                                    height: { xs: 48, sm: 58 }, 
                                    minHeight: { xs: 48, sm: 58 },
                                    fontSize: '0.875rem',
                                    fontWeight: 700,
                                    borderRadius: '12px'
                                }}
                            >
                                {cameraActive ? <CloseIcon sx={{ mr: 1 }} /> : <CameraIcon sx={{ mr: 1 }} />}
                                {cameraActive ? 'Fechar Câmera' : 'Ler QR via Câmera'}
                            </NeonButton>
                        </Box>
                    </Grid>

                    {/* Busca por Nome do Participante */}
                    <Grid item xs={12}>
                        <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)', my: 1 }} />
                        <Typography variant="caption" sx={{ color: '#00D4FF', fontWeight: 700, letterSpacing: '0.6px', display: 'block', mb: 1, fontSize: '0.75rem' }}>
                            Ou busque pelo nome do participante (controladores internos & portaria):
                        </Typography>
                        <Autocomplete
                            freeSolo
                            options={buscaNomeOptions}
                            loading={loadingBuscaNome}
                            inputValue={buscaNomeInput}
                            onInputChange={(_, newInputValue) => setBuscaNomeInput(newInputValue)}
                            onChange={(_, val) => {
                                if (val && typeof val === 'object') {
                                    handleSelectColaboradorNome(val);
                                }
                            }}
                            getOptionLabel={(option) => typeof option === 'string' ? option : `${option.nome_completo || ''} - ${option.funcao || ''}`}
                            renderOption={(props, option) => (
                                <Box component="li" {...props} key={option.id} sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                                    <PessoaFoto src={option.foto_url} nome={option.nome_completo} width={38} />
                                    <Box sx={{ minWidth: 0, flex: 1 }}>
                                        <Typography variant="body2" sx={{ fontWeight: 700, color: '#FFFFFF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {option.nome_completo}
                                        </Typography>
                                        <Typography variant="caption" sx={{ color: '#94A3B8', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {option.funcao || 'Participante'} • {option.empresas?.nome || 'Sem empresa'}
                                        </Typography>
                                    </Box>
                                </Box>
                            )}
                            renderInput={(params) => (
                                <TextField
                                    {...params}
                                    placeholder="Buscar participante pelo nome"
                                    size="small"
                                    InputProps={{
                                        ...params.InputProps,
                                        startAdornment: (
                                            <PersonSearchIcon sx={{ color: '#00D4FF', mr: 1, ml: 0.5, fontSize: 20 }} />
                                        ),
                                        endAdornment: (
                                            <>
                                                {loadingBuscaNome ? <CircularProgress color="inherit" size={18} sx={{ mr: 1 }} /> : null}
                                                {params.InputProps.endAdornment}
                                            </>
                                        )
                                    }}
                                    sx={{
                                        bgcolor: 'rgba(0,0,0,0.3)',
                                        borderRadius: 1.5,
                                        '& .MuiOutlinedInput-root': {
                                            color: '#FFFFFF',
                                            height: 44,
                                            fontSize: '0.875rem',
                                            '& fieldset': { borderColor: 'rgba(0, 212, 255, 0.3)' },
                                            '&:hover fieldset': { borderColor: '#00D4FF' }
                                        }
                                    }}
                                />
                            )}
                        />
                    </Grid>
                </Grid>

                {/* Scanner de Câmera Embutido se Ativo */}
                {cameraActive && (
                    <Box sx={{ mt: 2, p: 1.5, bgcolor: 'rgba(0,0,0,0.7)', borderRadius: 1.5, textAlign: 'center', border: '1px solid rgba(0,212,255,0.3)' }}>
                        <Typography variant="caption" sx={{ color: '#00D4FF', display: 'block', mb: 1, fontWeight: 700 }}>
                            Aponte a câmera para o QR Code da pulseira ou crachá
                        </Typography>
                        <div id={SCANNER_ID} style={{ width: '100%', maxWidth: '360px', margin: '0 auto', borderRadius: 12, overflow: 'hidden' }} />
                    </Box>
                )}
            </GlassCard>

            {/* CARD DE DECISÃO VISUAL (OCUPA A ÁREA PRINCIPAL SEM POLUIÇÃO DE PASSAGENS) */}
            {resultado ? (
                <GlassCard
                    sx={{
                        p: { xs: 2, sm: 3, md: 4 },
                        border: '2px solid',
                        borderColor: resultado.autorizado ? '#00FF88' : '#FF3366',
                        boxShadow: resultado.autorizado ? '0 0 40px rgba(0,255,136,0.25)' : '0 0 40px rgba(255,51,102,0.25)',
                        background: resultado.autorizado
                            ? 'linear-gradient(135deg, rgba(0,255,136,0.06) 0%, rgba(10,25,20,0.98) 100%)'
                            : 'linear-gradient(135deg, rgba(255,51,102,0.06) 0%, rgba(25,10,15,0.98) 100%)',
                        borderRadius: 1.5,
                        position: 'relative'
                    }}
                >
                    {/* Barra de Status */}
                    <Box sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 1.25,
                        py: { xs: 1.25, sm: 2 },
                        px: { xs: 1.5, sm: 3 },
                        mb: { xs: 2, sm: 3.5 },
                        borderRadius: 1.5,
                        bgcolor: resultado.autorizado ? 'rgba(0,255,136,0.15)' : 'rgba(255,51,102,0.15)',
                        border: '1.5px solid',
                        borderColor: resultado.autorizado ? '#00FF88' : '#FF3366'
                    }}>
                        {resultado.autorizado ? (
                            <SuccessIcon sx={{ color: '#00FF88', fontSize: { xs: 28, sm: 38 } }} />
                        ) : (
                            <ErrorIcon sx={{ color: '#FF3366', fontSize: { xs: 28, sm: 38 } }} />
                        )}
                        <Typography sx={{
                            fontWeight: 700,
                            fontSize: { xs: '1.1rem', sm: '1.5rem' },
                            letterSpacing: '0.75px',
                            textAlign: 'center',
                            color: resultado.autorizado ? '#00FF88' : '#FF3366',
                            fontFamily: '"Space Grotesk", sans-serif'
                        }}>
                            {resultado.autorizado ? 'ACESSO LIBERADO' : (resultado.mensagem || 'ACESSO NEGADO')}
                        </Typography>
                    </Box>

                    {/* Informações do Participante */}
                    {resultado.pessoa && (
                        <Grid container spacing={{ xs: 2, sm: 3, md: 3.5 }} alignItems="center">
                            {/* Miniatura / Foto Grande do Participante com Clique */}
                            <Grid item xs={12} sm={4} md={3.5} sx={{ textAlign: 'center' }}>
                                <Tooltip title="Clique na miniatura para ver a ficha completa com check-in e áreas autorizadas">
                                    <Box
                                        onClick={() => setCardPessoaModal(resultado.pessoa)}
                                        sx={{
                                            display: 'inline-block',
                                            cursor: 'pointer',
                                            transition: 'transform 0.2s, box-shadow 0.2s',
                                            '&:hover': {
                                                transform: 'scale(1.04)',
                                                '& img': { filter: 'brightness(1.1)' }
                                            }
                                        }}
                                    >
                                        <PessoaFoto
                                            src={resultado.pessoa.foto_url}
                                            nome={resultado.pessoa.nome_completo}
                                            width={isMobile ? 110 : 160}
                                            borderRadius="16px"
                                            accentColor={resultado.autorizado ? '#00FF88' : '#FF3366'}
                                            borderWidth="3px"
                                        />
                                    </Box>
                                </Tooltip>

                                <Box sx={{ mt: 1.25 }}>
                                    <Button
                                        variant="outlined"
                                        size="small"
                                        startIcon={<ViewDetailsIcon sx={{ fontSize: 18 }} />}
                                        onClick={() => setCardPessoaModal(resultado.pessoa)}
                                        sx={{
                                            height: 36,
                                            minHeight: 36,
                                            color: '#00D4FF',
                                            borderColor: 'rgba(0, 212, 255, 0.4)',
                                            fontWeight: 700,
                                            fontSize: '0.75rem',
                                            borderRadius: '8px',
                                            px: 2,
                                            '&:hover': { borderColor: '#00D4FF', bgcolor: 'rgba(0, 212, 255, 0.1)' }
                                        }}
                                    >
                                        Ver ficha completa
                                    </Button>
                                </Box>
                            </Grid>

                            {/* Ficha Rápida no Posto */}
                            <Grid item xs={12} sm={8} md={8.5}>
                                <Typography sx={{ color: '#FFFFFF', fontWeight: 700, fontFamily: '"Space Grotesk", sans-serif', fontSize: { xs: '1.2rem', sm: '1.5rem', md: '2rem' }, lineHeight: 1.2, mb: 0.8, textAlign: { xs: 'center', sm: 'left' } }}>
                                    {resultado.pessoa.nome_completo}
                                </Typography>

                                <Stack direction="row" spacing={1} flexWrap="wrap" justifyContent={{ xs: 'center', sm: 'flex-start' }} sx={{ gap: 1, mb: 1.5 }}>
                                    <Chip
                                        icon={<BadgeIcon sx={{ fontSize: 16 }} />}
                                        label={resultado.pessoa.funcao || 'Participante'}
                                        sx={{ bgcolor: 'rgba(255,255,255,0.08)', color: '#FFFFFF', fontWeight: 700 }}
                                    />
                                    {resultado.pessoa.empresas?.nome && (
                                        <Chip
                                            icon={<CompanyIcon sx={{ fontSize: 16 }} />}
                                            label={resultado.pessoa.empresas.nome}
                                            sx={{ bgcolor: 'rgba(255,255,255,0.08)', color: '#FFFFFF', fontWeight: 700 }}
                                        />
                                    )}
                                </Stack>

                                <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)', my: 1.5 }} />

                                {/* Detalhes: Pulseira, Check-in, Status de Acesso e Áreas */}
                                <Grid container spacing={1.5}>
                                    {/* Número da Pulseira */}
                                    <Grid item xs={6}>
                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                            <PulseiraIcon sx={{ fontSize: 14, color: '#00D4FF' }} />
                                            Pulseira / RFID
                                        </Typography>
                                        <Typography variant="body2" sx={{ color: '#00D4FF', fontWeight: 700, fontFamily: '"Inter", sans-serif' }}>
                                            {resultado.pessoa.numero_pulseira || 'Sem pulseira'}
                                        </Typography>
                                    </Grid>

                                    {/* Horário de Check-in */}
                                    <Grid item xs={6}>
                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                            <AccessTimeIcon sx={{ fontSize: 14, color: '#00FF88' }} />
                                            Check-in no evento
                                        </Typography>
                                        <Typography variant="body2" sx={{ color: resultado.pessoa.horario_checkin ? '#00FF88' : '#FFB800', fontWeight: 700, fontFamily: '"Inter", sans-serif' }}>
                                            {resultado.pessoa.horario_checkin
                                                ? `${formatarHora(resultado.pessoa.horario_checkin)}`
                                                : 'Pendente'}
                                        </Typography>
                                    </Grid>

                                    {/* Status do Acesso */}
                                    <Grid item xs={6}>
                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', display: 'block' }}>
                                            Status de acesso
                                        </Typography>
                                        <Chip
                                            label={resultado.pessoa.bloqueado ? 'BLOQUEADO' : (resultado.autorizado ? 'LIBERADO' : 'NÃO AUTORIZADO')}
                                            size="small"
                                            sx={{
                                                bgcolor: resultado.pessoa.bloqueado ? 'rgba(255,51,102,0.2)' : (resultado.autorizado ? 'rgba(0,255,136,0.2)' : 'rgba(255,184,0,0.2)'),
                                                color: resultado.pessoa.bloqueado ? '#FF3366' : (resultado.autorizado ? '#00FF88' : '#FFB800'),
                                                fontWeight: 700,
                                                mt: 0.5
                                            }}
                                        />
                                    </Grid>

                                    {/* Posto Atual */}
                                    <Grid item xs={6}>
                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', display: 'block' }}>
                                            Posto fiscalizado
                                        </Typography>
                                        <Typography variant="body2" sx={{ color: '#FFFFFF', fontWeight: 700, mt: 0.5 }}>
                                            {areaAtual?.nome_area || 'Portaria Geral'}
                                        </Typography>
                                    </Grid>

                                    {/* Áreas Autorizadas */}
                                    <Grid item xs={12}>
                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', display: 'block', mb: 0.8 }}>
                                            Áreas autorizadas para esta credencial
                                        </Typography>
                                        <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ gap: 0.8 }}>
                                            {resultado.areas_permitidas && resultado.areas_permitidas.length > 0 ? (
                                                resultado.areas_permitidas.map((ar, idx) => {
                                                    const isThisArea = ar.id === selectedAreaId;
                                                    return (
                                                        <Chip
                                                            key={idx}
                                                            label={isThisArea ? `★ ${ar.nome_area || ar} (POSTO ATUAL)` : (ar.nome_area || ar)}
                                                            size="small"
                                                            sx={{
                                                                bgcolor: isThisArea ? '#00FF88' : 'rgba(255,255,255,0.06)',
                                                                color: isThisArea ? '#000000' : '#CBD5E1',
                                                                fontWeight: isThisArea ? 900 : 600,
                                                                border: isThisArea ? 'none' : '1px solid rgba(255,255,255,0.12)'
                                                            }}
                                                        />
                                                    );
                                                })
                                            ) : (
                                                <Typography variant="caption" sx={{ color: '#94A3B8' }}>
                                                    {resultado.pessoa.tipo_pulseira?.nome_tipo ? `Tipo: ${resultado.pessoa.tipo_pulseira.nome_tipo}` : 'Acesso geral padrão'}
                                                </Typography>
                                            )}
                                        </Stack>
                                    </Grid>
                                </Grid>
                            </Grid>
                        </Grid>
                    )}
                </GlassCard>
            ) : (
                <GlassCard sx={{ p: { xs: 3, sm: 6 }, textAlign: 'center', bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 1.5 }}>
                    <PortariaIcon sx={{ fontSize: { xs: 48, sm: 68 }, color: '#00D4FF', opacity: 0.35, mb: 1.5 }} />
                    <Typography variant="h6" sx={{ color: '#FFFFFF', fontWeight: 700, fontFamily: '"Space Grotesk", sans-serif', fontSize: { xs: '1.1rem', sm: '1.5rem' } }}>
                        Posto de fiscalização pronto para leitura
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.55)', maxWidth: 540, mx: 'auto', mt: 1 }}>
                        Aproxime a pulseira RFID, escaneie o QR Code ou busque o participante pelo nome para validar o acesso na portaria e áreas internas do evento.
                    </Typography>
                </GlassCard>
            )}

            {/* Modal de Detalhes da Pessoa (ao clicar na miniatura) */}
            {cardPessoaModal && (
                <FiscalizacaoPessoaModal
                    open={Boolean(cardPessoaModal)}
                    onClose={() => setCardPessoaModal(null)}
                    pessoa={cardPessoaModal}
                    areaFiscalizada={areaAtual}
                />
            )}
        </Box>
    );
};

export default Fiscalizacao;
