import React from 'react';
import {
    Box,
    Grid,
    TextField,
    Typography,
    MenuItem,
    Divider,
    Button,
    InputAdornment,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    IconButton,
    Tooltip
} from '@mui/material';
import {
    Print as PrintIcon,
    Lan as LanIcon,
    SettingsRemote as RemoteIcon,
    Delete as DeleteIcon,
    Edit as EditIcon,
    QrCode as QrCodeIcon,
    Add as AddIcon
} from '@mui/icons-material';
import GlassCard from '../common/GlassCard';
import NeonButton from '../common/NeonButton';
import { usePrinterSettings } from '../../hooks/usePrinterSettings';

const PrinterManager = () => {
    const {
        printers,
        loading,
        formData,
        setFormData,
        openDialog,
        setOpenDialog,
        handleSave,
        handleDelete,
        handleOpenDialog
    } = usePrinterSettings();

    return (
        <Box sx={{ mt: 4 }}>
            <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <PrintIcon color="primary" />
                    <Typography variant="h6" sx={{ fontWeight: 800 }}>GERENCIADOR DE IMPRESSÃO</Typography>
                </Box>
                <NeonButton 
                    size="small" 
                    startIcon={<AddIcon />}
                    onClick={() => handleOpenDialog()}
                >
                    NOVA IMPRESSORA
                </NeonButton>
            </Box>

            <Grid container spacing={3}>
                {printers.length === 0 && !loading && (
                    <Grid item xs={12}>
                        <Box sx={{ p: 4, textAlign: 'center', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: 2 }}>
                            <Typography variant="body2" sx={{ color: 'text.secondary' }}>Nenhuma impressora configurada para este evento.</Typography>
                        </Box>
                    </Grid>
                )}

                {printers.map(printer => (
                    <Grid item xs={12} md={6} key={printer.id}>
                        <GlassCard sx={{ p: 3, border: '1px solid rgba(0, 212, 255, 0.1)', position: 'relative' }}>
                            <Box sx={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 1 }}>
                                <IconButton size="small" onClick={() => handleOpenDialog(printer)} sx={{ color: 'primary.main' }}>
                                    <EditIcon sx={{ fontSize: 18 }} />
                                </IconButton>
                                <IconButton size="small" onClick={() => handleDelete(printer.id)} sx={{ color: '#FF3366' }}>
                                    <DeleteIcon sx={{ fontSize: 18 }} />
                                </IconButton>
                            </Box>
                            
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                                <Box sx={{ p: 1, bgcolor: 'rgba(0, 212, 255, 0.1)', borderRadius: 1 }}>
                                    <PrintIcon color="primary" />
                                </Box>
                                <Box>
                                    <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>{printer.nome}</Typography>
                                    <Typography variant="caption" sx={{ color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                        <LanIcon sx={{ fontSize: 12 }} /> {printer.ip_address}:{printer.porta || 9100} • {printer.config?.protocolo || 'ESC_POS'}
                                    </Typography>
                                </Box>
                            </Box>

                            <Divider sx={{ mb: 2, opacity: 0.1 }} />

                            <Grid container spacing={1}>
                                <Grid item xs={6}>
                                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>Tipo:</Typography>
                                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{printer.tipo === 'etiqueta' ? '🏷️ Etiqueta' : '💳 Cartão'}</Typography>
                                </Grid>
                                <Grid item xs={6}>
                                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>Marca:</Typography>
                                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{printer.marca.toUpperCase()}</Typography>
                                </Grid>
                            </Grid>

                            <Box sx={{ mt: 2 }}>
                                <Button size="small" variant="outlined" fullWidth sx={{ color: '#00D4FF', borderColor: 'rgba(0, 212, 255, 0.3)' }}>
                                    TESTAR IMPRESSÃO
                                </Button>
                            </Box>
                        </GlassCard>
                    </Grid>
                ))}
            </Grid>

            {/* Dialog de Cadastro */}
            <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="sm" fullWidth>
                <form onSubmit={handleSave}>
                    <DialogTitle sx={{ fontWeight: 800 }}>
                        {formData.id ? 'EDITAR IMPRESSORA' : 'NOVA IMPRESSORA'}
                    </DialogTitle>
                    <DialogContent>
                        <Grid container spacing={2} sx={{ mt: 1 }}>
                            <Grid item xs={12} md={8}>
                                <TextField
                                    fullWidth label="Nome da Impressora"
                                    value={formData.nome}
                                    required
                                    onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                                />
                            </Grid>
                            <Grid item xs={12} md={4}>
                                <TextField
                                    select fullWidth label="Tipo"
                                    value={formData.tipo}
                                    required
                                    onChange={(e) => setFormData({ ...formData, tipo: e.target.value })}
                                >
                                    <MenuItem value="etiqueta">Etiqueta (Papel)</MenuItem>
                                    <MenuItem value="cartao">Cartão (PVC)</MenuItem>
                                </TextField>
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <TextField
                                    fullWidth label="Endereço IP"
                                    value={formData.ip_address}
                                    required
                                    placeholder="192.168.1.XX"
                                    onChange={(e) => setFormData({ ...formData, ip_address: e.target.value })}
                                />
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <TextField
                                    fullWidth label="Porta RAW/LPR"
                                    type="number"
                                    value={formData.porta}
                                    required
                                    onChange={(e) => setFormData({ ...formData, porta: e.target.value })}
                                />
                            </Grid>
                            <Divider sx={{ width: '100%', my: 1 }} />
                            <Grid item xs={12} md={6}>
                                <TextField
                                    select fullWidth label="Protocolo"
                                    value={formData.config?.protocolo || 'ESC_POS'}
                                    onChange={(e) => setFormData({
                                        ...formData,
                                        config: { ...formData.config, protocolo: e.target.value }
                                    })}
                                >
                                    <MenuItem value="ZPL">ZPL (Zebra Series)</MenuItem>
                                    <MenuItem value="ESC_POS">ESC/POS (Genérica Térmica)</MenuItem>
                                    <MenuItem value="TSPL">TSPL (Argox/TSC/Brother)</MenuItem>
                                </TextField>
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <TextField
                                    select fullWidth label="Resolução (DPI)"
                                    value={formData.config?.dpi || 203}
                                    onChange={(e) => setFormData({
                                        ...formData,
                                        config: { ...formData.config, dpi: e.target.value }
                                    })}
                                >
                                    <MenuItem value={203}>203 DPI (Standard)</MenuItem>
                                    <MenuItem value={300}>300 DPI (High Res)</MenuItem>
                                </TextField>
                            </Grid>
                        </Grid>
                    </DialogContent>
                    <DialogActions sx={{ p: 3 }}>
                        <Button onClick={() => setOpenDialog(false)}>CANCELAR</Button>
                        <NeonButton type="submit">SALVAR IMPRESSORA</NeonButton>
                    </DialogActions>
                </form>
            </Dialog>
        </Box>
    );
};

export default PrinterManager;
