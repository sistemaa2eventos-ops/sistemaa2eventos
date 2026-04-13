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
    VisibilityOff as VisibilityOffIcon,
    Security as SecurityIcon,
} from '@mui/icons-material';
import { useAuth, getDefaultRoute } from '../contexts/AuthContext';
import { authService } from '../services/auth';
import { useNavigate } from 'react-router-dom';
import { styled } from '@mui/material/styles';
import NeonButton from '../components/common/NeonButton';

const LoginContainer = styled(Box)(({ theme }) => ({
    minHeight: '100vh',
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

const GlowOrb = styled(Box)(({ theme, color, top, left, size }) => ({
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
    maxWidth: 450,
    padding: theme.spacing(6, 4),
    background: 'linear-gradient(135deg, rgba(10,22,40,0.8) 0%, rgba(15,30,55,0.8) 100%)',
    backdropFilter: 'blur(20px)',
    border: '1px solid rgba(0, 212, 255, 0.2)',
    borderRadius: 24,
    boxShadow: '0 24px 80px rgba(0,0,0,0.6), 0 0 40px rgba(0, 212, 255, 0.1)',
    textAlign: 'center',
    animation: 'fadeInUp 0.6s ease-out forwards',
}));

const LogoIcon = styled(SecurityIcon)(({ theme }) => ({
    fontSize: 64,
    color: '#00D4FF',
    marginBottom: theme.spacing(2),
    filter: 'drop-shadow(0 0 15px rgba(0, 212, 255, 0.8))',
    animation: 'neonPulse 2s infinite',
}));

const Login = () => {
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
            setError(result.error);
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
            await authService.forgotPassword(email);
            setForgotSuccess('Se este email estiver cadastrado, você receberá um link em instantes.');
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
                    <Box sx={{ mb: 2 }}>
                        <img src="/assets/nzt-logo.jpg" alt="NZT Logo" style={{ width: '100px', height: '100px', objectFit: 'cover', borderRadius: '16px', border: '1px solid rgba(0, 212, 255, 0.4)', boxShadow: '0 0 25px rgba(0, 212, 255, 0.4)' }} />
                    </Box>

                    <Typography
                        variant="h4"
                        sx={{
                            fontFamily: '"Orbitron", sans-serif',
                            fontWeight: 900,
                            color: '#fff',
                            letterSpacing: '2px',
                            mb: 1
                        }}
                    >
                        A2 Eventos / NZT
                    </Typography>
                    <Typography
                        variant="body2"
                        sx={{ color: 'text.secondary', mb: 4, letterSpacing: '2px', textTransform: 'uppercase', fontSize: '0.70rem', fontWeight: 600 }}
                    >
                        {isForgotMode ? 'Recuperação de Acesso' : 'Intelligent Control Systems'}
                    </Typography>

                    {error && (
                        <Alert
                            severity="error"
                            sx={{
                                mb: 3,
                                borderRadius: 2,
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
                                borderRadius: 2,
                                background: 'rgba(0, 255, 136, 0.1)',
                                border: '1px solid rgba(0, 255, 136, 0.2)',
                                color: '#00FF88'
                            }}
                        >
                            {forgotSuccess}
                        </Alert>
                    )}

                    <form onSubmit={isForgotMode ? handleForgotSubmit : handleLoginSubmit}>
                        <TextField
                            fullWidth
                            label="Email de Acesso"
                            variant="outlined"
                            margin="normal"
                            autoComplete="username email"
                            value={email}
                            error={!!emailError}
                            helperText={emailError}
                            onChange={(e) => setEmail(e.target.value)}
                            InputProps={{
                                startAdornment: (
                                    <InputAdornment position="start">
                                        <EmailIcon sx={{ color: 'rgba(0, 212, 255, 0.4)' }} />
                                    </InputAdornment>
                                ),
                            }}
                        />

                        {!isForgotMode && (
                          <>
                            <TextField
                                fullWidth
                                label="Senha"
                                type={showPassword ? 'text' : 'password'}
                                variant="outlined"
                                margin="normal"
                                autoComplete="current-password"
                                value={password}
                                error={!!passwordError}
                                helperText={passwordError}
                                onChange={(e) => setPassword(e.target.value)}
                                InputProps={{
                                    startAdornment: (
                                        <InputAdornment position="start">
                                            <LockIcon sx={{ color: 'rgba(0, 212, 255, 0.4)' }} />
                                        </InputAdornment>
                                    ),
                                    endAdornment: (
                                        <InputAdornment position="end">
                                            <IconButton onClick={() => setShowPassword(!showPassword)} edge="end">
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
                                    label={<Typography variant="body2" sx={{ color: 'text.secondary' }}>Lembrar de mim</Typography>}
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
                                        {isForgotMode ? 'ENVIANDO...' : 'ENTRANDO...'}
                                    </>
                                ) : (
                                    isForgotMode ? 'ENVIAR LINK DE RECUPERAÇÃO' : 'AUTENTICAR'
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
                                    Voltar ao login
                                </Link>
                            ) : (
                                <Link 
                                    component="button" 
                                    type="button"
                                    variant="body2" 
                                    onClick={() => { setIsForgotMode(true); setError(null); setForgotSuccess(''); }} 
                                    sx={{ color: '#00D4FF', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
                                >
                                    Esqueci minha senha
                                </Link>
                            )}
                        </Box>

                        <Typography
                            variant="caption"
                            display="block"
                            sx={{ mt: 4, color: 'text.secondary', opacity: 0.6 }}
                        >
                            &copy; 2026 A2 Eventos &bull; Todos os direitos reservados
                        </Typography>
                    </form>
                </GlassBox>
            </Container>
        </LoginContainer>
    );
};

export default Login;