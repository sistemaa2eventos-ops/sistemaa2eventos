import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, IconButton, MenuItem,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Tooltip, Typography
} from '@mui/material';
import {
    Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon, LockReset as LockResetIcon,
    Refresh as RefreshIcon, Download as DownloadIcon, Block as BlockIcon, CheckCircle as CheckCircleIcon
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import api from '../../services/api';
import GlassCard from '../common/GlassCard';
import NeonButton from '../common/NeonButton';
import TituloModal from '../common/TituloModal';
import { funcao, tom, botaoSecundario, acaoTabela, acaoTabelaPerigo } from '../../styles/tokens';

/**
 * Monitor > Operadores da Central (só admin).
 * Quem entra na Central em tempo real (PC do evento) com login e senha, e o registro do que cada um fez.
 */

const ROTULO_ACAO = {
    entrar: 'Entrou',
    entrar_falhou: 'Tentativa de login recusada',
    sair: 'Saiu',
    assistir: 'Assistiu à câmera',
    ouvir: 'Ouviu a câmera',
    falar: 'Falou pela câmera',
    assumir_controle: 'Assumiu o controle',
    liberar_controle: 'Liberou o controle',
    girar: 'Girou a câmera',
    ir_posicao: 'Levou a câmera a uma posição',
    gravar_posicao: 'Gravou uma posição',
    senha_app_camera: 'Alterou a senha do app da câmera'
};

const FORM_VAZIO = { nome: '', login: '', senha: '' };

const erroDe = (err) => err?.response?.data?.error || 'Não deu para concluir. Tente de novo.';
const dataHora = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR') : '—');

function textoDetalhe(d = {}) {
    if (d.posicao) return `Posição: ${d.posicao}`;
    if (d.qualidade) return d.qualidade === 'foco' ? 'Tela grande' : 'Grade';
    if (d.senha) return d.senha === 'definida' ? 'Senha definida' : 'Senha apagada';
    return '';
}

const AbaOperadoresCentral = ({ cameras = [] }) => {
    const { enqueueSnackbar } = useSnackbar();
    const [operadores, setOperadores] = useState([]);
    const [carregando, setCarregando] = useState(true);
    const [dialogo, setDialogo] = useState(null);          // { modo: 'novo'|'editar'|'senha', op }
    const [form, setForm] = useState(FORM_VAZIO);
    const [salvando, setSalvando] = useState(false);
    const [tentou, setTentou] = useState(false);            // clicou em salvar com campo errado
    const [excluindo, setExcluindo] = useState(null);      // operador a confirmar
    const [registros, setRegistros] = useState([]);
    const [carregandoRegistros, setCarregandoRegistros] = useState(false);
    const [filtros, setFiltros] = useState({ operador_id: '', acao: '', de: '', ate: '' });

    const nomeCamera = useMemo(() => {
        const mapa = new Map(cameras.map(c => [String(c.id), c.nome]));
        return (id) => (id ? mapa.get(String(id)) || 'Câmera removida' : '—');
    }, [cameras]);

    const carregarOperadores = useCallback(async () => {
        setCarregando(true);
        try {
            const { data } = await api.get('/central-operadores', { hideDefaultError: true });
            setOperadores(data?.data || []);
        } catch (err) {
            enqueueSnackbar(erroDe(err), { variant: 'error' });
        } finally {
            setCarregando(false);
        }
    }, [enqueueSnackbar]);

    const carregarRegistros = useCallback(async () => {
        setCarregandoRegistros(true);
        try {
            const params = { limite: 500 };
            if (filtros.operador_id) params.operador_id = filtros.operador_id;
            if (filtros.acao) params.acao = filtros.acao;
            if (filtros.de) params.de = new Date(filtros.de).toISOString();
            if (filtros.ate) params.ate = new Date(filtros.ate).toISOString();
            const { data } = await api.get('/central-operadores/auditoria', { params, hideDefaultError: true });
            setRegistros(data?.data || []);
        } catch (err) {
            enqueueSnackbar(erroDe(err), { variant: 'error' });
        } finally {
            setCarregandoRegistros(false);
        }
    }, [filtros, enqueueSnackbar]);

    useEffect(() => { carregarOperadores(); }, [carregarOperadores]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { carregarRegistros(); }, []);

    const abrir = (modo, op = null) => {
        setForm(op ? { nome: op.nome, login: op.login, senha: '' } : FORM_VAZIO);
        setTentou(false);
        setDialogo({ modo, op });
    };

    const salvar = async () => {
        setSalvando(true);
        try {
            if (dialogo.modo === 'novo') {
                await api.post('/central-operadores', { nome: form.nome, login: form.login, senha: form.senha }, { hideDefaultError: true });
                enqueueSnackbar('Operador criado. O PC do evento recebe o acesso em até 1 minuto.', { variant: 'success' });
            } else if (dialogo.modo === 'editar') {
                await api.patch(`/central-operadores/${dialogo.op.id}`, { nome: form.nome }, { hideDefaultError: true });
                enqueueSnackbar('Nome atualizado.', { variant: 'success' });
            } else {
                await api.patch(`/central-operadores/${dialogo.op.id}`, { senha: form.senha }, { hideDefaultError: true });
                enqueueSnackbar('Senha redefinida. A senha antiga deixa de valer em até 1 minuto.', { variant: 'success' });
            }
            setDialogo(null);
            carregarOperadores();
        } catch (err) {
            enqueueSnackbar(erroDe(err), { variant: 'error' });
        } finally {
            setSalvando(false);
        }
    };

    const alternarAtivo = async (op) => {
        try {
            await api.patch(`/central-operadores/${op.id}`, { ativo: !op.ativo }, { hideDefaultError: true });
            enqueueSnackbar(op.ativo ? `${op.nome} não entra mais na Central.` : `${op.nome} voltou a ter acesso.`, { variant: 'success' });
            carregarOperadores();
        } catch (err) {
            enqueueSnackbar(erroDe(err), { variant: 'error' });
        }
    };

    const confirmarExclusao = async () => {
        const op = excluindo;
        setExcluindo(null);
        try {
            await api.delete(`/central-operadores/${op.id}`, { hideDefaultError: true });
            enqueueSnackbar('Operador excluído. O registro do que ele fez continua guardado.', { variant: 'success' });
            carregarOperadores();
        } catch (err) {
            enqueueSnackbar(erroDe(err), { variant: 'error' });
        }
    };

    const exportarCsv = () => {
        const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const linhas = [['Data e hora', 'Operador', 'Login', 'Ação', 'Câmera', 'Detalhe'].map(esc).join(';')];
        for (const r of registros) {
            linhas.push([dataHora(r.ocorrido_em), r.operador_nome, r.operador_login || '', ROTULO_ACAO[r.acao] || r.acao,
                r.camera_id ? nomeCamera(r.camera_id) : '', textoDetalhe(r.detalhe)].map(esc).join(';'));
        }
        const blob = new Blob(['﻿' + linhas.join('\r\n')], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `registro-central-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // O que falta em cada campo (o botão não fica apagado sem explicação: ao clicar, o campo errado fica vermelho)
    const errosForm = {
        nome: dialogo?.modo !== 'senha' && form.nome.trim().length < 2 ? 'Informe o nome (pelo menos 2 letras).' : '',
        login: dialogo?.modo === 'novo' && !/^[a-z0-9._-]{3,40}$/.test(form.login)
            ? (form.login.length < 3 ? 'O login precisa de pelo menos 3 caracteres.' : 'Use só letras sem acento, números, ponto, hífen ou sublinhado (sem @ e sem espaço).')
            : '',
        senha: dialogo?.modo !== 'editar' && form.senha.trim().length < 8 ? `A senha precisa de pelo menos 8 caracteres (tem ${form.senha.trim().length}).` : ''
    };
    const formValido = !errosForm.nome && !errosForm.login && !errosForm.senha;
    const tentarSalvar = () => {
        if (!formValido) { setTentou(true); return; }
        salvar();
    };

    return (
        <Box sx={{ display: 'grid', gap: 3 }}>
            <Alert severity="info" variant="outlined">
                Cada operador entra na Central em tempo real com o próprio login. Cada acesso e cada ação nas câmeras
                (assistir, ouvir, falar, girar, assumir o controle) ficam registrados com o nome e o horário.
                O PC do evento recebe a lista em até 1 minuto e continua aceitando o login sem internet.
                Enquanto não houver operador cadastrado, a Central aceita a chave de acesso do PC.
            </Alert>

            <GlassCard sx={{ p: 2.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', mb: 2 }}>
                    <Box>
                        <Typography variant="h6">Operadores da Central</Typography>
                        <Typography variant="body2" color="text.secondary">Quem pode entrar na Central em tempo real deste evento.</Typography>
                    </Box>
                    <NeonButton startIcon={<AddIcon />} onClick={() => abrir('novo')}>Novo operador</NeonButton>
                </Box>

                {carregando ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress size={28} /></Box>
                ) : operadores.length === 0 ? (
                    <Typography color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
                        Nenhum operador ainda. Crie o primeiro para a Central passar a pedir login e senha.
                    </Typography>
                ) : (
                    <TableContainer>
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell>Nome</TableCell>
                                    <TableCell>Login</TableCell>
                                    <TableCell>Situação</TableCell>
                                    <TableCell>Último acesso</TableCell>
                                    <TableCell align="right">Ações</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {operadores.map(op => (
                                    <TableRow key={op.id} hover>
                                        <TableCell>{op.nome}</TableCell>
                                        <TableCell sx={{ fontFamily: 'monospace' }}>{op.login}</TableCell>
                                        <TableCell>
                                            <Chip size="small" label={op.ativo ? 'Ativo' : 'Sem acesso'}
                                                sx={{ bgcolor: tom(op.ativo ? funcao.liberado : funcao.neutro), color: op.ativo ? funcao.liberado : funcao.neutro }} />
                                        </TableCell>
                                        <TableCell>{dataHora(op.ultimo_acesso)}</TableCell>
                                        <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                                            <Tooltip title="Editar nome"><IconButton size="small" sx={acaoTabela} onClick={() => abrir('editar', op)} aria-label={`Editar nome de ${op.nome}`}><EditIcon fontSize="small" /></IconButton></Tooltip>
                                            <Tooltip title="Redefinir senha"><IconButton size="small" sx={acaoTabela} onClick={() => abrir('senha', op)} aria-label={`Redefinir senha de ${op.nome}`}><LockResetIcon fontSize="small" /></IconButton></Tooltip>
                                            <Tooltip title={op.ativo ? 'Tirar o acesso' : 'Devolver o acesso'}>
                                                <IconButton size="small" sx={acaoTabela} onClick={() => alternarAtivo(op)} aria-label={op.ativo ? `Tirar o acesso de ${op.nome}` : `Devolver o acesso de ${op.nome}`}>
                                                    {op.ativo ? <BlockIcon fontSize="small" /> : <CheckCircleIcon fontSize="small" />}
                                                </IconButton>
                                            </Tooltip>
                                            <Tooltip title="Excluir"><IconButton size="small" sx={acaoTabelaPerigo} onClick={() => setExcluindo(op)} aria-label={`Excluir ${op.nome}`}><DeleteIcon fontSize="small" /></IconButton></Tooltip>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                )}
            </GlassCard>

            <GlassCard sx={{ p: 2.5 }}>
                <Box sx={{ mb: 2 }}>
                    <Typography variant="h6">Registro de atividades</Typography>
                    <Typography variant="body2" color="text.secondary">
                        Quem operou a Central e quando. O PC envia o registro a cada 10 segundos; sem internet, guarda e envia depois.
                    </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center', mb: 2 }}>
                    <TextField select size="small" label="Operador" value={filtros.operador_id} sx={{ minWidth: 200 }}
                        onChange={e => setFiltros(f => ({ ...f, operador_id: e.target.value }))}>
                        <MenuItem value="">Todos</MenuItem>
                        {operadores.map(op => <MenuItem key={op.id} value={op.id}>{op.nome}</MenuItem>)}
                    </TextField>
                    <TextField select size="small" label="Ação" value={filtros.acao} sx={{ minWidth: 220 }}
                        onChange={e => setFiltros(f => ({ ...f, acao: e.target.value }))}>
                        <MenuItem value="">Todas</MenuItem>
                        {Object.entries(ROTULO_ACAO).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
                    </TextField>
                    <TextField size="small" type="datetime-local" label="De" value={filtros.de} InputLabelProps={{ shrink: true }}
                        onChange={e => setFiltros(f => ({ ...f, de: e.target.value }))} />
                    <TextField size="small" type="datetime-local" label="Até" value={filtros.ate} InputLabelProps={{ shrink: true }}
                        onChange={e => setFiltros(f => ({ ...f, ate: e.target.value }))} />
                    <Button variant="outlined" sx={botaoSecundario} startIcon={<RefreshIcon />} onClick={carregarRegistros} disabled={carregandoRegistros}>
                        Buscar
                    </Button>
                    <Button variant="outlined" sx={botaoSecundario} startIcon={<DownloadIcon />} onClick={exportarCsv} disabled={!registros.length}>
                        Exportar CSV
                    </Button>
                </Box>

                {carregandoRegistros ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress size={28} /></Box>
                ) : registros.length === 0 ? (
                    <Typography color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>Nenhuma atividade no período.</Typography>
                ) : (
                    <TableContainer sx={{ maxHeight: 480 }}>
                        <Table size="small" stickyHeader>
                            <TableHead>
                                <TableRow>
                                    <TableCell>Data e hora</TableCell>
                                    <TableCell>Operador</TableCell>
                                    <TableCell>Ação</TableCell>
                                    <TableCell>Câmera</TableCell>
                                    <TableCell>Detalhe</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {registros.map(r => (
                                    <TableRow key={r.id} hover>
                                        <TableCell sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{dataHora(r.ocorrido_em)}</TableCell>
                                        <TableCell>{r.operador_nome}</TableCell>
                                        <TableCell sx={{ color: r.acao === 'entrar_falhou' ? funcao.negado : 'inherit' }}>{ROTULO_ACAO[r.acao] || r.acao}</TableCell>
                                        <TableCell>{r.camera_id ? nomeCamera(r.camera_id) : '—'}</TableCell>
                                        <TableCell>{textoDetalhe(r.detalhe) || '—'}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                )}
            </GlassCard>

            <Dialog open={!!dialogo} onClose={() => !salvando && setDialogo(null)} maxWidth="xs" fullWidth>
                {dialogo && (
                    <>
                        <TituloModal
                            titulo={dialogo.modo === 'novo' ? 'Novo operador' : dialogo.modo === 'editar' ? 'Editar nome' : 'Redefinir senha'}
                            subtitulo={dialogo.modo === 'novo' ? 'Acesso à Central em tempo real deste evento.' : dialogo.op?.nome}
                            onFechar={() => setDialogo(null)}
                            desabilitarFechar={salvando}
                        />
                        <DialogContent sx={{ display: 'grid', gap: 2, pt: '8px !important' }}>
                            {dialogo.modo !== 'senha' && (
                                <TextField id="central-op-nome" label="Nome completo" value={form.nome} autoFocus
                                    inputProps={{ maxLength: 80 }} autoComplete="off"
                                    error={tentou && !!errosForm.nome}
                                    helperText={(tentou && errosForm.nome) || 'Aparece no registro de atividades e na Central.'}
                                    onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} />
                            )}
                            {dialogo.modo === 'novo' && (
                                <TextField id="central-op-login" label="Login" value={form.login}
                                    inputProps={{ maxLength: 40, autoCapitalize: 'none', spellCheck: false }} autoComplete="off"
                                    error={tentou && !!errosForm.login}
                                    helperText={(tentou && errosForm.login) || 'De 3 a 40 caracteres: letras sem acento, números, ponto, hífen ou sublinhado. Ex.: maria.silva'}
                                    onChange={e => setForm(f => ({ ...f, login: e.target.value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, '.') }))} />
                            )}
                            {dialogo.modo !== 'editar' && (
                                <TextField id="central-op-senha" label={dialogo.modo === 'senha' ? 'Nova senha' : 'Senha'} type="password" value={form.senha}
                                    autoFocus={dialogo.modo === 'senha'} autoComplete="new-password"
                                    inputProps={{ maxLength: 128 }}
                                    error={tentou && !!errosForm.senha}
                                    helperText={(tentou && errosForm.senha) || 'Pelo menos 8 caracteres. Entregue a senha ao operador por um canal seguro.'}
                                    onChange={e => setForm(f => ({ ...f, senha: e.target.value }))} />
                            )}
                        </DialogContent>
                        <DialogActions sx={{ px: 3, pb: 2.5 }}>
                            <Button variant="outlined" sx={botaoSecundario} onClick={() => setDialogo(null)} disabled={salvando}>Cancelar</Button>
                            <NeonButton onClick={tentarSalvar} disabled={salvando}>
                                {salvando ? 'Salvando…' : dialogo.modo === 'novo' ? 'Criar operador' : 'Salvar'}
                            </NeonButton>
                        </DialogActions>
                    </>
                )}
            </Dialog>

            <Dialog open={!!excluindo} onClose={() => setExcluindo(null)} maxWidth="xs" fullWidth>
                <TituloModal titulo="Excluir operador" subtitulo={excluindo?.nome} onFechar={() => setExcluindo(null)} />
                <DialogContent>
                    <Typography>
                        {excluindo?.nome} deixa de entrar na Central. O registro do que ele já fez continua guardado, com o nome dele.
                        Para só tirar o acesso por um tempo, use o botão de bloquear.
                    </Typography>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2.5 }}>
                    <Button variant="outlined" sx={botaoSecundario} onClick={() => setExcluindo(null)}>Cancelar</Button>
                    <NeonButton neonColor={funcao.negado} onClick={confirmarExclusao}>Excluir</NeonButton>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default AbaOperadoresCentral;
