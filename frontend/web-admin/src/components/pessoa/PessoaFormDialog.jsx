import React from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Grid, Box, Typography, Step,
  Button, TextField, FormControl, InputLabel, Select, MenuItem, Stepper, StepLabel,
  Divider, Stack, FormGroup, FormControlLabel, Checkbox, CircularProgress
} from '@mui/material';
import {
  FileDownload as DownloadIcon,
  InsertDriveFile as FileIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
  FileUpload as UploadIcon,
  CameraAlt as CameraIcon
} from '@mui/icons-material';
import { format } from 'date-fns';
import PhotoCapture from '../common/PhotoCapture';
import NeonButton from '../common/NeonButton';

const PessoaFormDialog = ({
  open,
  onClose,
  isMobile,
  selectedPessoa,
  formData,
  setFormData,
  activeStep,
  setActiveStep,
  steps,
  empresas,
  activeEvent,
  handleDateToggle,
  documentos,
  handleUploadECM,
  handleOpenWebcamECM,
  saving,
  handleNextStep,
  handleSave
}) => {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      fullScreen={isMobile}
      PaperProps={{
        sx: {
          bgcolor: 'rgba(10, 25, 41, 0.98)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(0, 212, 255, 0.1)',
          borderRadius: 3,
          minHeight: isMobile ? '100%' : '600px',
          maxHeight: isMobile ? '100%' : '90vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          backgroundImage: 'none'
        }
      }}
    >
      <DialogTitle sx={{
        fontFamily: '"Orbitron", sans-serif',
        fontWeight: 700,
        letterSpacing: '1px',
        color: '#fff',
        borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
        py: 2.5,
        px: 4
      }}>
        {selectedPessoa ? 'MODIFICAR REGISTRO' : 'INICIAR NOVO REGISTRO'}
      </DialogTitle>
      
      <DialogContent sx={{ p: 0, flex: 1, display: 'flex', overflow: 'hidden' }}>
        <Grid container sx={{ flex: 1, height: '100%' }}>
          <Grid item xs={12} md={5} sx={{
            borderRight: isMobile ? 'none' : '1px solid rgba(255, 255, 255, 0.05)',
            p: 4, display: 'flex', flexDirection: 'column', bgcolor: 'rgba(0,0,0,0.2)',
            overflowY: 'auto', minHeight: 0
          }}>
            <Box sx={{ mb: 3, textAlign: 'center' }}>
              <Typography variant="overline" sx={{ color: '#00D4FF', fontWeight: 700, letterSpacing: 2 }}>IDENTIFICAÇÃO BIOMÉTRICA</Typography>
            </Box>
            <PhotoCapture
              onPhotoCaptured={(url) => setFormData({ ...formData, foto_url: url })}
              initialPhoto={formData.foto_url}
            />
            <Box sx={{ mt: 'auto', pt: 3 }}>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', textAlign: 'center', display: 'block', fontStyle: 'italic' }}>
                A qualidade do enquadramento garante a velocidade de identificação nos terminais.
              </Typography>
            </Box>
          </Grid>

          <Grid item xs={12} md={7} sx={{ p: 5, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            <Stepper activeStep={activeStep} alternativeLabel sx={{
              mb: 6,
              '& .MuiStepConnector-line': { borderColor: 'rgba(255,255,255,0.05)' },
              '& .MuiStepIcon-root': {
                color: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '50%',
                '&.Mui-active': { color: '#00D4FF', borderColor: '#00D4FF', boxShadow: '0 0 10px rgba(0,212,255,0.2)' },
                '&.Mui-completed': { color: '#00FF88', borderColor: '#00FF88' },
                '& .MuiStepIcon-text': { fill: '#fff', fontWeight: 700 }
              },
              '& .MuiStepLabel-label': {
                color: 'rgba(255,255,255,0.3) !important', fontSize: '0.7rem', fontWeight: 600, mt: 1,
                '&.Mui-active': { color: '#fff !important' },
                '&.Mui-completed': { color: 'rgba(255,255,255,0.6) !important' }
              }
            }}>
              {steps.map((label) => (
                <Step key={label}><StepLabel>{label}</StepLabel></Step>
              ))}
            </Stepper>

            <Box sx={{ flex: 1 }}>
              {activeStep === 0 && (
                <Grid container spacing={2.5}>
                  <Grid item xs={12} md={8}>
                    <TextField label="Nome Completo Restrito" fullWidth required value={formData.nome} onChange={(e) => setFormData({ ...formData, nome: e.target.value })} />
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <TextField label="Nome na Credencial" fullWidth placeholder="Nome na Credencial" value={formData.nome_credencial} onChange={(e) => setFormData({ ...formData, nome_credencial: e.target.value })} />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField label="CPF (Nacional)" fullWidth value={formData.cpf} onChange={(e) => setFormData({ ...formData, cpf: e.target.value })} />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField label="Passaporte (Intl.)" fullWidth value={formData.passaporte} onChange={(e) => setFormData({ ...formData, passaporte: e.target.value })} />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField label="Telefone com DDD" fullWidth value={formData.telefone} onChange={(e) => setFormData({ ...formData, telefone: e.target.value })} />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField label="Data de Nascimento" type="date" fullWidth InputLabelProps={{ shrink: true }} value={formData.data_nascimento} onChange={(e) => setFormData({ ...formData, data_nascimento: e.target.value })} />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField label="Nome Filiação Maternal" fullWidth required value={formData.nome_mae} onChange={(e) => setFormData({ ...formData, nome_mae: e.target.value })} />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField label="Observações Internas" fullWidth multiline rows={3} value={formData.observacoes || ''} onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })} />
                  </Grid>
                </Grid>
              )}

              {activeStep === 1 && (
                <Box sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <Grid container spacing={2}>
                    <Grid item xs={6}>
                      <FormControl fullWidth required>
                        <InputLabel>Empresa Âncora</InputLabel>
                        <Select value={formData.empresa_id} label="Empresa Âncora" onChange={(e) => setFormData({ ...formData, empresa_id: e.target.value })} MenuProps={{ PaperProps: { sx: { bgcolor: '#0a1628', color: '#fff', border: '1px solid #00D4FF' } } }}>
                          {empresas.map(emp => <MenuItem key={emp.id} value={emp.id}>{emp.nome}</MenuItem>)}
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid item xs={6}>
                      <FormControl fullWidth required>
                        <InputLabel>Categoria Operacional</InputLabel>
                        <Select value={formData.tipo_pessoa} label="Categoria Operacional" onChange={(e) => setFormData({ ...formData, tipo_pessoa: e.target.value })} MenuProps={{ PaperProps: { sx: { bgcolor: '#0a1628', color: '#fff', border: '1px solid #00D4FF' } } }}>
                          <MenuItem value="colaborador">Colaborador (B2B)</MenuItem>
                          <MenuItem value="visitante">Cliente / Visitante (B2C)</MenuItem>
                          <MenuItem value="staff">Staff Interno / Diretoria</MenuItem>
                          <MenuItem value="fornecedor">Fornecedor de Suprimento</MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid item xs={6}>
                      <TextField label="Função Especificada" fullWidth value={formData.funcao} onChange={(e) => setFormData({ ...formData, funcao: e.target.value })} />
                    </Grid>
                    {formData.tipo_pessoa === 'visitante' && (
                      <Grid item xs={6} sx={{ display: 'flex', alignItems: 'center' }}>
                        <FormControlLabel control={<Checkbox checked={formData.pagamento_validado} onChange={(e) => setFormData({ ...formData, pagamento_validado: e.target.checked })} sx={{ color: 'rgba(0, 255, 136, 0.5)', '&.Mui-checked': { color: '#00FF88' } }} />} label="Pagamento Validado" />
                      </Grid>
                    )}
                    {!selectedPessoa && (
                      <Grid item xs={12}>
                        <FormControl fullWidth required>
                          <InputLabel>Parecer Documental Inicial</InputLabel>
                          <Select value={formData.parecer_documentos || 'pendente'} label="Parecer Documental Inicial" onChange={(e) => setFormData({ ...formData, parecer_documentos: e.target.value })} MenuProps={{ PaperProps: { sx: { bgcolor: '#0a1628', color: '#fff', border: '1px solid #00D4FF' } } }}>
                            <MenuItem value="pendente">Documentos Pendentes (Faltam Envios)</MenuItem>
                            <MenuItem value="completo">Completo e Correto (Aprovar Cadastro)</MenuItem>
                            <MenuItem value="incorreto">Incorreto / Reprovado (Bloquear Cadastro)</MenuItem>
                          </Select>
                        </FormControl>
                      </Grid>
                    )}
                  </Grid>

                  {activeEvent && (
                    <Box>
                      <Typography variant="subtitle2" sx={{ color: '#00D4FF', mb: 1, fontWeight: 700 }}>DIAS PERMITIDOS PARA ACESSO FÍSICO</Typography>
                      <Divider sx={{ mb: 2, borderColor: 'rgba(255,255,255,0.1)' }} />
                      <Stack spacing={2}>
                        {['montagem', 'evento', 'desmontagem'].map(phase => {
                          const dates = activeEvent[`datas_${phase}`] || [];
                          if (dates.length === 0) return null;
                          return (
                            <Box key={phase}>
                              <Typography variant="caption" sx={{ color: 'text.secondary', textTransform: 'uppercase', display: 'block', mb: 0.5 }}>{phase}</Typography>
                              <FormGroup row>
                                {dates.map(date => (
                                  <FormControlLabel key={date} control={<Checkbox size="small" checked={formData.dias_trabalho.includes(date)} onChange={() => handleDateToggle(date)} sx={{ color: 'rgba(255,255,255,0.3)', '&.Mui-checked': { color: '#00D4FF' } }} />} label={<Typography variant="caption">{format(new Date(date), "dd/MM")}</Typography>} />
                                ))}
                              </FormGroup>
                            </Box>
                          );
                        })}
                      </Stack>
                    </Box>
                  )}
                </Box>
              )}

              {activeStep === 2 && (
                <Box sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <Box>
                    <Typography variant="subtitle2" sx={{ color: '#FF3366', mb: 1, fontWeight: 700 }}>VERIFICAÇÃO DE RISCO OPERACIONAL</Typography>
                    <Divider sx={{ mb: 2, borderColor: 'rgba(255,51,102,0.2)' }} />
                    <FormGroup row>
                      <FormControlLabel control={<Checkbox checked={formData.trabalho_area_tecnica} onChange={(e) => setFormData({ ...formData, trabalho_area_tecnica: e.target.checked })} sx={{ color: 'rgba(255,51,102,0.3)', '&.Mui-checked': { color: '#FF3366' } }} />} label={<Typography variant="body2">Trabalhará em Área Técnica Confinada</Typography>} />
                      <FormControlLabel control={<Checkbox checked={formData.trabalho_altura} onChange={(e) => setFormData({ ...formData, trabalho_altura: e.target.checked })} sx={{ color: 'rgba(255,184,0,0.3)', '&.Mui-checked': { color: '#FFB800' } }} />} label={<Typography variant="body2">Executará Trabalho em Altura</Typography>} />
                    </FormGroup>
                  </Box>

                  <Box sx={{ mt: 2 }}>
                    <Typography variant="subtitle2" sx={{ color: '#00D4FF', mb: 1, fontWeight: 700 }}>DOCUMENTAÇÃO PESSOAL ECM (NRs, ASO, Seguros)</Typography>
                    <Divider sx={{ mb: 2, borderColor: 'rgba(0,212,255,0.2)' }} />
                    {!selectedPessoa ? (
                      <Box sx={{ textAlign: 'center', py: 4 }}>
                        <CircularProgress size={24} sx={{ color: '#00D4FF', mb: 2 }} />
                        <Typography color="text.secondary">Preparando ambiente para documentos...</Typography>
                      </Box>
                    ) : (
                      <Box>
                        <Stack spacing={2} sx={{ mb: 3 }}>
                          {documentos.length === 0 ? (
                            <Typography variant="body2" color="text.secondary">Nenhum arquivo anexado a este colaborador ainda.</Typography>
                          ) : (
                            documentos.map(doc => (
                              <Box key={doc.id} sx={{ p: 2, bgcolor: 'rgba(0,0,0,0.2)', borderRadius: 2, border: '1px solid rgba(0, 212, 255, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                  <FileIcon sx={{ color: '#00D4FF' }} />
                                  <Box sx={{ textAlign: 'left' }}>
                                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{doc.titulo}</Typography>
                                    <Typography variant="caption" color="text.secondary">{doc.tipo_doc} • Upload {new Date(doc.data_inclusao).toLocaleDateString()}</Typography>
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
                        <Box sx={{ p: 2, border: '1px dashed rgba(0,212,255,0.3)', borderRadius: 2, textAlign: 'center' }}>
                          <Typography variant="body2" sx={{ color: '#00D4FF', mb: 2, fontWeight: 700 }}>INSERIR NOVO DOCUMENTO</Typography>
                          <Stack direction="row" spacing={2} justifyContent="center">
                            <Button variant="outlined" startIcon={<UploadIcon />} onClick={() => { const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*,application/pdf'; input.onchange = (e) => handleUploadECM(selectedPessoa.id, e.target.files[0]); input.click(); }} sx={{ borderColor: 'rgba(0,212,255,0.3)', color: '#00D4FF' }}>ARQUIVO / SCANNER</Button>
                            <Button variant="outlined" startIcon={<CameraIcon />} onClick={() => handleOpenWebcamECM(selectedPessoa.id)} sx={{ borderColor: 'rgba(123,47,190,0.5)', color: '#7B2FBE' }}>FOTO WEBCAM</Button>
                          </Stack>
                        </Box>
                      </Box>
                    )}
                  </Box>
                </Box>
              )}
            </Box>
          </Grid>
        </Grid>
      </DialogContent>
      
      <DialogActions sx={{ p: 3, px: 6, justifyContent: 'space-between', borderTop: '1px solid rgba(255, 255, 255, 0.05)', bgcolor: 'rgba(10, 25, 41, 0.5)' }}>
        <Button onClick={onClose} disabled={saving} sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 700, '&:hover': { color: '#FF3366' } }}>ABORTAR</Button>
        <Box sx={{ display: 'flex', gap: 2 }}>
          {activeStep > 0 && <Button onClick={() => setActiveStep(prev => prev - 1)} sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 700, '&:hover': { color: '#fff' } }}>VOLTAR</Button>}
          {activeStep < steps.length - 1 ? <NeonButton onClick={handleNextStep}>PRÓXIMA ETAPA</NeonButton> : <NeonButton onClick={handleSave} loading={saving}>FINALIZAR REGISTRO</NeonButton>}
        </Box>
      </DialogActions>
    </Dialog>
  );
};

export default PessoaFormDialog;
