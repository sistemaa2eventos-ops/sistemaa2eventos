import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Box, Chip, GlobalStyles, InputAdornment, Stack, TextField, Typography, Button } from '@mui/material';
import { Search as SearchIcon, Print as PrintIcon } from '@mui/icons-material';
import PageHeader from '../components/common/PageHeader';
import GlassCard from '../components/common/GlassCard';
import { Bloco, lerBlocos, textoDoBloco, ancora } from '../components/ajuda/markdownSimples';
// O mesmo arquivo é o manual do repositório: editar ali muda esta tela no próximo deploy
import manual from '../conteudo/MANUAL_EQUIPAMENTOS.md?raw';

const semAcento = (t) => String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Divide o manual pelas seções "## " (o que vem antes da 1ª é a introdução) */
function secoes(blocos) {
    const lista = [{ titulo: null, blocos: [] }];
    for (const b of blocos) {
        if (b.tipo === 'titulo' && b.nivel === 1) continue; // o título vai no cabeçalho da página
        if (b.tipo === 'titulo' && b.nivel === 2) lista.push({ titulo: b.texto, blocos: [b] });
        else lista[lista.length - 1].blocos.push(b);
    }
    return lista
        .map(s => ({ ...s, blocos: s.blocos.filter((b, i, arr) => !(b.tipo === 'linha' && i === arr.length - 1)) }))
        .filter(s => s.blocos.length);
}

/**
 * Manual de equipamentos dentro do painel: índice, busca e impressão. Aberto a qualquer usuário logado
 * (a equipe de campo usa na montagem do evento).
 */
const ManualEquipamentos = () => {
    const [busca, setBusca] = useState('');
    const blocos = useMemo(() => lerBlocos(manual), []);
    const titulo = blocos.find(b => b.tipo === 'titulo' && b.nivel === 1)?.texto || 'Manual de equipamentos';
    const todas = useMemo(() => secoes(blocos), [blocos]);

    const termo = semAcento(busca.trim());
    // Busca: mostra só as seções com o termo e, dentro delas, os títulos e os blocos que o contêm
    const visiveis = useMemo(() => {
        if (!termo) return todas;
        return todas.map(s => {
            const achados = s.blocos.filter(b => b.tipo === 'titulo' || semAcento(textoDoBloco(b)).includes(termo));
            return achados.some(b => b.tipo !== 'titulo') ? { ...s, blocos: achados } : null;
        }).filter(Boolean);
    }, [todas, termo]);

    // Aberto por um botão "Manual" de outra tela (ex.: #5-cameras): vai direto para a seção
    const { hash } = useLocation();
    useEffect(() => {
        if (!hash) return;
        const t = setTimeout(() => document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView({ block: 'start' }), 100);
        return () => clearTimeout(t);
    }, [hash]);

    const irPara = (texto) => {
        setBusca('');
        setTimeout(() => document.getElementById(ancora(texto))?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    };

    return (
        <Box sx={{ p: { xs: 1.5, sm: 3 }, maxWidth: 1100, mx: 'auto' }}>
            <GlobalStyles styles={{
                '@media print': {
                    'body *': { visibility: 'hidden' },
                    '#manual-impressao, #manual-impressao *': { visibility: 'visible', color: '#000 !important', background: 'transparent !important' },
                    '#manual-impressao': { position: 'absolute', left: 0, top: 0, width: '100%' },
                    '.manual-sem-impressao': { display: 'none !important' }
                }
            }} />

            <Box className="manual-sem-impressao">
                <PageHeader
                    title={titulo}
                    subtitle="Montagem, testes e correções de rede, PC do evento, leitores faciais e câmeras."
                    action={<Button variant="outlined" startIcon={<PrintIcon />} onClick={() => window.print()}>Imprimir</Button>}
                />

                <GlassCard sx={{ p: 2, mb: 2 }}>
                    <TextField size="small" fullWidth placeholder="Buscar no manual (ex.: relógio, Config Online, sub-stream)" value={busca}
                        onChange={e => setBusca(e.target.value)}
                        inputProps={{ 'aria-label': 'Buscar no manual' }}
                        InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }} />
                    <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mt: 1.5 }}>
                        {todas.filter(s => s.titulo).map(s => (
                            <Chip key={s.titulo} size="small" label={s.titulo} onClick={() => irPara(s.titulo)} sx={{ fontSize: '0.75rem' }} />
                        ))}
                    </Stack>
                </GlassCard>
            </Box>

            <GlassCard id="manual-impressao" sx={{ p: { xs: 2, sm: 3 } }}>
                {visiveis.length === 0 && (
                    <Typography variant="body2" sx={{ color: '#94A3B8' }}>Nada encontrado para “{busca}”.</Typography>
                )}
                {visiveis.map((s, i) => (
                    <Box key={s.titulo || `intro-${i}`} component="section">
                        {s.blocos.map((b, j) => <Bloco key={j} bloco={b} />)}
                    </Box>
                ))}
            </GlassCard>
        </Box>
    );
};

export default ManualEquipamentos;
