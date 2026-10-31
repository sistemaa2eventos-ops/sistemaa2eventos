import React, { useEffect, useState } from 'react';
import { Box, Typography, Slider, Stack } from '@mui/material';
import { Face as FaceIcon, Save as SaveIcon } from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import api from '../../services/api';
import GlassCard from '../common/GlassCard';
import NeonButton from '../common/NeonButton';
import { cores } from '../../styles/tokens';

/**
 * Confiança mínima do rosto do evento (eventos.min_face_score): passagem facial com semelhança
 * abaixo disso é negada pelo servidor. Substitui o "Limiar de reconhecimento" da tela antiga
 * Leitor facial, que gravava um campo que o servidor não lia.
 */
const ConfiancaFacial = () => {
    const { enqueueSnackbar } = useSnackbar();
    const eventoId = new URLSearchParams(window.location.search).get('evento_id') || localStorage.getItem('active_evento_id');
    const [valor, setValor] = useState(null);
    const [salvo, setSalvo] = useState(null);
    const [salvando, setSalvando] = useState(false);

    useEffect(() => {
        if (!eventoId) return;
        api.get(`/eventos/${eventoId}`).then(({ data }) => {
            const v = (data?.data || data)?.min_face_score ?? 75;
            setValor(v);
            setSalvo(v);
        }).catch(() => {});
    }, [eventoId]);

    if (!eventoId || valor === null) return null;

    const salvar = async () => {
        setSalvando(true);
        try {
            await api.put(`/eventos/${eventoId}`, { min_face_score: valor });
            setSalvo(valor);
            enqueueSnackbar(`Confiança mínima do rosto: ${valor}%.`, { variant: 'success' });
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Falha ao salvar.', { variant: 'error' });
        } finally {
            setSalvando(false);
        }
    };

    return (
        <GlassCard sx={{ p: { xs: 2, sm: 2.5 }, mb: 3 }}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={{ xs: 2, md: 4 }} alignItems={{ md: 'center' }}>
                <Box sx={{ flex: 1 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700, color: cores.textoForte, display: 'flex', alignItems: 'center', gap: 1 }}>
                        <FaceIcon sx={{ color: cores.primaria }} /> Confiança mínima do rosto: {valor}%
                    </Typography>
                    <Typography variant="body2" sx={{ color: cores.textoSecundario }}>
                        Passagem facial com semelhança abaixo deste valor é negada. Mais alto = mais seguro, porém nega mais quem está de lado ou com pouca luz. Recomendado: 75%.
                    </Typography>
                </Box>
                <Box sx={{ width: { xs: '100%', md: 280 }, px: 1 }}>
                    <Slider value={valor} min={50} max={99} step={1} onChange={(_, v) => setValor(v)}
                        marks={[{ value: 60, label: '60' }, { value: 75, label: '75' }, { value: 90, label: '90' }]}
                        aria-label="Confiança mínima do rosto" valueLabelDisplay="auto" />
                </Box>
                <NeonButton startIcon={<SaveIcon />} onClick={salvar} loading={salvando} disabled={valor === salvo}>Salvar</NeonButton>
            </Stack>
        </GlassCard>
    );
};

export default ConfiancaFacial;
