import React, { useMemo, useState } from 'react';
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
    Flag as MarcoIcon,
    AccountTree as DepIcon,
    NotificationsActive as AlertaIcon,
    Timer as LeadTimeIcon,
    FactCheck as AderenciaIcon,
    Replay as RetrabalhoIcon
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import GlassCard from '../common/GlassCard';
import KpiCard from '../common/KpiCard';
import NeonButton from '../common/NeonButton';
import TituloModal from '../common/TituloModal';
import api from '../../services/api';
import { botaoSecundario, cores, funcao, tamanhos, tom } from '../../styles/tokens';
import {
    FASES_OPERACIONAIS,
    formatarDataHoraCurta,
    obterCorArea,
    obterInfoFase,
    obterNomeArea,
    obterNomeProdutor,
    ROTULO_SAUDE_PRAZO,
    ROTULO_STATUS_TAREFA
} from './producaoHelpers';

const AbaCronogramaPrazos = ({ resumo, headersExtra = {}, aoAtualizar, apiClient }) => {
    const httpClient = apiClient || api;
    const { enqueueSnackbar } = useSnackbar();
    const areas = resumo?.areas || [];
    const kpis = resumo?.kpis || {};
    const produtores = useMemo(() => resumo?.produtores || [], [resumo?.produtores]);
    const tarefas = useMemo(() => resumo?.tarefas || [], [resumo?.tarefas]);
    const dependencias = resumo?.dependencias_tarefas || [];
    const marcos = resumo?.marcos || [];

    const [visao, setVisao] = useState('gantt'); // 'gantt' | 'marcos' | 'dependencias'
    const [filtroFase, setFiltroFase] = useState('todas');
    const [modalMarcoAberto, setModalMarcoAberto] = useState(false);
    const [modalDepAberto, setModalDepAberto] = useState(false);
    const [salvando, setSalvando] = useState(false);

    const [formMarco, setFormMarco] = useState({
        titulo: '',
        area_id: '',
        data_prevista: new Date(Date.now() + 12 * 3600000).toISOString().slice(0, 16)
    });
    const [formDep, setFormDep] = useState({ tarefa_origem_id: '', tarefa_dependente_id: '' });

    const { janelaInicioMs, janelaDuracaoMs } = useMemo(() => {
        const datas = tarefas
            .flatMap((t) => [t.data_inicio_planejada, t.data_fim_planejada])
            .filter(Boolean)
            .map((d) => new Date(d).getTime())
            .filter((n) => !Number.isNaN(n));
        if (!datas.length) {
            const agora = Date.now();
            return { janelaInicioMs: agora - 12 * 3600000, janelaDuracaoMs: 48 * 3600000 };
        }
        const min = Math.min(...datas);
        const max = Math.max(...datas);
        return {
            janelaInicioMs: min,
            janelaDuracaoMs: Math.max(3600000, max - min)
        };
    }, [tarefas]);

    const calcularPosicaoBarra = (t) => {
        const ini = t.data_inicio_planejada ? new Date(t.data_inicio_planejada).getTime() : janelaInicioMs;
        const fim = t.data_fim_planejada ? new Date(t.data_fim_planejada).getTime() : ini + 4 * 3600000;
        const leftPct = Math.max(0, Math.min(92, ((ini - janelaInicioMs) / janelaDuracaoMs) * 100));
        const widthPct = Math.max(8, Math.min(100 - leftPct, ((fim - ini) / janelaDuracaoMs) * 100));
        return { leftPct, widthPct };
    };

    const produtividadePorProdutor = useMemo(() => {
        return produtores.map((p) => {
            const suas = tarefas.filter((t) => t.produtor_atribuido_id === p.id);
            const concluidas = suas.filter((t) => t.status === 'concluida').length;
            const media = suas.length
                ? Math.round(suas.reduce((acc, t) => acc + Number(t.percentual_concluido || 0), 0) / suas.length)
                : 0;
            return { ...p, total: suas.length, concluidas, media };
        }).filter((p) => p.total > 0);
    }, [produtores, tarefas]);

    const handleCriarMarco = async () => {
        if (!formMarco.titulo.trim()) {
            enqueueSnackbar('Informe o título do marco.', { variant: 'warning' });
            return;
        }
        try {
            setSalvando(true);
            await httpClient.post('/producao/marcos', {
                titulo: formMarco.titulo,
                area_id: formMarco.area_id || null,
                data_prevista: new Date(formMarco.data_prevista).toISOString()
            }, { headers: headersExtra });
            enqueueSnackbar('Marco adicionado ao cronograma.', { variant: 'success' });
            setModalMarcoAberto(false);
            setFormMarco({ titulo: '', area_id: '', data_prevista: new Date(Date.now() + 12 * 3600000).toISOString().slice(0, 16) });
            if (aoAtualizar) await aoAtualizar();
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Erro ao criar marco.', { variant: 'error' });
        } finally {
            setSalvando(false);
        }
    };

    const handleAlternarMarco = async (marcoId) => {
        try {
            await httpClient.post(`/producao/marcos/${marcoId}/toggle`, {}, { headers: headersExtra });
            enqueueSnackbar('Marco atualizado.', { variant: 'success' });
            if (aoAtualizar) await aoAtualizar();
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Erro ao atualizar marco.', { variant: 'error' });
        }
    };

    const handleCriarDependencia = async () => {
        if (!formDep.tarefa_origem_id || !formDep.tarefa_dependente_id) {
            enqueueSnackbar('Selecione as duas tarefas.', { variant: 'warning' });
            return;
        }
        try {
            setSalvando(true);
            await httpClient.post('/producao/tarefas/dependencias', formDep, { headers: headersExtra });
            enqueueSnackbar('Dependência vinculada ao caminho crítico.', { variant: 'success' });
            setModalDepAberto(false);
            setFormDep({ tarefa_origem_id: '', tarefa_dependente_id: '' });
            if (aoAtualizar) await aoAtualizar();
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Erro ao vincular dependência.', { variant: 'error' });
        } finally {
            setSalvando(false);
        }
    };

    const handleDispararAlertas = async () => {
        try {
            setSalvando(true);
            const res = await httpClient.post('/producao/cronograma/disparar-alertas', {}, { headers: headersExtra });
            const info = res.data?.data;
            enqueueSnackbar(
                info?.alertas_identificados > 0
                    ? `${info.alertas_identificados} alerta(s) de prazo enviado(s) para o painel de notificações.`
                    : 'Nenhum atraso ou risco pendente para alertar.',
                { variant: info?.alertas_identificados > 0 ? 'warning' : 'success' }
            );
            if (aoAtualizar) await aoAtualizar();
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Falha ao disparar alertas.', { variant: 'error' });
        } finally {
            setSalvando(false);
        }
    };

    const criticasCount = tarefas.filter((t) => t.eh_caminho_critico).length;

    return (
        <Stack spacing={3}>
            {/* Métricas de cronograma */}
            <Grid container spacing={2}>
                <Grid item xs={12} sm={6} md={3}>
                    <KpiCard
                        titulo="Aderência ao cronograma"
                        valor={`${kpis.aderencia_cronograma_pct ?? 100}%`}
                        cor={funcao.liberado}
                        progresso={kpis.aderencia_cronograma_pct ?? 100}
                        rodape="Tarefas dentro do prazo planejado"
                        icone={<AderenciaIcon fontSize="small" />}
                    />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                    <KpiCard
                        titulo="Lead time médio"
                        valor={`${kpis.lead_time_medio_horas || 0}h`}
                        cor={funcao.acao}
                        rodape="Tempo médio entre início e conclusão"
                        icone={<LeadTimeIcon fontSize="small" />}
                    />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                    <KpiCard
                        titulo="Caminho crítico"
                        valor={criticasCount}
                        cor={funcao.fiscalizacao}
                        rodape={`${dependencias.length} dependência(s) fim para início`}
                        icone={<DepIcon fontSize="small" />}
                    />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                    <KpiCard
                        titulo="Retrabalho (reaberturas)"
                        valor={kpis.total_reaberturas || 0}
                        cor={(kpis.total_reaberturas || 0) > 0 ? funcao.alerta : funcao.liberado}
                        rodape="Tarefas devolvidas para ajuste"
                        icone={<RetrabalhoIcon fontSize="small" />}
                    />
                </Grid>
            </Grid>

            {/* Barra de visão e ações */}
            <GlassCard sx={{ p: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1.5 }}>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                        <Button variant={visao === 'gantt' ? 'contained' : 'outlined'} size="small" onClick={() => setVisao('gantt')} sx={visao === 'gantt' ? undefined : botaoSecundario}>
                            Visão Gantt
                        </Button>
                        <Button variant={visao === 'marcos' ? 'contained' : 'outlined'} size="small" onClick={() => setVisao('marcos')} sx={visao === 'marcos' ? undefined : botaoSecundario}>
                            Marcos ({marcos.length})
                        </Button>
                        <Button variant={visao === 'dependencias' ? 'contained' : 'outlined'} size="small" onClick={() => setVisao('dependencias')} sx={visao === 'dependencias' ? undefined : botaoSecundario}>
                            Dependências ({dependencias.length})
                        </Button>
                    </Stack>

                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                        <Button variant="outlined" size="small" startIcon={<DepIcon />} onClick={() => setModalDepAberto(true)} sx={botaoSecundario}>
                            Vincular dependência
                        </Button>
                        <Button variant="outlined" size="small" startIcon={<MarcoIcon />} onClick={() => setModalMarcoAberto(true)} sx={botaoSecundario}>
                            Novo marco
                        </Button>
                        <NeonButton size="small" neonColor={funcao.alerta} startIcon={<AlertaIcon />} loading={salvando} onClick={handleDispararAlertas}>
                            Disparar alertas de prazo
                        </NeonButton>
                    </Stack>
                </Box>
            </GlassCard>

            {/* Visão Gantt */}
            {visao === 'gantt' && (
                <GlassCard sx={{ p: 2.5 }}>
                    <Typography variant="h6" sx={{ color: cores.textoForte, mb: 0.5 }}>
                        Cronograma por fase e caminho crítico (visão Gantt)
                    </Typography>
                    <Typography variant="body2" sx={{ color: cores.textoSecundario, mb: 1.5 }}>
                        Comparativo entre Montagem, Evento e Desmontagem, datas planejadas e dependências.
                    </Typography>

                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
                        <Chip
                            size="small"
                            clickable
                            label={`Todas as fases (${tarefas.length})`}
                            onClick={() => setFiltroFase('todas')}
                            sx={{
                                fontWeight: filtroFase === 'todas' ? 700 : 500,
                                bgcolor: filtroFase === 'todas' ? tom(cores.primaria, 0.2) : cores.fundo,
                                color: filtroFase === 'todas' ? cores.primaria : cores.textoSecundario,
                                border: `1px solid ${filtroFase === 'todas' ? cores.primaria : cores.borda}`
                            }}
                        />
                        {FASES_OPERACIONAIS.map((f) => {
                            const qtd = kpis?.contagem_por_fase?.[f.valor] ?? tarefas.filter((t) => (t.fase_operacional || 'montagem') === f.valor).length;
                            const pct = kpis?.progresso_por_fase?.[f.valor] ?? 0;
                            const ativo = filtroFase === f.valor;
                            return (
                                <Chip
                                    key={f.valor}
                                    size="small"
                                    clickable
                                    label={`${f.rotulo}: ${pct}% (${qtd})`}
                                    onClick={() => setFiltroFase(f.valor)}
                                    sx={{
                                        fontWeight: ativo ? 700 : 600,
                                        bgcolor: ativo ? tom(f.cor, 0.22) : cores.fundo,
                                        color: ativo ? f.cor : cores.textoSuave,
                                        border: `1px solid ${ativo ? f.cor : cores.borda}`
                                    }}
                                />
                            );
                        })}
                    </Stack>

                    <Stack spacing={1.75}>
                        {tarefas
                            .filter((t) => filtroFase === 'todas' || (t.fase_operacional || 'montagem') === filtroFase)
                            .map((t) => {
                            const { leftPct, widthPct } = calcularPosicaoBarra(t);
                            const corArea = obterCorArea(areas, t.area_id);
                            const faseInfo = obterInfoFase(t.fase_operacional);
                            const saude = ROTULO_SAUDE_PRAZO[t.saude_prazo] || ROTULO_SAUDE_PRAZO.no_prazo;
                            const statusInfo = ROTULO_STATUS_TAREFA[t.status] || ROTULO_STATUS_TAREFA.disponivel;
                            const preds = dependencias
                                .filter((d) => d.tarefa_dependente_id === t.id)
                                .map((d) => tarefas.find((x) => x.id === d.tarefa_origem_id)?.titulo)
                                .filter(Boolean);

                            return (
                                <Box
                                    key={t.id}
                                    sx={{
                                        p: 1.75,
                                        borderRadius: 2,
                                        bgcolor: cores.superficieElevada,
                                        border: `1px solid ${t.eh_caminho_critico ? tom(funcao.fiscalizacao, 0.5) : cores.borda}`
                                    }}
                                >
                                    <Grid container spacing={2} alignItems="center">
                                        <Grid item xs={12} md={5}>
                                            <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mb: 0.75 }}>
                                                <Chip size="small" label={faseInfo.rotulo} sx={{ bgcolor: tom(faseInfo.cor, 0.16), color: faseInfo.cor, fontWeight: 700 }} />
                                                <Chip size="small" label={obterNomeArea(areas, t.area_id)} sx={{ bgcolor: tom(corArea, 0.14), color: corArea, fontWeight: 600 }} />
                                                <Chip size="small" label={statusInfo.texto} sx={{ bgcolor: tom(statusInfo.cor, 0.14), color: statusInfo.cor, fontWeight: 600 }} />
                                                <Chip size="small" label={saude.texto} sx={{ bgcolor: tom(saude.cor, 0.14), color: saude.cor, fontWeight: 600 }} />
                                                {t.elemento_planta_rotulo && (
                                                    <Chip size="small" label={t.elemento_planta_rotulo} sx={{ bgcolor: tom(cores.primaria, 0.1), color: cores.textoSuave }} />
                                                )}
                                                {t.eh_caminho_critico && (
                                                    <Chip size="small" label="Caminho crítico" sx={{ bgcolor: tom(funcao.fiscalizacao, 0.16), color: funcao.fiscalizacao, fontWeight: 600 }} />
                                                )}
                                            </Stack>
                                            <Typography sx={{ fontWeight: 700, color: cores.textoForte, fontSize: tamanhos.md }}>
                                                {t.titulo}
                                            </Typography>
                                            <Typography sx={{ fontSize: tamanhos.xs, color: cores.textoSecundario }}>
                                                {obterNomeProdutor(produtores, t.produtor_atribuido_id)} • Planejado: {formatarDataHoraCurta(t.data_inicio_planejada)} até {formatarDataHoraCurta(t.data_fim_planejada)}
                                            </Typography>
                                            {preds.length > 0 && (
                                                <Typography sx={{ fontSize: tamanhos.xs, color: funcao.alerta, mt: 0.25 }}>
                                                    Depende de: {preds.join(', ')}
                                                </Typography>
                                            )}
                                        </Grid>

                                        <Grid item xs={12} md={7}>
                                            <Box sx={{ position: 'relative', height: 28, bgcolor: cores.fundo, borderRadius: 1.5, border: `1px solid ${cores.borda}`, overflow: 'hidden', mb: 0.75 }}>
                                                <Box
                                                    sx={{
                                                        position: 'absolute',
                                                        left: `${leftPct}%`,
                                                        width: `${widthPct}%`,
                                                        top: 3,
                                                        bottom: 3,
                                                        borderRadius: 1,
                                                        bgcolor: tom(corArea, 0.28),
                                                        border: `1px solid ${corArea}`,
                                                        overflow: 'hidden'
                                                    }}
                                                >
                                                    <Box sx={{ width: `${t.percentual_concluido || 0}%`, height: '100%', bgcolor: corArea, opacity: 0.8 }} />
                                                </Box>
                                            </Box>
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
                                                <Typography sx={{ fontSize: tamanhos.xs, color: cores.textoSuave }}>
                                                    Etapas concluídas: <strong>{t.percentual_concluido || 0}%</strong> • Prazo consumido: <strong>{t.percentual_prazo_consumido || 0}%</strong>
                                                </Typography>
                                                {t.impacto_atraso_horas > 0 && (
                                                    <Typography sx={{ fontSize: tamanhos.xs, color: funcao.negado, fontWeight: 600 }}>
                                                        Atraso ou impacto previsto: +{t.impacto_atraso_horas}h
                                                    </Typography>
                                                )}
                                            </Box>
                                        </Grid>
                                    </Grid>
                                </Box>
                            );
                        })}
                        {tarefas.length === 0 && (
                            <Typography variant="body2" sx={{ color: cores.textoSecundario }}>
                                Nenhuma tarefa no cronograma.
                            </Typography>
                        )}
                    </Stack>
                </GlassCard>
            )}

            {/* Visão Marcos */}
            {visao === 'marcos' && (
                <GlassCard sx={{ p: 2.5 }}>
                    <Typography variant="h6" sx={{ color: cores.textoForte, mb: 1.5 }}>
                        Marcos oficiais do evento
                    </Typography>
                    <Stack spacing={1.25}>
                        {marcos.map((m) => (
                            <Box
                                key={m.id}
                                sx={{
                                    p: 1.5,
                                    borderRadius: 2,
                                    border: `1px solid ${cores.borda}`,
                                    bgcolor: cores.superficieElevada,
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    gap: 1.5
                                }}
                            >
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Checkbox checked={Boolean(m.concluido)} onChange={() => handleAlternarMarco(m.id)} />
                                    <Box>
                                        <Typography sx={{ fontWeight: 700, color: cores.textoForte, textDecoration: m.concluido ? 'line-through' : 'none' }}>
                                            {m.titulo}
                                        </Typography>
                                        <Typography sx={{ fontSize: tamanhos.xs, color: cores.textoSecundario }}>
                                            {m.area_id ? obterNomeArea(areas, m.area_id) : 'Evento geral'} • Data prevista: {formatarDataHoraCurta(m.data_prevista)}
                                        </Typography>
                                    </Box>
                                </Box>
                                <Chip
                                    size="small"
                                    label={m.concluido ? 'Atingido' : 'Pendente'}
                                    sx={{
                                        bgcolor: tom(m.concluido ? funcao.liberado : funcao.alerta, 0.14),
                                        color: m.concluido ? funcao.liberado : funcao.alerta,
                                        fontWeight: 600
                                    }}
                                />
                            </Box>
                        ))}
                        {marcos.length === 0 && (
                            <Typography variant="body2" sx={{ color: cores.textoSecundario }}>
                                Nenhum marco cadastrado ainda.
                            </Typography>
                        )}
                    </Stack>
                </GlassCard>
            )}

            {/* Visão Dependências */}
            {visao === 'dependencias' && (
                <GlassCard sx={{ p: 2.5 }}>
                    <Typography variant="h6" sx={{ color: cores.textoForte, mb: 1.5 }}>
                        Cadeia de dependências (fim para início)
                    </Typography>
                    <Stack spacing={1.25}>
                        {dependencias.map((d) => {
                            const orig = tarefas.find((t) => t.id === d.tarefa_origem_id);
                            const dest = tarefas.find((t) => t.id === d.tarefa_dependente_id);
                            return (
                                <Box key={d.id} sx={{ p: 1.5, borderRadius: 2, bgcolor: cores.superficieElevada, border: `1px solid ${cores.borda}` }}>
                                    <Typography sx={{ fontSize: tamanhos.sm, color: cores.textoForte }}>
                                        <strong>{orig?.titulo || 'Tarefa origem'}</strong> → libera → <strong>{dest?.titulo || 'Tarefa dependente'}</strong>
                                    </Typography>
                                    <Typography sx={{ fontSize: tamanhos.xs, color: cores.textoSecundario }}>
                                        Tipo: Fim para início • Origem: {orig?.percentual_concluido || 0}% concluída
                                    </Typography>
                                </Box>
                            );
                        })}
                        {dependencias.length === 0 && (
                            <Typography variant="body2" sx={{ color: cores.textoSecundario }}>
                                Nenhuma dependência cadastrada entre tarefas.
                            </Typography>
                        )}
                    </Stack>
                </GlassCard>
            )}

            {/* Produtividade por produtor */}
            <GlassCard sx={{ p: 2.5 }}>
                <Typography variant="h6" sx={{ color: cores.textoForte, mb: 1.5 }}>
                    Aderência e produtividade por produtor
                </Typography>
                <Grid container spacing={2}>
                    {produtividadePorProdutor.map((p) => (
                        <Grid item xs={12} sm={6} md={4} key={p.id}>
                            <Box sx={{ p: 1.75, borderRadius: 2, border: `1px solid ${cores.borda}`, bgcolor: cores.superficieElevada }}>
                                <Typography sx={{ fontWeight: 700, color: cores.textoForte }}>{p.nome}</Typography>
                                <Typography sx={{ fontSize: tamanhos.xs, color: cores.textoSecundario, mb: 1 }}>
                                    {p.concluidas} de {p.total} tarefa(s) concluída(s)
                                </Typography>
                                <LinearProgress variant="determinate" value={p.media} sx={{ height: 7, borderRadius: 4, mb: 0.5 }} />
                                <Typography sx={{ fontSize: tamanhos.xs, color: cores.textoSuave, textAlign: 'right' }}>
                                    {p.media}% de entrega
                                </Typography>
                            </Box>
                        </Grid>
                    ))}
                </Grid>
            </GlassCard>

            {/* Modal novo marco */}
            <Dialog open={modalMarcoAberto} onClose={() => setModalMarcoAberto(false)} maxWidth="xs" fullWidth>
                <TituloModal titulo="Novo marco do cronograma" subtitulo="Ponto de entrega obrigatório do evento." onFechar={() => setModalMarcoAberto(false)} />
                <DialogContent dividers>
                    <Stack spacing={2} sx={{ pt: 0.5 }}>
                        <TextField fullWidth label="Título do marco" value={formMarco.titulo} onChange={(e) => setFormMarco({ ...formMarco, titulo: e.target.value })} />
                        <FormControl fullWidth size="small">
                            <InputLabel>Área</InputLabel>
                            <Select label="Área" value={formMarco.area_id} onChange={(e) => setFormMarco({ ...formMarco, area_id: e.target.value })}>
                                <MenuItem value="">Evento geral</MenuItem>
                                {areas.map((a) => <MenuItem key={a.id} value={a.id}>{a.nome}</MenuItem>)}
                            </Select>
                        </FormControl>
                        <TextField
                            fullWidth
                            size="small"
                            type="datetime-local"
                            label="Data prevista"
                            InputLabelProps={{ shrink: true }}
                            value={formMarco.data_prevista}
                            onChange={(e) => setFormMarco({ ...formMarco, data_prevista: e.target.value })}
                        />
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ px: 3, py: 2 }}>
                    <Button variant="outlined" onClick={() => setModalMarcoAberto(false)} sx={botaoSecundario}>
                        Cancelar
                    </Button>
                    <NeonButton loading={salvando} onClick={handleCriarMarco}>
                        Salvar marco
                    </NeonButton>
                </DialogActions>
            </Dialog>

            {/* Modal vincular dependência */}
            <Dialog open={modalDepAberto} onClose={() => setModalDepAberto(false)} maxWidth="sm" fullWidth>
                <TituloModal titulo="Vincular dependência entre tarefas" subtitulo="A tarefa dependente só inicia após conclusão da tarefa origem." onFechar={() => setModalDepAberto(false)} />
                <DialogContent dividers>
                    <Stack spacing={2} sx={{ pt: 0.5 }}>
                        <FormControl fullWidth size="small">
                            <InputLabel>Tarefa origem (predecessora)</InputLabel>
                            <Select label="Tarefa origem (predecessora)" value={formDep.tarefa_origem_id} onChange={(e) => setFormDep({ ...formDep, tarefa_origem_id: e.target.value })}>
                                {tarefas.map((t) => <MenuItem key={t.id} value={t.id}>{t.titulo}</MenuItem>)}
                            </Select>
                        </FormControl>
                        <FormControl fullWidth size="small">
                            <InputLabel>Tarefa dependente (sucessora)</InputLabel>
                            <Select label="Tarefa dependente (sucessora)" value={formDep.tarefa_dependente_id} onChange={(e) => setFormDep({ ...formDep, tarefa_dependente_id: e.target.value })}>
                                {tarefas.map((t) => <MenuItem key={t.id} value={t.id}>{t.titulo}</MenuItem>)}
                            </Select>
                        </FormControl>
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ px: 3, py: 2 }}>
                    <Button variant="outlined" onClick={() => setModalDepAberto(false)} sx={botaoSecundario}>
                        Cancelar
                    </Button>
                    <NeonButton loading={salvando} onClick={handleCriarDependencia}>
                        Vincular tarefas
                    </NeonButton>
                </DialogActions>
            </Dialog>
        </Stack>
    );
};

export default AbaCronogramaPrazos;
