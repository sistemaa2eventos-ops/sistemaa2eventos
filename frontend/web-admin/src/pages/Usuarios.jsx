import React, { useState, useEffect } from 'react';
import ConfirmDialog from '../components/common/ConfirmDialog';
import {
    Box,
    Typography,
    Stack,
    IconButton,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    Button,
    Grid,
    Avatar,
    Chip,
    MenuItem,
    Select,
    FormControl,
    InputLabel,
    Tooltip,
} from '@mui/material';
import {
    Add as AddIcon,
    Edit as EditIcon,
    Delete as DeleteIcon,
    Search as SearchIcon,
    AdminPanelSettings as AdminIcon,
    Badge as BadgeIcon,
    Email as EmailIcon,
} from '@mui/icons-material';
import api from '../services/api';
import GlassCard from '../components/common/GlassCard';
import PageHeader from '../components/common/PageHeader';
import NeonButton from '../components/common/NeonButton';
import DataTable from '../components/common/DataTable';
import PhotoCapture from '../components/common/PhotoCapture';
import { styled } from '@mui/material/styles';
import { format } from 'date-fns';

const SearchWrapper = styled(Box)(({ theme }) => ({
    background: 'rgba(10, 22, 40, 0.6)',
    border: '1px solid rgba(0, 212, 255, 0.1)',
    borderRadius: 12,
    padding: theme.spacing(1, 2),
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    marginBottom: theme.spacing(3),
    '&:focus-within': {
        border: '1px solid rgba(0, 212, 255, 0.4)',
        boxShadow: '0 0 10px rgba(0, 212, 255, 0.1)',
    }
}));

const RoleChip = styled(Chip)(({ theme, role }) => ({
    fontWeight: 700,
    fontSize: '0.65rem',
    height: 24,
    background: role === 'admin'
        ? 'rgba(255, 184, 0, 0.1)'
        : role === 'supervisor'
            ? 'rgba(123, 47, 190, 0.1)'
            : 'rgba(0, 212, 255, 0.1)',
    color: role === 'admin'
        ? '#FFB800'
        : role === 'supervisor'
            ? '#7B2FBE'
            : '#00D4FF',
    border: `1px solid ${role === 'admin'
        ? 'rgba(255, 184, 0, 0.2)'
        : role === 'supervisor'
            ? 'rgba(123, 47, 190, 0.2)'
            : 'rgba(0, 212, 255, 0.2)'}`,
    textTransform: 'uppercase',
    letterSpacing: '1px'
}));

const Usuarios = () => {
    const [usuarios, setUsuarios] = useState([]);
    const [loading, setLoading] = useState(true);
    const [deleteLoading, setDeleteLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [openDialog, setOpenDialog] = useState(false);
    const [openDeleteConfirm, setOpenDeleteConfirm] = useState(false);
    const [userToDelete, setUserToDelete] = useState(null);
    const [selectedUser, setSelectedUser] = useState(null);
    const [eventos, setEventos] = useState([]);
    const [formData, setFormData] = useState({
        email: '',
        password: '',
        nome_completo: '',
        cpf: '',
        nome_mae: '',
        data_nascimento: '',
        foto_url: '',
        nivel_acesso: 'operador',
        evento_id: ''
    });

    const columns = [
        {
            id: 'foto_url',
            label: 'ID FOTO',
            minWidth: 80,
            format: (val) => (
                <Avatar
                    src={val}
                    sx={{
                        width: 40,
                        height: 40,
                        border: '1px solid rgba(0,212,255,0.3)',
                        boxShadow: '0 0 10px rgba(0,212,255,0.2)'
                    }}
                />
            )
        },
        {
            id: 'nome_completo',
            label: 'PAINEL OPERADOR',
            minWidth: 250,
            format: (val, row) => (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Box>
                        <Typography variant="body2" sx={{ fontWeight: 700, color: '#fff' }}>{val || 'Sem Nome'}</Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <EmailIcon sx={{ fontSize: 10 }} /> {row.email}
                        </Typography>
                    </Box>
                </Box>
            )
        },
        { id: 'cpf', label: 'CPF', minWidth: 150 },
        {
            id: 'nivel_acesso',
            label: 'CARGO',
            minWidth: 120,
            format: (val) => <RoleChip role={val} label={val === 'operador' ? 'OPERADOR' : val.toUpperCase()} />
        },
        {
            id: 'eventos',
            label: 'VÍNCULO',
            minWidth: 150,
            format: (val) => val?.nome || 'Nexus Central'
        },
        {
            id: 'acoes',
            label: 'AÇÕES',
            minWidth: 100,
            align: 'center',
            format: (value, row) => (
                <Stack direction="row" spacing={1} justifyContent="center">
                    <IconButton
                        size="small"
                        onClick={() => handleOpenDialog(row)}
                        sx={{ color: '#00D4FF', background: 'rgba(0,212,255,0.05)' }}
                    >
                        <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                        size="small"
                        disabled={row.nivel_acesso === 'admin'}
                        onClick={() => handleDelete(row.id)}
                        sx={{ color: '#FF3366', background: 'rgba(255,51,102,0.05)' }}
                    >
                        <DeleteIcon fontSize="small" />
                    </IconButton>
                </Stack>
            ),
        },
    ];

    useEffect(() => {
        loadUsuarios();
        loadEventos();
    }, []);

    const loadEventos = async () => {
        try {
            const response = await api.get('/eventos');
            setEventos(response.data.data || []);
        } catch (error) {
            console.error('Erro ao buscar eventos:', error);
        }
    };

    const loadUsuarios = async () => {
        try {
            setLoading(true);
            const response = await api.get('/auth/users');
            setUsuarios(response.data.data || []);
        } catch (error) {
            console.error('Erro ao buscar usuários:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleOpenDialog = (user = null) => {
        if (user) {
            setSelectedUser(user);
            setFormData({
                email: user.email,
                nome_completo: user.nome_completo || '',
                cpf: user.cpf || '',
                nome_mae: user.nome_mae || '',
                data_nascimento: user.data_nascimento ? format(new Date(user.data_nascimento), "yyyy-MM-dd") : '',
                foto_url: user.foto_url || '',
                nivel_acesso: user.nivel_acesso || 'operador',
                evento_id: user.evento_id || '',
                password: '',
            });
        } else {
            setSelectedUser(null);
            setFormData({
                email: '',
                password: '',
                nome_completo: '',
                cpf: '',
                nome_mae: '',
                data_nascimento: '',
                foto_url: '',
                nivel_acesso: 'operador',
                evento_id: '',
            });
        }
        setOpenDialog(true);
    };

    const handleCloseDialog = () => {
        setOpenDialog(false);
        setSelectedUser(null);
    };

    const handleSave = async () => {
        try {
            if (selectedUser) {
                await api.put(`/auth/users/${selectedUser.id}/role`, {
                    nivel_acesso: formData.nivel_acesso,
                    evento_id: formData.evento_id || null
                });
            } else {
                await api.post('/auth/register', formData);
            }
            handleCloseDialog();
            loadUsuarios();
        } catch (error) {
            console.error('Erro ao salvar usuário:', error);
        }
    };

    const handleDelete = (id) => {
        setUserToDelete(id);
        setOpenDeleteConfirm(true);
    };

    const confirmDelete = async () => {
        try {
            setDeleteLoading(true);
            await api.delete(`/auth/users/${userToDelete}`);
            setOpenDeleteConfirm(false);
            setUserToDelete(null);
            loadUsuarios();
        } catch (error) {
            console.error('Erro ao excluir usuário:', error);
            alert('Erro ao excluir usuário.');
        } finally {
            setDeleteLoading(false);
        }
    };

    return (
        <Box sx={{ p: 4 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 4 }}>
                <PageHeader
                    title="Painel de Controle de Usuários"
                    subtitle="Gestão de privilégios e operadores do ecossistema."
                    breadcrumbs={[{ text: 'Configurações' }, { text: 'Usuários' }]}
                />
                <NeonButton
                    startIcon={<AddIcon />}
                    onClick={() => handleOpenDialog()}
                    sx={{ mt: 2 }}
                >
                    Novo Operador
                </NeonButton>
            </Box>

            <GlassCard glowColor="#FFB800" sx={{ p: 3, mb: 3 }}>
                <SearchWrapper>
                    <SearchIcon sx={{ color: 'text.secondary' }} />
                    <input
                        type="text"
                        placeholder="Rastrear credencial por nome ou email..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#fff',
                            width: '100%',
                            outline: 'none',
                            fontFamily: 'inherit',
                            fontSize: '0.9rem'
                        }}
                    />
                </SearchWrapper>

                <DataTable
                    columns={columns}
                    data={usuarios.filter(u =>
                        u.nome_completo?.toLowerCase().includes(search.toLowerCase()) ||
                        u.email?.toLowerCase().includes(search.toLowerCase())
                    )}
                    loading={loading}
                />
            </GlassCard>

            <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
                <DialogTitle sx={{ fontFamily: '"Orbitron", sans-serif', fontWeight: 700, letterSpacing: '2px' }}>
                    {selectedUser ? 'MODIFICAR PRIVILÉGIOS' : 'CADASTRAR NOVO OPERADOR'}
                </DialogTitle>
                <DialogContent>
                    <Box sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <PhotoCapture
                            onPhotoCaptured={(url) => setFormData({ ...formData, foto_url: url })}
                            initialPhoto={formData.foto_url}
                        />

                        {!selectedUser && (
                            <Grid container spacing={2}>
                                <Grid item xs={12}>
                                    <TextField
                                        label="Email do Nexus"
                                        fullWidth
                                        required
                                        value={formData.email}
                                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                    />
                                </Grid>
                                <Grid item xs={12}>
                                    <TextField
                                        label="Senha de Acesso"
                                        type="password"
                                        fullWidth
                                        required
                                        value={formData.password}
                                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                    />
                                </Grid>
                            </Grid>
                        )}

                        <Grid container spacing={2}>
                            <Grid item xs={12}>
                                <TextField
                                    label="Nome Completo"
                                    fullWidth
                                    required
                                    value={formData.nome_completo}
                                    onChange={(e) => setFormData({ ...formData, nome_completo: e.target.value })}
                                />
                            </Grid>
                            <Grid item xs={6}>
                                <TextField
                                    label="CPF"
                                    fullWidth
                                    required
                                    value={formData.cpf}
                                    onChange={(e) => setFormData({ ...formData, cpf: e.target.value })}
                                />
                            </Grid>
                            <Grid item xs={6}>
                                <TextField
                                    label="Data de Nascimento"
                                    type="date"
                                    fullWidth
                                    required
                                    InputLabelProps={{ shrink: true }}
                                    value={formData.data_nascimento}
                                    onChange={(e) => setFormData({ ...formData, data_nascimento: e.target.value })}
                                />
                            </Grid>
                            <Grid item xs={12}>
                                <TextField
                                    label="Nome da Mãe"
                                    fullWidth
                                    required
                                    value={formData.nome_mae}
                                    onChange={(e) => setFormData({ ...formData, nome_mae: e.target.value })}
                                />
                            </Grid>
                            <Grid item xs={12}>
                                <FormControl fullWidth>
                                    <InputLabel id="role-select-label">Nível de Acesso</InputLabel>
                                    <Select
                                        labelId="role-select-label"
                                        value={formData.nivel_acesso}
                                        label="Nível de Acesso"
                                        onChange={(e) => setFormData({ ...formData, nivel_acesso: e.target.value })}
                                    >
                                        <MenuItem value="operador">Operador (Check-in/CRUD)</MenuItem>
                                        <MenuItem value="supervisor">Supervisor (Gestão/Relatórios)</MenuItem>
                                        <MenuItem value="admin">Administrador (Total)</MenuItem>
                                    </Select>
                                </FormControl>
                            </Grid>
                            <Grid item xs={12}>
                                <FormControl fullWidth>
                                    <InputLabel id="event-select-label">Evento Atribuído (Nexus)</InputLabel>
                                    <Select
                                        labelId="event-select-label"
                                        value={formData.evento_id}
                                        label="Evento Atribuído (Nexus)"
                                        onChange={(e) => setFormData({ ...formData, evento_id: e.target.value })}
                                    >
                                        <MenuItem value=""><em>Nenhum (Acesso Global)</em></MenuItem>
                                        {eventos.map(event => (
                                            <MenuItem key={event.id} value={event.id}>{event.nome}</MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                            </Grid>
                        </Grid>
                    </Box>
                </DialogContent>
                <DialogActions sx={{ p: 3 }}>
                    <Button onClick={handleCloseDialog} sx={{ color: 'text.secondary', fontWeight: 700 }}>ABORTAR</Button>
                    <NeonButton onClick={handleSave}>SINCRONIZAR CREDENCIAL</NeonButton>
                </DialogActions>
            </Dialog>

            <ConfirmDialog
                open={openDeleteConfirm}
                onConfirm={confirmDelete}
                onCancel={() => setOpenDeleteConfirm(false)}
                loading={deleteLoading}
                title="EXCLUIR OPERADOR"
                message="Esta ação irá remover permanentemente as credenciais deste operador. Deseja prosseguir?"
            />
        </Box>
    );
};

export default Usuarios;
