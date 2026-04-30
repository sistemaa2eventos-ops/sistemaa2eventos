import React, { useState } from 'react';
import {
    Box,
    IconButton,
    Chip,
    Tooltip,
} from '@mui/material';
import {
    Edit as EditIcon,
    Delete as DeleteIcon,
    Visibility as ViewIcon,
} from '@mui/icons-material';
import DataTable from '../common/DataTable';

const EmpresaList = ({ empresas, loading, onEdit, onDelete, onView }) => {
    const columns = [
        {
            id: 'nome',
            label: 'Nome',
            minWidth: 200,
            format: (value) => value || '-',
        },
        {
            id: 'cnpj',
            label: 'CNPJ',
            minWidth: 150,
            format: (value) => {
                if (!value) return '-';
                const cnpj = value.replace(/\D/g, '');
                return cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
            },
        },
        {
            id: 'servico',
            label: 'Serviço',
            minWidth: 150,
            format: (value) => value || '-',
        },
        {
            id: 'ativo',
            label: 'Status',
            minWidth: 100,
            format: (value) => (
                <Chip
                    label={value ? 'Ativo' : 'Inativo'}
                    color={value ? 'success' : 'error'}
                    size="small"
                />
            ),
        },
        {
            id: 'acoes',
            label: 'Ações',
            minWidth: 120,
            align: 'center',
            format: (value, row) => (
                <Box>
                    <Tooltip title="Visualizar">
                        <IconButton size="small" onClick={() => onView(row)} color="info">
                            <ViewIcon />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="Editar">
                        <IconButton size="small" onClick={() => onEdit(row)} color="primary">
                            <EditIcon />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="Excluir">
                        <IconButton size="small" onClick={() => onDelete(row)} color="error">
                            <DeleteIcon />
                        </IconButton>
                    </Tooltip>
                </Box>
            ),
        },
    ];

    return (
        <DataTable
            columns={columns}
            data={empresas}
            loading={loading}
        />
    );
};

export default EmpresaList;