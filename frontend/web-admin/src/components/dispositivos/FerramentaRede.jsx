import React, { useState } from 'react';
import { Box, Typography, Stack, TextField, Collapse, Chip, Alert } from '@mui/material';
import { Lan as LanIcon, ExpandMore as ExpandMoreIcon, ExpandLess as ExpandLessIcon } from '@mui/icons-material';
import api from '../../services/api';
import GlassCard from '../common/GlassCard';
import NeonButton from '../common/NeonButton';
import { cores } from '../../styles/tokens';

// Portas mais usadas no evento (clique para preencher)
const ATALHOS = [
    { rotulo: 'Leitor facial', portas: '80' },
    { rotulo: 'Câmera (vídeo RTSP)', portas: '554, 80' },
    { rotulo: 'Servidor local', portas: '3001' },
    { rotulo: 'Roteador', portas: '80, 443' }
];

const COR = { ok: '#00FF88', erro: '#FF3366' };

/**
 * Ferramenta de rede: testa, A PARTIR DO PC DO EVENTO, se um IP responde (ping) e se as portas abrem.
 * Substitui o Prompt de Comando da equipe de campo para achar leitor, câmera ou roteador.
 */
const FerramentaRede = () => {
    const [aberto, setAberto] = useState(false);
    const [host, setHost] = useState('');
    const [portas, setPortas] = useState('80');
    const [testando, setTestando] = useState(false);
    const [resultado, setResultado] = useState(null);
    const [erro, setErro] = useState(null);

    const testar = async () => {
        setTestando(true);
        setErro(null);
        setResultado(null);
        try {
            const { data } = await api.post('/agentes/rede-testar', { host: host.trim(), portas }, { timeout: 30000, hideDefaultError: true });
            setResultado(data?.data);
        } catch (err) {
            setErro(err.response?.data?.error || err.response?.data?.message || 'Falha ao testar a rede.');
        } finally {
            setTestando(false);
        }
    };

    const r = resultado;
    const algumaAberta = r?.portas?.some(p => p.aberta);
    const fechadas = (r?.portas || []).filter(p => !p.aberta).map(p => p.porta);
    const conclusao = !r ? null
        : !r.resolvido ? { sev: 'error', txt: `O nome ${r.host} não foi encontrado na rede do evento.` }
            : algumaAberta && fechadas.length ? { sev: 'warning', txt: `${r.host} está na rede, mas a porta ${fechadas.join(', ')} não abre (serviço desligado ou porta errada).` }
            : algumaAberta || (r.ping?.ok && !r.portas?.length) ? { sev: 'success', txt: `${r.host} está na rede e responde.` }
                : r.ping?.ok ? { sev: 'warning', txt: `${r.host} responde ao ping, mas nenhuma porta testada abre: o equipamento está ligado, mas o serviço não (ou a porta é outra).` }
                    : { sev: 'error', txt: `${r.host} não responde. Confira se está ligado, no cabo/switch do evento e se o IP não mudou.` };

    return (
        <GlassCard sx={{ p: { xs: 2, sm: 2.5 }, mb: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, cursor: 'pointer' }}
                onClick={() => setAberto(v => !v)} role="button" aria-expanded={aberto}>
                <Box sx={{ minWidth: 0 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700, color: cores.textoForte, display: 'flex', alignItems: 'center', gap: 1 }}>
                        <LanIcon sx={{ color: cores.primaria }} /> Testar rede do evento
                    </Typography>
                    <Typography variant="body2" sx={{ color: cores.textoSecundario }}>
                        Descubra se um leitor, câmera ou roteador está na rede, sem Prompt de Comando. O teste sai do PC do evento.
                    </Typography>
                </Box>
                {aberto ? <ExpandLessIcon sx={{ color: cores.textoSecundario }} /> : <ExpandMoreIcon sx={{ color: cores.textoSecundario }} />}
            </Box>

            <Collapse in={aberto}>
                <Stack spacing={1.5} sx={{ mt: 2 }}>
                    <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                        {ATALHOS.map(a => (
                            <Chip key={a.rotulo} size="small" label={`${a.rotulo}: ${a.portas}`} onClick={() => setPortas(a.portas)}
                                variant={portas === a.portas ? 'filled' : 'outlined'} sx={{ fontSize: '0.72rem' }} />
                        ))}
                    </Stack>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                        <TextField size="small" label="IP ou nome" placeholder="192.168.1.64" value={host} fullWidth
                            onChange={e => setHost(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter' && host.trim()) testar(); }}
                            inputProps={{ 'aria-label': 'IP ou nome do equipamento a testar' }} />
                        <TextField size="small" label="Portas" placeholder="80, 554" value={portas}
                            onChange={e => setPortas(e.target.value)} sx={{ width: { xs: '100%', sm: 160 } }}
                            helperText="Até 10, separadas por vírgula" />
                        <NeonButton onClick={testar} loading={testando} disabled={!host.trim()} sx={{ alignSelf: { sm: 'flex-start' }, whiteSpace: 'nowrap' }}>
                            Testar
                        </NeonButton>
                    </Stack>

                    {erro && <Alert severity="error">{erro}</Alert>}
                    {r && (
                        <Box>
                            <Alert severity={conclusao.sev} sx={{ mb: 1 }}>{conclusao.txt}</Alert>
                            <Stack spacing={0.5}>
                                <Linha ok={r.ping?.ok} titulo="Ping" detalhe={r.ping?.ok ? `respondeu${r.ping.ms !== null ? ` em ${r.ping.ms} ms` : ''}` : (r.ping?.erro || 'sem resposta')} />
                                {(r.portas || []).map(p => (
                                    <Linha key={p.porta} ok={p.aberta} titulo={`Porta ${p.porta}`}
                                        detalhe={p.aberta ? `aberta (${p.ms} ms)` : p.erro === 'recusada' ? 'fechada (o equipamento recusou)' : (p.erro || 'sem resposta')} />
                                ))}
                            </Stack>
                            <Typography variant="caption" sx={{ color: cores.textoSecundario, display: 'block', mt: 1 }}>
                                Testado a partir de: {r.pc || (r.origem === 'servidor' ? 'servidor do evento' : 'PC do evento')}{r.ip && r.ip !== r.host ? ` · ${r.host} = ${r.ip}` : ''}.
                                {' '}Alguns equipamentos não respondem ao ping mesmo ligados: vale o resultado das portas.
                            </Typography>
                        </Box>
                    )}
                </Stack>
            </Collapse>
        </GlassCard>
    );
};

const Linha = ({ ok, titulo, detalhe }) => (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: ok ? COR.ok : COR.erro, flexShrink: 0 }} />
        <Typography variant="body2" sx={{ fontWeight: 600, minWidth: 80 }}>{titulo}</Typography>
        <Typography variant="body2" sx={{ color: '#CBD5E1' }}>{detalhe}</Typography>
    </Box>
);

export default FerramentaRede;
