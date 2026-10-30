import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Typography, Button, Stack, Alert, LinearProgress, Link, Chip } from '@mui/material';
import { CloudUpload as DriveIcon, OpenInNew as AbrirIcon, CheckCircleOutline as OkIcon, ErrorOutline as ErroIcon } from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../../services/api';
import GlassCard from '../common/GlassCard';
import { cores } from '../../styles/tokens';

/**
 * Cópia dos documentos para o Google Drive: conectar a conta (uma vez), acompanhar e copiar
 * o que já existe. Documentos novos são copiados sozinhos pelo servidor.
 */
const GoogleDriveCard = () => {
    const { enqueueSnackbar } = useSnackbar();
    const location = useLocation();
    const navigate = useNavigate();
    const [st, setSt] = useState(null);
    const [carregando, setCarregando] = useState(true);
    const [acao, setAcao] = useState('');
    const timer = useRef(null);

    const carregar = useCallback(async () => {
        try {
            const { data } = await api.get('/drive/status');
            setSt(data.data);
            return data.data;
        } catch (err) {
            setSt(null);
            return null;
        } finally {
            setCarregando(false);
        }
    }, []);

    // Enquanto "copiar tudo" roda, atualiza a cada 2 s
    const acompanhar = useCallback(() => {
        clearTimeout(timer.current);
        timer.current = setTimeout(async () => {
            const s = await carregar();
            if (s?.progresso?.rodando) acompanhar();
        }, 2000);
    }, [carregar]);

    useEffect(() => {
        carregar().then(s => { if (s?.progresso?.rodando) acompanhar(); });
        return () => clearTimeout(timer.current);
    }, [carregar, acompanhar]);

    // Volta do Google: ?drive=conectado | cancelado | erro&motivo=...
    useEffect(() => {
        const q = new URLSearchParams(location.search);
        const r = q.get('drive');
        if (!r) return;
        if (r === 'conectado') enqueueSnackbar('Google Drive conectado. Os documentos novos serão copiados sozinhos.', { variant: 'success' });
        else if (r === 'cancelado') enqueueSnackbar('Conexão com o Google Drive cancelada.', { variant: 'info' });
        else enqueueSnackbar(`Não foi possível conectar: ${q.get('motivo') || 'tente de novo'}`, { variant: 'error' });
        q.delete('drive'); q.delete('motivo');
        navigate({ search: q.toString() }, { replace: true });
    }, [location.search, enqueueSnackbar, navigate]);

    const conectar = async () => {
        setAcao('conectar');
        try {
            const { data } = await api.post('/drive/conectar');
            window.location.href = data.url;
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Falha ao iniciar a conexão.', { variant: 'error' });
            setAcao('');
        }
    };

    const copiarTudo = async () => {
        setAcao('copiar');
        try {
            const { data } = await api.post('/drive/copiar-tudo');
            enqueueSnackbar(data.data.total ? `Copiando ${data.data.total} documento(s)…` : 'Todos os documentos deste evento já estão no Drive.', { variant: 'info' });
            await carregar();
            acompanhar();
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Falha ao copiar.', { variant: 'error' });
        } finally {
            setAcao('');
        }
    };

    const desconectar = async () => {
        if (!window.confirm('Desconectar o Google Drive? As cópias que já estão lá continuam no Drive; os documentos novos deixam de ser copiados.')) return;
        setAcao('desconectar');
        try {
            await api.post('/drive/desconectar');
            enqueueSnackbar('Google Drive desconectado.', { variant: 'info' });
            await carregar();
        } finally {
            setAcao('');
        }
    };

    const prog = st?.progresso;
    const pct = prog?.total ? Math.round((prog.feitos / prog.total) * 100) : 0;

    return (
        <GlassCard sx={{ p: { xs: 2, sm: 3 } }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                <DriveIcon sx={{ color: cores.primaria }} />
                <Typography variant="h6" sx={{ fontWeight: 700, color: cores.textoForte }}>Cópia dos documentos no Google Drive</Typography>
                {st?.conectado && <Chip size="small" icon={<OkIcon />} label="Conectado" color="success" variant="outlined" />}
            </Box>
            <Typography variant="body2" sx={{ color: cores.textoSecundario, mb: 2 }}>
                Cada documento enviado (link de pré-cadastro, portal da empresa ou painel) é copiado em segundos para a pasta
                <b> NZT - Documentos</b>, separado em Evento / Empresa / Pessoa. O sistema só enxerga essa pasta — nada mais do seu Drive.
            </Typography>

            {carregando && <LinearProgress sx={{ my: 2 }} />}

            {!carregando && st && !st.configurado && (
                <Alert severity="warning">
                    Falta configurar o acesso ao Google no servidor (GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET). Siga o guia
                    <b> docs/GOOGLE_DRIVE.md</b> e depois volte aqui para conectar.
                </Alert>
            )}

            {!carregando && !st && (
                <Alert severity="error">Não foi possível ler a situação do Google Drive. A migração 20261031_google_drive.sql foi aplicada?</Alert>
            )}

            {!carregando && st?.configurado && !st.conectado && (
                <Button variant="contained" startIcon={<DriveIcon />} onClick={conectar} disabled={acao === 'conectar'}>
                    {acao === 'conectar' ? 'Abrindo o Google…' : 'Conectar Google Drive'}
                </Button>
            )}

            {!carregando && st?.conectado && (
                <Stack spacing={2}>
                    <Typography variant="body2" sx={{ color: cores.textoForte }}>
                        Conta: <b>{st.email}</b>
                        {st.pasta_url && (
                            <Link href={st.pasta_url} target="_blank" rel="noopener" sx={{ ml: 1.5, display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                                Abrir pasta no Drive <AbrirIcon sx={{ fontSize: 14 }} />
                            </Link>
                        )}
                    </Typography>

                    {st.ultimo_erro && <Alert severity="error" icon={<ErroIcon />}>{st.ultimo_erro}</Alert>}

                    <Typography variant="body2" sx={{ color: cores.textoSecundario }}>
                        Neste evento: <b style={{ color: cores.textoForte }}>{st.copias?.copiado || 0}</b> documento(s) copiado(s)
                        {st.copias?.erro ? <> • <b style={{ color: cores.erro }}>{st.copias.erro}</b> com erro (o botão abaixo tenta de novo)</> : null}
                    </Typography>
                    {st.erros_recentes?.length > 0 && (
                        <Typography variant="caption" sx={{ color: cores.textoSecundario }}>Último erro: {st.erros_recentes[0]}</Typography>
                    )}

                    {prog?.rodando && (
                        <Box>
                            <Typography variant="caption" sx={{ color: cores.textoSecundario }}>
                                Copiando {prog.feitos} de {prog.total}{prog.erros ? ` • ${prog.erros} com erro` : ''}
                            </Typography>
                            <LinearProgress variant="determinate" value={pct} sx={{ mt: 0.5 }} />
                        </Box>
                    )}

                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                        <Button variant="contained" onClick={copiarTudo} disabled={!!acao || prog?.rodando}>
                            {prog?.rodando ? 'Copiando…' : 'Copiar tudo deste evento'}
                        </Button>
                        <Button variant="outlined" color="inherit" onClick={desconectar} disabled={!!acao}>
                            Desconectar
                        </Button>
                    </Stack>
                </Stack>
            )}
        </GlassCard>
    );
};

export default GoogleDriveCard;
