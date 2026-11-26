import React, { useEffect, useMemo, useState } from 'react';
import {
    Box, CircularProgress, FormControlLabel, Grid, IconButton, MenuItem, Stack, Switch, TextField, Tooltip, Typography
} from '@mui/material';
import {
    Add as AddIcon, ArrowDownward as DescerIcon, ArrowUpward as SubirIcon, Delete as DeleteIcon, FileDownload as DownloadIcon
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import api from '../../services/api';
import PageHeader from '../../components/common/PageHeader';
import GlassCard from '../../components/common/GlassCard';
import NeonButton from '../../components/common/NeonButton';
import { baixarModeloPlanilha } from '../../components/empresas/planilhaEmpresa';
import { cores, botaoSecundario, acaoTabela, acaoTabelaPerigo } from '../../styles/tokens';

const tituloSecao = (texto) => (
    <Typography variant="subtitle1" sx={{ color: cores.textoForte, fontWeight: 700, mb: 2 }}>{texto}</Typography>
);

/**
 * Modelo da planilha de participantes do evento: cabeçalho (título, evento, empresa, instruções)
 * e colunas (campo, título, obrigatória, ordem). É a planilha que as empresas baixam, preenchem
 * e o painel importa; a exportação da empresa sai no mesmo formato.
 */
const ConfigPlanilha = () => {
    const { enqueueSnackbar } = useSnackbar();
    const [carregando, setCarregando] = useState(true);
    const [salvando, setSalvando] = useState(false);
    const [alterado, setAlterado] = useState(false);
    const [modelo, setModelo] = useState(null);
    const [campos, setCampos] = useState([]);
    const [novoCampo, setNovoCampo] = useState('');

    useEffect(() => {
        api.get('/planilha/modelo')
            .then(resp => {
                setModelo(resp.data?.data?.modelo || null);
                setCampos(resp.data?.data?.campos || []);
            })
            .catch(() => enqueueSnackbar('Erro ao carregar o modelo da planilha.', { variant: 'error' }))
            .finally(() => setCarregando(false));
    }, [enqueueSnackbar]);

    const campoPorChave = useMemo(() => Object.fromEntries(campos.map(c => [c.campo, c])), [campos]);
    const camposLivres = useMemo(
        () => campos.filter(c => !(modelo?.colunas || []).some(col => col.campo === c.campo)),
        [campos, modelo]
    );

    const mudar = (alteracao) => {
        setAlterado(true);
        setModelo(prev => ({ ...prev, ...alteracao }));
    };
    const mudarColuna = (idx, alteracao) => mudar({ colunas: modelo.colunas.map((c, i) => (i === idx ? { ...c, ...alteracao } : c)) });
    const moverColuna = (idx, passo) => {
        const destino = idx + passo;
        if (destino < 0 || destino >= modelo.colunas.length) return;
        const colunas = [...modelo.colunas];
        [colunas[idx], colunas[destino]] = [colunas[destino], colunas[idx]];
        mudar({ colunas });
    };
    const removerColuna = (idx) => mudar({ colunas: modelo.colunas.filter((_, i) => i !== idx) });
    const adicionarColuna = () => {
        const def = campoPorChave[novoCampo];
        if (!def) return;
        mudar({ colunas: [...modelo.colunas, { campo: def.campo, rotulo: def.rotulo, obrigatoria: false }] });
        setNovoCampo('');
    };

    const salvar = async () => {
        setSalvando(true);
        try {
            const resp = await api.put('/planilha/modelo', modelo);
            setModelo(resp.data?.data?.modelo || modelo);
            setAlterado(false);
            enqueueSnackbar('Modelo da planilha salvo.', { variant: 'success' });
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Erro ao salvar o modelo.', { variant: 'error' });
        } finally {
            setSalvando(false);
        }
    };

    const baixarExemplo = async () => {
        if (alterado) enqueueSnackbar('O arquivo sai com o modelo salvo. Salve antes para ver as mudanças.', { variant: 'info' });
        try { await baixarModeloPlanilha(); } catch (err) { enqueueSnackbar(err.message, { variant: 'error' }); }
    };

    if (carregando) {
        return <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>;
    }
    if (!modelo) {
        return <Box sx={{ p: 4 }}><Typography sx={{ color: cores.textoSecundario }}>Selecione um evento para configurar a planilha.</Typography></Box>;
    }

    const eventoNome = localStorage.getItem('active_evento_nome') || 'Nome do evento';

    return (
        <Box sx={{ p: { xs: 2, sm: 3, md: 4 }, maxWidth: 1600, mx: 'auto', width: '100%' }}>
            <PageHeader
                title="Planilha de participantes"
                subtitle="Modelo que as empresas preenchem para pré-cadastrar a equipe. A importação e a exportação de cada empresa usam estas colunas."
                breadcrumbs={[{ text: 'Configurações' }, { text: 'Planilha de participantes' }]}
                action={
                    <Stack direction="row" spacing={1.5} alignItems="center">
                        {alterado && <Typography variant="caption" sx={{ color: cores.alerta, fontWeight: 600 }}>Alterações não salvas</Typography>}
                        <NeonButton variant="outlined" startIcon={<DownloadIcon />} onClick={baixarExemplo} sx={botaoSecundario}>
                            Baixar modelo
                        </NeonButton>
                        <NeonButton loading={salvando} onClick={salvar}>Salvar modelo</NeonButton>
                    </Stack>
                }
            />

            <Grid container spacing={3}>
                <Grid item xs={12} md={5}>
                    <GlassCard sx={{ p: 3 }}>
                        {tituloSecao('Cabeçalho da planilha')}
                        <Stack spacing={2}>
                            <TextField size="small" label="Título" value={modelo.titulo} inputProps={{ maxLength: 120 }}
                                onChange={(e) => mudar({ titulo: e.target.value })} />
                            <TextField size="small" label="Instruções para quem preenche" value={modelo.instrucoes} multiline minRows={3}
                                inputProps={{ maxLength: 1000 }} onChange={(e) => mudar({ instrucoes: e.target.value })} />
                            <Stack direction="row" spacing={1.5} alignItems="center">
                                <TextField size="small" type="color" label="Cor do cabeçalho" value={modelo.cor_cabecalho}
                                    onChange={(e) => mudar({ cor_cabecalho: e.target.value.toUpperCase() })} sx={{ width: 160 }} InputLabelProps={{ shrink: true }} />
                                <Typography variant="body2" sx={{ color: cores.textoSecundario }}>{modelo.cor_cabecalho}</Typography>
                            </Stack>
                            <FormControlLabel
                                control={<Switch checked={modelo.mostrar_evento} onChange={(e) => mudar({ mostrar_evento: e.target.checked })} />}
                                label={<Typography variant="body2">Mostrar o nome do evento</Typography>}
                            />
                            <FormControlLabel
                                control={<Switch checked={modelo.mostrar_empresa} onChange={(e) => mudar({ mostrar_empresa: e.target.checked })} />}
                                label={<Typography variant="body2">Mostrar o nome da empresa (na planilha de cada empresa)</Typography>}
                            />
                        </Stack>
                    </GlassCard>

                    <GlassCard sx={{ p: 3, mt: 3 }}>
                        {tituloSecao('Como funciona')}
                        <Stack spacing={1}>
                            {[
                                'Empresas › Baixar modelo: planilha em branco deste evento.',
                                'Empresas › ação Importar planilha: cada linha vira pré-cadastro daquela empresa.',
                                'No link de cadastro da empresa, o participante digita o CPF e os dados da planilha aparecem para ele conferir e corrigir. O CPF não pode ser alterado.',
                                'Empresas › ação Exportar planilha: participantes da empresa só com estas colunas (pode voltar pela importação).',
                                'NOME COMPLETO e CPF são obrigatórios e não podem sair do modelo.'
                            ].map(t => (
                                <Typography key={t} variant="body2" sx={{ color: cores.texto }}>• {t}</Typography>
                            ))}
                        </Stack>
                    </GlassCard>
                </Grid>

                <Grid item xs={12} md={7}>
                    <GlassCard sx={{ p: 3 }}>
                        {tituloSecao('Colunas')}
                        <Stack spacing={1.5}>
                            {modelo.colunas.map((c, idx) => {
                                const fixo = campoPorChave[c.campo]?.fixo;
                                return (
                                    <Stack key={c.campo} direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}
                                        sx={{ p: 1.5, borderRadius: 1.5, border: `1px solid ${cores.borda}`, bgcolor: cores.superficieElevada }}>
                                        <Stack direction="row">
                                            <Tooltip title="Subir">
                                                <span><IconButton size="small" disabled={idx === 0} onClick={() => moverColuna(idx, -1)} sx={acaoTabela} aria-label={`Subir ${c.rotulo}`}><SubirIcon fontSize="small" /></IconButton></span>
                                            </Tooltip>
                                            <Tooltip title="Descer">
                                                <span><IconButton size="small" disabled={idx === modelo.colunas.length - 1} onClick={() => moverColuna(idx, 1)} sx={acaoTabela} aria-label={`Descer ${c.rotulo}`}><DescerIcon fontSize="small" /></IconButton></span>
                                            </Tooltip>
                                        </Stack>
                                        <Box sx={{ minWidth: 150 }}>
                                            <Typography variant="caption" sx={{ color: cores.textoSecundario, display: 'block' }}>Campo</Typography>
                                            <Typography variant="body2" sx={{ fontWeight: 600 }}>{campoPorChave[c.campo]?.rotulo || c.campo}</Typography>
                                        </Box>
                                        <TextField size="small" label="Título na planilha" value={c.rotulo} fullWidth inputProps={{ maxLength: 60 }}
                                            onChange={(e) => mudarColuna(idx, { rotulo: e.target.value })} />
                                        <FormControlLabel
                                            sx={{ mr: 0, minWidth: 130 }}
                                            control={<Switch size="small" checked={!!c.obrigatoria} disabled={fixo} onChange={(e) => mudarColuna(idx, { obrigatoria: e.target.checked })} />}
                                            label={<Typography variant="caption">Obrigatória</Typography>}
                                        />
                                        <Tooltip title={fixo ? 'Nome completo e CPF não podem sair' : 'Remover coluna'}>
                                            <span><IconButton size="small" disabled={fixo} onClick={() => removerColuna(idx)} sx={acaoTabelaPerigo} aria-label={`Remover ${c.rotulo}`}><DeleteIcon fontSize="small" /></IconButton></span>
                                        </Tooltip>
                                    </Stack>
                                );
                            })}
                        </Stack>

                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mt: 2 }}>
                            <TextField select size="small" label="Adicionar coluna" value={novoCampo} onChange={(e) => setNovoCampo(e.target.value)}
                                fullWidth disabled={camposLivres.length === 0}>
                                {camposLivres.map(c => <MenuItem key={c.campo} value={c.campo}>{c.rotulo}</MenuItem>)}
                            </TextField>
                            <NeonButton variant="outlined" startIcon={<AddIcon />} onClick={adicionarColuna} disabled={!novoCampo} sx={{ ...botaoSecundario, flexShrink: 0 }}>
                                Adicionar
                            </NeonButton>
                        </Stack>
                        {camposLivres.length === 0 && (
                            <Typography variant="caption" sx={{ display: 'block', color: cores.textoSecundario, mt: 1 }}>Todos os campos já estão na planilha.</Typography>
                        )}
                    </GlassCard>
                </Grid>

                <Grid item xs={12}>
                    <GlassCard sx={{ p: 3 }}>
                        {tituloSecao('Pré-visualização')}
                        <Box sx={{ overflowX: 'auto', borderRadius: 1, border: `1px solid ${cores.borda}`, bgcolor: '#FFFFFF' }}>
                            <Box sx={{ minWidth: modelo.colunas.length * 140 }}>
                                <Box sx={{ bgcolor: modelo.cor_cabecalho, color: '#FFFFFF', px: 1.5, py: 1, fontWeight: 700, fontSize: '1rem' }}>{modelo.titulo || ' '}</Box>
                                {(modelo.mostrar_evento || modelo.mostrar_empresa) && (
                                    <Box sx={{ px: 1.5, py: 0.5, color: '#0F172A', fontWeight: 700, fontSize: '0.8125rem' }}>
                                        {[modelo.mostrar_evento && `Evento: ${eventoNome}`, modelo.mostrar_empresa && 'Empresa: (nome da empresa)'].filter(Boolean).join('   •   ')}
                                    </Box>
                                )}
                                {modelo.instrucoes && (
                                    <Box sx={{ px: 1.5, py: 0.5, color: '#475569', fontStyle: 'italic', fontSize: '0.75rem', whiteSpace: 'pre-wrap' }}>{modelo.instrucoes}</Box>
                                )}
                                <Box sx={{ height: 14 }} />
                                <Box sx={{ display: 'grid', gridTemplateColumns: `repeat(${modelo.colunas.length}, minmax(140px, 1fr))` }}>
                                    {modelo.colunas.map(c => (
                                        <Box key={c.campo} sx={{ bgcolor: modelo.cor_cabecalho, color: '#FFFFFF', fontWeight: 700, fontSize: '0.75rem', textAlign: 'center', px: 1, py: 0.75, borderRight: '1px solid rgba(255,255,255,0.2)' }}>
                                            {c.rotulo}{c.obrigatoria ? ' *' : ''}
                                        </Box>
                                    ))}
                                    {[0, 1].flatMap(linha => modelo.colunas.map(c => (
                                        <Box key={`${linha}-${c.campo}`} sx={{ height: 24, borderRight: '1px solid #E2E8F0', borderBottom: '1px solid #E2E8F0' }} />
                                    )))}
                                </Box>
                            </Box>
                        </Box>
                    </GlassCard>
                </Grid>
            </Grid>
        </Box>
    );
};

export default ConfigPlanilha;
