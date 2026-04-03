import React, { useState } from 'react';
import {
    Box,
    Typography,
    TextField,
    Button,
    Container,
    Alert,
    CircularProgress,
    InputAdornment,
    IconButton,
} from '@mui/material';
import {
    Email as EmailIcon,
    Lock as LockIcon,
    Visibility as VisibilityIcon,
    VisibilityOff as VisibilityOffIcon,
    Security as SecurityIcon,
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
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
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        try {
            const result = await login(email, password);
            if (result.success) {
                const user = result.user;
                // Se não for admin e tiver evento vinculado, vai direto pro dashboard do evento
                if (user.nivel_acesso !== 'admin' && user.evento_id) {
                    navigate(`/dashboard?evento_id=${user.evento_id}`);
                } else {
                    navigate('/');
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
                        NZT
                    </Typography>
                    <Typography
                        variant="body2"
                        sx={{ color: 'text.secondary', mb: 4, letterSpacing: '2px', textTransform: 'uppercase', fontSize: '0.70rem', fontWeight: 600 }}
                    >
                        Intelligent access systems
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

                    <form onSubmit={handleSubmit}>
                        <TextField
                            fullWidth
                            label="Email de Acesso"
                            variant="outlined"
                            margin="normal"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            InputProps={{
                                startAdornment: (
                                    <InputAdornment position="start">
                                        <EmailIcon sx={{ color: 'rgba(0, 212, 255, 0.4)' }} />
                                    </InputAdornment>
                                ),
                            }}
                        />
                        <TextField
                            fullWidth
                            label="Senha"
                            type={showPassword ? 'text' : 'password'}
                            variant="outlined"
                            margin="normal"
                            value={password}
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

                        <Box sx={{ mt: 4 }}>
                            <NeonButton
                                fullWidth
                                type="submit"
                                disabled={loading}
                                size="large"
                            >
                                {loading ? <CircularProgress size={24} color="inherit" /> : 'AUTENTICAR'}
                            </NeonButton>
                        </Box>

                        <Typography
                            variant="caption"
                            display="block"
                            sx={{ mt: 4, color: 'text.secondary', opacity: 0.6 }}
                        >
                            &copy; 2026 NZT &bull; Todos os direitos reservados
                        </Typography>
                    </form>
                </GlassBox>
            </Container>
        </LoginContainer>
    );
};

export default Login;