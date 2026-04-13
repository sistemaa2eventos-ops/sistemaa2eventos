import React, { useState } from 'react';
import {
    Box, Typography, Button, 
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
    Paper, Grid, Select, MenuItem, FormControl, InputLabel,
    Alert, CircularProgress, Divider
} from '@mui/material';
import { 
    Security as SecurityIcon,
    Logout as LogoutIcon,
    TableChart as TableIcon,
    Lock as LockIcon
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import { useSystemSettings } from '../../hooks/useSystemSettings';
import GlassCard from '../../components/common/GlassCard';

const ConfigSeguranca = () => {
    const { settings, setSettings, saving, handleSave, forceLogoutAll } = useSystemSettings();
    const { enqueueSnackbar } = useSnackbar();

    const perms = [
        { func: 'Dashboard (NOC)', master: 'FULL', operador: 'Read-only' },
        { func: 'Gestão de Empresas', master: 'FULL', operador: 'EDIT' },
        { func: 'Gestão de Pessoas', master: 'FULL', operador: 'EDIT' },
        { func: 'Operação Check-in/Out', master: 'FULL', operador: 'FULL' },
        { func: 'Central de Configurações', master: 'FULL', operador: 'BLOCKED' },
        { func: 'Gestão de Usuários', master: 'FULL', operador: 'BLOCKED' },
        { func: 'Logs de Auditoria', master: 'FULL', operador: 'BLOCKED' },
        { func: 'Relatórios Gerenciais', master: 'FULL', operador: 'BLOCKED' },
    ];

    const handleForceLogout = async () => {
        if (!window.confirm('CUIDADO: Isso irá desconectar IMEDIATAMENTE todos os usuários logados no sistema (exceto você). Deseja prosseguir?')) return;
        await forceLogoutAll();
    };

    return (
        <Box>
            <Typography variant="h6" sx={{ color: 'primary.main', mb: 3, fontWeight: 700 }}>
                🛡️ Segurança & Auditoria
            </Typography>

            <Grid container spacing={3}>
                {/* SEÇÃO: Políticas de Sessão */}
                <Grid item xs={12} md={6}>
                    <GlassCard sx={{ p: 3, height: '100%' }}>
                        <Typography variant="subtitle1" sx={{ color: '#fff', fontWeight: 700, mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
                            <LockIcon fontSize="small" color="primary" /> Sessão & JWT
                        </Typography>
                        
                        <FormControl fullWidth sx={{ mb: 4 }}>
                            <InputLabel id="jwt-label">Expiração de Token (JWT)</InputLabel>
                            <Select
                                labelId="jwt-label"
                                value={settings.jwt_expiry || '8h'}
                                label="Expiração de Token (JWT)"
                                onChange={(e) => setSettings(prev => ({ ...prev, jwt_expiry: e.target.value }))}
                            >
                                <MenuItem value="1h">1 hora</MenuItem>
                                <MenuItem value="4h">4 horas</MenuItem>
                                <MenuItem value="8h">8 horas (Padrão)</MenuItem>
                                <MenuItem value="24h">24 horas</MenuItem>
                                <MenuItem value="1w">7 dias (Permanente)</MenuItem>
                            </Select>
                        </FormControl>

                        <Divider sx={{ my: 3, borderColor: 'rgba(255,255,255,0.05)' }} />

                        <Box sx={{ p: 2, bgcolor: 'rgba(255, 0, 0, 0.05)', borderRadius: 2, border: '1px solid rgba(255, 0, 0, 0.1)' }}>
                            <Typography variant="subtitle2" sx={{ color: '#ff4444', fontWeight: 700, mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                                <LogoutIcon fontSize="small" /> Zona de Risco
                            </Typography>
                            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 2 }}>
                                Em caso de comprometimento, você pode forçar o logout de todas as sessões ativas do painel.
                            </Typography>
                            <Button 
                                variant="contained" 
                                color="error" 
                                fullWidth 
                                onClick={handleForceLogout}
                                sx={{ fontWeight: 800, textTransform: 'none' }}
                            >
                                Encerrar Logout Global
                            </Button>
                        </Box>
                    </GlassCard>
                </Grid>

                {/* SEÇÃO: Matriz RBAC */}
                <Grid item xs={12} md={6}>
                    <GlassCard sx={{ p: 3, height: '100%' }}>
                        <Typography variant="subtitle1" sx={{ color: '#fff', fontWeight: 700, mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
                            <TableIcon fontSize="small" color="primary" /> Matriz de Permissões (RBAC)
                        </Typography>
                        
                        <TableContainer component={Box} sx={{ maxHeight: 350, overflowY: 'auto' }}>
                            <Table size="small" stickyHeader>
                                <TableHead>
                                    <TableRow>
                                        <TableCell sx={{ bgcolor: 'background.paper', fontWeight: 800 }}>Módulo</TableCell>
                                        <TableCell sx={{ bgcolor: 'background.paper', fontWeight: 800, color: 'primary.main', textAlign: 'center' }}>Master</TableCell>
                                        <TableCell sx={{ bgcolor: 'background.paper', fontWeight: 800, color: 'secondary.main', textAlign: 'center' }}>Operador</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {perms.map((row) => (
                                        <TableRow key={row.func} sx={{ '&:last-child td, &:last-child th': { border: 0 } }}>
                                            <TableCell component="th" scope="row" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
                                                {row.func}
                                            </TableCell>
                                            <TableCell sx={{ textAlign: 'center' }}>
                                                <Typography variant="caption" sx={{ fontWeight: 800, color: '#00FF88' }}>{row.master}</Typography>
                                            </TableCell>
                                            <TableCell sx={{ textAlign: 'center' }}>
                                                <Typography 
                                                    variant="caption" 
                                                    sx={{ 
                                                        fontWeight: 800, 
                                                        color: row.operador === 'BLOCKED' ? '#ff4444' : row.operador === 'Read-only' ? '#ffac33' : '#00D4FF' 
                                                    }}
                                                >
                                                    {row.operador}
                                                </Typography>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                        <Alert severity="info" sx={{ mt: 2, fontSize: '0.7rem' }}>
                            A edição granular está disponível apenas via CLI/Database RLS.
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

export default ConfigSeguranca;
