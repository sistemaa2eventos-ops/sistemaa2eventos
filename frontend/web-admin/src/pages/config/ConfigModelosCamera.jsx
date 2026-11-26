import React, { useCallback, useEffect, useState, useMemo } from 'react';
import {
    Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Grid,
    IconButton, Stack, Switch, Table, TableBody, TableCell, TableContainer,
    TableHead, TableRow, TextField, Tooltip, Typography, Alert, InputAdornment
} from '@mui/material';
import {
    Add as AddIcon,
    Edit as EditIcon,
    Delete as DeleteIcon,
    Videocam as CameraIcon,
    CheckCircle as ActiveIcon,
    Factory as FactoryIcon,
    Search as SearchIcon,
    ContentCopy as CopyIcon,
    InfoOutlined as InfoIcon,
    SettingsRemote as StreamIcon
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import PageHeader from '../../components/common/PageHeader';
import GlassCard from '../../components/common/GlassCard';
import KpiCard from '../../components/common/KpiCard';
import NeonButton from '../../components/common/NeonButton';
import api from '../../services/api';
import { montarEnderecoRtsp, esconderSenha } from '../../utils/modelosCamera';
import { botaoSecundario, cores, fontes, tamanhos, tom, raios, acaoTabelaPerigo } from '../../styles/tokens';

const VAZIO = { nome: '', porta_padrao: 554, rtsp_principal: '', rtsp_sub: '', observacoes: '', ativo: true, ordem: 100 };
const EXEMPLO = { usuario: 'admin', senha: 'senha', ip: '192.168.1.100', porta: 554, canal: 1 };

export default function ConfigModelosCamera() {
    const { enqueueSnackbar } = useSnackbar();
    const [modelos, setModelos] = useState([]);
    const [editavel, setEditavel] = useState(true);
    const [carregando, setCarregando] = useState(true);
    const [form, setForm] = useState(null); // modelo sendo editado (id null = novo)
    const [salvando, setSalvando] = useState(false);
    const [busca, setBusca] = useState('');

    const carregar = useCallback(async () => {
        setCarregando(true);
        try {
            const { data } = await api.get('/modelos-camera', { params: { todos: '1' } });
            setModelos(data?.modelos || []);
            setEditavel(data?.editavel !== false);
        } catch (err) {
            enqueueSnackbar(`Não foi possível carregar os modelos: ${err.response?.data?.error || err.message}`, { variant: 'error' });
        } finally {
            setCarregando(false);
        }
    }, [enqueueSnackbar]);

    useEffect(() => { carregar(); }, [carregar]);

    const salvar = async () => {
        if (!form?.nome?.trim()) {
            enqueueSnackbar('O nome do modelo é obrigatório.', { variant: 'warning' });
            return;
        }
        setSalvando(true);
        try {
            const corpo = {
                nome: form.nome.trim(),
                porta_padrao: parseInt(form.porta_padrao, 10) || 554,
                rtsp_principal: form.rtsp_principal?.trim() || null,
                rtsp_sub: form.rtsp_sub?.trim() || null,
                observacoes: form.observacoes?.trim() || null,
                ativo: form.ativo !== false,
                ordem: parseInt(form.ordem, 10) || 100
            };
            if (form.id) await api.put(`/modelos-camera/${form.id}`, corpo);
            else await api.post('/modelos-camera', corpo);

            enqueueSnackbar('Modelo de câmera salvo com sucesso!', { variant: 'success' });
            setForm(null);
            carregar();
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || err.message, { variant: 'error' });
        } finally {
            setSalvando(false);
        }
    };

    const alternarAtivo = async (m) => {
        try {
            await api.put(`/modelos-camera/${m.id}`, { ativo: !m.ativo });
            carregar();
            enqueueSnackbar(`Modelo ${!m.ativo ? 'ativado' : 'desativado'}.`, { variant: 'info' });
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || err.message, { variant: 'error' });
        }
    };

    const apagar = async (m) => {
        if (!window.confirm(`Apagar o modelo "${m.nome}"? Câmeras já cadastradas continuam funcionando normalmente.`)) return;
        try {
            await api.delete(`/modelos-camera/${m.id}`);
            enqueueSnackbar('Modelo apagado com sucesso.', { variant: 'success' });
            carregar();
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || err.message, { variant: 'error' });
        }
    };

    const copiarTexto = (texto) => {
        if (!texto) return;
        navigator.clipboard.writeText(texto);
        enqueueSnackbar('Endereço RTSP copiado!', { variant: 'info' });
    };

    const exemplo = (padrao) => esconderSenha(montarEnderecoRtsp(padrao, { ...EXEMPLO, porta: form?.porta_padrao || 554 }));

    const modelosFiltrados = useMemo(() => {
        const termo = busca.trim().toLowerCase();
        if (!termo) return modelos;
        return modelos.filter(m =>
            m.nome?.toLowerCase().includes(termo) ||
            m.rtsp_principal?.toLowerCase().includes(termo) ||
            m.rtsp_sub?.toLowerCase().includes(termo) ||
            m.observacoes?.toLowerCase().includes(termo)
        );
    }, [modelos, busca]);

    const totalAtivos = modelos.filter(m => m.ativo !== false).length;
    const totalFabrica = modelos.filter(m => m.de_fabrica).length;
    const totalCustom = modelos.filter(m => !m.de_fabrica).length;

    return (
        <Box sx={{ p: { xs: 2, sm: 3, md: 4 }, maxWidth: 1600, mx: 'auto', width: '100%' }}>
            <PageHeader
                title="Modelos de câmera"
                subtitle="Padrões de endereço RTSP por fabricante. Ao cadastrar uma câmera, o sistema monta a URL do fluxo automaticamente."
                breadcrumbs={[{ text: 'Configurações' }, { text: 'Modelos de câmera' }]}
                action={
                    editavel && (
                        <NeonButton
                            startIcon={<AddIcon />}
                            onClick={() => setForm({ ...VAZIO })}
                            sx={{ width: { xs: '100%', sm: 'auto' } }}
                        >
                            Novo modelo
                        </NeonButton>
                    )
                }
            />

            {/* KPIs Padronizados */}
            <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={12} sm={6} lg={3}>
                    <KpiCard
                        titulo="Modelos Cadastrados"
                        valor={modelos.length}
                        icone={<CameraIcon />}
                        cor={cores.primaria}
                        rodape="Total de padrões no catálogo"
                    />
                </Grid>
                <Grid item xs={12} sm={6} lg={3}>
                    <KpiCard
                        titulo="Modelos Ativos"
                        valor={totalAtivos}
                        icone={<ActiveIcon />}
                        cor={cores.sucesso}
                        progresso={modelos.length ? Math.round((totalAtivos / modelos.length) * 100) : 0}
                        rodape="Disponíveis no cadastro de câmeras"
                    />
                </Grid>
                <Grid item xs={12} sm={6} lg={3}>
                    <KpiCard
                        titulo="Padrões de Fábrica"
                        valor={totalFabrica}
                        icone={<FactoryIcon />}
                        cor={cores.secundariaClara}
                        rodape="Intelbras, Hikvision, Dahua, etc."
                    />
                </Grid>
                <Grid item xs={12} sm={6} lg={3}>
                    <KpiCard
                        titulo="Personalizados"
                        valor={totalCustom}
                        icone={<StreamIcon />}
                        cor={cores.alerta}
                        rodape="Criados pela equipe técnica"
                    />
                </Grid>
            </Grid>

            {!editavel && (
                <Alert
                    severity="warning"
                    sx={{
                        mb: 3,
                        bgcolor: tom(cores.alerta, 0.08),
                        color: cores.texto,
                        border: `1px solid ${tom(cores.alerta, 0.3)}`
                    }}
                >
                    Modo somente leitura ativo: exibindo modelos de fábrica. Para criar e editar modelos customizados, execute a migration do banco.
                </Alert>
            )}

            <GlassCard sx={{ p: { xs: 2, md: 3 } }}>
                {/* Barra de Filtro e Busca */}
                <Box sx={{ mb: 2.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
                    <TextField
                        size="small"
                        placeholder="Buscar por fabricante, modelo ou URL RTSP..."
                        value={busca}
                        onChange={(e) => setBusca(e.target.value)}
                        sx={{
                            minWidth: { xs: '100%', sm: 340 },
                            '& .MuiOutlinedInput-root': {
                                bgcolor: cores.fundo,
                                borderRadius: raios.controle,
                                color: cores.textoForte,
                                '& fieldset': { borderColor: cores.borda },
                                '&:hover fieldset': { borderColor: cores.bordaDestaque },
                                '&.Mui-focused fieldset': { borderColor: cores.primaria }
                            }
                        }}
                        InputProps={{
                            startAdornment: (
                                <InputAdornment position="start">
                                    <SearchIcon sx={{ color: cores.primaria, fontSize: 20 }} />
                                </InputAdornment>
                            )
                        }}
                    />

                    <Typography variant="caption" sx={{ color: cores.textoSecundario }}>
                        Exibindo <b>{modelosFiltrados.length}</b> de {modelos.length} modelos
                    </Typography>
                </Box>

                {/* Tabela de Modelos */}
                <TableContainer sx={{ overflowX: 'auto', border: `1px solid ${cores.borda}`, borderRadius: raios.controle }}>
                    <Table size="small">
                        <TableHead sx={{ bgcolor: tom(cores.primaria, 0.04) }}>
                            <TableRow>
                                <TableCell sx={{ color: cores.textoSecundario, fontWeight: 700, fontSize: tamanhos.xs, letterSpacing: 0.8, textTransform: 'uppercase', py: 1.5 }}>
                                    Fabricante / Modelo
                                </TableCell>
                                <TableCell sx={{ color: cores.textoSecundario, fontWeight: 700, fontSize: tamanhos.xs, letterSpacing: 0.8, textTransform: 'uppercase', py: 1.5 }}>
                                    Endereço Principal (RTSP)
                                </TableCell>
                                <TableCell sx={{ color: cores.textoSecundario, fontWeight: 700, fontSize: tamanhos.xs, letterSpacing: 0.8, textTransform: 'uppercase', py: 1.5 }}>
                                    Sub-stream (IA e Miniatura)
                                </TableCell>
                                <TableCell align="center" sx={{ color: cores.textoSecundario, fontWeight: 700, fontSize: tamanhos.xs, letterSpacing: 0.8, textTransform: 'uppercase', py: 1.5 }}>
                                    Status
                                </TableCell>
                                <TableCell align="right" sx={{ color: cores.textoSecundario, fontWeight: 700, fontSize: tamanhos.xs, letterSpacing: 0.8, textTransform: 'uppercase', py: 1.5 }}>
                                    Ações
                                </TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {carregando && (
                                <TableRow>
                                    <TableCell colSpan={5} sx={{ py: 4, textAlign: 'center', color: cores.textoSecundario }}>
                                        Carregando catálogo de modelos de câmera...
                                    </TableCell>
                                </TableRow>
                            )}

                            {!carregando && modelosFiltrados.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={5} sx={{ py: 6, textAlign: 'center' }}>
                                        <CameraIcon sx={{ fontSize: 40, color: cores.textoFraco, mb: 1 }} />
                                        <Typography variant="body2" sx={{ color: cores.textoSecundario }}>
                                            Nenhum modelo de câmera encontrado para “{busca}”.
                                        </Typography>
                                    </TableCell>
                                </TableRow>
                            )}

                            {!carregando && modelosFiltrados.map((m) => (
                                <TableRow
                                    key={m.id || m.nome}
                                    sx={{
                                        '&:hover': { bgcolor: tom(cores.primaria, 0.04) },
                                        transition: 'background-color 0.15s ease'
                                    }}
                                >
                                    <TableCell sx={{ py: 1.8 }}>
                                        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                                            <Typography variant="body2" sx={{ fontWeight: 700, color: cores.textoForte }}>
                                                {m.nome}
                                            </Typography>
                                            {m.de_fabrica ? (
                                                <Chip
                                                    label="Padrão de fábrica"
                                                    size="small"
                                                    sx={{
                                                        fontSize: '0.6875rem',
                                                        fontWeight: 600,
                                                        height: 20,
                                                        bgcolor: tom(cores.secundariaClara, 0.12),
                                                        color: cores.secundariaClara,
                                                        border: `1px solid ${tom(cores.secundariaClara, 0.3)}`
                                                    }}
                                                />
                                            ) : (
                                                <Chip
                                                    label="Personalizado"
                                                    size="small"
                                                    sx={{
                                                        fontSize: '0.6875rem',
                                                        fontWeight: 600,
                                                        height: 20,
                                                        bgcolor: tom(cores.alerta, 0.12),
                                                        color: cores.alerta,
                                                        border: `1px solid ${tom(cores.alerta, 0.3)}`
                                                    }}
                                                />
                                            )}
                                        </Stack>
                                        {m.observacoes && (
                                            <Typography variant="caption" sx={{ color: cores.textoSecundario, display: 'block', mt: 0.5 }}>
                                                {m.observacoes}
                                            </Typography>
                                        )}
                                    </TableCell>

                                    <TableCell sx={{ py: 1.8 }}>
                                        {m.rtsp_principal ? (
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                <Typography
                                                    sx={{
                                                        fontFamily: 'monospace',
                                                        fontSize: '0.75rem',
                                                        wordBreak: 'break-all',
                                                        color: cores.texto
                                                    }}
                                                >
                                                    {m.rtsp_principal}
                                                </Typography>
                                                <Tooltip title="Copiar endereço RTSP">
                                                    <IconButton size="small" onClick={() => copiarTexto(m.rtsp_principal)} sx={{ color: cores.textoSecundario }}>
                                                        <CopyIcon sx={{ fontSize: 15 }} />
                                                    </IconButton>
                                                </Tooltip>
                                            </Box>
                                        ) : (
                                            <Typography variant="caption" sx={{ fontStyle: 'italic', color: cores.textoFraco }}>
                                                Informado manualmente por câmera
                                            </Typography>
                                        )}
                                    </TableCell>

                                    <TableCell sx={{ py: 1.8 }}>
                                        {m.rtsp_sub ? (
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                <Typography
                                                    sx={{
                                                        fontFamily: 'monospace',
                                                        fontSize: '0.75rem',
                                                        wordBreak: 'break-all',
                                                        color: cores.primaria
                                                    }}
                                                >
                                                    {m.rtsp_sub}
                                                </Typography>
                                                <Tooltip title="Copiar sub-stream">
                                                    <IconButton size="small" onClick={() => copiarTexto(m.rtsp_sub)} sx={{ color: cores.textoSecundario }}>
                                                        <CopyIcon sx={{ fontSize: 15 }} />
                                                    </IconButton>
                                                </Tooltip>
                                            </Box>
                                        ) : (
                                            <Typography variant="caption" sx={{ color: cores.textoFraco }}>
                                                —
                                            </Typography>
                                        )}
                                    </TableCell>

                                    <TableCell align="center" sx={{ py: 1.8 }}>
                                        <Switch
                                            size="small"
                                            checked={m.ativo !== false}
                                            disabled={!editavel || !m.id}
                                            onChange={() => alternarAtivo(m)}
                                            color="primary"
                                            inputProps={{ 'aria-label': `Ativar ${m.nome}` }}
                                        />
                                    </TableCell>

                                    <TableCell align="right" sx={{ py: 1.8 }}>
                                        {editavel && m.id && (
                                            <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                                                <Tooltip title="Editar modelo">
                                                    <IconButton
                                                        size="small"
                                                        onClick={() => setForm({
                                                            ...VAZIO,
                                                            ...m,
                                                            rtsp_principal: m.rtsp_principal || '',
                                                            rtsp_sub: m.rtsp_sub || '',
                                                            observacoes: m.observacoes || ''
                                                        })}
                                                        sx={{ color: cores.primaria }}
                                                    >
                                                        <EditIcon fontSize="small" />
                                                    </IconButton>
                                                </Tooltip>
                                                {!m.de_fabrica && (
                                                    <Tooltip title="Excluir modelo">
                                                        <IconButton
                                                            size="small"
                                                            onClick={() => apagar(m)}
                                                            sx={acaoTabelaPerigo}
                                                        >
                                                            <DeleteIcon fontSize="small" />
                                                        </IconButton>
                                                    </Tooltip>
                                                )}
                                            </Stack>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            </GlassCard>

            {/* Modal de Criação / Edição de Modelo */}
            <Dialog
                open={Boolean(form)}
                onClose={() => setForm(null)}
                maxWidth="md"
                fullWidth
                PaperProps={{
                    sx: {
                        bgcolor: cores.superficie,
                        border: `1px solid ${cores.bordaDestaque}`,
                        borderRadius: raios.cartao,
                        backgroundImage: 'none'
                    }
                }}
            >
                <DialogTitle sx={{ fontFamily: fontes.titulo, fontWeight: 700, color: cores.textoForte, pb: 1 }}>
                    {form?.id ? `Editar: ${form?.nome}` : 'Novo Modelo de Câmera'}
                </DialogTitle>

                {form && (
                    <DialogContent dividers sx={{ borderColor: cores.borda }}>
                        <Box
                            sx={{
                                p: 2,
                                mb: 3,
                                borderRadius: raios.controle,
                                bgcolor: tom(cores.primaria, 0.08),
                                border: `1px solid ${tom(cores.primaria, 0.25)}`,
                                display: 'flex',
                                gap: 1.5,
                                alignItems: 'flex-start'
                            }}
                        >
                            <InfoIcon sx={{ color: cores.primaria, fontSize: 20, mt: 0.25, flexShrink: 0 }} />
                            <Typography variant="caption" sx={{ color: cores.textoSuave, lineHeight: 1.5 }}>
                                Use as variáveis <b>{'{auth}'}</b> (usuário e senha criptografados da câmera), <b>{'{ip}'}</b>, <b>{'{porta}'}</b> e <b>{'{canal}'}</b>. Não insira senhas reais no modelo, pois elas serão injetadas dinamicamente ao cadastrar cada câmera do evento.
                            </Typography>
                        </Box>

                        <Grid container spacing={2.5}>
                            <Grid item xs={12} sm={8}>
                                <Typography variant="caption" sx={{ color: cores.textoSecundario, fontWeight: 600, display: 'block', mb: 0.75 }}>
                                    NOME DO MODELO / FABRICANTE *
                                </Typography>
                                <TextField
                                    fullWidth
                                    size="small"
                                    required
                                    value={form.nome}
                                    placeholder="Ex.: Intelbras VIP 1230, Hikvision DS-2CD, Genérica ONVIF"
                                    onChange={(e) => setForm({ ...form, nome: e.target.value })}
                                    sx={{
                                        '& .MuiOutlinedInput-root': {
                                            bgcolor: cores.fundo,
                                            borderRadius: raios.controle,
                                            color: cores.textoForte,
                                            '& fieldset': { borderColor: cores.borda }
                                        }
                                    }}
                                />
                            </Grid>
                            <Grid item xs={12} sm={4}>
                                <Typography variant="caption" sx={{ color: cores.textoSecundario, fontWeight: 600, display: 'block', mb: 0.75 }}>
                                    PORTA RTSP PADRÃO
                                </Typography>
                                <TextField
                                    fullWidth
                                    size="small"
                                    type="number"
                                    value={form.porta_padrao}
                                    onChange={(e) => setForm({ ...form, porta_padrao: e.target.value })}
                                    sx={{
                                        '& .MuiOutlinedInput-root': {
                                            bgcolor: cores.fundo,
                                            borderRadius: raios.controle,
                                            color: cores.textoForte,
                                            '& fieldset': { borderColor: cores.borda }
                                        }
                                    }}
                                />
                            </Grid>

                            <Grid item xs={12}>
                                <Typography variant="caption" sx={{ color: cores.textoSecundario, fontWeight: 600, display: 'block', mb: 0.75 }}>
                                    ENDEREÇO RTSP PRINCIPAL (ALTA DEFINIÇÃO)
                                </Typography>
                                <TextField
                                    fullWidth
                                    size="small"
                                    value={form.rtsp_principal}
                                    placeholder="rtsp://{auth}{ip}:{porta}/cam/realmonitor?channel={canal}&subtype=0"
                                    onChange={(e) => setForm({ ...form, rtsp_principal: e.target.value })}
                                    helperText={
                                        form.rtsp_principal
                                            ? `Prévia resolvida: ${exemplo(form.rtsp_principal) || 'Preencha o padrão com {ip}'}`
                                            : 'Deixe em branco para permitir que o endereço completo seja digitado em cada câmera.'
                                    }
                                    sx={{
                                        '& .MuiOutlinedInput-root': {
                                            bgcolor: cores.fundo,
                                            borderRadius: raios.controle,
                                            color: cores.textoForte,
                                            fontFamily: 'monospace',
                                            '& fieldset': { borderColor: cores.borda }
                                        },
                                        '& .MuiFormHelperText-root': { color: cores.textoSecundario }
                                    }}
                                />
                            </Grid>

                            <Grid item xs={12}>
                                <Typography variant="caption" sx={{ color: cores.textoSecundario, fontWeight: 600, display: 'block', mb: 0.75 }}>
                                    SUB-STREAM (LEVE - PARA IA FACIAL E MINIATURAS)
                                </Typography>
                                <TextField
                                    fullWidth
                                    size="small"
                                    value={form.rtsp_sub}
                                    placeholder="rtsp://{auth}{ip}:{porta}/cam/realmonitor?channel={canal}&subtype=1"
                                    onChange={(e) => setForm({ ...form, rtsp_sub: e.target.value })}
                                    helperText={
                                        form.rtsp_sub
                                            ? `Prévia resolvida: ${exemplo(form.rtsp_sub) || 'Preencha o padrão com {ip}'}`
                                            : 'Recomendado para aliviar o processamento do motor de IA facial.'
                                    }
                                    sx={{
                                        '& .MuiOutlinedInput-root': {
                                            bgcolor: cores.fundo,
                                            borderRadius: raios.controle,
                                            color: cores.textoForte,
                                            fontFamily: 'monospace',
                                            '& fieldset': { borderColor: cores.borda }
                                        },
                                        '& .MuiFormHelperText-root': { color: cores.textoSecundario }
                                    }}
                                />
                            </Grid>

                            <Grid item xs={12}>
                                <Typography variant="caption" sx={{ color: cores.textoSecundario, fontWeight: 600, display: 'block', mb: 0.75 }}>
                                    ORIENTAÇÕES E OBSERVAÇÕES PARA A EQUIPE
                                </Typography>
                                <TextField
                                    fullWidth
                                    multiline
                                    minRows={2}
                                    value={form.observacoes}
                                    placeholder="Ex.: Usuário padrão 'admin'; exige ativar ONVIF no menu de rede da câmera."
                                    onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
                                    sx={{
                                        '& .MuiOutlinedInput-root': {
                                            bgcolor: cores.fundo,
                                            borderRadius: raios.controle,
                                            color: cores.textoForte,
                                            '& fieldset': { borderColor: cores.borda }
                                        }
                                    }}
                                />
                            </Grid>
                        </Grid>
                    </DialogContent>
                )}

                <DialogActions sx={{ p: 2, borderTop: `1px solid ${cores.borda}`, gap: 1 }}>
                    <Button onClick={() => setForm(null)} sx={botaoSecundario}>
                        Cancelar
                    </Button>
                    <NeonButton onClick={salvar} loading={salvando} disabled={salvando || !form?.nome?.trim()}>
                        Salvar modelo
                    </NeonButton>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
