import React, { useState } from 'react';
import {
    Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton,
    Stack, TextField, Tooltip, Typography
} from '@mui/material';
import { Add as AddIcon, ContentCopy as CopyIcon, Delete as DeleteIcon, Hub as AgentIcon } from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import api from '../../services/api';
import { useConfirmacao } from '../../contexts/ConfirmacaoContext';

import { botaoSecundario } from '../../styles/tokens';
const CYAN = '#00D4FF';

/**
 * Agentes locais: programa instalado num computador da rede do evento que liga
 * os leitores faciais ao servidor na nuvem (cadastro de faces, configuração, snapshot).
 * @param {{ agentes: Array, onChange: () => void }} props
 */
const AgentesLocais = ({ agentes = [], onChange }) => {
    const confirmar = useConfirmacao();
    const { enqueueSnackbar } = useSnackbar();
    const [novoAberto, setNovoAberto] = useState(false);
    const [nome, setNome] = useState('');
    const [criado, setCriado] = useState(null);
    const [salvando, setSalvando] = useState(false);

    const criar = async () => {
        if (!nome.trim()) return;
        setSalvando(true);
        try {
            const resp = await api.post('/agentes', { nome: nome.trim() });
            setCriado(resp.data?.data);
            onChange?.();
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Erro ao criar agente.', { variant: 'error' });
        } finally {
            setSalvando(false);
        }
    };

    const desativar = async (agente) => {
        if (!(await confirmar({ titulo: 'Desativar agente', mensagem: `Desativar o agente "${agente.nome}"? O token dele deixa de funcionar.`, textoConfirmar: 'Desativar' }))) return;
        try {
            await api.delete(`/agentes/${agente.id}`);
            enqueueSnackbar('Agente desativado.', { variant: 'success' });
            onChange?.();
        } catch {
            enqueueSnackbar('Erro ao desativar agente.', { variant: 'error' });
        }
    };

    const fechar = () => { setNovoAberto(false); setCriado(null); setNome(''); };
    const copiar = (texto) => { navigator.clipboard.writeText(texto); enqueueSnackbar('Copiado!', { variant: 'success', autoHideDuration: 1500 }); };
    const envExemplo = criado ? `VPS_URL=${(import.meta.env.VITE_API_URL || window.location.origin).replace(/\/api$/, '')}\nAGENT_TOKEN=${criado.token}\nAGENT_NAME=${criado.nome}` : '';

    const ativos = agentes.filter(a => a.ativo !== false);

    return (
        <Box sx={{ mb: 3, p: 2, borderRadius: 1.5, border: `1px solid ${CYAN}33`, bgcolor: 'rgba(0,212,255,0.03)' }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: ativos.length ? 1.5 : 0 }}>
                <Stack direction="row" spacing={1} alignItems="center">
                    <AgentIcon sx={{ color: CYAN }} />
                    <Box>
                        <Typography sx={{ color: '#FFFFFF', fontWeight: 700 }}>Agentes locais</Typography>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.55)' }}>
                            Necessário quando o servidor está na nuvem: liga os leitores da rede do evento ao sistema.
                        </Typography>
                    </Box>
                </Stack>
                <Button size="small" startIcon={<AddIcon />} onClick={() => setNovoAberto(true)} sx={{ color: CYAN }}>Novo agente</Button>
            </Stack>

            <Stack spacing={1}>
                {ativos.map(a => (
                    <Stack key={a.id} direction="row" spacing={1.5} alignItems="center"
                        sx={{ p: 1, borderRadius: 1.5, bgcolor: 'rgba(255,255,255,0.03)' }}>
                        <Chip size="small" label={a.conectado ? 'CONECTADO' : 'DESCONECTADO'}
                            sx={{ fontWeight: 700, bgcolor: a.conectado ? 'rgba(0,255,136,0.15)' : 'rgba(255,51,102,0.15)', color: a.conectado ? '#00FF88' : '#FF3366' }} />
                        <Typography sx={{ color: '#FFFFFF', fontWeight: 700, flex: 1 }}>{a.nome}</Typography>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.55)' }}>
                            {a.dispositivos?.length ? `Leitores: ${a.dispositivos.map(d => d.nome).join(', ')}` : 'Nenhum leitor vinculado'}
                            {a.last_connected_at && ` · última conexão ${new Date(a.last_connected_at).toLocaleString('pt-BR')}`}
                        </Typography>
                        <Tooltip title="Desativar agente">
                            <IconButton size="small" onClick={() => desativar(a)} sx={{ color: '#FF3366' }}><DeleteIcon fontSize="small" /></IconButton>
                        </Tooltip>
                    </Stack>
                ))}
            </Stack>

            <Dialog open={novoAberto} onClose={fechar} maxWidth="sm" fullWidth>
                <DialogTitle sx={{ color: CYAN, fontWeight: 700 }}>Novo agente local</DialogTitle>
                <DialogContent>
                    {!criado ? (
                        <TextField autoFocus fullWidth size="small" label="Nome (ex.: notebook portaria)" value={nome}
                            onChange={(e) => setNome(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && criar()} sx={{ mt: 1 }} />
                    ) : (
                        <Stack spacing={2} sx={{ mt: 1 }}>
                            <Alert severity="warning">
                                Copie agora: o token é exibido <b>uma única vez</b>.
                            </Alert>
                            <Box sx={{ position: 'relative', p: 1.5, borderRadius: 1, bgcolor: 'rgba(0,0,0,0.4)', fontFamily: '"Inter", sans-serif', fontSize: '0.75rem', color: '#FFFFFF', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                                {envExemplo}
                                <IconButton size="small" onClick={() => copiar(envExemplo)} sx={{ position: 'absolute', top: 4, right: 4, color: CYAN }}>
                                    <CopyIcon fontSize="small" />
                                </IconButton>
                            </Box>
                            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.75)' }}>
                                No computador da rede do evento (com Node.js 18+): copie a pasta <code>backend/agent-local</code>,
                                salve o texto acima no arquivo <code>.env</code>, rode <code>npm install</code> e depois <code>npm start</code>.
                                Em seguida, edite cada leitor e escolha este agente em <b>Conexão</b>.
                            </Typography>
                        </Stack>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button variant="outlined" onClick={fechar} sx={botaoSecundario}>{criado ? 'Concluir' : 'Cancelar'}</Button>
                    {!criado && (
                        <Button onClick={criar} variant="contained" disabled={salvando || !nome.trim()} sx={{ background: CYAN, color: '#000000', fontWeight: 700 }}>
                            Gerar token
                        </Button>
                    )}
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default AgentesLocais;
