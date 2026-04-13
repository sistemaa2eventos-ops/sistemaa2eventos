import React, { useState } from 'react';
import {
    Box, Typography, Stack, IconButton, Dialog, DialogTitle, DialogContent,
    DialogActions, TextField, Button, Grid, Avatar, Chip, MenuItem, Select,
    FormControl, InputLabel, Tooltip, Switch
} from '@mui/material';
import {
    Add as AddIcon, Edit as EditIcon,
    Search as SearchIcon, Email as EmailIcon, LockReset as ResetIcon
} from '@mui/icons-material';
import { styled } from '@mui/material/styles';

import ConfirmDialog from '../components/common/ConfirmDialog';
import GlassCard from '../components/common/GlassCard';
import PageHeader from '../components/common/PageHeader';
import NeonButton from '../components/common/NeonButton';
import DataTable from '../components/common/DataTable';
import PhotoCapture from '../components/common/PhotoCapture';
import { useUsuarios } from '../hooks/useUsuarios';
import { useAuth } from '../contexts/AuthContext';

const SearchWrapper = styled(Box)(({ theme }) => ({
    background: 'rgba(10, 22, 40, 0.6)', border: '1px solid rgba(0, 212, 255, 0.1)',
    borderRadius: 12, padding: theme.spacing(1, 2), display: 'flex', alignItems: 'center',
    gap: theme.spacing(1), marginBottom: theme.spacing(3)
}));

const RoleChip = styled(Chip)(({ theme, role }) => ({
    fontWeight: 700, fontSize: '0.65rem', height: 24, textTransform: 'uppercase',
    background: role === 'admin' ? 'rgba(255, 184, 0, 0.1)' : 'rgba(0, 212, 255, 0.1)',
    color: role === 'admin' ? '#FFB800' : '#00D4FF',
    border: `1px solid ${role === 'admin' ? 'rgba(255, 184, 0, 0.2)' : 'rgba(0, 212, 255, 0.2)'}`
}));

/**
 * Usuarios: Tela de gestão de operadores e credenciais administrativas.
 * Utiliza useUsuarios para centralizar o CRUD e gestão de permissões.
 */
const Usuarios = () => {
    const {
        usuarios, eventos, loading, deleteLoading, search, setSearch, page, setPage, totalCount,
        openDialog, setOpenDialog, openDeleteConfirm, setOpenDeleteConfirm,
        selectedUser, setSelectedUser, formData, setFormData,
        openPasswordDialog, setOpenPasswordDialog,
        resetingPassword, handleResetPassword,
        handleOpenDialog, handleSave, handleToggleStatus, setUserToDelete
    } = useUsuarios();
    const { user: currentUser } = useAuth();
    const [newPassword, setNewPassword] = useState('');

    // Definição da Hierarquia de Peso
    const roleWeights = { master: 2, admin: 0, supervisor: 0, operador: 1 };
    const currentUserWeight = roleWeights[currentUser?.nivel_acesso] || 1;

    const columns = [
        {
            id: 'foto_url', label: 'ID FOTO', minWidth: 80,
            format: (val) => <Avatar src={val} sx={{ width: 40, height: 40, border: '1px solid rgba(0,212,255,0.3)' }} />
        },
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
        { id: 'cpf', label: 'CPF', minWidth: 150 },
        {
            id: 'nivel_acesso', label: 'CARGO', minWidth: 120,
            format: (val) => (
                <RoleChip 
                    role={val} 
                    label={val === 'operador' ? 'OPERADOR' : val.toUpperCase()} 
                    sx={{ 
                        background: val === 'master' ? 'rgba(0, 212, 255, 0.2)' : (val === 'admin' ? 'rgba(255, 184, 0, 0.1)' : 'rgba(255,255,255,0.05)'),
                        color: val === 'master' ? '#00D4FF' : (val === 'admin' ? '#FFB800' : '#fff'),
                        border: `1px solid ${val === 'master' ? '#00D4FF' : (val === 'admin' ? '#FFB800' : 'rgba(255,255,255,0.1)')}`,
                        boxShadow: val === 'master' ? '0 0 10px rgba(0, 212, 255, 0.3)' : 'none'
                    }}
                />
            )
        },
        {
            id: 'eventos', label: 'VÍNCULO', minWidth: 150,
            format: (val) => val?.nome || 'A2 Eventos / NZT Central'
        },
        {
            id: 'acoes', label: 'AÇÕES', minWidth: 100, align: 'center',
            format: (_, row) => {
                const targetWeight = roleWeights[row.nivel_acesso] || 1;
                const canManage = currentUserWeight > targetWeight || (currentUser?.nivel_acesso === 'master');

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
                        <Tooltip title={canManage ? "Estatus Ativo/Inativo" : "Privilégio Insuficiente"}>
                            <span>
                                <Switch size="small" checked={row.ativo !== false} disabled={!canManage || row.nivel_acesso === 'master'} onChange={() => handleToggleStatus(row.id, row.ativo !== false)} color="info" />
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
                        <PhotoCapture onPhotoCaptured={(url) => setFormData({ ...formData, foto_url: url })} initialPhoto={formData.foto_url} />
                        <TextField label="Nome Completo" fullWidth value={formData.nome_completo} onChange={(e) => setFormData({ ...formData, nome_completo: e.target.value })} />
                        <TextField label="CPF" fullWidth value={formData.cpf} onChange={(e) => setFormData({ ...formData, cpf: e.target.value })} />
                        <TextField label="Data Nascimento" type="date" fullWidth InputLabelProps={{ shrink: true }} value={formData.data_nascimento} onChange={(e) => setFormData({ ...formData, data_nascimento: e.target.value })} />
                        
                        {!selectedUser && (
                            <TextField label="Email" fullWidth value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
                        )}

                        <FormControl fullWidth>
                            <InputLabel>Nível de Acesso</InputLabel>
                            <Select value={formData.nivel_acesso} label="Nível de Acesso" onChange={(e) => setFormData({ ...formData, nivel_acesso: e.target.value })}>
                                {currentUser?.nivel_acesso === 'master' && <MenuItem value="master">MASTER (GOD MODE)</MenuItem>}
                                <MenuItem value="operador">OPERADOR</MenuItem>
                            </Select>
                        </FormControl>

                        <FormControl fullWidth>
                            <InputLabel>Evento Vinculado</InputLabel>
                            <Select value={formData.evento_id} label="Evento Vinculado" onChange={(e) => setFormData({ ...formData, evento_id: e.target.value })}>
                                <MenuItem value="">A2 Eventos / NZT Central (Global)</MenuItem>
                                {eventos.map(e => <MenuItem key={e.id} value={e.id}>{e.nome}</MenuItem>)}
                            </Select>
                        </FormControl>
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
        </Box>
    );
};

export default Usuarios;
