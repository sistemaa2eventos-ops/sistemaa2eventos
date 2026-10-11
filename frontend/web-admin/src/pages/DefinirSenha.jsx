import React, { useEffect, useMemo, useState } from 'react';
import { Box, Typography, TextField, Container, Alert, CircularProgress, InputAdornment, IconButton, Link } from '@mui/material';
import { Lock as LockIcon, Visibility as VisibilityIcon, VisibilityOff as VisibilityOffIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import NeonButton from '../components/common/NeonButton';

const API_URL = import.meta.env.VITE_API_URL || '/api';

/**
 * Tela aberta pelo link do e-mail (convite de operador ou "Esqueci minha senha").
 * O Supabase devolve a pessoa para cá com #access_token=...&type=recovery|invite;
 * a senha é gravada pela API (/auth/definir-senha), que também ativa a conta.
 */
const lerLink = () => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const query = new URLSearchParams(window.location.search);
    return {
        token: hash.get('access_token'),
        tipo: hash.get('type'),
        erro: hash.get('error_description') || query.get('error_description')
    };
};

const DefinirSenha = () => {
    const navigate = useNavigate();
    const link = useMemo(lerLink, []);
    // O token não fica na barra de endereço nem no histórico (depois de lido)
    useEffect(() => {
        if (window.location.hash) window.history.replaceState(null, '', window.location.pathname);
    }, []);
    const [senha, setSenha] = useState('');
    const [confirmar, setConfirmar] = useState('');
    const [mostrar, setMostrar] = useState(false);
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState(link.erro ? 'Link expirado ou já usado. Peça um novo em "Esqueci minha senha".' : null);
    const [pronto, setPronto] = useState(false);

    const senhaCurta = senha !== '' && senha.length < 6;
    const diferentes = confirmar !== '' && confirmar !== senha;
    const valido = senha.length >= 6 && senha === confirmar && !!link.token;

    const salvar = async (e) => {
        e.preventDefault();
        if (!valido) return;
        setErro(null);
        setSalvando(true);
        try {
            // axios direto: sem o token de sessão do painel nem o redirecionamento automático em 401
            await axios.post(`${API_URL}/auth/definir-senha`,
                { nova_senha: senha, confirmar_senha: confirmar },
                { headers: { Authorization: `Bearer ${link.token}` } });
            setPronto(true);
        } catch (err) {
            setErro(err.response?.data?.error || 'Não foi possível definir a senha. Tente novamente.');
        } finally {
            setSalvando(false);
        }
    };

    const campoSenha = (label, valor, setValor, erroCampo, autoComplete) => (
        <TextField
            fullWidth label={label} type={mostrar ? 'text' : 'password'} margin="normal" autoComplete={autoComplete}
            value={valor} onChange={(e) => setValor(e.target.value)} error={!!erroCampo} helperText={erroCampo}
            InputProps={{
                startAdornment: <InputAdornment position="start"><LockIcon sx={{ color: 'rgba(0, 212, 255, 0.4)' }} /></InputAdornment>,
                endAdornment: (
                    <InputAdornment position="end">
                        <IconButton onClick={() => setMostrar(!mostrar)} edge="end">{mostrar ? <VisibilityOffIcon /> : <VisibilityIcon />}</IconButton>
                    </InputAdornment>
                )
            }}
        />
    );

    return (
        <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(circle at center, #0A1628 0%, #050B18 100%)' }}>
            <Container maxWidth="xs">
                <Box sx={{
                    p: { xs: 4, sm: 5 }, textAlign: 'center', borderRadius: '12px',
                    background: 'linear-gradient(135deg, rgba(10,22,40,0.8) 0%, rgba(15,30,55,0.8) 100%)',
                    border: '1px solid rgba(0, 212, 255, 0.2)', boxShadow: '0 24px 80px rgba(0,0,0,0.6), 0 0 40px rgba(0, 212, 255, 0.1)'
                }}>
                    <Typography variant="h5" sx={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700, color: '#FFFFFF', mb: 0.5 }}>
                        {link.tipo === 'invite' ? 'Ativar conta' : 'Definir nova senha'}
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3 }}>NZT Intelligent Control System</Typography>

                    {erro && <Alert severity="error" sx={{ mb: 2, textAlign: 'left' }}>{erro}</Alert>}
                    {!link.token && !link.erro && (
                        <Alert severity="warning" sx={{ mb: 2, textAlign: 'left' }}>
                            Abra esta página pelo link recebido por e-mail.
                        </Alert>
                    )}

                    {pronto ? (
                        <>
                            <Alert severity="success" sx={{ mb: 3, textAlign: 'left' }}>Senha definida. Entre com a nova senha.</Alert>
                            <NeonButton fullWidth size="large" onClick={() => navigate('/login')}>Ir para o login</NeonButton>
                        </>
                    ) : (
                        <form onSubmit={salvar}>
                            {campoSenha('Nova senha', senha, setSenha, senhaCurta ? 'Pelo menos 6 caracteres' : null, 'new-password')}
                            {campoSenha('Confirmar senha', confirmar, setConfirmar, diferentes ? 'As senhas não coincidem' : null, 'new-password')}
                            <Box sx={{ mt: 3 }}>
                                <NeonButton fullWidth size="large" type="submit" disabled={!valido || salvando}>
                                    {salvando ? <><CircularProgress size={20} color="inherit" sx={{ mr: 1.5 }} />Salvando...</> : 'Salvar senha'}
                                </NeonButton>
                            </Box>
                        </form>
                    )}

                    <Box sx={{ mt: 2 }}>
                        <Link component="button" type="button" variant="body2" onClick={() => navigate('/login')}
                            sx={{ color: '#00D4FF', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}>
                            Voltar ao login
                        </Link>
                    </Box>
                </Box>
            </Container>
        </Box>
    );
};

export default DefinirSenha;
