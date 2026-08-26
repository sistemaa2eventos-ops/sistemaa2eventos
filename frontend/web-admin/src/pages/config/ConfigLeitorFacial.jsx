import React from 'react';
import {
    Box,
    Typography,
    Grid,
    TextField,
    Slider,
    Button,
    Chip,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Stack,
    IconButton,
    MenuItem,
    Tooltip,
    CircularProgress,
    FormControlLabel,
    Switch
} from '@mui/material';
import {
    Save as SaveIcon,
    FaceRetouchingNatural as FaceIcon,
    Add as AddIcon,
    Sync as SyncIcon,
    Delete as DeleteIcon,
    Settings as SettingsIcon,
    Refresh as RefreshIcon,
    Wifi as WifiIcon,
    WifiOff as WifiOffIcon,
    PowerSettingsNew as PowerIcon,
    VpnKey as VpnKeyIcon
} from '@mui/icons-material';
import { useLeitorFacial } from '../../hooks/useLeitorFacial';
import GlassCard from '../../components/common/GlassCard';
import NeonButton from '../../components/common/NeonButton';
import DataTable from '../../components/common/DataTable';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import PageHeader from '../../components/common/PageHeader';

// ============================================
// SUB-COMPONENTE: Parâmetros Biométricos Globais
// ============================================
const ParametrosBiometricos = ({ sensitivity, setSensitivity, liveness, setLiveness, handleSaveGlobal, loading }) => (
    <GlassCard sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ fontWeight: 700, color: '#fff', mb: 3 }}>
            PARÂMETROS BIOMÉTRICOS
        </Typography>

        <Box sx={{ mb: 4 }}>
            <Typography gutterBottom sx={{ color: 'text.secondary' }}>Limiar de Reconhecimento ({sensitivity}%)</Typography>
            <Slider
                value={sensitivity}
                onChange={(e, val) => setSensitivity(val)}
                valueLabelDisplay="auto"
                sx={{ color: '#00D4FF' }}
            />
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Confiança mínima para abertura da catraca.
            </Typography>
        </Box>

        <Box sx={{ mb: 4 }}>
            <Typography gutterBottom sx={{ color: 'text.secondary' }}>Anti-Fake (Liveness)</Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Chip
                    label="ATIVADO"
                    onClick={() => setLiveness(true)}
                    color={liveness ? "primary" : "default"}
                    variant={liveness ? "filled" : "outlined"}
                />
                <Chip
                    label="DESATIVADO"
                    onClick={() => setLiveness(false)}
                    color={!liveness ? "error" : "default"}
                    variant={!liveness ? "filled" : "outlined"}
                />
            </Box>
        </Box>

        <NeonButton startIcon={<SaveIcon />} fullWidth onClick={handleSaveGlobal} disabled={loading}>
            {loading ? 'SALVANDO...' : 'SALVAR CONFIGURAÇÕES GLOBAIS'}
        </NeonButton>
    </GlassCard>
);

// ============================================
// SUB-COMPONENTE: Formulário do Terminal Facial (Dialog)
// ============================================
const LeitorFacialForm = ({ open, onClose, formData, setFormData, onSave }) => (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
        <form onSubmit={onSave}>
            <DialogTitle>
                <Typography variant="h6" component="span" sx={{ fontWeight: 800 }}>
                    {formData.id ? 'EDITAR TERMINAL' : 'NOVO TERMINAL FACIAL'}
                </Typography>
            </DialogTitle>
            <DialogContent>
                <Grid container spacing={2} sx={{ mt: 1 }}>
                    <Grid item xs={12} md={8}>
                        <TextField
                            fullWidth label="Nome do Dispositivo"
                            value={formData.nome}
                            required
                            onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                        />
                    </Grid>
                    <Grid item xs={12} md={4}>
                        <TextField
                            select fullWidth label="Marca"
                            value={formData.marca}
                            required
                            onChange={(e) => setFormData({ ...formData, marca: e.target.value })}
                        >
                            <MenuItem value="intelbras">Intelbras (Bio-T/Face)</MenuItem>
                            <MenuItem value="hikvision">Hikvision (MinMoe)</MenuItem>
                        </TextField>
                    </Grid>
                    <Grid item xs={12}>
                        <Box sx={{ p: 2, bgcolor: 'rgba(0, 212, 255, 0.05)', borderRadius: 1, border: '1px dashed rgba(0, 212, 255, 0.2)' }}>
                            <Typography variant="caption" sx={{ color: '#00D4FF', display: 'flex', alignItems: 'center', gap: 1 }}>
                                <WifiIcon sx={{ fontSize: 14 }} />
                                Dica Bio-T (SS 5541 MF W): Use IP Fixo no leitor para evitar perda de comunicação.
                            </Typography>
                        </Box>
                    </Grid>
                    <Grid item xs={12} md={8}>
                        <TextField
                            fullWidth label="Endereço IP"
                            placeholder="192.168.1.100"
                            value={formData.ip_address}
                            required
                            onChange={(e) => setFormData({ ...formData, ip_address: e.target.value })}
                        />
                    </Grid>
                    <Grid item xs={12} md={4}>
                        <TextField
                            fullWidth label="Porta API"
                            type="number"
                            value={formData.porta}
                            required
                            onChange={(e) => setFormData({ ...formData, porta: e.target.value })}
                        />
                    </Grid>
                    <Grid item xs={12}>
                        <GlassCard sx={{ p: 2, background: 'rgba(255,193,7,0.05)', borderColor: 'rgba(255,193,7,0.2)' }}>
                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={!!formData.config?.modo_identificacao}
                                        onChange={(e) => setFormData({
                                            ...formData,
                                            config: { ...formData.config, modo_identificacao: e.target.checked }
                                        })}
                                        color="warning"
                                    />
                                }
                                label={
                                    <Box>
                                        <Typography variant="subtitle2" sx={{ color: '#FFC107', fontWeight: 800 }}>Modo Identidade (Recepção)</Typography>
                                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                                            Neste modo, o terminal NÃO realiza validação ou acesso. Ele apenas captura a digital/face e envia o perfil para a tela do Terminal Web do operador vinculado validar e emitir pulseira.
                                        </Typography>
                                    </Box>
                                }
                            />
                        </GlassCard>
                    </Grid>
                    <Grid item xs={12} md={6}>
                        <TextField
                            fullWidth label="Usuário Dispositivo"
                            value={formData.user}
                            required
                            onChange={(e) => setFormData({ ...formData, user: e.target.value })}
                        />
                    </Grid>
                    <Grid item xs={12} md={6}>
                        <TextField
                            fullWidth label="Senha Dispositivo"
                            type="password"
                            value={formData.password}
                            required
                            autoComplete="current-password"
                            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        />
                    </Grid>
                </Grid>
            </DialogContent>
            <DialogActions sx={{ p: 3 }}>
                <Button onClick={onClose} sx={{ color: 'text.secondary' }}>CANCELAR</Button>
                <NeonButton type="submit">SALVAR TERMINAL</NeonButton>
            </DialogActions>
        </form>
    </Dialog>
);

// ============================================
// COMPONENTE PRINCIPAL
// ============================================
const ConfigLeitorFacial = () => {
    const {
        eventoId,
        readers,
        loading,
        syncingId,
        testingId,
        openDialog,
        setOpenDialog,
        openDeleteConfirm,
        setOpenDeleteConfirm,
        deviceToDelete,
        setDeviceToDelete,
        sensitivity,
        setSensitivity,
        liveness,
        setLiveness,
        authError,
        formData,
        setFormData,
        handleOpenDialog,
        handleSave,
        handleDelete,
        handleSync,
        handleTestDevice,
        handleSaveGlobal,
        fetchReaders
    } = useLeitorFacial();

    const columns = [
        {
            id: 'nome',
            label: 'DISPOSITIVO',
            minWidth: 150,
            format: (val, row) => (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <FaceIcon sx={{ color: '#00D4FF', fontSize: 20 }} />
                    <Box>
                        <Stack direction="row" alignItems="center" spacing={1}>
                            <Typography variant="body2" sx={{ fontWeight: 700 }}>{val}</Typography>
                            {row.config?.modo_identificacao && (
                                <Tooltip title="Modo Identificação (Não libera catraca, apenas identifica)">
                                    <VpnKeyIcon sx={{ fontSize: 14, color: '#FFC107' }} />
                                </Tooltip>
                            )}
                        </Stack>
                        <Typography variant="caption" sx={{ color: 'text.secondary', textTransform: 'uppercase' }}>
                            {row.marca}
                        </Typography>
                    </Box>
                </Box>
            )
        },
        { id: 'ip_address', label: 'ENDEREÇO IP', minWidth: 120 },
        {
            id: 'status',
            label: 'STATUS',
            minWidth: 100,
            format: (val) => (
                <Chip
                    icon={val === 'online' ? <WifiIcon /> : <WifiOffIcon />}
                    label={val === 'online' ? 'ONLINE' : 'OFFLINE'}
                    color={val === 'online' ? 'success' : 'error'}
                    size="small"
                    variant="outlined"
                    sx={{ fontWeight: 700 }}
                />
            )
        },
        {
            id: 'acoes',
            label: 'AÇÕES',
            minWidth: 180,
            align: 'center',
            format: (_, row) => (
                <Stack direction="row" spacing={1} justifyContent="center">
                    <Tooltip title="Testar Conexão">
                        <IconButton
                            size="small"
                            onClick={() => handleTestDevice(row)}
                            disabled={testingId === row.id}
                            sx={{ color: '#00FF88', background: 'rgba(0,255,136,0.05)' }}
                        >
                            {testingId === row.id ? <CircularProgress size={20} color="inherit" /> : <PowerIcon fontSize="small" />}
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="Sincronizar Faces">
                        <IconButton
                            size="small"
                            onClick={() => handleSync(row.id)}
                            disabled={syncingId === row.id}
                            sx={{ color: '#00D4FF', background: 'rgba(0,212,255,0.05)' }}
                        >
                            {syncingId === row.id ? <CircularProgress size={20} color="inherit" /> : <SyncIcon fontSize="small" />}
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="Editar">
                        <IconButton
                            size="small"
                            onClick={() => handleOpenDialog(row)}
                            sx={{ color: '#fff', background: 'rgba(255,255,255,0.05)' }}
                        >
                            <SettingsIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="Remover">
                        <IconButton
                            size="small"
                            onClick={() => { setDeviceToDelete(row); setOpenDeleteConfirm(true); }}
                            sx={{ color: '#FF3366', background: 'rgba(255,51,102,0.05)' }}
                        >
                            <DeleteIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                </Stack>
            )
        },
    ];

    return (
        <Box sx={{ p: { xs: 2, md: 4 } }}>
            <PageHeader
                title="Leitores Faciais"
                subtitle="Provisione endpoints de detecção biométrica standalone."
                breadcrumbs={[{ text: 'Sistema' }, { text: 'Configurações' }, { text: 'Biometria' }]}
            />
            {/* Alerta: Nenhum evento selecionado */}
            {!eventoId && (
                <GlassCard sx={{ p: 3, mb: 3, border: '1px solid rgba(255, 193, 7, 0.4)', background: 'rgba(255, 193, 7, 0.05)' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <WifiOffIcon sx={{ color: '#FFC107', fontSize: 28 }} />
                        <Box>
                            <Typography variant="subtitle1" sx={{ fontWeight: 800, color: '#FFC107' }}>
                                NENHUM EVENTO SELECIONADO
                            </Typography>
                            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                Selecione um evento ativo na tela de Eventos e depois volte aqui.
                             </Typography>
                        </Box>
                    </Box>
                </GlassCard>
            )}

            {/* Alerta: Sessão expirada */}
            {authError && (
                <GlassCard sx={{ p: 3, mb: 3, border: '1px solid rgba(255, 51, 102, 0.4)', background: 'rgba(255, 51, 102, 0.05)' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <WifiOffIcon sx={{ color: '#FF3366', fontSize: 28 }} />
                        <Box>
                            <Typography variant="subtitle1" sx={{ fontWeight: 800, color: '#FF3366' }}>
                                SESSÃO EXPIRADA
                            </Typography>
                            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                Sua sessão expirou. Faça logout e login novamente para continuar.
                            </Typography>
                        </Box>
                    </Box>
                </GlassCard>
            )}

            <Grid container spacing={4}>
                <Grid item xs={12} lg={8}>
                    <GlassCard sx={{ p: 3, mb: 4 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                <RefreshIcon
                                    sx={{ color: '#00D4FF', cursor: 'pointer' }}
                                    onClick={fetchReaders}
                                    className={loading ? 'ani-spin' : ''}
                                />
                                <Typography variant="h6" sx={{ fontWeight: 700, color: '#fff' }}>
                                    TERMINAIS FACIAIS
                                </Typography>
                            </Box>
                            <NeonButton startIcon={<AddIcon />} size="small" onClick={() => handleOpenDialog()}>
                                NOVO TERMINAL
                            </NeonButton>
                        </Box>
                        <DataTable
                            columns={columns}
                            data={readers}
                            loading={loading}
                        />
                    </GlassCard>
                </Grid>

                <Grid item xs={12} lg={4}>
                    <ParametrosBiometricos
                        sensitivity={sensitivity}
                        setSensitivity={setSensitivity}
                        liveness={liveness}
                        setLiveness={setLiveness}
                        handleSaveGlobal={handleSaveGlobal}
                        loading={loading}
                    />
                </Grid>
            </Grid>

            {/* Dialog de Cadastro / Edição */}
            <LeitorFacialForm
                open={openDialog}
                onClose={() => setOpenDialog(false)}
                formData={formData}
                setFormData={setFormData}
                onSave={handleSave}
            />

            <ConfirmDialog
                open={openDeleteConfirm}
                title="Remover Terminal"
                message={`Deseja realmente remover o dispositivo "${deviceToDelete?.nome}"? Isso não afetará os dados no leitor físico.`}
                onConfirm={handleDelete}
                onCancel={() => setOpenDeleteConfirm(false)}
            />
        </Box >
    );
};

export default ConfigLeitorFacial;
