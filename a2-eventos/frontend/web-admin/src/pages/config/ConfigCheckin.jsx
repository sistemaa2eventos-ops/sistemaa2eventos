import React, { useState, useEffect } from 'react';
import {
    Box, Typography, Switch, Slider, 
    Divider, Grid, CircularProgress, Button,
    Alert
} from '@mui/material';
import { 
    History as HistoryIcon,
    Security as SecurityIcon,
    Timer as TimerIcon,
    AppRegistration as AppRegIcon
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import { useSystemSettings } from '../../hooks/useSystemSettings';
import GlassCard from '../../components/common/GlassCard';

const ConfigCheckin = () => {
    const { settings, setSettings, loading, saving, handleSave } = useSystemSettings();
    const { enqueueSnackbar } = useSnackbar();

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>;

    return (
        <Box>
            <Typography variant="h6" sx={{ color: 'primary.main', mb: 3, fontWeight: 700 }}>
                ⚡ Regras de Acesso & Check-in
            </Typography>

            <Grid container spacing={3}>
                {/* SEÇÃO: Anti-Passback */}
                <Grid item xs={12} md={6}>
                    <GlassCard sx={{ p: 3, height: '100%' }}>
                        <Typography variant="subtitle1" sx={{ color: '#fff', fontWeight: 700, mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
                            <HistoryIcon fontSize="small" color="primary" /> Anti-Passback (Prevenção)
                        </Typography>
                        
                        <Box sx={{ mb: 4 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                                <Box>
                                    <Typography variant="body2" sx={{ color: '#fff', fontWeight: 600 }}>Trava de Reentrada</Typography>
                                    <Typography variant="caption" color="text.secondary">Impede re-entrada imediata com o mesmo ID</Typography>
                                </Box>
                                <Switch 
                                    checked={settings.anti_passback_enabled}
                                    onChange={(e) => setSettings(prev => ({ ...prev, anti_passback_enabled: e.target.checked }))}
                                />
                            </Box>
                        </Box>

                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                            Tempo de Cooldown: {settings.checkin_cooldown_min} minutos
                        </Typography>
                        <Slider
                            value={settings.checkin_cooldown_min || 15}
                            min={1}
                            max={120}
                            step={5}
                            marks={[
                                { value: 15, label: '15m' },
                                { value: 60, label: '1h' },
                                { value: 120, label: '2h' }
                            ]}
                            onChange={(e, val) => setSettings(prev => ({ ...prev, checkin_cooldown_min: val }))}
                            valueLabelDisplay="auto"
                            sx={{ color: 'primary.main' }}
                        />
                    </GlassCard>
                </Grid>

                {/* SEÇÃO: Biometria & Confiança */}
                <Grid item xs={12} md={6}>
                    <GlassCard sx={{ p: 3, height: '100%' }}>
                        <Typography variant="subtitle1" sx={{ color: '#fff', fontWeight: 700, mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
                            <SecurityIcon fontSize="small" color="primary" /> Sensibilidade Biométrica
                        </Typography>
                        
                        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
                            Define o nível mínimo de semelhança para aprovação automática via Reconhecimento Facial.
                        </Typography>

                        <Box sx={{ mb: 4 }}>
                            <Typography variant="h4" sx={{ color: 'primary.main', fontWeight: 800, textAlign: 'center', mb: 1 }}>
                                {settings.biometric_confidence}%
                            </Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', mb: 2 }}>
                                {settings.biometric_confidence < 70 ? '🔓 Baixa Segurança' : settings.biometric_confidence > 85 ? '🔒 Alta Segurança' : '⚖️ Equilibrado'}
                            </Typography>
                            <Slider
                                value={settings.biometric_confidence || 75}
                                min={50}
                                max={99}
                                step={1}
                                onChange={(e, val) => setSettings(prev => ({ ...prev, biometric_confidence: val }))}
                                valueLabelDisplay="auto"
                                sx={{ color: 'primary.main' }}
                            />
                        </Box>
                    </GlassCard>
                </Grid>

                {/* SEÇÃO: Restrições de Operação */}
                <Grid item xs={12}>
                    <GlassCard sx={{ p: 3 }}>
                        <Typography variant="subtitle1" sx={{ color: '#fff', fontWeight: 700, mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
                            <TimerIcon fontSize="small" color="primary" /> Horários e Restrições
                        </Typography>
                        
                        <Grid container spacing={4}>
                            <Grid item xs={12} md={6}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Box>
                                        <Typography variant="body2" sx={{ color: '#fff', fontWeight: 600 }}>Permitir Check-in Fora de Horário</Typography>
                                        <Typography variant="caption" color="text.secondary">Libera acesso mesmo se o evento não iniciou/terminou</Typography>
                                    </Box>
                                    <Switch 
                                        checked={settings.allow_offhour_checkin}
                                        onChange={(e) => setSettings(prev => ({ ...prev, allow_offhour_checkin: e.target.checked }))}
                                    />
                                </Box>
                                <Divider sx={{ my: 2, borderColor: 'rgba(255,255,255,0.05)' }} />
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Box>
                                        <Typography variant="body2" sx={{ color: '#fff', fontWeight: 600 }}>Bloquear Dias Não Autorizados</Typography>
                                        <Typography variant="caption" color="text.secondary">Válido apenas para equipes com escala definida</Typography>
                                    </Box>
                                    <Switch 
                                        checked={settings.block_unauthorized_days}
                                        onChange={(e) => setSettings(prev => ({ ...prev, block_unauthorized_days: e.target.checked }))}
                                    />
                                </Box>
                            </Grid>
                            
                            <Grid item xs={12} md={6}>
                                <Alert severity="info" sx={{ bgcolor: 'rgba(0, 212, 255, 0.05)', color: 'primary.main', border: '1px solid rgba(0, 212, 255, 0.1)' }}>
                                    <Typography variant="caption">
                                        As restrições de horário não se aplicam a check-ins feitos com método <strong>MANUAL</strong> (Supervisor).
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

export default ConfigCheckin;
