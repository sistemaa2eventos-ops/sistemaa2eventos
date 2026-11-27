import React from 'react';
import { Box, Typography } from '@mui/material';
import {
    Groups as GruposIcon, Login as EntradaIcon, Logout as SaidaIcon, Block as NegadoIcon,
    Security as FiscalIcon, Business as EmpresaIcon, People as PessoasIcon
} from '@mui/icons-material';
import { cores, fontes, gradientes } from '../../styles/tokens';

/**
 * Indicadores do dia no layout aprovado (protótipo Cartões).
 * Cartão: fundo de painel, borda 1px, raio 6, padding 18×20.
 * Ícone: círculo de 46px com gradiente. Valor: Plus Jakarta Sans 300, 30px, tom secundário.
 * "Presentes agora" ocupa duas colunas e leva a barra de capacidade.
 */
const Cartao = ({ rotulo, valor, nota, icone, gradiente = gradientes.azul, destaque = false, children }) => (
    <Box sx={{
        bgcolor: cores.superficie,
        border: `1px solid ${cores.borda}`,
        borderRadius: '6px',
        px: '20px',
        py: '18px',
        minWidth: 0,
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        gridColumn: destaque ? { xs: 'span 2', lg: 'span 2' } : 'auto',
        flexWrap: destaque ? 'wrap' : 'nowrap',
        transition: 'transform 250ms cubic-bezier(0.16, 1, 0.3, 1), border-color 200ms cubic-bezier(0.4, 0, 0.2, 1)',
        '&:hover': { transform: 'translateY(-2px)', borderColor: cores.bordaForte }
    }}>
        <Box sx={{
            width: 46, height: 46, borderRadius: '50%', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: gradiente, color: '#FFFFFF',
            '& svg': { fontSize: 22 }
        }}>
            {icone}
        </Box>
        <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography noWrap sx={{ fontSize: '13.5px', fontWeight: 500, color: cores.texto, lineHeight: 1.3 }}>{rotulo}</Typography>
            <Typography sx={{
                fontFamily: fontes.titulo,
                fontWeight: 300,
                fontSize: destaque ? '2rem' : '30px',
                letterSpacing: '-0.02em',
                lineHeight: 1.15,
                color: cores.textoSecundario,
                fontVariantNumeric: 'tabular-nums'
            }}>
                {valor}
            </Typography>
            {nota && <Typography sx={{ color: cores.textoFraco, fontSize: '11.5px', mt: 0.25 }}>{nota}</Typography>}
        </Box>
        {children && <Box sx={{ width: '100%' }}>{children}</Box>}
    </Box>
);

const IndicadoresEditoriais = ({ stats, totalEmpresas, empresasAtivas }) => {
    const presentes = stats.presentes || 0;
    const capacidade = stats.capacidade;
    const percentual = capacidade ? Math.round((presentes / capacidade) * 100) : null;
    const fmt = (n) => (n || 0).toLocaleString('pt-BR');

    return (
        <Box
            component="section"
            aria-label="Indicadores do dia"
            sx={{
                display: 'grid',
                gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(3, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' },
                gap: '20px',
                minWidth: 0
            }}
        >
            <Cartao
                destaque
                rotulo="Presentes agora"
                valor={fmt(presentes)}
                icone={<GruposIcon />}
                gradiente={gradientes.azul}
                nota={capacidade ? `${percentual}% da capacidade (${fmt(capacidade)} lugares)` : 'Capacidade não definida para este evento'}
            >
                {capacidade ? (
                    <Box
                        role="meter"
                        aria-label="Ocupação do evento"
                        aria-valuemin={0}
                        aria-valuemax={capacidade}
                        aria-valuenow={presentes}
                        sx={{ height: 4, borderRadius: '999px', bgcolor: cores.superficieElevada, overflow: 'hidden' }}
                    >
                        <Box sx={{ height: '100%', width: `${Math.min(100, percentual)}%`, borderRadius: '999px', bgcolor: cores.primaria }} />
                    </Box>
                ) : null}
            </Cartao>
            <Cartao rotulo="Entradas hoje" valor={fmt(stats.checkins_hoje)} icone={<EntradaIcon />} gradiente={gradientes.verde} />
            <Cartao rotulo="Saídas hoje" valor={fmt(stats.checkouts_hoje)} icone={<SaidaIcon />} gradiente={gradientes.laranja} />
            <Cartao rotulo="Acessos negados" valor={fmt(stats.negados_hoje)} icone={<NegadoIcon />} gradiente={gradientes.vermelho} />
            <Cartao rotulo="Fiscalizações hoje" valor={fmt(stats.fiscalizacoes_hoje)} icone={<FiscalIcon />} gradiente={gradientes.violeta} />
            <Cartao rotulo="Empresas credenciadas" valor={fmt(totalEmpresas)} nota={`${empresasAtivas} ativas no evento`} icone={<EmpresaIcon />} gradiente={gradientes.azul} />
            <Cartao rotulo="Participantes cadastrados" valor={fmt(stats.total_pessoas)} icone={<PessoasIcon />} gradiente={gradientes.azul} />
        </Box>
    );
};

export default IndicadoresEditoriais;
