import React, { useCallback, useEffect, useState } from 'react';
import { Box, CircularProgress, Grid, Stack, TextField, Typography } from '@mui/material';
import { useSnackbar } from 'notistack';
import api, { dadosDe, erroDe } from '../services/api';
import PageHeader from '../components/common/PageHeader';
import GlassCard from '../components/common/GlassCard';
import NeonButton from '../components/common/NeonButton';
import PedidoDialog from '../components/PedidoDialog';
import { ROTULO_CAMPO, formatarCnpj } from '../util';
import { botaoSecundario, cores } from '../styles/tokens';

const IDENTIDADE = ['nome', 'cnpj', 'email'];

/**
 * Dados da empresa. Contato (responsável, telefone, serviço) muda direto; nome, CNPJ e e-mail
 * (que é o login do portal) mudam só com aprovação da organização.
 */
const DadosEmpresa = () => {
    const { enqueueSnackbar } = useSnackbar();
    const [perfil, setPerfil] = useState(null);
    const [contato, setContato] = useState({});
    const [identidade, setIdentidade] = useState({});
    const [salvando, setSalvando] = useState(false);
    const [pedido, setPedido] = useState(null);

    const aplicar = (p) => {
        setPerfil(p);
        setContato(Object.fromEntries(p.campos_editaveis.map(c => [c, p.empresa[c] || ''])));
        setIdentidade(Object.fromEntries(IDENTIDADE.map(c => [c, c === 'cnpj' ? formatarCnpj(p.empresa[c]) : (p.empresa[c] || '')])));
    };

    const carregar = useCallback(async () => {
        try { aplicar(dadosDe(await api.get('/perfil'))); }
        catch (err) { enqueueSnackbar(erroDe(err, 'Erro ao carregar os dados.'), { variant: 'error' }); }
    }, [enqueueSnackbar]);

    useEffect(() => { carregar(); }, [carregar]);

    if (!perfil) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}><CircularProgress /></Box>;

    const contatoMudou = perfil.campos_editaveis.some(c => (contato[c] || '') !== (perfil.empresa[c] || ''));
    // CNPJ compara só os dígitos: digitar a pontuação não conta como mudança
    const normal = (c, v) => (c === 'cnpj' ? String(v || '').replace(/\D/g, '') : String(v || '').trim());
    const mudancasIdentidade = Object.fromEntries(IDENTIDADE.filter(c => normal(c, identidade[c]) !== normal(c, perfil.empresa[c])).map(c => [c, identidade[c]]));

    const salvarContato = async () => {
        setSalvando(true);
        try {
            aplicar(dadosDe(await api.patch('/perfil', contato)));
            enqueueSnackbar('Dados de contato salvos.', { variant: 'success' });
        } catch (err) {
            enqueueSnackbar(erroDe(err, 'Erro ao salvar.'), { variant: 'error' });
        } finally {
            setSalvando(false);
        }
    };

    return (
        <>
            <PageHeader title="Dados da empresa" subtitle="Mantenha o contato atualizado. Nome, CNPJ e e-mail do responsável mudam com aprovação da organização." />
            <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                    <GlassCard sx={{ p: 3 }}>
                        <Typography variant="subtitle1" sx={{ color: cores.textoForte, fontWeight: 700, mb: 2 }}>Contato</Typography>
                        <Stack spacing={2}>
                            {perfil.campos_editaveis.map(c => (
                                <TextField key={c} size="small" label={ROTULO_CAMPO[c] || c} value={contato[c] || ''} inputProps={{ maxLength: 200 }}
                                    onChange={(e) => setContato(v => ({ ...v, [c]: e.target.value }))} />
                            ))}
                            <Box>
                                <NeonButton loading={salvando} disabled={!contatoMudou} onClick={salvarContato}>Salvar contato</NeonButton>
                            </Box>
                        </Stack>
                    </GlassCard>
                </Grid>
                <Grid item xs={12} md={6}>
                    <GlassCard sx={{ p: 3 }}>
                        <Typography variant="subtitle1" sx={{ color: cores.textoForte, fontWeight: 700, mb: 0.5 }}>Identificação</Typography>
                        <Typography variant="caption" component="p" sx={{ color: cores.textoSecundario, mb: 2 }}>
                            Edite e envie o pedido: a organização confere e aprova. O e-mail do responsável é o login deste portal.
                        </Typography>
                        <Stack spacing={2}>
                            {IDENTIDADE.map(c => (
                                <TextField key={c} size="small" label={ROTULO_CAMPO[c]} inputProps={{ maxLength: 200 }}
                                    value={identidade[c]}
                                    onChange={(e) => setIdentidade(v => ({ ...v, [c]: e.target.value }))} />
                            ))}
                            <Stack direction="row" spacing={1}>
                                <NeonButton variant="outlined" sx={botaoSecundario} disabled={!Object.keys(mudancasIdentidade).length}
                                    onClick={() => aplicar(perfil)}>
                                    Desfazer
                                </NeonButton>
                                <NeonButton disabled={!Object.keys(mudancasIdentidade).length} onClick={() => setPedido({
                                    tipo: 'editar_empresa', dados: mudancasIdentidade, exigeMotivo: false,
                                    titulo: 'Pedir alteração da empresa',
                                    descricao: `Alterar ${Object.keys(mudancasIdentidade).map(c => ROTULO_CAMPO[c]).join(', ')}.`
                                })}>
                                    Pedir alteração
                                </NeonButton>
                            </Stack>
                        </Stack>
                    </GlassCard>
                </Grid>
            </Grid>
            <PedidoDialog pedido={pedido} onClose={() => setPedido(null)} onEnviado={carregar} />
        </>
    );
};

export default DadosEmpresa;
