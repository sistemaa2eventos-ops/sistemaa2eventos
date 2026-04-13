import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
    Box, Typography, TextField, Button, Grid, Paper, 
    CircularProgress, Avatar, Checkbox, FormControlLabel,
    Alert, Stack, Divider, Container
} from '@mui/material';
import { PhotoCamera, CloudUpload, Description as FileIcon } from '@mui/icons-material';
import api from '../services/api';

const PortalCadastro = () => {
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token');
    
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [empresaData, setEmpresaData] = useState(null);

    const [formData, setFormData] = useState({
        nome: '',
        cpf: '',
        data_nascimento: '',
        nome_mae: '',
        telefone: '',
        email: '',
        funcao: '',
        dias_trabalho: ['Integral'],
        aceite_lgpd: true,
        foto_base64: null,
        documentos: []
    });

    const fileInputRef = useRef(null);
    const docFrenteRef = useRef(null);
    const docVersoRef = useRef(null);

    useEffect(() => {
        const fetchInvite = async () => {
            if (!token) {
                setError('Este link expirou ou é inválido. Solicite um novo à empresa.');
                setLoading(false);
                return;
            }
            try {
                const res = await api.get(`/public/portal/invite/${token}`);
                if (res.data && res.data.empresa) {
                    setEmpresaData(res.data.empresa);
                } else {
                    setError('Este link expirou ou é inválido. Solicite um novo à empresa.');
                }
            } catch (err) {
                setError('Este link expirou ou é inválido. Solicite um novo à empresa.');
            } finally {
                setLoading(false);
            }
        };
        fetchInvite();
    }, [token]);

    const handleBase64 = (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result);
            reader.onerror = error => reject(error);
        });
    };

    const handlePhotoUpload = async (e) => {
        const file = e.target.files[0];
        if (file) {
            const b64 = await handleBase64(file);
            setFormData(prev => ({ ...prev, foto_base64: b64 }));
        }
    };

    const handleDocUpload = async (e, type) => {
        const file = e.target.files[0];
        if (file) {
            const b64 = await handleBase64(file);
            setFormData(prev => ({
                ...prev,
                documentos: [
                    ...prev.documentos.filter(d => !d.name.includes(type)),
                    { name: `${type}_${file.name}`, base64: b64 }
                ]
            }));
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        
        if (!formData.nome || !formData.cpf || !formData.data_nascimento || !formData.nome_mae) {
            setError('Por favor, preencha todos os campos obrigatórios marcados com (*).');
            return;
        }

        if (!formData.aceite_lgpd) {
            setError('É necessário aceitar os termos de uso (LGPD).');
            return;
        }

        setSubmitting(true);
        try {
            await api.post('/public/portal/cadastro', {
                token,
                pessoa: formData
            });
            setSuccess('Cadastro enviado com sucesso! Nossa equipe analisará em breve.');
        } catch (err) {
            setError(err.response?.data?.error || 'Ocorreu um erro ao enviar o seu cadastro. Tente novamente.');
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <Box sx={{ minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', bgcolor: '#0A1628' }}>
                <CircularProgress sx={{ color: '#00D4FF' }} />
            </Box>
        );
    }

    if (error && !empresaData) {
        return (
            <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', bgcolor: '#0A1628', p: 3 }}>
                <Paper sx={{ p: 5, borderRadius: 3, maxWidth: 500, textAlign: 'center', bgcolor: 'rgba(10, 22, 40, 0.9)', border: '1px solid rgba(255, 51, 102, 0.3)' }}>
                    <Typography variant="h5" color="#FF3366" sx={{ mb: 2, fontFamily: '"Orbitron", sans-serif', fontWeight: 800 }}>ACESSO NEGADO</Typography>
                    <Typography color="text.secondary">{error}</Typography>
                </Paper>
            </Box>
        );
    }

    if (success) {
        return (
            <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', bgcolor: '#0A1628', p: 3 }}>
                <Paper sx={{ p: 5, borderRadius: 3, maxWidth: 500, textAlign: 'center', bgcolor: 'rgba(10, 22, 40, 0.9)', border: '1px solid rgba(0, 255, 136, 0.3)' }}>
                    <Typography variant="h5" color="#00FF88" sx={{ mb: 2, fontFamily: '"Orbitron", sans-serif', fontWeight: 800 }}>CADASTRO RECEBIDO</Typography>
                    <Typography color="text.secondary">{success}</Typography>
                </Paper>
            </Box>
        );
    }

    return (
        <Box sx={{ minHeight: '100vh', bgcolor: '#050B14', py: 6 }}>
            <Container maxWidth="md">
                <Box sx={{ textAlign: 'center', mb: 5 }}>
                    <Typography variant="h3" sx={{ fontFamily: '"Orbitron", sans-serif', color: '#00D4FF', fontWeight: 800, letterSpacing: '2px', textShadow: '0 0 20px rgba(0,212,255,0.4)' }}>
                        NZT SYSTEM
                    </Typography>
                    <Typography variant="subtitle1" sx={{ color: 'text.secondary', mt: 1 }}>
                        B2B Onboarding Portal
                    </Typography>
                </Box>

                <Paper sx={{ 
                    p: { xs: 3, md: 5 }, 
                    borderRadius: 4, 
                    bgcolor: 'rgba(10, 22, 40, 0.8)', 
                    border: '1px solid rgba(0, 212, 255, 0.1)',
                    backdropFilter: 'blur(10px)'
                }}>
                    <Box sx={{ textAlign: 'center', mb: 4, pb: 3, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <Typography variant="h5" color="#fff" sx={{ fontWeight: 700 }}>{empresaData.eventos?.nome || 'Evento Principal'}</Typography>
                        <Typography color="text.secondary" sx={{ mt: 1 }}>Credenciamento via <strong>{empresaData.nome}</strong></Typography>
                    </Box>

                    {error && (
                        <Alert severity="error" sx={{ mb: 4, bgcolor: 'rgba(255,51,102,0.1)', color: '#FF3366', border: '1px solid rgba(255,51,102,0.3)' }}>
                            {error}
                        </Alert>
                    )}

                    <form onSubmit={handleSubmit}>
                        {/* SEÇÃO 1: FOTO */}
                        <Typography variant="overline" sx={{ color: '#00D4FF', fontWeight: 700, fontSize: '1rem' }}>1. BIOMETRIA FACIAL</Typography>
                        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', my: 3 }}>
                            <Avatar 
                                src={formData.foto_base64} 
                                sx={{ width: 140, height: 140, mb: 3, bgcolor: 'rgba(0,0,0,0.4)', border: '2px solid rgba(0,212,255,0.5)' }} 
                            />
                            <input type="file" accept="image/*" capture="user" style={{ display: 'none' }} ref={fileInputRef} onChange={handlePhotoUpload} />
                            <Button 
                                variant="outlined" 
                                startIcon={<PhotoCamera />} 
                                onClick={() => fileInputRef.current.click()}
                                sx={{ color: '#00D4FF', borderColor: '#00D4FF', '&:hover': { bgcolor: 'rgba(0,212,255,0.1)' } }}
                            >
                                Tirar ou Fazer Upload de Foto
                            </Button>
                            <Typography variant="caption" sx={{ mt: 1, color: 'text.secondary' }}>* Rosto legível sem óculos escuros.</Typography>
                        </Box>
                        
                        <Divider sx={{ my: 4, borderColor: 'rgba(255,255,255,0.05)' }} />

                        {/* SEÇÃO 2: DADOS PESSOAIS */}
                        <Typography variant="overline" sx={{ color: '#00D4FF', fontWeight: 700, fontSize: '1rem', mb: 2, display: 'block' }}>2. DADOS PESSOAIS</Typography>
                        <Grid container spacing={3}>
                            <Grid item xs={12}>(
                                <TextField fullWidth required label="Nome Completo *" value={formData.nome} onChange={e => setFormData({...formData, nome: e.target.value})} />
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField fullWidth required label="CPF *" value={formData.cpf} onChange={e => setFormData({...formData, cpf: e.target.value})} />
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField fullWidth required type="date" label="Data de Nascimento *" InputLabelProps={{ shrink: true }} value={formData.data_nascimento} onChange={e => setFormData({...formData, data_nascimento: e.target.value})} />
                            </Grid>
                            <Grid item xs={12}>
                                <TextField fullWidth required label="Nome da Mãe *" value={formData.nome_mae} onChange={e => setFormData({...formData, nome_mae: e.target.value})} />
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField fullWidth label="Telefone" value={formData.telefone} onChange={e => setFormData({...formData, telefone: e.target.value})} />
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField fullWidth label="E-mail" type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
                            </Grid>
                            <Grid item xs={12}>
                                <TextField fullWidth label="Cargo / Função" value={formData.funcao} onChange={e => setFormData({...formData, funcao: e.target.value})} />
                            </Grid>
                        </Grid>

                        <Divider sx={{ my: 4, borderColor: 'rgba(255,255,255,0.05)' }} />

                        {/* SEÇÃO 3: EVENTO */}
                        <Typography variant="overline" sx={{ color: '#00D4FF', fontWeight: 700, fontSize: '1rem', mb: 2, display: 'block' }}>3. INTEGRAÇÃO</Typography>
                        <Grid container spacing={3}>
                            <Grid item xs={12}>
                                <TextField fullWidth label="Evento de Destino" value={empresaData.eventos?.nome || 'Evento'} disabled />
                            </Grid>
                            <Grid item xs={12}>
                                <TextField fullWidth label="Empreiteira/Empresa Solicitante" value={empresaData.nome} disabled />
                            </Grid>
                            <Grid item xs={12}>
                                <FormControlLabel 
                                    control={<Checkbox checked={true} disabled sx={{ color: '#00D4FF' }} />} 
                                    label="Desejo acesso irrestrito conforme datas do evento programadas." 
                                />
                            </Grid>
                        </Grid>

                        <Divider sx={{ my: 4, borderColor: 'rgba(255,255,255,0.05)' }} />

                        {/* SEÇÃO 4: DOCUMENTOS */}
                        <Typography variant="overline" sx={{ color: '#00D4FF', fontWeight: 700, fontSize: '1rem', mb: 2, display: 'block' }}>4. AUDITORIA DOCUMENTAL</Typography>
                        <Grid container spacing={3}>
                            <Grid item xs={12} sm={6} textAlign="center">
                                <input type="file" accept="image/*,.pdf" style={{ display: 'none' }} ref={docFrenteRef} onChange={e => handleDocUpload(e, 'frente')} />
                                <Button fullWidth variant="outlined" startIcon={<CloudUpload />} sx={{ height: 100, borderColor: 'rgba(255,255,255,0.1)', color: '#fff' }} onClick={() => docFrenteRef.current.click()}>
                                    {formData.documentos.find(d => d.name.includes('frente')) ? 'Documento Frente Anexado' : 'Enviar RG/CNH (Frente)'}
                                </Button>
                            </Grid>
                            <Grid item xs={12} sm={6} textAlign="center">
                                <input type="file" accept="image/*,.pdf" style={{ display: 'none' }} ref={docVersoRef} onChange={e => handleDocUpload(e, 'verso')} />
                                <Button fullWidth variant="outlined" startIcon={<CloudUpload />} sx={{ height: 100, borderColor: 'rgba(255,255,255,0.1)', color: '#fff' }} onClick={() => docVersoRef.current.click()}>
                                    {formData.documentos.find(d => d.name.includes('verso')) ? 'Documento Verso Anexado' : 'Enviar RG/CNH (Verso)'}
                                </Button>
                            </Grid>
                        </Grid>

                        <Box sx={{ mt: 5 }}>
                            <Button 
                                fullWidth 
                                type="submit" 
                                variant="contained" 
                                disabled={submitting}
                                sx={{ 
                                    py: 2, 
                                    bgcolor: '#00D4FF', 
                                    color: '#000', 
                                    fontWeight: 800,
                                    fontSize: '1.1rem',
                                    '&:hover': { bgcolor: '#00a3cc' }
                                }}
                            >
                                {submitting ? <CircularProgress size={24} sx={{ color: '#000' }} /> : 'ENVIAR CADASTRO PARA ANÁLISE'}
                            </Button>
                        </Box>
                    </form>
                </Paper>
            </Container>
        </Box>
    );
};

export default PortalCadastro;
