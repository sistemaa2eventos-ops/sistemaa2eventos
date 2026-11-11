import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Box, Typography, TextField, Button, Stack, Alert } from '@mui/material';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';
import { MODULE_ROUTES } from './ProtectedRoute';

/**
 * Modo de tela de cada usuário (Usuários > Modo de tela), configurado por quem administra:
 *  - normal:     menu completo (padrão de todos hoje)
 *  - tela_cheia: só a página escolhida, sem menu, sem trocar de página
 *  - quiosque:   igual à tela cheia, e fica BLOQUEADO: sair exige senha de administrador ou supervisor
 *
 * A "página" é a página inicial escolhida (ou a primeira permitida). Admin Master nunca fica restrito.
 * O desbloqueio vale só para esta aba do navegador (sessionStorage): fechar a aba bloqueia de novo.
 */
const LIBERADO_KEY = 'quiosque_liberado';

export const QuiosqueGuard = () => {
    const { user, hasPermission } = useAuth();
    const location = useLocation();
    const [, setVersao] = useState(0);
    const [credenciais, setCredenciais] = useState({ email: '', senha: '' });
    const [erro, setErro] = useState('');
    const [enviando, setEnviando] = useState(false);

    const modo = user && user.nivel_acesso !== 'admin_master' ? user.permissions?.modo_tela : null;
    let liberado = false;
    try { liberado = sessionStorage.getItem(LIBERADO_KEY) === '1'; } catch { liberado = false; }
    const bloqueado = modo === 'quiosque' && !liberado;
    const restrito = modo === 'tela_cheia' || bloqueado;

    const escolhida = MODULE_ROUTES.find(m => m.modulo === user?.permissions?.pagina_inicial);
    const pagina = (escolhida && hasPermission(escolhida.modulo))
        ? escolhida
        : MODULE_ROUTES.find(m => hasPermission(m.modulo)) || null;

    // Classes do modo (o CSS existente esconde menu, barra e ajuda) e volta do tela cheia
    useEffect(() => {
        if (!restrito) return undefined;
        document.body.classList.add('modo-quiosque');
        if (bloqueado) document.body.classList.add('quiosque-bloqueado');
        const aoMudarTela = () => setVersao(n => n + 1);
        document.addEventListener('fullscreenchange', aoMudarTela);
        return () => {
            document.body.classList.remove('modo-quiosque', 'quiosque-bloqueado');
            document.removeEventListener('fullscreenchange', aoMudarTela);
        };
    }, [restrito, bloqueado]);

    if (!restrito || !pagina) return null;

    // Não deixa sair da página escolhida (menu escondido, mas endereço e botão Voltar ainda existem)
    if (location.pathname !== pagina.path) {
        return <Navigate to={pagina.path} replace />;
    }

    // Quiosque bloqueado fora da tela cheia (Esc, gesto): cobre a tela até voltar ou ser desbloqueado.
    // Dispositivos sem tela cheia (ex.: iPhone) não usam esta tela: o bloqueio segue pela página.
    const precisaTelaCheia = bloqueado && document.fullscreenEnabled && !document.fullscreenElement;
    if (!precisaTelaCheia) return null;

    const voltarTelaCheia = () => {
        document.documentElement.requestFullscreen?.().catch(() => {});
    };

    const desbloquear = async (e) => {
        e.preventDefault();
        setEnviando(true);
        setErro('');
        try {
            await api.post('/auth/quiosque/desbloquear', {
                email: credenciais.email,
                senha: credenciais.senha
            }, { hideDefaultError: true, timeout: 15000 });
            sessionStorage.setItem(LIBERADO_KEY, '1');
            setCredenciais({ email: '', senha: '' });
            setVersao(n => n + 1);
        } catch (err) {
            setErro(err.response?.data?.error || 'Não foi possível liberar agora. Tente de novo.');
        } finally {
            setEnviando(false);
        }
    };

    return (
        <Box
            role="dialog"
            aria-modal="true"
            aria-labelledby="quiosque-titulo"
            sx={{
                position: 'fixed', inset: 0, zIndex: 2000,
                bgcolor: 'rgba(3, 8, 14, 0.96)', display: 'flex',
                alignItems: 'center', justifyContent: 'center', p: 2
            }}
        >
            <Box sx={{ width: '100%', maxWidth: 380, p: 3, borderRadius: 2, border: '1px solid rgba(0,212,255,0.3)', bgcolor: '#0A121B' }}>
                <Typography id="quiosque-titulo" variant="h6" fontWeight={700} sx={{ color: '#FFFFFF' }}>
                    Tela bloqueada
                </Typography>
                <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)', mt: 0.5, mb: 2 }}>
                    Este computador está em modo quiosque. Para continuar, volte à tela cheia. Para sair do quiosque, peça a senha de um administrador ou supervisor.
                </Typography>
                <Button fullWidth variant="contained" onClick={voltarTelaCheia} sx={{ mb: 2.5, fontWeight: 700 }}>
                    Voltar à tela cheia
                </Button>
                <Box component="form" onSubmit={desbloquear}>
                    <Stack spacing={1.5}>
                        {erro && <Alert severity="error">{erro}</Alert>}
                        <TextField
                            id="quiosque-email" label="E-mail de administrador ou supervisor" size="small" fullWidth
                            type="email" autoComplete="off" required
                            value={credenciais.email}
                            onChange={(e) => setCredenciais(c => ({ ...c, email: e.target.value }))}
                        />
                        <TextField
                            id="quiosque-senha" label="Senha" size="small" fullWidth
                            type="password" autoComplete="new-password" required
                            value={credenciais.senha}
                            onChange={(e) => setCredenciais(c => ({ ...c, senha: e.target.value }))}
                        />
                        <Button type="submit" variant="outlined" disabled={enviando} sx={{ fontWeight: 700 }}>
                            {enviando ? 'Verificando...' : 'Sair do quiosque'}
                        </Button>
                    </Stack>
                </Box>
            </Box>
        </Box>
    );
};

export default QuiosqueGuard;
