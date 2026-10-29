import React, { useCallback, useEffect, useState } from 'react';
import { Badge, Box, Button, Divider, IconButton, Popover, Stack, Tooltip, Typography } from '@mui/material';
import { Notifications as BellIcon, NotificationsNone as BellEmptyIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';

const COR = { critical: '#FF3366', warning: '#FFB800', info: '#00D4FF' };
const INTERVALO_MS = 60000;

/**
 * Uma consulta só para todos os sinos da aba (o do celular e o do menu ficam montados juntos:
 * eram duas consultas a cada minuto) e nenhuma com a aba escondida — atualiza ao voltar.
 */
const sinos = new Set(); // setters dos sinos montados
let estado = { itens: [], naoLidas: 0 };
let timer = null;

async function carregarTodos() {
    if (document.hidden) return;
    try {
        const resp = await api.get('/notificacoes', { params: { limit: 30 }, hideDefaultError: true });
        estado = { itens: resp.data?.data || [], naoLidas: resp.data?.nao_lidas || 0 };
        sinos.forEach(set => set(estado));
    } catch {
        /* sem evento ativo ou sem permissão: sino vazio */
    }
}

const aoVoltarParaAba = () => { if (!document.hidden) carregarTodos(); };

function inscrever(set) {
    sinos.add(set);
    set(estado);
    if (sinos.size === 1) {
        carregarTodos();
        timer = setInterval(carregarTodos, INTERVALO_MS);
        window.addEventListener('a2:notificacoes-atualizadas', carregarTodos);
        document.addEventListener('visibilitychange', aoVoltarParaAba);
    }
    return () => {
        sinos.delete(set);
        if (sinos.size === 0) {
            clearInterval(timer);
            timer = null;
            window.removeEventListener('a2:notificacoes-atualizadas', carregarTodos);
            document.removeEventListener('visibilitychange', aoVoltarParaAba);
        }
    };
}

/**
 * Sino de notificações do evento (vencimento de documentos e outros avisos persistentes).
 */
const NotificationBell = ({ color = '#00D4FF' }) => {
    const navigate = useNavigate();
    const [ancora, setAncora] = useState(null);
    const [{ itens, naoLidas }, setEstadoSino] = useState(estado);

    const carregar = useCallback(() => carregarTodos(), []);

    useEffect(() => inscrever(setEstadoSino), []);

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
