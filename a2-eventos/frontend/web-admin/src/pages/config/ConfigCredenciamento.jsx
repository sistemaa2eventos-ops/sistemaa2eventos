import React, { useState, useEffect } from 'react';
import {
    Box, Typography, TextField, Switch, 
    Divider, Grid, CircularProgress, Button,
    Alert, Select, MenuItem, FormControl, InputLabel,
    Chip, Stack, IconButton, FormControlLabel
} from '@mui/material';
import { 
    PersonAdd as CredIcon,
    AccessTime as TimeIcon,
    Gavel as LgpdIcon,
    AutoFixHigh as AutoIcon,
    Business as EmpresaIcon,
    GroupWork as GrupoIcon,
    Add as AddIcon,
    Delete as DeleteIcon
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import { useSystemSettings } from '../../hooks/useSystemSettings';
import GlassCard from '../../components/common/GlassCard';
import PageHeader from '../../components/common/PageHeader';

const TIPOS_PESSOA = [
    { key: 'colaborador', label: 'Colaborador', desc: 'Funcionário da empresa' },
    { key: 'visitante', label: 'Visitante', desc: 'Prestador/terceirizado' },
    { key: 'participante', label: 'Participante', desc: 'Cliente com ingresso' }
];

const DOCS_DISPONIVEIS = [
    'RG/CPF', 'CNH', 'Passaporte', 'ASO (Atestado Saúde Ocupacional)', 
    'NR-10', 'NR-35', 'CTPS', 'Curso de Trabalho em Altura', 
    'Curso de Espaço Confinado', 'Curso de Primeiros Socorros', 
    'EPI\'s', 'Comprovante Vaccinação'
];

const ConfigCredenciamento = () => {
    const { settings, setSettings, loading, saving, handleSave } = useSystemSettings();
    const { enqueueSnackbar } = useSnackbar();

    // Tipos de pessoa ativos
    const [tiposAtivos, setTiposAtivos] = useState({
        colaborador: true,
        visitante: settings?.tipo_visitante_ativo !== false,
        participante: settings?.tipo_participante_ativo !== false
    });

    // Documentos obrigatórios por tipo
    const [docsObrigatorios, setDocsObrigatorios] = useState({
        colaborador: settings?.docs_obrigatorios_colaborador || [],
        visitante: settings?.docs_obrigatorios_visitante || [],
        participante: settings?.docs_obrigatorios_participante || []
    });

    // Controle de vagas
    const [controleVagas, setControleVagas] = useState({
        limite_global: settings?.vagas_limite_global || 0,
        aplicar_por_empresa: settings?.vagas_aplicar_por_empresa || false,
        ao_atingir_limite: settings?.vagas_acao_limite || 'bloquear'
    });

    // Lista editável de documentos de trabalho
    const [listaDocs, setListaDocs] = useState(settings?.docs_trabalho_lista || DOCS_DISPONIVEIS);
    const [novoDoc, setNovoDoc] = useState('');

    const handleToggleTipo = (tipo) => {
        setTiposAtivos(prev => ({ ...prev, [tipo]: !prev[tipo] }));
    };

    const handleToggleDoc = (tipo, doc) => {
        setDocsObrigatorios(prev => {
            const current = prev[tipo] || [];
            const exists = current.includes(doc);
            return {
                ...prev,
                [tipo]: exists ? current.filter(d => d !== doc) : [...current, doc]
            };
        });
    };

    const handleAddDoc = () => {
        if (novoDoc && !listaDocs.includes(novoDoc)) {
            setListaDocs([...listaDocs, novoDoc]);
            setNovoDoc('');
        }
    };

    const handleRemoveDoc = (doc) => {
        setListaDocs(listaDocs.filter(d => d !== doc));
    };

    const handleSalvar = async () => {
        setSettings(prev => ({
            ...prev,
            tipo_visitante_ativo: tiposAtivos.visitante,
            tipo_participante_ativo: tiposAtivos.participante,
            docs_obrigatorios_colaborador: docsObrigatorios.colaborador,
            docs_obrigatorios_visitante: docsObrigatorios.visitante,
            docs_obrigatorios_participante: docsObrigatorios.participante,
            vagas_limite_global: controleVagas.limite_global,
            vagas_aplicar_por_empresa: controleVagas.aplicar_por_empresa,
            vagas_acao_limite: controleVagas.ao_atingir_limite,
            docs_trabalho_lista: listaDocs
        }));
        await handleSave();
        enqueueSnackbar('Configurações salvas!', { variant: 'success' });
    };

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>;

    return (
        <Box sx={{ p: 4 }}>
            <PageHeader
                title="Credenciamento"
                subtitle="Configure tipos de pessoa, documentos e controle de vagas."
                breadcrumbs={[{ text: 'Configurações' }, { text: 'Credenciamento' }]}
            />

            <Grid container spacing={3}>
                {/* SEÇÃO: Tipos de Pessoa */}
                <Grid item xs={12} md={6}>
                    <GlassCard sx={{ p: 3 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
                            <GrupoIcon sx={{ color: '#00D4FF' }} />
                            <Typography variant="subtitle1" sx={{ color: '#fff', fontWeight: 700 }}>
                                Tipos de Pessoa Ativos
                            </Typography>
                        </Box>

                        <Stack spacing={2}>
                            {TIPOS_PESSOA.map(tipo => (
                                <Box key={tipo.key} sx={{ 
                                    p: 2, 
                                    borderRadius: 2, 
                                    border: '1px solid',
                                    borderColor: tiposAtivos[tipo.key] ? 'rgba(0, 212, 255, 0.3)' : 'rgba(255,255,255,0.1)',
                                    bgcolor: tiposAtivos[tipo.key] ? 'rgba(0, 212, 255, 0.05)' : 'transparent'
                                }}>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <Box>
                                            <Typography variant="body2" sx={{ color: '#fff', fontWeight: 600 }}>
                                                {tipo.label}
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary">
                                                {tipo.desc}
                                            </Typography>
                                        </Box>
                                        <Switch 
                                            checked={tiposAtivos[tipo.key]}
                                            onChange={() => handleToggleTipo(tipo.key)}
                                            disabled={tipo.key === 'colaborador'}
                                        />
                                    </Box>
                                </Box>
                            ))}
                        </Stack>

                        <Alert severity="info" sx={{ mt: 2 }}>
                            Colaborador é sempre ativo e não pode ser desativado.
                        </Alert>
                    </GlassCard>
                </Grid>

                {/* SEÇÃO: Controle de Vagas */}
                <Grid item xs={12} md={6}>
                    <GlassCard sx={{ p: 3 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
                            <EmpresaIcon sx={{ color: '#00D4FF' }} />
                            <Typography variant="subtitle1" sx={{ color: '#fff', fontWeight: 700 }}>
                                Controle de Vagas
                            </Typography>
                        </Box>

                        <TextField
                            label="Limite Global de Vagas"
                            type="number"
                            fullWidth
                            value={controleVagas.limite_global}
                            onChange={(e) => setControleVagas({...controleVagas, limite_global: parseInt(e.target.value) || 0})}
                            sx={{ mb: 3 }}
                            helperText="0 = sem limite"
                        />

                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                            <Box>
                                <Typography variant="body2" sx={{ color: '#fff', fontWeight: 600 }}>Aplicar Limite por Empresa</Typography>
                                <Typography variant="caption" color="text.secondary">Cada empresa tem seu próprio limite</Typography>
                            </Box>
                            <Switch 
                                checked={controleVagas.aplicar_por_empresa}
                                onChange={(e) => setControleVagas({...controleVagas, aplicar_por_empresa: e.target.checked})}
                            />
                        </Box>

                        <FormControl fullWidth size="small">
                            <InputLabel>Ação ao Atingir Limite</InputLabel>
                            <Select
                                value={controleVagas.ao_atingir_limite}
                                label="Ação ao Atingir Limite"
                                onChange={(e) => setControleVagas({...controleVagas, ao_atingir_limite: e.target.value})}
                            >
                                <MenuItem value="bloquear">Bloquear novos cadastros</MenuItem>
                                <MenuItem value="sinalizar">Permitir mas sinalizar</MenuItem>
                            </Select>
                        </FormControl>
                    </GlassCard>
                </Grid>

                {/* SEÇÃO: Documentos Obrigatórios */}
                <Grid item xs={12}>
                    <GlassCard sx={{ p: 3 }}>
                        <Typography variant="subtitle1" sx={{ color: '#fff', fontWeight: 700, mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
                            <AutoIcon fontSize="small" color="primary" /> Documentos Obrigatórios por Tipo
                        </Typography>

                        <Grid container spacing={3}>
                            {TIPOS_PESSOA.filter(t => t.key !== 'colaborador').map(tipo => (
                                <Grid item xs={12} md={6} key={tipo.key}>
                                    <Box sx={{ p: 2, bgcolor: 'rgba(0,0,0,0.2)', borderRadius: 2 }}>
                                        <Typography variant="subtitle2" sx={{ color: '#00D4FF', mb: 2, fontWeight: 700 }}>
                                            {tipo.label}
                                        </Typography>
                                        <FormControlLabel
                                            control={
                                                <Switch 
                                                    checked={settings[`exigir_doc_foto_${tipo.key}`] !== false}
                                                    onChange={(e) => setSettings(prev => ({...prev, [`exigir_doc_foto_${tipo.key}`]: e.target.checked}))}
                                                />
                                            }
                                            label="Exigir documento com foto"
                                        />
                                        <Divider sx={{ my: 2 }} />
                                        <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1 }}>
                                            Docs de Trabalho (selecione):
                                        </Typography>
                                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                                            {listaDocs.map(doc => (
                                                <Chip 
                                                    key={doc}
                                                    label={doc}
                                                    size="small"
                                                    clickable
                                                    onClick={() => handleToggleDoc(tipo.key, doc)}
                                                    color={docsObrigatorios[tipo.key]?.includes(doc) ? 'primary' : 'default'}
                                                    variant={docsObrigatorios[tipo.key]?.includes(doc) ? 'filled' : 'outlined'}
                                                />
                                            ))}
                                        </Box>
                                    </Box>
                                </Grid>
                            ))}
                        </Grid>
                    </GlassCard>
                </Grid>

                {/* SEÇÃO: Lista de Docs de Trabalho (GERAL) */}
                <Grid item xs={12}>
                    <GlassCard sx={{ p: 3 }}>
                        <Typography variant="subtitle1" sx={{ color: '#fff', fontWeight: 700, mb: 3 }}>
                            Lista de Documentos de Trabalho Disponíveis
                        </Typography>
                        
                        <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                            <TextField
                                label="Novo documento"
                                size="small"
                                value={novoDoc}
                                onChange={(e) => setNovoDoc(e.target.value)}
                                fullWidth
                            />
                            <Button variant="outlined" startIcon={<AddIcon />} onClick={handleAddDoc}>
                                Adicionar
                            </Button>
                        </Box>

                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                            {listaDocs.map(doc => (
                                <Chip 
                                    key={doc}
                                    label={doc}
                                    onDelete={() => handleRemoveDoc(doc)}
                                />
                            ))}
                        </Box>
                    </GlassCard>
                </Grid>

                {/* SEÇÃO: Convites e LGPD (JÁ EXISTIA) */}
                <Grid item xs={12} md={6}>
                    <GlassCard sx={{ p: 3 }}>
                        <Typography variant="subtitle1" sx={{ color: '#fff', fontWeight: 700, mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
                            <TimeIcon fontSize="small" color="primary" /> Políticas de Convite
                        </Typography>
                        
                        <FormControl fullWidth sx={{ mb: 3 }}>
                            <InputLabel id="expiry-label">Expiração de Convites</InputLabel>
                            <Select
                                labelId="expiry-label"
                                value={settings.invite_expiry_days || 7}
                                label="Expiração de Convites"
                                onChange={(e) => setSettings(prev => ({ ...prev, invite_expiry_days: e.target.value }))}
                            >
                                <MenuItem value={1}>24 horas</MenuItem>
                                <MenuItem value={3}>3 dias</MenuItem>
                                <MenuItem value={7}>7 dias</MenuItem>
                                <MenuItem value={15}>15 dias</MenuItem>
                                <MenuItem value={30}>30 dias</MenuItem>
                            </Select>
                        </FormControl>

                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Box>
                                <Typography variant="body2" sx={{ color: '#fff', fontWeight: 600 }}>Auto-aprovação</Typography>
                                <Typography variant="caption" color="text.secondary">Aprovar sem moderação</Typography>
                            </Box>
                            <Switch 
                                checked={!!settings.auto_aprovacao}
                                onChange={(e) => setSettings(prev => ({ ...prev, auto_aprovacao: e.target.checked }))}
                            />
                        </Box>
                    </GlassCard>
                </Grid>

                <Grid item xs={12} md={6}>
                    <GlassCard sx={{ p: 3 }}>
                        <Typography variant="subtitle1" sx={{ color: '#fff', fontWeight: 700, mb: 3, display: 'flex', alignItems: 'center', gap: 1 }}>
                            <LgpdIcon fontSize="small" color="primary" /> LGPD
                        </Typography>
                        
                        <TextField
                            label="Texto de Consentimento"
                            multiline
                            rows={4}
                            fullWidth
                            value={settings.lgpd_text || ''}
                            onChange={(e) => setSettings(prev => ({ ...prev, lgpd_text: e.target.value }))}
                        />
                    </GlassCard>
                </Grid>

                <Grid item xs={12}>
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
                        <Button
                            variant="contained"
                            color="primary"
                            onClick={handleSalvar}
                            disabled={saving}
                            sx={{ fontWeight: 700, px: 4, borderRadius: 2 }}
                        >
                            {saving ? 'Salvando...' : 'Salvar Alterações'}
                        </Button>
                    </Box>
                </Grid>
            </Grid>
        </Box>
    );
};

export default ConfigCredenciamento;