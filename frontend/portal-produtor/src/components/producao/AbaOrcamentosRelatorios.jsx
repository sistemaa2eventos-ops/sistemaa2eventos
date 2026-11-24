import React, { useState, useEffect } from 'react';
import {
    Alert,
    Box,
    Button,
    Checkbox,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    FormControl,
    FormControlLabel,
    Grid,
    IconButton,
    InputLabel,
    MenuItem,
    Select,
    Slider,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Tooltip,
    Typography
} from '@mui/material';
import {
    Add as AddIcon,
    PictureAsPdf as PdfIcon,
    Save as SaveIcon,
    Lock as LockIcon,
    Delete as DeleteIcon,
    History as AuditoriaIcon
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import { useConfirmacao } from '../../contexts/ConfirmacaoContext';
import GlassCard from '../common/GlassCard';
import NeonButton from '../common/NeonButton';
import TituloModal from '../common/TituloModal';
import api from '../../services/api';
import { acaoTabelaPerigo, botaoSecundario, cores, funcao, tamanhos, tom } from '../../styles/tokens';
import { formatarDataHoraCurta, formatarMoedaCentavos, obterNomeArea } from './producaoHelpers';

const AbaOrcamentosRelatorios = ({ resumo, headersExtra, aoAtualizar, apiClient }) => {
    const httpClient = apiClient || api;
    const { enqueueSnackbar } = useSnackbar();
    const confirmar = useConfirmacao();
    const areas = resumo?.areas || [];
    const orcamentos = resumo?.orcamentos || [];
    const produtores = resumo?.produtores || [];
    const auditoria = resumo?.auditoria || [];
    const kpis = resumo?.kpis || {};
    const restrito = Boolean(resumo?.orcamentos_restrito);
    const ctx = resumo?.contexto_usuario || {};
    const podeCriarOrcamento = ['admin_master', 'master', 'produtor_geral', 'financeiro'].includes(ctx.papel_producao);

    const [tpl, setTpl] = useState(resumo?.template_relatorio || {});
    const [salvandoTpl, setSalvandoTpl] = useState(false);
    const [baixandoPdf, setBaixandoPdf] = useState('');
    const [modalOrcAberto, setModalOrcAberto] = useState(false);
    const [formOrc, setFormOrc] = useState({
        titulo: '',
        area_id: '',
        fornecedor_nome: '',
        valor_previsto_reais: '5000',
        valor_realizado_reais: '0',
        status: 'rascunho'
    });

    useEffect(() => {
        if (resumo?.template_relatorio) {
            setTpl(resumo.template_relatorio);
        }
    }, [resumo?.template_relatorio]);

    const totalCachesCentavos = !restrito
        ? produtores.reduce((s, p) => s + Number(p.valor_cache_centavos || 0), 0)
        : 0;
    const totalOrcPrev = orcamentos.reduce((s, o) => s + Number(o.valor_previsto_centavos || 0), 0);
    const totalOrcReal = orcamentos.reduce((s, o) => s + Number(o.valor_realizado_centavos || 0), 0);

    const handleSalvarTemplate = async () => {
        try {
            setSalvandoTpl(true);
            await httpClient.put('/producao/relatorios/template', tpl, { headers: headersExtra });
            enqueueSnackbar('Template de relatório PDF atualizado.', { variant: 'success' });
            await aoAtualizar();
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Erro ao salvar template.', { variant: 'error' });
        } finally {
            setSalvandoTpl(false);
        }
    };

    const handleGerarPdf = async (tipo) => {
        try {
            setBaixandoPdf(tipo);
            const res = await httpClient.get('/producao/relatorios/pdf', {
                params: { tipo, data: new Date().toISOString().slice(0, 10) },
                headers: headersExtra,
                responseType: 'blob'
            });
            const blob = new Blob([res.data], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `relatorio-producao-${tipo}.pdf`;
            a.click();
            URL.revokeObjectURL(url);
            enqueueSnackbar('Relatório PDF gerado e baixado.', { variant: 'success' });
            await aoAtualizar();
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Falha ao gerar PDF.', { variant: 'error' });
        } finally {
            setBaixandoPdf('');
        }
    };

    const handleCriarOrcamento = async () => {
        if (!formOrc.titulo.trim()) {
            enqueueSnackbar('Informe o título do item orçamentário.', { variant: 'warning' });
            return;
        }
        try {
            const prev = Math.round(Number(String(formOrc.valor_previsto_reais || '0').replace(',', '.')) * 100);
            const real = Math.round(Number(String(formOrc.valor_realizado_reais || '0').replace(',', '.')) * 100);
            await httpClient.post('/producao/orcamentos', {
                titulo: formOrc.titulo,
                area_id: formOrc.area_id || null,
                fornecedor_nome: formOrc.fornecedor_nome,
                valor_previsto_centavos: Number.isFinite(prev) ? prev : 0,
                valor_realizado_centavos: Number.isFinite(real) ? real : 0,
                status: formOrc.status
            }, { headers: headersExtra });
            enqueueSnackbar('Orçamento adicionado.', { variant: 'success' });
            setModalOrcAberto(false);
            setFormOrc({ titulo: '', area_id: '', fornecedor_nome: '', valor_previsto_reais: '5000', valor_realizado_reais: '0', status: 'rascunho' });
            await aoAtualizar();
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Sem permissão para criar orçamento.', { variant: 'error' });
        }
    };

    const handleAtualizarOrcamento = async (id, campos) => {
        try {
            await httpClient.put(`/producao/orcamentos/${id}`, campos, { headers: headersExtra });
            enqueueSnackbar('Orçamento atualizado.', { variant: 'success' });
            await aoAtualizar();
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Erro ao atualizar orçamento.', { variant: 'error' });
        }
    };

    const handleExcluirOrcamento = async (orc) => {
        const ok = await confirmar({
            titulo: 'Excluir lançamento orçamentário',
            mensagem: `Deseja excluir "${orc.titulo}" definitivamente?`,
            textoConfirmar: 'Excluir'
        });
        if (!ok) return;
        try {
            await httpClient.delete(`/producao/orcamentos/${orc.id}`, { headers: headersExtra });
            enqueueSnackbar('Orçamento removido.', { variant: 'success' });
            await aoAtualizar();
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Erro ao excluir orçamento.', { variant: 'error' });
        }
    };

    return (
        <Stack spacing={3}>
            {/* Orçamentos (Restrito no Servidor) */}
            <GlassCard sx={{ p: 2.5 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1.5, mb: 2 }}>
                    <Box>
                        <Typography variant="h6" sx={{ color: cores.textoForte }}>
                            Orçamentos e custos da produção
                        </Typography>
                        <Typography variant="body2" sx={{ color: cores.textoSecundario }}>
                            Controle de previsto e realizado por área, fornecedor e cachês de equipe.
                        </Typography>
                    </Box>
                    {!restrito && podeCriarOrcamento && (
                        <NeonButton startIcon={<AddIcon />} onClick={() => setModalOrcAberto(true)}>
                            Novo orçamento
                        </NeonButton>
                    )}
                </Box>

                {restrito ? (
                    <Alert icon={<LockIcon />} severity="info">
                        Visão financeira restrita. Apenas Financeiro, Auditoria e Produtor Geral visualizam orçamentos e cachês consolidados.
                    </Alert>
                ) : (
                    <>
                        <Grid container spacing={2} sx={{ mb: 2 }}>
                            <Grid item xs={12} sm={6} md={3}>
                                <Box sx={{ p: 1.75, borderRadius: 2, bgcolor: cores.superficieElevada, border: `1px solid ${cores.borda}` }}>
                                    <Typography sx={{ fontSize: tamanhos.xs, color: cores.textoSecundario }}>Total previsto (itens)</Typography>
                                    <Typography variant="h6" sx={{ color: cores.textoForte }}>{formatarMoedaCentavos(totalOrcPrev)}</Typography>
                                </Box>
                            </Grid>
                            <Grid item xs={12} sm={6} md={3}>
                                <Box sx={{ p: 1.75, borderRadius: 2, bgcolor: cores.superficieElevada, border: `1px solid ${cores.borda}` }}>
                                    <Typography sx={{ fontSize: tamanhos.xs, color: cores.textoSecundario }}>Total realizado (itens)</Typography>
                                    <Typography variant="h6" sx={{ color: totalOrcReal > totalOrcPrev ? funcao.alerta : funcao.liberado }}>
                                        {formatarMoedaCentavos(totalOrcReal)}
                                    </Typography>
                                </Box>
                            </Grid>
                            <Grid item xs={12} sm={6} md={3}>
                                <Box sx={{ p: 1.75, borderRadius: 2, bgcolor: cores.superficieElevada, border: `1px solid ${cores.borda}` }}>
                                    <Typography sx={{ fontSize: tamanhos.xs, color: cores.textoSecundario }}>Soma de cachês cadastrados</Typography>
                                    <Typography variant="h6" sx={{ color: funcao.acao }}>{formatarMoedaCentavos(totalCachesCentavos)}</Typography>
                                </Box>
                            </Grid>
                            <Grid item xs={12} sm={6} md={3}>
                                <Box sx={{ p: 1.75, borderRadius: 2, bgcolor: cores.superficieElevada, border: `1px solid ${cores.borda}` }}>
                                    <Typography sx={{ fontSize: tamanhos.xs, color: cores.textoSecundario }}>Impacto estimado de dobras</Typography>
                                    <Typography variant="h6" sx={{ color: (kpis.custo_dobras_centavos || 0) > 0 ? funcao.alerta : funcao.liberado }}>
                                        {formatarMoedaCentavos(kpis.custo_dobras_centavos || 0)}
                                    </Typography>
                                </Box>
                            </Grid>
                        </Grid>

                        <TableContainer>
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Item</TableCell>
                                        <TableCell>Área</TableCell>
                                        <TableCell>Fornecedor</TableCell>
                                        <TableCell align="right">Previsto</TableCell>
                                        <TableCell align="right">Realizado</TableCell>
                                        <TableCell>Status</TableCell>
                                        {podeCriarOrcamento && <TableCell align="right">Ações</TableCell>}
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {orcamentos.map((o) => (
                                        <TableRow key={o.id}>
                                            <TableCell sx={{ fontWeight: 600 }}>{o.titulo}</TableCell>
                                            <TableCell>{obterNomeArea(areas, o.area_id)}</TableCell>
                                            <TableCell>{o.fornecedor_nome || '—'}</TableCell>
                                            <TableCell align="right">{formatarMoedaCentavos(o.valor_previsto_centavos)}</TableCell>
                                            <TableCell align="right">
                                                {podeCriarOrcamento ? (
                                                    <TextField
                                                        size="small"
                                                        type="number"
                                                        defaultValue={(Number(o.valor_realizado_centavos || 0) / 100).toFixed(0)}
                                                        onBlur={(e) => {
                                                            const novoVal = Math.round(Number(e.target.value || 0) * 100);
                                                            if (Number.isFinite(novoVal) && novoVal !== Number(o.valor_realizado_centavos || 0)) {
                                                                handleAtualizarOrcamento(o.id, { valor_realizado_centavos: novoVal });
                                                            }
                                                        }}
                                                        sx={{ width: 105 }}
                                                    />
                                                ) : (
                                                    formatarMoedaCentavos(o.valor_realizado_centavos)
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                {podeCriarOrcamento ? (
                                                    <Select
                                                        size="small"
                                                        value={o.status || 'rascunho'}
                                                        onChange={(e) => handleAtualizarOrcamento(o.id, { status: e.target.value })}
                                                    >
                                                        <MenuItem value="rascunho">Rascunho</MenuItem>
                                                        <MenuItem value="enviado">Enviado</MenuItem>
                                                        <MenuItem value="aprovado">Aprovado</MenuItem>
                                                        <MenuItem value="recusado">Recusado</MenuItem>
                                                        <MenuItem value="liquidado">Liquidado</MenuItem>
                                                    </Select>
                                                ) : (
                                                    <Chip size="small" label={o.status} sx={{ bgcolor: tom(funcao.acao, 0.14), color: funcao.acao, fontWeight: 600 }} />
                                                )}
                                            </TableCell>
                                            {podeCriarOrcamento && (
                                                <TableCell align="right">
                                                    <Tooltip title="Excluir orçamento">
                                                        <IconButton size="small" aria-label="Excluir orçamento" onClick={() => handleExcluirOrcamento(o)} sx={acaoTabelaPerigo}>
                                                            <DeleteIcon fontSize="small" />
                                                        </IconButton>
                                                    </Tooltip>
                                                </TableCell>
                                            )}
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </>
                )}
            </GlassCard>

            {/* Emissão e Template de Relatórios PDF */}
            <Grid container spacing={2.5}>
                <Grid item xs={12} lg={6}>
                    <GlassCard sx={{ p: 2.5, height: '100%' }}>
                        <Typography variant="h6" sx={{ color: cores.textoForte, mb: 0.5 }}>
                            Personalização de relatório PDF
                        </Typography>
                        <Typography variant="body2" sx={{ color: cores.textoSecundario, mb: 2 }}>
                            Defina cabeçalho, rodapé, marca d&apos;água e envio automático diário.
                        </Typography>
                        <Stack spacing={1.75}>
                            <TextField
                                fullWidth
                                size="small"
                                label="Texto da marca d'água"
                                value={tpl.marca_dagua_texto || ''}
                                onChange={(e) => setTpl({ ...tpl, marca_dagua_texto: e.target.value })}
                            />
                            <Box>
                                <Typography sx={{ fontSize: tamanhos.xs, color: cores.textoSecundario }}>
                                    Opacidade da marca d&apos;água: {Math.round((tpl.marca_dagua_opacidade || 0.08) * 100)}%
                                </Typography>
                                <Slider
                                    size="small"
                                    min={0.02}
                                    max={0.35}
                                    step={0.02}
                                    value={Number(tpl.marca_dagua_opacidade || 0.08)}
                                    onChange={(_, v) => setTpl({ ...tpl, marca_dagua_opacidade: v })}
                                />
                            </Box>
                            <Grid container spacing={1.5}>
                                <Grid item xs={12} sm={6}>
                                    <TextField
                                        fullWidth
                                        size="small"
                                        label="Cor do cabeçalho (hex)"
                                        value={tpl.cor_cabecalho_hex || '#0A1628'}
                                        onChange={(e) => setTpl({ ...tpl, cor_cabecalho_hex: e.target.value })}
                                    />
                                </Grid>
                                <Grid item xs={12} sm={6}>
                                    <TextField
                                        fullWidth
                                        size="small"
                                        type="time"
                                        label="Horário do diário automático"
                                        InputLabelProps={{ shrink: true }}
                                        value={tpl.horario_diario_automatico || '22:00'}
                                        onChange={(e) => setTpl({ ...tpl, horario_diario_automatico: e.target.value })}
                                    />
                                </Grid>
                            </Grid>
                            <TextField
                                fullWidth
                                size="small"
                                label="Rodapé personalizado"
                                value={tpl.rodape_personalizado || ''}
                                onChange={(e) => setTpl({ ...tpl, rodape_personalizado: e.target.value })}
                            />
                            <FormControlLabel
                                control={<Checkbox checked={tpl.exibir_fotos_evidencia !== false} onChange={(e) => setTpl({ ...tpl, exibir_fotos_evidencia: e.target.checked })} />}
                                label="Incluir fotos-chave de evidência no relatório diário"
                            />
                            <Box>
                                <NeonButton startIcon={<SaveIcon />} loading={salvandoTpl} onClick={handleSalvarTemplate}>
                                    Salvar template
                                </NeonButton>
                            </Box>
                        </Stack>
                    </GlassCard>
                </Grid>

                <Grid item xs={12} lg={6}>
                    <GlassCard sx={{ p: 2.5, height: '100%' }}>
                        <Typography variant="h6" sx={{ color: cores.textoForte, mb: 0.5 }}>
                            Gerar e baixar relatórios PDF
                        </Typography>
                        <Typography variant="body2" sx={{ color: cores.textoSecundario, mb: 2 }}>
                            Os documentos aplicam sua marca d&apos;água e respeitam as permissões do usuário.
                        </Typography>
                        <Stack spacing={1.25} sx={{ mb: 2.5 }}>
                            {[
                                { tipo: 'diario_automatico', label: 'Relatório diário completo (resumo, tarefas, materiais e presença)' },
                                { tipo: 'tarefas_area', label: 'Relatório de tarefas e etapas por área' },
                                { tipo: 'materiais_conferencia', label: 'Conferência de materiais e divergências IA' },
                                { tipo: 'presenca_dobras', label: 'Presença de equipe e controle de dobras' },
                                ...(!restrito ? [{ tipo: 'financeiro_executivo', label: 'Relatório financeiro e orçamentário (restrito)' }] : [])
                            ].map((item) => (
                                <Button
                                    key={item.tipo}
                                    fullWidth
                                    variant="outlined"
                                    startIcon={<PdfIcon />}
                                    disabled={Boolean(baixandoPdf)}
                                    onClick={() => handleGerarPdf(item.tipo)}
                                    sx={{ ...botaoSecundario, justifyContent: 'flex-start' }}
                                >
                                    {baixandoPdf === item.tipo ? 'Gerando PDF...' : item.label}
                                </Button>
                            ))}
                        </Stack>

                        {(resumo?.relatorios_gerados || []).length > 0 && (
                            <Box>
                                <Typography variant="subtitle2" sx={{ color: cores.textoForte, mb: 1 }}>
                                    Últimos relatórios emitidos
                                </Typography>
                                <Stack spacing={0.75}>
                                    {resumo.relatorios_gerados.slice(0, 4).map((rel) => (
                                        <Box key={rel.id} sx={{ p: 1, borderRadius: 1.5, bgcolor: cores.fundo, border: `1px solid ${cores.borda}`, display: 'flex', justifyContent: 'space-between' }}>
                                            <Typography sx={{ fontSize: tamanhos.xs, color: cores.textoSuave }}>
                                                {rel.tipo} • {rel.gerado_por_nome}
                                            </Typography>
                                            <Typography sx={{ fontSize: tamanhos.xs, color: cores.textoSecundario }}>
                                                {formatarDataHoraCurta(rel.gerado_em)}
                                            </Typography>
                                        </Box>
                                    ))}
                                </Stack>
                            </Box>
                        )}
                    </GlassCard>
                </Grid>
            </Grid>

            {/* Trilha de auditoria dedicada */}
            <GlassCard sx={{ p: 2.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                    <AuditoriaIcon sx={{ color: funcao.fiscalizacao }} />
                    <Typography variant="h6" sx={{ color: cores.textoForte }}>
                        Trilha de auditoria da produção
                    </Typography>
                </Box>
                <TableContainer>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>Data e hora</TableCell>
                                <TableCell>Usuário</TableCell>
                                <TableCell>Ação</TableCell>
                                <TableCell>Entidade</TableCell>
                                <TableCell>Detalhes</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {auditoria.slice(0, 20).map((log) => (
                                <TableRow key={log.id}>
                                    <TableCell>{formatarDataHoraCurta(log.criado_em)}</TableCell>
                                    <TableCell sx={{ fontWeight: 600 }}>{log.usuario_nome || 'Sistema'}</TableCell>
                                    <TableCell>
                                        <Chip size="small" label={log.acao} sx={{ bgcolor: tom(funcao.fiscalizacao, 0.14), color: funcao.fiscalizacao, fontSize: '0.7rem' }} />
                                    </TableCell>
                                    <TableCell>{log.entidade}</TableCell>
                                    <TableCell sx={{ fontSize: tamanhos.xs, color: cores.textoSecundario }}>
                                        {log.depois ? JSON.stringify(log.depois) : (log.antes ? JSON.stringify(log.antes) : '—')}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            </GlassCard>

            {/* Modal novo orçamento */}
            <Dialog open={modalOrcAberto} onClose={() => setModalOrcAberto(false)} maxWidth="sm" fullWidth>
                <TituloModal titulo="Novo lançamento orçamentário" subtitulo="Comparativo previsto e realizado por área." onFechar={() => setModalOrcAberto(false)} />
                <DialogContent dividers>
                    <Stack spacing={2} sx={{ pt: 0.5 }}>
                        <TextField fullWidth label="Descrição do orçamento" value={formOrc.titulo} onChange={(e) => setFormOrc({ ...formOrc, titulo: e.target.value })} />
                        <Grid container spacing={1.5}>
                            <Grid item xs={12} sm={6}>
                                <FormControl fullWidth size="small">
                                    <InputLabel>Área</InputLabel>
                                    <Select label="Área" value={formOrc.area_id} onChange={(e) => setFormOrc({ ...formOrc, area_id: e.target.value })}>
                                        <MenuItem value="">Geral</MenuItem>
                                        {areas.map((a) => <MenuItem key={a.id} value={a.id}>{a.nome}</MenuItem>)}
                                    </Select>
                                </FormControl>
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField fullWidth size="small" label="Fornecedor" value={formOrc.fornecedor_nome} onChange={(e) => setFormOrc({ ...formOrc, fornecedor_nome: e.target.value })} />
                            </Grid>
                        </Grid>
                        <Grid container spacing={1.5}>
                            <Grid item xs={12} sm={4}>
                                <TextField fullWidth size="small" type="number" label="Previsto (R$)" value={formOrc.valor_previsto_reais} onChange={(e) => setFormOrc({ ...formOrc, valor_previsto_reais: e.target.value })} />
                            </Grid>
                            <Grid item xs={12} sm={4}>
                                <TextField fullWidth size="small" type="number" label="Realizado (R$)" value={formOrc.valor_realizado_reais} onChange={(e) => setFormOrc({ ...formOrc, valor_realizado_reais: e.target.value })} />
                            </Grid>
                            <Grid item xs={12} sm={4}>
                                <FormControl fullWidth size="small">
                                    <InputLabel>Status</InputLabel>
                                    <Select label="Status" value={formOrc.status} onChange={(e) => setFormOrc({ ...formOrc, status: e.target.value })}>
                                        <MenuItem value="rascunho">Rascunho</MenuItem>
                                        <MenuItem value="enviado">Enviado</MenuItem>
                                        <MenuItem value="aprovado">Aprovado</MenuItem>
                                        <MenuItem value="liquidado">Liquidado</MenuItem>
                                    </Select>
                                </FormControl>
                            </Grid>
                        </Grid>
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ px: 3, py: 2 }}>
                    <Button variant="outlined" onClick={() => setModalOrcAberto(false)} sx={botaoSecundario}>
                        Cancelar
                    </Button>
                    <NeonButton onClick={handleCriarOrcamento}>
                        Salvar orçamento
                    </NeonButton>
                </DialogActions>
            </Dialog>
        </Stack>
    );
};

export default AbaOrcamentosRelatorios;
