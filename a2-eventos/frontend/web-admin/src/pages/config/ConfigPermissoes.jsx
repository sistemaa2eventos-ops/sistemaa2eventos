import React, { useState, useEffect } from 'react';
import {
    Box, Typography, Grid, Switch, FormControlLabel, FormGroup,
    Stack, Divider, Chip, CircularProgress, Alert, IconButton,
    Dialog, DialogTitle, DialogContent, DialogActions, Button,
    TextField, Table, TableBody, TableCell, TableContainer,
    TableHead, TableRow, Paper
} from '@mui/material';
import {
    Security as SecurityIcon,
    Save as SaveIcon,
    CheckCircle as ApproveIcon,
    Block as InativarIcon,
    Refresh as AtivarIcon,
    Edit as EditIcon
} from '@mui/icons-material';
import api from '../../services/api';
import GlassCard from '../../components/common/GlassCard';
import NeonButton from '../../components/common/NeonButton';
import PageHeader from '../../components/common/PageHeader';
import { useSnackbar } from 'notistack';

const MODULOS = [
    { key: 'dashboard', label: 'Dashboard', description: 'Acesso à tela inicial' },
    { key: 'empresas', label: 'Empresas', description: 'Gerenciar empresas' },
    { key: 'pessoas', label: 'Pessoas', description: 'Gerenciar credenciamento' },
    { key: 'auditoria_documentos', label: 'Auditoria Docs', description: 'Verificar documentos' },
    { key: 'monitoramento', label: 'Monitoramento', description: 'Monitor em tempo real' },
    { key: 'relatorios', label: 'Relatórios', description: 'Acessar relatórios' },
    { key: 'checkin', label: 'Check-in', description: 'Operar check-in' },
    { key: 'checkout', label: 'Check-out', description: 'Operar check-out' }
];

function ConfigPermissoes() {
    // StatusChip component
    const StatusChip = ({ status }) => {
        const colors = {
            pendente: { bg: 'rgba(255, 184, 0, 0.1)', color: '#FFB800', border: 'rgba(255, 184, 0, 0.2)' },
            ativo: { bg: 'rgba(0, 255, 136, 0.1)', color: '#00FF88', border: 'rgba(0, 255, 136, 0.2)' },
            inativo: { bg: 'rgba(255, 51, 102, 0.1)', color: '#FF3366', border: 'rgba(255, 51, 102, 0.2)' }
        };
        const c = colors[status] || colors.inativo;
        return (
            <Chip
                label={status?.toUpperCase() || 'INATIVO'}
                size="small"
                sx={{
                    bgcolor: c.bg,
                    color: c.color,
                    border: `1px solid ${c.border}`,
                    fontWeight: 700,
                    fontSize: '0.65rem'
                }}
            />
        );
    };

    const { enqueueSnackbar } = useSnackbar();
    const [operadores, setOperadores] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [selectedOperador, setSelectedOperador] = useState(null);
    const [editDialogOpen, setEditDialogOpen] = useState(false);
    const [editPermissions, setEditPermissions] = useState({});

    useEffect(() => {
        loadOperadores();
    }, []);

    const loadOperadores = async () => {
        try {
            setLoading(true);
            const response = await api.get('/auth/users');
            const users = response.data.data || [];
            
            const operadores = users.filter(u => u.nivel_acesso === 'operador');
            setOperadores(operadores);
        } catch (error) {
            enqueueSnackbar('Erro ao carregar operadores.', { variant: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const handleEditPermissions = (operador) => {
        setSelectedOperador(operador);
        setEditPermissions({
            dashboard: true,
            empresas: operador.permissions?.empresas || false,
            pessoas: operador.permissions?.pessoas || false,
            auditoria_documentos: operador.permissions?.auditoria_documentos || false,
            monitoramento: operador.permissions?.monitoramento || false,
            relatorios: operador.permissions?.relatorios || false,
            veiculos: operador.permissions?.veiculos || false,
            checkin: operador.permissions?.checkin || false,
            checkout: operador.permissions?.checkout || false
        });
        setEditDialogOpen(true);
    };

    const handleSavePermissions = async () => {
        try {
            setSaving(true);
            await api.put(`/auth/users/${selectedOperador.id}/permissions`, {
                permissions: editPermissions
            });
            enqueueSnackbar('Permissões salvas!', { variant: 'success' });
            setEditDialogOpen(false);
            loadOperadores();
        } catch (error) {
            enqueueSnackbar(error.response?.data?.error || 'Erro ao salvar.', { variant: 'error' });
        } finally {
            setSaving(false);
        }
    };

    const handleAprovar = async (operadorId) => {
        try {
            await api.post(`/auth/users/${operadorId}/approve`, {
                permissions: {
                    dashboard: true,
                    empresas: false,
                    pessoas: false,
                    auditoria_documentos: false,
                    monitoramento: false,
                    relatorios: false,
                    checkin: false,
                    checkout: false
                }
            });
            enqueueSnackbar('Operador aprovado!', { variant: 'success' });
            loadOperadores();
        } catch (error) {
            enqueueSnackbar(error.response?.data?.error || 'Erro ao aprovar.', { variant: 'error' });
        }
    };

    const handleToggleStatus = async (operador) => {
        try {
            const newStatus = operador.status === 'ativo' ? 'inativo' : 'ativo';
            await api.patch(`/auth/users/${operador.id}/status`, { status: newStatus });
            enqueueSnackbar(`Operador ${newStatus === 'ativo' ? 'ativado' : 'inativado'}.`, { variant: 'success' });
            loadOperadores();
        } catch (error) {
            enqueueSnackbar(error.response?.data?.error || 'Erro ao alterar status.', { variant: 'error' });
        }
    };

    const handlePermissionChange = (key) => {
        if (key === 'dashboard') return;
        setEditPermissions(prev => ({
            ...prev,
            [key]: !prev[key]
        }));
    };

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 8 }}>
                <CircularProgress />
            </Box>
        );
    }

    return (
        <Box sx={{ p: { xs: 2, md: 4 } }}>
            <PageHeader
                title="Perfis de Acesso"
                subtitle="Gerencie permissões granulares dos operadores do sistema."
                breadcrumbs={[{ text: 'Configurações' }, { text: 'Perfis de Acesso' }]}
            />

            <GlassCard sx={{ p: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
                    <SecurityIcon sx={{ color: '#00D4FF', fontSize: 28 }} />
                    <Typography variant="h6" sx={{ fontWeight: 700, color: '#fff' }}>
                        Operadores do Sistema
                    </Typography>
                    <Chip 
                        label={`${operadores.length} operadores`} 
                        size="small"
                        sx={{ bgcolor: 'rgba(0, 212, 255, 0.1)', color: '#00D4FF' }}
                    />
                </Box>

                {operadores.length === 0 ? (
                    <Alert severity="info">
                        Nenhum operador encontrado. Convide novos usuários na tela de Usuários.
                    </Alert>
                ) : (
                    <TableContainer component={Paper} sx={{ bgcolor: 'transparent' }}>
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableCell sx={{ color: 'text.secondary', fontWeight: 700 }}>USUÁRIO</TableCell>
                                    <TableCell sx={{ color: 'text.secondary', fontWeight: 700 }}>EMAIL</TableCell>
                                    <TableCell sx={{ color: 'text.secondary', fontWeight: 700 }}>STATUS</TableCell>
                                    <TableCell sx={{ color: 'text.secondary', fontWeight: 700 }}>PERMISSÕES</TableCell>
                                    <TableCell sx={{ color: 'text.secondary', fontWeight: 700 }}>AÇÕES</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {operadores.map(op => (
                                    <TableRow key={op.id} sx={{ '&:hover': { bgcolor: 'rgba(255,255,255,0.02)' } }}>
                                        <TableCell>
                                            <Typography variant="body2" sx={{ fontWeight: 600, color: '#fff' }}>
                                                {op.nome_completo || op.nome || 'Sem nome'}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                                {op.email}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            <StatusChip status={op.status} />
                                        </TableCell>
                                        <TableCell>
                                            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                                                {MODULOS.filter(m => m.key !== 'dashboard').map(m => (
                                                    <Chip
                                                        key={m.key}
                                                        label={m.label}
                                                        size="small"
                                                        variant={op.permissions?.[m.key] ? 'filled' : 'outlined'}
                                                        sx={{
                                                            fontSize: '0.6rem',
                                                            bgcolor: op.permissions?.[m.key] ? 'rgba(0, 212, 255, 0.2)' : 'transparent',
                                                            color: op.permissions?.[m.key] ? '#00D4FF' : 'text.secondary',
                                                            borderColor: 'rgba(255,255,255,0.1)'
                                                        }}
                                                    />
                                                ))}
                                            </Box>
                                        </TableCell>
                                        <TableCell>
                                            <Stack direction="row" spacing={1}>
                                                <IconButton 
                                                    size="small" 
                                                    onClick={() => handleEditPermissions(op)}
                                                    sx={{ color: '#00D4FF' }}
                                                    title="Editar permissões"
                                                >
                                                    <EditIcon fontSize="small" />
                                                </IconButton>
                                                
                                                {op.status === 'pendente' && (
                                                    <IconButton 
                                                        size="small" 
                                                        onClick={() => handleAprovar(op.id)}
                                                        sx={{ color: '#00FF88' }}
                                                        title="Aprovar"
                                                    >
                                                        <ApproveIcon fontSize="small" />
                                                    </IconButton>
                                                )}
                                                
                                                {op.status === 'ativo' && (
                                                    <IconButton 
                                                        size="small" 
                                                        onClick={() => handleToggleStatus(op)}
                                                        sx={{ color: '#FF3366' }}
                                                        title="Inativar"
                                                    >
                                                        <InativarIcon fontSize="small" />
                                                    </IconButton>
                                                )}
                                                
                                                {op.status === 'inativo' && (
                                                    <IconButton 
                                                        size="small" 
                                                        onClick={() => handleToggleStatus(op)}
                                                        sx={{ color: '#00FF88' }}
                                                        title="Ativar"
                                                    >
                                                        <AtivarIcon fontSize="small" />
                                                    </IconButton>
                                                )}
                                            </Stack>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                )}
            </GlassCard>

            <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle sx={{ fontFamily: '"Orbitron", sans-serif', fontWeight: 700, color: '#00D4FF' }}>
                    EDITAR PERMISSÕES — {selectedOperador?.nome_completo || selectedOperador?.email}
                </DialogTitle>
                <DialogContent>
                    <Box sx={{ mt: 2 }}>
                        <Alert severity="info" sx={{ mb: 3 }}>
                            O módulo Dashboard é obrigatório e não pode ser desativado.
                        </Alert>
                        
                        <Grid container spacing={2}>
                            {MODULOS.map(modulo => (
                                <Grid item xs={12} key={modulo.key}>
                                    <Box sx={{ 
                                        p: 2, 
                                        borderRadius: 2, 
                                        bgcolor: 'rgba(255,255,255,0.02)',
                                        border: '1px solid rgba(255,255,255,0.05)'
                                    }}>
                                        <FormControlLabel
                                            control={
                                                <Switch
                                                    checked={editPermissions[modulo.key]}
                                                    onChange={() => handlePermissionChange(modulo.key)}
                                                    disabled={modulo.key === 'dashboard'}
                                                    sx={{
                                                        '& .MuiSwitch-switchBase.Mui-checked': { color: '#00D4FF' },
                                                        '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: '#00D4FF' }
                                                    }}
                                                />
                                            }
                                            label={
                                                <Box>
                                                    <Typography variant="body2" sx={{ fontWeight: 600, color: '#fff' }}>
                                                        {modulo.label}
                                                    </Typography>
                                                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                                        {modulo.description}
                                                    </Typography>
                                                </Box>
                                            }
                                            sx={{ ml: 0, alignItems: 'flex-start' }}
                                        />
                                    </Box>
                                </Grid>
                            ))}
                        </Grid>
                    </Box>
                </DialogContent>
                <DialogActions sx={{ p: 3 }}>
                    <Button onClick={() => setEditDialogOpen(false)} sx={{ color: 'text.secondary' }}>
                        CANCELAR
                    </Button>
                    <NeonButton onClick={handleSavePermissions} loading={saving}>
                        SALVAR PERMISSÕES
                    </NeonButton>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default ConfigPermissoes;