import React, { useMemo } from 'react';
import {
    Box,
    Button,
    Chip,
    Grid,
    LinearProgress,
    Stack,
    Typography
} from '@mui/material';
import {
    BarChart as GraficoIcon,
    PhotoCamera as FotoIcon,
    TrendingUp as EvolucaoIcon,
    Videocam as VideoIcon,
    WarningAmber as AlertaIcon
} from '@mui/icons-material';
import GlassCard from '../common/GlassCard';
import { botaoSecundario, cores, funcao, tamanhos, tom } from '../../styles/tokens';
import { formatarDataHoraCurta } from './producaoHelpers';

/**
 * Dashboard operacional de contagem de materiais por IA (estilo SensorTech / Imagem 1):
 * - Total contado hoje (anel de progresso vs. previsto)
 * - Contagem por hora (últimas 12 horas com atividade)
 * - Previsto × Contado por material (com destaque de divergências)
 * - Galeria recente de evidências anotadas + atalhos para Foto / Vídeo / Câmera
 */
const DashboardContagemMateriais = ({
    materiais = [],
    sessoes = [],
    naoReconhecidos = [],
    aoAbrirModo,
    aoAmpliarEvidencia
}) => {
    const metricas = useMemo(() => {
        const hojeIso = new Date().toISOString().slice(0, 10);
        let totalPrevisto = 0;
        let totalRecebido = 0;
        let materiaisComDivergencia = 0;

        materiais.forEach((m) => {
            const prev = Number(m.quantidade_planejada || 0);
            const rec = Number(m.quantidade_recebida || 0);
            totalPrevisto += prev;
            totalRecebido += rec;
            if (prev > 0 && rec !== prev) materiaisComDivergencia += 1;
        });

        let contadoHoje = 0;
        let sessoesFoto = 0;
        let sessoesVideo = 0;
        let sessoesLive = 0;
        const porHora = new Array(24).fill(0);
        const evidenciasRecentes = [];

        sessoes.forEach((s) => {
            const dt = s.iniciado_em ? new Date(s.iniciado_em) : null;
            const ehHoje = dt && !Number.isNaN(dt.getTime()) && dt.toISOString().slice(0, 10) === hojeIso;
            const hora = dt && !Number.isNaN(dt.getTime()) ? dt.getHours() : 0;

            if (s.origem_midia === 'foto_pilha_ia' || s.modo_contagem === 'sahi_estatico') sessoesFoto += 1;
            else if (s.origem_midia === 'celular_live' || s.origem_midia === 'camera_rtsp') sessoesLive += 1;
            else sessoesVideo += 1;

            (s.itens_contados || []).forEach((it) => {
                const qtd = Number(it.quantidade_corrigida_humano ?? it.quantidade_ia ?? 0);
                if (ehHoje) {
                    contadoHoje += qtd;
                    porHora[hora] += qtd;
                }
                if (it.quadro_chave_evidencia_url && evidenciasRecentes.length < 8) {
                    evidenciasRecentes.push({
                        id: `${s.id}-${it.id}`,
                        url: it.quadro_chave_evidencia_url,
                        titulo: it.classe_identificada || 'Evidência IA',
                        qtd,
                        data: s.iniciado_em,
                        modelo: s.modelo_ia_versao || 'IA'
                    });
                }
            });
        });

        // Se não houve contagem hoje, agrega todas as sessões no gráfico por hora para não ficar vazio
        const somaHojeHoras = porHora.reduce((a, b) => a + b, 0);
        if (somaHojeHoras === 0) {
            sessoes.forEach((s) => {
                const dt = s.iniciado_em ? new Date(s.iniciado_em) : null;
                const hora = dt && !Number.isNaN(dt.getTime()) ? dt.getHours() : 12;
                (s.itens_contados || []).forEach((it) => {
                    porHora[hora] += Number(it.quantidade_corrigida_humano ?? it.quantidade_ia ?? 0);
                });
            });
        }

        const picoHora = Math.max(1, ...porHora);
        const percentualGeral = totalPrevisto > 0
            ? Math.min(100, Math.round((totalRecebido / totalPrevisto) * 100))
            : (totalRecebido > 0 ? 100 : 0);

        return {
            totalPrevisto,
            totalRecebido,
            contadoHoje,
            percentualGeral,
            materiaisComDivergencia,
            sessoesFoto,
            sessoesVideo,
            sessoesLive,
            porHora,
            picoHora,
            evidenciasRecentes
        };
    }, [materiais, sessoes]);

    const raio = 42;
    const circunferencia = 2 * Math.PI * raio;
    const dashOffset = circunferencia * (1 - metricas.percentualGeral / 100);

    return (
        <Stack spacing={2.5}>
            {/* Linha 1: KPIs + Anel de progresso estilo SensorTech */}
            <Grid container spacing={2}>
                <Grid item xs={12} md={4}>
                    <GlassCard sx={{ p: 2.25, height: '100%' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
                            <Box>
                                <Typography sx={{ fontSize: tamanhos.xs, color: cores.textoSecundario, fontWeight: 600 }}>
                                    CONTAGEM DE MATERIAIS
                                </Typography>
                                <Typography variant="h4" sx={{ color: cores.textoForte, fontWeight: 800, mt: 0.5 }}>
                                    {metricas.totalRecebido}
                                    <Typography component="span" sx={{ fontSize: tamanhos.sm, color: cores.textoSecundario, ml: 0.75 }}>
                                        / {metricas.totalPrevisto} prev.
                                    </Typography>
                                </Typography>
                                <Typography sx={{ fontSize: tamanhos.xs, color: funcao.liberado, fontWeight: 600, mt: 0.5 }}>
                                    +{metricas.contadoHoje} unidade(s) contada(s) hoje
                                </Typography>
                            </Box>

                            <Box sx={{ position: 'relative', width: 96, height: 96, flexShrink: 0 }}>
                                <svg width="96" height="96" viewBox="0 0 96 96">
                                    <circle
                                        cx="48"
                                        cy="48"
                                        r={raio}
                                        fill="none"
                                        stroke="rgba(148,163,184,0.16)"
                                        strokeWidth="8"
                                    />
                                    <circle
                                        cx="48"
                                        cy="48"
                                        r={raio}
                                        fill="none"
                                        stroke={funcao.liberado}
                                        strokeWidth="8"
                                        strokeLinecap="round"
                                        strokeDasharray={circunferencia}
                                        strokeDashoffset={dashOffset}
                                        transform="rotate(-90 48 48)"
                                    />
                                </svg>
                                <Box
                                    sx={{
                                        position: 'absolute',
                                        inset: 0,
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }}
                                >
                                    <Typography sx={{ fontSize: tamanhos.md, fontWeight: 800, color: cores.textoForte, lineHeight: 1 }}>
                                        {metricas.percentualGeral}%
                                    </Typography>
                                    <Typography sx={{ fontSize: '0.65rem', color: cores.textoSecundario }}>
                                        entregue
                                    </Typography>
                                </Box>
                            </Box>
                        </Box>
                    </GlassCard>
                </Grid>

                <Grid item xs={12} sm={6} md={4}>
                    <GlassCard sx={{ p: 2.25, height: '100%' }}>
                        <Typography sx={{ fontSize: tamanhos.xs, color: cores.textoSecundario, fontWeight: 600, mb: 1 }}>
                            FONTES DE CONTAGEM IA ({sessoes.length} SESSÕES)
                        </Typography>
                        <Stack spacing={1}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Typography sx={{ fontSize: tamanhos.sm, color: cores.textoForte }}>Foto da Pilha (Gemini)</Typography>
                                <Chip size="small" label={metricas.sessoesFoto} sx={{ bgcolor: tom(funcao.liberado, 0.14), color: funcao.liberado, fontWeight: 700 }} />
                            </Box>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Typography sx={{ fontSize: tamanhos.sm, color: cores.textoForte }}>Vídeo Gravado (Gemini)</Typography>
                                <Chip size="small" label={metricas.sessoesVideo} sx={{ bgcolor: tom(funcao.acao, 0.14), color: funcao.acao, fontWeight: 700 }} />
                            </Box>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Typography sx={{ fontSize: tamanhos.sm, color: cores.textoForte }}>Câmera ao Vivo / RTSP</Typography>
                                <Chip size="small" label={metricas.sessoesLive} sx={{ bgcolor: tom(cores.primaria, 0.14), color: cores.primaria, fontWeight: 700 }} />
                            </Box>
                        </Stack>
                    </GlassCard>
                </Grid>

                <Grid item xs={12} sm={6} md={4}>
                    <GlassCard sx={{ p: 2.25, height: '100%' }}>
                        <Typography sx={{ fontSize: tamanhos.xs, color: cores.textoSecundario, fontWeight: 600, mb: 1 }}>
                            AUDITORIA E AÇÕES RÁPIDAS
                        </Typography>
                        <Stack direction="row" spacing={1} sx={{ mb: 1.5 }} flexWrap="wrap" useFlexGap>
                            <Chip
                                size="small"
                                icon={<AlertaIcon sx={{ fontSize: 15 }} />}
                                label={`${metricas.materiaisComDivergencia} divergência(s)`}
                                sx={{
                                    bgcolor: tom(metricas.materiaisComDivergencia > 0 ? funcao.alerta : funcao.liberado, 0.14),
                                    color: metricas.materiaisComDivergencia > 0 ? funcao.alerta : funcao.liberado,
                                    fontWeight: 700
                                }}
                            />
                            <Chip
                                size="small"
                                label={`${naoReconhecidos.length} não catalogado(s)`}
                                sx={{ bgcolor: tom(funcao.acao, 0.14), color: funcao.acao, fontWeight: 700 }}
                            />
                        </Stack>
                        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                            <Button size="small" variant="outlined" startIcon={<FotoIcon />} onClick={() => aoAbrirModo('foto')} sx={botaoSecundario}>
                                Foto da Pilha
                            </Button>
                            <Button size="small" variant="outlined" startIcon={<VideoIcon />} onClick={() => aoAbrirModo('video')} sx={botaoSecundario}>
                                Vídeo Gravado
                            </Button>
                        </Stack>
                    </GlassCard>
                </Grid>
            </Grid>

            {/* Linha 2: Gráfico de Contagem por Hora + Previsto x Recebido por Material */}
            <Grid container spacing={2}>
                <Grid item xs={12} lg={6}>
                    <GlassCard sx={{ p: 2.25, height: '100%' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                            <GraficoIcon sx={{ color: cores.primaria, fontSize: 20 }} />
                            <Typography variant="subtitle1" sx={{ color: cores.textoForte, fontWeight: 700 }}>
                                Contagem por hora (00h – 23h)
                            </Typography>
                        </Box>
                        <Box
                            sx={{
                                display: 'flex',
                                alignItems: 'flex-end',
                                gap: '4px',
                                height: 150,
                                px: 0.5,
                                pt: 1.5,
                                pb: 0.5,
                                borderRadius: 2,
                                bgcolor: cores.fundo,
                                border: `1px solid ${cores.borda}`
                            }}
                        >
                            {metricas.porHora.map((val, hora) => {
                                const alturaPct = val > 0 ? Math.max(10, Math.round((val / metricas.picoHora) * 100)) : 4;
                                return (
                                    <Box
                                        key={hora}
                                        title={`${String(hora).padStart(2, '0')}h: ${val} un.`}
                                        sx={{
                                            flex: 1,
                                            height: '100%',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            justifyContent: 'flex-end',
                                            alignItems: 'center',
                                            gap: 0.5
                                        }}
                                    >
                                        <Box
                                            sx={{
                                                width: '100%',
                                                maxWidth: 16,
                                                height: `${alturaPct}%`,
                                                borderRadius: '4px 4px 1px 1px',
                                                bgcolor: val > 0 ? cores.primaria : 'rgba(148,163,184,0.16)',
                                                transition: 'height 0.25s ease'
                                            }}
                                        />
                                        {hora % 3 === 0 && (
                                            <Typography sx={{ fontSize: '0.62rem', color: cores.textoSecundario }}>
                                                {String(hora).padStart(2, '0')}h
                                            </Typography>
                                        )}
                                    </Box>
                                );
                            })}
                        </Box>
                    </GlassCard>
                </Grid>

                <Grid item xs={12} lg={6}>
                    <GlassCard sx={{ p: 2.25, height: '100%' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                            <EvolucaoIcon sx={{ color: funcao.liberado, fontSize: 20 }} />
                            <Typography variant="subtitle1" sx={{ color: cores.textoForte, fontWeight: 700 }}>
                                Previsto × Recebido por material
                            </Typography>
                        </Box>
                        <Stack spacing={1.25} sx={{ maxHeight: 168, overflowY: 'auto', pr: 0.5 }}>
                            {materiais.slice(0, 8).map((m) => {
                                const prev = Number(m.quantidade_planejada || 0);
                                const rec = Number(m.quantidade_recebida || 0);
                                const pct = prev > 0 ? Math.min(100, Math.round((rec / prev) * 100)) : (rec > 0 ? 100 : 0);
                                const corBarra = prev > 0 && rec > prev
                                    ? funcao.negado
                                    : (pct >= 100 ? funcao.liberado : cores.primaria);
                                return (
                                    <Box key={m.id}>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.4 }}>
                                            <Typography sx={{ fontSize: tamanhos.xs, fontWeight: 600, color: cores.textoForte }} noWrap>
                                                {m.nome}
                                            </Typography>
                                            <Typography sx={{ fontSize: tamanhos.xs, fontWeight: 700, color: corBarra, flexShrink: 0, ml: 1 }}>
                                                {rec} / {prev} {m.caracteristicas?.unidade_medida || 'un'}
                                            </Typography>
                                        </Box>
                                        <LinearProgress
                                            variant="determinate"
                                            value={pct}
                                            sx={{
                                                height: 7,
                                                borderRadius: 4,
                                                bgcolor: 'rgba(148,163,184,0.16)',
                                                '& .MuiLinearProgress-bar': { bgcolor: corBarra, borderRadius: 4 }
                                            }}
                                        />
                                    </Box>
                                );
                            })}
                            {materiais.length === 0 && (
                                <Typography sx={{ fontSize: tamanhos.sm, color: cores.textoSecundario }}>
                                    Cadastre materiais no catálogo para acompanhar o avanço em tempo real.
                                </Typography>
                            )}
                        </Stack>
                    </GlassCard>
                </Grid>
            </Grid>

            {/* Linha 3: Galeria rápida de evidências anotadas */}
            {metricas.evidenciasRecentes.length > 0 && (
                <GlassCard sx={{ p: 2.25 }}>
                    <Typography variant="subtitle1" sx={{ color: cores.textoForte, fontWeight: 700, mb: 1.5 }}>
                        Últimas evidências capturadas pela IA ({metricas.evidenciasRecentes.length})
                    </Typography>
                    <Grid container spacing={1.5}>
                        {metricas.evidenciasRecentes.map((ev) => (
                            <Grid item xs={6} sm={4} md={3} key={ev.id}>
                                <Box
                                    onClick={() => aoAmpliarEvidencia && aoAmpliarEvidencia(ev.url)}
                                    sx={{
                                        borderRadius: 2,
                                        overflow: 'hidden',
                                        border: `1px solid ${cores.borda}`,
                                        bgcolor: cores.fundo,
                                        cursor: 'pointer',
                                        '&:hover': { borderColor: cores.primaria }
                                    }}
                                >
                                    <Box
                                        component="img"
                                        src={ev.url}
                                        alt={ev.titulo}
                                        sx={{ width: '100%', height: 108, objectFit: 'cover', display: 'block' }}
                                    />
                                    <Box sx={{ p: 1 }}>
                                        <Typography sx={{ fontSize: tamanhos.xs, fontWeight: 700, color: cores.textoForte }} noWrap>
                                            {ev.titulo} ({ev.qtd} un.)
                                        </Typography>
                                        <Typography sx={{ fontSize: '0.68rem', color: cores.textoSecundario }} noWrap>
                                            {ev.modelo} • {formatarDataHoraCurta(ev.data)}
                                        </Typography>
                                    </Box>
                                </Box>
                            </Grid>
                        ))}
                    </Grid>
                </GlassCard>
            )}
        </Stack>
    );
};

export default DashboardContagemMateriais;
