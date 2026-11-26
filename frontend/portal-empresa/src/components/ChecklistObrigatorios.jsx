import React from 'react';
import { Box, Chip, Stack, Typography } from '@mui/material';
import { SITUACAO_OBRIGATORIO, chipSx } from '../util';
import { cores } from '../styles/tokens';

/** Documentos obrigatórios e a situação de cada um. Sem itens não mostra nada. */
const ChecklistObrigatorios = ({ obrigatorios = [], titulo = 'Documentos obrigatórios' }) => {
    if (!obrigatorios.length) return null;
    const faltam = obrigatorios.filter(o => o.situacao !== 'ok').length;
    return (
        <Box>
            <Typography variant="caption" sx={{ display: 'block', color: cores.textoSecundario, fontWeight: 700, mb: 0.5 }}>
                {titulo}{faltam > 0 ? ` · faltam ${faltam}` : ' · completo'}
            </Typography>
            <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap' }}>
                {obrigatorios.map(o => {
                    const s = SITUACAO_OBRIGATORIO[o.situacao] || SITUACAO_OBRIGATORIO.falta_anexar;
                    return <Chip key={o.id || o.nome} size="small" label={`${o.nome}: ${s.rotulo}`} sx={{ ...chipSx(s.cor), fontSize: '0.72rem' }} />;
                })}
            </Stack>
        </Box>
    );
};

export default ChecklistObrigatorios;
