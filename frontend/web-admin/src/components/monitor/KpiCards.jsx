import React from 'react';
import { Grid } from '@mui/material';
import {
    Groups as PresentesIcon, Login as EntradaIcon, Logout as SaidaIcon,
    Block as NegadoIcon, Security as FiscalIcon
} from '@mui/icons-material';
import KpiCard from '../common/KpiCard';
import { cores } from '../../styles/tokens';

/**
 * Indicadores do dia (fuso local) no topo do Monitor.
 * @param {{ stats: object }} props
 */
const KpiCards = ({ stats }) => {
    const capacidade = stats.capacidade || 0;
    const lotacao = capacidade > 0 ? Math.min(100, Math.round(((stats.presentes || 0) / capacidade) * 100)) : null;
    const corLotacao = lotacao === null ? cores.primaria : lotacao >= 90 ? cores.erro : lotacao >= 70 ? cores.alerta : cores.sucesso;

    return (
        <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid item xs={12} sm={6} md={4} lg={2.4}>
                <KpiCard
                    titulo="Presentes agora"
                    valor={stats.presentes || 0}
                    icone={<PresentesIcon />}
                    cor={corLotacao}
                    progresso={lotacao ?? undefined}
                    rodape={lotacao !== null ? `${lotacao}% da capacidade (${capacidade})` : 'Capacidade não definida'}
                />
            </Grid>
            <Grid item xs={6} sm={6} md={4} lg={2.4}>
                <KpiCard titulo="Entradas hoje" valor={stats.checkins_hoje || 0} icone={<EntradaIcon />} cor={cores.sucesso} />
            </Grid>
            <Grid item xs={6} sm={4} md={4} lg={2.4}>
                <KpiCard titulo="Saídas hoje" valor={stats.checkouts_hoje || 0} icone={<SaidaIcon />} cor={cores.saida} />
            </Grid>
            <Grid item xs={6} sm={4} md={6} lg={2.4}>
                <KpiCard titulo="Negados hoje" valor={stats.negados_hoje || 0} icone={<NegadoIcon />} cor={cores.erro} />
            </Grid>
            <Grid item xs={6} sm={4} md={6} lg={2.4}>
                <KpiCard titulo="Fiscalizações hoje" valor={stats.fiscalizacoes_hoje || 0} icone={<FiscalIcon />} cor={cores.secundariaClara} />
            </Grid>
        </Grid>
    );
};

export default KpiCards;
