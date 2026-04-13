import { createTheme } from '@mui/material/styles';

const theme = createTheme({
    palette: {
        mode: 'dark',
        primary: {
            main: '#00D4FF',
            light: '#66E5FF',
            dark: '#0099BB',
            contrastText: '#000000',
        },
        secondary: {
            main: '#7B2FBE',
            light: '#A855F7',
            dark: '#5B1F8E',
            contrastText: '#FFFFFF',
        },
        success: {
            main: '#00FF88',
            light: '#66FFB2',
            dark: '#00BB66',
        },
        warning: {
            main: '#FFB800',
            light: '#FFD166',
            dark: '#CC9200',
        },
        error: {
            main: '#FF3366',
            light: '#FF6699',
            dark: '#CC0044',
        },
        info: {
            main: '#00D4FF',
        },
        background: {
            default: '#050B18',
            paper: '#0A1628',
        },
        text: {
            primary: '#E8F4FD',
            secondary: '#7BA7C4',
        },
    },
    typography: {
        fontFamily: '"Space Grotesk", "Inter", "Roboto", sans-serif',
        h1: { fontSize: '2.5rem', fontWeight: 700, letterSpacing: '-0.02em' },
        h2: { fontSize: '2rem', fontWeight: 700, letterSpacing: '-0.01em' },
        h3: { fontSize: '1.75rem', fontWeight: 600 },
        h4: { fontSize: '1.5rem', fontWeight: 600 },
        h5: { fontSize: '1.25rem', fontWeight: 600 },
        h6: { fontSize: '1rem', fontWeight: 600 },
        button: { textTransform: 'none', fontWeight: 600, letterSpacing: '0.02em' },
        caption: { letterSpacing: '0.08em' },
    },
    shape: {
        borderRadius: 12,
    },
    components: {
        MuiCssBaseline: {
            styleOverrides: {
                body: {
                    background: 'linear-gradient(135deg, #050B18 0%, #0A1628 50%, #050B18 100%)',
                    minHeight: '100vh',
                },
                '::-webkit-scrollbar': { width: '6px', height: '6px' },
                '::-webkit-scrollbar-track': { background: '#0A1628' },
                '::-webkit-scrollbar-thumb': {
                    background: 'linear-gradient(180deg, #00D4FF, #7B2FBE)',
                    borderRadius: '3px',
                },
            },
        },
        MuiDrawer: {
            styleOverrides: {
                paper: {
                    background: 'linear-gradient(180deg, #050B18 0%, #0A1628 100%)',
                    borderRight: '1px solid rgba(0, 212, 255, 0.15)',
                    backdropFilter: 'blur(20px)',
                },
            },
        },
        MuiCard: {
            styleOverrides: {
                root: {
                    background: 'linear-gradient(135deg, rgba(10,22,40,0.9) 0%, rgba(15,30,55,0.9) 100%)',
                    backdropFilter: 'blur(20px)',
                    border: '1px solid rgba(0, 212, 255, 0.12)',
                    borderRadius: 16,
                    boxShadow: '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)',
                    transition: 'all 0.3s ease',
                    '&:hover': {
                        border: '1px solid rgba(0, 212, 255, 0.3)',
                        boxShadow: '0 12px 40px rgba(0,212,255,0.1), inset 0 1px 0 rgba(255,255,255,0.08)',
                        transform: 'translateY(-2px)',
                    },
                },
            },
        },
        MuiPaper: {
            styleOverrides: {
                root: {
                    background: 'linear-gradient(135deg, rgba(10,22,40,0.95) 0%, rgba(15,30,55,0.95) 100%)',
                    backdropFilter: 'blur(20px)',
                    border: '1px solid rgba(0, 212, 255, 0.1)',
                    borderRadius: 16,
                },
            },
        },
        MuiButton: {
            styleOverrides: {
                root: {
                    borderRadius: 10,
                    padding: '10px 24px',
                    fontWeight: 600,
                    transition: 'all 0.3s ease',
                },
                containedPrimary: {
                    background: 'linear-gradient(135deg, #00D4FF 0%, #0099BB 100%)',
                    boxShadow: '0 4px 20px rgba(0, 212, 255, 0.3)',
                    color: '#000',
                    '&:hover': {
                        background: 'linear-gradient(135deg, #33DDFF 0%, #00AACC 100%)',
                        boxShadow: '0 6px 28px rgba(0, 212, 255, 0.5)',
                        transform: 'translateY(-1px)',
                    },
                },
                containedSecondary: {
                    background: 'linear-gradient(135deg, #7B2FBE 0%, #5B1F8E 100%)',
                    boxShadow: '0 4px 20px rgba(123, 47, 190, 0.3)',
                    '&:hover': {
                        background: 'linear-gradient(135deg, #9B4FDE 0%, #7B2FBE 100%)',
                        boxShadow: '0 6px 28px rgba(123, 47, 190, 0.5)',
                        transform: 'translateY(-1px)',
                    },
                },
                outlined: {
                    borderColor: 'rgba(0, 212, 255, 0.4)',
                    color: '#00D4FF',
                    '&:hover': {
                        borderColor: '#00D4FF',
                        background: 'rgba(0, 212, 255, 0.08)',
                        boxShadow: '0 0 20px rgba(0, 212, 255, 0.2)',
                    },
                },
            },
        },
        MuiTextField: {
            styleOverrides: {
                root: {
                    '& .MuiOutlinedInput-root': {
                        background: 'rgba(0, 212, 255, 0.03)',
                        borderRadius: 10,
                        '& fieldset': {
                            borderColor: 'rgba(0, 212, 255, 0.2)',
                        },
                        '&:hover fieldset': {
                            borderColor: 'rgba(0, 212, 255, 0.4)',
                        },
                        '&.Mui-focused fieldset': {
                            borderColor: '#00D4FF',
                            boxShadow: '0 0 0 3px rgba(0, 212, 255, 0.1)',
                        },
                    },
                    '& .MuiInputLabel-root.Mui-focused': {
                        color: '#00D4FF',
                    },
                },
            },
        },
        MuiTableCell: {
            styleOverrides: {
                head: {
                    background: 'rgba(0, 212, 255, 0.05)',
                    color: '#00D4FF',
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    fontSize: '0.75rem',
                    textTransform: 'uppercase',
                    borderBottom: '1px solid rgba(0, 212, 255, 0.2)',
                },
                body: {
                    color: '#E8F4FD',
                    borderBottom: '1px solid rgba(0, 212, 255, 0.05)',
                },
            },
        },
        MuiChip: {
            styleOverrides: {
                root: {
                    borderRadius: 8,
                    fontWeight: 600,
                    fontSize: '0.75rem',
                },
            },
        },
        MuiDialog: {
            styleOverrides: {
                paper: {
                    background: 'linear-gradient(135deg, #0A1628 0%, #0F1E37 100%)',
                    border: '1px solid rgba(0, 212, 255, 0.2)',
                    boxShadow: '0 24px 80px rgba(0,0,0,0.6), 0 0 60px rgba(0,212,255,0.1)',
                },
            },
        },
        MuiListItemButton: {
            styleOverrides: {
                root: {
                    borderRadius: 10,
                    marginBottom: 4,
                    transition: 'all 0.2s ease',
                    '&:hover': {
                        background: 'rgba(0, 212, 255, 0.08)',
                        boxShadow: 'inset 3px 0 0 #00D4FF',
                    },
                    '&.Mui-selected': {
                        background: 'linear-gradient(90deg, rgba(0,212,255,0.15) 0%, rgba(0,212,255,0.05) 100%)',
                        boxShadow: 'inset 3px 0 0 #00D4FF',
                        '&:hover': {
                            background: 'linear-gradient(90deg, rgba(0,212,255,0.2) 0%, rgba(0,212,255,0.08) 100%)',
                        },
                    },
                },
            },
        },
    },
});

export default theme;