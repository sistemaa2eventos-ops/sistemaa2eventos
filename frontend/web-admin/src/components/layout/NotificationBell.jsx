import React, { useCallback, useEffect, useState } from 'react';
import { Badge, Box, Button, Divider, IconButton, Popover, Stack, Tooltip, Typography } from '@mui/material';
import { Notifications as BellIcon, NotificationsNone as BellEmptyIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';

const COR = { critical: '#FF3366', warning: '#FFB800', info: '#00D4FF' };
const INTERVALO_MS = 60000;

/**
 * Sino de notificações do evento (vencimento de documentos e outros avisos persistentes).
 */
const NotificationBell = ({ color = '#00D4FF' }) => {
    const navigate = useNavigate();
    const [ancora, setAncora] = useState(null);
    const [itens, setItens] = useState([]);
    const [naoLidas, setNaoLidas] = useState(0);

    const carregar = useCallback(async () => {
        try {
            const resp = await api.get('/notificacoes', { params: { limit: 30 }, hideDefaultError: true });
            setItens(resp.data?.data || []);
            setNaoLidas(resp.data?.nao_lidas || 0);
        } catch {
            /* sem evento ativo ou sem permissão: sino vazio */
        }
    }, []);

    useEffect(() => {
        carregar();
        const timer = setInterval(carregar, INTERVALO_MS);
        window.addEventListener('a2:notificacoes-atualizadas', carregar);
        return () => {
            clearInterval(timer);
            window.removeEventListener('a2:notificacoes-atualizadas', carregar);
        };
    }, [carregar]);

    const marcarTodas = async () => {
        await api.patch('/notificacoes/lidas').catch(() => {});
        carregar();
    };

    const abrirItem = async (n) => {
        if (!n.lida_em) await api.patch(`/notificacoes/${n.id}/lida`).catch(() => {});
        setAncora(null);
        carregar();
        if (n.tipo?.startsWith('DOC_')) navigate('/auditoria?aba=vencimentos');
    };

    return (
        <>
            <Tooltip title="Notificações">
                <IconButton onClick={(e) => setAncora(e.currentTarget)} sx={{ color }}>
                    <Badge badgeContent={naoLidas} color="error" max={99}>
                        {naoLidas > 0 ? <BellIcon /> : <BellEmptyIcon />}
                    </Badge>
                </IconButton>
            </Tooltip>
            <Popover
                open={!!ancora}
                anchorEl={ancora}
                onClose={() => setAncora(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                PaperProps={{ sx: { width: 'min(380px, calc(100vw - 24px))', maxHeight: 'min(480px, calc(100dvh - 96px))', background: 'rgba(12,16,28,0.98)', border: '1px solid rgba(0,212,255,0.3)' } }}
            >
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ px: 2, py: 1.5 }}>
                    <Typography sx={{ color: '#FFFFFF', fontWeight: 700 }}>Notificações</Typography>
                    {naoLidas > 0 && <Button size="small" onClick={marcarTodas}>Marcar todas como lidas</Button>}
                </Stack>
                <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)' }} />
                {itens.length === 0 ? (
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)', p: 3, textAlign: 'center' }}>
                        Nenhuma notificação.
                    </Typography>
                ) : itens.map((n) => (
                    <Box key={n.id} onClick={() => abrirItem(n)} sx={{
                        px: 2, py: 1.2, cursor: 'pointer', borderLeft: `3px solid ${COR[n.severidade] || COR.info}`,
                        bgcolor: n.lida_em ? 'transparent' : 'rgba(0,212,255,0.05)', '&:hover': { bgcolor: 'rgba(255,255,255,0.05)' }
                    }}>
                        <Typography variant="body2" sx={{ color: '#FFFFFF', fontWeight: n.lida_em ? 500 : 800 }}>{n.titulo}</Typography>
                        {n.mensagem && <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', display: 'block' }}>{n.mensagem}</Typography>}
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.35)' }}>{new Date(n.created_at).toLocaleString('pt-BR')}</Typography>
                    </Box>
                ))}
            </Popover>
        </>
    );
};

export default NotificationBell;
