import React, { useState, useEffect, useMemo } from 'react';
import {
    Dialog, DialogTitle, DialogContent, Box, Typography, Grid, Stack,
    Chip, CircularProgress, IconButton, FormControl,
    InputLabel, Select, MenuItem, Tooltip, Divider, Button, Alert, TextField
} from '@mui/material';
import {
    Badge as BadgeIcon,
    CorporateFare as CompanyIcon,
    Close as CloseIcon,
    Login as LoginIcon,
    VerifiedUser as VerifiedIcon,
    Warning as WarningIcon,
    Cancel as CancelIcon,
    Description as DocIcon,
    LockOpen as LiberarIcon,
    AssignmentReturn as DevolverIcon,
    Logout as SaidaIcon
} from '@mui/icons-material';
import GlassCard from '../common/GlassCard';
import NeonButton from '../common/NeonButton';
import AuthorizedAreasChips from '../common/AuthorizedAreasChips';
import UniversalPulseiraInput from '../common/UniversalPulseiraInput';
import PessoaFoto from '../common/PessoaFoto';
import LeitorQrCamera from '../common/LeitorQrCameraSobDemanda';
import useFecharComVoltar from '../../hooks/useFecharComVoltar';
import api from '../../services/api';
import ListaDocumentos from '../documentos/ListaDocumentos';
import { SITUACAO_DOCUMENTAL, MOTIVO_PENDENCIA } from '../documentos/documentosUtils';

import { comoRotulo } from '../../utils/formatadores';
export const ModalCredenciamento = ({
    open,
    pessoa,
    onClose,
    onConfirmar,
    pulseiraTypes = [],
    eventAreas: _eventAreas = [],
    loading = false,
    // Mostra o botão que lê o número da pulseira pela câmera do aparelho
    permitirCamera = false,
    // Entrada bloqueada (409 ENTRADA_BLOQUEADA) para esta pessoa: { mensagem, liberavel, erroLiberacao }
    bloqueioEntrada = null,
    onLiberarReentrada,
    liberandoReentrada = false,
    // Quem controla a entrada (admin, supervisor, operador de check-in) vê o botão de liberar
    podeLiberarReentrada = false,
    // Registra a saída de quem está dentro (aviso ENTRADA_BLOQUEADA sem liberação): retorna { success, error }
    onRegistrarSaida = null
}) => {
    const [numeroPulseira, setNumeroPulseira] = useState('');
    const [ultimoCodigoCamera, setUltimoCodigoCamera] = useState('');
    const [lendoCamera, setLendoCamera] = useState(false);
    useFecharComVoltar(open, onClose);
    const [selectedTipoPulseira, setSelectedTipoPulseira] = useState('');
    const [erroValidacao, setErroValidacao] = useState('');

    // Consulta de documentos da pessoa
    const [openDocsModal, setOpenDocsModal] = useState(false);
    const [pessoaDocs, setPessoaDocs] = useState([]);
    const [loadingDocs, setLoadingDocs] = useState(false);

    // Situação documental (pendências por função) e liberação manual do turno
    const [situacao, setSituacao] = useState(null);
    const [liberando, setLiberando] = useState(false);

    // Saída registrada nesta ficha (pessoa que estava dentro): troca o aviso por confirmação
    const [saidaRegistrada, setSaidaRegistrada] = useState(null); // { pessoaId, offline }
    const [registrandoSaida, setRegistrandoSaida] = useState(false);
    const [erroSaida, setErroSaida] = useState('');

    // Status de pulseira: em uso hoje ou pendência anterior
    const [statusPulseira, setStatusPulseira] = useState(null);
    const [motivoDevolucao, setMotivoDevolucao] = useState('');
    const [registrandoMotivo, setRegistrandoMotivo] = useState(false);

    // Status de documentação com liberação diária
    const [statusDocumentalComLiberacao, setStatusDocumentalComLiberacao] = useState(null);
    const [motivoLiberarHoje, setMotivoLiberarHoje] = useState('');
    const [liberandoHoje, setLiberandoHoje] = useState(false);

    const carregarSituacao = async () => {
        if (!pessoa?.id) return;
        try {
            const termo = pessoa.cpf || pessoa.nome_completo || pessoa.nome || '';
            const resp = await api.get('/documentos/colaboradores', { params: { search: termo, limit: 20 } });
            setSituacao((resp.data?.data || []).find(p => p.id === pessoa.id) || null);
        } catch {
            setSituacao(null);
        }
    };

    const carregarStatusPulseira = async () => {
        if (!pessoa?.id) return;
        try {
            const resp = await api.get(`/pulseiras/status/${pessoa.id}`);
            setStatusPulseira(resp.data?.data || null);
        } catch (err) {
            console.warn('Erro ao carregar status de pulseira:', err.message);
            setStatusPulseira(null);
        }
    };

    const carregarStatusDocumentalComLiberacao = async () => {
        if (!pessoa?.id) return;
        try {
            const resp = await api.get(`/audit/pessoas/${pessoa.id}/status-documental`);
            setStatusDocumentalComLiberacao(resp.data?.data || null);
        } catch (err) {
            console.warn('Erro ao carregar status documental:', err.message);
            setStatusDocumentalComLiberacao(null);
        }
    };

    const handleLiberarTurno = async () => {
        if (!pessoa?.id) return;
        try {
            setLiberando(true);
            await api.post(`/pessoas/${pessoa.id}/liberacao-manual`, { motivo: 'Liberado pelo operador na estação de credenciamento' });
            await carregarSituacao();
        } catch (err) {
            setErroValidacao(err.response?.data?.error || 'Não foi possível liberar no turno.');
        } finally {
            setLiberando(false);
        }
    };

    const handleRegistrarSaida = async () => {
        if (!pessoa?.id || !onRegistrarSaida || registrandoSaida) return;
        setRegistrandoSaida(true);
        setErroSaida('');
        try {
            const r = await onRegistrarSaida(pessoa.id, pessoa.numero_pulseira);
            if (r?.success) {
                setSaidaRegistrada({ pessoaId: pessoa.id, offline: !!r.offline });
                setUltimoCodigoCamera(''); // a leitura da saída não pode aparecer na próxima ficha
            }
            else if (!r?.turnoAnterior) setErroSaida(r?.error || 'Não foi possível registrar a saída.');
        } finally {
            setRegistrandoSaida(false);
        }
    };

    const handleCarregarDocs = async () => {
        if (!pessoa?.id) return;
        try {
            setLoadingDocs(true);
            setOpenDocsModal(true);
            const resp = await api.get(`/documentos/pessoa/${pessoa.id}`);
            const nomesTipo = Object.fromEntries((situacao?.documentos || []).map(d => [d.id, d.tipo_nome]));
            setPessoaDocs((resp.data?.data || []).map(d => ({ ...d, tipo_entidade: 'pessoa', tipo_nome: nomesTipo[d.id] || null })));
        } catch (err) {
            console.warn('Erro ao carregar documentos da pessoa:', err.message);
            setPessoaDocs([]);
        } finally {
            setLoadingDocs(false);
        }
    };

    // Sincronizar quando abrir o modal ou mudar a pessoa
    useEffect(() => {
        if (open && pessoa) {
            // Caixa da pulseira começa vazia: o número anterior não pode ser confirmado sem ser lido/digitado
            setNumeroPulseira('');
            setUltimoCodigoCamera(''); // cada pessoa começa sem o código lido da anterior
            setErroValidacao('');
            setSituacao(null);
            setSaidaRegistrada(null);
            setErroSaida('');
            setMotivoDevolucao('');
            setStatusPulseira(null);
            setStatusDocumentalComLiberacao(null);
            setMotivoLiberarHoje('');
            carregarSituacao();
            carregarStatusPulseira();
            carregarStatusDocumentalComLiberacao();

            // Auto-selecionar o tipo de pulseira se a pessoa já tiver ou se houver padrão
            if (pessoa.tipo_pulseira_id) {
                setSelectedTipoPulseira(pessoa.tipo_pulseira_id);
            } else if (pulseiraTypes.length > 0) {
                setSelectedTipoPulseira(pulseiraTypes[0].id);
            }
        } else {
            setNumeroPulseira('');
            setErroValidacao('');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, pessoa, pulseiraTypes]);

    const [devolvendo, setDevolvendo] = useState(false);
    // Id da pessoa cuja pulseira foi devolvida agora (esconde o aviso sem mutar a prop)
    const [devolvidaId, setDevolvidaId] = useState(null);

    const handleDevolverPulseira = async () => {
        if (!pessoa?.id || devolvendo) return;
        try {
            setDevolvendo(true);
            setErroValidacao('');
            const eventoId = localStorage.getItem('active_evento_id');
            await api.post('/pulseiras/encerrar', {
                pessoa_id: pessoa.id,
                motivo: 'devolvida',
                observacao: 'Devolução registrada no credenciamento'
            }, { params: { evento_id: eventoId } });
            setNumeroPulseira('');
            setDevolvidaId(pessoa.id);
        } catch (err) {
            setErroValidacao(err.response?.data?.error || 'Não foi possível registrar a devolução da pulseira.');
        } finally {
            setDevolvendo(false);
        }
    };

    // Lançamento errado: desfaz a pulseira em uso; a anterior volta (se houve troca) com a mesma hora de entrada
    const [desfazendo, setDesfazendo] = useState(false);
    const [desfeitaInfo, setDesfeitaInfo] = useState(null); // { id, restaurado } — esconde o botão e mostra o aviso

    const handleDesfazerLancamento = async () => {
        if (!pessoa?.id || desfazendo) return;
        try {
            setDesfazendo(true);
            setErroValidacao('');
            const eventoId = localStorage.getItem('active_evento_id');
            const { data } = await api.post('/pulseiras/anular', {
                pessoa_id: pessoa.id,
                observacao: 'Pulseira lançada errada no credenciamento'
            }, { params: { evento_id: eventoId } });
            const r = data?.data || data || {};
            setNumeroPulseira(r.numero_restaurado || '');
            setDesfeitaInfo({ id: pessoa.id, restaurado: r.numero_restaurado || null });
        } catch (err) {
            setErroValidacao(err.response?.data?.error || 'Não foi possível desfazer o lançamento da pulseira.');
        } finally {
            setDesfazendo(false);
        }
    };

    const handleRegistrarMotivoPendencia = async () => {
        if (!pessoa?.id || !statusPulseira?.pendencia || !motivoDevolucao.trim() || registrandoMotivo) return;
        try {
            setRegistrandoMotivo(true);
            setErroValidacao('');
            const eventoId = localStorage.getItem('active_evento_id');
            await api.post(`/pulseiras/pendencia/${pessoa.id}`, {
                numero: statusPulseira.pendencia.numero,
                dataCheckin: statusPulseira.pendencia.dataCheckin,
                motivo: motivoDevolucao.trim()
            }, { params: { evento_id: eventoId } });
            setMotivoDevolucao('');
            await carregarStatusPulseira();
        } catch (err) {
            setErroValidacao(err.response?.data?.error || 'Não foi possível registrar o motivo.');
        } finally {
            setRegistrandoMotivo(false);
        }
    };

    // Atalho Escape para fechar
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape' && open && !loading) {
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [open, loading, onClose]);

    const [filtroFase, setFiltroFase] = useState('todas');

    // Filtrar tipos de pulseira de acordo com a fase selecionada pelo operador ou do evento
    const tiposPulseiraFiltrados = useMemo(() => {
        if (!pulseiraTypes || pulseiraTypes.length === 0) return [];
        if (filtroFase === 'todas') return pulseiraTypes;
        return pulseiraTypes.filter(t => !t.fase || t.fase === 'todas' || t.fase === filtroFase);
    }, [pulseiraTypes, filtroFase]);

    // Auto-sincronizar o seletor de Lote/Tipo de Pulseira quando o operador digitar/bipar o número
    const handleNumeroPulseiraChange = (val) => {
        setNumeroPulseira(val);
        if (!val) return;
        const num = parseInt(String(val).trim(), 10);
        if (isNaN(num)) return;

        // Procura primeiro nos tipos da fase ativa (ou todos)
        const loteIdentificado = (tiposPulseiraFiltrados || []).find(tipo => {
            const ini = tipo.numero_inicial != null ? parseInt(tipo.numero_inicial, 10) : null;
            const fim = tipo.numero_final != null ? parseInt(tipo.numero_final, 10) : null;
            if (ini != null && fim != null) {
                return num >= ini && num <= fim;
            }
            return false;
        }) || (pulseiraTypes || []).find(tipo => {
            const ini = tipo.numero_inicial != null ? parseInt(tipo.numero_inicial, 10) : null;
            const fim = tipo.numero_final != null ? parseInt(tipo.numero_final, 10) : null;
            if (ini != null && fim != null) {
                return num >= ini && num <= fim;
            }
            return false;
        });

        if (loteIdentificado && loteIdentificado.id !== selectedTipoPulseira) {
            setSelectedTipoPulseira(loteIdentificado.id);
            if (loteIdentificado.fase && loteIdentificado.fase !== 'todas' && filtroFase !== loteIdentificado.fase) {
                setFiltroFase(loteIdentificado.fase);
            }
        }
        return loteIdentificado || null;
    };

    if (!pessoa) return null;

    // Quem está dentro só sai: a pendência documental barra apenas a entrada
    const docBloqueada = !!statusDocumentalComLiberacao?.bloqueado && pessoa.status_acesso !== 'checkin_feito';

    const handleLiberarHoje = async () => {
        if (!pessoa?.id || liberandoHoje) return;
        setLiberandoHoje(true);
        setErroValidacao('');
        try {
            await api.post(`/audit/pessoas/${pessoa.id}/liberar-um-dia`, { motivo: motivoLiberarHoje.trim() });
            setMotivoLiberarHoje('');
            await carregarStatusDocumentalComLiberacao();
        } catch (err) {
            setErroValidacao(err.response?.data?.error || 'Não foi possível liberar a entrada de hoje.');
        } finally {
            setLiberandoHoje(false);
        }
    };

    const handleConfirmar = (numInput, origem = 'manual', tipoAuto = null) => {
        if (loading) return;
        if (docBloqueada) {
            const erro = 'Documentação pendente: libere hoje (com o motivo) antes de confirmar a entrada.';
            setErroValidacao(erro);
            return { success: false, error: erro };
        }

        const numFinal = (numInput || numeroPulseira || '').trim();
        // A escolha manual do operador no dropdown (selectedTipoPulseira) tem prioridade sobre o tipoAuto
        const tipoFinal = selectedTipoPulseira || tipoAuto?.id || pulseiraTypes[0]?.id;

        setErroValidacao('');
        if (onConfirmar) {
            onConfirmar({
                pessoa_id: pessoa.id,
                numero_pulseira: numFinal || null,
                tipo_pulseira_id: numFinal ? tipoFinal : null,
                origem_leitura: origem
            });
        }
    };

    // Quem teve a saída registrada nesta ficha aparece como fora até a ficha ser reaberta
    const dentro = pessoa.status_acesso === 'checkin_feito' && saidaRegistrada?.pessoaId !== pessoa.id;
    const statusDocs = situacao?.situacao_documental || pessoa.status_documentos || 'pendente';
    const infoDocs = SITUACAO_DOCUMENTAL[statusDocs] || SITUACAO_DOCUMENTAL.pendente;
    const liberadoAte = situacao?.liberacao_ativa ? new Date(situacao.liberacao_manual_ate) : null;

    return (
        <Dialog
            open={open}
            onClose={loading ? undefined : onClose}
            maxWidth="md"
            fullWidth
            PaperProps={{
                sx: {
                    maxHeight: '92dvh',
                    overflowY: 'auto',
                    '&::-webkit-scrollbar': { width: '6px' },
                    '&::-webkit-scrollbar-thumb': { bgcolor: 'rgba(0, 212, 255, 0.25)', borderRadius: '10px' }
                }
            }}
        >
            <DialogContent sx={{ p: { xs: 1.25, sm: 2.5, md: 3.5 } }}>
                <GlassCard
                    sx={{
                        p: { xs: 1.75, sm: 2.5, md: 3.5 },
                        borderRadius: 1.5,
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.02) 0%, rgba(0, 212, 255, 0.03) 100%)'
                    }}
                >
                    {/* Top bar do modal */}
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: { xs: 1.75, sm: 3 } }}>
                        <Stack direction="row" spacing={1.5} alignItems="center">
                            <Typography variant="overline" sx={{ color: '#00D4FF', fontWeight: 700, letterSpacing: { xs: '1px', sm: '2px' }, fontSize: { xs: '0.75rem', sm: '0.8125rem' } }}>
                                Estação de credenciamento e acesso
                            </Typography>
                        </Stack>

                        <IconButton onClick={onClose} disabled={loading} sx={{ color: 'rgba(255, 255, 255, 0.6)', '&:hover': { color: '#FF3366' } }}>
                            <CloseIcon />
                        </IconButton>
                    </Box>

                    {/* Entrada bloqueada: só a reentrada liberável tem botão; "dentro" é só aviso */}
                    {bloqueioEntrada && (
                        <Alert
                            severity="warning"
                            variant="outlined"
                            sx={{ mb: { xs: 2, sm: 3 }, color: '#FFB800', borderColor: 'rgba(255, 184, 0, 0.5)', bgcolor: 'rgba(255, 184, 0, 0.06)', '& .MuiAlert-icon': { color: '#FFB800' } }}
                        >
                            <Typography variant="body2" sx={{ fontWeight: 700, color: '#FFFFFF' }}>
                                {bloqueioEntrada.liberavel
                                    ? (bloqueioEntrada.mensagem || 'Entrada bloqueada nesta área: a reentrada precisa de liberação do controlador.')
                                    : 'Pessoa já está dentro'}
                            </Typography>
                            {bloqueioEntrada.liberavel && podeLiberarReentrada && (
                                <Button
                                    size="small"
                                    variant="outlined"
                                    onClick={onLiberarReentrada}
                                    disabled={liberandoReentrada}
                                    startIcon={liberandoReentrada ? <CircularProgress size={14} /> : <LiberarIcon sx={{ fontSize: 16 }} />}
                                    sx={{ mt: 1, minHeight: 36, fontSize: '0.8rem', color: '#FFB800', borderColor: 'rgba(255, 184, 0, 0.6)', textTransform: 'none', borderRadius: 1.5 }}
                                >
                                    {liberandoReentrada ? 'Liberando...' : 'Liberar reentrada'}
                                </Button>
                            )}
                            {bloqueioEntrada.erroLiberacao && (
                                <Typography variant="caption" sx={{ display: 'block', mt: 1, color: '#FF3366', fontWeight: 700 }}>
                                    {bloqueioEntrada.erroLiberacao}
                                </Typography>
                            )}
                            {!bloqueioEntrada.liberavel && onRegistrarSaida && (
                                pessoa.numero_pulseira ? (
                                    <Button
                                        size="small"
                                        variant="outlined"
                                        onClick={handleRegistrarSaida}
                                        disabled={registrandoSaida || loading}
                                        startIcon={registrandoSaida ? <CircularProgress size={14} /> : <SaidaIcon sx={{ fontSize: 16 }} />}
                                        sx={{ mt: 1, minHeight: 36, fontSize: '0.8rem', color: '#FFB800', borderColor: 'rgba(255, 184, 0, 0.6)', textTransform: 'none', borderRadius: 1.5 }}
                                    >
                                        {registrandoSaida ? 'Registrando saída...' : 'Registrar saída'}
                                    </Button>
                                ) : (
                                    <Typography variant="caption" sx={{ display: 'block', mt: 1, color: 'rgba(255,255,255,0.75)' }}>
                                        Sem pulseira em uso: a saída só é registrada pela leitura da pulseira.
                                    </Typography>
                                )
                            )}
                            {erroSaida && (
                                <Typography variant="caption" sx={{ display: 'block', mt: 1, color: '#FF3366', fontWeight: 700 }}>
                                    {erroSaida}
                                </Typography>
                            )}
                        </Alert>
                    )}

                    {saidaRegistrada?.pessoaId === pessoa.id && (
                        <Alert
                            severity="success"
                            variant="outlined"
                            sx={{ mb: { xs: 2, sm: 3 }, color: '#00FF88', borderColor: 'rgba(0, 255, 136, 0.5)', bgcolor: 'rgba(0, 255, 136, 0.06)', '& .MuiAlert-icon': { color: '#00FF88' } }}
                        >
                            <Typography variant="body2" sx={{ fontWeight: 700, color: '#FFFFFF' }}>
                                {saidaRegistrada.offline
                                    ? 'Saída guardada neste aparelho: será enviada quando a conexão voltar.'
                                    : 'Saída registrada.'}{' '}
                                Pode confirmar a entrada de novo.
                            </Typography>
                        </Alert>
                    )}

                    {/* Documentação pendente: entrada barrada até liberar hoje */}
                    {docBloqueada && (
                        <Alert
                            severity="error"
                            variant="outlined"
                            sx={{ mb: { xs: 2, sm: 3 }, color: '#FF3366', borderColor: 'rgba(255, 51, 102, 0.6)', bgcolor: 'rgba(255, 51, 102, 0.1)', '& .MuiAlert-icon': { color: '#FF3366' }, '& .MuiAlert-message': { width: '100%' } }}
                        >
                            <Typography variant="body1" sx={{ fontWeight: 800, color: '#FFFFFF', mb: 0.5 }}>
                                DOCUMENTAÇÃO PENDENTE: ENTRADA NÃO PERMITIDA
                            </Typography>
                            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.9)' }}>
                                {statusDocumentalComLiberacao.pendencias?.length
                                    ? `Falta: ${statusDocumentalComLiberacao.pendencias.join(', ')}.`
                                    : 'A documentação exigida para a função não está aprovada.'}
                            </Typography>
                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)', display: 'block', mt: 0.5, mb: 1.25 }}>
                                Para deixar entrar mesmo assim, libere só hoje informando o motivo. Amanhã a pessoa volta a ser barrada.
                            </Typography>
                            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
                                <TextField
                                    size="small"
                                    fullWidth
                                    placeholder="Motivo da liberação (ex.: ASO será entregue amanhã)"
                                    value={motivoLiberarHoje}
                                    onChange={(e) => setMotivoLiberarHoje(e.target.value)}
                                    disabled={liberandoHoje}
                                    sx={{ '& .MuiOutlinedInput-root': { color: '#FFFFFF', bgcolor: 'rgba(0,0,0,0.25)', '& fieldset': { borderColor: 'rgba(255,51,102,0.4)' } } }}
                                />
                                <Button
                                    variant="outlined"
                                    onClick={handleLiberarHoje}
                                    disabled={liberandoHoje || motivoLiberarHoje.trim().length < 3}
                                    startIcon={liberandoHoje ? <CircularProgress size={14} /> : <LiberarIcon sx={{ fontSize: 16 }} />}
                                    sx={{ flexShrink: 0, minHeight: 40, color: '#FF3366', borderColor: 'rgba(255, 51, 102, 0.6)', textTransform: 'none', fontWeight: 700, borderRadius: 1.5 }}
                                >
                                    {liberandoHoje ? 'Liberando...' : 'Liberar hoje'}
                                </Button>
                            </Stack>
                        </Alert>
                    )}

                    {/* Documentação pendente, mas liberada hoje (dia ou turno) */}
                    {statusDocumentalComLiberacao?.exige_liberacao && statusDocumentalComLiberacao?.liberado_hoje && (
                        <Alert
                            severity="info"
                            variant="outlined"
                            sx={{ mb: { xs: 2, sm: 3 }, color: '#00D4FF', borderColor: 'rgba(0, 212, 255, 0.5)', bgcolor: 'rgba(0, 212, 255, 0.06)', '& .MuiAlert-icon': { color: '#00D4FF' } }}
                        >
                            <Typography variant="body2" sx={{ fontWeight: 700, color: '#FFFFFF' }}>
                                Documentação pendente, entrada liberada hoje
                            </Typography>
                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.75)', display: 'block' }}>
                                {statusDocumentalComLiberacao.motivo_liberacao ? `Motivo: ${statusDocumentalComLiberacao.motivo_liberacao}` : 'Entrada permitida apenas hoje.'}
                            </Typography>
                        </Alert>
                    )}

                    {/* Conteúdo Principal */}
                    <Grid container spacing={{ xs: 2, sm: 3.5 }} alignItems="flex-start">
                        {/* Coluna da Foto & Status */}
                        <Grid item xs={12} sm={4} sx={{ textAlign: 'center' }}>
                            <Box sx={{ position: 'relative', display: 'inline-block', mb: 1.5 }}>
                                <PessoaFoto
                                    src={pessoa.foto_url}
                                    pessoaId={pessoa.id}
                                    nome={pessoa.nome_completo || pessoa.nome}
                                    width={130}
                                    borderRadius="16px"
                                    accentColor="#00D4FF"
                                    borderWidth="3px"
                                />
                            </Box>

                            <Stack spacing={1} alignItems="center">
                                <Chip
                                    label={dentro ? 'DENTRO DO EVENTO' : 'AGUARDANDO CREDENCIAMENTO'}
                                    color={dentro ? 'success' : 'default'}
                                    variant="outlined"
                                    sx={{ fontWeight: 700, fontSize: '0.75rem', letterSpacing: '0.5px' }}
                                />

                                <Chip
                                    icon={statusDocs === 'aprovado' ? <VerifiedIcon sx={{ fontSize: '16px !important' }} />
                                        : statusDocs === 'reprovado' ? <CancelIcon sx={{ fontSize: '16px !important' }} />
                                        : <WarningIcon sx={{ fontSize: '16px !important' }} />}
                                    label={comoRotulo(infoDocs.label)}
                                    size="small"
                                    sx={{ bgcolor: `${infoDocs.color}26`, color: infoDocs.color, fontWeight: 700, fontSize: '0.75rem' }}
                                />

                                {situacao?.pendencias?.length > 0 && (
                                    <Typography variant="caption" sx={{ color: '#FFB800', display: 'block', maxWidth: 220 }}>
                                        Pendente: {situacao.pendencias.map(p => `${p.nome} (${MOTIVO_PENDENCIA[p.motivo] || p.motivo})`).join(', ')}
                                    </Typography>
                                )}

                                {liberadoAte ? (
                                    <Chip
                                        icon={<LiberarIcon sx={{ fontSize: '16px !important' }} />}
                                        label={`LIBERADO ATÉ ${liberadoAte.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`}
                                        size="small"
                                        sx={{ bgcolor: 'rgba(178,102,255,0.15)', color: '#A855F7', fontWeight: 700, fontSize: '0.75rem' }}
                                    />
                                ) : situacao && statusDocs !== 'aprovado' && pessoa.status_acesso !== 'bloqueado' && !statusDocumentalComLiberacao?.exige_liberacao && (
                                    <Tooltip title="Permite entrada no leitor facial até o checkout ou o horário de reset do evento">
                                        <Button
                                            size="small"
                                            variant="outlined"
                                            startIcon={liberando ? <CircularProgress size={14} /> : <LiberarIcon fontSize="small" />}
                                            onClick={handleLiberarTurno}
                                            disabled={liberando}
                                            sx={{ fontSize: '0.75rem', color: '#A855F7', borderColor: 'rgba(178,102,255,0.5)', borderRadius: 1.5, textTransform: 'none' }}
                                        >
                                            Liberar neste turno
                                        </Button>
                                    </Tooltip>
                                )}

                                <Tooltip title="Ver documentos e certificados anexados">
                                    <Button
                                        size="small"
                                        variant="outlined"
                                        startIcon={<DocIcon fontSize="small" />}
                                        onClick={handleCarregarDocs}
                                        sx={{
                                            mt: 0.5,
                                            fontSize: '0.75rem',
                                            color: '#00D4FF',
                                            borderColor: 'rgba(0, 212, 255, 0.4)',
                                            borderRadius: 1.5,
                                            textTransform: 'none',
                                            '&:hover': {
                                                borderColor: '#00D4FF',
                                                bgcolor: 'rgba(0, 212, 255, 0.08)'
                                            }
                                        }}
                                    >
                                        Ver documentos
                                    </Button>
                                </Tooltip>
                            </Stack>
                        </Grid>

                        {/* Coluna dos Dados e Input Universal de Pulseira */}
                        <Grid item xs={12} sm={8}>
                            <Box mb={2}>
                                <Typography fontWeight={700} color="#FFFFFF" sx={{ fontSize: { xs: '1.2rem', sm: '1.65rem' }, letterSpacing: '0.3px', lineHeight: 1.2, textAlign: { xs: 'center', sm: 'left' } }}>
                                    {pessoa.nome_completo || pessoa.nome}
                                </Typography>

                                <Stack spacing={0.85} mt={1.25}>
                                    <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 1, opacity: 0.85, color: '#FFFFFF' }}>
                                        <BadgeIcon sx={{ color: '#00D4FF', fontSize: 18 }} /> 
                                        <strong>CPF:</strong> {pessoa.cpf || 'Não cadastrado'}
                                    </Typography>
                                    <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 1, opacity: 0.85, color: '#FFFFFF' }}>
                                        <CompanyIcon sx={{ color: '#00D4FF', fontSize: 18 }} /> 
                                        <strong>Empresa:</strong> {pessoa.empresas?.nome || pessoa.empresa_nome || 'Pessoa Física / Avulso'}
                                    </Typography>
                                    <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 1, opacity: 0.85, color: '#FFFFFF' }}>
                                        <BadgeIcon sx={{ color: '#00D4FF', fontSize: 18 }} /> 
                                        <strong>Função:</strong> {pessoa.funcao || pessoa.cargo || 'Colaborador'}
                                    </Typography>
                                </Stack>
                            </Box>

                            {/* Áreas Autorizadas */}
                            <Box mb={2}>
                                <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.5)', fontWeight: 700, letterSpacing: '1px' }}>
                                    Áreas autorizadas:
                                </Typography>
                                <Box mt={0.5}>
                                    <AuthorizedAreasChips pessoa={pessoa} accentColor="#00D4FF" />
                                </Box>
                            </Box>

                            <Divider sx={{ borderColor: 'rgba(255, 255, 255, 0.08)', my: 1.75 }} />

                            {/* Campo de Atribuição de Pulseira Universal com Seletor de Fase e Lote */}
                            <Box sx={{ mt: 1.5 }}>
                                <Grid container spacing={1.5} alignItems="flex-start">
                                    {/* Seletor Manual de Fase/Etapa (Montagem / Evento / Desmontagem) */}
                                    <Grid item xs={6}>
                                        <FormControl fullWidth size="small">
                                            <InputLabel id="fase-pulseira-select" sx={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem' }}>
                                                Etapa / Fase
                                            </InputLabel>
                                            <Select
                                                labelId="fase-pulseira-select"
                                                value={filtroFase}
                                                label="Etapa / Fase"
                                                onChange={(e) => {
                                                    setFiltroFase(e.target.value);
                                                    const novos = e.target.value === 'todas'
                                                        ? pulseiraTypes
                                                        : pulseiraTypes.filter(t => !t.fase || t.fase === 'todas' || t.fase === e.target.value);
                                                    if (novos.length > 0 && !novos.some(t => t.id === selectedTipoPulseira)) {
                                                        setSelectedTipoPulseira(novos[0].id);
                                                    }
                                                }}
                                                sx={{
                                                    bgcolor: 'rgba(0,0,0,0.3)',
                                                    color: '#FFFFFF',
                                                    borderRadius: 1.5,
                                                    fontSize: '0.82rem',
                                                    '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(0, 212, 255, 0.3)' }
                                                }}
                                            >
                                                <MenuItem value="todas">Todas as Fases</MenuItem>
                                                <MenuItem value="montagem">Montagem</MenuItem>
                                                <MenuItem value="evento">Evento (Show)</MenuItem>
                                                <MenuItem value="desmontagem">Desmontagem</MenuItem>
                                            </Select>
                                        </FormControl>
                                    </Grid>

                                    {/* Seletor do Lote de Pulseira */}
                                    <Grid item xs={6}>
                                        <FormControl fullWidth size="small">
                                            <InputLabel id="tipo-pulseira-select" sx={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem' }}>
                                                Lote / Tipo
                                            </InputLabel>
                                            <Select
                                                labelId="tipo-pulseira-select"
                                                value={selectedTipoPulseira}
                                                label="Lote / Tipo"
                                                onChange={(e) => setSelectedTipoPulseira(e.target.value)}
                                                sx={{
                                                    bgcolor: 'rgba(0,0,0,0.3)',
                                                    color: '#FFFFFF',
                                                    borderRadius: 1.5,
                                                    fontSize: '0.82rem',
                                                    '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(0, 212, 255, 0.3)' }
                                                }}
                                            >
                                                {tiposPulseiraFiltrados.map(t => (
                                                    <MenuItem key={t.id} value={t.id}>
                                                        {t.nome_tipo} {t.fase && t.fase !== 'todas' ? `(${t.fase})` : ''}
                                                    </MenuItem>
                                                ))}
                                            </Select>
                                        </FormControl>
                                    </Grid>

                                    {/* Input Universal de Pulseira: linha inteira (rótulo, campo, câmera e OK não cabem ao lado dos seletores) */}
                                    <Grid item xs={12}>
                                        <UniversalPulseiraInput
                                            key={pessoa.id}
                                            value={numeroPulseira}
                                            onChange={handleNumeroPulseiraChange}
                                            onConfirm={handleConfirmar}
                                            label="Número da pulseira"
                                            placeholder="Bipe ou digite o número da pulseira"
                                            helperText="Leitor confirma sozinho • Digitado: Enter ↵"
                                            pulseiraTypes={tiposPulseiraFiltrados.length > 0 ? tiposPulseiraFiltrados : pulseiraTypes}
                                            loading={loading}
                                            autoFocus={true}
                                            ultimoCodigoLido={ultimoCodigoCamera}
                                            onAbrirCamera={permitirCamera ? () => setLendoCamera(true) : undefined}
                                        />
                                    </Grid>

                                </Grid>

                                {/* Pulseira em uso (TODAY) */}
                                {statusPulseira?.emUso && devolvidaId !== pessoa.id && desfeitaInfo?.id !== pessoa.id && (
                                    <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', bgcolor: 'rgba(0, 212, 255, 0.05)', p: 1, borderRadius: 1.5, border: '1px solid rgba(0, 212, 255, 0.15)' }}>
                                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.8)' }}>
                                            Pulseira em uso: <strong>{statusPulseira.emUso}</strong>
                                        </Typography>
                                        <Button
                                            size="small"
                                            variant="outlined"
                                            startIcon={<DevolverIcon sx={{ fontSize: 16 }} />}
                                            onClick={handleDevolverPulseira}
                                            disabled={devolvendo}
                                            sx={{
                                                fontSize: '0.7rem',
                                                color: '#00D4FF',
                                                borderColor: 'rgba(0, 212, 255, 0.4)',
                                                textTransform: 'none',
                                                py: 0.2,
                                                px: 1
                                            }}
                                        >
                                            {devolvendo ? 'Registrando...' : 'Marcar como Devolvida'}
                                        </Button>
                                        <Tooltip title="Pulseira digitada errada? Desfaz o lançamento; a anterior volta com a mesma hora de entrada" arrow>
                                            <span>
                                                <Button
                                                    size="small"
                                                    variant="outlined"
                                                    onClick={handleDesfazerLancamento}
                                                    disabled={desfazendo}
                                                    sx={{ fontSize: '0.7rem', color: '#FFB020', borderColor: 'rgba(255, 176, 32, 0.4)', textTransform: 'none', py: 0.2, px: 1, ml: 0.5 }}
                                                >
                                                    {desfazendo ? 'Desfazendo...' : 'Lançamento errado'}
                                                </Button>
                                            </span>
                                        </Tooltip>
                                    </Box>
                                )}

                                {/* Pendência de pulseira anterior */}
                                {statusPulseira?.pendencia && !statusPulseira?.emUso && (
                                    <Alert
                                        severity="warning"
                                        variant="outlined"
                                        sx={{ mt: 1, color: '#FFB800', borderColor: 'rgba(255, 184, 0, 0.5)', bgcolor: 'rgba(255, 184, 0, 0.06)', '& .MuiAlert-icon': { color: '#FFB800' } }}
                                    >
                                        <Typography variant="body2" sx={{ fontWeight: 700, color: '#FFFFFF', mb: 1 }}>
                                            ⚠️ PULSEIRA {statusPulseira.pendencia.numero} PENDENTE DESDE {new Date(statusPulseira.pendencia.dataCheckin).toLocaleDateString('pt-BR')}
                                        </Typography>
                                        <Typography variant="caption" sx={{ display: 'block', color: 'rgba(255,255,255,0.9)', mb: 1 }}>
                                            Pessoa não descredenciou em {new Date(statusPulseira.pendencia.dataCheckin).toLocaleDateString('pt-BR')}.
                                            {statusPulseira.pendencia.motivo && (
                                                <>
                                                    <br />
                                                    <strong>Motivo registrado:</strong> {statusPulseira.pendencia.motivo}
                                                </>
                                            )}
                                        </Typography>
                                        {!statusPulseira.pendencia.motivo && (
                                            <>
                                                <TextField
                                                    size="small"
                                                    label="Motivo da não devolução"
                                                    multiline
                                                    rows={2}
                                                    value={motivoDevolucao}
                                                    onChange={(e) => setMotivoDevolucao(e.target.value)}
                                                    placeholder="ex: Esqueceu de devolver, perdeu a pulseira, etc"
                                                    fullWidth
                                                    sx={{ mt: 1, mb: 1, '& .MuiOutlinedInput-root': { color: '#FFFFFF' }, '& .MuiInputLabel-root': { color: 'rgba(255,255,255,0.7)' } }}
                                                />
                                                <Button
                                                    size="small"
                                                    variant="outlined"
                                                    onClick={handleRegistrarMotivoPendencia}
                                                    disabled={registrandoMotivo || !motivoDevolucao.trim()}
                                                    sx={{ fontSize: '0.75rem', color: '#FFB800', borderColor: 'rgba(255, 184, 0, 0.6)', textTransform: 'none' }}
                                                >
                                                    {registrandoMotivo ? 'Registrando...' : 'Registrar Motivo'}
                                                </Button>
                                            </>
                                        )}
                                    </Alert>
                                )}

                                {desfeitaInfo?.id === pessoa.id && (
                                    <Typography variant="caption" sx={{ display: 'block', mt: 1, color: '#00D4FF', fontWeight: 700 }}>
                                        Lançamento desfeito.{desfeitaInfo.restaurado
                                            ? ` Pulseira ${desfeitaInfo.restaurado} voltou para a pessoa.`
                                            : ' A pessoa ficou sem pulseira em uso.'}
                                    </Typography>
                                )}

                                {erroValidacao && (
                                    <Typography variant="caption" sx={{ color: '#FF3366', fontWeight: 700, mt: 1, display: 'block' }}>
                                        {erroValidacao}
                                    </Typography>
                                )}
                            </Box>
                        </Grid>
                    </Grid>

                    {/* Rodapé de Ações */}
                    <Box sx={{ mt: { xs: 2.5, sm: 4 }, pt: 2, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                        <Grid container spacing={1.5}>
                            <Grid item xs={12} sm={7}>
                                <NeonButton
                                    fullWidth
                                    neonColor="#00FF88"
                                    onClick={() => handleConfirmar()}
                                    disabled={loading}
                                    sx={{ height: { xs: 48, sm: 56 }, fontSize: { xs: '0.875rem', sm: '1rem' }, fontWeight: 700, borderRadius: 1.5 }}
                                >
                                    <LoginIcon sx={{ mr: 1, fontSize: 22 }} />
                                    {numeroPulseira ? 'Vincular pulseira & autorizar' : 'Confirmar entrada sem pulseira'}
                                    {loading && <CircularProgress size={20} sx={{ ml: 2, color: '#000000' }} />}
                                </NeonButton>
                            </Grid>

                            <Grid item xs={12} sm={5}>
                                <NeonButton
                                    fullWidth
                                    neonColor="rgba(255, 255, 255, 0.4)"
                                    onClick={onClose}
                                    disabled={loading}
                                    sx={{ height: { xs: 46, sm: 56 }, fontSize: '0.8125rem', borderRadius: 1.5 }}
                                >
                                    <CloseIcon sx={{ mr: 0.5, fontSize: 18 }} /> Cancelar
                                </NeonButton>
                            </Grid>
                        </Grid>
                    </Box>
                </GlassCard>
            </DialogContent>

            <LeitorQrCamera
                open={lendoCamera}
                onClose={() => setLendoCamera(false)}
                titulo="Pulseira pela câmera"
                instrucao="Aponte a câmera para o QR Code ou código de barras da pulseira — o check-in será feito automaticamente."
                onLeitura={(cod) => {
                    setLendoCamera(false);
                    setUltimoCodigoCamera(cod);
                    const lote = handleNumeroPulseiraChange(cod);
                    setErroValidacao('');
                    handleConfirmar(cod, 'camera_qr', lote);
                }}
            />

            {/* Sub-diálogo de Documentos Anexados do Colaborador */}
            <Dialog
                open={openDocsModal}
                onClose={() => setOpenDocsModal(false)}
                maxWidth="sm"
                fullWidth
                PaperProps={{
                    sx: {
                        maxHeight: { sm: '90dvh' }
                    }
                }}
            >
                <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
                    <Typography variant="h6" sx={{ fontWeight: 700 }}>
                        Documentos de {pessoa?.nome_completo || pessoa?.nome}
                    </Typography>
                    <IconButton size="small" onClick={() => setOpenDocsModal(false)} sx={{ color: 'rgba(255,255,255,0.6)' }}>
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>

                <DialogContent sx={{ pt: 2, overflowY: 'auto' }}>
                    {loadingDocs ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                            <CircularProgress size={32} sx={{ color: '#00D4FF' }} />
                        </Box>
                    ) : (
                        <ListaDocumentos documentos={pessoaDocs} />
                    )}
                </DialogContent>
            </Dialog>
        </Dialog>
    );
};

export default ModalCredenciamento;
