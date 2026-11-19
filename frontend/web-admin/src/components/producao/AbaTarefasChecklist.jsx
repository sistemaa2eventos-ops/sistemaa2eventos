import React, { useState, useMemo } from 'react';
import {
    Box,
    Button,
    Checkbox,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    FormControl,
    Grid,
    InputLabel,
    LinearProgress,
    MenuItem,
    Select,
    Stack,
    TextField,
    Typography
} from '@mui/material';
import {
    Add as AddIcon,
    PlayArrow as IniciarIcon,
    PhotoCamera as FotoIcon,
    CheckCircle as AprovarIcon,
    Replay as ReabrirIcon,
    Block as BloquearIcon,
    LocationOn as GeoIcon,
    Build as SugestaoIcon,
    Mic as VozIcon,
    AutoAwesomeMotion as TemplateIcon,
    Delete as ExcluirIcon
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import { useConfirmacao } from '../../contexts/ConfirmacaoContext';
import GlassCard from '../common/GlassCard';
import NeonButton from '../common/NeonButton';
import TituloModal from '../common/TituloModal';
import producaoSyncService, { comprimirImagemCliente } from '../../services/ProducaoSyncService';
import api from '../../services/api';
import { botaoSecundario, cores, funcao, tamanhos, tom } from '../../styles/tokens';
import {
    FASES_OPERACIONAIS,
    formatarDataHoraCurta,
    obterCorArea,
    obterInfoFase,
    obterNomeArea,
    obterNomeProdutor,
    ROTULO_PRIORIDADE,
    ROTULO_SAUDE_PRAZO,
    ROTULO_STATUS_TAREFA
} from './producaoHelpers';

const AbaTarefasChecklist = ({ eventoId, resumo, headersExtra, aoAtualizar, apiClient }) => {
    const httpClient = apiClient || api;
    const { enqueueSnackbar } = useSnackbar();
    const confirmar = useConfirmacao();
    const [filtroArea, setFiltroArea] = useState('');
    const [filtroFase, setFiltroFase] = useState('');
    const [filtroStatus, setFiltroStatus] = useState('');
    const [filtroPrioridade, setFiltroPrioridade] = useState('');
    const [busca, setBusca] = useState('');

    const [tarefaSelecionadaId, setTarefaSelecionadaId] = useState(null);
    const [modalNovaAberto, setModalNovaAberto] = useState(false);
    const [modalTemplateAberto, setModalTemplateAberto] = useState(false);
    const [formTemplate, setFormTemplate] = useState({ tipo_template: 'festival_show', area_id: '' });
    const [gravandoVoz, setGravandoVoz] = useState(false);
    const [salvando, setSalvando] = useState(false);

    // Estado de evidência na etapa ativa
    const [etapaAtivaId, setEtapaAtivaId] = useState('');
    const [comentarioEvidencia, setComentarioEvidencia] = useState('');
    const [transcricaoAudio, setTranscricaoAudio] = useState('');
    const [fotoPreview, setFotoPreview] = useState(null);
    const [motivoAcao, setMotivoAcao] = useState('');

    // Formulário de nova tarefa
    const [formNova, setFormNova] = useState({
        titulo: '',
        area_id: '',
        setor_id: '',
        fase_operacional: 'montagem',
        prioridade: 'media',
        objetivo: '',
        sugestoes_texto: 'Capacete, Luvas de proteção, Rádio comunicador',
        etapas_texto: 'Conferir material no local\nExecutar montagem conforme planta\nRegistrar foto final de conferência',
        data_inicio_planejada: new Date().toISOString().slice(0, 16),
        data_fim_planejada: new Date(Date.now() + 6 * 3600000).toISOString().slice(0, 16)
    });

    const areas = resumo?.areas || [];
    const produtores = resumo?.produtores || [];
    const tarefas = useMemo(() => resumo?.tarefas || [], [resumo?.tarefas]);
    const ctx = resumo?.contexto_usuario || {};
    const plantas = resumo?.plantas || [];
    const versaoOficial = plantas[0]?.versoes?.find((v) => v.eh_oficial) || plantas[0]?.versoes?.[0];
    const setores = versaoOficial?.setores || [];

    const tarefaAtiva = useMemo(
        () => tarefas.find((t) => t.id === tarefaSelecionadaId) || null,
        [tarefas, tarefaSelecionadaId]
    );

    const tarefasFiltradas = useMemo(() => {
        return tarefas.filter((t) => {
            if (filtroArea && t.area_id !== filtroArea) return false;
            if (filtroFase && (t.fase_operacional || 'montagem') !== filtroFase) return false;
            if (filtroStatus && t.status !== filtroStatus) return false;
            if (filtroPrioridade && t.prioridade !== filtroPrioridade) return false;
            if (busca && !t.titulo.toLowerCase().includes(busca.toLowerCase())) return false;
            return true;
        });
    }, [tarefas, filtroArea, filtroFase, filtroStatus, filtroPrioridade, busca]);

    const podeCriar = ['admin_master', 'master', 'produtor_geral', 'produtor_area'].includes(ctx.papel_producao);
    const podeAprovar = ['admin_master', 'master', 'produtor_geral'].includes(ctx.papel_producao);

    const capturarGeolocalizacao = () => new Promise((resolve) => {
        if (!navigator.geolocation) return resolve(null);
        navigator.geolocation.getCurrentPosition(
            (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, precisao_m: Math.round(pos.coords.accuracy) }),
            () => resolve(null),
            { timeout: 2500 }
        );
    });

    const handleAbrirTarefa = (t) => {
        setTarefaSelecionadaId(t.id);
        setEtapaAtivaId(t.etapas?.[0]?.id || '');
        setComentarioEvidencia('');
        setTranscricaoAudio('');
        setFotoPreview(null);
        setMotivoAcao('');
    };

    const handleIniciarTarefa = async (tarefa) => {
        try {
            const geo = await capturarGeolocalizacao();
            await httpClient.post(`/producao/tarefas/${tarefa.id}/iniciar`, { geolocalizacao: geo }, { headers: headersExtra });
            enqueueSnackbar('Tarefa iniciada e registrada no cronograma.', { variant: 'success' });
            await aoAtualizar();
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Não foi possível iniciar a tarefa.', { variant: 'error' });
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
                enqueueSnackbar('Sem conexão. Alteração da etapa salva na fila offline.', { variant: 'warning' });
            } else {
                enqueueSnackbar(etapa.concluida ? 'Etapa reaberta.' : 'Etapa concluída e progresso atualizado.', { variant: 'success' });
                await aoAtualizar();
            }
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Erro ao atualizar etapa.', { variant: 'error' });
        }
    };

    const handleSelecionarFoto = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const comprimida = await comprimirImagemCliente(file, 1280, 0.75);
            setFotoPreview(comprimida);
            enqueueSnackbar('Foto otimizada para envio em campo.', { variant: 'info' });
        } catch {
            enqueueSnackbar('Falha ao processar imagem.', { variant: 'error' });
        }
    };

    const handleEnviarEvidencia = async () => {
        if (!tarefaAtiva || !etapaAtivaId) return;
        if (!fotoPreview && !comentarioEvidencia.trim() && !transcricaoAudio.trim()) {
            enqueueSnackbar('Adicione uma foto, comentário ou transcrição de áudio.', { variant: 'warning' });
            return;
        }
        try {
            setSalvando(true);
            const geo = await capturarGeolocalizacao();
            const tipo = fotoPreview ? 'foto' : (transcricaoAudio.trim() ? 'audio' : 'texto');
            const res = await producaoSyncService.enviarComSuporteOffline(
                eventoId,
                `/producao/tarefas/${tarefaAtiva.id}/etapas/${etapaAtivaId}/evidencias`,
                'evidencia',
                {
                    tarefa_id: tarefaAtiva.id,
                    etapa_id: etapaAtivaId,
                    tipo,
                    url_arquivo: fotoPreview,
                    texto_comentario: comentarioEvidencia.trim() || null,
                    transcricao_audio: transcricaoAudio.trim() || null,
                    geolocalizacao: geo
                },
                headersExtra,
                httpClient
            );
            setComentarioEvidencia('');
            setTranscricaoAudio('');
            setFotoPreview(null);
            if (res.status === 'offline') {
                enqueueSnackbar('Evidência salva na fila offline e será enviada automaticamente.', { variant: 'warning' });
            } else {
                enqueueSnackbar('Evidência registrada na etapa.', { variant: 'success' });
                await aoAtualizar();
            }
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Erro ao enviar evidência.', { variant: 'error' });
        } finally {
            setSalvando(false);
        }
    };

    const handleRevisaoTarefa = async (decisao) => {
        if (!tarefaAtiva) return;
        if ((decisao === 'reabrir' || decisao === 'bloquear') && !motivoAcao.trim()) {
            enqueueSnackbar('Informe o motivo antes de prosseguir.', { variant: 'warning' });
            return;
        }
        try {
            setSalvando(true);
            await httpClient.post(`/producao/tarefas/${tarefaAtiva.id}/revisao`, {
                decisao,
                motivo: motivoAcao.trim()
            }, { headers: headersExtra });
            enqueueSnackbar(
                decisao === 'aprovar' ? 'Tarefa aprovada com sucesso.' : (decisao === 'reabrir' ? 'Tarefa reaberta para ajustes.' : 'Impedimento registrado na tarefa.'),
                { variant: 'success' }
            );
            setMotivoAcao('');
            await aoAtualizar();
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Ação não permitida.', { variant: 'error' });
        } finally {
            setSalvando(false);
        }
    };

    const handleCriarTarefa = async () => {
        if (!formNova.titulo.trim()) {
            enqueueSnackbar('Informe o título da tarefa.', { variant: 'warning' });
            return;
        }
        try {
            setSalvando(true);
            await httpClient.post('/producao/tarefas', {
                titulo: formNova.titulo,
                area_id: formNova.area_id || ctx.area_id || areas[0]?.id,
                setor_id: formNova.setor_id || null,
                fase_operacional: formNova.fase_operacional || 'montagem',
                prioridade: formNova.prioridade,
                objetivo: formNova.objetivo,
                sugestoes_levar: formNova.sugestoes_texto.split(',').map((s) => s.trim()).filter(Boolean),
                etapas: formNova.etapas_texto.split('\n').map((s) => s.trim()).filter(Boolean),
                data_inicio_planejada: new Date(formNova.data_inicio_planejada).toISOString(),
                data_fim_planejada: new Date(formNova.data_fim_planejada).toISOString()
            }, { headers: headersExtra });
            enqueueSnackbar('Tarefa criada e disponibilizada no quadro.', { variant: 'success' });
            setModalNovaAberto(false);
            setFormNova((prev) => ({ ...prev, titulo: '', objetivo: '' }));
            await aoAtualizar();
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Erro ao criar tarefa.', { variant: 'error' });
        } finally {
            setSalvando(false);
        }
    };

    const handleAplicarTemplate = async () => {
        try {
            setSalvando(true);
            const res = await httpClient.post('/producao/tarefas/templates', {
                tipo_template: formTemplate.tipo_template,
                area_id: formTemplate.area_id || ctx.area_id || areas[0]?.id
            }, { headers: headersExtra });
            const info = res.data?.data;
            enqueueSnackbar(`${info?.criadas || 0} tarefa(s) do modelo "${info?.rotulo || ''}" adicionada(s).`, { variant: 'success' });
            setModalTemplateAberto(false);
            await aoAtualizar();
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Erro ao aplicar template.', { variant: 'error' });
        } finally {
            setSalvando(false);
        }
    };

    const handleAtualizarCampoTarefa = async (tarefaId, campos) => {
        try {
            await httpClient.put(`/producao/tarefas/${tarefaId}`, campos, { headers: headersExtra });
            enqueueSnackbar('Tarefa atualizada.', { variant: 'success' });
            await aoAtualizar();
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Erro ao atualizar tarefa.', { variant: 'error' });
        }
    };

    const handleExcluirTarefa = async (tarefa) => {
        const ok = await confirmar({
            titulo: 'Excluir tarefa',
            mensagem: `Deseja excluir a tarefa "${tarefa.titulo}" definitivamente?`,
            textoConfirmar: 'Excluir'
        });
        if (!ok) return;
        try {
            await httpClient.delete(`/producao/tarefas/${tarefa.id}`, { headers: headersExtra });
            enqueueSnackbar('Tarefa excluída.', { variant: 'success' });
            setTarefaSelecionadaId(null);
            await aoAtualizar();
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Sem permissão para excluir.', { variant: 'error' });
        }
    };

    const handleGravarVoz = () => {
        const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!Rec) {
            enqueueSnackbar('Seu navegador não suporta transcrição automática de voz. Digite a anotação no campo.', { variant: 'info' });
            return;
        }
        try {
            const recognition = new Rec();
            recognition.lang = 'pt-BR';
            recognition.interimResults = false;
            setGravandoVoz(true);
            recognition.onresult = (event) => {
                const texto = event.results?.[0]?.[0]?.transcript || '';
                if (texto) {
                    setTranscricaoAudio((prev) => (prev ? `${prev} ${texto}` : texto));
                    enqueueSnackbar('Áudio transcrito para o campo de evidência.', { variant: 'success' });
                }
            };
            recognition.onerror = () => enqueueSnackbar('Não foi possível capturar o áudio do microfone.', { variant: 'warning' });
            recognition.onend = () => setGravandoVoz(false);
            recognition.start();
        } catch {
            setGravandoVoz(false);
        }
    };

    return (
        <Stack spacing={2.5}>
            {/* Filtros e ação principal */}
            <GlassCard sx={{ p: 2 }}>
                <Grid container spacing={1.5} alignItems="center">
                    <Grid item xs={12} sm={6} md={2.5}>
                        <TextField
                            fullWidth
                            size="small"
                            label="Buscar tarefa"
                            value={busca}
                            onChange={(e) => setBusca(e.target.value)}
                        />
                    </Grid>
                    <Grid item xs={6} sm={3} md={1.8}>
                        <FormControl fullWidth size="small">
                            <InputLabel>Fase</InputLabel>
                            <Select label="Fase" value={filtroFase} onChange={(e) => setFiltroFase(e.target.value)}>
                                <MenuItem value="">Todas</MenuItem>
                                {FASES_OPERACIONAIS.map((f) => (
                                    <MenuItem key={f.valor} value={f.valor}>{f.rotulo}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Grid>
                    <Grid item xs={6} sm={3} md={1.9}>
                        <FormControl fullWidth size="small">
                            <InputLabel>Área</InputLabel>
                            <Select label="Área" value={filtroArea} onChange={(e) => setFiltroArea(e.target.value)}>
                                <MenuItem value="">Todas</MenuItem>
                                {areas.map((a) => <MenuItem key={a.id} value={a.id}>{a.nome}</MenuItem>)}
                            </Select>
                        </FormControl>
                    </Grid>
                    <Grid item xs={6} sm={3} md={1.7}>
                        <FormControl fullWidth size="small">
                            <InputLabel>Status</InputLabel>
                            <Select label="Status" value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}>
                                <MenuItem value="">Todos</MenuItem>
                                {Object.entries(ROTULO_STATUS_TAREFA).map(([k, v]) => (
                                    <MenuItem key={k} value={k}>{v.texto}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Grid>
                    <Grid item xs={6} sm={3} md={1.6}>
                        <FormControl fullWidth size="small">
                            <InputLabel>Prioridade</InputLabel>
                            <Select label="Prioridade" value={filtroPrioridade} onChange={(e) => setFiltroPrioridade(e.target.value)}>
                                <MenuItem value="">Todas</MenuItem>
                                {Object.entries(ROTULO_PRIORIDADE).map(([k, v]) => (
                                    <MenuItem key={k} value={k}>{v.texto}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Grid>
                    <Grid item xs={12} sm={9} md={2.5} sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, flexWrap: 'wrap' }}>
                        {podeCriar && (
                            <>
                                <Button
                                    variant="outlined"
                                    size="small"
                                    startIcon={<TemplateIcon />}
                                    onClick={() => setModalTemplateAberto(true)}
                                    sx={botaoSecundario}
                                >
                                    Aplicar template
                                </Button>
                                <NeonButton startIcon={<AddIcon />} onClick={() => setModalNovaAberto(true)}>
                                    Criar tarefa
                                </NeonButton>
                            </>
                        )}
                    </Grid>
                </Grid>
            </GlassCard>

            {/* Lista de tarefas */}
            <Grid container spacing={2}>
                {tarefasFiltradas.map((t) => {
                    const st = ROTULO_STATUS_TAREFA[t.status] || ROTULO_STATUS_TAREFA.disponivel;
                    const prio = ROTULO_PRIORIDADE[t.prioridade] || ROTULO_PRIORIDADE.media;
                    const saude = ROTULO_SAUDE_PRAZO[t.saude_prazo] || ROTULO_SAUDE_PRAZO.no_prazo;
                    const faseInfo = obterInfoFase(t.fase_operacional);
                    const areaCor = obterCorArea(areas, t.area_id);
                    const totalEvid = (t.etapas || []).reduce((acc, e) => acc + (e.evidencias?.length || 0), 0);

                    return (
                        <Grid item xs={12} md={6} key={t.id}>
                            <GlassCard sx={{ p: 2.25, height: '100%', borderLeft: `4px solid ${areaCor}` }}>
                                <Stack spacing={1.5} sx={{ height: '100%', justifyContent: 'space-between' }}>
                                    <Box>
                                        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
                                            <Chip size="small" label={faseInfo.rotulo} sx={{ bgcolor: tom(faseInfo.cor, 0.14), color: faseInfo.cor, fontWeight: 700 }} />
                                            <Chip size="small" label={obterNomeArea(areas, t.area_id)} sx={{ bgcolor: tom(areaCor, 0.14), color: areaCor, fontWeight: 600 }} />
                                            <Chip size="small" label={st.texto} sx={{ bgcolor: tom(st.cor, 0.14), color: st.cor, fontWeight: 600 }} />
                                            <Chip size="small" label={prio.texto} sx={{ bgcolor: tom(prio.cor, 0.14), color: prio.cor, fontWeight: 600 }} />
                                            <Chip size="small" label={saude.texto} sx={{ bgcolor: tom(saude.cor, 0.14), color: saude.cor, fontWeight: 600 }} />
                                            {t.elemento_planta_rotulo && (
                                                <Chip size="small" label={t.elemento_planta_rotulo} sx={{ bgcolor: tom(cores.primaria, 0.12), color: cores.textoSuave }} />
                                            )}
                                        </Stack>

                                        <Typography variant="subtitle1" sx={{ color: cores.textoForte, fontWeight: 700, mb: 0.5 }}>
                                            {t.titulo}
                                        </Typography>
                                        <Typography variant="body2" sx={{ color: cores.textoSecundario, mb: 1 }}>
                                            {t.objetivo || 'Sem descrição detalhada.'}
                                        </Typography>

                                        {t.sugestoes_levar?.length > 0 && (
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap', mb: 1 }}>
                                                <SugestaoIcon sx={{ fontSize: 15, color: funcao.acao }} />
                                                <Typography sx={{ fontSize: tamanhos.xs, color: cores.textoSuave }}>
                                                    Levar: {t.sugestoes_levar.join(', ')}
                                                </Typography>
                                            </Box>
                                        )}
                                    </Box>

                                    <Box>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                                            <Typography sx={{ fontSize: tamanhos.xs, color: cores.textoSecundario }}>
                                                Etapas: {t.etapas_concluidas || 0}/{t.total_etapas || 0} • Evidências: {totalEvid}
                                            </Typography>
                                            <Typography sx={{ fontSize: tamanhos.xs, color: cores.textoForte, fontWeight: 700 }}>
                                                {t.percentual_concluido || 0}%
                                            </Typography>
                                        </Box>
                                        <LinearProgress
                                            variant="determinate"
                                            value={t.percentual_concluido || 0}
                                            sx={{ height: 7, borderRadius: 4, bgcolor: 'rgba(148,163,184,0.14)', mb: 1.5 }}
                                        />

                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
                                            <Typography sx={{ fontSize: tamanhos.xs, color: cores.textoSecundario }}>
                                                {obterNomeProdutor(produtores, t.produtor_atribuido_id)} • Prazo: {formatarDataHoraCurta(t.data_fim_planejada)}
                                            </Typography>
                                            <Stack direction="row" spacing={1}>
                                                {t.status === 'disponivel' && (
                                                    <Button
                                                        variant="outlined"
                                                        size="small"
                                                        startIcon={<IniciarIcon />}
                                                        onClick={() => handleIniciarTarefa(t)}
                                                        sx={botaoSecundario}
                                                    >
                                                        Iniciar
                                                    </Button>
                                                )}
                                                <NeonButton size="small" onClick={() => handleAbrirTarefa(t)}>
                                                    Abrir checklist
                                                </NeonButton>
                                            </Stack>
                                        </Box>
                                    </Box>
                                </Stack>
                            </GlassCard>
                        </Grid>
                    );
                })}
                {tarefasFiltradas.length === 0 && (
                    <Grid item xs={12}>
                        <GlassCard sx={{ p: 4, textAlign: 'center' }}>
                            <Typography sx={{ color: cores.textoSecundario }}>
                                Nenhuma tarefa encontrada para os filtros e permissões atuais.
                            </Typography>
                        </GlassCard>
                    </Grid>
                )}
            </Grid>

            {/* Modal de execução, checklist, evidências e aprovação */}
            <Dialog open={Boolean(tarefaAtiva)} onClose={() => setTarefaSelecionadaId(null)} maxWidth="md" fullWidth>
                <TituloModal
                    titulo={tarefaAtiva?.titulo || 'Detalhes da tarefa'}
                    subtitulo={tarefaAtiva ? `${obterNomeArea(areas, tarefaAtiva.area_id)} • Prazo planejado até ${formatarDataHoraCurta(tarefaAtiva.data_fim_planejada)}` : ''}
                    onFechar={() => setTarefaSelecionadaId(null)}
                />
                <DialogContent dividers>
                    {tarefaAtiva && (
                        <Stack spacing={2.5}>
                            <Typography variant="body2" sx={{ color: cores.textoSuave }}>
                                {tarefaAtiva.objetivo}
                            </Typography>

                            {tarefaAtiva.motivo_bloqueio && (
                                <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: tom(funcao.negado, 0.12), border: `1px solid ${funcao.negado}` }}>
                                    <Typography sx={{ color: funcao.negado, fontWeight: 600, fontSize: tamanhos.sm }}>
                                        Impedimento reportado: {tarefaAtiva.motivo_bloqueio}
                                    </Typography>
                                </Box>
                            )}

                            {/* Etapas */}
                            <Box>
                                <Typography variant="subtitle2" sx={{ color: cores.textoForte, mb: 1 }}>
                                    Checklist de etapas
                                </Typography>
                                <Stack spacing={1}>
                                    {(tarefaAtiva.etapas || []).map((etapa) => (
                                        <Box
                                            key={etapa.id}
                                            sx={{
                                                p: 1.25,
                                                borderRadius: 2,
                                                border: `1px solid ${etapaAtivaId === etapa.id ? cores.primaria : cores.borda}`,
                                                bgcolor: cores.superficieElevada
                                            }}
                                        >
                                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                    <Checkbox
                                                        checked={Boolean(etapa.concluida)}
                                                        onChange={() => handleAlternarEtapa(tarefaAtiva, etapa)}
                                                    />
                                                    <Box>
                                                        <Typography sx={{ fontSize: tamanhos.md, color: cores.textoForte, textDecoration: etapa.concluida ? 'line-through' : 'none' }}>
                                                            {etapa.ordem}. {etapa.descricao}
                                                        </Typography>
                                                        {etapa.geolocalizacao && (
                                                            <Typography sx={{ fontSize: tamanhos.xs, color: cores.textoSecundario, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                                <GeoIcon sx={{ fontSize: 13 }} />
                                                                {etapa.geolocalizacao.latitude.toFixed(4)}, {etapa.geolocalizacao.longitude.toFixed(4)}
                                                            </Typography>
                                                        )}
                                                    </Box>
                                                </Box>
                                                <Button
                                                    variant="outlined"
                                                    size="small"
                                                    onClick={() => setEtapaAtivaId(etapa.id)}
                                                    sx={botaoSecundario}
                                                >
                                                    Evidências ({etapa.evidencias?.length || 0})
                                                </Button>
                                            </Box>

                                            {(etapa.evidencias || []).length > 0 && (
                                                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mt: 1, pl: 5 }}>
                                                    {etapa.evidencias.map((ev) => (
                                                        <Box
                                                            key={ev.id}
                                                            sx={{
                                                                p: 1,
                                                                borderRadius: 1.5,
                                                                bgcolor: cores.fundo,
                                                                border: `1px solid ${cores.borda}`,
                                                                maxWidth: 260
                                                            }}
                                                        >
                                                            {ev.url_arquivo && (
                                                                <Box component="img" src={ev.url_arquivo} alt="Evidência" sx={{ width: '100%', maxHeight: 110, objectFit: 'cover', borderRadius: 1, mb: 0.5 }} />
                                                            )}
                                                            <Typography sx={{ fontSize: tamanhos.xs, color: cores.textoSuave }}>
                                                                {ev.texto_comentario || ev.transcricao_audio || 'Registro fotográfico'}
                                                            </Typography>
                                                            <Typography sx={{ fontSize: '0.7rem', color: cores.textoSecundario }}>
                                                                {ev.autor_nome || 'Equipe'} • {formatarDataHoraCurta(ev.criado_em)}
                                                            </Typography>
                                                        </Box>
                                                    ))}
                                                </Stack>
                                            )}
                                        </Box>
                                    ))}
                                </Stack>
                            </Box>

                            {/* Enviar evidência */}
                            <GlassCard sx={{ p: 2 }}>
                                <Typography variant="subtitle2" sx={{ color: cores.textoForte, mb: 1.5 }}>
                                    Anexar evidência de campo (suporte offline automático)
                                </Typography>
                                <Stack spacing={1.5}>
                                    <TextField
                                        fullWidth
                                        size="small"
                                        label="Comentário ou observação"
                                        value={comentarioEvidencia}
                                        onChange={(e) => setComentarioEvidencia(e.target.value)}
                                    />
                                    <Stack direction="row" spacing={1} alignItems="center">
                                        <TextField
                                            fullWidth
                                            size="small"
                                            label="Nota de áudio ou transcrição rápida"
                                            value={transcricaoAudio}
                                            onChange={(e) => setTranscricaoAudio(e.target.value)}
                                        />
                                        <Button
                                            variant="outlined"
                                            startIcon={<VozIcon />}
                                            onClick={handleGravarVoz}
                                            sx={botaoSecundario}
                                        >
                                            {gravandoVoz ? 'Ouvindo...' : 'Gravar voz'}
                                        </Button>
                                    </Stack>
                                    <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
                                        <Button component="label" variant="outlined" startIcon={<FotoIcon />} sx={botaoSecundario}>
                                            Selecionar foto
                                            <input type="file" accept="image/*" capture="environment" hidden onChange={handleSelecionarFoto} />
                                        </Button>
                                        {fotoPreview && (
                                            <Box component="img" src={fotoPreview} alt="Prévia" sx={{ width: 56, height: 42, objectFit: 'cover', borderRadius: 1 }} />
                                        )}
                                        <NeonButton loading={salvando} onClick={handleEnviarEvidencia}>
                                            Registrar evidência
                                        </NeonButton>
                                    </Stack>
                                </Stack>
                            </GlassCard>

                            {/* Atribuição e prioridade */}
                            {podeCriar && (
                                <Grid container spacing={1.5}>
                                    <Grid item xs={12} sm={6}>
                                        <FormControl fullWidth size="small">
                                            <InputLabel>Responsável atribuído</InputLabel>
                                            <Select
                                                label="Responsável atribuído"
                                                value={tarefaAtiva.produtor_atribuido_id || ''}
                                                onChange={(e) => handleAtualizarCampoTarefa(tarefaAtiva.id, { produtor_atribuido_id: e.target.value })}
                                            >
                                                <MenuItem value="">Disponível para a área</MenuItem>
                                                {produtores.map((p) => <MenuItem key={p.id} value={p.id}>{p.nome}</MenuItem>)}
                                            </Select>
                                        </FormControl>
                                    </Grid>
                                    <Grid item xs={12} sm={6}>
                                        <FormControl fullWidth size="small">
                                            <InputLabel>Prioridade</InputLabel>
                                            <Select
                                                label="Prioridade"
                                                value={tarefaAtiva.prioridade || 'media'}
                                                onChange={(e) => handleAtualizarCampoTarefa(tarefaAtiva.id, { prioridade: e.target.value })}
                                            >
                                                {Object.entries(ROTULO_PRIORIDADE).map(([k, v]) => (
                                                    <MenuItem key={k} value={k}>{v.texto}</MenuItem>
                                                ))}
                                            </Select>
                                        </FormControl>
                                    </Grid>
                                </Grid>
                            )}

                            {/* Bloqueio / Aprovação */}
                            <Box>
                                <TextField
                                    fullWidth
                                    size="small"
                                    label="Motivo para bloqueio ou reabertura"
                                    value={motivoAcao}
                                    onChange={(e) => setMotivoAcao(e.target.value)}
                                    sx={{ mb: 1.5 }}
                                />
                                <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
                                    <NeonButton neonColor={funcao.negado} startIcon={<BloquearIcon />} onClick={() => handleRevisaoTarefa('bloquear')}>
                                        Marcar bloqueada
                                    </NeonButton>
                                    {podeAprovar && (
                                        <>
                                            <NeonButton neonColor={funcao.alerta} startIcon={<ReabrirIcon />} onClick={() => handleRevisaoTarefa('reabrir')}>
                                                Reabrir tarefa
                                            </NeonButton>
                                            <NeonButton startIcon={<AprovarIcon />} onClick={() => handleRevisaoTarefa('aprovar')}>
                                                Aprovar conclusão
                                            </NeonButton>
                                            <NeonButton neonColor={funcao.negado} startIcon={<ExcluirIcon />} onClick={() => handleExcluirTarefa(tarefaAtiva)}>
                                                Excluir tarefa
                                            </NeonButton>
                                        </>
                                    )}
                                </Stack>
                            </Box>
                        </Stack>
                    )}
                </DialogContent>
                <DialogActions sx={{ px: 3, py: 2 }}>
                    <Button variant="outlined" onClick={() => setTarefaSelecionadaId(null)} sx={botaoSecundario}>
                        Fechar
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Modal de criação de tarefa */}
            <Dialog open={modalNovaAberto} onClose={() => setModalNovaAberto(false)} maxWidth="sm" fullWidth>
                <TituloModal
                    titulo="Nova tarefa de produção"
                    subtitulo="Defina a área responsável, o prazo planejado e o checklist de etapas."
                    onFechar={() => setModalNovaAberto(false)}
                />
                <DialogContent dividers>
                    <Stack spacing={2} sx={{ pt: 0.5 }}>
                        <TextField
                            fullWidth
                            label="Título da tarefa"
                            value={formNova.titulo}
                            onChange={(e) => setFormNova({ ...formNova, titulo: e.target.value })}
                        />
                        <Grid container spacing={1.5}>
                            <Grid item xs={12} sm={6}>
                                <FormControl fullWidth size="small">
                                    <InputLabel>Área responsável</InputLabel>
                                    <Select
                                        label="Área responsável"
                                        value={formNova.area_id || ctx.area_id || ''}
                                        onChange={(e) => setFormNova({ ...formNova, area_id: e.target.value })}
                                    >
                                        {areas.map((a) => <MenuItem key={a.id} value={a.id}>{a.nome}</MenuItem>)}
                                    </Select>
                                </FormControl>
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <FormControl fullWidth size="small">
                                    <InputLabel>Prioridade</InputLabel>
                                    <Select
                                        label="Prioridade"
                                        value={formNova.prioridade}
                                        onChange={(e) => setFormNova({ ...formNova, prioridade: e.target.value })}
                                    >
                                        {Object.entries(ROTULO_PRIORIDADE).map(([k, v]) => (
                                            <MenuItem key={k} value={k}>{v.texto}</MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                            </Grid>
                        </Grid>
                        <Grid container spacing={1.5}>
                            <Grid item xs={12} sm={6}>
                                <FormControl fullWidth size="small">
                                    <InputLabel>Fase operacional</InputLabel>
                                    <Select
                                        label="Fase operacional"
                                        value={formNova.fase_operacional}
                                        onChange={(e) => setFormNova({ ...formNova, fase_operacional: e.target.value })}
                                    >
                                        {FASES_OPERACIONAIS.map((f) => (
                                            <MenuItem key={f.valor} value={f.valor}>{f.rotulo}</MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <FormControl fullWidth size="small">
                                    <InputLabel>Setor da planta</InputLabel>
                                    <Select
                                        label="Setor da planta"
                                        value={formNova.setor_id}
                                        onChange={(e) => setFormNova({ ...formNova, setor_id: e.target.value })}
                                    >
                                        <MenuItem value="">Sem setor específico</MenuItem>
                                        {setores.map((s) => <MenuItem key={s.id} value={s.id}>{s.nome}</MenuItem>)}
                                    </Select>
                                </FormControl>
                            </Grid>
                        </Grid>
                        <Grid container spacing={1.5}>
                            <Grid item xs={12} sm={6}>
                                <TextField
                                    fullWidth
                                    size="small"
                                    type="datetime-local"
                                    label="Início planejado"
                                    InputLabelProps={{ shrink: true }}
                                    value={formNova.data_inicio_planejada}
                                    onChange={(e) => setFormNova({ ...formNova, data_inicio_planejada: e.target.value })}
                                />
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField
                                    fullWidth
                                    size="small"
                                    type="datetime-local"
                                    label="Prazo final planejado"
                                    InputLabelProps={{ shrink: true }}
                                    value={formNova.data_fim_planejada}
                                    onChange={(e) => setFormNova({ ...formNova, data_fim_planejada: e.target.value })}
                                />
                            </Grid>
                        </Grid>
                        <TextField
                            fullWidth
                            multiline
                            rows={2}
                            label="Objetivo técnico"
                            value={formNova.objetivo}
                            onChange={(e) => setFormNova({ ...formNova, objetivo: e.target.value })}
                        />
                        <TextField
                            fullWidth
                            label="Sugestões do que levar (separado por vírgula)"
                            value={formNova.sugestoes_texto}
                            onChange={(e) => setFormNova({ ...formNova, sugestoes_texto: e.target.value })}
                        />
                        <TextField
                            fullWidth
                            multiline
                            rows={3}
                            label="Etapas do checklist (uma por linha)"
                            value={formNova.etapas_texto}
                            onChange={(e) => setFormNova({ ...formNova, etapas_texto: e.target.value })}
                        />
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ px: 3, py: 2 }}>
                    <Button variant="outlined" onClick={() => setModalNovaAberto(false)} sx={botaoSecundario}>
                        Cancelar
                    </Button>
                    <NeonButton loading={salvando} onClick={handleCriarTarefa}>
                        Salvar tarefa
                    </NeonButton>
                </DialogActions>
            </Dialog>

            {/* Modal aplicar template de tarefas */}
            <Dialog open={modalTemplateAberto} onClose={() => setModalTemplateAberto(false)} maxWidth="xs" fullWidth>
                <TituloModal
                    titulo="Aplicar template de tarefas"
                    subtitulo="Cria automaticamente um pacote de etapas padrão por tipo de evento."
                    onFechar={() => setModalTemplateAberto(false)}
                />
                <DialogContent dividers>
                    <Stack spacing={2} sx={{ pt: 0.5 }}>
                        <FormControl fullWidth size="small">
                            <InputLabel>Tipo de evento</InputLabel>
                            <Select
                                label="Tipo de evento"
                                value={formTemplate.tipo_template}
                                onChange={(e) => setFormTemplate({ ...formTemplate, tipo_template: e.target.value })}
                            >
                                {(resumo?.templates_disponiveis || [
                                    { chave: 'festival_show', rotulo: 'Festival e show ao vivo', quantidade_tarefas: 3 },
                                    { chave: 'feira_exposicao', rotulo: 'Feira e exposição', quantidade_tarefas: 2 },
                                    { chave: 'corporativo_congresso', rotulo: 'Corporativo e congresso', quantidade_tarefas: 2 }
                                ]).map((tpl) => (
                                    <MenuItem key={tpl.chave} value={tpl.chave}>
                                        {tpl.rotulo} ({tpl.quantidade_tarefas} tarefas)
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                        <FormControl fullWidth size="small">
                            <InputLabel>Área destino</InputLabel>
                            <Select
                                label="Área destino"
                                value={formTemplate.area_id || ctx.area_id || areas[0]?.id || ''}
                                onChange={(e) => setFormTemplate({ ...formTemplate, area_id: e.target.value })}
                            >
                                {areas.map((a) => <MenuItem key={a.id} value={a.id}>{a.nome}</MenuItem>)}
                            </Select>
                        </FormControl>
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ px: 3, py: 2 }}>
                    <Button variant="outlined" onClick={() => setModalTemplateAberto(false)} sx={botaoSecundario}>
                        Cancelar
                    </Button>
                    <NeonButton loading={salvando} onClick={handleAplicarTemplate}>
                        Aplicar modelo
                    </NeonButton>
                </DialogActions>
            </Dialog>
        </Stack>
    );
};

export default AbaTarefasChecklist;
