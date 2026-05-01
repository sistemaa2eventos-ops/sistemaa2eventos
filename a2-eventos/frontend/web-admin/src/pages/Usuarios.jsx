import React, { useState } from 'react';
import {
    Box, Typography, Stack, IconButton, Dialog, DialogTitle, DialogContent,
    DialogActions, TextField, Button, Avatar, Chip, MenuItem, Select,
    FormControl, InputLabel, Tooltip, Switch
} from '@mui/material';
import {
    Add as AddIcon, Edit as EditIcon,
    Search as SearchIcon, Email as EmailIcon, LockReset as ResetIcon,
    CheckCircle as AtivoIcon, HourglassEmpty as PendenteIcon, Cancel as InativoIcon,
    Check as ApproveIcon, Delete as DeleteIcon
} from '@mui/icons-material';
import { styled } from '@mui/material/styles';

import GlassCard from '../components/common/GlassCard';
import PageHeader from '../components/common/PageHeader';
import NeonButton from '../components/common/NeonButton';
import DataTable from '../components/common/DataTable';
import { useUsuarios } from '../hooks/useUsuarios';
import { useAuth } from '../contexts/AuthContext';

const SearchWrapper = styled(Box)(({ theme }) => ({
    background: 'rgba(10, 22, 40, 0.6)', border: '1px solid rgba(0, 212, 255, 0.1)',
    borderRadius: 12, padding: theme.spacing(1, 2), display: 'flex', alignItems: 'center',
    gap: theme.spacing(1), marginBottom: theme.spacing(3)
}));

const RoleChip = styled(Chip)(({ role }) => ({
    fontWeight: 700, fontSize: '0.65rem', height: 24, textTransform: 'uppercase',
    background: role === 'admin_master' ? 'rgba(0, 212, 255, 0.1)' : 'rgba(0, 212, 255, 0.05)',
    color: role === 'admin_master' ? '#00D4FF' : '#fff',
    border: `1px solid ${role === 'admin_master' ? 'rgba(0, 212, 255, 0.2)' : 'rgba(255,255,255,0.1)'}`
}));

const StatusChip = styled(Chip)(({ status }) => ({
    fontWeight: 700, fontSize: '0.65rem', height: 24, textTransform: 'uppercase',
    background: status === 'ativo' ? 'rgba(0, 255, 136, 0.1)' : (status === 'pendente' ? 'rgba(255, 184, 0, 0.1)' : 'rgba(255, 51, 102, 0.1)'),
    color: status === 'ativo' ? '#00FF88' : (status === 'pendente' ? '#FFB800' : '#FF3366'),
    border: `1px solid ${status === 'ativo' ? 'rgba(0, 255, 136, 0.2)' : (status === 'pendente' ? 'rgba(255, 184, 0, 0.2)' : 'rgba(255, 51, 102, 0.2)')}`
}));

/**
 * Usuarios: Tela de gestão de operadores e credenciais administrativas.
 * Utiliza useUsuarios para centralizar o CRUD e gestão de permissões.
 */
const Usuarios = () => {
    const {
        usuarios, eventos, loading, search, setSearch, page, setPage, totalCount,
        openDialog, setOpenDialog, openDeleteConfirm: _openDeleteConfirm, setOpenDeleteConfirm: _setOpenDeleteConfirm,
        selectedUser, setSelectedUser, formData, setFormData,
        openPasswordDialog, setOpenPasswordDialog,
        resetingPassword, handleResetPassword,
        handleOpenDialog, handleSave, handleApprove, handleToggleStatus, handleDeleteUser
    } = useUsuarios();
    const { user: currentUser } = useAuth();
    const [newPassword, setNewPassword] = useState('');

    // admin_master pode gerenciar todos; operador não gerencia ninguém
    const isAdmin = currentUser?.nivel_acesso === 'admin_master';

    const columns = [
        {
            id: 'nome_completo', label: 'OPERADOR', minWidth: 250,
            format: (val, row) => (
                <Box>
                    <Typography variant="body2" fontWeight={700} color="#fff">{val}</Typography>
                    <Typography variant="caption" color="text.secondary" display="flex" alignItems="center" gap={0.5}>
                        <EmailIcon sx={{ fontSize: 10 }} /> {row.email}
                    </Typography>
                </Box>
            )
        },
        { id: 'telefone', label: 'TELEFONE', minWidth: 150 },
        {
            id: 'nivel_acesso', label: 'CARGO', minWidth: 100,
            format: (val) => (
                <RoleChip 
                    role={val} 
                    label={val === 'admin_master' ? 'ADMIN MASTER' : 'OPERADOR'} 
                    sx={{ 
                        background: val === 'admin_master' ? 'rgba(0, 212, 255, 0.2)' : 'rgba(255,255,255,0.05)',
                        color: val === 'admin_master' ? '#00D4FF' : '#fff',
                        border: `1px solid ${val === 'admin_master' ? '#00D4FF' : 'rgba(255,255,255,0.1)'}`,
                        boxShadow: val === 'admin_master' ? '0 0 10px rgba(0, 212, 255, 0.3)' : 'none'
                    }}
                />
            )
        },
        {
            id: 'status', label: 'STATUS', minWidth: 100,
            format: (val) => {
                const status = val || 'pendente';
                const icons = { ativo: <AtivoIcon sx={{ fontSize: 14 }} />, pendente: <PendenteIcon sx={{ fontSize: 14 }} />, inativo: <InativoIcon sx={{ fontSize: 14 }} /> };
                const labels = { ativo: 'ATIVO', pendente: 'PENDENTE', inativo: 'INATIVO' };
                return (
                    <StatusChip 
                        status={status}
                        icon={icons[status]}
                        label={labels[status]} 
                    />
                );
            }
        },
        {
            id: 'eventos', label: 'VÍNCULO', minWidth: 150,
            format: (val, row) => {
                // Tentar buscar o nome do evento de várias formas
                if (typeof val === 'object' && val?.nome) return val.nome;
                if (row?.eventos?.nome) return row.eventos.nome;
                if (row?.events?.nome) return row.events.nome;
                if (row?.evento_nome) return row.evento_nome;
                return row?.evento_id ? `Evento: ${row.evento_id.substring(0, 8)}...` : 'Sem vínculo';
            }
        },
        {
            id: 'acoes', label: 'AÇÕES', minWidth: 120, align: 'center',
            format: (_, row) => {
                const canManage = isAdmin && row.nivel_acesso !== 'admin_master';

                return (
                    <Stack direction="row" spacing={1} justifyContent="center">
                        <Tooltip title={canManage ? "Resetar Senha" : "Privilégio Insuficiente"}>
                            <span>
                                <IconButton size="small" disabled={!canManage} onClick={() => { setSelectedUser(row); setOpenPasswordDialog(true); }} sx={{ color: '#FFB800' }}><ResetIcon fontSize="small" /></IconButton>
                            </span>
                        </Tooltip>
                        <Tooltip title={canManage ? "Editar" : "Privilégio Insuficiente"}>
                            <span>
                                <IconButton size="small" disabled={!canManage} onClick={() => handleOpenDialog(row)} sx={{ color: '#00D4FF' }}><EditIcon fontSize="small" /></IconButton>
                            </span>
                        </Tooltip>
                        {row.status === 'pendente' && (
                            <Tooltip title="Aprovar Usuário">
                                <IconButton size="small" onClick={() => handleApprove(row.id)} sx={{ color: '#00FF88' }}><ApproveIcon fontSize="small" /></IconButton>
                            </Tooltip>
                        )}
                        {row.status !== 'pendente' && (
                            <Tooltip title={canManage ? "Ativar/Inativar" : "Privilégio Insuficiente"}>
                                <span>
                                    <Switch size="small" checked={row.status === 'ativo'} disabled={!canManage} onChange={() => handleToggleStatus(row.id, row.status)} color="info" />
                                </span>
                            </Tooltip>
                        )}
                        <Tooltip title={canManage ? "Deletar Operador" : "Privilégio Insuficiente"}>
                            <span>
                                <IconButton size="small" disabled={!canManage} onClick={() => { setSelectedUser(row); setOpenDeleteConfirm(true); }} sx={{ color: '#FF3366' }}><DeleteIcon fontSize="small" /></IconButton>
                            </span>
                        </Tooltip>
                    </Stack>
                );
            },
        },
    ];

    return (
        <Box sx={{ p: 4 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 4 }}>
                <PageHeader title="Controle de Operadores" subtitle="Gestão de privilégios e credenciais do ecossistema A2." />
                <NeonButton startIcon={<AddIcon />} onClick={() => handleOpenDialog()} sx={{ mt: 2 }}>Novo Operador</NeonButton>
            </Box>

            <GlassCard glowColor="#FFB800" sx={{ p: 3 }}>
                <SearchWrapper>
                    <SearchIcon sx={{ color: 'text.secondary' }} />
                    <input type="text" placeholder="Rastrear por nome ou email..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ background: 'transparent', border: 'none', color: '#fff', width: '100%', outline: 'none' }} />
                </SearchWrapper>
                <DataTable 
                    columns={columns} 
                    data={usuarios.filter(u => u.nome_completo?.toLowerCase().includes(search.toLowerCase()) || u.email?.toLowerCase().includes(search.toLowerCase()))} 
                    loading={loading} 
                    page={page - 1}
                    totalCount={totalCount}
                    onPageChange={(e, newPage) => setPage(newPage + 1)}
                />
            </GlassCard>

            <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="sm" fullWidth>
                <DialogTitle sx={{ fontFamily: 'Orbitron', fontWeight: 700 }}>{selectedUser ? 'PRIVILÉGIOS' : 'NOVA CREDENCIAL'}</DialogTitle>
                <DialogContent>
                    <Stack spacing={3} sx={{ pt: 2 }}>
                        <TextField
                            label="Email"
                            fullWidth
                            placeholder="operador@empresa.com"
                            value={formData.email}
                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                            required
                            helperText={selectedUser ? 'Alterar o email substituirá o email de login do operador.' : undefined}
                        />

                        <TextField label="Nome Completo" fullWidth placeholder="João Silva" value={formData.nome_completo} onChange={(e) => setFormData({ ...formData, nome_completo: e.target.value })} required />

                        <TextField label="Telefone" fullWidth placeholder="(11) 98765-4321" value={formData.telefone} onChange={(e) => setFormData({ ...formData, telefone: e.target.value })} />

                        <FormControl fullWidth required>
                            <InputLabel>Evento Vinculado</InputLabel>
                            <Select value={formData.evento_id} label="Evento Vinculado" onChange={(e) => setFormData({ ...formData, evento_id: e.target.value })}>
                                {eventos.map(e => <MenuItem key={e.id} value={e.id}>{e.nome}</MenuItem>)}
                            </Select>
                        </FormControl>

                        {/* Permissões */}
                        {selectedUser && (
                            <Box>
                                <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 2, color: '#00D4FF' }}>PERMISSÕES</Typography>
                                <Stack spacing={1}>
                                    {[
                                        { key: 'dashboard', label: 'Dashboard' },
                                        { key: 'pessoas', label: 'Pessoas' },
                                        { key: 'empresas', label: 'Empresas' },
                                        { key: 'checkin', label: 'Check-in' },
                                        { key: 'checkout', label: 'Check-out' },
                                        { key: 'monitoramento', label: 'Monitoramento' },
                                        { key: 'relatorios', label: 'Relatórios' },
                                        { key: 'auditoria_documentos', label: 'Auditoria Documentos' },
                                        { key: 'dispositivos', label: 'Dispositivos' },
                                        { key: 'usuarios', label: 'Usuários' }
                                    ].map(perm => (
                                        <Box key={perm.key} sx={{ display: 'flex', alignItems: 'center' }}>
                                            <Switch
                                                size="small"
                                                disabled={perm.key === 'dashboard'}
                                                checked={formData.permissions[perm.key] || false}
                                                onChange={(e) => setFormData({
                                                    ...formData,
                                                    permissions: {
                                                        ...formData.permissions,
                                                        [perm.key]: e.target.checked
                                                    }
                                                })}
                                            />
                                            <Typography variant="body2" sx={{ ml: 1 }}>{perm.label}</Typography>
                                        </Box>
                                    ))}
                                </Stack>
                            </Box>
                        )}
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ p: 3 }}>
                    <Button onClick={() => setOpenDialog(false)} sx={{ color: 'text.secondary' }}>ABORTAR</Button>
                    <NeonButton onClick={handleSave}>{selectedUser ? 'SALVAR ALTERAÇÕES' : 'ENVIAR CONVITE'}</NeonButton>
                </DialogActions>
            </Dialog>


            <Dialog open={openPasswordDialog} onClose={() => !resetingPassword && setOpenPasswordDialog(false)} maxWidth="xs" fullWidth>
                <DialogTitle sx={{ fontFamily: 'Orbitron', fontWeight: 700 }}>FORÇAR NOVA SENHA</DialogTitle>
                <DialogContent>
                    <Typography variant="caption" sx={{ mb: 2, display: 'block', color: 'text.secondary' }}>Alterando a senha de: <b>{selectedUser?.nome_completo}</b></Typography>
                    <TextField label="Nova Senha" type="password" fullWidth value={newPassword} onChange={(e) => setNewPassword(e.target.value)} sx={{ mt: 1 }} />
                </DialogContent>
                <DialogActions sx={{ p: 3 }}>
                    <Button onClick={() => setOpenPasswordDialog(false)} disabled={resetingPassword}>CANCELAR</Button>
                    <NeonButton onClick={() => handleResetPassword(selectedUser.id, newPassword)} loading={resetingPassword}>CONFIRMAR RESET</NeonButton>
                </DialogActions>
            </Dialog>

            <Dialog open={_openDeleteConfirm} onClose={() => setOpenDeleteConfirm(false)} maxWidth="xs" fullWidth>
                <DialogTitle sx={{ fontFamily: 'Orbitron', fontWeight: 700, color: '#FF3366' }}>DELETAR OPERADOR</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" sx={{ mt: 2, mb: 2, color: 'text.primary' }}>
                        Tem certeza que deseja deletar o operador <b>{selectedUser?.nome_completo}</b>?
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                        ⚠️ Esta ação não pode ser desfeita. O operador perderá acesso ao sistema.
                    </Typography>
                </DialogContent>
                <DialogActions sx={{ p: 3 }}>
                    <Button onClick={() => setOpenDeleteConfirm(false)} sx={{ color: 'text.secondary' }}>CANCELAR</Button>
                    <Button
                        onClick={() => {
                            handleDeleteUser(selectedUser.id);
                            setOpenDeleteConfirm(false);
                        }}
                        sx={{ color: '#FF3366', fontWeight: 'bold', '&:hover': { background: 'rgba(255, 51, 102, 0.1)' } }}
                    >
                        CONFIRMAR DELETE
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default Usuarios;
