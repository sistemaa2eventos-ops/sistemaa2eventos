import React from 'react';
import { Box, Typography, Stack, Avatar, IconButton, Tooltip, Switch, FormControlLabel } from '@mui/material';
import {
    Event as EventIcon,
    LocationOn as LocationIcon,
    CalendarToday as CalendarIcon,
    History as ResetIcon,
    PlayArrow as StartIcon,
    Edit as EditIcon,
    Delete as DeleteIcon
} from '@mui/icons-material';
import { styled } from '@mui/material/styles';
import { format } from 'date-fns';
import GlassCard from '../common/GlassCard';
import NeonButton from '../common/NeonButton';

const EventBadge = styled(Box)(({ status }) => ({
    fontWeight: 700,
    fontSize: '0.65rem',
    height: 24,
    padding: '0 10px',
    borderRadius: 12,
    display: 'flex',
    alignItems: 'center',
    background: status === 'ativo' ? 'rgba(0, 255, 136, 0.1)' : 'rgba(255, 184, 0, 0.1)',
    color: status === 'ativo' ? '#00FF88' : '#FFB800',
    border: `1px solid ${status === 'ativo' ? 'rgba(0, 255, 136, 0.2)' : 'rgba(255, 184, 0, 0.2)'}`,
    textTransform: 'uppercase',
    letterSpacing: '1px'
}));

const EventCard = ({ evento, toggleStatus, handleGerenciar, handleOpenDialog, handleDelete }) => {
    return (
        <GlassCard glowColor="#00D4FF">
            <Box sx={{ p: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                    <Avatar sx={{ bgcolor: 'rgba(0, 212, 255, 0.1)', color: '#00D4FF', width: 56, height: 56 }}>
                        <EventIcon fontSize="large" />
                    </Avatar>
                    <Stack alignItems="flex-end">
                        <EventBadge status={evento.status}>{evento.status}</EventBadge>
                        <FormControlLabel
                            control={
                                <Switch
                                    size="small"
                                    checked={evento.status === 'ativo'}
                                    onChange={() => toggleStatus(evento)}
                                    color="success"
                                />
                            }
                            label={<Typography variant="caption" sx={{ color: 'text.secondary' }}>ATIVO</Typography>}
                            labelPlacement="start"
                        />
                    </Stack>
                </Box>

                <Typography variant="h5" sx={{ fontWeight: 800, color: '#fff', mb: 1, textTransform: 'uppercase', letterSpacing: '1px' }}>
                    {evento.nome}
                </Typography>

                <Stack spacing={1} sx={{ mb: 3 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary' }}>
                        <LocationIcon sx={{ fontSize: 16 }} />
                        <Typography variant="body2">{evento.local || 'Local não definido'}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary' }}>
                        <CalendarIcon sx={{ fontSize: 16 }} />
                        <Typography variant="body2">
                            {evento.data_inicio && !isNaN(new Date(evento.data_inicio).getTime()) ? format(new Date(evento.data_inicio), "dd/MM/yy") : '??'} 
                            {' '}até{' '} 
                            {evento.data_fim && !isNaN(new Date(evento.data_fim).getTime()) ? format(new Date(evento.data_fim), "dd/MM/yy") : '??'}
                        </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: '#00FF88' }}>
                        <ResetIcon sx={{ fontSize: 16 }} />
                        <Typography variant="caption" sx={{ fontWeight: 700 }}>REDO LOGS: {evento.horario_reset || '00:00'}</Typography>
                    </Box>
                </Stack>

                <Box
                    sx={{
                        display: 'flex',
                        gap: 1.5,
                        p: 2,
                        background: 'rgba(0,0,0,0.2)',
                        borderRadius: 3,
                        border: '1px solid rgba(0,212,255,0.05)',
                        mb: 3
                    }}
                >
                    <Box sx={{ flex: 1, textAlign: 'center' }}>
                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>EMPRESAS</Typography>
                        <Typography variant="h6" sx={{ color: '#00D4FF', fontWeight: 800 }}>
                            {String(evento.total_empresas || 0).padStart(2, '0')}
                        </Typography>
                    </Box>
                    <Box sx={{ width: '1px', background: 'rgba(255,255,255,0.05)' }} />
                    <Box sx={{ flex: 1, textAlign: 'center' }}>
                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>PESSOAS</Typography>
                        <Typography variant="h6" sx={{ color: '#7B2FBE', fontWeight: 800 }}>
                            {evento.total_pessoas > 1000
                                ? `${(evento.total_pessoas / 1000).toFixed(1)}k`
                                : evento.total_pessoas || 0}
                        </Typography>
                    </Box>
                </Box>

                <Box sx={{ display: 'flex', gap: 1 }}>
                    <NeonButton
                        fullWidth
                        variant="outlined"
                        size="small"
                        startIcon={<StartIcon />}
                        onClick={() => handleGerenciar(evento)}
                    >
                        Gerenciar
                    </NeonButton>
                    <Tooltip title="Editar">
                        <IconButton
                            onClick={() => handleOpenDialog(evento)}
                            sx={{ border: '1px solid rgba(0,212,255,0.1)', borderRadius: 2 }}
                        >
                            <EditIcon fontSize="small" sx={{ color: '#00D4FF' }} />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="Excluir">
                        <IconButton
                            onClick={() => handleDelete(evento.id)}
                            sx={{ border: '1px solid rgba(255, 51, 102, 0.1)', borderRadius: 2 }}
                        >
                            <DeleteIcon fontSize="small" sx={{ color: '#FF3366' }} />
                        </IconButton>
                    </Tooltip>
                </Box>
            </Box>
        </GlassCard>
    );
};

export default EventCard;
