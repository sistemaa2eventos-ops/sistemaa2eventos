import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
    Box, Typography, Grid, TextField, IconButton, Paper, Stack,
    Button, Tooltip, MenuItem, FormControl, InputLabel, Select,
    Divider, Slider, Switch, FormControlLabel, Tabs, Tab, Chip, Alert
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
    AlignHorizontalCenter as AlignCenterHIcon,
    AlignVerticalTop as AlignVTopIcon,
    AlignVerticalCenter as AlignCenterVIcon,
    AlignVerticalBottom as AlignVBottomIcon,
    ViewWeek as DistribuirHIcon,
    TableRows as DistribuirVIcon,
    Layers as LayersIcon,
    Visibility as VisibilityIcon,
    VisibilityOff as VisibilityOffIcon,
    ZoomIn as ZoomInIcon,
    ZoomOut as ZoomOutIcon,
    FitScreen as FitIcon,
    Tune as TuneIcon,
    AddCircleOutline as AddElementIcon,
    Keyboard as KeyboardIcon,
    FlipToFront as FrenteIcon,
    FlipToBack as TrasIcon,
    KeyboardArrowUp as AvancarIcon,
    KeyboardArrowDown as RecuarIcon,
    Link as AgruparIcon,
    LinkOff as DesagruparIcon,
    Wallpaper as ArteIcon,
    Grid4x4 as ImaIcon,
    OpenInFull as AumentarIcon,
    CloseFullscreen as DiminuirIcon,
    AspectRatio as PreencherIcon
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import { Rnd } from 'react-rnd';
import { useSearchParams } from 'react-router-dom';
import api from '../../services/api';
import GlassCard from '../../components/common/GlassCard';
import NeonButton from '../../components/common/NeonButton';
import PageHeader from '../../components/common/PageHeader';
import { montarHtmlEtiqueta, imprimirHtml, limparCacheEtiqueta, gerarBarcodeSvg } from '../../services/etiquetaService';
import { botaoSecundario, cores } from '../../styles/tokens';
import {
    Z_BASE, ordenarPorCamada, normalizarCamadas, expandirGrupos, reordenarCamadas,
    agruparElementos, desagruparElementos, caixaDoGrupo, idsNaArea, escalarItem,
    arredondarItem, alinharEntreSi
} from './etiquetas/camadas';

const ESCALA = 3; // 1 mm = 3 px na prancheta (mesma escala da impressão)

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

const CORES_GRADE = [
    { label: 'Azul', hex: '#0080FF' },
    { label: 'Magenta', hex: '#FF0077' },
    { label: 'Branca (artes escuras)', hex: '#FFFFFF' },
    { label: 'Preta', hex: '#000000' }
];

const TIPO_ROTULO = {
    text: 'Texto', qrcode: 'QR Code', barcode: 'Cód. barras', foto: 'Foto',
    image: 'Imagem', shape: 'Retângulo', circle: 'Círculo', line: 'Linha'
};

const TIPO_ICONE = {
    text: TextIcon, qrcode: QrIcon, barcode: BarcodeIcon, foto: FotoIcon,
    image: ImageIcon, shape: ShapeIcon, circle: CircleIcon, line: LineIcon
};

const nomeDoElemento = (el) => {
    if (el.nome) return el.nome;
    if (el.papel === 'arte') return 'Arte do evento';
    if (el.type === 'text' && el.content) return String(el.content).slice(0, 28);
    return TIPO_ROTULO[el.type] || el.type;
};

const ELEMENTOS_INICIAIS = normalizarCamadas([
    { id: '1', type: 'text', content: '{nome_pessoa}', x: 10, y: 15, width: 220, height: 35, fontSize: 18, fontWeight: 'bold', color: '#000000', textAlign: 'center', zIndex: 10 },
    { id: '2', type: 'text', content: '{funcao}', x: 10, y: 55, width: 220, height: 25, fontSize: 14, fontWeight: 'normal', color: '#555555', textAlign: 'center', zIndex: 9 },
    { id: '3', type: 'qrcode', content: '{qr_code}', x: 75, y: 95, width: 90, height: 90, lockAspectRatio: true, zIndex: 8 },
    { id: '4', type: 'foto', content: '{foto_url}', x: 80, y: 200, width: 80, height: 80, borderRadius: 8, borderColor: '#00D4FF', borderWidth: 2, lockAspectRatio: true, zIndex: 7 }
]);

// Alças de redimensionamento: cantos visíveis + barrinhas no meio das bordas (esticar livre)
const alcasDeRedimensionar = (cor, redondo) => {
    const canto = {
        width: 12, height: 12, background: '#FFFFFF', border: `2px solid ${cor}`,
        borderRadius: redondo ? '50%' : 2, boxShadow: `0 0 6px ${cor}`, pointerEvents: 'auto', zIndex: 2
    };
    const barra = (horizontal) => ({
        pointerEvents: 'auto',
        backgroundImage: `linear-gradient(${cor}, ${cor})`,
        backgroundSize: horizontal ? '18px 4px' : '4px 18px',
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'center'
    });
    return {
        topLeft: { ...canto, left: -7, top: -7 },
        topRight: { ...canto, right: -7, top: -7 },
        bottomLeft: { ...canto, left: -7, bottom: -7 },
        bottomRight: { ...canto, right: -7, bottom: -7 },
        top: barra(true),
        bottom: barra(true),
        left: barra(false),
        right: barra(false)
    };
};
const ALCAS_SIMPLES = alcasDeRedimensionar('#00D4FF', false);
const ALCAS_GRUPO = alcasDeRedimensionar('#00FF88', true);

const PREFS_KEY = 'nzt_etiquetas_editor_prefs';
const lerPrefs = () => {
    try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; } catch { return {}; }
};

const lerArquivoComoDataUrl = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => resolve(ev.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
});

const medirImagem = (src) => new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth || 1, h: img.naturalHeight || 1 });
    img.onerror = () => resolve({ w: 1, h: 1 });
    img.src = src;
});

const idDoNo = (node) => {
    const classe = [...(node?.classList || [])].find(c => c.startsWith('etq-id-'));
    return classe ? classe.slice(7) : null;
};

// ---------- Pequenos blocos visuais no padrão do NZT ----------
const Secao = ({ children, sx }) => (
    <Typography
        variant="caption"
        sx={{ color: cores.primaria, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', fontSize: '0.75rem', ...sx }}
    >
        {children}
    </Typography>
);

const BotaoFerramenta = ({ titulo, onClick, disabled, ativo, cor, children }) => (
    <Tooltip title={titulo}>
        <span>
            <IconButton
                size="small"
                onClick={onClick}
                disabled={disabled}
                sx={{
                    width: 34,
                    height: 34,
                    borderRadius: '8px',
                    color: ativo ? (cor || cores.primaria) : cores.textoSuave,
                    bgcolor: ativo ? 'rgba(0, 212, 255, 0.12)' : 'transparent',
                    border: `1px solid ${ativo ? 'rgba(0, 212, 255, 0.45)' : 'rgba(148, 163, 184, 0.18)'}`,
                    '&:hover': { color: cor || cores.primaria, borderColor: 'rgba(0, 212, 255, 0.45)', bgcolor: 'rgba(0, 212, 255, 0.08)' },
                    '&.Mui-disabled': { color: 'rgba(148, 163, 184, 0.3)', borderColor: 'rgba(148, 163, 184, 0.08)' }
                }}
            >
                {children}
            </IconButton>
        </span>
    </Tooltip>
);

const BotaoAdicionar = ({ icone: Icone, rotulo, onClick }) => (
    <Button
        fullWidth
        variant="outlined"
        onClick={onClick}
        sx={{
            ...botaoSecundario,
            flexDirection: 'column',
            gap: 0.5,
            py: 1.25,
            minHeight: 72,
            fontSize: '0.75rem',
            textTransform: 'none',
            borderRadius: '8px',
            whiteSpace: 'normal',
            lineHeight: 1.2
        }}
    >
        <Icone sx={{ fontSize: 22, color: cores.primaria }} />
        {rotulo}
    </Button>
);

const ConfigEtiquetas = () => {
    const [searchParams] = useSearchParams();
    const eventoId = searchParams.get('evento_id') || localStorage.getItem('active_evento_id');
    const { enqueueSnackbar } = useSnackbar();

    const fileArteInputRef = useRef(null);
    const fileElementInputRef = useRef(null);
    const workspaceRef = useRef(null);
    const paperRef = useRef(null);
    const dragRef = useRef(null);          // arraste em bloco
    const grupoResizeRef = useRef(null);   // escala do grupo
    const elementsRef = useRef([]);

    // Abas da coluna esquerda: 0 Formato & arte, 1 Elementos, 2 Camadas
    const [sidebarTab, setSidebarTab] = useState(0);

    const [config, setConfig] = useState({
        layout: 'zebra_tlp2844',
        width: 100,
        height: 150,
        background_url: '',
        fundo_como_referencia: false, // Situação C (modo antigo): arte de guia visual (não imprime)
        imprimir_fundo: true,
        opacidade_referencia: 0.5,
        travar_referencia: true
    });

    const [elements, setElements] = useState(ELEMENTOS_INICIAIS);
    const [selectedIds, setSelectedIds] = useState([]);
    const [saving, setSaving] = useState(false);

    // Preferências de visualização (lembradas neste navegador)
    const prefs = useMemo(lerPrefs, []);
    const [showGrid, setShowGrid] = useState(prefs.showGrid ?? true);
    const [gridSize, setGridSize] = useState(prefs.gridSize ?? 10);
    const [gridColor, setGridColor] = useState(prefs.gridColor ?? '#0080FF');
    const [gridIntensity, setGridIntensity] = useState(prefs.gridIntensity ?? 0.7);
    const [snapToGrid, setSnapToGrid] = useState(prefs.snapToGrid ?? true);
    const [escalaProporcional, setEscalaProporcional] = useState(true);

    const [smartGuides, setSmartGuides] = useState({ vertical: null, horizontal: null });
    const [zoom, setZoom] = useState(1);
    const [ocultarGabarito, setOcultarGabarito] = useState(false);
    const [marquee, setMarquee] = useState(null);

    const canvasWidth = (Number(config.width) || 100) * ESCALA;
    const canvasHeight = (Number(config.height) || 150) * ESCALA;

    useEffect(() => { elementsRef.current = elements; }, [elements]);

    useEffect(() => {
        localStorage.setItem(PREFS_KEY, JSON.stringify({ showGrid, gridSize, gridColor, gridIntensity, snapToGrid }));
    }, [showGrid, gridSize, gridColor, gridIntensity, snapToGrid]);

    useEffect(() => {
        if (!eventoId) return;
        (async () => {
            try {
                const response = await api.get('/config/etiquetas', { params: { evento_id: eventoId } });
                const dados = response.data.data;
                if (dados?.papel_config) setConfig(prev => ({ ...prev, ...dados.papel_config }));
                if (Array.isArray(dados?.elementos)) setElements(normalizarCamadas(dados.elementos));
            } catch {
                enqueueSnackbar('Falha ao carregar layout de etiqueta.', { variant: 'error' });
            }
        })();
    }, [eventoId, enqueueSnackbar]);

    // ---------- Zoom ----------
    const ajustarATela = useCallback(() => {
        const ws = workspaceRef.current;
        if (!ws) return;
        const fit = Math.min((ws.clientWidth - 72) / canvasWidth, (ws.clientHeight - 72) / canvasHeight);
        setZoom(Math.max(0.25, Math.min(3, Math.floor(fit * 20) / 20)));
    }, [canvasWidth, canvasHeight]);

    useEffect(() => {
        const id = requestAnimationFrame(ajustarATela);
        return () => cancelAnimationFrame(id);
    }, [ajustarATela]);

    const mudarZoom = (delta) => setZoom(z => Math.max(0.25, Math.min(3, Math.round((z + delta) * 100) / 100)));

    // Ctrl + roda do mouse = zoom
    useEffect(() => {
        const ws = workspaceRef.current;
        if (!ws) return undefined;
        const onWheel = (e) => {
            if (!e.ctrlKey && !e.metaKey) return;
            e.preventDefault();
            setZoom(z => Math.max(0.25, Math.min(3, Math.round((z + (e.deltaY < 0 ? 0.1 : -0.1)) * 100) / 100)));
        };
        ws.addEventListener('wheel', onWheel, { passive: false });
        return () => ws.removeEventListener('wheel', onWheel);
    }, []);

    // ---------- Seleção derivada ----------
    const selecionados = useMemo(() => elements.filter(el => selectedIds.includes(el.id)), [elements, selectedIds]);
    const moveis = useMemo(() => selecionados.filter(el => !el.locked && !el.oculto), [selecionados]);
    const caixaSelecao = useMemo(() => (moveis.length > 1 ? caixaDoGrupo(moveis) : null), [moveis]);
    const selectedElement = selecionados.length === 1 ? selecionados[0] : null;
    const temGrupoNaSelecao = selecionados.some(el => el.groupId);
    const todosTravados = selecionados.length > 0 && selecionados.every(el => el.locked);
    const elementosOrdenados = useMemo(() => [...ordenarPorCamada(elements)].reverse(), [elements]);
    const camadasDeArte = elements.filter(el => el.papel === 'arte');

    // ---------- Configuração do papel ----------
    const handleChangePreset = (presetValue) => {
        const found = PRESETS.find(p => p.value === presetValue);
        setConfig(prev => (found ? { ...prev, layout: presetValue, width: found.width, height: found.height } : { ...prev, layout: presetValue }));
    };

    const handleChangeConfig = (field, value) => setConfig(prev => ({ ...prev, [field]: value }));

    // ---------- Criação de elementos ----------
    const maiorZ = (lista) => lista.reduce((max, el) => Math.max(max, el.zIndex || 0), Z_BASE - 1);

    const inserir = (novo) => {
        setElements(prev => [...prev, { ...novo, zIndex: maiorZ(prev) + 1 }]);
        setSelectedIds([novo.id]);
    };

    const addElement = (type) => {
        if (type === 'image') {
            fileElementInputRef.current?.click();
            return;
        }
        const base = { id: Date.now().toString(), type, x: 20, y: 20, width: 150, height: 35, lockAspectRatio: false };
        const porTipo = {
            text: { content: '{nome_pessoa}', fontSize: 16, fontWeight: 'bold', color: '#000000', textAlign: 'left' },
            qrcode: { content: '{qr_code}', width: 80, height: 80, lockAspectRatio: true },
            barcode: { content: '{pulseira}', width: 160, height: 55, exibirTexto: true },
            foto: { content: '{foto_url}', width: 80, height: 80, borderRadius: 8, borderColor: '#00D4FF', borderWidth: 2, lockAspectRatio: true },
            shape: { width: 200, height: 30, backgroundColor: '#00D4FF', borderRadius: 4, opacity: 1 },
            circle: { width: 60, height: 60, backgroundColor: '#00FF88', borderRadius: 50, borderColor: '#000000', borderWidth: 0, opacity: 1, lockAspectRatio: true },
            line: { width: 200, height: 4, borderColor: '#000000', borderWidth: 2, opacity: 1 }
        };
        inserir({ ...base, ...(porTipo[type] || {}) });
    };

    const handleUploadElementImage = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        const src = await lerArquivoComoDataUrl(file);
        const { w, h } = await medirImagem(src);
        const lado = 120;
        const fator = Math.min(lado / w, lado / h);
        inserir({
            id: Date.now().toString(), type: 'image', content: src, x: 20, y: 20,
            width: Math.round(w * fator), height: Math.round(h * fator),
            borderRadius: 0, opacity: 1, lockAspectRatio: true, objectFit: 'contain'
        });
        enqueueSnackbar('Imagem adicionada ao crachá!', { variant: 'success' });
    };

    // Arte do evento entra como CAMADA (pode ir para frente/trás, travar, ocultar e virar referência)
    const novaCamadaDeArte = (src, extra = {}) => ({
        id: `arte_${Date.now()}`,
        type: 'image',
        papel: 'arte',
        nome: 'Arte do evento',
        content: src,
        x: 0,
        y: 0,
        width: canvasWidth,
        height: canvasHeight,
        objectFit: 'fill',
        lockAspectRatio: false,
        locked: true,
        opacity: 1,
        apenasReferencia: false,
        ...extra
    });

    const colocarArteNoFundo = (camada) => {
        setElements(prev => reordenarCamadas([...prev, { ...camada, zIndex: maiorZ(prev) + 1 }], [camada.id], 'tras'));
        setSelectedIds([camada.id]);
    };

    const handleUploadArte = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        const src = await lerArquivoComoDataUrl(file);
        colocarArteNoFundo(novaCamadaDeArte(src));
        enqueueSnackbar('Arte do evento inserida como camada (travada no fundo).', { variant: 'success' });
    };

    const converterFundoEmCamada = () => {
        if (!config.background_url) return;
        const ref = Boolean(config.fundo_como_referencia);
        colocarArteNoFundo(novaCamadaDeArte(config.background_url, {
            apenasReferencia: ref,
            opacity: ref ? (config.opacidade_referencia || 0.5) : 1,
            locked: config.travar_referencia !== false
        }));
        setConfig(prev => ({ ...prev, background_url: '', fundo_como_referencia: false, imprimir_fundo: true }));
        enqueueSnackbar('Fundo convertido em camada. Agora ele aparece na aba Camadas.', { variant: 'success' });
    };

    // ---------- Edição ----------
    const updateElement = (id, newProps) => {
        setElements(prev => prev.map(el => (el.id === id ? { ...el, ...newProps } : el)));
    };

    const atualizarSelecionados = (fn) => {
        setElements(prev => prev.map(el => (selectedIds.includes(el.id) ? { ...el, ...fn(el) } : el)));
    };

    const excluirSelecionados = () => {
        if (!selecionados.length) return;
        const apagar = selecionados.filter(el => !el.locked).map(el => el.id);
        if (!apagar.length) {
            enqueueSnackbar('Elemento travado: destrave (cadeado) para excluir.', { variant: 'warning' });
            return;
        }
        setElements(prev => prev.filter(el => !apagar.includes(el.id)));
        setSelectedIds(prev => prev.filter(id => !apagar.includes(id)));
        enqueueSnackbar(apagar.length > 1 ? `${apagar.length} elementos excluídos.` : 'Elemento excluído.', { variant: 'info', autoHideDuration: 1500 });
    };

    const excluirElemento = (id) => {
        setElements(prev => prev.filter(el => el.id !== id));
        setSelectedIds(prev => prev.filter(item => item !== id));
    };

    const duplicarSelecionados = () => {
        if (!selecionados.length) return;
        const base = Date.now();
        const mapaGrupo = {};
        const topo = maiorZ(elements);
        const novos = ordenarPorCamada(selecionados).map((el, i) => {
            const copia = { ...el, id: `${base}_${i}`, x: el.x + 15, y: el.y + 15, zIndex: topo + 1 + i, locked: false };
            if (el.groupId) {
                mapaGrupo[el.groupId] = mapaGrupo[el.groupId] || `g_${base}_${i}`;
                copia.groupId = mapaGrupo[el.groupId];
            }
            return copia;
        });
        setElements(prev => [...prev, ...novos]);
        setSelectedIds(novos.map(n => n.id));
    };

    const moverSelecionados = (dx, dy) => {
        setElements(prev => prev.map(el => {
            if (!selectedIds.includes(el.id) || el.locked) return el;
            return {
                ...el,
                x: Math.round(Math.max(0, Math.min(canvasWidth - el.width, el.x + dx))),
                y: Math.round(Math.max(0, Math.min(canvasHeight - el.height, el.y + dy)))
            };
        }));
    };

    const selecionarTodos = () => {
        setSelectedIds(elements.filter(el => !el.locked && !el.oculto).map(el => el.id));
    };

    const agrupar = () => {
        if (selectedIds.length < 2) return;
        setElements(prev => agruparElementos(prev, selectedIds));
        enqueueSnackbar('Elementos agrupados: agora se movem, escalam e mudam de camada juntos.', { variant: 'success' });
    };

    const desagrupar = () => {
        setElements(prev => desagruparElementos(prev, selectedIds));
        enqueueSnackbar('Grupo desfeito.', { variant: 'info', autoHideDuration: 1500 });
    };

    const reordenar = (acao, ids = selectedIds) => {
        if (!ids.length) return;
        setElements(prev => reordenarCamadas(prev, expandirGrupos(ids, prev), acao));
    };

    const alternarTrava = () => {
        const travar = selecionados.some(el => !el.locked);
        atualizarSelecionados(() => ({ locked: travar }));
    };

    const mostrarGuias = (vertical, horizontal) => {
        setSmartGuides({ vertical, horizontal });
        setTimeout(() => setSmartGuides({ vertical: null, horizontal: null }), 1200);
    };

    // Alinha a seleção (1 item ou o bloco inteiro) em relação à prancheta
    const alinharNaPrancheta = (posicao) => {
        const caixa = caixaDoGrupo(moveis);
        if (!caixa) return;
        let dx = 0;
        let dy = 0;
        if (posicao === 'centro-x' || posicao === 'centro-total') dx = Math.round((canvasWidth - caixa.width) / 2) - caixa.x;
        if (posicao === 'centro-y' || posicao === 'centro-total') dy = Math.round((canvasHeight - caixa.height) / 2) - caixa.y;
        if (posicao === 'esquerda') dx = -caixa.x;
        if (posicao === 'direita') dx = canvasWidth - caixa.width - caixa.x;
        if (posicao === 'topo') dy = -caixa.y;
        if (posicao === 'base') dy = canvasHeight - caixa.height - caixa.y;
        const ids = moveis.map(el => el.id);
        setElements(prev => prev.map(el => (ids.includes(el.id) ? { ...el, x: Math.round(el.x + dx), y: Math.round(el.y + dy) } : el)));
        mostrarGuias(
            posicao === 'centro-x' || posicao === 'centro-total' ? canvasWidth / 2 : null,
            posicao === 'centro-y' || posicao === 'centro-total' ? canvasHeight / 2 : null
        );
    };

    const alinharEntre = (modo) => {
        const mapa = alinharEntreSi(moveis, modo);
        setElements(prev => prev.map(el => (mapa[el.id] ? { ...el, ...mapa[el.id] } : el)));
    };

    // Escala o grupo pelo centro (botões −10% / +10%)
    const escalarSelecao = (fator) => {
        const caixa = caixaDoGrupo(moveis);
        if (!caixa) return;
        const nova = {
            width: caixa.width * fator,
            height: caixa.height * fator,
            x: caixa.x + (caixa.width - caixa.width * fator) / 2,
            y: caixa.y + (caixa.height - caixa.height * fator) / 2
        };
        const mapa = Object.fromEntries(moveis.map(el => [el.id, el]));
        setElements(prev => prev.map(el => (mapa[el.id] ? arredondarItem({ ...el, ...escalarItem(mapa[el.id], caixa, nova) }) : el)));
    };

    const ocuparPranchetaInteira = (id) => updateElement(id, { x: 0, y: 0, width: canvasWidth, height: canvasHeight });

    // ---------- Atalhos de teclado (estáveis, sem churn de listeners) ----------
    const actionsRef = useRef({});
    actionsRef.current = {
        selecionarTodos,
        setSelectedIds,
        excluirSelecionados,
        duplicarSelecionados,
        desagrupar,
        agrupar,
        reordenar,
        moverSelecionados,
        selectedIds
    };

    useEffect(() => {
        const handleKeyDown = (e) => {
            const tag = e.target?.tagName?.toLowerCase();
            if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable) return;
            const ctrl = e.ctrlKey || e.metaKey;
            const tecla = e.key.toLowerCase();
            const act = actionsRef.current;

            if (ctrl && tecla === 'a') { e.preventDefault(); act.selecionarTodos(); return; }
            if (e.key === 'Escape') { act.setSelectedIds([]); return; }
            if (!act.selectedIds?.length) return;

            if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); act.excluirSelecionados(); return; }
            if (ctrl && tecla === 'd') { e.preventDefault(); act.duplicarSelecionados(); return; }
            if (ctrl && tecla === 'g') { e.preventDefault(); if (e.shiftKey) act.desagrupar(); else act.agrupar(); return; }
            if (ctrl && (e.key === ']' || e.key === '}')) { e.preventDefault(); act.reordenar(e.shiftKey ? 'frente' : 'avancar'); return; }
            if (ctrl && (e.key === '[' || e.key === '{')) { e.preventDefault(); act.reordenar(e.shiftKey ? 'tras' : 'recuar'); return; }

            const setas = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
            if (setas[e.key]) {
                e.preventDefault();
                const passo = e.shiftKey ? 10 : 1;
                act.moverSelecionados(setas[e.key][0] * passo, setas[e.key][1] * passo);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // ---------- Seleção por área (arrastar o mouse no vazio) ----------
    const marqueeCleanupRef = useRef(null);
    useEffect(() => {
        return () => {
            if (marqueeCleanupRef.current) marqueeCleanupRef.current();
        };
    }, []);

    const handleWorkspaceMouseDown = (e) => {
        if (e.button !== 0) return;
        const alvo = e.target;
        if (alvo.closest?.('.etq-group')) return;
        const noElemento = alvo.closest?.('.etq-el');
        if (noElemento && !noElemento.classList.contains('etq-locked')) return; // o próprio elemento cuida
        e.preventDefault();

        const ws = workspaceRef.current;
        const aditivo = e.shiftKey || e.ctrlKey || e.metaKey;
        const estado = {
            x0: e.clientX,
            y0: e.clientY,
            base: aditivo ? selectedIds : [],
            travado: noElemento ? idDoNo(noElemento) : null,
            moveu: false
        };
        if (!aditivo) setSelectedIds([]);

        const onMove = (ev) => {
            if (Math.abs(ev.clientX - estado.x0) + Math.abs(ev.clientY - estado.y0) > 4) estado.moveu = true;
            if (!estado.moveu || !ws) return;
            const r = ws.getBoundingClientRect();
            setMarquee({
                left: Math.min(estado.x0, ev.clientX) - r.left + ws.scrollLeft,
                top: Math.min(estado.y0, ev.clientY) - r.top + ws.scrollTop,
                width: Math.abs(ev.clientX - estado.x0),
                height: Math.abs(ev.clientY - estado.y0)
            });
        };

        const cleanup = () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            marqueeCleanupRef.current = null;
        };

        const onUp = (ev) => {
            cleanup();
            setMarquee(null);
            const lista = elementsRef.current;
            if (!estado.moveu) {
                // clique simples num elemento travado: seleciona ele (para destravar/editar)
                if (estado.travado) setSelectedIds(expandirGrupos([...estado.base, estado.travado], lista));
                return;
            }
            const pr = paperRef.current?.getBoundingClientRect();
            if (!pr) return;
            const z = pr.width / canvasWidth;
            const area = {
                x: (Math.min(estado.x0, ev.clientX) - pr.left) / z,
                y: (Math.min(estado.y0, ev.clientY) - pr.top) / z,
                width: Math.abs(ev.clientX - estado.x0) / z,
                height: Math.abs(ev.clientY - estado.y0) / z
            };
            setSelectedIds(expandirGrupos([...estado.base, ...idsNaArea(lista, area)], lista));
        };

        marqueeCleanupRef.current = cleanup;
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    };

    // Duplo clique num membro de grupo: edita só ele
    const handleWorkspaceDoubleClick = (e) => {
        const id = idDoNo(e.target.closest?.('.etq-el'));
        if (id) setSelectedIds([id]);
    };

    // ---------- Arraste (1 item ou bloco) ----------
    const handleDragStart = (e, d, el) => {
        const aditivo = e.shiftKey || e.ctrlKey || e.metaKey;
        const doGrupo = expandirGrupos([el.id], elements);
        let atual = selectedIds;
        const interacao = { desmarcar: null, soEle: null, moveu: false };

        if (aditivo) {
            if (selectedIds.includes(el.id)) interacao.desmarcar = doGrupo;
            else atual = [...new Set([...selectedIds, ...doGrupo])];
        } else if (!selectedIds.includes(el.id)) {
            atual = doGrupo;
        } else if (atual.length > doGrupo.length) {
            interacao.soEle = doGrupo; // clique sem arrastar dentro de uma seleção maior
        }
        if (atual !== selectedIds) setSelectedIds(atual);

        const iniciais = {};
        elements.forEach(item => {
            if (atual.includes(item.id) && !item.locked) iniciais[item.id] = { x: item.x, y: item.y, width: item.width, height: item.height };
        });
        const caixa = caixaDoGrupo(Object.values(iniciais));
        dragRef.current = { leaderId: el.id, startX: d.x, startY: d.y, iniciais, caixa, ...interacao };
    };

    const limitarDelta = (drag, dx, dy) => {
        if (!drag.caixa) return [dx, dy];
        const c = drag.caixa;
        return [
            Math.max(-c.x, Math.min(canvasWidth - c.x - c.width, dx)),
            Math.max(-c.y, Math.min(canvasHeight - c.y - c.height, dy))
        ];
    };

    const handleDrag = (_e, d, el) => {
        const drag = dragRef.current;
        if (!drag || drag.leaderId !== el.id) return;
        let dx = d.x - drag.startX;
        let dy = d.y - drag.startY;
        if (Math.abs(dx) + Math.abs(dy) > 1) drag.moveu = true;
        [dx, dy] = limitarDelta(drag, dx, dy);

        setElements(prev => prev.map(item => (drag.iniciais[item.id]
            ? { ...item, x: drag.iniciais[item.id].x + dx, y: drag.iniciais[item.id].y + dy }
            : item)));

        // Guias magnéticas: centro da prancheta, centros e bordas dos outros elementos
        const lider = drag.iniciais[el.id];
        if (!lider) return;
        const x = lider.x + dx;
        const y = lider.y + dy;
        const cx = x + el.width / 2;
        const cy = y + el.height / 2;
        const t = 6;
        let gv = null;
        let gh = null;
        if (Math.abs(cx - canvasWidth / 2) <= t) gv = canvasWidth / 2;
        if (Math.abs(cy - canvasHeight / 2) <= t) gh = canvasHeight / 2;
        elements.forEach(o => {
            if (drag.iniciais[o.id] || o.oculto) return;
            const ocx = o.x + o.width / 2;
            const ocy = o.y + o.height / 2;
            if (Math.abs(cx - ocx) <= t) gv = ocx;
            if (Math.abs(x - o.x) <= t) gv = o.x;
            if (Math.abs(x + el.width - (o.x + o.width)) <= t) gv = o.x + o.width;
            if (Math.abs(cy - ocy) <= t) gh = ocy;
            if (Math.abs(y - o.y) <= t) gh = o.y;
            if (Math.abs(y + el.height - (o.y + o.height)) <= t) gh = o.y + o.height;
        });
        setSmartGuides({ vertical: gv, horizontal: gh });
    };

    const handleDragStop = (_e, d, el) => {
        setSmartGuides({ vertical: null, horizontal: null });
        const drag = dragRef.current;
        dragRef.current = null;
        if (!drag) return;

        if (!drag.moveu) {
            if (drag.desmarcar) setSelectedIds(prev => prev.filter(id => !drag.desmarcar.includes(id)));
            else if (drag.soEle) setSelectedIds(drag.soEle);
            if (drag.iniciais[el.id]) {
                setElements(prev => prev.map(item => (drag.iniciais[item.id] ? { ...item, x: drag.iniciais[item.id].x, y: drag.iniciais[item.id].y } : item)));
            }
            return;
        }

        let lx = d.x;
        let ly = d.y;
        if (snapToGrid) {
            lx = Math.round(lx / gridSize) * gridSize;
            ly = Math.round(ly / gridSize) * gridSize;
        }
        const [dx, dy] = limitarDelta(drag, lx - drag.startX, ly - drag.startY);
        setElements(prev => prev.map(item => (drag.iniciais[item.id]
            ? { ...item, x: Math.round(drag.iniciais[item.id].x + dx), y: Math.round(drag.iniciais[item.id].y + dy) }
            : item)));
    };

    // ---------- Escala do grupo pelas alças ----------
    const handleGrupoResizeStart = () => {
        grupoResizeRef.current = { caixa: caixaSelecao, itens: Object.fromEntries(moveis.map(el => [el.id, { ...el }])) };
    };

    const aplicarEscalaGrupo = (ref, pos, final) => {
        const snap = grupoResizeRef.current;
        if (!snap?.caixa) return;
        const nova = { x: pos.x, y: pos.y, width: parseFloat(ref.style.width), height: parseFloat(ref.style.height) };
        setElements(prev => prev.map(el => {
            const orig = snap.itens[el.id];
            if (!orig) return el;
            const novo = { ...el, ...escalarItem(orig, snap.caixa, nova) };
            return final ? arredondarItem(novo) : novo;
        }));
        if (final) grupoResizeRef.current = null;
    };

    // ---------- Salvar / imprimir ----------
    const handleSave = async () => {
        if (!eventoId) {
            enqueueSnackbar('Selecione primeiro um evento ativo no menu superior.', { variant: 'warning' });
            return;
        }
        try {
            setSaving(true);
            await api.post('/config/etiquetas', { evento_id: eventoId, papel_config: config, elementos: elements });
            limparCacheEtiqueta(eventoId);
            enqueueSnackbar('Layout salvo com sucesso para o evento ativo!', { variant: 'success' });
        } catch (error) {
            enqueueSnackbar('Falha ao salvar layout: ' + (error.response?.data?.details || ''), { variant: 'error' });
        } finally {
            setSaving(false);
        }
    };

    const handleImprimirTeste = () => {
        imprimirHtml(montarHtmlEtiqueta({ papel_config: config, elementos: elements }, DADOS_EXEMPLO));
    };

    // ---------- Renderização do conteúdo de cada elemento ----------
    const renderConteudo = (el) => {
        switch (el.type) {
            case 'text':
                return (
                    <Typography sx={{
                        width: '100%', height: '100%', fontSize: el.fontSize || 14, fontWeight: el.fontWeight || 'normal',
                        color: el.color || '#000000', textAlign: el.textAlign || 'left', wordWrap: 'break-word',
                        lineHeight: 1.15, p: 0.2, fontFamily: 'Arial, Helvetica, sans-serif'
                    }}>
                        {el.content}
                    </Typography>
                );
            case 'qrcode':
                return (
                    <Box sx={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.9)', border: '1px solid #000' }}>
                        <QrIcon sx={{ fontSize: Math.min(el.width, el.height) * 0.7, color: '#000000' }} />
                    </Box>
                );
            case 'barcode':
                return (
                    <Box
                        sx={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        dangerouslySetInnerHTML={{ __html: gerarBarcodeSvg(el.content || '123456', el.exibirTexto !== false) }}
                    />
                );
            case 'foto':
                return (
                    <Box sx={{
                        width: '100%', height: '100%', backgroundImage: `url('${DADOS_EXEMPLO.foto_url}')`,
                        backgroundSize: 'cover', backgroundPosition: 'center',
                        border: `${el.borderWidth || 1}px solid ${el.borderColor || '#00D4FF'}`,
                        borderRadius: el.borderRadius ? `${el.borderRadius}px` : 0, boxSizing: 'border-box'
                    }} />
                );
            case 'shape':
                return <Box sx={{ width: '100%', height: '100%', backgroundColor: el.backgroundColor || '#00D4FF', borderRadius: el.borderRadius ? `${el.borderRadius}px` : 0 }} />;
            case 'circle':
                return <Box sx={{ width: '100%', height: '100%', backgroundColor: el.backgroundColor || '#00FF88', borderRadius: '50%', border: `${el.borderWidth || 0}px solid ${el.borderColor || '#000000'}`, boxSizing: 'border-box' }} />;
            case 'line':
                return <Box sx={{ width: '100%', height: '100%', borderTop: `${el.borderWidth || 2}px solid ${el.borderColor || el.color || '#000000'}` }} />;
            case 'image':
                return <Box component="img" src={el.content} alt="" draggable={false} sx={{ width: '100%', height: '100%', objectFit: el.objectFit || 'contain', display: 'block' }} />;
            default:
                return null;
        }
    };

    // ---------- Campos de posição/tamanho em milímetros ----------
    const CampoMm = ({ rotulo, campo, el }) => (
        <TextField
            label={rotulo}
            type="number"
            size="small"
            fullWidth
            inputProps={{ step: 0.5, min: 0 }}
            value={Math.round((el[campo] / ESCALA) * 10) / 10}
            onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (Number.isNaN(v)) return;
                const px = Math.round(v * ESCALA);
                const extra = {};
                if (el.lockAspectRatio && campo === 'width' && el.width) extra.height = Math.round(px * (el.height / el.width));
                if (el.lockAspectRatio && campo === 'height' && el.height) extra.width = Math.round(px * (el.width / el.height));
                updateElement(el.id, { [campo]: Math.max(campo === 'x' || campo === 'y' ? 0 : 2, px), ...extra });
            }}
        />
    );

    const Paleta = ({ onEscolher }) => (
        <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
            {CORES_PALETA.map(c => (
                <Box
                    key={c.hex}
                    title={c.label}
                    onClick={() => onEscolher(c.hex)}
                    sx={{ width: 22, height: 22, borderRadius: '50%', bgcolor: c.hex, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.3)', '&:hover': { transform: 'scale(1.15)' } }}
                />
            ))}
        </Stack>
    );

    const BlocoAlinhamentoPrancheta = () => (
        <Box>
            <Secao sx={{ mb: 1 }}>Alinhar na prancheta</Secao>
            <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                <BotaoFerramenta titulo="Encostar à esquerda" onClick={() => alinharNaPrancheta('esquerda')}><AlignLeftIcon fontSize="small" /></BotaoFerramenta>
                <BotaoFerramenta titulo="Centralizar na horizontal" onClick={() => alinharNaPrancheta('centro-x')}><AlignCenterHIcon fontSize="small" /></BotaoFerramenta>
                <BotaoFerramenta titulo="Encostar à direita" onClick={() => alinharNaPrancheta('direita')}><AlignRightIcon fontSize="small" /></BotaoFerramenta>
                <BotaoFerramenta titulo="Encostar no topo" onClick={() => alinharNaPrancheta('topo')}><AlignTopIcon fontSize="small" /></BotaoFerramenta>
                <BotaoFerramenta titulo="Centralizar na vertical" onClick={() => alinharNaPrancheta('centro-y')}><AlignCenterVIcon fontSize="small" /></BotaoFerramenta>
                <BotaoFerramenta titulo="Encostar na base" onClick={() => alinharNaPrancheta('base')}><AlignBottomIcon fontSize="small" /></BotaoFerramenta>
                <BotaoFerramenta titulo="Centro total" onClick={() => alinharNaPrancheta('centro-total')} ativo><CenterIcon fontSize="small" /></BotaoFerramenta>
            </Stack>
        </Box>
    );

    const BlocoCamada = () => (
        <Box>
            <Secao sx={{ mb: 1 }}>Ordem da camada</Secao>
            <Grid container spacing={1}>
                {[
                    ['frente', 'Trazer para frente', FrenteIcon],
                    ['avancar', 'Avançar uma', AvancarIcon],
                    ['recuar', 'Recuar uma', RecuarIcon],
                    ['tras', 'Enviar para trás', TrasIcon]
                ].map(([acao, rotulo, Icone]) => (
                    <Grid item xs={6} key={acao}>
                        <Button
                            fullWidth size="small" variant="outlined" startIcon={<Icone fontSize="small" />}
                            onClick={() => reordenar(acao)}
                            sx={{ ...botaoSecundario, minHeight: 34, fontSize: '0.75rem', textTransform: 'none', justifyContent: 'flex-start' }}
                        >
                            {rotulo}
                        </Button>
                    </Grid>
                ))}
            </Grid>
        </Box>
    );

    const SwitchLinha = ({ checked, onChange, rotulo, ajuda, cor }) => (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
            <Box>
                <Typography sx={{ fontSize: '0.8125rem', color: cor || cores.texto, fontWeight: 600, lineHeight: 1.3 }}>{rotulo}</Typography>
                {ajuda && <Typography sx={{ fontSize: '0.75rem', color: cores.textoSecundario, lineHeight: 1.3 }}>{ajuda}</Typography>}
            </Box>
            <Switch size="small" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        </Box>
    );

    // ---------- Painel direito: propriedades ----------
    const renderPropriedades = () => {
        if (selecionados.length > 1) {
            return (
                <Stack spacing={2.25}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Chip size="small" label={`${selecionados.length} itens selecionados`} sx={{ bgcolor: 'rgba(0, 255, 136, 0.15)', color: cores.sucesso, fontWeight: 700, fontSize: '0.75rem' }} />
                        <Button size="small" onClick={() => setSelectedIds([])} sx={{ fontSize: '0.75rem', color: cores.textoSecundario, textTransform: 'none' }}>Desmarcar</Button>
                    </Box>

                    <Stack direction="row" spacing={1}>
                        {temGrupoNaSelecao ? (
                            <Button fullWidth size="small" variant="outlined" startIcon={<DesagruparIcon />} onClick={desagrupar} sx={{ ...botaoSecundario, minHeight: 36, fontSize: '0.75rem', textTransform: 'none' }}>
                                Desagrupar
                            </Button>
                        ) : (
                            <Button fullWidth size="small" variant="outlined" startIcon={<AgruparIcon />} onClick={agrupar} sx={{ ...botaoSecundario, minHeight: 36, fontSize: '0.75rem', textTransform: 'none', color: cores.sucesso, borderColor: 'rgba(0,255,136,0.4)' }}>
                                Agrupar
                            </Button>
                        )}
                        <Button fullWidth size="small" variant="outlined" startIcon={<DuplicateIcon />} onClick={duplicarSelecionados} sx={{ ...botaoSecundario, minHeight: 36, fontSize: '0.75rem', textTransform: 'none' }}>
                            Duplicar
                        </Button>
                    </Stack>

                    <Box>
                        <Secao sx={{ mb: 1 }}>Escala do conjunto</Secao>
                        <SwitchLinha
                            checked={escalaProporcional}
                            onChange={setEscalaProporcional}
                            rotulo={escalaProporcional ? 'Proporcional' : 'Livre (esticar)'}
                            ajuda="Puxe as alças verdes ao redor da seleção"
                        />
                        <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                            <Button fullWidth size="small" variant="outlined" startIcon={<DiminuirIcon fontSize="small" />} onClick={() => escalarSelecao(0.9)} sx={{ ...botaoSecundario, minHeight: 34, fontSize: '0.75rem' }}>−10%</Button>
                            <Button fullWidth size="small" variant="outlined" startIcon={<AumentarIcon fontSize="small" />} onClick={() => escalarSelecao(1.1)} sx={{ ...botaoSecundario, minHeight: 34, fontSize: '0.75rem' }}>+10%</Button>
                        </Stack>
                    </Box>

                    <Box>
                        <Secao sx={{ mb: 1 }}>Alinhar entre si</Secao>
                        <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                            <BotaoFerramenta titulo="Alinhar pelas esquerdas" onClick={() => alinharEntre('esquerda')}><AlignLeftIcon fontSize="small" /></BotaoFerramenta>
                            <BotaoFerramenta titulo="Alinhar pelos centros (horizontal)" onClick={() => alinharEntre('centro-h')}><AlignCenterHIcon fontSize="small" /></BotaoFerramenta>
                            <BotaoFerramenta titulo="Alinhar pelas direitas" onClick={() => alinharEntre('direita')}><AlignRightIcon fontSize="small" /></BotaoFerramenta>
                            <BotaoFerramenta titulo="Alinhar pelos topos" onClick={() => alinharEntre('topo')}><AlignVTopIcon fontSize="small" /></BotaoFerramenta>
                            <BotaoFerramenta titulo="Alinhar pelos meios (vertical)" onClick={() => alinharEntre('meio')}><AlignCenterVIcon fontSize="small" /></BotaoFerramenta>
                            <BotaoFerramenta titulo="Alinhar pelas bases" onClick={() => alinharEntre('base')}><AlignVBottomIcon fontSize="small" /></BotaoFerramenta>
                            <BotaoFerramenta titulo="Distribuir na horizontal (3+ itens)" onClick={() => alinharEntre('distribuir-h')} disabled={moveis.length < 3}><DistribuirHIcon fontSize="small" /></BotaoFerramenta>
                            <BotaoFerramenta titulo="Distribuir na vertical (3+ itens)" onClick={() => alinharEntre('distribuir-v')} disabled={moveis.length < 3}><DistribuirVIcon fontSize="small" /></BotaoFerramenta>
                        </Stack>
                    </Box>

                    <BlocoAlinhamentoPrancheta />
                    <BlocoCamada />

                    <Button fullWidth variant="outlined" startIcon={<DeleteIcon />} onClick={excluirSelecionados} sx={{ minHeight: 38, fontSize: '0.8125rem', textTransform: 'none', color: cores.erro, borderColor: 'rgba(255, 51, 102, 0.35)' }}>
                        Excluir selecionados
                    </Button>
                </Stack>
            );
        }

        if (selectedElement) {
            const el = selectedElement;
            return (
                <Stack spacing={2.25}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Chip size="small" label={TIPO_ROTULO[el.type] || el.type} sx={{ bgcolor: 'rgba(0, 212, 255, 0.15)', color: cores.primaria, fontWeight: 700, fontSize: '0.75rem' }} />
                        {el.groupId && <Chip size="small" icon={<AgruparIcon sx={{ fontSize: 14 }} />} label="Em grupo" sx={{ bgcolor: 'rgba(0,255,136,0.12)', color: cores.sucesso, fontSize: '0.75rem' }} />}
                        <Box sx={{ flex: 1 }} />
                        <BotaoFerramenta titulo="Duplicar (Ctrl+D)" onClick={duplicarSelecionados}><DuplicateIcon fontSize="small" /></BotaoFerramenta>
                        <BotaoFerramenta titulo="Excluir (Delete)" onClick={excluirSelecionados} cor={cores.erro}><DeleteIcon fontSize="small" /></BotaoFerramenta>
                    </Box>

                    <TextField
                        label="Nome da camada"
                        size="small"
                        fullWidth
                        value={el.nome || ''}
                        placeholder={nomeDoElemento({ ...el, nome: '' })}
                        onChange={e => updateElement(el.id, { nome: e.target.value })}
                    />

                    <Box>
                        <Secao sx={{ mb: 1 }}>Posição e tamanho (mm)</Secao>
                        <Grid container spacing={1}>
                            <Grid item xs={6}><CampoMm rotulo="X" campo="x" el={el} /></Grid>
                            <Grid item xs={6}><CampoMm rotulo="Y" campo="y" el={el} /></Grid>
                            <Grid item xs={6}><CampoMm rotulo="Largura" campo="width" el={el} /></Grid>
                            <Grid item xs={6}><CampoMm rotulo="Altura" campo="height" el={el} /></Grid>
                        </Grid>
                    </Box>

                    <Stack spacing={1.25} sx={{ p: 1.25, borderRadius: '8px', bgcolor: 'rgba(0,0,0,0.25)', border: `1px solid ${cores.borda}` }}>
                        <SwitchLinha
                            checked={Boolean(el.lockAspectRatio)}
                            onChange={v => updateElement(el.id, { lockAspectRatio: v })}
                            rotulo="Manter proporção"
                            ajuda={el.lockAspectRatio ? 'Cantos mantêm o formato real' : 'Esticar livre para cima ou para o lado'}
                        />
                        <SwitchLinha
                            checked={Boolean(el.locked)}
                            onChange={v => updateElement(el.id, { locked: v })}
                            rotulo="Travar posição"
                            ajuda="Não move nem redimensiona por engano"
                        />
                        <SwitchLinha
                            checked={Boolean(el.apenasReferencia)}
                            onChange={v => updateElement(el.id, { apenasReferencia: v, ...(v && (el.opacity == null || el.opacity === 1) ? { opacity: 0.5 } : {}), ...(!v ? { opacity: 1 } : {}) })}
                            rotulo="Só referência (não imprime)"
                            ajuda="Aparece na tela como guia, fica fora da impressão"
                            cor={el.apenasReferencia ? '#FF5FA2' : undefined}
                        />
                    </Stack>

                    <Box sx={{ px: 0.5 }}>
                        <Stack direction="row" justifyContent="space-between">
                            <Typography sx={{ fontSize: '0.75rem', color: cores.textoSecundario }}>Opacidade</Typography>
                            <Typography sx={{ fontSize: '0.75rem', color: cores.primaria, fontWeight: 700 }}>{Math.round((el.opacity ?? 1) * 100)}%</Typography>
                        </Stack>
                        <Slider size="small" value={el.opacity ?? 1} min={0.1} max={1} step={0.05} onChange={(_, v) => updateElement(el.id, { opacity: v })} />
                    </Box>

                    {el.type === 'text' && (
                        <Stack spacing={1.5}>
                            <Secao>Texto</Secao>
                            <TextField label="Conteúdo / tag do participante" fullWidth size="small" value={el.content} onChange={e => updateElement(el.id, { content: e.target.value })} />
                            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                                {['{nome_pessoa}', '{funcao}', '{empresa}', '{cpf}', '{pulseira}', '{evento}', '{data}'].map(tag => (
                                    <Chip key={tag} label={tag} size="small" onClick={() => updateElement(el.id, { content: tag })} sx={{ fontSize: '0.75rem', bgcolor: 'rgba(255,255,255,0.06)', cursor: 'pointer' }} />
                                ))}
                            </Stack>
                            <Grid container spacing={1}>
                                <Grid item xs={6}>
                                    <TextField label="Tamanho" type="number" fullWidth size="small" value={el.fontSize || 14} onChange={e => updateElement(el.id, { fontSize: Number(e.target.value) })} />
                                </Grid>
                                <Grid item xs={6}>
                                    <FormControl fullWidth size="small">
                                        <InputLabel id="weight-label">Peso</InputLabel>
                                        <Select labelId="weight-label" label="Peso" value={el.fontWeight || 'normal'} onChange={e => updateElement(el.id, { fontWeight: e.target.value })}>
                                            <MenuItem value="normal">Normal</MenuItem>
                                            <MenuItem value="bold">Negrito</MenuItem>
                                        </Select>
                                    </FormControl>
                                </Grid>
                                <Grid item xs={6}>
                                    <FormControl fullWidth size="small">
                                        <InputLabel id="align-label">Alinhar</InputLabel>
                                        <Select labelId="align-label" label="Alinhar" value={el.textAlign || 'left'} onChange={e => updateElement(el.id, { textAlign: e.target.value })}>
                                            <MenuItem value="left">Esquerda</MenuItem>
                                            <MenuItem value="center">Centro</MenuItem>
                                            <MenuItem value="right">Direita</MenuItem>
                                        </Select>
                                    </FormControl>
                                </Grid>
                                <Grid item xs={6}>
                                    <TextField label="Cor" type="color" fullWidth size="small" value={el.color || '#000000'} onChange={e => updateElement(el.id, { color: e.target.value })} />
                                </Grid>
                            </Grid>
                            <Paleta onEscolher={hex => updateElement(el.id, { color: hex })} />
                        </Stack>
                    )}

                    {el.type === 'qrcode' && (
                        <TextField label="Conteúdo do QR Code" fullWidth size="small" value={el.content} onChange={e => updateElement(el.id, { content: e.target.value })} helperText="Tags: {qr_code}, {cpf} ou texto fixo" />
                    )}

                    {el.type === 'barcode' && (
                        <Stack spacing={1}>
                            <TextField label="Conteúdo do código de barras" fullWidth size="small" value={el.content} onChange={e => updateElement(el.id, { content: e.target.value })} helperText="Tags: {pulseira}, {cpf} ou número" />
                            <SwitchLinha checked={el.exibirTexto !== false} onChange={v => updateElement(el.id, { exibirTexto: v })} rotulo="Número legível abaixo das barras" />
                        </Stack>
                    )}

                    {el.type === 'foto' && (
                        <Grid container spacing={1}>
                            <Grid item xs={4}>
                                <TextField label="Cantos" type="number" fullWidth size="small" value={el.borderRadius || 0} onChange={e => updateElement(el.id, { borderRadius: Number(e.target.value) })} />
                            </Grid>
                            <Grid item xs={4}>
                                <TextField label="Borda" type="number" fullWidth size="small" value={el.borderWidth ?? 1} onChange={e => updateElement(el.id, { borderWidth: Number(e.target.value) })} />
                            </Grid>
                            <Grid item xs={4}>
                                <TextField label="Cor" type="color" fullWidth size="small" value={el.borderColor || '#00D4FF'} onChange={e => updateElement(el.id, { borderColor: e.target.value })} />
                            </Grid>
                        </Grid>
                    )}

                    {el.type === 'image' && (
                        <Stack spacing={1.25}>
                            <Secao>{el.papel === 'arte' ? 'Arte do evento' : 'Imagem'}</Secao>
                            <FormControl fullWidth size="small">
                                <InputLabel id="fit-label">Encaixe da imagem</InputLabel>
                                <Select labelId="fit-label" label="Encaixe da imagem" value={el.objectFit || 'contain'} onChange={e => updateElement(el.id, { objectFit: e.target.value })}>
                                    <MenuItem value="contain">Conter (imagem inteira)</MenuItem>
                                    <MenuItem value="cover">Cobrir (recorta sobras)</MenuItem>
                                    <MenuItem value="fill">Esticar (preenche a caixa)</MenuItem>
                                </Select>
                            </FormControl>
                            <Button size="small" variant="outlined" startIcon={<PreencherIcon fontSize="small" />} onClick={() => ocuparPranchetaInteira(el.id)} sx={{ ...botaoSecundario, minHeight: 34, fontSize: '0.75rem', textTransform: 'none' }}>
                                Ocupar o crachá inteiro
                            </Button>
                            <TextField label="Cantos arredondados (px)" type="number" fullWidth size="small" value={el.borderRadius || 0} onChange={e => updateElement(el.id, { borderRadius: Number(e.target.value) })} />
                        </Stack>
                    )}

                    {(el.type === 'shape' || el.type === 'circle') && (
                        <Stack spacing={1.25}>
                            <Secao>Preenchimento</Secao>
                            <TextField label="Cor" type="color" fullWidth size="small" value={el.backgroundColor || '#00D4FF'} onChange={e => updateElement(el.id, { backgroundColor: e.target.value })} />
                            <Paleta onEscolher={hex => updateElement(el.id, { backgroundColor: hex })} />
                            {el.type === 'shape' && (
                                <TextField label="Cantos arredondados (px)" type="number" fullWidth size="small" value={el.borderRadius || 0} onChange={e => updateElement(el.id, { borderRadius: Number(e.target.value) })} />
                            )}
                        </Stack>
                    )}

                    {el.type === 'line' && (
                        <Stack spacing={1.25}>
                            <Secao>Traço</Secao>
                            <TextField label="Cor" type="color" fullWidth size="small" value={el.borderColor || el.color || '#000000'} onChange={e => updateElement(el.id, { borderColor: e.target.value, color: e.target.value })} />
                            <Paleta onEscolher={hex => updateElement(el.id, { borderColor: hex, color: hex })} />
                            <TextField label="Espessura (px)" type="number" fullWidth size="small" value={el.borderWidth || 2} onChange={e => updateElement(el.id, { borderWidth: Number(e.target.value) })} />
                        </Stack>
                    )}

                    <BlocoAlinhamentoPrancheta />
                    <BlocoCamada />
                </Stack>
            );
        }

        return (
            <Stack spacing={2}>
                <Box sx={{ textAlign: 'center', py: 2 }}>
                    <TuneIcon sx={{ fontSize: 36, color: 'rgba(255,255,255,0.2)', mb: 1 }} />
                    <Typography sx={{ fontSize: '0.875rem', color: cores.textoSecundario }}>
                        Clique em um elemento, ou arraste o mouse no vazio para selecionar vários.
                    </Typography>
                </Box>
                <Box sx={{ p: 1.5, borderRadius: '8px', bgcolor: 'rgba(0, 212, 255, 0.05)', border: '1px dashed rgba(0, 212, 255, 0.25)' }}>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                        <KeyboardIcon sx={{ fontSize: 18, color: cores.primaria }} />
                        <Secao>Atalhos</Secao>
                    </Stack>
                    {[
                        ['Arrastar no vazio', 'selecionar por área'],
                        ['Shift / Ctrl + clique', 'somar à seleção'],
                        ['Setas (Shift)', 'mover 1 px (10 px)'],
                        ['Delete', 'excluir selecionados'],
                        ['Ctrl + A', 'selecionar tudo'],
                        ['Ctrl + D', 'duplicar'],
                        ['Ctrl + G / Ctrl + Shift + G', 'agrupar / desagrupar'],
                        ['Ctrl + ] / Ctrl + [', 'avançar / recuar camada'],
                        ['Duplo clique', 'editar item dentro do grupo'],
                        ['Ctrl + roda do mouse', 'zoom']
                    ].map(([tecla, acao]) => (
                        <Box key={tecla} sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, py: 0.35 }}>
                            <Typography sx={{ fontSize: '0.75rem', color: cores.texto, fontWeight: 600 }}>{tecla}</Typography>
                            <Typography sx={{ fontSize: '0.75rem', color: cores.textoSecundario, textAlign: 'right' }}>{acao}</Typography>
                        </Box>
                    ))}
                </Box>
            </Stack>
        );
    };

    // ---------- Grade ----------
    const corGrade = (alfa) => {
        const n = parseInt(gridColor.replace('#', ''), 16);
        return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${Math.min(1, alfa)})`;
    };
    const passoMaior = gridSize * 5;

    const alturaPainel = { lg: 'calc(100vh - 230px)' };
    const isMulti = selecionados.length > 1;

    return (
        <Box sx={{ p: { xs: 1.5, sm: 2.5, md: 4 } }}>
            <PageHeader
                title="Etiquetas e crachás"
                subtitle="Design e impressão de credenciais, crachás PVC e etiquetas térmicas."
                breadcrumbs={[{ text: 'Configurações' }, { text: 'Credenciais físicas' }, { text: 'Etiquetas e crachás' }]}
                action={
                    <Stack direction="row" spacing={1.5}>
                        <NeonButton startIcon={<PrintIcon />} variant="outlined" onClick={handleImprimirTeste}>
                            Imprimir teste
                        </NeonButton>
                        <NeonButton startIcon={<SaveIcon />} onClick={handleSave} loading={saving} neonColor="#00FF88">
                            Salvar layout
                        </NeonButton>
                    </Stack>
                }
            />

            <input type="file" ref={fileArteInputRef} style={{ display: 'none' }} accept="image/png, image/jpeg, image/jpg, image/webp" onChange={handleUploadArte} />
            <input type="file" ref={fileElementInputRef} style={{ display: 'none' }} accept="image/png, image/jpeg, image/jpg, image/svg+xml, image/webp" onChange={handleUploadElementImage} />

            <Box sx={{
                display: 'grid',
                gap: 2.5,
                gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: '290px minmax(0, 1fr) 310px' },
                alignItems: 'stretch'
            }}>
                {/* ===== COLUNA ESQUERDA: FORMATO, ELEMENTOS E CAMADAS ===== */}
                <GlassCard sx={{ display: 'flex', flexDirection: 'column', height: alturaPainel, minHeight: { lg: 560 } }}>
                    <Tabs
                        value={sidebarTab}
                        onChange={(_, val) => setSidebarTab(val)}
                        variant="fullWidth"
                        sx={{
                            px: 1,
                            borderBottom: `1px solid ${cores.borda}`,
                            minHeight: 48,
                            '& .MuiTab-root': { minHeight: 48, fontSize: '0.8125rem', fontWeight: 600, textTransform: 'none', color: cores.textoSecundario, px: 0.5 },
                            '& .Mui-selected': { color: `${cores.primaria} !important` },
                            '& .MuiTabs-indicator': { backgroundColor: cores.primaria, height: 3 }
                        }}
                    >
                        <Tab icon={<StyleIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Formato" />
                        <Tab icon={<AddElementIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Elementos" />
                        <Tab icon={<LayersIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Camadas" />
                    </Tabs>

                    <Box sx={{ p: 2, overflowY: 'auto', flex: 1 }}>
                        {sidebarTab === 0 && (
                            <Stack spacing={2.5}>
                                <Stack spacing={1.5}>
                                    <Secao>Papel / crachá</Secao>
                                    <FormControl fullWidth size="small">
                                        <InputLabel id="preset-label">Padrão / impressora</InputLabel>
                                        <Select labelId="preset-label" label="Padrão / impressora" value={config.layout || 'zebra_tlp2844'} onChange={(e) => handleChangePreset(e.target.value)}>
                                            {PRESETS.map(p => <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>)}
                                        </Select>
                                    </FormControl>
                                    <Grid container spacing={1.5}>
                                        <Grid item xs={6}>
                                            <TextField label="Largura (mm)" type="number" fullWidth size="small" value={config.width} onChange={(e) => handleChangeConfig('width', Number(e.target.value))} />
                                        </Grid>
                                        <Grid item xs={6}>
                                            <TextField label="Altura (mm)" type="number" fullWidth size="small" value={config.height} onChange={(e) => handleChangeConfig('height', Number(e.target.value))} />
                                        </Grid>
                                    </Grid>
                                </Stack>

                                <Divider sx={{ borderColor: cores.borda }} />

                                <Stack spacing={1.5}>
                                    <Secao>Arte do evento</Secao>
                                    <Typography sx={{ fontSize: '0.8125rem', color: cores.textoSecundario, lineHeight: 1.45 }}>
                                        A arte entra como uma <strong>camada</strong>: ocupa o crachá inteiro, fica travada no fundo e pode ir para frente/trás, ser ocultada ou virar só referência (não imprime).
                                    </Typography>
                                    <Button
                                        variant="outlined"
                                        startIcon={<UploadIcon />}
                                        onClick={() => fileArteInputRef.current?.click()}
                                        sx={{ ...botaoSecundario, color: cores.primaria, borderColor: 'rgba(0, 212, 255, 0.45)', textTransform: 'none', borderRadius: '8px' }}
                                    >
                                        Subir arte (PNG/JPG)
                                    </Button>

                                    {camadasDeArte.map(arte => (
                                        <Box key={arte.id} sx={{ p: 1.25, borderRadius: '8px', border: `1px solid ${selectedIds.includes(arte.id) ? 'rgba(0,212,255,0.5)' : cores.borda}`, bgcolor: 'rgba(0,0,0,0.25)' }}>
                                            <Stack direction="row" spacing={1.25} alignItems="center">
                                                <Box component="img" src={arte.content} alt="" sx={{ width: 40, height: 52, objectFit: 'cover', borderRadius: '4px', border: `1px solid ${cores.borda}`, opacity: arte.oculto ? 0.3 : 1 }} />
                                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                                    <Typography noWrap sx={{ fontSize: '0.8125rem', fontWeight: 600, color: cores.texto }}>{nomeDoElemento(arte)}</Typography>
                                                    <Typography sx={{ fontSize: '0.75rem', color: arte.apenasReferencia ? '#FF5FA2' : cores.sucesso }}>
                                                        {arte.apenasReferencia ? 'Só referência — não imprime' : 'Imprime com o crachá'}
                                                    </Typography>
                                                </Box>
                                                <Button size="small" onClick={() => setSelectedIds([arte.id])} sx={{ fontSize: '0.75rem', textTransform: 'none', minWidth: 0 }}>Editar</Button>
                                            </Stack>
                                        </Box>
                                    ))}

                                    {config.background_url && (
                                        <Stack spacing={1.25} sx={{ p: 1.5, borderRadius: '8px', bgcolor: 'rgba(255, 184, 0, 0.06)', border: '1px solid rgba(255, 184, 0, 0.3)' }}>
                                            <Typography sx={{ fontSize: '0.8125rem', color: cores.alerta, fontWeight: 700 }}>Fundo fixo (modo antigo)</Typography>
                                            <Typography sx={{ fontSize: '0.75rem', color: cores.textoSuave, lineHeight: 1.4 }}>
                                                Este layout usa a arte como fundo fixo, sem controle de camada. Converta para poder ordenar, travar e ocultar.
                                            </Typography>
                                            <Button size="small" variant="outlined" startIcon={<ArteIcon />} onClick={converterFundoEmCamada} sx={{ ...botaoSecundario, minHeight: 34, fontSize: '0.75rem', textTransform: 'none', color: cores.alerta, borderColor: 'rgba(255,184,0,0.45)' }}>
                                                Converter em camada
                                            </Button>
                                            <FormControlLabel
                                                control={
                                                    <Switch size="small" checked={Boolean(config.fundo_como_referencia)} onChange={(e) => {
                                                        const ativo = e.target.checked;
                                                        handleChangeConfig('fundo_como_referencia', ativo);
                                                        handleChangeConfig('imprimir_fundo', !ativo);
                                                    }} />
                                                }
                                                label={<Typography sx={{ fontSize: '0.8125rem', color: cores.texto }}>Modo gabarito (não imprimir)</Typography>}
                                            />
                                            <Box sx={{ px: 0.5 }}>
                                                <Typography sx={{ fontSize: '0.75rem', color: cores.textoSecundario }}>
                                                    Opacidade do gabarito: {Math.round((config.opacidade_referencia || 0.5) * 100)}%
                                                </Typography>
                                                <Slider size="small" value={config.opacidade_referencia ?? 0.5} min={0.1} max={1} step={0.05} onChange={(_, v) => handleChangeConfig('opacidade_referencia', v)} />
                                            </Box>
                                            <Button size="small" color="error" onClick={() => handleChangeConfig('background_url', '')} sx={{ fontSize: '0.75rem', textTransform: 'none', alignSelf: 'flex-start' }}>
                                                Remover fundo
                                            </Button>
                                        </Stack>
                                    )}

                                    <Alert severity="info" sx={{ bgcolor: 'rgba(0, 212, 255, 0.06)', color: cores.textoSuave, fontSize: '0.75rem', '& .MuiAlert-icon': { color: cores.primaria } }}>
                                        Crachá pré-impresso? Ative <strong>Só referência</strong> na arte: ela guia o alinhamento na tela e fica fora da impressão.
                                    </Alert>
                                </Stack>
                            </Stack>
                        )}

                        {sidebarTab === 1 && (
                            <Stack spacing={2}>
                                <Secao>Dados do participante</Secao>
                                <Grid container spacing={1}>
                                    <Grid item xs={6}><BotaoAdicionar icone={TextIcon} rotulo="Texto / dado" onClick={() => addElement('text')} /></Grid>
                                    <Grid item xs={6}><BotaoAdicionar icone={FotoIcon} rotulo="Foto da pessoa" onClick={() => addElement('foto')} /></Grid>
                                    <Grid item xs={6}><BotaoAdicionar icone={QrIcon} rotulo="QR Code" onClick={() => addElement('qrcode')} /></Grid>
                                    <Grid item xs={6}><BotaoAdicionar icone={BarcodeIcon} rotulo="Código de barras" onClick={() => addElement('barcode')} /></Grid>
                                </Grid>
                                <Secao>Gráficos e imagens</Secao>
                                <Grid container spacing={1}>
                                    <Grid item xs={6}><BotaoAdicionar icone={ImageIcon} rotulo="Logo / imagem" onClick={() => addElement('image')} /></Grid>
                                    <Grid item xs={6}><BotaoAdicionar icone={ArteIcon} rotulo="Arte do evento" onClick={() => fileArteInputRef.current?.click()} /></Grid>
                                    <Grid item xs={6}><BotaoAdicionar icone={ShapeIcon} rotulo="Retângulo / tarja" onClick={() => addElement('shape')} /></Grid>
                                    <Grid item xs={6}><BotaoAdicionar icone={CircleIcon} rotulo="Círculo / selo" onClick={() => addElement('circle')} /></Grid>
                                    <Grid item xs={6}><BotaoAdicionar icone={LineIcon} rotulo="Linha divisória" onClick={() => addElement('line')} /></Grid>
                                </Grid>
                            </Stack>
                        )}

                        {sidebarTab === 2 && (
                            <Stack spacing={0.75}>
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                                    <Secao>Camadas ({elements.length}) — frente no topo</Secao>
                                    <Stack direction="row">
                                        <Button size="small" onClick={selecionarTodos} sx={{ fontSize: '0.75rem', px: 1, minWidth: 0, color: cores.sucesso, textTransform: 'none' }}>Todas</Button>
                                        {selectedIds.length > 0 && (
                                            <Button size="small" onClick={() => setSelectedIds([])} sx={{ fontSize: '0.75rem', px: 1, minWidth: 0, color: cores.textoSecundario, textTransform: 'none' }}>Limpar</Button>
                                        )}
                                    </Stack>
                                </Box>

                                {elementosOrdenados.map((el, idx) => {
                                    const Icone = TIPO_ICONE[el.type] || ImageIcon;
                                    const sel = selectedIds.includes(el.id);
                                    const anterior = elementosOrdenados[idx - 1];
                                    const mesmoGrupoAcima = el.groupId && anterior?.groupId === el.groupId;
                                    return (
                                        <Box
                                            key={el.id}
                                            onClick={(e) => {
                                                if (e.shiftKey || e.ctrlKey || e.metaKey) {
                                                    setSelectedIds(prev => (prev.includes(el.id) ? prev.filter(i => i !== el.id) : [...prev, el.id]));
                                                } else {
                                                    setSelectedIds([el.id]);
                                                }
                                            }}
                                            sx={{
                                                pl: el.groupId ? 1.25 : 1,
                                                pr: 0.5,
                                                py: 0.5,
                                                mt: mesmoGrupoAcima ? '-2px !important' : undefined,
                                                borderRadius: '8px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 1,
                                                cursor: 'pointer',
                                                bgcolor: sel ? (isMulti ? 'rgba(0, 255, 136, 0.12)' : 'rgba(0, 212, 255, 0.12)') : 'rgba(0,0,0,0.2)',
                                                border: `1px solid ${sel ? (isMulti ? 'rgba(0,255,136,0.6)' : 'rgba(0,212,255,0.6)') : cores.borda}`,
                                                borderLeft: el.groupId ? `3px solid ${cores.sucesso}` : undefined,
                                                opacity: el.oculto ? 0.5 : 1,
                                                '&:hover': { bgcolor: 'rgba(0, 212, 255, 0.08)' }
                                            }}
                                        >
                                            <Icone sx={{ fontSize: 18, color: el.apenasReferencia ? '#FF5FA2' : cores.primaria, flexShrink: 0 }} />
                                            <Typography noWrap sx={{ flex: 1, minWidth: 0, fontSize: '0.8125rem', color: cores.texto, fontWeight: sel ? 700 : 400 }}>
                                                {nomeDoElemento(el)}
                                            </Typography>
                                            {[
                                                ['Avançar', AvancarIcon, () => reordenar('avancar', [el.id])],
                                                ['Recuar', RecuarIcon, () => reordenar('recuar', [el.id])],
                                                [el.oculto ? 'Mostrar' : 'Ocultar', el.oculto ? VisibilityOffIcon : VisibilityIcon, () => updateElement(el.id, { oculto: !el.oculto })],
                                                [el.locked ? 'Destravar' : 'Travar', el.locked ? LockIcon : LockOpenIcon, () => updateElement(el.id, { locked: !el.locked })]
                                            ].map(([titulo, Ic, acao]) => (
                                                <Tooltip key={titulo} title={titulo}>
                                                    <IconButton
                                                        size="small"
                                                        onClick={(e) => { e.stopPropagation(); acao(); }}
                                                        sx={{ p: 0.4, color: (titulo === 'Destravar' ? cores.alerta : null) || (titulo === 'Mostrar' ? cores.erro : cores.textoSecundario) }}
                                                    >
                                                        <Ic sx={{ fontSize: 16 }} />
                                                    </IconButton>
                                                </Tooltip>
                                            ))}
                                            <Tooltip title="Excluir">
                                                <IconButton size="small" onClick={(e) => { e.stopPropagation(); excluirElemento(el.id); }} sx={{ p: 0.4, color: cores.erro }}>
                                                    <DeleteIcon sx={{ fontSize: 16 }} />
                                                </IconButton>
                                            </Tooltip>
                                        </Box>
                                    );
                                })}
                            </Stack>
                        )}
                    </Box>
                </GlassCard>

                {/* ===== CENTRO: BARRA DE FERRAMENTAS + PRANCHETA ===== */}
                <GlassCard sx={{ display: 'flex', flexDirection: 'column', height: alturaPainel, minHeight: { xs: 620, lg: 560 } }}>
                    {/* Linha 1: visualização */}
                    <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1, px: 2, py: 1.25, borderBottom: `1px solid ${cores.borda}` }}>
                        <Typography sx={{ fontSize: '0.875rem', fontWeight: 700, color: cores.textoForte, fontFamily: '"Space Grotesk", sans-serif', mr: 1 }}>
                            {config.width} × {config.height} mm
                        </Typography>
                        {config.background_url && config.fundo_como_referencia && (
                            <Chip size="small" label="Modo gabarito" sx={{ bgcolor: 'rgba(0, 255, 136, 0.15)', color: cores.sucesso, fontWeight: 700, fontSize: '0.75rem' }} />
                        )}
                        <Box sx={{ flex: 1 }} />

                        {config.background_url && (
                            <BotaoFerramenta titulo={ocultarGabarito ? 'Mostrar fundo' : 'Ocultar fundo'} onClick={() => setOcultarGabarito(v => !v)} ativo={!ocultarGabarito}>
                                {ocultarGabarito ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                            </BotaoFerramenta>
                        )}
                        <BotaoFerramenta titulo={showGrid ? 'Esconder grade' : 'Mostrar grade'} onClick={() => setShowGrid(v => !v)} ativo={showGrid}>
                            {showGrid ? <GridOnIcon fontSize="small" /> : <GridOffIcon fontSize="small" />}
                        </BotaoFerramenta>
                        <BotaoFerramenta titulo={snapToGrid ? 'Ímã da grade ligado (encaixa ao soltar)' : 'Ímã da grade desligado'} onClick={() => setSnapToGrid(v => !v)} ativo={snapToGrid} cor={cores.sucesso}>
                            <ImaIcon fontSize="small" />
                        </BotaoFerramenta>
                        {showGrid && (
                            <>
                                <Select
                                    size="small"
                                    value={gridSize}
                                    onChange={(e) => setGridSize(Number(e.target.value))}
                                    sx={{ height: 34, fontSize: '0.8125rem', minWidth: 76 }}
                                >
                                    {[5, 10, 15, 20, 30].map(v => <MenuItem key={v} value={v}>{v} px</MenuItem>)}
                                </Select>
                                <Stack direction="row" spacing={0.5} alignItems="center">
                                    {CORES_GRADE.map(c => (
                                        <Tooltip key={c.hex} title={`Grade ${c.label}`}>
                                            <Box
                                                onClick={() => setGridColor(c.hex)}
                                                sx={{
                                                    width: 18, height: 18, borderRadius: '50%', bgcolor: c.hex, cursor: 'pointer',
                                                    border: gridColor === c.hex ? `2px solid ${cores.primaria}` : '1px solid rgba(255,255,255,0.35)',
                                                    boxShadow: gridColor === c.hex ? `0 0 6px ${cores.primaria}` : 'none'
                                                }}
                                            />
                                        </Tooltip>
                                    ))}
                                </Stack>
                                <Tooltip title="Intensidade da grade">
                                    <Slider size="small" value={gridIntensity} min={0.2} max={1} step={0.05} onChange={(_, v) => setGridIntensity(v)} sx={{ width: 80, mx: 1 }} />
                                </Tooltip>
                            </>
                        )}
                        <Divider orientation="vertical" flexItem sx={{ borderColor: cores.borda, mx: 0.5 }} />
                        <BotaoFerramenta titulo="Diminuir zoom" onClick={() => mudarZoom(-0.1)}><ZoomOutIcon fontSize="small" /></BotaoFerramenta>
                        <Typography sx={{ fontSize: '0.8125rem', color: cores.primaria, fontWeight: 700, minWidth: 44, textAlign: 'center' }}>
                            {Math.round(zoom * 100)}%
                        </Typography>
                        <BotaoFerramenta titulo="Aumentar zoom" onClick={() => mudarZoom(0.1)}><ZoomInIcon fontSize="small" /></BotaoFerramenta>
                        <BotaoFerramenta titulo="Ajustar à tela" onClick={ajustarATela}><FitIcon fontSize="small" /></BotaoFerramenta>
                    </Box>

                    {/* Linha 2: ações da seleção (sempre no lugar; desabilitadas sem seleção) */}
                    <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.75, px: 2, py: 1, borderBottom: `1px solid ${cores.borda}`, bgcolor: 'rgba(0,0,0,0.15)' }}>
                        <Typography sx={{ fontSize: '0.75rem', color: isMulti ? cores.sucesso : cores.textoSecundario, fontWeight: 600, minWidth: 110 }}>
                            {selecionados.length === 0 ? 'Nada selecionado' : isMulti ? `${selecionados.length} selecionados` : nomeDoElemento(selecionados[0])}
                        </Typography>
                        <BotaoFerramenta titulo="Duplicar (Ctrl+D)" onClick={duplicarSelecionados} disabled={!selecionados.length}><DuplicateIcon fontSize="small" /></BotaoFerramenta>
                        <BotaoFerramenta titulo="Agrupar (Ctrl+G)" onClick={agrupar} disabled={selectedIds.length < 2} cor={cores.sucesso}><AgruparIcon fontSize="small" /></BotaoFerramenta>
                        <BotaoFerramenta titulo="Desagrupar (Ctrl+Shift+G)" onClick={desagrupar} disabled={!temGrupoNaSelecao}><DesagruparIcon fontSize="small" /></BotaoFerramenta>
                        <BotaoFerramenta titulo={todosTravados ? 'Destravar' : 'Travar posição'} onClick={alternarTrava} disabled={!selecionados.length} ativo={todosTravados} cor={cores.alerta}>
                            {todosTravados ? <LockIcon fontSize="small" /> : <LockOpenIcon fontSize="small" />}
                        </BotaoFerramenta>
                        <Divider orientation="vertical" flexItem sx={{ borderColor: cores.borda, mx: 0.5 }} />
                        <BotaoFerramenta titulo="Trazer para frente (Ctrl+Shift+])" onClick={() => reordenar('frente')} disabled={!selecionados.length}><FrenteIcon fontSize="small" /></BotaoFerramenta>
                        <BotaoFerramenta titulo="Avançar uma camada (Ctrl+])" onClick={() => reordenar('avancar')} disabled={!selecionados.length}><AvancarIcon fontSize="small" /></BotaoFerramenta>
                        <BotaoFerramenta titulo="Recuar uma camada (Ctrl+[)" onClick={() => reordenar('recuar')} disabled={!selecionados.length}><RecuarIcon fontSize="small" /></BotaoFerramenta>
                        <BotaoFerramenta titulo="Enviar para trás (Ctrl+Shift+[)" onClick={() => reordenar('tras')} disabled={!selecionados.length}><TrasIcon fontSize="small" /></BotaoFerramenta>
                        <Divider orientation="vertical" flexItem sx={{ borderColor: cores.borda, mx: 0.5 }} />
                        <BotaoFerramenta titulo="Excluir (Delete)" onClick={excluirSelecionados} disabled={!selecionados.length} cor={cores.erro}><DeleteIcon fontSize="small" /></BotaoFerramenta>
                    </Box>

                    {/* Mesa de trabalho */}
                    <Box
                        ref={workspaceRef}
                        onMouseDown={handleWorkspaceMouseDown}
                        onDoubleClick={handleWorkspaceDoubleClick}
                        sx={{
                            flex: 1,
                            minHeight: 0,
                            overflow: 'auto',
                            position: 'relative',
                            display: 'flex',
                            bgcolor: cores.fundo,
                            backgroundImage: 'radial-gradient(rgba(148, 163, 184, 0.12) 1px, transparent 1px)',
                            backgroundSize: '18px 18px',
                            userSelect: 'none'
                        }}
                    >
                        <Box sx={{ m: 'auto', p: 4.5, flexShrink: 0 }}>
                            <Box sx={{ width: canvasWidth * zoom, height: canvasHeight * zoom, position: 'relative' }}>
                                <Box sx={{ position: 'absolute', top: 0, left: 0, width: canvasWidth, height: canvasHeight, transform: `scale(${zoom})`, transformOrigin: '0 0' }}>
                                    <Paper
                                        ref={paperRef}
                                        elevation={0}
                                        sx={{
                                            width: canvasWidth,
                                            height: canvasHeight,
                                            backgroundColor: '#FFFFFF',
                                            backgroundImage: 'none',
                                            position: 'relative',
                                            borderRadius: config.layout?.includes('cr80') ? '12px' : '4px',
                                            boxShadow: '0 12px 40px rgba(0,0,0,0.8), 0 0 0 1px rgba(0, 212, 255, 0.25)',
                                            '& .etq-el:hover': { outline: '1px solid rgba(0, 212, 255, 0.8)' }
                                        }}
                                    >
                                        {/* Fundo fixo do modo antigo */}
                                        {config.background_url && !ocultarGabarito && (
                                            <Box sx={{
                                                position: 'absolute', inset: 0, borderRadius: 'inherit',
                                                backgroundImage: `url('${config.background_url}')`, backgroundSize: 'cover', backgroundPosition: 'center',
                                                opacity: config.fundo_como_referencia ? (config.opacidade_referencia || 0.5) : 1,
                                                pointerEvents: 'none', zIndex: 1
                                            }} />
                                        )}

                                        {elements.filter(el => !el.oculto).map(el => {
                                            const isSel = selectedIds.includes(el.id);
                                            const podeRedimensionar = isSel && !isMulti && !el.locked;
                                            let outline;
                                            if (isSel) outline = el.locked ? `2px solid ${cores.alerta}` : (isMulti ? '1px dashed #00FF88' : '2px solid #00D4FF');
                                            else if (el.apenasReferencia) outline = '1px dashed #FF0077';
                                            return (
                                                <Rnd
                                                    key={el.id}
                                                    className={`etq-el etq-id-${el.id}${el.locked ? ' etq-locked' : ''}`}
                                                    scale={zoom}
                                                    size={{ width: el.width, height: el.height }}
                                                    position={{ x: el.x, y: el.y }}
                                                    lockAspectRatio={Boolean(el.lockAspectRatio)}
                                                    disableDragging={Boolean(el.locked)}
                                                    enableResizing={podeRedimensionar}
                                                    resizeHandleStyles={podeRedimensionar ? ALCAS_SIMPLES : undefined}
                                                    bounds="parent"
                                                    onDragStart={(e, d) => handleDragStart(e, d, el)}
                                                    onDrag={(e, d) => handleDrag(e, d, el)}
                                                    onDragStop={(e, d) => handleDragStop(e, d, el)}
                                                    onResizeStop={(_e, _dir, ref, _delta, position) => {
                                                        updateElement(el.id, {
                                                            width: Math.round(parseFloat(ref.style.width)),
                                                            height: Math.round(parseFloat(ref.style.height)),
                                                            x: Math.round(position.x),
                                                            y: Math.round(position.y)
                                                        });
                                                    }}
                                                    style={{
                                                        zIndex: el.zIndex || Z_BASE,
                                                        outline,
                                                        cursor: el.locked ? 'default' : 'move'
                                                    }}
                                                >
                                                    <Box sx={{
                                                        width: '100%', height: '100%', overflow: 'hidden', pointerEvents: 'none',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        borderRadius: el.borderRadius && el.type !== 'circle' ? `${el.borderRadius}px` : 0,
                                                        opacity: el.opacity ?? 1
                                                    }}>
                                                        {renderConteudo(el)}
                                                    </Box>
                                                </Rnd>
                                            );
                                        })}
                                    </Paper>

                                    {/* Camada de sobreposição: grade, guias e alças do grupo (acima de tudo, sem cortar nas bordas) */}
                                    <Box sx={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5000 }}>
                                        {showGrid && (
                                            <Box sx={{
                                                position: 'absolute', inset: 0,
                                                backgroundImage: `
                                                    linear-gradient(to right, ${corGrade(gridIntensity)} 1px, transparent 1px),
                                                    linear-gradient(to bottom, ${corGrade(gridIntensity)} 1px, transparent 1px),
                                                    linear-gradient(to right, ${corGrade(gridIntensity * 0.45)} 1px, transparent 1px),
                                                    linear-gradient(to bottom, ${corGrade(gridIntensity * 0.45)} 1px, transparent 1px)
                                                `,
                                                backgroundSize: `${passoMaior}px ${passoMaior}px, ${passoMaior}px ${passoMaior}px, ${gridSize}px ${gridSize}px, ${gridSize}px ${gridSize}px`
                                            }}>
                                                {/* Eixos centrais */}
                                                <Box sx={{ position: 'absolute', top: 0, bottom: 0, left: canvasWidth / 2, borderLeft: `1px dashed ${corGrade(Math.min(1, gridIntensity + 0.25))}` }} />
                                                <Box sx={{ position: 'absolute', left: 0, right: 0, top: canvasHeight / 2, borderTop: `1px dashed ${corGrade(Math.min(1, gridIntensity + 0.25))}` }} />
                                            </Box>
                                        )}

                                        {smartGuides.vertical !== null && (
                                            <Box sx={{ position: 'absolute', top: -2000, bottom: -2000, left: smartGuides.vertical, width: '1.5px', bgcolor: '#FF0077', boxShadow: '0 0 6px #FF0077' }} />
                                        )}
                                        {smartGuides.horizontal !== null && (
                                            <Box sx={{ position: 'absolute', left: -2000, right: -2000, top: smartGuides.horizontal, height: '1.5px', bgcolor: '#FF0077', boxShadow: '0 0 6px #FF0077' }} />
                                        )}

                                        {caixaSelecao && (
                                            <Rnd
                                                className="etq-group"
                                                scale={zoom}
                                                position={{ x: caixaSelecao.x, y: caixaSelecao.y }}
                                                size={{ width: caixaSelecao.width, height: caixaSelecao.height }}
                                                disableDragging
                                                lockAspectRatio={escalaProporcional}
                                                resizeHandleStyles={ALCAS_GRUPO}
                                                onResizeStart={handleGrupoResizeStart}
                                                onResize={(_e, _d, ref, _delta, pos) => aplicarEscalaGrupo(ref, pos, false)}
                                                onResizeStop={(_e, _d, ref, _delta, pos) => aplicarEscalaGrupo(ref, pos, true)}
                                                style={{ pointerEvents: 'none', outline: '1.5px solid #00FF88', boxShadow: '0 0 12px rgba(0, 255, 136, 0.35)' }}
                                            />
                                        )}
                                    </Box>
                                </Box>
                            </Box>
                        </Box>

                        {marquee && (
                            <Box sx={{
                                position: 'absolute',
                                left: marquee.left,
                                top: marquee.top,
                                width: marquee.width,
                                height: marquee.height,
                                border: '1px solid #00D4FF',
                                bgcolor: 'rgba(0, 212, 255, 0.12)',
                                pointerEvents: 'none',
                                zIndex: 9999
                            }} />
                        )}
                    </Box>
                </GlassCard>

                {/* ===== COLUNA DIREITA: PROPRIEDADES ===== */}
                <GlassCard sx={{ display: 'flex', flexDirection: 'column', height: alturaPainel, minHeight: { lg: 560 } }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, minHeight: 48, borderBottom: `1px solid ${cores.borda}` }}>
                        <TuneIcon sx={{ fontSize: 18, color: cores.primaria }} />
                        <Typography sx={{ fontSize: '0.875rem', fontWeight: 700, color: cores.textoForte, fontFamily: '"Space Grotesk", sans-serif' }}>
                            Propriedades
                        </Typography>
                    </Box>
                    <Box sx={{ p: 2, overflowY: 'auto', flex: 1 }}>
                        {renderPropriedades()}
                    </Box>
                </GlassCard>
            </Box>
        </Box>
    );
};

export default ConfigEtiquetas;
