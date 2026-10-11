import React, { useState, useEffect, useCallback } from 'react';
import {
    Box, Typography, Grid, Switch, FormControlLabel, Select, MenuItem, Stack,
    CircularProgress, Dialog, DialogTitle, DialogContent, DialogActions, Button, Alert
} from '@mui/material';
import { Security as SecurityIcon, Save as SaveIcon, GroupAdd as AplicarIcon } from '@mui/icons-material';
import api from '../../services/api';
import GlassCard from '../../components/common/GlassCard';
import NeonButton from '../../components/common/NeonButton';
import PageHeader from '../../components/common/PageHeader';
import { MODULOS } from '../../hooks/useUsuarios';
import { useSnackbar } from 'notistack';

import { botaoSecundario } from '../../styles/tokens';
// O sistema tem dois papéis: Admin Master (acesso total) e Operador
const PERFIS = [
    { value: 'operador', label: 'Operador' }
];

/**
 * Perfis de Acesso: modelo de permissões por papel.
 * Usuário novo nasce com o modelo do seu papel; a tela Usuários ajusta cada pessoa.
 */
const PermissoesAcesso = () => {
    const { enqueueSnackbar } = useSnackbar();
    const [perfil, setPerfil] = useState('operador');
    const [modulos, setModulos] = useState({});
    const [info, setInfo] = useState(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [alterado, setAlterado] = useState(false);
    const [confirmarAplicar, setConfirmarAplicar] = useState(false);
    const [aplicando, setAplicando] = useState(false);

    const carregar = useCallback(async (p) => {
        try {
            setLoading(true);
            const { data } = await api.get(`/auth/permissions/${p}`);
            setModulos(data.data?.modulos || {});
            setInfo(data.data || null);
            setAlterado(false);
        } catch {
            enqueueSnackbar('Erro ao carregar o perfil de acesso', { variant: 'error' });
        } finally {
            setLoading(false);
        }
    }, [enqueueSnackbar]);

    useEffect(() => { carregar(perfil); }, [perfil, carregar]);

    const alternar = (key) => {
        if (key === 'dashboard') return; // sempre liberado
        setModulos(prev => ({ ...prev, [key]: !prev[key] }));
        setAlterado(true);
    };

    const marcarTodos = (valor) => {
        setModulos(Object.fromEntries(MODULOS.map(m => [m.key, m.key === 'dashboard' ? true : valor])));
        setAlterado(true);
    };

    const salvar = async () => {
        try {
            setSaving(true);
            const { data } = await api.put(`/auth/permissions/${perfil}`, { modulos });
            setInfo(data.data);
            setAlterado(false);
            enqueueSnackbar('Perfil salvo. Novos usuários deste perfil já nascem com estas permissões.', { variant: 'success' });
        } catch (error) {
            enqueueSnackbar(error.response?.data?.error || 'Erro ao salvar o perfil', { variant: 'error' });
        } finally {
            setSaving(false);
        }
    };

    const aplicar = async () => {
        try {
            setAplicando(true);
            const { data } = await api.post(`/auth/permissions/${perfil}/aplicar`);
            enqueueSnackbar(`Permissões aplicadas a ${data.data.atualizados} usuário(s).`, { variant: 'success' });
            setConfirmarAplicar(false);
        } catch (error) {
            enqueueSnackbar(error.response?.data?.error || 'Erro ao aplicar o perfil', { variant: 'error' });
        } finally {
            setAplicando(false);
        }
    };

    const rotuloPerfil = PERFIS.find(p => p.value === perfil)?.label || perfil;
    const liberados = MODULOS.filter(m => modulos[m.key]).length;

    return (
        <Box>
            <PageHeader
                title="Perfis de acesso"
                subtitle="Permissões padrão de cada papel. Usuários novos nascem com elas; a tela Usuários ajusta cada pessoa."
            />

            <GlassCard sx={{ p: 3, mb: 3 }}>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }} justifyContent="space-between">
                    <Stack direction="row" spacing={2} alignItems="center">
                        <SecurityIcon sx={{ color: '#00D4FF' }} />
                        {PERFIS.length > 1 ? (
                            <Select size="small" value={perfil} onChange={(e) => setPerfil(e.target.value)} sx={{ minWidth: 200 }}>
                                {PERFIS.map(p => <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>)}
                            </Select>
                        ) : (
                            <Typography sx={{ color: '#FFFFFF', fontWeight: 700 }}>{PERFIS[0].label}</Typography>
                        )}
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.55)' }}>
                            {info?.personalizado
                                ? `Atualizado ${info.atualizado_em ? new Date(info.atualizado_em).toLocaleString('pt-BR') : ''}${info.atualizado_por ? ` por ${info.atualizado_por}` : ''}`
                                : 'Padrão do sistema (só Dashboard)'}
                        </Typography>
                    </Stack>
                    <Stack direction="row" spacing={1.5}>
                        <NeonButton variant="outlined" startIcon={<AplicarIcon />} disabled={loading || alterado}
                            onClick={() => setConfirmarAplicar(true)}>
                            Aplicar a todos
                        </NeonButton>
                        <NeonButton startIcon={saving ? <CircularProgress size={16} /> : <SaveIcon />} disabled={loading || saving || !alterado} onClick={salvar}>
                            Salvar perfil
                        </NeonButton>
                    </Stack>
                </Stack>
            </GlassCard>

            <GlassCard sx={{ p: 3 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#FFFFFF' }}>
                        Módulos liberados para {rotuloPerfil} ({liberados}/{MODULOS.length})
                    </Typography>
                    <Stack direction="row" spacing={1}>
                        <Button size="small" onClick={() => marcarTodos(true)}>Liberar todos</Button>
                        <Button size="small" color="error" onClick={() => marcarTodos(false)}>Bloquear todos</Button>
                    </Stack>
                </Stack>
                {loading ? (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
                ) : (
                    <Grid container spacing={1}>
                        {MODULOS.map(m => (
                            <Grid item xs={12} sm={6} md={4} key={m.key}>
                                <FormControlLabel
                                    control={<Switch checked={m.key === 'dashboard' || !!modulos[m.key]} disabled={m.key === 'dashboard'} onChange={() => alternar(m.key)} />}
                                    label={m.key === 'dashboard' ? `${m.label} (sempre liberado)` : m.label}
                                    sx={{ color: '#FFFFFF' }}
                                />
                            </Grid>
                        ))}
                    </Grid>
                )}
                {alterado && <Alert severity="info" sx={{ mt: 2 }}>Alterações não salvas.</Alert>}
            </GlassCard>

            <Dialog open={confirmarAplicar} onClose={() => !aplicando && setConfirmarAplicar(false)}>
                <DialogTitle>Aplicar a todos os usuários com o papel {rotuloPerfil}?</DialogTitle>
                <DialogContent>
                    <Typography variant="body2">
                        Os módulos de <b>todos</b> os usuários com o papel {rotuloPerfil} passam a ser exatamente os deste perfil
                        ({liberados} de {MODULOS.length} liberados). Ajustes individuais feitos na tela Usuários serão substituídos.
                        O vínculo com eventos de cada pessoa não muda.
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button variant="outlined" onClick={() => setConfirmarAplicar(false)} disabled={aplicando} sx={botaoSecundario}>Cancelar</Button>
                    <Button color="warning" variant="contained" onClick={aplicar} disabled={aplicando}>
                        {aplicando ? 'Aplicando...' : 'Aplicar'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default PermissoesAcesso;
