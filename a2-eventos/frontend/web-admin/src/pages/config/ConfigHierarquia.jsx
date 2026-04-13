import React, { useState, useEffect } from 'react';
import {
    Box,
    Typography,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Checkbox,
    Paper,
    CircularProgress,
    Tooltip,
    Alert
} from '@mui/material';
import { Security as SecurityIcon, HelpOutline } from '@mui/icons-material';
import api from '../../services/api';
import { useSnackbar } from 'notistack';

const ConfigHierarquia = ({ embedded = false }) => {
    const [loading, setLoading] = useState(true);
    const [roles, setRoles] = useState([]);
    const [permissions, setPermissions] = useState([]);
    const [matrix, setMatrix] = useState([]);
    const { enqueueSnackbar } = useSnackbar();

    useEffect(() => {
        fetchMatrix();
    }, []);

    const fetchMatrix = async () => {
        try {
            setLoading(true);
            const response = await api.get('/config/rbac/matrix');
            if (response.data.success) {
                setRoles(response.data.data.roles);
                setPermissions(response.data.data.permissions);
                setMatrix(response.data.data.matrix);
            }
        } catch (error) {
            enqueueSnackbar('Erro ao carregar matriz de permissões', { variant: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const handleToggle = async (roleId, permissionId, currentStatus) => {
        try {
            const newStatus = !currentStatus;
            
            // Otimismo no UI
            const updatedMatrix = [...matrix];
            const existingIdx = updatedMatrix.findIndex(m => m.role_id === roleId && m.permission_id === permissionId);
            
            if (existingIdx >= 0) {
                updatedMatrix[existingIdx].autorizado = newStatus;
            } else {
                updatedMatrix.push({ role_id: roleId, permission_id: permissionId, autorizado: newStatus });
            }
            setMatrix(updatedMatrix);

            const response = await api.post('/config/rbac/rbac-toggle', {
                role_id: roleId,
                permission_id: permissionId,
                autorizado: newStatus
            });

            if (!response.data.success) {
                throw new Error();
            }
        } catch (error) {
            enqueueSnackbar('Falha ao atualizar permissão', { variant: 'error' });
            fetchMatrix(); // Reverte se falhar
        }
    };

    const isAuthorized = (roleId, permissionId) => {
        const entry = matrix.find(m => m.role_id === roleId && m.permission_id === permissionId);
        return entry ? entry.autorizado : false;
    };

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}><CircularProgress /></Box>;

    return (
        <Box sx={{ p: embedded ? 0 : 3 }}>
            <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 2 }}>
                <SecurityIcon color="primary" />
                <Box>
                    <Typography variant="h6">Matriz de Hierarquia & Acesso</Typography>
                    <Typography variant="body2" color="text.secondary">
                        Configure o que cada perfil pode realizar exclusivamente neste evento.
                    </Typography>
                </Box>
            </Box>

            <Alert severity="info" sx={{ mb: 3 }}>
                Gereciamento de papéis para o evento ativo. <b>Master</b> e <b>Admin</b> possuem acesso irrestrito por padrão.
            </Alert>

            <TableContainer component={Paper} sx={{ bgcolor: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(10px)', borderRadius: 2 }}>
                <Table size="small">
                    <TableHead>
                        <TableRow sx={{ bgcolor: 'rgba(255,255,255,0.05)' }}>
                            <TableCell sx={{ fontWeight: 'bold', color: 'primary.main' }}>RECURSOS \ PERFIS</TableCell>
                            {roles.map(role => (
                                <TableCell key={role.id} align="center" sx={{ fontWeight: 'bold' }}>
                                    {role.nome.toUpperCase()}
                                </TableCell>
                            ))}
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {permissions.map(perm => (
                            <TableRow key={perm.id} hover>
                                <TableCell sx={{ fontWeight: 500 }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        {perm.nome_humanizado}
                                        <Tooltip title={`${perm.recurso}:${perm.acao}`}>
                                            <HelpOutline sx={{ fontSize: 14, color: 'text.disabled' }} />
                                        </Tooltip>
                                    </Box>
                                </TableCell>
                                {roles.map(role => {
                                    const authorized = isAuthorized(role.id, perm.id);
                                    const isAutoAllowed = role.nome === 'admin';
                                    
                                    return (
                                        <TableCell key={role.id} align="center">
                                            <Checkbox
                                                checked={authorized || isAutoAllowed}
                                                disabled={isAutoAllowed}
                                                onChange={() => handleToggle(role.id, perm.id, authorized)}
                                                sx={{
                                                    color: 'rgba(255,255,255,0.2)',
                                                    '&.Mui-checked': { color: 'secondary.main' }
                                                }}
                                            />
                                        </TableCell>
                                    );
                                })}
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>
        </Box>
    );
};

export default ConfigHierarquia;
