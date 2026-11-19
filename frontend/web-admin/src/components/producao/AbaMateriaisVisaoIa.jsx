import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
    Alert,
    Box,
    Button,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    FormControl,
    FormControlLabel,
    Grid,
    IconButton,
    InputLabel,
    MenuItem,
    Select,
    Slider,
    Stack,
    Switch,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Tooltip,
    Typography
} from '@mui/material';
import {
    Add as AddIcon,
    AddAPhoto as CameraFotoIcon,
    AutoAwesome as SimularIcon,
    Check as ConfirmarIcon,
    Delete as ExcluirIcon,
    Edit as EditarIcon,
    Inventory as CatalogoIcon,
    PhotoCamera as WebcamIcon,
    PlayArrow as IniciarIaIcon,
    RestartAlt as ZerarIcon,
    Star as PrincipalIcon,
    Stop as PararIaIcon,
    SwapHoriz as MovimentarIcon,
    UploadFile as UploadVideoIcon,
    Videocam as VideoIcon
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import GlassCard from '../common/GlassCard';
import NeonButton from '../common/NeonButton';
import TituloModal from '../common/TituloModal';
import api from '../../services/api';
import { comprimirImagemCliente } from '../../services/ProducaoSyncService';
import { botaoSecundario, cores, funcao, tamanhos, tom } from '../../styles/tokens';
import {
    ACOES_MONITORAMENTO_MATERIAL,
    ANGULOS_FOTO_MATERIAL,
    CATEGORIAS_MATERIAL,
    CORES_MATERIAL,
    FORMATOS_MATERIAL,
    ROTULO_MOVIMENTACAO,
    formatarDataHoraCurta,
    obterInfoAcaoMaterial
} from './producaoHelpers';
import {
    AnalisadorVideoTracker,
    extrairAssinaturaVisualDeImagem,
    prepararAssinaturasMateriais
} from './analisadorVideoMateriais';

const ESTADO_INICIAL_MATERIAL = (areaPadrao = '') => ({
    nome: '',
    codigo_catalogo: '',
    categoria: 'box_truss',
    subtipo: '',
    dimensoes: '',
    peso_kg: '',
    fornecedor_nome: '',
    classe_deteccao_ia: '',
    quantidade_planejada: 10,
    fotos_referencia: [],
    caracteristicas: {
        cor_predominante: 'Alumínio / Prata',
        cor_hex_referencia: '#CBD5E1',
        formato_geometria: 'estrutura_vazada',
        material_composicao: '',
        unidade_medida: 'un',
        codigo_etiqueta: '',
        marcas_distintivas: '',
        palavras_chave_ia: ''
    },
    regra_monitoramento: {
        acao_ao_detectar: 'contar_entrada',
        modo_preferido: 'line_zone',
        confianca_minima: 0.65,
        area_alvo_id: areaPadrao,
        notificar_alerta: true,
        instrucao_operacional: ''
    }
});

const AbaMateriaisVisaoIa = ({ resumo, headersExtra, aoAtualizar, apiClient }) => {
    const httpClient = apiClient || api;
    const { enqueueSnackbar } = useSnackbar();
    const materiais = useMemo(() => resumo?.materiais || [], [resumo?.materiais]);
    const areas = useMemo(() => resumo?.areas || [], [resumo?.areas]);
    const sessoes = useMemo(() => resumo?.sessoes_contagem || [], [resumo?.sessoes_contagem]);
    const recebimentos = useMemo(() => resumo?.recebimentos || [], [resumo?.recebimentos]);
    const naoReconhecidos = useMemo(() => resumo?.itens_nao_reconhecidos || [], [resumo?.itens_nao_reconhecidos]);
    const movimentacoes = useMemo(() => resumo?.movimentacoes_materiais || [], [resumo?.movimentacoes_materiais]);
    const ctx = resumo?.contexto_usuario || {};

    const podeManterCatalogo = ['admin_master', 'master', 'produtor_geral', 'auditoria'].includes(ctx.papel_producao);

    const [modalMaterialAberto, setModalMaterialAberto] = useState(false);
    const [materialEditandoId, setMaterialEditandoId] = useState(null);
    const [processandoFoto, setProcessandoFoto] = useState(false);
    const [modalConferenciaAberto, setModalConferenciaAberto] = useState(false);
    const [evidenciaModalUrl, setEvidenciaModalUrl] = useState('');
    const [salvando, setSalvando] = useState(false);

    // Analisador real de vídeo / câmera (LineZone e PolygonZone)
    const canvasIaRef = useRef(null);
    const videoIaRef = useRef(null);
    const streamCameraRef = useRef(null);
    const objectUrlRef = useRef('');
    const trackerRef = useRef(null);
    if (!trackerRef.current) {
        trackerRef.current = new AnalisadorVideoTracker();
    }

    const [fonteMidia, setFonteMidia] = useState('nenhuma'); // nenhuma | video | camera | demo
    const [videoUrl, setVideoUrl] = useState('');
    const [iaRodando, setIaRodando] = useState(false);
    const [escopoMaterialId, setEscopoMaterialId] = useState('todos');
    const [modoAnalise, setModoAnalise] = useState('line_zone');
    const [linhaXRatio, setLinhaXRatio] = useState(0.55);
    const [sensibilidade, setSensibilidade] = useState(38);

    const [assinaturasMapa, setAssinaturasMapa] = useState(() => new Map());
    const [contagensAoVivo, setContagensAoVivo] = useState({});
    const [evidenciasAoVivo, setEvidenciasAoVivo] = useState({});
    const [presencaAoVivo, setPresencaAoVivo] = useState({});
    const [naoReconhecidosAoVivo, setNaoReconhecidosAoVivo] = useState([]);
    const [eventosAcao, setEventosAcao] = useState([]);

    const materiaisAlvo = useMemo(() => {
        if (escopoMaterialId === 'todos') return materiais;
        const achado = materiais.find((m) => m.id === escopoMaterialId);
        return achado ? [achado] : materiais;
    }, [materiais, escopoMaterialId]);

    const materialFocoCard = useMemo(() => (
        escopoMaterialId !== 'todos'
            ? (materiais.find((m) => m.id === escopoMaterialId) || materiais[0] || null)
            : (materiais[0] || null)
    ), [materiais, escopoMaterialId]);

    const totalContadoAoVivo = useMemo(() => (
        Object.values(contagensAoVivo).reduce((acc, item) => acc + Number(item?.quantidade || 0), 0)
    ), [contagensAoVivo]);

    const pararStreamsAtivos = useCallback(() => {
        if (streamCameraRef.current) {
            streamCameraRef.current.getTracks().forEach((t) => t.stop());
            streamCameraRef.current = null;
        }
        if (videoIaRef.current) {
            videoIaRef.current.srcObject = null;
        }
    }, []);

    useEffect(() => {
        let cancelado = false;
        prepararAssinaturasMateriais(materiais).then((mapa) => {
            if (!cancelado) setAssinaturasMapa(mapa);
        });
        return () => {
            cancelado = true;
        };
    }, [materiais]);

    useEffect(() => () => {
        pararStreamsAtivos();
        if (objectUrlRef.current) {
            URL.revokeObjectURL(objectUrlRef.current);
            objectUrlRef.current = '';
        }
    }, [pararStreamsAtivos]);

    // Conecta stream da câmera quando fonteMidia === 'camera'
    useEffect(() => {
        const video = videoIaRef.current;
        if (fonteMidia === 'camera' && video && streamCameraRef.current) {
            video.srcObject = streamCameraRef.current;
            video.play().catch(() => {});
        }
    }, [fonteMidia]);

    const desenharSobreposicaoZona = useCallback((ctx2d, largura, altura, modo, xRatio) => {
        if (modo === 'polygon_zone') {
            const x = Math.round(largura * 0.28);
            const y = Math.round(altura * 0.14);
            const w = Math.round(largura * 0.5);
            const h = Math.round(altura * 0.74);
            ctx2d.strokeStyle = cores.primaria;
            ctx2d.lineWidth = 2.5;
            ctx2d.setLineDash([8, 6]);
            ctx2d.strokeRect(x, y, w, h);
            ctx2d.setLineDash([]);
            ctx2d.fillStyle = tom(cores.primaria, 0.08);
            ctx2d.fillRect(x, y, w, h);
            ctx2d.fillStyle = cores.primaria;
            ctx2d.font = 'bold 12px Inter, sans-serif';
            ctx2d.fillText('PolygonZone (área monitorada)', x + 8, y + 18);
            return;
        }

        const linhaX = Math.round(largura * xRatio);
        ctx2d.strokeStyle = cores.primaria;
        ctx2d.lineWidth = 3;
        ctx2d.setLineDash([8, 6]);
        ctx2d.beginPath();
        ctx2d.moveTo(linhaX, 24);
        ctx2d.lineTo(linhaX, altura - 14);
        ctx2d.stroke();
        ctx2d.setLineDash([]);
        ctx2d.fillStyle = cores.primaria;
        ctx2d.font = 'bold 12px Inter, sans-serif';
        ctx2d.fillText('LineZone (corte)', Math.min(largura - 120, linhaX + 8), 38);
    }, []);

    // Loop de renderização + rastreamento real (ou demo quando solicitado)
    useEffect(() => {
        const canvas = canvasIaRef.current;
        if (!canvas) return undefined;
        const ctx2d = canvas.getContext('2d', { willReadFrequently: true });
        let rafId = null;

        const objetosDemo = [
            { id: 1, x: -20, y: 80, w: 105, h: 42, vx: 3.1, contado: false, conf: 0.94, idxMat: 0 },
            { id: 2, x: -180, y: 185, w: 112, h: 46, vx: 2.8, contado: false, conf: 0.91, idxMat: 1 },
            { id: 3, x: -330, y: 120, w: 92, h: 40, vx: 3.4, contado: false, conf: 0.89, idxMat: 2 }
        ];

        const renderizarFundoVazio = (mensagem) => {
            ctx2d.fillStyle = cores.fundo;
            ctx2d.fillRect(0, 0, canvas.width, canvas.height);
            ctx2d.strokeStyle = 'rgba(148,163,184,0.12)';
            ctx2d.lineWidth = 1;
            for (let x = 0; x < canvas.width; x += 48) {
                ctx2d.beginPath(); ctx2d.moveTo(x, 0); ctx2d.lineTo(x, canvas.height); ctx2d.stroke();
            }
            ctx2d.fillStyle = cores.textoSecundario;
            ctx2d.font = '13px Inter, sans-serif';
            ctx2d.fillText(mensagem, 16, 26);
        };

        const loop = () => {
            if (fonteMidia === 'video' || fonteMidia === 'camera') {
                const video = videoIaRef.current;
                if (video && video.readyState >= 2) {
                    if (iaRodando) {
                        const res = trackerRef.current.processarQuadro(canvas, video, {
                            materiaisAlvo,
                            assinaturasPreComputadas: assinaturasMapa,
                            modoContagem: modoAnalise,
                            linhaXRatio,
                            sensibilidade
                        });

                        desenharSobreposicaoZona(ctx2d, canvas.width, canvas.height, modoAnalise, linhaXRatio);

                        for (const tr of res.trilhasAtivas) {
                            const mat = tr.classificacao?.material;
                            const acao = mat?.regra_monitoramento?.acao_ao_detectar;
                            let corCaixa = funcao.alerta;
                            if (mat) {
                                if (acao === 'alertar_saida_indevida') corCaixa = funcao.negado;
                                else if (tr.cruzouEntrada || tr.cruzouSaida) corCaixa = funcao.liberado;
                                else corCaixa = funcao.acao;
                            }
                            const { x, y, w, h } = tr.bbox;
                            ctx2d.strokeStyle = corCaixa;
                            ctx2d.lineWidth = 2.5;
                            ctx2d.strokeRect(x, y, w, h);
                            ctx2d.fillStyle = tom(corCaixa, 0.14);
                            ctx2d.fillRect(x, y, w, h);

                            const rotulo = mat
                                ? `#${tr.id} ${mat.nome} (${Math.round((tr.classificacao?.confianca || 0) * 100)}%)`
                                : `#${tr.id} Não catalogado (${Math.round((tr.classificacao?.confianca || 0) * 100)}%)`;
                            ctx2d.fillStyle = cores.textoForte;
                            ctx2d.font = 'bold 11px Inter, sans-serif';
                            ctx2d.fillText(rotulo, x + 2, Math.max(14, y - 5));
                        }

                        setContagensAoVivo(res.contagensPorMaterial);
                        setEvidenciasAoVivo(res.evidenciasPorMaterial || {});
                        setPresencaAoVivo(res.presencaAtual || {});
                        setNaoReconhecidosAoVivo(res.naoReconhecidos || []);
                        if (res.novosEventosAcao?.length) {
                            setEventosAcao((prev) => [...res.novosEventosAcao.reverse(), ...prev].slice(0, 35));
                        }
                    } else {
                        ctx2d.drawImage(video, 0, 0, canvas.width, canvas.height);
                        desenharSobreposicaoZona(ctx2d, canvas.width, canvas.height, modoAnalise, linhaXRatio);
                    }
                } else {
                    renderizarFundoVazio('Aguardando vídeo ou câmera inicializar...');
                    desenharSobreposicaoZona(ctx2d, canvas.width, canvas.height, modoAnalise, linhaXRatio);
                }

                if (iaRodando) {
                    rafId = requestAnimationFrame(loop);
                }
                return;
            }

            if (fonteMidia === 'demo') {
                renderizarFundoVazio('Simulação demonstrativa • Motor visual + regras por material');
                desenharSobreposicaoZona(ctx2d, canvas.width, canvas.height, modoAnalise, linhaXRatio);
                const linhaX = canvas.width * linhaXRatio;

                if (iaRodando && materiaisAlvo.length > 0) {
                    for (const obj of objetosDemo) {
                        const mat = materiaisAlvo[obj.idxMat % materiaisAlvo.length];
                        const acao = mat?.regra_monitoramento?.acao_ao_detectar || 'contar_entrada';
                        obj.x += obj.vx;

                        if (!obj.contado && obj.x + obj.w / 2 >= linhaX) {
                            obj.contado = true;
                            const idMat = mat.id;
                            setContagensAoVivo((prev) => {
                                const atual = prev[idMat] || {
                                    material_id: idMat,
                                    nome: mat.nome,
                                    classe_identificada: mat.classe_deteccao_ia,
                                    quantidade: 0,
                                    somaConfianca: 0,
                                    acao_aplicada: acao
                                };
                                const novaQtd = atual.quantidade + 1;
                                const msg = acao === 'alertar_saida_indevida'
                                    ? `ALERTA DE SAÍDA INDEVIDA #${obj.id}: ${mat.nome} cruzou o perímetro.`
                                    : `Simulação #${obj.id}: +1 ${mat.nome} (${novaQtd}/${mat.quantidade_planejada || '?'}).`;
                                setEventosAcao((evPrev) => [{
                                    id: `demo-${Date.now()}-${obj.id}`,
                                    tipo: acao,
                                    material_id: idMat,
                                    material_nome: mat.nome,
                                    mensagem: msg,
                                    timestamp: new Date().toISOString(),
                                    evidencia_url: null
                                }, ...evPrev].slice(0, 35));
                                return {
                                    ...prev,
                                    [idMat]: {
                                        ...atual,
                                        quantidade: novaQtd,
                                        somaConfianca: atual.somaConfianca + obj.conf
                                    }
                                };
                            });
                        }

                        if (obj.x > canvas.width + 24) {
                            obj.x = -120;
                            obj.contado = false;
                        }

                        const cor = acao === 'alertar_saida_indevida' ? funcao.negado : (obj.contado ? funcao.liberado : funcao.alerta);
                        ctx2d.strokeStyle = cor;
                        ctx2d.lineWidth = 2;
                        ctx2d.strokeRect(obj.x, obj.y, obj.w, obj.h);
                        ctx2d.fillStyle = tom(cor, 0.16);
                        ctx2d.fillRect(obj.x, obj.y, obj.w, obj.h);
                        ctx2d.fillStyle = cores.textoForte;
                        ctx2d.font = 'bold 11px Inter, sans-serif';
                        ctx2d.fillText(`#${obj.id} ${mat.nome} ${Math.round(obj.conf * 100)}%`, obj.x + 2, obj.y - 5);
                    }
                    rafId = requestAnimationFrame(loop);
                }
                return;
            }

            renderizarFundoVazio('Selecione "Carregar vídeo", "Ligar câmera ao vivo" ou "Simulação demo"');
            desenharSobreposicaoZona(ctx2d, canvas.width, canvas.height, modoAnalise, linhaXRatio);
        };

        loop();
        return () => {
            if (rafId) cancelAnimationFrame(rafId);
        };
    }, [
        iaRodando,
        fonteMidia,
        videoUrl,
        materiaisAlvo,
        assinaturasMapa,
        modoAnalise,
        linhaXRatio,
        sensibilidade,
        desenharSobreposicaoZona
    ]);

    const handleZerarContagem = () => {
        trackerRef.current.resetar();
        setContagensAoVivo({});
        setEvidenciasAoVivo({});
        setPresencaAoVivo({});
        setNaoReconhecidosAoVivo([]);
        setEventosAcao([]);
    };

    const handleUploadVideoLocal = (evt) => {
        const file = evt.target.files?.[0];
        if (!file) return;
        evt.target.value = '';
        pararStreamsAtivos();
        if (objectUrlRef.current) {
            URL.revokeObjectURL(objectUrlRef.current);
        }
        const url = URL.createObjectURL(file);
        objectUrlRef.current = url;
        handleZerarContagem();
        setVideoUrl(url);
        setFonteMidia('video');
        setIaRodando(true);
        enqueueSnackbar(`Vídeo "${file.name}" carregado para rastreamento real.`, { variant: 'info' });
    };

    const handleAlternarCameraAoVivo = async () => {
        if (fonteMidia === 'camera') {
            pararStreamsAtivos();
            setIaRodando(false);
            setFonteMidia('nenhuma');
            return;
        }
        if (!navigator.mediaDevices?.getUserMedia) {
            enqueueSnackbar('Câmera ao vivo indisponível neste navegador ou contexto sem HTTPS.', { variant: 'warning' });
            return;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
                audio: false
            });
            streamCameraRef.current = stream;
            handleZerarContagem();
            setVideoUrl('');
            setFonteMidia('camera');
            setIaRodando(true);
            enqueueSnackbar('Câmera ao vivo iniciada no analisador de materiais.', { variant: 'success' });
        } catch (err) {
            enqueueSnackbar(err?.message || 'Não foi possível acessar a câmera.', { variant: 'error' });
        }
    };

    const handleAlternarExecucao = () => {
        const video = videoIaRef.current;
        if (fonteMidia === 'nenhuma') {
            setFonteMidia('demo');
            setIaRodando(true);
            return;
        }
        if (fonteMidia === 'video' && video) {
            if (iaRodando) video.pause();
            else video.play().catch(() => {});
        }
        setIaRodando((v) => !v);
    };

    const handleIniciarDemo = () => {
        pararStreamsAtivos();
        handleZerarContagem();
        setVideoUrl('');
        setFonteMidia('demo');
        setIaRodando(true);
    };

    const handleEnviarContagemAoVivo = async () => {
        const registros = Object.values(contagensAoVivo).filter((c) => c.quantidade > 0);
        if (registros.length === 0 && naoReconhecidosAoVivo.length === 0) {
            enqueueSnackbar('Aguarde o rastreamento registrar ao menos 1 item antes de enviar.', { variant: 'warning' });
            return;
        }

        const itensPayload = [
            ...registros.map((reg) => {
                const mat = materiais.find((m) => m.id === reg.material_id);
                const mediaConf = reg.quantidade > 0 ? Math.min(0.99, reg.somaConfianca / reg.quantidade) : 0.85;
                return {
                    material_id: reg.material_id,
                    classe_identificada: reg.classe_identificada || mat?.classe_deteccao_ia,
                    quantidade_esperada: Number(mat?.quantidade_planejada || 0),
                    quantidade_ia: reg.quantidade,
                    confianca_media: Math.round(mediaConf * 100) / 100,
                    quadro_chave_evidencia_url: evidenciasAoVivo[reg.material_id] || null,
                    acao_aplicada: reg.acao_aplicada || mat?.regra_monitoramento?.acao_ao_detectar || 'contar_entrada'
                };
            }),
            ...naoReconhecidosAoVivo.slice(0, 10).map((nr) => ({
                material_id: null,
                classe_identificada: nr.classe_identificada,
                quantidade_esperada: 0,
                quantidade_ia: 1,
                confianca_media: nr.confianca || 0.48,
                quadro_chave_evidencia_url: nr.evidencia_url || null,
                acao_aplicada: 'nao_reconhecido'
            }))
        ];

        const refMat = materiais.find((m) => m.id === registros[0]?.material_id) || materialFocoCard;
        try {
            setSalvando(true);
            await httpClient.post('/producao/materiais/conferencia-ia', {
                fornecedor_nome: refMat?.fornecedor_nome || 'Fornecedor em descarga',
                numero_nota_romaneio: `VID-${Date.now().toString().slice(-5)}`,
                origem_midia: fonteMidia === 'camera' ? 'celular_live' : 'video_gravado',
                modo_contagem: modoAnalise,
                modelo_ia_versao: fonteMidia === 'demo' ? 'simulacao-regra-v1' : 'tracker-visual-assinatura-v1',
                itens: itensPayload,
                acoes_executadas: eventosAcao.slice(0, 30)
            }, { headers: headersExtra });
            setIaRodando(false);
            enqueueSnackbar('Resultado do rastreamento enviado para conferência e auditoria.', { variant: 'success' });
            await aoAtualizar();
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Erro ao registrar conferência.', { variant: 'error' });
        } finally {
            setSalvando(false);
        }
    };

    // Estado e manipulação do modal de Cadastro / Edição visual de material
    const [formMaterial, setFormMaterial] = useState(() => ESTADO_INICIAL_MATERIAL(''));
    const [formConferencia, setFormConferencia] = useState({
        fornecedor_nome: 'Estruturas Brasil Ltda',
        numero_nota_romaneio: 'NF-005120',
        origem_midia: 'video_gravado',
        modo_contagem: 'line_zone',
        material_id: '',
        quantidade_ia: 20,
        incluir_nao_reconhecido: false,
        classe_nova: 'patola_estabilizadora_palco'
    });
    const [ajustesManuais, setAjustesManuais] = useState({});

    const abrirModalNovoMaterial = () => {
        setMaterialEditandoId(null);
        setFormMaterial(ESTADO_INICIAL_MATERIAL(areas[0]?.id || ''));
        setModalMaterialAberto(true);
    };

    const abrirModalEditarMaterial = (m) => {
        setMaterialEditandoId(m.id);
        const fotosAtuais = Array.isArray(m.fotos_referencia) && m.fotos_referencia.length > 0
            ? m.fotos_referencia
            : (m.foto_referencia_url ? [{
                id: 'principal-1',
                url: m.foto_referencia_url,
                angulo: 'frontal',
                legenda: 'Foto principal',
                principal: true,
                assinatura_visual: null
            }] : []);

        const car = m.caracteristicas || {};
        const reg = m.regra_monitoramento || {};

        setFormMaterial({
            nome: m.nome || '',
            codigo_catalogo: m.codigo_catalogo || '',
            categoria: m.categoria || 'box_truss',
            subtipo: m.subtipo || '',
            dimensoes: m.dimensoes || '',
            peso_kg: m.peso_kg ?? '',
            fornecedor_nome: m.fornecedor_nome || '',
            classe_deteccao_ia: m.classe_deteccao_ia || '',
            quantidade_planejada: m.quantidade_planejada ?? 0,
            fotos_referencia: fotosAtuais,
            caracteristicas: {
                cor_predominante: car.cor_predominante || 'Alumínio / Prata',
                cor_hex_referencia: car.cor_hex_referencia || '#CBD5E1',
                formato_geometria: car.formato_geometria || 'estrutura_vazada',
                material_composicao: car.material_composicao || '',
                unidade_medida: car.unidade_medida || 'un',
                codigo_etiqueta: car.codigo_etiqueta || '',
                marcas_distintivas: car.marcas_distintivas || '',
                palavras_chave_ia: Array.isArray(car.palavras_chave_ia)
                    ? car.palavras_chave_ia.join(', ')
                    : (car.palavras_chave_ia || '')
            },
            regra_monitoramento: {
                acao_ao_detectar: reg.acao_ao_detectar || 'contar_entrada',
                modo_preferido: reg.modo_preferido || 'line_zone',
                confianca_minima: Number(reg.confianca_minima ?? 0.65),
                area_alvo_id: reg.area_alvo_id || '',
                notificar_alerta: reg.notificar_alerta !== false,
                instrucao_operacional: reg.instrucao_operacional || ''
            }
        });
        setModalMaterialAberto(true);
    };

    const handleAdicionarFotosReferencia = async (evt) => {
        const files = Array.from(evt.target.files || []);
        evt.target.value = '';
        if (!files.length) return;

        const vagasRestantes = Math.max(0, 6 - formMaterial.fotos_referencia.length);
        if (vagasRestantes === 0) {
            enqueueSnackbar('Limite máximo de 6 fotos por material atingido.', { variant: 'warning' });
            return;
        }

        try {
            setProcessandoFoto(true);
            const selecionados = files.slice(0, vagasRestantes);
            const novas = [];

            for (const file of selecionados) {
                const url = await comprimirImagemCliente(file, 640, 0.78);
                const sig = await extrairAssinaturaVisualDeImagem(url);
                novas.push({
                    id: `foto-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                    url,
                    angulo: formMaterial.fotos_referencia.length + novas.length === 0 ? 'frontal' : 'lateral',
                    legenda: file.name.replace(/\.[^.]+$/, '').slice(0, 60),
                    principal: formMaterial.fotos_referencia.length === 0 && novas.length === 0,
                    assinatura_visual: sig,
                    adicionada_em: new Date().toISOString()
                });
            }

            setFormMaterial((prev) => ({
                ...prev,
                fotos_referencia: [...prev.fotos_referencia, ...novas]
            }));
            enqueueSnackbar(`${novas.length} foto(s) calibrada(s) para rastreamento visual.`, { variant: 'success' });
        } catch {
            enqueueSnackbar('Não foi possível processar a imagem selecionada.', { variant: 'error' });
        } finally {
            setProcessandoFoto(false);
        }
    };

    const handleDefinirFotoPrincipal = (fotoId) => {
        setFormMaterial((prev) => ({
            ...prev,
            fotos_referencia: prev.fotos_referencia.map((f) => ({ ...f, principal: f.id === fotoId }))
        }));
    };

    const handleAtualizarCampoFoto = (fotoId, campo, valor) => {
        setFormMaterial((prev) => ({
            ...prev,
            fotos_referencia: prev.fotos_referencia.map((f) => (f.id === fotoId ? { ...f, [campo]: valor } : f))
        }));
    };

    const handleRemoverFoto = (fotoId) => {
        setFormMaterial((prev) => {
            const filtradas = prev.fotos_referencia.filter((f) => f.id !== fotoId);
            if (filtradas.length > 0 && !filtradas.some((f) => f.principal)) {
                filtradas[0] = { ...filtradas[0], principal: true };
            }
            return { ...prev, fotos_referencia: filtradas };
        });
    };

    const handleSalvarMaterial = async () => {
        if (!formMaterial.nome.trim()) {
            enqueueSnackbar('Informe o nome do material.', { variant: 'warning' });
            return;
        }
        const fotoPrincipal = formMaterial.fotos_referencia.find((f) => f.principal) || formMaterial.fotos_referencia[0] || null;
        const payload = {
            ...formMaterial,
            foto_referencia_url: fotoPrincipal ? fotoPrincipal.url : null
        };

        try {
            setSalvando(true);
            if (materialEditandoId) {
                await httpClient.patch(`/producao/materiais/${materialEditandoId}`, payload, { headers: headersExtra });
                enqueueSnackbar('Material e regras de visão atualizados.', { variant: 'success' });
            } else {
                await httpClient.post('/producao/materiais', payload, { headers: headersExtra });
                enqueueSnackbar('Material cadastrado no catálogo visual.', { variant: 'success' });
            }
            setModalMaterialAberto(false);
            setMaterialEditandoId(null);
            await aoAtualizar();
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Sem permissão para salvar material.', { variant: 'error' });
        } finally {
            setSalvando(false);
        }
    };

    const handleExecutarConferenciaIa = async () => {
        const mat = materiais.find((m) => m.id === formConferencia.material_id) || materiais[0];
        if (!mat) {
            enqueueSnackbar('Cadastre ao menos um material antes de conferir.', { variant: 'warning' });
            return;
        }
        const itens = [
            {
                material_id: mat.id,
                classe_identificada: mat.classe_deteccao_ia,
                quantidade_esperada: mat.quantidade_planejada,
                quantidade_ia: Number(formConferencia.quantidade_ia || 0),
                confianca_media: 0.93
            }
        ];
        if (formConferencia.incluir_nao_reconhecido && formConferencia.classe_nova.trim()) {
            itens.push({
                material_id: null,
                classe_identificada: formConferencia.classe_nova.trim(),
                quantidade_esperada: 0,
                quantidade_ia: 6,
                confianca_media: 0.79
            });
        }
        try {
            setSalvando(true);
            await httpClient.post('/producao/materiais/conferencia-ia', {
                fornecedor_nome: formConferencia.fornecedor_nome,
                numero_nota_romaneio: formConferencia.numero_nota_romaneio,
                origem_midia: formConferencia.origem_midia,
                modo_contagem: formConferencia.modo_contagem,
                itens
            }, { headers: headersExtra });
            enqueueSnackbar('Contagem por vídeo concluída. Revise as quantidades abaixo.', { variant: 'success' });
            setModalConferenciaAberto(false);
            await aoAtualizar();
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Erro ao processar conferência IA.', { variant: 'error' });
        } finally {
            setSalvando(false);
        }
    };

    const handleConfirmarContagem = async (sessaoId, item) => {
        const valor = ajustesManuais[item.id] !== undefined ? Number(ajustesManuais[item.id]) : item.quantidade_ia;
        try {
            await httpClient.post(`/producao/materiais/sessoes/${sessaoId}/itens/${item.id}/confirmar`, {
                quantidade_corrigida_humano: valor,
                justificativa_correcao: valor !== item.quantidade_ia ? 'Ajuste humano de auditoria (retreino)' : 'Confirmado conforme contagem IA'
            }, { headers: headersExtra });
            enqueueSnackbar('Contagem confirmada e estoque atualizado.', { variant: 'success' });
            await aoAtualizar();
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Erro ao confirmar contagem.', { variant: 'error' });
        }
    };

    const handleCatalogarNaoReconhecido = async (item) => {
        try {
            await httpClient.post(`/producao/materiais/nao-reconhecidos/${item.id}/cadastrar`, {
                nome: item.classe_identificada.replace(/_/g, ' '),
                categoria: 'outros',
                foto_referencia_url: item.quadro_chave_evidencia_url || null,
                quantidade_planejada: item.quantidade_ia
            }, { headers: headersExtra });
            enqueueSnackbar('Novo material incorporado ao catálogo oficial. Você já pode completar fotos e características em Editar.', { variant: 'success' });
            await aoAtualizar();
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Apenas Auditoria ou Produtor Geral pode catalogar.', { variant: 'error' });
        }
    };

    const handleMovimentar = async (materialId, novoEstagio) => {
        try {
            await httpClient.post(`/producao/materiais/${materialId}/movimentar`, { estagio_novo: novoEstagio }, { headers: headersExtra });
            enqueueSnackbar('Movimentação de material registrada.', { variant: 'success' });
            await aoAtualizar();
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Erro ao atualizar movimentação.', { variant: 'error' });
        }
    };

    const infoAcaoModal = obterInfoAcaoMaterial(formMaterial.regra_monitoramento.acao_ao_detectar);

    return (
        <Stack spacing={3}>
            {/* Cabeçalho de ações */}
            <GlassCard sx={{ p: 2.25 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1.5 }}>
                    <Box>
                        <Typography variant="h6" sx={{ color: cores.textoForte }}>
                            Materiais, ficha visual e monitoramento por vídeo
                        </Typography>
                        <Typography variant="body2" sx={{ color: cores.textoSecundario }}>
                            Cadastre fotos e características dos objetos para o sistema identificá-los nos vídeos e executar contagens, presenças ou alertas.
                        </Typography>
                    </Box>
                    <Stack direction="row" spacing={1.5} flexWrap="wrap">
                        {podeManterCatalogo && (
                            <Button variant="outlined" startIcon={<AddIcon />} onClick={abrirModalNovoMaterial} sx={botaoSecundario}>
                                Cadastrar material
                            </Button>
                        )}
                        <NeonButton startIcon={<VideoIcon />} onClick={() => setModalConferenciaAberto(true)}>
                            Registrar conferência manual / romaneio
                        </NeonButton>
                    </Stack>
                </Box>
            </GlassCard>

            {/* Analisador real de vídeo / câmera com assinatura visual e execução de regras */}
            <GlassCard sx={{ p: 2.5 }}>
                <Grid container spacing={2.5} alignItems="flex-start">
                    <Grid item xs={12} lg={7}>
                        <Stack spacing={1.5}>
                            <Box sx={{ borderRadius: 2, overflow: 'hidden', border: `1px solid ${iaRodando ? cores.primaria : cores.borda}`, bgcolor: cores.fundo }}>
                                <video
                                    ref={videoIaRef}
                                    src={fonteMidia === 'video' ? videoUrl : undefined}
                                    autoPlay
                                    muted
                                    loop={fonteMidia === 'video'}
                                    playsInline
                                    style={{ display: 'none' }}
                                />
                                <canvas ref={canvasIaRef} width={640} height={360} style={{ width: '100%', height: 'auto', display: 'block' }} />
                            </Box>

                            <Grid container spacing={1.5} alignItems="center">
                                <Grid item xs={12} sm={4}>
                                    <FormControl fullWidth size="small">
                                        <InputLabel>Zona no vídeo</InputLabel>
                                        <Select label="Zona no vídeo" value={modoAnalise} onChange={(e) => setModoAnalise(e.target.value)}>
                                            <MenuItem value="line_zone">Linha de corte (LineZone)</MenuItem>
                                            <MenuItem value="polygon_zone">Área demarcada (PolygonZone)</MenuItem>
                                        </Select>
                                    </FormControl>
                                </Grid>
                                <Grid item xs={12} sm={4}>
                                    <Typography sx={{ fontSize: tamanhos.xs, color: cores.textoSecundario }}>
                                        Posição da linha: {Math.round(linhaXRatio * 100)}%
                                    </Typography>
                                    <Slider
                                        size="small"
                                        min={15}
                                        max={85}
                                        value={Math.round(linhaXRatio * 100)}
                                        onChange={(_, v) => setLinhaXRatio(Number(v) / 100)}
                                    />
                                </Grid>
                                <Grid item xs={12} sm={4}>
                                    <Typography sx={{ fontSize: tamanhos.xs, color: cores.textoSecundario }}>
                                        Sensibilidade movimento: {sensibilidade}
                                    </Typography>
                                    <Slider
                                        size="small"
                                        min={15}
                                        max={60}
                                        value={sensibilidade}
                                        onChange={(_, v) => setSensibilidade(Number(v))}
                                    />
                                </Grid>
                            </Grid>
                        </Stack>
                    </Grid>

                    <Grid item xs={12} lg={5}>
                        <Stack spacing={1.5}>
                            <Typography variant="subtitle1" sx={{ color: cores.textoForte, fontWeight: 700 }}>
                                Rastreador em tempo real (vídeo gravado ou câmera)
                            </Typography>

                            <FormControl fullWidth size="small">
                                <InputLabel>Alvo de busca no vídeo</InputLabel>
                                <Select
                                    label="Alvo de busca no vídeo"
                                    value={escopoMaterialId}
                                    onChange={(e) => setEscopoMaterialId(e.target.value)}
                                >
                                    <MenuItem value="todos">Todos os materiais do catálogo ({materiais.length})</MenuItem>
                                    {materiais.map((m) => <MenuItem key={m.id} value={m.id}>{m.nome}</MenuItem>)}
                                </Select>
                            </FormControl>

                            {materialFocoCard && (
                                <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: cores.superficieElevada, border: `1px solid ${cores.borda}`, display: 'flex', gap: 1.5, alignItems: 'center' }}>
                                    {materialFocoCard.foto_referencia_url ? (
                                        <Box
                                            component="img"
                                            src={materialFocoCard.foto_referencia_url}
                                            alt={materialFocoCard.nome}
                                            sx={{ width: 58, height: 58, borderRadius: 1.5, objectFit: 'cover', flexShrink: 0, border: `1px solid ${cores.borda}` }}
                                        />
                                    ) : (
                                        <Box sx={{ width: 58, height: 58, borderRadius: 1.5, bgcolor: cores.superficie, border: `1px dashed ${cores.borda}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                            <CatalogoIcon sx={{ color: cores.textoSecundario }} />
                                        </Box>
                                    )}
                                    <Box sx={{ minWidth: 0, flex: 1 }}>
                                        <Typography sx={{ fontSize: tamanhos.sm, fontWeight: 700, color: cores.textoForte }} noWrap>
                                            {escopoMaterialId === 'todos' ? `Exemplo ativo: ${materialFocoCard.nome}` : materialFocoCard.nome}
                                        </Typography>
                                        <Typography sx={{ fontSize: tamanhos.xs, color: cores.textoSecundario }}>
                                            {materialFocoCard.caracteristicas?.cor_predominante || 'Cor padrão'} • {materialFocoCard.dimensoes || materialFocoCard.subtipo || 'Sem dimensões'}
                                        </Typography>
                                        <Chip
                                            size="small"
                                            label={obterInfoAcaoMaterial(materialFocoCard.regra_monitoramento?.acao_ao_detectar).rotulo}
                                            sx={{
                                                mt: 0.5,
                                                bgcolor: tom(obterInfoAcaoMaterial(materialFocoCard.regra_monitoramento?.acao_ao_detectar).cor, 0.14),
                                                color: obterInfoAcaoMaterial(materialFocoCard.regra_monitoramento?.acao_ao_detectar).cor,
                                                fontWeight: 600
                                            }}
                                        />
                                    </Box>
                                </Box>
                            )}

                            <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: cores.superficieElevada, border: `1px solid ${cores.borda}` }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                                    <Typography sx={{ fontSize: tamanhos.sm, color: cores.textoSecundario }}>
                                        Total rastreado nesta análise:
                                    </Typography>
                                    <Typography variant="h5" sx={{ color: funcao.liberado, fontWeight: 700 }}>
                                        {totalContadoAoVivo} un.
                                    </Typography>
                                </Box>
                                <Stack spacing={0.75}>
                                    {Object.values(contagensAoVivo).map((reg) => {
                                        const mat = materiais.find((m) => m.id === reg.material_id);
                                        const pres = presencaAoVivo[reg.material_id] || 0;
                                        return (
                                            <Box key={reg.material_id} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <Typography sx={{ fontSize: tamanhos.xs, color: cores.textoForte }}>
                                                    {reg.nome} {pres > 0 ? `• na zona: ${pres}` : ''}
                                                </Typography>
                                                <Chip
                                                    size="small"
                                                    label={`${reg.quantidade} / ${mat?.quantidade_planejada || '?'} un.`}
                                                    sx={{ bgcolor: tom(funcao.liberado, 0.14), color: funcao.liberado, fontWeight: 700 }}
                                                />
                                            </Box>
                                        );
                                    })}
                                    {naoReconhecidosAoVivo.length > 0 && (
                                        <Typography sx={{ fontSize: tamanhos.xs, color: funcao.alerta, fontWeight: 600 }}>
                                            +{naoReconhecidosAoVivo.length} item(ns) não reconhecido(s) capturado(s)
                                        </Typography>
                                    )}
                                </Stack>
                            </Box>

                            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                <Button component="label" variant="outlined" size="small" startIcon={<UploadVideoIcon />} sx={botaoSecundario}>
                                    Carregar vídeo
                                    <input type="file" accept="video/*" hidden onChange={handleUploadVideoLocal} />
                                </Button>
                                <Button variant="outlined" size="small" startIcon={<WebcamIcon />} onClick={handleAlternarCameraAoVivo} sx={botaoSecundario}>
                                    {fonteMidia === 'camera' ? 'Parar câmera' : 'Câmera ao vivo'}
                                </Button>
                                <Button variant="outlined" size="small" startIcon={iaRodando ? <PararIaIcon /> : <IniciarIaIcon />} onClick={handleAlternarExecucao} sx={botaoSecundario}>
                                    {iaRodando ? 'Pausar' : 'Analisar'}
                                </Button>
                                <Button variant="outlined" size="small" startIcon={<SimularIcon />} onClick={handleIniciarDemo} sx={botaoSecundario}>
                                    Simulação demo
                                </Button>
                                <Button variant="outlined" size="small" startIcon={<ZerarIcon />} onClick={handleZerarContagem} sx={botaoSecundario}>
                                    Zerar
                                </Button>
                            </Stack>

                            <NeonButton size="small" loading={salvando} onClick={handleEnviarContagemAoVivo}>
                                Enviar resultado para conferência
                            </NeonButton>

                            {eventosAcao.length > 0 && (
                                <Box sx={{ maxHeight: 160, overflowY: 'auto', p: 1.25, borderRadius: 2, bgcolor: cores.fundo, border: `1px solid ${cores.borda}` }}>
                                    <Typography sx={{ fontSize: tamanhos.xs, fontWeight: 700, color: cores.textoSecundario, mb: 0.75 }}>
                                        Ações executadas pelo monitoramento ({eventosAcao.length})
                                    </Typography>
                                    <Stack spacing={0.75}>
                                        {eventosAcao.slice(0, 8).map((ev) => {
                                            const cor = ev.tipo === 'alertar_saida_indevida'
                                                ? funcao.negado
                                                : (ev.tipo === 'alertar_divergencia' || ev.tipo === 'nao_reconhecido' ? funcao.alerta : funcao.liberado);
                                            return (
                                                <Box key={ev.id} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                    {ev.evidencia_url && (
                                                        <Box
                                                            component="img"
                                                            src={ev.evidencia_url}
                                                            alt="Evidência"
                                                            onClick={() => setEvidenciaModalUrl(ev.evidencia_url)}
                                                            sx={{ width: 36, height: 26, borderRadius: 0.75, objectFit: 'cover', cursor: 'pointer', flexShrink: 0 }}
                                                        />
                                                    )}
                                                    <Typography sx={{ fontSize: tamanhos.xs, color: cor }}>
                                                        {ev.mensagem}
                                                    </Typography>
                                                </Box>
                                            );
                                        })}
                                    </Stack>
                                </Box>
                            )}
                        </Stack>
                    </Grid>
                </Grid>
            </GlassCard>

            {/* Itens não reconhecidos para cadastro pela Auditoria */}
            {naoReconhecidos.length > 0 && (
                <Alert severity="warning">
                    <Typography sx={{ fontWeight: 700, mb: 1 }}>
                        Novos materiais não reconhecidos aguardando cadastro pela Auditoria ({naoReconhecidos.length})
                    </Typography>
                    <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
                        {naoReconhecidos.map((nr) => (
                            <Box
                                key={nr.id}
                                sx={{
                                    p: 1.25, borderRadius: 1.5, bgcolor: cores.superficie,
                                    border: `1px solid ${cores.borda}`, display: 'flex', alignItems: 'center', gap: 1.5
                                }}
                            >
                                {nr.quadro_chave_evidencia_url && (
                                    <Box
                                        component="img"
                                        src={nr.quadro_chave_evidencia_url}
                                        alt={nr.classe_identificada}
                                        onClick={() => setEvidenciaModalUrl(nr.quadro_chave_evidencia_url)}
                                        sx={{ width: 44, height: 34, borderRadius: 1, objectFit: 'cover', cursor: 'pointer' }}
                                    />
                                )}
                                <Box>
                                    <Typography sx={{ fontSize: tamanhos.sm, fontWeight: 700, color: cores.textoForte }}>
                                        {nr.classe_identificada}
                                    </Typography>
                                    <Typography sx={{ fontSize: tamanhos.xs, color: cores.textoSecundario }}>
                                        Contados: {nr.quantidade_ia} • Confiança {Math.round((nr.confianca_media || 0) * 100)}%
                                    </Typography>
                                </Box>
                                {podeManterCatalogo && (
                                    <Button size="small" variant="outlined" onClick={() => handleCatalogarNaoReconhecido(nr)} sx={botaoSecundario}>
                                        Catalogar
                                    </Button>
                                )}
                            </Box>
                        ))}
                    </Stack>
                </Alert>
            )}

            {/* Sessões de Conferência IA */}
            <GlassCard sx={{ p: 2.5 }}>
                <Typography variant="h6" sx={{ color: cores.textoForte, mb: 1.5 }}>
                    Conferências de recebimento (esperado × contado IA × revisão humana)
                </Typography>
                <Stack spacing={2}>
                    {sessoes.map((sessao) => {
                        const rec = recebimentos.find((r) => r.id === sessao.recebimento_id);
                        return (
                            <Box key={sessao.id} sx={{ p: 2, borderRadius: 2, border: `1px solid ${cores.borda}`, bgcolor: cores.superficieElevada }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1, mb: 1.5 }}>
                                    <Box>
                                        <Typography sx={{ fontWeight: 700, color: cores.textoForte }}>
                                            {rec?.numero_nota_romaneio || 'Romaneio'} — {rec?.fornecedor_nome || 'Fornecedor'}
                                        </Typography>
                                        <Typography sx={{ fontSize: tamanhos.xs, color: cores.textoSecundario }}>
                                            Modelo: {sessao.modelo_ia_versao} • Modo: {sessao.modo_contagem} • {formatarDataHoraCurta(sessao.iniciado_em)}
                                        </Typography>
                                    </Box>
                                    <Chip
                                        size="small"
                                        label={rec?.status === 'aprovado_total' ? 'Aprovado sem divergência' : rec?.status === 'aprovado_divergencia' ? 'Aprovado com divergência' : 'Em conferência'}
                                        sx={{
                                            bgcolor: tom(rec?.status === 'aprovado_total' ? funcao.liberado : funcao.alerta, 0.14),
                                            color: rec?.status === 'aprovado_total' ? funcao.liberado : funcao.alerta,
                                            fontWeight: 600
                                        }}
                                    />
                                </Box>

                                {Array.isArray(sessao.acoes_executadas) && sessao.acoes_executadas.length > 0 && (
                                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
                                        {sessao.acoes_executadas.slice(0, 6).map((ac) => (
                                            <Chip
                                                key={ac.id}
                                                size="small"
                                                label={ac.mensagem}
                                                sx={{
                                                    bgcolor: tom(obterInfoAcaoMaterial(ac.tipo).cor, 0.12),
                                                    color: obterInfoAcaoMaterial(ac.tipo).cor
                                                }}
                                            />
                                        ))}
                                    </Stack>
                                )}

                                <TableContainer>
                                    <Table size="small">
                                        <TableHead>
                                            <TableRow>
                                                <TableCell>Evidência</TableCell>
                                                <TableCell>Item / Classe</TableCell>
                                                <TableCell align="right">Esperado</TableCell>
                                                <TableCell align="right">Contado IA</TableCell>
                                                <TableCell align="right">Confiança</TableCell>
                                                <TableCell align="right">Ajuste humano</TableCell>
                                                <TableCell align="right">Divergência</TableCell>
                                                <TableCell align="right">Ação</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {(sessao.itens_contados || []).map((item) => {
                                                const mat = materiais.find((m) => m.id === item.material_id);
                                                const finalVal = ajustesManuais[item.id] !== undefined
                                                    ? Number(ajustesManuais[item.id])
                                                    : (item.quantidade_corrigida_humano ?? item.quantidade_ia);
                                                const div = finalVal - Number(item.quantidade_esperada || 0);
                                                return (
                                                    <TableRow key={item.id}>
                                                        <TableCell sx={{ width: 64 }}>
                                                            {item.quadro_chave_evidencia_url ? (
                                                                <Box
                                                                    component="img"
                                                                    src={item.quadro_chave_evidencia_url}
                                                                    alt={item.classe_identificada}
                                                                    onClick={() => setEvidenciaModalUrl(item.quadro_chave_evidencia_url)}
                                                                    sx={{ width: 48, height: 34, borderRadius: 1, objectFit: 'cover', cursor: 'pointer', border: `1px solid ${cores.borda}` }}
                                                                />
                                                            ) : '—'}
                                                        </TableCell>
                                                        <TableCell>
                                                            <Typography sx={{ fontWeight: 600, fontSize: tamanhos.sm }}>
                                                                {mat?.nome || item.classe_identificada}
                                                            </Typography>
                                                            {!item.reconhecido_catalogo && (
                                                                <Chip size="small" label="Não catalogado" sx={{ bgcolor: tom(funcao.alerta, 0.14), color: funcao.alerta }} />
                                                            )}
                                                        </TableCell>
                                                        <TableCell align="right">{item.quantidade_esperada}</TableCell>
                                                        <TableCell align="right">{item.quantidade_ia}</TableCell>
                                                        <TableCell align="right">{Math.round((item.confianca_media || 0) * 100)}%</TableCell>
                                                        <TableCell align="right">
                                                            <TextField
                                                                type="number"
                                                                size="small"
                                                                value={finalVal}
                                                                onChange={(e) => setAjustesManuais((prev) => ({ ...prev, [item.id]: e.target.value }))}
                                                                sx={{ width: 80 }}
                                                            />
                                                        </TableCell>
                                                        <TableCell align="right">
                                                            <Typography sx={{ fontWeight: 700, color: div === 0 ? funcao.liberado : funcao.negado }}>
                                                                {div > 0 ? `+${div}` : div}
                                                            </Typography>
                                                        </TableCell>
                                                        <TableCell align="right">
                                                            <Button
                                                                size="small"
                                                                variant="outlined"
                                                                startIcon={<ConfirmarIcon />}
                                                                onClick={() => handleConfirmarContagem(sessao.id, item)}
                                                                sx={botaoSecundario}
                                                            >
                                                                Confirmar
                                                            </Button>
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            </Box>
                        );
                    })}
                </Stack>
            </GlassCard>

            {/* Catálogo visual completo e Rastreio de Movimentação */}
            <GlassCard sx={{ p: 2.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                    <CatalogoIcon sx={{ color: funcao.acao }} />
                    <Typography variant="h6" sx={{ color: cores.textoForte }}>
                        Catálogo visual, características e rastreio de movimentação
                    </Typography>
                </Box>
                <TableContainer>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>Foto</TableCell>
                                <TableCell>Código</TableCell>
                                <TableCell>Material e características</TableCell>
                                <TableCell>Ação no vídeo</TableCell>
                                <TableCell align="right">Previsto / Rec.</TableCell>
                                <TableCell>Estágio atual</TableCell>
                                <TableCell>Movimentar / Editar</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {materiais.map((m) => {
                                const infoAcao = obterInfoAcaoMaterial(m.regra_monitoramento?.acao_ao_detectar);
                                const totalFotos = Array.isArray(m.fotos_referencia) && m.fotos_referencia.length > 0
                                    ? m.fotos_referencia.length
                                    : (m.foto_referencia_url ? 1 : 0);
                                const corHex = m.caracteristicas?.cor_hex_referencia;
                                return (
                                    <TableRow key={m.id}>
                                        <TableCell sx={{ width: 68 }}>
                                            {m.foto_referencia_url ? (
                                                <Box
                                                    component="img"
                                                    src={m.foto_referencia_url}
                                                    alt={m.nome}
                                                    onClick={() => setEvidenciaModalUrl(m.foto_referencia_url)}
                                                    sx={{ width: 48, height: 40, borderRadius: 1, objectFit: 'cover', cursor: 'pointer', border: `1px solid ${cores.borda}` }}
                                                />
                                            ) : (
                                                <Box sx={{ width: 48, height: 40, borderRadius: 1, bgcolor: cores.superficieElevada, border: `1px dashed ${cores.borda}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <CatalogoIcon sx={{ fontSize: 18, color: cores.textoFraco }} />
                                                </Box>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <Typography sx={{ fontSize: tamanhos.sm, fontWeight: 600 }}>{m.codigo_catalogo}</Typography>
                                            {totalFotos > 0 && (
                                                <Typography sx={{ fontSize: tamanhos.xs, color: cores.textoSecundario }}>
                                                    {totalFotos} foto(s)
                                                </Typography>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                                                {corHex && (
                                                    <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: corHex, border: `1px solid ${cores.borda}`, flexShrink: 0 }} />
                                                )}
                                                <Typography sx={{ fontWeight: 600, fontSize: tamanhos.sm, color: cores.textoForte }}>
                                                    {m.nome}
                                                </Typography>
                                            </Box>
                                            <Typography sx={{ fontSize: tamanhos.xs, color: cores.textoSecundario }}>
                                                {[m.caracteristicas?.cor_predominante, m.dimensoes || m.subtipo, m.peso_kg ? `${m.peso_kg} kg` : ''].filter(Boolean).join(' • ')}
                                            </Typography>
                                            {m.caracteristicas?.marcas_distintivas && (
                                                <Typography sx={{ fontSize: tamanhos.xs, color: cores.textoFraco }} noWrap>
                                                    {m.caracteristicas.marcas_distintivas}
                                                </Typography>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <Chip
                                                size="small"
                                                label={infoAcao.rotulo}
                                                sx={{ bgcolor: tom(infoAcao.cor, 0.14), color: infoAcao.cor, fontWeight: 600 }}
                                            />
                                        </TableCell>
                                        <TableCell align="right">
                                            {m.quantidade_planejada} / {m.quantidade_recebida} {m.caracteristicas?.unidade_medida || 'un'}
                                        </TableCell>
                                        <TableCell>
                                            <Chip
                                                size="small"
                                                label={ROTULO_MOVIMENTACAO.find((r) => r.valor === m.status_movimentacao)?.texto || m.status_movimentacao}
                                                sx={{ bgcolor: tom(funcao.acao, 0.14), color: funcao.acao, fontWeight: 600 }}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <Stack direction="row" spacing={1} alignItems="center">
                                                <MovimentarIcon sx={{ fontSize: 16, color: cores.textoSecundario }} />
                                                <Select
                                                    size="small"
                                                    value={m.status_movimentacao || 'previsto'}
                                                    onChange={(e) => handleMovimentar(m.id, e.target.value)}
                                                >
                                                    {ROTULO_MOVIMENTACAO.map((r) => (
                                                        <MenuItem key={r.valor} value={r.valor}>{r.texto}</MenuItem>
                                                    ))}
                                                </Select>
                                                {podeManterCatalogo && (
                                                    <Tooltip title="Editar fotos, características e regra de vídeo">
                                                        <IconButton size="small" onClick={() => abrirModalEditarMaterial(m)}>
                                                            <EditarIcon fontSize="small" />
                                                        </IconButton>
                                                    </Tooltip>
                                                )}
                                            </Stack>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </TableContainer>
            </GlassCard>

            {/* Histórico de movimentações de estoque */}
            <GlassCard sx={{ p: 2.5 }}>
                <Typography variant="h6" sx={{ color: cores.textoForte, mb: 1.5 }}>
                    Histórico de movimentações de materiais ({movimentacoes.length})
                </Typography>
                <TableContainer>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>Data e hora</TableCell>
                                <TableCell>Material</TableCell>
                                <TableCell>De</TableCell>
                                <TableCell>Para</TableCell>
                                <TableCell>Setor destino</TableCell>
                                <TableCell align="right">Quantidade</TableCell>
                                <TableCell>Responsável</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {movimentacoes.map((mv) => {
                                const mat = materiais.find((m) => m.id === mv.material_id);
                                return (
                                    <TableRow key={mv.id}>
                                        <TableCell>{formatarDataHoraCurta(mv.criado_em)}</TableCell>
                                        <TableCell sx={{ fontWeight: 600 }}>{mat?.nome || 'Material'}</TableCell>
                                        <TableCell>{ROTULO_MOVIMENTACAO.find((r) => r.valor === mv.estagio_anterior)?.texto || mv.estagio_anterior || '—'}</TableCell>
                                        <TableCell>
                                            <Chip size="small" label={ROTULO_MOVIMENTACAO.find((r) => r.valor === mv.estagio_novo)?.texto || mv.estagio_novo} sx={{ bgcolor: tom(funcao.liberado, 0.14), color: funcao.liberado, fontWeight: 600 }} />
                                        </TableCell>
                                        <TableCell>{mv.setor_destino || '—'}</TableCell>
                                        <TableCell align="right">{mv.quantidade}</TableCell>
                                        <TableCell>{mv.registrado_por_nome || 'Equipe'}</TableCell>
                                    </TableRow>
                                );
                            })}
                            {movimentacoes.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={7} align="center">
                                        Nenhuma movimentação registrada ainda.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
            </GlassCard>

            {/* Modal cadastrar / editar material completo */}
            <Dialog open={modalMaterialAberto} onClose={() => setModalMaterialAberto(false)} maxWidth="md" fullWidth>
                <TituloModal
                    titulo={materialEditandoId ? 'Editar ficha visual do material' : 'Cadastrar material com ficha visual'}
                    subtitulo="Adicione fotos em múltiplos ângulos, características visuais e a ação que o rastreamento por vídeo deve executar."
                    onFechar={() => setModalMaterialAberto(false)}
                />
                <DialogContent dividers>
                    <Stack spacing={2.5} sx={{ pt: 0.5 }}>
                        {/* Seção 1: Identificação e estoque */}
                        <Box>
                            <Typography sx={{ fontSize: tamanhos.sm, fontWeight: 700, color: cores.primaria, mb: 1.25 }}>
                                1. Identificação e especificações
                            </Typography>
                            <Grid container spacing={1.5}>
                                <Grid item xs={12} sm={8}>
                                    <TextField
                                        fullWidth
                                        size="small"
                                        label="Nome do material / equipamento"
                                        value={formMaterial.nome}
                                        onChange={(e) => setFormMaterial({ ...formMaterial, nome: e.target.value })}
                                    />
                                </Grid>
                                <Grid item xs={12} sm={4}>
                                    <TextField
                                        fullWidth
                                        size="small"
                                        label="Código no catálogo (ex.: TR-Q30)"
                                        value={formMaterial.codigo_catalogo}
                                        onChange={(e) => setFormMaterial({ ...formMaterial, codigo_catalogo: e.target.value })}
                                    />
                                </Grid>
                                <Grid item xs={12} sm={4}>
                                    <FormControl fullWidth size="small">
                                        <InputLabel>Categoria</InputLabel>
                                        <Select
                                            label="Categoria"
                                            value={formMaterial.categoria}
                                            onChange={(e) => setFormMaterial({ ...formMaterial, categoria: e.target.value })}
                                        >
                                            {CATEGORIAS_MATERIAL.map((cat) => (
                                                <MenuItem key={cat.valor} value={cat.valor}>{cat.rotulo}</MenuItem>
                                            ))}
                                        </Select>
                                    </FormControl>
                                </Grid>
                                <Grid item xs={12} sm={4}>
                                    <TextField
                                        fullWidth
                                        size="small"
                                        label="Subtipo / Modelo"
                                        value={formMaterial.subtipo}
                                        onChange={(e) => setFormMaterial({ ...formMaterial, subtipo: e.target.value })}
                                    />
                                </Grid>
                                <Grid item xs={12} sm={4}>
                                    <TextField
                                        fullWidth
                                        size="small"
                                        label="Fornecedor"
                                        value={formMaterial.fornecedor_nome}
                                        onChange={(e) => setFormMaterial({ ...formMaterial, fornecedor_nome: e.target.value })}
                                    />
                                </Grid>
                                <Grid item xs={6} sm={3}>
                                    <TextField
                                        fullWidth
                                        size="small"
                                        type="number"
                                        label="Qtd. prevista"
                                        value={formMaterial.quantidade_planejada}
                                        onChange={(e) => setFormMaterial({ ...formMaterial, quantidade_planejada: e.target.value })}
                                    />
                                </Grid>
                                <Grid item xs={6} sm={2}>
                                    <FormControl fullWidth size="small">
                                        <InputLabel>Unidade</InputLabel>
                                        <Select
                                            label="Unidade"
                                            value={formMaterial.caracteristicas.unidade_medida}
                                            onChange={(e) => setFormMaterial({
                                                ...formMaterial,
                                                caracteristicas: { ...formMaterial.caracteristicas, unidade_medida: e.target.value }
                                            })}
                                        >
                                            {['un', 'm', 'm²', 'cx', 'kit', 'par'].map((u) => (
                                                <MenuItem key={u} value={u}>{u}</MenuItem>
                                            ))}
                                        </Select>
                                    </FormControl>
                                </Grid>
                                <Grid item xs={12} sm={3}>
                                    <TextField
                                        fullWidth
                                        size="small"
                                        label="Dimensões (ex.: 2x1m)"
                                        value={formMaterial.dimensoes}
                                        onChange={(e) => setFormMaterial({ ...formMaterial, dimensoes: e.target.value })}
                                    />
                                </Grid>
                                <Grid item xs={6} sm={2}>
                                    <TextField
                                        fullWidth
                                        size="small"
                                        type="number"
                                        label="Peso (kg)"
                                        value={formMaterial.peso_kg}
                                        onChange={(e) => setFormMaterial({ ...formMaterial, peso_kg: e.target.value })}
                                    />
                                </Grid>
                                <Grid item xs={6} sm={2}>
                                    <TextField
                                        fullWidth
                                        size="small"
                                        label="Etiqueta / Patrimônio"
                                        value={formMaterial.caracteristicas.codigo_etiqueta}
                                        onChange={(e) => setFormMaterial({
                                            ...formMaterial,
                                            caracteristicas: { ...formMaterial.caracteristicas, codigo_etiqueta: e.target.value }
                                        })}
                                    />
                                </Grid>
                            </Grid>
                        </Box>

                        {/* Seção 2: Fotos de referência e características visuais */}
                        <Box>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1, mb: 1.25 }}>
                                <Typography sx={{ fontSize: tamanhos.sm, fontWeight: 700, color: cores.primaria }}>
                                    2. Imagens de referência e características visuais ({formMaterial.fotos_referencia.length}/6)
                                </Typography>
                                <Stack direction="row" spacing={1}>
                                    <Button component="label" size="small" variant="outlined" disabled={processandoFoto} startIcon={<UploadVideoIcon />} sx={botaoSecundario}>
                                        Adicionar fotos
                                        <input type="file" accept="image/*" multiple hidden onChange={handleAdicionarFotosReferencia} />
                                    </Button>
                                    <Button component="label" size="small" variant="outlined" disabled={processandoFoto} startIcon={<CameraFotoIcon />} sx={botaoSecundario}>
                                        Tirar foto
                                        <input type="file" accept="image/*" capture="environment" hidden onChange={handleAdicionarFotosReferencia} />
                                    </Button>
                                </Stack>
                            </Box>

                            {formMaterial.fotos_referencia.length > 0 ? (
                                <Grid container spacing={1.5} sx={{ mb: 1.5 }}>
                                    {formMaterial.fotos_referencia.map((foto) => (
                                        <Grid item xs={12} sm={6} md={4} key={foto.id}>
                                            <Box sx={{ p: 1, borderRadius: 2, bgcolor: cores.superficieElevada, border: `1px solid ${foto.principal ? cores.primaria : cores.borda}` }}>
                                                <Box sx={{ position: 'relative', mb: 1 }}>
                                                    <Box
                                                        component="img"
                                                        src={foto.url}
                                                        alt={foto.legenda || 'Referência'}
                                                        sx={{ width: '100%', height: 112, objectFit: 'cover', borderRadius: 1.25, display: 'block' }}
                                                    />
                                                    <Chip
                                                        size="small"
                                                        label={foto.assinatura_visual ? 'Assinatura IA pronta' : 'Imagem salva'}
                                                        sx={{
                                                            position: 'absolute',
                                                            bottom: 6,
                                                            left: 6,
                                                            bgcolor: cores.superficie,
                                                            color: foto.assinatura_visual ? funcao.liberado : cores.textoSuave,
                                                            fontSize: tamanhos.xs
                                                        }}
                                                    />
                                                </Box>
                                                <Stack spacing={0.75}>
                                                    <FormControl fullWidth size="small">
                                                        <Select
                                                            value={foto.angulo || 'frontal'}
                                                            onChange={(e) => handleAtualizarCampoFoto(foto.id, 'angulo', e.target.value)}
                                                        >
                                                            {ANGULOS_FOTO_MATERIAL.map((ang) => (
                                                                <MenuItem key={ang.valor} value={ang.valor}>{ang.rotulo}</MenuItem>
                                                            ))}
                                                        </Select>
                                                    </FormControl>
                                                    <TextField
                                                        fullWidth
                                                        size="small"
                                                        placeholder="Legenda curta do ângulo"
                                                        value={foto.legenda || ''}
                                                        onChange={(e) => handleAtualizarCampoFoto(foto.id, 'legenda', e.target.value)}
                                                    />
                                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <Button
                                                            size="small"
                                                            startIcon={<PrincipalIcon />}
                                                            onClick={() => handleDefinirFotoPrincipal(foto.id)}
                                                            sx={{ color: foto.principal ? funcao.alerta : cores.textoSecundario, minWidth: 0, px: 1 }}
                                                        >
                                                            {foto.principal ? 'Principal' : 'Usar principal'}
                                                        </Button>
                                                        <IconButton size="small" onClick={() => handleRemoverFoto(foto.id)} sx={{ color: funcao.negado }}>
                                                            <ExcluirIcon fontSize="small" />
                                                        </IconButton>
                                                    </Box>
                                                </Stack>
                                            </Box>
                                        </Grid>
                                    ))}
                                </Grid>
                            ) : (
                                <Alert severity="info" sx={{ mb: 1.5 }}>
                                    Adicione fotos reais do material (de frente, de lado ou empilhado). Sem fotos, o rastreador usa a cor e o formato declarados abaixo como referência aproximada.
                                </Alert>
                            )}

                            <Grid container spacing={1.5}>
                                <Grid item xs={12} sm={4}>
                                    <FormControl fullWidth size="small">
                                        <InputLabel>Cor predominante</InputLabel>
                                        <Select
                                            label="Cor predominante"
                                            value={formMaterial.caracteristicas.cor_predominante}
                                            onChange={(e) => {
                                                const corObj = CORES_MATERIAL.find((c) => c.rotulo === e.target.value);
                                                setFormMaterial({
                                                    ...formMaterial,
                                                    caracteristicas: {
                                                        ...formMaterial.caracteristicas,
                                                        cor_predominante: e.target.value,
                                                        cor_hex_referencia: corObj?.hex || formMaterial.caracteristicas.cor_hex_referencia
                                                    }
                                                });
                                            }}
                                        >
                                            {CORES_MATERIAL.map((c) => (
                                                <MenuItem key={c.rotulo} value={c.rotulo}>
                                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                        <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: c.hex, border: `1px solid ${cores.borda}` }} />
                                                        <span>{c.rotulo}</span>
                                                    </Box>
                                                </MenuItem>
                                            ))}
                                        </Select>
                                    </FormControl>
                                </Grid>
                                <Grid item xs={12} sm={4}>
                                    <FormControl fullWidth size="small">
                                        <InputLabel>Formato / Geometria</InputLabel>
                                        <Select
                                            label="Formato / Geometria"
                                            value={formMaterial.caracteristicas.formato_geometria}
                                            onChange={(e) => setFormMaterial({
                                                ...formMaterial,
                                                caracteristicas: { ...formMaterial.caracteristicas, formato_geometria: e.target.value }
                                            })}
                                        >
                                            {FORMATOS_MATERIAL.map((fmt) => (
                                                <MenuItem key={fmt.valor} value={fmt.valor}>{fmt.rotulo}</MenuItem>
                                            ))}
                                        </Select>
                                    </FormControl>
                                </Grid>
                                <Grid item xs={12} sm={4}>
                                    <TextField
                                        fullWidth
                                        size="small"
                                        label="Composição (ex.: Alumínio 6061)"
                                        value={formMaterial.caracteristicas.material_composicao}
                                        onChange={(e) => setFormMaterial({
                                            ...formMaterial,
                                            caracteristicas: { ...formMaterial.caracteristicas, material_composicao: e.target.value }
                                        })}
                                    />
                                </Grid>
                                <Grid item xs={12} sm={8}>
                                    <TextField
                                        fullWidth
                                        size="small"
                                        label="Palavras-chave de busca IA (separadas por vírgula)"
                                        placeholder="ex.: trelica q30, box truss, estrutura prata"
                                        value={formMaterial.caracteristicas.palavras_chave_ia}
                                        onChange={(e) => setFormMaterial({
                                            ...formMaterial,
                                            caracteristicas: { ...formMaterial.caracteristicas, palavras_chave_ia: e.target.value }
                                        })}
                                    />
                                </Grid>
                                <Grid item xs={12} sm={4}>
                                    <TextField
                                        fullWidth
                                        size="small"
                                        label="Classe técnica IA (opcional)"
                                        placeholder="ex.: truss_q30_2m"
                                        value={formMaterial.classe_deteccao_ia}
                                        onChange={(e) => setFormMaterial({ ...formMaterial, classe_deteccao_ia: e.target.value })}
                                    />
                                </Grid>
                                <Grid item xs={12}>
                                    <TextField
                                        fullWidth
                                        size="small"
                                        multiline
                                        minRows={2}
                                        label="Marcas distintivas e detalhes visuais"
                                        placeholder="Ex.: Flange quadrada nas extremidades, adesivo amarelo da locadora, alça embutida..."
                                        value={formMaterial.caracteristicas.marcas_distintivas}
                                        onChange={(e) => setFormMaterial({
                                            ...formMaterial,
                                            caracteristicas: { ...formMaterial.caracteristicas, marcas_distintivas: e.target.value }
                                        })}
                                    />
                                </Grid>
                            </Grid>
                        </Box>

                        {/* Seção 3: Regra de rastreamento e ação automática */}
                        <Box>
                            <Typography sx={{ fontSize: tamanhos.sm, fontWeight: 700, color: cores.primaria, mb: 1.25 }}>
                                3. O que executar ao rastrear este objeto no vídeo
                            </Typography>
                            <Grid container spacing={1.5}>
                                <Grid item xs={12} sm={6}>
                                    <FormControl fullWidth size="small">
                                        <InputLabel>Ação ao detectar no vídeo</InputLabel>
                                        <Select
                                            label="Ação ao detectar no vídeo"
                                            value={formMaterial.regra_monitoramento.acao_ao_detectar}
                                            onChange={(e) => setFormMaterial({
                                                ...formMaterial,
                                                regra_monitoramento: { ...formMaterial.regra_monitoramento, acao_ao_detectar: e.target.value }
                                            })}
                                        >
                                            {ACOES_MONITORAMENTO_MATERIAL.map((ac) => (
                                                <MenuItem key={ac.valor} value={ac.valor}>{ac.rotulo}</MenuItem>
                                            ))}
                                        </Select>
                                    </FormControl>
                                </Grid>
                                <Grid item xs={12} sm={3}>
                                    <FormControl fullWidth size="small">
                                        <InputLabel>Modo de zona</InputLabel>
                                        <Select
                                            label="Modo de zona"
                                            value={formMaterial.regra_monitoramento.modo_preferido}
                                            onChange={(e) => setFormMaterial({
                                                ...formMaterial,
                                                regra_monitoramento: { ...formMaterial.regra_monitoramento, modo_preferido: e.target.value }
                                            })}
                                        >
                                            <MenuItem value="line_zone">Linha de corte</MenuItem>
                                            <MenuItem value="polygon_zone">Zona demarcada</MenuItem>
                                            <MenuItem value="sahi_estatico">Pilha fatiada (SAHI)</MenuItem>
                                        </Select>
                                    </FormControl>
                                </Grid>
                                <Grid item xs={12} sm={3}>
                                    <FormControl fullWidth size="small">
                                        <InputLabel>Setor / Área alvo</InputLabel>
                                        <Select
                                            label="Setor / Área alvo"
                                            value={formMaterial.regra_monitoramento.area_alvo_id || ''}
                                            onChange={(e) => setFormMaterial({
                                                ...formMaterial,
                                                regra_monitoramento: { ...formMaterial.regra_monitoramento, area_alvo_id: e.target.value }
                                            })}
                                        >
                                            <MenuItem value="">Doca / Portão geral</MenuItem>
                                            {areas.map((a) => (
                                                <MenuItem key={a.id} value={a.id}>{a.nome}</MenuItem>
                                            ))}
                                        </Select>
                                    </FormControl>
                                </Grid>
                                <Grid item xs={12}>
                                    <Alert severity="info">
                                        {infoAcaoModal.descricao}
                                    </Alert>
                                </Grid>
                                <Grid item xs={12} sm={6}>
                                    <Typography sx={{ fontSize: tamanhos.xs, color: cores.textoSecundario }}>
                                        Confiança mínima de reconhecimento: {Math.round(Number(formMaterial.regra_monitoramento.confianca_minima || 0.65) * 100)}%
                                    </Typography>
                                    <Slider
                                        size="small"
                                        min={40}
                                        max={95}
                                        step={5}
                                        value={Math.round(Number(formMaterial.regra_monitoramento.confianca_minima || 0.65) * 100)}
                                        onChange={(_, v) => setFormMaterial({
                                            ...formMaterial,
                                            regra_monitoramento: {
                                                ...formMaterial.regra_monitoramento,
                                                confianca_minima: Number(v) / 100
                                            }
                                        })}
                                    />
                                </Grid>
                                <Grid item xs={12} sm={6} sx={{ display: 'flex', alignItems: 'center' }}>
                                    <FormControlLabel
                                        control={(
                                            <Switch
                                                checked={Boolean(formMaterial.regra_monitoramento.notificar_alerta)}
                                                onChange={(e) => setFormMaterial({
                                                    ...formMaterial,
                                                    regra_monitoramento: { ...formMaterial.regra_monitoramento, notificar_alerta: e.target.checked }
                                                })}
                                            />
                                        )}
                                        label="Registrar alerta automático na sessão ao disparar regra"
                                    />
                                </Grid>
                                <Grid item xs={12}>
                                    <TextField
                                        fullWidth
                                        size="small"
                                        label="Instrução operacional (o que fazer ao disparar)"
                                        placeholder="Ex.: Somar descarga da carreta e avisar o produtor do palco se faltar alguma peça."
                                        value={formMaterial.regra_monitoramento.instrucao_operacional}
                                        onChange={(e) => setFormMaterial({
                                            ...formMaterial,
                                            regra_monitoramento: { ...formMaterial.regra_monitoramento, instrucao_operacional: e.target.value }
                                        })}
                                    />
                                </Grid>
                            </Grid>
                        </Box>
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ px: 3, py: 2 }}>
                    <Button variant="outlined" onClick={() => setModalMaterialAberto(false)} sx={botaoSecundario}>
                        Cancelar
                    </Button>
                    <NeonButton loading={salvando} disabled={processandoFoto} onClick={handleSalvarMaterial}>
                        {materialEditandoId ? 'Salvar alterações' : 'Salvar material no catálogo'}
                    </NeonButton>
                </DialogActions>
            </Dialog>

            {/* Modal nova conferência por romaneio / manual */}
            <Dialog open={modalConferenciaAberto} onClose={() => setModalConferenciaAberto(false)} maxWidth="sm" fullWidth>
                <TituloModal
                    titulo="Nova conferência de recebimento"
                    subtitulo="Registre uma conferência por vídeo gravado, câmera ao vivo ou lançamento auditado."
                    onFechar={() => setModalConferenciaAberto(false)}
                />
                <DialogContent dividers>
                    <Stack spacing={2} sx={{ pt: 0.5 }}>
                        <Grid container spacing={1.5}>
                            <Grid item xs={12} sm={6}>
                                <TextField fullWidth size="small" label="Número do romaneio ou NF" value={formConferencia.numero_nota_romaneio} onChange={(e) => setFormConferencia({ ...formConferencia, numero_nota_romaneio: e.target.value })} />
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField fullWidth size="small" label="Fornecedor" value={formConferencia.fornecedor_nome} onChange={(e) => setFormConferencia({ ...formConferencia, fornecedor_nome: e.target.value })} />
                            </Grid>
                        </Grid>
                        <Grid container spacing={1.5}>
                            <Grid item xs={12} sm={6}>
                                <FormControl fullWidth size="small">
                                    <InputLabel>Origem da mídia</InputLabel>
                                    <Select label="Origem da mídia" value={formConferencia.origem_midia} onChange={(e) => setFormConferencia({ ...formConferencia, origem_midia: e.target.value })}>
                                        <MenuItem value="video_gravado">Vídeo gravado</MenuItem>
                                        <MenuItem value="celular_live">Câmera do celular ao vivo</MenuItem>
                                        <MenuItem value="camera_rtsp">Câmera IP (RTSP)</MenuItem>
                                    </Select>
                                </FormControl>
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <FormControl fullWidth size="small">
                                    <InputLabel>Modo de contagem</InputLabel>
                                    <Select label="Modo de contagem" value={formConferencia.modo_contagem} onChange={(e) => setFormConferencia({ ...formConferencia, modo_contagem: e.target.value })}>
                                        <MenuItem value="line_zone">Cruzamento de linha (LineZone)</MenuItem>
                                        <MenuItem value="polygon_zone">Zona demarcada (PolygonZone)</MenuItem>
                                        <MenuItem value="sahi_estatico">Pilha parada fatiada (SAHI)</MenuItem>
                                    </Select>
                                </FormControl>
                            </Grid>
                        </Grid>
                        <Grid container spacing={1.5}>
                            <Grid item xs={12} sm={7}>
                                <FormControl fullWidth size="small">
                                    <InputLabel>Material esperado no romaneio</InputLabel>
                                    <Select label="Material esperado no romaneio" value={formConferencia.material_id || materiais[0]?.id || ''} onChange={(e) => setFormConferencia({ ...formConferencia, material_id: e.target.value })}>
                                        {materiais.map((m) => <MenuItem key={m.id} value={m.id}>{m.nome}</MenuItem>)}
                                    </Select>
                                </FormControl>
                            </Grid>
                            <Grid item xs={12} sm={5}>
                                <TextField fullWidth size="small" type="number" label="Quantidade identificada" value={formConferencia.quantidade_ia} onChange={(e) => setFormConferencia({ ...formConferencia, quantidade_ia: e.target.value })} />
                            </Grid>
                        </Grid>
                        <FormControl fullWidth size="small">
                            <InputLabel>Registrar item desconhecido na conferência?</InputLabel>
                            <Select
                                label="Registrar item desconhecido na conferência?"
                                value={formConferencia.incluir_nao_reconhecido ? 'sim' : 'nao'}
                                onChange={(e) => setFormConferencia({ ...formConferencia, incluir_nao_reconhecido: e.target.value === 'sim' })}
                            >
                                <MenuItem value="nao">Não</MenuItem>
                                <MenuItem value="sim">Sim, enviar para fila de novos materiais</MenuItem>
                            </Select>
                        </FormControl>
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ px: 3, py: 2 }}>
                    <Button variant="outlined" onClick={() => setModalConferenciaAberto(false)} sx={botaoSecundario}>
                        Cancelar
                    </Button>
                    <NeonButton loading={salvando} onClick={handleExecutarConferenciaIa}>
                        Processar contagem
                    </NeonButton>
                </DialogActions>
            </Dialog>

            {/* Preview ampliado de foto ou quadro-chave */}
            <Dialog open={Boolean(evidenciaModalUrl)} onClose={() => setEvidenciaModalUrl('')} maxWidth="sm" fullWidth>
                <TituloModal titulo="Foto de referência / evidência capturada" onFechar={() => setEvidenciaModalUrl('')} />
                <DialogContent dividers>
                    {evidenciaModalUrl && (
                        <Box component="img" src={evidenciaModalUrl} alt="Visualização ampliada" sx={{ width: '100%', borderRadius: 2, display: 'block' }} />
                    )}
                </DialogContent>
                <DialogActions sx={{ px: 3, py: 1.5 }}>
                    <Button variant="outlined" onClick={() => setEvidenciaModalUrl('')} sx={botaoSecundario}>
                        Fechar
                    </Button>
                </DialogActions>
            </Dialog>
        </Stack>
    );
};

export default AbaMateriaisVisaoIa;
