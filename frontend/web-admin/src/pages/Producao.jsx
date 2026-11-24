import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Alert,
    Box,
    Button,
    Chip,
    CircularProgress,
    FormControl,
    InputLabel,
    MenuItem,
    Select,
    Stack,
    Tab,
    Tabs,
    Typography,
    useMediaQuery,
    useTheme
} from '@mui/material';
import {
    CloudOff as OfflineIcon,
    Sync as SyncIcon,
    AutoFixHigh as SeedIcon,
    Security as PerfilIcon,
    Smartphone as CelularIcon,
    DesktopWindows as MonitorIcon,
    OpenInNew as AbrirPortalIcon
} from '@mui/icons-material';
import { useSearchParams } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import producaoSyncService from '../services/ProducaoSyncService';
import PageHeader from '../components/common/PageHeader';
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
import { PAPEIS_PRODUCAO, obterRotuloPapel } from '../components/producao/producaoHelpers';
import { botaoSecundario, cores, funcao, tamanhos, tom } from '../styles/tokens';

const ABAS = [
    'Visão geral',
    'Tarefas e checklist',
    'Projetos e plantas',
    'Cronograma e prazos',
    'Materiais e contagem IA',
    'Produtores e presença',
    'Orçamentos e relatórios'
];

const Producao = () => {
    const theme = useTheme();
    const isTelaMobile = useMediaQuery(theme.breakpoints.down('md'));
    const { user } = useAuth();
    const { enqueueSnackbar } = useSnackbar();
    const [searchParams] = useSearchParams();
    const [modoCampoForcado, setModoCampoForcado] = useState(null);
    const exibirModoCampo = modoCampoForcado !== null ? modoCampoForcado : isTelaMobile;

    const obterEventoAtivo = useCallback(() => {
        const paramId = searchParams.get('evento_id');
        if (paramId && paramId !== 'undefined' && paramId !== 'null') return paramId;
        const local = localStorage.getItem('active_evento_id') || sessionStorage.getItem('active_evento_id');
        return (local && local !== 'undefined' && local !== 'null') ? local : '';
    }, [searchParams]);

    const [eventoId, setEventoId] = useState(obterEventoAtivo);
    const [abaAtiva, setAbaAtiva] = useState(0);
    const [resumo, setResumo] = useState(null);
    const [carregando, setCarregando] = useState(true);
    const [seeding, setSeeding] = useState(false);

    // Simulação de perfil (exclusivo para Admin Master testar segregação de dados)
    const [perfilSimulado, setPerfilSimulado] = useState('');
    const [areaSimulada, setAreaSimulada] = useState('');

    // Offline & Sync PWA
    const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
    const [pendentesOffline, setPendentesOffline] = useState(0);
    const [sincronizando, setSincronizando] = useState(false);

    const ehAdminMaster = user?.nivel_acesso === 'admin_master';

    const headersExtra = useMemo(() => {
        const h = {};
        if (ehAdminMaster && perfilSimulado) {
            h['x-producao-perfil-simulacao'] = perfilSimulado;
            if (perfilSimulado === 'produtor_area' && areaSimulada) {
                h['x-producao-area-simulacao'] = areaSimulada;
            }
        }
        return h;
    }, [ehAdminMaster, perfilSimulado, areaSimulada]);

    const atualizarContadorOffline = useCallback(async (eid) => {
        const qtd = await producaoSyncService.contarPendentes(eid || eventoId);
        setPendentesOffline(qtd);
    }, [eventoId]);

    const carregarResumo = useCallback(async (eidAlvo = eventoId) => {
        if (!eidAlvo) {
            setCarregando(false);
            setResumo(null);
            return;
        }
        try {
            setCarregando(true);
            const res = await api.get('/producao/resumo', {
                params: { evento_id: eidAlvo },
                headers: headersExtra,
                hideDefaultError: true
            });
            const dados = res.data?.data || res.data;
            setResumo(dados);
            await producaoSyncService.salvarCacheResumo(eidAlvo, dados);
        } catch (err) {
            const cache = await producaoSyncService.lerCacheResumo(eidAlvo);
            if (cache) {
                setResumo(cache);
                enqueueSnackbar('Modo offline: exibindo últimos dados salvos no dispositivo.', { variant: 'warning' });
            } else {
                enqueueSnackbar(err.response?.data?.error || 'Não foi possível carregar os dados da produção.', { variant: 'error' });
            }
        } finally {
            setCarregando(false);
        }
    }, [eventoId, headersExtra, enqueueSnackbar]);

    useEffect(() => {
        const novoEid = obterEventoAtivo();
        if (novoEid !== eventoId) setEventoId(novoEid);
    }, [obterEventoAtivo, eventoId]);

    useEffect(() => {
        const syncEvento = () => {
            const eid = obterEventoAtivo();
            setEventoId(eid);
        };
        window.addEventListener('storage', syncEvento);
        window.addEventListener('refresh-global-data', syncEvento);
        return () => {
            window.removeEventListener('storage', syncEvento);
            window.removeEventListener('refresh-global-data', syncEvento);
        };
    }, [obterEventoAtivo]);

    useEffect(() => {
        carregarResumo(eventoId);
        atualizarContadorOffline(eventoId);
    }, [eventoId, carregarResumo, atualizarContadorOffline]);

    const handleSincronizarOffline = useCallback(async () => {
        if (!eventoId || !navigator.onLine) return;
        try {
            setSincronizando(true);
            const { sincronizados } = await producaoSyncService.sincronizarFila(eventoId, headersExtra);
            await atualizarContadorOffline(eventoId);
            if (sincronizados > 0) {
                enqueueSnackbar(`${sincronizados} registro(s) offline sincronizado(s) com sucesso.`, { variant: 'success' });
                await carregarResumo(eventoId);
            }
        } catch {
            enqueueSnackbar('Falha ao sincronizar registros pendentes.', { variant: 'error' });
        } finally {
            setSincronizando(false);
        }
    }, [eventoId, headersExtra, atualizarContadorOffline, enqueueSnackbar, carregarResumo]);

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

    const handleCarregarSeed = async () => {
        if (!eventoId) return;
        try {
            setSeeding(true);
            const res = await api.post('/producao/seed', {}, { headers: headersExtra });
            const dados = res.data?.data || res.data;
            setResumo(dados);
            await producaoSyncService.salvarCacheResumo(eventoId, dados);
            enqueueSnackbar('Cenário de demonstração da produção carregado.', { variant: 'success' });
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Erro ao gerar dados de demonstração.', { variant: 'error' });
        } finally {
            setSeeding(false);
        }
    };

    const ctx = resumo?.contexto_usuario || {};
    const semDadosAinda = Boolean(resumo && (resumo.areas?.length || 0) === 0 && (resumo.tarefas?.length || 0) === 0);

    return (
        <Box sx={{ p: { xs: 2, md: 3 } }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'flex-start', md: 'center' }, flexWrap: 'wrap', gap: 2, mb: 2.5 }}>
                <PageHeader
                    title="Produção"
                    subtitle="Gestão de áreas, projetos, plantas colaborativas, tarefas de campo, materiais e equipe de produção."
                    sx={{ mb: 0 }}
                />

                <Stack direction="row" spacing={1.25} alignItems="center" flexWrap="wrap" useFlexGap>
                    {!online && (
                        <Chip
                            icon={<OfflineIcon />}
                            label="Modo offline ativo"
                            sx={{ bgcolor: tom(funcao.alerta, 0.16), color: funcao.alerta, fontWeight: 700 }}
                        />
                    )}
                    {pendentesOffline > 0 && (
                        <Button
                            variant="outlined"
                            size="small"
                            startIcon={<SyncIcon />}
                            disabled={!online || sincronizando}
                            onClick={handleSincronizarOffline}
                            sx={botaoSecundario}
                        >
                            {sincronizando ? 'Sincronizando...' : `Sincronizar pendentes (${pendentesOffline})`}
                        </Button>
                    )}
                    {ctx.papel_producao && (
                        <Chip
                            icon={<PerfilIcon />}
                            label={`Visão: ${obterRotuloPapel(ctx.papel_producao)}`}
                            sx={{ bgcolor: tom(funcao.acao, 0.14), color: funcao.acao, fontWeight: 600 }}
                        />
                    )}
                    <Button
                        variant="outlined"
                        size="small"
                        startIcon={<AbrirPortalIcon />}
                        onClick={() => {
                            const basePortal = window.location.hostname.endsWith('nzt.app.br')
                                ? 'https://produtor.nzt.app.br/'
                                : '/portal-produtor';
                            const url = `${basePortal}${eventoId ? `?evento_id=${eventoId}` : ''}`;
                            window.open(url, '_blank', 'noopener,noreferrer');
                        }}
                        sx={botaoSecundario}
                    >
                        Abrir portal dos produtores
                    </Button>
                    <Button
                        variant="outlined"
                        size="small"
                        startIcon={exibirModoCampo ? <MonitorIcon /> : <CelularIcon />}
                        onClick={() => setModoCampoForcado(!exibirModoCampo)}
                        sx={botaoSecundario}
                    >
                        {exibirModoCampo ? 'Visão completa' : 'Modo celular (campo)'}
                    </Button>
                    {ehAdminMaster && (
                        <Button
                            variant="outlined"
                            size="small"
                            startIcon={<SeedIcon />}
                            disabled={seeding || !eventoId}
                            onClick={handleCarregarSeed}
                            sx={botaoSecundario}
                        >
                            {seeding ? 'Gerando...' : 'Carregar demonstração'}
                        </Button>
                    )}
                </Stack>
            </Box>

            {/* Barra de simulação de perfil para Admin Master validar permissões do servidor */}
            {ehAdminMaster && resumo && (
                <GlassCard sx={{ p: 1.5, mb: 2.5 }}>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }}>
                        <Typography sx={{ fontSize: tamanhos.sm, color: cores.textoSecundario, fontWeight: 600, whiteSpace: 'nowrap' }}>
                            Simular perfil de acesso:
                        </Typography>
                        <FormControl size="small" sx={{ minWidth: 210 }}>
                            <InputLabel>Perfil</InputLabel>
                            <Select
                                label="Perfil"
                                value={perfilSimulado}
                                onChange={(e) => setPerfilSimulado(e.target.value)}
                            >
                                <MenuItem value="">Admin master (padrão)</MenuItem>
                                {PAPEIS_PRODUCAO.filter((p) => p.valor !== 'admin_master').map((p) => (
                                    <MenuItem key={p.valor} value={p.valor}>{p.rotulo}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                        {perfilSimulado === 'produtor_area' && (
                            <FormControl size="small" sx={{ minWidth: 210 }}>
                                <InputLabel>Área simulada</InputLabel>
                                <Select
                                    label="Área simulada"
                                    value={areaSimulada || resumo.areas?.[0]?.id || ''}
                                    onChange={(e) => setAreaSimulada(e.target.value)}
                                >
                                    {(resumo.areas || []).map((a) => (
                                        <MenuItem key={a.id} value={a.id}>{a.nome}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        )}
                        {perfilSimulado && (
                            <Typography sx={{ fontSize: tamanhos.xs, color: funcao.alerta }}>
                                Servidor aplicando bloqueios reais de área, plantas e sigilo de cachês para este perfil.
                            </Typography>
                        )}
                    </Stack>
                </GlassCard>
            )}

            {!eventoId ? (
                <GlassCard sx={{ p: 4, textAlign: 'center' }}>
                    <Typography variant="h6" sx={{ color: cores.textoForte, mb: 1 }}>
                        Nenhum evento selecionado
                    </Typography>
                    <Typography variant="body2" sx={{ color: cores.textoSecundario }}>
                        Selecione um evento no seletor do menu lateral para acessar o módulo de produção.
                    </Typography>
                </GlassCard>
            ) : carregando && !resumo ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
                    <CircularProgress />
                </Box>
            ) : (
                <>
                    {semDadosAinda && (
                        <Alert
                            severity="info"
                            sx={{ mb: 2.5 }}
                            action={
                                ehAdminMaster && (
                                    <NeonButton size="small" loading={seeding} onClick={handleCarregarSeed}>
                                        Carregar evento de demonstração
                                    </NeonButton>
                                )
                            }
                        >
                            Este evento ainda não possui áreas, plantas ou tarefas de produção cadastradas.
                        </Alert>
                    )}

                    {exibirModoCampo ? (
                        resumo && (
                            <ModoCampoMobile
                                eventoId={eventoId}
                                resumo={resumo}
                                headersExtra={headersExtra}
                                online={online}
                                pendentesOffline={pendentesOffline}
                                sincronizando={sincronizando}
                                aoSincronizar={handleSincronizarOffline}
                                aoAtualizar={() => carregarResumo(eventoId)}
                                aoSairModoCampo={() => setModoCampoForcado(false)}
                            />
                        )
                    ) : (
                        <>
                            <Box sx={{ borderBottom: `1px solid ${cores.borda}`, mb: 3 }}>
                                <Tabs
                                    value={abaAtiva}
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
                                    {ABAS.map((nome) => (
                                        <Tab key={nome} label={nome} />
                                    ))}
                                </Tabs>
                            </Box>

                            {resumo && (
                                <>
                                    {abaAtiva === 0 && (
                                        <AbaVisaoGeralProducao
                                            resumo={resumo}
                                            aoTrocarAba={(idx) => setAbaAtiva(idx)}
                                        />
                                    )}
                                    {abaAtiva === 1 && (
                                        <AbaTarefasChecklist
                                            eventoId={eventoId}
                                            resumo={resumo}
                                            headersExtra={headersExtra}
                                            aoAtualizar={() => carregarResumo(eventoId)}
                                        />
                                    )}
                                    {abaAtiva === 2 && (
                                        <AbaProjetosPlantas
                                            resumo={resumo}
                                            headersExtra={headersExtra}
                                            aoAtualizar={() => carregarResumo(eventoId)}
                                        />
                                    )}
                                    {abaAtiva === 3 && (
                                        <AbaCronogramaPrazos
                                            resumo={resumo}
                                            headersExtra={headersExtra}
                                            aoAtualizar={() => carregarResumo(eventoId)}
                                        />
                                    )}
                                    {abaAtiva === 4 && (
                                        <AbaMateriaisVisaoIa
                                            resumo={resumo}
                                            headersExtra={headersExtra}
                                            aoAtualizar={() => carregarResumo(eventoId)}
                                        />
                                    )}
                                    {abaAtiva === 5 && (
                                        <AbaProdutoresPresenca
                                            eventoId={eventoId}
                                            resumo={resumo}
                                            headersExtra={headersExtra}
                                            aoAtualizar={() => carregarResumo(eventoId)}
                                        />
                                    )}
                                    {abaAtiva === 6 && (
                                        <AbaOrcamentosRelatorios
                                            resumo={resumo}
                                            headersExtra={headersExtra}
                                            aoAtualizar={() => carregarResumo(eventoId)}
                                        />
                                    )}
                                </>
                            )}
                        </>
                    )}
                </>
            )}
        </Box>
    );
};

export default Producao;
