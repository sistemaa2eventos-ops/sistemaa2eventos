import React, { useState, useEffect } from 'react';
import {
    Dialog, DialogTitle, DialogContent, Box, Typography, Grid, Stack,
    Chip, CircularProgress, IconButton, FormControl,
    InputLabel, Select, MenuItem, Tooltip, Divider, Button
} from '@mui/material';
import {
    Badge as BadgeIcon,
    CorporateFare as CompanyIcon,
    Close as CloseIcon,
    Login as LoginIcon,
    QrCodeScanner as QrIcon,
    VerifiedUser as VerifiedIcon,
    Warning as WarningIcon,
    Cancel as CancelIcon,
    Description as DocIcon,
    LockOpen as LiberarIcon
} from '@mui/icons-material';
import GlassCard from '../common/GlassCard';
import NeonButton from '../common/NeonButton';
import AuthorizedAreasChips from '../common/AuthorizedAreasChips';
import UniversalPulseiraInput from '../common/UniversalPulseiraInput';
import PessoaFoto from '../common/PessoaFoto';
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
    onOpenQrScanner
}) => {
    const [numeroPulseira, setNumeroPulseira] = useState('');
    const [selectedTipoPulseira, setSelectedTipoPulseira] = useState('');
    const [erroValidacao, setErroValidacao] = useState('');

    // Consulta de documentos da pessoa
    const [openDocsModal, setOpenDocsModal] = useState(false);
    const [pessoaDocs, setPessoaDocs] = useState([]);
    const [loadingDocs, setLoadingDocs] = useState(false);

    // Situação documental (pendências por função) e liberação manual do turno
    const [situacao, setSituacao] = useState(null);
    const [liberando, setLiberando] = useState(false);

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
            setNumeroPulseira(pessoa.numero_pulseira || '');
            setErroValidacao('');
            setSituacao(null);
            carregarSituacao();
            
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

    if (!pessoa) return null;

    const handleConfirmar = (numInput, origem = 'manual', tipoAuto = null) => {
        if (loading) return;

        const numFinal = (numInput || numeroPulseira || '').trim();
        const tipoFinal = tipoAuto?.id || selectedTipoPulseira || pulseiraTypes[0]?.id;

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
                    background: 'rgba(12, 16, 28, 0.95)',
                    backdropFilter: 'blur(20px)',
                    border: '1px solid rgba(0, 212, 255, 0.3)',
                    borderRadius: 1.5,
                    boxShadow: '0 16px 48px rgba(0, 0, 0, 0.85)',
                    maxHeight: '90vh',
                    overflowY: 'auto',
                    '&::-webkit-scrollbar': { width: '6px' },
                    '&::-webkit-scrollbar-thumb': { bgcolor: 'rgba(0, 212, 255, 0.25)', borderRadius: '10px' }
                }
            }}
        >
            <DialogContent sx={{ p: { xs: 2.5, md: 4 } }}>
                <GlassCard
                    sx={{
                        p: { xs: 2.5, md: 3.5 },
                        borderRadius: 1.5,
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.02) 0%, rgba(0, 212, 255, 0.03) 100%)'
                    }}
                >
                    {/* Top bar do modal */}
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                        <Stack direction="row" spacing={1.5} alignItems="center">
                            <Typography variant="overline" sx={{ color: '#00D4FF', fontWeight: 700, letterSpacing: '2px', fontSize: '0.8125rem' }}>
                                Estação de credenciamento e acesso
                            </Typography>
                        </Stack>

                        <IconButton onClick={onClose} disabled={loading} sx={{ color: 'rgba(255, 255, 255, 0.6)', '&:hover': { color: '#FF3366' } }}>
                            <CloseIcon />
                        </IconButton>
                    </Box>

                    {/* Conteúdo Principal */}
                    <Grid container spacing={3.5} alignItems="flex-start">
                        {/* Coluna da Foto & Status */}
                        <Grid item xs={12} sm={4} sx={{ textAlign: 'center' }}>
                            <Box sx={{ position: 'relative', display: 'inline-block', mb: 2 }}>
                                <PessoaFoto
                                    src={pessoa.foto_url}
                                    nome={pessoa.nome_completo || pessoa.nome}
                                    width={160}
                                    borderRadius="16px"
                                    accentColor="#00D4FF"
                                    borderWidth="3px"
                                />
                            </Box>

                            <Stack spacing={1} alignItems="center">
                                <Chip
                                    label={pessoa.status_acesso === 'checkin_feito' ? 'DENTRO DO EVENTO' : 'AGUARDANDO CREDENCIAMENTO'}
                                    color={pessoa.status_acesso === 'checkin_feito' ? 'success' : 'default'}
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
                                ) : situacao && statusDocs !== 'aprovado' && pessoa.status_acesso !== 'bloqueado' && (
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
                                            mt: 1,
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
                            <Box mb={2.5}>
                                <Typography variant="h4" fontWeight={700} color="#FFFFFF" sx={{ letterSpacing: '0.5px', lineHeight: 1.2 }}>
                                    {pessoa.nome_completo || pessoa.nome}
                                </Typography>

                                <Stack spacing={1} mt={1.5}>
                                    <Typography variant="body1" sx={{ display: 'flex', alignItems: 'center', gap: 1, opacity: 0.85, color: '#FFFFFF' }}>
                                        <BadgeIcon sx={{ color: '#00D4FF', fontSize: 20 }} /> 
                                        <strong>CPF:</strong> {pessoa.cpf || 'Não cadastrado'}
                                    </Typography>
                                    <Typography variant="body1" sx={{ display: 'flex', alignItems: 'center', gap: 1, opacity: 0.85, color: '#FFFFFF' }}>
                                        <CompanyIcon sx={{ color: '#00D4FF', fontSize: 20 }} /> 
                                        <strong>Empresa:</strong> {pessoa.empresas?.nome || pessoa.empresa_nome || 'Pessoa Física / Avulso'}
                                    </Typography>
                                    <Typography variant="body1" sx={{ display: 'flex', alignItems: 'center', gap: 1, opacity: 0.85, color: '#FFFFFF' }}>
                                        <BadgeIcon sx={{ color: '#00D4FF', fontSize: 20 }} /> 
                                        <strong>Função:</strong> {pessoa.funcao || pessoa.cargo || 'Colaborador'}
                                    </Typography>
                                </Stack>
                            </Box>

                            {/* Áreas Autorizadas */}
                            <Box mb={2.5}>
                                <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.5)', fontWeight: 700, letterSpacing: '1px' }}>
                                    Áreas autorizadas:
                                </Typography>
                                <Box mt={0.5}>
                                    <AuthorizedAreasChips pessoa={pessoa} accentColor="#00D4FF" />
                                </Box>
                            </Box>

                            <Divider sx={{ borderColor: 'rgba(255, 255, 255, 0.08)', my: 2 }} />

                            {/* Campo de Atribuição de Pulseira Universal */}
                            <Box sx={{ mt: 2 }}>
                                <Grid container spacing={2} alignItems="center">
                                    {pulseiraTypes.length > 1 && (
                                        <Grid item xs={12} sm={4}>
                                            <FormControl fullWidth size="small">
                                                <InputLabel id="tipo-pulseira-select" sx={{ color: 'rgba(255,255,255,0.7)' }}>
                                                    Lote / Tipo
                                                </InputLabel>
                                                <Select
                                                    labelId="tipo-pulseira-select"
                                                    value={selectedTipoPulseira}
                                                    label="Lote / tipo"
                                                    onChange={(e) => setSelectedTipoPulseira(e.target.value)}
                                                    sx={{
                                                        bgcolor: 'rgba(0,0,0,0.3)',
                                                        color: '#FFFFFF',
                                                        borderRadius: 1.5,
                                                        '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(0, 212, 255, 0.3)' }
                                                    }}
                                                >
                                                    {pulseiraTypes.map(t => (
                                                        <MenuItem key={t.id} value={t.id}>
                                                            {t.nome_tipo}
                                                        </MenuItem>
                                                    ))}
                                                </Select>
                                            </FormControl>
                                        </Grid>
                                    )}

                                    <Grid item xs={12} sm={pulseiraTypes.length > 1 ? 8 : 12}>
                                        <UniversalPulseiraInput
                                            value={numeroPulseira}
                                            onChange={setNumeroPulseira}
                                            onConfirm={handleConfirmar}
                                            pulseiraTypes={pulseiraTypes}
                                            loading={loading}
                                            autoFocus={true}
                                        />
                                    </Grid>
                                </Grid>

                                {erroValidacao && (
                                    <Typography variant="caption" sx={{ color: '#FF3366', fontWeight: 700, mt: 1, display: 'block' }}>
                                        {erroValidacao}
                                    </Typography>
                                )}
                            </Box>
                        </Grid>
                    </Grid>

                    {/* Rodapé de Ações */}
                    <Box sx={{ mt: 4, pt: 2.5, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                        <Grid container spacing={2}>
                            <Grid item xs={12} sm={7}>
                                <NeonButton
                                    fullWidth
                                    neonColor="#00FF88"
                                    onClick={() => handleConfirmar()}
                                    disabled={loading}
                                    sx={{ height: 56, fontSize: '1rem', fontWeight: 700, borderRadius: 1.5 }}
                                >
                                    <LoginIcon sx={{ mr: 1, fontSize: 24 }} />
                                    {numeroPulseira ? 'Vincular pulseira & autorizar (enter)' : 'Confirmar entrada sem pulseira (enter)'}
                                    {loading && <CircularProgress size={20} sx={{ ml: 2, color: '#000000' }} />}
                                </NeonButton>
                            </Grid>

                            {onOpenQrScanner && (
                                <Grid item xs={6} sm={2.5}>
                                    <NeonButton
                                        fullWidth
                                        neonColor="#00D4FF"
                                        onClick={onOpenQrScanner}
                                        disabled={loading}
                                        sx={{ height: 56, fontSize: '0.875rem', borderRadius: 1.5 }}
                                    >
                                        <QrIcon sx={{ mr: 0.5, fontSize: 22 }} /> QR cam
                                    </NeonButton>
                                </Grid>
                            )}

                            <Grid item xs={onOpenQrScanner ? 6 : 12} sm={onOpenQrScanner ? 2.5 : 5}>
                                <NeonButton
                                    fullWidth
                                    neonColor="rgba(255, 255, 255, 0.4)"
                                    onClick={onClose}
                                    disabled={loading}
                                    sx={{ height: 56, fontSize: '0.875rem', borderRadius: 1.5 }}
                                >
                                    <CloseIcon sx={{ mr: 0.5, fontSize: 20 }} /> Cancelar (esc)
                                </NeonButton>
                            </Grid>
                        </Grid>
                    </Box>
                </GlassCard>
            </DialogContent>

            {/* Sub-diálogo de Documentos Anexados do Colaborador */}
            <Dialog
                open={openDocsModal}
                onClose={() => setOpenDocsModal(false)}
                maxWidth="sm"
                fullWidth
                PaperProps={{
                    sx: {
                        background: 'rgba(15, 20, 32, 0.98)',
                        backdropFilter: 'blur(20px)',
                        border: '1px solid rgba(0, 212, 255, 0.4)',
                        borderRadius: 1.5,
                        maxHeight: '90vh'
                    }
                }}
            >
                <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
                    <Typography variant="h6" sx={{ color: '#00D4FF', fontWeight: 700 }}>
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
