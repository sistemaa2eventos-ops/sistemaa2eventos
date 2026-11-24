import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    Checkbox,
    Chip,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    FormControl,
    FormControlLabel,
    Grid,
    IconButton,
    InputLabel,
    LinearProgress,
    MenuItem,
    Radio,
    RadioGroup,
    Select,
    Slider,
    Stack,
    TextField,
    Tooltip,
    Typography
} from '@mui/material';
import {
    Add as AddIcon,
    ZoomIn as ZoomInIcon,
    ZoomOut as ZoomOutIcon,
    PanTool as MaoIcon,
    CenterFocusStrong as AjustarTelaIcon,
    Straighten as ReguaIcon,
    Delete as ExcluirIcon,
    RotateRight as GirarIcon,
    Layers as CamadaIcon,
    CheckCircle as AprovarIcon,
    Cancel as RejeitarIcon,
    Download as ExportarIcon,
    FolderOpen as ProjetoIcon,
    UploadFile as ArquivoIcon,
    Visibility as OlhoAbertoIcon,
    VisibilityOff as OlhoFechadoIcon,
    Polyline as PoligonoIcon,
    CropSquare as RetanguloIcon,
    NearMe as CursorIcon,
    EventNote as PlanoFasesIcon,
    Edit as EditarIcon,
    OpenInBrowser as UsarNaPlantaIcon
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import GlassCard from '../common/GlassCard';
import NeonButton from '../common/NeonButton';
import TituloModal from '../common/TituloModal';
import api from '../../services/api';
import { acaoTabela, acaoTabelaPerigo, botaoSecundario, cores, funcao, tamanhos, tom } from '../../styles/tokens';
import {
    FASES_OPERACIONAIS,
    ROTULO_PRIORIDADE,
    ROTULO_SAUDE_PRAZO,
    ROTULO_STATUS_TAREFA,
    formatarDataHoraCurta,
    obterInfoFase,
    obterNomeArea
} from './producaoHelpers';
import {
    inspecionarArquivoArquitetura,
    renderizarPaginaPdfParaImagem
} from './plantaImportador';

const BIBLIOTECA_BLOCOS = [
    { tipo: 'palco', rotulo: 'Palco', largura: 160, altura: 90, cor: '#00D4FF' },
    { tipo: 'tenda', rotulo: 'Tenda', largura: 110, altura: 80, cor: '#00FF88' },
    { tipo: 'bar', rotulo: 'Bar e A e B', largura: 130, altura: 60, cor: '#00FF88' },
    { tipo: 'gerador', rotulo: 'Gerador', largura: 75, altura: 50, cor: '#FFB800' },
    { tipo: 'camarim', rotulo: 'Camarim', largura: 95, altura: 65, cor: '#A855F7' },
    { tipo: 'portaria', rotulo: 'Portaria', largura: 110, altura: 50, cor: '#FF8800' },
    { tipo: 'banheiro', rotulo: 'Banheiro', largura: 65, altura: 45, cor: '#94A3B8' },
    { tipo: 'som', rotulo: 'Torre de som', largura: 48, altura: 48, cor: '#33DDFF' },
    { tipo: 'luz', rotulo: 'Ponto de luz', largura: 36, altura: 36, cor: '#A855F7' },
    { tipo: 'grade', rotulo: 'Grade', largura: 110, altura: 18, cor: '#CBD5E1' },
    { tipo: 'extintor', rotulo: 'Extintor', largura: 28, altura: 28, cor: '#FF3366' },
    { tipo: 'texto', rotulo: 'Personalizado', largura: 120, altura: 44, cor: '#FFFFFF' }
];

function pontoDentroPoligono(pt, poligono = []) {
    if (!Array.isArray(poligono) || poligono.length < 3) return false;
    let dentro = false;
    for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
        const xi = Number(poligono[i].x);
        const yi = Number(poligono[i].y);
        const xj = Number(poligono[j].x);
        const yj = Number(poligono[j].y);
        const intersect = ((yi > pt.y) !== (yj > pt.y))
            && (pt.x < ((xj - xi) * (pt.y - yi)) / ((yj - yi) || 0.00001) + xi);
        if (intersect) dentro = !dentro;
    }
    return dentro;
}

const AbaProjetosPlantas = ({ resumo, headersExtra, aoAtualizar, apiClient }) => {
    const httpClient = apiClient || api;
    const { enqueueSnackbar } = useSnackbar();
    const svgRef = useRef(null);
    const viewportRef = useRef(null);
    const panningRef = useRef(null);
    const zoomRef = useRef(1);
    const viewOffsetRef = useRef({ x: 0, y: 0 });

    const areas = useMemo(() => resumo?.areas || [], [resumo?.areas]);
    const projetos = useMemo(() => resumo?.projetos || [], [resumo?.projetos]);
    const plantas = useMemo(() => resumo?.plantas || [], [resumo?.plantas]);
    const propostas = useMemo(() => resumo?.propostas_planta || [], [resumo?.propostas_planta]);
    const tarefas = useMemo(() => resumo?.tarefas || [], [resumo?.tarefas]);
    const ctx = resumo?.contexto_usuario || {};

    const [plantaSelecionadaId, setPlantaSelecionadaId] = useState('');
    const planta = useMemo(
        () => plantas.find((p) => p.id === plantaSelecionadaId) || plantas[0] || null,
        [plantas, plantaSelecionadaId]
    );

    const versoesOrdenadas = useMemo(
        () => [...(planta?.versoes || [])].sort((a, b) => b.numero_versao - a.numero_versao),
        [planta]
    );
    const versaoOficial = versoesOrdenadas.find((v) => v.eh_oficial) || versoesOrdenadas[0] || null;

    const [versaoSelecionadaId, setVersaoSelecionadaId] = useState('');
    const versaoExibida = versoesOrdenadas.find((v) => v.id === versaoSelecionadaId) || versaoOficial;

    const larguraCanvas = Math.max(400, Number(planta?.largura_px || 840));
    const alturaCanvas = Math.max(300, Number(planta?.altura_px || 500));

    // Controle de desenho base e camadas visíveis
    const [exibirBase, setExibirBase] = useState(true);
    const [opacidadeBase, setOpacidadeBase] = useState(0.92);
    const [camadasEstadoLocal, setCamadasEstadoLocal] = useState({});
    const [exibirSetores, setExibirSetores] = useState(true);

    // Editor interativo e ferramentas de mapeamento sobre a planta
    const [modoEdicao, setModoEdicao] = useState(false);
    const [ferramentaCanvas, setFerramentaCanvas] = useState('selecionar'); // 'selecionar' | 'poligono' | 'retangulo' | 'regua'
    const [elementosRascunho, setElementosRascunho] = useState(null);
    const [elementoSelecionadoId, setElementoSelecionadoId] = useState(null);
    const [setorSelecionadoId, setSetorSelecionadoId] = useState(null);
    const [arrastandoId, setArrastandoId] = useState(null);
    const [offsetArrasto, setOffsetArrasto] = useState({ dx: 0, dy: 0 });
    const [zoom, setZoom] = useState(1);
    const [viewOffset, setViewOffset] = useState({ x: 0, y: 0 });
    const [estaArrastandoMapa, setEstaArrastandoMapa] = useState(false);
    const [espacoPressionado, setEspacoPressionado] = useState(false);

    useEffect(() => {
        zoomRef.current = zoom;
    }, [zoom]);

    useEffect(() => {
        viewOffsetRef.current = viewOffset;
    }, [viewOffset]);

    useEffect(() => {
        setZoom(1);
        setViewOffset({ x: 0, y: 0 });
    }, [planta?.id]);

    // Atalho de teclado: segurar Espaço ativa a mãozinha temporariamente (padrão CAD/Figma)
    useEffect(() => {
        const onKeyDown = (e) => {
            if (e.code === 'Space' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName)) {
                setEspacoPressionado(true);
            }
        };
        const onKeyUp = (e) => {
            if (e.code === 'Space') setEspacoPressionado(false);
        };
        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);
        return () => {
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('keyup', onKeyUp);
        };
    }, []);

    // Zoom suave pela rodinha do mouse centrado exatamente sob o cursor (sem rolar a página)
    useEffect(() => {
        const el = viewportRef.current;
        if (!el) return undefined;

        const onWheel = (e) => {
            e.preventDefault();
            const svg = svgRef.current;
            if (!svg) return;

            const zoomAtual = zoomRef.current;
            const fator = e.deltaY < 0 ? 1.15 : 1 / 1.15;
            const zoomNovo = Math.min(10, Math.max(0.35, Number((zoomAtual * fator).toFixed(3))));
            if (zoomNovo === zoomAtual) return;

            const ctm = svg.getScreenCTM();
            const offsetAtual = viewOffsetRef.current;
            if (ctm) {
                const pt = svg.createSVGPoint();
                pt.x = e.clientX;
                pt.y = e.clientY;
                const local = pt.matrixTransform(ctm.inverse());
                const proporcao = zoomAtual / zoomNovo;
                setViewOffset({
                    x: local.x - (local.x - offsetAtual.x) * proporcao,
                    y: local.y - (local.y - offsetAtual.y) * proporcao
                });
            }
            setZoom(zoomNovo);
        };

        el.addEventListener('wheel', onWheel, { passive: false });
        return () => el.removeEventListener('wheel', onWheel);
    }, [planta?.id]);

    const ajustarZoomNoCentro = (novoZoomBruto) => {
        const zoomAtual = zoomRef.current;
        const zoomNovo = Math.min(10, Math.max(0.35, Number(novoZoomBruto.toFixed(2))));
        if (zoomNovo === zoomAtual) return;
        const offsetAtual = viewOffsetRef.current;
        const centroX = offsetAtual.x + (larguraCanvas / zoomAtual) / 2;
        const centroY = offsetAtual.y + (alturaCanvas / zoomAtual) / 2;
        setZoom(zoomNovo);
        setViewOffset({
            x: centroX - (larguraCanvas / zoomNovo) / 2,
            y: centroY - (alturaCanvas / zoomNovo) / 2
        });
    };

    const resetarZoomEPan = () => {
        setZoom(1);
        setViewOffset({ x: 0, y: 0 });
    };

    // Desenho direto de setor (polígono / retângulo)
    const [pontosPoligono, setPontosPoligono] = useState([]);
    const [retanguloInicio, setRetanguloInicio] = useState(null);
    const [retanguloAtual, setRetanguloAtual] = useState(null);

    // Filtro visual das fases sobre o desenho
    const [filtroFaseCanvas, setFiltroFaseCanvas] = useState('todas'); // 'todas' | 'montagem' | 'evento' | 'desmontagem'
    const [faseInspetor, setFaseInspetor] = useState('montagem');

    // Calibração de escala métrica (régua)
    const [pontosRegua, setPontosRegua] = useState([]);
    const [modalEscalaInfo, setModalEscalaInfo] = useState(null); // { distPx, metros }
    const [pxPorMetro, setPxPorMetro] = useState(Number(planta?.escala_pixels_por_metro || 15));

    useEffect(() => {
        if (planta?.escala_pixels_por_metro) {
            setPxPorMetro(Number(planta.escala_pixels_por_metro));
        }
    }, [planta?.id, planta?.escala_pixels_por_metro]);

    // Revisão / Diff de proposta
    const [propostaRevisaoId, setPropostaRevisaoId] = useState('');
    const [parecerArquiteto, setParecerArquiteto] = useState('');

    // Modal Importação de Projeto / Camadas (PDF, PNG, JPG, SVG)
    const [modalImportarAberto, setModalImportarAberto] = useState(false);
    const [processandoArquivo, setProcessandoArquivo] = useState(false);
    const [arquivoInspecionado, setArquivoInspecionado] = useState(null);
    const [formImportar, setFormImportar] = useState({
        destino: 'base_atual', // 'base_atual' | 'camada_atual' | 'nova_prancha'
        nomeCamada: '',
        tituloPrancha: '',
        area_id: '',
        opacidade: 0.85,
        paginaPdf: 1,
        fundoTransparente: false,
        importarTodasPaginasPdf: false,
        importarCamadasSvg: true
    });

    // Modais de setor, proposta, projeto e etapas/fases
    const [modalPropostaAberto, setModalPropostaAberto] = useState(false);
    const [formProposta, setFormProposta] = useState({ titulo: '', justificativa: '', tarefa_id: '' });

    const [modalSetorAberto, setModalSetorAberto] = useState(false);
    const [setorEditandoId, setSetorEditandoId] = useState(null);
    const [formSetor, setFormSetor] = useState({
        nome: '',
        area_id: '',
        cor_hex: '#00D4FF',
        responsavel_nome: '',
        x: 160,
        y: 120,
        largura: 220,
        altura: 150,
        poligono_coordenadas: null
    });

    const [modalProjetoAberto, setModalProjetoAberto] = useState(false);
    const [formProjeto, setFormProjeto] = useState({
        titulo: '',
        categoria: 'arquitetura',
        area_id: '',
        descricao: '',
        nome_arquivo: '',
        url_arquivo: null,
        tamanho_bytes: 0,
        largura_px: null,
        altura_px: null
    });

    const [modalNovaVersaoArq, setModalNovaVersaoArq] = useState(null); // { projetoId, projetoTitulo, nome_original, observacao, url_arquivo, tamanho_bytes, largura_px, altura_px }

    const [modalTarefaItemAberto, setModalTarefaItemAberto] = useState(false);
    const [formTarefaItem, setFormTarefaItem] = useState({
        titulo: '',
        fase_operacional: 'montagem',
        area_id: '',
        setor_id: '',
        elemento_planta_id: '',
        elemento_planta_rotulo: '',
        prioridade: 'alta',
        objetivo: '',
        etapas_texto: 'Conferir marcação na planta\nExecutar instalação técnica\nRegistrar foto final de evidência',
        data_inicio_planejada: new Date().toISOString().slice(0, 16),
        data_fim_planejada: new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 16)
    });

    const [salvando, setSalvando] = useState(false);

    const elementosAtivos = useMemo(
        () => (modoEdicao && elementosRascunho ? elementosRascunho : (versaoExibida?.elementos_json || [])),
        [modoEdicao, elementosRascunho, versaoExibida]
    );

    const setoresAtivos = useMemo(() => versaoExibida?.setores || [], [versaoExibida]);
    const camadasAtivas = useMemo(() => versaoExibida?.camadas_arquitetura || [], [versaoExibida]);

    const elementoSelecionado = useMemo(
        () => elementosAtivos.find((e) => e.id === elementoSelecionadoId) || null,
        [elementosAtivos, elementoSelecionadoId]
    );

    const setorSelecionado = useMemo(
        () => setoresAtivos.find((s) => s.id === setorSelecionadoId) || null,
        [setoresAtivos, setorSelecionadoId]
    );

    const propostaEmRevisao = useMemo(
        () => propostas.find((p) => p.id === propostaRevisaoId) || null,
        [propostas, propostaRevisaoId]
    );

    const podeAprovarPlanta = ['admin_master', 'master', 'arquiteto_evento', 'produtor_geral'].includes(ctx.papel_producao);
    const podePublicarOficial = ['admin_master', 'master', 'arquiteto_evento'].includes(ctx.papel_producao);

    // Calcula resumo das tarefas por elemento para exibir badges de status direto na planta
    const resumoTarefasPorElemento = useMemo(() => {
        const mapa = new Map();
        for (const t of tarefas) {
            if (!t.elemento_planta_id) continue;
            if (filtroFaseCanvas !== 'todas' && (t.fase_operacional || 'montagem') !== filtroFaseCanvas) continue;
            if (!mapa.has(t.elemento_planta_id)) mapa.set(t.elemento_planta_id, []);
            mapa.get(t.elemento_planta_id).push(t);
        }
        return mapa;
    }, [tarefas, filtroFaseCanvas]);

    // Tarefas vinculadas ao elemento ou setor atualmente selecionado no inspetor
    const tarefasDoItemSelecionado = useMemo(() => {
        if (elementoSelecionado) {
            return tarefas.filter((t) =>
                t.elemento_planta_id === elementoSelecionado.id
                || (t.elemento_planta_rotulo && t.elemento_planta_rotulo === elementoSelecionado.rotulo)
            );
        }
        if (setorSelecionado) {
            return tarefas.filter((t) => t.setor_id === setorSelecionado.id);
        }
        return [];
    }, [tarefas, elementoSelecionado, setorSelecionado]);

    const tarefasPorFaseItem = useMemo(() => {
        const grupo = { montagem: [], evento: [], desmontagem: [] };
        for (const t of tarefasDoItemSelecionado) {
            const f = t.fase_operacional || 'montagem';
            if (grupo[f]) grupo[f].push(t);
        }
        return grupo;
    }, [tarefasDoItemSelecionado]);

    const detectarSetorDoElemento = (el) => {
        if (!el) return null;
        const cx = el.x + (el.largura || 0) / 2;
        const cy = el.y + (el.altura || 0) / 2;
        return setoresAtivos.find((s) => pontoDentroPoligono({ x: cx, y: cy }, s.poligono_coordenadas)) || null;
    };

    const converterPontoSvg = (evt) => {
        const svg = svgRef.current;
        if (!svg) return { x: 0, y: 0 };
        const ctm = svg.getScreenCTM();
        if (ctm) {
            const pt = svg.createSVGPoint();
            pt.x = evt.clientX;
            pt.y = evt.clientY;
            const local = pt.matrixTransform(ctm.inverse());
            return {
                x: Math.max(0, Math.min(larguraCanvas, Math.round(local.x))),
                y: Math.max(0, Math.min(alturaCanvas, Math.round(local.y)))
            };
        }
        const rect = svg.getBoundingClientRect();
        const vbW = larguraCanvas / zoom;
        const vbH = alturaCanvas / zoom;
        return {
            x: Math.max(0, Math.min(larguraCanvas, Math.round(viewOffset.x + ((evt.clientX - rect.left) / rect.width) * vbW))),
            y: Math.max(0, Math.min(alturaCanvas, Math.round(viewOffset.y + ((evt.clientY - rect.top) / rect.height) * vbH)))
        };
    };

    const iniciarIntervencao = () => {
        setElementosRascunho(JSON.parse(JSON.stringify(versaoOficial?.elementos_json || [])));
        setModoEdicao(true);
        setPropostaRevisaoId('');
        enqueueSnackbar('Modo de edição ativado. Posicione blocos sobre o desenho do arquiteto.', { variant: 'info' });
    };

    const adicionarBloco = (modelo) => {
        if (!modoEdicao) {
            setElementosRascunho(JSON.parse(JSON.stringify(versaoOficial?.elementos_json || [])));
            setModoEdicao(true);
            setPropostaRevisaoId('');
        }
        const novo = {
            id: `blk-${Date.now().toString(36)}`,
            tipo: modelo.tipo,
            rotulo: modelo.rotulo,
            x: Math.round(larguraCanvas / 2 - modelo.largura / 2),
            y: Math.round(alturaCanvas / 2 - modelo.altura / 2),
            largura: modelo.largura,
            altura: modelo.altura,
            rotacao: 0,
            cor: modelo.cor,
            texto: ''
        };
        setElementosRascunho((prev) => [...(prev || versaoOficial?.elementos_json || []), novo]);
        setElementoSelecionadoId(novo.id);
        setSetorSelecionadoId(null);
        setFerramentaCanvas('selecionar');
    };

    const atualizarElementoSelecionado = (campos) => {
        if (!modoEdicao || !elementoSelecionadoId) return;
        setElementosRascunho((prev) =>
            (prev || []).map((el) => (el.id === elementoSelecionadoId ? { ...el, ...campos } : el))
        );
    };

    const removerElementoSelecionado = () => {
        if (!modoEdicao || !elementoSelecionadoId) return;
        setElementosRascunho((prev) => (prev || []).filter((el) => el.id !== elementoSelecionadoId));
        setElementoSelecionadoId(null);
    };

    // Eventos de mouse/ponteiro sobre o canvas do projeto
    const handlePointerDownCanvas = (evt) => {
        // Botão do meio (scroll pressionado), ferramenta mãozinha ou Espaço + botão esquerdo: arrasta a planta
        if (evt.button === 1 || ferramentaCanvas === 'pan' || (espacoPressionado && evt.button === 0)) {
            evt.preventDefault();
            panningRef.current = {
                ativo: true,
                pointerId: evt.pointerId,
                startClientX: evt.clientX,
                startClientY: evt.clientY,
                startOffsetX: viewOffsetRef.current.x,
                startOffsetY: viewOffsetRef.current.y
            };
            setEstaArrastandoMapa(true);
            try {
                evt.currentTarget.setPointerCapture(evt.pointerId);
            } catch {
                // Ignora se o navegador não suportar capture para este ponteiro
            }
            return;
        }

        const pt = converterPontoSvg(evt);

        if (ferramentaCanvas === 'regua') {
            if (pontosRegua.length === 0 || pontosRegua.length >= 2) {
                setPontosRegua([pt]);
            } else {
                const p1 = pontosRegua[0];
                const distPx = Math.hypot(pt.x - p1.x, pt.y - p1.y);
                setPontosRegua([p1, pt]);
                setModalEscalaInfo({ distPx: Math.round(distPx), metros: '10' });
            }
            return;
        }

        if (ferramentaCanvas === 'poligono') {
            setPontosPoligono((prev) => [...prev, pt]);
            return;
        }

        if (ferramentaCanvas === 'retangulo') {
            setRetanguloInicio(pt);
            setRetanguloAtual(pt);
        }
    };

    const handlePointerDownElemento = (evt, el) => {
        if (evt.button === 1 || ferramentaCanvas === 'pan' || espacoPressionado) return;
        if (ferramentaCanvas !== 'selecionar') return;
        evt.stopPropagation();
        setElementoSelecionadoId(el.id);
        setSetorSelecionadoId(null);
        if (!modoEdicao) return;
        const pt = converterPontoSvg(evt);
        setArrastandoId(el.id);
        setOffsetArrasto({ dx: pt.x - el.x, dy: pt.y - el.y });
    };

    const handlePointerMoveCanvas = (evt) => {
        if (panningRef.current?.ativo) {
            const svg = svgRef.current;
            if (!svg) return;
            const ctm = svg.getScreenCTM();
            const rect = svg.getBoundingClientRect();
            const escalaX = ctm?.a || (rect.width / (larguraCanvas / zoomRef.current));
            const escalaY = ctm?.d || (rect.height / (alturaCanvas / zoomRef.current));
            const dxSvg = (evt.clientX - panningRef.current.startClientX) / (escalaX || 1);
            const dySvg = (evt.clientY - panningRef.current.startClientY) / (escalaY || 1);
            setViewOffset({
                x: panningRef.current.startOffsetX - dxSvg,
                y: panningRef.current.startOffsetY - dySvg
            });
            return;
        }
        if (ferramentaCanvas === 'retangulo' && retanguloInicio) {
            setRetanguloAtual(converterPontoSvg(evt));
            return;
        }
        if (!arrastandoId || !modoEdicao) return;
        const pt = converterPontoSvg(evt);
        setElementosRascunho((prev) =>
            (prev || []).map((el) =>
                el.id === arrastandoId
                    ? { ...el, x: Math.max(0, Math.round(pt.x - offsetArrasto.dx)), y: Math.max(0, Math.round(pt.y - offsetArrasto.dy)) }
                    : el
            )
        );
    };

    const handlePointerUpCanvas = (evt) => {
        if (panningRef.current?.ativo) {
            try {
                if (evt?.currentTarget?.hasPointerCapture?.(panningRef.current.pointerId)) {
                    evt.currentTarget.releasePointerCapture(panningRef.current.pointerId);
                }
            } catch {
                // Ignora
            }
            panningRef.current = null;
            setEstaArrastandoMapa(false);
            return;
        }
        if (ferramentaCanvas === 'retangulo' && retanguloInicio && retanguloAtual) {
            const x = Math.min(retanguloInicio.x, retanguloAtual.x);
            const y = Math.min(retanguloInicio.y, retanguloAtual.y);
            const w = Math.abs(retanguloAtual.x - retanguloInicio.x);
            const h = Math.abs(retanguloAtual.y - retanguloInicio.y);
            setRetanguloInicio(null);
            setRetanguloAtual(null);
            if (w >= 25 && h >= 25) {
                setSetorEditandoId(null);
                setFormSetor({
                    nome: '',
                    area_id: areas[0]?.id || '',
                    cor_hex: areas[0]?.cor || '#00D4FF',
                    responsavel_nome: '',
                    x,
                    y,
                    largura: w,
                    altura: h,
                    poligono_coordenadas: [
                        { x, y },
                        { x: x + w, y },
                        { x: x + w, y: y + h },
                        { x, y: y + h }
                    ]
                });
                setFerramentaCanvas('selecionar');
                setModalSetorAberto(true);
            }
            return;
        }
        setArrastandoId(null);
    };

    const handleConcluirPoligono = () => {
        if (pontosPoligono.length < 3) {
            enqueueSnackbar('Marque pelo menos 3 pontos sobre o desenho para fechar a área.', { variant: 'warning' });
            return;
        }
        const xs = pontosPoligono.map((p) => p.x);
        const ys = pontosPoligono.map((p) => p.y);
        setSetorEditandoId(null);
        setFormSetor({
            nome: '',
            area_id: areas[0]?.id || '',
            cor_hex: areas[0]?.cor || '#00D4FF',
            responsavel_nome: '',
            x: Math.min(...xs),
            y: Math.min(...ys),
            largura: Math.max(...xs) - Math.min(...xs),
            altura: Math.max(...ys) - Math.min(...ys),
            poligono_coordenadas: pontosPoligono
        });
        setPontosPoligono([]);
        setFerramentaCanvas('selecionar');
        setModalSetorAberto(true);
    };

    // Importação real de PDF / PNG / JPG / SVG
    const abrirModalImportacao = (destinoPadrao = null) => {
        setArquivoInspecionado(null);
        setFormImportar({
            destino: destinoPadrao || (planta ? 'base_atual' : 'nova_prancha'),
            nomeCamada: '',
            tituloPrancha: planta ? `${planta.titulo}` : 'Planta arquitetônica do evento',
            area_id: '',
            opacidade: 0.85,
            paginaPdf: 1,
            fundoTransparente: destinoPadrao === 'camada_atual',
            importarTodasPaginasPdf: false,
            importarCamadasSvg: true
        });
        setModalImportarAberto(true);
    };

    const handleSelecionarArquivoPlanta = async (evt) => {
        const file = evt.target.files?.[0];
        if (!file) return;
        evt.target.value = '';
        try {
            setProcessandoArquivo(true);
            const info = await inspecionarArquivoArquitetura(file);
            setArquivoInspecionado(info);
            setFormImportar((prev) => ({
                ...prev,
                nomeCamada: prev.nomeCamada || info.nomeArquivo.replace(/\.[^.]+$/, ''),
                tituloPrancha: !planta ? info.nomeArquivo.replace(/\.[^.]+$/, '') : prev.tituloPrancha,
                paginaPdf: 1
            }));
        } catch (err) {
            enqueueSnackbar(err.message || 'Erro ao processar arquivo de projeto.', { variant: 'error' });
        } finally {
            setProcessandoArquivo(false);
        }
    };

    const handleTrocarPaginaPdf = async (novaPag, transparente = formImportar.fundoTransparente) => {
        if (!arquivoInspecionado?.file || arquivoInspecionado.tipo !== 'pdf') return;
        try {
            setProcessandoArquivo(true);
            const render = await renderizarPaginaPdfParaImagem(arquivoInspecionado.file, novaPag, {
                maxLargura: 4096,
                transparente
            });
            setArquivoInspecionado((prev) => ({
                ...prev,
                paginaSelecionada: render.numeroPagina,
                imagemUrl: render.imagemUrl,
                largura: render.largura,
                altura: render.altura
            }));
            setFormImportar((prev) => ({ ...prev, paginaPdf: render.numeroPagina }));
        } catch {
            enqueueSnackbar('Falha ao renderizar esta página do PDF.', { variant: 'error' });
        } finally {
            setProcessandoArquivo(false);
        }
    };

    const handleConfirmarImportacao = async () => {
        if (!arquivoInspecionado?.imagemUrl) {
            enqueueSnackbar('Selecione um arquivo PDF, PNG, JPG ou SVG.', { variant: 'warning' });
            return;
        }
        try {
            setSalvando(true);
            let camadasLote = [];

            // Caso 1: PDF multipágina com importação de todas as páginas em camadas
            if (arquivoInspecionado.tipo === 'pdf' && arquivoInspecionado.totalPaginas > 1 && formImportar.importarTodasPaginasPdf) {
                for (let pag = 2; pag <= arquivoInspecionado.totalPaginas; pag++) {
                    const render = await renderizarPaginaPdfParaImagem(arquivoInspecionado.file, pag, {
                        maxLargura: 3000,
                        transparente: true
                    });
                    camadasLote.push({
                        nome: `Página ${pag} • ${arquivoInspecionado.nomeArquivo}`,
                        categoria: 'arquitetura',
                        imagem_url: render.imagemUrl,
                        opacidade: 0.75,
                        nome_arquivo: `${arquivoInspecionado.nomeArquivo}#p${pag}`,
                        area_id: formImportar.area_id || null
                    });
                }
            }

            // Caso 2: SVG com camadas detectadas selecionadas pelo usuário
            if (arquivoInspecionado.tipo === 'svg' && formImportar.importarCamadasSvg && arquivoInspecionado.camadasDetectadas?.length > 0) {
                const selecionadas = arquivoInspecionado.camadasDetectadas.filter((c) => c.selecionada && c.imagemUrl);
                camadasLote = selecionadas.map((c) => ({
                    nome: c.nome,
                    categoria: 'arquitetura',
                    imagem_url: c.imagemUrl,
                    opacidade: 0.9,
                    nome_arquivo: arquivoInspecionado.nomeArquivo,
                    area_id: formImportar.area_id || null
                }));
            }

            if (formImportar.destino === 'nova_prancha' || !planta) {
                const novaPranchaResp = await httpClient.post('/producao/plantas', {
                    titulo: formImportar.tituloPrancha.trim() || arquivoInspecionado.nomeArquivo,
                    largura_px: arquivoInspecionado.largura,
                    altura_px: arquivoInspecionado.altura,
                    escala_pixels_por_metro: pxPorMetro || 15,
                    imagem_fundo_url: arquivoInspecionado.imagemUrl,
                    nome_arquivo_base: arquivoInspecionado.nomeArquivo,
                    camadas_arquitetura: camadasLote
                }, { headers: headersExtra });
                const criada = novaPranchaResp.data?.data;
                if (criada?.id) setPlantaSelecionadaId(criada.id);
                enqueueSnackbar('Nova prancha importada sobre o canvas com sucesso.', { variant: 'success' });
            } else if (formImportar.destino === 'base_atual') {
                await httpClient.post(`/producao/plantas/${planta.id}/camadas`, {
                    definir_como_base: true,
                    imagem_url: arquivoInspecionado.imagemUrl,
                    nome_arquivo: arquivoInspecionado.nomeArquivo,
                    largura_px: arquivoInspecionado.largura,
                    altura_px: arquivoInspecionado.altura,
                    camadas_lote: camadasLote
                }, { headers: headersExtra });
                enqueueSnackbar('Desenho base do arquiteto aplicado à planta.', { variant: 'success' });
            } else {
                await httpClient.post(`/producao/plantas/${planta.id}/camadas`, {
                    definir_como_base: false,
                    nome: formImportar.nomeCamada.trim() || arquivoInspecionado.nomeArquivo,
                    imagem_url: arquivoInspecionado.imagemUrl,
                    nome_arquivo: arquivoInspecionado.nomeArquivo,
                    opacidade: Number(formImportar.opacidade || 0.85),
                    area_id: formImportar.area_id || null,
                    camadas_lote: camadasLote.length > 0 ? camadasLote : undefined
                }, { headers: headersExtra });
                enqueueSnackbar('Camada arquitetônica adicionada com sucesso.', { variant: 'success' });
            }

            setModalImportarAberto(false);
            setArquivoInspecionado(null);
            await aoAtualizar();
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Erro ao importar projeto para a planta.', { variant: 'error' });
        } finally {
            setSalvando(false);
        }
    };

    const handleAlterarCamada = async (camadaId, campos) => {
        setCamadasEstadoLocal((prev) => ({
            ...prev,
            [camadaId]: { ...(prev[camadaId] || {}), ...campos }
        }));
        if (!planta || !podeAprovarPlanta) return;
        try {
            await httpClient.put(`/producao/plantas/${planta.id}/camadas/${camadaId}`, campos, { headers: headersExtra });
            if (campos.visivel !== undefined) await aoAtualizar();
        } catch {
            // Mantém alteração visual local se usuário for apenas visualizador/produtor
        }
    };

    const handleExcluirCamada = async (camadaId) => {
        if (!planta) return;
        try {
            await httpClient.delete(`/producao/plantas/${planta.id}/camadas/${camadaId}`, { headers: headersExtra });
            enqueueSnackbar('Camada removida da planta.', { variant: 'success' });
            await aoAtualizar();
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Sem permissão para excluir camada.', { variant: 'error' });
        }
    };

    const handleSalvarCalibracaoEscala = async () => {
        const mNum = Number(String(modalEscalaInfo?.metros || '').replace(',', '.'));
        if (!Number.isFinite(mNum) || mNum <= 0 || !modalEscalaInfo?.distPx) {
            enqueueSnackbar('Informe a distância real em metros maior que zero.', { variant: 'warning' });
            return;
        }
        const novoPxPorMetro = Math.round((modalEscalaInfo.distPx / mNum) * 100) / 100;
        setPxPorMetro(novoPxPorMetro);
        setModalEscalaInfo(null);
        setFerramentaCanvas('selecionar');
        enqueueSnackbar(`Escala calibrada em ${novoPxPorMetro} px/metro.`, { variant: 'success' });

        if (planta && podePublicarOficial) {
            try {
                await httpClient.post(`/producao/plantas/${planta.id}/camadas`, {
                    definir_como_base: false,
                    camadas_lote: [],
                    escala_pixels_por_metro: novoPxPorMetro
                }, { headers: headersExtra });
            } catch {
                // O novo valor já foi aplicado no editor local e será salvo na publicação
            }
        }
    };

    const handleSalvarProposta = async () => {
        if (!planta || !formProposta.titulo.trim()) {
            enqueueSnackbar('Informe o título da proposta de intervenção.', { variant: 'warning' });
            return;
        }
        try {
            setSalvando(true);
            await httpClient.post(`/producao/plantas/${planta.id}/propostas`, {
                planta_versao_base_id: versaoOficial?.id,
                titulo: formProposta.titulo,
                justificativa: formProposta.justificativa,
                tarefa_id: formProposta.tarefa_id || null,
                elementos_alterados_json: elementosRascunho || []
            }, { headers: headersExtra });
            enqueueSnackbar('Proposta enviada para análise do arquiteto.', { variant: 'success' });
            setModalPropostaAberto(false);
            setModoEdicao(false);
            setElementosRascunho(null);
            setFormProposta({ titulo: '', justificativa: '', tarefa_id: '' });
            await aoAtualizar();
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Erro ao enviar proposta.', { variant: 'error' });
        } finally {
            setSalvando(false);
        }
    };

    const handleAvaliarProposta = async (decisao) => {
        if (!propostaEmRevisao) return;
        try {
            setSalvando(true);
            const res = await httpClient.post(`/producao/plantas/propostas/${propostaEmRevisao.id}/avaliar`, {
                decisao,
                parecer: parecerArquiteto.trim()
            }, { headers: headersExtra });
            const novaVersao = res.data?.data?.nova_versao;
            enqueueSnackbar(
                decisao === 'aprovar'
                    ? `Proposta aprovada! Planta oficial atualizada para v${novaVersao?.numero_versao || ''}.`
                    : 'Proposta rejeitada e arquivada.',
                { variant: 'success' }
            );
            setPropostaRevisaoId('');
            setParecerArquiteto('');
            await aoAtualizar();
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Sem permissão para avaliar proposta.', { variant: 'error' });
        } finally {
            setSalvando(false);
        }
    };

    const handleExportarSvg = () => {
        if (!svgRef.current) return;
        const xml = new XMLSerializer().serializeToString(svgRef.current);
        const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `planta-oficial-v${versaoExibida?.numero_versao || 1}.svg`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleExportarPng = () => {
        if (!svgRef.current) return;
        const xml = new XMLSerializer().serializeToString(svgRef.current);
        const svgBlob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(svgBlob);
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = larguraCanvas * 2;
            canvas.height = alturaCanvas * 2;
            const ctx2d = canvas.getContext('2d');
            ctx2d.fillStyle = cores.fundo;
            ctx2d.fillRect(0, 0, canvas.width, canvas.height);
            ctx2d.drawImage(img, 0, 0, canvas.width, canvas.height);
            URL.revokeObjectURL(url);
            canvas.toBlob((pngBlob) => {
                if (!pngBlob) return;
                const pngUrl = URL.createObjectURL(pngBlob);
                const a = document.createElement('a');
                a.href = pngUrl;
                a.download = `planta-oficial-v${versaoExibida?.numero_versao || 1}.png`;
                a.click();
                URL.revokeObjectURL(pngUrl);
            }, 'image/png');
        };
        img.src = url;
    };

    const handleSalvarSetor = async () => {
        if (!planta || !formSetor.nome.trim()) {
            enqueueSnackbar('Informe o nome do setor ou área mapeada.', { variant: 'warning' });
            return;
        }
        const x = Number(formSetor.x || 120);
        const y = Number(formSetor.y || 120);
        const w = Number(formSetor.largura || 200);
        const h = Number(formSetor.altura || 140);
        const poligonoFinal = (Array.isArray(formSetor.poligono_coordenadas) && formSetor.poligono_coordenadas.length >= 3)
            ? formSetor.poligono_coordenadas
            : [
                { x, y },
                { x: x + w, y },
                { x: x + w, y: y + h },
                { x, y: y + h }
            ];

        try {
            setSalvando(true);
            if (setorEditandoId) {
                await httpClient.put(`/producao/plantas/${planta.id}/setores/${setorEditandoId}`, {
                    nome: formSetor.nome.trim(),
                    area_id: formSetor.area_id || null,
                    cor_hex: formSetor.cor_hex || '#00D4FF',
                    responsavel_nome: formSetor.responsavel_nome || '',
                    poligono_coordenadas: poligonoFinal
                }, { headers: headersExtra });
                enqueueSnackbar('Setor atualizado na planta.', { variant: 'success' });
            } else {
                const resp = await httpClient.post(`/producao/plantas/${planta.id}/setores`, {
                    nome: formSetor.nome.trim(),
                    area_id: formSetor.area_id || null,
                    cor_hex: formSetor.cor_hex || '#00D4FF',
                    responsavel_nome: formSetor.responsavel_nome || '',
                    poligono_coordenadas: poligonoFinal
                }, { headers: headersExtra });
                const criado = resp.data?.data;
                if (criado?.id) {
                    setSetorSelecionadoId(criado.id);
                    setElementoSelecionadoId(null);
                }
                enqueueSnackbar('Área ou setor demarcado sobre o projeto.', { variant: 'success' });
            }
            setModalSetorAberto(false);
            setSetorEditandoId(null);
            await aoAtualizar();
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Sem permissão para salvar setor.', { variant: 'error' });
        } finally {
            setSalvando(false);
        }
    };

    const handleExcluirSetor = async (setorId) => {
        if (!planta) return;
        try {
            await httpClient.delete(`/producao/plantas/${planta.id}/setores/${setorId}`, { headers: headersExtra });
            if (setorSelecionadoId === setorId) setSetorSelecionadoId(null);
            enqueueSnackbar('Setor removido da planta.', { variant: 'success' });
            await aoAtualizar();
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Sem permissão para remover setor.', { variant: 'error' });
        }
    };

    const handlePublicarVersaoOficial = async () => {
        if (!planta) return;
        try {
            setSalvando(true);
            const res = await httpClient.post(`/producao/plantas/${planta.id}/publicar-oficial`, {
                elementos_json: elementosRascunho || versaoOficial?.elementos_json || [],
                escala_pixels_por_metro: pxPorMetro,
                largura_px: larguraCanvas,
                altura_px: alturaCanvas,
                notas_versao: 'Publicação oficial com mapeamento sobre projeto'
            }, { headers: headersExtra });
            const nova = res.data?.data;
            enqueueSnackbar(`Planta oficial v${nova?.numero_versao || ''} publicada.`, { variant: 'success' });
            setModoEdicao(false);
            setElementosRascunho(null);
            setVersaoSelecionadaId('');
            await aoAtualizar();
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Sem permissão para publicar planta oficial.', { variant: 'error' });
        } finally {
            setSalvando(false);
        }
    };

    // Geração de etapas / cronograma de 3 fases direto do elemento ou setor mapeado
    const handleGerarPlano3Fases = async () => {
        if (!planta) return;
        const setorAlvo = elementoSelecionado ? detectarSetorDoElemento(elementoSelecionado) : setorSelecionado;
        const areaId = setorAlvo?.area_id || ctx.area_id || areas[0]?.id;
        if (!areaId) {
            enqueueSnackbar('Cadastre uma área em Produtores e presença antes de gerar o plano de etapas.', { variant: 'warning' });
            return;
        }
        try {
            setSalvando(true);
            await httpClient.post(`/producao/plantas/${planta.id}/gerar-plano-fases`, {
                area_id: areaId,
                setor_id: setorAlvo?.id || null,
                elemento_planta_id: elementoSelecionado?.id || setorSelecionado?.id,
                elemento_planta_rotulo: elementoSelecionado?.rotulo || setorSelecionado?.nome,
                tipo_elemento: elementoSelecionado?.tipo || 'geral'
            }, { headers: headersExtra });
            enqueueSnackbar('Plano de 3 fases (Montagem, Evento e Desmontagem) criado no cronograma.', { variant: 'success' });
            await aoAtualizar();
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Erro ao gerar plano de fases.', { variant: 'error' });
        } finally {
            setSalvando(false);
        }
    };

    const abrirModalNovaTarefaNoItem = (faseInicial = 'montagem') => {
        const setorAlvo = elementoSelecionado ? detectarSetorDoElemento(elementoSelecionado) : setorSelecionado;
        const nomeAlvo = elementoSelecionado?.rotulo || setorSelecionado?.nome || 'Estrutura da planta';
        setFormTarefaItem({
            titulo: `${obterInfoFase(faseInicial).rotulo} • ${nomeAlvo}`,
            fase_operacional: faseInicial,
            area_id: setorAlvo?.area_id || ctx.area_id || areas[0]?.id || '',
            setor_id: setorAlvo?.id || '',
            elemento_planta_id: elementoSelecionado?.id || setorSelecionado?.id || '',
            elemento_planta_rotulo: nomeAlvo,
            prioridade: 'alta',
            objetivo: '',
            etapas_texto: 'Conferir posição conforme planta\nExecutar serviço técnico\nRegistrar evidência fotográfica',
            data_inicio_planejada: new Date().toISOString().slice(0, 16),
            data_fim_planejada: new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 16)
        });
        setModalTarefaItemAberto(true);
    };

    const handleSalvarTarefaNoItem = async () => {
        if (!formTarefaItem.titulo.trim() || !formTarefaItem.area_id) {
            enqueueSnackbar('Informe o título da tarefa e a área responsável.', { variant: 'warning' });
            return;
        }
        try {
            setSalvando(true);
            await httpClient.post('/producao/tarefas', {
                titulo: formTarefaItem.titulo.trim(),
                fase_operacional: formTarefaItem.fase_operacional,
                area_id: formTarefaItem.area_id,
                setor_id: formTarefaItem.setor_id || null,
                planta_id: planta?.id || null,
                elemento_planta_id: formTarefaItem.elemento_planta_id || null,
                elemento_planta_rotulo: formTarefaItem.elemento_planta_rotulo || null,
                prioridade: formTarefaItem.prioridade,
                objetivo: formTarefaItem.objetivo,
                etapas: formTarefaItem.etapas_texto.split('\n').map((s) => s.trim()).filter(Boolean),
                data_inicio_planejada: new Date(formTarefaItem.data_inicio_planejada).toISOString(),
                data_fim_planejada: new Date(formTarefaItem.data_fim_planejada).toISOString()
            }, { headers: headersExtra });
            setModalTarefaItemAberto(false);
            enqueueSnackbar('Tarefa e etapas adicionadas ao cronograma.', { variant: 'success' });
            await aoAtualizar();
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Erro ao adicionar tarefa.', { variant: 'error' });
        } finally {
            setSalvando(false);
        }
    };

    // Upload real na seção de Projetos Técnicos Versionados
    const handleSelecionarArquivoProjetoNovo = async (evt) => {
        const file = evt.target.files?.[0];
        if (!file) return;
        evt.target.value = '';
        try {
            setProcessandoArquivo(true);
            const info = await inspecionarArquivoArquitetura(file);
            setFormProjeto((prev) => ({
                ...prev,
                titulo: prev.titulo || info.nomeArquivo.replace(/\.[^.]+$/, ''),
                nome_arquivo: info.nomeArquivo,
                url_arquivo: info.imagemUrl,
                tamanho_bytes: info.tamanhoBytes,
                largura_px: info.largura,
                altura_px: info.altura
            }));
            enqueueSnackbar(`Arquivo "${info.nomeArquivo}" preparado.`, { variant: 'success' });
        } catch (err) {
            enqueueSnackbar(err.message || 'Erro ao ler o arquivo.', { variant: 'error' });
        } finally {
            setProcessandoArquivo(false);
        }
    };

    const handleCriarProjeto = async () => {
        if (!formProjeto.titulo.trim()) {
            enqueueSnackbar('Informe o título do projeto.', { variant: 'warning' });
            return;
        }
        try {
            setSalvando(true);
            await httpClient.post('/producao/projetos', formProjeto, { headers: headersExtra });
            enqueueSnackbar('Projeto técnico registrado.', { variant: 'success' });
            setModalProjetoAberto(false);
            setFormProjeto({
                titulo: '',
                categoria: 'arquitetura',
                area_id: '',
                descricao: '',
                nome_arquivo: '',
                url_arquivo: null,
                tamanho_bytes: 0,
                largura_px: null,
                altura_px: null
            });
            await aoAtualizar();
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Erro ao criar projeto.', { variant: 'error' });
        } finally {
            setSalvando(false);
        }
    };

    const handleSelecionarArquivoVersao = async (evt) => {
        const file = evt.target.files?.[0];
        if (!file || !modalNovaVersaoArq) return;
        evt.target.value = '';
        try {
            setProcessandoArquivo(true);
            const info = await inspecionarArquivoArquitetura(file);
            setModalNovaVersaoArq((prev) => ({
                ...prev,
                nome_original: info.nomeArquivo,
                url_arquivo: info.imagemUrl,
                tamanho_bytes: info.tamanhoBytes,
                largura_px: info.largura,
                altura_px: info.altura
            }));
        } catch (err) {
            enqueueSnackbar(err.message || 'Erro ao ler o arquivo da nova versão.', { variant: 'error' });
        } finally {
            setProcessandoArquivo(false);
        }
    };

    const handleSalvarNovaVersaoArquivo = async () => {
        if (!modalNovaVersaoArq?.nome_original?.trim()) {
            enqueueSnackbar('Selecione um arquivo ou informe o nome da revisão.', { variant: 'warning' });
            return;
        }
        try {
            setSalvando(true);
            await httpClient.post(`/producao/projetos/${modalNovaVersaoArq.projetoId}/arquivos`, {
                nome_original: modalNovaVersaoArq.nome_original.trim(),
                tamanho_bytes: modalNovaVersaoArq.tamanho_bytes || 0,
                url_arquivo: modalNovaVersaoArq.url_arquivo || null,
                largura_px: modalNovaVersaoArq.largura_px || null,
                altura_px: modalNovaVersaoArq.altura_px || null,
                observacao: modalNovaVersaoArq.observacao.trim() || 'Nova revisão enviada pela equipe'
            }, { headers: headersExtra });
            setModalNovaVersaoArq(null);
            enqueueSnackbar('Nova versão anexada ao projeto técnico.', { variant: 'success' });
            await aoAtualizar();
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Erro ao versionar arquivo.', { variant: 'error' });
        } finally {
            setSalvando(false);
        }
    };

    const handleEnviarArquivoProjetoParaPlanta = async (arq) => {
        if (!arq?.url_arquivo) return;
        try {
            setSalvando(true);
            if (!planta) {
                await httpClient.post('/producao/plantas', {
                    titulo: arq.nome_original.replace(/\.[^.]+$/, ''),
                    largura_px: arq.largura_px || 1200,
                    altura_px: arq.altura_px || 780,
                    escala_pixels_por_metro: pxPorMetro || 15,
                    imagem_fundo_url: arq.url_arquivo,
                    nome_arquivo_base: arq.nome_original
                }, { headers: headersExtra });
            } else {
                await httpClient.post(`/producao/plantas/${planta.id}/camadas`, {
                    definir_como_base: true,
                    imagem_url: arq.url_arquivo,
                    nome_arquivo: arq.nome_original,
                    largura_px: arq.largura_px || larguraCanvas,
                    altura_px: arq.altura_px || alturaCanvas
                }, { headers: headersExtra });
            }
            enqueueSnackbar(`Desenho "${arq.nome_original}" aplicado como base na planta interativa.`, { variant: 'success' });
            await aoAtualizar();
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Erro ao aplicar arquivo na planta.', { variant: 'error' });
        } finally {
            setSalvando(false);
        }
    };

    return (
        <Stack spacing={3}>
            {/* Editor de Planta Baixa sobre Projeto do Arquiteto */}
            <GlassCard sx={{ p: 2.5 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1.5, mb: 2 }}>
                    <Box>
                        <Typography variant="h6" sx={{ color: cores.textoForte }}>
                            {planta?.titulo || 'Planta baixa e mapeamento sobre o projeto'}
                        </Typography>
                        <Typography variant="body2" sx={{ color: cores.textoSecundario }}>
                            {planta
                                ? `Versão oficial v${versaoOficial?.numero_versao || 1} • Escala calibrada: ${pxPorMetro} px/m${versaoExibida?.nome_arquivo_base ? ` • Base: ${versaoExibida.nome_arquivo_base}` : ''}`
                                : 'Suba o PDF, PNG, JPG ou SVG dos arquitetos para demarcar áreas, elementos e cronogramas por fase.'}
                        </Typography>
                    </Box>

                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center">
                        {plantas.length > 1 && (
                            <FormControl size="small" sx={{ minWidth: 190 }}>
                                <InputLabel>Prancha ativa</InputLabel>
                                <Select
                                    label="Prancha ativa"
                                    value={planta?.id || ''}
                                    onChange={(e) => {
                                        setPlantaSelecionadaId(e.target.value);
                                        setVersaoSelecionadaId('');
                                        setModoEdicao(false);
                                        setElementoSelecionadoId(null);
                                        setSetorSelecionadoId(null);
                                    }}
                                >
                                    {plantas.map((pl) => (
                                        <MenuItem key={pl.id} value={pl.id}>{pl.titulo}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        )}

                        {podeAprovarPlanta && (
                            <NeonButton
                                size="small"
                                startIcon={<ArquivoIcon />}
                                onClick={() => abrirModalImportacao()}
                            >
                                Importar projeto (PDF, PNG, SVG)
                            </NeonButton>
                        )}

                        {planta && (
                            <>
                                <Tooltip title="Diminuir zoom (ou use o scroll do mouse)">
                                    <IconButton size="small" onClick={() => ajustarZoomNoCentro(zoom / 1.2)} sx={{ color: cores.texto }}>
                                        <ZoomOutIcon fontSize="small" />
                                    </IconButton>
                                </Tooltip>
                                <Chip
                                    size="small"
                                    label={`${Math.round(zoom * 100)}%`}
                                    onClick={resetarZoomEPan}
                                    sx={{ bgcolor: cores.superficieElevada, color: cores.textoForte, fontWeight: 700, cursor: 'pointer' }}
                                />
                                <Tooltip title="Aumentar zoom (ou use o scroll do mouse)">
                                    <IconButton size="small" onClick={() => ajustarZoomNoCentro(zoom * 1.2)} sx={{ color: cores.texto }}>
                                        <ZoomInIcon fontSize="small" />
                                    </IconButton>
                                </Tooltip>
                                <Tooltip title="Ajustar planta à janela (100%)">
                                    <IconButton size="small" onClick={resetarZoomEPan} sx={{ color: cores.textoSecundario }}>
                                        <AjustarTelaIcon fontSize="small" />
                                    </IconButton>
                                </Tooltip>
                                <FormControl size="small" sx={{ minWidth: 135 }}>
                                    <InputLabel>Versão exibida</InputLabel>
                                    <Select
                                        label="Versão exibida"
                                        value={versaoExibida?.id || ''}
                                        onChange={(e) => { setVersaoSelecionadaId(e.target.value); setModoEdicao(false); }}
                                    >
                                        {versoesOrdenadas.map((v) => (
                                            <MenuItem key={v.id} value={v.id}>
                                                v{v.numero_versao} {v.eh_oficial ? '(oficial)' : '(histórico)'}
                                            </MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                                <Button variant="outlined" size="small" startIcon={<ExportarIcon />} onClick={handleExportarSvg} sx={botaoSecundario}>
                                    Exportar SVG
                                </Button>
                                <Button variant="outlined" size="small" startIcon={<ExportarIcon />} onClick={handleExportarPng} sx={botaoSecundario}>
                                    Exportar PNG
                                </Button>
                                {!modoEdicao ? (
                                    <Button variant="outlined" size="small" startIcon={<EditarIcon />} onClick={iniciarIntervencao} sx={botaoSecundario}>
                                        {podePublicarOficial ? 'Mapear elementos' : 'Propor intervenção'}
                                    </Button>
                                ) : (
                                    <>
                                        <Button variant="outlined" size="small" onClick={() => { setModoEdicao(false); setElementosRascunho(null); }} sx={botaoSecundario}>
                                            Descartar rascunho
                                        </Button>
                                        {podePublicarOficial && (
                                            <NeonButton size="small" neonColor={funcao.liberado} loading={salvando} onClick={handlePublicarVersaoOficial}>
                                                Publicar oficial
                                            </NeonButton>
                                        )}
                                        <NeonButton size="small" onClick={() => setModalPropostaAberto(true)}>
                                            Enviar proposta
                                        </NeonButton>
                                    </>
                                )}
                            </>
                        )}
                    </Stack>
                </Box>

                {!planta ? (
                    <Box sx={{ p: 4, textAlign: 'center', borderRadius: 2, bgcolor: cores.fundo, border: `1px dashed ${cores.bordaDestaque}` }}>
                        <ArquivoIcon sx={{ fontSize: 44, color: cores.primaria, mb: 1 }} />
                        <Typography variant="h6" sx={{ color: cores.textoForte, mb: 0.75 }}>
                            Nenhum projeto importado na planta ainda
                        </Typography>
                        <Typography variant="body2" sx={{ color: cores.textoSecundario, mb: 2 }}>
                            Suba o arquivo desenvolvido pelos arquitetos (PDF multipágina, PNG, JPG ou SVG em camadas) para mapear áreas, posicionar equipamentos e gerar o cronograma.
                        </Typography>
                        {podeAprovarPlanta && (
                            <NeonButton startIcon={<ArquivoIcon />} onClick={() => abrirModalImportacao('nova_prancha')}>
                                Importar primeiro projeto agora
                            </NeonButton>
                        )}
                    </Box>
                ) : (
                    <>
                        {/* Barra direta de ferramentas sobre o desenho */}
                        <Box
                            sx={{
                                p: 1.25,
                                mb: 2,
                                borderRadius: 1.5,
                                bgcolor: cores.superficieElevada,
                                border: `1px solid ${cores.borda}`,
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                flexWrap: 'wrap',
                                gap: 1
                            }}
                        >
                            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center">
                                <Button
                                    size="small"
                                    variant={ferramentaCanvas === 'selecionar' ? 'contained' : 'outlined'}
                                    startIcon={<CursorIcon />}
                                    onClick={() => { setFerramentaCanvas('selecionar'); setPontosPoligono([]); }}
                                    sx={ferramentaCanvas === 'selecionar' ? undefined : botaoSecundario}
                                >
                                    Selecionar e mover
                                </Button>
                                <Button
                                    size="small"
                                    variant={ferramentaCanvas === 'pan' ? 'contained' : 'outlined'}
                                    startIcon={<MaoIcon />}
                                    onClick={() => { setFerramentaCanvas('pan'); setPontosPoligono([]); }}
                                    sx={ferramentaCanvas === 'pan' ? undefined : botaoSecundario}
                                >
                                    Mover planta (mãozinha)
                                </Button>
                                {podeAprovarPlanta && (
                                    <>
                                        <Button
                                            size="small"
                                            variant={ferramentaCanvas === 'poligono' ? 'contained' : 'outlined'}
                                            startIcon={<PoligonoIcon />}
                                            onClick={() => {
                                                setFerramentaCanvas('poligono');
                                                setPontosPoligono([]);
                                                enqueueSnackbar('Clique nos cantos da área sobre o desenho e depois clique em Concluir área.', { variant: 'info' });
                                            }}
                                            sx={ferramentaCanvas === 'poligono' ? undefined : botaoSecundario}
                                        >
                                            Demarcar área (polígono)
                                        </Button>
                                        <Button
                                            size="small"
                                            variant={ferramentaCanvas === 'retangulo' ? 'contained' : 'outlined'}
                                            startIcon={<RetanguloIcon />}
                                            onClick={() => {
                                                setFerramentaCanvas('retangulo');
                                                enqueueSnackbar('Clique e arraste sobre o desenho para traçar uma área retangular.', { variant: 'info' });
                                            }}
                                            sx={ferramentaCanvas === 'retangulo' ? undefined : botaoSecundario}
                                        >
                                            Demarcar área (retângulo)
                                        </Button>
                                    </>
                                )}
                                <Button
                                    size="small"
                                    variant={ferramentaCanvas === 'regua' ? 'contained' : 'outlined'}
                                    startIcon={<ReguaIcon />}
                                    onClick={() => {
                                        setFerramentaCanvas(ferramentaCanvas === 'regua' ? 'selecionar' : 'regua');
                                        setPontosRegua([]);
                                        enqueueSnackbar('Clique em dois pontos de medida conhecida sobre a planta.', { variant: 'info' });
                                    }}
                                    sx={ferramentaCanvas === 'regua' ? undefined : botaoSecundario}
                                >
                                    Calibrar escala
                                </Button>
                                <Button
                                    size="small"
                                    variant="outlined"
                                    startIcon={<CamadaIcon />}
                                    onClick={() => setExibirSetores((v) => !v)}
                                    sx={botaoSecundario}
                                >
                                    {exibirSetores ? 'Ocultar áreas' : 'Mostrar áreas'}
                                </Button>
                            </Stack>

                            <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
                                <Typography sx={{ fontSize: tamanhos.xs, color: cores.textoSecundario, mr: 0.5 }}>
                                    Status das etapas na planta:
                                </Typography>
                                {[
                                    { valor: 'todas', rotulo: 'Todas' },
                                    ...FASES_OPERACIONAIS
                                ].map((f) => {
                                    const ativo = filtroFaseCanvas === f.valor;
                                    return (
                                        <Chip
                                            key={f.valor}
                                            size="small"
                                            clickable
                                            label={f.rotulo}
                                            onClick={() => setFiltroFaseCanvas(f.valor)}
                                            sx={{
                                                fontWeight: ativo ? 700 : 500,
                                                bgcolor: ativo ? tom(f.cor || cores.primaria, 0.22) : cores.fundo,
                                                color: ativo ? (f.cor || cores.primaria) : cores.textoSecundario,
                                                border: `1px solid ${ativo ? (f.cor || cores.primaria) : cores.borda}`
                                            }}
                                        />
                                    );
                                })}
                            </Stack>
                        </Box>

                        {ferramentaCanvas === 'poligono' && (
                            <Alert
                                severity="info"
                                sx={{ mb: 1.5 }}
                                action={(
                                    <Stack direction="row" spacing={1}>
                                        <Button size="small" onClick={() => setPontosPoligono([])}>Limpar</Button>
                                        <NeonButton size="small" onClick={handleConcluirPoligono}>
                                            Concluir área ({pontosPoligono.length} pts)
                                        </NeonButton>
                                    </Stack>
                                )}
                            >
                                Clique diretamente sobre os cantos da área no desenho do arquiteto para contornar o setor.
                            </Alert>
                        )}

                        <Grid container spacing={2}>
                            {/* Barra lateral esquerda: camadas, biblioteca, setores e propostas */}
                            <Grid item xs={12} lg={3}>
                                <Stack spacing={2}>
                                    {/* Controle de Camadas e Desenho Base */}
                                    <GlassCard sx={{ p: 1.5 }}>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                                            <Typography variant="subtitle2" sx={{ color: cores.textoForte }}>
                                                Camadas do projeto
                                            </Typography>
                                            {podeAprovarPlanta && (
                                                <Button size="small" onClick={() => abrirModalImportacao('camada_atual')} sx={{ minWidth: 0, p: 0.5, fontSize: tamanhos.xs }}>
                                                    + Camada
                                                </Button>
                                            )}
                                        </Box>

                                        <Stack spacing={1}>
                                            <Box sx={{ p: 1, borderRadius: 1.25, bgcolor: cores.fundo, border: `1px solid ${cores.borda}` }}>
                                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <Typography sx={{ fontSize: tamanhos.xs, fontWeight: 600, color: cores.texto }} noWrap>
                                                        {versaoExibida?.imagem_fundo_url ? (versaoExibida.nome_arquivo_base || 'Desenho base') : 'Grade sem desenho base'}
                                                    </Typography>
                                                    <IconButton size="small" onClick={() => setExibirBase((v) => !v)} sx={{ color: exibirBase ? cores.primaria : cores.textoFraco }}>
                                                        {exibirBase ? <OlhoAbertoIcon fontSize="small" /> : <OlhoFechadoIcon fontSize="small" />}
                                                    </IconButton>
                                                </Box>
                                                {versaoExibida?.imagem_fundo_url && (
                                                    <Slider
                                                        size="small"
                                                        min={0.15}
                                                        max={1}
                                                        step={0.05}
                                                        value={opacidadeBase}
                                                        onChange={(_, v) => setOpacidadeBase(v)}
                                                    />
                                                )}
                                            </Box>

                                            {camadasAtivas.map((cam) => {
                                                const local = camadasEstadoLocal[cam.id] || {};
                                                const visivel = local.visivel !== undefined ? local.visivel : cam.visivel !== false;
                                                const opacidade = local.opacidade !== undefined ? local.opacidade : Number(cam.opacidade ?? 0.85);
                                                return (
                                                    <Box key={cam.id} sx={{ p: 1, borderRadius: 1.25, bgcolor: cores.fundo, border: `1px solid ${cores.borda}` }}>
                                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 0.5 }}>
                                                            <Typography sx={{ fontSize: tamanhos.xs, color: cores.textoSuave, flex: 1 }} noWrap>
                                                                {cam.nome}
                                                            </Typography>
                                                            <IconButton
                                                                size="small"
                                                                onClick={() => handleAlterarCamada(cam.id, { visivel: !visivel })}
                                                                sx={{ color: visivel ? cores.primaria : cores.textoFraco }}
                                                            >
                                                                {visivel ? <OlhoAbertoIcon fontSize="small" /> : <OlhoFechadoIcon fontSize="small" />}
                                                            </IconButton>
                                                            {podeAprovarPlanta && (
                                                                <IconButton size="small" onClick={() => handleExcluirCamada(cam.id)} sx={acaoTabelaPerigo}>
                                                                    <ExcluirIcon fontSize="small" />
                                                                </IconButton>
                                                            )}
                                                        </Box>
                                                        <Slider
                                                            size="small"
                                                            min={0.1}
                                                            max={1}
                                                            step={0.05}
                                                            value={opacidade}
                                                            onChange={(_, v) => handleAlterarCamada(cam.id, { opacidade: v })}
                                                        />
                                                    </Box>
                                                );
                                            })}
                                        </Stack>
                                    </GlassCard>

                                    {/* Biblioteca de blocos para adicionar sobre o desenho */}
                                    <GlassCard sx={{ p: 1.5 }}>
                                        <Typography variant="subtitle2" sx={{ color: cores.textoForte, mb: 1 }}>
                                            Adicionar elemento no mapa
                                        </Typography>
                                        <Grid container spacing={0.75}>
                                            {BIBLIOTECA_BLOCOS.map((b) => (
                                                <Grid item xs={6} key={b.tipo}>
                                                    <Button
                                                        fullWidth
                                                        size="small"
                                                        variant="outlined"
                                                        onClick={() => adicionarBloco(b)}
                                                        sx={{ ...botaoSecundario, justifyContent: 'flex-start', borderColor: b.cor, fontSize: tamanhos.xs, minHeight: 34, px: 1 }}
                                                    >
                                                        + {b.rotulo}
                                                    </Button>
                                                </Grid>
                                            ))}
                                        </Grid>
                                    </GlassCard>

                                    {/* Setores e áreas separadas na planta */}
                                    <GlassCard sx={{ p: 1.5 }}>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                                            <Typography variant="subtitle2" sx={{ color: cores.textoForte }}>
                                                Áreas demarcadas ({setoresAtivos.length})
                                            </Typography>
                                            {podeAprovarPlanta && (
                                                <Button
                                                    size="small"
                                                    onClick={() => {
                                                        setSetorEditandoId(null);
                                                        setFormSetor({
                                                            nome: '',
                                                            area_id: areas[0]?.id || '',
                                                            cor_hex: areas[0]?.cor || '#00D4FF',
                                                            responsavel_nome: '',
                                                            x: 150,
                                                            y: 120,
                                                            largura: 240,
                                                            altura: 150,
                                                            poligono_coordenadas: null
                                                        });
                                                        setModalSetorAberto(true);
                                                    }}
                                                    sx={{ minWidth: 0, p: 0.5, fontSize: tamanhos.xs }}
                                                >
                                                    + Setor
                                                </Button>
                                            )}
                                        </Box>
                                        <Stack spacing={0.75}>
                                            {setoresAtivos.map((s) => {
                                                const sel = s.id === setorSelecionadoId;
                                                return (
                                                    <Box
                                                        key={s.id}
                                                        onClick={() => { setSetorSelecionadoId(s.id); setElementoSelecionadoId(null); }}
                                                        sx={{
                                                            p: 1,
                                                            borderRadius: 1.25,
                                                            cursor: 'pointer',
                                                            bgcolor: cores.fundo,
                                                            border: `1px solid ${sel ? (s.cor_hex || cores.primaria) : cores.borda}`,
                                                            display: 'flex',
                                                            justifyContent: 'space-between',
                                                            alignItems: 'center',
                                                            gap: 0.5
                                                        }}
                                                    >
                                                        <Box sx={{ minWidth: 0 }}>
                                                            <Typography sx={{ fontSize: tamanhos.xs, fontWeight: 700, color: s.cor_hex || cores.textoForte }} noWrap>
                                                                {s.nome}
                                                            </Typography>
                                                            <Typography sx={{ fontSize: '0.7rem', color: cores.textoSecundario }} noWrap>
                                                                {obterNomeArea(areas, s.area_id)}
                                                            </Typography>
                                                        </Box>
                                                        {podeAprovarPlanta && (
                                                            <IconButton
                                                                size="small"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setSetorEditandoId(s.id);
                                                                    setFormSetor({
                                                                        nome: s.nome,
                                                                        area_id: s.area_id || '',
                                                                        cor_hex: s.cor_hex || '#00D4FF',
                                                                        responsavel_nome: s.responsavel_nome || '',
                                                                        x: s.poligono_coordenadas?.[0]?.x || 120,
                                                                        y: s.poligono_coordenadas?.[0]?.y || 120,
                                                                        largura: 200,
                                                                        altura: 140,
                                                                        poligono_coordenadas: s.poligono_coordenadas
                                                                    });
                                                                    setModalSetorAberto(true);
                                                                }}
                                                                sx={acaoTabela}
                                                            >
                                                                <EditarIcon fontSize="small" />
                                                            </IconButton>
                                                        )}
                                                    </Box>
                                                );
                                            })}
                                            {setoresAtivos.length === 0 && (
                                                <Typography sx={{ fontSize: tamanhos.xs, color: cores.textoSecundario }}>
                                                    Use Demarcar área sobre o desenho para separar setores.
                                                </Typography>
                                            )}
                                        </Stack>
                                    </GlassCard>

                                    {/* Lista de propostas para revisão (Diff) */}
                                    <GlassCard sx={{ p: 1.5 }}>
                                        <Typography variant="subtitle2" sx={{ color: cores.textoForte, mb: 1 }}>
                                            Propostas de alteração ({propostas.length})
                                        </Typography>
                                        <Stack spacing={1}>
                                            {propostas.map((p) => (
                                                <Box
                                                    key={p.id}
                                                    onClick={() => { setPropostaRevisaoId(p.id); setModoEdicao(false); }}
                                                    sx={{
                                                        p: 1.25,
                                                        borderRadius: 1.5,
                                                        cursor: 'pointer',
                                                        border: `1px solid ${propostaRevisaoId === p.id ? cores.primaria : cores.borda}`,
                                                        bgcolor: cores.superficieElevada
                                                    }}
                                                >
                                                    <Typography sx={{ fontWeight: 600, fontSize: tamanhos.sm, color: cores.textoForte }}>
                                                        {p.titulo}
                                                    </Typography>
                                                    <Typography sx={{ fontSize: tamanhos.xs, color: cores.textoSecundario }}>
                                                        {p.autor_nome || 'Produtor'} • {formatarDataHoraCurta(p.created_at)}
                                                    </Typography>
                                                    <Stack direction="row" spacing={0.75} sx={{ mt: 0.75 }} flexWrap="wrap" useFlexGap>
                                                        <Chip
                                                            size="small"
                                                            label={p.status === 'pendente' ? 'Pendente' : p.status === 'aprovada' ? 'Aprovada' : 'Rejeitada'}
                                                            sx={{
                                                                bgcolor: tom(p.status === 'aprovada' ? funcao.liberado : p.status === 'rejeitada' ? funcao.negado : funcao.alerta, 0.14),
                                                                color: p.status === 'aprovada' ? funcao.liberado : p.status === 'rejeitada' ? funcao.negado : funcao.alerta,
                                                                fontWeight: 600
                                                            }}
                                                        />
                                                        {p.conflitos?.length > 0 && (
                                                            <Chip size="small" label={`${p.conflitos.length} conflito(s)`} sx={{ bgcolor: tom(funcao.negado, 0.16), color: funcao.negado, fontWeight: 600 }} />
                                                        )}
                                                    </Stack>
                                                </Box>
                                            ))}
                                            {propostas.length === 0 && (
                                                <Typography sx={{ fontSize: tamanhos.xs, color: cores.textoSecundario }}>
                                                    Nenhuma intervenção proposta.
                                                </Typography>
                                            )}
                                        </Stack>
                                    </GlassCard>
                                </Stack>
                            </Grid>

                            {/* Canvas SVG principal + Inspetor de Etapas e 3 Fases */}
                            <Grid item xs={12} lg={9}>
                                {propostaEmRevisao && (
                                    <Alert
                                        severity={propostaEmRevisao.conflitos?.length > 0 ? 'warning' : 'info'}
                                        sx={{ mb: 1.5 }}
                                    >
                                        <strong>Visualizando diferenças (Diff):</strong>{' '}
                                        +{propostaEmRevisao.diff?.resumo?.adicionados || 0} adicionado(s) (verde),{' '}
                                        {propostaEmRevisao.diff?.resumo?.modificados || 0} movido(s)/alterado(s) (amarelo),{' '}
                                        {propostaEmRevisao.diff?.resumo?.removidos || 0} removido(s) (vermelho).
                                        {propostaEmRevisao.conflitos?.length > 0 && (
                                            <> • Atenção: há conflito com &ldquo;{propostaEmRevisao.conflitos[0].proposta_conflitante_titulo}&rdquo;.</>
                                        )}
                                    </Alert>
                                )}

                                <Box
                                    ref={viewportRef}
                                    onMouseDown={(e) => { if (e.button === 1) e.preventDefault(); }}
                                    onAuxClick={(e) => { if (e.button === 1) e.preventDefault(); }}
                                    sx={{
                                        position: 'relative',
                                        border: `1px solid ${modoEdicao || ferramentaCanvas !== 'selecionar' ? cores.primaria : cores.borda}`,
                                        borderRadius: 2,
                                        bgcolor: cores.fundo,
                                        overflow: 'hidden',
                                        touchAction: 'none',
                                        userSelect: 'none'
                                    }}
                                >
                                    <svg
                                        ref={svgRef}
                                        viewBox={`${viewOffset.x} ${viewOffset.y} ${larguraCanvas / zoom} ${alturaCanvas / zoom}`}
                                        style={{
                                            width: '100%',
                                            minHeight: 520,
                                            height: 'calc(100dvh - 300px)',
                                            maxHeight: 820,
                                            display: 'block',
                                            cursor: estaArrastandoMapa
                                                ? 'grabbing'
                                                : ((ferramentaCanvas === 'pan' || espacoPressionado)
                                                    ? 'grab'
                                                    : (ferramentaCanvas === 'selecionar' ? (modoEdicao ? 'grab' : 'default') : 'crosshair'))
                                        }}
                                        onPointerDown={handlePointerDownCanvas}
                                        onPointerMove={handlePointerMoveCanvas}
                                        onPointerUp={handlePointerUpCanvas}
                                        onPointerCancel={handlePointerUpCanvas}
                                    >
                                        <defs>
                                            <pattern id="grid-planta" width="30" height="30" patternUnits="userSpaceOnUse">
                                                <path d="M 30 0 L 0 0 0 30" fill="none" stroke="rgba(148,163,184,0.12)" strokeWidth="1" />
                                            </pattern>
                                        </defs>
                                        <rect width={larguraCanvas} height={alturaCanvas} fill="url(#grid-planta)" />

                                        {/* Desenho Base do Arquiteto (PDF/PNG/JPG/SVG) */}
                                        {exibirBase && versaoExibida?.imagem_fundo_url && (
                                            <image
                                                href={versaoExibida.imagem_fundo_url}
                                                x="0"
                                                y="0"
                                                width={larguraCanvas}
                                                height={alturaCanvas}
                                                opacity={opacidadeBase}
                                                preserveAspectRatio="xMidYMid meet"
                                            />
                                        )}

                                        {/* Camadas Sobrepostas do Projeto */}
                                        {camadasAtivas.map((cam) => {
                                            const local = camadasEstadoLocal[cam.id] || {};
                                            const visivel = local.visivel !== undefined ? local.visivel : cam.visivel !== false;
                                            const opacidade = local.opacidade !== undefined ? local.opacidade : Number(cam.opacidade ?? 0.85);
                                            if (!visivel || !cam.imagem_url) return null;
                                            return (
                                                <image
                                                    key={cam.id}
                                                    href={cam.imagem_url}
                                                    x="0"
                                                    y="0"
                                                    width={larguraCanvas}
                                                    height={alturaCanvas}
                                                    opacity={opacidade}
                                                    preserveAspectRatio="xMidYMid meet"
                                                />
                                            );
                                        })}

                                        {/* Setores poligonais demarcados sobre o desenho */}
                                        {exibirSetores && setoresAtivos.map((s) => {
                                            const pts = (s.poligono_coordenadas || []).map((p) => `${p.x},${p.y}`).join(' ');
                                            const selSetor = s.id === setorSelecionadoId;
                                            return (
                                                <g
                                                    key={s.id}
                                                    onClick={(e) => {
                                                        if (ferramentaCanvas !== 'selecionar') return;
                                                        e.stopPropagation();
                                                        setSetorSelecionadoId(s.id);
                                                        setElementoSelecionadoId(null);
                                                    }}
                                                    style={{ cursor: ferramentaCanvas === 'selecionar' ? 'pointer' : 'crosshair' }}
                                                >
                                                    <polygon
                                                        points={pts}
                                                        fill={s.cor_hex || '#00D4FF'}
                                                        fillOpacity={selSetor ? 0.24 : 0.13}
                                                        stroke={selSetor ? '#FFFFFF' : (s.cor_hex || '#00D4FF')}
                                                        strokeWidth={selSetor ? 3 : 2}
                                                        strokeDasharray={selSetor ? undefined : '6 4'}
                                                    />
                                                    {s.poligono_coordenadas?.[0] && (
                                                        <text x={s.poligono_coordenadas[0].x + 8} y={s.poligono_coordenadas[0].y + 18} fill={s.cor_hex || '#00D4FF'} fontSize="13" fontWeight="700">
                                                            {s.nome}
                                                        </text>
                                                    )}
                                                </g>
                                            );
                                        })}

                                        {/* Desenho ao vivo de polígono de área */}
                                        {ferramentaCanvas === 'poligono' && pontosPoligono.length > 0 && (
                                            <g>
                                                <polygon
                                                    points={pontosPoligono.map((p) => `${p.x},${p.y}`).join(' ')}
                                                    fill="rgba(0, 212, 255, 0.16)"
                                                    stroke={cores.primaria}
                                                    strokeWidth="2.5"
                                                    strokeDasharray="6 3"
                                                />
                                                {pontosPoligono.map((p, idx) => (
                                                    <circle key={idx} cx={p.x} cy={p.y} r="5" fill={cores.primaria} stroke="#FFFFFF" strokeWidth="1.5" />
                                                ))}
                                            </g>
                                        )}

                                        {/* Desenho ao vivo de retângulo de área */}
                                        {ferramentaCanvas === 'retangulo' && retanguloInicio && retanguloAtual && (
                                            <rect
                                                x={Math.min(retanguloInicio.x, retanguloAtual.x)}
                                                y={Math.min(retanguloInicio.y, retanguloAtual.y)}
                                                width={Math.abs(retanguloAtual.x - retanguloInicio.x)}
                                                height={Math.abs(retanguloAtual.y - retanguloInicio.y)}
                                                fill="rgba(0, 212, 255, 0.18)"
                                                stroke={cores.primaria}
                                                strokeWidth="2.5"
                                                strokeDasharray="6 3"
                                            />
                                        )}

                                        {/* Elementos oficiais ou rascunho em edição + badge de status das etapas */}
                                        {!propostaEmRevisao && elementosAtivos.map((el) => {
                                            const sel = el.id === elementoSelecionadoId;
                                            const cx = el.x + el.largura / 2;
                                            const cy = el.y + el.altura / 2;
                                            const listaTarefas = resumoTarefasPorElemento.get(el.id) || [];
                                            const mediaPct = listaTarefas.length > 0
                                                ? Math.round(listaTarefas.reduce((s, t) => s + Number(t.percentual_concluido || 0), 0) / listaTarefas.length)
                                                : null;
                                            const temAtraso = listaTarefas.some((t) => t.saude_prazo === 'atrasada' || t.status === 'bloqueada');
                                            const corBadge = temAtraso ? funcao.negado : (mediaPct === 100 ? funcao.liberado : funcao.alerta);

                                            return (
                                                <g
                                                    key={el.id}
                                                    transform={`rotate(${el.rotacao || 0} ${cx} ${cy})`}
                                                    onPointerDown={(e) => handlePointerDownElemento(e, el)}
                                                    style={{ cursor: ferramentaCanvas === 'selecionar' ? (modoEdicao ? 'move' : 'pointer') : 'crosshair' }}
                                                >
                                                    <rect
                                                        x={el.x}
                                                        y={el.y}
                                                        width={el.largura}
                                                        height={el.altura}
                                                        rx="6"
                                                        fill="rgba(10, 22, 40, 0.86)"
                                                        stroke={sel ? '#FFFFFF' : (el.cor || cores.primaria)}
                                                        strokeWidth={sel ? 3 : 1.75}
                                                    />
                                                    <text x={cx} y={cy - 2} textAnchor="middle" fill="#FFFFFF" fontSize="11" fontWeight="700">
                                                        {el.rotulo}
                                                    </text>
                                                    <text x={cx} y={cy + 13} textAnchor="middle" fill="#CBD5E1" fontSize="9.5">
                                                        {el.texto || `${(el.largura / pxPorMetro).toFixed(1)}x${(el.altura / pxPorMetro).toFixed(1)}m`}
                                                    </text>
                                                    {listaTarefas.length > 0 && (
                                                        <g transform={`translate(${el.x + el.largura - 36}, ${el.y - 9})`}>
                                                            <rect width="42" height="16" rx="8" fill={corBadge} />
                                                            <text x="21" y="11" textAnchor="middle" fill="#050B18" fontSize="9.5" fontWeight="800">
                                                                {mediaPct}%
                                                            </text>
                                                        </g>
                                                    )}
                                                </g>
                                            );
                                        })}

                                        {/* Sobreposição Diff da proposta selecionada */}
                                        {propostaEmRevisao && (
                                            <>
                                                {(propostaEmRevisao.diff?.inalterados || []).map((el) => (
                                                    <g key={el.id} opacity={0.45}>
                                                        <rect x={el.x} y={el.y} width={el.largura} height={el.altura} rx="6" fill="rgba(15,30,55,0.8)" stroke={el.cor} strokeWidth="1.5" />
                                                        <text x={el.x + el.largura / 2} y={el.y + el.altura / 2 + 4} textAnchor="middle" fill="#CBD5E1" fontSize="10">{el.rotulo}</text>
                                                    </g>
                                                ))}
                                                {(propostaEmRevisao.diff?.removidos || []).map((el) => (
                                                    <g key={`rem-${el.id}`}>
                                                        <rect x={el.x} y={el.y} width={el.largura} height={el.altura} rx="6" fill="rgba(255,51,102,0.18)" stroke={funcao.negado} strokeWidth="2" strokeDasharray="5 3" />
                                                        <text x={el.x + el.largura / 2} y={el.y + el.altura / 2 + 4} textAnchor="middle" fill={funcao.negado} fontSize="10.5" fontWeight="700">
                                                            Removido: {el.rotulo}
                                                        </text>
                                                    </g>
                                                ))}
                                                {(propostaEmRevisao.diff?.modificados || []).map((el) => (
                                                    <g key={`mod-${el.id}`}>
                                                        {el.anterior && (
                                                            <>
                                                                <rect x={el.anterior.x} y={el.anterior.y} width={el.anterior.largura} height={el.anterior.altura} rx="6" fill="none" stroke={funcao.alerta} strokeOpacity="0.45" strokeDasharray="4 4" />
                                                                <line
                                                                    x1={el.anterior.x + el.anterior.largura / 2}
                                                                    y1={el.anterior.y + el.anterior.altura / 2}
                                                                    x2={el.x + el.largura / 2}
                                                                    y2={el.y + el.altura / 2}
                                                                    stroke={funcao.alerta}
                                                                    strokeWidth="2"
                                                                    strokeDasharray="4 2"
                                                                />
                                                            </>
                                                        )}
                                                        <rect x={el.x} y={el.y} width={el.largura} height={el.altura} rx="6" fill="rgba(255,184,0,0.22)" stroke={funcao.alerta} strokeWidth="2.5" />
                                                        <text x={el.x + el.largura / 2} y={el.y + el.altura / 2 + 4} textAnchor="middle" fill="#FFFFFF" fontSize="10.5" fontWeight="700">
                                                            Movido: {el.rotulo}
                                                        </text>
                                                    </g>
                                                ))}
                                                {(propostaEmRevisao.diff?.adicionados || []).map((el) => (
                                                    <g key={`add-${el.id}`}>
                                                        <rect x={el.x} y={el.y} width={el.largura} height={el.altura} rx="6" fill="rgba(0,255,136,0.22)" stroke={funcao.liberado} strokeWidth="2.5" />
                                                        <text x={el.x + el.largura / 2} y={el.y + el.altura / 2 + 4} textAnchor="middle" fill={funcao.liberado} fontSize="10.5" fontWeight="700">
                                                            + {el.rotulo}
                                                        </text>
                                                    </g>
                                                ))}
                                            </>
                                        )}

                                        {/* Régua de calibração */}
                                        {pontosRegua.length >= 1 && (
                                            <circle cx={pontosRegua[0].x} cy={pontosRegua[0].y} r="5" fill={cores.primaria} />
                                        )}
                                        {pontosRegua.length === 2 && (
                                            <>
                                                <circle cx={pontosRegua[1].x} cy={pontosRegua[1].y} r="5" fill={cores.primaria} />
                                                <line x1={pontosRegua[0].x} y1={pontosRegua[0].y} x2={pontosRegua[1].x} y2={pontosRegua[1].y} stroke={cores.primaria} strokeWidth="2.5" />
                                            </>
                                        )}
                                    </svg>
                                </Box>

                                {/* Inspetor de Propriedades e Etapas de 3 Fases do Elemento / Setor selecionado */}
                                {(elementoSelecionado || setorSelecionado) ? (
                                    <GlassCard sx={{ p: 2.25, mt: 2 }}>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 1.5, mb: 2 }}>
                                            <Box>
                                                <Typography variant="h6" sx={{ color: cores.textoForte }}>
                                                    {elementoSelecionado ? elementoSelecionado.rotulo : setorSelecionado.nome}
                                                </Typography>
                                                <Typography variant="body2" sx={{ color: cores.textoSecundario }}>
                                                    {elementoSelecionado
                                                        ? `Dimensão estimada: ${(elementoSelecionado.largura / pxPorMetro).toFixed(1)} x ${(elementoSelecionado.altura / pxPorMetro).toFixed(1)} m${detectarSetorDoElemento(elementoSelecionado) ? ` • Setor: ${detectarSetorDoElemento(elementoSelecionado).nome}` : ''}`
                                                        : `Área vinculada: ${obterNomeArea(areas, setorSelecionado.area_id)}${setorSelecionado.responsavel_nome ? ` • Responsável: ${setorSelecionado.responsavel_nome}` : ''}`}
                                                </Typography>
                                            </Box>

                                            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                                <Button
                                                    size="small"
                                                    variant="outlined"
                                                    startIcon={<AddIcon />}
                                                    onClick={() => abrirModalNovaTarefaNoItem(faseInspetor)}
                                                    sx={botaoSecundario}
                                                >
                                                    Nova tarefa neste item
                                                </Button>
                                                <NeonButton
                                                    size="small"
                                                    startIcon={<PlanoFasesIcon />}
                                                    loading={salvando}
                                                    onClick={handleGerarPlano3Fases}
                                                >
                                                    Gerar plano 3 fases (Montagem, Evento e Desmontagem)
                                                </NeonButton>
                                            </Stack>
                                        </Box>

                                        {/* Editor rápido de propriedades do bloco em modo edição */}
                                        {modoEdicao && elementoSelecionado && (
                                            <Box sx={{ p: 1.5, mb: 2, borderRadius: 1.5, bgcolor: cores.fundo, border: `1px solid ${cores.borda}` }}>
                                                <Grid container spacing={1.5} alignItems="center">
                                                    <Grid item xs={12} sm={3}>
                                                        <TextField
                                                            fullWidth
                                                            size="small"
                                                            label="Nome do elemento"
                                                            value={elementoSelecionado.rotulo || ''}
                                                            onChange={(e) => atualizarElementoSelecionado({ rotulo: e.target.value })}
                                                        />
                                                    </Grid>
                                                    <Grid item xs={12} sm={3}>
                                                        <TextField
                                                            fullWidth
                                                            size="small"
                                                            label="Anotação técnica"
                                                            value={elementoSelecionado.texto || ''}
                                                            onChange={(e) => atualizarElementoSelecionado({ texto: e.target.value })}
                                                        />
                                                    </Grid>
                                                    <Grid item xs={6} sm={2}>
                                                        <Typography sx={{ fontSize: tamanhos.xs, color: cores.textoSecundario }}>
                                                            Largura: {(elementoSelecionado.largura / pxPorMetro).toFixed(1)} m
                                                        </Typography>
                                                        <Slider size="small" min={20} max={420} value={elementoSelecionado.largura} onChange={(_, v) => atualizarElementoSelecionado({ largura: v })} />
                                                    </Grid>
                                                    <Grid item xs={6} sm={2}>
                                                        <Typography sx={{ fontSize: tamanhos.xs, color: cores.textoSecundario }}>
                                                            Altura: {(elementoSelecionado.altura / pxPorMetro).toFixed(1)} m
                                                        </Typography>
                                                        <Slider size="small" min={18} max={360} value={elementoSelecionado.altura} onChange={(_, v) => atualizarElementoSelecionado({ altura: v })} />
                                                    </Grid>
                                                    <Grid item xs={12} sm={2}>
                                                        <Stack direction="row" spacing={1}>
                                                            <IconButton size="small" onClick={() => atualizarElementoSelecionado({ rotacao: ((elementoSelecionado.rotacao || 0) + 15) % 360 })} sx={acaoTabela}>
                                                                <GirarIcon fontSize="small" />
                                                            </IconButton>
                                                            <IconButton size="small" onClick={removerElementoSelecionado} sx={acaoTabelaPerigo}>
                                                                <ExcluirIcon fontSize="small" />
                                                            </IconButton>
                                                        </Stack>
                                                    </Grid>
                                                </Grid>
                                            </Box>
                                        )}

                                        {/* Abas das 3 fases do elemento selecionado */}
                                        <Stack direction="row" spacing={1} sx={{ mb: 1.5 }} flexWrap="wrap" useFlexGap>
                                            {FASES_OPERACIONAIS.map((f) => {
                                                const lista = tarefasPorFaseItem[f.valor] || [];
                                                const ativo = faseInspetor === f.valor;
                                                return (
                                                    <Chip
                                                        key={f.valor}
                                                        clickable
                                                        label={`${f.rotulo} (${lista.length})`}
                                                        onClick={() => setFaseInspetor(f.valor)}
                                                        sx={{
                                                            fontWeight: ativo ? 700 : 600,
                                                            bgcolor: ativo ? tom(f.cor, 0.22) : cores.fundo,
                                                            color: ativo ? f.cor : cores.textoSecundario,
                                                            border: `1px solid ${ativo ? f.cor : cores.borda}`
                                                        }}
                                                    />
                                                );
                                            })}
                                        </Stack>

                                        {(tarefasPorFaseItem[faseInspetor] || []).length === 0 ? (
                                            <Alert severity="info">
                                                Nenhuma tarefa na fase de {obterInfoFase(faseInspetor).rotulo} para este item. Use os botões acima para adicionar ou gerar o plano completo de 3 fases.
                                            </Alert>
                                        ) : (
                                            <Stack spacing={1.25}>
                                                {tarefasPorFaseItem[faseInspetor].map((t) => {
                                                    const st = ROTULO_STATUS_TAREFA[t.status] || ROTULO_STATUS_TAREFA.disponivel;
                                                    const sd = ROTULO_SAUDE_PRAZO[t.saude_prazo] || ROTULO_SAUDE_PRAZO.no_prazo;
                                                    const pr = ROTULO_PRIORIDADE[t.prioridade] || ROTULO_PRIORIDADE.media;
                                                    return (
                                                        <Box key={t.id} sx={{ p: 1.5, borderRadius: 1.5, bgcolor: cores.fundo, border: `1px solid ${cores.borda}` }}>
                                                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1, mb: 0.75 }}>
                                                                <Typography sx={{ fontWeight: 700, fontSize: tamanhos.md, color: cores.textoForte }}>
                                                                    {t.titulo}
                                                                </Typography>
                                                                <Stack direction="row" spacing={0.75}>
                                                                    <Chip size="small" label={pr.texto} sx={{ bgcolor: tom(pr.cor, 0.14), color: pr.cor }} />
                                                                    <Chip size="small" label={st.texto} sx={{ bgcolor: tom(st.cor, 0.14), color: st.cor, fontWeight: 600 }} />
                                                                    <Chip size="small" label={sd.texto} sx={{ bgcolor: tom(sd.cor, 0.14), color: sd.cor }} />
                                                                </Stack>
                                                            </Box>
                                                            <LinearProgress variant="determinate" value={t.percentual_concluido || 0} sx={{ height: 6, borderRadius: 3, mb: 1 }} />
                                                            <Typography sx={{ fontSize: tamanhos.xs, color: cores.textoSecundario }}>
                                                                {(t.etapas || []).length} etapa(s) • Prazo: {formatarDataHoraCurta(t.data_inicio_planejada)} até {formatarDataHoraCurta(t.data_fim_planejada)}
                                                            </Typography>
                                                        </Box>
                                                    );
                                                })}
                                            </Stack>
                                        )}
                                    </GlassCard>
                                ) : (
                                    <Alert severity="info" sx={{ mt: 2 }}>
                                        Clique em qualquer elemento ou área demarcada sobre o desenho para gerenciar as etapas de Montagem, Evento e Desmontagem.
                                    </Alert>
                                )}

                                {/* Painel de decisão do Arquiteto quando revisando proposta */}
                                {propostaEmRevisao && propostaEmRevisao.status === 'pendente' && (
                                    <GlassCard sx={{ p: 2, mt: 2 }}>
                                        <Typography variant="subtitle2" sx={{ color: cores.textoForte, mb: 0.5 }}>
                                            Revisão da proposta: {propostaEmRevisao.titulo}
                                        </Typography>
                                        <Typography variant="body2" sx={{ color: cores.textoSecundario, mb: 1.5 }}>
                                            Justificativa: {propostaEmRevisao.justificativa}
                                        </Typography>
                                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }}>
                                            <TextField
                                                fullWidth
                                                size="small"
                                                label="Parecer técnico do arquiteto"
                                                value={parecerArquiteto}
                                                onChange={(e) => setParecerArquiteto(e.target.value)}
                                            />
                                            <Button variant="outlined" onClick={() => setPropostaRevisaoId('')} sx={botaoSecundario}>
                                                Fechar diff
                                            </Button>
                                            {podePublicarOficial ? (
                                                <>
                                                    <NeonButton neonColor={funcao.negado} startIcon={<RejeitarIcon />} loading={salvando} onClick={() => handleAvaliarProposta('rejeitar')}>
                                                        Rejeitar
                                                    </NeonButton>
                                                    <NeonButton startIcon={<AprovarIcon />} loading={salvando} onClick={() => handleAvaliarProposta('aprovar')}>
                                                        Aprovar e publicar v{(versaoOficial?.numero_versao || 1) + 1}
                                                    </NeonButton>
                                                </>
                                            ) : (
                                                <Chip label="Aprovação exclusiva do Arquiteto do evento" sx={{ bgcolor: tom(funcao.alerta, 0.14), color: funcao.alerta }} />
                                            )}
                                        </Stack>
                                    </GlassCard>
                                )}
                            </Grid>
                        </Grid>
                    </>
                )}
            </GlassCard>

            {/* Projetos Técnicos e Arquivos Versionados */}
            <GlassCard sx={{ p: 2.5 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1.5 }}>
                    <Box>
                        <Typography variant="h6" sx={{ color: cores.textoForte }}>
                            Projetos técnicos e arquivos versionados
                        </Typography>
                        <Typography variant="body2" sx={{ color: cores.textoSecundario }}>
                            Suba plantas baixas, cortes e memoriais em PDF, PNG ou SVG e aplique direto sobre a prancha.
                        </Typography>
                    </Box>
                    <NeonButton startIcon={<AddIcon />} onClick={() => setModalProjetoAberto(true)}>
                        Novo projeto
                    </NeonButton>
                </Box>

                <Grid container spacing={2}>
                    {projetos.map((proj) => (
                        <Grid item xs={12} md={6} key={proj.id}>
                            <GlassCard sx={{ p: 2 }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1, mb: 1 }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <ProjetoIcon sx={{ color: funcao.acao }} />
                                        <Box>
                                            <Typography sx={{ fontWeight: 700, color: cores.textoForte }}>{proj.titulo}</Typography>
                                            <Typography sx={{ fontSize: tamanhos.xs, color: cores.textoSecundario }}>
                                                {obterNomeArea(areas, proj.area_id)} • Categoria: {proj.categoria}
                                            </Typography>
                                        </Box>
                                    </Box>
                                    <Button
                                        size="small"
                                        variant="outlined"
                                        startIcon={<ArquivoIcon />}
                                        onClick={() => setModalNovaVersaoArq({
                                            projetoId: proj.id,
                                            projetoTitulo: proj.titulo,
                                            nome_original: '',
                                            observacao: '',
                                            url_arquivo: null,
                                            tamanho_bytes: 0,
                                            largura_px: null,
                                            altura_px: null
                                        })}
                                        sx={botaoSecundario}
                                    >
                                        Nova versão
                                    </Button>
                                </Box>
                                <Typography variant="body2" sx={{ color: cores.textoSuave, mb: 1.5 }}>
                                    {proj.descricao}
                                </Typography>
                                <Stack spacing={0.75}>
                                    {(proj.arquivos || []).map((arq) => (
                                        <Box
                                            key={arq.id}
                                            sx={{
                                                px: 1.25,
                                                py: 0.75,
                                                borderRadius: 1.5,
                                                bgcolor: cores.fundo,
                                                border: `1px solid ${cores.borda}`,
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                flexWrap: 'wrap',
                                                gap: 1
                                            }}
                                        >
                                            <Box>
                                                <Typography sx={{ fontSize: tamanhos.xs, color: cores.textoForte }}>
                                                    <strong>v{arq.versao}</strong> • {arq.nome_original} ({arq.extensao})
                                                </Typography>
                                                <Typography sx={{ fontSize: tamanhos.xs, color: cores.textoSecundario }}>
                                                    {arq.observacao}
                                                </Typography>
                                            </Box>
                                            {arq.url_arquivo && (
                                                <Button
                                                    size="small"
                                                    variant="outlined"
                                                    startIcon={<UsarNaPlantaIcon />}
                                                    onClick={() => handleEnviarArquivoProjetoParaPlanta(arq)}
                                                    sx={botaoSecundario}
                                                >
                                                    Usar na planta
                                                </Button>
                                            )}
                                        </Box>
                                    ))}
                                </Stack>
                            </GlassCard>
                        </Grid>
                    ))}
                </Grid>
            </GlassCard>

            {/* MODAL: Importar projeto arquitetônico (PDF, PNG, JPG, SVG) */}
            <Dialog open={modalImportarAberto} onClose={() => setModalImportarAberto(false)} maxWidth="md" fullWidth>
                <TituloModal
                    titulo="Importar projeto dos arquitetos (PDF, PNG, JPG, SVG)"
                    subtitulo="O arquivo será aplicado ao desenho da prancha com suporte a camadas sobrepostas e páginas de PDF."
                    onFechar={() => setModalImportarAberto(false)}
                />
                <DialogContent dividers>
                    <Stack spacing={2} sx={{ pt: 0.5 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                            <NeonButton component="label" startIcon={<ArquivoIcon />} disabled={processandoArquivo}>
                                {arquivoInspecionado ? 'Trocar arquivo' : 'Selecionar PDF, PNG, JPG ou SVG'}
                                <input
                                    hidden
                                    type="file"
                                    accept=".pdf,.svg,.png,.jpg,.jpeg,.webp,application/pdf,image/*"
                                    onChange={handleSelecionarArquivoPlanta}
                                />
                            </NeonButton>
                            {processandoArquivo && <CircularProgress size={22} />}
                            {arquivoInspecionado && (
                                <Chip
                                    label={`${arquivoInspecionado.nomeArquivo} • ${arquivoInspecionado.largura}x${arquivoInspecionado.altura} px`}
                                    sx={{ bgcolor: tom(funcao.liberado, 0.14), color: funcao.liberado, fontWeight: 600 }}
                                />
                            )}
                        </Box>

                        {arquivoInspecionado && (
                            <>
                                {/* Preview visual do desenho importado */}
                                <Box
                                    sx={{
                                        borderRadius: 1.5,
                                        bgcolor: cores.fundo,
                                        border: `1px solid ${cores.borda}`,
                                        p: 1,
                                        textAlign: 'center'
                                    }}
                                >
                                    <Box
                                        component="img"
                                        src={arquivoInspecionado.imagemUrl}
                                        alt="Prévia do projeto arquitetônico"
                                        sx={{ maxWidth: '100%', maxHeight: 260, objectFit: 'contain', borderRadius: 1 }}
                                    />
                                </Box>

                                {/* Destino do arquivo */}
                                <Box>
                                    <Typography sx={{ fontSize: tamanhos.xs, color: cores.textoSecundario, mb: 0.5 }}>
                                        Como deseja usar este arquivo?
                                    </Typography>
                                    <RadioGroup
                                        row
                                        value={formImportar.destino}
                                        onChange={(e) => setFormImportar((prev) => ({
                                            ...prev,
                                            destino: e.target.value,
                                            fundoTransparente: e.target.value === 'camada_atual'
                                        }))}
                                    >
                                        {planta && <FormControlLabel value="base_atual" control={<Radio size="small" />} label="Desenho base desta prancha" />}
                                        {planta && <FormControlLabel value="camada_atual" control={<Radio size="small" />} label="Nova camada sobreposta" />}
                                        <FormControlLabel value="nova_prancha" control={<Radio size="small" />} label="Criar nova prancha" />
                                    </RadioGroup>
                                </Box>

                                {formImportar.destino === 'nova_prancha' && (
                                    <TextField
                                        fullWidth
                                        size="small"
                                        label="Título da nova prancha"
                                        value={formImportar.tituloPrancha}
                                        onChange={(e) => setFormImportar((prev) => ({ ...prev, tituloPrancha: e.target.value }))}
                                    />
                                )}

                                {formImportar.destino === 'camada_atual' && (
                                    <Grid container spacing={1.5} alignItems="center">
                                        <Grid item xs={12} sm={6}>
                                            <TextField
                                                fullWidth
                                                size="small"
                                                label="Nome da camada (ex.: Elétrica, Hidráulica)"
                                                value={formImportar.nomeCamada}
                                                onChange={(e) => setFormImportar((prev) => ({ ...prev, nomeCamada: e.target.value }))}
                                            />
                                        </Grid>
                                        <Grid item xs={12} sm={6}>
                                            <Typography sx={{ fontSize: tamanhos.xs, color: cores.textoSecundario }}>
                                                Opacidade inicial: {Math.round(formImportar.opacidade * 100)}%
                                            </Typography>
                                            <Slider
                                                size="small"
                                                min={0.1}
                                                max={1}
                                                step={0.05}
                                                value={formImportar.opacidade}
                                                onChange={(_, v) => setFormImportar((prev) => ({ ...prev, opacidade: v }))}
                                            />
                                        </Grid>
                                    </Grid>
                                )}

                                {/* Controles específicos de PDF multipágina */}
                                {arquivoInspecionado.tipo === 'pdf' && arquivoInspecionado.totalPaginas > 1 && (
                                    <Box sx={{ p: 1.5, borderRadius: 1.5, bgcolor: cores.superficieElevada, border: `1px solid ${cores.borda}` }}>
                                        <Stack spacing={1.25}>
                                            <Typography sx={{ fontSize: tamanhos.sm, fontWeight: 700, color: cores.textoForte }}>
                                                PDF com {arquivoInspecionado.totalPaginas} páginas detectadas
                                            </Typography>
                                            <Grid container spacing={1.5} alignItems="center">
                                                <Grid item xs={12} sm={6}>
                                                    <FormControl fullWidth size="small">
                                                        <InputLabel>Página para visualizar</InputLabel>
                                                        <Select
                                                            label="Página para visualizar"
                                                            value={formImportar.paginaPdf}
                                                            onChange={(e) => handleTrocarPaginaPdf(e.target.value)}
                                                        >
                                                            {Array.from({ length: arquivoInspecionado.totalPaginas }, (_, idx) => idx + 1).map((n) => (
                                                                <MenuItem key={n} value={n}>Página {n}</MenuItem>
                                                            ))}
                                                        </Select>
                                                    </FormControl>
                                                </Grid>
                                                <Grid item xs={12} sm={6}>
                                                    <FormControlLabel
                                                        control={(
                                                            <Checkbox
                                                                checked={formImportar.fundoTransparente}
                                                                onChange={(e) => {
                                                                    const transp = e.target.checked;
                                                                    setFormImportar((prev) => ({ ...prev, fundoTransparente: transp }));
                                                                    handleTrocarPaginaPdf(formImportar.paginaPdf, transp);
                                                                }}
                                                            />
                                                        )}
                                                        label="Renderizar fundo transparente (camada)"
                                                    />
                                                </Grid>
                                            </Grid>
                                            <FormControlLabel
                                                control={(
                                                    <Checkbox
                                                        checked={formImportar.importarTodasPaginasPdf}
                                                        onChange={(e) => setFormImportar((prev) => ({ ...prev, importarTodasPaginasPdf: e.target.checked }))}
                                                    />
                                                )}
                                                label={`Importar todas as ${arquivoInspecionado.totalPaginas} páginas (página 1 como base e páginas seguintes como camadas)`}
                                            />
                                        </Stack>
                                    </Box>
                                )}

                                {/* Controles específicos de SVG com camadas */}
                                {arquivoInspecionado.tipo === 'svg' && arquivoInspecionado.camadasDetectadas?.length > 0 && (
                                    <Box sx={{ p: 1.5, borderRadius: 1.5, bgcolor: cores.superficieElevada, border: `1px solid ${cores.borda}` }}>
                                        <FormControlLabel
                                            control={(
                                                <Checkbox
                                                    checked={formImportar.importarCamadasSvg}
                                                    onChange={(e) => setFormImportar((prev) => ({ ...prev, importarCamadasSvg: e.target.checked }))}
                                                />
                                            )}
                                            label={`Importar ${arquivoInspecionado.camadasDetectadas.length} camada(s) detectada(s) no SVG separadamente`}
                                        />
                                        {formImportar.importarCamadasSvg && (
                                            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
                                                {arquivoInspecionado.camadasDetectadas.map((cam) => (
                                                    <Chip
                                                        key={cam.id}
                                                        size="small"
                                                        clickable
                                                        label={cam.nome}
                                                        onClick={() => setArquivoInspecionado((prev) => ({
                                                            ...prev,
                                                            camadasDetectadas: prev.camadasDetectadas.map((c) =>
                                                                c.id === cam.id ? { ...c, selecionada: !c.selecionada } : c
                                                            )
                                                        }))}
                                                        sx={{
                                                            bgcolor: cam.selecionada ? tom(cores.primaria, 0.2) : cores.fundo,
                                                            color: cam.selecionada ? cores.primaria : cores.textoSecundario,
                                                            border: `1px solid ${cam.selecionada ? cores.primaria : cores.borda}`
                                                        }}
                                                    />
                                                ))}
                                            </Stack>
                                        )}
                                    </Box>
                                )}
                            </>
                        )}
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ px: 3, py: 2 }}>
                    <Button variant="outlined" onClick={() => setModalImportarAberto(false)} sx={botaoSecundario}>
                        Cancelar
                    </Button>
                    <NeonButton loading={salvando || processandoArquivo} onClick={handleConfirmarImportacao}>
                        Aplicar desenho na planta
                    </NeonButton>
                </DialogActions>
            </Dialog>

            {/* MODAL: Calibrar escala métrica */}
            <Dialog open={Boolean(modalEscalaInfo)} onClose={() => { setModalEscalaInfo(null); setPontosRegua([]); }} maxWidth="xs" fullWidth>
                <TituloModal
                    titulo="Calibrar escala do desenho"
                    subtitulo="Informe a distância real correspondente ao trecho marcado na planta."
                    onFechar={() => { setModalEscalaInfo(null); setPontosRegua([]); }}
                />
                <DialogContent dividers>
                    {modalEscalaInfo && (
                        <Stack spacing={2} sx={{ pt: 0.5 }}>
                            <Typography sx={{ fontSize: tamanhos.sm, color: cores.textoSecundario }}>
                                Trecho selecionado no desenho: {modalEscalaInfo.distPx} pixels.
                            </Typography>
                            <TextField
                                fullWidth
                                type="number"
                                label="Medida real em metros (ex.: 15)"
                                value={modalEscalaInfo.metros}
                                onChange={(e) => setModalEscalaInfo((prev) => ({ ...prev, metros: e.target.value }))}
                            />
                        </Stack>
                    )}
                </DialogContent>
                <DialogActions sx={{ px: 3, py: 2 }}>
                    <Button variant="outlined" onClick={() => { setModalEscalaInfo(null); setPontosRegua([]); }} sx={botaoSecundario}>
                        Cancelar
                    </Button>
                    <NeonButton onClick={handleSalvarCalibracaoEscala}>
                        Aplicar escala
                    </NeonButton>
                </DialogActions>
            </Dialog>

            {/* MODAL: Enviar proposta na planta */}
            <Dialog open={modalPropostaAberto} onClose={() => setModalPropostaAberto(false)} maxWidth="sm" fullWidth>
                <TituloModal
                    titulo="Enviar proposta de intervenção na planta"
                    subtitulo="A alteração fica vinculada ao seu perfil e aguarda aprovação do Arquiteto."
                    onFechar={() => setModalPropostaAberto(false)}
                />
                <DialogContent dividers>
                    <Stack spacing={2} sx={{ pt: 0.5 }}>
                        <TextField
                            fullWidth
                            label="Título da alteração"
                            value={formProposta.titulo}
                            onChange={(e) => setFormProposta({ ...formProposta, titulo: e.target.value })}
                        />
                        <FormControl fullWidth size="small">
                            <InputLabel>Tarefa relacionada (opcional)</InputLabel>
                            <Select
                                label="Tarefa relacionada (opcional)"
                                value={formProposta.tarefa_id}
                                onChange={(e) => setFormProposta({ ...formProposta, tarefa_id: e.target.value })}
                            >
                                <MenuItem value="">Nenhuma tarefa específica</MenuItem>
                                {tarefas.map((t) => <MenuItem key={t.id} value={t.id}>{t.titulo}</MenuItem>)}
                            </Select>
                        </FormControl>
                        <TextField
                            fullWidth
                            multiline
                            rows={3}
                            label="Justificativa técnica"
                            value={formProposta.justificativa}
                            onChange={(e) => setFormProposta({ ...formProposta, justificativa: e.target.value })}
                        />
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ px: 3, py: 2 }}>
                    <Button variant="outlined" onClick={() => setModalPropostaAberto(false)} sx={botaoSecundario}>
                        Cancelar
                    </Button>
                    <NeonButton loading={salvando} onClick={handleSalvarProposta}>
                        Salvar proposta
                    </NeonButton>
                </DialogActions>
            </Dialog>

            {/* MODAL: Nova tarefa vinculada ao elemento ou setor da planta */}
            <Dialog open={modalTarefaItemAberto} onClose={() => setModalTarefaItemAberto(false)} maxWidth="sm" fullWidth>
                <TituloModal
                    titulo="Adicionar etapas no elemento ou setor"
                    subtitulo={formTarefaItem.elemento_planta_rotulo ? `Vinculado a: ${formTarefaItem.elemento_planta_rotulo}` : ''}
                    onFechar={() => setModalTarefaItemAberto(false)}
                />
                <DialogContent dividers>
                    <Stack spacing={2} sx={{ pt: 0.5 }}>
                        <TextField
                            fullWidth
                            label="Título da atividade"
                            value={formTarefaItem.titulo}
                            onChange={(e) => setFormTarefaItem((prev) => ({ ...prev, titulo: e.target.value }))}
                        />
                        <Grid container spacing={1.5}>
                            <Grid item xs={12} sm={4}>
                                <FormControl fullWidth size="small">
                                    <InputLabel>Fase operacional</InputLabel>
                                    <Select
                                        label="Fase operacional"
                                        value={formTarefaItem.fase_operacional}
                                        onChange={(e) => setFormTarefaItem((prev) => ({ ...prev, fase_operacional: e.target.value }))}
                                    >
                                        {FASES_OPERACIONAIS.map((f) => (
                                            <MenuItem key={f.valor} value={f.valor}>{f.rotulo}</MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                            </Grid>
                            <Grid item xs={12} sm={4}>
                                <FormControl fullWidth size="small">
                                    <InputLabel>Área</InputLabel>
                                    <Select
                                        label="Área"
                                        value={formTarefaItem.area_id}
                                        onChange={(e) => setFormTarefaItem((prev) => ({ ...prev, area_id: e.target.value }))}
                                    >
                                        {areas.map((a) => <MenuItem key={a.id} value={a.id}>{a.nome}</MenuItem>)}
                                    </Select>
                                </FormControl>
                            </Grid>
                            <Grid item xs={12} sm={4}>
                                <FormControl fullWidth size="small">
                                    <InputLabel>Prioridade</InputLabel>
                                    <Select
                                        label="Prioridade"
                                        value={formTarefaItem.prioridade}
                                        onChange={(e) => setFormTarefaItem((prev) => ({ ...prev, prioridade: e.target.value }))}
                                    >
                                        <MenuItem value="baixa">Baixa</MenuItem>
                                        <MenuItem value="media">Média</MenuItem>
                                        <MenuItem value="alta">Alta</MenuItem>
                                        <MenuItem value="critica">Crítica</MenuItem>
                                    </Select>
                                </FormControl>
                            </Grid>
                        </Grid>
                        <TextField
                            fullWidth
                            multiline
                            rows={3}
                            label="Etapas do checklist (uma por linha)"
                            value={formTarefaItem.etapas_texto}
                            onChange={(e) => setFormTarefaItem((prev) => ({ ...prev, etapas_texto: e.target.value }))}
                        />
                        <Grid container spacing={1.5}>
                            <Grid item xs={12} sm={6}>
                                <TextField
                                    fullWidth
                                    size="small"
                                    type="datetime-local"
                                    label="Início planejado"
                                    InputLabelProps={{ shrink: true }}
                                    value={formTarefaItem.data_inicio_planejada}
                                    onChange={(e) => setFormTarefaItem((prev) => ({ ...prev, data_inicio_planejada: e.target.value }))}
                                />
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField
                                    fullWidth
                                    size="small"
                                    type="datetime-local"
                                    label="Prazo final"
                                    InputLabelProps={{ shrink: true }}
                                    value={formTarefaItem.data_fim_planejada}
                                    onChange={(e) => setFormTarefaItem((prev) => ({ ...prev, data_fim_planejada: e.target.value }))}
                                />
                            </Grid>
                        </Grid>
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ px: 3, py: 2 }}>
                    <Button variant="outlined" onClick={() => setModalTarefaItemAberto(false)} sx={botaoSecundario}>
                        Cancelar
                    </Button>
                    <NeonButton loading={salvando} onClick={handleSalvarTarefaNoItem}>
                        Salvar no cronograma
                    </NeonButton>
                </DialogActions>
            </Dialog>

            {/* MODAL: Novo projeto técnico com upload real */}
            <Dialog open={modalProjetoAberto} onClose={() => setModalProjetoAberto(false)} maxWidth="sm" fullWidth>
                <TituloModal
                    titulo="Novo projeto técnico"
                    subtitulo="Suba o PDF, PNG ou SVG enviado pelo arquiteto e vincule à área."
                    onFechar={() => setModalProjetoAberto(false)}
                />
                <DialogContent dividers>
                    <Stack spacing={2} sx={{ pt: 0.5 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                            <Button variant="outlined" component="label" startIcon={<ArquivoIcon />} disabled={processandoArquivo} sx={botaoSecundario}>
                                Selecionar arquivo (PDF, PNG, SVG)
                                <input hidden type="file" accept=".pdf,.svg,.png,.jpg,.jpeg,.webp,application/pdf,image/*" onChange={handleSelecionarArquivoProjetoNovo} />
                            </Button>
                            {formProjeto.nome_arquivo && (
                                <Chip size="small" label={formProjeto.nome_arquivo} sx={{ bgcolor: tom(funcao.liberado, 0.14), color: funcao.liberado }} />
                            )}
                        </Box>
                        <TextField
                            fullWidth
                            label="Título do projeto"
                            value={formProjeto.titulo}
                            onChange={(e) => setFormProjeto({ ...formProjeto, titulo: e.target.value })}
                        />
                        <Grid container spacing={1.5}>
                            <Grid item xs={12} sm={6}>
                                <FormControl fullWidth size="small">
                                    <InputLabel>Área</InputLabel>
                                    <Select
                                        label="Área"
                                        value={formProjeto.area_id}
                                        onChange={(e) => setFormProjeto({ ...formProjeto, area_id: e.target.value })}
                                    >
                                        <MenuItem value="">Geral do evento</MenuItem>
                                        {areas.map((a) => <MenuItem key={a.id} value={a.id}>{a.nome}</MenuItem>)}
                                    </Select>
                                </FormControl>
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <FormControl fullWidth size="small">
                                    <InputLabel>Categoria</InputLabel>
                                    <Select
                                        label="Categoria"
                                        value={formProjeto.categoria}
                                        onChange={(e) => setFormProjeto({ ...formProjeto, categoria: e.target.value })}
                                    >
                                        <MenuItem value="arquitetura">Arquitetura</MenuItem>
                                        <MenuItem value="estrutural">Estrutural</MenuItem>
                                        <MenuItem value="eletrica">Elétrica</MenuItem>
                                        <MenuItem value="som_luz">Som e iluminação</MenuItem>
                                        <MenuItem value="quantitativo">Lista de materiais</MenuItem>
                                    </Select>
                                </FormControl>
                            </Grid>
                        </Grid>
                        <TextField
                            fullWidth
                            multiline
                            rows={2}
                            label="Descrição"
                            value={formProjeto.descricao}
                            onChange={(e) => setFormProjeto({ ...formProjeto, descricao: e.target.value })}
                        />
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ px: 3, py: 2 }}>
                    <Button variant="outlined" onClick={() => setModalProjetoAberto(false)} sx={botaoSecundario}>
                        Cancelar
                    </Button>
                    <NeonButton loading={salvando || processandoArquivo} onClick={handleCriarProjeto}>
                        Salvar projeto
                    </NeonButton>
                </DialogActions>
            </Dialog>

            {/* MODAL: Nova versão de arquivo no projeto */}
            <Dialog open={Boolean(modalNovaVersaoArq)} onClose={() => setModalNovaVersaoArq(null)} maxWidth="xs" fullWidth>
                <TituloModal
                    titulo="Nova versão de arquivo"
                    subtitulo={modalNovaVersaoArq?.projetoTitulo || ''}
                    onFechar={() => setModalNovaVersaoArq(null)}
                />
                <DialogContent dividers>
                    {modalNovaVersaoArq && (
                        <Stack spacing={2} sx={{ pt: 0.5 }}>
                            <Button variant="outlined" component="label" startIcon={<ArquivoIcon />} disabled={processandoArquivo} sx={botaoSecundario}>
                                Selecionar arquivo revisado
                                <input hidden type="file" accept=".pdf,.svg,.png,.jpg,.jpeg,.webp,application/pdf,image/*" onChange={handleSelecionarArquivoVersao} />
                            </Button>
                            <TextField
                                fullWidth
                                size="small"
                                label="Nome do arquivo"
                                value={modalNovaVersaoArq.nome_original}
                                onChange={(e) => setModalNovaVersaoArq((prev) => ({ ...prev, nome_original: e.target.value }))}
                            />
                            <TextField
                                fullWidth
                                size="small"
                                label="Observação da revisão"
                                value={modalNovaVersaoArq.observacao}
                                onChange={(e) => setModalNovaVersaoArq((prev) => ({ ...prev, observacao: e.target.value }))}
                            />
                        </Stack>
                    )}
                </DialogContent>
                <DialogActions sx={{ px: 3, py: 2 }}>
                    <Button variant="outlined" onClick={() => setModalNovaVersaoArq(null)} sx={botaoSecundario}>
                        Cancelar
                    </Button>
                    <NeonButton loading={salvando || processandoArquivo} onClick={handleSalvarNovaVersaoArquivo}>
                        Enviar versão
                    </NeonButton>
                </DialogActions>
            </Dialog>

            {/* MODAL: Setor / Área demarcada na planta */}
            <Dialog open={modalSetorAberto} onClose={() => { setModalSetorAberto(false); setSetorEditandoId(null); }} maxWidth="sm" fullWidth>
                <TituloModal
                    titulo={setorEditandoId ? 'Editar setor demarcado' : 'Salvar área ou setor na planta'}
                    subtitulo="Vincule esta área desenhada a uma equipe de produção e cor de identificação."
                    onFechar={() => { setModalSetorAberto(false); setSetorEditandoId(null); }}
                />
                <DialogContent dividers>
                    <Stack spacing={2} sx={{ pt: 0.5 }}>
                        <TextField fullWidth label="Nome do setor" value={formSetor.nome} onChange={(e) => setFormSetor({ ...formSetor, nome: e.target.value })} />
                        <Grid container spacing={1.5}>
                            <Grid item xs={12} sm={6}>
                                <FormControl fullWidth size="small">
                                    <InputLabel>Área vinculada</InputLabel>
                                    <Select
                                        label="Área vinculada"
                                        value={formSetor.area_id}
                                        onChange={(e) => {
                                            const novaArea = areas.find((a) => a.id === e.target.value);
                                            setFormSetor({
                                                ...formSetor,
                                                area_id: e.target.value,
                                                cor_hex: novaArea?.cor || formSetor.cor_hex
                                            });
                                        }}
                                    >
                                        <MenuItem value="">Geral</MenuItem>
                                        {areas.map((a) => <MenuItem key={a.id} value={a.id}>{a.nome}</MenuItem>)}
                                    </Select>
                                </FormControl>
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField fullWidth size="small" label="Cor (hex)" value={formSetor.cor_hex} onChange={(e) => setFormSetor({ ...formSetor, cor_hex: e.target.value })} />
                            </Grid>
                        </Grid>
                        <TextField
                            fullWidth
                            size="small"
                            label="Responsável pela área"
                            value={formSetor.responsavel_nome}
                            onChange={(e) => setFormSetor({ ...formSetor, responsavel_nome: e.target.value })}
                        />
                        {Array.isArray(formSetor.poligono_coordenadas) && formSetor.poligono_coordenadas.length >= 3 ? (
                            <Alert severity="success">
                                Contorno desenhado sobre a planta com {formSetor.poligono_coordenadas.length} vértices.
                            </Alert>
                        ) : (
                            <Grid container spacing={1.5}>
                                <Grid item xs={3}><TextField fullWidth size="small" type="number" label="Posição X" value={formSetor.x} onChange={(e) => setFormSetor({ ...formSetor, x: e.target.value })} /></Grid>
                                <Grid item xs={3}><TextField fullWidth size="small" type="number" label="Posição Y" value={formSetor.y} onChange={(e) => setFormSetor({ ...formSetor, y: e.target.value })} /></Grid>
                                <Grid item xs={3}><TextField fullWidth size="small" type="number" label="Largura px" value={formSetor.largura} onChange={(e) => setFormSetor({ ...formSetor, largura: e.target.value })} /></Grid>
                                <Grid item xs={3}><TextField fullWidth size="small" type="number" label="Altura px" value={formSetor.altura} onChange={(e) => setFormSetor({ ...formSetor, altura: e.target.value })} /></Grid>
                            </Grid>
                        )}
                        {setoresAtivos.length > 0 && (
                            <Box>
                                <Typography sx={{ fontSize: tamanhos.xs, color: cores.textoSecundario, mb: 0.75 }}>Setores atuais:</Typography>
                                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                    {setoresAtivos.map((s) => (
                                        <Chip
                                            key={s.id}
                                            size="small"
                                            label={s.nome}
                                            onDelete={podeAprovarPlanta ? () => handleExcluirSetor(s.id) : undefined}
                                            sx={{ bgcolor: tom(s.cor_hex || cores.primaria, 0.14), color: s.cor_hex || cores.primaria }}
                                        />
                                    ))}
                                </Stack>
                            </Box>
                        )}
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ px: 3, py: 2 }}>
                    <Button variant="outlined" onClick={() => { setModalSetorAberto(false); setSetorEditandoId(null); }} sx={botaoSecundario}>
                        Cancelar
                    </Button>
                    {setorEditandoId && podeAprovarPlanta && (
                        <NeonButton neonColor={funcao.negado} onClick={() => { handleExcluirSetor(setorEditandoId); setModalSetorAberto(false); setSetorEditandoId(null); }}>
                            Excluir setor
                        </NeonButton>
                    )}
                    <NeonButton loading={salvando} onClick={handleSalvarSetor}>
                        Salvar setor
                    </NeonButton>
                </DialogActions>
            </Dialog>
        </Stack>
    );
};

export default AbaProjetosPlantas;
