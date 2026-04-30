import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Stack, IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
  Avatar, Chip, Grid, Button, Tooltip, useTheme, useMediaQuery, CircularProgress
} from '@mui/material';
import {
  Add as AddIcon, Search as SearchIcon, FileUpload as UploadIcon, FileDownload as DownloadIcon,
  InsertDriveFile as FileIcon, Cancel as CancelIcon, CameraAlt as CameraIcon
} from '@mui/icons-material';
import api from '../services/api';
import PhotoCapture from '../components/common/PhotoCapture';
import GlassCard from '../components/common/GlassCard';
import PageHeader from '../components/common/PageHeader';
import NeonButton from '../components/common/NeonButton';
import { styled } from '@mui/material/styles';
import { useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { useAuth } from '../contexts/AuthContext';
import { useSnackbar } from 'notistack';

// MICRO-COMPONENTS
import PessoasTable from '../components/pessoa/PessoasTable';
import PessoaFormDialog from '../components/pessoa/PessoaFormDialog';

const SearchWrapper = styled(Box)(({ theme }) => ({
  background: 'rgba(10, 22, 40, 0.6)',
  border: '1px solid rgba(0, 212, 255, 0.1)',
  borderRadius: 12, padding: theme.spacing(1, 2),
  display: 'flex', alignItems: 'center', gap: theme.spacing(1), marginBottom: theme.spacing(3),
  '&:focus-within': { border: '1px solid rgba(0, 212, 255, 0.4)', boxShadow: '0 0 10px rgba(0, 212, 255, 0.1)' }
}));

const StatusChip = styled(Chip)(({ theme, status }) => {
  const colors = {
    'ativo': { bg: 'rgba(0, 255, 136, 0.1)', text: '#00FF88', border: 'rgba(0, 255, 136, 0.2)' },
    'autorizado': { bg: 'rgba(0, 255, 136, 0.1)', text: '#00FF88', border: 'rgba(0, 255, 136, 0.2)' },
    'pendente': { bg: 'rgba(255, 170, 0, 0.1)', text: '#FFAA00', border: 'rgba(255, 170, 0, 0.2)' },
    'verificacao': { bg: 'rgba(0, 212, 255, 0.1)', text: '#00D4FF', border: 'rgba(0, 212, 255, 0.2)' },
    'bloqueado': { bg: 'rgba(255, 51, 102, 0.1)', text: '#FF3366', border: 'rgba(255, 51, 102, 0.2)' }
  };
  const current = colors[status] || colors['ativo'];
  return { fontWeight: 700, fontSize: '0.65rem', height: 24, background: current.bg, color: current.text, border: `1px solid ${current.border}`, textTransform: 'uppercase', letterSpacing: '1px' }
});

const Pessoas = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [searchParams] = useSearchParams();
  const eventoIdParam = searchParams.get('evento_id') || localStorage.getItem('active_evento_id');
  
  const [pessoas, setPessoas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [search, setSearch] = useState('');
  
  const [openDialog, setOpenDialog] = useState(false);
  const [openDeleteConfirm, setOpenDeleteConfirm] = useState(false);
  const [pessoaToDelete, setPessoaToDelete] = useState(null);
  const [selectedPessoa, setSelectedPessoa] = useState(null);
  
  const [empresas, setEmpresas] = useState([]);
  const [activeEvent, setActiveEvent] = useState(null);
  const [openImport, setOpenImport] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  
  const [activeStep, setActiveStep] = useState(0);
  const steps = ['Dados Biométricos & Pessoais', 'Escopo de Atuação', 'Gestão de Risco & ECM'];
  const [documentos, setDocumentos] = useState([]);
  const [openDocsDialog, setOpenDocsDialog] = useState(false);
  const [selectedPessoaDocs, setSelectedPessoaDocs] = useState(null);
  
  const { user } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  
  const [openBlockDialog, setOpenBlockDialog] = useState(false);
  const [blockJustification, setBlockJustification] = useState('');
  const [pessoaToBlock, setPessoaToBlock] = useState(null);
  const [isBlocking, setIsBlocking] = useState(true);
  const [blockLoading, setBlockLoading] = useState(false);
  const [expulsionLoading, setExpulsionLoading] = useState(false);

  const isAdmin = user?.nivel_acesso === 'admin' || user?.nivel_acesso === 'master' || user?.nivel_acesso === 'supervisor';
  
  const [formData, setFormData] = useState({
    nome: '', nome_credencial: '', cpf: '', passaporte: '', telefone: '', nome_mae: '', data_nascimento: '',
    funcao: '', empresa_id: '', tipo_pessoa: 'colaborador', foto_url: '', dias_trabalho: [], trabalho_area_tecnica: false,
    trabalho_altura: false, pagamento_validado: false
  });

  const handleOpenBlock = (pessoa) => {
    setPessoaToBlock(pessoa);
    setIsBlocking(!pessoa.bloqueado);
    setBlockJustification('');
    setOpenBlockDialog(true);
  };

  const handleConfirmBlock = async () => {
    if (!blockJustification) { enqueueSnackbar('Justificativa é obrigatória.', { variant: 'warning' }); return; }
    try {
      setBlockLoading(true);
      await api.post(`/pessoas/${pessoaToBlock.id}/bloqueio`, { acao: isBlocking ? 'bloquear' : 'desbloquear', justificativa: blockJustification });
      enqueueSnackbar(`Participante ${isBlocking ? 'bloqueado' : 'desbloqueado'} com sucesso.`, { variant: 'success' });
      setOpenBlockDialog(false);
      loadPessoas();
    } catch (error) { enqueueSnackbar('Erro ao processar solicitação de bloqueio.', { variant: 'error' }); } finally { setBlockLoading(false); }
  };

  const handleExpulsar = async (pessoa) => {
    const motivo = window.prompt(`Motivo da expulsão de ${pessoa.nome}:`);
    if (!motivo) return;
    try {
      setExpulsionLoading(true);
      await api.post(`/access/expulsar/${pessoa.id}`, { motivo, dispositivo_id: 'web-dashboard' });
      enqueueSnackbar(`${pessoa.nome} foi expulso(a) do evento.`, { variant: 'warning' });
      loadPessoas();
    } catch (error) { enqueueSnackbar(error.response?.data?.error || 'Erro.', { variant: 'error' }); } finally { setExpulsionLoading(false); }
  };

  useEffect(() => { loadInitialData(); }, []);
  useEffect(() => { loadPessoas(); }, [search]);

  const loadInitialData = async () => {
    try {
      const [evRes, empRes] = await Promise.all([ api.get('/eventos'), api.get('/empresas') ]);
      const event = evRes.data.data.find(e => e.id === eventoIdParam) || evRes.data.data.find(e => e.status === 'ativo') || evRes.data.data[0];
      setActiveEvent(event);
      setEmpresas(empRes.data.data || []);
    } catch (error) {}
  };

  const loadPessoas = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (eventoIdParam) params.append('evento_id', eventoIdParam);
      if (search) params.append('search', search);

      const response = await api.get(`/pessoas?${params.toString()}`);
      setPessoas(response.data.data || []);
    } catch (error) {} finally { setLoading(false); }
  };

  const handleOpenDocs = (pessoa) => {
    setSelectedPessoaDocs(pessoa);
    setOpenDocsDialog(true);
  };

  const loadDocumentos = async (pessoaId) => {
    try {
      const resp = await api.get(`/documentos/pessoa/${pessoaId}`);
      setDocumentos(resp.data.data || []);
    } catch (e) {}
  };

  useEffect(() => { if (openDialog && selectedPessoa) { loadDocumentos(selectedPessoa.id); } }, [openDialog, selectedPessoa]);

  const handleOpenDialog = (pessoa = null) => {
    setActiveStep(0);
    if (pessoa) {
      setSelectedPessoa(pessoa);
      setFormData({
        ...pessoa,
        data_nascimento: pessoa.data_nascimento ? format(new Date(pessoa.data_nascimento), "yyyy-MM-dd") : '',
      });
    } else {
      setSelectedPessoa(null);
      setFormData({
        nome: '', nome_credencial: '', cpf: '', passaporte: '', telefone: '', nome_mae: '', data_nascimento: '', funcao: '', tipo_pessoa: 'colaborador',
        empresa_id: '', foto_url: '', dias_trabalho: [], trabalho_area_tecnica: false, trabalho_altura: false, pagamento_validado: false, parecer_documentos: 'pendente'
      });
      setDocumentos([]);
    }
    setOpenDialog(true);
  };

  const handleCloseDialog = () => { setOpenDialog(false); setSelectedPessoa(null); };

  const handleSave = async () => {
    if (!formData.nome || !formData.empresa_id) { enqueueSnackbar('Nome e Empresa são obrigatórios.', {variant: 'error'}); return; }
    try {
      setSaving(true);
      let payload = { ...formData };
      if (payload.foto_url && payload.foto_url.startsWith('data:image') && payload.cpf) {
        try {
          const { data: urlData } = await api.post('/pessoas/generate-upload-url', { cpf: payload.cpf });
          if (urlData.success && urlData.uploadUrl) {
            const base64Data = payload.foto_url.split(',')[1];
            const arr = new Uint8Array(atob(base64Data).split('').map(c => c.charCodeAt(0)));
            const blob = new Blob([arr], { type: 'image/jpeg' });
            const uploadRes = await fetch(urlData.uploadUrl, { method: 'PUT', body: blob, headers: { 'Content-Type': 'image/jpeg' } });
            if (uploadRes.ok) payload.foto_url = urlData.publicUrl || urlData.path;
          }
        } catch (e) {}
      }
      if (selectedPessoa) await api.put(`/pessoas/${selectedPessoa.id}`, payload);
      else await api.post('/pessoas', payload);
      handleCloseDialog();
      loadPessoas();
    } catch (error) {} finally { setSaving(false); }
  };

  const handleDateToggle = (date) => {
    const current = [...formData.dias_trabalho];
    const index = current.indexOf(date);
    if (index === -1) current.push(date); else current.splice(index, 1);
    setFormData({ ...formData, dias_trabalho: current });
  };

  const handleDelete = (id) => { setPessoaToDelete(id); setOpenDeleteConfirm(true); };

  const confirmDelete = async () => {
    try {
      setDeleteLoading(true);
      await api.delete(`/pessoas/${pessoaToDelete}`);
      setOpenDeleteConfirm(false); setPessoaToDelete(null); loadPessoas();
    } catch (error) { enqueueSnackbar('Falha ao desativar registro.', { variant: 'error' }); } finally { setDeleteLoading(false); }
  };

  const handleNextStep = async () => {
    if (activeStep === 1 && !selectedPessoa) {
      if (!formData.nome || !formData.empresa_id) { enqueueSnackbar('Preencha Nome e Empresa.', { variant: 'warning' }); return; }
      try {
        setSaving(true);
        const response = await api.post('/pessoas', { ...formData, status_acesso: 'pendente' });
        if (response.data.success) {
          setSelectedPessoa(response.data.data);
          enqueueSnackbar('Registro inicial salvo.', { variant: 'info' });
          setActiveStep(2);
        }
      } catch (error) {} finally { setSaving(false); }
    } else { setActiveStep(prev => prev + 1); }
  };

  const [openWebcamECM, setOpenWebcamECM] = useState(false);
  const [currentECMEntityId, setCurrentECMEntityId] = useState(null);

  const handleOpenWebcamECM = (entityId) => { setCurrentECMEntityId(entityId); setOpenWebcamECM(true); };

  const handleUploadWebcamECM = async (base64) => {
    try {
      const blob = await (await fetch(base64)).blob();
      const file = new File([blob], `documento_webcam_${Date.now()}.jpg`, { type: 'image/jpeg' });
      await handleUploadECM(currentECMEntityId, file);
      setOpenWebcamECM(false);
    } catch (e) {}
  };

  const handleUploadECM = async (entityId, file) => {
    if (!file) return;
    const titulo = window.prompt("Título do Documento:", "Documento");
    if (!titulo) return;
    const formDataUpload = new FormData();
    formDataUpload.append('arquivo', file);
    formDataUpload.append('titulo', titulo);
    formDataUpload.append('tipo_doc', 'ECM');
    try {
      setSaving(true);
      await api.post(`/documentos/pessoa/${entityId}/upload`, formDataUpload, { headers: { 'Content-Type': 'multipart/form-data' } });
      enqueueSnackbar('Documento enviado com sucesso!', { variant: 'success' });
      loadDocumentos(entityId);
    } catch (error) { enqueueSnackbar('Erro ao enviar documento.', { variant: 'error' }); } finally { setSaving(false); }
  };

  const handleImport = async (event) => {
    const file = event.target.files[0];
    if (!file || !activeEvent) return;
    const formData = new FormData(); formData.append('file', file); formData.append('eventoId', activeEvent.id);
    try {
      setImportLoading(true);
      const response = await api.post('/excel/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      alert(response.data.message); setOpenImport(false); loadPessoas();
    } catch (error) { alert('Erro na importação.'); } finally { setImportLoading(false); }
  };

  const handleExport = async () => {
    try {
      const response = await api.get('/excel/export', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a'); link.href = url; link.setAttribute('download', `export_participantes_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`);
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
    } catch (error) { alert('Falha ao exportar.'); }
  };

  return (
    <Box sx={{ p: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 4 }}>
        <PageHeader title="PAINEL DE PESSOAS" subtitle={eventoIdParam ? `Filtrando pessoas do evento.` : "Visualize e modifique as permissões de acesso biográfico."} breadcrumbs={[{ text: 'Dashboard' }, { text: 'Participantes' }]} />
        <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
          <Button variant="outlined" startIcon={<UploadIcon />} onClick={() => setOpenImport(true)} sx={{ borderColor: 'rgba(0,255,136,0.3)', color: '#00FF88' }}>Importar Lote</Button>
          <Button variant="outlined" startIcon={<DownloadIcon />} onClick={handleExport} sx={{ borderColor: 'rgba(123,47,190,0.5)', color: '#7B2FBE' }}>Exportar Lote</Button>
          <NeonButton startIcon={<AddIcon />} onClick={() => handleOpenDialog()}>Novo Registro</NeonButton>
        </Stack>
      </Box>

      <GlassCard glowColor="#7B2FBE" sx={{ p: 3, mb: 3 }}>
        <SearchWrapper>
          <SearchIcon sx={{ color: 'text.secondary' }} />
          <input type="text" placeholder="Interceptar sinal por nome, CPF ou cargo..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ background: 'transparent', border: 'none', color: '#fff', width: '100%', outline: 'none', fontFamily: 'inherit', fontSize: '0.9rem' }} />
        </SearchWrapper>

        <PessoasTable
          pessoas={pessoas}
          loading={loading}
          onEdit={handleOpenDialog}
          onDelete={handleDelete}
          onBlock={handleOpenBlock}
          onExpulsar={handleExpulsar}
          onOpenDocs={handleOpenDocs}
          isAdmin={isAdmin}
          expulsionLoading={expulsionLoading}
        />
      </GlassCard>

      <PessoaFormDialog
        open={openDialog}
        onClose={handleCloseDialog}
        isMobile={isMobile}
        selectedPessoa={selectedPessoa}
        formData={formData}
        setFormData={setFormData}
        activeStep={activeStep}
        setActiveStep={setActiveStep}
        steps={steps}
        empresas={empresas}
        activeEvent={activeEvent}
        handleDateToggle={handleDateToggle}
        documentos={documentos}
        handleUploadECM={handleUploadECM}
        handleOpenWebcamECM={handleOpenWebcamECM}
        saving={saving}
        handleNextStep={handleNextStep}
        handleSave={handleSave}
      />

      <Dialog open={openDocsDialog} onClose={() => setOpenDocsDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6" sx={{ fontWeight: 800 }}>DOCUMENTOS ECM: {selectedPessoaDocs?.nome}</Typography>
          <IconButton onClick={() => setOpenDocsDialog(false)}><CancelIcon /></IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle2" sx={{ color: '#00D4FF', mb: 2 }}>DOCUMENTOS ANEXADOS</Typography>
            <Stack spacing={1}>
              {documentos.length === 0 ? (
                <Typography variant="body2" color="text.secondary">Nenhum documento encontrado.</Typography>
              ) : (
                documentos.map(doc => (
                  <Box key={doc.id} sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.05)', borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <FileIcon color="primary" />
                      <Box>
                        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{doc.titulo}</Typography>
                        <Typography variant="caption" color="text.secondary">{doc.tipo_doc} • Enviado em {new Date(doc.data_inclusao).toLocaleDateString()}</Typography>
                      </Box>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <StatusChip status={doc.status} label={doc.status} />
                      <IconButton size="small" onClick={() => window.open(doc.url_arquivo, '_blank')}><DownloadIcon fontSize="small" /></IconButton>
                    </Box>
                  </Box>
                ))
              )}
            </Stack>
          </Box>
          <Box sx={{ p: 3, border: '2px dashed rgba(0,212,255,0.2)', borderRadius: 4, textAlign: 'center' }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 2 }}>ENVIAR NOVO DOCUMENTO</Typography>
            <Stack direction="row" spacing={2} justifyContent="center">
              <Button variant="contained" startIcon={<UploadIcon />} onClick={() => { const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*,application/pdf'; input.onchange = (e) => handleUploadECM(selectedPessoaDocs.id, e.target.files[0]); input.click(); }} sx={{ bgcolor: '#00D4FF', color: '#000', fontWeight: 700 }}>ARQUIVO / SCANNER</Button>
              <Button variant="contained" startIcon={<CameraIcon />} onClick={() => handleOpenWebcamECM(selectedPessoaDocs.id)} sx={{ bgcolor: '#7B2FBE', color: '#fff', fontWeight: 700 }}>FOTO WEBCAM</Button>
            </Stack>
          </Box>
        </DialogContent>
      </Dialog>

      <Dialog open={openWebcamECM} onClose={() => setOpenWebcamECM(false)} maxWidth="sm" fullWidth>
        <DialogTitle>CAPTURAR FOTO DO DOCUMENTO</DialogTitle>
        <DialogContent>
          <Box sx={{ py: 2 }}>
            <PhotoCapture onPhotoCaptured={(base64) => { if (base64) handleUploadWebcamECM(base64); }} />
          </Box>
        </DialogContent>
        <DialogActions><Button onClick={() => setOpenWebcamECM(false)}>FECHAR</Button></DialogActions>
      </Dialog>

      <Dialog open={openImport} onClose={() => !importLoading && setOpenImport(false)} maxWidth="xs" fullWidth fullScreen={isMobile}>
        <DialogTitle sx={{ fontFamily: '"Orbitron", sans-serif', fontWeight: 700 }}>IMPORTAÇÃO EM LOTE</DialogTitle>
        <DialogContent>
          <Box sx={{ py: 2, textAlign: 'center' }}>
            <Typography variant="body2" sx={{ mb: 3, color: 'text.secondary' }}>Selecione o arquivo Excel preenchido com os dados das empresas e colaboradores.</Typography>
            <input type="file" accept=".xlsx, .xls" id="excel-upload" style={{ display: 'none' }} onChange={handleImport} disabled={importLoading} />
            <label htmlFor="excel-upload">
              <Button component="span" variant="contained" disabled={importLoading} startIcon={importLoading ? null : <UploadIcon />} sx={{ background: 'linear-gradient(45deg, #00FF88 30%, #00D4FF 90%)', color: '#000', fontWeight: 700, px: 4 }}>{importLoading ? 'PROCESSANDO...' : 'SELECIONAR ARQUIVO'}</Button>
            </label>
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}><Button onClick={() => setOpenImport(false)} disabled={importLoading} sx={{ color: 'text.secondary' }}>FECHAR</Button></DialogActions>
      </Dialog>
    </Box>
  );
};

export default Pessoas;
