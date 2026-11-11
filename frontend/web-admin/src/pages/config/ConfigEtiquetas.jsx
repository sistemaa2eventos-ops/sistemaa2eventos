import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
    Box, Typography, Grid, TextField, IconButton, Paper, Stack,
    Button, Tooltip, MenuItem, FormControl, InputLabel, Select,
    Divider, Slider, Switch, FormControlLabel, Tabs, Tab,
    Chip, Alert
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
    CenterFocusStrong as CenterIcon,
    QrCodeScanner as BarcodeIcon,
    RadioButtonUnchecked as CircleIcon,
    HorizontalRule as LineIcon,
    ContentCopy as DuplicateIcon,
    VerticalAlignTop as AlignTopIcon,
    VerticalAlignBottom as AlignBottomIcon,
    AlignHorizontalLeft as AlignLeftIcon,
    AlignHorizontalRight as AlignRightIcon,
    Layers as LayersIcon,
    Visibility as VisibilityIcon,
    VisibilityOff as VisibilityOffIcon,
    ZoomIn as ZoomInIcon,
    ZoomOut as ZoomOutIcon,
    RestartAlt as ResetZoomIcon,
    Tune as TuneIcon,
    AddCircleOutline as AddElementIcon,
    Keyboard as KeyboardIcon
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import { Rnd } from 'react-rnd';
import { useSearchParams } from 'react-router-dom';
import api from '../../services/api';
import GlassCard from '../../components/common/GlassCard';
import NeonButton from '../../components/common/NeonButton';
import PageHeader from '../../components/common/PageHeader';
import { montarHtmlEtiqueta, imprimirHtml, limparCacheEtiqueta, gerarBarcodeSvg } from '../../services/etiquetaService';
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

const CORES_PALETA = [
    { label: 'Preto', hex: '#000000' },
    { label: 'Branco', hex: '#FFFFFF' },
    { label: 'Ciano Neon', hex: '#00D4FF' },
    { label: 'Verde Neon', hex: '#00FF88' },
    { label: 'Rosa Neon', hex: '#FF0077' },
    { label: 'Amarelo Ouro', hex: '#FFD700' },
    { label: 'Azul Escuro', hex: '#0A1628' },
    { label: 'Cinza', hex: '#666666' }
];

const ConfigEtiquetas = () => {
    const [searchParams] = useSearchParams();
    const eventoId = searchParams.get('evento_id') || localStorage.getItem('active_evento_id');
    const fileBgInputRef = useRef(null);
    const fileElementInputRef = useRef(null);

    // Aba ativa da coluna lateral de ferramentas: 0: Formato & Arte, 1: Elementos, 2: Propriedades, 3: Camadas
    const [sidebarTab, setSidebarTab] = useState(0);

    const [config, setConfig] = useState({
        layout: 'zebra_tlp2844',
        width: 100,
        height: 150,
        background_url: '',
        fundo_como_referencia: false, // Situação C: arte de guia visual (não imprime)
        imprimir_fundo: true,          // Se falso, não imprime a arte
        opacidade_referencia: 0.5,     // Opacidade do gabarito visual
        travar_referencia: true
    });

    const [elements, setElements] = useState([
        { id: '1', type: 'text', content: '{nome_pessoa}', x: 10, y: 15, width: 220, height: 35, fontSize: 18, fontWeight: 'bold', color: '#000000', textAlign: 'center', zIndex: 10 },
        { id: '2', type: 'text', content: '{funcao}', x: 10, y: 55, width: 220, height: 25, fontSize: 14, fontWeight: 'normal', color: '#555555', textAlign: 'center', zIndex: 9 },
        { id: '3', type: 'qrcode', content: '{qr_code}', x: 75, y: 95, width: 90, height: 90, lockAspectRatio: true, zIndex: 8 },
        { id: '4', type: 'foto', content: '{foto_url}', x: 80, y: 200, width: 80, height: 80, borderRadius: 8, borderColor: '#00D4FF', borderWidth: 2, lockAspectRatio: true, zIndex: 7 }
    ]);

    const [selectedIds, setSelectedIds] = useState([]);
    const dragStartPositionsRef = useRef(null);
    const selectedId = selectedIds[0] || null;
    const [_loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const { enqueueSnackbar } = useSnackbar();

    // Recursos estilo Canva / Figma
    const [showGrid, setShowGrid] = useState(true);
    const [gridSize, setGridSize] = useState(10); // pixels
    const [snapToGrid, setSnapToGrid] = useState(true);
    const [smartGuides, setSmartGuides] = useState({ vertical: null, horizontal: null });
    const [zoom, setZoom] = useState(1.0); // 0.6 a 1.5
    const [ocultarGabarito, setOcultarGabarito] = useState(false);

    const scaleFactor = 3; // 1mm = 3px
    const canvasWidth = (Number(config.width) || 100) * scaleFactor;
    const canvasHeight = (Number(config.height) || 150) * scaleFactor;

    useEffect(() => {
        if (!eventoId) return;
        const fetchLayout = async () => {
            try {
                setLoading(true);
                const response = await api.get('/config/etiquetas', { params: { evento_id: eventoId } });
                if (response.data.data) {
                    if (response.data.data.papel_config) {
                        setConfig(prev => ({
                            ...prev,
                            ...response.data.data.papel_config
                        }));
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
            enqueueSnackbar('Arte de crachá carregada!', { variant: 'success' });
        };
        reader.readAsDataURL(file);
    };

    const handleRemoverBackground = () => {
        setConfig(prev => ({ ...prev, background_url: '' }));
    };

    // Adiciona novos elementos ao Canvas
    const addElement = (type) => {
        const id = Date.now().toString();
        const maxZ = elements.reduce((max, el) => Math.max(max, el.zIndex || 1), 1);
        let newEl = {
            id,
            type,
            x: 20,
            y: 20,
            width: 150,
            height: 35,
            lockAspectRatio: false,
            zIndex: maxZ + 1
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
        } else if (type === 'barcode') {
            newEl = {
                ...newEl,
                content: '{pulseira}',
                width: 160,
                height: 55,
                exibirTexto: true,
                lockAspectRatio: false
            };
        } else if (type === 'foto') {
            newEl = {
                ...newEl,
                content: '{foto_url}',
                width: 80,
                height: 80,
                borderRadius: 8,
                borderColor: '#00D4FF',
                borderWidth: 2,
                lockAspectRatio: true
            };
        } else if (type === 'shape') {
            newEl = {
                ...newEl,
                width: 200,
                height: 30,
                backgroundColor: '#00D4FF',
                borderRadius: 4,
                opacity: 1
            };
        } else if (type === 'circle') {
            newEl = {
                ...newEl,
                width: 60,
                height: 60,
                backgroundColor: '#00FF88',
                borderRadius: 50,
                borderColor: '#000000',
                borderWidth: 0,
                opacity: 1,
                lockAspectRatio: true
            };
        } else if (type === 'line') {
            newEl = {
                ...newEl,
                width: 200,
                height: 4,
                borderColor: '#000000',
                borderWidth: 2,
                opacity: 1,
                lockAspectRatio: false
            };
        } else if (type === 'image') {
            fileElementInputRef.current?.click();
            return;
        }

        setElements(prev => [...prev, newEl]);
        setSelectedIds([id]);
        setSidebarTab(2); // Muda direto para propriedades
    };

    const handleUploadElementImage = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            const base64 = event.target.result;
            const maxZ = elements.reduce((max, el) => Math.max(max, el.zIndex || 1), 1);
            const newEl = {
                id: Date.now().toString(),
                type: 'image',
                content: base64,
                x: 20,
                y: 20,
                width: 90,
                height: 90,
                borderRadius: 0,
                opacity: 1,
                lockAspectRatio: true,
                zIndex: maxZ + 1
            };
            setElements(prev => [...prev, newEl]);
            setSelectedIds([newEl.id]);
            setSidebarTab(2);
            enqueueSnackbar('Imagem adicionada ao crachá!', { variant: 'success' });
        };
        reader.readAsDataURL(file);
    };

    const updateElement = (id, newProps) => {
        setElements(prev => prev.map(el => el.id === id ? { ...el, ...newProps } : el));
    };

    const deleteElement = useCallback((id) => {
        setElements(prev => prev.filter(el => el.id !== id));
        setSelectedIds(prev => prev.filter(item => item !== id));
    }, []);

    const deleteSelectedElements = useCallback(() => {
        if (selectedIds.length === 0) return;
        const qtd = selectedIds.length;
        setElements(prev => prev.filter(el => !selectedIds.includes(el.id)));
        setSelectedIds([]);
        enqueueSnackbar(qtd > 1 ? `${qtd} elementos excluídos!` : 'Elemento excluído!', { variant: 'info', autoHideDuration: 1500 });
    }, [selectedIds, enqueueSnackbar]);

    // Atalhos de Teclado: Setas para ajuste milimétrico e Delete para excluir elementos selecionados (inclusive multi-seleção)
    useEffect(() => {
        const handleKeyDown = (e) => {
            // Ignora se o foco estiver digitando dentro de campos de formulário
            const tag = e.target?.tagName?.toLowerCase();
            if (tag === 'input' || tag === 'textarea' || e.target?.isContentEditable) {
                return;
            }

            if (selectedIds.length === 0) return;

            // Teclas Delete ou Backspace: exclui todos os elementos selecionados
            if (e.key === 'Delete' || e.key === 'Backspace') {
                e.preventDefault();
                deleteSelectedElements();
                return;
            }

            // Setas do teclado: movimentação milimétrica em bloco (1px normal, 10px com Shift)
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                e.preventDefault();
                const step = e.shiftKey ? 10 : 1;
                let dx = 0;
                let dy = 0;
                if (e.key === 'ArrowUp') dy = -step;
                if (e.key === 'ArrowDown') dy = step;
                if (e.key === 'ArrowLeft') dx = -step;
                if (e.key === 'ArrowRight') dx = step;

                setElements(prevElements =>
                    prevElements.map(item => {
                        if (selectedIds.includes(item.id)) {
                            const novoX = Math.round(Math.max(0, Math.min(canvasWidth - item.width, item.x + dx)));
                            const novoY = Math.round(Math.max(0, Math.min(canvasHeight - item.height, item.y + dy)));
                            return { ...item, x: novoX, y: novoY };
                        }
                        return item;
                    })
                );
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [selectedIds, canvasWidth, canvasHeight, deleteSelectedElements]);

    const duplicateSelectedElements = () => {
        if (selectedIds.length === 0) return;
        const maxZ = elements.reduce((max, el) => Math.max(max, el.zIndex || 1), 1);
        const novos = [];
        const novosIds = [];

        elements.forEach((el, index) => {
            if (selectedIds.includes(el.id)) {
                const newId = `${Date.now()}_${index}`;
                novos.push({
                    ...el,
                    id: newId,
                    x: el.x + 15,
                    y: el.y + 15,
                    zIndex: maxZ + 1 + index
                });
                novosIds.push(newId);
            }
        });

        setElements(prev => [...prev, ...novos]);
        setSelectedIds(novosIds);
        enqueueSnackbar(novos.length > 1 ? `${novos.length} elementos duplicados em grupo!` : 'Elemento duplicado!', { variant: 'info' });
    };

    const duplicateElement = (elToDup) => {
        if (!elToDup) return;
        duplicateSelectedElements();
    };

    // Ordenação de Camadas (Z-Index)
    const bringToFront = (id) => {
        const maxZ = elements.reduce((max, el) => Math.max(max, el.zIndex || 1), 1);
        updateElement(id, { zIndex: maxZ + 1 });
    };

    const sendToBack = (id) => {
        const minZ = elements.reduce((min, el) => Math.min(min, el.zIndex || 1), 1);
        updateElement(id, { zIndex: Math.max(1, minZ - 1) });
    };

    // Alinhamento Rápido estilo Canva (suporta elemento único ou grupo selecionado)
    const alinharElemento = (posicao) => {
        if (selectedIds.length === 0) return;

        // Se for elemento único
        if (selectedIds.length === 1) {
            const el = elements.find(item => item.id === selectedId);
            if (!el) return;

            let novosDados = {};
            if (posicao === 'centro-x') {
                novosDados.x = Math.round((canvasWidth - el.width) / 2);
                setSmartGuides({ vertical: canvasWidth / 2, horizontal: null });
            } else if (posicao === 'centro-y') {
                novosDados.y = Math.round((canvasHeight - el.height) / 2);
                setSmartGuides({ vertical: null, horizontal: canvasHeight / 2 });
            } else if (posicao === 'centro-total') {
                novosDados.x = Math.round((canvasWidth - el.width) / 2);
                novosDados.y = Math.round((canvasHeight - el.height) / 2);
                setSmartGuides({ vertical: canvasWidth / 2, horizontal: canvasHeight / 2 });
            } else if (posicao === 'esquerda') {
                novosDados.x = 10;
            } else if (posicao === 'direita') {
                novosDados.x = Math.max(0, canvasWidth - el.width - 10);
            } else if (posicao === 'topo') {
                novosDados.y = 10;
            } else if (posicao === 'base') {
                novosDados.y = Math.max(0, canvasHeight - el.height - 10);
            }

            updateElement(selectedId, novosDados);
            setTimeout(() => setSmartGuides({ vertical: null, horizontal: null }), 1200);
            return;
        }

        // Se for grupo de múltiplos elementos: move o bloco inteiro mantendo distância relativa
        const grupo = elements.filter(el => selectedIds.includes(el.id));
        if (grupo.length === 0) return;

        const minX = Math.min(...grupo.map(e => e.x));
        const maxX = Math.max(...grupo.map(e => e.x + e.width));
        const minY = Math.min(...grupo.map(e => e.y));
        const maxY = Math.max(...grupo.map(e => e.y + e.height));
        const groupWidth = maxX - minX;
        const groupHeight = maxY - minY;

        let deltaX = 0;
        let deltaY = 0;

        if (posicao === 'centro-x') {
            const targetX = Math.round((canvasWidth - groupWidth) / 2);
            deltaX = targetX - minX;
            setSmartGuides({ vertical: canvasWidth / 2, horizontal: null });
        } else if (posicao === 'centro-y') {
            const targetY = Math.round((canvasHeight - groupHeight) / 2);
            deltaY = targetY - minY;
            setSmartGuides({ vertical: null, horizontal: canvasHeight / 2 });
        } else if (posicao === 'centro-total') {
            const targetX = Math.round((canvasWidth - groupWidth) / 2);
            const targetY = Math.round((canvasHeight - groupHeight) / 2);
            deltaX = targetX - minX;
            deltaY = targetY - minY;
            setSmartGuides({ vertical: canvasWidth / 2, horizontal: canvasHeight / 2 });
        } else if (posicao === 'esquerda') {
            deltaX = 10 - minX;
        } else if (posicao === 'direita') {
            deltaX = (canvasWidth - groupWidth - 10) - minX;
        } else if (posicao === 'topo') {
            deltaY = 10 - minY;
        } else if (posicao === 'base') {
            deltaY = (canvasHeight - groupHeight - 10) - minY;
        }

        setElements(prev => prev.map(item => {
            if (selectedIds.includes(item.id)) {
                return {
                    ...item,
                    x: Math.round(item.x + deltaX),
                    y: Math.round(item.y + deltaY)
                };
            }
            return item;
        }));

        setTimeout(() => setSmartGuides({ vertical: null, horizontal: null }), 1200);
    };

    // Detecção de Início de Arrasto com Suporte a Múltiplos Elementos Selecionados
    const handleDragStart = (_e, d, el) => {
        let currentSelected = selectedIds;
        // Se o elemento arrastado não fazia parte da seleção atual, seleciona apenas ele
        if (!selectedIds.includes(el.id)) {
            currentSelected = [el.id];
            setSelectedIds([el.id]);
            setSidebarTab(2);
        }

        // Armazena posições iniciais de cada elemento do grupo
        const initialMap = {};
        elements.forEach(item => {
            if (currentSelected.includes(item.id)) {
                initialMap[item.id] = { x: item.x, y: item.y };
            }
        });

        dragStartPositionsRef.current = {
            leaderId: el.id,
            startX: d.x,
            startY: d.y,
            initialPositions: initialMap
        };
    };

    // Detecção de Guias Magnéticas e Arrasto em Bloco
    const handleDrag = (_e, d, el) => {
        const dragData = dragStartPositionsRef.current;

        // Se estiver arrastando múltiplos elementos, move todos juntos em tempo real
        if (dragData && dragData.leaderId === el.id && Object.keys(dragData.initialPositions).length > 1) {
            const dx = d.x - dragData.startX;
            const dy = d.y - dragData.startY;
            const initialMap = dragData.initialPositions;

            setElements(prev => prev.map(item => {
                if (initialMap[item.id] && item.id !== el.id) {
                    return {
                        ...item,
                        x: Math.round(initialMap[item.id].x + dx),
                        y: Math.round(initialMap[item.id].y + dy)
                    };
                }
                return item;
            }));
        }

        const elCenterX = d.x + el.width / 2;
        const elCenterY = d.y + el.height / 2;
        const canvasCenterX = canvasWidth / 2;
        const canvasCenterY = canvasHeight / 2;
        const threshold = 6;

        let guideV = null;
        let guideH = null;

        if (Math.abs(elCenterX - canvasCenterX) <= threshold) guideV = canvasCenterX;
        if (Math.abs(elCenterY - canvasCenterY) <= threshold) guideH = canvasCenterY;

        elements.forEach(other => {
            if (selectedIds.includes(other.id)) return;
            const otherCenterX = other.x + other.width / 2;
            const otherCenterY = other.y + other.height / 2;

            if (Math.abs(elCenterX - otherCenterX) <= threshold) guideV = otherCenterX;
            if (Math.abs(d.x - other.x) <= threshold) guideV = other.x;
            if (Math.abs(elCenterY - otherCenterY) <= threshold) guideH = otherCenterY;
            if (Math.abs(d.y - other.y) <= threshold) guideH = other.y;
        });

        setSmartGuides({ vertical: guideV, horizontal: guideH });
    };

    const handleDragStop = (_e, d, elId) => {
        setSmartGuides({ vertical: null, horizontal: null });
        const dragData = dragStartPositionsRef.current;

        let finalLeaderX = d.x;
        let finalLeaderY = d.y;

        if (snapToGrid) {
            finalLeaderX = Math.round(d.x / gridSize) * gridSize;
            finalLeaderY = Math.round(d.y / gridSize) * gridSize;
        }

        if (dragData && dragData.leaderId === elId && Object.keys(dragData.initialPositions).length > 1) {
            const dx = finalLeaderX - dragData.startX;
            const dy = finalLeaderY - dragData.startY;
            const initialMap = dragData.initialPositions;

            setElements(prev => prev.map(item => {
                if (initialMap[item.id]) {
                    const nx = Math.round(initialMap[item.id].x + dx);
                    const ny = Math.round(initialMap[item.id].y + dy);
                    return { ...item, x: nx, y: ny };
                }
                return item;
            }));
        } else {
            updateElement(elId, { x: finalLeaderX, y: finalLeaderY });
        }

        dragStartPositionsRef.current = null;
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
            enqueueSnackbar(`Layout salvo com sucesso para o evento ativo!`, { variant: 'success' });
        } catch (error) {
            enqueueSnackbar('Falha ao salvar layout: ' + (error.response?.data?.details || ''), { variant: 'error' });
        } finally {
            setSaving(false);
        }
    };

    const handleImprimirTeste = () => {
        imprimirHtml(montarHtmlEtiqueta({ papel_config: config, elementos: elements }, DADOS_EXEMPLO));
    };

    const selectedElement = elements.find(el => el.id === selectedId);

    // Lista de camadas ordenada de cima para baixo
    const elementosOrdenados = useMemo(() => {
        return [...elements].sort((a, b) => (b.zIndex || 0) - (a.zIndex || 0));
    }, [elements]);

    return (
        <Box sx={{ p: { xs: 1.5, sm: 2.5, md: 3 } }}>
            <PageHeader
                title="Etiquetas e crachás"
                subtitle="Design e impressão de credenciais, crachás PVC e etiquetas térmicas."
                breadcrumbs={[{ text: 'Configurações' }, { text: 'Credenciais físicas' }, { text: 'Etiquetas e crachás' }]}
                action={
                    <Stack direction="row" spacing={1.5}>
                        <NeonButton
                            startIcon={<PrintIcon />}
                            variant="outlined"
                            onClick={handleImprimirTeste}
                        >
                            Imprimir Teste
                        </NeonButton>
                        <NeonButton
                            startIcon={<SaveIcon />}
                            onClick={handleSave}
                            loading={saving}
                            neonColor="#00FF88"
                        >
                            Salvar Layout
                        </NeonButton>
                    </Stack>
                }
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

            <Grid container spacing={2.5} sx={{ mt: 0.5 }}>
                {/* COLUNA ESQUERDA: FERRAMENTAS ORGANIZADAS EM ABAS ESTILO CANVA */}
                <Grid item xs={12} md={4.5} lg={4}>
                    <GlassCard sx={{ p: 2 }}>
                        {/* Seletor de Abas de Ferramentas */}
                        <Tabs
                            value={sidebarTab}
                            onChange={(_, val) => setSidebarTab(val)}
                            variant="fullWidth"
                            sx={{
                                minHeight: 38,
                                mb: 2,
                                '& .MuiTab-root': {
                                    minHeight: 36,
                                    fontSize: '0.74rem',
                                    fontWeight: 700,
                                    textTransform: 'none',
                                    color: 'rgba(255,255,255,0.6)',
                                    px: 0.5
                                },
                                '& .Mui-selected': {
                                    color: '#00D4FF !important'
                                },
                                '& .MuiTabs-indicator': {
                                    backgroundColor: '#00D4FF',
                                    height: 3
                                }
                            }}
                        >
                            <Tab icon={<StyleIcon sx={{ fontSize: 16 }} />} iconPosition="start" label="Formato" />
                            <Tab icon={<AddElementIcon sx={{ fontSize: 16 }} />} iconPosition="start" label="Elementos" />
                            <Tab icon={<TuneIcon sx={{ fontSize: 16 }} />} iconPosition="start" label="Propriedades" />
                            <Tab icon={<LayersIcon sx={{ fontSize: 16 }} />} iconPosition="start" label="Camadas" />
                        </Tabs>

                        {/* ABA 0: FORMATO E ARTE DO EVENTO (SITUAÇÕES A & C) */}
                        {sidebarTab === 0 && (
                            <Stack spacing={2}>
                                <Typography variant="caption" sx={{ color: '#00D4FF', fontWeight: 700, textTransform: 'uppercase' }}>
                                    Dimensões do Papel / Crachá
                                </Typography>

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

                                <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)', my: 1 }} />

                                {/* SEÇÃO: ARTE DO EVENTO & MODO GABARITO (SITUAÇÃO C) */}
                                <Box>
                                    <Typography variant="caption" sx={{ color: '#00D4FF', fontWeight: 700, textTransform: 'uppercase', display: 'block', mb: 1 }}>
                                        Arte do Evento / Imagem de Fundo
                                    </Typography>

                                    <Stack direction="row" spacing={1} sx={{ mb: 1.5 }}>
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
                                        <Stack spacing={1.5} sx={{ p: 1.5, bgcolor: 'rgba(0, 212, 255, 0.05)', borderRadius: 1.5, border: '1px solid rgba(0, 212, 255, 0.2)' }}>
                                            {/* SITUAÇÃO C: Usar como Gabarito de Referência Visual */}
                                            <FormControlLabel
                                                control={
                                                    <Switch
                                                        size="small"
                                                        checked={Boolean(config.fundo_como_referencia)}
                                                        onChange={(e) => {
                                                            const ativo = e.target.checked;
                                                            handleChangeConfig('fundo_como_referencia', ativo);
                                                            handleChangeConfig('imprimir_fundo', !ativo);
                                                        }}
                                                    />
                                                }
                                                label={
                                                    <Typography sx={{ fontSize: '0.78rem', color: '#00FF88', fontWeight: 700 }}>
                                                        Modo Gabarito (Não Imprimir)
                                                    </Typography>
                                                }
                                            />

                                            <Alert severity="info" sx={{ bgcolor: 'rgba(0, 212, 255, 0.08)', color: '#FFFFFF', fontSize: '0.72rem', py: 0.5 }}>
                                                {config.fundo_como_referencia
                                                    ? '📌 A arte serve de orientação na tela para alinhar os dados, mas NÃO sairá na impressora (ideal para crachás pré-impressos).'
                                                    : '🖨️ A arte será enviada para impressão junto com os textos.'}
                                            </Alert>

                                            {/* Slider de Transparência da Referência */}
                                            <Box sx={{ px: 0.5 }}>
                                                <Stack direction="row" justifyContent="space-between">
                                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.72rem' }}>
                                                        Opacidade do Gabarito:
                                                    </Typography>
                                                    <Typography variant="caption" sx={{ color: '#00D4FF', fontWeight: 700, fontSize: '0.72rem' }}>
                                                        {Math.round((config.opacidade_referencia || 0.5) * 100)}%
                                                    </Typography>
                                                </Stack>
                                                <Slider
                                                    size="small"
                                                    value={config.opacidade_referencia != null ? config.opacidade_referencia : 0.5}
                                                    min={0.1}
                                                    max={1}
                                                    step={0.05}
                                                    onChange={(_, v) => handleChangeConfig('opacidade_referencia', v)}
                                                />
                                            </Box>

                                            <FormControlLabel
                                                control={
                                                    <Switch
                                                        size="small"
                                                        checked={Boolean(config.travar_referencia)}
                                                        onChange={(e) => handleChangeConfig('travar_referencia', e.target.checked)}
                                                    />
                                                }
                                                label={
                                                    <Typography sx={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.8)' }}>
                                                        Travar imagem na prancheta
                                                    </Typography>
                                                }
                                            />
                                        </Stack>
                                    )}
                                </Box>
                            </Stack>
                        )}

                        {/* ABA 1: ADICIONAR ELEMENTOS (SITUAÇÃO B) */}
                        {sidebarTab === 1 && (
                            <Stack spacing={1.5}>
                                <Typography variant="caption" sx={{ color: '#00D4FF', fontWeight: 700, textTransform: 'uppercase' }}>
                                    Dados Dinâmicos & Textos
                                </Typography>

                                <Grid container spacing={1}>
                                    <Grid item xs={6}>
                                        <Button
                                            fullWidth
                                            variant="outlined"
                                            size="small"
                                            startIcon={<TextIcon sx={{ fontSize: 18 }} />}
                                            onClick={() => addElement('text')}
                                            sx={{ ...botaoSecundario, fontSize: '0.75rem', py: 1 }}
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
                                            sx={{ ...botaoSecundario, fontSize: '0.75rem', py: 1 }}
                                        >
                                            QR Code
                                        </Button>
                                    </Grid>
                                    <Grid item xs={6}>
                                        <Button
                                            fullWidth
                                            variant="outlined"
                                            size="small"
                                            startIcon={<BarcodeIcon sx={{ fontSize: 18 }} />}
                                            onClick={() => addElement('barcode')}
                                            sx={{ ...botaoSecundario, fontSize: '0.75rem', py: 1 }}
                                        >
                                            Cód. Barras 1D
                                        </Button>
                                    </Grid>
                                    <Grid item xs={6}>
                                        <Button
                                            fullWidth
                                            variant="outlined"
                                            size="small"
                                            startIcon={<FotoIcon sx={{ fontSize: 18 }} />}
                                            onClick={() => addElement('foto')}
                                            sx={{ ...botaoSecundario, fontSize: '0.75rem', py: 1 }}
                                        >
                                            Foto da Pessoa
                                        </Button>
                                    </Grid>
                                </Grid>

                                <Typography variant="caption" sx={{ color: '#00D4FF', fontWeight: 700, textTransform: 'uppercase', pt: 1 }}>
                                    Elementos Gráficos & Formas
                                </Typography>

                                <Grid container spacing={1}>
                                    <Grid item xs={6}>
                                        <Button
                                            fullWidth
                                            variant="outlined"
                                            size="small"
                                            startIcon={<ImageIcon sx={{ fontSize: 18 }} />}
                                            onClick={() => addElement('image')}
                                            sx={{ ...botaoSecundario, fontSize: '0.75rem', py: 1 }}
                                        >
                                            Logo / Imagem
                                        </Button>
                                    </Grid>
                                    <Grid item xs={6}>
                                        <Button
                                            fullWidth
                                            variant="outlined"
                                            size="small"
                                            startIcon={<ShapeIcon sx={{ fontSize: 18 }} />}
                                            onClick={() => addElement('shape')}
                                            sx={{ ...botaoSecundario, fontSize: '0.75rem', py: 1 }}
                                        >
                                            Tarja / Retângulo
                                        </Button>
                                    </Grid>
                                    <Grid item xs={6}>
                                        <Button
                                            fullWidth
                                            variant="outlined"
                                            size="small"
                                            startIcon={<CircleIcon sx={{ fontSize: 18 }} />}
                                            onClick={() => addElement('circle')}
                                            sx={{ ...botaoSecundario, fontSize: '0.75rem', py: 1 }}
                                        >
                                            Círculo / Selo
                                        </Button>
                                    </Grid>
                                    <Grid item xs={6}>
                                        <Button
                                            fullWidth
                                            variant="outlined"
                                            size="small"
                                            startIcon={<LineIcon sx={{ fontSize: 18 }} />}
                                            onClick={() => addElement('line')}
                                            sx={{ ...botaoSecundario, fontSize: '0.75rem', py: 1 }}
                                        >
                                            Linha Divisória
                                        </Button>
                                    </Grid>
                                </Grid>
                            </Stack>
                        )}

                        {/* ABA 2: PROPRIEDADES DA SELEÇÃO (SUPORTA ELEMENTO ÚNICO OU MULTI-SELEÇÃO) */}
                        {sidebarTab === 2 && (
                            <Box>
                                {selectedIds.length > 1 ? (
                                    /* INTERFACE DE MULTI-SELEÇÃO (GRUPO DE ELEMENTOS) */
                                    <Stack spacing={2}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                                            <Chip
                                                size="small"
                                                label={`${selectedIds.length} ITENS SELECIONADOS (GRUPO)`}
                                                sx={{ bgcolor: 'rgba(0, 255, 136, 0.2)', color: '#00FF88', fontWeight: 700, fontSize: '0.7rem' }}
                                            />
                                            <Button
                                                size="small"
                                                variant="text"
                                                onClick={() => setSelectedIds([])}
                                                sx={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.6)', textTransform: 'none' }}
                                            >
                                                Desmarcar
                                            </Button>
                                        </Box>

                                        {/* Barra de Instruções para Grupo */}
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1.2, bgcolor: 'rgba(0, 255, 136, 0.06)', borderRadius: 1.5, border: '1px dashed rgba(0, 255, 136, 0.3)' }}>
                                            <KeyboardIcon sx={{ fontSize: 20, color: '#00FF88' }} />
                                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.85)', fontSize: '0.7rem', lineHeight: 1.3 }}>
                                                <strong>Arraste qualquer item selecionado</strong> ou use as <strong>Setas</strong> para mover todo o grupo junto mantendo posições, escala e ordem relativas!
                                            </Typography>
                                        </Box>

                                        {/* Ações em Grupo: Duplicar e Excluir */}
                                        <Stack direction="row" spacing={1}>
                                            <Button
                                                fullWidth
                                                size="small"
                                                variant="outlined"
                                                startIcon={<DuplicateIcon />}
                                                onClick={duplicateSelectedElements}
                                                sx={{ ...botaoSecundario, fontSize: '0.72rem', py: 0.8 }}
                                            >
                                                Duplicar Grupo
                                            </Button>
                                            <Button
                                                fullWidth
                                                size="small"
                                                variant="outlined"
                                                color="error"
                                                startIcon={<DeleteIcon />}
                                                onClick={deleteSelectedElements}
                                                sx={{ fontSize: '0.72rem', py: 0.8, color: '#FF3366', borderColor: 'rgba(255, 51, 102, 0.3)' }}
                                            >
                                                Excluir Grupo
                                            </Button>
                                        </Stack>

                                        {/* Alinhamento do Bloco Inteiro */}
                                        <Box sx={{ p: 1, bgcolor: 'rgba(0,0,0,0.3)', borderRadius: 1.5, border: '1px solid rgba(0, 255, 136, 0.2)' }}>
                                            <Typography variant="caption" sx={{ color: '#00FF88', fontWeight: 700, display: 'block', mb: 0.8 }}>
                                                Alinhamento do Bloco na Prancheta:
                                            </Typography>
                                            <Stack direction="row" spacing={0.5} flexWrap="wrap" justifyContent="space-between">
                                                <Tooltip title="Alinhar Bloco à Esquerda">
                                                    <IconButton size="small" onClick={() => alinharElemento('esquerda')} sx={{ color: '#FFFFFF', border: '1px solid rgba(255,255,255,0.1)' }}>
                                                        <AlignLeftIcon fontSize="small" />
                                                    </IconButton>
                                                </Tooltip>
                                                <Tooltip title="Centro Horizontal do Bloco">
                                                    <Button size="small" onClick={() => alinharElemento('centro-x')} sx={{ minWidth: 28, px: 0.8, fontSize: '0.68rem', color: '#FFFFFF', border: '1px solid rgba(255,255,255,0.1)' }}>
                                                        CX
                                                    </Button>
                                                </Tooltip>
                                                <Tooltip title="Centro Total do Bloco">
                                                    <IconButton size="small" onClick={() => alinharElemento('centro-total')} sx={{ color: '#00FF88', border: '1px solid rgba(0, 255, 136, 0.4)' }}>
                                                        <CenterIcon fontSize="small" />
                                                    </IconButton>
                                                </Tooltip>
                                                <Tooltip title="Centro Vertical do Bloco">
                                                    <Button size="small" onClick={() => alinharElemento('centro-y')} sx={{ minWidth: 28, px: 0.8, fontSize: '0.68rem', color: '#FFFFFF', border: '1px solid rgba(255,255,255,0.1)' }}>
                                                        CY
                                                    </Button>
                                                </Tooltip>
                                                <Tooltip title="Alinhar Bloco à Direita">
                                                    <IconButton size="small" onClick={() => alinharElemento('direita')} sx={{ color: '#FFFFFF', border: '1px solid rgba(255,255,255,0.1)' }}>
                                                        <AlignRightIcon fontSize="small" />
                                                    </IconButton>
                                                </Tooltip>
                                                <Tooltip title="Alinhar Bloco ao Topo">
                                                    <IconButton size="small" onClick={() => alinharElemento('topo')} sx={{ color: '#FFFFFF', border: '1px solid rgba(255,255,255,0.1)' }}>
                                                        <AlignTopIcon fontSize="small" />
                                                    </IconButton>
                                                </Tooltip>
                                                <Tooltip title="Alinhar Bloco à Base">
                                                    <IconButton size="small" onClick={() => alinharElemento('base')} sx={{ color: '#FFFFFF', border: '1px solid rgba(255,255,255,0.1)' }}>
                                                        <AlignBottomIcon fontSize="small" />
                                                    </IconButton>
                                                </Tooltip>
                                            </Stack>
                                        </Box>
                                    </Stack>
                                ) : selectedElement ? (
                                    /* INTERFACE DE ELEMENTO ÚNICO */
                                    <Stack spacing={2}>
                                        {/* Cabeçalho do Elemento Selecionado */}
                                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                                            <Stack direction="row" spacing={1} alignItems="center">
                                                <Chip
                                                    size="small"
                                                    label={selectedElement.type.toUpperCase()}
                                                    sx={{ bgcolor: 'rgba(0, 212, 255, 0.15)', color: '#00D4FF', fontWeight: 700, fontSize: '0.65rem' }}
                                                />
                                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)' }}>
                                                    X: {Math.round(selectedElement.x / scaleFactor)}mm | Y: {Math.round(selectedElement.y / scaleFactor)}mm
                                                </Typography>
                                            </Stack>
                                            <Stack direction="row" spacing={0.5}>
                                                <Tooltip title="Duplicar elemento">
                                                    <IconButton size="small" onClick={() => duplicateElement(selectedElement)} sx={{ color: '#00D4FF' }}>
                                                        <DuplicateIcon fontSize="small" />
                                                    </IconButton>
                                                </Tooltip>
                                                <Tooltip title="Excluir elemento">
                                                    <IconButton size="small" color="error" onClick={() => deleteElement(selectedElement.id)} sx={{ bgcolor: 'rgba(255, 51, 102, 0.1)' }}>
                                                        <DeleteIcon fontSize="small" />
                                                    </IconButton>
                                                </Tooltip>
                                            </Stack>
                                        </Box>

                                        {/* Barra de Atalhos de Teclado */}
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1, bgcolor: 'rgba(0, 212, 255, 0.05)', borderRadius: 1.5, border: '1px dashed rgba(0, 212, 255, 0.25)' }}>
                                            <KeyboardIcon sx={{ fontSize: 18, color: '#00D4FF' }} />
                                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.8)', fontSize: '0.68rem', lineHeight: 1.25 }}>
                                                <strong>Setas:</strong> ajuste fino (1px) | <strong>Shift + Setas:</strong> 10px | <strong>Del/Backspace:</strong> excluir
                                            </Typography>
                                        </Box>

                                        {/* Barra de Alinhamento Rápido estilo Canva */}
                                        <Box sx={{ p: 1, bgcolor: 'rgba(0,0,0,0.3)', borderRadius: 1.5, border: '1px solid rgba(0, 212, 255, 0.15)' }}>
                                            <Typography variant="caption" sx={{ color: '#00D4FF', fontWeight: 700, display: 'block', mb: 0.8 }}>
                                                Alinhamento na Prancheta:
                                            </Typography>
                                            <Stack direction="row" spacing={0.5} flexWrap="wrap" justifyContent="space-between">
                                                <Tooltip title="Alinhar à Esquerda">
                                                    <IconButton size="small" onClick={() => alinharElemento('esquerda')} sx={{ color: '#FFFFFF', border: '1px solid rgba(255,255,255,0.1)' }}>
                                                        <AlignLeftIcon fontSize="small" />
                                                    </IconButton>
                                                </Tooltip>
                                                <Tooltip title="Centro Horizontal">
                                                    <Button size="small" onClick={() => alinharElemento('centro-x')} sx={{ minWidth: 28, px: 0.8, fontSize: '0.68rem', color: '#FFFFFF', border: '1px solid rgba(255,255,255,0.1)' }}>
                                                        CX
                                                    </Button>
                                                </Tooltip>
                                                <Tooltip title="Centro Total">
                                                    <IconButton size="small" onClick={() => alinharElemento('centro-total')} sx={{ color: '#00D4FF', border: '1px solid rgba(0, 212, 255, 0.3)' }}>
                                                        <CenterIcon fontSize="small" />
                                                    </IconButton>
                                                </Tooltip>
                                                <Tooltip title="Centro Vertical">
                                                    <Button size="small" onClick={() => alinharElemento('centro-y')} sx={{ minWidth: 28, px: 0.8, fontSize: '0.68rem', color: '#FFFFFF', border: '1px solid rgba(255,255,255,0.1)' }}>
                                                        CY
                                                    </Button>
                                                </Tooltip>
                                                <Tooltip title="Alinhar à Direita">
                                                    <IconButton size="small" onClick={() => alinharElemento('direita')} sx={{ color: '#FFFFFF', border: '1px solid rgba(255,255,255,0.1)' }}>
                                                        <AlignRightIcon fontSize="small" />
                                                    </IconButton>
                                                </Tooltip>
                                                <Tooltip title="Alinhar ao Topo">
                                                    <IconButton size="small" onClick={() => alinharElemento('topo')} sx={{ color: '#FFFFFF', border: '1px solid rgba(255,255,255,0.1)' }}>
                                                        <AlignTopIcon fontSize="small" />
                                                    </IconButton>
                                                </Tooltip>
                                                <Tooltip title="Alinhar à Base">
                                                    <IconButton size="small" onClick={() => alinharElemento('base')} sx={{ color: '#FFFFFF', border: '1px solid rgba(255,255,255,0.1)' }}>
                                                        <AlignBottomIcon fontSize="small" />
                                                    </IconButton>
                                                </Tooltip>
                                            </Stack>
                                        </Box>

                                        {/* Trava de Proporção Real vs Esticar Livre */}
                                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', bgcolor: 'rgba(0, 212, 255, 0.05)', p: 1, borderRadius: 1.5 }}>
                                            <Stack direction="row" spacing={1} alignItems="center">
                                                {selectedElement.lockAspectRatio ? <LockIcon sx={{ fontSize: 18, color: '#00FF88' }} /> : <LockOpenIcon sx={{ fontSize: 18, color: '#FFB800' }} />}
                                                <Box>
                                                    <Typography variant="caption" sx={{ color: '#FFFFFF', fontWeight: 600, display: 'block', lineHeight: 1.2 }}>
                                                        {selectedElement.lockAspectRatio ? 'Proporção Travada' : 'Redimensionar Livre'}
                                                    </Typography>
                                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.65rem' }}>
                                                        {selectedElement.lockAspectRatio ? 'Mantém aspecto ao puxar' : 'Estica altura/largura livres'}
                                                    </Typography>
                                                </Box>
                                            </Stack>
                                            <Button
                                                size="small"
                                                variant="outlined"
                                                onClick={() => updateElement(selectedElement.id, { lockAspectRatio: !selectedElement.lockAspectRatio })}
                                                sx={{ fontSize: '0.68rem', py: 0.2, px: 1, color: '#00D4FF', borderColor: 'rgba(0,212,255,0.3)', textTransform: 'none' }}
                                            >
                                                {selectedElement.lockAspectRatio ? 'Liberar' : 'Travar'}
                                            </Button>
                                        </Box>

                                        {/* Propriedades Específicas: TEXTO */}
                                        {selectedElement.type === 'text' && (
                                            <Stack spacing={1.5}>
                                                <TextField
                                                    label="Conteúdo / Tag do Participante"
                                                    fullWidth
                                                    size="small"
                                                    value={selectedElement.content}
                                                    onChange={e => updateElement(selectedElement.id, { content: e.target.value })}
                                                />

                                                {/* Tags Rápidas de Inserção */}
                                                <Box>
                                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.68rem', display: 'block', mb: 0.5 }}>
                                                        Inserir tag rápida:
                                                    </Typography>
                                                    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                                                        {['{nome_pessoa}', '{funcao}', '{empresa}', '{cpf}', '{pulseira}', '{evento}'].map(tag => (
                                                            <Chip
                                                                key={tag}
                                                                label={tag}
                                                                size="small"
                                                                onClick={() => updateElement(selectedElement.id, { content: tag })}
                                                                sx={{ fontSize: '0.65rem', height: 22, bgcolor: 'rgba(255,255,255,0.06)', cursor: 'pointer', mb: 0.5 }}
                                                            />
                                                        ))}
                                                    </Stack>
                                                </Box>

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
                                                </Grid>

                                                <Grid container spacing={1}>
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
                                            </Stack>
                                        )}

                                        {/* Propriedades Específicas: QR CODE */}
                                        {selectedElement.type === 'qrcode' && (
                                            <TextField
                                                label="Conteúdo do QR Code"
                                                fullWidth
                                                size="small"
                                                value={selectedElement.content}
                                                onChange={e => updateElement(selectedElement.id, { content: e.target.value })}
                                                helperText="Tags: {qr_code}, {cpf} ou texto fixo"
                                            />
                                        )}

                                        {/* Propriedades Específicas: CÓDIGO DE BARRAS 1D */}
                                        {selectedElement.type === 'barcode' && (
                                            <Stack spacing={1.5}>
                                                <TextField
                                                    label="Conteúdo do Código de Barras"
                                                    fullWidth
                                                    size="small"
                                                    value={selectedElement.content}
                                                    onChange={e => updateElement(selectedElement.id, { content: e.target.value })}
                                                    helperText="Tags: {pulseira}, {cpf} ou número"
                                                />
                                                <FormControlLabel
                                                    control={
                                                        <Switch
                                                            size="small"
                                                            checked={selectedElement.exibirTexto !== false}
                                                            onChange={(e) => updateElement(selectedElement.id, { exibirTexto: e.target.checked })}
                                                        />
                                                    }
                                                    label={<Typography variant="caption" sx={{ color: '#FFFFFF' }}>Exibir número legível abaixo das barras</Typography>}
                                                />
                                            </Stack>
                                        )}

                                        {/* Propriedades Específicas: FOTO */}
                                        {selectedElement.type === 'foto' && (
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
                                        )}

                                        {/* Propriedades Específicas: FORMAS / SHAPES / CÍRCULOS */}
                                        {(selectedElement.type === 'shape' || selectedElement.type === 'circle') && (
                                            <Stack spacing={1.5}>
                                                <TextField
                                                    label="Cor de Preenchimento"
                                                    type="color"
                                                    fullWidth
                                                    size="small"
                                                    value={selectedElement.backgroundColor || '#00D4FF'}
                                                    onChange={e => updateElement(selectedElement.id, { backgroundColor: e.target.value })}
                                                />

                                                {/* Paleta Rápida de Cores */}
                                                <Stack direction="row" spacing={0.5} flexWrap="wrap">
                                                    {CORES_PALETA.map(c => (
                                                        <Box
                                                            key={c.hex}
                                                            onClick={() => updateElement(selectedElement.id, { backgroundColor: c.hex })}
                                                            sx={{
                                                                width: 22,
                                                                height: 22,
                                                                borderRadius: '50%',
                                                                bgcolor: c.hex,
                                                                cursor: 'pointer',
                                                                border: '1px solid rgba(255,255,255,0.3)',
                                                                '&:hover': { transform: 'scale(1.15)' }
                                                            }}
                                                            title={c.label}
                                                        />
                                                    ))}
                                                </Stack>

                                                <Box sx={{ px: 0.5 }}>
                                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)' }}>Opacidade da Forma:</Typography>
                                                    <Slider
                                                        size="small"
                                                        value={selectedElement.opacity != null ? selectedElement.opacity : 1}
                                                        min={0.1}
                                                        max={1}
                                                        step={0.05}
                                                        onChange={(_, v) => updateElement(selectedElement.id, { opacity: v })}
                                                    />
                                                </Box>
                                            </Stack>
                                        )}

                                        {/* Propriedades Específicas: LINHA DIVISÓRIA */}
                                        {selectedElement.type === 'line' && (
                                            <Stack spacing={1.5}>
                                                <TextField
                                                    label="Cor da Linha"
                                                    type="color"
                                                    fullWidth
                                                    size="small"
                                                    value={selectedElement.borderColor || selectedElement.color || '#000000'}
                                                    onChange={e => updateElement(selectedElement.id, { borderColor: e.target.value, color: e.target.value })}
                                                />

                                                <Stack direction="row" spacing={0.5} flexWrap="wrap">
                                                    {CORES_PALETA.map(c => (
                                                        <Box
                                                            key={c.hex}
                                                            onClick={() => updateElement(selectedElement.id, { borderColor: c.hex, color: c.hex })}
                                                            sx={{
                                                                width: 22,
                                                                height: 22,
                                                                borderRadius: '50%',
                                                                bgcolor: c.hex,
                                                                cursor: 'pointer',
                                                                border: '1px solid rgba(255,255,255,0.3)',
                                                                '&:hover': { transform: 'scale(1.15)' }
                                                            }}
                                                            title={c.label}
                                                        />
                                                    ))}
                                                </Stack>

                                                <TextField
                                                    label="Espessura do Traço (px)"
                                                    type="number"
                                                    fullWidth
                                                    size="small"
                                                    value={selectedElement.borderWidth || 2}
                                                    onChange={e => updateElement(selectedElement.id, { borderWidth: Number(e.target.value) })}
                                                />

                                                <Box sx={{ px: 0.5 }}>
                                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)' }}>Opacidade da Linha:</Typography>
                                                    <Slider
                                                        size="small"
                                                        value={selectedElement.opacity != null ? selectedElement.opacity : 1}
                                                        min={0.1}
                                                        max={1}
                                                        step={0.05}
                                                        onChange={(_, v) => updateElement(selectedElement.id, { opacity: v })}
                                                    />
                                                </Box>
                                            </Stack>
                                        )}

                                        {/* Ordenação de Camadas do Elemento */}
                                        <Box sx={{ pt: 1, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                                            <Typography variant="caption" sx={{ color: '#00D4FF', fontWeight: 700, display: 'block', mb: 1 }}>
                                                Nível de Camada (Z-Index):
                                            </Typography>
                                            <Stack direction="row" spacing={1}>
                                                <Button
                                                    size="small"
                                                    variant="outlined"
                                                    onClick={() => bringToFront(selectedElement.id)}
                                                    sx={{ ...botaoSecundario, fontSize: '0.7rem', flex: 1 }}
                                                >
                                                    Trazer para Frente
                                                </Button>
                                                <Button
                                                    size="small"
                                                    variant="outlined"
                                                    onClick={() => sendToBack(selectedElement.id)}
                                                    sx={{ ...botaoSecundario, fontSize: '0.7rem', flex: 1 }}
                                                >
                                                    Enviar para Trás
                                                </Button>
                                            </Stack>
                                        </Box>
                                    </Stack>
                                ) : (
                                    <Box sx={{ p: 3, textAlign: 'center' }}>
                                        <TuneIcon sx={{ fontSize: 36, color: 'rgba(255,255,255,0.2)', mb: 1 }} />
                                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                                            Selecione qualquer elemento na prancheta para ver e editar suas propriedades.
                                        </Typography>
                                    </Box>
                                )}
                            </Box>
                        )}

                        {/* ABA 3: LISTA DE CAMADAS (LAYERS) */}
                        {sidebarTab === 3 && (
                            <Stack spacing={1}>
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                                    <Typography variant="caption" sx={{ color: '#00D4FF', fontWeight: 700, textTransform: 'uppercase' }}>
                                        Camadas na Prancheta ({elements.length})
                                    </Typography>
                                    <Stack direction="row" spacing={0.5}>
                                        <Button
                                            size="small"
                                            onClick={() => setSelectedIds(elements.map(e => e.id))}
                                            sx={{ fontSize: '0.65rem', py: 0.1, px: 0.8, color: '#00FF88', textTransform: 'none' }}
                                        >
                                            Todas
                                        </Button>
                                        {selectedIds.length > 0 && (
                                            <Button
                                                size="small"
                                                onClick={() => setSelectedIds([])}
                                                sx={{ fontSize: '0.65rem', py: 0.1, px: 0.8, color: 'rgba(255,255,255,0.5)', textTransform: 'none' }}
                                            >
                                                Limpar
                                            </Button>
                                        )}
                                    </Stack>
                                </Box>

                                {elementosOrdenados.map((el) => (
                                    <Box
                                        key={el.id}
                                        onClick={(e) => {
                                            if (e.shiftKey || e.ctrlKey || e.metaKey) {
                                                setSelectedIds(prev => prev.includes(el.id) ? prev.filter(i => i !== el.id) : [...prev, el.id]);
                                            } else {
                                                setSelectedIds([el.id]);
                                            }
                                            setSidebarTab(2);
                                        }}
                                        sx={{
                                            p: 1,
                                            borderRadius: 1.5,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            bgcolor: selectedIds.includes(el.id)
                                                ? (selectedIds.length > 1 ? 'rgba(0, 255, 136, 0.2)' : 'rgba(0, 212, 255, 0.15)')
                                                : 'rgba(0,0,0,0.2)',
                                            border: selectedIds.includes(el.id)
                                                ? (selectedIds.length > 1 ? '1px solid #00FF88' : '1px solid #00D4FF')
                                                : '1px solid rgba(255,255,255,0.06)',
                                            cursor: 'pointer',
                                            '&:hover': { bgcolor: 'rgba(0, 212, 255, 0.1)' }
                                        }}
                                    >
                                        <Stack direction="row" spacing={1} alignItems="center">
                                            {el.type === 'text' && <TextIcon sx={{ fontSize: 16, color: '#00D4FF' }} />}
                                            {el.type === 'qrcode' && <QrIcon sx={{ fontSize: 16, color: '#00D4FF' }} />}
                                            {el.type === 'barcode' && <BarcodeIcon sx={{ fontSize: 16, color: '#00D4FF' }} />}
                                            {el.type === 'foto' && <FotoIcon sx={{ fontSize: 16, color: '#00D4FF' }} />}
                                            {el.type === 'image' && <ImageIcon sx={{ fontSize: 16, color: '#00D4FF' }} />}
                                            {el.type === 'shape' && <ShapeIcon sx={{ fontSize: 16, color: '#00D4FF' }} />}
                                            {el.type === 'circle' && <CircleIcon sx={{ fontSize: 16, color: '#00D4FF' }} />}
                                            {el.type === 'line' && <LineIcon sx={{ fontSize: 16, color: '#00D4FF' }} />}

                                            <Typography variant="caption" sx={{ color: '#FFFFFF', fontWeight: selectedIds.includes(el.id) ? 700 : 400 }}>
                                                {el.content ? String(el.content).slice(0, 20) : el.type}
                                            </Typography>
                                        </Stack>

                                        <IconButton
                                            size="small"
                                            color="error"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                deleteElement(el.id);
                                            }}
                                            sx={{ p: 0.3 }}
                                        >
                                            <DeleteIcon sx={{ fontSize: 15 }} />
                                        </IconButton>
                                    </Box>
                                ))}
                            </Stack>
                        )}
                    </GlassCard>
                </Grid>

                {/* COLUNA DIREITA: PRANCHETA / MESA DE TRABALHO COM ZOOM, GRADE E GUIAS */}
                <Grid item xs={12} md={7.5} lg={8}>
                    <GlassCard sx={{ p: { xs: 1.5, sm: 2.5 }, height: '100%', display: 'flex', flexDirection: 'column' }}>
                        {/* BARRA SUPERIOR DA MESA DE TRABALHO: GRADE, ZOOM E GABARITO */}
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, flexWrap: 'wrap', gap: 1.5 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#FFFFFF' }}>
                                    Prancheta: {config.width} × {config.height} mm
                                </Typography>
                                {config.background_url && config.fundo_como_referencia && (
                                    <Chip
                                        size="small"
                                        label="Modo Gabarito Ativo"
                                        sx={{ bgcolor: 'rgba(0, 255, 136, 0.15)', color: '#00FF88', fontWeight: 700, fontSize: '0.65rem' }}
                                    />
                                )}
                            </Box>

                            {/* Controles de Visualização: Zoom, Grade e Gabarito */}
                            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                                {/* Ocultar/Exibir Gabarito */}
                                {config.background_url && (
                                    <Tooltip title={ocultarGabarito ? 'Exibir gabarito de fundo' : 'Ocultar temporariamente gabarito de fundo'}>
                                        <IconButton
                                            size="small"
                                            onClick={() => setOcultarGabarito(!ocultarGabarito)}
                                            sx={{ color: ocultarGabarito ? '#FF3366' : '#00FF88', border: '1px solid rgba(255,255,255,0.1)' }}
                                        >
                                            {ocultarGabarito ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                                        </IconButton>
                                    </Tooltip>
                                )}

                                {/* Grade */}
                                <FormControlLabel
                                    control={
                                        <Switch
                                            size="small"
                                            checked={showGrid}
                                            onChange={(e) => setShowGrid(e.target.checked)}
                                        />
                                    }
                                    label={
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontSize: '0.75rem', color: '#FFFFFF' }}>
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
                                        <Typography sx={{ fontSize: '0.75rem', color: '#FFFFFF' }}>
                                            Alinhar ao Soltar
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
                                        <MenuItem value={15}>15px</MenuItem>
                                        <MenuItem value={20}>20px</MenuItem>
                                    </Select>
                                )}

                                <Divider orientation="vertical" flexItem sx={{ borderColor: 'rgba(255,255,255,0.1)' }} />

                                {/* Controles de Zoom */}
                                <Stack direction="row" spacing={0.5} alignItems="center">
                                    <Tooltip title="Diminuir Zoom">
                                        <IconButton size="small" onClick={() => setZoom(prev => Math.max(0.4, Number((prev - 0.1).toFixed(1))))} sx={{ color: '#FFFFFF' }}>
                                            <ZoomOutIcon fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                    <Typography variant="caption" sx={{ color: '#00D4FF', fontWeight: 700, minWidth: 36, textAlign: 'center' }}>
                                        {Math.round(zoom * 100)}%
                                    </Typography>
                                    <Tooltip title="Aumentar Zoom">
                                        <IconButton size="small" onClick={() => setZoom(prev => Math.min(1.5, Number((prev + 0.1).toFixed(1))))} sx={{ color: '#FFFFFF' }}>
                                            <ZoomInIcon fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                    <Tooltip title="Resetar Zoom (100%)">
                                        <IconButton size="small" onClick={() => setZoom(1.0)} sx={{ color: 'rgba(255,255,255,0.5)' }}>
                                            <ResetZoomIcon fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                </Stack>
                            </Stack>
                        </Box>

                        {/* MESA DE TRABALHO DA PRANCHETA COM ZOOM FLUIDO */}
                        <Box sx={{
                            flex: 1,
                            minHeight: '620px',
                            display: 'flex',
                            p: { xs: 1.5, sm: 3 },
                            background: '#050B18',
                            borderRadius: 2,
                            border: '1px solid rgba(0, 212, 255, 0.2)',
                            overflow: 'auto',
                            position: 'relative'
                        }}>
                            <Box sx={{
                                m: 'auto',
                                transform: `scale(${zoom})`,
                                transformOrigin: 'center center',
                                transition: 'transform 0.15s ease'
                            }}>
                                <Paper
                                    elevation={16}
                                    onClick={() => setSelectedIds([])}
                                    sx={{
                                        width: canvasWidth,
                                        height: canvasHeight,
                                        backgroundColor: '#FFFFFF',
                                        position: 'relative',
                                        overflow: 'hidden',
                                        borderRadius: config.layout?.includes('cr80') ? '12px' : '4px',
                                        boxShadow: '0 12px 40px rgba(0,0,0,0.8), 0 0 20px rgba(0, 212, 255, 0.2)'
                                    }}
                                >
                                    {/* Arte de Fundo / Gabarito de Referência Visual (Situação C) */}
                                    {config.background_url && !ocultarGabarito && (
                                        <Box sx={{
                                            position: 'absolute',
                                            top: 0,
                                            left: 0,
                                            right: 0,
                                            bottom: 0,
                                            backgroundImage: `url('${config.background_url}')`,
                                            backgroundSize: 'cover',
                                            backgroundPosition: 'center',
                                            backgroundRepeat: 'no-repeat',
                                            opacity: config.fundo_como_referencia ? (config.opacidade_referencia || 0.5) : 1,
                                            pointerEvents: config.travar_referencia ? 'none' : 'auto',
                                            zIndex: 1
                                        }} />
                                    )}

                                    {/* Camada de Grade Visual Ativável */}
                                    {showGrid && (
                                        <Box sx={{
                                            position: 'absolute',
                                            top: 0,
                                            left: 0,
                                            right: 0,
                                            bottom: 0,
                                            pointerEvents: 'none',
                                            backgroundImage: `
                                                linear-gradient(to right, rgba(0, 212, 255, 0.1) 1px, transparent 1px),
                                                linear-gradient(to bottom, rgba(0, 212, 255, 0.1) 1px, transparent 1px)
                                            `,
                                            backgroundSize: `${gridSize}px ${gridSize}px`,
                                            zIndex: 2
                                        }} />
                                    )}

                                    {/* Guias Inteligentes Magnéticas estilo Canva (Rosa / Magenta) */}
                                    {smartGuides.vertical !== null && (
                                        <Box sx={{
                                            position: 'absolute',
                                            top: 0,
                                            bottom: 0,
                                            left: smartGuides.vertical,
                                            width: '2px',
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
                                            height: '2px',
                                            backgroundColor: '#FF0077',
                                            boxShadow: '0 0 6px #FF0077',
                                            zIndex: 999,
                                            pointerEvents: 'none'
                                        }} />
                                    )}

                                    {/* Renderização dos Elementos na Prancheta */}
                                    {elements.map(el => {
                                        const isSel = selectedIds.includes(el.id);
                                        const isMulti = selectedIds.length > 1;
                                        return (
                                            <Rnd
                                                key={el.id}
                                                scale={zoom}
                                                size={{ width: el.width, height: el.height }}
                                                position={{ x: el.x, y: el.y }}
                                                lockAspectRatio={Boolean(el.lockAspectRatio)}
                                                onDragStart={(e, d) => handleDragStart(e, d, el)}
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
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (e.shiftKey || e.ctrlKey || e.metaKey) {
                                                        setSelectedIds(prev => prev.includes(el.id) ? prev.filter(i => i !== el.id) : [...prev, el.id]);
                                                    } else {
                                                        if (!selectedIds.includes(el.id) || selectedIds.length > 1) {
                                                            setSelectedIds([el.id]);
                                                        }
                                                    }
                                                    setSidebarTab(2); // Muda para aba de propriedades
                                                }}
                                                style={{
                                                    border: isSel
                                                        ? (isMulti ? '2px dashed #00FF88' : '2px dashed #00D4FF')
                                                        : '1px dashed rgba(0,0,0,0.15)',
                                                    boxShadow: isSel
                                                        ? (isMulti ? '0 0 10px rgba(0, 255, 136, 0.45)' : '0 0 10px rgba(0, 212, 255, 0.35)')
                                                        : 'none',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    overflow: 'hidden',
                                                    cursor: 'move',
                                                    borderRadius: el.borderRadius ? `${el.borderRadius}px` : 0,
                                                    opacity: el.opacity != null ? el.opacity : 1,
                                                    zIndex: isSel ? 100 : (el.zIndex || 3)
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

                                            {/* RENDERIZAÇÃO: CÓDIGO DE BARRAS 1D */}
                                            {el.type === 'barcode' && (
                                                <Box
                                                    sx={{
                                                        width: '100%',
                                                        height: '100%',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center'
                                                    }}
                                                    dangerouslySetInnerHTML={{
                                                        __html: gerarBarcodeSvg(el.content || '123456', el.exibirTexto !== false)
                                                    }}
                                                />
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

                                            {/* RENDERIZAÇÃO: RETÂNGULO / TARJA */}
                                            {el.type === 'shape' && (
                                                <Box sx={{
                                                    width: '100%',
                                                    height: '100%',
                                                    backgroundColor: el.backgroundColor || '#00D4FF',
                                                    borderRadius: el.borderRadius ? `${el.borderRadius}px` : 0
                                                }} />
                                            )}

                                            {/* RENDERIZAÇÃO: CÍRCULO / SELO */}
                                            {el.type === 'circle' && (
                                                <Box sx={{
                                                    width: '100%',
                                                    height: '100%',
                                                    backgroundColor: el.backgroundColor || '#00FF88',
                                                    borderRadius: '50%',
                                                    border: `${el.borderWidth || 0}px solid ${el.borderColor || '#000000'}`
                                                }} />
                                            )}

                                            {/* RENDERIZAÇÃO: LINHA DIVISÓRIA */}
                                            {el.type === 'line' && (
                                                <Box sx={{
                                                    width: '100%',
                                                    height: '100%',
                                                    borderTop: `${el.borderWidth || 2}px solid ${el.borderColor || '#000000'}`
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
                                        );
                                    })}
                                </Paper>
                            </Box>
                        </Box>
                    </GlassCard>
                </Grid>
            </Grid>
        </Box>
    );
};

export default ConfigEtiquetas;