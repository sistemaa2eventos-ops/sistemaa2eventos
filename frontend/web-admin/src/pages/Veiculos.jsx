import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSnackbar } from 'notistack';
import {
    Box,
    Typography,
    Stack,
    IconButton,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    Button,
    Select,
    MenuItem,
    InputLabel,
    FormControl,
    Autocomplete,
    Tooltip,
    Divider,
    Paper,
    CircularProgress,
    InputAdornment,
    Avatar,
    Grid
} from '@mui/material';
import {
    Add as AddIcon,
    Edit as EditIcon,
    Delete as DeleteIcon,
    Search as SearchIcon,
    DirectionsCar as CarIcon,
    History as HistoryIcon,
    Block as BlockIcon,
    CheckCircle as CheckCircleIcon,
    MeetingRoom as PassagemIcon,
    Cancel as CancelIcon,
    Person as PersonIcon,
    CameraAlt as CameraIcon,
    Mic as MicIcon,
    MicOff as MicOffIcon,
    PhotoCamera as PhotoCameraIcon
} from '@mui/icons-material';
import api from '../services/api';
import GlassCard from '../components/common/GlassCard';
import PageHeader from '../components/common/PageHeader';
import NeonButton from '../components/common/NeonButton';
import DataTable from '../components/common/DataTable';
import StatusBadge from '../components/common/StatusBadge';
import { useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

import { botaoSecundario, acaoTabela, acaoTabelaPerigo } from '../styles/tokens';
import { comoRotulo } from '../utils/formatadores';
const Veiculos = () => {
    const { enqueueSnackbar } = useSnackbar();
    const [searchParams] = useSearchParams();
    const eventoId = searchParams.get('evento_id') || localStorage.getItem('active_evento_id');
    
    // Estados principais
    const [veiculos, setVeiculos] = useState([]);
    const [empresas, setEmpresas] = useState([]);
    const [pessoas, setPessoas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    
    // Paginação e Busca
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(25);
    const [totalCount, setTotalCount] = useState(0);

    // Dialogs e Modais
    const [openDialog, setOpenDialog] = useState(false);
    const [openDeleteConfirm, setOpenDeleteConfirm] = useState(false);
    const [openPassagemDialog, setOpenPassagemDialog] = useState(false);
    const [openHistoricoDialog, setOpenHistoricoDialog] = useState(false);
    
    // Novos Modais: Bloqueio Justificado & Foto / Vistoria
    const [openBloqueioDialog, setOpenBloqueioDialog] = useState(false);
    const [veiculoParaBloquear, setVeiculoParaBloquear] = useState(null);
    const [justificativaBloqueio, setJustificativaBloqueio] = useState('');

    const [openFotoDialog, setOpenFotoDialog] = useState(false);
    const [veiculoParaFoto, setVeiculoParaFoto] = useState(null);
    const [fotoCaptured, setFotoCaptured] = useState(null);
    const [cameraActive, setCameraActive] = useState(false);
    const [fotoObservacao, setFotoObservacao] = useState('');
    const [isRecording, setIsRecording] = useState(false);
    const videoRef = useRef(null);
    const recognitionRef = useRef(null);

    // Lightbox para zoom de fotos
    const [previewFotoUrl, setPreviewFotoUrl] = useState(null);
    
    const [selectedVeiculo, setSelectedVeiculo] = useState(null);
    const [veiculoToDelete, setVeiculoToDelete] = useState(null);
    
    // Estados de Consulta Rápida
    const [consultaPlaca, setConsultaPlaca] = useState('');
    const [resultadoConsulta, setResultadoConsulta] = useState(null);
    const [consultando, setConsultando] = useState(false);

    // Estados de Passagem e Histórico
    const [passagemData, setPassagemData] = useState({ tipo: 'entrada', observacao: '' });
    const [historicoLogs, setHistoricoLogs] = useState([]);
    const [loadingHistorico, setLoadingHistorico] = useState(false);

    const [formData, setFormData] = useState({
        placa: '',
        marca: '',
        modelo: '',
        empresa_id: '',
        motorista_id: '',
        evento_id: eventoId
    });

    const columns = [
        {
            id: 'placa',
            label: 'Placa / TAG',
            minWidth: 120,
            format: (val) => (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <CarIcon sx={{ color: '#00D4FF', fontSize: 18 }} />
                    <Typography variant="body2" sx={{ fontWeight: 700, letterSpacing: '1px' }}>{val}</Typography>
                </Box>
            )
        },
        { 
            id: 'info', 
            label: 'Veículo', 
            minWidth: 180,
            format: (_, row) => (
                <Box>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{row.marca || 'N/A'}</Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>{row.modelo}</Typography>
                </Box>
            )
        },
        {
            id: 'status',
            label: 'Status',
            minWidth: 120,
            format: (val) => (
                <StatusBadge 
                    status={val === 'liberado' ? 'autorizado' : 'bloqueado'} 
                    label={val === 'liberado' ? 'LIBERADO' : 'BLOQUEADO'} 
                />
            )
        },
        {
            id: 'empresas',
            label: 'Empresa',
            minWidth: 150,
            format: (val) => val?.nome || '—'
        },
        {
            id: 'pessoas',
            label: 'Motorista vinculado',
            minWidth: 220,
            format: (val) => {
                const nome = val?.nome_completo || val?.nome;
                if (!nome) {
                    return <Typography variant="caption" sx={{ color: 'text.secondary', fontStyle: 'italic' }}>— Não vinculado —</Typography>;
                }
                return (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Avatar 
                            src={val.foto_url} 
                            alt={nome}
                            sx={{ 
                                width: 34, 
                                height: 34, 
                                border: '1.5px solid rgba(0, 212, 255, 0.4)',
                                background: 'rgba(0, 212, 255, 0.1)',
                                fontSize: '0.875rem',
                                fontWeight: 700
                            }}
                        >
                            {nome[0]}
                        </Avatar>
                        <Box sx={{ minWidth: 0 }}>
                            <Typography variant="body2" sx={{ fontWeight: 600, color: '#FFFFFF' }} noWrap>
                                {nome}
                            </Typography>
                            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }} noWrap>
                                {val.cpf ? `CPF: ${val.cpf}` : 'Sem CPF'} {val.funcao ? `• ${val.funcao}` : ''}
                            </Typography>
                        </Box>
                    </Box>
                );
            }
        },
        {
            id: 'acoes',
            label: 'Operações',
            minWidth: 200,
            align: 'center',
            format: (value, row) => (
                <Stack direction="row" spacing={1} justifyContent="center">
                    <Tooltip title="Registrar passagem">
                        <IconButton
                            size="small"
                            onClick={() => handleOpenPassagem(row)}
                            sx={acaoTabela}
                        >
                            <PassagemIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>

                    <Tooltip title="Foto e vistoria">
                        <IconButton
                            size="small"
                            onClick={() => handleOpenFoto(row)}
                            sx={acaoTabela}
                        >
                            <CameraIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>

                    <Tooltip title={row.status === 'liberado' ? "Bloquear veículo" : "Liberar veículo"}>
                        <IconButton
                            size="small"
                            onClick={() => handleToggleStatus(row)}
                            sx={row.status === 'liberado' ? acaoTabelaPerigo : acaoTabela}
                        >
                            {row.status === 'liberado' ? <BlockIcon fontSize="small" /> : <CheckCircleIcon fontSize="small" />}
                        </IconButton>
                    </Tooltip>

                    <Tooltip title="Histórico">
                        <IconButton
                            size="small"
                            onClick={() => handleOpenHistorico(row)}
                            sx={acaoTabela}
                        >
                            <HistoryIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>

                    <Divider orientation="vertical" flexItem sx={{ mx: 0.5, borderColor: 'rgba(255,255,255,0.05)' }} />

                    <IconButton
                        size="small"
                        onClick={() => handleOpenDialog(row)}
                        sx={{ color: 'text.secondary' }}
                    >
                        <EditIcon fontSize="small" />
                    </IconButton>
                    
                    <IconButton
                        size="small"
                        onClick={() => handleDelete(row.id)}
                        sx={{ color: '#FF3366', background: 'rgba(255,51,102,0.05)' }}
                    >
                        <DeleteIcon fontSize="small" />
                    </IconButton>
                </Stack>
            ),
        },
    ];

    const loadVeiculos = useCallback(async () => {
        if (!eventoId) return;
        try {
            setLoading(true);
            const response = await api.get('/veiculos', {
                params: {
                    busca: search || undefined,
                    page: page + 1,
                    limit: rowsPerPage,
                    evento_id: eventoId
                },
            });
            setVeiculos(response.data.data || []);
            setTotalCount(response.data.total || 0);
        } catch (error) {
            enqueueSnackbar('Falha ao sincronizar frota.', { variant: 'error' });
        } finally {
            setLoading(false);
        }
    }, [search, page, rowsPerPage, eventoId, enqueueSnackbar]);

    const loadPessoas = useCallback(async () => {
        if (!eventoId) return;
        try {
            const response = await api.get('/pessoas', {
                params: { evento_id: eventoId, limit: 1000 }
            });
            // Extração segura do array de dados (PessoaController retorna { success: true, data: { data: [] } })
            const rawData = response.data.data;
            const rawList = Array.isArray(rawData?.data) ? rawData.data : (Array.isArray(rawData) ? rawData : []);
            const arrayPessoas = rawList.map(p => ({
                ...p,
                nome_completo: p.nome_completo || p.nome || 'Sem Nome'
            })).sort((a, b) => (a.nome_completo || '').localeCompare(b.nome_completo || ''));
            setPessoas(arrayPessoas);
        } catch (err) {
            console.error('Erro ao carregar pessoas:', err);
            setPessoas([]);
        }
    }, [eventoId]);

    const pessoasDisponiveis = useMemo(() => {
        if (!formData.empresa_id) return pessoas;
        return [...pessoas].sort((a, b) => {
            const aEmp = (a.empresa_id === formData.empresa_id || a.empresa_direta_id === formData.empresa_id) ? 1 : 0;
            const bEmp = (b.empresa_id === formData.empresa_id || b.empresa_direta_id === formData.empresa_id) ? 1 : 0;
            if (bEmp !== aEmp) return bEmp - aEmp;
            return (a.nome_completo || '').localeCompare(b.nome_completo || '');
        });
    }, [pessoas, formData.empresa_id]);

    const loadEmpresas = useCallback(async () => {
        if (!eventoId) return;
        try {
            const response = await api.get('/empresas', {
                params: { evento_id: eventoId }
            });
            setEmpresas(response.data.data || []);
        } catch (err) {
            console.error('Erro ao carregar empresas:', err);
        }
    }, [eventoId]);

    useEffect(() => {
        loadVeiculos();
    }, [loadVeiculos]);

    useEffect(() => {
        loadEmpresas();
        loadPessoas();
    }, [loadEmpresas, loadPessoas]);

    const handleConsultarPlaca = async () => {
        if (!consultaPlaca) return;
        try {
            setConsultando(true);
            const res = await api.get(`/veiculos/consulta/${consultaPlaca.toUpperCase().replace(/\s/g, '')}`, {
                params: { evento_id: eventoId }
            });
            setResultadoConsulta(res.data);
        } catch (error) {
            if (error.response?.status === 404) {
                setResultadoConsulta({ success: false, autorizado: false, motivo: 'NAO_CADASTRADO', placa: consultaPlaca });
            } else {
                enqueueSnackbar('Erro ao consultar placa.', { variant: 'error' });
            }
        } finally {
            setConsultando(false);
        }
    };

    const handleOpenBloqueio = (veiculo) => {
        setVeiculoParaBloquear(veiculo);
        setJustificativaBloqueio('');
        setOpenBloqueioDialog(true);
    };

    const handleConfirmarBloqueio = async () => {
        if (!justificativaBloqueio.trim()) {
            enqueueSnackbar('A justificativa do bloqueio é obrigatória.', { variant: 'warning' });
            return;
        }
        try {
            setSaving(true);
            await api.patch(`/veiculos/${veiculoParaBloquear.id}/status`, {
                status: 'bloqueado',
                motivo: justificativaBloqueio.trim(),
                evento_id: eventoId
            });
            enqueueSnackbar('Veículo bloqueado com sucesso.', { variant: 'success' });
            setOpenBloqueioDialog(false);
            loadVeiculos();
            if (resultadoConsulta && resultadoConsulta.veiculo?.id === veiculoParaBloquear.id) {
                setResultadoConsulta(prev => ({
                    ...prev,
                    autorizado: false,
                    motivo: 'BLOQUEADO',
                    justificativa: justificativaBloqueio.trim(),
                    veiculo: {
                        ...prev.veiculo,
                        status: 'bloqueado',
                        motivo_bloqueio: justificativaBloqueio.trim(),
                        bloqueado_em: new Date().toISOString()
                    }
                }));
            }
        } catch (error) {
            enqueueSnackbar(error.response?.data?.error || 'Erro ao bloquear veículo.', { variant: 'error' });
        } finally {
            setSaving(false);
        }
    };

    const handleDesbloquear = async (veiculo) => {
        try {
            setSaving(true);
            await api.patch(`/veiculos/${veiculo.id}/status`, {
                status: 'liberado',
                motivo: 'Desbloqueado pelo operador',
                evento_id: eventoId
            });
            enqueueSnackbar('Veículo liberado com sucesso.', { variant: 'success' });
            loadVeiculos();
            if (resultadoConsulta && resultadoConsulta.veiculo?.id === veiculo.id) {
                setResultadoConsulta(prev => ({
                    ...prev,
                    autorizado: true,
                    motivo: null,
                    veiculo: {
                        ...prev.veiculo,
                        status: 'liberado',
                        motivo_bloqueio: null
                    }
                }));
            }
        } catch (error) {
            enqueueSnackbar(error.response?.data?.error || 'Erro ao liberar veículo.', { variant: 'error' });
        } finally {
            setSaving(false);
        }
    };

    const handleToggleStatus = (veiculo) => {
        if (veiculo.status === 'liberado') {
            handleOpenBloqueio(veiculo);
        } else {
            handleDesbloquear(veiculo);
        }
    };

    // --- Câmera e Upload de Fotos do Veículo ---
    const startCamera = async () => {
        try {
            setCameraActive(true);
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
            });
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                videoRef.current.play();
            }
        } catch (err) {
            console.error('Erro ao acessar câmera:', err);
            setCameraActive(false);
            enqueueSnackbar('Câmera indisponível. Você pode anexar uma foto.', { variant: 'warning' });
        }
    };

    const stopCamera = () => {
        if (videoRef.current && videoRef.current.srcObject) {
            const stream = videoRef.current.srcObject;
            const tracks = stream.getTracks();
            tracks.forEach(track => track.stop());
            videoRef.current.srcObject = null;
        }
        setCameraActive(false);
    };

    const capturePhoto = () => {
        if (videoRef.current) {
            const video = videoRef.current;
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth || 640;
            canvas.height = video.videoHeight || 480;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
            setFotoCaptured(dataUrl);
            stopCamera();
        }
    };

    const handleFileUpload = (e) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setFotoCaptured(reader.result);
                stopCamera();
            };
            reader.readAsDataURL(file);
        }
    };

    // --- Transcrição de Áudio / Voz ---
    const handleToggleRecording = () => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            enqueueSnackbar('Reconhecimento de voz não suportado neste navegador. Digite no campo.', { variant: 'warning' });
            return;
        }

        if (isRecording) {
            if (recognitionRef.current) {
                recognitionRef.current.stop();
            }
            setIsRecording(false);
        } else {
            try {
                const recognition = new SpeechRecognition();
                recognition.lang = 'pt-BR';
                recognition.continuous = true;
                recognition.interimResults = true;

                recognition.onstart = () => {
                    setIsRecording(true);
                };

                recognition.onresult = (event) => {
                    let fullText = '';
                    for (let i = 0; i < event.results.length; i++) {
                        fullText += event.results[i][0].transcript + ' ';
                    }
                    if (fullText.trim()) {
                        setFotoObservacao(fullText.trim());
                    }
                };

                recognition.onerror = (event) => {
                    console.error('Speech recognition error:', event.error);
                    setIsRecording(false);
                };

                recognition.onend = () => {
                    setIsRecording(false);
                };

                recognitionRef.current = recognition;
                recognition.start();
            } catch (err) {
                console.error('Erro ao iniciar reconhecimento de fala:', err);
                setIsRecording(false);
            }
        }
    };

    const handleOpenFoto = (veiculo) => {
        setVeiculoParaFoto(veiculo);
        setFotoCaptured(null);
        setFotoObservacao('');
        setOpenFotoDialog(true);
    };

    const handleCloseFotoDialog = () => {
        stopCamera();
        if (isRecording && recognitionRef.current) {
            recognitionRef.current.stop();
            setIsRecording(false);
        }
        setOpenFotoDialog(false);
        setVeiculoParaFoto(null);
        setFotoCaptured(null);
        setFotoObservacao('');
    };

    const handleSalvarFoto = async () => {
        if (!fotoCaptured && !fotoObservacao.trim()) {
            enqueueSnackbar('Adicione uma foto ou informe uma observação antes de salvar.', { variant: 'warning' });
            return;
        }
        try {
            setSaving(true);
            await api.post('/veiculos/foto', {
                veiculo_id: veiculoParaFoto?.id,
                placa: veiculoParaFoto?.placa,
                foto_base64: fotoCaptured || null,
                observacao: fotoObservacao.trim(),
                tipo: 'vistoria',
                evento_id: eventoId
            });
            enqueueSnackbar('Foto e vistoria registradas com sucesso.', { variant: 'success' });
            handleCloseFotoDialog();
            loadVeiculos();
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Erro ao registrar foto do veículo.', { variant: 'error' });
        } finally {
            setSaving(false);
        }
    };

    const handleOpenPassagem = (veiculo) => {
        setSelectedVeiculo(veiculo);
        setPassagemData({ tipo: 'entrada', observacao: '' });
        setOpenPassagemDialog(true);
    };

    const handleRegistrarPassagem = async () => {
        try {
            setSaving(true);
            await api.post('/veiculos/passagem', {
                placa: selectedVeiculo.placa,
                tipo: passagemData.tipo,
                observacao: passagemData.observacao,
                evento_id: eventoId
            });
            enqueueSnackbar('Passagem registrada com sucesso.', { variant: 'success' });
            setOpenPassagemDialog(false);
        } catch (error) {
            enqueueSnackbar(error.response?.data?.error || 'Erro ao registrar passagem.', { variant: 'error' });
        } finally {
            setSaving(false);
        }
    };

    const handleOpenHistorico = async (veiculo) => {
        setSelectedVeiculo(veiculo);
        setOpenHistoricoDialog(true);
        loadHistorico(veiculo.id, 0);
    };

    const loadHistorico = async (id, p = 0) => {
        try {
            setLoadingHistorico(true);
            const res = await api.get(`/veiculos/${id}/historico`, {
                params: { page: p + 1, limit: 10 }
            });
            setHistoricoLogs(res.data.data || []);
        } catch (err) {
            enqueueSnackbar('Erro ao carregar histórico.', { variant: 'error' });
        } finally {
            setLoadingHistorico(false);
        }
    };

    const handleOpenDialog = (veiculo = null) => {
        if (veiculo) {
            setSelectedVeiculo(veiculo && veiculo.id ? veiculo : null);
            setFormData({
                placa: veiculo.placa || '',
                marca: veiculo.marca || '',
                modelo: veiculo.modelo || '',
                empresa_id: veiculo.empresa_id || '',
                motorista_id: veiculo.motorista_id || veiculo.pessoa_id || '',
                evento_id: eventoId
            });
        } else {
            setSelectedVeiculo(null);
            setFormData({
                placa: '',
                marca: '',
                modelo: '',
                empresa_id: '',
                motorista_id: '',
                evento_id: eventoId
            });
        }
        setOpenDialog(true);
    };

    const handleCloseDialog = () => {
        setOpenDialog(false);
        setSelectedVeiculo(null);
    };

    const handleSave = async () => {
        if (!formData.placa || !formData.marca || !formData.modelo || !formData.empresa_id) {
            enqueueSnackbar('Preencha os campos obrigatórios (*)', { variant: 'warning' });
            return;
        }

        try {
            setSaving(true);
            if (selectedVeiculo) {
                await api.put(`/veiculos/${selectedVeiculo.id}`, formData);
            } else {
                await api.post('/veiculos', formData);
            }
            enqueueSnackbar('Registro salvo com sucesso.', { variant: 'success' });
            handleCloseDialog();
            loadVeiculos();
        } catch (error) {
            enqueueSnackbar(error.response?.data?.error || 'Erro ao salvar veículo', { variant: 'error' });
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = (id) => {
        setVeiculoToDelete(id);
        setOpenDeleteConfirm(true);
    };

    const confirmDelete = async () => {
        try {
            await api.delete(`/veiculos/${veiculoToDelete}`);
            setOpenDeleteConfirm(false);
            setVeiculoToDelete(null);
            loadVeiculos();
            enqueueSnackbar('Veículo removido.', { variant: 'success' });
        } catch (error) {
            enqueueSnackbar('Falha ao remover veículo.', { variant: 'error' });
        }
    };

    return (
        <Box sx={{ p: { xs: 1.5, sm: 2.5, md: 3 }, maxWidth: '100%', overflowX: 'hidden' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, mb: 3, flexWrap: 'wrap', gap: 2 }}>
                <PageHeader
                    title="Veículos"
                    subtitle="Veículos autorizados e leitura de placas."
                    breadcrumbs={[{ text: 'Dashboard' }, { text: 'Gestão de frotas' }]}
                    sx={{ mb: 0 }}
                />
                <NeonButton
                    startIcon={<AddIcon />}
                    onClick={() => handleOpenDialog()}
                    sx={{ height: 38, minHeight: 38, borderRadius: '8px' }}
                >
                    Novo veículo
                </NeonButton>
            </Box>

            {/* Painel de Consulta Rápida */}
            <GlassCard sx={{ p: { xs: 2, sm: 2.5 }, mb: 3 }}>
                <Stack 
                    direction={{ xs: 'column', sm: 'row' }} 
                    spacing={2} 
                    alignItems={{ xs: 'stretch', sm: 'center' }}
                >
                    <TextField 
                        size="small"
                        placeholder="Consultar placa (EX: ABC1D23)"
                        value={consultaPlaca}
                        onChange={(e) => setConsultaPlaca(e.target.value.toUpperCase())}
                        onKeyPress={(e) => e.key === 'Enter' && handleConsultarPlaca()}
                        sx={{ width: { xs: '100%', sm: 300 } }}
                    />
                    <Button 
                        variant="contained" 
                        onClick={handleConsultarPlaca} 
                        disabled={consultando}
                        startIcon={consultando ? <CircularProgress size={16} /> : <SearchIcon />}
                        sx={{ height: 38, minHeight: 38, borderRadius: '8px', px: 3, fontWeight: 700 }}
                    >
                        Consultar
                    </Button>
                    {resultadoConsulta && (
                        <IconButton onClick={() => setResultadoConsulta(null)} size="small" sx={{ alignSelf: { xs: 'flex-end', sm: 'center' } }}>
                            <CancelIcon fontSize="small" />
                        </IconButton>
                    )}
                </Stack>

                {resultadoConsulta && (
                    <Paper
                        elevation={4}
                        sx={{
                            mt: 2.5,
                            p: { xs: 2, sm: 2.5 },
                            borderRadius: '12px',
                            background: 'linear-gradient(135deg, rgba(10, 22, 40, 0.95) 0%, rgba(13, 31, 56, 0.9) 100%)',
                            backdropFilter: 'blur(16px)',
                            border: resultadoConsulta.autorizado
                                ? '1px solid rgba(0, 230, 118, 0.4)'
                                : (resultadoConsulta.motivo === 'BLOQUEADO'
                                    ? '1px solid rgba(255, 51, 102, 0.4)'
                                    : '1px solid rgba(255, 171, 64, 0.4)'),
                            boxShadow: resultadoConsulta.autorizado
                                ? '0 0 25px rgba(0, 230, 118, 0.15)'
                                : (resultadoConsulta.motivo === 'BLOQUEADO'
                                    ? '0 0 25px rgba(255, 51, 102, 0.15)'
                                    : '0 0 25px rgba(255, 171, 64, 0.15)'),
                            position: 'relative'
                        }}
                    >
                        {/* Header do Card com Status e Botão Fechar */}
                        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5, pb: 1.5, borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
                            <Stack direction="row" spacing={1.5} alignItems="center">
                                {resultadoConsulta.autorizado ? (
                                    <StatusBadge status="autorizado" label="Acesso veicular autorizado" />
                                ) : resultadoConsulta.motivo === 'BLOQUEADO' ? (
                                    <StatusBadge status="bloqueado" label="Acesso bloqueado / com restrições" />
                                ) : (
                                    <StatusBadge status="pendente" label="Veículo não cadastrado no evento" />
                                )}
                            </Stack>
                            <IconButton 
                                size="small" 
                                onClick={() => setResultadoConsulta(null)}
                                sx={{ color: 'text.secondary', '&:hover': { color: '#FF3366', background: 'rgba(255,51,102,0.1)' } }}
                            >
                                <CancelIcon fontSize="small" />
                            </IconButton>
                        </Stack>

                        {/* Banner de Justificativa de Bloqueio (visível para o operador quando bloqueado) */}
                        {resultadoConsulta.veiculo?.status === 'bloqueado' && (
                            <Box sx={{
                                mb: 2,
                                p: 1.5,
                                borderRadius: '8px',
                                background: 'rgba(255, 51, 102, 0.12)',
                                border: '1px solid rgba(255, 51, 102, 0.45)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 1.5
                            }}>
                                <BlockIcon sx={{ color: '#FF3366', fontSize: 26, flexShrink: 0 }} />
                                <Box sx={{ flexGrow: 1 }}>
                                    <Typography variant="caption" sx={{ color: '#FF3366', fontWeight: 700, letterSpacing: '1px', display: 'block' }}>
                                        Justificativa do bloqueio:
                                    </Typography>
                                    <Typography variant="body2" sx={{ color: '#FFFFFF', fontWeight: 600, mt: 0.3 }}>
                                        {resultadoConsulta.veiculo.motivo_bloqueio || resultadoConsulta.justificativa || 'Veículo com restrição cadastrada.'}
                                    </Typography>
                                    {resultadoConsulta.veiculo.bloqueado_em && (
                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', display: 'block', mt: 0.3 }}>
                                            Registrado em: {new Date(resultadoConsulta.veiculo.bloqueado_em).toLocaleString('pt-BR')} {resultadoConsulta.veiculo.bloqueado_por ? `• por ${resultadoConsulta.veiculo.bloqueado_por}` : ''}
                                        </Typography>
                                    )}
                                </Box>
                            </Box>
                        )}

                        {/* Conteúdo do Card */}
                        {resultadoConsulta.veiculo ? (
                            <Grid container spacing={2} alignItems="center">
                                {/* Foto Biométrica do Motorista */}
                                <Grid item xs={12} sm="auto" sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                    <Box sx={{ position: 'relative' }}>
                                        <Avatar
                                            src={resultadoConsulta.veiculo.pessoas?.foto_url}
                                            variant="rounded"
                                            sx={{
                                                width: { xs: 85, sm: 95 },
                                                height: { xs: 85, sm: 95 },
                                                borderRadius: '12px',
                                                border: resultadoConsulta.autorizado ? '2px solid #00FF88' : '2px solid #FF3366',
                                                boxShadow: resultadoConsulta.autorizado ? '0 0 15px rgba(0,230,118,0.25)' : '0 0 15px rgba(255,51,102,0.25)',
                                                bgcolor: 'rgba(0, 212, 255, 0.1)'
                                            }}
                                        >
                                            <PersonIcon sx={{ fontSize: 48, color: '#00D4FF' }} />
                                        </Avatar>
                                    </Box>
                                    <Typography variant="caption" sx={{ mt: 0.8, fontSize: '0.75rem', fontWeight: 700, color: '#00D4FF', letterSpacing: '1px' }}>
                                        Foto do motorista
                                    </Typography>
                                </Grid>

                                {/* Dados do Motorista */}
                                <Grid item xs={12} sm={3.5}>
                                    <Typography variant="caption" sx={{ color: 'rgba(0, 212, 255, 0.8)', fontWeight: 700, letterSpacing: '1px', display: 'block', mb: 0.5 }}>
                                        Motorista vinculado
                                    </Typography>
                                    {resultadoConsulta.veiculo.pessoas ? (
                                        <Box>
                                            <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#FFFFFF', lineHeight: 1.2 }}>
                                                {resultadoConsulta.veiculo.pessoas.nome_completo || resultadoConsulta.veiculo.pessoas.nome}
                                            </Typography>
                                            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)', mt: 0.4 }}>
                                                CPF: <b style={{ color: '#FFFFFF' }}>{resultadoConsulta.veiculo.pessoas.cpf || 'Não informado'}</b>
                                            </Typography>
                                            <Typography variant="caption" sx={{ color: 'rgba(0,212,255,0.85)', display: 'block', mt: 0.2 }}>
                                                Função: {resultadoConsulta.veiculo.pessoas.funcao || 'Motorista / Credenciado'}
                                            </Typography>
                                            {resultadoConsulta.veiculo.pessoas.telefone && (
                                                <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                                                    Tel: {resultadoConsulta.veiculo.pessoas.telefone}
                                                </Typography>
                                            )}
                                        </Box>
                                    ) : (
                                        <Box sx={{ p: 1, borderRadius: '6px', background: 'rgba(255,171,64,0.08)', border: '1px dashed rgba(255,171,64,0.3)' }}>
                                            <Typography variant="body2" sx={{ color: '#FFB800', fontSize: '0.875rem' }}>
                                                Nenhum motorista vinculado a este veículo.
                                            </Typography>
                                            <Button 
                                                size="small" 
                                                onClick={() => handleOpenDialog(resultadoConsulta.veiculo)} 
                                                sx={{ mt: 0.5, p: 0, minHeight: 0, color: '#00D4FF', textTransform: 'none', fontSize: '0.75rem' }}
                                            >
                                                + Vincular motorista agora
                                            </Button>
                                        </Box>
                                    )}
                                </Grid>

                                {/* Dados do Veículo & Placa ANPR */}
                                <Grid item xs={12} sm={3}>
                                    <Typography variant="caption" sx={{ color: 'rgba(0, 212, 255, 0.8)', fontWeight: 700, letterSpacing: '1px', display: 'block', mb: 0.5 }}>
                                        Dados do veículo
                                    </Typography>
                                    
                                    {/* Mini Placa Mercosul Estilizada */}
                                    <Box sx={{
                                        display: 'inline-flex',
                                        flexDirection: 'column',
                                        border: '2px solid #00D4FF',
                                        borderRadius: '6px',
                                        overflow: 'hidden',
                                        background: '#FFFFFF',
                                        minWidth: 120,
                                        boxShadow: '0 0 10px rgba(0,212,255,0.25)',
                                        mb: 0.8
                                    }}>
                                        <Box sx={{ background: '#0099BB', px: 1, py: 0.2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <Typography sx={{ color: '#FFFFFF', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '1px' }}>Brasil</Typography>
                                            <Box sx={{ width: 6, height: 4, bgcolor: '#00FF88', borderRadius: '1px' }} />
                                        </Box>
                                        <Typography sx={{
                                            fontFamily: '"Space Grotesk", sans-serif',
                                            fontWeight: 700,
                                            fontSize: '1.25rem',
                                            color: '#000000',
                                            textAlign: 'center',
                                            px: 1.2,
                                            py: 0.2,
                                            letterSpacing: '2px'
                                        }}>
                                            {resultadoConsulta.veiculo.placa}
                                        </Typography>
                                    </Box>

                                    <Typography variant="body2" sx={{ fontWeight: 600, color: '#FFFFFF' }}>
                                        {resultadoConsulta.veiculo.marca} {resultadoConsulta.veiculo.modelo}
                                    </Typography>
                                    <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                                        Empresa: <span style={{ color: '#FFFFFF' }}>{resultadoConsulta.veiculo.empresas?.nome || 'Não informada'}</span>
                                    </Typography>
                                </Grid>

                                {/* Operações do Veículo Consultados (Botões Compactos e Harmônicos) */}
                                <Grid item xs={12} sm={3.5}>
                                    <Typography variant="caption" sx={{ color: 'rgba(0, 212, 255, 0.8)', fontWeight: 700, letterSpacing: '1px', display: 'block', mb: 0.8 }}>
                                        Ações rápidas
                                    </Typography>
                                    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 0.8 }}>
                                        {/* 1. Passagem */}
                                        <Button
                                            variant="contained"
                                            size="small"
                                            startIcon={<PassagemIcon sx={{ fontSize: 16 }} />}
                                            onClick={() => handleOpenPassagem(resultadoConsulta.veiculo)}
                                            sx={{
                                                height: 32,
                                                minHeight: 32,
                                                borderRadius: '6px',
                                                background: resultadoConsulta.autorizado ? 'linear-gradient(45deg, #00FF88, #00FF88)' : '#0F1E37',
                                                color: '#000000',
                                                fontWeight: 700,
                                                fontSize: '0.75rem',
                                                p: '4px 6px',
                                                whiteSpace: 'nowrap',
                                                '&:hover': { background: '#00FF88' }
                                            }}
                                        >
                                            Passagem
                                        </Button>

                                        {/* 2. Foto / Vistoria */}
                                        <Button
                                            variant="contained"
                                            size="small"
                                            startIcon={<CameraIcon sx={{ fontSize: 16 }} />}
                                            onClick={() => handleOpenFoto(resultadoConsulta.veiculo)}
                                            sx={{
                                                height: 32,
                                                minHeight: 32,
                                                borderRadius: '6px',
                                                background: 'linear-gradient(45deg, #00D4FF, #00D4FF)',
                                                color: '#000000',
                                                fontWeight: 700,
                                                fontSize: '0.75rem',
                                                p: '4px 6px',
                                                whiteSpace: 'nowrap',
                                                '&:hover': { background: '#00D4FF' }
                                            }}
                                        >
                                            Foto / vistoria
                                        </Button>

                                        {/* 3. Bloquear / Liberar */}
                                        {resultadoConsulta.veiculo.status === 'liberado' ? (
                                            <Button
                                                variant="outlined"
                                                size="small"
                                                startIcon={<BlockIcon sx={{ fontSize: 16 }} />}
                                                onClick={() => handleOpenBloqueio(resultadoConsulta.veiculo)}
                                                sx={{
                                                    height: 32,
                                                    minHeight: 32,
                                                    borderRadius: '6px',
                                                    borderColor: 'rgba(255, 51, 102, 0.5)',
                                                    color: '#FF3366',
                                                    fontWeight: 700,
                                                    fontSize: '0.75rem',
                                                    p: '4px 6px',
                                                    whiteSpace: 'nowrap',
                                                    '&:hover': { borderColor: '#FF3366', background: 'rgba(255, 51, 102, 0.1)' }
                                                }}
                                            >
                                                Bloquear
                                            </Button>
                                        ) : (
                                            <Button
                                                variant="outlined"
                                                size="small"
                                                startIcon={<CheckCircleIcon sx={{ fontSize: 16 }} />}
                                                onClick={() => handleDesbloquear(resultadoConsulta.veiculo)}
                                                sx={{
                                                    height: 32,
                                                    minHeight: 32,
                                                    borderRadius: '6px',
                                                    borderColor: 'rgba(0, 230, 118, 0.5)',
                                                    color: '#00FF88',
                                                    fontWeight: 700,
                                                    fontSize: '0.75rem',
                                                    p: '4px 6px',
                                                    whiteSpace: 'nowrap',
                                                    '&:hover': { borderColor: '#00FF88', background: 'rgba(0, 230, 118, 0.1)' }
                                                }}
                                            >
                                                Liberar
                                            </Button>
                                        )}

                                        {/* 4. Histórico */}
                                        <Button
                                            variant="outlined"
                                            size="small"
                                            startIcon={<HistoryIcon sx={{ fontSize: 16 }} />}
                                            onClick={() => handleOpenHistorico(resultadoConsulta.veiculo)}
                                            sx={{
                                                height: 32,
                                                minHeight: 32,
                                                borderRadius: '6px',
                                                borderColor: 'rgba(0, 212, 255, 0.4)',
                                                color: '#00D4FF',
                                                fontSize: '0.75rem',
                                                fontWeight: 700,
                                                p: '4px 6px',
                                                whiteSpace: 'nowrap',
                                                '&:hover': { borderColor: '#00D4FF', background: 'rgba(0,212,255,0.05)' }
                                            }}
                                        >
                                            Histórico
                                        </Button>

                                        {/* 5. Editar */}
                                        <Button
                                            variant="outlined"
                                            size="small"
                                            startIcon={<EditIcon sx={{ fontSize: 16 }} />}
                                            onClick={() => handleOpenDialog(resultadoConsulta.veiculo)}
                                            sx={{
                                                height: 32,
                                                minHeight: 32,
                                                borderRadius: '6px',
                                                borderColor: 'rgba(255, 171, 64, 0.4)',
                                                color: '#FFB800',
                                                fontSize: '0.75rem',
                                                fontWeight: 700,
                                                p: '4px 6px',
                                                whiteSpace: 'nowrap',
                                                '&:hover': { borderColor: '#FFB800', background: 'rgba(255, 171, 64, 0.05)' }
                                            }}
                                        >
                                            Editar
                                        </Button>

                                        {/* 6. Excluir */}
                                        <Button
                                            variant="outlined"
                                            size="small"
                                            startIcon={<DeleteIcon sx={{ fontSize: 16 }} />}
                                            onClick={() => handleDelete(resultadoConsulta.veiculo.id)}
                                            sx={{
                                                height: 32,
                                                minHeight: 32,
                                                borderRadius: '6px',
                                                borderColor: 'rgba(255, 51, 102, 0.3)',
                                                color: 'rgba(255, 51, 102, 0.8)',
                                                fontSize: '0.75rem',
                                                fontWeight: 700,
                                                p: '4px 6px',
                                                whiteSpace: 'nowrap',
                                                '&:hover': { borderColor: '#FF3366', color: '#FF3366', background: 'rgba(255,51,102,0.08)' }
                                            }}
                                        >
                                            Excluir
                                        </Button>
                                    </Box>
                                </Grid>
                            </Grid>
                        ) : (
                            /* Veículo Não Encontrado */
                            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center" justifyContent="space-between">
                                <Stack direction="row" spacing={2} alignItems="center">
                                    <Avatar sx={{ bgcolor: 'rgba(255,171,64,0.15)', color: '#FFB800', width: 48, height: 48 }}>
                                        <CarIcon sx={{ fontSize: 28 }} />
                                    </Avatar>
                                    <Box>
                                        <Typography variant="subtitle1" sx={{ color: '#FFB800', fontWeight: 700 }}>
                                            PLACA NÃO CADASTRADA: {resultadoConsulta.placa || consultaPlaca}
                                        </Typography>
                                        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                            Este veículo não possui autorização ou registro ativo para este evento.
                                        </Typography>
                                    </Box>
                                </Stack>
                                <Button
                                    variant="contained"
                                    startIcon={<AddIcon />}
                                    onClick={() => handleOpenDialog({ placa: (resultadoConsulta.placa || consultaPlaca).toUpperCase() })}
                                    sx={{
                                        height: 38,
                                        minHeight: 38,
                                        borderRadius: '8px',
                                        background: 'linear-gradient(45deg, #00D4FF, #00D4FF)',
                                        color: '#000000',
                                        fontWeight: 700,
                                        whiteSpace: 'nowrap'
                                    }}
                                >
                                    Cadastrar esta placa
                                </Button>
                            </Stack>
                        )}
                    </Paper>
                )}
            </GlassCard>

            <GlassCard glowColor="#00D4FF" sx={{ p: 0 }}>
                <Box sx={{ p: { xs: 2, md: 3 }, pb: 2 }}>
                    <TextField
                        fullWidth
                        size="small"
                        placeholder="Buscar por placa, modelo ou marca..."
                        value={search}
                        onChange={(e) => {
                            setSearch(e.target.value);
                            setPage(0);
                        }}
                        InputProps={{
                            startAdornment: (
                                <InputAdornment position="start">
                                    <SearchIcon sx={{ color: '#00D4FF', fontSize: 20 }} />
                                </InputAdornment>
                            ),
                        }}
                    />
                </Box>

                <DataTable
                    columns={columns}
                    data={veiculos}
                    loading={loading}
                    pagination
                    page={page}
                    rowsPerPage={rowsPerPage}
                    totalCount={totalCount}
                    onPageChange={(p) => setPage(p)}
                    onRowsPerPageChange={(r) => {
                        setRowsPerPage(r);
                        setPage(0);
                    }}
                    sx={{
                        '& .MuiTableHead-root': { background: 'rgba(0,212,255,0.05)' },
                        borderTop: '1px solid rgba(255,255,255,0.05)'
                    }}
                />
            </GlassCard>

            {/* Modal Cadastro/Edição */}
            <Dialog 
                open={openDialog} 
                onClose={handleCloseDialog} 
                maxWidth="sm" 
                fullWidth 
                disableRestoreFocus
                PaperProps={{
                    sx: {
                        maxHeight: { sm: '90dvh' },
                        display: 'flex',
                        flexDirection: 'column'
                    }
                }}
            >
                <DialogTitle sx={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                    {selectedVeiculo ? 'Modificar veículo' : 'Cadastrar veículo'}
                </DialogTitle>
                <DialogContent sx={{ overflowY: 'auto' }}>
                    <Box sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                        <TextField
                            label="Placa de trânsito *"
                            fullWidth
                            value={formData.placa}
                            onChange={(e) => setFormData({ ...formData, placa: e.target.value.toUpperCase() })}
                            placeholder="ABC1D23"
                        />
                        
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                            <TextField
                                label="Marca *"
                                fullWidth
                                value={formData.marca}
                                onChange={(e) => setFormData({ ...formData, marca: e.target.value })}
                                placeholder="Ex: Toyota"
                            />
                            <TextField
                                label="Modelo *"
                                fullWidth
                                value={formData.modelo}
                                onChange={(e) => setFormData({ ...formData, modelo: e.target.value })}
                                placeholder="Ex: Corolla"
                            />
                        </Stack>

                        <FormControl fullWidth>
                            <InputLabel id="empresa-select-label">Empresa / delegação *</InputLabel>
                            <Select
                                labelId="empresa-select-label"
                                value={formData.empresa_id}
                                label="Empresa / delegação *"
                                onChange={(e) => setFormData({ ...formData, empresa_id: e.target.value })}
                            >
                                {empresas.map((emp) => (
                                    <MenuItem key={emp.id} value={emp.id}>{emp.nome}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>

                        <Autocomplete
                            options={pessoasDisponiveis}
                            getOptionLabel={(option) => {
                                if (!option) return '';
                                const nome = option.nome_completo || option.nome || 'Sem Nome';
                                const cpf = option.cpf ? ` (${option.cpf})` : '';
                                return `${nome}${cpf}`;
                            }}
                            isOptionEqualToValue={(option, value) => option?.id === value?.id}
                            value={Array.isArray(pessoasDisponiveis) ? (pessoasDisponiveis.find(p => p.id === formData.motorista_id) || null) : null}
                            onChange={(_, newValue) => setFormData(prev => ({ ...prev, motorista_id: newValue?.id || '' }))}
                            renderOption={(props, option) => (
                                <li {...props} key={option.id}>
                                    <Stack direction="row" spacing={1.5} alignItems="center" sx={{ width: '100%', py: 0.5 }}>
                                        <Avatar 
                                            src={option.foto_url} 
                                            sx={{ width: 34, height: 34, border: '1px solid rgba(0, 212, 255, 0.4)', bgcolor: 'rgba(0, 212, 255, 0.1)' }}
                                        >
                                            <PersonIcon sx={{ fontSize: 18, color: '#00D4FF' }} />
                                        </Avatar>
                                        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                                            <Typography variant="body2" sx={{ fontWeight: 600, color: '#FFFFFF' }} noWrap>
                                                {option.nome_completo || option.nome}
                                            </Typography>
                                            <Typography variant="caption" sx={{ color: 'text.secondary' }} noWrap display="block">
                                                CPF: {option.cpf || 'Não informado'} {option.funcao ? `• ${option.funcao}` : ''} {option.empresa_nome ? `• ${option.empresa_nome}` : ''}
                                            </Typography>
                                        </Box>
                                    </Stack>
                                </li>
                            )}
                            renderInput={(params) => (
                                <TextField 
                                    {...params} 
                                    label="Motorista vinculado" 
                                    placeholder="Busque por nome ou CPF..." 
                                    helperText={formData.empresa_id ? 'Colaboradores da empresa selecionada são priorizados' : 'Selecione uma pessoa para ser o motorista oficial'}
                                />
                            )}
                        />

                    </Box>
                </DialogContent>
                <DialogActions sx={{ p: 2.5, borderTop: '1px solid rgba(255,255,255,0.1)', gap: 1 }}>
                    <Button variant="outlined" onClick={handleCloseDialog} disabled={saving} sx={botaoSecundario}>Cancelar</Button>
                    <NeonButton onClick={handleSave} loading={saving}>{selectedVeiculo ? 'Salvar alterações' : 'Cadastrar veículo'}</NeonButton>
                </DialogActions>
            </Dialog>

            {/* Modal Registrar Passagem */}
            <Dialog 
                open={openPassagemDialog} 
                onClose={() => setOpenPassagemDialog(false)} 
                maxWidth="xs" 
                fullWidth
                PaperProps={{
                    sx: {
                        maxHeight: { sm: '90dvh' },
                        display: 'flex',
                        flexDirection: 'column'
                    }
                }}
            >
                <DialogTitle sx={{ fontWeight: 700 }}>Registrar passagem</DialogTitle>
                <DialogContent sx={{ overflowY: 'auto' }}>
                    <Stack spacing={2.5} sx={{ pt: 1.5 }}>
                        <Typography variant="body2">Registrando movimento para: <b>{selectedVeiculo?.placa}</b></Typography>
                        <FormControl fullWidth>
                            <InputLabel>Tipo de movimento</InputLabel>
                            <Select
                                value={passagemData.tipo}
                                label="Tipo de movimento"
                                onChange={(e) => setPassagemData({ ...passagemData, tipo: e.target.value })}
                            >
                                <MenuItem value="entrada">Entrada</MenuItem>
                                <MenuItem value="saida">Saída</MenuItem>
                            </Select>
                        </FormControl>
                        <TextField 
                            label="Observação"
                            multiline
                            rows={3}
                            value={passagemData.observacao}
                            onChange={(e) => setPassagemData({ ...passagemData, observacao: e.target.value })}
                        />
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ p: 2.5, gap: 1 }}>
                    <Button variant="outlined" onClick={() => setOpenPassagemDialog(false)} sx={botaoSecundario}>Cancelar</Button>
                    <Button variant="contained" color="success" onClick={handleRegistrarPassagem} disabled={saving} sx={{ height: 38, minHeight: 38, borderRadius: '8px', fontWeight: 700 }}>Registrar</Button>
                </DialogActions>
            </Dialog>

            {/* Modal Histórico */}
            <Dialog 
                open={openHistoricoDialog} 
                onClose={() => setOpenHistoricoDialog(false)} 
                maxWidth="md" 
                fullWidth
                PaperProps={{
                    sx: {
                        maxHeight: { sm: '90dvh' },
                        display: 'flex',
                        flexDirection: 'column'
                    }
                }}
            >
                <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="h6" sx={{ fontWeight: 700, fontSize: { xs: '1rem', sm: '1.25rem' } }}>
                        HISTÓRICO DE TRÂNSITO — {selectedVeiculo?.placa}
                    </Typography>
                    <IconButton size="small" onClick={() => setOpenHistoricoDialog(false)}><CancelIcon /></IconButton>
                </DialogTitle>
                <DialogContent dividers sx={{ overflowY: 'auto', p: { xs: 1, sm: 2 } }}>
                    {loadingHistorico ? (
                        <Box sx={{ p: 5, textAlign: 'center' }}><CircularProgress /></Box>
                    ) : (
                        <DataTable 
                            data={historicoLogs}
                            columns={[
                                { 
                                    id: 'created_at', 
                                    label: 'Data/hora', 
                                    format: (v) => format(new Date(v), 'dd/MM/yyyy HH:mm', { locale: ptBR })
                                },
                                { 
                                    id: 'tipo', 
                                    label: 'Tipo',
                                    format: (v) => {
                                        if (v === 'bloqueio') return <StatusBadge status="bloqueado" label="Bloqueio" />;
                                        if (v === 'desbloqueio') return <StatusBadge status="autorizado" label="Liberação" />;
                                        if (v === 'vistoria') return <StatusBadge status="autorizado" label="Vistoria / foto" />;
                                        return <StatusBadge status={v === 'entrada' ? 'autorizado' : 'pendente'} label={comoRotulo(v)} />;
                                    }
                                },
                                { id: 'metodo', label: 'Método', format: (v) => v?.toUpperCase() },
                                { id: 'usuarios', label: 'Operador', format: (v) => v?.nome_completo || 'AUTO (LPR)' },
                                { 
                                    id: 'observacao', 
                                    label: 'Observação / foto',
                                    format: (v) => {
                                        if (!v) return '—';
                                        let parsed = null;
                                        try {
                                            if (typeof v === 'string' && v.trim().startsWith('{')) {
                                                parsed = JSON.parse(v);
                                            }
                                        } catch (_) {
                                            // Ignora erro caso não seja um JSON de vistoria
                                        }

                                        if (parsed) {
                                            return (
                                                <Stack direction="row" spacing={1} alignItems="center">
                                                    {parsed.foto_url && (
                                                        <Box 
                                                            component="img" 
                                                            src={parsed.foto_url} 
                                                            alt="Foto do Veículo"
                                                            onClick={() => setPreviewFotoUrl(parsed.foto_url)}
                                                            sx={{ 
                                                                width: 44, 
                                                                height: 32, 
                                                                objectFit: 'cover', 
                                                                borderRadius: '4px', 
                                                                border: '1px solid #00D4FF', 
                                                                cursor: 'pointer',
                                                                '&:hover': { transform: 'scale(1.1)', transition: 'transform 0.2s' }
                                                            }}
                                                        />
                                                    )}
                                                    <Typography variant="caption" sx={{ color: '#FFFFFF' }}>
                                                        {parsed.texto || (parsed.foto_url ? 'Foto de vistoria' : '—')}
                                                    </Typography>
                                                </Stack>
                                            );
                                        }
                                        return <Typography variant="caption">{v}</Typography>;
                                    }
                                }
                            ]}
                        />
                    )}
                </DialogContent>
                <DialogActions sx={{ p: 2 }}>
                    <Button variant="outlined" onClick={() => setOpenHistoricoDialog(false)} sx={botaoSecundario}>Fechar</Button>
                </DialogActions>
            </Dialog>

            {/* Confirmar Exclusão */}
            <Dialog 
                open={openDeleteConfirm} 
                onClose={() => setOpenDeleteConfirm(false)} 
                maxWidth="xs" 
                fullWidth
                PaperProps={{
                    sx: {
                        maxHeight: { sm: '90dvh' }
                    }
                }}
            >
                <DialogTitle sx={{ color: '#FF3366', fontWeight: 700 }}>Confirmar exclusão</DialogTitle>
                <DialogContent>
                    A remoção desta placa impedirá o reconhecimento automático e invalidará o cadastro de trânsito vinculado.
                </DialogContent>
                <DialogActions sx={{ p: 2.5, gap: 1 }}>
                    <Button variant="outlined" onClick={() => setOpenDeleteConfirm(false)} sx={botaoSecundario}>Cancelar</Button>
                    <Button onClick={confirmDelete} sx={{ color: '#FF3366', fontWeight: 'bold', height: 38, minHeight: 38, borderRadius: '8px' }} variant="outlined">Excluir definitivamente</Button>
                </DialogActions>
            </Dialog>

            {/* Modal Bloquear Veículo com Justificativa */}
            <Dialog
                open={openBloqueioDialog}
                onClose={() => setOpenBloqueioDialog(false)}
                maxWidth="xs"
                fullWidth
                disableRestoreFocus
                PaperProps={{
                    sx: {
                        border: '1px solid rgba(255, 51, 102, 0.4)',
                        boxShadow: '0 0 25px rgba(255, 51, 102, 0.2)'
                    }
                }}
            >
                <DialogTitle sx={{ color: '#FF3366', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <BlockIcon sx={{ color: '#FF3366' }} />
                    BLOQUEAR ACESSO — {veiculoParaBloquear?.placa}
                </DialogTitle>
                <DialogContent>
                    <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
                        Informe o motivo ou justificativa para bloquear este veículo. A restrição e a justificativa ficarão visíveis para todos os operadores no momento da consulta.
                    </Typography>
                    <TextField
                        autoFocus
                        fullWidth
                        multiline
                        rows={3}
                        label="Justificativa do bloqueio *"
                        placeholder="Ex: Mandado judicial, documentação irregular, determinação da coordenação..."
                        value={justificativaBloqueio}
                        onChange={(e) => setJustificativaBloqueio(e.target.value)}
                        helperText="Campo obrigatório para fins de auditoria e segurança."
                    />
                </DialogContent>
                <DialogActions sx={{ p: 2, borderTop: '1px solid rgba(255,255,255,0.1)', gap: 1 }}>
                    <Button variant="outlined" onClick={() => setOpenBloqueioDialog(false)} disabled={saving} sx={botaoSecundario}>
                        Cancelar
                    </Button>
                    <Button
                        onClick={handleConfirmarBloqueio}
                        disabled={saving || !justificativaBloqueio.trim()}
                        variant="contained"
                        sx={{
                            height: 38,
                            borderRadius: '8px',
                            background: 'linear-gradient(45deg, #FF3366, #FF3366)',
                            color: '#FFFFFF',
                            fontWeight: 700,
                            '&:hover': { background: '#FF3366' }
                        }}
                    >
                        {saving ? <CircularProgress size={20} color="inherit" /> : 'Confirmar bloqueio'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Modal Foto / Vistoria do Veículo com Transcrição por Áudio */}
            <Dialog
                open={openFotoDialog}
                onClose={handleCloseFotoDialog}
                maxWidth="sm"
                fullWidth
                disableRestoreFocus
            >
                <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                    <Stack direction="row" spacing={1} alignItems="center">
                        <CameraIcon sx={{ }} />
                        <Typography variant="h6" sx={{ fontWeight: 700, fontSize: { xs: '1rem', sm: '1.25rem' } }}>
                            VISTORIA / REGISTRAR FOTO — {veiculoParaFoto?.placa}
                        </Typography>
                    </Stack>
                    <IconButton size="small" onClick={handleCloseFotoDialog}><CancelIcon fontSize="small" /></IconButton>
                </DialogTitle>
                <DialogContent sx={{ pt: 2.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {/* Área de Câmera ou Imagem Capturada */}
                    <Box sx={{
                        width: '100%',
                        height: 220,
                        borderRadius: '8px',
                        background: 'rgba(0,0,0,0.5)',
                        border: '2px dashed rgba(0,212,255,0.3)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        position: 'relative',
                        overflow: 'hidden'
                    }}>
                        {fotoCaptured ? (
                            <>
                                <Box component="img" src={fotoCaptured} alt="Foto Capturada" sx={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                <Button
                                    size="small"
                                    variant="contained"
                                    onClick={() => { setFotoCaptured(null); startCamera(); }}
                                    sx={{ position: 'absolute', bottom: 10, right: 10, height: 30, fontSize: '0.75rem', background: 'rgba(0,0,0,0.7)', borderRadius: '6px' }}
                                >
                                    Tirar outra foto
                                </Button>
                            </>
                        ) : cameraActive ? (
                            <>
                                <video ref={videoRef} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                <Stack direction="row" spacing={1} sx={{ position: 'absolute', bottom: 10 }}>
                                    <Button
                                        variant="contained"
                                        size="small"
                                        onClick={capturePhoto}
                                        startIcon={<PhotoCameraIcon />}
                                        sx={{ height: 34, background: '#00FF88', color: '#000000', fontWeight: 700, borderRadius: '6px' }}
                                    >
                                        Capturar
                                    </Button>
                                    <Button
                                        variant="outlined"
                                        size="small"
                                        onClick={stopCamera}
                                        sx={{ height: 34, color: '#FFFFFF', borderColor: '#FFFFFF', borderRadius: '6px' }}
                                    >
                                        Fechar câmera
                                    </Button>
                                </Stack>
                            </>
                        ) : (
                            <Stack spacing={1.5} alignItems="center">
                                <CameraIcon sx={{ fontSize: 44, color: '#00D4FF', opacity: 0.7 }} />
                                <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center' }}>
                                    Tire uma foto ao vivo no portão ou anexe da galeria
                                </Typography>
                                <Stack direction="row" spacing={1.5}>
                                    <Button
                                        variant="contained"
                                        size="small"
                                        startIcon={<PhotoCameraIcon />}
                                        onClick={startCamera}
                                        sx={{ height: 34, borderRadius: '6px', background: 'linear-gradient(45deg, #00D4FF, #00D4FF)', color: '#000000', fontWeight: 700 }}
                                    >
                                        Abrir câmera
                                    </Button>
                                    <Button
                                        variant="outlined"
                                        size="small"
                                        component="label"
                                        sx={{ height: 34, borderRadius: '6px', borderColor: 'rgba(0,212,255,0.4)', color: '#00D4FF' }}
                                    >
                                        Anexar arquivo
                                        <input type="file" accept="image/*" hidden onChange={handleFileUpload} />
                                    </Button>
                                </Stack>
                            </Stack>
                        )}
                    </Box>

                    {/* Campo de Texto com Transcrição por Áudio */}
                    <Box>
                        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.8 }}>
                            <Typography variant="caption" sx={{ color: 'rgba(0, 212, 255, 0.8)', fontWeight: 700, letterSpacing: '1px', }}>
                                Observação / Descrição da Vistoria
                            </Typography>
                            
                            {/* Botão de Transcrição por Áudio */}
                            <Button
                                size="small"
                                variant={isRecording ? "contained" : "outlined"}
                                color={isRecording ? "error" : "primary"}
                                startIcon={isRecording ? <MicOffIcon /> : <MicIcon />}
                                onClick={handleToggleRecording}
                                sx={{
                                    height: 28,
                                    minHeight: 28,
                                    fontSize: '0.75rem',
                                    fontWeight: 700,
                                    borderRadius: '14px',
                                    px: 1.5,
                                    borderColor: isRecording ? '#FF3366' : '#00D4FF',
                                    color: isRecording ? '#FFFFFF' : '#00D4FF',
                                    animation: isRecording ? 'pulse 1.5s infinite' : 'none',
                                    '@keyframes pulse': {
                                        '0%': { transform: 'scale(1)', boxShadow: '0 0 0 0 rgba(255, 51, 102, 0.7)' },
                                        '70%': { transform: 'scale(1.05)', boxShadow: '0 0 0 8px rgba(255, 51, 102, 0)' },
                                        '100%': { transform: 'scale(1)', boxShadow: '0 0 0 0 rgba(255, 51, 102, 0)' }
                                    }
                                }}
                            >
                                {isRecording ? 'Ouvindo... (clique p/ parar)' : 'Ditar por voz / áudio'}
                            </Button>
                        </Stack>

                        <TextField
                            fullWidth
                            multiline
                            rows={3}
                            placeholder="Digite observações sobre o veículo (carga, avarias, etc.) ou clique em 'DITAR POR VOZ / ÁUDIO' para falar..."
                            value={fotoObservacao}
                            onChange={(e) => setFotoObservacao(e.target.value)}
                            helperText={isRecording ? "Escutando... Fale claramente ao microfone." : "Texto digitado ou transcrito por áudio."}
                        />
                    </Box>
                </DialogContent>
                <DialogActions sx={{ p: 2.5, borderTop: '1px solid rgba(255,255,255,0.1)', gap: 1 }}>
                    <Button variant="outlined" onClick={handleCloseFotoDialog} disabled={saving} sx={botaoSecundario}>
                        Cancelar
                    </Button>
                    <NeonButton onClick={handleSalvarFoto} loading={saving} sx={{ height: 38, borderRadius: '8px' }}>
                        Salvar registro
                    </NeonButton>
                </DialogActions>
            </Dialog>

            {/* Lightbox / Zoom da Foto */}
            <Dialog
                open={Boolean(previewFotoUrl)}
                onClose={() => setPreviewFotoUrl(null)}
                maxWidth="md"
                PaperProps={{ sx: { overflow: 'hidden' } }}
            >
                <Box sx={{ position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    <IconButton
                        onClick={() => setPreviewFotoUrl(null)}
                        sx={{ position: 'absolute', top: 10, right: 10, background: 'rgba(0,0,0,0.7)', color: '#FFFFFF' }}
                    >
                        <CancelIcon />
                    </IconButton>
                    <Box component="img" src={previewFotoUrl} alt="Foto Ampliada" sx={{ maxWidth: '90vw', maxHeight: '85dvh', borderRadius: '8px', border: '2px solid #00D4FF' }} />
                </Box>
            </Dialog>
        </Box>
    );
};

export default Veiculos;
