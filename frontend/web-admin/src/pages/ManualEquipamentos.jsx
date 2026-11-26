import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
    Box, Chip, GlobalStyles, InputAdornment, Stack, TextField,
    Typography, Button, Grid, IconButton, Tooltip
} from '@mui/material';
import {
    Search as SearchIcon,
    Print as PrintIcon,
    MenuBook as ManualIcon,
    Devices as DevicesIcon,
    Videocam as CameraIcon,
    Face as FaceIcon,
    Clear as ClearIcon,
    Build as ToolsIcon
} from '@mui/icons-material';
import PageHeader from '../components/common/PageHeader';
import GlassCard from '../components/common/GlassCard';
import KpiCard from '../components/common/KpiCard';
import { Bloco, lerBlocos, textoDoBloco, ancora } from '../components/ajuda/markdownSimples';
import { botaoSecundario, cores, fontes, tamanhos, tom, raios } from '../styles/tokens';
// O mesmo arquivo é o manual do repositório: editar ali muda esta tela no próximo deploy
import manual from '../conteudo/MANUAL_EQUIPAMENTOS.md?raw';

const semAcento = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

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
 * Manual de equipamentos dentro do painel: índice, busca e impressão.
 * Aberto a qualquer usuário logado (a equipe de campo usa na montagem do evento).
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
        const t = setTimeout(() => {
            const el = document.getElementById(decodeURIComponent(hash.slice(1)));
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 150);
        return () => clearTimeout(t);
    }, [hash]);

    const irPara = (texto) => {
        setBusca('');
        setTimeout(() => {
            const el = document.getElementById(ancora(texto));
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 50);
    };

    const totalTopicos = todas.filter(s => s.titulo).length;

    return (
        <Box sx={{ p: { xs: 2, sm: 3, md: 4 }, maxWidth: 1600, mx: 'auto', width: '100%' }}>
            <GlobalStyles styles={{
                '@media print': {
                    'body *': { visibility: 'hidden' },
                    '#manual-impressao, #manual-impressao *': {
                        visibility: 'visible',
                        color: '#000 !important',
                        background: 'transparent !important'
                    },
                    '#manual-impressao': {
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        width: '100%',
                        border: 'none !important',
                        boxShadow: 'none !important'
                    },
                    '.manual-sem-impressao': { display: 'none !important' }
                }
            }} />

            <Box className="manual-sem-impressao">
                <PageHeader
                    title={titulo}
                    subtitle="Guia prático de montagem, testes de bancada e resolução de problemas em campo."
                    action={
                        <Button
                            variant="outlined"
                            startIcon={<PrintIcon />}
                            onClick={() => window.print()}
                            sx={{ ...botaoSecundario, width: { xs: '100%', sm: 'auto' } }}
                        >
                            Imprimir Manual (A4)
                        </Button>
                    }
                />

                {/* Métricas do Manual */}
                <Grid container spacing={2} sx={{ mb: 3 }}>
                    <Grid item xs={12} sm={6} lg={3}>
                        <KpiCard
                            titulo="Seções Técnicas"
                            valor={totalTopicos}
                            icone={<ManualIcon />}
                            cor={cores.primaria}
                            rodape="Capítulos disponíveis no manual"
                        />
                    </Grid>
                    <Grid item xs={12} sm={6} lg={3}>
                        <KpiCard
                            titulo="Equipamentos Cobertos"
                            valor="CFTV & IA"
                            valorCompacto
                            icone={<CameraIcon />}
                            cor={cores.secundariaClara}
                            rodape="Câmeras IP, NVRs e Catracas"
                        />
                    </Grid>
                    <Grid item xs={12} sm={6} lg={3}>
                        <KpiCard
                            titulo="Leitores e Terminais"
                            valor="Facial & QR"
                            valorCompacto
                            icone={<FaceIcon />}
                            cor={cores.sucesso}
                            rodape="Terminais Intelbras, Hikvision e Webcams"
                        />
                    </Grid>
                    <Grid item xs={12} sm={6} lg={3}>
                        <KpiCard
                            titulo="Modo de Operação"
                            valor={busca ? 'Filtrado' : 'Completo'}
                            valorCompacto
                            icone={<ToolsIcon />}
                            cor={busca ? cores.alerta : cores.textoSecundario}
                            rodape={busca ? `${visiveis.length} seções encontradas` : 'Visualizando todos os tópicos'}
                        />
                    </Grid>
                </Grid>

                {/* Caixa de Busca e Índice Rápido */}
                <GlassCard sx={{ p: { xs: 2, sm: 2.5 }, mb: 3 }}>
                    <TextField
                        size="small"
                        fullWidth
                        placeholder="Buscar no manual (ex.: RTSP, Hikvision, sub-stream, IP fixo, relógio, porta 554)..."
                        value={busca}
                        onChange={e => setBusca(e.target.value)}
                        inputProps={{ 'aria-label': 'Buscar no manual' }}
                        InputProps={{
                            startAdornment: (
                                <InputAdornment position="start">
                                    <SearchIcon sx={{ color: cores.primaria, fontSize: 20 }} />
                                </InputAdornment>
                            ),
                            endAdornment: busca ? (
                                <InputAdornment position="end">
                                    <Tooltip title="Limpar busca">
                                        <IconButton size="small" onClick={() => setBusca('')}>
                                            <ClearIcon sx={{ color: cores.textoSecundario, fontSize: 18 }} />
                                        </IconButton>
                                    </Tooltip>
                                </InputAdornment>
                            ) : null
                        }}
                        sx={{
                            '& .MuiOutlinedInput-root': {
                                bgcolor: cores.fundo,
                                borderRadius: raios.controle,
                                color: cores.textoForte,
                                '& fieldset': { borderColor: cores.borda },
                                '&:hover fieldset': { borderColor: cores.bordaDestaque },
                                '&.Mui-focused fieldset': { borderColor: cores.primaria }
                            }
                        }}
                    />

                    {/* Atalhos Rápidos por Capítulo */}
                    <Box sx={{ mt: 2 }}>
                        <Typography variant="caption" sx={{ color: cores.textoSecundario, fontWeight: 700, letterSpacing: 0.8, display: 'block', mb: 1 }}>
                            NAVEGAÇÃO RÁPIDA POR CAPÍTULO:
                        </Typography>
                        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                            {todas.filter(s => s.titulo).map(s => {
                                const ativo = Boolean(termo && semAcento(s.titulo).includes(termo));
                                return (
                                    <Chip
                                        key={s.titulo}
                                        size="small"
                                        label={s.titulo}
                                        onClick={() => irPara(s.titulo)}
                                        sx={{
                                            fontSize: tamanhos.xs,
                                            fontWeight: 600,
                                            py: 0.5,
                                            bgcolor: ativo ? tom(cores.primaria, 0.25) : tom(cores.primaria, 0.08),
                                            color: ativo ? cores.primariaHover : cores.texto,
                                            border: `1px solid ${ativo ? cores.primaria : tom(cores.primaria, 0.2)}`,
                                            cursor: 'pointer',
                                            transition: 'all 0.15s ease',
                                            '&:hover': {
                                                bgcolor: tom(cores.primaria, 0.2),
                                                borderColor: cores.primariaHover
                                            }
                                        }}
                                    />
                                );
                            })}
                        </Stack>
                    </Box>
                </GlassCard>
            </Box>

            {/* Conteúdo Renderizado do Manual */}
            <GlassCard id="manual-impressao" sx={{ p: { xs: 2.5, sm: 4 } }}>
                {visiveis.length === 0 && (
                    <Box sx={{ py: 6, textAlign: 'center' }}>
                        <SearchIcon sx={{ fontSize: 48, color: cores.textoFraco, mb: 1.5 }} />
                        <Typography variant="h6" sx={{ color: cores.textoForte, fontWeight: 600, mb: 0.5 }}>
                            Nenhum resultado encontrado
                        </Typography>
                        <Typography variant="body2" sx={{ color: cores.textoSecundario, mb: 2 }}>
                            Não encontramos nenhuma instrução contendo o termo “<b>{busca}</b>”.
                        </Typography>
                        <Button
                            size="small"
                            variant="outlined"
                            onClick={() => setBusca('')}
                            sx={botaoSecundario}
                        >
                            Ver manual completo
                        </Button>
                    </Box>
                )}

                {visiveis.map((s, i) => (
                    <Box
                        key={s.titulo || `intro-${i}`}
                        component="section"
                        sx={{
                            mb: 4,
                            '&:last-child': { mb: 0 },
                            '& h2, & h3': {
                                fontFamily: fontes.titulo,
                                color: cores.textoForte,
                                borderBottom: s.titulo ? `1px solid ${cores.borda}` : 'none',
                                pb: s.titulo ? 1 : 0,
                                mb: 2
                            }
                        }}
                    >
                        {s.blocos.map((b, j) => (
                            <Bloco key={j} bloco={b} />
                        ))}
                    </Box>
                ))}
            </GlassCard>
        </Box>
    );
};

export default ManualEquipamentos;
