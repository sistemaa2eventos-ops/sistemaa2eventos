import React, { useState } from 'react';
import {
    Box, Typography, Stack, IconButton, Dialog, DialogTitle, DialogContent,
    DialogActions, TextField, Button, Chip, MenuItem, Select,
    FormControl, InputLabel, Tooltip, Switch, InputAdornment, RadioGroup,
    FormControlLabel, Radio, Accordion,
    AccordionSummary, AccordionDetails, Checkbox, ListItemText, OutlinedInput
} from '@mui/material';
import {
    Add as AddIcon, Edit as EditIcon,
    Search as SearchIcon, Email as EmailIcon, LockReset as ResetIcon,
    CheckCircle as AtivoIcon, HourglassEmpty as PendenteIcon, Cancel as InativoIcon,
    Check as ApproveIcon, Delete as DeleteIcon, Public as GlobalIcon,
    EventAvailable as EventIcon, ExpandMore as ExpandMoreIcon,
    ContentCopy as CopyIcon, Shield as ShieldIcon, Send as SendIcon,
    WarningAmber as WarningIcon, Key as KeyIcon
} from '@mui/icons-material';
import { styled } from '@mui/material/styles';
import { useSnackbar } from 'notistack';

import GlassCard from '../components/common/GlassCard';
import PageHeader from '../components/common/PageHeader';
import NeonButton from '../components/common/NeonButton';
import DataTable from '../components/common/DataTable';
import { useUsuarios, MODULOS, DEFAULT_PERMISSIONS } from '../hooks/useUsuarios';
import { useAuth } from '../contexts/AuthContext';
import TituloModal from '../components/common/TituloModal';

import { botaoSecundario, papeis, tom } from '../styles/tokens';
const RoleChip = styled(Chip)(({ role }) => ({
    fontWeight: 700, fontSize: '0.75rem', height: 24,
    background: role === 'admin_master' ? 'rgba(0, 212, 255, 0.1)' : 'rgba(0, 212, 255, 0.05)',
    color: role === 'admin_master' ? '#00D4FF' : '#FFFFFF',
    border: `1px solid ${role === 'admin_master' ? 'rgba(0, 212, 255, 0.2)' : 'rgba(255,255,255,0.1)'}`
}));

const StatusChip = styled(Chip)(({ status }) => ({
    fontWeight: 700, fontSize: '0.75rem', height: 24,
    background: status === 'ativo' ? 'rgba(0, 255, 136, 0.1)' : (status === 'pendente' ? 'rgba(255, 184, 0, 0.1)' : 'rgba(255, 51, 102, 0.1)'),
    color: status === 'ativo' ? '#00FF88' : (status === 'pendente' ? '#FFB800' : '#FF3366'),
    border: `1px solid ${status === 'ativo' ? 'rgba(0, 255, 136, 0.2)' : (status === 'pendente' ? 'rgba(255, 184, 0, 0.2)' : 'rgba(255, 51, 102, 0.2)')}`
}));

/**
 * Usuarios: Tela de gestão de operadores e credenciais administrativas.
 * Permite vínculo global ou por evento específico com permissões customizadas por evento.
 */
const Usuarios = () => {
    const {
        usuarios, orfaos, eventos, loading, search, setSearch, page, setPage, totalCount,
        openDialog, setOpenDialog, openDeleteConfirm, setOpenDeleteConfirm,
        selectedUser, setSelectedUser, formData, setFormData,
        openPasswordDialog, setOpenPasswordDialog,
        resetingPassword, resendingId,
        inviteLinkInfo, setInviteLinkInfo,
        handleResetPassword, handleResendInvite,
        updateEventPermission, copyPermissionsToAllEvents,
        handleOpenDialog, handleSave, handleApprove, handleToggleStatus, handleDeleteUser
    } = useUsuarios();
    const { user: currentUser } = useAuth();
    const { enqueueSnackbar } = useSnackbar();
    const [newPassword, setNewPassword] = useState('');
    const [expandedAccordion, setExpandedAccordion] = useState(false);

    const isAdmin = currentUser?.nivel_acesso === 'admin_master';

    const handleCopyLink = (link) => {
        if (!link) return;
        navigator.clipboard.writeText(link);
        enqueueSnackbar('Link de ativação copiado para a área de transferência!', { variant: 'success' });
    };

    // Helper para buscar nome de um evento pelo id
    const getEventoNome = (eventoId) => {
        const found = eventos.find(e => e.id === eventoId);
        return found ? found.nome : `Evento (${eventoId.substring(0, 6)}...)`;
    };

    const columns = [
        {
            id: 'nome_completo', label: 'Operador', minWidth: 230,
            format: (val, row) => (
                <Box>
                    <Typography variant="body2" fontWeight={700} color="#FFFFFF">{val || row.email}</Typography>
                    {/* Pedido feito em "Esqueci minha senha" na tela de login (some quando a senha é redefinida) */}
                    {row.senha_solicitada_em && (
                        <Tooltip title={`Pediu em ${new Date(row.senha_solicitada_em).toLocaleString('pt-BR')}. Use Redefinir senha e avise o operador.`}>
                            <Chip size="small" icon={<ResetIcon sx={{ fontSize: 14 }} />} label="Pediu nova senha"
                                onClick={isAdmin && row.nivel_acesso !== 'admin_master' ? () => { setSelectedUser(row); setOpenPasswordDialog(true); } : undefined}
                                sx={{ mt: 0.5, height: 20, fontSize: '0.7rem', color: '#FFB800', bgcolor: 'rgba(255,184,0,0.12)', border: '1px solid rgba(255,184,0,0.4)', '& .MuiChip-icon': { color: '#FFB800' } }} />
                        </Tooltip>
                    )}
                    {/* E-mail só quando é diferente do nome (antes aparecia repetido ou vazio) */}
                    {row.email && row.email !== val && (
                        <Typography variant="caption" color="text.secondary" display="flex" alignItems="center" gap={0.5}>
                            <EmailIcon sx={{ fontSize: 12 }} /> {row.email}
                        </Typography>
                    )}
                    {row.nivel_acesso !== 'admin_master' && row.senha_definida === false && (
                        <Chip
                            size="small"
                            label="Aguardando definir senha"
                            sx={{ mt: 0.5, height: 18, fontSize: '0.68rem', color: '#00D4FF', bgcolor: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.3)' }}
                        />
                    )}
                </Box>
            )
        },
        { id: 'telefone', label: 'Telefone', minWidth: 130 },
        {
            id: 'nivel_acesso', label: 'Cargo', minWidth: 100,
            format: (val, _row) => {
                const isRowMaster = val === 'admin_master';
                return (
                    <RoleChip 
                        role={isRowMaster ? 'admin_master' : val} 
                        label={isRowMaster ? 'Admin master' : 'Operador'} 
                        sx={{ 
                            background: tom(papeis[isRowMaster ? 'admin_master' : 'operador'].cor, 0.12),
                            color: papeis[isRowMaster ? 'admin_master' : 'operador'].cor,
                            border: `1px solid ${tom(papeis[isRowMaster ? 'admin_master' : 'operador'].cor, 0.4)}`
                        }}
                    />
                );
            }
        },
        {
            id: 'vinculo', label: 'Vínculo com eventos', minWidth: 200,
            format: (_, row) => {
                const isRowMaster = row.nivel_acesso === 'admin_master';
                if (isRowMaster) {
                    return (
                        <Chip
                            icon={<GlobalIcon sx={{ fontSize: '14px !important', color: '#00D4FF !important' }} />}
                            label="Acesso total"
                            size="small"
                            sx={{ background: 'rgba(0, 212, 255, 0.15)', color: '#00D4FF', fontWeight: 700, border: '1px solid rgba(0, 212, 255, 0.3)' }}
                        />
                    );
                }

                const isGlobal = row.vinculo_tipo === 'global';
                if (isGlobal) {
                    return (
                        <Chip
                            icon={<GlobalIcon sx={{ fontSize: '14px !important', color: '#00D4FF !important' }} />}
                            label="Todos os eventos"
                            size="small"
                            sx={{ background: 'rgba(0, 212, 255, 0.1)', color: '#00D4FF', fontWeight: 700, border: '1px solid rgba(0, 212, 255, 0.25)' }}
                        />
                    );
                }

                const permitidos = row.eventos_permitidos || [];
                const tooltipText = permitidos.map(id => getEventoNome(id)).join(', ');

                return (
                    <Tooltip title={tooltipText || "Nenhum evento vinculado"} arrow>
                        <Chip
                            icon={<EventIcon sx={{ fontSize: '14px !important', color: '#FFB800 !important' }} />}
                            label={`${permitidos.length} ${permitidos.length === 1 ? 'evento específico' : 'eventos específicos'}`}
                            size="small"
                            sx={{ background: 'rgba(255, 184, 0, 0.1)', color: '#FFB800', fontWeight: 700, border: '1px solid rgba(255, 184, 0, 0.3)' }}
                        />
                    </Tooltip>
                );
            }
        },
        {
            id: 'permissoes', label: 'Permissões liberadas', minWidth: 200,
            format: (_, row) => {
                const isRowMaster = row.nivel_acesso === 'admin_master';
                if (isRowMaster) {
                    return <Typography variant="caption" sx={{ color: '#00D4FF', fontWeight: 700 }}>Todas as permissões</Typography>;
                }

                // Resumo de permissões habilitadas
                const perms = row.permissions || {};
                const activePermsList = MODULOS.filter(m => perms[m.key] === true);

                if (activePermsList.length === 0) {
                    return <Typography variant="caption" sx={{ color: 'text.secondary' }}>Nenhuma permissão</Typography>;
                }

                return (
                    <Stack direction="row" spacing={0.5} flexWrap="wrap" gap={0.5}>
                        {activePermsList.slice(0, 3).map(m => (
                            <Chip
                                key={m.key}
                                label={m.label}
                                size="small"
                                sx={{ height: 20, fontSize: '0.75rem', background: 'rgba(255,255,255,0.06)', color: '#FFFFFF', border: '1px solid rgba(255,255,255,0.1)' }}
                            />
                        ))}
                        {activePermsList.length > 3 && (
                            <Tooltip title={activePermsList.map(m => m.label).join(', ')}>
                                <Chip
                                    label={`+${activePermsList.length - 3}`}
                                    size="small"
                                    sx={{ height: 20, fontSize: '0.75rem', background: 'rgba(0, 212, 255, 0.1)', color: '#00D4FF', fontWeight: 700 }}
                                />
                            </Tooltip>
                        )}
                    </Stack>
                );
            }
        },
        {
            id: 'status', label: 'Status', minWidth: 90,
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
            id: 'acoes', label: 'Ações', minWidth: 120, align: 'center',
            format: (_, row) => {
                const isRowMaster = row.nivel_acesso === 'admin_master';
                const canManage = isAdmin && !isRowMaster;

                return (
                    <Stack direction="row" spacing={0.5} justifyContent="center" alignItems="center">
                        <Tooltip title={canManage ? "Reenviar convite / Obter link de acesso" : "Privilégio Insuficiente"}>
                            <span>
                                <IconButton
                                    size="small"
                                    disabled={!canManage || resendingId === row.id}
                                    onClick={() => handleResendInvite(row)}
                                    sx={{ color: '#00FF88' }}
                                >
                                    <SendIcon fontSize="small" />
                                </IconButton>
                            </span>
                        </Tooltip>
                        <Tooltip title={canManage ? "Definir / Resetar Senha" : "Privilégio Insuficiente"}>
                            <span>
                                <IconButton size="small" disabled={!canManage} onClick={() => { setSelectedUser(row); setOpenPasswordDialog(true); }} sx={{ color: '#FFB800' }}><ResetIcon fontSize="small" /></IconButton>
                            </span>
                        </Tooltip>
                        <Tooltip title={canManage ? "Editar Permissões & Vínculo" : "Privilégio Insuficiente"}>
                            <span>
                                <IconButton size="small" disabled={!canManage} onClick={() => handleOpenDialog(row)} sx={{ color: '#00D4FF' }}><EditIcon fontSize="small" /></IconButton>
                            </span>
                        </Tooltip>
                        {row.status === 'pendente' && (
                            <Tooltip title="Aprovar usuário">
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
        <Box sx={{ p: { xs: 2, md: 3 } }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, mb: 3, flexWrap: 'wrap', gap: 2 }}>
                <PageHeader 
                    title="Operadores" 
                    subtitle="Quem acessa o painel, em quais eventos e com quais permissões." 
                    sx={{ mb: 0 }}
                />
                <NeonButton startIcon={<AddIcon />} onClick={() => handleOpenDialog()} sx={{ height: 40 }}>Novo operador</NeonButton>
            </Box>

            {/* Alerta de contas órfãs no Supabase Auth (sem perfil na tabela perfis) */}
            {isAdmin && orfaos.length > 0 && (
                <Box sx={{
                    mb: 3, p: 2, borderRadius: 2,
                    background: 'rgba(255, 184, 0, 0.08)',
                    border: '1px solid rgba(255, 184, 0, 0.35)'
                }}>
                    <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1.5 }}>
                        <WarningIcon sx={{ color: '#FFB800', fontSize: 22 }} />
                        <Box>
                            <Typography variant="subtitle2" fontWeight={700} sx={{ color: '#FFB800' }}>
                                {orfaos.length} {orfaos.length === 1 ? 'conta incompleta encontrada' : 'contas incompletas encontradas'} no servidor de autenticação
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                Estes e-mails possuem credencial antiga no Auth, mas estavam sem perfil ativo. Você pode concluir o cadastro como operador ou removê-los definitivamente.
                            </Typography>
                        </Box>
                    </Stack>
                    <Stack spacing={1}>
                        {orfaos.map((orfao) => (
                            <Box
                                key={orfao.id}
                                sx={{
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                    flexWrap: 'wrap', gap: 1, p: 1.25, borderRadius: 1.5,
                                    background: 'rgba(10, 22, 40, 0.65)',
                                    border: '1px solid rgba(255, 255, 255, 0.08)'
                                }}
                            >
                                <Box>
                                    <Typography variant="body2" fontWeight={700} color="#FFFFFF">
                                        {orfao.email}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        {orfao.nome_completo ? `${orfao.nome_completo} • ` : ''}
                                        Criado em {new Date(orfao.created_at).toLocaleDateString('pt-BR')}
                                        {orfao.email_confirmado ? ' • E-mail confirmado' : ' • E-mail não confirmado'}
                                    </Typography>
                                </Box>
                                <Stack direction="row" spacing={1}>
                                    <Button
                                        size="small"
                                        variant="outlined"
                                        startIcon={<AddIcon />}
                                        onClick={() => handleOpenDialog(null, orfao)}
                                        sx={{
                                            color: '#00FF88',
                                            borderColor: 'rgba(0, 255, 136, 0.4)',
                                            textTransform: 'none',
                                            fontWeight: 700,
                                            '&:hover': { borderColor: '#00FF88', background: 'rgba(0, 255, 136, 0.1)' }
                                        }}
                                    >
                                        Concluir cadastro
                                    </Button>
                                    <Button
                                        size="small"
                                        variant="outlined"
                                        startIcon={<DeleteIcon />}
                                        onClick={() => {
                                            setSelectedUser({ id: orfao.id, nome_completo: orfao.email, email: orfao.email, isOrfao: true });
                                            setOpenDeleteConfirm(true);
                                        }}
                                        sx={{
                                            color: '#FF3366',
                                            borderColor: 'rgba(255, 51, 102, 0.35)',
                                            textTransform: 'none',
                                            '&:hover': { borderColor: '#FF3366', background: 'rgba(255, 51, 102, 0.1)' }
                                        }}
                                    >
                                        Remover registro
                                    </Button>
                                </Stack>
                            </Box>
                        ))}
                    </Stack>
                </Box>
            )}

            <GlassCard glowColor="#FFB800" sx={{ p: { xs: 2, md: 3 } }}>
                <TextField
                    fullWidth
                    size="small"
                    placeholder="Buscar operador por nome ou e-mail"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    InputProps={{
                        startAdornment: (
                            <InputAdornment position="start">
                                <SearchIcon sx={{ color: '#00D4FF', fontSize: 20 }} />
                            </InputAdornment>
                        ),
                    }}
                    sx={{ mb: 3 }}
                />
                <DataTable 
                    columns={columns} 
                    data={usuarios.filter(u => u.nome_completo?.toLowerCase().includes(search.toLowerCase()) || u.email?.toLowerCase().includes(search.toLowerCase()))} 
                    loading={loading} 
                    page={page - 1}
                    totalCount={totalCount}
                    onPageChange={(e, newPage) => setPage(newPage + 1)}
                />
            </GlassCard>

            {/* Modal de Criação / Edição de Operador */}
            <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="md" fullWidth>
                <TituloModal
                    titulo={selectedUser ? 'Editar operador' : 'Novo operador'}
                    subtitulo={selectedUser ? (selectedUser.nome_completo || selectedUser.email) : 'O convite de acesso é enviado por e-mail.'}
                    onFechar={() => setOpenDialog(false)}
                />
                <DialogContent sx={{ pt: 3 }}>
                    <Stack spacing={3} sx={{ pt: 1 }}>
                        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                            <TextField
                                label="E-mail"
                                fullWidth
                                placeholder="operador@empresa.com"
                                value={formData.email}
                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                required
                                helperText={selectedUser ? 'Email de login no sistema.' : undefined}
                            />
                            <TextField
                                label="Nome completo"
                                fullWidth
                                placeholder="João Silva"
                                value={formData.nome_completo}
                                onChange={(e) => setFormData({ ...formData, nome_completo: e.target.value })}
                                required
                            />
                        </Box>

                        <TextField
                            label="Telefone"
                            fullWidth
                            placeholder="(11) 98765-4321"
                            value={formData.telefone}
                            onChange={(e) => setFormData({ ...formData, telefone: e.target.value })}
                        />

                        {/* MODO DE ATIVAÇÃO (somente ao criar novo operador) */}
                        {!selectedUser && (
                            <Box sx={{ p: 2.5, borderRadius: 1.5, background: 'rgba(10, 22, 40, 0.7)', border: '1px solid rgba(0, 255, 136, 0.25)' }}>
                                <Typography variant="subtitle2" fontWeight={700} sx={{ color: '#00FF88', mb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <KeyIcon sx={{ fontSize: 18 }} /> Como o operador vai definir a senha?
                                </Typography>
                                <RadioGroup
                                    row
                                    value={formData.modo_ativacao || 'convite'}
                                    onChange={(e) => setFormData({ ...formData, modo_ativacao: e.target.value })}
                                >
                                    <FormControlLabel
                                        value="convite"
                                        control={<Radio sx={{ color: '#00FF88', '&.Mui-checked': { color: '#00FF88' } }} />}
                                        label={
                                            <Box>
                                                <Typography variant="body2" fontWeight={700} color="#FFFFFF">Enviar convite por e-mail / link</Typography>
                                                <Typography variant="caption" color="text.secondary">Envia o link para o próprio operador criar a senha (também permite copiar o link)</Typography>
                                            </Box>
                                        }
                                        sx={{ mr: 4 }}
                                    />
                                    <FormControlLabel
                                        value="senha"
                                        control={<Radio sx={{ color: '#00FF88', '&.Mui-checked': { color: '#00FF88' } }} />}
                                        label={
                                            <Box>
                                                <Typography variant="body2" fontWeight={700} color="#FFFFFF">Definir senha inicial agora</Typography>
                                                <Typography variant="caption" color="text.secondary">Libera o acesso imediato sem precisar aguardar abertura de e-mail</Typography>
                                            </Box>
                                        }
                                    />
                                </RadioGroup>
                                {formData.modo_ativacao === 'senha' && (
                                    <TextField
                                        label="Senha inicial do operador"
                                        type="password"
                                        fullWidth
                                        required
                                        placeholder="Mínimo de 6 caracteres"
                                        value={formData.senha_inicial || ''}
                                        onChange={(e) => setFormData({ ...formData, senha_inicial: e.target.value })}
                                        helperText="O operador já poderá entrar imediatamente usando seu e-mail e esta senha."
                                        sx={{ mt: 2 }}
                                    />
                                )}
                            </Box>
                        )}

                        {/* SELEÇÃO DO TIPO DE VÍNCULO */}
                        <Box sx={{ p: 2.5, borderRadius: 1.5, background: 'rgba(10, 22, 40, 0.7)', border: '1px solid rgba(0, 212, 255, 0.2)' }}>
                            <Typography variant="subtitle2" fontWeight={700} sx={{ color: '#00D4FF', mb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                                <ShieldIcon sx={{ fontSize: 18 }} /> Tipo de vínculo com eventos
                            </Typography>
                            <RadioGroup
                                row
                                value={formData.vinculo_tipo}
                                onChange={(e) => setFormData({ ...formData, vinculo_tipo: e.target.value })}
                            >
                                <FormControlLabel
                                    value="global"
                                    control={<Radio sx={{ color: '#00D4FF', '&.Mui-checked': { color: '#00D4FF' } }} />}
                                    label={
                                        <Box>
                                            <Typography variant="body2" fontWeight={700} color="#FFFFFF">Vínculo global</Typography>
                                            <Typography variant="caption" color="text.secondary">Acesso a todos os eventos cadastrados no sistema</Typography>
                                        </Box>
                                    }
                                    sx={{ mr: 4 }}
                                />
                                <FormControlLabel
                                    value="especifico"
                                    control={<Radio sx={{ color: '#00D4FF', '&.Mui-checked': { color: '#00D4FF' } }} />}
                                    label={
                                        <Box>
                                            <Typography variant="body2" fontWeight={700} color="#FFFFFF">Vínculo específico</Typography>
                                            <Typography variant="caption" color="text.secondary">Selecionar cada evento disponível com permissões customizadas</Typography>
                                        </Box>
                                    }
                                />
                            </RadioGroup>
                        </Box>

                        {/* CASO 1: VÍNCULO GLOBAL - CONFIGURAÇÃO ÚNICA DE PERMISSÕES */}
                        {formData.vinculo_tipo === 'global' && (
                            <Box sx={{ p: 2.5, borderRadius: 1.5, background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                                <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1, color: '#00D4FF' }}>
                                    Permissões globais (aplicadas a todos os eventos)
                                </Typography>
                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                                    Apenas os módulos marcados ficarão visíveis no menu do operador e acessíveis via URL.
                                </Typography>
                                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1 }}>
                                    {MODULOS.map(perm => (
                                        <Box key={perm.key} sx={{ display: 'flex', alignItems: 'center', p: 0.5 }}>
                                            <Switch
                                                size="small"
                                                disabled={perm.key === 'dashboard'}
                                                checked={perm.key === 'dashboard' ? true : (formData.permissions[perm.key] || false)}
                                                onChange={(e) => setFormData({
                                                    ...formData,
                                                    permissions: {
                                                        ...formData.permissions,
                                                        [perm.key]: e.target.checked
                                                    }
                                                })}
                                                color="info"
                                            />
                                            <Typography variant="body2" sx={{ ml: 1, color: perm.key === 'dashboard' ? 'text.secondary' : '#FFFFFF' }}>
                                                {perm.label} {perm.key === 'dashboard' && '(Padrão)'}
                                            </Typography>
                                        </Box>
                                    ))}
                                </Box>
                            </Box>
                        )}

                        {/* CASO 2: VÍNCULO ESPECÍFICO - SELEÇÃO DE EVENTOS E PERMISSÕES POR EVENTO */}
                        {formData.vinculo_tipo === 'especifico' && (
                            <Stack spacing={2.5}>
                                <FormControl fullWidth required>
                                    <InputLabel id="eventos-select-label">Selecione os eventos permitidos para este operador</InputLabel>
                                    <Select
                                        labelId="eventos-select-label"
                                        multiple
                                        value={formData.eventos_permitidos}
                                        onChange={(e) => {
                                            const val = typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value;
                                            const newPerms = { ...formData.eventos_permissoes };
                                            val.forEach(eid => {
                                                if (!newPerms[eid]) {
                                                    newPerms[eid] = { ...formData.permissions, dashboard: true };
                                                }
                                            });
                                            setFormData({
                                                ...formData,
                                                eventos_permitidos: val,
                                                eventos_permissoes: newPerms,
                                                evento_id: val.length > 0 ? val[0] : ''
                                            });
                                        }}
                                        input={<OutlinedInput label="Eventos permitidos para este operador" />}
                                        renderValue={(selected) => (
                                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                                                {selected.map((eid) => (
                                                    <Chip key={eid} label={getEventoNome(eid)} size="small" sx={{ background: 'rgba(0, 212, 255, 0.2)', color: '#00D4FF' }} />
                                                ))}
                                            </Box>
                                        )}
                                    >
                                        {eventos.map((ev) => (
                                            <MenuItem key={ev.id} value={ev.id}>
                                                <Checkbox checked={formData.eventos_permitidos.indexOf(ev.id) > -1} />
                                                <ListItemText primary={ev.nome} secondary={ev.status} />
                                            </MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>

                                {formData.eventos_permitidos.length === 0 && (
                                    <Box sx={{ p: 2, borderRadius: 1.5, background: 'rgba(255, 184, 0, 0.05)', border: '1px dashed rgba(255, 184, 0, 0.3)', textAlign: 'center' }}>
                                        <Typography variant="body2" color="#FFB800">
                                            Nenhum evento selecionado. Selecione pelo menos um evento acima para configurar suas permissões.
                                        </Typography>
                                    </Box>
                                )}

                                {/* ACORDEÃO DE CONFIGURAÇÃO DE PERMISSÕES POR CADA EVENTO SELECIONADO */}
                                {formData.eventos_permitidos.map((eventoId, idx) => {
                                    const eventName = getEventoNome(eventoId);
                                    const eventPerms = formData.eventos_permissoes[eventoId] || formData.permissions || DEFAULT_PERMISSIONS;

                                    return (
                                        <Accordion
                                            key={eventoId}
                                            expanded={expandedAccordion === eventoId || (expandedAccordion === false && idx === 0)}
                                            onChange={(_, isExp) => setExpandedAccordion(isExp ? eventoId : false)}
                                            sx={{
                                                background: 'rgba(10, 22, 40, 0.8)',
                                                border: '1px solid rgba(0, 212, 255, 0.2)',
                                                borderRadius: '8px !important',
                                                mb: 1
                                            }}
                                        >
                                            <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: '#00D4FF' }} />}>
                                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', pr: 2 }}>
                                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                                                        <EventIcon sx={{ color: '#00D4FF', fontSize: 20 }} />
                                                        <Typography variant="subtitle2" fontWeight={700} color="#FFFFFF">
                                                            {eventName}
                                                        </Typography>
                                                    </Box>
                                                    <Chip
                                                        size="small"
                                                        label={`${MODULOS.filter(m => eventPerms[m.key]).length} Módulos`}
                                                        sx={{ background: 'rgba(0, 212, 255, 0.15)', color: '#00D4FF', height: 22, fontSize: '0.75rem' }}
                                                    />
                                                </Box>
                                            </AccordionSummary>
                                            <AccordionDetails sx={{ pt: 1, borderTop: '1px solid rgba(255, 255, 255, 0.05)' }}>
                                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1 }}>
                                                    <Typography variant="caption" color="text.secondary">
                                                        Permissões liberadas exclusivamente para este evento:
                                                    </Typography>
                                                    {formData.eventos_permitidos.length > 1 && (
                                                        <Button
                                                            size="small"
                                                            startIcon={<CopyIcon sx={{ fontSize: '14px !important' }} />}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                copyPermissionsToAllEvents(eventoId);
                                                            }}
                                                            sx={{ fontSize: '0.75rem', color: '#00D4FF', textTransform: 'none' }}
                                                        >
                                                            Copiar para todos os outros eventos
                                                        </Button>
                                                    )}
                                                </Box>
                                                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1 }}>
                                                    {MODULOS.map(perm => (
                                                        <Box key={perm.key} sx={{ display: 'flex', alignItems: 'center', p: 0.5 }}>
                                                            <Switch
                                                                size="small"
                                                                disabled={perm.key === 'dashboard'}
                                                                checked={perm.key === 'dashboard' ? true : (eventPerms[perm.key] || false)}
                                                                onChange={(e) => updateEventPermission(eventoId, perm.key, e.target.checked)}
                                                                color="info"
                                                            />
                                                            <Typography variant="body2" sx={{ ml: 1, color: perm.key === 'dashboard' ? 'text.secondary' : '#FFFFFF' }}>
                                                                {perm.label} {perm.key === 'dashboard' && '(Padrão)'}
                                                            </Typography>
                                                        </Box>
                                                    ))}
                                                </Box>
                                            </AccordionDetails>
                                        </Accordion>
                                    );
                                })}
                            </Stack>
                        )}
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ p: 3, borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
                    <Button variant="outlined" onClick={() => setOpenDialog(false)} sx={botaoSecundario}>Cancelar</Button>
                    <NeonButton onClick={handleSave}>{selectedUser ? 'Salvar alterações' : 'Criar operador'}</NeonButton>
                </DialogActions>
            </Dialog>

            {/* Modal de Reset de Senha */}
            <Dialog open={openPasswordDialog} onClose={() => !resetingPassword && setOpenPasswordDialog(false)} maxWidth="xs" fullWidth>
                <DialogTitle sx={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700 }}>Forçar nova senha</DialogTitle>
                <DialogContent>
                    <Typography variant="caption" sx={{ mb: 2, display: 'block', color: 'text.secondary' }}>Alterando a senha de: <b>{selectedUser?.nome_completo}</b></Typography>
                    <TextField label="Nova senha" type="password" fullWidth value={newPassword} onChange={(e) => setNewPassword(e.target.value)} sx={{ mt: 1 }} />
                </DialogContent>
                <DialogActions sx={{ p: 3 }}>
                    <Button variant="outlined" onClick={() => setOpenPasswordDialog(false)} disabled={resetingPassword} sx={botaoSecundario}>Cancelar</Button>
                    <NeonButton onClick={() => handleResetPassword(selectedUser.id, newPassword)} loading={resetingPassword}>Confirmar reset</NeonButton>
                </DialogActions>
            </Dialog>

            {/* Modal de Exclusão de Operador */}
            <Dialog open={openDeleteConfirm} onClose={() => setOpenDeleteConfirm(false)} maxWidth="xs" fullWidth>
                <DialogTitle sx={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, color: '#FF3366' }}>
                    {selectedUser?.isOrfao ? 'Remover conta órfã' : 'Deletar operador'}
                </DialogTitle>
                <DialogContent>
                    <Typography variant="body2" sx={{ mt: 2, mb: 2, color: 'text.primary' }}>
                        {selectedUser?.isOrfao
                            ? <>Tem certeza que deseja remover o registro órfão <b>{selectedUser?.email || selectedUser?.nome_completo}</b> do servidor de autenticação?</>
                            : <>Tem certeza que deseja deletar o operador <b>{selectedUser?.nome_completo}</b>?</>}
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                        Esta ação não pode ser desfeita. O registro será removido tanto do painel quanto do servidor de autenticação.
                    </Typography>
                </DialogContent>
                <DialogActions sx={{ p: 3 }}>
                    <Button variant="outlined" onClick={() => setOpenDeleteConfirm(false)} sx={botaoSecundario}>Cancelar</Button>
                    <Button
                        onClick={() => {
                            handleDeleteUser(selectedUser.id);
                            setOpenDeleteConfirm(false);
                        }}
                        sx={{ color: '#FF3366', fontWeight: 'bold', '&:hover': { background: 'rgba(255, 51, 102, 0.1)' } }}
                    >
                        Confirmar exclusão
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Modal com Link de Ativação para Cópia Rápida (WhatsApp / Direto) */}
            <Dialog open={Boolean(inviteLinkInfo)} onClose={() => setInviteLinkInfo(null)} maxWidth="sm" fullWidth>
                <TituloModal
                    titulo="Link de ativação do operador"
                    subtitulo={inviteLinkInfo?.email}
                    onFechar={() => setInviteLinkInfo(null)}
                />
                <DialogContent sx={{ pt: 2.5 }}>
                    <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>
                        {inviteLinkInfo?.emailEnviado
                            ? 'O e-mail de convite foi enviado! Caso o operador demore para receber ou você queira enviar diretamente pelo WhatsApp, copie o link exclusivo abaixo:'
                            : 'O operador foi criado! Copie o link exclusivo de ativação abaixo e envie ao operador para que ele defina sua senha:'}
                    </Typography>
                    <TextField
                        fullWidth
                        size="small"
                        value={inviteLinkInfo?.link || ''}
                        InputProps={{
                            readOnly: true,
                            endAdornment: (
                                <InputAdornment position="end">
                                    <Button
                                        size="small"
                                        startIcon={<CopyIcon />}
                                        onClick={() => handleCopyLink(inviteLinkInfo?.link)}
                                        sx={{ color: '#00D4FF', fontWeight: 700, textTransform: 'none' }}
                                    >
                                        Copiar link
                                    </Button>
                                </InputAdornment>
                            )
                        }}
                    />
                </DialogContent>
                <DialogActions sx={{ p: 2.5 }}>
                    <Button variant="outlined" onClick={() => setInviteLinkInfo(null)} sx={botaoSecundario}>Fechar</Button>
                    <NeonButton startIcon={<CopyIcon />} onClick={() => handleCopyLink(inviteLinkInfo?.link)}>
                        Copiar link de acesso
                    </NeonButton>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default Usuarios;
