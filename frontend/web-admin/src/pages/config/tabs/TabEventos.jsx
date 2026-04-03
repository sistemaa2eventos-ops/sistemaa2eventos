import React, { useState, useEffect } from 'react';
import { Box, Typography, List, ListItem, ListItemIcon, ListItemText, ListItemSecondaryAction, MenuItem, Select, CircularProgress } from '@mui/material';
import { Event as EventIcon } from '@mui/icons-material';
import api from '../../../services/api';

const TabEventos = () => {
    const [eventos, setEventos] = useState([]);
    const [activeEventoId, setActiveEventoId] = useState(localStorage.getItem('active_evento_id') || '');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchEventos = async () => {
            try {
                const response = await api.get('/eventos');
                setEventos(response.data.data || []);
            } catch (error) {
                console.error('Erro ao carregar eventos:', error);
            } finally {
                setLoading(false);
            }
        };
        fetchEventos();
    }, []);

    const handleSelectEvent = (eventId) => {
        const evento = eventos.find(e => e.id.toString() === eventId.toString());
        if (evento) {
            localStorage.setItem('active_evento_id', evento.id);
            localStorage.setItem('active_evento_nome', evento.nome);
            setActiveEventoId(evento.id);
            // Hard refresh para cascatear o novo active_evento_id em todo o frontend
            window.location.reload();
        }
    };

    if (loading) return <CircularProgress color="secondary" />;

    return (
        <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
                Selecione o evento ativo na sessão atual. Todas as consultas, inscrições, catracas e crachás orbitarão em torno deste evento selecionado.
            </Typography>

            <List disablePadding>
                <ListItem sx={{ px: 0, py: 2 }}>
                    <ListItemIcon sx={{ color: 'primary.main', minWidth: 48 }}>
                        <EventIcon />
                    </ListItemIcon>
                    <ListItemText
                        primary="Evento Ativo Global"
                        secondary="Contexto de dados para a interface administrativa."
                        primaryTypographyProps={{ fontWeight: 600, color: '#fff' }}
                        secondaryTypographyProps={{ fontSize: '0.75rem', color: 'text.secondary' }}
                    />
                    <ListItemSecondaryAction>
                        <Select
                            size="small"
                            value={activeEventoId}
                            onChange={(e) => handleSelectEvent(e.target.value)}
                            displayEmpty
                            sx={{ minWidth: 200, color: '#00D4FF', '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(0, 212, 255, 0.4)' } }}
                        >
                            <MenuItem value="" disabled>-- Selecione um Evento --</MenuItem>
                            {eventos.map(ev => (
                                <MenuItem key={ev.id} value={ev.id}>{ev.nome}</MenuItem>
                            ))}
                        </Select>
                    </ListItemSecondaryAction>
                </ListItem>
            </List>
        </Box>
    );
};

export default TabEventos;
