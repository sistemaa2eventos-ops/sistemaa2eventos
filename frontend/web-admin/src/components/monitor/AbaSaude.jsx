import React, { useMemo, useState } from 'react';
import {
    Box, Button, Chip, Grid, MenuItem, Stack, TextField, Typography
} from '@mui/material';
import { Refresh as RefreshIcon } from '@mui/icons-material';
import GlassCard from '../common/GlassCard';

import { comoRotulo } from '../../utils/formatadores';
import { cores } from '../../styles/tokens';
const COR_STATUS = { online: cores.sucesso, local: cores.alerta, offline: cores.erro, migrado: 'rgba(255,255,255,0.4)', desativado: 'rgba(255,255,255,0.4)' };
const ROTULO_SERVICO = { supabase: 'Banco (Supabase)', postgresql_edge: 'Banco local (Edge)', redis: 'Redis (filas/tempo real)', tempo_real: 'Tempo real (WebSocket)' };
const COR_NIVEL = { error: cores.erro, warn: cores.alerta, info: 'rgba(255,255,255,0.75)', debug: 'rgba(255,255,255,0.45)' };

const Titulo = ({ children }) => (
    <Typography variant="subtitle2" sx={{ color: cores.primaria, fontWeight: 700, mb: 1.5, letterSpacing: 1 }}>{children}</Typography>
);
const Linha = ({ rotulo, valor, cor }) => (
    <Stack direction="row" justifyContent="space-between" sx={{ py: 0.5 }}>
        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.65)' }}>{rotulo}</Typography>
        <Typography variant="body2" sx={{ color: cor || cores.textoForte, fontWeight: 700 }}>{valor}</Typography>
    </Stack>
);

/**
 * Saúde do sistema: serviços, leitores, agentes, fila de faces, servidor e logs recentes.
 */
const AbaSaude = ({ sysStatus, sysPerf, sysLogs = [], sysError, terminais = [], atualizadoEm, onAtualizar }) => {
    const [nivel, setNivel] = useState('todos');

    const leitores = terminais.filter(t => t.tipo === 'terminal_facial');
    const leitoresOnline = leitores.filter(t => t.status === 'online').length;
    const servicos = Object.entries(sysStatus?.services || {}).filter(([k]) => k !== 'sql_server');
    const fila = sysStatus?.fila_leitores || { pendente: 0, erro: 0 };
    const agentes = sysStatus?.tempo_real?.agentes_locais || [];
    const memoriaPct = sysPerf?.os?.uso_memoria_pct;
    const saudeVideo = sysStatus?.saude_video || [];
    // Câmera sem sinal, ou abaixo de 10 fps (vídeo travado), aparece em destaque
    const estadoCamera = (c) => {
        if (!c.conectada) return { rotulo: 'sem sinal', cor: cores.erro };
        if (c.fps < 10) return { rotulo: 'lento', cor: cores.alerta };
        return { rotulo: 'ok', cor: cores.sucesso };
    };

    const logsFiltrados = useMemo(() => {
        const lista = [...sysLogs].reverse();
        if (nivel === 'todos') return lista;
        return lista.filter(l => (l.level || '').toLowerCase() === nivel
            || (nivel === 'error' && /\[ERROR\]/.test(l.message || ''))
            || (nivel === 'warn' && /\[WARN\]/.test(l.message || '')));
    }, [sysLogs, nivel]);

    return (
        <Box>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                <Typography variant="caption" sx={{ color: sysError ? cores.alerta : 'rgba(255,255,255,0.5)' }}>
                    {sysError ? 'Algumas informações não puderam ser carregadas. ' : ''}
                    Atualiza a cada 15 s{atualizadoEm ? ` · última às ${atualizadoEm.toLocaleTimeString('pt-BR')}` : ''}
                </Typography>
                <Button size="small" startIcon={<RefreshIcon />} onClick={onAtualizar} sx={{ color: cores.primaria }}>Atualizar</Button>
            </Stack>

            <Grid container spacing={2.5}>
                <Grid item xs={12} md={4}>
                    <GlassCard sx={{ p: 2.5, height: '100%' }}>
                        <Titulo>Serviços</Titulo>
                        {servicos.length === 0 && <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)' }}>Sem dados</Typography>}
                        {servicos.map(([k, v]) => (
                            <Stack key={k} direction="row" justifyContent="space-between" alignItems="center" sx={{ py: 0.5 }}>
                                <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.75)' }}>{ROTULO_SERVICO[k] || k}</Typography>
                                <Chip size="small" label={comoRotulo(v)}
                                    sx={{ fontWeight: 700, bgcolor: `${COR_STATUS[v] || cores.textoSecundario}22`, color: COR_STATUS[v] || cores.textoSecundario }} />
                            </Stack>
                        ))}
                        <Linha rotulo="Painéis conectados" valor={sysStatus?.tempo_real?.clientes_conectados ?? '—'} />
                    </GlassCard>
                </Grid>

                <Grid item xs={12} md={4}>
                    <GlassCard sx={{ p: 2.5, height: '100%' }}>
                        <Titulo>Leitores e agentes</Titulo>
                        <Linha rotulo="Leitores online" valor={`${leitoresOnline} / ${leitores.length}`}
                            cor={leitores.length && leitoresOnline < leitores.length ? cores.alerta : cores.sucesso} />
                        {leitores.filter(t => t.status !== 'online').map(t => (
                            <Typography key={t.id} variant="caption" sx={{ color: cores.erro, display: 'block' }}>● {t.nome} offline</Typography>
                        ))}
                        <Linha rotulo="Faces aguardando envio" valor={fila.pendente} cor={fila.pendente ? cores.alerta : undefined} />
                        <Linha rotulo="Envios com erro" valor={fila.erro} cor={fila.erro ? cores.erro : undefined} />
                        <Linha rotulo="Agentes locais conectados" valor={agentes.length} />
                        {agentes.map(a => (
                            <Typography key={a} variant="caption" sx={{ color: cores.sucesso, display: 'block' }}>● {a}</Typography>
                        ))}
                    </GlassCard>
                </Grid>

                <Grid item xs={12}>
                    <GlassCard sx={{ p: 2.5 }}>
                        <Titulo>Saúde do vídeo (PC do evento)</Titulo>
                        {saudeVideo.length === 0 && (
                            <Typography variant="body2" sx={{ color: cores.alerta }}>Nenhum PC do evento enviando dados de vídeo.</Typography>
                        )}
                        {saudeVideo.map(a => (
                            <Box key={a.agente_id} sx={{ mb: 2 }}>
                                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
                                    <Typography variant="body2" sx={{ color: cores.textoForte, fontWeight: 700 }}>{a.agente}</Typography>
                                    <Chip size="small" label={a.ok ? `ao vivo · há ${a.idade_s}s` : `sem dados há ${a.idade_s}s`}
                                        sx={{ fontWeight: 700, bgcolor: a.ok ? '#00FF8822' : '#FF336622', color: a.ok ? cores.sucesso : cores.erro }} />
                                </Stack>
                                <Linha rotulo="Motor de IA" valor={a.motor ? 'ligado' : 'desligado'} cor={a.motor ? undefined : cores.erro} />
                                <Linha rotulo="Retransmissor de vídeo" valor={a.retransmissor ? 'ativo' : 'indisponível'} cor={a.retransmissor ? undefined : cores.alerta} />
                                {a.cameras.map(c => {
                                    const est = estadoCamera(c);
                                    return (
                                        <Stack key={c.camera_id || c.nome} direction="row" justifyContent="space-between" alignItems="center" sx={{ py: 0.5 }}>
                                            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.8)' }}>
                                                {c.nome} · {c.resolucao || '—'} · {c.fps.toFixed(1)} fps · {c.reconexoes} reconexões · IA {c.ia_ms.toFixed(0)} ms
                                            </Typography>
                                            <Chip size="small" label={est.rotulo}
                                                sx={{ fontWeight: 700, bgcolor: `${est.cor}22`, color: est.cor }} />
                                        </Stack>
                                    );
                                })}
                            </Box>
                        ))}
                    </GlassCard>
                </Grid>

                <Grid item xs={12} md={4}>
                    <GlassCard sx={{ p: 2.5, height: '100%' }}>
                        <Titulo>Servidor</Titulo>
                        <Linha rotulo="No ar há" valor={sysPerf?.node?.uptime_formatado || '—'} />
                        <Linha rotulo="Memória do processo" valor={sysPerf?.node?.memoria ? `${sysPerf.node.memoria.heap_usado_mb} MB (RSS ${sysPerf.node.memoria.rss_mb} MB)` : '—'} />
                        <Linha rotulo="Memória da máquina" valor={memoriaPct !== undefined ? `${memoriaPct}%` : '—'}
                            cor={memoriaPct >= 90 ? cores.erro : memoriaPct >= 75 ? cores.alerta : undefined} />
                        <Linha rotulo="Última sincronização" valor={sysStatus?.sync?.lastSync ? new Date(sysStatus.sync.lastSync).toLocaleTimeString('pt-BR') : '—'} />
                        <Linha rotulo="Sincronizações pendentes / falhas" valor={`${sysStatus?.sync?.pending ?? 0} / ${sysStatus?.sync?.failed ?? 0}`}
                            cor={sysStatus?.sync?.failed ? cores.erro : undefined} />
                    </GlassCard>
                </Grid>

                <Grid item xs={12}>
                    <GlassCard sx={{ p: 2.5 }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                            <Titulo>Logs recentes</Titulo>
                            <TextField select size="small" value={nivel} onChange={(e) => setNivel(e.target.value)} sx={{ minWidth: 150 }}>
                                <MenuItem value="todos">Todos</MenuItem>
                                <MenuItem value="error">Somente erros</MenuItem>
                                <MenuItem value="warn">Somente avisos</MenuItem>
                            </TextField>
                        </Stack>
                        <Box sx={{ maxHeight: 360, overflowY: 'auto', fontFamily: '"Inter", sans-serif', fontSize: '0.75rem' }}>
                            {logsFiltrados.length === 0 && <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)' }}>Nenhum log.</Typography>}
                            {logsFiltrados.map((l, i) => {
                                const msg = (l.message || '').trim();
                                const nivelLinha = /\[ERROR\]/.test(msg) ? 'error' : /\[WARN\]/.test(msg) ? 'warn' : (l.level || 'info');
                                return (
                                    <Box key={i} sx={{ color: COR_NIVEL[nivelLinha] || COR_NIVEL.info, py: 0.3, borderBottom: '1px solid rgba(255,255,255,0.04)', wordBreak: 'break-word' }}>
                                        {msg}
                                    </Box>
                                );
                            })}
                        </Box>
                    </GlassCard>
                </Grid>
            </Grid>
        </Box>
    );
};

export default AbaSaude;
