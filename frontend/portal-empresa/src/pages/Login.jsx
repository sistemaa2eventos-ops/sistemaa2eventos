import React, { useState } from 'react';
import { Alert, Box, Stack, TextField, Typography } from '@mui/material';
import { useSessao } from '../contexts/SessaoContext';
import { erroDe } from '../services/api';
import GlassCard from '../components/common/GlassCard';
import NeonButton from '../components/common/NeonButton';
import { cores, fontes } from '../styles/tokens';

/** Entrada do responsável: e-mail cadastrado na empresa + chave de acesso enviada pela organização. */
const Login = () => {
    const { entrar, avisoSaida } = useSessao();
    const [email, setEmail] = useState('');
    const [chave, setChave] = useState('');
    const [erro, setErro] = useState('');
    const [entrando, setEntrando] = useState(false);

    const enviar = async (e) => {
        e.preventDefault();
        setErro('');
        setEntrando(true);
        try {
            await entrar(email.trim(), chave.trim());
        } catch (err) {
            setErro(erroDe(err, 'Não foi possível entrar. Tente de novo.'));
        } finally {
            setEntrando(false);
        }
    };

    return (
        <Box sx={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2, bgcolor: cores.fundo }}>
            <GlassCard sx={{ width: '100%', maxWidth: 420, p: { xs: 3, sm: 4 } }}>
                <Box component="form" onSubmit={enviar} noValidate>
                    <Typography variant="caption" sx={{ color: cores.primaria, fontWeight: 700, letterSpacing: 1 }}>NZT INTELLIGENT CONTROL SYSTEM</Typography>
                    <Typography component="h1" sx={{ fontFamily: fontes.titulo, fontWeight: 700, fontSize: '1.6rem', color: cores.textoForte, mt: 0.5 }}>
                        Portal da empresa
                    </Typography>
                    <Typography variant="body2" sx={{ color: cores.textoSecundario, mt: 0.5, mb: 3 }}>
                        Documentos, equipe e acompanhamento do credenciamento da sua empresa no evento.
                    </Typography>

                    <Stack spacing={2}>
                        {avisoSaida && !erro && <Alert severity="info">{avisoSaida}</Alert>}
                        {erro && <Alert severity="error">{erro}</Alert>}
                        <TextField label="E-mail do responsável" type="email" autoComplete="username" value={email}
                            onChange={(e) => setEmail(e.target.value)} fullWidth required autoFocus />
                        <TextField label="Chave de acesso" autoComplete="current-password" value={chave} placeholder="XXXX-XXXX-XXXX"
                            onChange={(e) => setChave(e.target.value.toUpperCase())} fullWidth required
                            inputProps={{ style: { fontFamily: 'monospace', letterSpacing: 2 } }} />
                        <NeonButton type="submit" loading={entrando} disabled={!email.trim() || !chave.trim()} fullWidth>Entrar</NeonButton>
                    </Stack>

                    <Typography variant="caption" component="p" sx={{ color: cores.textoSecundario, mt: 3 }}>
                        O e-mail é o do responsável cadastrado pela organização do evento. A chave de acesso chega junto com o convite da empresa.
                        Perdeu a chave? Peça uma nova à organização: a antiga deixa de funcionar.
                    </Typography>
                </Box>
            </GlassCard>
        </Box>
    );
};

export default Login;
