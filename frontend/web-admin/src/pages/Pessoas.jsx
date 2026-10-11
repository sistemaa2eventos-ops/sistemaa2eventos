import React from 'react';
import {
  Box, Typography, Stack, IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
  Chip, Button, useTheme, useMediaQuery, CircularProgress, Tabs, Tab, TextField
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
import { usePessoas } from '../hooks/usePessoas';

// MICRO-COMPONENTS
import PessoasTable from '../components/pessoa/PessoasTable';
import PessoaFormDialog from '../components/pessoa/PessoaFormDialog';
import ConfirmDialog from '../components/common/ConfirmDialog';
import api from '../services/api';
import { useSnackbar } from 'notistack';
import { botaoSecundario } from '../styles/tokens';

const StatusChip = styled(Chip)(({ theme: _theme, status }) => {
  const colors = {
    'ativo': { bg: 'rgba(0, 255, 136, 0.1)', text: '#00FF88', border: 'rgba(0, 255, 136, 0.2)' },
    'autorizado': { bg: 'rgba(0, 255, 136, 0.1)', text: '#00FF88', border: 'rgba(0, 255, 136, 0.2)' },
    'pendente': { bg: 'rgba(255, 170, 0, 0.1)', text: '#FFB800', border: 'rgba(255, 170, 0, 0.2)' },
    'verificacao': { bg: 'rgba(0, 212, 255, 0.1)', text: '#00D4FF', border: 'rgba(0, 212, 255, 0.2)' },
    'bloqueado': { bg: 'rgba(255, 51, 102, 0.1)', text: '#FF3366', border: 'rgba(255, 51, 102, 0.2)' }
  };
  const current = colors[status] || colors['ativo'];
  return { fontWeight: 700, fontSize: '0.75rem', height: 24, background: current.bg, color: current.text, border: `1px solid ${current.border}`, textTransform: 'uppercase', letterSpacing: '1px' }
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
    totalCount,
    pessoas, loading,
    openDialog,
    selectedPessoa,
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
    handleSelectAllPhase,
    handleClearPhase,
    handleSelectAllDates,
    handleClearAllDates,
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
      const errorMsg = e.response?.data?.error || e.response?.data?.message || 'Erro ao gerar imagem QR';
      enqueueSnackbar(errorMsg, { variant: 'error' });
      setOpenQR(false);
    } finally {
      setQrLoading(false);
    }
  };


  return (
    <Box sx={{ p: { xs: 1.5, sm: 2.5, md: 3 }, maxWidth: '100%', overflowX: 'hidden' }}>
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'flex-start', md: 'center' }, mb: { xs: 2, sm: 2.5, md: 3 }, gap: 2 }}>
        <PageHeader 
          title="Participantes" 
          subtitle={eventoIdParam ? `Filtrando pessoas do evento.` : "Visualize e modifique as permissões de acesso biográfico."} 
          breadcrumbs={[{ text: 'Dashboard' }, { text: 'Participantes' }]} 
          sx={{ mb: 0 }}
        />
        <Box sx={{ 
          display: 'grid', 
          gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, auto)' }, 
          gap: 1.5, 
          width: { xs: '100%', md: 'auto' } 
        }}>
          <Button 
            variant="outlined" 
            size="small"
            startIcon={<DownloadIcon sx={{ fontSize: 18 }} />} 
            onClick={handleDownloadTemplate} 
            sx={botaoSecundario}
          >
            Baixar modelo
          </Button>
          <Button 
            variant="outlined" 
            size="small"
            startIcon={<UploadIcon sx={{ fontSize: 18 }} />} 
            onClick={() => setOpenImport(true)} 
            sx={botaoSecundario}
          >
            Importar planilha
          </Button>
          <Button 
            variant="outlined" 
            size="small"
            startIcon={<DownloadIcon sx={{ fontSize: 18 }} />} 
            onClick={handleExport} 
            disabled={saving} 
            sx={botaoSecundario}
          >
            {saving ? 'Exportando...' : 'Exportar planilha'}
          </Button>
          <NeonButton 
            startIcon={<AddIcon sx={{ fontSize: 18 }} />} 
            loading={saving} 
            onClick={() => handleOpenDialog()}
            sx={{ whiteSpace: 'nowrap' }}
          >
            {isEmpresa ? 'Novo vínculo' : 'Novo participante'}
          </NeonButton>
        </Box>
      </Box>

      <GlassCard glowColor="#7B2FBE" sx={{ p: { xs: 2, sm: 2.5, md: 3 }, mb: 3 }}>
        <Tabs
          value={statusFilter}
          onChange={(e, val) => setStatusFilter(val)}
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          sx={{ 
            mb: 2.5, 
            minHeight: 40,
            '& .MuiTab-root': { color: 'rgba(255,255,255,0.5)', fontWeight: 700, minHeight: 40, py: 0.5, fontSize: '0.8125rem' }, 
            '& .Mui-selected': { color: '#00D4FF !important' }, 
            '& .MuiTabs-indicator': { backgroundColor: '#00D4FF' } 
          }}
        >
          <Tab value="TODOS" label="Todos" />
          <Tab value="ativos" label="Ativos" />
          <Tab value="pendentes" label="Pendentes" />
          <Tab value="bloqueados" label="Bloqueados" sx={{ '&.Mui-selected': { color: '#FF3366 !important' }, '&:not(.Mui-selected):hover': { color: 'rgba(255,51,102,0.6)' } }} />
        </Tabs>

        <TextField
          fullWidth
          size="small"
          placeholder="Buscar participante por nome, CPF ou cargo..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          InputProps={{
            startAdornment: <SearchIcon sx={{ color: 'rgba(255,255,255,0.4)', mr: 1, fontSize: 20 }} />,
            sx: { 
              height: 38,
              bgcolor: 'rgba(0,0,0,0.25)', 
              borderRadius: 1.5, 
              color: '#FFFFFF', 
              fontSize: '0.875rem' 
            }
          }}
          sx={{ mb: 2.5 }}
        />

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
        handleSelectAllPhase={handleSelectAllPhase}
        handleClearPhase={handleClearPhase}
        handleSelectAllDates={handleSelectAllDates}
        handleClearAllDates={handleClearAllDates}
        documentos={documentos}
        handleUploadECM={handleUploadECM}
        handleOpenWebcamECM={handleOpenWebcamECM}
        saving={saving}
        handleNextStep={handleNextStep}
        handleSave={handleSave}
        isEmpresa={isEmpresa}
      />

      <Dialog 
        open={openDocsDialog} 
        onClose={() => setOpenDocsDialog(false)} 
        maxWidth="md" 
        fullWidth
        PaperProps={{
          sx: { bgcolor: '#0A1628', border: '1px solid rgba(0, 212, 255, 0.3)', borderRadius: 1.5, maxHeight: '90vh' }
        }}
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>DOCUMENTOS ECM: {selectedPessoaDocs?.nome}</Typography>
          <IconButton onClick={() => setOpenDocsDialog(false)}><CancelIcon /></IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ overflowY: 'auto' }}>
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle2" sx={{ color: '#00D4FF', mb: 2 }}>DOCUMENTOS ANEXADOS</Typography>
            <Stack spacing={1}>
              {(!Array.isArray(documentos) || documentos.length === 0) ? (
                <Typography variant="body2" color="text.secondary">Nenhum documento encontrado.</Typography>
              ) : (
                documentos.map(doc => (
                  <Box key={doc.id} sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.05)', borderRadius: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
          <Box sx={{ p: 3, border: '2px dashed rgba(0,212,255,0.2)', borderRadius: 1.5, textAlign: 'center' }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>Enviar novo documento</Typography>
            <Stack direction="row" spacing={2} justifyContent="center">
              <Button variant="contained" startIcon={<UploadIcon />} onClick={() => { const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*,application/pdf'; input.onchange = (e) => handleUploadECM(selectedPessoaDocs.id, e.target.files[0]); input.click(); }} sx={{ bgcolor: '#00D4FF', color: '#000000', fontWeight: 700, height: 38 }}>Arquivo / scanner</Button>
              <Button variant="contained" startIcon={<CameraIcon />} onClick={() => handleOpenWebcamECM(selectedPessoaDocs.id)} sx={{ bgcolor: '#7B2FBE', color: '#FFFFFF', fontWeight: 700, height: 38 }}>Foto webcam</Button>
            </Stack>
          </Box>
        </DialogContent>
      </Dialog>

      <Dialog 
        open={openWebcamECM} 
        onClose={() => setOpenWebcamECM(false)} 
        maxWidth="sm" 
        fullWidth
        PaperProps={{
          sx: { bgcolor: '#0A1628', border: '1px solid rgba(0, 212, 255, 0.3)', borderRadius: 1.5, maxHeight: '90vh' }
        }}
      >
        <DialogTitle>Capturar foto do documento</DialogTitle>
        <DialogContent sx={{ overflowY: 'auto' }}>
          <Box sx={{ py: 2 }}>
            <PhotoCapture onPhotoCaptured={(base64) => { if (base64) handleUploadWebcamECM(base64); }} />
          </Box>
        </DialogContent>
        <DialogActions><Button onClick={() => setOpenWebcamECM(false)} sx={{ height: 38 }}>Fechar</Button></DialogActions>
      </Dialog>

      <Dialog 
        open={openImport} 
        onClose={() => !importLoading && setOpenImport(false)} 
        maxWidth="xs" 
        fullWidth 
        fullScreen={isMobile}
        PaperProps={{
          sx: { bgcolor: '#0A1628', border: '1px solid rgba(0, 255, 136, 0.3)', borderRadius: 1.5, maxHeight: '90vh' }
        }}
      >
        <DialogTitle sx={{ fontFamily: '"Space Grotesk", sans-serif', fontWeight: 700 }}>Importação em lote</DialogTitle>
        <DialogContent sx={{ overflowY: 'auto' }}>
          <Box sx={{ py: 2, textAlign: 'center' }}>
            <Typography variant="body2" sx={{ mb: 3, color: 'text.secondary' }}>Selecione o arquivo Excel preenchido com os dados das empresas e colaboradores.</Typography>
            <input type="file" accept=".xlsx, .xls" id="excel-upload" style={{ display: 'none' }} onChange={handleImport} disabled={importLoading} />
            <label htmlFor="excel-upload">
              <Button component="span" variant="contained" disabled={importLoading} startIcon={importLoading ? null : <UploadIcon />} sx={{ background: 'linear-gradient(45deg, #00FF88 30%, #00D4FF 90%)', color: '#000000', fontWeight: 700, px: 4, height: 38 }}>{importLoading ? 'Processando...' : 'Selecionar arquivo'}</Button>
            </label>
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}><Button onClick={() => setOpenImport(false)} disabled={importLoading} sx={{ color: 'text.secondary', height: 38 }}>Fechar</Button></DialogActions>
      </Dialog>

      {/* FIX ERR-PF05: Dialog de Bloqueio/Desbloqueio que faltava */}
      <Dialog 
        open={openBlockDialog} 
        onClose={() => setOpenBlockDialog(false)} 
        maxWidth="xs" 
        fullWidth
        PaperProps={{
          sx: { 
            bgcolor: '#0A1628', 
            border: `1px solid ${isBlocking ? 'rgba(255,51,102,0.4)' : 'rgba(0,255,136,0.4)'}`, 
            borderRadius: 1.5, 
            maxHeight: '90vh' 
          }
        }}
      >
        <DialogTitle sx={{ fontWeight: 700, color: isBlocking ? '#FF3366' : '#00FF88' }}>
          {isBlocking ? 'BLOQUEAR PARTICIPANTE' : 'DESBLOQUEAR PARTICIPANTE'}
        </DialogTitle>
        <DialogContent sx={{ overflowY: 'auto' }}>
          <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>
            {isBlocking
              ? `Você está prestes a BLOQUEAR ${pessoaToBlock?.nome}. O acesso será imediatamente revogado.`
              : `Você está prestes a DESBLOQUEAR ${pessoaToBlock?.nome}. O acesso será restaurado para verificação.`}
          </Typography>
          <TextField
            fullWidth
            size="small"
            placeholder="Justificativa obrigatória..."
            value={blockJustification}
            onChange={(e) => setBlockJustification(e.target.value)}
            InputProps={{
              sx: { height: 38, bgcolor: 'rgba(255,255,255,0.05)', borderRadius: 1.5, color: '#FFFFFF', fontSize: '0.875rem' }
            }}
          />
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setOpenBlockDialog(false)} sx={{ color: 'text.secondary', height: 38 }}>Cancelar</Button>
          <NeonButton
            onClick={handleConfirmBlock}
            loading={blockLoading}
            sx={{ height: 38, minHeight: 38, bgcolor: isBlocking ? '#FF3366' : '#00FF88' }}
          >
            CONFIRMAR {isBlocking ? 'Bloqueio' : 'Desbloqueio'}
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

      <Dialog 
        open={openQR} 
        onClose={() => setOpenQR(false)} 
        maxWidth="xs" 
        fullWidth
        PaperProps={{
          sx: { bgcolor: '#0A1628', border: '1px solid rgba(0, 255, 136, 0.3)', borderRadius: 1.5, maxHeight: '90vh' }
        }}
      >
        <DialogTitle sx={{ textAlign: 'center', fontWeight: 700 }}>ACRESCITAR CREDENCIAL: {qrPessoa?.nome}</DialogTitle>
        <DialogContent sx={{ textAlign: 'center', py: 4, overflowY: 'auto' }}>
          {qrLoading ? <CircularProgress sx={{ color: '#00FF88' }} /> : (
            <Box>
              <img src={qrImage} alt="QR Code" style={{ maxWidth: '100%', maxHeight: '45vh', width: '250px', border: '8px solid #FFFFFF', borderRadius: '8px', objectFit: 'contain' }} />
              <Typography variant="caption" sx={{ display: 'block', mt: 2, color: 'text.secondary' }}>TOKEN SEGURO: {qrPessoa?.qr_code || 'Gerado via sistema'}</Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setOpenQR(false)} sx={{ height: 38 }}>Fechar</Button>
          {!qrLoading && <Button variant="contained" onClick={() => { const link = document.createElement('a'); link.href = qrImage; link.download = `QR_${qrPessoa?.nome}.png`; link.click(); }} sx={{ bgcolor: '#00FF88', color: '#000000', fontWeight: 700, height: 38 }}>Baixar png</Button>}
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Pessoas;
