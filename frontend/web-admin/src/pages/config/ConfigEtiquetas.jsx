import React, { useState, useEffect, useRef } from 'react';
import {
    Box, Typography, Grid, TextField, IconButton, Paper, Stack,
    Button, Tooltip, MenuItem, FormControl, InputLabel, Select,
    Divider, Slider, Switch, FormControlLabel
} from '@mui/material';
import {
    Save as SaveIcon,
    Delete as DeleteIcon,
    Style as StyleIcon,
    Print as PrintIcon,
    Image as ImageIcon,
    AccountBox as FotoIcon,
    CropLandscape as ShapeIcon,
    QrCode2 as QrIcon,
    FormatColorText as TextIcon,
    CloudUpload as UploadIcon,
    LayersClear as ClearBgIcon,
    GridOn as GridOnIcon,
    GridOff as GridOffIcon,
    Lock as LockIcon,
    LockOpen as LockOpenIcon,
    CenterFocusStrong as CenterIcon
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import { Rnd } from 'react-rnd';
import { useSearchParams } from 'react-router-dom';
import api from '../../services/api';
import GlassCard from '../../components/common/GlassCard';
import NeonButton from '../../components/common/NeonButton';
import PageHeader from '../../components/common/PageHeader';
import { montarHtmlEtiqueta, imprimirHtml, limparCacheEtiqueta } from '../../services/etiquetaService';
import { botaoSecundario } from '../../styles/tokens';

const DADOS_EXEMPLO = {
    nome_pessoa: 'MARIA DA SILVA',
    nome_completo: 'MARIA DA SILVA SANTOS',
    empresa: 'EMPRESA EXEMPLO',
    funcao: 'COORDENADORA',
    cpf: '123.456.789-09',
    pulseira: '1024',
    evento: 'HISTÓRIAS CURITIBA',
    data: new Date().toLocaleDateString('pt-BR'),
    qr_code: 'EXEMPLO-1024',
    qr_imagem: null,
    foto_url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&auto=format&fit=crop&q=80',
    exemplo: true
};

const PRESETS = [
    { label: 'Zebra TLP (100 × 150 mm)', width: 100, height: 150, value: 'zebra_tlp2844' },
    { label: 'Crachá PVC Padrão CR-80 (54 × 86 mm)', width: 54, height: 86, value: 'cr80_vertical' },
    { label: 'Crachá PVC Horizontal CR-80 (86 × 54 mm)', width: 86, height: 54, value: 'cr80_horizontal' },
    { label: 'Credencial Grande Festival (100 × 140 mm)', width: 100, height: 140, value: 'festival_100x140' },
    { label: 'Etiqueta Adesiva (100 × 50 mm)', width: 100, height: 50, value: 'adesiva_100x50' },
    { label: 'Etiqueta Pequena (60 × 40 mm)', width: 60, height: 40, value: 'pequena_60x40' },
    { label: 'Customizado...', width: 100, height: 150, value: 'custom' }
];

const ConfigEtiquetas = () => {
    const [searchParams] = useSearchParams();
    const eventoId = searchParams.get('evento_id') || localStorage.getItem('active_evento_id');
    const fileBgInputRef = useRef(null);
    const fileElementInputRef = useRef(null);

    const [config, setConfig] = useState({
        layout: 'zebra_tlp2844',
        width: 100,
        height: 150,
        background_url: ''
    });

    const [elements, setElements] = useState([
        { id: '1', type: 'text', content: '{nome_pessoa}', x: 10, y: 15, width: 220, height: 35, fontSize: 18, fontWeight: 'bold', color: '#000000', textAlign: 'center' },
        { id: '2', type: 'text', content: '{funcao}', x: 10, y: 55, width: 220, height: 25, fontSize: 14, fontWeight: 'normal', color: '#555555', textAlign: 'center' },
        { id: '3', type: 'qrcode', content: '{qr_code}', x: 75, y: 95, width: 90, height: 90 },
        { id: '4', type: 'foto', content: '{foto_url}', x: 80, y: 200, width: 80, height: 80, borderRadius: 8, borderColor: '#00D4FF', borderWidth: 2, lockAspectRatio: true }
    ]);

    const [selectedId, setSelectedId] = useState(null);
    const [_loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const { enqueueSnackbar } = useSnackbar();

    // Recursos de Design estilo Canva / Figma
    const [showGrid, setShowGrid] = useState(true);
    const [gridSize, setGridSize] = useState(10); // pixels
    const [snapToGrid, setSnapToGrid] = useState(true);
    const [smartGuides, setSmartGuides] = useState({ vertical: null, horizontal: null });

    const scaleFactor = 3;
    const canvasWidth = config.width * scaleFactor;
    const canvasHeight = config.height * scaleFactor;

    useEffect(() => {
        if (!eventoId) return;
        const fetchLayout = async () => {
            try {
                setLoading(true);
                const response = await api.get('/config/etiquetas', { params: { evento_id: eventoId } });
                if (response.data.data) {
                    if (response.data.data.papel_config) {
                        setConfig(response.data.data.papel_config);
                    }
                    if (response.data.data.elementos && Array.isArray(response.data.data.elementos)) {
                        setElements(response.data.data.elementos);
                    }
                }
            } catch (error) {
                enqueueSnackbar('Falha ao carregar layout de etiqueta.', { variant: 'error' });
            } finally {
                setLoading(false);
            }
        };
        fetchLayout();
    }, [eventoId, enqueueSnackbar]);

    const handleChangePreset = (presetValue) => {
        const found = PRESETS.find(p => p.value === presetValue);
        if (found) {
            setConfig(prev => ({
                ...prev,
                layout: presetValue,
                width: found.width,
                height: found.height
            }));
        } else {
            setConfig(prev => ({ ...prev, layout: presetValue }));
        }
    };

    const handleChangeConfig = (field, value) => {
        setConfig(prev => ({ ...prev, [field]: value }));
    };

    const handleUploadBackground = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            const base64 = event.target.result;
            setConfig(prev => ({ ...prev, background_url: base64 }));
            enqueueSnackbar('Arte de fundo carregada com sucesso!', { variant: 'success' });
        };
        reader.readAsDataURL(file);
    };

    const handleRemoverBackground = () => {
        setConfig(prev => ({ ...prev, background_url: '' }));
    };

    const addElement = (type) => {
        const id = Date.now().toString();
        let newEl = {
            id,
            type,
            x: 20,
            y: 20,
            width: 150,
            height: 35,
            lockAspectRatio: false
        };

        if (type === 'text') {
            newEl = {
                ...newEl,
                content: '{nome_pessoa}',
                fontSize: 16,
                fontWeight: 'bold',
                color: '#000000',
                textAlign: 'left'
            };
        } else if (type === 'qrcode') {
            newEl = {
                ...newEl,
                content: '{qr_code}',
                width: 80,
                height: 80,
                lockAspectRatio: true
            };
        } else if (type === 'foto') {
            newEl = {
                ...newEl,
                content: '{foto_url}',
                width: 75,
                height: 75,
                borderRadius: 6,
                borderColor: '#00D4FF',
                borderWidth: 2,
                lockAspectRatio: true
            };
        } else if (type === 'shape') {
            newEl = {
                ...newEl,
                width: 200,
                height: 25,
                backgroundColor: '#00D4FF',
                borderRadius: 4,
                opacity: 1
            };
        } else if (type === 'image') {
            fileElementInputRef.current?.click();
            return;
        }

        setElements(prev => [...prev, newEl]);
        setSelectedId(id);
    };

    const handleUploadElementImage = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            const base64 = event.target.result;
            const newEl = {
                id: Date.now().toString(),
                type: 'image',
                content: base64,
                x: 20,
                y: 20,
                width: 80,
                height: 80,
                borderRadius: 0,
                opacity: 1,
                lockAspectRatio: true
            };
            setElements(prev => [...prev, newEl]);
            setSelectedId(newEl.id);
            enqueueSnackbar('Imagem adicionada ao crachá!', { variant: 'success' });
        };
        reader.readAsDataURL(file);
    };

    const updateElement = (id, newProps) => {
        setElements(elements.map(el => el.id === id ? { ...el, ...newProps } : el));
    };

    const deleteElement = (id) => {
        setElements(elements.filter(el => el.id !== id));
        if (selectedId === id) setSelectedId(null);
    };

    // Alinhamento Inteligente ao Centro
    const centralizarElemento = (eixo = 'horizontal') => {
        if (!selectedId) return;
        const el = elements.find(item => item.id === selectedId);
        if (!el) return;

        if (eixo === 'horizontal') {
            const newX = Math.round((canvasWidth - el.width) / 2);
            updateElement(selectedId, { x: newX });
            setSmartGuides({ vertical: canvasWidth / 2, horizontal: null });
            setTimeout(() => setSmartGuides({ vertical: null, horizontal: null }), 1200);
        } else if (eixo === 'vertical') {
            const newY = Math.round((canvasHeight - el.height) / 2);
            updateElement(selectedId, { y: newY });
            setSmartGuides({ vertical: null, horizontal: canvasHeight / 2 });
            setTimeout(() => setSmartGuides({ vertical: null, horizontal: null }), 1200);
        } else if (eixo === 'ambos') {
            const newX = Math.round((canvasWidth - el.width) / 2);
            const newY = Math.round((canvasHeight - el.height) / 2);
            updateElement(selectedId, { x: newX, y: newY });
            setSmartGuides({ vertical: canvasWidth / 2, horizontal: canvasHeight / 2 });
            setTimeout(() => setSmartGuides({ vertical: null, horizontal: null }), 1200);
        }
    };

    // Detecção de Linhas Magnéticas (Guia Inteligente estilo Canva)
    const handleDrag = (_e, d, el) => {
        const elCenterX = d.x + el.width / 2;
        const elCenterY = d.y + el.height / 2;
        const canvasCenterX = canvasWidth / 2;
        const canvasCenterY = canvasHeight / 2;

        const threshold = 6;
        let guideV = null;
        let guideH = null;

        // Alinhamento com o Centro do Canvas
        if (Math.abs(elCenterX - canvasCenterX) <= threshold) {
            guideV = canvasCenterX;
        }
        if (Math.abs(elCenterY - canvasCenterY) <= threshold) {
            guideH = canvasCenterY;
        }

        // Alinhamento com outros elementos
        elements.forEach(other => {
            if (other.id === el.id) return;
            const otherCenterX = other.x + other.width / 2;
            const otherCenterY = other.y + other.height / 2;

            if (Math.abs(elCenterX - otherCenterX) <= threshold) {
                guideV = otherCenterX;
            }
            if (Math.abs(d.x - other.x) <= threshold) {
                guideV = other.x;
            }
            if (Math.abs(elCenterY - otherCenterY) <= threshold) {
                guideH = otherCenterY;
            }
            if (Math.abs(d.y - other.y) <= threshold) {
                guideH = other.y;
            }
        });

        setSmartGuides({ vertical: guideV, horizontal: guideH });
    };

    const handleDragStop = (_e, d, elId) => {
        setSmartGuides({ vertical: null, horizontal: null });
        let finalX = d.x;
        let finalY = d.y;

        if (snapToGrid) {
            finalX = Math.round(d.x / gridSize) * gridSize;
            finalY = Math.round(d.y / gridSize) * gridSize;
        }

        updateElement(elId, { x: finalX, y: finalY });
    };

    const handleSave = async () => {
        if (!eventoId) {
            enqueueSnackbar('Selecione primeiro um evento ativo no menu superior.', { variant: 'warning' });
            return;
        }

        const payload = {
            evento_id: eventoId,
            papel_config: config,
            elementos: elements
        };

        try {
            setSaving(true);
            await api.post('/config/etiquetas', payload);
            limparCacheEtiqueta(eventoId);
            enqueueSnackbar(`Layout salvo com sucesso para ${localStorage.getItem('active_evento_nome') || 'o evento'}!`, { variant: 'success' });
        } catch (error) {
            enqueueSnackbar('Falha ao salvar o layout da etiqueta. ' + (error.response?.data?.details || ''), { variant: 'error' });
        } finally {
            setSaving(false);
        }
    };

    const handleImprimirTeste = () => {
        imprimirHtml(montarHtmlEtiqueta({ papel_config: config, elementos: elements }, DADOS_EXEMPLO));
    };

    const selectedElement = elements.find(el => el.id === selectedId);

    return (
        <Box sx={{ p: { xs: 1.5, sm: 2.5, md: 4 } }}>
            <PageHeader
                title="Etiquetas e crachás"
                subtitle="Editor visual estilo Canva: grade inteligente, alinhamento magnético e artes completas de crachá."
                breadcrumbs={[{ text: 'Configurações' }, { text: 'Impressão & etiquetas' }]}
            />

            {/* Inputs de arquivo ocultos */}
            <input
                type="file"
                ref={fileBgInputRef}
                style={{ display: 'none' }}
                accept="image/png, image/jpeg, image/jpg"
                onChange={handleUploadBackground}
            />
            <input
                type="file"
                ref={fileElementInputRef}
                style={{ display: 'none' }}
                accept="image/png, image/jpeg, image/jpg, image/svg+xml"
                onChange={handleUploadElementImage}
            />

            <Grid container spacing={3} sx={{ mt: 0.5 }}>
                {/* COLUNA ESQUERDA: CONFIGURAÇÕES, FERRAMENTAS E PROPRIEDADES */}
                <Grid item xs={12} md={4.5} lg={4}>
                    <Stack spacing={2.5}>
                        {/* 1. PARÂMETROS DO CRACHÁ / PAPEL */}
                        <GlassCard sx={{ p: 2.5 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2, gap: 1.5 }}>
                                <StyleIcon sx={{ color: '#00D4FF', fontSize: 22 }} />
                                <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#FFFFFF' }}>
                                    Formato e Dimensões
                                </Typography>
                            </Box>

                            <Stack spacing={2}>
                                <FormControl fullWidth size="small">
                                    <InputLabel id="preset-label" sx={{ color: 'rgba(255,255,255,0.7)' }}>Padrão / Impressora</InputLabel>
                                    <Select
                                        labelId="preset-label"
                                        label="Padrão / Impressora"
                                        value={config.layout || 'zebra_tlp2844'}
                                        onChange={(e) => handleChangePreset(e.target.value)}
                                        sx={{ bgcolor: 'rgba(0,0,0,0.3)', color: '#FFFFFF', borderRadius: 1.5 }}
                                    >
                                        {PRESETS.map(p => (
                                            <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>

                                <Grid container spacing={1.5}>
                                    <Grid item xs={6}>
                                        <TextField
                                            label="Largura (mm)"
                                            type="number"
                                            fullWidth
                                            size="small"
                                            value={config.width}
                                            onChange={(e) => handleChangeConfig('width', Number(e.target.value))}
                                        />
                                    </Grid>
                                    <Grid item xs={6}>
                                        <TextField
                                            label="Altura (mm)"
                                            type="number"
                                            fullWidth
                                            size="small"
                                            value={config.height}
                                            onChange={(e) => handleChangeConfig('height', Number(e.target.value))}
                                        />
                                    </Grid>
                                </Grid>

                                <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)' }} />

                                {/* Upload da Arte de Fundo */}
                                <Box>
                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)', fontWeight: 700, display: 'block', mb: 1 }}>
                                        Arte do Evento / Fundo do Crachá:
                                    </Typography>
                                    <Stack direction="row" spacing={1}>
                                        <Button
                                            variant="outlined"
                                            size="small"
                                            startIcon={<UploadIcon />}
                                            onClick={() => fileBgInputRef.current?.click()}
                                            sx={{
                                                fontSize: '0.75rem',
                                                color: '#00D4FF',
                                                borderColor: 'rgba(0, 212, 255, 0.4)',
                                                borderRadius: 1.5,
                                                textTransform: 'none',
                                                flex: 1
                                            }}
                                        >
                                            {config.background_url ? 'Trocar Arte' : 'Subir Arte (PNG/JPG)'}
                                        </Button>

                                        {config.background_url && (
                                            <Tooltip title="Remover arte de fundo">
                                                <IconButton
                                                    size="small"
                                                    color="error"
                                                    onClick={handleRemoverBackground}
                                                    sx={{ border: '1px solid rgba(255, 51, 102, 0.3)', borderRadius: 1.5 }}
                                                >
                                                    <ClearBgIcon fontSize="small" />
                                                </IconButton>
                                            </Tooltip>
                                        )}
                                    </Stack>
                                    {config.background_url && (
                                        <Typography variant="caption" sx={{ color: '#00FF88', fontSize: '0.7rem', mt: 0.5, display: 'block' }}>
                                            ✓ Arte do crachá ativa no fundo
                                        </Typography>
                                    )}
                                </Box>
                            </Stack>
                        </GlassCard>

                        {/* 2. ADICIONAR ELEMENTOS */}
                        <GlassCard sx={{ p: 2.5 }}>
                            <Typography variant="subtitle2" sx={{ color: '#00D4FF', fontWeight: 700, mb: 1.5 }}>
                                Adicionar Elementos
                            </Typography>
                            <Grid container spacing={1}>
                                <Grid item xs={6}>
                                    <Button
                                        fullWidth
                                        variant="outlined"
                                        size="small"
                                        startIcon={<TextIcon sx={{ fontSize: 18 }} />}
                                        onClick={() => addElement('text')}
                                        sx={{ ...botaoSecundario, fontSize: '0.75rem', py: 0.8 }}
                                    >
                                        Texto / Dado
                                    </Button>
                                </Grid>
                                <Grid item xs={6}>
                                    <Button
                                        fullWidth
                                        variant="outlined"
                                        size="small"
                                        startIcon={<QrIcon sx={{ fontSize: 18 }} />}
                                        onClick={() => addElement('qrcode')}
                                        sx={{ ...botaoSecundario, fontSize: '0.75rem', py: 0.8 }}
                                    >
                                        QR Code
                                    </Button>
                                </Grid>
                                <Grid item xs={6}>
                                    <Button
                                        fullWidth
                                        variant="outlined"
                                        size="small"
                                        startIcon={<FotoIcon sx={{ fontSize: 18 }} />}
                                        onClick={() => addElement('foto')}
                                        sx={{ ...botaoSecundario, fontSize: '0.75rem', py: 0.8 }}
                                    >
                                        Foto da Pessoa
                                    </Button>
                                </Grid>
                                <Grid item xs={6}>
                                    <Button
                                        fullWidth
                                        variant="outlined"
                                        size="small"
                                        startIcon={<ImageIcon sx={{ fontSize: 18 }} />}
                                        onClick={() => addElement('image')}
                                        sx={{ ...botaoSecundario, fontSize: '0.75rem', py: 0.8 }}
                                    >
                                        Logo / Imagem
                                    </Button>
                                </Grid>
                                <Grid item xs={12}>
                                    <Button
                                        fullWidth
                                        variant="outlined"
                                        size="small"
                                        startIcon={<ShapeIcon sx={{ fontSize: 18 }} />}
                                        onClick={() => addElement('shape')}
                                        sx={{ ...botaoSecundario, fontSize: '0.75rem', py: 0.8 }}
                                    >
                                        Tarja / Barra Colorida (Setor)
                                    </Button>
                                </Grid>
                            </Grid>
                        </GlassCard>

                        {/* 3. PROPRIEDADES DO ELEMENTO SELECIONADO */}
                        <GlassCard sx={{ p: 2.5 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                                <Typography variant="subtitle2" sx={{ color: 'rgba(255,255,255,0.7)', fontWeight: 700 }}>
                                    Propriedades da Seleção
                                </Typography>
                                {selectedElement && (
                                    <IconButton
                                        size="small"
                                        color="error"
                                        onClick={() => deleteElement(selectedElement.id)}
                                        title="Excluir elemento"
                                        sx={{ bgcolor: 'rgba(255, 51, 102, 0.1)' }}
                                    >
                                        <DeleteIcon fontSize="small" />
                                    </IconButton>
                                )}
                            </Box>

                            {selectedElement ? (
                                <Stack spacing={1.5} sx={{ p: 1.5, background: 'rgba(0,0,0,0.3)', borderRadius: 1.5, border: '1px solid rgba(0, 212, 255, 0.2)' }}>
                                    {/* Botões de Alinhamento Rápido estilo Canva */}
                                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', p: 0.5, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 1 }}>
                                        <Typography variant="caption" sx={{ color: '#00D4FF', fontWeight: 700 }}>
                                            Alinhamento Rápido:
                                        </Typography>
                                        <Stack direction="row" spacing={0.5}>
                                            <Tooltip title="Centralizar Horizontalmente">
                                                <Button size="small" onClick={() => centralizarElemento('horizontal')} sx={{ minWidth: 32, px: 0.8, fontSize: '0.7rem', color: '#FFFFFF', border: '1px solid rgba(255,255,255,0.2)' }}>
                                                    Centro X
                                                </Button>
                                            </Tooltip>
                                            <Tooltip title="Centralizar Verticalmente">
                                                <Button size="small" onClick={() => centralizarElemento('vertical')} sx={{ minWidth: 32, px: 0.8, fontSize: '0.7rem', color: '#FFFFFF', border: '1px solid rgba(255,255,255,0.2)' }}>
                                                    Centro Y
                                                </Button>
                                            </Tooltip>
                                            <Tooltip title="Centro Total">
                                                <IconButton size="small" onClick={() => centralizarElemento('ambos')} sx={{ color: '#00D4FF', border: '1px solid rgba(0, 212, 255, 0.3)' }}>
                                                    <CenterIcon fontSize="small" />
                                                </IconButton>
                                            </Tooltip>
                                        </Stack>
                                    </Box>

                                    {/* Proporção Real / Livre para Fotos e Imagens */}
                                    {(selectedElement.type === 'foto' || selectedElement.type === 'image' || selectedElement.type === 'qrcode') && (
                                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', bgcolor: 'rgba(0, 212, 255, 0.05)', p: 1, borderRadius: 1 }}>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                {selectedElement.lockAspectRatio ? <LockIcon sx={{ fontSize: 18, color: '#00FF88' }} /> : <LockOpenIcon sx={{ fontSize: 18, color: '#FFB800' }} />}
                                                <Typography variant="caption" sx={{ color: '#FFFFFF', fontWeight: 600 }}>
                                                    {selectedElement.lockAspectRatio ? 'Proporção Real Travada' : 'Redimensionamento Livre (Esticar)'}
                                                </Typography>
                                            </Box>
                                            <Button
                                                size="small"
                                                variant="outlined"
                                                onClick={() => updateElement(selectedElement.id, { lockAspectRatio: !selectedElement.lockAspectRatio })}
                                                sx={{ fontSize: '0.68rem', py: 0.2, px: 1, color: '#00D4FF', borderColor: 'rgba(0,212,255,0.3)', textTransform: 'none' }}
                                            >
                                                {selectedElement.lockAspectRatio ? 'Permitir Esticar' : 'Travar Proporção'}
                                            </Button>
                                        </Box>
                                    )}

                                    {/* Propriedades para TEXTO */}
                                    {selectedElement.type === 'text' && (
                                        <>
                                            <TextField
                                                label="Conteúdo / Tag"
                                                fullWidth
                                                size="small"
                                                value={selectedElement.content}
                                                onChange={e => updateElement(selectedElement.id, { content: e.target.value })}
                                                helperText="Tags: {nome_pessoa}, {funcao}, {empresa}, {cpf}, {pulseira}"
                                            />
                                            <Grid container spacing={1}>
                                                <Grid item xs={6}>
                                                    <TextField
                                                        label="Tamanho Fonte"
                                                        type="number"
                                                        fullWidth
                                                        size="small"
                                                        value={selectedElement.fontSize || 14}
                                                        onChange={e => updateElement(selectedElement.id, { fontSize: Number(e.target.value) })}
                                                    />
                                                </Grid>
                                                <Grid item xs={6}>
                                                    <TextField
                                                        label="Cor do Texto"
                                                        type="color"
                                                        fullWidth
                                                        size="small"
                                                        value={selectedElement.color || '#000000'}
                                                        onChange={e => updateElement(selectedElement.id, { color: e.target.value })}
                                                    />
                                                </Grid>
                                            </Grid>

                                            <Grid container spacing={1}>
                                                <Grid item xs={6}>
                                                    <FormControl fullWidth size="small">
                                                        <InputLabel id="weight-label">Peso</InputLabel>
                                                        <Select
                                                            labelId="weight-label"
                                                            label="Peso"
                                                            value={selectedElement.fontWeight || 'normal'}
                                                            onChange={e => updateElement(selectedElement.id, { fontWeight: e.target.value })}
                                                        >
                                                            <MenuItem value="normal">Normal</MenuItem>
                                                            <MenuItem value="bold">Negrito</MenuItem>
                                                        </Select>
                                                    </FormControl>
                                                </Grid>
                                                <Grid item xs={6}>
                                                    <FormControl fullWidth size="small">
                                                        <InputLabel id="align-label">Alinhar</InputLabel>
                                                        <Select
                                                            labelId="align-label"
                                                            label="Alinhar"
                                                            value={selectedElement.textAlign || 'left'}
                                                            onChange={e => updateElement(selectedElement.id, { textAlign: e.target.value })}
                                                        >
                                                            <MenuItem value="left">Esquerda</MenuItem>
                                                            <MenuItem value="center">Centro</MenuItem>
                                                            <MenuItem value="right">Direita</MenuItem>
                                                        </Select>
                                                    </FormControl>
                                                </Grid>
                                            </Grid>
                                        </>
                                    )}

                                    {/* Propriedades para FOTO */}
                                    {selectedElement.type === 'foto' && (
                                        <>
                                            <Typography variant="caption" sx={{ color: '#00D4FF' }}>
                                                A foto real do colaborador cadastrado sairá neste campo.
                                            </Typography>
                                            <Grid container spacing={1}>
                                                <Grid item xs={6}>
                                                    <TextField
                                                        label="Borda (px)"
                                                        type="number"
                                                        fullWidth
                                                        size="small"
                                                        value={selectedElement.borderRadius || 0}
                                                        onChange={e => updateElement(selectedElement.id, { borderRadius: Number(e.target.value) })}
                                                        helperText="0=quadrada, 50=redonda"
                                                    />
                                                </Grid>
                                                <Grid item xs={6}>
                                                    <TextField
                                                        label="Cor da Borda"
                                                        type="color"
                                                        fullWidth
                                                        size="small"
                                                        value={selectedElement.borderColor || '#00D4FF'}
                                                        onChange={e => updateElement(selectedElement.id, { borderColor: e.target.value })}
                                                    />
                                                </Grid>
                                            </Grid>
                                        </>
                                    )}

                                    {/* Propriedades para TARJA / SHAPE */}
                                    {selectedElement.type === 'shape' && (
                                        <>
                                            <TextField
                                                label="Cor de Fundo da Tarja"
                                                type="color"
                                                fullWidth
                                                size="small"
                                                value={selectedElement.backgroundColor || '#00D4FF'}
                                                onChange={e => updateElement(selectedElement.id, { backgroundColor: e.target.value })}
                                            />
                                            <Box sx={{ px: 1 }}>
                                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)' }}>Opacidade:</Typography>
                                                <Slider
                                                    size="small"
                                                    value={selectedElement.opacity != null ? selectedElement.opacity : 1}
                                                    min={0.1}
                                                    max={1}
                                                    step={0.05}
                                                    onChange={(_, v) => updateElement(selectedElement.id, { opacity: v })}
                                                />
                                            </Box>
                                        </>
                                    )}

                                    {/* Propriedades para QR CODE */}
                                    {selectedElement.type === 'qrcode' && (
                                        <TextField
                                            label="Conteúdo do QR"
                                            fullWidth
                                            size="small"
                                            value={selectedElement.content}
                                            onChange={e => updateElement(selectedElement.id, { content: e.target.value })}
                                            helperText="Padrão: {qr_code} ou {cpf}"
                                        />
                                    )}
                                </Stack>
                            ) : (
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontStyle: 'italic' }}>
                                    Clique em qualquer item no crachá ao lado para ajustar tamanho, fonte ou cores.
                                </Typography>
                            )}

                            {/* BOTOES DE ACAO */}
                            <Stack spacing={1.5} sx={{ mt: 3 }}>
                                <NeonButton startIcon={<SaveIcon />} fullWidth onClick={handleSave} loading={saving}>
                                    Salvar Layout do Evento
                                </NeonButton>
                                <NeonButton startIcon={<PrintIcon />} fullWidth variant="outlined" onClick={handleImprimirTeste}>
                                    Imprimir Teste de Crachá
                                </NeonButton>
                            </Stack>
                        </GlassCard>
                    </Stack>
                </Grid>

                {/* COLUNA DIREITA: CANVAS VISUAL DO CRACHÁ COM GRADE E GUIAS INTELIGENTES */}
                <Grid item xs={12} md={7.5} lg={8}>
                    <GlassCard sx={{ p: { xs: 1.5, sm: 3 }, height: '100%', display: 'flex', flexDirection: 'column' }}>
                        {/* Barra de Ferramentas da Grade e Guias */}
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, flexWrap: 'wrap', gap: 1 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#FFFFFF' }}>
                                    Pré-visualização do Crachá ({config.width} × {config.height} mm)
                                </Typography>
                            </Box>

                            {/* Controles de Grade e Snap */}
                            <Stack direction="row" spacing={1.5} alignItems="center">
                                <FormControlLabel
                                    control={
                                        <Switch
                                            size="small"
                                            checked={showGrid}
                                            onChange={(e) => setShowGrid(e.target.checked)}
                                        />
                                    }
                                    label={
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontSize: '0.78rem', color: '#FFFFFF' }}>
                                            {showGrid ? <GridOnIcon sx={{ fontSize: 16, color: '#00D4FF' }} /> : <GridOffIcon sx={{ fontSize: 16 }} />}
                                            Grade
                                        </Box>
                                    }
                                    sx={{ m: 0 }}
                                />

                                <FormControlLabel
                                    control={
                                        <Switch
                                            size="small"
                                            checked={snapToGrid}
                                            onChange={(e) => setSnapToGrid(e.target.checked)}
                                        />
                                    }
                                    label={
                                        <Typography sx={{ fontSize: '0.78rem', color: '#FFFFFF' }}>
                                            Alinhamento Automático
                                        </Typography>
                                    }
                                    sx={{ m: 0 }}
                                />

                                {showGrid && (
                                    <Select
                                        size="small"
                                        value={gridSize}
                                        onChange={(e) => setGridSize(Number(e.target.value))}
                                        sx={{ height: 28, fontSize: '0.72rem', color: '#FFFFFF', bgcolor: 'rgba(0,0,0,0.3)' }}
                                    >
                                        <MenuItem value={5}>5px</MenuItem>
                                        <MenuItem value={10}>10px</MenuItem>
                                        <MenuItem value={20}>20px</MenuItem>
                                    </Select>
                                )}
                            </Stack>
                        </Box>

                        <Box sx={{
                            flex: 1,
                            minHeight: '620px',
                            display: 'flex',
                            p: { xs: 1.5, sm: 4 },
                            background: 'rgba(0,0,0,0.6)',
                            borderRadius: 2,
                            border: '1px dashed rgba(0, 212, 255, 0.3)',
                            overflow: 'auto',
                            position: 'relative'
                        }}>
                            <Paper elevation={16} sx={{
                                m: 'auto',
                                flexShrink: 0,
                                width: canvasWidth,
                                height: canvasHeight,
                                backgroundColor: '#FFFFFF',
                                backgroundImage: config.background_url ? `url('${config.background_url}')` : 'none',
                                backgroundSize: 'cover',
                                backgroundPosition: 'center',
                                backgroundRepeat: 'no-repeat',
                                position: 'relative',
                                overflow: 'hidden',
                                borderRadius: config.layout?.includes('cr80') ? '12px' : '4px',
                                boxShadow: '0 12px 40px rgba(0,0,0,0.8), 0 0 20px rgba(0, 212, 255, 0.2)'
                            }}>
                                {/* Camada de Grade Visual Ativável / Desativável */}
                                {showGrid && (
                                    <Box sx={{
                                        position: 'absolute',
                                        top: 0,
                                        left: 0,
                                        right: 0,
                                        bottom: 0,
                                        pointerEvents: 'none',
                                        backgroundImage: `
                                            linear-gradient(to right, rgba(0, 212, 255, 0.08) 1px, transparent 1px),
                                            linear-gradient(to bottom, rgba(0, 212, 255, 0.08) 1px, transparent 1px)
                                        `,
                                        backgroundSize: `${gridSize}px ${gridSize}px`,
                                        zIndex: 1
                                    }} />
                                )}

                                {/* Guias Inteligentes Magnéticas estilo Canva (Rosa / Ciano) */}
                                {smartGuides.vertical !== null && (
                                    <Box sx={{
                                        position: 'absolute',
                                        top: 0,
                                        bottom: 0,
                                        left: smartGuides.vertical,
                                        width: '1.5px',
                                        backgroundColor: '#FF0077',
                                        boxShadow: '0 0 6px #FF0077',
                                        zIndex: 999,
                                        pointerEvents: 'none'
                                    }} />
                                )}
                                {smartGuides.horizontal !== null && (
                                    <Box sx={{
                                        position: 'absolute',
                                        left: 0,
                                        right: 0,
                                        top: smartGuides.horizontal,
                                        height: '1.5px',
                                        backgroundColor: '#FF0077',
                                        boxShadow: '0 0 6px #FF0077',
                                        zIndex: 999,
                                        pointerEvents: 'none'
                                    }} />
                                )}

                                {elements.map(el => (
                                    <Rnd
                                        key={el.id}
                                        size={{ width: el.width, height: el.height }}
                                        position={{ x: el.x, y: el.y }}
                                        lockAspectRatio={Boolean(el.lockAspectRatio)}
                                        onDrag={(_e, d) => handleDrag(_e, d, el)}
                                        onDragStop={(_e, d) => handleDragStop(_e, d, el.id)}
                                        onResizeStop={(_e, _direction, ref, _delta, position) => {
                                            updateElement(el.id, {
                                                width: parseInt(ref.style.width, 10),
                                                height: parseInt(ref.style.height, 10),
                                                ...position
                                            });
                                        }}
                                        bounds="parent"
                                        onClick={() => setSelectedId(el.id)}
                                        style={{
                                            border: selectedId === el.id ? '2px dashed #00D4FF' : '1px dashed rgba(0,0,0,0.1)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            overflow: 'hidden',
                                            cursor: 'move',
                                            borderRadius: el.borderRadius ? `${el.borderRadius}px` : 0,
                                            opacity: el.opacity != null ? el.opacity : 1,
                                            zIndex: selectedId === el.id ? 10 : 2
                                        }}
                                    >
                                        {/* RENDERIZAÇÃO: TEXTO */}
                                        {el.type === 'text' && (
                                            <Typography variant="body1" sx={{
                                                width: '100%',
                                                height: '100%',
                                                fontSize: el.fontSize || 14,
                                                fontWeight: el.fontWeight || 'normal',
                                                color: el.color || '#000000',
                                                textAlign: el.textAlign || 'left',
                                                wordWrap: 'break-word',
                                                lineHeight: 1.15,
                                                p: 0.2
                                            }}>
                                                {el.content}
                                            </Typography>
                                        )}

                                        {/* RENDERIZAÇÃO: QR CODE */}
                                        {el.type === 'qrcode' && (
                                            <Box sx={{
                                                width: '100%',
                                                height: '100%',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                background: 'rgba(255,255,255,0.85)',
                                                border: '1px solid #000'
                                            }}>
                                                <QrIcon sx={{ fontSize: Math.min(el.width, el.height) * 0.7, color: '#000000' }} />
                                                <Typography variant="caption" sx={{ fontSize: 8, color: '#000000' }}>QR Code</Typography>
                                            </Box>
                                        )}

                                        {/* RENDERIZAÇÃO: FOTO DA PESSOA */}
                                        {el.type === 'foto' && (
                                            <Box sx={{
                                                width: '100%',
                                                height: '100%',
                                                backgroundImage: `url('${DADOS_EXEMPLO.foto_url}')`,
                                                backgroundSize: 'cover',
                                                backgroundPosition: 'center',
                                                border: `${el.borderWidth || 1}px solid ${el.borderColor || '#00D4FF'}`,
                                                borderRadius: el.borderRadius ? `${el.borderRadius}px` : 0
                                            }} />
                                        )}

                                        {/* RENDERIZAÇÃO: SHAPE / TARJA */}
                                        {el.type === 'shape' && (
                                            <Box sx={{
                                                width: '100%',
                                                height: '100%',
                                                backgroundColor: el.backgroundColor || '#00D4FF',
                                                borderRadius: el.borderRadius ? `${el.borderRadius}px` : 0
                                            }} />
                                        )}

                                        {/* RENDERIZAÇÃO: IMAGEM / LOGO */}
                                        {el.type === 'image' && (
                                            <Box
                                                component="img"
                                                src={el.content}
                                                alt="Logo"
                                                sx={{
                                                    width: '100%',
                                                    height: '100%',
                                                    objectFit: 'contain'
                                                }}
                                            />
                                        )}
                                    </Rnd>
                                ))}
                            </Paper>
                        </Box>
                    </GlassCard>
                </Grid>
            </Grid>
        </Box>
    );
};

export default ConfigEtiquetas;
