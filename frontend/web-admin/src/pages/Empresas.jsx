import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Stack,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Grid,
  Stepper,
  Step,
  StepLabel,
  Tooltip
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Search as SearchIcon,
  Business as BusinessIcon,
  Link as LinkIcon,
  ContentCopy as CopyIcon,
  Assessment as QuotaIcon,
  InsertDriveFile as FileIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
  WhatsApp as WhatsAppIcon,
  Email as EmailIcon,
  Check as CheckIcon
} from '@mui/icons-material';
import GlassCard from '../components/common/GlassCard';
import PageHeader from '../components/common/PageHeader';
import NeonButton from '../components/common/NeonButton';
import DataTable from '../components/common/DataTable';
import ConfirmDialog from '../components/common/ConfirmDialog';
import { useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { useSnackbar } from 'notistack';
import { useEmpresas } from '../hooks/useEmpresas';
import api from '../services/api';
import { useConfirmacao } from '../contexts/ConfirmacaoContext';
import TituloModal from '../components/common/TituloModal';
import { acaoTabela, acaoTabelaPerigo, botaoSecundario } from '../styles/tokens';
import { formatarCnpj } from '../utils/formatadores';

const Empresas = () => {
    const confirmar = useConfirmacao();
  const { enqueueSnackbar } = useSnackbar();
  const [searchParams] = useSearchParams();
  const eventoIdParam = searchParams.get('evento_id') || localStorage.getItem('active_evento_id');
  const [openDeleteConfirm, setOpenDeleteConfirm] = useState(false);
  const [empresaToDelete, setEmpresaToDelete] = useState(null);
  const [openQuotaDialog, setOpenQuotaDialog] = useState(false);
  const [openInviteDialog, setOpenInviteDialog] = useState(false);
  const [inviteResult, setInviteResult] = useState({ link: '', empresa: null });
  const [activePhaseTabEmpresa, setActivePhaseTabEmpresa] = useState('todas');

  useEffect(() => {
    if (eventoIdParam && eventoIdParam !== 'undefined' && eventoIdParam !== 'null') {
      localStorage.setItem('active_evento_id', eventoIdParam);
    }
  }, [eventoIdParam]);

  const {
      empresas, loading, saving, search, setSearch,
      page, setPage, rowsPerPage, setRowsPerPage, total,
      openDialog, setOpenDialog, selectedEmpresa, setSelectedEmpresa,
      activeEvent, dailyQuotas, setDailyQuotas,
      activeStep, setActiveStep, documentos,
      formData, setFormData, handleSave, handleDelete, handleSaveQuotas,
      handleAuditDocument, handleSelectAllDatesEmpresa, handleClearAllDatesEmpresa,
      handleSelectAllPhaseEmpresa, handleClearPhaseEmpresa, loadDocumentos
  } = useEmpresas(eventoIdParam);

  const steps = ['Dados cadastrais', 'Configurações', 'Documentos'];

  const columns = [
    {
      id: 'nome',
      label: 'Empresa',
      minWidth: 200,
      format: (val) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <BusinessIcon sx={{ color: '#00D4FF', fontSize: 20 }} />
          <Typography variant="body2" sx={{ fontWeight: 700 }}>{val}</Typography>
        </Box>
      )
    },
    { id: 'cnpj', label: 'CNPJ', minWidth: 170, format: (value) => formatarCnpj(value) },
    { id: 'max_colaboradores', label: 'Cota base', minWidth: 100 },
    {
      id: 'acoes',
      label: 'Ações',
      minWidth: 180,
      align: 'center',
      format: (value, row) => (
        <Stack direction="row" spacing={1} justifyContent="center">
          <IconButton
            size="small"
            onClick={() => handleCopyPhone(row)}
            sx={acaoTabela}
            title="Copiar telefone"
          >
            <WhatsAppIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            onClick={() => handleGerarConvite(row)}
            sx={acaoTabela}
            title="Gerar convite de cadastro"
          >
            <LinkIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            onClick={() => {
                setSelectedEmpresa(row);
                setOpenQuotaDialog(true);
            }}
            sx={acaoTabela}
            title="Gerenciar cotas diárias"
          >
            <QuotaIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            onClick={() => handleOpenEdit(row)}
            sx={acaoTabela}
            title="Editar"
          >
            <EditIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            onClick={() => {
                setEmpresaToDelete(row.id);
                setOpenDeleteConfirm(true);
            }}
            sx={acaoTabelaPerigo}
            title="Excluir"
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Stack>
      ),
    },
  ];

  const handleCopyPhone = (row) => {
    const telefone = row.telefone || row.responsavel_telefone || '';
    if (!telefone) {
      enqueueSnackbar('Telefone não cadastrado.', { variant: 'warning' });
      return;
    }

    const cleanPhone = telefone.replace(/\D/g, '');
    let waPhone = cleanPhone;
    if (waPhone && waPhone.length <= 11 && !waPhone.startsWith('55')) {
      waPhone = `55${waPhone}`;
    }

    const eventoNome = localStorage.getItem('active_evento_nome') || 'Evento';
    const publicUrl = 'https://cadastro.nzt.app.br'; // Fallback base
    
    // Se a empresa já tem um token, enviamos o link direto
    if (row.registration_token) {
      const link = `${publicUrl}/register/${row.registration_token}`;
      const body = encodeURIComponent(
        `Olá, *${row.responsavel || 'Responsável'}*!\n\n` +
        `Segue o link para registro da equipe da *${row.nome}* no evento *${eventoNome}*:\n\n` +
        `${link}`
      );
      window.open(`https://wa.me/${waPhone}?text=${body}`, '_blank');
    } else {
      // Caso contrário, apenas abre o chat
      window.open(`https://wa.me/${waPhone}`, '_blank');
    }
  };

  const handleGerarConvite = async (row, forceRefresh = false) => {
    try {
      // Se já tem token e não estamos forçando refresh, apenas mostra o que tem
      if (row.registration_token && !forceRefresh) {
        const publicUrl = 'https://cadastro.nzt.app.br';
        const link = `${publicUrl}/register/${row.registration_token}`;
        setInviteResult({ link, empresa: row });
        setOpenInviteDialog(true);
        return;
      }

      const { data } = await api.post(`/empresas/${row.id}/gerar-convite`, { refresh: forceRefresh });
      setInviteResult({
        link: data.link,
        empresa: row
      });
      setOpenInviteDialog(true);
      
      if (data.isNew) {
        await navigator.clipboard.writeText(data.link);
        enqueueSnackbar('Novo link gerado e copiado!', { variant: 'success' });
      }
    } catch (err) {
      enqueueSnackbar('Erro ao processar convite.', { variant: 'error' });
    }
  };

  const buildMailto = () => {
    if (!inviteResult.empresa) return '';
    const eventoNome = localStorage.getItem('active_evento_nome') || 'Evento';
    const empresaNome = inviteResult.empresa.nome;
    const responsavel = inviteResult.empresa.responsavel || 'Responsável';
    
    const subject = encodeURIComponent(`Convite de Gerenciamento de Staff - ${eventoNome}`);
    const body = encodeURIComponent(
      `Olá, ${responsavel}!\n\n` +
      `Temos o prazer de confirmar que a empresa ${empresaNome} foi cadastrada no evento ${eventoNome}.\n\n` +
      `Para registrar sua equipe, por favor utilize o portal de inscrições através do link abaixo. Você pode preencher diretamente ou repassar o link para seus colaboradores:\n` +
      `${inviteResult.link}\n\n` +
      `Atenciosamente,\n` +
      `Equipe de Credenciamento.`
    );
    
    return `mailto:${inviteResult.empresa.email_convite || inviteResult.empresa.email || ''}?subject=${subject}&body=${body}`;
  };

  const buildWhatsappLink = () => {
    if (!inviteResult.empresa) return '';
    const eventoNome = localStorage.getItem('active_evento_nome') || 'Evento';
    const empresaNome = inviteResult.empresa.nome;
    const responsavel = inviteResult.empresa.responsavel || 'Responsável';
    const telefone = inviteResult.empresa.telefone || inviteResult.empresa.responsavel_telefone || '';
    const cleanPhone = telefone.replace(/\D/g, '');
    let waPhone = cleanPhone;
    if (waPhone && waPhone.length <= 11 && !waPhone.startsWith('55')) {
      waPhone = `55${waPhone}`;
    }
    
    // Garantir que usamos o link gerado, que agora vem no formato correto do backend
    const body = encodeURIComponent(
      `Olá, *${responsavel}*!\n\n` +
      `Sua empresa *${empresaNome}* foi cadastrada para o evento *${eventoNome}*.\n` +
      `Para registrar sua equipe acesse ou compartilhe o portal abaixo:\n\n` +
      `${inviteResult.link}`
    );
    
    return `https://wa.me/${waPhone}?text=${body}`;
  };

  const getAllEventDates = () => {
    if (!activeEvent) return [];
    const allDates = [
      ...(activeEvent.datas_montagem || []),
      ...(activeEvent.datas_evento || []),
      ...(activeEvent.datas_desmontagem || [])
    ];
    return [...new Set(allDates)].sort();
  };

  const handleOpenEdit = (empresa) => {
      setActiveStep(0);
      setSelectedEmpresa(empresa);
      setFormData({
        nome: empresa.nome || '',
        cnpj: empresa.cnpj || '',
        servico: empresa.servico || empresa.tipo_operacao || '',
        email: empresa.email || '',
        telefone: empresa.telefone || '',
        email_convite: empresa.email_convite || '',
        responsavel: empresa.responsavel || empresa.responsavel_legal || '',
        observacao: empresa.observacao || '',
        registration_token: empresa.registration_token || '',
        max_colaboradores: empresa.max_colaboradores || 50,
        datas_presenca: Array.isArray(empresa.datas_presenca) && empresa.datas_presenca.length > 0 
          ? empresa.datas_presenca 
          : getAllEventDates()
      });
      setOpenDialog(true);
      loadDocumentos(empresa.id);
  };

  const handleNew = () => {
      setActiveStep(0);
      setSelectedEmpresa(null);
      setFormData({
        nome: '',
        cnpj: '',
        servico: '',
        email: '',
        telefone: '',
        email_convite: '',
        responsavel: '',
        observacao: '',
        registration_token: '',
        max_colaboradores: 50,
        datas_presenca: getAllEventDates()
      });
      setOpenDialog(true);
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'flex-start', md: 'flex-start' }, mb: 3, gap: 2 }}>
        <PageHeader
          title="Empresas"
          subtitle={eventoIdParam ? `Filtrando empresas do evento: ${localStorage.getItem('active_evento_nome')}` : "Gerencie as entidades terceirizadas do ecossistema."}
          breadcrumbs={[{ text: 'Dashboard' }, { text: 'Empresas' }]}
        />
        <NeonButton
          startIcon={<AddIcon />}
          onClick={handleNew}
          sx={{ mt: { xs: 0, md: 2 }, width: { xs: '100%', md: 'auto' } }}
        >
          Nova empresa
        </NeonButton>
      </Box>

      <GlassCard glowColor="#00D4FF" sx={{ p: 3, mb: 3 }}>
        <TextField
          fullWidth
          size="small"
          placeholder="Buscar por nome, CNPJ ou serviço..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          InputProps={{
            startAdornment: <SearchIcon sx={{ color: 'rgba(255,255,255,0.4)', mr: 1, fontSize: 20 }} />,
            sx: { bgcolor: 'rgba(0,0,0,0.25)', borderRadius: 1.5, color: '#FFFFFF', fontSize: '0.875rem', mb: 2.5 }
          }}
        />

        <DataTable
          columns={columns}
          data={empresas}
          loading={loading}
          totalCount={total}
          page={page}
          onPageChange={setPage}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={setRowsPerPage}
          sx={{
            '& .MuiTableHead-root': { background: 'rgba(0,212,255,0.05)' },
            border: '1px solid rgba(0,212,255,0.05)'
          }}
        />
      </GlassCard>

      <Dialog 
        open={openDialog} 
        onClose={() => setOpenDialog(false)} 
        maxWidth="md" 
        fullWidth 
        disableRestoreFocus
        PaperProps={{
          sx: {
            minHeight: { xs: '100%', md: '80vh' },
            maxHeight: { xs: '100%', md: '90vh' },
            height: { xs: '100%', md: '88vh' },
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
                    }
        }}
      >
        <TituloModal
          titulo={selectedEmpresa ? 'Editar empresa' : 'Nova empresa'}
          onFechar={() => setOpenDialog(false)}
          desabilitarFechar={saving}
        />
        <DialogContent sx={{ 
          p: { xs: 2.5, md: 3.5 }, 
          pr: { xs: 2, md: 2.5 }, 
          overflowY: 'auto', 
          display: 'flex', 
          flexDirection: 'column', 
          minHeight: 0, 
          height: '100%',
          maxHeight: '100%',
          flex: '1 1 auto',
          '&::-webkit-scrollbar': { width: '6px' }, 
          '&::-webkit-scrollbar-thumb': { background: 'rgba(0,212,255,0.4)', borderRadius: '10px' }, 
          '&::-webkit-scrollbar-track': { background: 'rgba(255,255,255,0.02)' } 
        }}>
          <Box sx={{ pr: { xs: 0, md: 0.5 }, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <Stepper activeStep={activeStep} alternativeLabel sx={{ pt: 1, mb: 2.5 }}>
            {steps.map((label) => (
              <Step key={label}>
                <StepLabel>{label}</StepLabel>
              </Step>
            ))}
          </Stepper>

          {activeStep === 0 && (
            <Box sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <TextField label="Razão social" fullWidth value={formData.nome} onChange={(e) => setFormData({ ...formData, nome: e.target.value })} />
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <TextField label="CNPJ" fullWidth value={formData.cnpj} onChange={(e) => setFormData({ ...formData, cnpj: e.target.value })} />
                </Grid>
                <Grid item xs={6}>
                  <TextField label="Serviço prestado" fullWidth value={formData.servico} onChange={(e) => setFormData({ ...formData, servico: e.target.value })} />
                </Grid>
              </Grid>
              <TextField label="Responsável" fullWidth value={formData.responsavel} onChange={(e) => setFormData({ ...formData, responsavel: e.target.value })} />
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <TextField label="E-mail" fullWidth value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
                </Grid>
                <Grid item xs={6}>
                  <TextField label="Telefone" fullWidth value={formData.telefone} onChange={(e) => setFormData({ ...formData, telefone: e.target.value })} />
                </Grid>
              </Grid>
              <TextField sx={{ mt: 2 }} label="E-mail para o convite de cadastro" fullWidth value={formData.email_convite} onChange={(e) => setFormData({ ...formData, email_convite: e.target.value })} />
            </Box>
          )}

          {activeStep === 1 && (
            <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2.5, flex: 1, minHeight: 0 }}>
              <Grid container spacing={2}>
                <Grid item xs={8}>
                  <TextField label="Link de cadastro da empresa" fullWidth disabled value={formData.registration_token} />
                </Grid>
                <Grid item xs={4}>
                  <TextField label="Cota máxima" type="number" fullWidth value={formData.max_colaboradores} onChange={(e) => setFormData({ ...formData, max_colaboradores: e.target.value })} />
                </Grid>
              </Grid>
              <TextField label="Observações" fullWidth multiline rows={2} value={formData.observacao} onChange={(e) => setFormData({ ...formData, observacao: e.target.value })} />

              {activeEvent && formData && (
                <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, mt: 1 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5, flexWrap: 'wrap', gap: 1 }}>
                    <Box>
                      <Typography variant="subtitle2" sx={{ color: '#00D4FF', fontWeight: 700, letterSpacing: '0.5px' }}>
                        Dias permitidos para acesso (terceirizados)
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', display: 'block' }}>
                        Define as datas autorizadas para os colaboradores vinculados a esta empresa.
                      </Typography>
                    </Box>
                    <Stack direction="row" spacing={1}>
                      <Button 
                        size="small" 
                        variant="outlined" 
                        onClick={handleSelectAllDatesEmpresa} 
                        sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#00FF88', borderColor: 'rgba(0,255,136,0.3)', py: 0.3, px: 1.5, '&:hover': { borderColor: '#00FF88', bgcolor: 'rgba(0,255,136,0.08)' } }}
                      >
                        Marcar todos
                      </Button>
                      <Button 
                        size="small" 
                        variant="outlined" 
                        onClick={handleClearAllDatesEmpresa} 
                        sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#FF3366', borderColor: 'rgba(255,51,102,0.3)', py: 0.3, px: 1.5, '&:hover': { borderColor: '#FF3366', bgcolor: 'rgba(255,51,102,0.08)' } }}
                      >
                        Limpar
                      </Button>
                    </Stack>
                  </Box>

                  {/* Botões de Navegação Direta de Fases para Empresas */}
                  <Stack direction="row" spacing={1} sx={{ mb: 1.5, flexWrap: 'wrap', gap: 0.5 }}>
                    {[
                      { id: 'todas', label: 'Todas as fases', color: '#00D4FF' },
                      { id: 'montagem', label: 'Montagem', color: '#00D4FF' },
                      { id: 'evento', label: 'Evento', color: '#00FF88' },
                      { id: 'desmontagem', label: 'Desmontagem', color: '#FFB800' }
                    ].map(tab => (
                      <Button
                        key={tab.id}
                        size="small"
                        variant={activePhaseTabEmpresa === tab.id ? 'contained' : 'outlined'}
                        onClick={() => setActivePhaseTabEmpresa(tab.id)}
                        sx={{
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          letterSpacing: '0.5px',
                          color: activePhaseTabEmpresa === tab.id ? '#0a1628' : tab.color,
                          bgcolor: activePhaseTabEmpresa === tab.id ? tab.color : 'transparent',
                          borderColor: tab.color,
                          py: 0.3,
                          px: 1.3,
                          boxShadow: activePhaseTabEmpresa === tab.id ? `0 0 10px ${tab.color}40` : 'none',
                          '&:hover': {
                            bgcolor: activePhaseTabEmpresa === tab.id ? tab.color : 'rgba(255,255,255,0.06)'
                          }
                        }}
                      >
                        {tab.label}
                      </Button>
                    ))}
                  </Stack>
                  
                  <Box 
                    sx={{ 
                      flex: 1,
                      minHeight: 0,
                      border: '1px solid rgba(0, 212, 255, 0.2)',
                      borderRadius: 1.5,
                      p: 2,
                      bgcolor: 'rgba(0,0,0,0.25)',
                      overflowY: 'auto',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 2,
                      '&::-webkit-scrollbar': { width: '6px' }, 
                      '&::-webkit-scrollbar-thumb': { background: 'rgba(0,212,255,0.5)', borderRadius: '10px' }, 
                      '&::-webkit-scrollbar-track': { background: 'rgba(255,255,255,0.02)' }
                    }}
                  >
                    {[
                      { id: 'montagem', label: 'Montagem', color: '#00D4FF', bg: 'rgba(0,212,255,0.04)', border: 'rgba(0,212,255,0.2)' },
                      { id: 'evento', label: 'Evento', color: '#00FF88', bg: 'rgba(0,255,136,0.04)', border: 'rgba(0,255,136,0.2)' },
                      { id: 'desmontagem', label: 'Desmontagem', color: '#FFB800', bg: 'rgba(255,184,0,0.05)', border: 'rgba(255,184,0,0.25)' }
                    ]
                      .filter(phase => activePhaseTabEmpresa === 'todas' || activePhaseTabEmpresa === phase.id)
                      .map(phase => {
                        const dates = (activeEvent && activeEvent[`datas_${phase.id}`]) || [];
                        if (!Array.isArray(dates) || dates.length === 0) return null;
                        const totalDates = dates.length;
                        const selectedCount = dates.filter(d => Array.isArray(formData?.datas_presenca) && formData.datas_presenca.includes(d)).length;

                        return (
                          <Box 
                            key={phase.id}
                            sx={{
                              p: 1.5,
                              borderRadius: 1.5,
                              bgcolor: phase.bg,
                              border: `1px solid ${phase.border}`
                            }}
                          >
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.2, flexWrap: 'wrap', gap: 1 }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Typography variant="caption" sx={{ color: phase.color, fontWeight: 700, letterSpacing: '1px', fontSize: '0.75rem' }}>
                                  {phase.label}
                                </Typography>
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem' }}>
                                  ({selectedCount}/{totalDates} dias selecionados)
                                </Typography>
                              </Box>
                              <Stack direction="row" spacing={0.8}>
                                <Button 
                                  size="small" 
                                  onClick={() => handleSelectAllPhaseEmpresa ? handleSelectAllPhaseEmpresa(phase.id) : null}
                                  sx={{ fontSize: '0.75rem', fontWeight: 700, color: phase.color, py: 0.2, px: 1, minWidth: 'auto', border: `1px solid ${phase.border}`, '&:hover': { bgcolor: `${phase.border}` } }}
                                >
                                  Todos
                                </Button>
                                <Button 
                                  size="small" 
                                  onClick={() => handleClearPhaseEmpresa ? handleClearPhaseEmpresa(phase.id) : null}
                                  sx={{ fontSize: '0.75rem', fontWeight: 700, color: 'rgba(255,255,255,0.5)', py: 0.2, px: 1, minWidth: 'auto', border: '1px solid rgba(255,255,255,0.1)', '&:hover': { color: '#FF3366', borderColor: '#FF3366' } }}
                                >
                                  Limpar
                                </Button>
                              </Stack>
                            </Box>

                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                              {dates.map(date => {
                                const isChecked = Array.isArray(formData?.datas_presenca) && formData.datas_presenca.includes(date);
                                return (
                                  <Box
                                    key={date}
                                    onClick={() => {
                                      const currentDates = Array.isArray(formData?.datas_presenca) ? [...formData.datas_presenca] : [];
                                      const newDates = currentDates.includes(date)
                                        ? currentDates.filter(d => d !== date)
                                        : [...currentDates, date];
                                      setFormData({ ...formData, datas_presenca: newDates });
                                    }}
                                    sx={{
                                      cursor: 'pointer',
                                      userSelect: 'none',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 0.8,
                                      px: 1.2,
                                      py: 0.6,
                                      borderRadius: 1.5,
                                      border: `1px solid ${isChecked ? phase.color : 'rgba(255,255,255,0.1)'}`,
                                      bgcolor: isChecked ? `${phase.color}18` : 'rgba(255,255,255,0.02)',
                                      boxShadow: isChecked ? `0 0 10px ${phase.color}30` : 'none',
                                      transition: 'all 0.15s ease',
                                      '&:hover': {
                                        borderColor: phase.color,
                                        bgcolor: `${phase.color}10`
                                      }
                                    }}
                                  >
                                    <Box sx={{
                                      width: 16,
                                      height: 16,
                                      borderRadius: 1,
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      bgcolor: isChecked ? phase.color : 'transparent',
                                      border: `1px solid ${isChecked ? phase.color : 'rgba(255,255,255,0.3)'}`
                                    }}>
                                      {isChecked && <CheckIcon sx={{ fontSize: 13, color: '#0a1628', fontWeight: 700 }} />}
                                    </Box>
                                    <Typography variant="caption" sx={{ color: isChecked ? '#FFFFFF' : 'rgba(255,255,255,0.7)', fontWeight: isChecked ? 700 : 500, fontSize: '0.75rem' }}>
                                      {date ? format(new Date(date + 'T00:00:00'), "dd/MM") : '--/--'}
                                    </Typography>
                                  </Box>
                                );
                              })}
                            </Box>
                          </Box>
                        );
                      })}
                  </Box>
                </Box>
              )}
            </Box>
          )}

          {activeStep === 2 && (
            <Box sx={{ pt: 2, textAlign: 'center' }}>
              {!selectedEmpresa ? (
                <Typography color="text.secondary" sx={{ py: 4 }}>Por favor, salve a empresa primeiro antes de gerenciar documentos.</Typography>
              ) : (
                <Box>
                  <Stack spacing={2} sx={{ mb: 3 }}>
                    {documentos.length === 0 ? (
                      <Typography variant="body2" color="text.secondary">Nenhum documento formal anexado ainda.</Typography>
                    ) : (
                      documentos.map(doc => (
                        <Box key={doc.id} sx={{ p: 2, bgcolor: 'rgba(0,0,0,0.2)', borderRadius: 1.5, border: '1px solid rgba(0, 212, 255, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <FileIcon sx={{ color: '#00D4FF' }} />
                            <Box sx={{ textAlign: 'left' }}>
                              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{doc.titulo}</Typography>
                              <Typography variant="caption" color="text.secondary">{doc.tipo_doc} • {new Date(doc.data_inclusao).toLocaleDateString()}</Typography>
                            </Box>
                          </Box>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            {doc.status === 'pendente' ? (
                              <Stack direction="row" spacing={1}>
                                <Tooltip title="Aprovar"><IconButton size="small" onClick={() => handleAuditDocument(doc.id, 'aprovado')} sx={{ color: '#00FF88', border: '1px solid rgba(0,255,136,0.2)' }}><CheckCircleIcon fontSize="small" /></IconButton></Tooltip>
                                <Tooltip title="Rejeitar"><IconButton size="small" onClick={() => handleAuditDocument(doc.id, 'rejeitado')} sx={{ color: '#FF3366', border: '1px solid rgba(255,51,102,0.2)' }}><CancelIcon fontSize="small" /></IconButton></Tooltip>
                              </Stack>
                            ) : (
                              <>
                                {doc.status === 'aprovado' && <CheckCircleIcon sx={{ color: '#00FF88' }} />}
                                {doc.status === 'rejeitado' && <CancelIcon sx={{ color: '#FF3366' }} />}
                              </>
                            )}
                            <IconButton size="small" onClick={() => window.open(doc.url_arquivo, '_blank')} sx={{ color: 'rgba(255,255,255,0.5)' }}><LinkIcon fontSize="small" /></IconButton>
                          </Box>
                        </Box>
                      ))
                    )}
                  </Stack>
                </Box>
              )}
            </Box>
          )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 3, px: 6, justifyContent: 'space-between', borderTop: '1px solid rgba(255, 255, 255, 0.05)', bgcolor: 'rgba(10, 25, 41, 0.5)' }}>
          <Button variant="outlined" onClick={() => setOpenDialog(false)} disabled={saving} sx={botaoSecundario}>Cancelar</Button>
          <Box sx={{ display: 'flex', gap: 2 }}>
            {activeStep > 0 && <Button variant="outlined" onClick={() => setActiveStep(prev => prev - 1)} sx={botaoSecundario}>Voltar</Button>}
            {activeStep < steps.length - 1 ? (
              <NeonButton onClick={() => setActiveStep(prev => prev + 1)}>Próxima etapa</NeonButton>
            ) : (
              <NeonButton onClick={handleSave} loading={saving}>Finalizar & salvar</NeonButton>
            )}
          </Box>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={openDeleteConfirm}
        title="Remover empresa?"
        description="Esta ação desvinculará a empresa do ecossistema. Colaboradores vinculados serão mantidos, mas podem perder acesso a certas áreas."
        onConfirm={async () => {
            await handleDelete(empresaToDelete);
            setOpenDeleteConfirm(false);
        }}
        onClose={() => setOpenDeleteConfirm(false)}
      />

      <Dialog open={openQuotaDialog} onClose={() => setOpenQuotaDialog(false)} maxWidth="sm" fullWidth disableRestoreFocus>
        <TituloModal
          titulo="Cotas diárias"
          subtitulo={selectedEmpresa?.nome}
          onFechar={() => setOpenQuotaDialog(false)}
        />
        <DialogContent sx={{ p: 4 }}>
            {!activeEvent ? (
              <Typography color="error" variant="subtitle2">Nenhum evento ativo detectado.</Typography>
            ) : (
              <Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
                  <Typography variant="overline" sx={{ color: '#00D4FF', fontWeight: 700 }}>Planejamento diário</Typography>
                  <Button size="small" variant="outlined" onClick={() => {
                      const newQuotas = {};
                      getAllEventDates().forEach(d => newQuotas[d] = selectedEmpresa?.max_colaboradores ?? 50);
                      setDailyQuotas(newQuotas);
                  }}>Cota padrão</Button>
                </Box>
                <Box sx={{ maxHeight: 400, overflowY: 'auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                  {getAllEventDates().map(date => (
                    <Box key={date} sx={{ p: 2, bgcolor: 'rgba(0,0,0,0.2)', borderRadius: 1.5 }}>
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>{date ? format(new Date(date + 'T00:00:00'), "dd/MM") : '--/--'}</Typography>
                      <TextField size="small" type="number" fullWidth value={dailyQuotas[date] || 0} onChange={(e) => setDailyQuotas({ ...dailyQuotas, [date]: parseInt(e.target.value) || 0 })} />
                    </Box>
                  ))}
                </Box>
              </Box>
            )}
        </DialogContent>
        <DialogActions sx={{ p: 3, borderTop: '1px solid rgba(255, 255, 255, 0.05)' }}>
          <Button variant="outlined" onClick={() => setOpenQuotaDialog(false)} sx={botaoSecundario}>Cancelar</Button>
          <NeonButton onClick={async () => {
              if (await handleSaveQuotas()) setOpenQuotaDialog(false);
          }}>Salvar cotas</NeonButton>
        </DialogActions>
      </Dialog>
      <Dialog open={openInviteDialog} onClose={() => setOpenInviteDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, textAlign: 'center' }}>Convite gerado</DialogTitle>
        <DialogContent sx={{ textAlign: 'center', py: 3 }}>
          <Typography variant="body2" sx={{ mb: 3, color: 'text.secondary' }}>
            O link de acesso seguro para a empresa <strong>{inviteResult.empresa?.nome}</strong> foi gerado com sucesso.
          </Typography>
          
          <Box sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.05)', borderRadius: 1.5, mb: 3, wordBreak: 'break-all' }}>
            <Typography variant="caption" sx={{ color: '#00D4FF', fontWeight: 700 }}>{inviteResult.link}</Typography>
          </Box>

          <Stack direction="row" spacing={2} justifyContent="center">
            <Button 
                variant="outlined" 
                startIcon={<CopyIcon />}
                onClick={() => {
                    navigator.clipboard.writeText(inviteResult.link);
                    enqueueSnackbar('Link copiado!', { variant: 'success' });
                }}
            >
                Copiar
            </Button>
            <Button 
                variant="outlined" 
                startIcon={<WhatsAppIcon />}
                component="a"
                href={buildWhatsappLink()}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setOpenInviteDialog(false)}
                sx={{ borderColor: '#25D366', color: '#25D366', '&:hover': { bgcolor: 'rgba(37, 211, 102, 0.1)', borderColor: '#25D366' } }}
            >
                WhatsApp
            </Button>
            
            <Button 
                variant="contained" 
                color="primary"
                startIcon={<EmailIcon />}
                component="a"
                href={buildMailto()}
                onClick={() => setOpenInviteDialog(false)}
                sx={{ bgcolor: '#00D4FF', color: '#000000', fontWeight: 700 }}
            >
                Enviar e-mail
            </Button>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
            <Button variant="outlined" onClick={() => setOpenInviteDialog(false)} sx={botaoSecundario}>Fechar</Button>
            <Button 
                size="small"
                onClick={async () => {
                    const ok = await confirmar({ titulo: 'Gerar novo link', mensagem: 'O link atual deixa de funcionar. Gerar um novo?', textoConfirmar: 'Gerar novo link', perigo: false });
                    if (ok) handleGerarConvite(inviteResult.empresa, true);
                }}
                sx={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.75rem' }}
            >
                Reciclar link
            </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Empresas;
