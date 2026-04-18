import React, { useState } from 'react';
import {
    Box, Typography, Button, 
    Grid, Switch, FormControlLabel,
    Alert, CircularProgress, Divider,
    TextField, FormControl, InputLabel, Select, MenuItem,
    Stack, Chip, IconButton
} from '@mui/material';
import { 
    Security as SecurityIcon,
    Logout as LogoutIcon,
    Lock as LockIcon,
    Refresh as RefreshIcon,
    Visibility as VisibilityIcon,
    VisibilityOff as VisibilityOffIcon
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import { useSystemSettings } from '../../hooks/useSystemSettings';
import GlassCard from '../../components/common/GlassCard';
import PageHeader from '../../components/common/PageHeader';
import NeonButton from '../../components/common/NeonButton';
import api from '../../services/api';

const ConfigSeguranca = () => {
    const { settings, setSettings, saving, handleSave, forceLogoutAll, refresh } = useSystemSettings();
    const { enqueueSnackbar } = useSnackbar();
    const [verificandoConexao, setVerificandoConexao] = useState(false);

    // Política de senhas
    const [politicaSenha, setPoliticaSenha] = useState({
        tamanho_minimo: settings?.password_min_length || 8,
        exigir_maiuscula: settings?.password_require_uppercase !== false,
        exigir_numero: settings?.password_require_number !== false,
        exigir_especial: settings?.password_require_special || false,
        expiracao_dias: settings?.password_expiry_days || 0
    });

    // Configurações 2FA
    const [config2FA, setConfig2FA] = useState({
        exigir_admin_master: settings?.require_2fa_admin_master || false,
        exigir_operadores: settings?.require_2fa_operators || false,
        status_2fa: settings?.two_factor_configured ? 'configurado' : 'nao_configurado'
    });

    const handleForceLogout = async () => {
        if (!window.confirm('CUIDADO: Isso irá desconectar IMEDIATAMENTE todos os usuários logados no sistema (exceto você). Deseja prosseguir?')) return;
        await forceLogoutAll();
        enqueueSnackbar('Todas as sessões foram encerradas.', { variant: 'success' });
    };

    const handleSalvarPolitica = async () => {
        try {
            setSettings(prev => ({
                ...prev,
                password_min_length: politicaSenha.tamanho_minimo,
                password_require_uppercase: politicaSenha.exigir_maiuscula,
                password_require_number: politicaSenha.exigir_numero,
                password_require_special: politicaSenha.exigir_especial,
                password_expiry_days: politicaSenha.expiracao_dias
            }));
            await handleSave();
            enqueueSnackbar('Política de senhas salva!', { variant: 'success' });
        } catch (error) {
            enqueueSnackbar('Erro ao salvar.', { variant: 'error' });
        }
    };

    const handleSalvar2FA = async () => {
        try {
            setSettings(prev => ({
                ...prev,
                require_2fa_admin_master: config2FA.exigir_admin_master,
                require_2fa_operators: config2FA.exigir_operadores
            }));
            await handleSave();
            enqueueSnackbar('Configurações de 2FA salvas!', { variant: 'success' });
        } catch (error) {
            enqueueSnackbar('Erro ao salvar.', { variant: 'error' });
        }
    };

    const handleTestarConexao = async () => {
        setVerificandoConexao(true);
        try {
            await api.get('/settings/test-connection');
            enqueueSnackbar('Conexão com banco de dados OK!', { variant: 'success' });
        } catch (error) {
            enqueueSnackbar('Erro na conexão.', { variant: 'error' });
        } finally {
            setVerificandoConexao(false);
        }
    };

    return (
        <Box sx={{ p: 4 }}>
            <PageHeader
                title="Segurança do Sistema"
                subtitle="Configure políticas de senha, 2FA e sessões."
                breadcrumbs={[{ text: 'Configurações' }, { text: 'Segurança' }]}
            />

            <Grid container spacing={3}>
                {/* SEÇÃO: Política de Senhas */}
                <Grid item xs={12} md={6}>
                    <GlassCard sx={{ p: 3 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
                            <LockIcon sx={{ color: '#00D4FF' }} />
                            <Typography variant="h6" sx={{ fontWeight: 700, color: '#fff' }}>
                                Política de Senhas
                            </Typography>
                        </Box>

                        <Stack spacing={3}>
                            <TextField
                                label="Tamanho mínimo"
                                type="number"
                                value={politicaSenha.tamanho_minimo}
                                onChange={(e) => setPoliticaSenha({...politicaSenha, tamanho_minimo: parseInt(e.target.value) || 8})}
                                size="small"
                                sx={{ width: 150 }}
                                InputProps={{ inputProps: { min: 6, max: 32 } }}
                            />

                            <Box>
                                <FormControlLabel
                                    control={
                                        <Switch 
                                            checked={politicaSenha.exigir_maiuscula}
                                            onChange={(e) => setPoliticaSenha({...politicaSenha, exigir_maiuscula: e.target.checked})}
                                        />
                                    }
                                    label="Exigir letra maiúscula"
                                />
                                <FormControlLabel
                                    control={
                                        <Switch 
                                            checked={politicaSenha.exigir_numero}
                                            onChange={(e) => setPoliticaSenha({...politicaSenha, exigir_numero: e.target.checked})}
                                        />
                                    }
                                    label="Exigir número"
                                />
                                <FormControlLabel
                                    control={
                                        <Switch 
                                            checked={politicaSenha.exigir_especial}
                                            onChange={(e) => setPoliticaSenha({...politicaSenha, exigir_especial: e.target.checked})}
                                        />
                                    }
                                    label="Exigir caractere especial"
                                />
                            </Box>

                            <TextField
                                label="Expiração (dias, 0 = nunca)"
                                type="number"
                                value={politicaSenha.expiracao_dias}
                                onChange={(e) => setPoliticaSenha({...politicaSenha, expiracao_dias: parseInt(e.target.value) || 0})}
                                size="small"
                                sx={{ width: 200 }}
                                InputProps={{ inputProps: { min: 0, max: 365 } }}
                            />

                            <Button 
                                variant="contained" 
                                onClick={handleSalvarPolitica}
                                disabled={saving}
                                sx={{ mt: 2 }}
                            >
                                Salvar Política
                            </Button>
                        </Stack>
                    </GlassCard>
                </Grid>

                {/* SEÇÃO: Autenticação de Dois Fatores */}
                <Grid item xs={12} md={6}>
                    <GlassCard sx={{ p: 3 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
                            <SecurityIcon sx={{ color: '#00D4FF' }} />
                            <Typography variant="h6" sx={{ fontWeight: 700, color: '#fff' }}>
                                Autenticação em Dois Fatores (2FA)
                            </Typography>
                        </Box>

                        <Alert severity="info" sx={{ mb: 3 }}>
                            O 2FA é gerenciado via Supabase Auth. Esta configuração define a política de uso.
                        </Alert>

                        <Stack spacing={2}>
                            <Box sx={{ p: 2, bgcolor: 'rgba(0,0,0,0.2)', borderRadius: 2 }}>
                                <Typography variant="body2" sx={{ color: '#fff', mb: 1, fontWeight: 600 }}>
                                    Status atual:
                                </Typography>
                                <Chip 
                                    label={config2FA.status_2fa === 'configurado' ? '✅ Configurado no Supabase' : '⚠️ Não configurado'}
                                    color={config2FA.status_2fa === 'configurado' ? 'success' : 'warning'}
                                    size="small"
                                />
                            </Box>

                            <FormControlLabel
                                control={
                                    <Switch 
                                        checked={config2FA.exigir_admin_master}
                                        onChange={(e) => setConfig2FA({...config2FA, exigir_admin_master: e.target.checked})}
                                    />
                                }
                                label="Exigir 2FA para Admin Master"
                            />

                            <FormControlLabel
                                control={
                                    <Switch 
                                        checked={config2FA.exigir_operadores}
                                        onChange={(e) => setConfig2FA({...config2FA, exigir_operadores: e.target.checked})}
                                    />
                                }
                                label="Exigir 2FA para todos os operadores"
                            />

                            <Button 
                                variant="outlined" 
                                href="https://supabase.com/docs/guides/auth/totp"
                                target="_blank"
                                sx={{ mt: 1 }}
                            >
                                📖 Ver documentação Supabase
                            </Button>

                            <Button 
                                variant="contained" 
                                onClick={handleSalvar2FA}
                                disabled={saving}
                            >
                                Salvar Configurações 2FA
                            </Button>
                        </Stack>
                    </GlassCard>
                </Grid>

                {/* SEÇÃO: Sessões Ativas */}
                <Grid item xs={12} md={6}>
                    <GlassCard sx={{ p: 3 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
                            <LogoutIcon sx={{ color: '#FF3366' }} />
                            <Typography variant="h6" sx={{ fontWeight: 700, color: '#fff' }}>
                                Sessões Ativas
                            </Typography>
                        </Box>

                        <Box sx={{ p: 2, bgcolor: 'rgba(255, 51, 102, 0.05)', borderRadius: 2, border: '1px solid rgba(255, 51, 102, 0.2)' }}>
                            <Typography variant="subtitle2" sx={{ color: '#FF3366', fontWeight: 700, mb: 1 }}>
                                ⚠️ Zona de Risco
                            </Typography>
                            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 2 }}>
                                Encerrar todas as sessões disconnect todos os usuários exceto você.
                            </Typography>
                            <Button 
                                variant="contained" 
                                color="error" 
                                fullWidth 
                                onClick={handleForceLogout}
                                sx={{ fontWeight: 800 }}
                            >
                                Encerrar Todas as Sessões
                            </Button>
                        </Box>
                    </GlassCard>
                </Grid>

                {/* SEÇÃO: Teste de Conexão */}
                <Grid item xs={12} md={6}>
                    <GlassCard sx={{ p: 3 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
                            <RefreshIcon sx={{ color: '#00FF88' }} />
                            <Typography variant="h6" sx={{ fontWeight: 700, color: '#fff' }}>
                                Teste de Conexão
                            </Typography>
                        </Box>

                        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
                            Verifique se a conexão com o banco de dados está funcionando corretamente.
                        </Typography>

                        <Button 
                            variant="outlined" 
                            onClick={handleTestarConexao}
                            disabled={verificandoConexao}
                            startIcon={<RefreshIcon />}
                        >
                            {verificandoConexao ? 'Verificando...' : 'Testar Conexão'}
                        </Button>
                    </GlassCard>
                </Grid>

                {/* Link para tela de Perfis de Acesso */}
                <Grid item xs={12}>
                    <Alert severity="info">
                        Para gerenciar permissões granulares de operadores, acesso a tela{' '}
                        <Button 
                            size="small" 
                            variant="text" 
                            onClick={() => window.location.href = '/config/permissoes'}
                            sx={{ color: '#00D4FF' }}
                        >
                            Perfis de Acesso
                        </Button>
                    </Alert>
                </Grid>
            </Grid>
        </Box>
    );
};

export default ConfigSeguranca;