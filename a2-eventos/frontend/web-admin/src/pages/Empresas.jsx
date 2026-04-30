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
  Divider,
  Tooltip,
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
  CloudUpload as UploadIcon,
  InsertDriveFile as FileIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
  WhatsApp as WhatsAppIcon,
  Telegram as TelegramIcon,
  Email as EmailIcon,
} from '@mui/icons-material';
import GlassCard from '../components/common/GlassCard';
import PageHeader from '../components/common/PageHeader';
import NeonButton from '../components/common/NeonButton';
import DataTable from '../components/common/DataTable';
import ConfirmDialog from '../components/common/ConfirmDialog';
import { styled } from '@mui/material/styles';
import { useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useSnackbar } from 'notistack';
import { useEmpresas } from '../hooks/useEmpresas';
import api from '../services/api';

const SearchWrapper = styled(Box)(({ theme }) => ({
  background: 'rgba(10, 22, 40, 0.6)',
  border: '1px solid rgba(0, 212, 255, 0.1)',
  borderRadius: 12,
  padding: theme.spacing(1, 2),
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(1),
  marginBottom: theme.spacing(3),
  '&:focus-within': {
    border: '1px solid rgba(0, 212, 255, 0.4)',
    boxShadow: '0 0 10px rgba(0, 212, 255, 0.1)',
  }
}));

const Empresas = () => {
  const { enqueueSnackbar } = useSnackbar();
  const [searchParams] = useSearchParams();
  const eventoIdParam = searchParams.get('evento_id') || localStorage.getItem('active_evento_id');
  const [openDeleteConfirm, setOpenDeleteConfirm] = useState(false);
  const [empresaToDelete, setEmpresaToDelete] = useState(null);
  const [openQuotaDialog, setOpenQuotaDialog] = useState(false);
  const [openInviteDialog, setOpenInviteDialog] = useState(false);
  const [inviteResult, setInviteResult] = useState({ link: '', empresa: null });

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
      handleAuditDocument, loadDocumentos
  } = useEmpresas(eventoIdParam);

  const steps = ['Dados Cadastrais', 'Configurações Avançadas', 'Documentação (ECM)'];

  const columns = [
    {
      id: 'nome',
      label: 'EMPRESA',
      minWidth: 200,
      format: (val) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <BusinessIcon sx={{ color: '#00D4FF', fontSize: 20 }} />
          <Typography variant="body2" sx={{ fontWeight: 700 }}>{val}</Typography>
        </Box>
      )
    },
    { id: 'cnpj', label: 'ID/CNPJ', minWidth: 150 },
    { id: 'max_colaboradores', label: 'COTA BASE', minWidth: 100 },
    {
      id: 'acoes',
      label: 'AÇÕES',
      minWidth: 180,
      align: 'center',
      format: (value, row) => (
        <Stack direction="row" spacing={1} justifyContent="center">
          <IconButton
            size="small"
            onClick={() => handleCopyPhone(row)}
            sx={{ color: '#00FF88', background: 'rgba(0,255,136,0.05)' }}
            title="Copiar telefone"
          >
            <WhatsAppIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            onClick={() => handleGerarConvite(row)}
            sx={{ color: '#00D4FF', background: 'rgba(0,212,255,0.05)' }}
            title="Gerar Convite de Cadastro"
          >
            <LinkIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            onClick={() => {
                setSelectedEmpresa(row);
                setOpenQuotaDialog(true);
            }}
            sx={{ color: '#FFB800', background: 'rgba(255,184,0,0.05)' }}
            title="Gerenciar Cotas Diárias"
          >
            <QuotaIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            onClick={() => handleOpenEdit(row)}
            sx={{ color: '#00D4FF', background: 'rgba(0,212,255,0.05)' }}
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
            sx={{ color: '#FF3366', background: 'rgba(255,51,102,0.05)' }}
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
      window.open(`https://wa.me/55${cleanPhone}?text=${body}`, '_blank');
    } else {
      // Caso contrário, apenas abre o chat
      window.open(`https://wa.me/55${cleanPhone}`, '_blank');
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
    
    // Garantir que usamos o link gerado, que agora vem no formato correto do backend
    const body = encodeURIComponent(
      `Olá, *${responsavel}*!\n\n` +
      `Sua empresa *${empresaNome}* foi cadastrada para o evento *${eventoNome}*.\n` +
      `Para registrar sua equipe acesse ou compartilhe o portal abaixo:\n\n` +
      `${inviteResult.link}`
    );
    
    return `https://wa.me/55${cleanPhone}?text=${body}`;
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
        max_colaboradores: empresa.max_colaboradores || 50
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
        max_colaboradores: 50
      });
      setOpenDialog(true);
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

  return (
    <Box sx={{ p: { xs: 1, md: 4 } }}>
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'flex-start', md: 'flex-start' }, mb: 4, gap: 2 }}>
        <PageHeader
          title="PAINEL DE EMPRESAS"
          subtitle={eventoIdParam ? `Filtrando empresas do evento: ${localStorage.getItem('active_evento_nome')}` : "Gerencie as entidades terceirizadas do ecossistema."}
          breadcrumbs={[{ text: 'Dashboard' }, { text: 'Empresas' }]}
        />
        <NeonButton
          startIcon={<AddIcon />}
          onClick={handleNew}
          sx={{ mt: { xs: 0, md: 2 }, width: { xs: '100%', md: 'auto' } }}
        >
          Anexar Empresa
        </NeonButton>
      </Box>

      <GlassCard glowColor="#00D4FF" sx={{ p: 3, mb: 3 }}>
        <SearchWrapper>
          <SearchIcon sx={{ color: 'text.secondary' }} />
          <input
            type="text"
            placeholder="Rastrear por nome, CNPJ ou serviço..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#fff',
              width: '100%',
              outline: 'none',
              fontFamily: 'inherit',
              fontSize: '0.9rem'
            }}
          />
        </SearchWrapper>

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

      <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="sm" fullWidth disableRestoreFocus>
        <DialogTitle sx={{ fontFamily: '"Orbitron", sans-serif', fontWeight: 700, letterSpacing: '2px' }}>
          {selectedEmpresa ? 'MODIFICAR EMPRESA' : 'ANEXAR NOVA EMPRESA'}
        </DialogTitle>
        <DialogContent>
          <Stepper activeStep={activeStep} alternativeLabel sx={{ pt: 3, mb: 4 }}>
            {steps.map((label) => (
              <Step key={label}>
                <StepLabel>{label}</StepLabel>
              </Step>
            ))}
          </Stepper>

          {activeStep === 0 && (
            <Box sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <TextField label="Nome da Empresa (Razão Social)" fullWidth value={formData.nome} onChange={(e) => setFormData({ ...formData, nome: e.target.value })} />
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <TextField label="CNPJ / ID Fiscal" fullWidth value={formData.cnpj} onChange={(e) => setFormData({ ...formData, cnpj: e.target.value })} />
                </Grid>
                <Grid item xs={6}>
                  <TextField label="Tipo de Operação / Serviço" fullWidth value={formData.servico} onChange={(e) => setFormData({ ...formData, servico: e.target.value })} />
                </Grid>
              </Grid>
              <TextField label="Responsável Legal" fullWidth value={formData.responsavel} onChange={(e) => setFormData({ ...formData, responsavel: e.target.value })} />
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <TextField label="E-mail Corporativo" fullWidth value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
                </Grid>
                <Grid item xs={6}>
                  <TextField label="Telefone" fullWidth value={formData.telefone} onChange={(e) => setFormData({ ...formData, telefone: e.target.value })} />
                </Grid>
              </Grid>
              <TextField sx={{ mt: 2 }} label="E-mail Recebimento de Convite" fullWidth value={formData.email_convite} onChange={(e) => setFormData({ ...formData, email_convite: e.target.value })} />
            </Box>
          )}

          {activeStep === 1 && (
            <Box sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <Grid container spacing={2}>
                <Grid item xs={8}>
                  <TextField label="Token de Registro Seguro (Envio B2B)" fullWidth disabled value={formData.registration_token} />
                </Grid>
                <Grid item xs={4}>
                  <TextField label="Cota Total Max." type="number" fullWidth value={formData.max_colaboradores} onChange={(e) => setFormData({ ...formData, max_colaboradores: e.target.value })} />
                </Grid>
              </Grid>
              <TextField label="Notas de Operação e Logística" fullWidth multiline rows={4} value={formData.observacao} onChange={(e) => setFormData({ ...formData, observacao: e.target.value })} />
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
                        <Box key={doc.id} sx={{ p: 2, bgcolor: 'rgba(0,0,0,0.2)', borderRadius: 2, border: '1px solid rgba(0, 212, 255, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
        </DialogContent>
        <DialogActions sx={{ p: 3, justifyContent: 'space-between' }}>
          <Button onClick={() => setOpenDialog(false)} disabled={saving} sx={{ color: 'text.secondary' }}>CANCELAR</Button>
          <Box>
            {activeStep > 0 && <Button onClick={() => setActiveStep(prev => prev - 1)} sx={{ mr: 1, color: '#fff' }}>Voltar</Button>}
            {activeStep < steps.length - 1 ? (
              <NeonButton onClick={() => setActiveStep(prev => prev + 1)}>PRÓXIMA ETAPA</NeonButton>
            ) : (
              <NeonButton onClick={handleSave} loading={saving}>FINALIZAR & SALVAR</NeonButton>
            )}
          </Box>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={openDeleteConfirm}
        title="Remover Empresa?"
        description="Esta ação desvinculará a empresa do ecossistema. Colaboradores vinculados serão mantidos, mas podem perder acesso a certas áreas."
        onConfirm={async () => {
            await handleDelete(empresaToDelete);
            setOpenDeleteConfirm(false);
        }}
        onClose={() => setOpenDeleteConfirm(false)}
      />

      <Dialog open={openQuotaDialog} onClose={() => setOpenQuotaDialog(false)} maxWidth="sm" fullWidth disableRestoreFocus>
        <DialogTitle sx={{ fontFamily: '"Orbitron", sans-serif', fontWeight: 700, color: '#fff', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', py: 2.5, px: 4 }}>
          GERENCIAMENTO DE COTAS: {selectedEmpresa?.nome}
        </DialogTitle>
        <DialogContent sx={{ p: 4 }}>
            {!activeEvent ? (
              <Typography color="error" variant="subtitle2">Nenhum evento ativo detectado.</Typography>
            ) : (
              <Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
                  <Typography variant="overline" sx={{ color: '#00D4FF', fontWeight: 800 }}>PLANEJAMENTO DIÁRIO</Typography>
                  <Button size="small" variant="outlined" onClick={() => {
                      const newQuotas = {};
                      getAllEventDates().forEach(d => newQuotas[d] = selectedEmpresa?.max_colaboradores ?? 50);
                      setDailyQuotas(newQuotas);
                  }}>COTA PADRÃO</Button>
                </Box>
                <Box sx={{ maxHeight: 400, overflowY: 'auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                  {getAllEventDates().map(date => (
                    <Box key={date} sx={{ p: 2, bgcolor: 'rgba(0,0,0,0.2)', borderRadius: 2 }}>
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>{format(new Date(date + 'T00:00:00'), "dd/MM")}</Typography>
                      <TextField size="small" type="number" fullWidth value={dailyQuotas[date] || 0} onChange={(e) => setDailyQuotas({ ...dailyQuotas, [date]: parseInt(e.target.value) || 0 })} />
                    </Box>
                  ))}
                </Box>
              </Box>
            )}
        </DialogContent>
        <DialogActions sx={{ p: 3, borderTop: '1px solid rgba(255, 255, 255, 0.05)' }}>
          <Button onClick={() => setOpenQuotaDialog(false)}>ABORTAR</Button>
          <NeonButton onClick={async () => {
              if (await handleSaveQuotas()) setOpenQuotaDialog(false);
          }}>SALVAR COTAS</NeonButton>
        </DialogActions>
      </Dialog>
      <Dialog open={openInviteDialog} onClose={() => setOpenInviteDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800, textAlign: 'center' }}>CONVITE GERADO</DialogTitle>
        <DialogContent sx={{ textAlign: 'center', py: 3 }}>
          <Typography variant="body2" sx={{ mb: 3, color: 'text.secondary' }}>
            O link de acesso seguro para a empresa <strong>{inviteResult.empresa?.nome}</strong> foi gerado com sucesso.
          </Typography>
          
          <Box sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.05)', borderRadius: 2, mb: 3, wordBreak: 'break-all' }}>
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
                COPIAR
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
                WHATSAPP
            </Button>
            
            <Button 
                variant="contained" 
                color="primary"
                startIcon={<EmailIcon />}
                component="a"
                href={buildMailto()}
                onClick={() => setOpenInviteDialog(false)}
                sx={{ bgcolor: '#00D4FF', color: '#000', fontWeight: 800 }}
            >
                ENVIAR E-MAIL
            </Button>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
            <Button onClick={() => setOpenInviteDialog(false)}>FECHAR</Button>
            <Button 
                size="small"
                onClick={() => {
                    if (window.confirm('Deseja realmente invalidar o link atual e gerar um novo? O link antigo parará de funcionar.')) {
                        handleGerarConvite(inviteResult.empresa, true);
                    }
                }}
                sx={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.7rem' }}
            >
                RECICLAR LINK
            </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Empresas;
