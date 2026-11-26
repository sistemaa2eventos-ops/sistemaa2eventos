import React, { useCallback, useEffect, useState } from 'react';
import { Box, CircularProgress, Grid, Stack, Typography } from '@mui/material';
import { useSnackbar } from 'notistack';
import api, { dadosDe, erroDe } from '../services/api';
import PageHeader from '../components/common/PageHeader';
import GlassCard from '../components/common/GlassCard';
import ChecklistObrigatorios from '../components/ChecklistObrigatorios';
import ListaDocumentos from '../components/ListaDocumentos';
import EnviarDocumento from '../components/EnviarDocumento';
import PedidoDialog from '../components/PedidoDialog';
import { cores } from '../styles/tokens';

/** Documentos da própria empresa: o que a organização exige, o que foi enviado e a situação de cada um. */
const DocumentosEmpresa = () => {
    const { enqueueSnackbar } = useSnackbar();
    const [dados, setDados] = useState(null);
    const [tipos, setTipos] = useState([]);
    const [pedido, setPedido] = useState(null);

    const carregar = useCallback(async () => {
        try {
            const [d, t] = await Promise.all([api.get('/documentos'), api.get('/tipos-documento')]);
            setDados(dadosDe(d));
            setTipos(dadosDe(t) || []);
        } catch (err) {
            enqueueSnackbar(erroDe(err, 'Erro ao carregar os documentos.'), { variant: 'error' });
        }
    }, [enqueueSnackbar]);

    useEffect(() => { carregar(); }, [carregar]);

    // Tipos exigidos aparecem primeiro na lista de envio
    const exigidos = new Set((dados?.obrigatorios || []).map(o => o.id));
    const tiposOrdenados = [...tipos].sort((a, b) => Number(exigidos.has(b.id)) - Number(exigidos.has(a.id)));

    return (
        <>
            <PageHeader title="Documentos da empresa" subtitle="Envie os documentos da empresa para a análise da organização e acompanhe a situação de cada um." />
            {!dados && <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}><CircularProgress /></Box>}
            {dados && (
                <Grid container spacing={3}>
                    <Grid item xs={12} md={7}>
                        <GlassCard sx={{ p: 3 }}>
                            <Typography variant="subtitle1" sx={{ color: cores.textoForte, fontWeight: 700, mb: 2 }}>Documentos enviados</Typography>
                            <ListaDocumentos documentos={dados.documentos} onPedirExclusao={(d) => setPedido({
                                tipo: 'excluir_documento', alvo_tipo: 'documento_empresa', alvo_id: d.id,
                                titulo: 'Pedir exclusão de documento', descricao: `Excluir "${d.tipo_nome || d.titulo}" da empresa.`
                            })} />
                        </GlassCard>
                    </Grid>
                    <Grid item xs={12} md={5}>
                        <Stack spacing={3}>
                            <GlassCard sx={{ p: 3 }}>
                                <Typography variant="subtitle1" sx={{ color: cores.textoForte, fontWeight: 700, mb: 1.5 }}>Exigidos pela organização</Typography>
                                {(dados.obrigatorios || []).length > 0
                                    ? <ChecklistObrigatorios obrigatorios={dados.obrigatorios} titulo="Situação" />
                                    : <Typography variant="body2" sx={{ color: cores.textoSecundario }}>Nenhum documento específico exigido da empresa.</Typography>}
                            </GlassCard>
                            <EnviarDocumento url="/documentos" tipos={tiposOrdenados} onEnviado={carregar} />
                        </Stack>
                    </Grid>
                </Grid>
            )}
            <PedidoDialog pedido={pedido} onClose={() => setPedido(null)} />
        </>
    );
};

export default DocumentosEmpresa;
