import React from 'react';
import { Box, Button, Stack, Tab, Tabs, Typography } from '@mui/material';
import { Logout as SairIcon } from '@mui/icons-material';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useSessao } from './contexts/SessaoContext';
import Login from './pages/Login';
import VisaoGeral from './pages/VisaoGeral';
import Participantes from './pages/Participantes';
import DocumentosEmpresa from './pages/DocumentosEmpresa';
import DadosEmpresa from './pages/DadosEmpresa';
import Solicitacoes from './pages/Solicitacoes';
import { botaoSecundario, cores, fontes } from './styles/tokens';

const ABAS = [
    { caminho: '/', rotulo: 'Visão geral' },
    { caminho: '/participantes', rotulo: 'Participantes' },
    { caminho: '/documentos', rotulo: 'Documentos da empresa' },
    { caminho: '/empresa', rotulo: 'Dados da empresa' },
    { caminho: '/solicitacoes', rotulo: 'Solicitações' }
];

/** Moldura do portal: empresa e evento no topo, abas e a página escolhida. */
const Portal = () => {
    const { sessao, sair } = useSessao();
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const abaAtual = ABAS.find(a => a.caminho !== '/' && pathname.startsWith(a.caminho))?.caminho || '/';

    return (
        <Box sx={{ minHeight: '100dvh', bgcolor: cores.fundo }}>
            <Box component="header" sx={{ borderBottom: `1px solid ${cores.borda}`, bgcolor: cores.superficie, px: { xs: 2, md: 4 }, pt: 2 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={2}>
                    <Box sx={{ minWidth: 0 }}>
                        <Typography variant="caption" sx={{ color: cores.primaria, fontWeight: 700, letterSpacing: 1 }}>PORTAL DA EMPRESA · NZT</Typography>
                        <Typography noWrap sx={{ fontFamily: fontes.titulo, fontWeight: 700, fontSize: { xs: '1.1rem', md: '1.35rem' }, color: cores.textoForte }}>
                            {sessao.empresa?.nome}
                        </Typography>
                        <Typography variant="caption" sx={{ color: cores.textoSecundario }}>{sessao.evento?.nome}</Typography>
                    </Box>
                    <Button variant="outlined" startIcon={<SairIcon />} onClick={sair} sx={{ ...botaoSecundario, flexShrink: 0 }}>Sair</Button>
                </Stack>
                <Tabs value={abaAtual} onChange={(e, v) => navigate(v)} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile sx={{ mt: 1.5 }}>
                    {ABAS.map(a => <Tab key={a.caminho} value={a.caminho} label={a.rotulo} />)}
                </Tabs>
            </Box>
            <Box component="main" sx={{ p: { xs: 2, md: 4 }, maxWidth: 1400, mx: 'auto' }}>
                <Routes>
                    <Route path="/" element={<VisaoGeral />} />
                    <Route path="/participantes" element={<Participantes />} />
                    <Route path="/documentos" element={<DocumentosEmpresa />} />
                    <Route path="/empresa" element={<DadosEmpresa />} />
                    <Route path="/solicitacoes" element={<Solicitacoes />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
            </Box>
        </Box>
    );
};

const App = () => {
    const { sessao } = useSessao();
    return sessao?.token ? <Portal /> : <Login />;
};

export default App;
