import React, { useMemo, useState } from 'react';
import {
    Alert,
    BottomNavigation,
    BottomNavigationAction,
    Box,
    Button,
    Checkbox,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    FormControl,
    InputLabel,
    LinearProgress,
    MenuItem,
    Paper,
    Select,
    Stack,
    TextField,
    Typography
} from '@mui/material';
import {
    Assignment as TarefasIcon,
    QrCodeScanner as QrIcon,
    Map as PlantaIcon,
    Inventory2 as MateriaisIcon,
    Person as PerfilIcon,
    CameraAlt as CameraIcon,
    Mic as MicIcon,
    ReportProblem as BloqueioIcon,
    PlayArrow as IniciarIcon,
    CheckCircle as ConcluidoIcon,
    Add as MaisIcon,
    Remove as MenosIcon,
    DesktopWindows as MonitorIcon,
    Warning as DobraIcon,
    Lock as CadeadoIcon,
    CloudOff as OfflineIcon,
    Sync as SyncIcon
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import GlassCard from '../common/GlassCard';
import NeonButton from '../common/NeonButton';
import TituloModal from '../common/TituloModal';
import api from '../../services/api';
import producaoSyncService, { comprimirImagemCliente } from '../../services/ProducaoSyncService';
import { botaoSecundario, cores, funcao, tamanhos, tom } from '../../styles/tokens';
import {
    FASES_OPERACIONAIS,
    ROTULO_MOVIMENTACAO,
    ROTULO_PRIORIDADE,
    ROTULO_SAUDE_PRAZO,
    ROTULO_STATUS_TAREFA,
    formatarDataHoraCurta,
    formatarMoedaCentavos,
    obterCorArea,
    obterInfoFase,
    obterNomeArea,
    obterRotuloPapel
} from './producaoHelpers';

const ModoCampoMobile = ({
    eventoId,
    resumo,
    headersExtra,
    apiClient,
    online,
    pendentesOffline,
    sincronizando,
    aoSincronizar,
    aoAtualizar,
    aoSairModoCampo
}) => {
    const httpClient = apiClient || api;
    const { enqueueSnackbar } = useSnackbar();
    const [abaCampo, setAbaCampo] = useState('tarefas');
    const [filtroStatus, setFiltroStatus] = useState('ativas');
    const [filtroFase, setFiltroFase] = useState('todas');
    const [filtroArea, setFiltroArea] = useState('');
    const [busca, setBusca] = useState('');
    const [salvando, setSalvando] = useState(false);

    // Modais rápidos de campo — Tarefas
    const [modalNotaVoz, setModalNotaVoz] = useState(null); // { tarefa, etapaId, texto, comentario }
    const [gravandoVoz, setGravandoVoz] = useState(false);
    const [modalBloqueio, setModalBloqueio] = useState(null); // { tarefa, motivo }
    const [modalFoto, setModalFoto] = useState(null); // { tarefa, etapaId, fotoPreview, comentario }

    // Ponto rápido
    const [codigoPonto, setCodigoPonto] = useState('');

    // Planta rápida
    const [plantaSelecionadaId, setPlantaSelecionadaId] = useState('');
    const [zoomPlanta, setZoomPlanta] = useState(1);
    const [elementoPlantaId, setElementoPlantaId] = useState(null);
    const [modalAjustePlanta, setModalAjustePlanta] = useState(false);
    const [formAjustePlanta, setFormAjustePlanta] = useState({
        titulo: '',
        justificativa: '',
        dx: '0',
        dy: '0'
    });

    // Materiais rápidos
    const [modalConferenciaRapida, setModalConferenciaRapida] = useState(null);
    const [qtdContadaCampo, setQtdContadaCampo] = useState('');

    const ctx = useMemo(() => resumo?.contexto_usuario || {}, [resumo?.contexto_usuario]);
    const areas = useMemo(() => resumo?.areas || [], [resumo?.areas]);
    const tarefas = useMemo(() => resumo?.tarefas || [], [resumo?.tarefas]);
    const produtores = useMemo(() => resumo?.produtores || [], [resumo?.produtores]);
    const materiais = useMemo(() => resumo?.materiais || [], [resumo?.materiais]);
    const presencas = useMemo(() => resumo?.registros_presenca || [], [resumo?.registros_presenca]);
    const plantas = useMemo(() => resumo?.plantas || [], [resumo?.plantas]);
    const planta = useMemo(
        () => plantas.find((p) => p.id === plantaSelecionadaId) || plantas[0] || null,
        [plantas, plantaSelecionadaId]
    );
    const larguraCanvasPlanta = Math.max(400, Number(planta?.largura_px || 840));
    const alturaCanvasPlanta = Math.max(300, Number(planta?.altura_px || 500));
    const versaoOficial = useMemo(() => {
        const versoes = [...(planta?.versoes || [])].sort((a, b) => b.numero_versao - a.numero_versao);
        return versoes.find((v) => v.eh_oficial) || versoes[0] || null;
    }, [planta]);

    const meuProdutor = useMemo(() => {
        if (ctx.produtorId) {
            return produtores.find((p) => p.id === ctx.produtorId) || null;
        }
        if (ctx.email) {
            return produtores.find((p) => p.email && p.email.toLowerCase() === ctx.email.toLowerCase()) || null;
        }
        return null;
    }, [produtores, ctx]);

    const ultimoPontoPorProdutor = useMemo(() => {
        const mapa = new Map();
        for (const reg of presencas) {
            if (!mapa.has(reg.produtor_id)) {
                mapa.set(reg.produtor_id, reg);
            }
        }
        return mapa;
    }, [presencas]);

    const meuUltimoPonto = meuProdutor ? ultimoPontoPorProdutor.get(meuProdutor.id) : null;
    const estouEmTurno = meuUltimoPonto?.tipo === 'checkin';

    const tarefasFiltradas = useMemo(() => {
        return tarefas.filter((t) => {
            if (filtroArea && t.area_id !== filtroArea) return false;
            if (filtroFase !== 'todas' && (t.fase_operacional || 'montagem') !== filtroFase) return false;
            if (filtroStatus === 'ativas' && t.status === 'concluida') return false;
            if (filtroStatus === 'disponivel' && t.status !== 'disponivel') return false;
            if (filtroStatus === 'em_andamento' && t.status !== 'em_andamento') return false;
            if (filtroStatus === 'bloqueada' && t.status !== 'bloqueada') return false;
            if (filtroStatus === 'concluida' && t.status !== 'concluida') return false;
            if (busca && !t.titulo.toLowerCase().includes(busca.toLowerCase())) return false;
            return true;
        });
    }, [tarefas, filtroArea, filtroFase, filtroStatus, busca]);

    const materiaisFiltrados = useMemo(() => {
        return materiais.filter((m) => {
            if (filtroArea && m.area_id && m.area_id !== filtroArea) return false;
            if (busca && !m.nome.toLowerCase().includes(busca.toLowerCase())) return false;
            return true;
        });
    }, [materiais, filtroArea, busca]);

    const elementoSelecionado = useMemo(
        () => (versaoOficial?.elementos_json || []).find((e) => e.id === elementoPlantaId) || null,
        [versaoOficial, elementoPlantaId]
    );

    const capturarGeolocalizacao = () => new Promise((resolve) => {
        if (!navigator.geolocation) return resolve(null);
        navigator.geolocation.getCurrentPosition(
            (pos) => resolve({
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
                precisao_m: Math.round(pos.coords.accuracy)
            }),
            () => resolve(null),
            { timeout: 2500 }
        );
    });

    const handleIniciarTarefa = async (tarefa) => {
        try {
            setSalvando(true);
            const geo = await capturarGeolocalizacao();
            await httpClient.post(`/producao/tarefas/${tarefa.id}/iniciar`, { geolocalizacao: geo }, { headers: headersExtra });
            enqueueSnackbar('Tarefa iniciada em campo.', { variant: 'success' });
            await aoAtualizar();
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Não foi possível iniciar a tarefa.', { variant: 'error' });
        } finally {
            setSalvando(false);
        }
    };

    const handleAlternarEtapa = async (tarefa, etapa) => {
        try {
            const geo = await capturarGeolocalizacao();
            const res = await producaoSyncService.enviarComSuporteOffline(
                eventoId,
                `/producao/tarefas/${tarefa.id}/etapas/${etapa.id}/toggle`,
                'etapa_toggle',
                { tarefa_id: tarefa.id, etapa_id: etapa.id, concluida: !etapa.concluida, geolocalizacao: geo },
                headersExtra,
                httpClient
            );
            if (res.status === 'offline') {
                enqueueSnackbar('Etapa salva na fila offline do celular.', { variant: 'warning' });
            } else {
                enqueueSnackbar(etapa.concluida ? 'Etapa reaberta.' : 'Etapa concluída.', { variant: 'success' });
                await aoAtualizar();
            }
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Erro ao atualizar etapa.', { variant: 'error' });
        }
    };

    const handleCapturarFotoCamera = async (evt, tarefa) => {
        const file = evt.target.files?.[0];
        if (!file) return;
        evt.target.value = '';
        try {
            const comprimida = await comprimirImagemCliente(file, 1280, 0.75);
            const primeiraPendente = (tarefa.etapas || []).find((e) => !e.concluida) || tarefa.etapas?.[0];
            setModalFoto({
                tarefa,
                etapaId: primeiraPendente?.id || '',
                fotoPreview: comprimida,
                comentario: ''
            });
        } catch {
            enqueueSnackbar('Não foi possível processar a foto.', { variant: 'error' });
        }
    };

    const handleEnviarFotoEvidencia = async () => {
        if (!modalFoto?.tarefa || !modalFoto?.etapaId || !modalFoto?.fotoPreview) {
            enqueueSnackbar('Selecione a etapa da tarefa para anexar a foto.', { variant: 'warning' });
            return;
        }
        try {
            setSalvando(true);
            const geo = await capturarGeolocalizacao();
            const res = await producaoSyncService.enviarComSuporteOffline(
                eventoId,
                `/producao/tarefas/${modalFoto.tarefa.id}/etapas/${modalFoto.etapaId}/evidencias`,
                'evidencia',
                {
                    tarefa_id: modalFoto.tarefa.id,
                    etapa_id: modalFoto.etapaId,
                    tipo: 'foto',
                    url_arquivo: modalFoto.fotoPreview,
                    texto_comentario: modalFoto.comentario.trim() || 'Foto registrada pelo celular em campo',
                    geolocalizacao: geo
                },
                headersExtra,
                httpClient
            );
            setModalFoto(null);
            if (res.status === 'offline') {
                enqueueSnackbar('Foto salva na fila offline para envio automático.', { variant: 'warning' });
            } else {
                enqueueSnackbar('Foto enviada com sucesso para a tarefa.', { variant: 'success' });
                await aoAtualizar();
            }
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Erro ao enviar foto.', { variant: 'error' });
        } finally {
            setSalvando(false);
        }
    };

    const iniciarDitadoVoz = () => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            enqueueSnackbar('Ditado por voz não suportado neste navegador. Digite a observação abaixo.', { variant: 'info' });
            return;
        }
        try {
            const rec = new SpeechRecognition();
            rec.lang = 'pt-BR';
            rec.interimResults = false;
            setGravandoVoz(true);
            rec.onresult = (event) => {
                const transcricao = event.results?.[0]?.[0]?.transcript || '';
                if (transcricao) {
                    setModalNotaVoz((prev) => (prev ? {
                        ...prev,
                        texto: `${prev.texto ? `${prev.texto} ` : ''}${transcricao}`
                    } : prev));
                }
            };
            rec.onerror = () => setGravandoVoz(false);
            rec.onend = () => setGravandoVoz(false);
            rec.start();
        } catch {
            setGravandoVoz(false);
        }
    };

    const handleEnviarNotaVoz = async () => {
        if (!modalNotaVoz?.tarefa || !modalNotaVoz?.etapaId || !modalNotaVoz?.texto?.trim()) {
            enqueueSnackbar('Fale ou digite uma observação antes de enviar.', { variant: 'warning' });
            return;
        }
        try {
            setSalvando(true);
            const geo = await capturarGeolocalizacao();
            const res = await producaoSyncService.enviarComSuporteOffline(
                eventoId,
                `/producao/tarefas/${modalNotaVoz.tarefa.id}/etapas/${modalNotaVoz.etapaId}/evidencias`,
                'evidencia',
                {
                    tarefa_id: modalNotaVoz.tarefa.id,
                    etapa_id: modalNotaVoz.etapaId,
                    tipo: 'audio',
                    transcricao_audio: modalNotaVoz.texto.trim(),
                    texto_comentario: 'Registro rápido em campo',
                    geolocalizacao: geo
                },
                headersExtra,
                httpClient
            );
            setModalNotaVoz(null);
            if (res.status === 'offline') {
                enqueueSnackbar('Observação salva na fila offline.', { variant: 'warning' });
            } else {
                enqueueSnackbar('Nota registrada na etapa da tarefa.', { variant: 'success' });
                await aoAtualizar();
            }
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Erro ao enviar observação.', { variant: 'error' });
        } finally {
            setSalvando(false);
        }
    };

    const handleConfirmarBloqueio = async () => {
        if (!modalBloqueio?.tarefa || !modalBloqueio?.motivo?.trim()) {
            enqueueSnackbar('Descreva o problema ou impedimento encontrado.', { variant: 'warning' });
            return;
        }
        try {
            setSalvando(true);
            await httpClient.post(`/producao/tarefas/${modalBloqueio.tarefa.id}/revisao`, {
                decisao: 'bloquear',
                motivo: modalBloqueio.motivo.trim()
            }, { headers: headersExtra });
            setModalBloqueio(null);
            enqueueSnackbar('Impedimento registrado e sinalizado ao Produtor Geral.', { variant: 'warning' });
            await aoAtualizar();
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Não foi possível reportar o bloqueio.', { variant: 'error' });
        } finally {
            setSalvando(false);
        }
    };

    const handleRegistrarPontoRapido = async ({ produtorId, codigo, tipo }) => {
        if (!produtorId && !codigo?.trim()) {
            enqueueSnackbar('Informe o QR Code ou CPF, ou selecione um produtor.', { variant: 'warning' });
            return;
        }
        try {
            setSalvando(true);
            const res = await producaoSyncService.enviarComSuporteOffline(
                eventoId,
                '/producao/presenca/registrar',
                'presenca',
                {
                    produtor_id: produtorId || undefined,
                    qr_code_credencial: codigo?.trim() || undefined,
                    tipo,
                    metodo: codigo?.trim() ? 'qrcode' : 'manual'
                },
                headersExtra,
                httpClient
            );
            if (codigo) setCodigoPonto('');
            if (res.status === 'offline') {
                enqueueSnackbar('Ponto salvo na fila offline e será enviado ao reconectar.', { variant: 'warning' });
            } else {
                const ehDobra = res.data?.eh_dobra_detectada;
                enqueueSnackbar(
                    ehDobra
                        ? 'Ponto registrado com alerta automático de dobra detectada.'
                        : (tipo === 'checkin' ? 'Check-in registrado com sucesso.' : 'Check-out registrado com sucesso.'),
                    { variant: ehDobra ? 'warning' : 'success' }
                );
                await aoAtualizar();
            }
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Erro ao registrar ponto.', { variant: 'error' });
        } finally {
            setSalvando(false);
        }
    };

    const handleEnviarPropostaPlantaCampo = async () => {
        if (!planta || !elementoSelecionado || !formAjustePlanta.titulo.trim()) {
            enqueueSnackbar('Informe o título do ajuste sugerido na planta.', { variant: 'warning' });
            return;
        }
        try {
            setSalvando(true);
            const dx = Math.round(Number(formAjustePlanta.dx || 0) * Number(planta.escala_pixels_por_metro || 15));
            const dy = Math.round(Number(formAjustePlanta.dy || 0) * Number(planta.escala_pixels_por_metro || 15));
            const elementosAlterados = (versaoOficial?.elementos_json || []).map((el) =>
                el.id === elementoSelecionado.id
                    ? { ...el, x: Math.max(0, el.x + dx), y: Math.max(0, el.y + dy) }
                    : el
            );
            await httpClient.post(`/producao/plantas/${planta.id}/propostas`, {
                planta_versao_base_id: versaoOficial?.id,
                titulo: formAjustePlanta.titulo.trim(),
                justificativa: formAjustePlanta.justificativa.trim() || 'Ajuste solicitado em campo via celular',
                elementos_alterados_json: elementosAlterados
            }, { headers: headersExtra });
            setModalAjustePlanta(false);
            setFormAjustePlanta({ titulo: '', justificativa: '', dx: '0', dy: '0' });
            enqueueSnackbar('Sugestão de ajuste enviada para análise do arquiteto.', { variant: 'success' });
            await aoAtualizar();
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Erro ao enviar sugestão na planta.', { variant: 'error' });
        } finally {
            setSalvando(false);
        }
    };

    const handleAvancarMaterial = async (mat, novoEstagio) => {
        try {
            setSalvando(true);
            await httpClient.post(`/producao/materiais/${mat.id}/movimentar`, { estagio_novo: novoEstagio }, { headers: headersExtra });
            enqueueSnackbar(`Material marcado como: ${ROTULO_MOVIMENTACAO.find((r) => r.valor === novoEstagio)?.texto || novoEstagio}.`, { variant: 'success' });
            await aoAtualizar();
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Erro ao atualizar etapa do material.', { variant: 'error' });
        } finally {
            setSalvando(false);
        }
    };

    const handleSalvarConferenciaRapida = async () => {
        if (!modalConferenciaRapida) return;
        const qtd = Number(qtdContadaCampo);
        if (!Number.isFinite(qtd) || qtd < 0) {
            enqueueSnackbar('Informe uma quantidade válida.', { variant: 'warning' });
            return;
        }
        try {
            setSalvando(true);
            await httpClient.post('/producao/materiais/conferencia-ia', {
                fornecedor_nome: modalConferenciaRapida.fornecedor_nome || 'Conferência rápida em campo',
                numero_nota_romaneio: 'CAMPO-MOBILE',
                origem_midia: 'camera_celular',
                modo_contagem: 'manual_mobile',
                itens: [{
                    material_id: modalConferenciaRapida.id,
                    classe_identificada: modalConferenciaRapida.classe_deteccao_ia,
                    quantidade_esperada: modalConferenciaRapida.quantidade_planejada,
                    quantidade_ia: qtd,
                    confianca_media: 1
                }]
            }, { headers: headersExtra });
            setModalConferenciaRapida(null);
            setQtdContadaCampo('');
            enqueueSnackbar('Conferência de material registrada.', { variant: 'success' });
            await aoAtualizar();
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Erro ao registrar conferência.', { variant: 'error' });
        } finally {
            setSalvando(false);
        }
    };

    const proximaEtapaMaterial = (atual) => {
        const ordem = ['previsto', 'recebido', 'em_estoque', 'separado_setor', 'montado', 'desmontado', 'devolvido'];
        const idx = ordem.indexOf(atual || 'previsto');
        return idx >= 0 && idx < ordem.length - 1 ? ordem[idx + 1] : null;
    };

    return (
        <Box sx={{ pb: 11 }}>
            {/* Barra compacta do modo campo no celular */}
            <GlassCard sx={{ p: 1.75, mb: 2 }}>
                <Stack spacing={1.25}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                        <Box>
                            <Typography sx={{ fontWeight: 700, fontSize: tamanhos.lg, color: cores.textoForte }}>
                                Olá, {ctx.nome || 'Produtor'}
                            </Typography>
                            <Typography sx={{ fontSize: tamanhos.xs, color: cores.textoSecundario }}>
                                {obterRotuloPapel(ctx.papel_producao)}
                                {ctx.area_id ? ` • ${obterNomeArea(areas, ctx.area_id)}` : ''}
                            </Typography>
                        </Box>
                        <Stack direction="row" spacing={1} alignItems="center">
                            {!online && (
                                <Chip
                                    size="small"
                                    icon={<OfflineIcon />}
                                    label="Offline"
                                    sx={{ bgcolor: tom(funcao.alerta, 0.16), color: funcao.alerta, fontWeight: 700 }}
                                />
                            )}
                            {pendentesOffline > 0 && (
                                <Button
                                    size="small"
                                    variant="outlined"
                                    startIcon={<SyncIcon />}
                                    disabled={!online || sincronizando}
                                    onClick={aoSincronizar}
                                    sx={botaoSecundario}
                                >
                                    {pendentesOffline}
                                </Button>
                            )}
                            <Button
                                size="small"
                                variant="outlined"
                                startIcon={<MonitorIcon />}
                                onClick={aoSairModoCampo}
                                sx={botaoSecundario}
                            >
                                Visão completa
                            </Button>
                        </Stack>
                    </Box>

                    {(abaCampo === 'tarefas' || abaCampo === 'materiais') && (
                        <Stack direction="row" spacing={1}>
                            <TextField
                                fullWidth
                                size="small"
                                placeholder={abaCampo === 'tarefas' ? 'Buscar tarefa...' : 'Buscar material...'}
                                value={busca}
                                onChange={(e) => setBusca(e.target.value)}
                            />
                            {areas.length > 1 && !ctx.area_id && (
                                <FormControl size="small" sx={{ minWidth: 135 }}>
                                    <InputLabel>Área</InputLabel>
                                    <Select label="Área" value={filtroArea} onChange={(e) => setFiltroArea(e.target.value)}>
                                        <MenuItem value="">Todas</MenuItem>
                                        {areas.map((a) => <MenuItem key={a.id} value={a.id}>{a.nome}</MenuItem>)}
                                    </Select>
                                </FormControl>
                            )}
                        </Stack>
                    )}
                </Stack>
            </GlassCard>

            {/* 1. ABA TAREFAS EM CAMPO */}
            {abaCampo === 'tarefas' && (
                <Stack spacing={2}>
                    <Stack direction="row" spacing={1} sx={{ overflowX: 'auto', pb: 0.25 }}>
                        {[
                            { valor: 'todas', rotulo: 'Todas as fases' },
                            ...FASES_OPERACIONAIS
                        ].map((f) => {
                            const ativo = filtroFase === f.valor;
                            return (
                                <Chip
                                    key={f.valor}
                                    clickable
                                    label={f.rotulo}
                                    onClick={() => setFiltroFase(f.valor)}
                                    sx={{
                                        height: 34,
                                        fontWeight: ativo ? 700 : 500,
                                        bgcolor: ativo ? tom(f.cor || cores.primaria, 0.22) : cores.fundo,
                                        color: ativo ? (f.cor || cores.primaria) : cores.textoSecundario,
                                        border: `1px solid ${ativo ? (f.cor || cores.primaria) : cores.borda}`
                                    }}
                                />
                            );
                        })}
                    </Stack>

                    <Stack direction="row" spacing={1} sx={{ overflowX: 'auto', pb: 0.5 }}>
                        {[
                            { id: 'ativas', label: 'Ativas' },
                            { id: 'disponivel', label: 'Na fila' },
                            { id: 'em_andamento', label: 'Em execução' },
                            { id: 'bloqueada', label: 'Bloqueadas' },
                            { id: 'concluida', label: 'Concluídas' },
                            { id: 'todas', label: 'Todas' }
                        ].map((f) => {
                            const ativo = filtroStatus === f.id;
                            return (
                                <Chip
                                    key={f.id}
                                    clickable
                                    label={f.label}
                                    onClick={() => setFiltroStatus(f.id)}
                                    sx={{
                                        height: 36,
                                        px: 0.75,
                                        fontWeight: ativo ? 700 : 500,
                                        bgcolor: ativo ? tom(cores.primaria, 0.22) : cores.superficie,
                                        color: ativo ? cores.primaria : cores.textoSuave,
                                        border: `1px solid ${ativo ? cores.primaria : cores.borda}`
                                    }}
                                />
                            );
                        })}
                    </Stack>

                    {tarefasFiltradas.length === 0 ? (
                        <GlassCard sx={{ p: 3, textAlign: 'center' }}>
                            <Typography sx={{ color: cores.textoSecundario }}>
                                Nenhuma tarefa encontrada para este filtro.
                            </Typography>
                        </GlassCard>
                    ) : (
                        tarefasFiltradas.map((t) => {
                            const statusInfo = ROTULO_STATUS_TAREFA[t.status] || ROTULO_STATUS_TAREFA.disponivel;
                            const saudeInfo = ROTULO_SAUDE_PRAZO[t.saude_prazo] || ROTULO_SAUDE_PRAZO.no_prazo;
                            const prioInfo = ROTULO_PRIORIDADE[t.prioridade] || ROTULO_PRIORIDADE.media;
                            const faseInfo = obterInfoFase(t.fase_operacional);
                            const areaCor = obterCorArea(areas, t.area_id);
                            const primeiraPendente = (t.etapas || []).find((e) => !e.concluida) || t.etapas?.[0];

                            return (
                                <GlassCard key={t.id} sx={{ p: 2 }}>
                                    <Stack spacing={1.5}>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1, flexWrap: 'wrap' }}>
                                            <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                                                <Chip size="small" label={faseInfo.rotulo} sx={{ bgcolor: tom(faseInfo.cor, 0.16), color: faseInfo.cor, fontWeight: 700 }} />
                                                <Chip size="small" label={obterNomeArea(areas, t.area_id)} sx={{ bgcolor: tom(areaCor, 0.16), color: areaCor, fontWeight: 700 }} />
                                                <Chip size="small" label={statusInfo.texto} sx={{ bgcolor: tom(statusInfo.cor, 0.16), color: statusInfo.cor, fontWeight: 700 }} />
                                                <Chip size="small" label={saudeInfo.texto} sx={{ bgcolor: tom(saudeInfo.cor, 0.16), color: saudeInfo.cor, fontWeight: 600 }} />
                                                <Chip size="small" label={prioInfo.texto} sx={{ bgcolor: tom(prioInfo.cor, 0.14), color: prioInfo.cor }} />
                                                {t.elemento_planta_rotulo && (
                                                    <Chip size="small" label={t.elemento_planta_rotulo} sx={{ bgcolor: tom(cores.primaria, 0.12), color: cores.textoSuave }} />
                                                )}
                                            </Stack>
                                        </Box>

                                        <Box>
                                            <Typography sx={{ fontWeight: 700, fontSize: tamanhos.lg, color: cores.textoForte }}>
                                                {t.titulo}
                                            </Typography>
                                            {t.objetivo && (
                                                <Typography sx={{ fontSize: tamanhos.sm, color: cores.textoSecundario, mt: 0.5 }}>
                                                    {t.objetivo}
                                                </Typography>
                                            )}
                                        </Box>

                                        {t.sugestoes_levar?.length > 0 && (
                                            <Box sx={{ p: 1.25, borderRadius: 1.5, bgcolor: cores.fundo, border: `1px solid ${cores.borda}` }}>
                                                <Typography sx={{ fontSize: tamanhos.xs, color: cores.textoSecundario, mb: 0.5 }}>
                                                    Levar para campo:
                                                </Typography>
                                                <Typography sx={{ fontSize: tamanhos.sm, color: cores.texto }}>
                                                    {t.sugestoes_levar.join(' • ')}
                                                </Typography>
                                            </Box>
                                        )}

                                        <Box>
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                                                <Typography sx={{ fontSize: tamanhos.xs, color: cores.textoSecundario }}>
                                                    Progresso ({t.etapas_concluidas || 0}/{t.total_etapas || 0} etapas)
                                                </Typography>
                                                <Typography sx={{ fontSize: tamanhos.xs, fontWeight: 700, color: cores.primaria }}>
                                                    {t.percentual_concluido || 0}%
                                                </Typography>
                                            </Box>
                                            <LinearProgress variant="determinate" value={t.percentual_concluido || 0} sx={{ height: 8, borderRadius: 4 }} />
                                        </Box>

                                        {(t.status === 'disponivel' || t.status === 'reaberta') && (
                                            <NeonButton
                                                fullWidth
                                                disabled={salvando}
                                                startIcon={<IniciarIcon />}
                                                onClick={() => handleIniciarTarefa(t)}
                                                sx={{ minHeight: 46 }}
                                            >
                                                Iniciar tarefa agora
                                            </NeonButton>
                                        )}

                                        {/* Checklist com toque amplo (minHeight 48px) */}
                                        {t.etapas?.length > 0 && (
                                            <Stack spacing={0.75}>
                                                {t.etapas.map((et) => (
                                                    <Box
                                                        key={et.id}
                                                        onClick={() => handleAlternarEtapa(t, et)}
                                                        sx={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'space-between',
                                                            minHeight: 48,
                                                            px: 1,
                                                            py: 0.75,
                                                            borderRadius: 1.5,
                                                            cursor: 'pointer',
                                                            bgcolor: et.concluida ? tom(funcao.liberado, 0.1) : cores.fundo,
                                                            border: `1px solid ${et.concluida ? tom(funcao.liberado, 0.35) : cores.borda}`
                                                        }}
                                                    >
                                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1 }}>
                                                            <Checkbox
                                                                checked={Boolean(et.concluida)}
                                                                onChange={(e) => {
                                                                    e.stopPropagation();
                                                                    handleAlternarEtapa(t, et);
                                                                }}
                                                                sx={{ p: 0.5 }}
                                                            />
                                                            <Typography
                                                                sx={{
                                                                    fontSize: tamanhos.md,
                                                                    color: et.concluida ? cores.textoSecundario : cores.textoForte,
                                                                    textDecoration: et.concluida ? 'line-through' : 'none'
                                                                }}
                                                            >
                                                                {et.titulo}
                                                            </Typography>
                                                        </Box>
                                                        {(et.evidencias?.length || 0) > 0 && (
                                                            <Chip size="small" label={`${et.evidencias.length} evid.`} sx={{ ml: 1 }} />
                                                        )}
                                                    </Box>
                                                ))}
                                            </Stack>
                                        )}

                                        {/* Ações rápidas de campo */}
                                        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                            <Button
                                                component="label"
                                                variant="outlined"
                                                startIcon={<CameraIcon />}
                                                sx={{ ...botaoSecundario, flex: 1, minHeight: 44, minWidth: 120 }}
                                            >
                                                Foto câmera
                                                <input
                                                    hidden
                                                    type="file"
                                                    accept="image/*"
                                                    capture="environment"
                                                    onChange={(e) => handleCapturarFotoCamera(e, t)}
                                                />
                                            </Button>
                                            <Button
                                                variant="outlined"
                                                startIcon={<MicIcon />}
                                                onClick={() => setModalNotaVoz({
                                                    tarefa: t,
                                                    etapaId: primeiraPendente?.id || '',
                                                    texto: ''
                                                })}
                                                sx={{ ...botaoSecundario, flex: 1, minHeight: 44, minWidth: 120 }}
                                            >
                                                Nota / voz
                                            </Button>
                                            {t.status !== 'bloqueada' && t.status !== 'concluida' && (
                                                <Button
                                                    variant="outlined"
                                                    startIcon={<BloqueioIcon />}
                                                    onClick={() => setModalBloqueio({ tarefa: t, motivo: '' })}
                                                    sx={{
                                                        ...botaoSecundario,
                                                        minHeight: 44,
                                                        borderColor: tom(funcao.negado, 0.5),
                                                        color: funcao.negado
                                                    }}
                                                >
                                                    Bloqueio
                                                </Button>
                                            )}
                                        </Stack>

                                        <Typography sx={{ fontSize: tamanhos.xs, color: cores.textoFraco }}>
                                            Prazo previsto: {formatarDataHoraCurta(t.data_fim_planejada)}
                                        </Typography>
                                    </Stack>
                                </GlassCard>
                            );
                        })
                    )}
                </Stack>
            )}

            {/* 2. ABA PONTO E QR */}
            {abaCampo === 'ponto' && (
                <Stack spacing={2}>
                    {meuProdutor && (
                        <GlassCard sx={{ p: 2.25 }}>
                            <Stack spacing={1.5}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Box>
                                        <Typography sx={{ fontWeight: 700, fontSize: tamanhos.lg, color: cores.textoForte }}>
                                            Meu ponto em campo
                                        </Typography>
                                        <Typography sx={{ fontSize: tamanhos.xs, color: cores.textoSecundario }}>
                                            {estouEmTurno
                                                ? `Em serviço desde ${formatarDataHoraCurta(meuUltimoPonto?.data_hora)}`
                                                : 'Fora de turno no momento'}
                                        </Typography>
                                    </Box>
                                    {meuUltimoPonto?.eh_dobra_detectada && (
                                        <Chip size="small" icon={<DobraIcon />} label="Dobra" sx={{ bgcolor: tom(funcao.alerta, 0.16), color: funcao.alerta, fontWeight: 700 }} />
                                    )}
                                </Box>
                                <NeonButton
                                    fullWidth
                                    disabled={salvando}
                                    neonColor={estouEmTurno ? funcao.saida : funcao.liberado}
                                    onClick={() => handleRegistrarPontoRapido({
                                        produtorId: meuProdutor.id,
                                        tipo: estouEmTurno ? 'checkout' : 'checkin'
                                    })}
                                    sx={{ minHeight: 50 }}
                                >
                                    {estouEmTurno ? 'Registrar minha saída (check-out)' : 'Registrar minha entrada (check-in)'}
                                </NeonButton>
                            </Stack>
                        </GlassCard>
                    )}

                    <GlassCard sx={{ p: 2 }}>
                        <Stack spacing={1.5}>
                            <Typography sx={{ fontWeight: 700, color: cores.textoForte }}>
                                Ponto rápido por QR Code ou CPF
                            </Typography>
                            <TextField
                                fullWidth
                                placeholder="Digite ou escaneie o CPF ou código QR"
                                value={codigoPonto}
                                onChange={(e) => setCodigoPonto(e.target.value)}
                            />
                            <Stack direction="row" spacing={1}>
                                <NeonButton
                                    fullWidth
                                    disabled={salvando}
                                    neonColor={funcao.entrada}
                                    onClick={() => handleRegistrarPontoRapido({ codigo: codigoPonto, tipo: 'checkin' })}
                                    sx={{ minHeight: 46 }}
                                >
                                    Entrada (check-in)
                                </NeonButton>
                                <NeonButton
                                    fullWidth
                                    disabled={salvando}
                                    neonColor={funcao.saida}
                                    onClick={() => handleRegistrarPontoRapido({ codigo: codigoPonto, tipo: 'checkout' })}
                                    sx={{ minHeight: 46 }}
                                >
                                    Saída (check-out)
                                </NeonButton>
                            </Stack>
                        </Stack>
                    </GlassCard>

                    <Typography sx={{ fontWeight: 700, fontSize: tamanhos.md, color: cores.textoForte, px: 0.5 }}>
                        Equipe e presença agora ({produtores.length})
                    </Typography>

                    {produtores.map((p) => {
                        const ult = ultimoPontoPorProdutor.get(p.id);
                        const presente = ult?.tipo === 'checkin';
                        const areaCor = obterCorArea(areas, p.area_id);
                        return (
                            <GlassCard key={p.id} sx={{ p: 1.75 }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
                                    <Box sx={{ minWidth: 0 }}>
                                        <Typography sx={{ fontWeight: 700, color: cores.textoForte }} noWrap>
                                            {p.nome}
                                        </Typography>
                                        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 0.5 }} flexWrap="wrap" useFlexGap>
                                            <Chip size="small" label={obterNomeArea(areas, p.area_id)} sx={{ bgcolor: tom(areaCor, 0.14), color: areaCor }} />
                                            <Chip
                                                size="small"
                                                label={presente ? 'Presente' : (ult?.tipo === 'checkout' ? 'Saiu' : 'Aguardando')}
                                                sx={{
                                                    bgcolor: tom(presente ? funcao.liberado : funcao.neutro, 0.16),
                                                    color: presente ? funcao.liberado : cores.textoSecundario,
                                                    fontWeight: 600
                                                }}
                                            />
                                            {ult?.eh_dobra_detectada && (
                                                <Chip size="small" icon={<DobraIcon />} label="Dobra" sx={{ bgcolor: tom(funcao.alerta, 0.16), color: funcao.alerta }} />
                                            )}
                                        </Stack>
                                    </Box>
                                    <Button
                                        variant="outlined"
                                        disabled={salvando}
                                        onClick={() => handleRegistrarPontoRapido({
                                            produtorId: p.id,
                                            tipo: presente ? 'checkout' : 'checkin'
                                        })}
                                        sx={{
                                            ...botaoSecundario,
                                            minHeight: 44,
                                            px: 2,
                                            borderColor: presente ? funcao.saida : funcao.liberado,
                                            color: presente ? funcao.saida : funcao.liberado
                                        }}
                                    >
                                        {presente ? 'Check-out' : 'Check-in'}
                                    </Button>
                                </Box>
                            </GlassCard>
                        );
                    })}
                </Stack>
            )}

            {/* 3. ABA PLANTA RÁPIDA */}
            {abaCampo === 'planta' && (
                <Stack spacing={2}>
                    <GlassCard sx={{ p: 2 }}>
                        <Stack spacing={1.5}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
                                <Box>
                                    <Typography sx={{ fontWeight: 700, color: cores.textoForte }}>
                                        {planta?.titulo || 'Planta baixa oficial'}
                                    </Typography>
                                    <Typography sx={{ fontSize: tamanhos.xs, color: cores.textoSecundario }}>
                                        Versão v{versaoOficial?.numero_versao || 1} • Toque em um elemento para ver medidas
                                    </Typography>
                                </Box>
                                <Stack direction="row" spacing={0.75} alignItems="center">
                                    <Button size="small" variant="outlined" onClick={() => setZoomPlanta((z) => Math.max(0.7, Number((z - 0.25).toFixed(2))))} sx={botaoSecundario}>
                                        <MenosIcon fontSize="small" />
                                    </Button>
                                    <Chip size="small" label={`${Math.round(zoomPlanta * 100)}%`} />
                                    <Button size="small" variant="outlined" onClick={() => setZoomPlanta((z) => Math.min(2.5, Number((z + 0.25).toFixed(2))))} sx={botaoSecundario}>
                                        <MaisIcon fontSize="small" />
                                    </Button>
                                </Stack>
                            </Box>

                            {plantas.length > 1 && (
                                <FormControl fullWidth size="small">
                                    <InputLabel>Prancha</InputLabel>
                                    <Select
                                        label="Prancha"
                                        value={planta?.id || ''}
                                        onChange={(e) => { setPlantaSelecionadaId(e.target.value); setElementoPlantaId(null); }}
                                    >
                                        {plantas.map((pl) => <MenuItem key={pl.id} value={pl.id}>{pl.titulo}</MenuItem>)}
                                    </Select>
                                </FormControl>
                            )}

                            <Box sx={{ width: '100%', overflow: 'auto', borderRadius: 1.5, bgcolor: cores.fundo, border: `1px solid ${cores.borda}` }}>
                                <svg
                                    viewBox={`0 0 ${Math.round(larguraCanvasPlanta / zoomPlanta)} ${Math.round(alturaCanvasPlanta / zoomPlanta)}`}
                                    style={{ width: '100%', minWidth: 320, height: 300, display: 'block' }}
                                >
                                    {versaoOficial?.imagem_fundo_url && (
                                        <image
                                            href={versaoOficial.imagem_fundo_url}
                                            x="0"
                                            y="0"
                                            width={larguraCanvasPlanta}
                                            height={alturaCanvasPlanta}
                                            preserveAspectRatio="xMidYMid meet"
                                        />
                                    )}
                                    {(versaoOficial?.camadas_arquitetura || []).filter((c) => c.visivel !== false && c.imagem_url).map((c) => (
                                        <image
                                            key={c.id}
                                            href={c.imagem_url}
                                            x="0"
                                            y="0"
                                            width={larguraCanvasPlanta}
                                            height={alturaCanvasPlanta}
                                            opacity={Number(c.opacidade ?? 0.85)}
                                            preserveAspectRatio="xMidYMid meet"
                                        />
                                    ))}
                                    {(versaoOficial?.setores || []).map((s) => {
                                        const pts = (s.poligono_coordenadas || []).map((p) => `${p.x},${p.y}`).join(' ');
                                        return (
                                            <g key={s.id}>
                                                <polygon points={pts} fill={tom(s.cor_hex || '#00D4FF', 0.14)} stroke={s.cor_hex || '#00D4FF'} strokeWidth={2} />
                                            </g>
                                        );
                                    })}
                                    {(versaoOficial?.elementos_json || []).map((el) => {
                                        const sel = el.id === elementoPlantaId;
                                        return (
                                            <g key={el.id} onClick={() => setElementoPlantaId(el.id)} style={{ cursor: 'pointer' }}>
                                                <rect
                                                    x={el.x}
                                                    y={el.y}
                                                    width={el.largura}
                                                    height={el.altura}
                                                    rx={6}
                                                    fill={tom(el.cor || '#00D4FF', sel ? 0.35 : 0.2)}
                                                    stroke={sel ? cores.textoForte : (el.cor || '#00D4FF')}
                                                    strokeWidth={sel ? 3 : 1.5}
                                                />
                                                <text
                                                    x={el.x + el.largura / 2}
                                                    y={el.y + el.altura / 2 + 4}
                                                    fill={cores.textoForte}
                                                    fontSize="12"
                                                    fontWeight="600"
                                                    textAnchor="middle"
                                                >
                                                    {el.rotulo}
                                                </text>
                                            </g>
                                        );
                                    })}
                                </svg>
                            </Box>
                        </Stack>
                    </GlassCard>

                    {elementoSelecionado ? (
                        <GlassCard sx={{ p: 2 }}>
                            <Stack spacing={1.25}>
                                <Typography sx={{ fontWeight: 700, fontSize: tamanhos.lg, color: cores.textoForte }}>
                                    {elementoSelecionado.rotulo}
                                </Typography>
                                <Typography sx={{ fontSize: tamanhos.sm, color: cores.textoSecundario }}>
                                    Dimensão aproximada: {(elementoSelecionado.largura / Number(planta?.escala_pixels_por_metro || 15)).toFixed(1)} m x {(elementoSelecionado.altura / Number(planta?.escala_pixels_por_metro || 15)).toFixed(1)} m
                                </Typography>
                                {elementoSelecionado.texto && (
                                    <Typography sx={{ fontSize: tamanhos.sm, color: cores.textoSuave }}>
                                        Observação técnica: {elementoSelecionado.texto}
                                    </Typography>
                                )}
                                {tarefas.filter((t) => t.elemento_planta_id === elementoSelecionado.id || t.elemento_planta_rotulo === elementoSelecionado.rotulo).map((t) => {
                                    const faseInfo = obterInfoFase(t.fase_operacional);
                                    return (
                                        <Box key={t.id} sx={{ p: 1, borderRadius: 1.25, bgcolor: cores.fundo, border: `1px solid ${cores.borda}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
                                            <Box sx={{ minWidth: 0 }}>
                                                <Typography sx={{ fontSize: tamanhos.xs, fontWeight: 700, color: faseInfo.cor }}>
                                                    {faseInfo.rotulo}
                                                </Typography>
                                                <Typography sx={{ fontSize: tamanhos.sm, color: cores.textoForte }} noWrap>
                                                    {t.titulo}
                                                </Typography>
                                            </Box>
                                            <Chip size="small" label={`${t.percentual_concluido || 0}%`} sx={{ bgcolor: tom(cores.primaria, 0.14), color: cores.primaria, fontWeight: 700 }} />
                                        </Box>
                                    );
                                })}
                                <NeonButton
                                    fullWidth
                                    onClick={() => {
                                        setFormAjustePlanta({
                                            titulo: `Ajuste de campo em ${elementoSelecionado.rotulo}`,
                                            justificativa: '',
                                            dx: '0',
                                            dy: '0'
                                        });
                                        setModalAjustePlanta(true);
                                    }}
                                    sx={{ minHeight: 46 }}
                                >
                                    Sugerir ajuste deste item ao arquiteto
                                </NeonButton>
                            </Stack>
                        </GlassCard>
                    ) : (
                        <Alert severity="info">
                            Toque em qualquer bloco no desenho acima para consultar as medidas em metros ou sugerir uma alteração de campo.
                        </Alert>
                    )}
                </Stack>
            )}

            {/* 4. ABA MATERIAIS EM CAMPO */}
            {abaCampo === 'materiais' && (
                <Stack spacing={2}>
                    {materiaisFiltrados.length === 0 ? (
                        <GlassCard sx={{ p: 3, textAlign: 'center' }}>
                            <Typography sx={{ color: cores.textoSecundario }}>
                                Nenhum material encontrado.
                            </Typography>
                        </GlassCard>
                    ) : (
                        materiaisFiltrados.map((m) => {
                            const rotuloAtual = ROTULO_MOVIMENTACAO.find((r) => r.valor === m.estagio_atual)?.texto || m.estagio_atual || 'Previsto';
                            const proxEstagio = proximaEtapaMaterial(m.estagio_atual);
                            const rotuloProx = ROTULO_MOVIMENTACAO.find((r) => r.valor === proxEstagio)?.texto;
                            const divergente = Number(m.quantidade_recebida || 0) > 0 && Number(m.quantidade_recebida || 0) !== Number(m.quantidade_planejada || 0);

                            return (
                                <GlassCard key={m.id} sx={{ p: 2 }}>
                                    <Stack spacing={1.25}>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
                                            <Box>
                                                <Typography sx={{ fontWeight: 700, fontSize: tamanhos.md, color: cores.textoForte }}>
                                                    {m.nome}
                                                </Typography>
                                                <Typography sx={{ fontSize: tamanhos.xs, color: cores.textoSecundario }}>
                                                    Planejado: {m.quantidade_planejada || 0} {m.unidade || 'un'} • Recebido: {m.quantidade_recebida || 0} {m.unidade || 'un'}
                                                </Typography>
                                            </Box>
                                            <Chip
                                                size="small"
                                                label={rotuloAtual}
                                                sx={{ bgcolor: tom(cores.primaria, 0.14), color: cores.primaria, fontWeight: 600 }}
                                            />
                                        </Box>

                                        {divergente && (
                                            <Chip
                                                size="small"
                                                label="Divergência entre planejado e recebido"
                                                sx={{ bgcolor: tom(funcao.alerta, 0.16), color: funcao.alerta, alignSelf: 'flex-start' }}
                                            />
                                        )}

                                        <Stack direction="row" spacing={1}>
                                            <Button
                                                variant="outlined"
                                                onClick={() => {
                                                    setModalConferenciaRapida(m);
                                                    setQtdContadaCampo(String(m.quantidade_planejada || 0));
                                                }}
                                                sx={{ ...botaoSecundario, flex: 1, minHeight: 44 }}
                                            >
                                                Contar recebimento
                                            </Button>
                                            {proxEstagio && (
                                                <NeonButton
                                                    disabled={salvando}
                                                    onClick={() => handleAvancarMaterial(m, proxEstagio)}
                                                    sx={{ flex: 1, minHeight: 44 }}
                                                >
                                                    Mover: {rotuloProx}
                                                </NeonButton>
                                            )}
                                        </Stack>
                                    </Stack>
                                </GlassCard>
                            );
                        })
                    )}
                </Stack>
            )}

            {/* 5. ABA MEU ACESSO E CACHÊ */}
            {abaCampo === 'perfil' && (
                <Stack spacing={2}>
                    <GlassCard sx={{ p: 2.25 }}>
                        <Stack spacing={1.25}>
                            <Typography sx={{ fontWeight: 700, fontSize: tamanhos.xl, color: cores.textoForte }}>
                                {meuProdutor?.nome || ctx.nome || 'Produtor'}
                            </Typography>
                            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                <Chip size="small" label={obterRotuloPapel(ctx.papel_producao)} sx={{ bgcolor: tom(funcao.acao, 0.16), color: funcao.acao, fontWeight: 700 }} />
                                {ctx.area_id && (
                                    <Chip size="small" label={obterNomeArea(areas, ctx.area_id)} sx={{ bgcolor: tom(obterCorArea(areas, ctx.area_id), 0.16), color: obterCorArea(areas, ctx.area_id), fontWeight: 700 }} />
                                )}
                            </Stack>
                            <Typography sx={{ fontSize: tamanhos.sm, color: cores.textoSecundario }}>
                                E-mail de login: {meuProdutor?.email || ctx.email || '—'}
                            </Typography>
                            <Typography sx={{ fontSize: tamanhos.sm, color: cores.textoSecundario }}>
                                Tarefas atribuídas na sua visão: {tarefas.length} ({tarefas.filter((t) => t.status === 'concluida').length} concluídas)
                            </Typography>
                        </Stack>
                    </GlassCard>

                    <GlassCard sx={{ p: 2.25 }}>
                        <Typography sx={{ fontWeight: 700, fontSize: tamanhos.md, color: cores.textoForte, mb: 1 }}>
                            Meu cachê e pagamento
                        </Typography>
                        {!meuProdutor ? (
                            <Typography sx={{ fontSize: tamanhos.sm, color: cores.textoSecundario }}>
                                Você está conectado com um perfil administrativo ou sem vínculo direto de produtor.
                            </Typography>
                        ) : meuProdutor.cache_restrito ? (
                            <Chip icon={<CadeadoIcon />} label="Cachê protegido pelo servidor" sx={{ bgcolor: tom(funcao.neutro, 0.16), color: cores.textoSecundario }} />
                        ) : (
                            <Stack spacing={0.75}>
                                <Typography sx={{ fontWeight: 700, fontSize: tamanhos.xl, color: funcao.liberado }}>
                                    {formatarMoedaCentavos(meuProdutor.valor_cache_centavos)}
                                </Typography>
                                <Typography sx={{ fontSize: tamanhos.sm, color: cores.textoSecundario }}>
                                    Modelo: {meuProdutor.tipo_cache || 'diária'}
                                </Typography>
                                <Typography sx={{ fontSize: tamanhos.sm, color: cores.textoSuave }}>
                                    Chave PIX: {meuProdutor.chave_pix || 'Não cadastrada'}
                                </Typography>
                            </Stack>
                        )}
                    </GlassCard>

                    <Button
                        fullWidth
                        variant="outlined"
                        startIcon={<MonitorIcon />}
                        onClick={aoSairModoCampo}
                        sx={{ ...botaoSecundario, minHeight: 48 }}
                    >
                        Abrir visão completa de computador
                    </Button>
                </Stack>
            )}

            {/* Barra de navegação fixa no rodapé para operação com uma mão */}
            <Paper
                elevation={8}
                sx={{
                    position: 'fixed',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    zIndex: 1100,
                    bgcolor: cores.superficie,
                    borderTop: `1px solid ${cores.borda}`
                }}
            >
                <BottomNavigation
                    showLabels
                    value={abaCampo}
                    onChange={(_, novo) => setAbaCampo(novo)}
                    sx={{
                        bgcolor: 'transparent',
                        height: 64,
                        '& .MuiBottomNavigationAction-root': {
                            minWidth: 0,
                            px: 0.5,
                            color: cores.textoSecundario
                        },
                        '& .Mui-selected': {
                            color: `${cores.primaria} !important`
                        },
                        '& .MuiBottomNavigationAction-label': {
                            fontSize: '0.7rem',
                            fontWeight: 600
                        }
                    }}
                >
                    <BottomNavigationAction label="Tarefas" value="tarefas" icon={<TarefasIcon />} />
                    <BottomNavigationAction label="Ponto e QR" value="ponto" icon={<QrIcon />} />
                    <BottomNavigationAction label="Planta" value="planta" icon={<PlantaIcon />} />
                    <BottomNavigationAction label="Materiais" value="materiais" icon={<MateriaisIcon />} />
                    <BottomNavigationAction label="Meu acesso" value="perfil" icon={<PerfilIcon />} />
                </BottomNavigation>
            </Paper>

            {/* Modal rápido de foto da câmera */}
            <Dialog open={Boolean(modalFoto)} onClose={() => setModalFoto(null)} maxWidth="xs" fullWidth>
                <TituloModal titulo="Enviar foto de evidência" subtitulo={modalFoto?.tarefa?.titulo || ''} onFechar={() => setModalFoto(null)} />
                <DialogContent dividers>
                    {modalFoto && (
                        <Stack spacing={2} sx={{ pt: 0.5 }}>
                            <Box component="img" src={modalFoto.fotoPreview} alt="Prévia da foto" sx={{ width: '100%', maxHeight: 240, objectFit: 'cover', borderRadius: 1.5 }} />
                            <FormControl fullWidth size="small">
                                <InputLabel>Etapa da tarefa</InputLabel>
                                <Select
                                    label="Etapa da tarefa"
                                    value={modalFoto.etapaId}
                                    onChange={(e) => setModalFoto((prev) => ({ ...prev, etapaId: e.target.value }))}
                                >
                                    {(modalFoto.tarefa.etapas || []).map((et) => (
                                        <MenuItem key={et.id} value={et.id}>{et.titulo}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                            <TextField
                                fullWidth
                                size="small"
                                label="Comentário opcional"
                                value={modalFoto.comentario}
                                onChange={(e) => setModalFoto((prev) => ({ ...prev, comentario: e.target.value }))}
                            />
                        </Stack>
                    )}
                </DialogContent>
                <DialogActions sx={{ px: 3, py: 2 }}>
                    <Button variant="outlined" onClick={() => setModalFoto(null)} sx={botaoSecundario}>
                        Cancelar
                    </Button>
                    <NeonButton loading={salvando} startIcon={<ConcluidoIcon />} onClick={handleEnviarFotoEvidencia}>
                        Enviar foto
                    </NeonButton>
                </DialogActions>
            </Dialog>

            {/* Modal rápido de nota de voz / observação */}
            <Dialog open={Boolean(modalNotaVoz)} onClose={() => setModalNotaVoz(null)} maxWidth="xs" fullWidth>
                <TituloModal titulo="Registrar nota ou ditado por voz" subtitulo={modalNotaVoz?.tarefa?.titulo || ''} onFechar={() => setModalNotaVoz(null)} />
                <DialogContent dividers>
                    {modalNotaVoz && (
                        <Stack spacing={2} sx={{ pt: 0.5 }}>
                            <FormControl fullWidth size="small">
                                <InputLabel>Etapa</InputLabel>
                                <Select
                                    label="Etapa"
                                    value={modalNotaVoz.etapaId}
                                    onChange={(e) => setModalNotaVoz((prev) => ({ ...prev, etapaId: e.target.value }))}
                                >
                                    {(modalNotaVoz.tarefa.etapas || []).map((et) => (
                                        <MenuItem key={et.id} value={et.id}>{et.titulo}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                            <Button
                                variant="outlined"
                                startIcon={<MicIcon />}
                                onClick={iniciarDitadoVoz}
                                sx={{ ...botaoSecundario, minHeight: 46, borderColor: gravandoVoz ? funcao.negado : undefined, color: gravandoVoz ? funcao.negado : undefined }}
                            >
                                {gravandoVoz ? 'Ouvindo sua voz...' : 'Falar no microfone (ditado)'}
                            </Button>
                            <TextField
                                fullWidth
                                multiline
                                rows={3}
                                label="Texto ou transcrição"
                                value={modalNotaVoz.texto}
                                onChange={(e) => setModalNotaVoz((prev) => ({ ...prev, texto: e.target.value }))}
                            />
                        </Stack>
                    )}
                </DialogContent>
                <DialogActions sx={{ px: 3, py: 2 }}>
                    <Button variant="outlined" onClick={() => setModalNotaVoz(null)} sx={botaoSecundario}>
                        Cancelar
                    </Button>
                    <NeonButton loading={salvando} onClick={handleEnviarNotaVoz}>
                        Salvar observação
                    </NeonButton>
                </DialogActions>
            </Dialog>

            {/* Modal rápido reportar bloqueio */}
            <Dialog open={Boolean(modalBloqueio)} onClose={() => setModalBloqueio(null)} maxWidth="xs" fullWidth>
                <TituloModal titulo="Reportar bloqueio ou problema" subtitulo={modalBloqueio?.tarefa?.titulo || ''} onFechar={() => setModalBloqueio(null)} />
                <DialogContent dividers>
                    {modalBloqueio && (
                        <Stack spacing={2} sx={{ pt: 0.5 }}>
                            <TextField
                                fullWidth
                                multiline
                                rows={3}
                                label="O que está impedindo esta tarefa?"
                                value={modalBloqueio.motivo}
                                onChange={(e) => setModalBloqueio((prev) => ({ ...prev, motivo: e.target.value }))}
                            />
                        </Stack>
                    )}
                </DialogContent>
                <DialogActions sx={{ px: 3, py: 2 }}>
                    <Button variant="outlined" onClick={() => setModalBloqueio(null)} sx={botaoSecundario}>
                        Cancelar
                    </Button>
                    <NeonButton loading={salvando} neonColor={funcao.negado} onClick={handleConfirmarBloqueio}>
                        Confirmar bloqueio
                    </NeonButton>
                </DialogActions>
            </Dialog>

            {/* Modal sugerir ajuste na planta direto do celular */}
            <Dialog open={modalAjustePlanta} onClose={() => setModalAjustePlanta(false)} maxWidth="xs" fullWidth>
                <TituloModal titulo="Sugerir ajuste na planta" subtitulo={elementoSelecionado?.rotulo || ''} onFechar={() => setModalAjustePlanta(false)} />
                <DialogContent dividers>
                    <Stack spacing={2} sx={{ pt: 0.5 }}>
                        <TextField
                            fullWidth
                            size="small"
                            label="Título da sugestão"
                            value={formAjustePlanta.titulo}
                            onChange={(e) => setFormAjustePlanta((prev) => ({ ...prev, titulo: e.target.value }))}
                        />
                        <Stack direction="row" spacing={1.5}>
                            <TextField
                                fullWidth
                                size="small"
                                type="number"
                                label="Mover horizontal (metros)"
                                value={formAjustePlanta.dx}
                                onChange={(e) => setFormAjustePlanta((prev) => ({ ...prev, dx: e.target.value }))}
                            />
                            <TextField
                                fullWidth
                                size="small"
                                type="number"
                                label="Mover vertical (metros)"
                                value={formAjustePlanta.dy}
                                onChange={(e) => setFormAjustePlanta((prev) => ({ ...prev, dy: e.target.value }))}
                            />
                        </Stack>
                        <TextField
                            fullWidth
                            multiline
                            rows={2}
                            label="Justificativa de campo"
                            value={formAjustePlanta.justificativa}
                            onChange={(e) => setFormAjustePlanta((prev) => ({ ...prev, justificativa: e.target.value }))}
                        />
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ px: 3, py: 2 }}>
                    <Button variant="outlined" onClick={() => setModalAjustePlanta(false)} sx={botaoSecundario}>
                        Cancelar
                    </Button>
                    <NeonButton loading={salvando} onClick={handleEnviarPropostaPlantaCampo}>
                        Enviar ao arquiteto
                    </NeonButton>
                </DialogActions>
            </Dialog>

            {/* Modal contagem rápida de material */}
            <Dialog open={Boolean(modalConferenciaRapida)} onClose={() => setModalConferenciaRapida(null)} maxWidth="xs" fullWidth>
                <TituloModal titulo="Contar material em campo" subtitulo={modalConferenciaRapida?.nome || ''} onFechar={() => setModalConferenciaRapida(null)} />
                <DialogContent dividers>
                    {modalConferenciaRapida && (
                        <Stack spacing={2} sx={{ pt: 0.5 }}>
                            <Typography sx={{ fontSize: tamanhos.sm, color: cores.textoSecundario }}>
                                Quantidade planejada: {modalConferenciaRapida.quantidade_planejada || 0} {modalConferenciaRapida.unidade || 'un'}
                            </Typography>
                            <TextField
                                fullWidth
                                type="number"
                                label="Quantidade conferida agora"
                                value={qtdContadaCampo}
                                onChange={(e) => setQtdContadaCampo(e.target.value)}
                            />
                        </Stack>
                    )}
                </DialogContent>
                <DialogActions sx={{ px: 3, py: 2 }}>
                    <Button variant="outlined" onClick={() => setModalConferenciaRapida(null)} sx={botaoSecundario}>
                        Cancelar
                    </Button>
                    <NeonButton loading={salvando} onClick={handleSalvarConferenciaRapida}>
                        Registrar contagem
                    </NeonButton>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default ModoCampoMobile;
