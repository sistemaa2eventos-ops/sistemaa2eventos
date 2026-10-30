import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
    Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography, Box, Fab, Tooltip,
    IconButton, useMediaQuery, useTheme, Link
} from '@mui/material';
import {
    HelpOutline as AjudaIcon, Close as FecharIcon, CheckCircleOutline as PassoIcon,
    WarningAmber as AtencaoIcon, LightbulbOutlined as DicaIcon
} from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';
import { cores } from '../../styles/tokens';
import { ajudaDaRota } from './conteudoAjuda';

// Preferências por usuário neste navegador (conveniência: sem armazenamento a ajuda só abre de novo)
const ler = (chave) => { try { return localStorage.getItem(chave); } catch { return null; } };
const gravar = (chave, valor) => { try { localStorage.setItem(chave, valor); } catch { /* modo privado */ } };
const apagarPrefixo = (prefixo) => {
    try { Object.keys(localStorage).filter(k => k.startsWith(prefixo)).forEach(k => localStorage.removeItem(k)); } catch { /* sem armazenamento */ }
};

const Bloco = ({ icone: Icone, cor, titulo, itens, numerado }) => (
    itens?.length ? (
        <Box sx={{ mt: 2.5 }}>
            <Typography variant="subtitle2" sx={{ display: 'flex', alignItems: 'center', gap: 1, color: cores.textoForte, fontWeight: 700, mb: 1 }}>
                <Icone sx={{ fontSize: 18, color: cor }} aria-hidden="true" /> {titulo}
            </Typography>
            <Box component={numerado ? 'ol' : 'ul'} sx={{ m: 0, pl: 3, display: 'grid', gap: 0.75 }}>
                {itens.map((t) => (
                    <Typography component="li" variant="body2" key={t} sx={{ color: cores.textoSecundario, display: 'list-item', lineHeight: 1.55 }}>{t}</Typography>
                ))}
            </Box>
        </Box>
    ) : null
);

/**
 * Ajuda da tela atual: abre sozinha na primeira visita de cada tela e pelo botão "?" a qualquer
 * momento. O conteúdo de cada tela fica em conteudoAjuda.js.
 */
const AjudaContextual = () => {
    const { pathname } = useLocation();
    const { user } = useAuth();
    const theme = useTheme();
    const telaPequena = useMediaQuery(theme.breakpoints.down('sm'));
    const ajuda = useMemo(() => ajudaDaRota(pathname), [pathname]);
    const [aberta, setAberta] = useState(false);

    const prefixo = `nzt_ajuda_vista:${user?.id || 'anon'}:`;
    const chaveTela = ajuda ? `${prefixo}${ajuda.chave}` : null;

    useEffect(() => {
        setAberta(false);
        if (!ajuda || !user || ler(chaveTela)) return undefined;
        // espera a tela montar para o modal não aparecer sobre a carga
        const t = setTimeout(() => setAberta(true), 700);
        return () => clearTimeout(t);
    }, [ajuda, user, chaveTela]);

    const fechar = () => {
        if (chaveTela) gravar(chaveTela, new Date().toISOString());
        setAberta(false);
    };

    const religarTodas = () => {
        apagarPrefixo(prefixo);
        setAberta(false);
    };

    if (!ajuda) return null;

    return (
        <>
            <Box className="app-ajuda" sx={{ position: 'fixed', right: { xs: 14, sm: 22 }, bottom: { xs: 14, sm: 22 }, zIndex: (t) => t.zIndex.speedDial }}>
                <Tooltip title={`Ajuda: ${ajuda.titulo}`} placement="left">
                    <Fab size="medium" color="primary" onClick={() => setAberta(true)} aria-label={`Abrir ajuda da tela ${ajuda.titulo}`}>
                        <AjudaIcon />
                    </Fab>
                </Tooltip>
            </Box>

            <Dialog open={aberta} onClose={fechar} fullScreen={telaPequena} maxWidth="sm" fullWidth aria-labelledby="ajuda-titulo">
                <DialogTitle id="ajuda-titulo" sx={{ pr: 6 }}>
                    <Typography component="span" variant="overline" sx={{ color: cores.primaria, display: 'block', lineHeight: 1.4 }}>Como usar esta tela</Typography>
                    <Typography component="span" variant="h6" sx={{ fontWeight: 700, color: cores.textoForte }}>{ajuda.titulo}</Typography>
                    <IconButton onClick={fechar} aria-label="Fechar ajuda" sx={{ position: 'absolute', right: 10, top: 10 }}>
                        <FecharIcon />
                    </IconButton>
                </DialogTitle>
                <DialogContent dividers>
                    <Typography variant="body2" sx={{ color: cores.textoForte, lineHeight: 1.6 }}>{ajuda.objetivo}</Typography>
                    <Bloco icone={PassoIcon} cor={cores.sucesso} titulo={ajuda.tituloPassos || 'Passo a passo'} itens={ajuda.passos} numerado />
                    <Bloco icone={AtencaoIcon} cor={cores.alerta} titulo="Atenção" itens={ajuda.atencao} />
                    <Bloco icone={DicaIcon} cor={cores.primaria} titulo="Dicas" itens={ajuda.dicas} />
                </DialogContent>
                <DialogActions sx={{ px: 3, py: 1.5, justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
                    <Link component="button" type="button" variant="caption" onClick={religarTodas} sx={{ color: cores.textoSecundario }}>
                        Abrir a ajuda sozinha de novo em todas as telas
                    </Link>
                    <Button variant="contained" onClick={fechar}>Entendi</Button>
                </DialogActions>
            </Dialog>
        </>
    );
};

export default AjudaContextual;
