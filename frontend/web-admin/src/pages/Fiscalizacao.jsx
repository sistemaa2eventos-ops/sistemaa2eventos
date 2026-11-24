import React, { useState, useEffect, useCallback } from 'react';
import {
    Box, Typography, Grid, Stack,
    Chip, IconButton, Tooltip, FormControl, InputLabel, Select,
    MenuItem, Divider, Button, List, ListItem, ListItemButton, ListItemText,
    useTheme, useMediaQuery, LinearProgress
} from '@mui/material';
import {
    CheckCircle as SuccessIcon,
    Cancel as ErrorIcon,
    Place as AreaIcon,
    Fullscreen as FullscreenIcon,
    FullscreenExit as FullscreenExitIcon,
    VolumeUp as SoundOnIcon,
    VolumeOff as SoundOffIcon,
    Badge as BadgeIcon,
    CorporateFare as CompanyIcon,
    Sensors as PulseiraIcon,
    Visibility as ViewDetailsIcon,
    MeetingRoom as PortariaIcon
} from '@mui/icons-material';
import PageHeader from '../components/common/PageHeader';
import GlassCard from '../components/common/GlassCard';
import LeitorQrCamera from '../components/common/LeitorQrCameraSobDemanda';
import KpiCard from '../components/common/KpiCard';
import { cores } from '../styles/tokens';
import { FactCheck as KpiFiscalizadosIcon, CheckCircle as KpiLiberadosIcon, Block as KpiNegadosIcon } from '@mui/icons-material';
import { UniversalPulseiraInput } from '../components/common/UniversalPulseiraInput';
import PessoaFoto from '../components/common/PessoaFoto';
import FiscalizacaoPessoaModal from '../components/credenciamento/FiscalizacaoPessoaModal';
import api from '../services/api';
import { useSnackbar } from 'notistack';
import { obterAudioContext } from '../utils/alertSound';

// Sons sintetizados via Web Audio API (tons discretos e elegantes)
const playFeedbackSound = (type, soundEnabled = true) => {
    if (!soundEnabled) return;
    try {
        const audioCtx = obterAudioContext();
        if (!audioCtx) return;
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


// Caixinha de um dado da ficha (credencial, presença, pulseira)
const Bloco = ({ titulo, cor, children }) => (
    <Box sx={{ height: '100%', p: 1.25, borderRadius: 1.25, bgcolor: 'rgba(255,255,255,0.03)', border: `1px solid ${cor}55` }}>
        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', display: 'block', fontWeight: 700, letterSpacing: 0.5, mb: 0.5 }}>
            {titulo.toUpperCase()}
        </Typography>
        {children}
    </Box>
);

const Fiscalizacao = () => {
    const { enqueueSnackbar } = useSnackbar();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

    // Evento e Áreas
    const [areas, setAreas] = useState([]);
    const [selectedAreaId, setSelectedAreaId] = useState(() => {
        return localStorage.getItem('fiscal_area_id') || '';
    });

    // Leitura e Fiscalização ao Vivo (Campo Único Unificado)
    const [codigoInput, setCodigoInput] = useState('');
    const [ultimoCodigoLido, setUltimoCodigoLido] = useState('');
    const [loading, setLoading] = useState(false);
    const [resultado, setResultado] = useState(null);
    const [soundEnabled, setSoundEnabled] = useState(true);
    const [telaCheia, setTelaCheia] = useState(false);

    // Câmera Scanner QR / Barras
    const [cameraActive, setCameraActive] = useState(false);

    // Estatísticas da Sessão de Fiscalização
    const [stats, setStats] = useState({
        total: 0,
        liberados: 0,
        negados: 0
    });

    // Modal de Detalhes da Pessoa (ao clicar na miniatura)
    const [cardPessoaModal, setCardPessoaModal] = useState(null);

    // Resultados de Busca por Nome / CPF / Pulseira no mesmo campo
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

    // 2. Processar Fiscalização (por Pulseira, QR Code, CPF, Barcode ou Busca)
    const handleProcessarCodigo = useCallback(async (codigoBruto, origem = 'scanner') => {
        const codigoLimpo = String(codigoBruto || '').trim();
        if (!codigoLimpo || loading) return;

        setCodigoInput(''); // campo vazio: o próximo bipe não gruda no anterior
        // Escolha na lista manda o id da pessoa: não é código lido, não vai para o aviso
        if (origem !== 'busca_nome') setUltimoCodigoLido(codigoLimpo);
        setBuscaNomeOptions([]);

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
        }
    }, [selectedAreaId, loading, soundEnabled, enqueueSnackbar]);

    // 3. Busca por Nome / CPF / Pulseira integrada ao campo único
    useEffect(() => {
        const termo = codigoInput.trim();
        // Não abre lista de sugestões se o termo atual acabou de ser confirmado por leitura
        if (termo.length < 2 || termo === ultimoCodigoLido) {
            setBuscaNomeOptions([]);
            setLoadingBuscaNome(false);
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
        }, 280);

        return () => {
            ativo = false;
            clearTimeout(timer);
        };
    }, [codigoInput, ultimoCodigoLido, activeEventoId]);

    const handleSelectColaboradorNome = (colaborador) => {
        if (!colaborador?.id) return;
        // Pelo id: pulseira, CPF ou nome podem bater em outra pessoa (o servidor aceita UUID)
        handleProcessarCodigo(colaborador.id, 'busca_nome');
    };

    // Enter/OK no campo: código lido, nº da pulseira ou CPF fiscaliza direto.
    // Nome digitado nunca fiscaliza sozinho: a lista abaixo do campo mostra quem bate e o operador escolhe.
    const confirmarCampo = (val, origem) => {
        const texto = String(val || '').trim();
        if (!texto) return;
        if (origem !== 'barcode' && /[A-Za-zÀ-ÿ]/.test(texto)) return;
        handleProcessarCodigo(texto, origem);
    };

    const areaAtual = areas.find(a => a.id === selectedAreaId);

    // Tela cheia do navegador (o botão antes só trocava o ícone)
    useEffect(() => {
        const aoMudar = () => setTelaCheia(Boolean(document.fullscreenElement));
        document.addEventListener('fullscreenchange', aoMudar);
        return () => document.removeEventListener('fullscreenchange', aoMudar);
    }, []);

    const alternarTelaCheia = async () => {
        try {
            if (document.fullscreenElement) await document.exitFullscreen();
            else await document.documentElement.requestFullscreen();
        } catch {
            enqueueSnackbar('O navegador não permitiu a tela cheia.', { variant: 'warning' });
        }
    };

    // Formatação de data/hora para visualização rápida no card
    const formatarHora = (isoStr) => {
        if (!isoStr) return null;
        try {
            // created_at do banco é UTC sem o marcador de fuso: sem o "Z" o navegador lê como horário
            // local e mostra 3 h adiantado. Mesmo tratamento do serviço de pulseiras no backend.
            const comFuso = /[zZ]|[+-]\d\d:?\d\d$/.test(isoStr) ? isoStr : `${isoStr}Z`;
            return new Date(comFuso).toLocaleTimeString('pt-BR', {
                timeZone: 'America/Sao_Paulo',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
        } catch {
            return isoStr;
        }
    };

    const formatarDataHora = (isoStr) => {
        if (!isoStr) return null;
        try {
            return new Date(isoStr).toLocaleString('pt-BR', {
                timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
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
                    <Tooltip title={telaCheia ? 'Sair da tela cheia' : 'Tela cheia'}>
                        <IconButton
                            onClick={alternarTelaCheia}
                            sx={{
                                color: '#00D4FF',
                                bgcolor: 'rgba(0,212,255,0.08)',
                                border: '1px solid rgba(0,212,255,0.25)',
                                height: 36,
                                width: 36,
                                '&:hover': { bgcolor: 'rgba(0,212,255,0.18)' }
                            }}
                        >
                            {telaCheia ? <FullscreenExitIcon fontSize="small" /> : <FullscreenIcon fontSize="small" />}
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

            {/* Bloco de Entrada Unificado: Leitor QR/Barras, Pulseira, CPF e Busca por Nome em um só campo */}
            <GlassCard sx={{ p: { xs: 1.75, sm: 2.5 }, mb: { xs: 2, sm: 2.5, md: 3 } }}>
                <UniversalPulseiraInput
                    value={codigoInput}
                    onChange={(val) => {
                        setCodigoInput(val);
                        if (!val) {
                            setUltimoCodigoLido('');
                            setBuscaNomeOptions([]);
                        }
                    }}
                    onClear={() => {
                        setCodigoInput('');
                        setUltimoCodigoLido('');
                        setBuscaNomeOptions([]);
                    }}
                    onConfirm={confirmarCampo}
                    // Só o loading da ação: a busca por nome não pode travar o campo no meio de um bipe
                    loading={loading}
                    autoFocus={true}
                    ultimoCodigoLido={ultimoCodigoLido}
                    label="Buscar pessoa"
                    placeholder="Nome, CPF, empresa, função, pulseira... ou bipe o QR"
                    helperText="Busca por qualquer dado do cadastro, em ordem alfabética • Bipe ou câmera: fiscalização automática • Digitado: Enter ou OK"
                    accentColor="#00D4FF"
                    onAbrirCamera={() => setCameraActive(true)}
                />
                {/* Busca por nome em andamento: barra fina com altura fixa (nada pula) */}
                <Box sx={{ height: 3, mt: 0.75 }} aria-live="polite">
                    {loadingBuscaNome && <LinearProgress aria-label="Buscando" sx={{ height: 3, borderRadius: 2, bgcolor: 'rgba(0,212,255,0.12)', '& .MuiLinearProgress-bar': { bgcolor: '#00D4FF' } }} />}
                </Box>

                {buscaNomeOptions.length > 0 && (
                    <Box sx={{ mt: 1.5, maxHeight: 260, overflowY: 'auto' }}>
                        <Typography variant="caption" sx={{ display: 'block', mb: 0.75, color: 'rgba(255,255,255,0.55)' }}>
                            {buscaNomeOptions.length === 1 ? '1 pessoa encontrada' : `${buscaNomeOptions.length} pessoas encontradas`} • ordem alfabética
                        </Typography>
                        <List disablePadding>
                            {buscaNomeOptions.map((option) => (
                                <ListItem key={option.id} disablePadding sx={{ mb: 0.75 }}>
                                    <ListItemButton
                                        onClick={() => handleSelectColaboradorNome(option)}
                                        sx={{
                                            borderRadius: 1.5,
                                            p: 1.15,
                                            border: '1px solid rgba(0, 212, 255, 0.2)',
                                            bgcolor: 'rgba(255,255,255,0.02)',
                                            '&:hover': {
                                                bgcolor: 'rgba(0, 212, 255, 0.1)',
                                                borderColor: '#00D4FF'
                                            }
                                        }}
                                    >
                                        <Box sx={{ mr: 1.5 }}>
                                            <PessoaFoto src={option.foto_url} pessoaId={option.id} nome={option.nome_completo} width={40} borderRadius="8px" accentColor="#00D4FF" />
                                        </Box>
                                        <ListItemText
                                            primary={option.nome_completo || option.nome}
                                            secondary={[
                                                option.cpf || 'Sem CPF',
                                                option.funcao,
                                                option.numero_pulseira ? `Pulseira ${option.numero_pulseira}` : null,
                                                option.empresa_nome || option.empresas?.nome
                                            ].filter(Boolean).join(' – ')}
                                            primaryTypographyProps={{ fontWeight: 700, fontSize: '0.9rem', color: '#FFFFFF', noWrap: true }}
                                            secondaryTypographyProps={{ fontSize: '0.78rem', color: '#94A3B8', noWrap: true }}
                                        />
                                    </ListItemButton>
                                </ListItem>
                            ))}
                        </List>
                    </Box>
                )}

                <LeitorQrCamera
                    open={cameraActive}
                    onClose={() => setCameraActive(false)}
                    titulo="Fiscalização pela câmera"
                    instrucao="Aponte a câmera para o QR Code ou código de barras da pulseira — a pessoa vinculada será buscada automaticamente."
                    onLeitura={(cod) => {
                        setCameraActive(false);
                        handleProcessarCodigo(cod, 'camera_qr');
                    }}
                />
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
                                            pessoaId={resultado.pessoa.id}
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

                            {/* Ficha de fiscalização: credencial, presença de hoje, pulseira em uso, movimentos e áreas */}
                            <Grid item xs={12} sm={8} md={8.5}>
                                <Typography sx={{ color: '#FFFFFF', fontWeight: 700, fontFamily: '"Space Grotesk", sans-serif', fontSize: { xs: '1.2rem', sm: '1.5rem', md: '2rem' }, lineHeight: 1.2, mb: 0.8, textAlign: { xs: 'center', sm: 'left' } }}>
                                    {resultado.pessoa.nome_completo}
                                </Typography>

                                <Stack direction="row" flexWrap="wrap" justifyContent={{ xs: 'center', sm: 'flex-start' }} sx={{ gap: 1, mb: 1.5 }}>
                                    <Chip
                                        icon={<BadgeIcon sx={{ fontSize: 16 }} />}
                                        label={resultado.pessoa.funcao || 'Participante'}
                                        sx={{ bgcolor: 'rgba(255,255,255,0.08)', color: '#FFFFFF', fontWeight: 700 }}
                                    />
                                    <Chip
                                        icon={<CompanyIcon sx={{ fontSize: 16 }} />}
                                        label={resultado.pessoa.empresas?.nome || resultado.pessoa.empresa_nome || 'Pessoa física'}
                                        sx={{ bgcolor: 'rgba(255,255,255,0.08)', color: '#FFFFFF', fontWeight: 700 }}
                                    />
                                </Stack>

                                <Grid container spacing={1.25}>
                                    {/* Credencial */}
                                    <Grid item xs={12} sm={4}>
                                        <Bloco titulo="Credencial" cor={resultado.pessoa.credenciado ? '#00FF88' : '#FF3366'}>
                                            <Typography sx={{ color: resultado.pessoa.credenciado ? '#00FF88' : '#FF3366', fontWeight: 800 }}>
                                                {resultado.pessoa.credenciado ? 'CREDENCIADO' : 'NÃO CREDENCIADO'}
                                            </Typography>
                                            {!resultado.pessoa.credenciado && resultado.pessoa.motivo_nao_credenciado && (
                                                <Typography variant="caption" sx={{ color: '#FFB3C6' }}>{resultado.pessoa.motivo_nao_credenciado}</Typography>
                                            )}
                                        </Bloco>
                                    </Grid>

                                    {/* Presença de hoje */}
                                    <Grid item xs={12} sm={4}>
                                        {(() => {
                                            const p = resultado.pessoa;
                                            const ainda = Boolean(p.pulseira_anterior?.ainda_dentro);
                                            const cor = p.dentro_do_evento ? '#00FF88' : (ainda ? '#FF3366' : '#FFB800');
                                            const rotulo = p.dentro_do_evento
                                                ? 'DENTRO DO EVENTO'
                                                : ainda ? 'AINDA DENTRO (PULSEIRA DE OUTRO DIA)'
                                                    : (p.ultimo_evento_hoje === 'checkout' ? 'FORA DO EVENTO' : 'SEM CHECK-IN HOJE');
                                            const entrada = p.entrada_hoje;
                                            return (
                                                <Bloco titulo="Presença de hoje" cor={cor}>
                                                    <Typography sx={{ color: cor, fontWeight: 800 }}>{rotulo}</Typography>
                                                    {entrada && (
                                                        <Typography variant="caption" sx={{ color: '#CBD5E1', display: 'block', mt: 0.5 }}>
                                                            Entrou em {formatarDataHora(entrada.horario) || '—'} · {entrada.forma}
                                                            {entrada.usuario_nome ? ` por ${entrada.usuario_nome}` : ''}
                                                        </Typography>
                                                    )}
                                                </Bloco>
                                            );
                                        })()}
                                    </Grid>

                                    {/* Pulseira em uso hoje: só a de hoje; de outro dia nunca aparece */}
                                    <Grid item xs={12} sm={4}>
                                        <Bloco titulo="Pulseira em uso hoje" cor={resultado.pessoa.pulseira ? '#00D4FF' : '#FFB800'}>
                                            {resultado.pessoa.pulseira ? (
                                                <>
                                                    <Stack direction="row" alignItems="center" flexWrap="wrap" sx={{ gap: 0.75 }}>
                                                        <PulseiraIcon sx={{ fontSize: 18, color: '#00D4FF' }} />
                                                        <Typography sx={{ color: '#00D4FF', fontWeight: 800, fontSize: '1.15rem' }}>
                                                            {resultado.pessoa.pulseira.numero}
                                                        </Typography>
                                                        {resultado.pessoa.pulseira.tipo_nome && (
                                                            <Chip
                                                                size="small"
                                                                label={resultado.pessoa.pulseira.tipo_nome}
                                                                sx={{
                                                                    fontWeight: 700,
                                                                    bgcolor: resultado.pessoa.pulseira.cor_hex ? `${resultado.pessoa.pulseira.cor_hex}33` : 'rgba(255,255,255,0.08)',
                                                                    color: resultado.pessoa.pulseira.cor_hex || '#FFFFFF',
                                                                    border: `1px solid ${resultado.pessoa.pulseira.cor_hex || 'rgba(255,255,255,0.2)'}`
                                                                }}
                                                            />
                                                        )}
                                                    </Stack>
                                                    <Typography variant="caption" sx={{ color: '#CBD5E1', display: 'block', mt: 0.5 }}>
                                                        Colocada em {formatarDataHora(resultado.pessoa.pulseira.colocada_em) || '—'}
                                                        {resultado.pessoa.pulseira.forma ? ` · ${resultado.pessoa.pulseira.forma}` : ''}
                                                        {resultado.pessoa.pulseira.usuario_nome ? ` por ${resultado.pessoa.pulseira.usuario_nome}` : ''}
                                                    </Typography>
                                                </>
                                            ) : (
                                                <Typography variant="body2" sx={{ color: '#FFB800', fontWeight: 700 }}>
                                                    Nenhuma pulseira em uso hoje
                                                </Typography>
                                            )}
                                        </Bloco>
                                    </Grid>
                                </Grid>

                                {/* Pulseira de outro dia que não foi devolvida: aparece com data e forma; ainda dentro = credenciamento */}
                                {resultado.pessoa.pulseira_anterior && (() => {
                                    const ant = resultado.pessoa.pulseira_anterior;
                                    const cor = ant.ainda_dentro ? '#FF3366' : '#FFB800';
                                    return (
                                        <Box sx={{ mt: 1.25, p: 1.25, borderRadius: 1.25, bgcolor: `${cor}14`, border: `1px solid ${cor}88` }}>
                                            <Typography variant="caption" sx={{ color: cor, fontWeight: 800, letterSpacing: 0.5, display: 'block', mb: 0.5 }}>
                                                PULSEIRA DE OUTRO DIA — NÃO DEVOLVIDA
                                            </Typography>
                                            <Typography sx={{ color: '#FFFFFF', fontWeight: 800 }}>
                                                Nº {ant.numero}{ant.tipo_nome ? ` · ${ant.tipo_nome}` : ''}
                                            </Typography>
                                            <Typography variant="body2" sx={{ color: '#CBD5E1' }}>
                                                Check-in em {formatarDataHora(ant.colocada_em) || '—'}
                                                {ant.forma ? ` · ${ant.forma}` : ''}
                                                {ant.usuario_nome ? ` por ${ant.usuario_nome}` : ''}
                                            </Typography>
                                            {ant.ainda_dentro ? (
                                                <Typography variant="body2" sx={{ color: '#FF3366', fontWeight: 700, mt: 0.5 }}>
                                                    Ainda está no evento com esta pulseira. Dirija-se ao CREDENCIAMENTO para trocar a pulseira e fazer check-in novamente.
                                                </Typography>
                                            ) : (
                                                <Typography variant="body2" sx={{ color: '#FFB800', mt: 0.5 }}>
                                                    Saiu em {formatarDataHora(ant.saiu_em) || '—'} (fim de turno). Pulseira ainda não devolvida.
                                                </Typography>
                                            )}
                                        </Box>
                                    );
                                })()}

                                <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)', my: 1.5 }} />

                                {/* Movimentos de hoje: entradas e saídas, com horário, área e pulseira */}
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', display: 'block', mb: 0.75, fontWeight: 700, letterSpacing: 0.5 }}>
                                    MOVIMENTOS DE HOJE
                                </Typography>
                                {(resultado.pessoa.historico_hoje || []).length > 0 ? (
                                    <Stack spacing={0.6} sx={{ mb: 1.5 }}>
                                        {resultado.pessoa.historico_hoje.map((h, idx) => {
                                            const entrada = h.tipo === 'checkin';
                                            return (
                                                <Typography key={idx} variant="body2" sx={{ color: '#E2E8F0' }}>
                                                    <Box component="span" sx={{ color: entrada ? '#00FF88' : '#FFB800', fontWeight: 800 }}>
                                                        {formatarHora(h.horario)} {entrada ? 'ENTRADA' : 'SAÍDA'}
                                                    </Box>
                                                    {' · '}{h.area_nome || 'Geral'}
                                                    {' · '}{h.numero_pulseira ? `pulseira ${h.numero_pulseira}` : 'sem pulseira'}
                                                    {h.forma ? ` · ${h.forma}` : ''}
                                                    {h.usuario_nome ? ` por ${h.usuario_nome}` : ''}
                                                </Typography>
                                            );
                                        })}
                                    </Stack>
                                ) : (
                                    <Typography variant="body2" sx={{ color: '#94A3B8', mb: 1.5 }}>Nenhuma entrada ou saída hoje.</Typography>
                                )}

                                {/* Áreas que a pessoa pode acessar */}
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', display: 'block', mb: 0.75, fontWeight: 700, letterSpacing: 0.5 }}>
                                    ÁREAS QUE PODE ACESSAR
                                </Typography>
                                <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ gap: 0.8 }}>
                                    {(resultado.pessoa.areas_autorizadas || []).length > 0 ? (
                                        resultado.pessoa.areas_autorizadas.map((ar) => {
                                            const isThisArea = ar.id === selectedAreaId;
                                            return (
                                                <Chip
                                                    key={ar.id}
                                                    label={isThisArea ? `★ ${ar.nome_area} (POSTO ATUAL)` : ar.nome_area}
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
                                        <Typography variant="caption" sx={{ color: '#94A3B8' }}>Nenhuma área cadastrada para esta pessoa.</Typography>
                                    )}
                                </Stack>
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
