import React, { useState, useEffect } from 'react';
import {
    Box, Typography, TextField, Switch, 
    Divider, Grid, CircularProgress, Button,
    Alert, Select, MenuItem, FormControl, InputLabel
} from '@mui/material';
import { 
    PersonAdd as CredIcon,
    AccessTime as TimeIcon,
    Gavel as LgpdIcon,
    AutoFixHigh as AutoIcon
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import { useSystemSettings } from '../../hooks/useSystemSettings';
import GlassCard from '../../components/common/GlassCard';

const ConfigCredenciamento = () => {
    const { settings, setSettings, loading, saving, handleSave } = useSystemSettings();

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>;

    return (
        <Box>
            <Typography variant="h6" sx={{ color: 'primary.main', mb: 3, fontWeight: 700 }}>
                📝 Regras de Credenciamento & Cadastro
            </Typography>

            <Grid container spacing={3}>
                {/* SEÇÃO: Convites e Validade */}
                <Grid item xs={12} md={6}>
                    <GlassCard sx={{ p: 3, height: '100%' }}>
                        <Typography variant="subtitle1" sx={{ color: '#fff', fontWeight: 700, mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
                            <TimeIcon fontSize="small" color="primary" /> Políticas de Convite
                        </Typography>
                        
                        <FormControl fullWidth sx={{ mb: 3 }}>
                            <InputLabel id="expiry-label">Expiração de Convites</InputLabel>
                            <Select
                                labelId="expiry-label"
                                value={settings.invite_expiry_days || 7}
                                label="Expiração de Convites"
                                onChange={(e) => setSettings(prev => ({ ...prev, invite_expiry_days: e.target.value }))}
                            >
                                <MenuItem value={1}>24 horas</MenuItem>
                                <MenuItem value={3}>3 dias</MenuItem>
                                <MenuItem value={7}>7 dias (Padrão)</MenuItem>
                                <MenuItem value={15}>15 dias</MenuItem>
                                <MenuItem value={30}>30 dias</MenuItem>
                            </Select>
                        </FormControl>

                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Box>
                                <Typography variant="body2" sx={{ color: '#fff', fontWeight: 600 }}>Auto-aprovação</Typography>
                                <Typography variant="caption" color="text.secondary">Aprovar cadastros públicos sem moderação</Typography>
                            </Box>
                            <Switch 
                                checked={!!settings.auto_aprovacao}
                                onChange={(e) => setSettings(prev => ({ ...prev, auto_aprovacao: e.target.checked }))}
                            />
                        </Box>
                    </GlassCard>
                </Grid>

                {/* SEÇÃO: LGPD & Termos */}
                <Grid item xs={12} md={6}>
                    <GlassCard sx={{ p: 3, height: '100%' }}>
                        <Typography variant="subtitle1" sx={{ color: '#fff', fontWeight: 700, mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
                            <LgpdIcon fontSize="small" color="primary" /> Conformidade LGPD
                        </Typography>
                        
                        <TextField
                            label="Texto de Consentimento (LGPD)"
                            multiline
                            rows={6}
                            fullWidth
                            variant="outlined"
                            placeholder="Ex: Eu aceito o tratamento dos meus dados para fins de acesso ao evento..."
                            value={settings.lgpd_text || ''}
                            onChange={(e) => setSettings(prev => ({ ...prev, lgpd_text: e.target.value }))}
                        />
                        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                            Este texto será exibido no formulário de auto-cadastro e nos tablets de recepção.
                        </Typography>
                    </GlassCard>
                </Grid>

                {/* SEÇÃO: Fluxo de Cadastro */}
                <Grid item xs={12}>
                    <GlassCard sx={{ p: 3 }}>
                        <Typography variant="subtitle1" sx={{ color: '#fff', fontWeight: 700, mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
                            <AutoIcon fontSize="small" color="primary" /> Requisitos de Foto
                        </Typography>
                        
                        <Grid container spacing={4}>
                            <Grid item xs={12} md={6}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Box>
                                        <Typography variant="body2" sx={{ color: '#fff', fontWeight: 600 }}>Exigir Foto no Auto-cadastro</Typography>
                                        <Typography variant="caption" color="text.secondary">Obrigatório para reconhecimento facial</Typography>
                                    </Box>
                                    <Switch 
                                        checked={true} // Hardcoded for now
                                        disabled
                                    />
                                </Box>
                                <Divider sx={{ my: 2, borderColor: 'rgba(255,255,255,0.05)' }} />
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Box>
                                        <Typography variant="body2" sx={{ color: '#fff', fontWeight: 600 }}>Liveness Check Mobile</Typography>
                                        <Typography variant="caption" color="text.secondary">Prova de vida via câmera do celular</Typography>
                                    </Box>
                                    <Switch 
                                        checked={!!settings.liveness_check_enabled}
                                        onChange={(e) => setSettings(prev => ({ ...prev, liveness_check_enabled: e.target.checked }))}
                                    />
                                </Box>
                            </Grid>
                            
                            <Grid item xs={12} md={6}>
                                <Alert severity="info" sx={{ bgcolor: 'rgba(0, 212, 255, 0.05)', color: 'primary.main', border: '1px solid rgba(0, 212, 255, 0.1)' }}>
                                    <Typography variant="caption">
                                        Configurações de campos obrigatórios (CPF, Empresa, etc) devem ser ajustadas na matriz de tipos de perfil.
                                    </Typography>
                                </Alert>
                            </Grid>
                        </Grid>
                    </GlassCard>
                </Grid>

                <Grid item xs={12}>
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
                        <Button
                            variant="contained"
                            color="primary"
                            onClick={() => handleSave()}
                            disabled={saving}
                            sx={{ fontWeight: 700, px: 4, borderRadius: 2 }}
                        >
                            {saving ? 'Salvando...' : 'Salvar Alterações'}
                        </Button>
                    </Box>
                </Grid>
            </Grid>
        </Box>
    );
};

export default ConfigCredenciamento;
