import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Box, Typography, Grid, Switch, FormControlLabel, Select, MenuItem, Stack,
    CircularProgress, Dialog, DialogContent, DialogActions, Button, Alert,
    FormControl, InputLabel, Chip, Tabs, Tab, TextField, IconButton, Tooltip,
    Divider
} from '@mui/material';
import {
    VerifiedUser as VerifiedUserIcon,
    Add as AddIcon,
    Edit as EditIcon,
    Delete as DeleteIcon,
    Star as StarIcon,
    ContentCopy as CopyIcon,
    GroupAdd as AplicarIcon,
    Lock as LockIcon,
    Schedule as ScheduleIcon,
    Tune as TuneIcon,
    Security as SecurityIcon,
    Devices as DevicesIcon,
    People as PeopleIcon,
    Bolt as PresetIcon,
    OpenInNew as OpenIcon,
    Engineering as EngineeringIcon,
    Videocam as VideocamIcon,
    Business as BusinessIcon,
    Save as SaveIcon,
    Checklist as ChecklistIcon,
    Shield as ShieldIcon,
    Key as KeyIcon
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import api from '../../services/api';
import GlassCard from '../../components/common/GlassCard';
import KpiCard from '../../components/common/KpiCard';
import NeonButton from '../../components/common/NeonButton';
import PageHeader from '../../components/common/PageHeader';
import TituloModal from '../../components/common/TituloModal';
import { MODULOS } from '../../hooks/useUsuarios';
import { botaoSecundario, cores, funcao, tom } from '../../styles/tokens';

const DIAS_SEMANA_OPCOES = [
    { valor: 0, rotulo: 'Dom' },
    { valor: 1, rotulo: 'Seg' },
    { valor: 2, rotulo: 'Ter' },
    { valor: 3, rotulo: 'Qua' },
    { valor: 4, rotulo: 'Qui' },
    { valor: 5, rotulo: 'Sex' },
    { valor: 6, rotulo: 'Sáb' }
];

const MODELO_NOVO_VAZIO = {
    id: '',
    nome: '',
    descricao: '',
    padrao: false,
    modulos: Object.fromEntries(MODULOS.map(m => [m.key, m.key === 'checkin'])),
    pagina_inicial: 'checkin',
    modo_tela: 'quiosque',
    regras: {
        participantes_somente_leitura: true,
        checkin_liberar_pendente: false,
        empresas_somente_leitura: true,
        bloquear_edicao_dados: true
    },
    restricoes_horario: {
        ativo: false,
        tipo_dias: 'apenas_evento',
        hora_inicio: '06:00',
        hora_fim: '23:59',
        dias_semana: [0, 1, 2, 3, 4, 5, 6]
    }
};

const formatarMomento = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
};

/**
 * Perfis de Acesso: Central unificada de permissões operacionais do ecossistema NZT Eventos.
 *
 * - Aba 1: Operadores do Sistema Web (CRUD de modelos nomeados, modo quiosque, travas e turnos).
 * - Aba 2: Equipe de Produção (Portal do Produtor / campo).
 * - Aba 3: Central de Monitoramento (Operadores de CFTV físico / offline).
 * - Aba 4: Empresas & Prestadores (Portal de Cotas & Credenciamento com solicitações).
 */
const PermissoesAcesso = () => {
    const navigate = useNavigate();
    const { enqueueSnackbar } = useSnackbar();

    const [abaPrincipal, setAbaPrincipal] = useState(0);
    const [modelos, setModelos] = useState([]);
    const [resumoUsuarios, setResumoUsuarios] = useState(null);
    const [loading, setLoading] = useState(true);

    // Políticas Especiais
    const [politicas, setPoliticas] = useState({
        producao: {
            exigir_lgpd_primeiro_acesso: true,
            permitir_ponto_geolocalizacao: true,
            ocultar_cache_tecnicos: true,
            aprovar_presenca_automatico: false
        },
        central: {
            tempo_bloqueio_inatividade_min: 15,
            exigir_confirmacao_ptz: true,
            audio_bidirecional_habilitado: true,
            auditoria_rigorosa_ativa: true
        },
        empresas: {
            exigir_aprovacao_edicao_participante: true,
            exigir_aprovacao_exclusao_participante: true,
            exigir_aprovacao_exclusao_documento: true,
            bloquear_pos_prazo_evento: true,
            horas_limite_pre_cadastro: 24
        }
    });
    const [salvandoPolitica, setSalvandoPolitica] = useState(false);

    // Modal de Edição / Criação de Modelo
    const [modalModeloAberto, setModalModeloAberto] = useState(false);
    const [modoEdicao, setModoEdicao] = useState(false);
    const [formModelo, setFormModelo] = useState(MODELO_NOVO_VAZIO);
    const [abaForm, setAbaForm] = useState(0);
    const [salvandoModelo, setSalvandoModelo] = useState(false);

    // Modal de Exclusão
    const [modeloParaExcluir, setModeloParaExcluir] = useState(null);
    const [excluindo, setExcluindo] = useState(false);

    // Modal de Aplicação em lote
    const [modeloParaAplicar, setModeloParaAplicar] = useState(null);
    const [aplicando, setAplicando] = useState(false);
    const [incluirEventosEspecificos, setIncluirEventosEspecificos] = useState(true);
    const [incluirPreferenciasTela, setIncluirPreferenciasTela] = useState(true);
    const [incluirRegras, setIncluirRegras] = useState(true);
    const [incluirHorario, setIncluirHorario] = useState(true);

    const carregarTudo = useCallback(async () => {
        try {
            setLoading(true);
            const [respModelos, respPoliticas] = await Promise.all([
                api.get('/auth/permissions/modelos'),
                api.get('/auth/permissions/politicas').catch(() => ({ data: { data: null } }))
            ]);
            setModelos(respModelos.data?.data || []);
            setResumoUsuarios(respModelos.data?.resumo_usuarios || null);
            if (respPoliticas.data?.data) {
                setPoliticas(prev => ({ ...prev, ...respPoliticas.data.data }));
            }
        } catch {
            enqueueSnackbar('Erro ao carregar dados de perfis e modelos.', { variant: 'error' });
        } finally {
            setLoading(false);
        }
    }, [enqueueSnackbar]);

    useEffect(() => {
        carregarTudo();
    }, [carregarTudo]);

    // Métricas do Topo
    const metricas = useMemo(() => {
        const total = modelos.length;
        const padraoObj = modelos.find(m => m.padrao);
        const comRestricoes = modelos.filter(m => m.restricoes_horario?.ativo || Object.values(m.regras || {}).some(Boolean)).length;
        return {
            total,
            nomePadrao: padraoObj?.nome || 'Nenhum',
            operadoresAtivos: resumoUsuarios?.operadores_ativos ?? 0,
            comRestricoes
        };
    }, [modelos, resumoUsuarios]);

    // CRUD Modelos
    const abrirCriarModelo = () => {
        setModoEdicao(false);
        setFormModelo({
            ...MODELO_NOVO_VAZIO,
            id: `modelo_${Date.now()}`,
            nome: '',
            descricao: '',
            padrao: modelos.length === 0,
            modulos: Object.fromEntries(MODULOS.map(m => [m.key, m.key === 'checkin'])),
            regras: { ...MODELO_NOVO_VAZIO.regras },
            restricoes_horario: { ...MODELO_NOVO_VAZIO.restricoes_horario }
        });
        setAbaForm(0);
        setModalModeloAberto(true);
    };

    const abrirEditarModelo = (modelo) => {
        setModoEdicao(true);
        setFormModelo({
            ...modelo,
            modulos: { ...modelo.modulos },
            regras: { ...MODELO_NOVO_VAZIO.regras, ...(modelo.regras || {}) },
            restricoes_horario: { ...MODELO_NOVO_VAZIO.restricoes_horario, ...(modelo.restricoes_horario || {}) }
        });
        setAbaForm(0);
        setModalModeloAberto(true);
    };

    const duplicarModelo = (modeloOriginal) => {
        setModoEdicao(false);
        setFormModelo({
            ...modeloOriginal,
            id: `modelo_${Date.now()}`,
            nome: `${modeloOriginal.nome} (Cópia)`,
            padrao: false,
            modulos: { ...modeloOriginal.modulos },
            regras: { ...(modeloOriginal.regras || {}) },
            restricoes_horario: { ...(modeloOriginal.restricoes_horario || {}) }
        });
        setAbaForm(0);
        setModalModeloAberto(true);
        enqueueSnackbar('Cópia gerada! Faça os ajustes e salve para criar o novo perfil.', { variant: 'info' });
    };

    const handleSalvarModelo = async () => {
        if (!formModelo.nome.trim()) {
            enqueueSnackbar('Informe um nome para o modelo de perfil.', { variant: 'warning' });
            return;
        }

        try {
            setSalvandoModelo(true);
            if (modoEdicao) {
                await api.put(`/auth/permissions/modelos/${formModelo.id}`, formModelo);
                enqueueSnackbar('Modelo de perfil atualizado com sucesso!', { variant: 'success' });
            } else {
                await api.post('/auth/permissions/modelos', formModelo);
                enqueueSnackbar('Novo modelo de perfil criado com sucesso!', { variant: 'success' });
            }
            setModalModeloAberto(false);
            carregarTudo();
        } catch (error) {
            enqueueSnackbar(error.response?.data?.error || 'Erro ao salvar o modelo de perfil.', { variant: 'error' });
        } finally {
            setSalvandoModelo(false);
        }
    };

    const handleDefinirPadrao = async (modelo) => {
        try {
            await api.put(`/auth/permissions/modelos/${modelo.id}`, { ...modelo, padrao: true });
            enqueueSnackbar(`"${modelo.nome}" agora é o modelo padrão para novos operadores.`, { variant: 'success' });
            carregarTudo();
        } catch (error) {
            enqueueSnackbar(error.response?.data?.error || 'Erro ao definir modelo padrão.', { variant: 'error' });
        }
    };

    const confirmarExclusao = async () => {
        if (!modeloParaExcluir) return;
        try {
            setExcluindo(true);
            await api.delete(`/auth/permissions/modelos/${modeloParaExcluir.id}`);
            enqueueSnackbar(`Modelo "${modeloParaExcluir.nome}" excluído.`, { variant: 'success' });
            setModeloParaExcluir(null);
            carregarTudo();
        } catch (error) {
            enqueueSnackbar(error.response?.data?.error || 'Erro ao excluir modelo.', { variant: 'error' });
        } finally {
            setExcluindo(false);
        }
    };

    const handleAplicarEmLote = async () => {
        if (!modeloParaAplicar) return;
        try {
            setAplicando(true);
            const { data } = await api.post(`/auth/permissions/modelos/${modeloParaAplicar.id}/aplicar`, {
                incluir_eventos_especificos: incluirEventosEspecificos,
                incluir_preferencias_tela: incluirPreferenciasTela,
                incluir_regras: incluirRegras,
                incluir_horario: incluirHorario
            });
            const qtd = data?.data?.atualizados ?? 0;
            enqueueSnackbar(`Modelo "${modeloParaAplicar.nome}" aplicado a ${qtd} operador(es).`, { variant: 'success' });
            setModeloParaAplicar(null);
            carregarTudo();
        } catch (error) {
            enqueueSnackbar(error.response?.data?.error || 'Erro ao aplicar modelo.', { variant: 'error' });
        } finally {
            setAplicando(false);
        }
    };

    const salvarPolitica = async (tipo) => {
        try {
            setSalvandoPolitica(true);
            await api.put(`/auth/permissions/politicas/${tipo}`, politicas[tipo]);
            enqueueSnackbar(`Diretrizes de ${tipo.toUpperCase()} salvas com sucesso!`, { variant: 'success' });
        } catch (error) {
            enqueueSnackbar(error.response?.data?.error || 'Erro ao salvar diretrizes.', { variant: 'error' });
        } finally {
            setSalvandoPolitica(false);
        }
    };

    const aplicarPreset = (chavesAtivas) => {
        const setAtivas = new Set(chavesAtivas);
        const novoMapa = Object.fromEntries(MODULOS.map(m => [m.key, setAtivas.has(m.key)]));
        setFormModelo(prev => ({
            ...prev,
            modulos: novoMapa,
            pagina_inicial: prev.pagina_inicial && !setAtivas.has(prev.pagina_inicial) ? '' : prev.pagina_inicial
        }));
    };

    const alternarDiaSemana = (diaValor) => {
        const atuais = formModelo.restricoes_horario?.dias_semana || [];
        const existe = atuais.includes(diaValor);
        const novos = existe ? atuais.filter(d => d !== diaValor) : [...atuais, diaValor];
        setFormModelo(prev => ({
            ...prev,
            restricoes_horario: {
                ...prev.restricoes_horario,
                dias_semana: novos
            }
        }));
    };

    return (
        <Box sx={{
            p: { xs: 2, sm: 3, md: 4 },
            maxWidth: 1600,
            mx: 'auto',
            width: '100%',
            boxSizing: 'border-box'
        }}>
            {/* Cabeçalho */}
            <PageHeader
                title="Perfis de Acesso"
                subtitle="Central de governança: modelos de permissões para operadores web, diretrizes do portal do produtor, segurança da central de CFTV e travas do portal de empresas."
                action={
                    abaPrincipal === 0 ? (
                        <Stack direction="row" spacing={1.5} alignItems="center">
                            <Button
                                variant="outlined"
                                startIcon={<PeopleIcon />}
                                onClick={() => navigate('/usuarios')}
                                sx={botaoSecundario}
                            >
                                Ver Operadores
                            </Button>
                            <NeonButton
                                variant="contained"
                                startIcon={<AddIcon />}
                                onClick={abrirCriarModelo}
                            >
                                Novo Modelo de Perfil
                            </NeonButton>
                        </Stack>
                    ) : null
                }
            />

            {/* ABAS SUPERIORES DE ESCOPO */}
            <Tabs
                value={abaPrincipal}
                onChange={(_, v) => setAbaPrincipal(v)}
                variant="scrollable"
                scrollButtons="auto"
                sx={{
                    mb: 3,
                    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                    '& .MuiTab-root': {
                        color: cores.textoSecundario,
                        fontSize: '0.875rem',
                        textTransform: 'none',
                        minHeight: 48,
                        gap: 1,
                        '&.Mui-selected': { color: cores.primaria, fontWeight: 700 }
                    },
                    '& .MuiTabs-indicator': { bgcolor: cores.primaria }
                }}
            >
                <Tab icon={<PeopleIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Operadores do Sistema Web" />
                <Tab icon={<EngineeringIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Equipe de Produção (Portal do Produtor)" />
                <Tab icon={<VideocamIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Central de Monitoramento (CFTV Local)" />
                <Tab icon={<BusinessIcon sx={{ fontSize: 18 }} />} iconPosition="start" label="Portal de Empresas & Prestadores" />
            </Tabs>

            {/* ABA 0: OPERADORES DO SISTEMA WEB */}
            {abaPrincipal === 0 && (
                <Box>
                    {/* KPIs */}
                    <Grid container spacing={2.5} sx={{ mb: 3 }}>
                        <Grid item xs={12} sm={6} md={3}>
                            <KpiCard
                                title="Modelos Cadastrados"
                                value={metricas.total}
                                icon={<VerifiedUserIcon />}
                                color={cores.primaria}
                                caption="Funções com regras pré-definidas"
                            />
                        </Grid>
                        <Grid item xs={12} sm={6} md={3}>
                            <KpiCard
                                title="Modelo Padrão Ativo"
                                value={metricas.nomePadrao}
                                icon={<StarIcon />}
                                color={cores.alerta}
                                caption="Herdado em novos operadores"
                            />
                        </Grid>
                        <Grid item xs={12} sm={6} md={3}>
                            <KpiCard
                                title="Operadores Ativos"
                                value={metricas.operadoresAtivos}
                                icon={<PeopleIcon />}
                                color={funcao.sucesso}
                                caption="Acessando o sistema web"
                            />
                        </Grid>
                        <Grid item xs={12} sm={6} md={3}>
                            <KpiCard
                                title="Perfis com Restrições"
                                value={metricas.comRestricoes}
                                icon={<SecurityIcon />}
                                color={cores.secundariaClara}
                                caption="Travas granulares ou horários"
                            />
                        </Grid>
                    </Grid>

                    {/* Lista de Modelos */}
                    {loading ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                            <CircularProgress sx={{ color: cores.primaria }} />
                        </Box>
                    ) : (
                        <Grid container spacing={2.5}>
                            {modelos.map((modelo) => {
                                const qtdModulosAtivos = Object.values(modelo.modulos || {}).filter(Boolean).length;
                                const temTravas = Object.values(modelo.regras || {}).some(Boolean);
                                const temHorario = modelo.restricoes_horario?.ativo;

                                return (
                                    <Grid item xs={12} lg={6} key={modelo.id}>
                                        <GlassCard sx={{
                                            p: 2.5,
                                            height: '100%',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            border: modelo.padrao ? '1px solid rgba(0, 212, 255, 0.4)' : undefined,
                                            boxShadow: modelo.padrao ? '0 0 20px rgba(0, 212, 255, 0.08)' : undefined
                                        }}>
                                            {/* Topo do Card */}
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.5, gap: 1 }}>
                                                <Box sx={{ minWidth: 0, flex: 1 }}>
                                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 0.5 }}>
                                                        <Typography variant="h6" sx={{ fontWeight: 700, color: cores.textoForte, fontSize: '1.0625rem' }}>
                                                            {modelo.nome}
                                                        </Typography>
                                                        {modelo.padrao && (
                                                            <Chip
                                                                icon={<StarIcon sx={{ fontSize: '14px !important', color: '#FFB800 !important' }} />}
                                                                label="PADRÃO DO SISTEMA"
                                                                size="small"
                                                                sx={{
                                                                    bgcolor: 'rgba(255, 184, 0, 0.12)',
                                                                    color: cores.alerta,
                                                                    border: '1px solid rgba(255, 184, 0, 0.4)',
                                                                    fontWeight: 700,
                                                                    fontSize: '0.6875rem'
                                                                }}
                                                            />
                                                        )}
                                                    </Box>
                                                    <Typography variant="body2" sx={{ color: cores.textoSecundario, fontSize: '0.8125rem' }}>
                                                        {modelo.descricao || 'Sem descrição cadastrada.'}
                                                    </Typography>
                                                </Box>

                                                <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
                                                    <Tooltip title="Editar Modelo">
                                                        <IconButton
                                                            size="small"
                                                            onClick={() => abrirEditarModelo(modelo)}
                                                            sx={{ color: cores.primaria, '&:hover': { bgcolor: tom(cores.primaria, 0.1) } }}
                                                        >
                                                            <EditIcon sx={{ fontSize: 18 }} />
                                                        </IconButton>
                                                    </Tooltip>
                                                    <Tooltip title="Duplicar">
                                                        <IconButton
                                                            size="small"
                                                            onClick={() => duplicarModelo(modelo)}
                                                            sx={{ color: 'rgba(255,255,255,0.7)', '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.1)' } }}
                                                        >
                                                            <CopyIcon sx={{ fontSize: 18 }} />
                                                        </IconButton>
                                                    </Tooltip>
                                                    {!modelo.padrao && (
                                                        <Tooltip title="Excluir">
                                                            <IconButton
                                                                size="small"
                                                                onClick={() => setModeloParaExcluir(modelo)}
                                                                sx={{ color: cores.erro, '&:hover': { bgcolor: 'rgba(239, 68, 68, 0.1)' } }}
                                                            >
                                                                <DeleteIcon sx={{ fontSize: 18 }} />
                                                            </IconButton>
                                                        </Tooltip>
                                                    )}
                                                </Stack>
                                            </Box>

                                            {/* Chips */}
                                            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
                                                <Chip
                                                    icon={<DevicesIcon sx={{ fontSize: 14 }} />}
                                                    label={
                                                        modelo.modo_tela === 'quiosque'
                                                            ? 'Modo: Quiosque (Travado)'
                                                            : modelo.modo_tela === 'tela_cheia'
                                                                ? 'Modo: Tela Cheia'
                                                                : 'Modo: Normal (com Menu)'
                                                    }
                                                    size="small"
                                                    sx={{
                                                        bgcolor: modelo.modo_tela === 'quiosque' ? 'rgba(239, 68, 68, 0.12)' : tom(cores.primaria, 0.08),
                                                        color: modelo.modo_tela === 'quiosque' ? '#F87171' : cores.primaria,
                                                        border: `1px solid ${modelo.modo_tela === 'quiosque' ? 'rgba(239, 68, 68, 0.3)' : tom(cores.primaria, 0.25)}`,
                                                        fontSize: '0.75rem',
                                                        fontWeight: 600
                                                    }}
                                                />
                                                <Chip
                                                    label={`Início: ${modelo.pagina_inicial ? MODULOS.find(m => m.key === modelo.pagina_inicial)?.label || modelo.pagina_inicial : 'Automática'}`}
                                                    size="small"
                                                    sx={{
                                                        bgcolor: 'rgba(255,255,255,0.05)',
                                                        color: cores.textoForte,
                                                        border: '1px solid rgba(255,255,255,0.12)',
                                                        fontSize: '0.75rem'
                                                    }}
                                                />
                                                <Chip
                                                    label={`${qtdModulosAtivos}/${MODULOS.length} módulos ativos`}
                                                    size="small"
                                                    sx={{
                                                        bgcolor: qtdModulosAtivos > 0 ? 'rgba(16, 185, 129, 0.12)' : 'rgba(255,255,255,0.05)',
                                                        color: qtdModulosAtivos > 0 ? cores.sucesso : 'rgba(255,255,255,0.5)',
                                                        border: `1px solid ${qtdModulosAtivos > 0 ? 'rgba(16, 185, 129, 0.3)' : 'rgba(255,255,255,0.1)'}`,
                                                        fontSize: '0.75rem'
                                                    }}
                                                />
                                                {temTravas && (
                                                    <Chip
                                                        icon={<LockIcon sx={{ fontSize: 13 }} />}
                                                        label="Travas Ativas"
                                                        size="small"
                                                        sx={{
                                                            bgcolor: 'rgba(168, 85, 247, 0.12)',
                                                            color: '#C084FC',
                                                            border: '1px solid rgba(168, 85, 247, 0.3)',
                                                            fontSize: '0.75rem'
                                                        }}
                                                    />
                                                )}
                                                {temHorario && (
                                                    <Chip
                                                        icon={<ScheduleIcon sx={{ fontSize: 13 }} />}
                                                        label={`Turno: ${modelo.restricoes_horario.hora_inicio} às ${modelo.restricoes_horario.hora_fim}`}
                                                        size="small"
                                                        sx={{
                                                            bgcolor: 'rgba(245, 158, 11, 0.12)',
                                                            color: cores.alerta,
                                                            border: '1px solid rgba(245, 158, 11, 0.3)',
                                                            fontSize: '0.75rem'
                                                        }}
                                                    />
                                                )}
                                            </Stack>

                                            {/* Módulos Liberados */}
                                            <Box sx={{ flex: 1, mb: 2 }}>
                                                <Typography variant="caption" sx={{ color: cores.textoSecundario, display: 'block', mb: 0.75, fontWeight: 600 }}>
                                                    MÓDULOS LIBERADOS:
                                                </Typography>
                                                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                                                    {MODULOS.filter(m => modelo.modulos?.[m.key]).map(m => (
                                                        <Chip
                                                            key={m.key}
                                                            label={m.label}
                                                            size="small"
                                                            sx={{
                                                                height: 20,
                                                                fontSize: '0.6875rem',
                                                                bgcolor: tom(cores.primaria, 0.06),
                                                                color: 'rgba(255,255,255,0.85)',
                                                                border: '1px solid rgba(0, 212, 255, 0.15)'
                                                            }}
                                                        />
                                                    ))}
                                                    {qtdModulosAtivos === 0 && (
                                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontStyle: 'italic' }}>
                                                            Nenhum módulo liberado.
                                                        </Typography>
                                                    )}
                                                </Box>
                                            </Box>

                                            <Divider sx={{ borderColor: 'rgba(255, 255, 255, 0.08)', my: 1.5 }} />

                                            {/* Rodapé do Card */}
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
                                                <Typography variant="caption" sx={{ color: cores.textoSecundario, fontSize: '0.6875rem' }}>
                                                    {modelo.atualizado_em ? `Atualizado em ${formatarMomento(modelo.atualizado_em)}` : ''}
                                                </Typography>

                                                <Stack direction="row" spacing={1}>
                                                    {!modelo.padrao && (
                                                        <Button
                                                            size="small"
                                                            variant="text"
                                                            onClick={() => handleDefinirPadrao(modelo)}
                                                            sx={{ fontSize: '0.75rem', color: cores.alerta, textTransform: 'none' }}
                                                        >
                                                            Definir como Padrão
                                                        </Button>
                                                    )}
                                                    <Button
                                                        size="small"
                                                        variant="outlined"
                                                        startIcon={<AplicarIcon />}
                                                        onClick={() => setModeloParaAplicar(modelo)}
                                                        sx={{
                                                            fontSize: '0.75rem',
                                                            color: cores.primaria,
                                                            borderColor: tom(cores.primaria, 0.3),
                                                            textTransform: 'none',
                                                            '&:hover': { borderColor: cores.primaria, bgcolor: tom(cores.primaria, 0.08) }
                                                        }}
                                                    >
                                                        Aplicar aos Operadores
                                                    </Button>
                                                </Stack>
                                            </Box>
                                        </GlassCard>
                                    </Grid>
                                );
                            })}
                        </Grid>
                    )}
                </Box>
            )}

            {/* ABA 1: EQUIPE DE PRODUÇÃO (PORTAL DO PRODUTOR) */}
            {abaPrincipal === 1 && (
                <Stack spacing={3}>
                    <Alert severity="info" sx={{ bgcolor: tom(cores.primaria, 0.08), color: cores.textoForte, border: '1px solid rgba(0, 212, 255, 0.2)' }}>
                        <b>Isolamento de Segurança por Evento:</b> Os produtores possuem credenciais isoladas cadastradas diretamente na aba de <b>Produção</b> de cada evento. Eles acessam o <b>Portal do Produtor</b> (mobile-first) e não possuem acesso às telas administrativas nem a dados globais do sistema.
                    </Alert>

                    <Grid container spacing={3}>
                        {/* Matriz dos 4 Papéis de Produção */}
                        <Grid item xs={12} md={7}>
                            <GlassCard sx={{ p: 3, height: '100%' }}>
                                <Typography variant="h6" sx={{ fontWeight: 700, color: cores.primaria, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <EngineeringIcon /> Papéis da Produção & Matriz de Acesso
                                </Typography>
                                <Stack spacing={2}>
                                    <Box sx={{ p: 2, borderRadius: 1.5, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)' }}>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                                            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: cores.primaria }}>Produtor Geral</Typography>
                                            <Chip label="Acesso Amplo de Campo" size="small" sx={{ bgcolor: tom(cores.primaria, 0.1), color: cores.primaria, fontSize: '0.75rem' }} />
                                        </Box>
                                        <Typography variant="body2" sx={{ color: cores.textoSecundario, fontSize: '0.8125rem' }}>
                                            Visualiza todas as áreas do evento, orçamentos, aprovação de presenças da equipe e edição de plantas colaborativas.
                                        </Typography>
                                    </Box>

                                    <Box sx={{ p: 2, borderRadius: 1.5, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)' }}>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                                            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: cores.sucesso }}>Produtor de Área</Typography>
                                            <Chip label="Escopo Delimitado" size="small" sx={{ bgcolor: 'rgba(16, 185, 129, 0.1)', color: cores.sucesso, fontSize: '0.75rem' }} />
                                        </Box>
                                        <Typography variant="body2" sx={{ color: cores.textoSecundario, fontSize: '0.8125rem' }}>
                                            Restrito exclusivamente à sua área física designada (Palco, Camarote, Portaria, Pista), checklists de montagem e tarefas locais.
                                        </Typography>
                                    </Box>

                                    <Box sx={{ p: 2, borderRadius: 1.5, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)' }}>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                                            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: cores.alerta }}>Técnico / Operacional</Typography>
                                            <Chip label="Execução de Tarefas" size="small" sx={{ bgcolor: 'rgba(245, 158, 11, 0.1)', color: cores.alerta, fontSize: '0.75rem' }} />
                                        </Box>
                                        <Typography variant="body2" sx={{ color: cores.textoSecundario, fontSize: '0.8125rem' }}>
                                            Acesso direto aos checklists e cronogramas operacionais de montagem e ponto de presença. Sem acesso a cachês ou orçamentos.
                                        </Typography>
                                    </Box>

                                    <Box sx={{ p: 2, borderRadius: 1.5, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)' }}>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                                            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: cores.secundariaClara }}>Financeiro de Produção</Typography>
                                            <Chip label="Conferência de Custos" size="small" sx={{ bgcolor: 'rgba(168, 85, 247, 0.1)', color: cores.secundariaClara, fontSize: '0.75rem' }} />
                                        </Box>
                                        <Typography variant="body2" sx={{ color: cores.textoSecundario, fontSize: '0.8125rem' }}>
                                            Visualização de diárias, valores de cachê acordados, chaves Pix e relatórios de despesas sem alterar plantas ou projetos técnicos.
                                        </Typography>
                                    </Box>
                                </Stack>
                            </GlassCard>
                        </Grid>

                        {/* Políticas e Diretrizes do Portal */}
                        <Grid item xs={12} md={5}>
                            <GlassCard sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>
                                <Typography variant="h6" sx={{ fontWeight: 700, color: cores.textoForte, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <ShieldIcon sx={{ color: cores.primaria }} /> Diretrizes do Portal do Produtor
                                </Typography>
                                <Stack spacing={2.5} sx={{ flex: 1 }}>
                                    <FormControlLabel
                                        control={
                                            <Switch
                                                checked={politicas.producao?.exigir_lgpd_primeiro_acesso ?? true}
                                                onChange={(e) => setPoliticas({
                                                    ...politicas,
                                                    producao: { ...politicas.producao, exigir_lgpd_primeiro_acesso: e.target.checked }
                                                })}
                                            />
                                        }
                                        label={
                                            <Box>
                                                <Typography variant="body2" sx={{ fontWeight: 600, color: cores.textoForte }}>Exigir Termo LGPD no Primeiro Acesso</Typography>
                                                <Typography variant="caption" sx={{ color: cores.textoSecundario }}>Obriga a leitura e aceite do termo antes de liberar a visualização de tarefas.</Typography>
                                            </Box>
                                        }
                                    />

                                    <FormControlLabel
                                        control={
                                            <Switch
                                                checked={politicas.producao?.ocultar_cache_tecnicos ?? true}
                                                onChange={(e) => setPoliticas({
                                                    ...politicas,
                                                    producao: { ...politicas.producao, ocultar_cache_tecnicos: e.target.checked }
                                                })}
                                            />
                                        }
                                        label={
                                            <Box>
                                                <Typography variant="body2" sx={{ fontWeight: 600, color: cores.textoForte }}>Ocultar Valores de Cachê para Técnicos</Typography>
                                                <Typography variant="caption" sx={{ color: cores.textoSecundario }}>Trava o acesso a valores pagos a terceiros em dispositivos de campo.</Typography>
                                            </Box>
                                        }
                                    />

                                    <FormControlLabel
                                        control={
                                            <Switch
                                                checked={politicas.producao?.permitir_ponto_geolocalizacao ?? true}
                                                onChange={(e) => setPoliticas({
                                                    ...politicas,
                                                    producao: { ...politicas.producao, permitir_ponto_geolocalizacao: e.target.checked }
                                                })}
                                            />
                                        }
                                        label={
                                            <Box>
                                                <Typography variant="body2" sx={{ fontWeight: 600, color: cores.textoForte }}>Registro de Presença Mobile</Typography>
                                                <Typography variant="caption" sx={{ color: cores.textoSecundario }}>Permite que a equipe registre entrada de turno pelo smartphone com validação.</Typography>
                                            </Box>
                                        }
                                    />
                                </Stack>

                                <Box sx={{ pt: 3, borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Button
                                        variant="outlined"
                                        startIcon={<OpenIcon />}
                                        onClick={() => navigate('/producao')}
                                        sx={botaoSecundario}
                                    >
                                        Abrir Produção
                                    </Button>
                                    <NeonButton
                                        variant="contained"
                                        startIcon={<SaveIcon />}
                                        onClick={() => salvarPolitica('producao')}
                                        disabled={salvandoPolitica}
                                    >
                                        Salvar Diretrizes
                                    </NeonButton>
                                </Box>
                            </GlassCard>
                        </Grid>
                    </Grid>
                </Stack>
            )}

            {/* ABA 2: CENTRAL DE MONITORAMENTO (CFTV LOCAL) */}
            {abaPrincipal === 2 && (
                <Stack spacing={3}>
                    <Alert severity="info" sx={{ bgcolor: tom(cores.primaria, 0.08), color: cores.textoForte, border: '1px solid rgba(0, 212, 255, 0.2)' }}>
                        <b>Posto Físico Local & Operação Offline:</b> Os operadores da Central de Monitoramento acessam o software instalado diretamente no computador físico do evento. Eles não possuem conta no painel web. Cada ação realizada no CFTV (assistir, movimentar joystick PTZ, ouvir ou falar) é registrada individualmente para conformidade LGPD e segurança do evento.
                    </Alert>

                    <Grid container spacing={3}>
                        {/* Perfis Operacionais de CFTV */}
                        <Grid item xs={12} md={6}>
                            <GlassCard sx={{ p: 3, height: '100%' }}>
                                <Typography variant="h6" sx={{ fontWeight: 700, color: cores.primaria, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <VideocamIcon /> Perfis de Câmeras & Joystick
                                </Typography>
                                <Stack spacing={2}>
                                    <Box sx={{ p: 2, borderRadius: 1.5, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)' }}>
                                        <Typography variant="subtitle2" sx={{ fontWeight: 700, color: cores.primaria, mb: 0.5 }}>Visualizador de Mural</Typography>
                                        <Typography variant="body2" sx={{ color: cores.textoSecundario, fontSize: '0.8125rem' }}>
                                            Acesso às grades de câmeras ao vivo, mosaicos e mural CFTV. Sem controle de rotação motorizada (PTZ) nem transmissão de áudio.
                                        </Typography>
                                    </Box>

                                    <Box sx={{ p: 2, borderRadius: 1.5, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)' }}>
                                        <Typography variant="subtitle2" sx={{ fontWeight: 700, color: cores.alerta, mb: 0.5 }}>Operador Avançado PTZ & Áudio</Typography>
                                        <Typography variant="body2" sx={{ color: cores.textoSecundario, fontSize: '0.8125rem' }}>
                                            Controle manual por joystick, movimento 360°, posições gravadas (presets), zoom óptico e canal de áudio bidirecional (alto-falante).
                                        </Typography>
                                    </Box>

                                    <Box sx={{ p: 2, borderRadius: 1.5, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)' }}>
                                        <Typography variant="subtitle2" sx={{ fontWeight: 700, color: cores.sucesso, mb: 0.5 }}>Auditoria Contínua (LGPD & LAI)</Typography>
                                        <Typography variant="body2" sx={{ color: cores.textoSecundario, fontSize: '0.8125rem' }}>
                                            Todo login, troca de câmera ou gravação gera uma trilha imutável vinculada ao login do operador da central.
                                        </Typography>
                                    </Box>
                                </Stack>
                            </GlassCard>
                        </Grid>

                        {/* Políticas da Central Local */}
                        <Grid item xs={12} md={6}>
                            <GlassCard sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>
                                <Typography variant="h6" sx={{ fontWeight: 700, color: cores.textoForte, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <SecurityIcon sx={{ color: cores.primaria }} /> Políticas de Segurança da Central
                                </Typography>
                                <Stack spacing={2.5} sx={{ flex: 1 }}>
                                    <FormControl fullWidth size="small">
                                        <InputLabel>Tempo de Bloqueio por Inatividade</InputLabel>
                                        <Select
                                            label="Tempo de Bloqueio por Inatividade"
                                            value={politicas.central?.tempo_bloqueio_inatividade_min || 15}
                                            onChange={(e) => setPoliticas({
                                                ...politicas,
                                                central: { ...politicas.central, tempo_bloqueio_inatividade_min: Number(e.target.value) }
                                            })}
                                        >
                                            <MenuItem value={5}>5 minutos (alta segurança)</MenuItem>
                                            <MenuItem value={10}>10 minutos</MenuItem>
                                            <MenuItem value={15}>15 minutos (recomendado)</MenuItem>
                                            <MenuItem value={30}>30 minutos</MenuItem>
                                        </Select>
                                    </FormControl>

                                    <FormControlLabel
                                        control={
                                            <Switch
                                                checked={politicas.central?.exigir_confirmacao_ptz ?? true}
                                                onChange={(e) => setPoliticas({
                                                    ...politicas,
                                                    central: { ...politicas.central, exigir_confirmacao_ptz: e.target.checked }
                                                })}
                                            />
                                        }
                                        label={
                                            <Box>
                                                <Typography variant="body2" sx={{ fontWeight: 600, color: cores.textoForte }}>Confirmação para Assumir PTZ</Typography>
                                                <Typography variant="caption" sx={{ color: cores.textoSecundario }}>Evita que dois operadores movimentem a mesma câmera ao mesmo tempo.</Typography>
                                            </Box>
                                        }
                                    />

                                    <FormControlLabel
                                        control={
                                            <Switch
                                                checked={politicas.central?.audio_bidirecional_habilitado ?? true}
                                                onChange={(e) => setPoliticas({
                                                    ...politicas,
                                                    central: { ...politicas.central, audio_bidirecional_habilitado: e.target.checked }
                                                })}
                                            />
                                        }
                                        label={
                                            <Box>
                                                <Typography variant="body2" sx={{ fontWeight: 600, color: cores.textoForte }}>Habilitar Áudio Bidirecional (Alto-Falante)</Typography>
                                                <Typography variant="caption" sx={{ color: cores.textoSecundario }}>Permite falar pelos alto-falantes das câmeras compatíveis da portaria.</Typography>
                                            </Box>
                                        }
                                    />
                                </Stack>

                                <Box sx={{ pt: 3, borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Button
                                        variant="outlined"
                                        startIcon={<OpenIcon />}
                                        onClick={() => navigate('/monitor')}
                                        sx={botaoSecundario}
                                    >
                                        Ver Central de Monitoramento
                                    </Button>
                                    <NeonButton
                                        variant="contained"
                                        startIcon={<SaveIcon />}
                                        onClick={() => salvarPolitica('central')}
                                        disabled={salvandoPolitica}
                                    >
                                        Salvar Diretrizes
                                    </NeonButton>
                                </Box>
                            </GlassCard>
                        </Grid>
                    </Grid>
                </Stack>
            )}

            {/* ABA 3: PORTAL DE EMPRESAS & PRESTADORES */}
            {abaPrincipal === 3 && (
                <Stack spacing={3}>
                    <Alert severity="info" sx={{ bgcolor: tom(cores.primaria, 0.08), color: cores.textoForte, border: '1px solid rgba(0, 212, 255, 0.2)' }}>
                        <b>Portal das Empresas (empresa.nzt.app.br):</b> Os responsáveis das empresas contratadas acessam um portal exclusivo via e-mail e chave de acesso cifrada (AES-256-GCM / scrypt). As solicitações de alteração de equipe passam por aprovação de operadores autorizados no painel.
                    </Alert>

                    <Grid container spacing={3}>
                        {/* Fluxo de Solicitações */}
                        <Grid item xs={12} md={6}>
                            <GlassCard sx={{ p: 3, height: '100%' }}>
                                <Typography variant="h6" sx={{ fontWeight: 700, color: cores.primaria, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <BusinessIcon /> Fluxo de Solicitações das Empresas
                                </Typography>
                                <Stack spacing={2}>
                                    <Box sx={{ p: 2, borderRadius: 1.5, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)' }}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                                            <KeyIcon sx={{ fontSize: 16, color: cores.alerta }} />
                                            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: cores.textoForte }}>Autenticação por Chave Cifrada</Typography>
                                        </Box>
                                        <Typography variant="body2" sx={{ color: cores.textoSecundario, fontSize: '0.8125rem' }}>
                                            A chave é gerada pelo painel administrativo e conferida via hash seguro. Gerar nova chave revoga sessões anteriores instantaneamente.
                                        </Typography>
                                    </Box>

                                    <Box sx={{ p: 2, borderRadius: 1.5, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)' }}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                                            <ChecklistIcon sx={{ fontSize: 16, color: cores.sucesso }} />
                                            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: cores.textoForte }}>Controle de Cotas de Credenciamento</Typography>
                                        </Box>
                                        <Typography variant="body2" sx={{ color: cores.textoSecundario, fontSize: '0.8125rem' }}>
                                            A empresa credencia sua equipe dentro da cota autorizada para o evento, com envio de foto e documentos obrigatórios.
                                        </Typography>
                                    </Box>

                                    <Box sx={{ p: 2, borderRadius: 1.5, bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)' }}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                                            <LockIcon sx={{ fontSize: 16, color: cores.secundariaClara }} />
                                            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: cores.textoForte }}>Aprovação Obrigatória para Mudanças Críticas</Typography>
                                        </Box>
                                        <Typography variant="body2" sx={{ color: cores.textoSecundario, fontSize: '0.8125rem' }}>
                                            Substituições de equipe, exclusões e trocas de dados cadastrais geram solicitações pendentes na fila do operador.
                                        </Typography>
                                    </Box>
                                </Stack>
                            </GlassCard>
                        </Grid>

                        {/* Travas do Portal de Empresas */}
                        <Grid item xs={12} md={6}>
                            <GlassCard sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>
                                <Typography variant="h6" sx={{ fontWeight: 700, color: cores.textoForte, mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <ShieldIcon sx={{ color: cores.primaria }} /> Travas & Regras do Portal de Empresas
                                </Typography>
                                <Stack spacing={2.5} sx={{ flex: 1 }}>
                                    <FormControlLabel
                                        control={
                                            <Switch
                                                checked={politicas.empresas?.exigir_aprovacao_edicao_participante ?? true}
                                                onChange={(e) => setPoliticas({
                                                    ...politicas,
                                                    empresas: { ...politicas.empresas, exigir_aprovacao_edicao_participante: e.target.checked }
                                                })}
                                            />
                                        }
                                        label={
                                            <Box>
                                                <Typography variant="body2" sx={{ fontWeight: 600, color: cores.textoForte }}>Aprovação para Editar Participante</Typography>
                                                <Typography variant="caption" sx={{ color: cores.textoSecundario }}>Mudança de dados cadastrais após envio entra como solicitação pendente.</Typography>
                                            </Box>
                                        }
                                    />

                                    <FormControlLabel
                                        control={
                                            <Switch
                                                checked={politicas.empresas?.exigir_aprovacao_exclusao_participante ?? true}
                                                onChange={(e) => setPoliticas({
                                                    ...politicas,
                                                    empresas: { ...politicas.empresas, exigir_aprovacao_exclusao_participante: e.target.checked }
                                                })}
                                            />
                                        }
                                        label={
                                            <Box>
                                                <Typography variant="body2" sx={{ fontWeight: 600, color: cores.textoForte }}>Aprovação para Cancelar / Excluir</Typography>
                                                <Typography variant="caption" sx={{ color: cores.textoSecundario }}>Evita descredenciamento indevido no dia do evento sem validação da portaria.</Typography>
                                            </Box>
                                        }
                                    />

                                    <FormControlLabel
                                        control={
                                            <Switch
                                                checked={politicas.empresas?.exigir_aprovacao_exclusao_documento ?? true}
                                                onChange={(e) => setPoliticas({
                                                    ...politicas,
                                                    empresas: { ...politicas.empresas, exigir_aprovacao_exclusao_documento: e.target.checked }
                                                })}
                                            />
                                        }
                                        label={
                                            <Box>
                                                <Typography variant="body2" sx={{ fontWeight: 600, color: cores.textoForte }}>Aprovação para Trocar Documento</Typography>
                                                <Typography variant="caption" sx={{ color: cores.textoSecundario }}>Substituição de ASO, NR ou documento de segurança passa por auditoria.</Typography>
                                            </Box>
                                        }
                                    />

                                    <Grid container spacing={2}>
                                        <Grid item xs={12} sm={6}>
                                            <TextField
                                                label="Prazo Limite Pré-Cadastro (Horas antes)"
                                                type="number"
                                                fullWidth
                                                size="small"
                                                value={politicas.empresas?.horas_limite_pre_cadastro || 24}
                                                onChange={(e) => setPoliticas({
                                                    ...politicas,
                                                    empresas: { ...politicas.empresas, horas_limite_pre_cadastro: Number(e.target.value) }
                                                })}
                                            />
                                        </Grid>
                                    </Grid>
                                </Stack>

                                <Box sx={{ pt: 3, borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Button
                                        variant="outlined"
                                        startIcon={<OpenIcon />}
                                        onClick={() => navigate('/empresas')}
                                        sx={botaoSecundario}
                                    >
                                        Gerenciar Empresas
                                    </Button>
                                    <NeonButton
                                        variant="contained"
                                        startIcon={<SaveIcon />}
                                        onClick={() => salvarPolitica('empresas')}
                                        disabled={salvandoPolitica}
                                    >
                                        Salvar Diretrizes
                                    </NeonButton>
                                </Box>
                            </GlassCard>
                        </Grid>
                    </Grid>
                </Stack>
            )}

            {/* MODAL DE CRIAÇÃO / EDIÇÃO DO MODELO */}
            <Dialog
                open={modalModeloAberto}
                onClose={() => setModalModeloAberto(false)}
                maxWidth="md"
                fullWidth
                PaperProps={{
                    sx: {
                        bgcolor: cores.superficie,
                        border: '1px solid rgba(0, 212, 255, 0.3)',
                        borderRadius: 3,
                        color: cores.textoForte
                    }
                }}
            >
                <TituloModal
                    titulo={modoEdicao ? `Editar Modelo: ${formModelo.nome}` : 'Novo Modelo de Perfil'}
                    subtitulo="Configure os módulos liberados, modo de tela, travas operacionais e restrições de turno."
                    aoFechar={() => setModalModeloAberto(false)}
                />

                <DialogContent sx={{ p: { xs: 2, sm: 3 } }}>
                    <Tabs
                        value={abaForm}
                        onChange={(_, v) => setAbaForm(v)}
                        variant="scrollable"
                        scrollButtons="auto"
                        sx={{
                            mb: 2.5,
                            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                            '& .MuiTab-root': {
                                color: cores.textoSecundario,
                                fontSize: '0.8125rem',
                                textTransform: 'none',
                                minHeight: 44,
                                '&.Mui-selected': { color: cores.primaria, fontWeight: 700 }
                            },
                            '& .MuiTabs-indicator': { bgcolor: cores.primaria }
                        }}
                    >
                        <Tab icon={<VerifiedUserIcon sx={{ fontSize: 16 }} />} iconPosition="start" label="1. Identificação" />
                        <Tab icon={<TuneIcon sx={{ fontSize: 16 }} />} iconPosition="start" label="2. Módulos Autorizados" />
                        <Tab icon={<DevicesIcon sx={{ fontSize: 16 }} />} iconPosition="start" label="3. Posto & Tela" />
                        <Tab icon={<LockIcon sx={{ fontSize: 16 }} />} iconPosition="start" label="4. Travas Granulares" />
                        <Tab icon={<ScheduleIcon sx={{ fontSize: 16 }} />} iconPosition="start" label="5. Turno & Horário" />
                    </Tabs>

                    {/* ABA FORM 0: IDENTIFICAÇÃO */}
                    {abaForm === 0 && (
                        <Stack spacing={2.5}>
                            <TextField
                                label="Nome do Modelo / Cargo Operacional"
                                fullWidth
                                size="small"
                                value={formModelo.nome}
                                onChange={(e) => setFormModelo({ ...formModelo, nome: e.target.value })}
                                placeholder="Ex: Operador de Portaria / Catraca"
                            />
                            <TextField
                                label="Descrição da Função"
                                fullWidth
                                size="small"
                                multiline
                                rows={2}
                                value={formModelo.descricao}
                                onChange={(e) => setFormModelo({ ...formModelo, descricao: e.target.value })}
                                placeholder="Descreva quais são as responsabilidades e posto de trabalho deste cargo."
                            />
                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={formModelo.padrao}
                                        onChange={(e) => setFormModelo({ ...formModelo, padrao: e.target.checked })}
                                        sx={{ '& .Mui-checked': { color: cores.alerta } }}
                                    />
                                }
                                label={
                                    <Box>
                                        <Typography variant="body2" sx={{ fontWeight: 600, color: cores.textoForte }}>
                                            Definir como Modelo Padrão do Sistema
                                        </Typography>
                                        <Typography variant="caption" sx={{ color: cores.textoSecundario }}>
                                            Novos operadores cadastrados na tela de Usuários herdarão automaticamente este modelo.
                                        </Typography>
                                    </Box>
                                }
                            />
                        </Stack>
                    )}

                    {/* ABA FORM 1: MÓDULOS AUTORIZADOS */}
                    {abaForm === 1 && (
                        <Box>
                            <Box sx={{ mb: 2.5, p: 1.5, borderRadius: 1.5, bgcolor: tom(cores.primaria, 0.04), border: '1px solid rgba(0, 212, 255, 0.15)' }}>
                                <Typography variant="caption" sx={{ color: cores.primaria, fontWeight: 700, display: 'block', mb: 1 }}>
                                    PRESETS RÁPIDOS (1 CLIQUE):
                                </Typography>
                                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                    <Chip
                                        icon={<PresetIcon sx={{ fontSize: 14 }} />}
                                        label="Portaria / Check-in"
                                        size="small"
                                        onClick={() => aplicarPreset(['checkin', 'checkout', 'pessoas'])}
                                        sx={{ cursor: 'pointer', bgcolor: tom(cores.primaria, 0.12), color: cores.primaria }}
                                    />
                                    <Chip
                                        icon={<PresetIcon sx={{ fontSize: 14 }} />}
                                        label="Fiscalização de Áreas"
                                        size="small"
                                        onClick={() => aplicarPreset(['fiscalizacao', 'monitoramento', 'pessoas'])}
                                        sx={{ cursor: 'pointer', bgcolor: tom(cores.primaria, 0.12), color: cores.primaria }}
                                    />
                                    <Chip
                                        icon={<PresetIcon sx={{ fontSize: 14 }} />}
                                        label="Coordenação"
                                        size="small"
                                        onClick={() => aplicarPreset(['dashboard', 'checkin', 'checkout', 'fiscalizacao', 'monitoramento', 'pessoas', 'empresas', 'relatorios', 'veiculos', 'auditoria_documentos'])}
                                        sx={{ cursor: 'pointer', bgcolor: tom(cores.primaria, 0.12), color: cores.primaria }}
                                    />
                                    <Chip
                                        icon={<PresetIcon sx={{ fontSize: 14 }} />}
                                        label="Produção de Palco"
                                        size="small"
                                        onClick={() => aplicarPreset(['producao'])}
                                        sx={{ cursor: 'pointer', bgcolor: tom(cores.primaria, 0.12), color: cores.primaria }}
                                    />
                                    <Chip
                                        label="Marcar Todos"
                                        size="small"
                                        onClick={() => aplicarPreset(MODULOS.map(m => m.key))}
                                        sx={{ cursor: 'pointer', bgcolor: 'rgba(16, 185, 129, 0.15)', color: cores.sucesso }}
                                    />
                                    <Chip
                                        label="Limpar Todos"
                                        size="small"
                                        onClick={() => aplicarPreset([])}
                                        sx={{ cursor: 'pointer', bgcolor: 'rgba(239, 68, 68, 0.15)', color: cores.erro }}
                                    />
                                </Stack>
                            </Box>

                            <Grid container spacing={2}>
                                {MODULOS.map(mod => {
                                    const ativo = formModelo.modulos?.[mod.key] || false;
                                    return (
                                        <Grid item xs={12} sm={6} key={mod.key}>
                                            <Box sx={{
                                                p: 1.5,
                                                borderRadius: 1.5,
                                                bgcolor: ativo ? tom(cores.primaria, 0.06) : 'rgba(255, 255, 255, 0.02)',
                                                border: `1px solid ${ativo ? tom(cores.primaria, 0.3) : 'rgba(255, 255, 255, 0.08)'}`,
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center'
                                            }}>
                                                <Box sx={{ pr: 1 }}>
                                                    <Typography variant="body2" sx={{ fontWeight: 600, color: ativo ? cores.primaria : cores.textoForte }}>
                                                        {mod.label}
                                                    </Typography>
                                                    <Typography variant="caption" sx={{ color: cores.textoSecundario, display: 'block' }}>
                                                        {mod.descricao}
                                                    </Typography>
                                                </Box>
                                                <Switch
                                                    checked={ativo}
                                                    onChange={(e) => {
                                                        const novoMapa = { ...formModelo.modulos, [mod.key]: e.target.checked };
                                                        setFormModelo({
                                                            ...formModelo,
                                                            modulos: novoMapa,
                                                            pagina_inicial: formModelo.pagina_inicial === mod.key && !e.target.checked ? '' : formModelo.pagina_inicial
                                                        });
                                                    }}
                                                />
                                            </Box>
                                        </Grid>
                                    );
                                })}
                            </Grid>
                        </Box>
                    )}

                    {/* ABA FORM 2: POSTO & TELA */}
                    {abaForm === 2 && (
                        <Stack spacing={2.5}>
                            <FormControl fullWidth size="small">
                                <InputLabel>Página Inicial ao Entrar</InputLabel>
                                <Select
                                    label="Página Inicial ao Entrar"
                                    value={formModelo.pagina_inicial || ''}
                                    onChange={(e) => setFormModelo({ ...formModelo, pagina_inicial: e.target.value })}
                                >
                                    <MenuItem value=""><em>Automática (primeiro módulo permitido)</em></MenuItem>
                                    {MODULOS.filter(m => formModelo.modulos?.[m.key]).map(m => (
                                        <MenuItem key={m.key} value={m.key}>{m.label}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>

                            <FormControl fullWidth size="small">
                                <InputLabel>Modo de Tela do Posto</InputLabel>
                                <Select
                                    label="Modo de Tela do Posto"
                                    value={formModelo.modo_tela || 'normal'}
                                    onChange={(e) => setFormModelo({ ...formModelo, modo_tela: e.target.value })}
                                >
                                    <MenuItem value="normal">Normal (menu lateral e barra superior visíveis)</MenuItem>
                                    <MenuItem value="tela_cheia">Tela cheia (área útil 100%, sem menu lateral)</MenuItem>
                                    <MenuItem value="quiosque">Quiosque travado (totens e catracas fixas, saída com confirmação)</MenuItem>
                                </Select>
                            </FormControl>

                            <Alert severity="info" sx={{ bgcolor: tom(cores.primaria, 0.08), color: cores.textoForte, border: '1px solid rgba(0, 212, 255, 0.2)' }}>
                                No modo <b>Quiosque travado</b>, o operador não consegue navegar livremente fora do posto de trabalho e o botão de logout/encerramento fica protegido por confirmação.
                            </Alert>
                        </Stack>
                    )}

                    {/* ABA FORM 3: TRAVAS GRANULARES */}
                    {abaForm === 3 && (
                        <Stack spacing={2}>
                            <Typography variant="body2" sx={{ color: cores.textoSecundario, mb: 1 }}>
                                Restrinja ações críticas dentro das telas operacionais para garantir a conformidade e integridade dos dados:
                            </Typography>

                            <Box sx={{ p: 2, borderRadius: 1.5, bgcolor: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                                <FormControlLabel
                                    control={
                                        <Switch
                                            checked={formModelo.regras?.participantes_somente_leitura || false}
                                            onChange={(e) => setFormModelo({
                                                ...formModelo,
                                                regras: { ...formModelo.regras, participantes_somente_leitura: e.target.checked }
                                            })}
                                        />
                                    }
                                    label={
                                        <Box>
                                            <Typography variant="body2" sx={{ fontWeight: 600, color: cores.textoForte }}>
                                                Participantes em Modo Somente Leitura
                                            </Typography>
                                            <Typography variant="caption" sx={{ color: cores.textoSecundario }}>
                                                Permite apenas consultar nomes e QR Codes. Bloqueia novo cadastro, edição e exclusão de pessoas.
                                            </Typography>
                                        </Box>
                                    }
                                />
                            </Box>

                            <Box sx={{ p: 2, borderRadius: 1.5, bgcolor: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                                <FormControlLabel
                                    control={
                                        <Switch
                                            checked={formModelo.regras?.checkin_liberar_pendente || false}
                                            onChange={(e) => setFormModelo({
                                                ...formModelo,
                                                regras: { ...formModelo.regras, checkin_liberar_pendente: e.target.checked }
                                            })}
                                        />
                                    }
                                    label={
                                        <Box>
                                            <Typography variant="body2" sx={{ fontWeight: 600, color: cores.textoForte }}>
                                                Permitir Liberação de Check-in com Pendência Documental
                                            </Typography>
                                            <Typography variant="caption" sx={{ color: cores.textoSecundario }}>
                                                Se desativado, o operador não consegue forçar a entrada de participantes com documentos reprovados ou termos pendentes.
                                            </Typography>
                                        </Box>
                                    }
                                />
                            </Box>

                            <Box sx={{ p: 2, borderRadius: 1.5, bgcolor: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                                <FormControlLabel
                                    control={
                                        <Switch
                                            checked={formModelo.regras?.empresas_somente_leitura || false}
                                            onChange={(e) => setFormModelo({
                                                ...formModelo,
                                                regras: { ...formModelo.regras, empresas_somente_leitura: e.target.checked }
                                            })}
                                        />
                                    }
                                    label={
                                        <Box>
                                            <Typography variant="body2" sx={{ fontWeight: 600, color: cores.textoForte }}>
                                                Empresas & Prestadores em Modo Somente Consulta
                                            </Typography>
                                            <Typography variant="caption" sx={{ color: cores.textoSecundario }}>
                                                Impede alteração de cotas diárias e links de pré-cadastro das empresas contratadas.
                                            </Typography>
                                        </Box>
                                    }
                                />
                            </Box>

                            <Box sx={{ p: 2, borderRadius: 1.5, bgcolor: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                                <FormControlLabel
                                    control={
                                        <Switch
                                            checked={formModelo.regras?.bloquear_edicao_dados || false}
                                            onChange={(e) => setFormModelo({
                                                ...formModelo,
                                                regras: { ...formModelo.regras, bloquear_edicao_dados: e.target.checked }
                                            })}
                                        />
                                    }
                                    label={
                                        <Box>
                                            <Typography variant="body2" sx={{ fontWeight: 600, color: cores.textoForte }}>
                                                Bloqueio Completo de Edição de Dados no Campo
                                            </Typography>
                                            <Typography variant="caption" sx={{ color: cores.textoSecundario }}>
                                                Trava qualquer formulário de alteração de documentos, dados pessoais ou permissões a partir do posto.
                                            </Typography>
                                        </Box>
                                    }
                                />
                            </Box>
                        </Stack>
                    )}

                    {/* ABA FORM 4: TURNO & HORÁRIO */}
                    {abaForm === 4 && (
                        <Stack spacing={2.5}>
                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={formModelo.restricoes_horario?.ativo || false}
                                        onChange={(e) => setFormModelo({
                                            ...formModelo,
                                            restricoes_horario: { ...formModelo.restricoes_horario, ativo: e.target.checked }
                                        })}
                                    />
                                }
                                label={
                                    <Box>
                                        <Typography variant="body2" sx={{ fontWeight: 600, color: cores.textoForte }}>
                                            Ativar Restrição de Horário de Acesso (Janela de Turno)
                                        </Typography>
                                        <Typography variant="caption" sx={{ color: cores.textoSecundario }}>
                                            Bloqueia tentativas de login ou operações fora do período oficial autorizado.
                                        </Typography>
                                    </Box>
                                }
                            />

                            {formModelo.restricoes_horario?.ativo && (
                                <Stack spacing={2.5} sx={{ pl: { xs: 0, sm: 2 }, borderLeft: '2px solid rgba(0, 212, 255, 0.3)' }}>
                                    <FormControl fullWidth size="small">
                                        <InputLabel>Janela de Datas Autorizadas</InputLabel>
                                        <Select
                                            label="Janela de Datas Autorizadas"
                                            value={formModelo.restricoes_horario?.tipo_dias || 'apenas_evento'}
                                            onChange={(e) => setFormModelo({
                                                ...formModelo,
                                                restricoes_horario: { ...formModelo.restricoes_horario, tipo_dias: e.target.value }
                                            })}
                                        >
                                            <MenuItem value="apenas_evento">Apenas nos dias oficiais de realização do evento</MenuItem>
                                            <MenuItem value="montagem_e_evento">Dias de montagem, desmontagem e evento</MenuItem>
                                            <MenuItem value="livre">Qualquer data (restrito apenas ao horário do turno diário)</MenuItem>
                                        </Select>
                                    </FormControl>

                                    <Grid container spacing={2}>
                                        <Grid item xs={12} sm={6}>
                                            <TextField
                                                label="Horário de Início do Turno"
                                                type="time"
                                                fullWidth
                                                size="small"
                                                InputLabelProps={{ shrink: true }}
                                                value={formModelo.restricoes_horario?.hora_inicio || '06:00'}
                                                onChange={(e) => setFormModelo({
                                                    ...formModelo,
                                                    restricoes_horario: { ...formModelo.restricoes_horario, hora_inicio: e.target.value }
                                                })}
                                            />
                                        </Grid>
                                        <Grid item xs={12} sm={6}>
                                            <TextField
                                                label="Horário de Término do Turno"
                                                type="time"
                                                fullWidth
                                                size="small"
                                                InputLabelProps={{ shrink: true }}
                                                value={formModelo.restricoes_horario?.hora_fim || '23:59'}
                                                onChange={(e) => setFormModelo({
                                                    ...formModelo,
                                                    restricoes_horario: { ...formModelo.restricoes_horario, hora_fim: e.target.value }
                                                })}
                                            />
                                        </Grid>
                                    </Grid>

                                    <Box>
                                        <Typography variant="caption" sx={{ color: cores.textoSecundario, display: 'block', mb: 1, fontWeight: 600 }}>
                                            DIAS DA SEMANA AUTORIZADOS:
                                        </Typography>
                                        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                            {DIAS_SEMANA_OPCOES.map(d => {
                                                const selecionado = (formModelo.restricoes_horario?.dias_semana || []).includes(d.valor);
                                                return (
                                                    <Chip
                                                        key={d.valor}
                                                        label={d.rotulo}
                                                        size="small"
                                                        onClick={() => alternarDiaSemana(d.valor)}
                                                        sx={{
                                                            cursor: 'pointer',
                                                            bgcolor: selecionado ? tom(cores.primaria, 0.2) : 'rgba(255, 255, 255, 0.05)',
                                                            color: selecionado ? cores.primaria : 'rgba(255, 255, 255, 0.5)',
                                                            border: `1px solid ${selecionado ? cores.primaria : 'rgba(255, 255, 255, 0.1)'}`,
                                                            fontWeight: selecionado ? 700 : 500
                                                        }}
                                                    />
                                                );
                                            })}
                                        </Stack>
                                    </Box>
                                </Stack>
                            )}
                        </Stack>
                    )}
                </DialogContent>

                <DialogActions sx={{ px: 3, pb: 2.5, justifyContent: 'space-between' }}>
                    <Button onClick={() => setModalModeloAberto(false)} sx={{ color: cores.textoSecundario }}>
                        Cancelar
                    </Button>
                    <NeonButton
                        variant="contained"
                        onClick={handleSalvarModelo}
                        disabled={salvandoModelo}
                    >
                        {salvandoModelo ? 'Salvando...' : modoEdicao ? 'Salvar Alterações' : 'Criar Modelo'}
                    </NeonButton>
                </DialogActions>
            </Dialog>

            {/* MODAL DE APLICAÇÃO EM LOTE */}
            <Dialog
                open={Boolean(modeloParaAplicar)}
                onClose={() => setModeloParaAplicar(null)}
                maxWidth="sm"
                fullWidth
                PaperProps={{
                    sx: {
                        bgcolor: cores.superficie,
                        border: '1px solid rgba(0, 212, 255, 0.3)',
                        borderRadius: 3,
                        color: cores.textoForte
                    }
                }}
            >
                <TituloModal
                    titulo={`Sincronizar "${modeloParaAplicar?.nome}"`}
                    subtitulo="Esta ação atualizará as permissões de todos os operadores com o papel 'operador'."
                    aoFechar={() => setModeloParaAplicar(null)}
                />

                <DialogContent sx={{ p: 3 }}>
                    <Stack spacing={2}>
                        <FormControlLabel
                            control={
                                <Switch
                                    checked={incluirEventosEspecificos}
                                    onChange={(e) => setIncluirEventosEspecificos(e.target.checked)}
                                />
                            }
                            label={
                                <Box>
                                    <Typography variant="body2" sx={{ fontWeight: 600, color: cores.textoForte }}>
                                        Atualizar permissões por evento específico
                                    </Typography>
                                    <Typography variant="caption" sx={{ color: cores.textoSecundario }}>
                                        Aplica estes módulos a cada evento individual já vinculado aos operadores.
                                    </Typography>
                                </Box>
                            }
                        />

                        <FormControlLabel
                            control={
                                <Switch
                                    checked={incluirPreferenciasTela}
                                    onChange={(e) => setIncluirPreferenciasTela(e.target.checked)}
                                />
                            }
                            label={
                                <Box>
                                    <Typography variant="body2" sx={{ fontWeight: 600, color: cores.textoForte }}>
                                        Sincronizar página inicial e modo quiosque
                                    </Typography>
                                    <Typography variant="caption" sx={{ color: cores.textoSecundario }}>
                                        Define a tela de entrada ({modeloParaAplicar?.pagina_inicial || 'Automática'}) e o modo ({modeloParaAplicar?.modo_tela}).
                                    </Typography>
                                </Box>
                            }
                        />

                        <FormControlLabel
                            control={
                                <Switch
                                    checked={incluirRegras}
                                    onChange={(e) => setIncluirRegras(e.target.checked)}
                                />
                            }
                            label={
                                <Box>
                                    <Typography variant="body2" sx={{ fontWeight: 600, color: cores.textoForte }}>
                                        Sincronizar travas granulares
                                    </Typography>
                                    <Typography variant="caption" sx={{ color: cores.textoSecundario }}>
                                        Aplica travas de somente leitura e liberação documental a todos os operadores.
                                    </Typography>
                                </Box>
                            }
                        />

                        <FormControlLabel
                            control={
                                <Switch
                                    checked={incluirHorario}
                                    onChange={(e) => setIncluirHorario(e.target.checked)}
                                />
                            }
                            label={
                                <Box>
                                    <Typography variant="body2" sx={{ fontWeight: 600, color: cores.textoForte }}>
                                        Sincronizar restrições de horário e turno
                                    </Typography>
                                    <Typography variant="caption" sx={{ color: cores.textoSecundario }}>
                                        Aplica a janela de horário de acesso definida neste modelo.
                                    </Typography>
                                </Box>
                            }
                        />
                    </Stack>
                </DialogContent>

                <DialogActions sx={{ px: 3, pb: 2.5, justifyContent: 'space-between' }}>
                    <Button onClick={() => setModeloParaAplicar(null)} sx={{ color: cores.textoSecundario }}>
                        Cancelar
                    </Button>
                    <NeonButton
                        variant="contained"
                        onClick={handleAplicarEmLote}
                        disabled={aplicando}
                    >
                        {aplicando ? 'Aplicando...' : 'Confirmar e Aplicar a Todos'}
                    </NeonButton>
                </DialogActions>
            </Dialog>

            {/* MODAL DE EXCLUSÃO */}
            <Dialog
                open={Boolean(modeloParaExcluir)}
                onClose={() => setModeloParaExcluir(null)}
                maxWidth="xs"
                fullWidth
                PaperProps={{
                    sx: {
                        bgcolor: cores.superficie,
                        border: '1px solid rgba(239, 68, 68, 0.4)',
                        borderRadius: 3,
                        color: cores.textoForte
                    }
                }}
            >
                <TituloModal
                    titulo="Excluir Modelo de Perfil"
                    subtitulo={`Deseja realmente remover o modelo "${modeloParaExcluir?.nome}"?`}
                    aoFechar={() => setModeloParaExcluir(null)}
                />
                <DialogContent sx={{ p: 3 }}>
                    <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.8)' }}>
                        Esta ação removerá este modelo da lista. Os operadores que já foram criados anteriormente manterão suas permissões individuais intactas.
                    </Typography>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2.5, justifyContent: 'space-between' }}>
                    <Button onClick={() => setModeloParaExcluir(null)} sx={{ color: cores.textoSecundario }}>
                        Cancelar
                    </Button>
                    <Button
                        variant="contained"
                        color="error"
                        onClick={confirmarExclusao}
                        disabled={excluindo}
                        sx={{ bgcolor: cores.erro }}
                    >
                        {excluindo ? 'Excluindo...' : 'Sim, Excluir'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default PermissoesAcesso;
