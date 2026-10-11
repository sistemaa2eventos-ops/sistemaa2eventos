import React from 'react';
import {
  Dialog, DialogContent, DialogActions, Grid, Box, Typography, Step,
  Button, TextField, FormControl, InputLabel, Select, MenuItem, Stepper, StepLabel,
  Divider, Stack, FormGroup, FormControlLabel, Checkbox, CircularProgress
} from '@mui/material';
import {
  InsertDriveFile as FileIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
  FileUpload as UploadIcon,
  CameraAlt as CameraIcon,
  Check as CheckIcon
} from '@mui/icons-material';
import { format } from 'date-fns';
import PhotoCapture from '../common/PhotoCapture';
import NeonButton from '../common/NeonButton';
import TituloModal from '../common/TituloModal';

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
  handleFaseToggle,
  handleSelectAllPhase,
  handleClearPhase,
  handleSelectAllDates,
  handleClearAllDates,
  documentos,
  handleUploadECM,
  handleOpenWebcamECM,
  saving,
  handleNextStep,
  handleSave,
  isEmpresa = false
}) => {
  const [activePhaseTab, setActivePhaseTab] = React.useState('todas');
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      fullScreen={isMobile}
      PaperProps={{
        sx: {
          bgcolor: 'rgba(10, 25, 41, 0.95)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(0, 212, 255, 0.15)',
          borderRadius: 1.5,
          minHeight: isMobile ? '100%' : '80vh',
          maxHeight: isMobile ? '100%' : '90vh',
          height: isMobile ? '100%' : '88vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          backgroundImage: 'none',
          boxShadow: '0 24px 80px rgba(0,0,0,0.6), 0 0 40px rgba(0,212,255,0.05)'
        }
      }}
    >
      <TituloModal
        titulo={isEmpresa ? 'Solicitar novo vínculo' : (selectedPessoa ? 'Editar participante' : 'Novo participante')}
        onFechar={onClose}
        desabilitarFechar={saving}
      />
      
      <DialogContent sx={{ p: 0, flex: '1 1 auto', display: 'flex', minHeight: 0, overflow: 'hidden' }}>
        <Grid container sx={{ flex: 1, height: '100%', minHeight: 0 }}>
          <Grid item xs={12} md={activeStep === 1 ? 4 : 5} sx={{
            borderRight: isMobile ? 'none' : '1px solid rgba(255, 255, 255, 0.05)',
            p: activeStep === 1 ? 2.5 : 4, 
            display: 'flex', 
            flexDirection: 'column', 
            bgcolor: 'rgba(0,0,0,0.2)',
            overflowY: 'auto', 
            minHeight: 0, 
            height: '100%',
            '&::-webkit-scrollbar': { width: '6px' },
            '&::-webkit-scrollbar-thumb': { background: 'rgba(0,212,255,0.3)', borderRadius: '10px' }
          }}>
            {activeStep === 0 && (
              !isEmpresa ? (
                <>
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
                </>
              ) : (
                <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 4 }}>
                  <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.5)', textAlign: 'center' }}>
                    A coleta biométrica será realizada pelo próprio colaborador via link seguro de convite.
                  </Typography>
                </Box>
              )
            )}

            {activeStep === 1 && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {/* Miniatura do Perfil */}
                <Box sx={{ 
                  p: 1.5, 
                  borderRadius: 1.5, 
                  bgcolor: 'rgba(0, 212, 255, 0.04)', 
                  border: '1px solid rgba(0, 212, 255, 0.15)',
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: 1.5 
                }}>
                  {formData.foto_url ? (
                    <Box 
                      component="img" 
                      src={formData.foto_url} 
                      alt="Foto" 
                      sx={{ width: 56, height: 56, borderRadius: 1.5, objectFit: 'cover', border: '2px solid #00D4FF' }} 
                    />
                  ) : (
                    <Box sx={{ width: 56, height: 56, borderRadius: 1.5, bgcolor: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed rgba(255,255,255,0.2)' }}>
                      <CameraIcon sx={{ color: 'rgba(255,255,255,0.3)', fontSize: 22 }} />
                    </Box>
                  )}
                  <Box sx={{ overflow: 'hidden' }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#FFFFFF', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                      {formData.nome_completo || 'Colaborador'}
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#00D4FF', display: 'block', fontWeight: 600 }}>
                      {formData.cpf || 'Sem CPF'}
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', display: 'block', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                      {empresas.find(e => e.id === formData.empresa_id)?.nome || 'Empresa'}
                    </Typography>
                  </Box>
                </Box>

                <Typography variant="overline" sx={{ color: '#00D4FF', fontWeight: 700, letterSpacing: '1px' }}>
                  ESCOPO & CATEGORIA
                </Typography>

                <FormControl fullWidth size="small" required>
                  <InputLabel>Categoria Operacional</InputLabel>
                  <Select 
                    value={formData.tipo_pessoa || ''} 
                    label="Categoria" 
                    onChange={(e) => setFormData({ ...formData, tipo_pessoa: e.target.value })} 
                    MenuProps={{ PaperProps: { sx: { bgcolor: '#0a1628', color: '#FFFFFF', border: '1px solid #00D4FF' } } }}
                  >
                    <MenuItem value="colaborador">Colaborador (B2B) / Staff</MenuItem>
                    <MenuItem value="visitante">Visitante (B2C)</MenuItem>
                    <MenuItem value="staff">Staff Interno / Diretoria</MenuItem>
                    <MenuItem value="fornecedor">Fornecedor de Suprimento</MenuItem>
                  </Select>
                </FormControl>

                <TextField 
                  label="Outra função" 
                  fullWidth 
                  size="small" 
                  value={formData.funcao} 
                  onChange={(e) => setFormData({ ...formData, funcao: e.target.value })} 
                />

                {formData.tipo_pessoa === 'visitante' && (
                  <FormControlLabel 
                    control={<Checkbox size="small" checked={formData.pagamento_validado} onChange={(e) => setFormData({ ...formData, pagamento_validado: e.target.checked })} sx={{ color: 'rgba(0, 255, 136, 0.5)', '&.Mui-checked': { color: '#00FF88' } }} />} 
                    label={<Typography variant="caption">Pagamento Validado</Typography>} 
                  />
                )}

                {(selectedPessoa?.status === 'PENDENTE' || selectedPessoa?.status_acesso === 'pendente' || !selectedPessoa) && (
                  <FormControl fullWidth size="small" required>
                    <InputLabel>Parecer Documental Inicial</InputLabel>
                    <Select 
                      value={formData.parecer_documentos || 'pendente'} 
                      label="Situação dos documentos" 
                      onChange={(e) => setFormData({ ...formData, parecer_documentos: e.target.value })} 
                      MenuProps={{ PaperProps: { sx: { bgcolor: '#0a1628', color: '#FFFFFF', border: '1px solid #00D4FF' } } }}
                    >
                      <MenuItem value="pendente">Documentos Pendentes</MenuItem>
                      <MenuItem value="completo">Completo e Correto (Aprovar)</MenuItem>
                      <MenuItem value="incorreto">Incorreto / Reprovado</MenuItem>
                    </Select>
                  </FormControl>
                )}

                <Box sx={{ mt: 1, p: 1.5, borderRadius: 1.5, bgcolor: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <Typography variant="caption" sx={{ color: '#00D4FF', fontWeight: 700, textTransform: 'uppercase', display: 'block', mb: 0.5 }}>
                    Acesso por fase do evento
                  </Typography>
                  <FormGroup>
                    {['montagem', 'evento', 'desmontagem'].map(fase => {
                      const isChecked = Array.isArray(formData?.fases_acesso) && formData.fases_acesso.includes(fase);
                      const phaseColor = fase === 'montagem' ? '#00D4FF' : (fase === 'evento' ? '#00FF88' : '#FFB800');
                      return (
                        <FormControlLabel 
                          key={fase}
                          control={
                            <Checkbox 
                              size="small"
                              checked={!!isChecked} 
                              onChange={() => handleFaseToggle(fase)}
                              sx={{ color: 'rgba(255,255,255,0.3)', '&.Mui-checked': { color: phaseColor }, p: 0.5 }}
                            />
                          }
                          label={<Typography variant="caption" sx={{ textTransform: 'uppercase', fontWeight: 700, color: isChecked ? phaseColor : 'rgba(255,255,255,0.6)' }}>{fase}</Typography>}
                        />
                      );
                    })}
                  </FormGroup>
                </Box>
              </Box>
            )}

            {activeStep === 2 && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box sx={{ 
                  p: 2, 
                  borderRadius: 1.5, 
                  bgcolor: 'rgba(0, 212, 255, 0.04)', 
                  border: '1px solid rgba(0, 212, 255, 0.15)',
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: 1.5 
                }}>
                  {formData.foto_url && (
                    <Box component="img" src={formData.foto_url} alt="Foto" sx={{ width: 56, height: 56, borderRadius: 1.5, objectFit: 'cover', border: '2px solid #00D4FF' }} />
                  )}
                  <Box>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{formData.nome_completo}</Typography>
                    <Typography variant="caption" sx={{ color: '#00FF88', fontWeight: 700 }}>{formData.funcao || 'Colaborador'}</Typography>
                  </Box>
                </Box>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', fontStyle: 'italic', mt: 2 }}>
                  Verifique a conformidade de segurança e audite a documentação obrigatória anexada.
                </Typography>
              </Box>
            )}

          </Grid>

          <Grid item xs={12} md={activeStep === 1 ? 8 : 7} sx={{ p: { xs: 2.5, md: 3 }, pr: { xs: 2, md: 2.5 }, height: '100%', maxHeight: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column', minHeight: 0, '&::-webkit-scrollbar': { width: '6px' }, '&::-webkit-scrollbar-thumb': { background: 'rgba(0,212,255,0.4)', borderRadius: '10px' }, '&::-webkit-scrollbar-track': { background: 'rgba(255,255,255,0.02)' } }}>
            <Box sx={{ pr: { xs: 0, md: 0.5 }, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              {!isEmpresa && (
              <Stepper activeStep={activeStep} alternativeLabel sx={{
                mb: 2.5,
                '& .MuiStepConnector-line': { borderColor: 'rgba(255,255,255,0.05)' },
                '& .MuiStepIcon-root': {
                  color: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '50%',
                  '&.Mui-active': { color: '#00D4FF', borderColor: '#00D4FF', boxShadow: '0 0 10px rgba(0,212,255,0.2)' },
                  '&.Mui-completed': { color: '#00FF88', borderColor: '#00FF88' },
                  '& .MuiStepIcon-text': { fill: '#FFFFFF', fontWeight: 700 }
                },
                '& .MuiStepLabel-label': {
                  color: 'rgba(255,255,255,0.3) !important', fontSize: '0.75rem', fontWeight: 600, mt: 1,
                  '&.Mui-active': { color: '#FFFFFF !important' },
                  '&.Mui-completed': { color: 'rgba(255,255,255,0.6) !important' }
                }
              }}>
                {steps.map((label) => (
                  <Step key={label}><StepLabel>{label}</StepLabel></Step>
                ))}
              </Stepper>
            )}


            <Box sx={{ flex: 1 }}>
              {activeStep === 0 && (
                <Grid container spacing={2.5}>
                  <Grid item xs={12} md={isEmpresa ? 12 : 8}>
                    <TextField label="Nome completo" fullWidth required value={formData.nome_completo} onChange={(e) => setFormData({ ...formData, nome_completo: e.target.value })} />
                  </Grid>
                  {!isEmpresa && (
                    <Grid item xs={12} md={4}>
                      <FormControl fullWidth required>
                        <InputLabel>Empresa</InputLabel>
                        <Select value={formData.empresa_id} label="Empresa" onChange={(e) => setFormData({ ...formData, empresa_id: e.target.value })} MenuProps={{ PaperProps: { sx: { bgcolor: '#0a1628', color: '#FFFFFF', border: '1px solid #00D4FF' } } }}>
                          {empresas.map(emp => <MenuItem key={emp.id} value={emp.id}>{emp.nome}</MenuItem>)}
                        </Select>
                      </FormControl>
                    </Grid>
                  )}
                  <Grid item xs={12} md={isEmpresa ? 6 : 4}>
                    <TextField label="CPF" fullWidth required value={formData.cpf} onChange={(e) => setFormData({ ...formData, cpf: e.target.value })} />
                  </Grid>
                  <Grid item xs={12} md={isEmpresa ? 6 : 8}>
                    <TextField label="E-mail" fullWidth required value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
                  </Grid>
                  <Grid item xs={12} md={isEmpresa ? 12 : 6}>
                    <TextField label="Função" fullWidth required value={formData.funcao} onChange={(e) => setFormData({ ...formData, funcao: e.target.value })} />
                  </Grid>

                  {!isEmpresa && (
                    <>
                      <Grid item xs={12} md={6}>
                        <TextField label="Nome no crachá" fullWidth placeholder="Nome no crachá" value={formData.nome_credencial} onChange={(e) => setFormData({ ...formData, nome_credencial: e.target.value })} />
                      </Grid>
                      <Grid item xs={12} md={6}>
                        <TextField label="Passaporte (estrangeiros)" fullWidth value={formData.passaporte} onChange={(e) => setFormData({ ...formData, passaporte: e.target.value })} />
                      </Grid>
                      <Grid item xs={12} md={6}>
                        <TextField label="Telefone" fullWidth value={formData.telefone} onChange={(e) => setFormData({ ...formData, telefone: e.target.value })} />
                      </Grid>
                      <Grid item xs={12} md={6}>
                        <TextField label="Data de nascimento" type="date" fullWidth InputLabelProps={{ shrink: true }} value={formData.data_nascimento} onChange={(e) => setFormData({ ...formData, data_nascimento: e.target.value })} />
                      </Grid>
                      <Grid item xs={12} md={6}>
                        <TextField label="Nome da mãe" fullWidth required value={formData.nome_mae} onChange={(e) => setFormData({ ...formData, nome_mae: e.target.value })} />
                      </Grid>
                      <Grid item xs={12}>
                        <TextField label="Observações internas" fullWidth multiline rows={2} value={formData.observacoes || ''} onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })} />
                      </Grid>
                      <Grid item xs={12}>
                        <FormControlLabel control={<Checkbox checked={formData.aceite_lgpd || false} onChange={(e) => setFormData({ ...formData, aceite_lgpd: e.target.checked })} sx={{ color: 'rgba(0, 255, 136, 0.5)', '&.Mui-checked': { color: '#00FF88' } }} />} label={<Typography variant="body2" sx={{ color: '#00FF88', fontWeight: 600 }}>Consentimento LGPD para uso da biometria registrado</Typography>} />
                      </Grid>
                    </>
                  )}
                </Grid>
              )}


              {activeStep === 1 && (
                <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
                  {/* Cabeçalho da seção com ações */}
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5, flexWrap: 'wrap', gap: 1 }}>
                    <Box>
                      <Typography variant="subtitle2" sx={{ color: '#00D4FF', fontWeight: 700, letterSpacing: '0.5px' }}>
                        Dias permitidos para acesso físico
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', display: 'block' }}>
                        Selecione as datas em que a credencial terá liberação de acesso nos terminais.
                      </Typography>
                    </Box>
                    <Stack direction="row" spacing={1}>
                      <Button 
                        size="small" 
                        variant="outlined" 
                        onClick={handleSelectAllDates} 
                        sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#00FF88', borderColor: 'rgba(0,255,136,0.3)', py: 0.3, px: 1.5, '&:hover': { borderColor: '#00FF88', bgcolor: 'rgba(0,255,136,0.08)' } }}
                      >
                        Marcar todos
                      </Button>
                      <Button 
                        size="small" 
                        variant="outlined" 
                        onClick={handleClearAllDates} 
                        sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#FF3366', borderColor: 'rgba(255,51,102,0.3)', py: 0.3, px: 1.5, '&:hover': { borderColor: '#FF3366', bgcolor: 'rgba(255,51,102,0.08)' } }}
                      >
                        Limpar
                      </Button>
                    </Stack>
                  </Box>

                  {/* Abas Rápidas de Navegação / Filtro por Fase */}
                  <Stack direction="row" spacing={1} sx={{ mb: 1.5, flexWrap: 'wrap', gap: 0.5 }}>
                    {[
                      { id: 'todas', label: 'TODAS AS FASES', color: '#00D4FF' },
                      { id: 'montagem', label: 'MONTAGEM', color: '#00D4FF' },
                      { id: 'evento', label: 'EVENTO', color: '#00FF88' },
                      { id: 'desmontagem', label: 'DESMONTAGEM', color: '#FFB800' }
                    ].map(tab => (
                      <Button
                        key={tab.id}
                        size="small"
                        variant={activePhaseTab === tab.id ? 'contained' : 'outlined'}
                        onClick={() => setActivePhaseTab(tab.id)}
                        sx={{
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          letterSpacing: '0.5px',
                          color: activePhaseTab === tab.id ? '#0a1628' : tab.color,
                          bgcolor: activePhaseTab === tab.id ? tab.color : 'transparent',
                          borderColor: tab.color,
                          py: 0.3,
                          px: 1.3,
                          boxShadow: activePhaseTab === tab.id ? `0 0 10px ${tab.color}40` : 'none',
                          '&:hover': {
                            bgcolor: activePhaseTab === tab.id ? tab.color : 'rgba(255,255,255,0.06)'
                          }
                        }}
                      >
                        {tab.label}
                      </Button>
                    ))}
                  </Stack>

                  {/* Container Visual com as Fases e Datas */}
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
                      { id: 'montagem', label: 'MONTAGEM', color: '#00D4FF', bg: 'rgba(0,212,255,0.04)', border: 'rgba(0,212,255,0.2)' },
                      { id: 'evento', label: 'EVENTO', color: '#00FF88', bg: 'rgba(0,255,136,0.04)', border: 'rgba(0,255,136,0.2)' },
                      { id: 'desmontagem', label: 'DESMONTAGEM', color: '#FFB800', bg: 'rgba(255,184,0,0.05)', border: 'rgba(255,184,0,0.25)' }
                    ]
                      .filter(phase => activePhaseTab === 'todas' || activePhaseTab === phase.id)
                      .map(phase => {
                        const dates = (activeEvent && activeEvent[`datas_${phase.id}`]) || [];
                        if (!Array.isArray(dates) || dates.length === 0) return null;
                        const totalDates = dates.length;
                        const selectedCount = dates.filter(d => Array.isArray(formData?.dias_acesso) && formData.dias_acesso.includes(d)).length;

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
                                <Typography variant="caption" sx={{ color: phase.color, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', fontSize: '0.75rem' }}>
                                  {phase.label}
                                </Typography>
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem' }}>
                                  ({selectedCount}/{totalDates} dias selecionados)
                                </Typography>
                              </Box>
                              <Stack direction="row" spacing={0.8}>
                                <Button 
                                  size="small" 
                                  onClick={() => handleSelectAllPhase ? handleSelectAllPhase(phase.id) : null}
                                  sx={{ fontSize: '0.75rem', fontWeight: 700, color: phase.color, py: 0.2, px: 1, minWidth: 'auto', border: `1px solid ${phase.border}`, '&:hover': { bgcolor: `${phase.border}` } }}
                                >
                                  Todos
                                </Button>
                                <Button 
                                  size="small" 
                                  onClick={() => handleClearPhase ? handleClearPhase(phase.id) : null}
                                  sx={{ fontSize: '0.75rem', fontWeight: 700, color: 'rgba(255,255,255,0.5)', py: 0.2, px: 1, minWidth: 'auto', border: '1px solid rgba(255,255,255,0.1)', '&:hover': { color: '#FF3366', borderColor: '#FF3366' } }}
                                >
                                  Limpar
                                </Button>
                              </Stack>
                            </Box>

                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                              {dates.map(date => {
                                const isChecked = Array.isArray(formData?.dias_acesso) && formData.dias_acesso.includes(date);
                                return (
                                  <Box
                                    key={date}
                                    onClick={() => handleDateToggle(date)}
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

              {activeStep === 2 && (
                <Box sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <Box>
                    <Typography variant="subtitle2" sx={{ color: '#FF3366', mb: 1, fontWeight: 700 }}>Verificação de risco operacional</Typography>
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
                              <Box key={doc.id} sx={{ p: 2, bgcolor: 'rgba(0,0,0,0.2)', borderRadius: 1.5, border: '1px solid rgba(0, 212, 255, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
                        <Box sx={{ p: 2, border: '1px dashed rgba(0,212,255,0.3)', borderRadius: 1.5, textAlign: 'center' }}>
                          <Typography variant="body2" sx={{ color: '#00D4FF', mb: 2, fontWeight: 700 }}>Inserir novo documento</Typography>
                          <Stack direction="row" spacing={2} justifyContent="center">
                            <Button variant="outlined" startIcon={<UploadIcon />} onClick={() => { const input = document.createElement('input'); input.type = 'file'; input.accept = 'image/*,application/pdf'; input.onchange = (e) => handleUploadECM(selectedPessoa.id, e.target.files[0]); input.click(); }} sx={{ borderColor: 'rgba(0,212,255,0.3)', color: '#00D4FF' }}>Arquivo / scanner</Button>
                            <Button variant="outlined" startIcon={<CameraIcon />} onClick={() => handleOpenWebcamECM(selectedPessoa.id)} sx={{ borderColor: 'rgba(123,47,190,0.5)', color: '#7B2FBE' }}>Foto webcam</Button>
                          </Stack>
                        </Box>
                      </Box>
                    )}
                  </Box>
                </Box>
              )}
            </Box>
            </Box>
          </Grid>
        </Grid>
      </DialogContent>
      
      <DialogActions sx={{ p: { xs: 1.5, sm: 2.5 }, px: { xs: 2, sm: 4, md: 5 }, justifyContent: 'space-between', borderTop: '1px solid rgba(255, 255, 255, 0.05)', bgcolor: 'rgba(10, 25, 41, 0.5)' }}>
        <Button onClick={onClose} disabled={saving} sx={{ height: 38, color: 'rgba(255,255,255,0.5)', fontWeight: 700, '&:hover': { color: '#FF3366' } }}>Cancelar</Button>
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
          {activeStep > 0 && !isEmpresa && <Button onClick={() => setActiveStep(prev => prev - 1)} sx={{ height: 38, color: 'rgba(255,255,255,0.5)', fontWeight: 700, '&:hover': { color: '#FFFFFF' } }}>Voltar</Button>}
          {isEmpresa ? (
            <NeonButton onClick={handleSave} loading={saving} sx={{ height: 38, minHeight: 38 }}>Enviar convite</NeonButton>
          ) : (
            <>
              {activeStep < steps.length - 1 ? <NeonButton onClick={handleNextStep} sx={{ height: 38, minHeight: 38 }}>Próxima etapa</NeonButton> : <NeonButton onClick={handleSave} loading={saving} sx={{ height: 38, minHeight: 38 }}>Finalizar registro</NeonButton>}
            </>
          )}
        </Box>
      </DialogActions>
    </Dialog>
  );
};

export default PessoaFormDialog;
