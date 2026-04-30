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
} from '@mui/icons-material';
import api from '../services/api';
import GlassCard from '../components/common/GlassCard';
import PageHeader from '../components/common/PageHeader';
import NeonButton from '../components/common/NeonButton';
import DataTable from '../components/common/DataTable';
import ConfirmDialog from '../components/common/ConfirmDialog';
import { styled } from '@mui/material/styles';
import { useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

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
  const [searchParams] = useSearchParams();
  const eventoIdParam = searchParams.get('evento_id') || localStorage.getItem('active_evento_id');
  const [empresas, setEmpresas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [openDialog, setOpenDialog] = useState(false);
  const [openDeleteConfirm, setOpenDeleteConfirm] = useState(false);
  const [empresaToDelete, setEmpresaToDelete] = useState(null);
  const [openQuotaDialog, setOpenQuotaDialog] = useState(false);
  const [selectedEmpresa, setSelectedEmpresa] = useState(null);
  const [activeEvent, setActiveEvent] = useState(null);
  const [dailyQuotas, setDailyQuotas] = useState({});
  const [activeStep, setActiveStep] = useState(0);
  const steps = ['Dados Cadastrais', 'Configurações Avançadas', 'Documentação (ECM)'];
  const [documentos, setDocumentos] = useState([]);
  const [formData, setFormData] = useState({
    nome: '',
    cnpj: '',
    servico: '', // Agora refletindo tipo_operacao internamente
    email: '',
    email_convite: '',
    responsavel: '', // Responsavel legal
    observacao: '',
    registration_token: '',
    max_colaboradores: 50
  });

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
            onClick={() => handleCopyLink(row.registration_token)}
            sx={{ color: '#00FF88', background: 'rgba(0,255,136,0.05)' }}
            title="Copiar Link de Cadastro"
          >
            <CopyIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            onClick={() => handleOpenQuotaDialog(row)}
            sx={{ color: '#FFB800', background: 'rgba(255,184,0,0.05)' }}
            title="Gerenciar Cotas Diárias"
          >
            <QuotaIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            onClick={() => handleOpenDialog(row)}
            sx={{ color: '#00D4FF', background: 'rgba(0,212,255,0.05)' }}
            title="Editar"
          >
            <EditIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            onClick={() => handleDelete(row.id)}
            sx={{ color: '#FF3366', background: 'rgba(255,51,102,0.05)' }}
            title="Excluir"
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Stack>
      ),
    },
  ];

  useEffect(() => {
    loadEmpresas();
    fetchActiveEvent();
  }, [search]);

  const fetchActiveEvent = async () => {
    try {
      const resp = await api.get('/eventos');
      const active = resp.data.data.find(e => e.id === eventoIdParam) || resp.data.data.find(e => e.status === 'ativo');
      setActiveEvent(active);
    } catch (e) {
      console.error('Erro ao buscar evento ativo');
    }
  };

  // Get all unique sorted dates from event phases
  const getAllEventDates = () => {
    if (!activeEvent) return [];
    const allDates = [
      ...(activeEvent.datas_montagem || []),
      ...(activeEvent.datas_evento || []),
      ...(activeEvent.datas_desmontagem || [])
    ];
    // Ensure dates are unique and sorted
    return [...new Set(allDates)].sort();
  };

  const loadEmpresas = async () => {
    try {
      setLoading(true);
      const response = await api.get('/empresas', {
        params: {
          search: search || undefined,
          evento_id: eventoIdParam || undefined
        },
      });
      setEmpresas(response.data.data || []);
    } catch (error) {
      console.error('Erro ao carregar empresas:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyLink = (token) => {
    if (!token) {
      alert('Token de registro não gerado para esta empresa.');
      return;
    }
    const url = `${window.location.protocol}//${window.location.hostname}:3000/register/${token}`;
    navigator.clipboard.writeText(url);
    alert('Link de cadastro copiado para o clipboard!');
  };

  const handleOpenQuotaDialog = async (empresa) => {
    setSelectedEmpresa(empresa);
    setDailyQuotas({});
    if (activeEvent) {
      try {
        const resp = await api.get(`/eventos/${activeEvent.id}/quotas/${empresa.id}`);
        const quotas = {};
        resp.data.data.forEach(q => {
          quotas[q.data] = q.cota;
        });
        setDailyQuotas(quotas);
      } catch (e) {
        console.log('Sem cotas prévias definidas');
      }
    }
    setOpenQuotaDialog(true);
  };

  const handleSaveQuotas = async () => {
    try {
      await api.post(`/eventos/${activeEvent.id}/quotas/${selectedEmpresa.id}`, {
        quotas: dailyQuotas
      });
      setOpenQuotaDialog(false);
      alert('Cotas diárias sincronizadas com sucesso!');
    } catch (e) {
      alert('Falha ao salvar cotas');
    }
  };

  const handleOpenDialog = (empresa = null) => {
    setActiveStep(0);
    if (empresa) {
      setSelectedEmpresa(empresa);
      setFormData({
        nome: empresa.nome || '',
        cnpj: empresa.cnpj || '',
        servico: empresa.servico || empresa.tipo_operacao || '',
        email: empresa.email || '',
        email_convite: empresa.email_convite || '',
        responsavel: empresa.responsavel || empresa.responsavel_legal || '',
        observacao: empresa.observacao || '',
        registration_token: empresa.registration_token || '',
        max_colaboradores: empresa.max_colaboradores || 50
      });
    } else {
      setSelectedEmpresa(null);
      setFormData({
        nome: '',
        cnpj: '',
        servico: '',
        email: '',
        email_convite: '',
        responsavel: '',
        observacao: '',
        registration_token: Math.random().toString(36).substring(2, 15),
        max_colaboradores: 50
      });
      setDocumentos([]);
    }
    setOpenDialog(true);
  };

  const loadDocumentos = async (empresaId) => {
    try {
      const resp = await api.get(`/documentos/empresa/${empresaId}`);
      setDocumentos(resp.data.data || []);
    } catch (e) {
      console.error('Falha ao buscar docs', e);
    }
  };

  useEffect(() => {
    if (openDialog && selectedEmpresa) {
      loadDocumentos(selectedEmpresa.id);
    }
  }, [openDialog, selectedEmpresa]);

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setSelectedEmpresa(null);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const payload = {
        ...formData,
        tipo_operacao: formData.servico,
        responsavel_legal: formData.responsavel
      };

      if (selectedEmpresa) {
        await api.put(`/empresas/${selectedEmpresa.id}`, payload);
      } else {
        await api.post('/empresas', payload);
      }
      handleCloseDialog();
      loadEmpresas();
    } catch (error) {
      console.error('Erro ao salvar empresa:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (id) => {
    setEmpresaToDelete(id);
    setOpenDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    try {
      setDeleteLoading(true);
      await api.delete(`/empresas/${empresaToDelete}`);
      setOpenDeleteConfirm(false);
      setEmpresaToDelete(null);
      loadEmpresas();
    } catch (error) {
      console.error('Erro ao excluir empresa:', error);
      alert('Falha ao desativar empresa.');
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <Box sx={{ p: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 4 }}>
        <PageHeader
          title="PAINEL DE EMPRESAS"
          subtitle={eventoIdParam ? `Filtrando empresas do evento: ${localStorage.getItem('active_evento_nome')}` : "Gerencie as entidades terceirizadas do ecossistema."}
          breadcrumbs={[{ text: 'Dashboard' }, { text: 'Empresas' }]}
        />
        <NeonButton
          startIcon={<AddIcon />}
          onClick={() => handleOpenDialog()}
          sx={{ mt: 2 }}
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
          sx={{
            '& .MuiTableHead-root': { background: 'rgba(0,212,255,0.05)' },
            border: '1px solid rgba(0,212,255,0.05)'
          }}
        />
      </GlassCard>

      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth disableRestoreFocus>
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
              <TextField
                label="Nome da Empresa (Razão Social)"
                fullWidth
                value={formData.nome}
                onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
              />
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <TextField
                    label="CNPJ / ID Fiscal"
                    fullWidth
                    value={formData.cnpj}
                    onChange={(e) => setFormData({ ...formData, cnpj: e.target.value })}
                  />
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    label="Tipo de Operação / Serviço"
                    fullWidth
                    value={formData.servico}
                    onChange={(e) => setFormData({ ...formData, servico: e.target.value })}
                  />
                </Grid>
              </Grid>
              <TextField
                label="Responsável Legal"
                fullWidth
                value={formData.responsavel}
                onChange={(e) => setFormData({ ...formData, responsavel: e.target.value })}
              />
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <TextField
                    label="E-mail Corporativo Básicao"
                    fullWidth
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    label="E-mail Recebimento de Convite"
                    fullWidth
                    value={formData.email_convite}
                    onChange={(e) => setFormData({ ...formData, email_convite: e.target.value })}
                  />
                </Grid>
              </Grid>
            </Box>
          )}

          {activeStep === 1 && (
            <Box sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <Grid container spacing={2}>
                <Grid item xs={8}>
                  <TextField
                    label="Token de Registro Seguro (Envio B2B)"
                    fullWidth
                    disabled
                    value={formData.registration_token}
                    InputProps={{
                      endAdornment: (
                        <IconButton disabled>
                          <LinkIcon />
                        </IconButton>
                      )
                    }}
                  />
                </Grid>
                <Grid item xs={4}>
                  <TextField
                    label="Cota Total Max."
                    type="number"
                    fullWidth
                    value={formData.max_colaboradores}
                    onChange={(e) => setFormData({ ...formData, max_colaboradores: e.target.value })}
                  />
                </Grid>
              </Grid>
              <TextField
                label="Notas de Operação e Logística"
                fullWidth
                multiline
                rows={4}
                value={formData.observacao}
                onChange={(e) => setFormData({ ...formData, observacao: e.target.value })}
              />
            </Box>
          )}

          {activeStep === 2 && (
            <Box sx={{ pt: 2, textAlign: 'center' }}>
              {!selectedEmpresa ? (
                <Typography color="text.secondary" sx={{ py: 4 }}>
                  Por favor, salve a empresa primeiro antes de gerenciar documentos.
                </Typography>
              ) : (
                <Box>
                  <Stack spacing={2} sx={{ mb: 3 }}>
                    {documentos.length === 0 ? (
                      <Typography variant="body2" color="text.secondary">
                        Nenhum documento formal (Contratos/Alvarás) anexado à empresa ainda.
                        Envie-os acessando o <b style={{ color: '#00D4FF' }}>Portal B2B das Empresas</b> através do link de registro seguro na aba anterior.
                      </Typography>
                    ) : (
                      documentos.map(doc => (
                        <Box key={doc.id} sx={{ p: 2, bgcolor: 'rgba(0,0,0,0.2)', borderRadius: 2, border: '1px solid rgba(0, 212, 255, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <FileIcon sx={{ color: '#00D4FF' }} />
                            <Box sx={{ textAlign: 'left' }}>
                              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{doc.titulo}</Typography>
                              <Typography variant="caption" color="text.secondary">{doc.tipo_doc} • Uploaded in {new Date(doc.data_inclusao).toLocaleDateString()}</Typography>
                            </Box>
                          </Box>
                          <Box>
                            {doc.status === 'aprovado' && <CheckCircleIcon sx={{ color: '#00FF88' }} titleAccess="Aprovado" />}
                            {doc.status === 'rejeitado' && <CancelIcon sx={{ color: '#FF3366' }} titleAccess="Rejeitado" />}
                            {doc.status === 'pendente' && <Typography variant="caption" sx={{ color: '#FFB800', border: '1px solid', px: 1, borderRadius: 1 }}>PENDENTE AUDITORIA</Typography>}
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
          <Button onClick={handleCloseDialog} disabled={saving} sx={{ color: 'text.secondary' }}>CANCELAR</Button>
          <Box>
            {activeStep > 0 && (
              <Button onClick={() => setActiveStep(prev => prev - 1)} sx={{ mr: 1, color: '#fff' }}>Voltar</Button>
            )}
            {activeStep < steps.length - 1 ? (
              <NeonButton onClick={() => setActiveStep(prev => prev + 1)}>PRÓXIMA ETAPA</NeonButton>
            ) : (
              <NeonButton onClick={handleSave} loading={saving}>FINALIZAR & SALVAR</NeonButton>
            )}
          </Box>
        </DialogActions>
      </Dialog>
      {/* Dialog de Cotas Diárias */}
      <Dialog
        open={openQuotaDialog}
        onClose={() => setOpenQuotaDialog(false)}
        maxWidth="sm"
        fullWidth
        disableRestoreFocus
        PaperProps={{
          sx: {
            bgcolor: 'rgba(10, 25, 41, 0.98)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(0, 212, 255, 0.1)',
            borderRadius: 3,
            maxHeight: '90vh',
            backgroundImage: 'none'
          }
        }}
      >
        <DialogTitle sx={{
          fontFamily: '"Orbitron", sans-serif',
          fontWeight: 700,
          color: '#fff',
          borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
          py: 2.5,
          px: 4
        }}>
          GERENCIAMENTO DE COTAS: {selectedEmpresa?.nome}
        </DialogTitle>
        <DialogContent sx={{ p: 0 }}>
          <Box sx={{ p: 4 }}>
            {!activeEvent ? (
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <Typography color="error" variant="subtitle2" sx={{ fontWeight: 700 }}>Nenhum evento ativo detectado.</Typography>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)' }}>Selecione um evento no menu superior para gerenciar cotas.</Typography>
              </Box>
            ) : (
              <Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                  <Typography variant="overline" sx={{ color: '#00D4FF', fontWeight: 800, m: 0, display: 'block', letterSpacing: 2 }}>
                    PLANEJAMENTO DIÁRIO DE ACESSOS
                  </Typography>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => {
                      const newQuotas = {};
                      getAllEventDates().forEach(date => {
                        newQuotas[date] = selectedEmpresa?.max_colaboradores ?? 50;
                      });
                      setDailyQuotas(newQuotas);
                    }}
                    sx={{
                      borderColor: 'rgba(0, 212, 255, 0.3)',
                      color: '#00D4FF',
                      fontSize: '0.65rem',
                      '&:hover': { borderColor: '#00D4FF', bgcolor: 'rgba(0, 212, 255, 0.05)' }
                    }}
                  >
                    APLICAR COTA PADRÃO EM TUDO
                  </Button>
                </Box>

                <Box sx={{
                  maxHeight: 450,
                  overflowY: 'auto',
                  pr: 1,
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                  gap: 1.5,
                  // Estilização da scrollbar para o tema dark
                  '&::-webkit-scrollbar': { width: '6px' },
                  '&::-webkit-scrollbar-track': { background: 'rgba(0,0,0,0.1)' },
                  '&::-webkit-scrollbar-thumb': { background: 'rgba(0, 212, 255, 0.2)', borderRadius: '10px' }
                }}>
                  {getAllEventDates().map(date => (
                    <Box key={date} sx={{
                      display: 'flex',
                      flexDirection: 'column',
                      p: 2,
                      bgcolor: 'rgba(0,0,0,0.2)',
                      borderRadius: 2,
                      border: '1px solid rgba(255,255,255,0.03)',
                      transition: 'all 0.2s ease',
                      '&:hover': {
                        border: '1px solid rgba(0, 212, 255, 0.2)',
                        bgcolor: 'rgba(0, 212, 255, 0.02)'
                      }
                    }}>
                      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1.5 }}>
                        <Box sx={{
                          width: 35,
                          height: 35,
                          bgcolor: 'rgba(0, 212, 255, 0.1)',
                          borderRadius: 1.5,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          border: '1px solid rgba(0, 212, 255, 0.2)'
                        }}>
                          <Typography variant="caption" sx={{ color: '#00D4FF', fontWeight: 900, fontSize: '0.7rem' }}>
                            {format(new Date(date + 'T00:00:00'), "dd/MM")}
                          </Typography>
                        </Box>
                        <Box>
                          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', display: 'block', mb: -0.5 }}>
                            {format(new Date(date + 'T00:00:00'), "EEEE", { locale: ptBR })}
                          </Typography>
                          <Typography variant="body2" sx={{ color: '#fff', fontWeight: 700 }}>
                            {format(new Date(date + 'T00:00:00'), "dd/MM/yyyy")}
                          </Typography>
                        </Box>
                      </Stack>
                      <TextField
                        size="small"
                        type="number"
                        placeholder="Qtd."
                        fullWidth
                        sx={{
                          '& .MuiOutlinedInput-root': {
                            bgcolor: 'rgba(0,0,0,0.3)',
                            fontWeight: 700,
                            color: '#00FF88',
                            height: 40
                          }
                        }}
                        value={dailyQuotas[date] || (selectedEmpresa?.max_colaboradores ?? 50)}
                        onChange={(e) => setDailyQuotas({ ...dailyQuotas, [date]: parseInt(e.target.value) || 0 })}
                      />
                    </Box>
                  ))}
                </Box>

                <Box sx={{ mt: 3, p: 2, bgcolor: 'rgba(0, 212, 255, 0.05)', borderRadius: 2, border: '1px solid rgba(0, 212, 255, 0.1)' }}>
                  <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', display: 'block', lineHeight: 1.4 }}>
                    <strong>Nota:</strong> Estas cotas limitam quantos participantes desta empresa podem ser cadastrados ou ter acesso simultâneo no dia específico.
                  </Typography>
                </Box>
              </Box>
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{
          p: 3,
          px: 4,
          borderTop: '1px solid rgba(255, 255, 255, 0.05)',
          bgcolor: 'rgba(0,0,0,0.1)'
        }}>
          <Button onClick={() => setOpenQuotaDialog(false)} sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 700 }}>ABORTAR</Button>
          <NeonButton
            onClick={handleSaveQuotas}
            disabled={!activeEvent}
            startIcon={<CheckCircleIcon />}
          >
            SINCRONIZAR COTAS
          </NeonButton>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Empresas;
