import React from 'react';
import { Box, Chip, Stack, Typography } from '@mui/material';
import { cores } from '../../styles/tokens';

/** Situação de cada documento obrigatório (texto e cor). */
export const SITUACAO_OBRIGATORIO = {
    ok: { rotulo: 'Aprovado', cor: cores.sucesso },
    em_analise: { rotulo: 'Em análise', cor: cores.alerta },
    reenvio_solicitado: { rotulo: 'Reenvio solicitado', cor: cores.alerta },
    vencido: { rotulo: 'Vencido', cor: cores.erro },
    reprovado: { rotulo: 'Reprovado', cor: cores.erro },
    falta_anexar: { rotulo: 'Falta anexar', cor: cores.erro }
};

/**
 * Lista de documentos obrigatórios da função da pessoa, com a situação de cada um.
 * obrigatorios: [{ id, nome, situacao }]. Sem itens não mostra nada.
 * Usada na fila de análise (auditor) e na 3ª etapa do cadastro (participante).
 */
const ChecklistObrigatorios = ({ obrigatorios = [], titulo = 'Documentos obrigatórios', compacto = false }) => {
    if (!obrigatorios.length) return null;
    const faltam = obrigatorios.filter(o => o.situacao !== 'ok').length;

    return (
        <Box>
            <Typography variant="caption" sx={{ display: 'block', color: 'rgba(255,255,255,0.7)', fontWeight: 700, mb: 0.5 }}>
                {titulo}{faltam > 0 ? ` · faltam ${faltam}` : ' · completo'}
            </Typography>
            <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap' }}>
                {obrigatorios.map(o => {
                    const s = SITUACAO_OBRIGATORIO[o.situacao] || SITUACAO_OBRIGATORIO.falta_anexar;
                    return (
                        <Chip
                            key={o.id || o.nome}
                            size="small"
                            label={compacto ? `${o.nome}: ${s.rotulo}` : `${o.nome} — ${s.rotulo}`}
                            sx={{
                                bgcolor: `${s.cor}1F`, color: s.cor, fontWeight: 600, fontSize: '0.75rem',
                                border: `1px solid ${s.cor}66`
                            }}
                        />
                    );
                })}
            </Stack>
        </Box>
    );
};

export default ChecklistObrigatorios;
