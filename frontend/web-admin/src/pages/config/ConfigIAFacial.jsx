import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
    Box, Typography, Grid, Slider, Switch, FormControlLabel, CircularProgress, Stack, Chip, Alert,
    MenuItem, Select, TextField, Table, TableHead, TableRow, TableCell, TableBody, TableContainer,
    Tooltip, IconButton, Collapse, Button
} from '@mui/material';
import {
    Save as SaveIcon, Memory as GpuIcon, Speed as SpeedIcon, Tune as TuneIcon,
    Videocam as CameraIcon, Refresh as RefreshIcon, RestartAlt as RestaurarIcon,
    ExpandMore as ExpandIcon, ExpandLess as CollapseIcon
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import api from '../../services/api';
import PageHeader from '../../components/common/PageHeader';
import GlassCard from '../../components/common/GlassCard';
import NeonButton from '../../components/common/NeonButton';
import { carregarIaConfig, definirIaConfig, useIaConfig, useIaStatus, statusDaCamera, NOMES_PERFIL } from '../../hooks/useIaConfig';

// Mesma tabela do motor (backend/microservice-face-python/src/main.py → PERFIS e COMUNS)
const PERFIS_IA = {
    leve: { ia_fps_total: 15, ia_fps_foco: 6, ia_fps_mini: 3, ia_fps_vigilancia: 2, ia_stream: 'sub', limiar: 0.50, margem: 0.06, confirmacoes: 2 },
    equilibrado: { ia_fps_total: 30, ia_fps_foco: 10, ia_fps_mini: 4, ia_fps_vigilancia: 3, ia_stream: 'auto', limiar: 0.48, margem: 0.06, confirmacoes: 2 },
    maximo: { ia_fps_total: 45, ia_fps_foco: 15, ia_fps_mini: 6, ia_fps_vigilancia: 5, ia_stream: 'principal', limiar: 0.46, margem: 0.05, confirmacoes: 2 }
};
const COMUNS_IA = { min_face_px: 36, min_nitidez: 25, max_yaw: 45, reconhecer_s: 1, movimento: true, aprender: true };
const DESCRICAO_PERFIL = {
    leve: 'Para computador modesto ou internet fraca: menos análises por segundo e vídeo mais leve.',
    equilibrado: 'Recomendado. Boa precisão sem pesar: IA no stream principal só quando alguém olha a câmera em tela grande.',
    maximo: 'Para placa de vídeo forte e boa internet: mais análises, vídeo mais nítido e IA sempre no stream principal.'
};
const NOMES_STREAM = { sub: 'Sempre o sub-stream (leve)', auto: 'Automático', principal: 'Sempre o stream principal (nítido)' };

const Campo = ({ titulo, ajuda, children }) => (
    <Box sx={{ mb: 2.5 }}>
        <Typography variant="body2" fontWeight={700}>{titulo}</Typography>
        {ajuda && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>{ajuda}</Typography>}
        {children}
    </Box>
);

const ConfigIAFacial = () => {
    const { enqueueSnackbar } = useSnackbar();
    const [cfg, setCfg] = useState(null);
    const [saving, setSaving] = useState(false);
    const [avancado, setAvancado] = useState(false);
    const [cameras, setCameras] = useState([]);
    const [salvandoCam, setSalvandoCam] = useState(null);
    const { status, erro: erroStatus } = useIaStatus(true, 10000);
    const { perfis: perfisServidor } = useIaConfig(); // vídeo e painel de cada perfil
    const eventoId = localStorage.getItem('active_evento_id');

    useEffect(() => {
        carregarIaConfig(true).then(c => setCfg(JSON.parse(JSON.stringify(c))));
    }, []);

    const carregarCameras = useCallback(async () => {
        if (!eventoId) return;
        try {
            const { data } = await api.get('/cameras', { params: { evento_id: eventoId }, hideDefaultError: true });
            setCameras(data.data || []);
        } catch {
            setCameras([]);
        }
    }, [eventoId]);
    useEffect(() => { carregarCameras(); }, [carregarCameras]);

    // Valor efetivo de um ajuste da IA: o que foi mudado aqui, senão o padrão do perfil
    const padraoIa = useMemo(() => ({ ...COMUNS_IA, ...PERFIS_IA[cfg?.perfil || 'equilibrado'] }), [cfg?.perfil]);
    const ia = (k) => (cfg?.ajustes?.[k] ?? padraoIa[k]);
    const setIa = (k, v) => setCfg(c => ({ ...c, ajustes: { ...c.ajustes, [k]: v } }));
    const setVideo = (q, k, v) => setCfg(c => ({ ...c, video: { ...c.video, [q]: { ...c.video[q], [k]: v } } }));
    const setPainel = (k, v) => setCfg(c => ({ ...c, painel: { ...c.painel, [k]: v } }));

    const escolherPerfil = (perfil) => {
        // Trocar de perfil volta vídeo e IA aos valores dele (os ajustes finos eram do perfil anterior)
        const base = perfisServidor?.[perfil];
        setCfg(c => ({
            ...c,
            perfil,
            ajustes: {},
            video: base?.video ? JSON.parse(JSON.stringify(base.video)) : c.video,
            painel: { ...c.painel, max_streams_ao_vivo: base?.painel?.max_streams_ao_vivo ?? c.painel?.max_streams_ao_vivo }
        }));
    };

    const salvar = async () => {
        setSaving(true);
        try {
            const { data } = await api.put('/cameras/ia-config', cfg);
            setCfg(JSON.parse(JSON.stringify(data.data)));
            definirIaConfig(data.data);
            enqueueSnackbar('Configuração da IA salva e enviada ao computador do evento.', { variant: 'success' });
        } catch (e) {
            enqueueSnackbar(e.response?.data?.error || 'Erro ao salvar a configuração da IA', { variant: 'error' });
        } finally {
            setSaving(false);
        }
    };

    const video = cfg?.video || { mini: {}, foco: {} };

    const salvarCamera = async (cam, campos) => {
        setSalvandoCam(cam.id);
        setCameras(lista => lista.map(c => (c.id === cam.id ? { ...c, ...campos } : c)));
        try {
            await api.put(`/cameras/${cam.id}`, campos);
        } catch (e) {
            enqueueSnackbar(e.response?.data?.error || 'Erro ao salvar a câmera', { variant: 'error' });
            carregarCameras();
        } finally {
            setSalvandoCam(null);
        }
    };

    if (!cfg) {
        return <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}><CircularProgress /></Box>;
    }

    const avisos = [];
    if (erroStatus) avisos.push({ sev: 'error', txt: `${erroStatus}. Confira se o "ligar-ia-facial" está rodando no computador do evento.` });
    if (status?.hardware_acceleration === 'CPU') avisos.push({ sev: 'warning', txt: 'A IA está rodando sem placa de vídeo (CPU): o reconhecimento fica bem mais lento. Prefira o perfil Leve ou instale o pacote de GPU.' });
    if (status && !status.registered_faces_indexed) avisos.push({ sev: 'warning', txt: 'Nenhum rosto cadastrado na base da IA. Confira se as pessoas têm foto e se a chave do Supabase está no computador do evento.' });
    if (status?.ia?.ocupacao > 0.9) avisos.push({ sev: 'info', txt: 'A IA está usando quase todo o orçamento de análises. Se notar atraso nos quadrados, reduza as análises por segundo ou use o perfil Leve.' });
    const semVideo = (status?.cameras || []).filter(c => c.camera_id && !c.conectada);
    if (semVideo.length) avisos.push({ sev: 'warning', txt: `Sem vídeo: ${semVideo.map(c => c.nome || c.camera).join(', ')}.` });

    return (
        <Box sx={{ p: { xs: 2, md: 4 } }}>
            <PageHeader
                title="IA facial e câmeras"
                subtitle="Equilíbrio entre precisão do reconhecimento, fluidez do vídeo e peso no computador do evento."
                breadcrumbs={[{ text: 'Sistema' }, { text: 'Configurações' }, { text: 'IA facial e câmeras' }]}
            />

            {avisos.map((a, i) => <Alert key={i} severity={a.sev} sx={{ mt: 2 }}>{a.txt}</Alert>)}

            <Grid container spacing={3} sx={{ mt: 0.5 }}>
                {/* STATUS DO MOTOR */}
                <Grid item xs={12}>
                    <GlassCard sx={{ p: 2.5 }}>
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
                            <GpuIcon color="primary" />
                            <Typography variant="h6" fontWeight={700}>Motor de IA do evento</Typography>
                        </Stack>
                        {status ? (
                            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                <Chip label={status.hardware_acceleration} color={status.hardware_acceleration === 'CPU' ? 'warning' : 'success'} size="small" />
                                <Chip label={`Perfil em uso: ${NOMES_PERFIL[status.config?.perfil] || status.config?.perfil}`} size="small" />
                                <Chip label={`${status.ia?.ms_por_analise ?? 0} ms por análise`} size="small" />
                                <Chip label={`Ocupação ${Math.round((status.ia?.ocupacao || 0) * 100)}%`} size="small" />
                                <Chip label={`${status.registered_faces_indexed} pessoa(s) na base`} size="small" />
                                <Chip label={`${status.vetores_aprendidos || 0} vetor(es) aprendido(s) no CFTV`} size="small" />
                                <Chip label={`${(status.cameras || []).filter(c => c.conectada).length} câmera(s) com vídeo`} size="small" />
                            </Stack>
                        ) : !erroStatus && <CircularProgress size={20} />}
                    </GlassCard>
                </Grid>

                {/* PERFIL */}
                <Grid item xs={12}>
                    <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>Perfil</Typography>
                    <Grid container spacing={2}>
                        {Object.keys(PERFIS_IA).map(p => (
                            <Grid item xs={12} md={4} key={p}>
                                <GlassCard
                                    onClick={() => escolherPerfil(p)}
                                    sx={{
                                        p: 2.5, cursor: 'pointer', height: '100%',
                                        border: cfg.perfil === p ? '2px solid #00D4FF' : '1px solid rgba(255,255,255,0.08)'
                                    }}
                                >
                                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                                        <Typography variant="h6" fontWeight={700}>{NOMES_PERFIL[p]}</Typography>
                                        {cfg.perfil === p && <Chip label="Selecionado" color="primary" size="small" />}
                                    </Stack>
                                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{DESCRICAO_PERFIL[p]}</Typography>
                                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                                        IA: até {PERFIS_IA[p].ia_fps_total} análises/s no total • sensibilidade {PERFIS_IA[p].limiar}
                                    </Typography>
                                </GlassCard>
                            </Grid>
                        ))}
                    </Grid>
                </Grid>

                {/* RECONHECIMENTO */}
                <Grid item xs={12} md={6}>
                    <GlassCard sx={{ p: 3, height: '100%' }}>
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
                            <TuneIcon color="primary" />
                            <Typography variant="h6" fontWeight={700}>Reconhecimento</Typography>
                        </Stack>
                        <Campo
                            titulo={`Exigência para reconhecer: ${Number(ia('limiar')).toFixed(2)}`}
                            ajuda="Mais alto: menos chance de confundir pessoas, mas reconhece menos de longe. Mais baixo: reconhece mais, com mais risco de engano."
                        >
                            <Slider value={Number(ia('limiar'))} min={0.35} max={0.65} step={0.01} onChange={(_, v) => setIa('limiar', v)}
                                marks={[{ value: 0.4, label: 'Tolerante' }, { value: 0.48, label: 'Padrão' }, { value: 0.6, label: 'Rigoroso' }]} />
                        </Campo>
                        <Campo titulo="Confirmações antes de alertar" ajuda="Quantas leituras seguidas do mesmo rosto (de 3) precisam concordar. 2 evita alertas falsos de um quadro só.">
                            <Select size="small" value={ia('confirmacoes')} onChange={e => setIa('confirmacoes', e.target.value)}>
                                <MenuItem value={1}>1 (mais rápido)</MenuItem>
                                <MenuItem value={2}>2 de 3 (recomendado)</MenuItem>
                                <MenuItem value={3}>3 de 3 (mais seguro)</MenuItem>
                            </Select>
                        </Campo>
                        <Campo titulo={`Tamanho mínimo do rosto: ${ia('min_face_px')} px`} ajuda="Rostos menores que isso aparecem como 'distante' e não são comparados (evita erro com pessoas longe da câmera).">
                            <Slider value={Number(ia('min_face_px'))} min={20} max={120} step={2} onChange={(_, v) => setIa('min_face_px', v)} />
                        </Campo>
                        <FormControlLabel
                            control={<Switch checked={!!ia('aprender')} onChange={e => setIa('aprender', e.target.checked)} />}
                            label="Aprender o rosto pelas câmeras (melhora o acerto com a iluminação e o ângulo do local)"
                        />
                    </GlassCard>
                </Grid>

                {/* VÍDEO E ALERTAS */}
                <Grid item xs={12} md={6}>
                    <GlassCard sx={{ p: 3, height: '100%' }}>
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
                            <CameraIcon color="primary" />
                            <Typography variant="h6" fontWeight={700}>Vídeo e alertas</Typography>
                        </Stack>
                        <Campo
                            titulo={`Vídeos ao vivo ao mesmo tempo: ${cfg.painel?.max_streams_ao_vivo ?? 'padrão do perfil'}`}
                            ajuda="Acima disso, as câmeras do mosaico mostram uma imagem a cada 5 s. Cada vídeo usa a internet do evento."
                        >
                            <Slider value={cfg.painel?.max_streams_ao_vivo ?? 9} min={1} max={16} step={1} marks
                                onChange={(_, v) => setPainel('max_streams_ao_vivo', v)} />
                        </Campo>
                        {['mini', 'foco'].map(q => (
                            <Campo key={q} titulo={q === 'mini' ? 'Miniaturas do mosaico' : 'Câmera em tela grande'}
                                ajuda={q === 'mini' ? 'Usa o sub-stream da câmera (resolução baixa).' : 'Usa o stream principal da câmera.'}>
                                <Stack direction="row" spacing={2}>
                                    <TextField size="small" type="number" label="Quadros/s" value={video[q]?.fps ?? ''} inputProps={{ min: 1, max: 30 }}
                                        onChange={e => setVideo(q, 'fps', Number(e.target.value))} sx={{ width: 110 }} />
                                    <TextField size="small" type="number" label="Largura (px)" value={video[q]?.max_width ?? ''} inputProps={{ min: 320, max: 1920, step: 160 }}
                                        onChange={e => setVideo(q, 'max_width', Number(e.target.value))} sx={{ width: 130 }} />
                                    <TextField size="small" type="number" label="Qualidade" value={video[q]?.quality ?? ''} inputProps={{ min: 30, max: 90 }}
                                        onChange={e => setVideo(q, 'quality', Number(e.target.value))} sx={{ width: 110 }} />
                                </Stack>
                            </Campo>
                        ))}
                        <Campo titulo={`Repetir alerta da mesma pessoa na mesma câmera: a cada ${cfg.painel?.alerta_repetir_s ?? 30} s`}>
                            <Slider value={cfg.painel?.alerta_repetir_s ?? 30} min={10} max={600} step={10} onChange={(_, v) => setPainel('alerta_repetir_s', v)} />
                        </Campo>
                        <Campo
                            titulo={`Alvo da watchlist volta a alertar após: ${cfg.painel?.rastreamento_expira_min ?? 120} min`}
                            ajuda="Se ninguém clicar em 'Alvo localizado', o rastreamento expira e a pessoa volta a gerar alerta."
                        >
                            <Slider value={cfg.painel?.rastreamento_expira_min ?? 120} min={10} max={720} step={10} onChange={(_, v) => setPainel('rastreamento_expira_min', v)} />
                        </Campo>
                        <FormControlLabel
                            control={<Switch checked={cfg.painel?.som_alerta !== false} onChange={e => setPainel('som_alerta', e.target.checked)} />}
                            label="Som nos alertas (cada tela ainda pode silenciar)"
                        />
                    </GlassCard>
                </Grid>

                {/* AVANÇADO */}
                <Grid item xs={12}>
                    <GlassCard sx={{ p: 3 }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                            <Stack direction="row" spacing={1} alignItems="center">
                                <SpeedIcon color="primary" />
                                <Typography variant="h6" fontWeight={700}>Desempenho da IA (avançado)</Typography>
                            </Stack>
                            <Stack direction="row" spacing={1}>
                                <Button size="small" startIcon={<RestaurarIcon />} onClick={() => setCfg(c => ({ ...c, ajustes: {} }))}>
                                    Padrões do perfil
                                </Button>
                                <IconButton onClick={() => setAvancado(a => !a)}>{avancado ? <CollapseIcon /> : <ExpandIcon />}</IconButton>
                            </Stack>
                        </Stack>
                        <Collapse in={avancado}>
                            <Grid container spacing={3} sx={{ mt: 0.5 }}>
                                <Grid item xs={12} md={6}>
                                    <Campo titulo={`Análises por segundo, somando todas as câmeras: ${ia('ia_fps_total')}`}
                                        ajuda="Teto de trabalho da IA no computador do evento; é dividido entre as câmeras (a de maior prioridade primeiro).">
                                        <Slider value={Number(ia('ia_fps_total'))} min={5} max={60} step={1} onChange={(_, v) => setIa('ia_fps_total', v)} />
                                    </Campo>
                                    <Campo titulo={`Por câmera em tela grande: ${ia('ia_fps_foco')}/s`}>
                                        <Slider value={Number(ia('ia_fps_foco'))} min={1} max={20} step={1} onChange={(_, v) => setIa('ia_fps_foco', v)} />
                                    </Campo>
                                    <Campo titulo={`Por miniatura: ${ia('ia_fps_mini')}/s`}>
                                        <Slider value={Number(ia('ia_fps_mini'))} min={1} max={10} step={1} onChange={(_, v) => setIa('ia_fps_mini', v)} />
                                    </Campo>
                                    <Campo titulo={`Vigilância (ninguém assistindo, com movimento): ${ia('ia_fps_vigilancia')}/s`}>
                                        <Slider value={Number(ia('ia_fps_vigilancia'))} min={1} max={10} step={1} onChange={(_, v) => setIa('ia_fps_vigilancia', v)} />
                                    </Campo>
                                </Grid>
                                <Grid item xs={12} md={6}>
                                    <Campo titulo="Qual vídeo a IA analisa" ajuda="Automático: sub-stream, e o principal quando alguém abre a câmera em tela grande.">
                                        <Select size="small" value={ia('ia_stream')} onChange={e => setIa('ia_stream', e.target.value)}>
                                            {Object.entries(NOMES_STREAM).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
                                        </Select>
                                    </Campo>
                                    <Campo titulo={`Diferença mínima para a 2ª pessoa mais parecida: ${Number(ia('margem')).toFixed(2)}`}
                                        ajuda="Evita confundir pessoas parecidas (irmãos, por exemplo).">
                                        <Slider value={Number(ia('margem'))} min={0} max={0.15} step={0.01} onChange={(_, v) => setIa('margem', v)} />
                                    </Campo>
                                    <Campo titulo={`Nitidez mínima do rosto: ${ia('min_nitidez')}`} ajuda="Rosto borrado (movimento rápido) não é comparado.">
                                        <Slider value={Number(ia('min_nitidez'))} min={0} max={100} step={5} onChange={(_, v) => setIa('min_nitidez', v)} />
                                    </Campo>
                                    <Campo titulo={`Rosto virado até: ${ia('max_yaw')}°`}>
                                        <Slider value={Number(ia('max_yaw'))} min={20} max={70} step={5} onChange={(_, v) => setIa('max_yaw', v)} />
                                    </Campo>
                                    <FormControlLabel
                                        control={<Switch checked={!!ia('movimento')} onChange={e => setIa('movimento', e.target.checked)} />}
                                        label="Economia por movimento: câmera parada sem ninguém assistindo não usa IA"
                                    />
                                </Grid>
                            </Grid>
                        </Collapse>
                    </GlassCard>
                </Grid>

                <Grid item xs={12}>
                    <Stack direction="row" justifyContent="flex-end" spacing={2} alignItems="center">
                        {cfg.atualizado_em && (
                            <Typography variant="caption" color="text.secondary">
                                Última alteração: {new Date(cfg.atualizado_em).toLocaleString()} {cfg.atualizado_por ? `por ${cfg.atualizado_por}` : ''}
                            </Typography>
                        )}
                        <NeonButton onClick={salvar} disabled={saving} startIcon={<SaveIcon />}>
                            {saving ? 'Salvando...' : 'Salvar e aplicar'}
                        </NeonButton>
                    </Stack>
                </Grid>

                {/* POR CÂMERA */}
                <Grid item xs={12}>
                    <GlassCard sx={{ p: 3 }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                            <Typography variant="h6" fontWeight={700}>Câmeras do evento</Typography>
                            <Tooltip title="Atualizar"><IconButton onClick={carregarCameras}><RefreshIcon /></IconButton></Tooltip>
                        </Stack>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                            Alterações aqui valem na hora. Sub-stream vazio: deduzido da câmera (Intelbras/Dahua e Hikvision).
                        </Typography>
                        {!eventoId ? (
                            <Alert severity="info">Selecione um evento para ver as câmeras.</Alert>
                        ) : (
                            <TableContainer>
                                <Table size="small">
                                    <TableHead>
                                        <TableRow>
                                            <TableCell>Câmera</TableCell>
                                            <TableCell>Agora</TableCell>
                                            <TableCell align="center">IA</TableCell>
                                            <TableCell align="center">Vigilância 24 h</TableCell>
                                            <TableCell>Prioridade</TableCell>
                                            <TableCell>Sub-stream (opcional)</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {cameras.map(cam => {
                                            const st = statusDaCamera(status, cam.id);
                                            return (
                                                <TableRow key={cam.id}>
                                                    <TableCell>
                                                        <Typography variant="body2" fontWeight={700}>{cam.nome}</Typography>
                                                        <Typography variant="caption" color="text.secondary">{cam.area?.nome_area || cam.ip_address}</Typography>
                                                    </TableCell>
                                                    <TableCell>
                                                        {st ? (
                                                            <Typography variant="caption">
                                                                {st.conectada ? `${Math.round(st.video_fps)} fps` : 'sem vídeo'}
                                                                {st.ia_analisando ? ` • IA ${st.ia_fps_alvo}/s` : ' • IA em espera'}
                                                                {st.rostos ? ` • ${st.rostos} rosto(s)` : ''}
                                                                {st.sub_stream ? ' • sub-stream' : ''}
                                                            </Typography>
                                                        ) : <Typography variant="caption" color="text.secondary">—</Typography>}
                                                    </TableCell>
                                                    <TableCell align="center">
                                                        <Switch size="small" checked={cam.ia_ativa !== false} disabled={salvandoCam === cam.id}
                                                            onChange={e => salvarCamera(cam, { ia_ativa: e.target.checked })} />
                                                    </TableCell>
                                                    <TableCell align="center">
                                                        <Switch size="small" checked={cam.vigilancia_ativa !== false && cam.ia_ativa !== false}
                                                            disabled={salvandoCam === cam.id || cam.ia_ativa === false}
                                                            onChange={e => salvarCamera(cam, { vigilancia_ativa: e.target.checked })} />
                                                    </TableCell>
                                                    <TableCell>
                                                        <Select size="small" value={cam.prioridade ?? 1} disabled={salvandoCam === cam.id}
                                                            onChange={e => salvarCamera(cam, { prioridade: e.target.value })}>
                                                            <MenuItem value={0}>Baixa</MenuItem>
                                                            <MenuItem value={1}>Normal</MenuItem>
                                                            <MenuItem value={2}>Alta</MenuItem>
                                                            <MenuItem value={3}>Crítica</MenuItem>
                                                        </Select>
                                                    </TableCell>
                                                    <TableCell sx={{ minWidth: 260 }}>
                                                        <TextField
                                                            size="small" fullWidth placeholder="rtsp://... (deduzido)"
                                                            defaultValue={cam.url_substream || ''}
                                                            onBlur={e => {
                                                                const v = e.target.value.trim();
                                                                if (v !== (cam.url_substream || '')) salvarCamera(cam, { url_substream: v });
                                                            }}
                                                        />
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                        {cameras.length === 0 && (
                                            <TableRow><TableCell colSpan={6}><Typography variant="body2" color="text.secondary">Nenhuma câmera cadastrada neste evento.</Typography></TableCell></TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        )}
                    </GlassCard>
                </Grid>
            </Grid>
        </Box>
    );
};

export default ConfigIAFacial;
