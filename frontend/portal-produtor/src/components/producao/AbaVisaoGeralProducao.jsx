import React from 'react';
import {
    Box,
    Chip,
    Grid,
    LinearProgress,
    Stack,
    Typography
} from '@mui/material';
import {
    AssignmentTurnedIn as TarefasIcon,
    WarningAmber as AlertaIcon,
    Groups as EquipeIcon,
    Architecture as PlantaIcon,
    Inventory2 as MaterialIcon,
    AttachMoney as FinanceiroIcon,
    PhotoCamera as FotoIcon
} from '@mui/icons-material';
import KpiCard from '../common/KpiCard';
import GlassCard from '../common/GlassCard';
import { cores, funcao, tamanhos, tom } from '../../styles/tokens';
import {
    formatarDataHoraCurta,
    formatarMoedaCentavos,
    obterNomeArea,
    ROTULO_SAUDE_PRAZO
} from './producaoHelpers';

const AbaVisaoGeralProducao = ({ resumo, aoTrocarAba }) => {
    const kpis = resumo?.kpis || {};
    const areas = resumo?.areas || [];
    const tarefas = resumo?.tarefas || [];
    const plantas = resumo?.plantas || [];
    const versaoOficial = plantas[0]?.versoes?.find((v) => v.eh_oficial) || plantas[0]?.versoes?.[0];
    const setores = versaoOficial?.setores || [];

    const evidenciasRecentes = tarefas
        .flatMap((t) =>
            (t.etapas || []).flatMap((e) =>
                (e.evidencias || []).map((ev) => ({
                    ...ev,
                    tarefa_titulo: t.titulo,
                    area_id: t.area_id,
                    etapa_descricao: e.descricao
                }))
            )
        )
        .sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em))
        .slice(0, 6);

    const tarefasCriticasOuRisco = tarefas.filter(
        (t) => t.eh_caminho_critico || t.saude_prazo === 'em_risco' || t.saude_prazo === 'atrasada'
    );

    const progressoDoSetor = (setor) => {
        const doSetor = tarefas.filter((t) => t.setor_id === setor.id || (setor.area_id && t.area_id === setor.area_id));
        if (!doSetor.length) return 0;
        return Math.round(doSetor.reduce((acc, t) => acc + Number(t.percentual_concluido || 0), 0) / doSetor.length);
    };

    return (
        <Stack spacing={3}>
            {/* Indicadores principais */}
            <Grid container spacing={2}>
                <Grid item xs={12} sm={6} md={4} lg={resumo?.orcamentos_restrito ? 2.4 : 2}>
                    <KpiCard
                        titulo="Progresso geral"
                        valor={`${kpis.progresso_geral || 0}%`}
                        cor={funcao.liberado}
                        progresso={kpis.progresso_geral || 0}
                        rodape={`${kpis.tarefas_concluidas || 0} de ${kpis.total_tarefas || 0} tarefas`}
                        icone={<TarefasIcon fontSize="small" />}
                        onClick={() => aoTrocarAba(1)}
                    />
                </Grid>
                <Grid item xs={12} sm={6} md={4} lg={resumo?.orcamentos_restrito ? 2.4 : 2}>
                    <KpiCard
                        titulo="Atrasadas e em risco"
                        valor={(kpis.tarefas_atrasadas || 0) + (kpis.tarefas_em_risco || 0)}
                        cor={(kpis.tarefas_atrasadas || 0) > 0 ? funcao.negado : funcao.alerta}
                        rodape={`${kpis.tarefas_atrasadas || 0} atrasadas • ${kpis.tarefas_em_risco || 0} em risco`}
                        icone={<AlertaIcon fontSize="small" />}
                        onClick={() => aoTrocarAba(3)}
                    />
                </Grid>
                <Grid item xs={12} sm={6} md={4} lg={resumo?.orcamentos_restrito ? 2.4 : 2}>
                    <KpiCard
                        titulo="Equipe presente"
                        valor={kpis.presentes_agora || 0}
                        cor={funcao.entrada}
                        rodape={`${kpis.dobras_detectadas || 0} dobra(s) detectada(s)`}
                        icone={<EquipeIcon fontSize="small" />}
                        onClick={() => aoTrocarAba(5)}
                    />
                </Grid>
                <Grid item xs={12} sm={6} md={4} lg={resumo?.orcamentos_restrito ? 2.4 : 2}>
                    <KpiCard
                        titulo="Propostas na planta"
                        valor={kpis.propostas_pendentes || 0}
                        cor={funcao.fiscalizacao}
                        rodape={versaoOficial ? `Planta oficial v${versaoOficial.numero_versao}` : 'Sem planta oficial'}
                        icone={<PlantaIcon fontSize="small" />}
                        onClick={() => aoTrocarAba(2)}
                    />
                </Grid>
                <Grid item xs={12} sm={6} md={4} lg={resumo?.orcamentos_restrito ? 2.4 : 2}>
                    <KpiCard
                        titulo="Divergências materiais"
                        valor={kpis.materiais_divergentes || 0}
                        cor={(kpis.itens_nao_reconhecidos || 0) > 0 ? funcao.alerta : funcao.acao}
                        rodape={`${kpis.itens_nao_reconhecidos || 0} pendente(s) de cadastro`}
                        icone={<MaterialIcon fontSize="small" />}
                        onClick={() => aoTrocarAba(4)}
                    />
                </Grid>
                {!resumo?.orcamentos_restrito && (
                    <Grid item xs={12} sm={6} md={4} lg={2}>
                        <KpiCard
                            titulo="Orçamento realizado"
                            valor={formatarMoedaCentavos(kpis.orcamento_realizado_centavos)}
                            valorCompacto
                            cor={funcao.liberado}
                            rodape={`Previsto: ${formatarMoedaCentavos(kpis.orcamento_previsto_centavos)}`}
                            icone={<FinanceiroIcon fontSize="small" />}
                            onClick={() => aoTrocarAba(6)}
                        />
                    </Grid>
                )}
            </Grid>

            <Grid container spacing={2.5}>
                {/* Andamento por área */}
                <Grid item xs={12} lg={6}>
                    <GlassCard sx={{ p: 2.5, height: '100%' }}>
                        <Typography variant="h6" sx={{ color: cores.textoForte, mb: 0.5 }}>
                            Andamento por área de atuação
                        </Typography>
                        <Typography variant="body2" sx={{ color: cores.textoSecundario, mb: 2 }}>
                            Percentual consolidado das etapas concluídas em cada frente de trabalho.
                        </Typography>
                        <Stack spacing={2}>
                            {areas.map((area) => {
                                const daArea = tarefas.filter((t) => t.area_id === area.id);
                                const pct = daArea.length
                                    ? Math.round(daArea.reduce((acc, t) => acc + Number(t.percentual_concluido || 0), 0) / daArea.length)
                                    : 0;
                                return (
                                    <Box key={area.id}>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: area.cor || cores.primaria }} />
                                                <Typography sx={{ fontSize: tamanhos.md, fontWeight: 600, color: cores.textoForte }}>
                                                    {area.nome}
                                                </Typography>
                                            </Box>
                                            <Typography sx={{ fontSize: tamanhos.sm, color: cores.textoSecundario }}>
                                                {pct}% ({daArea.length} tarefa{daArea.length === 1 ? '' : 's'})
                                            </Typography>
                                        </Box>
                                        <LinearProgress
                                            variant="determinate"
                                            value={pct}
                                            sx={{
                                                height: 8,
                                                borderRadius: 1.5,
                                                bgcolor: 'rgba(148, 163, 184, 0.14)',
                                                '& .MuiLinearProgress-bar': {
                                                    bgcolor: area.cor || cores.primaria,
                                                    borderRadius: 1.5
                                                }
                                            }}
                                        />
                                    </Box>
                                );
                            })}
                            {areas.length === 0 && (
                                <Typography variant="body2" sx={{ color: cores.textoSecundario }}>
                                    Nenhuma área configurada para este evento.
                                </Typography>
                            )}
                        </Stack>
                    </GlassCard>
                </Grid>

                {/* Mapa rápido da planta por setor */}
                <Grid item xs={12} lg={6}>
                    <GlassCard sx={{ p: 2.5, height: '100%' }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                            <Box>
                                <Typography variant="h6" sx={{ color: cores.textoForte }}>
                                    Mapa de setores da planta
                                </Typography>
                                <Typography variant="body2" sx={{ color: cores.textoSecundario }}>
                                    Colorido pelo avanço atual de execução em cada setor.
                                </Typography>
                            </Box>
                            {versaoOficial && (
                                <Chip
                                    size="small"
                                    label={`Versão oficial v${versaoOficial.numero_versao}`}
                                    sx={{ bgcolor: tom(funcao.acao, 0.15), color: funcao.acao, fontWeight: 600 }}
                                />
                            )}
                        </Box>

                        <Box
                            onClick={() => aoTrocarAba(2)}
                            sx={{
                                cursor: 'pointer',
                                borderRadius: 1.5,
                                border: `1px solid ${cores.borda}`,
                                bgcolor: cores.fundo,
                                p: 1
                            }}
                        >
                            <svg viewBox="0 0 840 480" style={{ width: '100%', height: 220, display: 'block' }}>
                                <defs>
                                    <pattern id="grid-mini" width="40" height="40" patternUnits="userSpaceOnUse">
                                        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(148,163,184,0.08)" strokeWidth="1" />
                                    </pattern>
                                </defs>
                                <rect width="840" height="480" fill="url(#grid-mini)" />
                                {setores.map((s) => {
                                    const pts = (s.poligono_coordenadas || []).map((p) => `${p.x},${p.y}`).join(' ');
                                    const pct = progressoDoSetor(s);
                                    return (
                                        <g key={s.id}>
                                            <polygon
                                                points={pts}
                                                fill={s.cor_hex || cores.primaria}
                                                fillOpacity={0.14 + (pct / 100) * 0.25}
                                                stroke={s.cor_hex || cores.primaria}
                                                strokeWidth="2"
                                            />
                                            {s.poligono_coordenadas?.[0] && (
                                                <text
                                                    x={s.poligono_coordenadas[0].x + 10}
                                                    y={s.poligono_coordenadas[0].y + 22}
                                                    fill={cores.textoForte}
                                                    fontSize="14"
                                                    fontWeight="600"
                                                >
                                                    {s.nome} ({pct}%)
                                                </text>
                                            )}
                                        </g>
                                    );
                                })}
                                {(versaoOficial?.elementos_json || []).map((el) => (
                                    <rect
                                        key={el.id}
                                        x={el.x}
                                        y={el.y}
                                        width={el.largura}
                                        height={el.altura}
                                        rx="4"
                                        fill="rgba(10, 22, 40, 0.85)"
                                        stroke={el.cor || cores.primaria}
                                        strokeWidth="1.5"
                                    />
                                ))}
                            </svg>
                        </Box>
                    </GlassCard>
                </Grid>

                {/* Alertas de prazo e caminho crítico */}
                <Grid item xs={12} lg={6}>
                    <GlassCard sx={{ p: 2.5 }}>
                        <Typography variant="h6" sx={{ color: cores.textoForte, mb: 0.5 }}>
                            Caminho crítico e alertas de prazo
                        </Typography>
                        <Typography variant="body2" sx={{ color: cores.textoSecundario, mb: 2 }}>
                            Atividades que impactam diretamente a entrega do evento.
                        </Typography>
                        <Stack spacing={1.5}>
                            {tarefasCriticasOuRisco.slice(0, 5).map((t) => {
                                const saude = ROTULO_SAUDE_PRAZO[t.saude_prazo] || ROTULO_SAUDE_PRAZO.no_prazo;
                                return (
                                    <Box
                                        key={t.id}
                                        onClick={() => aoTrocarAba(1)}
                                        sx={{
                                            p: 1.5,
                                            borderRadius: 1.5,
                                            border: `1px solid ${cores.borda}`,
                                            bgcolor: cores.superficieElevada,
                                            cursor: 'pointer',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            gap: 1.5
                                        }}
                                    >
                                        <Box sx={{ minWidth: 0 }}>
                                            <Typography noWrap sx={{ fontWeight: 600, color: cores.textoForte, fontSize: tamanhos.md }}>
                                                {t.titulo}
                                            </Typography>
                                            <Typography sx={{ fontSize: tamanhos.xs, color: cores.textoSecundario }}>
                                                {obterNomeArea(areas, t.area_id)} • {t.percentual_concluido}% concluído • {t.percentual_prazo_consumido}% do prazo usado
                                            </Typography>
                                        </Box>
                                        <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
                                            {t.eh_caminho_critico && (
                                                <Chip size="small" label="Caminho crítico" sx={{ bgcolor: tom(funcao.fiscalizacao, 0.14), color: funcao.fiscalizacao, fontWeight: 600 }} />
                                            )}
                                            <Chip size="small" label={saude.texto} sx={{ bgcolor: tom(saude.cor, 0.14), color: saude.cor, fontWeight: 600 }} />
                                        </Stack>
                                    </Box>
                                );
                            })}
                            {tarefasCriticasOuRisco.length === 0 && (
                                <Typography variant="body2" sx={{ color: cores.textoSecundario }}>
                                    Nenhuma tarefa em risco no momento.
                                </Typography>
                            )}
                        </Stack>
                    </GlassCard>
                </Grid>

                {/* Feed recente de evidências */}
                <Grid item xs={12} lg={6}>
                    <GlassCard sx={{ p: 2.5 }}>
                        <Typography variant="h6" sx={{ color: cores.textoForte, mb: 0.5 }}>
                            Feed recente de campo
                        </Typography>
                        <Typography variant="body2" sx={{ color: cores.textoSecundario, mb: 2 }}>
                            Últimas fotos, áudios e registros enviados pelas equipes.
                        </Typography>
                        <Stack spacing={1.5}>
                            {evidenciasRecentes.map((ev) => (
                                <Box
                                    key={ev.id}
                                    sx={{
                                        p: 1.5,
                                        borderRadius: 1.5,
                                        border: `1px solid ${cores.borda}`,
                                        bgcolor: cores.superficieElevada,
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 1.5
                                    }}
                                >
                                    {ev.tipo === 'foto' && ev.url_arquivo ? (
                                        <Box
                                            component="img"
                                            src={ev.url_arquivo}
                                            alt="Evidência"
                                            sx={{ width: 52, height: 52, borderRadius: 1.5, objectFit: 'cover', flexShrink: 0 }}
                                        />
                                    ) : (
                                        <Box sx={{
                                            width: 44, height: 44, borderRadius: 1.5,
                                            bgcolor: tom(funcao.acao, 0.12), color: funcao.acao,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                                        }}>
                                            <FotoIcon fontSize="small" />
                                        </Box>
                                    )}
                                    <Box sx={{ minWidth: 0, flex: 1 }}>
                                        <Typography noWrap sx={{ fontWeight: 600, fontSize: tamanhos.sm, color: cores.textoForte }}>
                                            {ev.tarefa_titulo}
                                        </Typography>
                                        <Typography sx={{ fontSize: tamanhos.xs, color: cores.textoSuave }}>
                                            {ev.texto_comentario || ev.transcricao_audio || `Evidência (${ev.tipo}) na etapa: ${ev.etapa_descricao}`}
                                        </Typography>
                                        <Typography sx={{ fontSize: tamanhos.xs, color: cores.textoSecundario, mt: 0.25 }}>
                                            {ev.autor_nome || 'Equipe'} • {formatarDataHoraCurta(ev.criado_em)}
                                        </Typography>
                                    </Box>
                                </Box>
                            ))}
                            {evidenciasRecentes.length === 0 && (
                                <Typography variant="body2" sx={{ color: cores.textoSecundario }}>
                                    Nenhuma evidência registrada ainda.
                                </Typography>
                            )}
                        </Stack>
                    </GlassCard>
                </Grid>
            </Grid>
        </Stack>
    );
};

export default AbaVisaoGeralProducao;
