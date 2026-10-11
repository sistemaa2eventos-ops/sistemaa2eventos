import React, { useCallback, useEffect, useState } from 'react';
import {
    Box, Chip, CircularProgress, MenuItem, Stack, TextField, Typography
} from '@mui/material';
import { useSnackbar } from 'notistack';
import api from '../../services/api';
import ListaDocumentos from './ListaDocumentos';
import { chipSx } from './documentosUtils';

/**
 * Documentos vencidos e a vencer (janela padrão = configuração do evento).
 */
const AbaVencimentos = ({ onAuditar, recarregarToken }) => {
    const { enqueueSnackbar } = useSnackbar();
    const [dias, setDias] = useState('');
    const [dados, setDados] = useState({ janela_dias: null, data: [] });
    const [carregando, setCarregando] = useState(false);

    const carregar = useCallback(async () => {
        setCarregando(true);
        try {
            const resp = await api.get('/documentos/vencimentos', { params: { dias: dias || undefined } });
            setDados(resp.data?.data || { janela_dias: null, data: [] });
        } catch {
            enqueueSnackbar('Erro ao buscar vencimentos.', { variant: 'error' });
        } finally {
            setCarregando(false);
        }
    }, [dias, enqueueSnackbar]);

    useEffect(() => { carregar(); }, [carregar, recarregarToken]);

    const vencidos = dados.data.filter(d => d.situacao === 'vencido');
    const aVencer = dados.data.filter(d => d.situacao !== 'vencido');
    const comoDoc = (d) => ({ ...d, tipo_entidade: 'pessoa', entidade_nome: d.pessoa_nome, entidade_doc: d.pessoa_cpf, titulo: `${d.pessoa_nome} — ${d.titulo}` });

    const Grupo = ({ titulo, cor, itens }) => (
        <Box sx={{ mb: 3 }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                <Typography variant="overline" sx={{ color: cor, fontWeight: 700 }}>{titulo}</Typography>
                <Chip size="small" label={itens.length} sx={chipSx(cor)} />
            </Stack>
            <ListaDocumentos documentos={itens.map(comoDoc)} onAuditar={onAuditar} />
        </Box>
    );

    return (
        <Box>
            <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
                <TextField select size="small" label="Janela" value={dias} onChange={(e) => setDias(e.target.value)}
                    sx={{ minWidth: 220, '& .MuiOutlinedInput-root': { color: '#FFFFFF' } }}>
                    <MenuItem value="">Padrão do evento{dados.janela_dias ? ` (${dados.janela_dias} dias)` : ''}</MenuItem>
                    {[7, 15, 30, 60, 90].map(n => <MenuItem key={n} value={n}>Próximos {n} dias</MenuItem>)}
                </TextField>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                    Documentos aprovados com data de validade registrada.
                </Typography>
            </Stack>

            {carregando ? (
                <Box sx={{ textAlign: 'center', py: 4 }}><CircularProgress sx={{ color: '#00D4FF' }} /></Box>
            ) : dados.data.length === 0 ? (
                <Typography sx={{ color: '#00FF88', textAlign: 'center', py: 6, fontWeight: 700 }}>
                    Nenhum documento vencido ou a vencer na janela selecionada.
                </Typography>
            ) : (
                <>
                    <Grupo titulo="Vencidos" cor="#FF3366" itens={vencidos} />
                    <Grupo titulo="A vencer" cor="#FFB800" itens={aVencer} />
                </>
            )}
        </Box>
    );
};

export default AbaVencimentos;
