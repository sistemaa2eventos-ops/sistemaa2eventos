import React from 'react';
import {
  Box, Typography, Stack, IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
  Chip, Grid, Button, useTheme, useMediaQuery, CircularProgress, Tabs, Tab
} from '@mui/material';
import {
  Add as AddIcon, Search as SearchIcon, FileUpload as UploadIcon, FileDownload as DownloadIcon,
  InsertDriveFile as FileIcon, Cancel as CancelIcon, CameraAlt as CameraIcon
} from '@mui/icons-material';
import PhotoCapture from '../components/common/PhotoCapture';
import GlassCard from '../components/common/GlassCard';
import PageHeader from '../components/common/PageHeader';
import NeonButton from '../components/common/NeonButton';
import { styled } from '@mui/material/styles';
import { format } from 'date-fns';
import { usePessoas } from '../hooks/usePessoas';

// MICRO-COMPONENTS
import PessoasTable from '../components/pessoa/PessoasTable';
import PessoaFormDialog from '../components/pessoa/PessoaFormDialog';
import ConfirmDialog from '../components/common/ConfirmDialog';
import api from '../services/api';
import { useSnackbar } from 'notistack';

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
  const { enqueueSnackbar } = useSnackbar();
  
  const [openQR, setOpenQR] = React.useState(false);
  const [qrImage, setQrImage] = React.useState('');
  const [qrPessoa, setQrPessoa] = React.useState(null);
  const [qrLoading, setQrLoading] = React.useState(false);
  const {
    // States/Params
    search, setSearch,
    page, setPage,
    limit, setLimit,
    statusFilter, setStatusFilter,
    totalPages, totalCount,
    pessoas, loading,
    openDialog, setOpenDialog,
    selectedPessoa, setSelectedPessoa,
    formData, setFormData,
    activeStep, setActiveStep,
    steps,
    empresas,
    activeEvent,
    documentos,
    saving,
    openDocsDialog, setOpenDocsDialog,
    selectedPessoaDocs,
    openWebcamECM, setOpenWebcamECM,
    openImport, setOpenImport,
    importLoading,
    openBlockDialog, setOpenBlockDialog,
    isBlocking,
    pessoaToBlock,
    blockJustification, setBlockJustification,
    blockLoading,
    openDeleteConfirm, setOpenDeleteConfirm,
    deleteLoading,
    expulsionLoading,
    eventoIdParam,
    isAdmin,
    isEmpresa,

    // Handlers
    handleOpenDialog,
    handleCloseDialog,
    handleSave,
    handleDateToggle,
    handleFaseToggle,
    handleDelete,
    confirmDelete,
    handleOpenBlock,
    handleConfirmBlock,
    handleExpulsar,
    handleOpenDocs,
    handleNextStep,
    handleOpenWebcamECM,
    handleUploadWebcamECM,
    handleUploadECM,
    handleImport,
    handleExport,
    handleDownloadTemplate
  } = usePessoas();

  const handleViewQR = async (pessoa) => {
    try {
      setQrPessoa(pessoa);
      setQrLoading(true);
      setOpenQR(true);
      const resp = await api.get(`/pessoas/${pessoa.id}/qrcode`);
      setQrImage(resp.data.data.image);
    } catch (e) {
      const errorMsg = e.response?.data?.message || 'Erro ao gerar imagem QR';
      enqueueSnackbar(errorMsg, { variant: 'error' });
      setOpenQR(false);
    } finally {
      setQrLoading(false);
    }
  };


  return (
    <Box sx={{ p: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 4 }}>
        <PageHeader title="PAINEL DE PESSOAS" subtitle={eventoIdParam ? `Filtrando pessoas do evento.` : "Visualize e modifique as permissões de acesso biográfico."} breadcrumbs={[{ text: 'Dashboard' }, { text: 'Participantes' }]} />
        <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
          <Button variant="outlined" startIcon={<DownloadIcon />} onClick={handleDownloadTemplate} sx={{ borderColor: 'rgba(255,255,255,0.3)', color: '#fff' }}>Baixar Template</Button>
          <Button variant="outlined" startIcon={<UploadIcon />} onClick={() => setOpenImport(true)} sx={{ borderColor: 'rgba(0,255,136,0.3)', color: '#00FF88' }}>Importar Lote</Button>
          <Button variant="outlined" startIcon={<DownloadIcon />} onClick={handleExport} disabled={saving} sx={{ borderColor: 'rgba(123,47,190,0.5)', color: '#7B2FBE' }}>{saving ? 'Exportando...' : 'Exportar Lote'}</Button>
          <NeonButton startIcon={<AddIcon />} loading={saving} onClick={() => handleOpenDialog()}>{isEmpresa ? 'Novo Vínculo' : 'Novo Registro'}</NeonButton>

        </Stack>
      </Box>

      <GlassCard glowColor="#7B2FBE" sx={{ p: 3, mb: 3 }}>
        <Tabs 
          value={statusFilter} 
          onChange={(e, val) => setStatusFilter(val)} 
          sx={{ mb: 3, '& .MuiTab-root': { color: 'rgba(255,255,255,0.5)' }, '& .Mui-selected': { color: '#00D4FF !important' }, '& .MuiTabs-indicator': { backgroundColor: '#00D4FF' } }}
        >
          <Tab value="TODOS" label="TODOS" />
          <Tab value="ATIVO" label="ATIVOS" />
          <Tab value="PENDENTE" label="PENDENTES" />
        </Tabs>

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
          onViewQR={handleViewQR}
          isAdmin={isAdmin}
          expulsionLoading={expulsionLoading}
          // Pagination
          totalCount={totalCount}
          page={page}
          rowsPerPage={limit}
          onPageChange={setPage}
          onRowsPerPageChange={setLimit}
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
        handleFaseToggle={handleFaseToggle}
        documentos={documentos}
        handleUploadECM={handleUploadECM}
        handleOpenWebcamECM={handleOpenWebcamECM}
        saving={saving}
        handleNextStep={handleNextStep}
        handleSave={handleSave}
        isEmpresa={isEmpresa}
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
            {(!Array.isArray(documentos) || documentos.length === 0) ? (
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

      {/* FIX ERR-PF05: Dialog de Bloqueio/Desbloqueio que faltava */}
      <Dialog open={openBlockDialog} onClose={() => setOpenBlockDialog(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800, color: isBlocking ? '#FF3366' : '#00FF88' }}>
          {isBlocking ? 'BLOQUEAR PARTICIPANTE' : 'DESBLOQUEAR PARTICIPANTE'}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>
            {isBlocking
              ? `Você está prestes a BLOQUEAR ${pessoaToBlock?.nome}. O acesso será imediatamente revogado.`
              : `Você está prestes a DESBLOQUEAR ${pessoaToBlock?.nome}. O acesso será restaurado para verificação.`}
          </Typography>
          <input
            type="text"
            placeholder="Justificativa obrigatória..."
            value={blockJustification}
            onChange={(e) => setBlockJustification(e.target.value)}
            style={{
              width: '100%', padding: '12px', background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8,
              color: '#fff', fontSize: '0.9rem', outline: 'none'
            }}
          />
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setOpenBlockDialog(false)} sx={{ color: 'text.secondary' }}>CANCELAR</Button>
          <NeonButton
            onClick={handleConfirmBlock}
            loading={blockLoading}
            sx={{ bgcolor: isBlocking ? '#FF3366' : '#00FF88' }}
          >
            CONFIRMAR {isBlocking ? 'BLOQUEIO' : 'DESBLOQUEIO'}
          </NeonButton>
        </DialogActions>
      </Dialog>

      {/* FIX ERR-GLOBAL04: ConfirmDialog component verificado e utilizado */}
      <ConfirmDialog
        open={openDeleteConfirm}
        title="CONFIRMAR EXCLUSÃO"
        message="Deseja realmente excluir este participante? Esta ação é irreversível."
        onCancel={() => setOpenDeleteConfirm(false)}
        onConfirm={confirmDelete}
        loading={deleteLoading}
      />

      <Dialog open={openQR} onClose={() => setOpenQR(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ textAlign: 'center', fontWeight: 800 }}>ACRESCITAR CREDENCIAL: {qrPessoa?.nome}</DialogTitle>
        <DialogContent sx={{ textAlign: 'center', py: 4 }}>
          {qrLoading ? <CircularProgress sx={{ color: '#00FF88' }} /> : (
            <Box>
              <img src={qrImage} alt="QR Code" style={{ width: '250px', border: '10px solid #fff', borderRadius: '8px' }} />
              <Typography variant="caption" sx={{ display: 'block', mt: 2, color: 'text.secondary' }}>TOKEN SEGURO: {qrPessoa?.qr_code || 'GERADO VIA SISTEMA'}</Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setOpenQR(false)}>FECHAR</Button>
          {!qrLoading && <Button variant="contained" onClick={() => { const link = document.createElement('a'); link.href = qrImage; link.download = `QR_${qrPessoa?.nome}.png`; link.click(); }} sx={{ bgcolor: '#00FF88', color: '#000', fontWeight: 700 }}>BAIXAR PNG</Button>}
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Pessoas;
