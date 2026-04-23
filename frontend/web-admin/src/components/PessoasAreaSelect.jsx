import React, { useEffect, useState } from 'react';
import {
    Box, Checkbox, FormControlLabel, FormGroup,
    Typography, CircularProgress, Chip, Stack
} from '@mui/material';
import {
    Place as AreaIcon,
    CheckCircle as CheckedIcon,
    Warning as WarningIcon,
} from '@mui/icons-material';
import api from '../services/api';
import { useSnackbar } from 'notistack';

export default function PessoasAreaSelect({ eventoId, selectedAreas = [], onAreasChange }) {
    const { enqueueSnackbar } = useSnackbar();
    const [areas, setAreas]       = useState([]);
    const [loading, setLoading]   = useState(true);
    const [selected, setSelected] = useState(selectedAreas || []);

    useEffect(() => { loadAreas(); }, [eventoId]);

    useEffect(() => {
        if (onAreasChange) onAreasChange(selected);
    }, [selected]);

    const loadAreas = async () => {
        try {
            setLoading(true);
            const { data } = await api.get(`/evento-areas?evento_id=${eventoId}`);
            setAreas(data?.data || []);
        } catch (error) {
            enqueueSnackbar('Erro ao carregar áreas: ' + error.message, { variant: 'error' });
            setAreas([]);
        } finally {
            setLoading(false);
        }
    };

    const toggle = (id) =>
        setSelected(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );

    const remove = (id) =>
        setSelected(prev => prev.filter(i => i !== id));

    const selectedDetails = areas.filter(a => selected.includes(a.id));

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
                <CircularProgress size={28} />
            </Box>
        );
    }

    if (areas.length === 0) {
        return (
            <Box sx={{
                p: 3, borderRadius: 2,
                border: '1px solid rgba(255,255,255,0.08)',
                bgcolor: 'rgba(255,255,255,0.02)',
                textAlign: 'center',
            }}>
                <AreaIcon sx={{ fontSize: 32, color: 'text.disabled', mb: 1 }} />
                <Typography variant="body2" color="text.disabled">
                    Nenhuma área cadastrada para este evento.
                </Typography>
            </Box>
        );
    }

    return (
        <Box>
            {/* Label de seção */}
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
                <AreaIcon sx={{ fontSize: 18, color: 'primary.main' }} />
                <Typography variant="body2" fontWeight={600} color="text.primary">
                    Selecione as áreas de acesso
                </Typography>
                <Typography variant="caption" color="text.disabled">
                    (mínimo 1)
                </Typography>
            </Stack>

            {/* Grid de áreas */}
            <FormGroup sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                gap: 1.5,
            }}>
                {areas.map((area) => {
                    const isSelected = selected.includes(area.id);
                    return (
                        <Box
                            key={area.id}
                            onClick={() => toggle(area.id)}
                            sx={{
                                p: 1.5,
                                borderRadius: 2,
                                border: isSelected
                                    ? '1.5px solid rgba(0,212,255,0.6)'
                                    : '1px solid rgba(255,255,255,0.08)',
                                bgcolor: isSelected
                                    ? 'rgba(0,212,255,0.07)'
                                    : 'rgba(255,255,255,0.02)',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                '&:hover': {
                                    bgcolor: isSelected
                                        ? 'rgba(0,212,255,0.1)'
                                        : 'rgba(255,255,255,0.04)',
                                    borderColor: 'rgba(0,212,255,0.3)',
                                },
                            }}
                        >
                            <FormControlLabel
                                onClick={e => e.stopPropagation()}
                                control={
                                    <Checkbox
                                        checked={isSelected}
                                        onChange={() => toggle(area.id)}
                                        size="small"
                                        sx={{
                                            color: 'rgba(255,255,255,0.3)',
                                            '&.Mui-checked': { color: 'primary.main' },
                                        }}
                                    />
                                }
                                label={
                                    <Box>
                                        <Typography
                                            variant="body2"
                                            fontWeight={isSelected ? 600 : 400}
                                            color={isSelected ? 'primary.main' : 'text.primary'}
                                        >
                                            {area.nome || 'Área sem nome'}
                                        </Typography>
                                        {area.descricao && (
                                            <Typography variant="caption" color="text.disabled">
                                                {area.descricao}
                                            </Typography>
                                        )}
                                    </Box>
                                }
                                sx={{ m: 0, width: '100%', alignItems: 'flex-start' }}
                            />
                        </Box>
                    );
                })}
            </FormGroup>

            {/* Resumo */}
            <Box sx={{ mt: 2 }}>
                {selected.length > 0 ? (
                    <Box sx={{
                        p: 1.5, borderRadius: 2,
                        bgcolor: 'rgba(0,255,136,0.05)',
                        border: '1px solid rgba(0,255,136,0.15)',
                    }}>
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                            <CheckedIcon sx={{ fontSize: 16, color: 'success.main' }} />
                            <Typography variant="caption" fontWeight={600} color="success.main">
                                {selected.length} área{selected.length !== 1 ? 's' : ''} selecionada{selected.length !== 1 ? 's' : ''}
                            </Typography>
                        </Stack>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                            {selectedDetails.map(area => (
                                <Chip
                                    key={area.id}
                                    label={area.nome}
                                    onDelete={() => remove(area.id)}
                                    size="small"
                                    sx={{
                                        bgcolor: 'rgba(0,212,255,0.1)',
                                        color: 'primary.main',
                                        borderColor: 'rgba(0,212,255,0.2)',
                                        '& .MuiChip-deleteIcon': { color: 'primary.main', opacity: 0.6, '&:hover': { opacity: 1 } },
                                    }}
                                    variant="outlined"
                                />
                            ))}
                        </Box>
                    </Box>
                ) : (
                    <Box sx={{
                        p: 1.5, borderRadius: 2,
                        bgcolor: 'rgba(255,152,0,0.05)',
                        border: '1px solid rgba(255,152,0,0.2)',
                        display: 'flex', alignItems: 'center', gap: 1,
                    }}>
                        <WarningIcon sx={{ fontSize: 16, color: 'warning.main', flexShrink: 0 }} />
                        <Typography variant="caption" color="warning.main">
                            Nenhuma área selecionada — pessoa ficará bloqueada em todos os leitores.
                        </Typography>
                    </Box>
                )}
            </Box>
        </Box>
    );
}
