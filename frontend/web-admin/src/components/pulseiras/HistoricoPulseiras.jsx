import React, { useMemo, useState } from 'react';
import {
    Box, Typography, Grid, Alert, Stack, TextField, InputAdornment, ToggleButton, ToggleButtonGroup,
    Button, Dialog, DialogContent, DialogActions, Chip, Tooltip
} from '@mui/material';
import {
    ConfirmationNumber as EntreguesIcon, Sell as EmUsoIcon, AssignmentReturn as DevolvidasIcon,
    ReportGmailerrorred as PerdidasIcon, SwapHoriz as TrocasIcon, Search as SearchIcon
} from '@mui/icons-material';
import { format } from 'date-fns';
import KpiCard from '../common/KpiCard';
import DataTable from '../common/DataTable';
import TituloModal from '../common/TituloModal';
import NeonButton from '../common/NeonButton';
import { botaoSecundario, cores } from '../../styles/tokens';
import { formatarHoras } from '../../hooks/useRemuneracao';

// Situação → [cor, rótulo]
const SITUACOES = {
    em_uso: [cores.sucesso, 'Em uso'],
    devolvida: [cores.secundariaClara, 'Devolvida'],
    perdida: [cores.erro, 'Perdida'],
    substituida: [cores.alerta, 'Trocada'],
    desvinculada: [cores.textoSecundario, 'Desvinculada'],
    anulada: [cores.textoFraco, 'Anulada']
};

const dataHora = (iso) => (iso ? format(new Date(iso), 'dd/MM HH:mm') : '—');

/**
 * Histórico de pulseiras: quem recebeu cada número, quando, por quanto tempo, quantos acessos
 * fez com ela e como terminou (trocada, devolvida, perdida). Registra devolução e perda.
 */
const HistoricoPulseiras = ({ historico, loading, onEncerrar, onAnular }) => {
    const [situacao, setSituacao] = useState('todas');
    const [busca, setBusca] = useState('');
    const [encerrando, setEncerrando] = useState(null); // { linha, motivo: 'devolvida' | 'perdida' | 'anulada' }
    const [observacao, setObservacao] = useState('');
    const [salvando, setSalvando] = useState(false);

    const linhas = useMemo(() => {
        const termo = busca.trim().toLowerCase();
        const digitos = termo.replace(/\D/g, '');
        return (historico?.linhas || []).filter(l =>
            (situacao === 'todas' || l.status === situacao || (situacao === 'alertas' && (l.duplicada || l.status === 'perdida')))
            && (!termo || l.numero_pulseira.toLowerCase().includes(termo) || l.colaborador.toLowerCase().includes(termo)
                || (digitos && l.cpf.replace(/\D/g, '').includes(digitos))));
    }, [historico, situacao, busca]);

    const abrir = (linha, motivo) => { setEncerrando({ linha, motivo }); setObservacao(''); };
    const confirmar = async () => {
        setSalvando(true);
        // 'anulada' desfaz o lançamento (servidor restaura a pulseira anterior); os outros encerram a pulseira
        const ok = encerrando.motivo === 'anulada'
            ? await onAnular(encerrando.linha.pessoa_id, observacao)
            : await onEncerrar(encerrando.linha.pessoa_id, encerrando.motivo, observacao);
        setSalvando(false);
        if (ok) setEncerrando(null);
    };

    const colunas = useMemo(() => [
        {
            id: 'numero_pulseira', label: 'Pulseira', width: 110, align: 'center',
            format: (v, row) => (
                <Tooltip title={row.tipo || 'Sem tipo de pulseira'} arrow>
                    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
                        {row.cor && <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: row.cor, flexShrink: 0 }} />}
                        <Typography variant="body2" sx={{ fontWeight: 700, color: row.duplicada ? cores.erro : cores.textoForte }}>{v}</Typography>
                    </Box>
                </Tooltip>
            )
        },
        {
            id: 'colaborador', label: 'Colaborador', width: 210,
            format: (v, row) => (
                <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700, color: cores.textoForte }} noWrap>{v}</Typography>
                    <Typography variant="caption" sx={{ color: cores.textoSecundario }} noWrap>{row.empresa} • {row.funcao}</Typography>
                </Box>
            )
        },
        {
            id: 'status', label: 'Situação', width: 120, align: 'center',
            format: (v) => {
                const [cor, rotulo] = SITUACOES[v] || [cores.textoSecundario, v];
                return <Chip size="small" label={rotulo} sx={{ bgcolor: `${cor}22`, color: cor, fontWeight: 700 }} />;
            }
        },
        {
            id: 'entregue_em', label: 'Entregue', width: 120,
            format: (v, row) => (
                <Box>
                    <Typography variant="body2">{dataHora(v)}{row.historico ? '*' : ''}</Typography>
                    {row.entregue_por && <Typography variant="caption" sx={{ color: cores.textoSecundario }} noWrap>{row.entregue_por}</Typography>}
                </Box>
            )
        },
        {
            id: 'encerrado_em', label: 'Encerrada', width: 120,
            format: (v, row) => (
                <Box>
                    <Typography variant="body2">{dataHora(v)}</Typography>
                    {row.encerrado_por && <Typography variant="caption" sx={{ color: cores.textoSecundario }} noWrap>{row.encerrado_por}</Typography>}
                </Box>
            )
        },
        { id: 'minutos_em_uso', label: 'Tempo', width: 90, align: 'center', format: (v) => formatarHoras(v) },
        {
            id: 'acessos', label: 'Acessos', width: 90, align: 'center',
            format: (v, row) => (
                <Tooltip title={v > 0 ? `Primeiro: ${dataHora(row.primeiro_uso)} • Último: ${dataHora(row.ultimo_uso)}` : 'Nenhuma entrada ou saída com esta pulseira'} arrow>
                    <Typography variant="body2" sx={{ fontWeight: 700, color: v > 0 ? cores.textoForte : cores.textoFraco }}>{v}</Typography>
                </Tooltip>
            )
        },
        {
            id: 'observacao', label: 'Observação', width: 200,
            format: (v, row) => (
                <Typography variant="caption" sx={{ color: row.duplicada ? cores.erro : cores.textoSecundario }}>
                    {[row.trocas_da_pessoa > 0 ? `${row.trocas_da_pessoa} troca(s) da pessoa` : null, v].filter(Boolean).join(' • ') || '—'}
                </Typography>
            )
        },
        {
            id: 'acoes', label: '', width: 260, align: 'right',
            format: (_, row) => {
                if (row.status === 'em_uso') {
                    return (
                        <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                            <Tooltip title="Pulseira errada? Desfaz o lançamento e devolve a anterior, se houve troca" arrow>
                                <Button size="small" onClick={() => abrir(row, 'anulada')} sx={{ color: cores.alerta, fontWeight: 700, minWidth: 0 }}>Lançamento errado</Button>
                            </Tooltip>
                            <Button size="small" onClick={() => abrir(row, 'devolvida')} sx={{ color: cores.secundariaClara, fontWeight: 700, minWidth: 0 }}>Devolvida</Button>
                            <Button size="small" onClick={() => abrir(row, 'perdida')} sx={{ color: cores.erro, fontWeight: 700, minWidth: 0 }}>Perdida</Button>
                        </Stack>
                    );
                }
                if (row.pode_desfazer) {
                    return (
                        <Tooltip title="Marcação feita por engano: a pulseira volta para a pessoa com a mesma hora de entrada" arrow>
                            <Button size="small" onClick={() => abrir(row, 'anulada')} sx={{ color: cores.alerta, fontWeight: 700, minWidth: 0 }}>Desfazer</Button>
                        </Tooltip>
                    );
                }
                return null;
            }
        }
    ], []);

    if (historico && historico.disponivel === false) {
        return (
            <Alert severity="warning">
                O histórico de pulseiras ainda não está disponível no banco. Rode a migration <strong>20261030_historico_pulseiras.sql</strong> no Supabase:
                ela cria o histórico e já reconstrói as entregas anteriores a partir dos acessos.
            </Alert>
        );
    }

    const r = historico?.resumo || {};
    const perdendo = encerrando?.motivo === 'perdida';
    const anulando = encerrando?.motivo === 'anulada';
    const trocasEmpresa = historico?.trocas_empresa || [];

    return (
        <Box>
            {(historico?.alertas || []).map(a => (
                <Alert key={a.texto} severity={a.nivel} sx={{ mb: 1.5 }}>{a.texto}</Alert>
            ))}

            <Grid container spacing={2} sx={{ mb: 2.5 }}>
                <Grid item xs={6} md={2.4}>
                    <KpiCard titulo="Entregues no período" valor={r.entregues || 0} icone={<EntreguesIcon />} rodape={`${r.pessoas || 0} pessoas`} />
                </Grid>
                <Grid item xs={6} md={2.4}>
                    <KpiCard titulo="Em uso agora" valor={r.em_uso || 0} icone={<EmUsoIcon />} cor={cores.sucesso}
                        rodape={r.duplicadas ? `${r.duplicadas} número(s) duplicado(s)` : 'Sem números duplicados'} />
                </Grid>
                <Grid item xs={6} md={2.4}>
                    <KpiCard titulo="Devolvidas" valor={r.devolvidas || 0} icone={<DevolvidasIcon />} cor={cores.secundariaClara}
                        rodape={`${r.desvinculadas || 0} desvinculada(s) no cadastro`} />
                </Grid>
                <Grid item xs={6} md={2.4}>
                    <KpiCard titulo="Perdidas" valor={r.perdidas || 0} icone={<PerdidasIcon />} cor={cores.erro}
                        rodape={`${r.sem_uso || 0} entregue(s) sem nenhum acesso`} />
                </Grid>
                <Grid item xs={12} md={2.4}>
                    <KpiCard titulo="Trocas" valor={r.trocadas || 0} icone={<TrocasIcon />} cor={cores.alerta}
                        rodape={`${r.pessoas_com_troca || 0} pessoa(s) trocaram de pulseira`} />
                </Grid>
            </Grid>

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ mb: 1.5 }} alignItems={{ md: 'center' }}>
                <ToggleButtonGroup size="small" exclusive value={situacao} onChange={(_, v) => v && setSituacao(v)} sx={{ flexWrap: 'wrap' }}>
                    <ToggleButton value="todas">Todas</ToggleButton>
                    <ToggleButton value="em_uso">Em uso</ToggleButton>
                    <ToggleButton value="substituida">Trocadas</ToggleButton>
                    <ToggleButton value="devolvida">Devolvidas</ToggleButton>
                    <ToggleButton value="perdida">Perdidas</ToggleButton>
                    <ToggleButton value="anulada">Anuladas</ToggleButton>
                    <ToggleButton value="alertas">Alertas</ToggleButton>
                </ToggleButtonGroup>
                <TextField
                    size="small"
                    placeholder="Número, nome ou CPF"
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    sx={{ minWidth: { md: 260 } }}
                    InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
                />
            </Stack>

            {trocasEmpresa.length > 0 && (
                <Box sx={{ mb: 2 }}>
                    <Typography variant="subtitle2" sx={{ color: cores.textoForte, fontWeight: 700, mb: 1 }}>Trocas de empresa no período</Typography>
                    <DataTable
                        data={trocasEmpresa}
                        rowsPerPage={10}
                        columns={[
                            { id: 'colaborador', label: 'Colaborador', width: 240, format: (v, row) => (
                                <Box sx={{ minWidth: 0 }}>
                                    <Typography variant="body2" sx={{ fontWeight: 700, color: cores.textoForte }} noWrap>{v}</Typography>
                                    <Typography variant="caption" sx={{ color: cores.textoSecundario }}>{row.cpf}</Typography>
                                </Box>
                            ) },
                            { id: 'de', label: 'Empresa anterior' },
                            { id: 'para', label: 'Nova empresa' },
                            { id: 'em', label: 'Quando', width: 120, format: (v) => dataHora(v) }
                        ]}
                    />
                    <Typography variant="caption" sx={{ color: cores.textoFraco, display: 'block', mt: 0.75 }}>
                        Acessos anteriores à troca ficam na empresa anterior; os seguintes, na nova. Cada empresa mostra só o próprio período.
                    </Typography>
                </Box>
            )}

            <DataTable data={linhas} columns={colunas} loading={loading} rowsPerPage={25} />

            <Typography variant="caption" sx={{ color: cores.textoFraco, display: 'block', mt: 1.5 }}>
                Toda troca de número no cadastro, no credenciamento ou no check-in entra aqui automaticamente.
                Acessos = entradas e saídas feitas com aquela pulseira. * entrega reconstruída dos acessos anteriores (horário aproximado).
                Lançamento anulado (errado) não conta como entrega e não bloqueia o número.
            </Typography>

            <Dialog open={!!encerrando} onClose={() => !salvando && setEncerrando(null)} maxWidth="xs" fullWidth disableRestoreFocus>
                <TituloModal
                    titulo={anulando ? 'Desfazer lançamento' : perdendo ? 'Pulseira perdida' : 'Devolução de pulseira'}
                    subtitulo={encerrando ? `Pulseira ${encerrando.linha.numero_pulseira} • ${encerrando.linha.colaborador}` : null}
                    onFechar={() => setEncerrando(null)}
                    desabilitarFechar={salvando}
                />
                <DialogContent>
                    <Typography variant="body2" sx={{ color: cores.textoSecundario, mb: 2 }}>
                        {anulando
                            ? 'Use quando a pulseira foi digitada errada ou a marcação foi feita por engano. Se houve troca, a pulseira anterior volta para a pessoa com a mesma hora de entrada. Se o número já foi dado a outra pessoa neste evento, o sistema não desfaz e avisa.'
                            : perdendo
                                ? 'O número sai do cadastro da pessoa e deixa de abrir acesso. Para voltar a entrar, ela recebe uma pulseira nova no credenciamento.'
                                : 'O número sai do cadastro da pessoa. Para voltar a entrar, ela recebe uma pulseira no credenciamento.'}
                    </Typography>
                    <TextField label="Observação (opcional)" fullWidth size="small" multiline rows={2} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
                </DialogContent>
                <DialogActions sx={{ p: 2 }}>
                    <Button variant="outlined" sx={botaoSecundario} onClick={() => setEncerrando(null)} disabled={salvando}>Cancelar</Button>
                    <NeonButton onClick={confirmar} disabled={salvando}>
                        {salvando ? 'Salvando...' : anulando ? 'Desfazer lançamento' : perdendo ? 'Marcar como perdida' : 'Registrar devolução'}
                    </NeonButton>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default HistoricoPulseiras;
