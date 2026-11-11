import React, { useCallback, useEffect, useState } from 'react';
import {
    Accordion, AccordionDetails, AccordionSummary, Box, Button, Chip, CircularProgress,
    FormControlLabel, Stack, Switch, TextField, Typography
} from '@mui/material';
import { ExpandMore as ExpandMoreIcon, Search as SearchIcon } from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import api from '../../services/api';
import ListaDocumentos from './ListaDocumentos';
import { SITUACAO_DOCUMENTAL, chipSx } from './documentosUtils';
import { formatarCnpj } from '../../utils/formatadores';

const POR_PAGINA = 30;

/**
 * Empresas do evento: documentos corporativos entregues, status e auditoria.
 * Busca por razão social, CNPJ, responsável, e-mail, telefone ou serviço.
 * @param {{ onAuditar: (doc, acao) => void, recarregarToken: number }} props
 */
const AbaEmpresas = ({ onAuditar, recarregarToken }) => {
    const { enqueueSnackbar } = useSnackbar();
    const [busca, setBusca] = useState('');
    const [buscaAplicada, setBuscaAplicada] = useState('');
    const [somentePendentes, setSomentePendentes] = useState(false);
    const [itens, setItens] = useState([]);
    const [total, setTotal] = useState(0);
    const [pagina, setPagina] = useState(1);
    const [carregando, setCarregando] = useState(false);

    useEffect(() => {
        const t = setTimeout(() => setBuscaAplicada(busca), 350);
        return () => clearTimeout(t);
    }, [busca]);

    const carregar = useCallback(async (pag = 1) => {
        setCarregando(true);
        try {
            const resp = await api.get('/documentos/empresas', {
                params: { search: buscaAplicada, page: pag, limit: POR_PAGINA, pendentes: somentePendentes ? 1 : undefined }
            });
            const dados = resp.data?.data || [];
            setItens(prev => (pag === 1 ? dados : [...prev, ...dados]));
            setTotal(resp.data?.metadata?.total || 0);
            setPagina(pag);
        } catch {
            enqueueSnackbar('Erro ao buscar documentos das empresas.', { variant: 'error' });
        } finally {
            setCarregando(false);
        }
    }, [buscaAplicada, somentePendentes, enqueueSnackbar]);

    useEffect(() => { carregar(1); }, [carregar, recarregarToken]);

    return (
        <Box>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }} sx={{ mb: 2 }}>
                <TextField
                    fullWidth
                    placeholder="Buscar por empresa, CNPJ, responsável, e-mail, telefone ou serviço..."
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    InputProps={{ startAdornment: <SearchIcon sx={{ color: 'rgba(255,255,255,0.4)', mr: 1.5 }} /> }}
                    sx={{ '& .MuiOutlinedInput-root': { color: '#FFFFFF', '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' } } }}
                />
                <FormControlLabel
                    control={<Switch checked={somentePendentes} onChange={(e) => setSomentePendentes(e.target.checked)} />}
                    label={<Typography variant="body2" sx={{ color: '#FFFFFF', whiteSpace: 'nowrap' }}>Só com pendência</Typography>}
                />
            </Stack>

            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', display: 'block', mb: 1 }}>
                {total} empresa(s)
            </Typography>

            {itens.map((emp) => {
                const sit = SITUACAO_DOCUMENTAL[emp.situacao_documental] || SITUACAO_DOCUMENTAL.pendente;
                const docs = (emp.documentos || []).map(d => ({ ...d, tipo_entidade: 'empresa', entidade_nome: emp.nome, entidade_doc: emp.cnpj }));
                return (
                    <Accordion key={emp.id} disableGutters sx={{
                        mb: 1, bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: '8px !important', '&:before': { display: 'none' }
                    }}>
                        <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: '#00D4FF' }} />}>
                            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }} sx={{ width: '100%', pr: 1 }}>
                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                    <Typography sx={{ color: '#FFFFFF', fontWeight: 700 }} noWrap>{emp.nome}</Typography>
                                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.55)' }}>
                                        CNPJ {emp.cnpj ? formatarCnpj(emp.cnpj) : '—'}
                                        {emp.servico ? ` · ${emp.servico}` : ''}
                                        {emp.responsavel ? ` · Resp.: ${emp.responsavel}` : ''}
                                        {emp.email ? ` · ${emp.email}` : ''}
                                    </Typography>
                                </Box>
                                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                    <Chip size="small" label={sit.label} sx={chipSx(sit.color)} />
                                    <Chip size="small" label={`${docs.length} doc(s)`} sx={chipSx('#00D4FF')} />
                                </Stack>
                            </Stack>
                        </AccordionSummary>
                        <AccordionDetails>
                            <Typography variant="overline" sx={{ color: '#00D4FF', fontWeight: 700 }}>Documentos da empresa</Typography>
                            <ListaDocumentos documentos={docs} onAuditar={onAuditar} />
                        </AccordionDetails>
                    </Accordion>
                );
            })}

            {carregando && <Box sx={{ textAlign: 'center', py: 3 }}><CircularProgress sx={{ color: '#00D4FF' }} /></Box>}
            {!carregando && itens.length === 0 && (
                <Typography sx={{ color: 'rgba(255,255,255,0.5)', textAlign: 'center', py: 6 }}>Nenhuma empresa encontrada.</Typography>
            )}
            {!carregando && itens.length < total && (
                <Box sx={{ textAlign: 'center', mt: 2 }}>
                    <Button onClick={() => carregar(pagina + 1)} sx={{ color: '#00D4FF' }}>Carregar mais</Button>
                </Box>
            )}
        </Box>
    );
};

export default AbaEmpresas;

