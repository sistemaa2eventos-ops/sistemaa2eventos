import React, { useCallback, useEffect, useState } from 'react';
import {
    Box, Stack, Typography, Button, Chip, IconButton, Tooltip, TextField, Dialog, DialogTitle,
    DialogContent, DialogActions, Alert, CircularProgress
} from '@mui/material';
import { Add as AddIcon, Delete as RevogarIcon, ContentCopy as CopiarIcon, Dns as ServidorIcon } from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import api from '../../services/api';
import GlassCard from '../common/GlassCard';
import { useConfirmacao } from '../../contexts/ConfirmacaoContext';

/**
 * Servidores de IA centrais (PCs com placa de vídeo fora da rede do evento). Só Admin Master.
 * O token aparece uma única vez; no banco fica só o hash.
 */
const ServidoresIaPainel = () => {
    const { enqueueSnackbar } = useSnackbar();
    const confirmar = useConfirmacao();
    const [lista, setLista] = useState(null);
    const [erro, setErro] = useState(null);
    const [novo, setNovo] = useState(null);      // { nome } no formulário
    const [criado, setCriado] = useState(null);  // { nome, token } recém-criado
    const [salvando, setSalvando] = useState(false);

    const carregar = useCallback(async () => {
        try {
            const { data } = await api.get('/ia-servidores', { hideDefaultError: true });
            setLista(data.data || []);
            setErro(null);
        } catch (err) {
            if (err.response?.status === 403 || err.response?.status === 401) { setLista(null); setErro('sem_permissao'); return; }
            setErro(err.response?.data?.error || 'Não foi possível carregar os servidores de IA.');
        }
    }, []);

    // Atualiza a cada 15 s; sem permissão (não é Admin Master), para de consultar
    useEffect(() => {
        if (erro === 'sem_permissao') return undefined;
        carregar();
        const t = setInterval(carregar, 15000);
        return () => clearInterval(t);
    }, [carregar, erro]);

    const criar = async () => {
        setSalvando(true);
        try {
            const { data } = await api.post('/ia-servidores', { nome: novo?.nome || 'Servidor de IA' });
            setCriado(data.data);
            setNovo(null);
            carregar();
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Não foi possível cadastrar o servidor.', { variant: 'error' });
        } finally {
            setSalvando(false);
        }
    };

    const revogar = async (s) => {
        if (!(await confirmar({
            titulo: 'Revogar servidor de IA',
            mensagem: `"${s.nome}" é desconectado na hora e o token deixa de valer. Os eventos passam para outro servidor ou para o PC do evento.`,
            textoConfirmar: 'Revogar'
        }))) return;
        try {
            await api.delete(`/ia-servidores/${s.id}`);
            enqueueSnackbar(`"${s.nome}" revogado.`, { variant: 'success' });
            carregar();
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Não foi possível revogar.', { variant: 'error' });
        }
    };

    if (erro === 'sem_permissao') return null; // só o Admin Master gerencia
    const ativos = (lista || []).filter(s => s.ativo);

    return (
        <GlassCard sx={{ p: { xs: 2, md: 2.5 }, mt: 2 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="space-between" alignItems={{ sm: 'center' }} sx={{ mb: 1.5 }}>
                <Box>
                    <Typography variant="h6" fontWeight={700}>Servidores de IA</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 640 }}>
                        Computadores com placa de vídeo fora do evento que fazem o reconhecimento. Eles se conectam à nuvem por conta própria (nenhuma porta aberta). Em cada evento, escolha &ldquo;Servidor de IA central&rdquo; em Câmeras.
                    </Typography>
                </Box>
                <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setNovo({ nome: '' })} sx={{ whiteSpace: 'nowrap' }}>
                    Novo servidor
                </Button>
            </Stack>

            {erro && <Alert severity="warning" sx={{ mb: 1.5 }}>{erro}</Alert>}
            {!lista && !erro && <CircularProgress size={22} />}
            {lista && ativos.length === 0 && (
                <Typography variant="body2" color="text.secondary">Nenhum servidor cadastrado. Os eventos reconhecem no próprio PC.</Typography>
            )}

            <Stack spacing={1}>
                {ativos.map((s) => (
                    <Stack key={s.id} direction="row" spacing={1.5} alignItems="center" useFlexGap flexWrap="wrap"
                        sx={{ p: 1.25, borderRadius: 1.5, border: '1px solid rgba(255,255,255,0.08)' }}>
                        <ServidorIcon sx={{ color: s.online ? '#00FF88' : 'rgba(255,255,255,0.4)' }} />
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                            <Typography fontWeight={700} noWrap>{s.nome}</Typography>
                            <Typography variant="caption" color="text.secondary">
                                {s.online
                                    ? `${s.online.info?.hardware || 'hardware não informado'} · ${s.online.eventos} evento(s) em atendimento · ${s.online.rostos_atendidos} rosto(s) reconhecido(s)`
                                    : `Último contato: ${s.ultimo_contato ? new Date(s.ultimo_contato).toLocaleString('pt-BR') : 'nunca'}`}
                            </Typography>
                        </Box>
                        <Chip size="small" variant="outlined" color={s.online ? 'success' : 'default'} label={s.online ? 'Conectado' : 'Desconectado'} sx={{ fontWeight: 700 }} />
                        <Tooltip title="Revogar (desconecta e invalida o token)">
                            <IconButton size="small" onClick={() => revogar(s)} aria-label={`Revogar ${s.nome}`}><RevogarIcon fontSize="small" /></IconButton>
                        </Tooltip>
                    </Stack>
                ))}
            </Stack>

            <Dialog open={!!novo} onClose={() => !salvando && setNovo(null)} fullWidth maxWidth="xs">
                <DialogTitle sx={{ fontWeight: 700 }}>Novo servidor de IA</DialogTitle>
                <DialogContent>
                    <TextField id="servidor-ia-nome" autoFocus fullWidth size="small" label="Nome do servidor" sx={{ mt: 1 }}
                        placeholder="Ex.: PC da casa (RTX 5060)" value={novo?.nome || ''}
                        onChange={(e) => setNovo({ nome: e.target.value })} />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setNovo(null)} disabled={salvando}>Cancelar</Button>
                    <Button variant="contained" onClick={criar} disabled={salvando}>Gerar token</Button>
                </DialogActions>
            </Dialog>

            <Dialog open={!!criado} onClose={() => setCriado(null)} fullWidth maxWidth="sm">
                <DialogTitle sx={{ fontWeight: 700 }}>Token de &ldquo;{criado?.nome}&rdquo;</DialogTitle>
                <DialogContent>
                    <Alert severity="warning" sx={{ mb: 2 }}>
                        Este token aparece só agora. Copie e guarde: quem tiver o token recebe os cadastrados dos eventos que o servidor atender.
                    </Alert>
                    <Stack direction="row" spacing={1} alignItems="center">
                        <TextField id="servidor-ia-token" fullWidth size="small" value={criado?.token || ''} InputProps={{ readOnly: true, sx: { fontFamily: 'monospace', fontSize: '0.8rem' } }} />
                        <Tooltip title="Copiar">
                            <IconButton onClick={() => { navigator.clipboard.writeText(criado?.token || ''); enqueueSnackbar('Token copiado.', { variant: 'success' }); }}><CopiarIcon /></IconButton>
                        </Tooltip>
                    </Stack>
                    <Typography variant="body2" sx={{ mt: 2, fontWeight: 700 }}>No computador do servidor:</Typography>
                    <Typography component="ol" variant="body2" color="text.secondary" sx={{ pl: 2.5, mt: 0.5 }}>
                        <li>Copie o projeto e prepare o motor de IA (backend\microservice-face-python, venv-ia).</li>
                        <li>Em backend\ia-servidor, copie .env.example para .env e cole o token em SERVIDOR_TOKEN.</li>
                        <li>Dê dois cliques em ligar-servidor-ia.bat e mantenha a janela aberta.</li>
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button variant="contained" onClick={() => setCriado(null)}>Já guardei o token</Button>
                </DialogActions>
            </Dialog>
        </GlassCard>
    );
};

export default ServidoresIaPainel;
