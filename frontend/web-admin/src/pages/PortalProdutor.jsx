import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    Chip,
    CircularProgress,
    Divider,
    Drawer,
    IconButton,
    InputAdornment,
    List,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    Stack,
    TextField,
    Tooltip,
    Typography,
    useMediaQuery,
    useTheme
} from '@mui/material';
import {
    AccountBalanceWallet as OrcamentosIcon,
    CalendarMonth as CronogramaIcon,
    Checklist as TarefasIcon,
    Close as FecharIcon,
    CloudDone as OnlineIcon,
    CloudOff as OfflineIcon,
    Dashboard as VisaoGeralIcon,
    DesktopWindows as MonitorIcon,
    Engineering as ProducaoIcon,
    Groups as EquipeIcon,
    Inventory2 as MateriaisIcon,
    Login as EntrarIcon,
    Logout as SairIcon,
    Map as PlantasIcon,
    Menu as MenuIcon,
    Refresh as AtualizarIcon,
    Smartphone as CelularIcon,
    Sync as SyncIcon,
    Visibility as VisivelIcon,
    VisibilityOff as OcultoIcon
} from '@mui/icons-material';
import { useSearchParams } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import portalProdutorApi, {
    limparSessaoPortalProdutor,
    obterSessaoPortalProdutor,
    obterTokenPortalProdutor,
    salvarSessaoPortalProdutor
} from '../services/portalProdutorApi';
import producaoSyncService from '../services/ProducaoSyncService';
import GlassCard from '../components/common/GlassCard';
import NeonButton from '../components/common/NeonButton';
import AbaVisaoGeralProducao from '../components/producao/AbaVisaoGeralProducao';
import AbaTarefasChecklist from '../components/producao/AbaTarefasChecklist';
import AbaProjetosPlantas from '../components/producao/AbaProjetosPlantas';
import AbaCronogramaPrazos from '../components/producao/AbaCronogramaPrazos';
import AbaMateriaisVisaoIa from '../components/producao/AbaMateriaisVisaoIa';
import AbaProdutoresPresenca from '../components/producao/AbaProdutoresPresenca';
import AbaOrcamentosRelatorios from '../components/producao/AbaOrcamentosRelatorios';
import ModoCampoMobile from '../components/producao/ModoCampoMobile';
import { obterCorArea, obterNomeArea, obterRotuloPapel } from '../components/producao/producaoHelpers';
import { botaoSecundario, cores, funcao, tamanhos, tom } from '../styles/tokens';

const HEADERS_VAZIO = {};
const LARGURA_MENU_LATERAL = 264;

const PortalProdutor = () => {
    const theme = useTheme();
    const isTelaMobile = useMediaQuery(theme.breakpoints.down('md'));
    const isDesktop = useMediaQuery(theme.breakpoints.up('lg'));
    const { enqueueSnackbar } = useSnackbar();
    const [searchParams] = useSearchParams();
    const eventoParamUrl = searchParams.get('evento_id') || '';

    const [token, setToken] = useState(obterTokenPortalProdutor);
    const [sessao, setSessao] = useState(obterSessaoPortalProdutor);

    // Formulário de login exclusivo dos produtores
    const [loginInput, setLoginInput] = useState('');
    const [senhaInput, setSenhaInput] = useState('');
    const [mostrarSenha, setMostrarSenha] = useState(false);
    const [entrando, setEntrando] = useState(false);

    // Dados e navegação do painel
    const [resumo, setResumo] = useState(null);
    const [carregando, setCarregando] = useState(false);
    const [abaAtiva, setAbaAtiva] = useState(0);
    const [menuAberto, setMenuAberto] = useState(false);
    const [modoCampoForcado, setModoCampoForcado] = useState(null);
    const exibirModoCampo = modoCampoForcado !== null ? modoCampoForcado : isTelaMobile;

    // Offline & Sync PWA
    const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
    const [pendentesOffline, setPendentesOffline] = useState(0);
    const [sincronizando, setSincronizando] = useState(false);

    const eventoId = sessao?.evento?.id || eventoParamUrl || '';

    const handleSair = useCallback(() => {
        limparSessaoPortalProdutor();
        setToken(null);
        setSessao(null);
        setResumo(null);
        setAbaAtiva(0);
        setMenuAberto(false);
    }, []);

    const atualizarContadorOffline = useCallback(async (eid) => {
        const qtd = await producaoSyncService.contarPendentes(eid || eventoId);
        setPendentesOffline(qtd);
    }, [eventoId]);

    const carregarResumo = useCallback(async () => {
        if (!token || !sessao?.evento?.id) return;
        const eid = sessao.evento.id;
        const chaveCache = `portal_${sessao?.produtor?.id || 'prod'}_${eid}`;
        try {
            setCarregando(true);
            const res = await portalProdutorApi.get('/producao/resumo', {
                params: { evento_id: eid },
                hideDefaultError: true
            });
            const dados = res.data?.data || res.data;
            setResumo(dados);
            await producaoSyncService.salvarCacheResumo(chaveCache, dados);
        } catch (err) {
            if (err?.response?.status === 401) {
                return;
            }
            const cache = await producaoSyncService.lerCacheResumo(chaveCache);
            if (cache) {
                setResumo(cache);
                enqueueSnackbar('Modo offline: exibindo últimos dados salvos no dispositivo.', { variant: 'warning' });
            } else {
                enqueueSnackbar(err.response?.data?.error || 'Não foi possível carregar os dados do portal.', { variant: 'error' });
            }
        } finally {
            setCarregando(false);
        }
    }, [token, sessao, enqueueSnackbar]);

    useEffect(() => {
        const onExpirada = () => {
            enqueueSnackbar('Sua sessão no portal expirou. Faça login novamente.', { variant: 'warning' });
            handleSair();
        };
        window.addEventListener('portal-produtor-sessao-expirada', onExpirada);
        return () => window.removeEventListener('portal-produtor-sessao-expirada', onExpirada);
    }, [enqueueSnackbar, handleSair]);

    useEffect(() => {
        if (token && sessao?.evento?.id) {
            carregarResumo();
            atualizarContadorOffline(sessao.evento.id);
        }
    }, [token, sessao, carregarResumo, atualizarContadorOffline]);

    const handleSincronizarOffline = useCallback(async () => {
        if (!eventoId || !token || !navigator.onLine) return;
        try {
            setSincronizando(true);
            const { sincronizados } = await producaoSyncService.sincronizarFila(eventoId, HEADERS_VAZIO, portalProdutorApi);
            await atualizarContadorOffline(eventoId);
            if (sincronizados > 0) {
                enqueueSnackbar(`${sincronizados} registro(s) offline sincronizado(s).`, { variant: 'success' });
                await carregarResumo();
            }
        } catch {
            enqueueSnackbar('Falha ao sincronizar registros pendentes.', { variant: 'error' });
        } finally {
            setSincronizando(false);
        }
    }, [eventoId, token, atualizarContadorOffline, enqueueSnackbar, carregarResumo]);

    useEffect(() => {
        const onOnline = () => {
            setOnline(true);
            handleSincronizarOffline();
        };
        const onOffline = () => setOnline(false);
        const onFilaAlterada = () => atualizarContadorOffline(eventoId);

        window.addEventListener('online', onOnline);
        window.addEventListener('offline', onOffline);
        window.addEventListener('producao-offline-alterada', onFilaAlterada);
        return () => {
            window.removeEventListener('online', onOnline);
            window.removeEventListener('offline', onOffline);
            window.removeEventListener('producao-offline-alterada', onFilaAlterada);
        };
    }, [eventoId, handleSincronizarOffline, atualizarContadorOffline]);

    const handleLogin = async (e) => {
        e.preventDefault();
        if (!loginInput.trim() || !senhaInput.trim()) {
            enqueueSnackbar('Informe seu login e sua senha.', { variant: 'warning' });
            return;
        }
        try {
            setEntrando(true);
            const res = await portalProdutorApi.post('/producao/portal/login', {
                login: loginInput.trim(),
                senha: senhaInput.trim(),
                evento_id: (eventoParamUrl && eventoParamUrl !== 'undefined' && eventoParamUrl !== 'null') ? eventoParamUrl : undefined
            });
            const data = res.data?.data || res.data;
            salvarSessaoPortalProdutor({
                token: data.token,
                produtor: data.produtor,
                evento: data.evento,
                eventos_disponiveis: data.eventos_disponiveis
            });
            setToken(data.token);
            setSessao({
                produtor: data.produtor,
                evento: data.evento,
                eventos_disponiveis: data.eventos_disponiveis
            });
            setSenhaInput('');
            enqueueSnackbar(`Bem-vindo(a), ${data.produtor?.nome || 'Produtor'}!`, { variant: 'success' });
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Login ou senha inválidos.', { variant: 'error' });
        } finally {
            setEntrando(false);
        }
    };

    const ctx = resumo?.contexto_usuario || {};
    const areas = resumo?.areas || [];
    const areaCor = obterCorArea(areas, ctx.area_id || sessao?.produtor?.area_id);

    const secoesMenu = useMemo(() => {
        const lista = [
            {
                id: 'geral',
                rotulo: 'Visão geral',
                subtitulo: 'Indicadores consolidados, andamento por frente e feed recente de campo.',
                icone: <VisaoGeralIcon fontSize="small" />,
                conteudo: <AbaVisaoGeralProducao resumo={resumo} aoTrocarAba={(idx) => setAbaAtiva(idx)} />
            },
            {
                id: 'tarefas',
                rotulo: 'Tarefas e checklist',
                subtitulo: 'Execução por etapas (Montagem, Evento e Desmontagem) com evidências.',
                icone: <TarefasIcon fontSize="small" />,
                conteudo: (
                    <AbaTarefasChecklist
                        eventoId={eventoId}
                        resumo={resumo}
                        headersExtra={HEADERS_VAZIO}
                        aoAtualizar={carregarResumo}
                        apiClient={portalProdutorApi}
                    />
                )
            },
            {
                id: 'plantas',
                rotulo: 'Projetos e plantas',
                subtitulo: 'Importação de plantas arquitetônicas, camadas, setores e intervenções.',
                icone: <PlantasIcon fontSize="small" />,
                conteudo: (
                    <AbaProjetosPlantas
                        resumo={resumo}
                        headersExtra={HEADERS_VAZIO}
                        aoAtualizar={carregarResumo}
                        apiClient={portalProdutorApi}
                    />
                )
            },
            {
                id: 'cronograma',
                rotulo: 'Cronograma e prazos',
                subtitulo: 'Linha do tempo por fase operacional, marcos e caminho crítico.',
                icone: <CronogramaIcon fontSize="small" />,
                conteudo: (
                    <AbaCronogramaPrazos
                        resumo={resumo}
                        headersExtra={HEADERS_VAZIO}
                        aoAtualizar={carregarResumo}
                        apiClient={portalProdutorApi}
                    />
                )
            },
            {
                id: 'materiais',
                rotulo: 'Materiais e contagem IA',
                subtitulo: 'Catálogo visual, rastreamento por vídeo e conferência de estoque.',
                icone: <MateriaisIcon fontSize="small" />,
                conteudo: (
                    <AbaMateriaisVisaoIa
                        resumo={resumo}
                        headersExtra={HEADERS_VAZIO}
                        aoAtualizar={carregarResumo}
                        apiClient={portalProdutorApi}
                    />
                )
            },
            {
                id: 'equipe',
                rotulo: 'Equipe e presença',
                subtitulo: 'Produtores, escalas, registro de ponto e acessos do portal.',
                icone: <EquipeIcon fontSize="small" />,
                conteudo: (
                    <AbaProdutoresPresenca
                        eventoId={eventoId}
                        resumo={resumo}
                        headersExtra={HEADERS_VAZIO}
                        aoAtualizar={carregarResumo}
                        apiClient={portalProdutorApi}
                    />
                )
            }
        ];

        if (!resumo?.orcamentos_restrito) {
            lista.push({
                id: 'orcamentos',
                rotulo: 'Orçamentos e relatórios',
                subtitulo: 'Controle financeiro da produção e emissão de relatórios executivos em PDF.',
                icone: <OrcamentosIcon fontSize="small" />,
                conteudo: (
                    <AbaOrcamentosRelatorios
                        resumo={resumo}
                        headersExtra={HEADERS_VAZIO}
                        aoAtualizar={carregarResumo}
                        apiClient={portalProdutorApi}
                    />
                )
            });
        }
        return lista;
    }, [resumo, eventoId, carregarResumo]);

    const idxAtivo = Math.min(abaAtiva, Math.max(0, secoesMenu.length - 1));
    const secaoAtual = secoesMenu[idxAtivo] || secoesMenu[0];

    const selecionarSecao = (idx) => {
        setAbaAtiva(idx);
        setMenuAberto(false);
    };

    // TELA 1: LOGIN EXCLUSIVO DOS PRODUTORES (SEPARADO DO PAINEL NZT)
    if (!token || !sessao?.evento?.id) {
        return (
            <Box
                sx={{
                    minHeight: '100dvh',
                    bgcolor: cores.fundo,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    p: 2
                }}
            >
                <GlassCard sx={{ width: '100%', maxWidth: 440, p: { xs: 3, sm: 4 } }}>
                    <Stack component="form" spacing={2.25} onSubmit={handleLogin}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Chip
                                size="small"
                                icon={<ProducaoIcon sx={{ fontSize: 16 }} />}
                                label="NZT Produção • Portal do Produtor"
                                sx={{ bgcolor: tom(cores.primaria, 0.16), color: cores.primaria, fontWeight: 700 }}
                            />
                        </Box>

                        <Box>
                            <Typography variant="h5" sx={{ fontWeight: 700, color: cores.textoForte }}>
                                Produção em campo
                            </Typography>
                            <Typography variant="body2" sx={{ color: cores.textoSecundario, mt: 0.5 }}>
                                Entre com o login e senha fornecidos pela coordenação de produção. Ambiente isolado do painel principal.
                            </Typography>
                        </Box>

                        {eventoParamUrl && (
                            <Alert severity="info">
                                Evento selecionado automaticamente pelo link recebido.
                            </Alert>
                        )}

                        <TextField
                            fullWidth
                            label="Login ou e-mail"
                            autoComplete="username"
                            value={loginInput}
                            onChange={(e) => setLoginInput(e.target.value)}
                        />

                        <TextField
                            fullWidth
                            label="Senha de acesso"
                            type={mostrarSenha ? 'text' : 'password'}
                            autoComplete="current-password"
                            value={senhaInput}
                            onChange={(e) => setSenhaInput(e.target.value)}
                            InputProps={{
                                endAdornment: (
                                    <InputAdornment position="end">
                                        <IconButton
                                            aria-label="Alternar visibilidade da senha"
                                            onClick={() => setMostrarSenha((v) => !v)}
                                            edge="end"
                                        >
                                            {mostrarSenha ? <OcultoIcon /> : <VisivelIcon />}
                                        </IconButton>
                                    </InputAdornment>
                                )
                            }}
                        />

                        <NeonButton
                            fullWidth
                            type="submit"
                            loading={entrando}
                            startIcon={<EntrarIcon />}
                            sx={{ minHeight: 46 }}
                        >
                            Entrar no portal de produção
                        </NeonButton>
                    </Stack>
                </GlassCard>
            </Box>
        );
    }

    const conteudoMenuLateral = (
        <Box
            sx={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                bgcolor: cores.fundo,
                color: cores.texto
            }}
        >
            {/* Identidade e Evento ativo */}
            <Box sx={{ px: 2, py: 2, borderBottom: `1px solid ${cores.borda}` }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.25 }}>
                    <Stack direction="row" spacing={1} alignItems="center">
                        <Box
                            sx={{
                                width: 32,
                                height: 32,
                                borderRadius: '8px',
                                bgcolor: tom(cores.primaria, 0.16),
                                color: cores.primaria,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0
                            }}
                        >
                            <ProducaoIcon fontSize="small" />
                        </Box>
                        <Box>
                            <Typography sx={{ fontWeight: 700, fontSize: tamanhos.md, color: cores.textoForte, lineHeight: 1.2 }}>
                                NZT Produção
                            </Typography>
                            <Typography sx={{ fontSize: tamanhos.xs, color: cores.textoSecundario }}>
                                Portal do Produtor
                            </Typography>
                        </Box>
                    </Stack>
                    {!isDesktop && (
                        <IconButton size="small" onClick={() => setMenuAberto(false)} sx={{ color: cores.textoSecundario }} aria-label="Fechar menu">
                            <FecharIcon fontSize="small" />
                        </IconButton>
                    )}
                </Box>

                <Box sx={{ p: 1.25, borderRadius: 2, bgcolor: cores.superficie, border: `1px solid ${cores.borda}` }}>
                    <Typography sx={{ fontSize: tamanhos.xs, color: cores.textoSecundario, fontWeight: 600 }}>
                        Evento ativo
                    </Typography>
                    <Typography sx={{ fontWeight: 700, fontSize: tamanhos.sm, color: cores.textoForte, mt: 0.25 }} noWrap>
                        {resumo?.evento?.nome || sessao?.evento?.nome || 'Evento em produção'}
                    </Typography>
                    <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
                        <Chip
                            size="small"
                            label={ctx.nome || sessao?.produtor?.nome || 'Produtor'}
                            sx={{ bgcolor: tom(funcao.acao, 0.14), color: funcao.acao, fontWeight: 700, maxWidth: '100%' }}
                        />
                        <Chip
                            size="small"
                            label={obterRotuloPapel(ctx.papel_producao || sessao?.produtor?.papel_producao)}
                            sx={{ bgcolor: tom(funcao.neutro, 0.14), color: cores.textoSuave, fontWeight: 600 }}
                        />
                        {(ctx.area_id || sessao?.produtor?.area_id) && (
                            <Chip
                                size="small"
                                label={obterNomeArea(areas, ctx.area_id || sessao?.produtor?.area_id)}
                                sx={{ bgcolor: tom(areaCor, 0.16), color: areaCor, fontWeight: 700 }}
                            />
                        )}
                    </Stack>
                </Box>
            </Box>

            {/* Itens de navegação */}
            <Box sx={{ flex: 1, overflowY: 'auto', px: 1.25, py: 1.5 }}>
                <Typography sx={{ px: 1.25, mb: 0.75, fontSize: tamanhos.xs, fontWeight: 600, color: cores.textoFraco }}>
                    Navegação
                </Typography>
                <List disablePadding>
                    {secoesMenu.map((sec, idx) => {
                        const selecionado = !exibirModoCampo && idx === idxAtivo;
                        return (
                            <ListItemButton
                                key={sec.id}
                                selected={selecionado}
                                onClick={() => {
                                    if (exibirModoCampo) setModoCampoForcado(false);
                                    selecionarSecao(idx);
                                }}
                                sx={{
                                    py: 1.1,
                                    px: 1.5,
                                    mb: 0.5,
                                    color: selecionado ? cores.textoForte : cores.textoSecundario
                                }}
                            >
                                <ListItemIcon sx={{ minWidth: 36, color: selecionado ? cores.primaria : cores.textoSecundario }}>
                                    {sec.icone}
                                </ListItemIcon>
                                <ListItemText
                                    primary={sec.rotulo}
                                    primaryTypographyProps={{
                                        fontSize: tamanhos.sm,
                                        fontWeight: selecionado ? 700 : 500
                                    }}
                                />
                            </ListItemButton>
                        );
                    })}
                </List>
            </Box>

            {/* Rodapé operacional da sidebar */}
            <Divider sx={{ borderColor: cores.borda }} />
            <Box sx={{ p: 1.5 }}>
                <Stack spacing={1}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 0.5 }}>
                        <Chip
                            size="small"
                            icon={online ? <OnlineIcon sx={{ fontSize: 15 }} /> : <OfflineIcon sx={{ fontSize: 15 }} />}
                            label={online ? 'Online' : 'Offline'}
                            sx={{
                                bgcolor: tom(online ? funcao.liberado : funcao.alerta, 0.14),
                                color: online ? funcao.liberado : funcao.alerta,
                                fontWeight: 700
                            }}
                        />
                        {pendentesOffline > 0 && (
                            <Button
                                size="small"
                                variant="text"
                                startIcon={<SyncIcon fontSize="small" />}
                                disabled={!online || sincronizando}
                                onClick={handleSincronizarOffline}
                                sx={{ color: funcao.alerta, fontSize: tamanhos.xs, minWidth: 0, px: 1 }}
                            >
                                {sincronizando ? 'Sync...' : `Sync (${pendentesOffline})`}
                            </Button>
                        )}
                    </Box>

                    <Button
                        fullWidth
                        size="small"
                        variant="outlined"
                        startIcon={exibirModoCampo ? <MonitorIcon /> : <CelularIcon />}
                        onClick={() => {
                            setModoCampoForcado(!exibirModoCampo);
                            setMenuAberto(false);
                        }}
                        sx={{ ...botaoSecundario, justifyContent: 'flex-start' }}
                    >
                        {exibirModoCampo ? 'Visão completa' : 'Modo celular (campo)'}
                    </Button>

                    <Button
                        fullWidth
                        size="small"
                        variant="outlined"
                        startIcon={<SairIcon />}
                        onClick={handleSair}
                        sx={{
                            ...botaoSecundario,
                            justifyContent: 'flex-start',
                            '&:hover': {
                                borderColor: funcao.negado,
                                color: funcao.negado,
                                bgcolor: tom(funcao.negado, 0.08)
                            }
                        }}
                    >
                        Sair do portal
                    </Button>
                </Stack>
            </Box>
        </Box>
    );

    // TELA 2: LAYOUT COM MENU LATERAL RESPONSIVO + 100% DA LARGURA DA PÁGINA
    return (
        <Box sx={{ minHeight: '100dvh', width: '100%', bgcolor: cores.fundo, display: 'flex' }}>
            {/* Menu lateral fixo no Desktop (>=1200px) quando não estiver no Modo Celular */}
            {isDesktop && !exibirModoCampo && (
                <Box
                    component="aside"
                    sx={{
                        width: LARGURA_MENU_LATERAL,
                        flexShrink: 0,
                        borderRight: `1px solid ${cores.borda}`,
                        position: 'sticky',
                        top: 0,
                        height: '100dvh'
                    }}
                >
                    {conteudoMenuLateral}
                </Box>
            )}

            {/* Drawer deslizante para Tablet / Mobile (ou quando usuário clicar no hambúrguer) */}
            <Drawer
                anchor="left"
                open={menuAberto}
                onClose={() => setMenuAberto(false)}
                ModalProps={{ keepMounted: true }}
                PaperProps={{
                    sx: {
                        width: LARGURA_MENU_LATERAL,
                        maxWidth: '85vw',
                        bgcolor: cores.fundo,
                        borderRight: `1px solid ${cores.borda}`,
                        borderRadius: 0
                    }
                }}
            >
                {conteudoMenuLateral}
            </Drawer>

            {/* Área principal preenchendo 100% do espaço disponível */}
            <Box
                component="main"
                sx={{
                    flex: 1,
                    minWidth: 0,
                    width: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    minHeight: '100dvh'
                }}
            >
                {/* Barra superior limpa e coerente em todas as telas */}
                <Box
                    component="header"
                    sx={{
                        position: 'sticky',
                        top: 0,
                        zIndex: 20,
                        px: { xs: 1.5, sm: 2.5, lg: 3 },
                        py: 1.25,
                        bgcolor: cores.superficie,
                        borderBottom: `1px solid ${cores.borda}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 1.5,
                        flexWrap: 'wrap'
                    }}
                >
                    <Stack direction="row" spacing={1.25} alignItems="center" sx={{ minWidth: 0, flex: 1 }}>
                        {(!isDesktop || exibirModoCampo) && (
                            <IconButton
                                onClick={() => setMenuAberto(true)}
                                aria-label="Abrir menu de navegação"
                                sx={{
                                    color: cores.textoForte,
                                    bgcolor: cores.superficieElevada,
                                    border: `1px solid ${cores.borda}`
                                }}
                            >
                                <MenuIcon />
                            </IconButton>
                        )}
                        <Box sx={{ minWidth: 0 }}>
                            <Typography
                                sx={{
                                    fontWeight: 700,
                                    fontSize: { xs: tamanhos.md, sm: tamanhos.lg },
                                    color: cores.textoForte,
                                    lineHeight: 1.25
                                }}
                                noWrap
                            >
                                {exibirModoCampo
                                    ? (resumo?.evento?.nome || sessao?.evento?.nome || 'Produção em campo')
                                    : (secaoAtual?.rotulo || 'Produção')}
                            </Typography>
                            <Typography
                                sx={{
                                    fontSize: tamanhos.xs,
                                    color: cores.textoSecundario,
                                    display: { xs: 'none', sm: 'block' }
                                }}
                                noWrap
                            >
                                {exibirModoCampo
                                    ? `${ctx.nome || sessao?.produtor?.nome || 'Produtor'} • ${obterRotuloPapel(ctx.papel_producao || sessao?.produtor?.papel_producao)}`
                                    : (secaoAtual?.subtitulo || '')}
                            </Typography>
                        </Box>
                    </Stack>

                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                        {!online && (
                            <Chip
                                size="small"
                                icon={<OfflineIcon />}
                                label="Offline"
                                sx={{ bgcolor: tom(funcao.alerta, 0.16), color: funcao.alerta, fontWeight: 700 }}
                            />
                        )}
                        {pendentesOffline > 0 && (
                            <Button
                                size="small"
                                variant="outlined"
                                startIcon={<SyncIcon />}
                                disabled={!online || sincronizando}
                                onClick={handleSincronizarOffline}
                                sx={botaoSecundario}
                            >
                                {sincronizando ? 'Sincronizando...' : `Sincronizar (${pendentesOffline})`}
                            </Button>
                        )}
                        <Tooltip title="Atualizar dados">
                            <span>
                                <IconButton
                                    size="small"
                                    onClick={carregarResumo}
                                    disabled={carregando}
                                    sx={{
                                        color: cores.textoSuave,
                                        border: `1px solid ${cores.borda}`,
                                        bgcolor: cores.superficieElevada
                                    }}
                                    aria-label="Atualizar dados"
                                >
                                    <AtualizarIcon fontSize="small" />
                                </IconButton>
                            </span>
                        </Tooltip>
                        <Button
                            size="small"
                            variant="outlined"
                            startIcon={exibirModoCampo ? <MonitorIcon /> : <CelularIcon />}
                            onClick={() => setModoCampoForcado(!exibirModoCampo)}
                            sx={{ ...botaoSecundario, display: { xs: 'none', sm: 'inline-flex' } }}
                        >
                            {exibirModoCampo ? 'Visão completa' : 'Modo celular'}
                        </Button>
                        {(!isDesktop || exibirModoCampo) && (
                            <Tooltip title="Sair do portal">
                                <IconButton
                                    size="small"
                                    onClick={handleSair}
                                    sx={{
                                        color: cores.textoSecundario,
                                        border: `1px solid ${cores.borda}`,
                                        bgcolor: cores.superficieElevada
                                    }}
                                    aria-label="Sair do portal"
                                >
                                    <SairIcon fontSize="small" />
                                </IconButton>
                            </Tooltip>
                        )}
                    </Stack>
                </Box>

                {/* Conteúdo fluido ocupando 100% da largura da tela */}
                <Box
                    sx={{
                        flex: 1,
                        width: '100%',
                        p: { xs: 1.5, sm: 2, md: 2.5, lg: 3 }
                    }}
                >
                    {carregando && !resumo ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
                            <CircularProgress />
                        </Box>
                    ) : !resumo ? (
                        <GlassCard sx={{ p: 3, textAlign: 'center' }}>
                            <Typography sx={{ color: cores.textoSecundario, mb: 2 }}>
                                Não foi possível carregar os dados do evento no momento.
                            </Typography>
                            <NeonButton onClick={carregarResumo}>Tentar novamente</NeonButton>
                        </GlassCard>
                    ) : exibirModoCampo ? (
                        <ModoCampoMobile
                            eventoId={eventoId}
                            resumo={resumo}
                            headersExtra={HEADERS_VAZIO}
                            apiClient={portalProdutorApi}
                            online={online}
                            pendentesOffline={pendentesOffline}
                            sincronizando={sincronizando}
                            aoSincronizar={handleSincronizarOffline}
                            aoAtualizar={carregarResumo}
                            aoSairModoCampo={() => setModoCampoForcado(false)}
                        />
                    ) : (
                        secaoAtual?.conteudo
                    )}
                </Box>
            </Box>
        </Box>
    );
};

export default PortalProdutor;
