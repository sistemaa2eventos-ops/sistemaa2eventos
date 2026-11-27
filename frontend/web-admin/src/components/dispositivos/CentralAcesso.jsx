import React, { useEffect, useState } from 'react';
import {
    Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
    FormControlLabel, Radio, RadioGroup, Typography, IconButton, Tooltip
} from '@mui/material';
import { ContentCopy as CopyIcon } from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import api from '../../services/api';
import { useConfirmacao } from '../../contexts/ConfirmacaoContext';
import { botaoSecundario, cores } from '../../styles/tokens';

const OPCOES = [
    { valor: 'local', titulo: 'Só este PC', texto: 'A Central abre apenas no próprio PC do evento. Mais seguro.' },
    { valor: 'rede', titulo: 'Rede local do evento', texto: 'Outros computadores da mesma rede abrem a Central (pedem a chave de acesso). Use quando a sala de monitoramento tem outro computador.' },
    { valor: 'tailscale', titulo: 'Tailscale (acesso remoto)', texto: 'Este PC e quem estiver na rede virtual do Tailscale (operador fora do local). O Tailscale precisa estar instalado e conectado neste PC.' }
];

const ORIGEM = { painel: 'escolhido no painel', env: 'definido no arquivo .env do PC', padrao: 'padrão' };

/**
 * Quem pode abrir a Central de Monitoramento do PC do evento. A escolha é aplicada na hora e fica
 * gravada no próprio PC (vale também sem internet).
 */
const CentralAcesso = ({ agente, onClose }) => {
    const { enqueueSnackbar } = useSnackbar();
    const confirmar = useConfirmacao();
    const [status, setStatus] = useState(null);
    const [escolha, setEscolha] = useState('local');
    const [erro, setErro] = useState(null);
    const [salvando, setSalvando] = useState(false);
    const [chave, setChave] = useState(null);
    const [buscandoChave, setBuscandoChave] = useState(false);

    useEffect(() => {
        setChave(null); // a chave não fica na tela de uma abertura para outra
        if (!agente) return;
        setStatus(null);
        setErro(null);
        api.get(`/agentes/${agente.id}/central`, { hideDefaultError: true })
            .then(({ data }) => { setStatus(data?.data); setEscolha(data?.data?.acesso || 'local'); })
            .catch(err => setErro(err.response?.data?.error || 'Não deu para ler a Central deste PC.'));
    }, [agente]);

    const salvar = async () => {
        if (escolha !== 'local' && !(await confirmar({
            titulo: 'Abrir a Central',
            mensagem: escolha === 'rede'
                ? 'Outros computadores da rede do evento poderão abrir a Central (com a chave de acesso) e ver as câmeras ao vivo. Continuar?'
                : 'Quem estiver na rede do Tailscale poderá abrir a Central (com a chave de acesso) e ver as câmeras ao vivo. Continuar?',
            textoConfirmar: 'Abrir'
        }))) return;
        setSalvando(true);
        try {
            const { data } = await api.put(`/agentes/${agente.id}/central`, { acesso: escolha }, { hideDefaultError: true, timeout: 30000 });
            setStatus(data?.data);
            enqueueSnackbar('Acesso à Central atualizado no PC do evento.', { variant: 'success' });
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Falha ao atualizar a Central.', { variant: 'error' });
        } finally {
            setSalvando(false);
        }
    };

    const pedirChave = async (nova) => {
        if (nova && !(await confirmar({
            titulo: 'Gerar nova chave',
            mensagem: 'A chave atual deixa de funcionar e quem está com a Central aberta em outro computador sai na hora. Só entra quem receber a chave nova. Continuar?',
            textoConfirmar: 'Gerar nova chave'
        }))) return;
        setBuscandoChave(true);
        try {
            const { data } = await api.post(`/agentes/${agente.id}/central/chave`, { nova }, { hideDefaultError: true });
            setChave(data?.data?.chave || null);
            if (nova) enqueueSnackbar('Chave nova gerada. Envie ao operador por um canal seguro.', { variant: 'success' });
        } catch (err) {
            enqueueSnackbar(err.response?.status === 403 ? 'Só o administrador vê e troca a chave.' : (err.response?.data?.error || 'Falha ao obter a chave.'), { variant: 'error' });
        } finally {
            setBuscandoChave(false);
        }
    };

    const copiar = (t) => { navigator.clipboard?.writeText(t); enqueueSnackbar('Copiado!', { variant: 'success', autoHideDuration: 1500 }); };

    return (
        <Dialog open={!!agente} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle sx={{ fontWeight: 700 }}>Central de Monitoramento: {agente?.nome}</DialogTitle>
            <DialogContent dividers>
                {!status && !erro && <Box sx={{ py: 3, textAlign: 'center' }}><CircularProgress size={26} /></Box>}
                {erro && <Alert severity="error">{erro}</Alert>}
                {status && (
                    <>
                        <Typography variant="body2" sx={{ color: cores.textoSuave, mb: 1.5 }}>
                            Quem pode abrir a Central (vídeo ao vivo direto do PC do evento, sem passar pela internet).
                            Hoje: <b>{OPCOES.find(o => o.valor === status.acesso)?.titulo}</b> ({ORIGEM[status.origem] || status.origem}).
                        </Typography>
                        <RadioGroup value={escolha} onChange={e => setEscolha(e.target.value)}>
                            {OPCOES.map(o => (
                                <FormControlLabel key={o.valor} value={o.valor} control={<Radio size="small" />} sx={{ alignItems: 'flex-start', mb: 1 }}
                                    label={<Box sx={{ pt: 0.75 }}>
                                        <Typography variant="body2" sx={{ fontWeight: 700 }}>{o.titulo}</Typography>
                                        <Typography variant="caption" sx={{ color: cores.textoSecundario }}>{o.texto}</Typography>
                                    </Box>} />
                            ))}
                        </RadioGroup>
                        {escolha === 'tailscale' && !status.tailscale_conectado && (
                            <Alert severity="warning" sx={{ mb: 1.5 }}>
                                O Tailscale não está conectado neste PC. Pode salvar: a Central passa a atender por ele assim que conectar (o PC confere a cada minuto).
                            </Alert>
                        )}
                        <Typography variant="caption" sx={{ color: cores.textoSecundario, display: 'block', mb: 0.5 }}>Endereços para abrir agora:</Typography>
                        {status.enderecos?.map(e => (
                            <Box key={e} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <Typography variant="body2" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{e}</Typography>
                                <Tooltip title="Copiar"><IconButton size="small" onClick={() => copiar(e)}><CopyIcon sx={{ fontSize: 16 }} /></IconButton></Tooltip>
                            </Box>
                        ))}
                        <Box sx={{ mt: 2, pt: 1.5, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                            <Typography variant="body2" sx={{ fontWeight: 700 }}>Chave de acesso</Typography>
                            <Typography variant="caption" sx={{ color: cores.textoSecundario, display: 'block', mb: 1 }}>
                                Fora do próprio PC, a Central pede esta chave (no PC do evento, o abrir-central.bat entra sozinho).
                                Envie só por canal seguro; a entrada vale 12 horas em cada navegador.
                            </Typography>
                            {agente?.central_chave_pelo_painel ? (
                                <>
                                    {chave && (
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, p: 1, mb: 1, borderRadius: 1, bgcolor: 'rgba(0,0,0,0.35)' }}>
                                            <Typography variant="body2" sx={{ fontFamily: 'monospace', wordBreak: 'break-all', flex: 1 }}>{chave}</Typography>
                                            <Tooltip title="Copiar chave"><IconButton size="small" onClick={() => copiar(chave)} aria-label="Copiar chave"><CopyIcon sx={{ fontSize: 16 }} /></IconButton></Tooltip>
                                        </Box>
                                    )}
                                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                                        <Button size="small" variant="outlined" disabled={buscandoChave} onClick={() => (chave ? setChave(null) : pedirChave(false))}>
                                            {chave ? 'Esconder chave' : 'Mostrar chave'}
                                        </Button>
                                        <Button size="small" variant="outlined" color="warning" disabled={buscandoChave} onClick={() => pedirChave(true)}>
                                            Gerar nova chave
                                        </Button>
                                    </Box>
                                </>
                            ) : (
                                <Typography variant="caption" sx={{ color: cores.alerta }}>
                                    Agente antigo: no PC do evento, rode ligar-ia-facial.bat para ver e trocar a chave por aqui.
                                </Typography>
                            )}
                        </Box>
                    </>
                )}
            </DialogContent>
            <DialogActions>
                <Button variant="outlined" onClick={onClose} sx={botaoSecundario}>Fechar</Button>
                {status && (
                    <Button variant="contained" onClick={salvar} disabled={salvando || escolha === status.acesso}>
                        {salvando ? 'Aplicando...' : 'Aplicar'}
                    </Button>
                )}
            </DialogActions>
        </Dialog>
    );
};

export default CentralAcesso;
