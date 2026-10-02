import React, { useState, useEffect } from 'react';
import {
    Dialog, DialogContent, Box, Typography, Grid, Stack,
    Avatar, Chip, CircularProgress, IconButton, FormControl,
    InputLabel, Select, MenuItem, Tooltip, Divider
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
    Visibility as ViewIcon
} from '@mui/icons-material';
import GlassCard from '../common/GlassCard';
import NeonButton from '../common/NeonButton';
import AuthorizedAreasChips from '../common/AuthorizedAreasChips';
import UniversalPulseiraInput from '../common/UniversalPulseiraInput';
import api from '../../services/api';

export const ModalCredenciamento = ({
    open,
    pessoa,
    onClose,
    onConfirmar,
    pulseiraTypes = [],
    eventAreas = [],
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

    const handleCarregarDocs = async () => {
        if (!pessoa?.id) return;
        try {
            setLoadingDocs(true);
            setOpenDocsModal(true);
            const resp = await api.get(`/documentos/pessoa/${pessoa.id}`);
            setPessoaDocs(resp.data?.data || []);
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

        if (!numFinal) {
            setErroValidacao('Informe o número ou bipe o código de barras da pulseira.');
            return;
        }

        setErroValidacao('');
        if (onConfirmar) {
            onConfirmar({
                pessoa_id: pessoa.id,
                numero_pulseira: numFinal,
                tipo_pulseira_id: tipoFinal,
                origem_leitura: origem
            });
        }
    };

    const statusDocs = pessoa.status_documentos || 'pendente';

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
                    borderRadius: 4,
                    boxShadow: '0 16px 48px rgba(0, 0, 0, 0.85)',
                    overflow: 'hidden'
                }
            }}
        >
            <DialogContent sx={{ p: { xs: 2.5, md: 4 } }}>
                <GlassCard
                    sx={{
                        p: { xs: 2.5, md: 3.5 },
                        borderRadius: 3,
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.02) 0%, rgba(0, 212, 255, 0.03) 100%)'
                    }}
                >
                    {/* Top bar do modal */}
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                        <Stack direction="row" spacing={1.5} alignItems="center">
                            <Typography variant="overline" sx={{ color: '#00D4FF', fontWeight: 900, letterSpacing: '2px', fontSize: '0.8rem' }}>
                                ESTAÇÃO DE CREDENCIAMENTO E ACESSO
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
                                <Avatar
                                    src={pessoa.foto_url}
                                    sx={{
                                        width: 170,
                                        height: 170,
                                        mx: 'auto',
                                        bgcolor: '#00D4FF',
                                        fontSize: '3.5rem',
                                        fontWeight: 800,
                                        border: '4px solid rgba(0, 212, 255, 0.4)',
                                        boxShadow: '0 0 35px rgba(0, 212, 255, 0.25)'
                                    }}
                                >
                                    {(pessoa.nome_completo || pessoa.nome)?.[0]}
                                </Avatar>
                            </Box>

                            <Stack spacing={1} alignItems="center">
                                <Chip
                                    label={pessoa.status_acesso === 'checkin_feito' ? 'DENTRO DO EVENTO' : 'AGUARDANDO CREDENCIAMENTO'}
                                    color={pessoa.status_acesso === 'checkin_feito' ? 'success' : 'default'}
                                    variant="outlined"
                                    sx={{ fontWeight: 800, fontSize: '0.75rem', letterSpacing: '0.5px' }}
                                />

                                {statusDocs === 'aprovado' ? (
                                    <Chip
                                        icon={<VerifiedIcon sx={{ fontSize: '16px !important' }} />}
                                        label="DOCS APROVADOS"
                                        size="small"
                                        sx={{ bgcolor: 'rgba(0,255,136,0.15)', color: '#00FF88', fontWeight: 800, fontSize: '0.7rem' }}
                                    />
                                ) : statusDocs === 'reprovado' ? (
                                    <Chip
                                        icon={<CancelIcon sx={{ fontSize: '16px !important' }} />}
                                        label="DOCS REPROVADOS"
                                        size="small"
                                        sx={{ bgcolor: 'rgba(255,51,102,0.15)', color: '#FF3366', fontWeight: 800, fontSize: '0.7rem' }}
                                    />
                                ) : (
                                    <Chip
                                        icon={<WarningIcon sx={{ fontSize: '16px !important' }} />}
                                        label="AUDITORIA PENDENTE"
                                        size="small"
                                        sx={{ bgcolor: 'rgba(255,170,0,0.15)', color: '#FFAA00', fontWeight: 800, fontSize: '0.7rem' }}
                                    />
                                )}

                                <Tooltip title="Ver documentos e certificados anexados">
                                    <Button
                                        size="small"
                                        variant="outlined"
                                        startIcon={<DocIcon fontSize="small" />}
                                        onClick={handleCarregarDocs}
                                        sx={{
                                            mt: 1,
                                            fontSize: '0.72rem',
                                            color: '#00D4FF',
                                            borderColor: 'rgba(0, 212, 255, 0.4)',
                                            borderRadius: 2,
                                            textTransform: 'none',
                                            '&:hover': {
                                                borderColor: '#00D4FF',
                                                bgcolor: 'rgba(0, 212, 255, 0.08)'
                                            }
                                        }}
                                    >
                                        Ver Documentos
                                    </Button>
                                </Tooltip>
                            </Stack>
                        </Grid>

                        {/* Coluna dos Dados e Input Universal de Pulseira */}
                        <Grid item xs={12} sm={8}>
                            <Box mb={2.5}>
                                <Typography variant="h4" fontWeight={900} color="#fff" sx={{ letterSpacing: '0.5px', lineHeight: 1.2 }}>
                                    {pessoa.nome_completo || pessoa.nome}
                                </Typography>

                                <Stack spacing={1} mt={1.5}>
                                    <Typography variant="body1" sx={{ display: 'flex', alignItems: 'center', gap: 1, opacity: 0.85, color: '#fff' }}>
                                        <BadgeIcon sx={{ color: '#00D4FF', fontSize: 20 }} /> 
                                        <strong>CPF:</strong> {pessoa.cpf || 'Não cadastrado'}
                                    </Typography>
                                    <Typography variant="body1" sx={{ display: 'flex', alignItems: 'center', gap: 1, opacity: 0.85, color: '#fff' }}>
                                        <CompanyIcon sx={{ color: '#00D4FF', fontSize: 20 }} /> 
                                        <strong>Empresa:</strong> {pessoa.empresas?.nome || pessoa.empresa_nome || 'Pessoa Física / Avulso'}
                                    </Typography>
                                    <Typography variant="body1" sx={{ display: 'flex', alignItems: 'center', gap: 1, opacity: 0.85, color: '#fff' }}>
                                        <BadgeIcon sx={{ color: '#00D4FF', fontSize: 20 }} /> 
                                        <strong>Função:</strong> {pessoa.funcao || pessoa.cargo || 'Colaborador'}
                                    </Typography>
                                </Stack>
                            </Box>

                            {/* Áreas Autorizadas */}
                            <Box mb={2.5}>
                                <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.5)', fontWeight: 700, letterSpacing: '1px' }}>
                                    ÁREAS AUTORIZADAS:
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
                                                    label="Lote / Tipo"
                                                    onChange={(e) => setSelectedTipoPulseira(e.target.value)}
                                                    sx={{
                                                        bgcolor: 'rgba(0,0,0,0.3)',
                                                        color: '#fff',
                                                        borderRadius: 2,
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
                                        ⚠️ {erroValidacao}
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
                                    sx={{ height: 56, fontSize: '1rem', fontWeight: 800, borderRadius: 3 }}
                                >
                                    <LoginIcon sx={{ mr: 1, fontSize: 24 }} />
                                    {numeroPulseira ? 'VINCULAR PULSEIRA & AUTORIZAR (ENTER)' : 'CONFIRMAR ENTRADA'}
                                    {loading && <CircularProgress size={20} sx={{ ml: 2, color: '#000' }} />}
                                </NeonButton>
                            </Grid>

                            {onOpenQrScanner && (
                                <Grid item xs={6} sm={2.5}>
                                    <NeonButton
                                        fullWidth
                                        neonColor="#00D4FF"
                                        onClick={onOpenQrScanner}
                                        disabled={loading}
                                        sx={{ height: 56, fontSize: '0.9rem', borderRadius: 3 }}
                                    >
                                        <QrIcon sx={{ mr: 0.5, fontSize: 22 }} /> QR CAM
                                    </NeonButton>
                                </Grid>
                            )}

                            <Grid item xs={onOpenQrScanner ? 6 : 12} sm={onOpenQrScanner ? 2.5 : 5}>
                                <NeonButton
                                    fullWidth
                                    neonColor="rgba(255, 255, 255, 0.4)"
                                    onClick={onClose}
                                    disabled={loading}
                                    sx={{ height: 56, fontSize: '0.9rem', borderRadius: 3 }}
                                >
                                    <CloseIcon sx={{ mr: 0.5, fontSize: 20 }} /> CANCELAR (ESC)
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
                        borderRadius: 3
                    }
                }}
            >
                <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
                    <Typography variant="h6" sx={{ color: '#00D4FF', fontWeight: 800 }}>
                        Documentos de {pessoa?.nome_completo || pessoa?.nome}
                    </Typography>
                    <IconButton size="small" onClick={() => setOpenDocsModal(false)} sx={{ color: 'rgba(255,255,255,0.6)' }}>
                        <CloseIcon />
                    </IconButton>
                </DialogTitle>

                <DialogContent sx={{ pt: 2 }}>
                    {loadingDocs ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                            <CircularProgress size={32} sx={{ color: '#00D4FF' }} />
                        </Box>
                    ) : pessoaDocs.length === 0 ? (
                        <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)', textAlign: 'center', py: 3 }}>
                            Nenhum documento anexado para este colaborador.
                        </Typography>
                    ) : (
                        <Stack spacing={1.5} sx={{ mt: 1 }}>
                            {pessoaDocs.map((doc) => (
                                <GlassCard key={doc.id} sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Box>
                                        <Typography variant="body2" sx={{ fontWeight: 700, color: '#fff' }}>
                                            {doc.titulo || doc.tipo_doc}
                                        </Typography>
                                        <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
                                            <Chip
                                                label={(doc.status || 'pendente').toUpperCase()}
                                                size="small"
                                                sx={{
                                                    fontSize: '0.65rem',
                                                    fontWeight: 800,
                                                    height: 20,
                                                    bgcolor: doc.status === 'aprovado' ? 'rgba(0,255,136,0.15)' : doc.status === 'rejeitado' ? 'rgba(255,51,102,0.15)' : 'rgba(255,170,0,0.15)',
                                                    color: doc.status === 'aprovado' ? '#00FF88' : doc.status === 'rejeitado' ? '#FF3366' : '#FFAA00'
                                                }}
                                            />
                                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>
                                                {doc.data_inclusao ? new Date(doc.data_inclusao).toLocaleDateString('pt-BR') : ''}
                                            </Typography>
                                        </Stack>
                                        {doc.notas_auditoria && (
                                            <Typography variant="caption" sx={{ color: '#FFAA00', display: 'block', mt: 0.5 }}>
                                                Nota: {doc.notas_auditoria}
                                            </Typography>
                                        )}
                                    </Box>

                                    {doc.url_arquivo && (
                                        <Tooltip title="Visualizar arquivo">
                                            <IconButton
                                                size="small"
                                                onClick={() => window.open(doc.url_arquivo, '_blank')}
                                                sx={{ color: '#00D4FF', bgcolor: 'rgba(0,212,255,0.1)' }}
                                            >
                                                <ViewIcon fontSize="small" />
                                            </IconButton>
                                        </Tooltip>
                                    )}
                                </GlassCard>
                            ))}
                        </Stack>
                    )}
                </DialogContent>
            </Dialog>
        </Dialog>
    );
};

export default ModalCredenciamento;
