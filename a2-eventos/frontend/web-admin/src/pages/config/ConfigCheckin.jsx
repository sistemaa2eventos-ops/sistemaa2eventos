import React, { useState, useEffect } from 'react';
import {
    Box, Typography, Switch, Slider, 
    Divider, Grid, CircularProgress, Button,
    Alert, FormControl, InputLabel, Select, MenuItem,
    TextField
} from '@mui/material';
import { 
    History as HistoryIcon,
    Security as SecurityIcon,
    Timer as TimerIcon,
    Face as FaceIcon,
    AccessTime as TimeIcon
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import { useSystemSettings } from '../../hooks/useSystemSettings';
import GlassCard from '../../components/common/GlassCard';
import PageHeader from '../../components/common/PageHeader';

const ConfigCheckin = () => {
    const { settings, setSettings, loading, saving, handleSave } = useSystemSettings();
    const { enqueueSnackbar } = useSnackbar();

    // Campos extras para biometria
    const [confiancaBaixa, setConfiancaBaixa] = useState(settings?.biometric_confianca_baixa || 'liberar');
    const [horarioInicio, setHorarioInicio] = useState(settings?.horario_inicio || '08:00');
    const [horarioFim, setHorarioFim] = useState(settings?.horario_fim || '22:00');
    const [cooldownPulseira, setCooldownPulseira] = useState(settings?.cooldown_pulseira !== false);

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>;

    return (
        <Box sx={{ p: 4 }}>
            <PageHeader
                title="Regras de Acesso"
                subtitle="Configurecheck-in, biometria e comportamentos de acesso."
                breadcrumbs={[{ text: 'Configurações' }, { text: 'Regras de Acesso' }]}
            />

            <Grid container spacing={3}>
                {/* SEÇÃO: Anti-Passback */}
                <Grid item xs={12} md={6}>
                    <GlassCard sx={{ p: 3, height: '100%' }}>
                        <Typography variant="subtitle1" sx={{ color: '#fff', fontWeight: 700, mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
                            <HistoryIcon fontSize="small" color="primary" /> Anti-Passback
                        </Typography>
                        
                        <Box sx={{ mb: 4 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                                <Box>
                                    <Typography variant="body2" sx={{ color: '#fff', fontWeight: 600 }}>Trava de Reentrada</Typography>
                                    <Typography variant="caption" color="text.secondary">Impede re-entrada imediata com o mesmo método</Typography>
                                </Box>
                                <Switch 
                                    checked={settings.anti_passback_enabled}
                                    onChange={(e) => setSettings(prev => ({ ...prev, anti_passback_enabled: e.target.checked }))}
                                />
                            </Box>
                        </Box>

                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                            Tempo de Cooldown (Método Facial): {settings.checkin_cooldown_min || 15} minutos
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

                        <Divider sx={{ my: 3, borderColor: 'rgba(255,255,255,0.05)' }} />

                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Box>
                                <Typography variant="body2" sx={{ color: '#fff', fontWeight: 600 }}>Aplicar Cooldown para Pulseira</Typography>
                                <Typography variant="caption" color="text.secondary">Mesmo tempo do método facial</Typography>
                            </Box>
                            <Switch 
                                checked={cooldownPulseira}
                                onChange={(e) => {
                                    setCooldownPulseira(e.target.checked);
                                    setSettings(prev => ({ ...prev, cooldown_pulseira: e.target.checked }));
                                }}
                            />
                        </Box>
                    </GlassCard>
                </Grid>

                {/* SEÇÃO: Biometria Facial */}
                <Grid item xs={12} md={6}>
                    <GlassCard sx={{ p: 3, height: '100%' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
                            <FaceIcon sx={{ color: '#00D4FF' }} />
                            <Typography variant="subtitle1" sx={{ color: '#fff', fontWeight: 700 }}>
                                Biometria Facial
                            </Typography>
                        </Box>
                        
                        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>
                            Score mínimo global de confiança. Usado quando o terminal não tem config própria.
                        </Typography>

                        <Box sx={{ mb: 4 }}>
                            <Typography variant="h4" sx={{ color: 'primary.main', fontWeight: 800, textAlign: 'center', mb: 1 }}>
                                {settings.biometric_confidence || 75}%
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

                        <Divider sx={{ my: 3, borderColor: 'rgba(255,255,255,0.05)' }} />

                        <Typography variant="subtitle2" sx={{ color: '#fff', fontWeight: 600, mb: 2 }}>
                            Confiança Baixa (60% - 74%)
                        </Typography>
                        <FormControl fullWidth size="small">
                            <Select
                                value={confiancaBaixa}
                                onChange={(e) => {
                                    setConfiancaBaixa(e.target.value);
                                    setSettings(prev => ({ ...prev, biometric_confianca_baixa: e.target.value }));
                                }}
                            >
                                <MenuItem value="liberar">Registrar alerta e liberar acesso</MenuItem>
                                <MenuItem value="bloquear">Registrar alerta e bloquear acesso</MenuItem>
                            </Select>
                        </FormControl>

                        <Alert severity="info" sx={{ mt: 2, fontSize: '0.7rem' }}>
                            Abaixo de 60%: sempre rejeita automaticamente (não configurável).
                        </Alert>
                    </GlassCard>
                </Grid>

                {/* SEÇÃO: Horário de Funcionamento */}
                <Grid item xs={12} md={6}>
                    <GlassCard sx={{ p: 3 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
                            <TimeIcon sx={{ color: '#00D4FF' }} />
                            <Typography variant="subtitle1" sx={{ color: '#fff', fontWeight: 700 }}>
                                Horário de Funcionamento
                            </Typography>
                        </Box>

                        <Grid container spacing={2}>
                            <Grid item xs={6}>
                                <TextField
                                    label="Início"
                                    type="time"
                                    fullWidth
                                    size="small"
                                    value={horarioInicio}
                                    onChange={(e) => {
                                        setHorarioInicio(e.target.value);
                                        setSettings(prev => ({ ...prev, horario_inicio: e.target.value }));
                                    }}
                                    InputLabelProps={{ shrink: true }}
                                />
                            </Grid>
                            <Grid item xs={6}>
                                <TextField
                                    label="Fim"
                                    type="time"
                                    fullWidth
                                    size="small"
                                    value={horarioFim}
                                    onChange={(e) => {
                                        setHorarioFim(e.target.value);
                                        setSettings(prev => ({ ...prev, horario_fim: e.target.value }));
                                    }}
                                    InputLabelProps={{ shrink: true }}
                                />
                            </Grid>
                        </Grid>

                        <Divider sx={{ my: 3, borderColor: 'rgba(255,255,255,0.05)' }} />

                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Box>
                                <Typography variant="body2" sx={{ color: '#fff', fontWeight: 600 }}>Permitir Check-in Fora do Horário</Typography>
                                <Typography variant="caption" color="text.secondary">Libera mesmo se fora do período configurado</Typography>
                            </Box>
                            <Switch 
                                checked={settings.allow_offhour_checkin}
                                onChange={(e) => setSettings(prev => ({ ...prev, allow_offhour_checkin: e.target.checked }))}
                            />
                        </Box>
                    </GlassCard>
                </Grid>

                {/* SEÇÃO: Restrições de Dias */}
                <Grid item xs={12} md={6}>
                    <GlassCard sx={{ p: 3 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
                            <TimerIcon sx={{ color: '#00D4FF' }} />
                            <Typography variant="subtitle1" sx={{ color: '#fff', fontWeight: 700 }}>
                                Restrições de Dias
                            </Typography>
                        </Box>

                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                            <Box>
                                <Typography variant="body2" sx={{ color: '#fff', fontWeight: 600 }}>Bloquear Dias Não Autorizados</Typography>
                                <Typography variant="caption" color="text.secondary">Para equipes com escala definida (dias_acesso)</Typography>
                            </Box>
                            <Switch 
                                checked={settings.block_unauthorized_days}
                                onChange={(e) => setSettings(prev => ({ ...prev, block_unauthorized_days: e.target.checked }))}
                            />
                        </Box>

                        <Alert severity="info" sx={{ bgcolor: 'rgba(0, 212, 255, 0.05)', border: '1px solid rgba(0, 212, 255, 0.1)' }}>
                            <Typography variant="caption">
                                Check-in MANUAL ignora todas as restrições (Supervisor/Admin).
                            </Typography>
                        </Alert>
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