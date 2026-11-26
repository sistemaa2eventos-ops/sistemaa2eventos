import React, { useCallback, useEffect, useState } from 'react';
import { Box, Button, Chip, Stack, Typography } from '@mui/material';
import { UploadFile as UploadIcon } from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import api from '../../services/api';
import DataTable from '../common/DataTable';
import ChecklistObrigatorios from './ChecklistObrigatorios';
import { formatarCnpj } from '../../utils/formatadores';
import { cores } from '../../styles/tokens';

/**
 * Empresas com documentação pendente, da mais antiga para a mais nova.
 * Continuam aqui até entregarem todos os obrigatórios para empresas (ou, sem lista, os documentos enviados).
 */
const FilaEmpresasPendentes = ({ search = '', recarregarToken = 0, onAnexar }) => {
    const { enqueueSnackbar } = useSnackbar();
    const [linhas, setLinhas] = useState([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [loading, setLoading] = useState(false);

    useEffect(() => { setPage(0); }, [search]);

    const carregar = useCallback(async () => {
        setLoading(true);
        try {
            const resp = await api.get('/documentos/empresas', {
                params: { pendentes: 1, search, page: page + 1, limit: rowsPerPage }
            });
            setLinhas(resp.data?.data || []);
            setTotal(resp.data?.metadata?.total || 0);
        } catch {
            enqueueSnackbar('Erro ao carregar as empresas pendentes.', { variant: 'error' });
        } finally {
            setLoading(false);
        }
    }, [search, page, rowsPerPage, enqueueSnackbar]);

    useEffect(() => { carregar(); }, [carregar, recarregarToken]);

    const columns = [
        {
            id: 'nome',
            label: 'Empresa',
            minWidth: 240,
            format: (val, row) => (
                <Box>
                    <Typography variant="body2" sx={{ fontWeight: 700, color: cores.textoForte }}>{val || '—'}</Typography>
                    <Typography variant="caption" sx={{ color: cores.textoSecundario }}>
                        CNPJ {row.cnpj ? formatarCnpj(row.cnpj) : '—'} · {row.responsavel || 'Sem responsável'}
                    </Typography>
                </Box>
            )
        },
        {
            id: 'cadastrado_em',
            label: 'Cadastro',
            minWidth: 150,
            format: (val, row) => (
                <Box>
                    <Typography variant="body2">{val ? new Date(val).toLocaleDateString('pt-BR') : '—'}</Typography>
                    <Chip
                        size="small"
                        label={row.dias_pendente === null ? 'Sem data' : `Sem enviar há ${row.dias_pendente} dia(s)`}
                        sx={{ mt: 0.5, fontWeight: 700, bgcolor: 'rgba(255,184,0,0.15)', color: cores.alerta }}
                    />
                </Box>
            )
        },
        {
            id: 'obrigatorios',
            label: 'Documentos obrigatórios',
            minWidth: 360,
            format: (val, row) => (
                (row.obrigatorios || []).length > 0
                    ? <ChecklistObrigatorios obrigatorios={row.obrigatorios} compacto />
                    : <Typography variant="caption" sx={{ color: cores.textoSecundario }}>
                        {row.documentos?.length ? 'Sem lista de obrigatórios: vale o que foi enviado' : 'Nenhum obrigatório definido para empresas'}
                      </Typography>
            )
        },
        {
            id: 'acoes',
            label: 'Ações',
            minWidth: 130,
            align: 'right',
            format: (val, row) => (
                <Button size="small" startIcon={<UploadIcon />} onClick={() => onAnexar?.(row)} sx={{ textTransform: 'none', fontWeight: 700 }}>
                    Anexar
                </Button>
            )
        }
    ];

    return (
        <Stack spacing={1.5}>
            <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, color: cores.textoForte }}>
                    Empresas pendentes de documentação ({total})
                </Typography>
                <Typography variant="caption" sx={{ color: cores.textoSecundario }}>
                    Empresas com documentos obrigatórios faltando, em análise ou reprovados. Da mais antiga para a mais nova.
                </Typography>
            </Box>
            <DataTable
                columns={columns}
                data={linhas}
                loading={loading}
                page={page}
                rowsPerPage={rowsPerPage}
                totalCount={total}
                onPageChange={(e, newPage) => setPage(newPage)}
                onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
            />
        </Stack>
    );
};

export default FilaEmpresasPendentes;
