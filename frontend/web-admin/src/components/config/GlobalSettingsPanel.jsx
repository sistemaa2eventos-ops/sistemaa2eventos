import React from 'react';
import { Box, Typography, Slider, Chip } from '@mui/material';
import { Save as SaveIcon } from '@mui/icons-material';
import GlassCard from '../common/GlassCard';
import NeonButton from '../common/NeonButton';

const GlobalSettingsPanel = ({ 
    sensitivity, 
    setSensitivity, 
    liveness, 
    setLiveness, 
    handleSaveGlobal, 
    loading 
}) => {
    return (
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
};

export default GlobalSettingsPanel;
