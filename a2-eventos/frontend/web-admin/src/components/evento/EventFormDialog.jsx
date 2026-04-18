import React from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Tabs,
    Tab,
    Box,
    TextField,
    Grid,
    Divider,
    Typography,
    FormControlLabel,
    Switch,
    FormGroup,
    Checkbox,
    Alert,
    Stack,
    Button
} from '@mui/material';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import NeonButton from '../common/NeonButton';

const EventFormDialog = ({
    open,
    onClose,
    selectedEvento,
    tabValue,
    setTabValue,
    formData,
    setFormData,
    handleSave,
    saving,
    generateDateRange,
    handleSelectAll,
    handleClearAll,
    handleDateToggle
}) => {
    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle sx={{ fontFamily: '"Orbitron", sans-serif', fontWeight: 700, letterSpacing: '2px' }}>
                {selectedEvento ? 'MODIFICAR EVENTO' : 'INICIAR NOVO EVENTO'}
            </DialogTitle>
            <DialogContent>
                <Tabs
                    value={tabValue}
                    onChange={(e, v) => setTabValue(v)}
                    sx={{ borderBottom: '1px solid rgba(255,255,255,0.1)', mb: 3 }}
                >
                    <Tab label="INFORMAÇÕES" sx={{ fontWeight: 700 }} />
                    <Tab label="FASES & DATAS" sx={{ fontWeight: 700 }} />
                </Tabs>

                {tabValue === 0 ? (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        <TextField
                            label="Nome do Evento"
                            fullWidth
                            value={formData.nome}
                            onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                        />
                        <TextField
                            label="Localização"
                            fullWidth
                            value={formData.local}
                            onChange={(e) => setFormData({ ...formData, local: e.target.value })}
                        />
                        <Grid container spacing={2}>
                            <Grid item xs={6}>
                                <TextField
                                    label="Data Início"
                                    type="date"
                                    fullWidth
                                    InputLabelProps={{ shrink: true }}
                                    value={formData.data_inicio}
                                    onChange={(e) => setFormData({ ...formData, data_inicio: e.target.value })}
                                />
                            </Grid>
                            <Grid item xs={6}>
                                <TextField
                                    label="Data Fim"
                                    type="date"
                                    fullWidth
                                    InputLabelProps={{ shrink: true }}
                                    value={formData.data_fim}
                                    onChange={(e) => setFormData({ ...formData, data_fim: e.target.value })}
                                />
                            </Grid>
                            <Grid item xs={6}>
                                <TextField
                                    label="Horário Reset Diário"
                                    type="time"
                                    fullWidth
                                    InputLabelProps={{ shrink: true }}
                                    value={formData.horario_reset}
                                    onChange={(e) => setFormData({ ...formData, horario_reset: e.target.value })}
                                    helperText="Horário que os logs expiram para novo check-in"
                                />
                            </Grid>
                            <Grid item xs={6}>
                                <TextField
                                    label="Capacidade"
                                    type="number"
                                    fullWidth
                                    value={formData.capacidade_total}
                                    onChange={(e) => setFormData({ ...formData, capacidade_total: e.target.value })}
                                />
                            </Grid>
                        </Grid>

                        <Divider sx={{ my: 1, borderColor: 'rgba(255,255,255,0.05)' }} />

                        <Typography variant="subtitle2" sx={{ color: '#00D4FF', fontWeight: 700, mb: 1 }}>
                            CONFIGURAÇÕES DE FLUXO
                        </Typography>

                        <Box sx={{ p: 2, background: 'rgba(0,0,0,0.2)', borderRadius: 3, border: '1px solid rgba(0,212,255,0.1)' }}>
                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={formData.impressao_etiquetas}
                                        onChange={(e) => setFormData({ ...formData, impressao_etiquetas: e.target.checked })}
                                        color="primary"
                                    />
                                }
                                label={<Typography variant="body2">Habilitar Impressão de Etiquetas</Typography>}
                            />
                            <Typography variant="caption" display="block" sx={{ color: 'text.secondary', mb: 2, ml: 1 }}>
                                Ditará se o check-in dispara comando de impressão térmica.
                            </Typography>

                            <Typography variant="caption" sx={{ color: '#fff', fontWeight: 700, display: 'block', mb: 1, ml: 1 }}>
                                MÉTODOS DE CHECK-IN PERMITIDOS
                            </Typography>
                            <FormGroup row sx={{ ml: 1, mb: 2 }}>
                                {[
                                    { id: 'facial', label: 'Reconhecimento Facial' },
                                    { id: 'pulseira', label: 'Pulseira/Barcode' }
                                ].map(method => (
                                    <FormControlLabel
                                        key={method.id}
                                        control={
                                            <Checkbox
                                                size="small"
                                                checked={formData.tipos_checkin?.includes(method.id)}
                                                onChange={(e) => {
                                                    const current = [...(formData.tipos_checkin || [])];
                                                    if (e.target.checked) {
                                                        if (!current.includes(method.id)) current.push(method.id);
                                                    } else {
                                                        const idx = current.indexOf(method.id);
                                                        if (idx > -1) current.splice(idx, 1);
                                                    }
                                                    setFormData({ ...formData, tipos_checkin: current });
                                                }}
                                            />
                                        }
                                        label={<Typography variant="caption" sx={{ textTransform: 'uppercase' }}>{method.label}</Typography>}
                                    />
                                ))}
                            </FormGroup>

                            <Typography variant="caption" sx={{ color: '#fff', fontWeight: 700, display: 'block', mb: 1, ml: 1 }}>
                                MÉTODOS DE CHECK-OUT PERMITIDOS
                            </Typography>
                            <FormGroup row sx={{ ml: 1 }}>
                                {[
                                    { id: 'facial', label: 'Reconhecimento Facial' },
                                    { id: 'pulseira', label: 'Pulseira/Barcode' }
                                ].map(method => (
                                    <FormControlLabel
                                        key={method.id}
                                        control={
                                            <Checkbox
                                                size="small"
                                                checked={formData.tipos_checkout?.includes(method.id)}
                                                onChange={(e) => {
                                                    const current = [...(formData.tipos_checkout || [])];
                                                    if (e.target.checked) {
                                                        if (!current.includes(method.id)) current.push(method.id);
                                                    } else {
                                                        const idx = current.indexOf(method.id);
                                                        if (idx > -1) current.splice(idx, 1);
                                                    }
                                                    setFormData({ ...formData, tipos_checkout: current });
                                                }}
                                            />
                                        }
                                        label={<Typography variant="caption" sx={{ textTransform: 'uppercase' }}>{method.label}</Typography>}
                                    />
                                ))}
                            </FormGroup>
                        </Box>

                        <Divider sx={{ my: 2, borderColor: 'rgba(255,255,255,0.05)' }} />

                        <Typography variant="subtitle2" sx={{ color: '#7B2FBE', fontWeight: 700, mb: 1 }}>
                            IDENTIDADE VISUAL DO EVENTO
                        </Typography>

                        <Box sx={{ p: 2, background: 'rgba(0,0,0,0.2)', borderRadius: 3, border: '1px solid rgba(123,47,190,0.1)' }}>
                            <Grid container spacing={2}>
                                <Grid item xs={6}>
                                    <TextField
                                        label="Cor Primária"
                                        type="color"
                                        fullWidth
                                        value={formData.cor_primaria || '#00D4FF'}
                                        onChange={(e) => setFormData({ ...formData, cor_primaria: e.target.value })}
                                        InputLabelProps={{ shrink: true }}
                                        helperText="Cor principal do evento"
                                    />
                                </Grid>
                                <Grid item xs={6}>
                                    <TextField
                                        label="Cor Secundária"
                                        type="color"
                                        fullWidth
                                        value={formData.cor_secundaria || '#7B2FBE'}
                                        onChange={(e) => setFormData({ ...formData, cor_secundaria: e.target.value })}
                                        InputLabelProps={{ shrink: true }}
                                        helperText="Cor de destaque"
                                    />
                                </Grid>
                                <Grid item xs={12}>
                                    <TextField
                                        label="URL do Logo"
                                        fullWidth
                                        value={formData.logo_url || ''}
                                        onChange={(e) => setFormData({ ...formData, logo_url: e.target.value })}
                                        placeholder="https://storage.../logo.png"
                                        helperText="Logo exibido no site público e crachás"
                                    />
                                </Grid>
                                <Grid item xs={12}>
                                    <TextField
                                        label="URL do Banner"
                                        fullWidth
                                        value={formData.banner_url || ''}
                                        onChange={(e) => setFormData({ ...formData, banner_url: e.target.value })}
                                        placeholder="https://storage.../banner.jpg"
                                        helperText="Banner de cabeçalho do formulário público"
                                    />
                                </Grid>
                            </Grid>
                        </Box>

                        <Divider sx={{ my: 2, borderColor: 'rgba(255,255,255,0.05)' }} />

                        <Typography variant="subtitle2" sx={{ color: '#00FF88', fontWeight: 700, mb: 1 }}>
                            CAMPOS OBRIGATÓRIOS DO FORMULÁRIO
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 2 }}>
                            Defina quais campos o participante é obrigado a preencher no credenciamento público. (Nome e CPF são sempre obrigatórios).
                        </Typography>

                        <Box sx={{ p: 2, background: 'rgba(0,0,0,0.2)', borderRadius: 3, border: '1px solid rgba(0,255,136,0.1)' }}>
                            <FormGroup row sx={{ gap: 2 }}>
                                {[
                                    { id: 'email', label: 'E-mail' },
                                    { id: 'data_nascimento', label: 'Data de Nascimento' },
                                    { id: 'nome_mae', label: 'Nome da Mãe' },
                                    { id: 'funcao', label: 'Função/Cargo' },
                                    { id: 'foto', label: 'Foto (Selfie)' },
                                    { id: 'dias_trabalho', label: 'Dias de Trabalho' }
                                ].map(field => (
                                    <FormControlLabel
                                        key={field.id}
                                        control={
                                            <Switch
                                                size="small"
                                                color="primary"
                                                checked={formData.campos_obrigatorios?.[field.id] !== false} // default true se undefined
                                                onChange={(e) => {
                                                    const currentConfig = formData.campos_obrigatorios || {};
                                                    setFormData({
                                                        ...formData,
                                                        campos_obrigatorios: {
                                                            ...currentConfig,
                                                            [field.id]: e.target.checked
                                                        }
                                                    });
                                                }}
                                            />
                                        }
                                        label={<Typography variant="body2">{field.label}</Typography>}
                                        sx={{ minWidth: '180px' }}
                                    />
                                ))}
                            </FormGroup>
                        </Box>
                    </Box> // Close the <Box> that started at line 57
                ) : (
                    <Box>
                        {!formData.data_inicio || !formData.data_fim ? (
                            <Alert severity="info">Defina as datas de início e fim na aba Informações para configurar as fases.</Alert>
                        ) : (
                            <Stack spacing={3}>
                                {['montagem', 'evento', 'desmontagem'].map(phase => (
                                    <Box key={phase}>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                                            <Typography variant="subtitle2" sx={{ color: '#00D4FF', textTransform: 'uppercase', fontWeight: 800 }}>
                                                {phase}
                                            </Typography>
                                            <Stack direction="row" spacing={1}>
                                                <Button size="small" onClick={() => handleSelectAll(phase)} sx={{ fontSize: '0.65rem' }}>TUDO</Button>
                                                <Button size="small" onClick={() => handleClearAll(phase)} color="error" sx={{ fontSize: '0.65rem' }}>LIMPAR</Button>
                                            </Stack>
                                        </Box>
                                        <FormGroup row sx={{ gap: 1 }}>
                                            {generateDateRange().map(date => (
                                                <FormControlLabel
                                                    key={date}
                                                    control={
                                                        <Checkbox
                                                            size="small"
                                                            checked={formData[`datas_${phase}`]?.includes(date)}
                                                            onChange={() => handleDateToggle(date, phase)}
                                                            sx={{ color: 'rgba(255,255,255,0.2)', '&.Mui-checked': { color: '#00FF88' } }}
                                                        />
                                                    }
                                                    label={
                                                        <Box sx={{ lineHeigh: 1 }}>
                                                            <Typography variant="caption" sx={{ fontWeight: 700, display: 'block' }}>
                                                                {format(new Date(date + 'T00:00:00'), "dd/MM")}
                                                            </Typography>
                                                            <Typography variant="caption" sx={{ fontSize: '0.6rem', color: 'text.secondary' }}>
                                                                {format(new Date(date + 'T00:00:00'), "EEE", { locale: ptBR })}
                                                            </Typography>
                                                        </Box>
                                                    }
                                                    sx={{
                                                        mr: 0,
                                                        p: 1,
                                                        borderRadius: 2,
                                                        border: '1px solid rgba(255,255,255,0.05)',
                                                        '&:hover': { background: 'rgba(255,255,255,0.02)' }
                                                    }}
                                                />
                                            ))}
                                        </FormGroup>
                                        <Divider sx={{ mt: 2, borderColor: 'rgba(255,255,255,0.05)' }} />
                                    </Box>
                                ))}
                            </Stack>
                        )}
                    </Box>
                )}
            </DialogContent>
            <DialogActions sx={{ p: 3 }}>
                <Button onClick={onClose} disabled={saving} sx={{ color: 'text.secondary' }}>ABORTAR</Button>
                <NeonButton onClick={handleSave} loading={saving}>SALVAR E ATIVAR</NeonButton>
            </DialogActions>
        </Dialog>
    );
};

export default EventFormDialog;
