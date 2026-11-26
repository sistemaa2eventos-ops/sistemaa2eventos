import React, { useEffect, useMemo, useState } from 'react';
import {
    Alert, Box, Checkbox, CircularProgress, Grid, IconButton, Stack, Switch,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Tooltip, Typography
} from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon, FactCheck as PendentesIcon, LibraryBooks as CatalogoIcon, ContentCopy as CopiarIcon } from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import PageHeader from '../../components/common/PageHeader';
import GlassCard from '../../components/common/GlassCard';
import NeonButton from '../../components/common/NeonButton';
import CatalogoDocumentosDialog from '../../components/documentos/CatalogoDocumentosDialog';
import CopiarConfiguracaoDialog from '../../components/documentos/CopiarConfiguracaoDialog';
import { cores, botaoSecundario, acaoTabelaPerigo } from '../../styles/tokens';

const PADRAO = '*';
const normalizar = (f) => String(f || '').trim().replace(/\s+/g, ' ').toUpperCase();

/**
 * Documentos obrigatórios do evento:
 * catálogo de tipos, matriz função × documento e antecedência do aviso de vencimento.
 * Tipos e funções salvos são excluídos na hora (com confirmação); o resto vai com "Salvar configuração".
 */
const ConfigDocumentos = () => {
    const { enqueueSnackbar } = useSnackbar();
    const [carregando, setCarregando] = useState(true);
    const [salvando, setSalvando] = useState(false);
    const [alterado, setAlterado] = useState(false);
    const [tipos, setTipos] = useState([]);
    const [regras, setRegras] = useState({});
    const [funcoes, setFuncoes] = useState([]);
    const [funcoesSalvas, setFuncoesSalvas] = useState([]);
    const [funcoesEmUso, setFuncoesEmUso] = useState({});
    const [aviso, setAviso] = useState(15);
    const [novaFuncao, setNovaFuncao] = useState('');
    const [tiposEmpresa, setTiposEmpresa] = useState([]);
    const [abrirCatalogo, setAbrirCatalogo] = useState(false);
    const [abrirCopiar, setAbrirCopiar] = useState(false);
    const navigate = useNavigate();

    const aplicar = (cfg) => {
        setTipos(cfg.tipos || []);
        setTiposEmpresa(cfg.tipos_empresa || []);
        setRegras(cfg.regras || {});
        setFuncoes(cfg.funcoes || []);
        setFuncoesSalvas(cfg.funcoes || []);
        setFuncoesEmUso(cfg.funcoes_em_uso || {});
        setAviso(cfg.aviso_vencimento_dias || 15);
        setAlterado(false);
    };

    useEffect(() => {
        api.get('/documentos/config')
            .then(resp => aplicar(resp.data?.data || {}))
            .catch(() => enqueueSnackbar('Erro ao carregar a configuração de documentos.', { variant: 'error' }))
            .finally(() => setCarregando(false));
    }, [enqueueSnackbar]);

    const tiposAtivos = useMemo(() => tipos.filter(t => t.ativo !== false && t.nome?.trim()), [tipos]);
    const chaveTipo = (t) => t.id || t.tempId;
    const linhasFuncao = [PADRAO, ...funcoes];

    const marcado = (funcao, tipo) => (regras[funcao] || []).includes(chaveTipo(tipo));
    const alternar = (funcao, tipo) => {
        const id = chaveTipo(tipo);
        setAlterado(true);
        setRegras(prev => {
            const atual = new Set(prev[funcao] || []);
            if (atual.has(id)) atual.delete(id); else atual.add(id);
            return { ...prev, [funcao]: [...atual] };
        });
    };

    const atualizarTipo = (idx, campo, valor) => {
        setAlterado(true);
        setTipos(prev => prev.map((t, i) => (i === idx ? { ...t, [campo]: valor } : t)));
    };
    const adicionarTipo = () => {
        setAlterado(true);
        setTipos(prev => [...prev, { tempId: `novo_${Date.now()}`, nome: '', exige_validade: false, ativo: true, ordem: prev.length }]);
    };

    // Tipo novo (ainda não salvo) sai da tela; tipo salvo é excluído no servidor (recusa se já houver documento enviado)
    const excluirTipo = async (idx) => {
        const t = tipos[idx];
        if (t.tempId) {
            setTipos(prev => prev.filter((_, i) => i !== idx));
            return;
        }
        if (!window.confirm(`Excluir o tipo "${t.nome}"? Não dá para desfazer. Alterações não salvas nesta tela serão descartadas.`)) return;
        try {
            const resp = await api.delete(`/documentos/config/tipos/${t.id}`);
            aplicar(resp.data?.data || {});
            enqueueSnackbar('Tipo de documento excluído.', { variant: 'success' });
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Erro ao excluir o tipo de documento.', { variant: 'error' });
        }
    };

    const adicionarFuncao = () => {
        const f = normalizar(novaFuncao);
        if (!f || f === PADRAO || funcoes.includes(f)) return;
        setAlterado(true);
        setFuncoes(prev => [...prev, f].sort());
        setNovaFuncao('');
    };

    // Função ainda não salva sai só da tela; função salva é excluída no servidor (recusa se houver participante com ela)
    const excluirFuncao = async (f) => {
        if (!funcoesSalvas.includes(f)) {
            setAlterado(true);
            setFuncoes(prev => prev.filter(x => x !== f));
            setRegras(prev => { const { [f]: _removida, ...resto } = prev; return resto; });
            return;
        }
        if (!window.confirm(`Excluir a função "${f}"? As marcações de documento dela também são removidas. Alterações não salvas nesta tela serão descartadas.`)) return;
        try {
            const resp = await api.delete(`/documentos/config/funcoes/${encodeURIComponent(f)}`);
            aplicar(resp.data?.data || {});
            enqueueSnackbar('Função excluída.', { variant: 'success' });
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Erro ao excluir a função.', { variant: 'error' });
        }
    };

    // Documentos do catálogo entram como tipos novos (ainda não salvos): o Salvar grava
    const adicionarDoCatalogo = (itens) => {
        if (!itens.length) return;
        setAlterado(true);
        const base = Date.now();
        setTipos(prev => [...prev, ...itens.map((it, i) => ({
            tempId: `novo_${base}_${i}`, nome: it.nome, exige_validade: !!it.exige_validade, ativo: true, ordem: prev.length + i
        }))]);
        enqueueSnackbar(`${itens.length} documento(s) adicionado(s). Clique em Salvar para manter.`, { variant: 'info' });
    };

    const alternarEmpresa = (tipo) => {
        const id = chaveTipo(tipo);
        setAlterado(true);
        setTiposEmpresa(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
    };

    // Atalho: abre a fila de análise já filtrada pela função
    const irParaPendentes = (funcao) => navigate(`/auditoria?busca=${encodeURIComponent(funcao)}`);

    const salvar = async () => {
        setSalvando(true);
        try {
            // Tipos novos são referenciados pelo nome; o backend devolve os IDs definitivos
            const tiposPayload = tipos.filter(t => t.nome?.trim()).map((t, i) => ({ ...t, ordem: i }));
            const refPorTemp = Object.fromEntries(tipos.filter(t => t.tempId).map(t => [t.tempId, t.nome.trim()]));
            const regrasPayload = Object.fromEntries(Object.entries(regras).map(([f, ids]) => [f, ids.map(id => refPorTemp[id] || id)]));
            const funcoesPayload = funcoes.filter(f => f !== PADRAO);
            const tiposEmpresaPayload = tiposEmpresa.map(id => refPorTemp[id] || id);

            const resp = await api.put('/documentos/config', {
                tipos: tiposPayload, regras: regrasPayload, aviso_vencimento_dias: aviso, funcoes: funcoesPayload,
                tipos_empresa: tiposEmpresaPayload
            });
            aplicar(resp.data?.data || {});
            enqueueSnackbar('Configuração salva. A situação documental dos participantes está sendo recalculada.', { variant: 'success' });
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Erro ao salvar a configuração.', { variant: 'error' });
        } finally {
            setSalvando(false);
        }
    };

    if (carregando) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                <CircularProgress />
            </Box>
        );
    }

    const semRegras = !Object.values(regras).some(l => l.length > 0);

    return (
        <Box sx={{ p: { xs: 2, sm: 3, md: 4 }, maxWidth: 1600, mx: 'auto', width: '100%' }}>
            <PageHeader
                title="Documentos obrigatórios"
                subtitle="Quem não tiver todos os documentos exigidos para a sua função aprovados (e dentro da validade) fica pendente. O operador pode liberar no turno; a liberação vale até o checkout ou o horário de reset do evento."
                breadcrumbs={[{ text: 'Configurações' }, { text: 'Documentos' }]}
                action={
                    <Stack direction="row" spacing={1.5} alignItems="center">
                        {alterado && <Typography variant="caption" sx={{ color: cores.alerta, fontWeight: 600 }}>Alterações não salvas</Typography>}
                        <NeonButton variant="outlined" startIcon={<CopiarIcon />} onClick={() => setAbrirCopiar(true)} sx={botaoSecundario}>
                            Copiar de outro evento
                        </NeonButton>
                        <NeonButton loading={salvando} onClick={salvar}>
                            Salvar configuração
                        </NeonButton>
                    </Stack>
                }
            />

            {semRegras && (
                <Alert severity="info" sx={{ mb: 3, bgcolor: 'rgba(0,212,255,0.05)', color: '#E8F4FD', border: '1px solid rgba(0,212,255,0.2)' }}>
                    Nenhum documento obrigatório definido. Mesmo assim, participante externo só fica autorizado com documentos
                    enviados e aprovados: quem não enviou nada continua pendente. Marque abaixo o que cada função precisa entregar.
                </Alert>
            )}

            <Grid container spacing={3}>
                <Grid item xs={12} md={5}>
                    <GlassCard sx={{ p: 3 }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                            <Typography variant="subtitle1" sx={{ color: cores.textoForte, fontWeight: 700 }}>Tipos de documento</Typography>
                            <Stack direction="row" spacing={1}>
                                <NeonButton variant="outlined" startIcon={<CatalogoIcon />} onClick={() => setAbrirCatalogo(true)} sx={botaoSecundario}>Catálogo</NeonButton>
                                <NeonButton variant="outlined" startIcon={<AddIcon />} onClick={adicionarTipo}>Novo tipo</NeonButton>
                            </Stack>
                        </Stack>
                        <Stack spacing={1.5}>
                            {tipos.map((t, idx) => (
                                <Stack key={chaveTipo(t)} direction="row" spacing={1} alignItems="center">
                                    <TextField size="small" fullWidth value={t.nome} placeholder="Nome do documento"
                                        onChange={(e) => atualizarTipo(idx, 'nome', e.target.value)} />
                                    <Tooltip title="Exige data de validade">
                                        <Stack alignItems="center">
                                            <Switch size="small" checked={!!t.exige_validade} onChange={(e) => atualizarTipo(idx, 'exige_validade', e.target.checked)} />
                                            <Typography variant="caption" sx={{ color: cores.textoSecundario }}>validade</Typography>
                                        </Stack>
                                    </Tooltip>
                                    <Tooltip title={t.ativo !== false ? 'Ativo' : 'Inativo'}>
                                        <Stack alignItems="center">
                                            <Switch size="small" checked={t.ativo !== false} onChange={(e) => atualizarTipo(idx, 'ativo', e.target.checked)} />
                                            <Typography variant="caption" sx={{ color: cores.textoSecundario }}>ativo</Typography>
                                        </Stack>
                                    </Tooltip>
                                    <Tooltip title="Excluir tipo">
                                        <IconButton size="small" onClick={() => excluirTipo(idx)} aria-label={`Excluir ${t.nome || 'tipo'}`} sx={acaoTabelaPerigo}>
                                            <DeleteIcon fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                </Stack>
                            ))}
                            {tipos.length === 0 && (
                                <Typography variant="body2" sx={{ color: cores.textoSecundario }}>Nenhum tipo cadastrado. Use &quot;Novo tipo&quot; para começar.</Typography>
                            )}
                        </Stack>
                    </GlassCard>

                    <GlassCard sx={{ p: 3, mt: 3 }}>
                        <Typography variant="subtitle1" sx={{ color: cores.textoForte, fontWeight: 700, mb: 1 }}>Aviso de vencimento</Typography>
                        <TextField type="number" size="small" label="Avisar com antecedência de (dias)" value={aviso}
                            onChange={(e) => { setAlterado(true); setAviso(Math.max(1, parseInt(e.target.value, 10) || 1)); }} inputProps={{ min: 1, max: 365 }} />
                        <Typography variant="caption" sx={{ display: 'block', color: cores.textoSecundario, mt: 1 }}>
                            O sino do painel avisa os documentos que vencem nesse prazo e os já vencidos (verificação diária às 07:00).
                        </Typography>
                    </GlassCard>
                </Grid>

                <Grid item xs={12} md={7}>
                    <GlassCard sx={{ p: 3 }}>
                        <Typography variant="subtitle1" sx={{ color: cores.textoForte, fontWeight: 700, mb: 2 }}>Obrigatórios por função</Typography>
                        <TableContainer sx={{ maxHeight: 520 }}>
                            <Table size="small" stickyHeader>
                                <TableHead>
                                    <TableRow>
                                        <TableCell sx={{ fontWeight: 700 }}>Função</TableCell>
                                        <TableCell align="center" sx={{ fontWeight: 700 }}>Participantes</TableCell>
                                        {tiposAtivos.map(t => (
                                            <TableCell key={chaveTipo(t)} align="center" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{t.nome}</TableCell>
                                        ))}
                                        <TableCell align="center" sx={{ fontWeight: 700 }}>Ações</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {linhasFuncao.map(f => {
                                        const usos = funcoesEmUso[f] || 0;
                                        const ehPadrao = f === PADRAO;
                                        const podeExcluir = !ehPadrao && usos === 0;
                                        return (
                                            <TableRow key={f} hover>
                                                <TableCell sx={{ fontWeight: ehPadrao ? 700 : 600, color: ehPadrao ? cores.primaria : 'inherit', whiteSpace: 'nowrap' }}>
                                                    {ehPadrao ? 'Todos (padrão)' : f}
                                                </TableCell>
                                                <TableCell align="center">
                                                    <Typography variant="body2" sx={{ color: cores.textoSecundario }}>{ehPadrao ? '—' : usos}</Typography>
                                                </TableCell>
                                                {tiposAtivos.map(t => (
                                                    <TableCell key={chaveTipo(t)} align="center" padding="checkbox">
                                                        <Checkbox size="small" checked={marcado(f, t)} onChange={() => alternar(f, t)} />
                                                    </TableCell>
                                                ))}
                                                <TableCell align="center" padding="checkbox">
                                                    {!ehPadrao && (
                                                        <Tooltip title="Ver pendentes desta função na fila de análise">
                                                            <IconButton size="small" onClick={() => irParaPendentes(f)} aria-label={`Ver pendentes de ${f}`} sx={{ color: cores.textoSecundario }}>
                                                                <PendentesIcon fontSize="small" />
                                                            </IconButton>
                                                        </Tooltip>
                                                    )}
                                                    {!ehPadrao && (
                                                        <Tooltip title={podeExcluir ? 'Excluir função' : `Em uso por ${usos} participante(s): troque a função deles antes`}>
                                                            <span>
                                                                <IconButton size="small" disabled={!podeExcluir} onClick={() => excluirFuncao(f)}
                                                                    aria-label={`Excluir função ${f}`} sx={acaoTabelaPerigo}>
                                                                    <DeleteIcon fontSize="small" />
                                                                </IconButton>
                                                            </span>
                                                        </Tooltip>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </TableContainer>

                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mt: 2 }}>
                            <TextField size="small" fullWidth placeholder="Nova função (ex.: ELETRICISTA)" value={novaFuncao}
                                onChange={(e) => setNovaFuncao(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && adicionarFuncao()} />
                            <NeonButton variant="outlined" startIcon={<AddIcon />} onClick={adicionarFuncao} sx={{ ...botaoSecundario, flexShrink: 0 }}>
                                Adicionar função
                            </NeonButton>
                        </Stack>
                        <Typography variant="caption" sx={{ display: 'block', color: cores.textoSecundario, mt: 1 }}>
                            A linha Todos (padrão) vale para todo participante; a linha da função soma documentos extras.
                            A função é comparada sem diferenciar maiúsculas/minúsculas. Funções com participantes não podem ser excluídas.
                        </Typography>
                    </GlassCard>

                    <GlassCard sx={{ p: 3, mt: 3 }}>
                        <Typography variant="subtitle1" sx={{ color: cores.textoForte, fontWeight: 700 }}>Obrigatórios para empresas</Typography>
                        <Typography variant="caption" sx={{ display: 'block', color: cores.textoSecundario, mb: 2 }}>
                            Documentos que cada empresa precisa entregar. Sem nenhum marcado, a situação da empresa segue só os documentos enviados.
                        </Typography>
                        {tiposAtivos.length === 0 && (
                            <Typography variant="body2" sx={{ color: cores.textoSecundario }}>Cadastre os tipos de documento primeiro.</Typography>
                        )}
                        <Grid container>
                            {tiposAtivos.map(t => (
                                <Grid item xs={12} sm={6} key={`emp-${chaveTipo(t)}`}>
                                    <Stack direction="row" alignItems="center">
                                        <Checkbox size="small" checked={tiposEmpresa.includes(chaveTipo(t))} onChange={() => alternarEmpresa(t)} />
                                        <Typography variant="body2" sx={{ color: cores.texto }}>{t.nome}</Typography>
                                    </Stack>
                                </Grid>
                            ))}
                        </Grid>
                    </GlassCard>
                </Grid>
            </Grid>

            <CatalogoDocumentosDialog
                open={abrirCatalogo}
                onClose={() => setAbrirCatalogo(false)}
                nomesExistentes={tipos.map(t => t.nome).filter(Boolean)}
                onAdicionar={adicionarDoCatalogo}
            />
            <CopiarConfiguracaoDialog
                open={abrirCopiar}
                onClose={() => setAbrirCopiar(false)}
                eventoAtualId={localStorage.getItem('active_evento_id')}
                onCopiado={aplicar}
            />
        </Box>
    );
};

export default ConfigDocumentos;
