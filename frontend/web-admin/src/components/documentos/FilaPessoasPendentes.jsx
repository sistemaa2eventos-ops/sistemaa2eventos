import React, { useCallback, useEffect, useState } from 'react';
import { Box, Button, Chip, Stack, Typography } from '@mui/material';
import { UploadFile as UploadIcon } from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import api from '../../services/api';
import DataTable from '../common/DataTable';
import ChecklistObrigatorios from './ChecklistObrigatorios';
import { formatarCpf } from '../../utils/formatadores';

/**
 * Participantes com documentação pendente, do mais antigo cadastro para o mais novo.
 * Ficam aqui até anexarem todos os obrigatórios e a auditoria aprovar.
 */
const FilaPessoasPendentes = ({ search = '', recarregarToken = 0, onAnexar }) => {
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
            const resp = await api.get('/documentos/colaboradores', {
                params: { pendentes: 1, search, page: page + 1, limit: rowsPerPage }
            });
            setLinhas(resp.data?.data || []);
            setTotal(resp.data?.metadata?.total || 0);
        } catch {
            enqueueSnackbar('Erro ao carregar os pendentes de documentação.', { variant: 'error' });
        } finally {
            setLoading(false);
        }
    }, [search, page, rowsPerPage, enqueueSnackbar]);

    useEffect(() => { carregar(); }, [carregar, recarregarToken]);

    const columns = [
        {
            id: 'nome_completo',
            label: 'Participante',
            minWidth: 240,
            format: (val, row) => (
                <Box>
                    <Typography variant="body2" sx={{ fontWeight: 700, color: '#FFFFFF' }}>{val || '—'}</Typography>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)' }}>
                        CPF {row.cpf ? formatarCpf(row.cpf) : '—'} · {row.empresa_nome || 'Sem empresa'}
                    </Typography>
                </Box>
            )
        },
        {
            id: 'funcao',
            label: 'Função',
            minWidth: 130,
            format: (val) => <Typography variant="body2">{val || '—'}</Typography>
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
                        sx={{ mt: 0.5, fontWeight: 700, bgcolor: 'rgba(255,184,0,0.15)', color: '#FFB800' }}
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
                    : <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)' }}>
                        Sem documento obrigatório para a função
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
                <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#FFFFFF' }}>
                    Pendentes de documentação ({total})
                </Typography>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)' }}>
                    Participantes que ainda não têm todos os documentos obrigatórios aprovados. Ficam pendentes até regularizar; o mais antigo aparece primeiro.
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

export default FilaPessoasPendentes;
