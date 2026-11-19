import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Typography, Stack, TextField, Collapse, Button, Chip } from '@mui/material';
import { Dns as DnsIcon, Save as SaveIcon } from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import api from '../../services/api';
import GlassCard from '../common/GlassCard';
import NeonButton from '../common/NeonButton';
import { cores } from '../../styles/tokens';

const ORIGEM = {
    evento: 'endereço deste evento',
    padrao: 'padrão geral',
    servidor: 'configuração do servidor (.env)'
};

const texto = (e) => (e?.host ? `${e.host}${e.porta ? `:${e.porta}` : ''}` : '');

/**
 * Endereço que os LEITORES usam para chamar o servidor (modo online). Cada evento pode ter uma rede
 * diferente: PC do evento num IP local (ex.: 192.168.1.129:3001) ou a VPS (leitores.nzt.app.br:80).
 * O botão "Config online" de cada leitor grava este endereço no equipamento.
 */
const ServidorLeitores = ({ onSalvo }) => {
    const { enqueueSnackbar } = useSnackbar();
    const [dados, setDados] = useState(null);
    const [evento, setEvento] = useState({ host: '', porta: '' });
    const [padrao, setPadrao] = useState({ host: '', porta: '' });
    const [verPadrao, setVerPadrao] = useState(false);
    const [salvando, setSalvando] = useState(false);
    // Função do pai guardada em ref: trocar a função a cada render não pode recarregar o cartão em laço
    const onSalvoRef = useRef(onSalvo);
    onSalvoRef.current = onSalvo;

    const carregar = useCallback(async () => {
        try {
            const { data } = await api.get('/dispositivos/servidor-leitores', { hideDefaultError: true });
            const d = data?.data;
            setDados(d);
            setEvento({ host: d?.evento?.host || '', porta: d?.evento?.porta ?? '' });
            setPadrao({ host: d?.padrao?.host || '', porta: d?.padrao?.porta ?? '' });
            onSalvoRef.current?.(d);
        } catch {
            setDados(null); // sem permissão ou API antiga: não mostra o cartão
        }
    }, []);

    useEffect(() => { carregar(); }, [carregar]);

    if (!dados) return null;

    const salvar = async () => {
        setSalvando(true);
        try {
            const corpo = { evento: { host: evento.host.trim(), porta: evento.porta === '' ? null : Number(evento.porta) } };
            if (verPadrao) corpo.padrao = { host: padrao.host.trim(), porta: padrao.porta === '' ? null : Number(padrao.porta) };
            const { data } = await api.put('/dispositivos/servidor-leitores', corpo, { hideDefaultError: true });
            const d = data?.data;
            setDados(d);
            onSalvoRef.current?.(d);
            enqueueSnackbar(d?.efetivo
                ? `Endereço salvo. Use "Config online" em cada leitor para gravar ${texto(d.efetivo)} no equipamento.`
                : 'Endereço apagado.', { variant: 'success' });
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Falha ao salvar o endereço.', { variant: 'error' });
        } finally {
            setSalvando(false);
        }
    };

    const mudou = texto({ host: evento.host.trim(), porta: evento.porta }) !== texto(dados.evento)
        || (verPadrao && texto({ host: padrao.host.trim(), porta: padrao.porta }) !== texto(dados.padrao));

    return (
        <GlassCard sx={{ p: { xs: 2, sm: 2.5 }, mb: 3 }}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={{ xs: 2, md: 3 }} alignItems={{ md: 'flex-start' }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700, color: cores.textoForte, display: 'flex', alignItems: 'center', gap: 1 }}>
                        <DnsIcon sx={{ color: cores.primaria }} /> Endereço do servidor para os leitores
                    </Typography>
                    <Typography variant="body2" sx={{ color: cores.textoSecundario }}>
                        Para onde os leitores perguntam se liberam a pessoa. Com o PC do evento: IP dele na rede local e porta 3001
                        (ex.: 192.168.1.129 e 3001). Com a VPS: leitores.nzt.app.br e porta 80.
                        Depois de salvar, clique em “Config online” em cada leitor.
                    </Typography>
                    <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                        <Typography variant="caption" sx={{ color: cores.textoSecundario }}>Em uso agora:</Typography>
                        {dados.efetivo
                            ? <Chip size="small" label={`${texto(dados.efetivo)} · ${ORIGEM[dados.origem] || ''}`} sx={{ fontSize: '0.75rem' }} />
                            : <Chip size="small" color="warning" label="nenhum: o leitor usará o endereço do navegador" sx={{ fontSize: '0.75rem' }} />}
                    </Box>
                </Box>
                <Stack spacing={1.5} sx={{ width: { xs: '100%', md: 360 } }}>
                    <Stack direction="row" spacing={1}>
                        <TextField size="small" label="Deste evento: IP ou domínio" value={evento.host} fullWidth
                            placeholder={dados.padrao?.host || dados.servidor?.host || '192.168.1.129'}
                            onChange={e => setEvento(v => ({ ...v, host: e.target.value }))}
                            inputProps={{ 'aria-label': 'Endereço do servidor para os leitores deste evento' }} />
                        <TextField size="small" label="Porta" type="number" value={evento.porta} sx={{ width: 100 }}
                            placeholder={String(dados.padrao?.porta || dados.servidor?.porta || 3001)}
                            onChange={e => setEvento(v => ({ ...v, porta: e.target.value }))}
                            inputProps={{ min: 1, max: 65535, 'aria-label': 'Porta do servidor para os leitores deste evento' }} />
                    </Stack>
                    <Collapse in={verPadrao}>
                        <Stack direction="row" spacing={1}>
                            <TextField size="small" label="Padrão (eventos sem endereço)" value={padrao.host} fullWidth
                                placeholder={dados.servidor?.host || ''}
                                onChange={e => setPadrao(v => ({ ...v, host: e.target.value }))} />
                            <TextField size="small" label="Porta" type="number" value={padrao.porta} sx={{ width: 100 }}
                                onChange={e => setPadrao(v => ({ ...v, porta: e.target.value }))}
                                inputProps={{ min: 1, max: 65535 }} />
                        </Stack>
                    </Collapse>
                    <Stack direction="row" spacing={1} justifyContent="space-between" alignItems="center">
                        <Button size="small" onClick={() => setVerPadrao(v => !v)} sx={{ color: cores.textoSecundario, fontSize: '0.75rem' }}>
                            {verPadrao ? 'Esconder padrão geral' : 'Padrão geral'}
                        </Button>
                        <NeonButton startIcon={<SaveIcon />} onClick={salvar} loading={salvando} disabled={!mudou}>Salvar</NeonButton>
                    </Stack>
                    <Typography variant="caption" sx={{ color: cores.textoSecundario }}>
                        Em branco: usa o padrão geral e, sem ele, a configuração do servidor.
                    </Typography>
                </Stack>
            </Stack>
        </GlassCard>
    );
};

export default ServidorLeitores;
