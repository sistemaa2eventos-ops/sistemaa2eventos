import React from 'react';
import {
    Box, Grid, Stack, TextField, Button, 
    Dialog, DialogTitle, DialogContent, DialogActions, 
    MenuItem, FormControlLabel, Switch, Typography, 
    Divider, CircularProgress
} from '@mui/material';
import {
    Wifi as WifiIcon,
    WifiOff as WifiOffIcon,
    Settings as SettingsIcon,
    Add as AddIcon
} from '@mui/icons-material';
import GlassCard from '../../components/common/GlassCard';
import PageHeader from '../../components/common/PageHeader';
import NeonButton from '../../components/common/NeonButton';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import { useLeitorFacial } from '../../hooks/useLeitorFacial';
import DeviceListPanel from '../../components/config/DeviceListPanel';
import GlobalSettingsPanel from '../../components/config/GlobalSettingsPanel';

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
        fetchReaders,
        handleOpenDialog,
        handleSave,
        handleDelete,
        handleSync,
        handleTestDevice,
        handleSaveGlobal,
        handleRemoteAction,
        applyEventPreset,
        presets,
        areas
    } = useLeitorFacial();

    return (
        <Box sx={{ p: { xs: 2, md: 4 } }}>
            <PageHeader
                title="Terminais & Dispositivos"
                subtitle="Gerencie leitores faciais, configure biometria e sincronize faces nos terminais de acesso."
                breadcrumbs={[{ text: 'Configurações' }, { text: 'Terminais & Dispositivos' }]}
            />

            {!eventoId && (
                <GlassCard sx={{ p: 3, mb: 3, border: '1px solid rgba(255, 193, 7, 0.4)', background: 'rgba(255, 193, 7, 0.05)' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <WifiOffIcon sx={{ color: '#FFC107', fontSize: 28 }} />
                        <Box>
                            <Typography variant="subtitle1" sx={{ fontWeight: 800, color: '#FFC107' }}>
                                NENHUM EVENTO SELECIONADO
                            </Typography>
                            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                Selecione um evento ativo no dashboard principal para gerenciar os leitores vinculados.
                            </Typography>
                        </Box>
                    </Box>
                </GlassCard>
            )}

            {authError && (
                <GlassCard sx={{ p: 3, mb: 3, border: '1px solid rgba(255, 51, 102, 0.4)', background: 'rgba(255, 51, 102, 0.05)' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <WifiOffIcon sx={{ color: '#FF3366', fontSize: 28 }} />
                        <Box>
                            <Typography variant="subtitle1" sx={{ fontWeight: 800, color: '#FF3366' }}>
                                ERRO DE AUTENTICAÇÃO
                            </Typography>
                            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                Falha ao comunicar com o servidor de dispositivos. Verifique as chaves de API.
                            </Typography>
                        </Box>
                    </Box>
                </GlassCard>
            )}

            <Grid container spacing={3}>
                <Grid item xs={12} lg={8}>
                    <DeviceListPanel
                        readers={readers}
                        loading={loading}
                        fetchReaders={fetchReaders}
                        handleOpenDialog={handleOpenDialog}
                        handleTestDevice={handleTestDevice}
                        handleRemoteAction={handleRemoteAction}
                        testingId={testingId}
                        handleSync={handleSync}
                        syncingId={syncingId}
                        setDeviceToDelete={setDeviceToDelete}
                        setOpenDeleteConfirm={setOpenDeleteConfirm}
                        hideHeader // Pedindo pro DeviceListPanel não renderizar header redundante se ele permitir
                    />
                </Grid>

                <Grid item xs={12} lg={4}>
                    <GlobalSettingsPanel
                        sensitivity={sensitivity}
                        setSensitivity={setSensitivity}
                        liveness={liveness}
                        setLiveness={setLiveness}
                        handleSaveGlobal={handleSaveGlobal}
                        loading={loading}
                    />

                    <GlassCard sx={{ p: 3, mt: 3 }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 800, color: 'primary.main', mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                            <SettingsIcon fontSize="small" /> PRESETS OPERACIONAIS
                        </Typography>
                        <Stack spacing={2}>
                            {Object.keys(presets).map(key => (
                                <Box 
                                    key={key}
                                    sx={{ 
                                        p: 1.5, 
                                        cursor: 'pointer',
                                        borderRadius: 2, 
                                        border: '1px solid rgba(255,255,255,0.05)',
                                        '&:hover': { bgcolor: 'rgba(0, 212, 255, 0.05)', borderColor: 'primary.main' }
                                    }}
                                    onClick={() => applyEventPreset(key)}
                                >
                                    <Typography variant="body2" sx={{ fontWeight: 700, color: '#fff' }}>{presets[key].nome}</Typography>
                                    <Typography variant="caption" color="text.secondary">{presets[key].descricao}</Typography>
                                </Box>
                            ))}
                        </Stack>
                    </GlassCard>
                </Grid>
            </Grid>

            {/* Dialog de Cadastro */}
            <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="sm" fullWidth>
                <form onSubmit={handleSave}>
                    <DialogTitle sx={{ fontWeight: 700 }}>
                        {formData.id ? 'EDITAR TERMINAL' : 'NOVO TERMINAL FACIAL'}
                    </DialogTitle>
                    <DialogContent>
                        <Grid container spacing={2} sx={{ mt: 1 }}>
                            <Grid item xs={12} md={8}>
                                <TextField fullWidth label="Nome do Dispositivo" value={formData.nome || ''} required onChange={(e) => setFormData({ ...formData, nome: e.target.value })} />
                            </Grid>
                            <Grid item xs={12} md={4}>
                                <TextField select fullWidth label="Marca" value={formData.marca || 'intelbras'} required onChange={(e) => setFormData({ ...formData, marca: e.target.value })}>
                                    <MenuItem value="intelbras">Intelbras</MenuItem>
                                    <MenuItem value="hikvision">Hikvision</MenuItem>
                                </TextField>
                            </Grid>
                            <Grid item xs={12} md={8}>
                                <TextField fullWidth label="IP" value={formData.ip_address || ''} required onChange={(e) => setFormData({ ...formData, ip_address: e.target.value })} />
                            </Grid>
                            <Grid item xs={12} md={4}>
                                <TextField fullWidth label="Porta" type="number" value={formData.porta || 80} required onChange={(e) => setFormData({ ...formData, porta: e.target.value })} />
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <TextField fullWidth label="Usuário" value={formData.user || ''} required onChange={(e) => setFormData({ ...formData, user: e.target.value })} />
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <TextField fullWidth label="Senha" type="password" value={formData.password || ''} required onChange={(e) => setFormData({ ...formData, password: e.target.value })} />
                            </Grid>
                            <Grid item xs={12}>
                                <TextField select fullWidth label="Área" value={formData.config?.area_id || ''} onChange={(e) => setFormData({ ...formData, config: { ...formData.config, area_id: e.target.value }})}>
                                    <MenuItem value="">Nenhuma (Global)</MenuItem>
                                    {areas.map(a => <MenuItem key={a.id} value={a.id}>{a.nome}</MenuItem>)}
                                </TextField>
                            </Grid>
                        </Grid>
                    </DialogContent>
                    <DialogActions sx={{ p: 3 }}>
                        <Button onClick={() => setOpenDialog(false)}>Cancelar</Button>
                        <Button variant="contained" type="submit">Salvar Terminal</Button>
                    </DialogActions>
                </form>
            </Dialog>

            <ConfirmDialog
                open={openDeleteConfirm}
                title="Remover Terminal"
                message={`Deseja realmente remover o dispositivo "${deviceToDelete?.nome}"?`}
                onConfirm={handleDelete}
                onCancel={() => setOpenDeleteConfirm(false)}
            />
        </Box>
    );
};

export default ConfigLeitorFacial;
