import React, { useState } from 'react';
import {
    Box,
    Typography,
    TextField,
    Container,
    Alert,
    CircularProgress,
    InputAdornment,
    IconButton,
    Checkbox,
    FormControlLabel,
    Link
} from '@mui/material';
import {
    Email as EmailIcon,
    Lock as LockIcon,
    Visibility as VisibilityIcon,
    VisibilityOff as VisibilityOffIcon
} from '@mui/icons-material';
import { useAuth, getDefaultRoute } from '../contexts/AuthContext';
import { authService } from '../services/auth';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { styled } from '@mui/material/styles';
import NeonButton from '../components/common/NeonButton';
import nztEmblem from '../assets/images/nzt-emblem.png';

const LoginContainer = styled(Box)(() => ({
    minHeight: '100dvh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'radial-gradient(circle at center, #0A1628 0%, #050B18 100%)',
    position: 'relative',
    overflow: 'hidden',
    '&::before': {
        content: '""',
        position: 'absolute',
        width: '100%',
        height: '100%',
        backgroundImage: 'linear-gradient(rgba(0, 212, 255, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 212, 255, 0.05) 1px, transparent 1px)',
        backgroundSize: '50px 50px',
        animation: 'scanline 10s linear infinite',
    }
}));

const GlowOrb = styled(Box)(({ color, top, left, size }) => ({
    position: 'absolute',
    top,
    left,
    width: size || 300,
    height: size || 300,
    background: color || '#00D4FF',
    borderRadius: '50%',
    filter: 'blur(100px)',
    opacity: 0.1,
    zIndex: 0,
    animation: 'float 8s ease-in-out infinite',
}));

const GlassBox = styled(Box)(({ theme }) => ({
    position: 'relative',
    zIndex: 1,
    width: '100%',
    maxWidth: 440,
    padding: theme.spacing(5, 4),
    background: 'linear-gradient(180deg, rgba(8, 18, 36, 0.92) 0%, rgba(4, 9, 20, 0.96) 100%)',
    backdropFilter: 'blur(24px)',
    border: '1px solid rgba(0, 212, 255, 0.22)',
    borderRadius: 16,
    boxShadow: '0 24px 80px rgba(0, 0, 0, 0.75), 0 0 45px rgba(0, 212, 255, 0.1)',
    textAlign: 'center',
    animation: 'fadeInUp 0.6s ease-out forwards',
}));

const inputSx = {
    my: 1,
    '& .MuiOutlinedInput-root': {
        backgroundColor: '#060D1A !important',
        borderRadius: 2,
        transition: 'all 0.2s ease',
        overflow: 'hidden',
        '& fieldset': {
            borderColor: 'rgba(0, 212, 255, 0.25)',
        },
        '&:hover fieldset': {
            borderColor: 'rgba(0, 212, 255, 0.5)',
        },
        '&.Mui-focused fieldset': {
            borderColor: '#00D4FF',
            boxShadow: '0 0 16px rgba(0, 212, 255, 0.25)',
        },
        '& .MuiInputAdornment-root': {
            backgroundColor: 'transparent',
            color: '#00D4FF',
        },
        '& input': {
            color: '#FFFFFF',
            fontSize: '0.95rem',
            fontWeight: 500,
            backgroundColor: 'transparent !important',
            borderRadius: '0 !important',
            '&:-webkit-autofill, &:-webkit-autofill:hover, &:-webkit-autofill:focus, &:-webkit-autofill:active': {
                WebkitBoxShadow: '0 0 0 1000px #060D1A inset !important',
                boxShadow: '0 0 0 1000px #060D1A inset !important',
                WebkitTextFillColor: '#FFFFFF !important',
                caretColor: '#00D4FF',
                borderRadius: '0 !important',
                transition: 'background-color 5000s ease-in-out 0s',
            }
        }
    },
    '& .MuiInputLabel-root': {
        color: '#94A3B8',
        fontWeight: 500,
        '&.Mui-focused': {
            color: '#00D4FF',
            fontWeight: 600,
        }
    }
};

const Login = () => {
    const { t } = useTranslation();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [rememberMe, setRememberMe] = useState(false);
    
    const [isForgotMode, setIsForgotMode] = useState(false);
    const [forgotSuccess, setForgotSuccess] = useState('');
    
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const { login } = useAuth();
    const navigate = useNavigate();

    // Frontend Validations
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const isEmailValid = email !== '' && emailRegex.test(email);
    const isPasswordValid = password !== '' && password.length >= 6;
    
    const emailError = email !== '' && !isEmailValid ? 'Formato de email inválido' : null;
    const passwordError = password !== '' && password.length < 6 ? 'A senha deve conter pelo menos 6 caracteres' : null;
    
    const isMainFormValid = Boolean(email && password && isEmailValid && isPasswordValid);
    const isForgotFormValid = Boolean(email && isEmailValid);

    const handleLoginSubmit = async (e) => {
        e.preventDefault();
        if (!isMainFormValid) return;
        
        setError(null);
        setForgotSuccess('');
        setLoading(true);

        try {
            const result = await login(email, password, rememberMe);
            if (result.success) {
                const user = result.user;
                const route = getDefaultRoute(user.nivel_acesso);

                if (user.nivel_acesso !== 'master' && user.nivel_acesso !== 'admin' && user.evento_id) {
                    navigate(`${route}?evento_id=${user.evento_id}`);
                } else {
                    navigate(route);
                }
            } else {
                setError(result.error || 'Falha na autenticação. Verifique suas credenciais.');
            }
        } catch (err) {
            setError('Ocorreu um erro ao tentar fazer login.');
        } finally {
            setLoading(false);
        }
    };

    const handleForgotSubmit = async (e) => {
        e.preventDefault();
        if (!isForgotFormValid) return;
        
        setError(null);
        setForgotSuccess('');
        setLoading(true);
        
        try {
            const r = await authService.forgotPassword(email);
            setForgotSuccess(r?.message || 'Pedido registrado. O administrador foi avisado e vai redefinir sua senha.');
        } catch (err) {
            let errorMsg = "Erro no servidor. Tente novamente em instantes.";
            if (!err.response) errorMsg = "Sem conexão com o servidor.";
            setError(errorMsg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <LoginContainer>
            <GlowOrb top="10%" left="10%" color="rgba(0, 212, 255, 0.2)" size={400} />
            <GlowOrb top="60%" left="70%" color="rgba(123, 47, 190, 0.2)" size={400} />

            <Container maxWidth="xs" sx={{ display: 'flex', justifyContent: 'center' }}>
                <GlassBox>
                    <Box sx={{ mb: 2.5, display: 'flex', justifyContent: 'center' }}>
                        <Box
                            component="img"
                            src={nztEmblem}
                            alt="NZT Intelligent Control Systems"
                            sx={{
                                width: 110,
                                height: 110,
                                objectFit: 'contain',
                                filter: 'drop-shadow(0 0 22px rgba(0, 212, 255, 0.45)) drop-shadow(0 0 45px rgba(0, 212, 255, 0.2))',
                                transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                                '&:hover': {
                                    transform: 'scale(1.05)',
                                    filter: 'drop-shadow(0 0 30px rgba(0, 212, 255, 0.65)) drop-shadow(0 0 60px rgba(0, 212, 255, 0.3))'
                                }
                            }}
                        />
                    </Box>

                    <Typography
                        variant="h4"
                        sx={{
                            fontFamily: '"Space Grotesk", sans-serif',
                            fontWeight: 800,
                            color: '#FFFFFF',
                            letterSpacing: '5px',
                            textShadow: '0 0 20px rgba(0, 212, 255, 0.35)',
                            mb: 0.5
                        }}
                    >
                        NZT
                    </Typography>
                    <Typography
                        variant="caption"
                        sx={{
                            display: 'block',
                            color: '#00D4FF',
                            letterSpacing: '2.5px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            textTransform: 'uppercase',
                            opacity: 0.9,
                            mb: 3.5
                        }}
                    >
                        {isForgotMode ? t('login.recovery_subtitle', { defaultValue: 'Recuperação de acesso' }) : t('login.subtitle', { defaultValue: 'Intelligent Control Systems' })}
                    </Typography>

                    {error && (
                        <Alert
                            severity="error"
                            sx={{
                                mb: 3,
                                borderRadius: 1.5,
                                background: 'rgba(255, 51, 102, 0.1)',
                                border: '1px solid rgba(255, 51, 102, 0.2)',
                                color: '#FF3366'
                            }}
                        >
                            {error}
                        </Alert>
                    )}

                    {forgotSuccess && (
                        <Alert
                            severity="success"
                            sx={{
                                mb: 3,
                                borderRadius: 1.5,
                                background: 'rgba(0, 255, 136, 0.1)',
                                border: '1px solid rgba(0, 255, 136, 0.2)',
                                color: '#00FF88'
                            }}
                        >
                            {forgotSuccess}
                        </Alert>
                    )}

                    {isForgotMode && !forgotSuccess && (
                        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1, textAlign: 'left' }}>
                            {t('login.forgot_notice', { defaultValue: 'A senha dos operadores é redefinida pelo administrador do painel. Informe seu e-mail: ele recebe o pedido e depois te passa a nova senha.' })}
                        </Typography>
                    )}

                    <form onSubmit={isForgotMode ? handleForgotSubmit : handleLoginSubmit}>
                        <TextField
                            fullWidth
                            label={t('login.email', { defaultValue: 'E-mail' })}
                            variant="outlined"
                            autoComplete="username email"
                            value={email}
                            error={!!emailError}
                            helperText={emailError}
                            onChange={(e) => setEmail(e.target.value)}
                            sx={inputSx}
                            InputProps={{
                                startAdornment: (
                                    <InputAdornment position="start">
                                        <EmailIcon sx={{ color: '#00D4FF' }} />
                                    </InputAdornment>
                                ),
                            }}
                        />

                        {!isForgotMode && (
                          <>
                            <TextField
                                fullWidth
                                label={t('login.password', { defaultValue: 'Senha' })}
                                type={showPassword ? 'text' : 'password'}
                                variant="outlined"
                                autoComplete="current-password"
                                value={password}
                                error={!!passwordError}
                                helperText={passwordError}
                                onChange={(e) => setPassword(e.target.value)}
                                sx={inputSx}
                                InputProps={{
                                    startAdornment: (
                                        <InputAdornment position="start">
                                            <LockIcon sx={{ color: '#00D4FF' }} />
                                        </InputAdornment>
                                    ),
                                    endAdornment: (
                                        <InputAdornment position="end">
                                            <IconButton onClick={() => setShowPassword(!showPassword)} edge="end" sx={{ color: '#94A3B8' }}>
                                                {showPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                                            </IconButton>
                                        </InputAdornment>
                                    ),
                                }}
                            />
                            
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1 }}>
                                <FormControlLabel
                                    control={
                                        <Checkbox 
                                            checked={rememberMe} 
                                            onChange={(e) => setRememberMe(e.target.checked)} 
                                            sx={{ color: 'rgba(0, 212, 255, 0.4)', '&.Mui-checked': { color: '#00D4FF' } }}
                                        />
                                    }
                                    label={<Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('login.remember_me', { defaultValue: 'Lembrar de mim' })}</Typography>}
                                />
                            </Box>
                          </>
                        )}

                        <Box sx={{ mt: 3, mb: 1 }}>
                            <NeonButton
                                fullWidth
                                type="submit"
                                disabled={loading || (isForgotMode ? !isForgotFormValid : !isMainFormValid)}
                                size="large"
                            >
                                {loading ? (
                                    <>
                                        <CircularProgress size={20} color="inherit" sx={{ mr: 1.5 }} />
                                        {isForgotMode ? t('login.sending', { defaultValue: 'Enviando...' }) : t('login.signing_in', { defaultValue: 'Entrando...' })}
                                    </>
                                ) : (
                                    isForgotMode ? t('login.request_new_password', { defaultValue: 'Pedir nova senha ao administrador' }) : t('login.sign_in', { defaultValue: 'Entrar' })
                                )}
                            </NeonButton>
                        </Box>
                        
                        <Box sx={{ mt: 2 }}>
                            {isForgotMode ? (
                                <Link 
                                    component="button" 
                                    type="button"
                                    variant="body2" 
                                    onClick={() => { setIsForgotMode(false); setError(null); setForgotSuccess(''); }} 
                                    sx={{ color: '#00D4FF', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
                                >
                                    {t('login.back_to_login', { defaultValue: 'Voltar ao login' })}
                                </Link>
                            ) : (
                                <Link 
                                    component="button" 
                                    type="button"
                                    variant="body2" 
                                    onClick={() => { setIsForgotMode(true); setError(null); setForgotSuccess(''); }} 
                                    sx={{ color: '#00D4FF', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
                                >
                                    {t('login.forgot_password', { defaultValue: 'Esqueci minha senha' })}
                                </Link>
                            )}
                        </Box>

                        <Typography
                            variant="caption"
                            display="block"
                            sx={{ mt: 4, color: '#64748B', fontWeight: 500, letterSpacing: '0.5px' }}
                        >
                            {t('login.footer', { defaultValue: '© 2026 NZT Intelligent Control Systems • Desenvolvido por A2' })}
                        </Typography>
                    </form>
                </GlassBox>
            </Container>
        </LoginContainer>
    );
};

export default Login;