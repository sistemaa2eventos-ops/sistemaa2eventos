import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Alert,
    Box,
    Button,
    Chip,
    CircularProgress,
    IconButton,
    InputAdornment,
    Stack,
    Tab,
    Tabs,
    TextField,
    Typography,
    useMediaQuery,
    useTheme
} from '@mui/material';
import {
    CloudOff as OfflineIcon,
    Sync as SyncIcon,
    Smartphone as CelularIcon,
    DesktopWindows as MonitorIcon,
    Logout as SairIcon,
    Login as EntrarIcon,
    Visibility as VisivelIcon,
    VisibilityOff as OcultoIcon,
    Engineering as ProducaoIcon
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

const PortalProdutor = () => {
    const theme = useTheme();
    const isTelaMobile = useMediaQuery(theme.breakpoints.down('md'));
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

    // Dados do painel
    const [resumo, setResumo] = useState(null);
    const [carregando, setCarregando] = useState(false);
    const [abaAtiva, setAbaAtiva] = useState(0);
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

    const abasVisiveis = useMemo(() => {
        const lista = [
            {
                id: 'geral',
                rotulo: 'Visão geral',
                conteudo: <AbaVisaoGeralProducao resumo={resumo} aoTrocarAba={(idx) => setAbaAtiva(idx)} />
            },
            {
                id: 'tarefas',
                rotulo: 'Tarefas e checklist',
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

    // TELA 1: LOGIN EXCLUSIVO DOS PRODUTORES (SEPARADO DO PAINEL NZT)
    if (!token || !sessao?.evento?.id) {
        return (
            <Box
                sx={{
                    minHeight: '100vh',
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
                                label="Portal exclusivo dos produtores"
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

    // TELA 2: PAINEL SEPARADO DO PRODUTOR
    return (
        <Box sx={{ minHeight: '100vh', bgcolor: cores.fundo }}>
            {/* Cabeçalho exclusivo do Portal do Produtor (sem barra lateral NZT) */}
            <Box
                sx={{
                    px: { xs: 2, md: 3 },
                    py: 1.5,
                    bgcolor: cores.superficie,
                    borderBottom: `1px solid ${cores.borda}`,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 1.5
                }}
            >
                <Box>
                    <Typography sx={{ fontWeight: 700, fontSize: tamanhos.lg, color: cores.textoForte }}>
                        {resumo?.evento?.nome || sessao?.evento?.nome || 'Portal de produção'}
                    </Typography>
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
                        <Chip
                            size="small"
                            label={ctx.nome || sessao?.produtor?.nome || 'Produtor'}
                            sx={{ bgcolor: tom(funcao.acao, 0.14), color: funcao.acao, fontWeight: 700 }}
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
                    <Button
                        size="small"
                        variant="outlined"
                        startIcon={exibirModoCampo ? <MonitorIcon /> : <CelularIcon />}
                        onClick={() => setModoCampoForcado(!exibirModoCampo)}
                        sx={botaoSecundario}
                    >
                        {exibirModoCampo ? 'Visão completa' : 'Modo celular (campo)'}
                    </Button>
                    <Button
                        size="small"
                        variant="outlined"
                        startIcon={<SairIcon />}
                        onClick={handleSair}
                        sx={botaoSecundario}
                    >
                        Sair
                    </Button>
                </Stack>
            </Box>

            <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1440, mx: 'auto' }}>
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
                    <>
                        <Box sx={{ borderBottom: `1px solid ${cores.borda}`, mb: 3 }}>
                            <Tabs
                                value={Math.min(abaAtiva, abasVisiveis.length - 1)}
                                onChange={(_, v) => setAbaAtiva(v)}
                                variant="scrollable"
                                scrollButtons="auto"
                                sx={{
                                    '& .MuiTab-root': {
                                        textTransform: 'none',
                                        fontWeight: 600,
                                        fontSize: tamanhos.md,
                                        color: cores.textoSecundario
                                    },
                                    '& .Mui-selected': {
                                        color: `${cores.primaria} !important`
                                    }
                                }}
                            >
                                {abasVisiveis.map((aba) => (
                                    <Tab key={aba.id} label={aba.rotulo} />
                                ))}
                            </Tabs>
                        </Box>

                        {abasVisiveis[Math.min(abaAtiva, abasVisiveis.length - 1)]?.conteudo}
                    </>
                )}
            </Box>
        </Box>
    );
};

export default PortalProdutor;
