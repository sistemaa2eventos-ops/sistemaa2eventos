import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
    Box, Typography, Grid, TextField, IconButton, Paper, Stack,
    Button, Tooltip, MenuItem, FormControl, InputLabel, Select,
    Divider, Switch, Tabs, Tab, Chip,
    Dialog, DialogTitle, DialogContent, DialogActions, Card, CardActionArea, CardContent
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
    Straighten as RulerIcon,
    DashboardCustomize as TemplateIcon,
    BookmarkAdd as BookmarkAddIcon,
    Star as IconeShapeIcon,
    CheckCircleOutline as SafeMarginIcon
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import { Rnd } from 'react-rnd';
import { useSearchParams } from 'react-router-dom';
import api from '../../services/api';
import GlassCard from '../../components/common/GlassCard';
import NeonButton from '../../components/common/NeonButton';
import PageHeader from '../../components/common/PageHeader';
import { montarHtmlEtiqueta, imprimirHtml, limparCacheEtiqueta } from '../../services/etiquetaService';
import {
    ESCALA_EDITOR,
    enriquecerDados,
    FONTES,
    FORMAS,
    ICONES
} from '../../services/etiquetaRender';
import { botaoSecundario, cores, tom } from '../../styles/tokens';
import {
    Z_BASE, ordenarPorCamada, normalizarCamadas, expandirGrupos, reordenarCamadas,
    agruparElementos, desagruparElementos, caixaDoGrupo, idsNaArea, escalarItem,
    arredondarItem, alinharEntreSi
} from './etiquetas/camadas';
import ReguaEditor from './etiquetas/ReguaEditor';
import ElementoVisual from './etiquetas/ElementoVisual';
import {
    MODELOS_SISTEMA,
    lerModelosSalvos,
    salvarModeloPersonalizado,
    excluirModeloPersonalizado
} from './etiquetas/modelosPreProntos';

const ESCALA = ESCALA_EDITOR; // 1 mm = 3 px

const DADOS_EXEMPLO = {
    nome_pessoa: 'MARIA DA SILVA',
    nome_completo: 'MARIA DA SILVA SANTOS',
    empresa: 'NZT TECH EVENTS',
    funcao: 'COORDENADORA GERAL',
    cpf: '123.456.789-09',
    pulseira: '102488',
    evento: 'HISTÓRIAS CURITIBA 2026',
    data: new Date().toLocaleDateString('pt-BR'),
    qr_code: 'EXEMPLO-102488',
    qr_imagem: null,
    foto_url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=240&auto=format&fit=crop&q=80',
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
    { label: 'Branco', hex: cores.textoForte },
    { label: 'Ciano Neon', hex: cores.primaria },
    { label: 'Verde Neon', hex: cores.sucesso },
    { label: 'Rosa Neon', hex: '#FF0077' },
    { label: 'Amarelo Ouro', hex: '#FFD700' },
    { label: 'Azul Escuro', hex: cores.superficie },
    { label: 'Cinza', hex: '#666666' }
];

const _CORES_GRADE = [
    { label: 'Azul', hex: '#0080FF' },
    { label: 'Magenta', hex: '#FF0077' },
    { label: 'Branca', hex: cores.textoForte },
    { label: 'Preta', hex: '#000000' }
];

const TIPO_ROTULO = {
    text: 'Texto', qrcode: 'QR Code', barcode: 'Cód. barras', foto: 'Foto',
    image: 'Imagem', shape: 'Forma / Tarja', circle: 'Círculo', line: 'Linha', icone: 'Ícone'
};

const TIPO_ICONE = {
    text: TextIcon, qrcode: QrIcon, barcode: BarcodeIcon, foto: FotoIcon,
    image: ImageIcon, shape: ShapeIcon, circle: CircleIcon, line: LineIcon, icone: IconeShapeIcon
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
    { id: '4', type: 'foto', content: '{foto_url}', x: 80, y: 200, width: 80, height: 80, borderRadius: 8, borderColor: cores.primaria, borderWidth: 2, lockAspectRatio: true, zIndex: 7 }
]);

const alcasDeRedimensionar = (cor, redondo) => {
    const canto = {
        width: 12, height: 12, background: cores.textoForte, border: `2px solid ${cor}`,
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
const ALCAS_SIMPLES = alcasDeRedimensionar(cores.primaria, false);
const ALCAS_GRUPO = alcasDeRedimensionar(cores.sucesso, true);

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

// UI Helpers
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
                    bgcolor: ativo ? tom(cores.primaria, 0.12) : 'transparent',
                    border: `1px solid ${ativo ? tom(cores.primaria, 0.45) : 'rgba(148, 163, 184, 0.18)'}`,
                    '&:hover': { color: cor || cores.primaria, borderColor: tom(cores.primaria, 0.45), bgcolor: tom(cores.primaria, 0.08) },
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
    const dragRef = useRef(null);
    const grupoResizeRef = useRef(null);
    const elementsRef = useRef([]);

    const [sidebarTab, setSidebarTab] = useState(0);

    const [config, setConfig] = useState({
        layout: 'zebra_tlp2844',
        width: 100,
        height: 150,
        corFundo: cores.textoForte,
        background_url: '',
        fundo_como_referencia: false,
        imprimir_fundo: true,
        opacidade_referencia: 0.5,
        travar_referencia: true
    });

    const [elements, setElements] = useState(ELEMENTOS_INICIAIS);
    const [selectedIds, setSelectedIds] = useState([]);
    const [saving, setSaving] = useState(false);

    // Diálogos de modelos
    const [modalModelosAberto, setModalModelosAberto] = useState(false);
    const [modalSalvarModeloAberto, setModalSalvarModeloAberto] = useState(false);
    const [nomeNovoModelo, setNomeNovoModelo] = useState('');
    const [descNovoModelo, setDescNovoModelo] = useState('');
    const [modelosCustomizados, setModelosCustomizados] = useState(lerModelosSalvos());

    // Preferências gráficas
    const prefs = useMemo(lerPrefs, []);
    const [showGrid, setShowGrid] = useState(prefs.showGrid ?? true);
    const [gridSize, _setGridSize] = useState(prefs.gridSize ?? 10);
    const [gridColor, _setGridColor] = useState(prefs.gridColor ?? '#0080FF');
    const [gridIntensity, _setGridIntensity] = useState(prefs.gridIntensity ?? 0.6);
    const [snapToGrid, setSnapToGrid] = useState(prefs.snapToGrid ?? false);
    const [showRulers, setShowRulers] = useState(prefs.showRulers ?? true);
    const [showGuides, setShowGuides] = useState(prefs.showGuides ?? true);
    const [escalaProporcional, setEscalaProporcional] = useState(true);

    const [smartGuides, setSmartGuides] = useState({ vertical: null, horizontal: null });
    const smartGuidesTimerRef = useRef(null);
    const [zoom, setZoom] = useState(1);
    const [marquee, setMarquee] = useState(null);

    // Cursor em tempo real para réguas
    const [cursorCoords, setCursorCoords] = useState({ x: null, y: null });

    const canvasWidth = (Number(config.width) || 100) * ESCALA;
    const canvasHeight = (Number(config.height) || 150) * ESCALA;

    useEffect(() => { elementsRef.current = elements; }, [elements]);

    useEffect(() => {
        localStorage.setItem(PREFS_KEY, JSON.stringify({
            showGrid, gridSize, gridColor, gridIntensity, snapToGrid, showRulers, showGuides
        }));
    }, [showGrid, gridSize, gridColor, gridIntensity, snapToGrid, showRulers, showGuides]);

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

    const ajustarATela = useCallback(() => {
        const ws = workspaceRef.current;
        if (!ws) return;
        const extraRuler = showRulers ? 30 : 0;
        const fit = Math.min((ws.clientWidth - 80 - extraRuler) / canvasWidth, (ws.clientHeight - 80 - extraRuler) / canvasHeight);
        setZoom(Math.max(0.25, Math.min(3, Math.floor(fit * 20) / 20)));
    }, [canvasWidth, canvasHeight, showRulers]);

    useEffect(() => {
        const id = requestAnimationFrame(ajustarATela);
        return () => cancelAnimationFrame(id);
    }, [ajustarATela]);

    const mudarZoom = (delta) => setZoom(z => Math.max(0.25, Math.min(3, Math.round((z + delta) * 100) / 100)));

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

    const handleWorkspaceMouseMove = (e) => {
        if (!paperRef.current || !showRulers) return;
        const pr = paperRef.current.getBoundingClientRect();
        const curX = (e.clientX - pr.left) / zoom;
        const curY = (e.clientY - pr.top) / zoom;
        if (curX >= 0 && curX <= canvasWidth && curY >= 0 && curY <= canvasHeight) {
            setCursorCoords({ x: Math.round(curX), y: Math.round(curY) });
        } else {
            setCursorCoords({ x: null, y: null });
        }
    };

    // Seleção derivada
    const selecionados = useMemo(() => elements.filter(el => selectedIds.includes(el.id)), [elements, selectedIds]);
    const moveis = useMemo(() => selecionados.filter(el => !el.locked && !el.oculto), [selecionados]);
    const caixaSelecao = useMemo(() => (moveis.length > 1 ? caixaDoGrupo(moveis) : null), [moveis]);
    const selectedElement = selecionados.length === 1 ? selecionados[0] : null;
    const temGrupoNaSelecao = selecionados.some(el => el.groupId);
    const todosTravados = selecionados.length > 0 && selecionados.every(el => el.locked);
    const elementosOrdenados = useMemo(() => [...ordenarPorCamada(elements)].reverse(), [elements]);
    const camadasDeArte = elements.filter(el => el.papel === 'arte');

    const handleChangePreset = (presetValue) => {
        const found = PRESETS.find(p => p.value === presetValue);
        setConfig(prev => (found ? { ...prev, layout: presetValue, width: found.width, height: found.height } : { ...prev, layout: presetValue }));
    };

    const handleChangeConfig = (field, value) => setConfig(prev => ({ ...prev, [field]: value }));

    const maiorZ = (lista) => lista.reduce((max, el) => Math.max(max, el.zIndex || 0), Z_BASE - 1);

    const inserir = (novo) => {
        setElements(prev => [...prev, { ...novo, zIndex: maiorZ(prev) + 1 }]);
        setSelectedIds([novo.id]);
    };

    const addElement = (type, extra = {}) => {
        if (type === 'image') {
            fileElementInputRef.current?.click();
            return;
        }
        const base = { id: Date.now().toString(), type, x: 20, y: 20, width: 150, height: 35, lockAspectRatio: false };
        const porTipo = {
            text: { content: '{nome_pessoa}', fontSize: 16, fontWeight: 'bold', color: '#000000', textAlign: 'left', autoAjuste: true },
            qrcode: { content: '{qr_code}', width: 80, height: 80, lockAspectRatio: true, color: '#000000' },
            barcode: { content: '{pulseira}', width: 160, height: 55, exibirTexto: true, color: '#000000' },
            foto: { content: '{foto_url}', width: 80, height: 80, borderRadius: 8, borderColor: cores.primaria, borderWidth: 2, lockAspectRatio: true },
            shape: { width: 200, height: 35, backgroundColor: cores.primaria, semPreenchimento: false, forma: 'retangulo', borderColor: '#000000', borderWidth: 0, borderRadius: 1.5, opacity: 1 },
            circle: { width: 60, height: 60, backgroundColor: cores.sucesso, semPreenchimento: false, forma: 'elipse', borderColor: '#000000', borderWidth: 0, opacity: 1, lockAspectRatio: true },
            line: { width: 200, height: 4, borderColor: '#000000', borderWidth: 2, opacity: 1 },
            icone: { width: 40, height: 40, icone: 'estrela', color: cores.primaria, lockAspectRatio: true }
        };
        inserir({ ...base, ...(porTipo[type] || {}), ...extra });
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
        enqueueSnackbar('Arte do evento inserida como camada no fundo.', { variant: 'success' });
    };

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
            enqueueSnackbar('Elemento travado: destrave para excluir.', { variant: 'warning' });
            return;
        }
        setElements(prev => prev.filter(el => !apagar.includes(el.id)));
        setSelectedIds(prev => prev.filter(id => !apagar.includes(id)));
        enqueueSnackbar(`${apagar.length} excluído(s).`, { variant: 'info', autoHideDuration: 1500 });
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

    // Calcula linhas guias magnéticas para qualquer posição testada
    const calcularGuiasAlinhamento = useCallback((alvo, todosElementos) => {
        const cx = alvo.x + alvo.width / 2;
        const cy = alvo.y + alvo.height / 2;
        const t = 6;
        let gv = null;
        let gh = null;

        // Centro do canvas
        if (Math.abs(cx - canvasWidth / 2) <= t) gv = canvasWidth / 2;
        if (Math.abs(cy - canvasHeight / 2) <= t) gh = canvasHeight / 2;

        for (const o of todosElementos) {
            if (o.id === alvo.id || o.oculto) continue;
            const ocx = o.x + o.width / 2;
            const ocy = o.y + o.height / 2;

            if (Math.abs(cx - ocx) <= t) gv = ocx;
            else if (Math.abs(alvo.x - o.x) <= t) gv = o.x;
            else if (Math.abs(alvo.x + alvo.width - (o.x + o.width)) <= t) gv = o.x + o.width;
            else if (Math.abs(alvo.x - (o.x + o.width)) <= t) gv = o.x + o.width;
            else if (Math.abs(alvo.x + alvo.width - o.x) <= t) gv = o.x;

            if (Math.abs(cy - ocy) <= t) gh = ocy;
            else if (Math.abs(alvo.y - o.y) <= t) gh = o.y;
            else if (Math.abs(alvo.y + alvo.height - (o.y + o.height)) <= t) gh = o.y + o.height;
            else if (Math.abs(alvo.y - (o.y + o.height)) <= t) gh = o.y + o.height;
            else if (Math.abs(alvo.y + alvo.height - o.y) <= t) gh = o.y;
        }

        return { vertical: gv, horizontal: gh };
    }, [canvasWidth, canvasHeight]);

    // Movimentação pelas setas do teclado: atualiza posição e ativa as linhas guias
    const moverSelecionados = useCallback((dx, dy) => {
        setElements(prev => {
            const atualizados = prev.map(el => {
                if (!selectedIds.includes(el.id) || el.locked) return el;
                return {
                    ...el,
                    x: Math.round(Math.max(0, Math.min(canvasWidth - el.width, el.x + dx))),
                    y: Math.round(Math.max(0, Math.min(canvasHeight - el.height, el.y + dy)))
                };
            });

            // Se tiver um elemento ou grupo selecionado, calcula e exibe as guias
            const selecionadoPrincipal = atualizados.find(el => selectedIds.includes(el.id) && !el.locked);
            if (selecionadoPrincipal) {
                const guias = calcularGuiasAlinhamento(selecionadoPrincipal, atualizados);
                setSmartGuides(guias);
                if (smartGuidesTimerRef.current) clearTimeout(smartGuidesTimerRef.current);
                smartGuidesTimerRef.current = setTimeout(() => {
                    setSmartGuides({ vertical: null, horizontal: null });
                }, 1000);
            }

            return atualizados;
        });
    }, [selectedIds, canvasWidth, canvasHeight, calcularGuiasAlinhamento]);

    const selecionarTodos = () => {
        setSelectedIds(elements.filter(el => !el.locked && !el.oculto).map(el => el.id));
    };

    const agrupar = () => {
        if (selectedIds.length < 2) return;
        setElements(prev => agruparElementos(prev, selectedIds));
        enqueueSnackbar('Elementos agrupados com sucesso!', { variant: 'success' });
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
        if (smartGuidesTimerRef.current) clearTimeout(smartGuidesTimerRef.current);
        smartGuidesTimerRef.current = setTimeout(() => setSmartGuides({ vertical: null, horizontal: null }), 1200);
    };

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

    // Atalhos de teclado
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

    // Seleção por área
    const marqueeCleanupRef = useRef(null);
    useEffect(() => () => { if (marqueeCleanupRef.current) marqueeCleanupRef.current(); }, []);

    const handleWorkspaceMouseDown = (e) => {
        if (e.button !== 0) return;
        const alvo = e.target;
        if (alvo.closest?.('.etq-group')) return;
        const noElemento = alvo.closest?.('.etq-el');
        if (noElemento && !noElemento.classList.contains('etq-locked')) return;
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

    const handleWorkspaceDoubleClick = (e) => {
        const id = idDoNo(e.target.closest?.('.etq-el'));
        if (id) setSelectedIds([id]);
    };

    // Arraste com resposta imediata
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
            interacao.soEle = doGrupo;
        }
        if (atual !== selectedIds) setSelectedIds(atual);

        const iniciais = {};
        elements.forEach(item => {
            if (atual.includes(item.id) && !item.locked) {
                iniciais[item.id] = { x: item.x, y: item.y, width: item.width, height: item.height };
            }
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
        const dx = d.x - drag.startX;
        const dy = d.y - drag.startY;
        if (Math.abs(dx) + Math.abs(dy) > 1) drag.moveu = true;

        // Movimentação sincronizada de elementos agrupados usando transform nativa
        const outrosIds = Object.keys(drag.iniciais).filter(id => id !== el.id);
        if (outrosIds.length > 0) {
            const [ldx, ldy] = limitarDelta(drag, dx, dy);
            outrosIds.forEach(id => {
                const domEl = document.querySelector(`.etq-id-${id}`);
                if (domEl) {
                    const orig = drag.iniciais[id];
                    domEl.style.transform = `translate(${orig.x + ldx}px, ${orig.y + ldy}px)`;
                }
            });
        }

        // Calcula guias inteligentes em tempo real
        const lider = drag.iniciais[el.id];
        if (lider) {
            const posAtual = { ...el, x: lider.x + dx, y: lider.y + dy };
            const guias = calcularGuiasAlinhamento(posAtual, elements);
            setSmartGuides(guias);
        }
    };

    const handleDragStop = (_e, d, _el) => {
        setSmartGuides({ vertical: null, horizontal: null });
        const drag = dragRef.current;
        dragRef.current = null;
        if (!drag) return;

        if (!drag.moveu) {
            if (drag.desmarcar) setSelectedIds(prev => prev.filter(id => !drag.desmarcar.includes(id)));
            else if (drag.soEle) setSelectedIds(drag.soEle);
            return;
        }

        let lx = d.x;
        let ly = d.y;
        if (snapToGrid) {
            lx = Math.round(lx / gridSize) * gridSize;
            ly = Math.round(ly / gridSize) * gridSize;
        }
        const [dx, dy] = limitarDelta(drag, lx - drag.startX, ly - drag.startY);

        // Limpa transforms inline de outros elementos agrupados
        Object.keys(drag.iniciais).forEach(id => {
            const domEl = document.querySelector(`.etq-id-${id}`);
            if (domEl) domEl.style.transform = '';
        });

        setElements(prev => prev.map(item => (drag.iniciais[item.id]
            ? { ...item, x: Math.round(drag.iniciais[item.id].x + dx), y: Math.round(drag.iniciais[item.id].y + dy) }
            : item)));
    };

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

    const handleSave = async () => {
        if (!eventoId) {
            enqueueSnackbar('Selecione primeiro um evento ativo no menu superior.', { variant: 'warning' });
            return;
        }
        try {
            setSaving(true);
            await api.post('/config/etiquetas', { evento_id: eventoId, papel_config: config, elementos: elements });
            limparCacheEtiqueta(eventoId);
            enqueueSnackbar('Layout profissional salvo com sucesso!', { variant: 'success' });
        } catch (error) {
            enqueueSnackbar('Falha ao salvar layout: ' + (error.response?.data?.details || ''), { variant: 'error' });
        } finally {
            setSaving(false);
        }
    };

    const handleImprimirTeste = () => {
        imprimirHtml(montarHtmlEtiqueta({ papel_config: config, elementos: elements }, DADOS_EXEMPLO));
    };

    const aplicarModelo = (modelo) => {
        setConfig(prev => ({ ...prev, ...modelo.papel_config }));
        setElements(normalizarCamadas(modelo.elementos));
        setSelectedIds([]);
        setModalModelosAberto(false);
        enqueueSnackbar(`Modelo "${modelo.nome}" carregado com sucesso!`, { variant: 'success' });
    };

    const handleSalvarComoModelo = () => {
        if (!nomeNovoModelo.trim()) {
            enqueueSnackbar('Informe um nome para o modelo.', { variant: 'warning' });
            return;
        }
        salvarModeloPersonalizado(nomeNovoModelo, descNovoModelo, config, elements);
        setModelosCustomizados(lerModelosSalvos());
        setNomeNovoModelo('');
        setDescNovoModelo('');
        setModalSalvarModeloAberto(false);
        enqueueSnackbar('Modelo salvo na sua galeria personalizada!', { variant: 'success' });
    };

    const handleExcluirModeloCustom = (id, e) => {
        e.stopPropagation();
        const atualizados = excluirModeloPersonalizado(id);
        setModelosCustomizados(atualizados);
        enqueueSnackbar('Modelo personalizado removido.', { variant: 'info' });
    };

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

    // Render do Painel Direito
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
                        <Chip size="small" label={TIPO_ROTULO[el.type] || el.type} sx={{ bgcolor: tom(cores.primaria, 0.15), color: cores.primaria, fontWeight: 700, fontSize: '0.75rem' }} />
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

                    {/* Propriedades Específicas */}
                    {(el.type === 'shape' || el.type === 'circle') && (
                        <Stack spacing={1.25} sx={{ p: 1.25, borderRadius: '8px', bgcolor: 'rgba(0,0,0,0.25)', border: `1px solid ${cores.borda}` }}>
                            <Secao>Estilo do Elemento / Contorno</Secao>
                            <FormControl fullWidth size="small">
                                <InputLabel id="forma-label">Forma</InputLabel>
                                <Select labelId="forma-label" label="Forma" value={el.forma || (el.type === 'circle' ? 'elipse' : 'retangulo')} onChange={e => updateElement(el.id, { forma: e.target.value })}>
                                    {Object.entries(FORMAS).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
                                </Select>
                            </FormControl>

                            <SwitchLinha
                                checked={Boolean(el.semPreenchimento)}
                                onChange={v => updateElement(el.id, { semPreenchimento: v })}
                                rotulo="Sem preenchimento (Só contorno)"
                                ajuda="Fundo vazado/transparente com apenas a borda visível"
                            />

                            {!el.semPreenchimento && (
                                <>
                                    <TextField label="Cor do Fundo" type="color" fullWidth size="small" value={el.backgroundColor || cores.primaria} onChange={e => updateElement(el.id, { backgroundColor: e.target.value })} />
                                    <Paleta onEscolher={hex => updateElement(el.id, { backgroundColor: hex })} />
                                </>
                            )}

                            <Divider sx={{ borderColor: cores.borda }} />
                            <Secao>Borda / Contorno</Secao>
                            <Grid container spacing={1}>
                                <Grid item xs={6}>
                                    <TextField label="Espessura (px)" type="number" fullWidth size="small" value={el.borderWidth ?? (el.semPreenchimento ? 2 : 0)} onChange={e => updateElement(el.id, { borderWidth: Number(e.target.value) })} />
                                </Grid>
                                <Grid item xs={6}>
                                    <TextField label="Cor da borda" type="color" fullWidth size="small" value={el.borderColor || '#000000'} onChange={e => updateElement(el.id, { borderColor: e.target.value })} />
                                </Grid>
                            </Grid>
                            <Paleta onEscolher={hex => updateElement(el.id, { borderColor: hex })} />
                        </Stack>
                    )}

                    {el.type === 'text' && (
                        <Stack spacing={1.5}>
                            <Secao>Conteúdo do Texto</Secao>
                            <TextField label="Texto ou Marcador" fullWidth size="small" value={el.content} onChange={e => updateElement(el.id, { content: e.target.value })} />
                            
                            <Secao>Campos dinâmicos do participante</Secao>
                            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                                {[
                                    { tag: '{nome_pessoa}', label: 'Nome Credencial' },
                                    { tag: '{nome_completo}', label: 'Nome Completo' },
                                    { tag: '{primeiro_nome}', label: 'Primeiro Nome' },
                                    { tag: '{funcao}', label: 'Cargo / Função' },
                                    { tag: '{empresa}', label: 'Empresa' },
                                    { tag: '{cpf}', label: 'CPF' },
                                    { tag: '{cpf_parcial}', label: 'CPF LGPD' },
                                    { tag: '{pulseira}', label: 'Nº Pulseira' },
                                    { tag: '{evento}', label: 'Evento' },
                                    { tag: '{data}', label: 'Data Hoje' }
                                ].map(item => (
                                    <Chip
                                        key={item.tag}
                                        label={item.label}
                                        size="small"
                                        onClick={() => updateElement(el.id, { content: item.tag })}
                                        sx={{ fontSize: '0.75rem', bgcolor: tom(cores.primaria, 0.08), color: cores.primaria, cursor: 'pointer', border: '1px solid rgba(0, 212, 255, 0.25)' }}
                                    />
                                ))}
                            </Stack>

                            <FormControl fullWidth size="small">
                                <InputLabel id="fonte-label">Tipografia</InputLabel>
                                <Select labelId="fonte-label" label="Tipografia" value={el.fontFamily || 'arial'} onChange={e => updateElement(el.id, { fontFamily: e.target.value })}>
                                    {FONTES.map(f => <MenuItem key={f.valor} value={f.valor}>{f.rotulo}</MenuItem>)}
                                </Select>
                            </FormControl>

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

                            <SwitchLinha
                                checked={Boolean(el.autoAjuste)}
                                onChange={v => updateElement(el.id, { autoAjuste: v })}
                                rotulo="Auto-ajuste de fonte"
                                ajuda="Diminui a letra automaticamente se o nome for grande demais para a caixa"
                            />
                            <Paleta onEscolher={hex => updateElement(el.id, { color: hex })} />
                        </Stack>
                    )}

                    {el.type === 'foto' && (
                        <Stack spacing={1.25}>
                            <Secao>Formato da Foto</Secao>
                            <SwitchLinha
                                checked={Boolean(el.circular)}
                                onChange={v => updateElement(el.id, { circular: v })}
                                rotulo="Foto Circular / Redonda"
                                ajuda="Aplica máscara de corte redonda perfeita"
                            />
                            {!el.circular && (
                                <TextField label="Cantos arredondados (px)" type="number" fullWidth size="small" value={el.borderRadius || 0} onChange={e => updateElement(el.id, { borderRadius: Number(e.target.value) })} />
                            )}
                            <Grid container spacing={1}>
                                <Grid item xs={6}>
                                    <TextField label="Borda (px)" type="number" fullWidth size="small" value={el.borderWidth ?? 1} onChange={e => updateElement(el.id, { borderWidth: Number(e.target.value) })} />
                                </Grid>
                                <Grid item xs={6}>
                                    <TextField label="Cor" type="color" fullWidth size="small" value={el.borderColor || cores.primaria} onChange={e => updateElement(el.id, { borderColor: e.target.value })} />
                                </Grid>
                            </Grid>
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

                    {el.type === 'icone' && (
                        <Stack spacing={1.25}>
                            <Secao>Escolher Ícone</Secao>
                            <FormControl fullWidth size="small">
                                <InputLabel id="icone-label">Ícone</InputLabel>
                                <Select labelId="icone-label" label="Ícone" value={el.icone || 'estrela'} onChange={e => updateElement(el.id, { icone: e.target.value })}>
                                    {Object.entries(ICONES).map(([k, v]) => <MenuItem key={k} value={k}>{v.rotulo}</MenuItem>)}
                                </Select>
                            </FormControl>
                            <TextField label="Cor do Ícone" type="color" fullWidth size="small" value={el.color || cores.primaria} onChange={e => updateElement(el.id, { color: e.target.value })} />
                            <Paleta onEscolher={hex => updateElement(el.id, { color: hex })} />
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
                        Selecione um elemento para editar ou use os botões da barra superior.
                    </Typography>
                </Box>
                <Box sx={{ p: 1.5, borderRadius: '8px', bgcolor: tom(cores.primaria, 0.05), border: '1px dashed rgba(0, 212, 255, 0.25)' }}>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                        <KeyboardIcon sx={{ fontSize: 18, color: cores.primaria }} />
                        <Secao>Atalhos Profissionais</Secao>
                    </Stack>
                    {[
                        ['Arrastar no vazio', 'seleção em área'],
                        ['Setas do teclado', 'ajuste fino de 1px com guias'],
                        ['Shift + Setas', 'ajuste de 10px com guias'],
                        ['Delete / Backspace', 'excluir selecionados'],
                        ['Ctrl + D', 'duplicar'],
                        ['Ctrl + G', 'agrupar / desagrupar']
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

    const corGrade = (alfa) => {
        const n = parseInt(gridColor.replace('#', ''), 16);
        return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${Math.min(1, alfa)})`;
    };
    const passoMaior = gridSize * 5;
    const alturaPainel = { lg: 'calc(100vh - 230px)' };
    const isMulti = selecionados.length > 1;

    const dadosVisualizacao = useMemo(() => enriquecerDados(DADOS_EXEMPLO), []);

    return (
        <Box sx={{ p: { xs: 2, sm: 3, md: 4 }, maxWidth: 1600, mx: 'auto', width: '100%' }}>
            <PageHeader
                title="Etiquetas e crachás"
                subtitle="Editor profissional estilo gráfica: movimentação suave e imediata, réguas, guias e biblioteca de modelos."
                breadcrumbs={[{ text: 'Configurações' }, { text: 'Credenciais físicas' }, { text: 'Etiquetas e crachás' }]}
                action={
                    <Stack direction="row" spacing={1.5}>
                        <Button
                            variant="outlined"
                            startIcon={<BookmarkAddIcon />}
                            onClick={() => setModalSalvarModeloAberto(true)}
                            sx={{ ...botaoSecundario, color: cores.sucesso, borderColor: 'rgba(0, 255, 136, 0.45)' }}
                        >
                            Salvar como modelo
                        </Button>
                        <Button
                            variant="outlined"
                            startIcon={<TemplateIcon />}
                            onClick={() => setModalModelosAberto(true)}
                            sx={{ ...botaoSecundario, color: cores.primaria, borderColor: tom(cores.primaria, 0.45) }}
                        >
                            Modelos prontos
                        </Button>
                        <NeonButton startIcon={<PrintIcon />} variant="outlined" onClick={handleImprimirTeste}>
                            Imprimir teste
                        </NeonButton>
                        <NeonButton startIcon={<SaveIcon />} onClick={handleSave} loading={saving} neonColor={cores.sucesso}>
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
                                    <TextField label="Cor de Fundo da Base" type="color" fullWidth size="small" value={config.corFundo || cores.textoForte} onChange={(e) => handleChangeConfig('corFundo', e.target.value)} />
                                </Stack>

                                <Divider sx={{ borderColor: cores.borda }} />

                                <Stack spacing={1.5}>
                                    <Secao>Arte do evento</Secao>
                                    <Typography sx={{ fontSize: '0.8125rem', color: cores.textoSecundario, lineHeight: 1.45 }}>
                                        A arte entra como uma <strong>camada</strong>: ocupa o crachá inteiro, fica no fundo e pode ser ocultada ou virar só gabarito de referência.
                                    </Typography>
                                    <Button
                                        variant="outlined"
                                        startIcon={<UploadIcon />}
                                        onClick={() => fileArteInputRef.current?.click()}
                                        sx={{ ...botaoSecundario, color: cores.primaria, borderColor: tom(cores.primaria, 0.45), textTransform: 'none', borderRadius: '8px' }}
                                    >
                                        Subir arte (PNG/JPG)
                                    </Button>

                                    {camadasDeArte.map(arte => (
                                        <Box key={arte.id} sx={{ p: 1.25, borderRadius: '8px', border: `1px solid ${selectedIds.includes(arte.id) ? tom(cores.primaria, 0.5) : cores.borda}`, bgcolor: 'rgba(0,0,0,0.25)' }}>
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
                                <Secao>Gráficos, Formas e Contornos</Secao>
                                <Grid container spacing={1}>
                                    <Grid item xs={6}><BotaoAdicionar icone={ShapeIcon} rotulo="Formas / Tarjas" onClick={() => addElement('shape')} /></Grid>
                                    <Grid item xs={6}><BotaoAdicionar icone={CircleIcon} rotulo="Círculo / Selo" onClick={() => addElement('circle')} /></Grid>
                                    <Grid item xs={6}><BotaoAdicionar icone={LineIcon} rotulo="Linha divisória" onClick={() => addElement('line')} /></Grid>
                                    <Grid item xs={6}><BotaoAdicionar icone={IconeShapeIcon} rotulo="Ícones / Símbolos" onClick={() => addElement('icone')} /></Grid>
                                    <Grid item xs={6}><BotaoAdicionar icone={ImageIcon} rotulo="Logo / Imagem" onClick={() => addElement('image')} /></Grid>
                                    <Grid item xs={6}><BotaoAdicionar icone={ArteIcon} rotulo="Arte do evento" onClick={() => fileArteInputRef.current?.click()} /></Grid>
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
                                                bgcolor: sel ? (isMulti ? 'rgba(0, 255, 136, 0.12)' : tom(cores.primaria, 0.12)) : 'rgba(0,0,0,0.2)',
                                                border: `1px solid ${sel ? (isMulti ? 'rgba(0,255,136,0.6)' : tom(cores.primaria, 0.6)) : cores.borda}`,
                                                borderLeft: el.groupId ? `3px solid ${cores.sucesso}` : undefined,
                                                opacity: el.oculto ? 0.5 : 1,
                                                '&:hover': { bgcolor: tom(cores.primaria, 0.08) }
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

                {/* ===== CENTRO: BARRA DE FERRAMENTAS + PRANCHETA GRÁFICA ===== */}
                <GlassCard sx={{ display: 'flex', flexDirection: 'column', height: alturaPainel, minHeight: { xs: 620, lg: 560 } }}>
                    {/* Linha 1: ferramentas gráficas */}
                    <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1, px: 2, py: 1.25, borderBottom: `1px solid ${cores.borda}` }}>
                        <Typography sx={{ fontSize: '0.875rem', fontWeight: 700, color: cores.textoForte, fontFamily: '"Space Grotesk", sans-serif', mr: 1 }}>
                            {config.width} × {config.height} mm
                        </Typography>
                        
                        <BotaoFerramenta titulo={showRulers ? 'Ocultar réguas milimétricas' : 'Mostrar réguas milimétricas'} onClick={() => setShowRulers(v => !v)} ativo={showRulers}>
                            <RulerIcon fontSize="small" />
                        </BotaoFerramenta>
                        <BotaoFerramenta titulo={showGuides ? 'Ocultar linhas guias de proporção' : 'Mostrar linhas guias de proporção'} onClick={() => setShowGuides(v => !v)} ativo={showGuides}>
                            <SafeMarginIcon fontSize="small" />
                        </BotaoFerramenta>
                        <BotaoFerramenta titulo={showGrid ? 'Esconder grade' : 'Mostrar grade'} onClick={() => setShowGrid(v => !v)} ativo={showGrid}>
                            {showGrid ? <GridOnIcon fontSize="small" /> : <GridOffIcon fontSize="small" />}
                        </BotaoFerramenta>
                        <BotaoFerramenta titulo={snapToGrid ? 'Ímã de grade ativado (encaixe magnético)' : 'Ímã de grade desligado (arraste livre e suave)'} onClick={() => setSnapToGrid(v => !v)} ativo={snapToGrid} cor={cores.sucesso}>
                            <ImaIcon fontSize="small" />
                        </BotaoFerramenta>

                        <Box sx={{ flex: 1 }} />

                        <BotaoFerramenta titulo="Diminuir zoom" onClick={() => mudarZoom(-0.1)}><ZoomOutIcon fontSize="small" /></BotaoFerramenta>
                        <Typography sx={{ fontSize: '0.8125rem', color: cores.primaria, fontWeight: 700, minWidth: 44, textAlign: 'center' }}>
                            {Math.round(zoom * 100)}%
                        </Typography>
                        <BotaoFerramenta titulo="Aumentar zoom" onClick={() => mudarZoom(0.1)}><ZoomInIcon fontSize="small" /></BotaoFerramenta>
                        <BotaoFerramenta titulo="Ajustar à tela" onClick={ajustarATela}><FitIcon fontSize="small" /></BotaoFerramenta>
                    </Box>

                    {/* Linha 2: ações de contexto da seleção */}
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
                        <BotaoFerramenta titulo="Trazer para frente" onClick={() => reordenar('frente')} disabled={!selecionados.length}><FrenteIcon fontSize="small" /></BotaoFerramenta>
                        <BotaoFerramenta titulo="Enviar para trás" onClick={() => reordenar('tras')} disabled={!selecionados.length}><TrasIcon fontSize="small" /></BotaoFerramenta>
                        <Divider orientation="vertical" flexItem sx={{ borderColor: cores.borda, mx: 0.5 }} />
                        <BotaoFerramenta titulo="Excluir (Delete)" onClick={excluirSelecionados} disabled={!selecionados.length} cor={cores.erro}><DeleteIcon fontSize="small" /></BotaoFerramenta>
                    </Box>

                    {/* Mesa de trabalho / Prancheta */}
                    <Box
                        ref={workspaceRef}
                        onMouseDown={handleWorkspaceMouseDown}
                        onDoubleClick={handleWorkspaceDoubleClick}
                        onMouseMove={handleWorkspaceMouseMove}
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
                        <Box sx={{ m: 'auto', p: showRulers ? 6 : 4, flexShrink: 0, position: 'relative' }}>
                            <Box sx={{ position: 'relative', pt: showRulers ? '24px' : 0, pl: showRulers ? '24px' : 0 }}>
                                {showRulers && (
                                    <ReguaEditor
                                        larguraMm={Number(config.width) || 100}
                                        alturaMm={Number(config.height) || 150}
                                        escala={ESCALA}
                                        zoom={zoom}
                                        cursorX={cursorCoords.x}
                                        cursorY={cursorCoords.y}
                                        tamanhoRegua={22}
                                    />
                                )}

                                <Box sx={{ width: canvasWidth * zoom, height: canvasHeight * zoom, position: 'relative' }}>
                                    <Box sx={{ position: 'absolute', top: 0, left: 0, width: canvasWidth, height: canvasHeight, transform: `scale(${zoom})`, transformOrigin: '0 0' }}>
                                        <Paper
                                            ref={paperRef}
                                            elevation={0}
                                            sx={{
                                                width: canvasWidth,
                                                height: canvasHeight,
                                                backgroundColor: config.corFundo || cores.textoForte,
                                                backgroundImage: 'none',
                                                position: 'relative',
                                                borderRadius: config.layout?.includes('cr80') ? '12px' : '4px',
                                                boxShadow: '0 12px 40px rgba(0,0,0,0.8), 0 0 0 1px rgba(0, 212, 255, 0.25)',
                                                '& .etq-el:hover': { outline: '1px solid rgba(0, 212, 255, 0.8)' }
                                            }}
                                        >
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
                                                            zIndex: isSel ? (Z_BASE + 900) : (el.zIndex || Z_BASE),
                                                            outline,
                                                            cursor: el.locked ? 'default' : 'move'
                                                        }}
                                                    >
                                                        <Box
                                                            sx={{
                                                                width: '100%', height: '100%', overflow: 'hidden', pointerEvents: 'none',
                                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                borderRadius: el.borderRadius && el.type !== 'circle' ? `${el.borderRadius}px` : 0,
                                                                opacity: el.opacity ?? 1
                                                            }}
                                                        >
                                                            <ElementoVisual el={el} dados={dadosVisualizacao} />
                                                        </Box>
                                                    </Rnd>
                                                );
                                            })}
                                        </Paper>

                                        {/* Sobreposição: Grade e Linhas Guias de Proporções Reais */}
                                        <Box sx={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5000 }}>
                                            {showGrid && (
                                                <Box sx={{
                                                    position: 'absolute', inset: 0,
                                                    pointerEvents: 'none',
                                                    backgroundImage: `
                                                        linear-gradient(to right, ${corGrade(gridIntensity)} 1px, transparent 1px),
                                                        linear-gradient(to bottom, ${corGrade(gridIntensity)} 1px, transparent 1px),
                                                        linear-gradient(to right, ${corGrade(gridIntensity * 0.45)} 1px, transparent 1px),
                                                        linear-gradient(to bottom, ${corGrade(gridIntensity * 0.45)} 1px, transparent 1px)
                                                    `,
                                                    backgroundSize: `${passoMaior}px ${passoMaior}px, ${passoMaior}px ${passoMaior}px, ${gridSize}px ${gridSize}px, ${gridSize}px ${gridSize}px`
                                                }} />
                                            )}

                                            {/* Linhas guias gráficas de proporção e margem de segurança */}
                                            {showGuides && (
                                                <>
                                                    <Box sx={{
                                                        position: 'absolute',
                                                        top: 9, left: 9, right: 9, bottom: 9,
                                                        border: '1px dashed rgba(0, 212, 255, 0.4)',
                                                        pointerEvents: 'none'
                                                    }} />
                                                    <Box sx={{ position: 'absolute', top: 0, bottom: 0, left: canvasWidth / 2, borderLeft: '1px dashed rgba(255, 0, 119, 0.45)' }} />
                                                    <Box sx={{ position: 'absolute', left: 0, right: 0, top: canvasHeight / 2, borderTop: '1px dashed rgba(255, 0, 119, 0.45)' }} />
                                                </>
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
                        </Box>

                        {marquee && (
                            <Box sx={{
                                position: 'absolute',
                                left: marquee.left,
                                top: marquee.top,
                                width: marquee.width,
                                height: marquee.height,
                                border: '1px solid #00D4FF',
                                bgcolor: tom(cores.primaria, 0.12),
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

            {/* Modal de Modelos Pré-Prontos */}
            <Dialog
                open={modalModelosAberto}
                onClose={() => setModalModelosAberto(false)}
                maxWidth="md"
                fullWidth
                PaperProps={{
                    sx: {
                        bgcolor: cores.superficie,
                        border: '1px solid rgba(0, 212, 255, 0.3)',
                        borderRadius: 1.5
                    }
                }}
            >
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, borderBottom: `1px solid ${cores.borda}` }}>
                    <TemplateIcon sx={{ color: cores.primaria }} />
                    <Box>
                        <Typography variant="h6" fontWeight={700} color={cores.textoForte}>
                            Galeria de Modelos de Crachás e Credenciais
                        </Typography>
                        <Typography variant="caption" color={cores.textoSecundario}>
                            Escolha um modelo do sistema ou carregue um de seus layouts salvos.
                        </Typography>
                    </Box>
                </DialogTitle>
                <DialogContent sx={{ py: 3 }}>
                    {/* Seção Modelos Personalizados */}
                    {modelosCustomizados.length > 0 && (
                        <Box sx={{ mb: 3 }}>
                            <Secao sx={{ mb: 1.5 }}>Meus Modelos Salvos ({modelosCustomizados.length})</Secao>
                            <Grid container spacing={2}>
                                {modelosCustomizados.map(m => (
                                    <Grid item xs={12} sm={6} md={4} key={m.id}>
                                        <Card sx={{
                                            bgcolor: 'rgba(0, 255, 136, 0.05)',
                                            border: '1px solid rgba(0, 255, 136, 0.3)',
                                            borderRadius: '8px',
                                            transition: '0.2s',
                                            position: 'relative',
                                            '&:hover': { borderColor: cores.sucesso, transform: 'translateY(-2px)' }
                                        }}>
                                            <CardActionArea onClick={() => aplicarModelo(m)} sx={{ p: 2 }}>
                                                <CardContent sx={{ p: 0 }}>
                                                    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                                                        <Chip size="small" label="Personalizado" sx={{ bgcolor: 'rgba(0, 255, 136, 0.15)', color: cores.sucesso, fontWeight: 700 }} />
                                                        <Tooltip title="Excluir modelo">
                                                            <IconButton size="small" onClick={(e) => handleExcluirModeloCustom(m.id, e)} sx={{ color: cores.erro, p: 0.5 }}>
                                                                <DeleteIcon fontSize="small" />
                                                            </IconButton>
                                                        </Tooltip>
                                                    </Stack>
                                                    <Typography variant="subtitle1" fontWeight={700} color={cores.textoForte}>
                                                        {m.nome}
                                                    </Typography>
                                                    <Typography variant="body2" color={cores.textoSecundario} sx={{ fontSize: '0.8rem', mt: 0.5 }}>
                                                        {m.descricao || `${m.papel_config.width} × ${m.papel_config.height} mm`}
                                                    </Typography>
                                                </CardContent>
                                            </CardActionArea>
                                        </Card>
                                    </Grid>
                                ))}
                            </Grid>
                            <Divider sx={{ my: 3, borderColor: cores.borda }} />
                        </Box>
                    )}

                    {/* Modelos Padrão do Sistema */}
                    <Secao sx={{ mb: 1.5 }}>Modelos Padrão do Sistema</Secao>
                    <Grid container spacing={2}>
                        {MODELOS_SISTEMA.map(m => (
                            <Grid item xs={12} sm={6} md={4} key={m.id}>
                                <Card sx={{
                                    bgcolor: 'rgba(0,0,0,0.3)',
                                    border: `1px solid ${cores.borda}`,
                                    borderRadius: '8px',
                                    transition: '0.2s',
                                    '&:hover': { borderColor: cores.primaria, transform: 'translateY(-2px)' }
                                }}>
                                    <CardActionArea onClick={() => aplicarModelo(m)} sx={{ p: 2 }}>
                                        <CardContent sx={{ p: 0 }}>
                                            <Chip size="small" label={`${m.papel_config.width} × ${m.papel_config.height} mm`} sx={{ bgcolor: tom(cores.primaria, 0.15), color: cores.primaria, fontWeight: 700, mb: 1.5 }} />
                                            <Typography variant="subtitle1" fontWeight={700} color={cores.textoForte} gutterBottom>
                                                {m.nome}
                                            </Typography>
                                            <Typography variant="body2" color={cores.textoSecundario} sx={{ fontSize: '0.8rem', lineHeight: 1.4 }}>
                                                {m.descricao}
                                            </Typography>
                                        </CardContent>
                                    </CardActionArea>
                                </Card>
                            </Grid>
                        ))}
                    </Grid>
                </DialogContent>
                <DialogActions sx={{ p: 2, borderTop: `1px solid ${cores.borda}` }}>
                    <Button onClick={() => setModalModelosAberto(false)} sx={{ color: cores.textoSecundario }}>
                        Fechar
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Modal Salvar como Modelo Personalizado */}
            <Dialog
                open={modalSalvarModeloAberto}
                onClose={() => setModalSalvarModeloAberto(false)}
                maxWidth="xs"
                fullWidth
                PaperProps={{
                    sx: {
                        bgcolor: cores.superficie,
                        border: '1px solid rgba(0, 255, 136, 0.4)',
                        borderRadius: 1.5
                    }
                }}
            >
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, borderBottom: `1px solid ${cores.borda}` }}>
                    <BookmarkAddIcon sx={{ color: cores.sucesso }} />
                    <Typography variant="h6" fontWeight={700} color={cores.textoForte}>
                        Salvar como Modelo Pronto
                    </Typography>
                </DialogTitle>
                <DialogContent sx={{ py: 2.5 }}>
                    <Stack spacing={2}>
                        <Typography variant="body2" color={cores.textoSecundario}>
                            Este modelo ficará disponível na sua galeria para você criar crachás e etiquetas rapidamente a qualquer momento.
                        </Typography>
                        <TextField
                            label="Nome do Modelo"
                            fullWidth
                            size="small"
                            placeholder="Ex: Meu Crachá Padrão Empresa"
                            value={nomeNovoModelo}
                            onChange={(e) => setNomeNovoModelo(e.target.value)}
                            autoFocus
                        />
                        <TextField
                            label="Descrição (opcional)"
                            fullWidth
                            size="small"
                            placeholder="Ex: Modelo com tarja superior e QR code para eventos 2026"
                            value={descNovoModelo}
                            onChange={(e) => setDescNovoModelo(e.target.value)}
                        />
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ p: 2, borderTop: `1px solid ${cores.borda}`, gap: 1 }}>
                    <Button onClick={() => setModalSalvarModeloAberto(false)} sx={{ color: cores.textoSecundario }}>
                        Cancelar
                    </Button>
                    <Button
                        variant="contained"
                        onClick={handleSalvarComoModelo}
                        sx={{ bgcolor: cores.sucesso, color: '#000', fontWeight: 700, '&:hover': { bgcolor: '#00cc6a' } }}
                    >
                        Salvar Modelo
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default ConfigEtiquetas;
