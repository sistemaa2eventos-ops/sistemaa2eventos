import React, { useEffect, useState } from 'react';
import { Box, Typography, Switch, FormControlLabel, Grid, Alert, Button, Stack, LinearProgress, Chip } from '@mui/material';
import { Save as SaveIcon, Description as DocIcon, Business as EmpresaIcon, Lock as TravadoIcon } from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import PageHeader from '../../components/common/PageHeader';
import GlassCard from '../../components/common/GlassCard';
import NeonButton from '../../components/common/NeonButton';
import { cores } from '../../styles/tokens';

// Campos do formulário do link de pré-cadastro (eventos.campos_obrigatorios).
// Ligado = aparece e é obrigatório; desligado = não aparece. Nome, CPF e e-mail sempre aparecem.
const CAMPOS = [
    { id: 'email', label: 'E-mail', ajuda: 'Sempre aparece; aqui define se é obrigatório.' },
    { id: 'data_nascimento', label: 'Data de nascimento' },
    { id: 'nome_mae', label: 'Nome da mãe' },
    { id: 'funcao', label: 'Função / cargo', ajuda: 'Com funções configuradas em Documentos, a pessoa escolhe numa lista.' },
    { id: 'foto', label: 'Foto do rosto (selfie)', ajuda: 'Necessária para o reconhecimento facial nos leitores.' },
    { id: 'dias_trabalho', label: 'Dias de trabalho' }
];

/**
 * Formulário de pré-cadastro do evento ativo: o que a pessoa preenche pelo link da empresa.
 * Antes esta tela gravava em eventos.config.registration, que nada lia (abas por tipo,
 * auto-aprovação e texto LGPD não tinham efeito). Agora edita o que o portal usa.
 */
const ConfigCredenciamento = () => {
    const { enqueueSnackbar } = useSnackbar();
    const navigate = useNavigate();
    const eventoId = localStorage.getItem('active_evento_id');
    const [campos, setCampos] = useState(null);
    const [salvando, setSalvando] = useState(false);
    const [alterado, setAlterado] = useState(false);

    useEffect(() => {
        if (!eventoId) return;
        api.get(`/eventos/${eventoId}`)
            .then(({ data }) => setCampos((data?.data || data)?.campos_obrigatorios || {}))
            .catch(() => enqueueSnackbar('Falha ao carregar o evento.', { variant: 'error' }));
    }, [eventoId, enqueueSnackbar]);

    const ligado = (id) => campos?.[id] !== false; // sem configuração = obrigatório (padrão do portal)

    const salvar = async () => {
        setSalvando(true);
        try {
            const valores = Object.fromEntries(CAMPOS.map(c => [c.id, ligado(c.id)]));
            await api.put(`/eventos/${eventoId}`, { campos_obrigatorios: { ...campos, ...valores, nome: true, cpf: true } });
            setAlterado(false);
            enqueueSnackbar('Formulário de pré-cadastro atualizado. Vale para os links já enviados.', { variant: 'success' });
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Falha ao salvar.', { variant: 'error' });
        } finally {
            setSalvando(false);
        }
    };

    return (
        <Box sx={{ p: { xs: 2, md: 4 } }}>
            <PageHeader
                title="Credenciamento"
                subtitle="O que a pessoa preenche no link de pré-cadastro enviado para a empresa."
                breadcrumbs={[{ text: 'Configurações' }, { text: 'Credenciamento' }]}
            />

            {!eventoId && <Alert severity="warning" sx={{ mt: 2 }}>Selecione um evento ativo (Eventos → Gerenciar) para configurar o formulário.</Alert>}
            {eventoId && !campos && <LinearProgress sx={{ mt: 3 }} />}

            {eventoId && campos && (
                <Grid container spacing={3} sx={{ mt: 0.5 }}>
                    <Grid item xs={12} md={7}>
                        <GlassCard sx={{ p: { xs: 2, sm: 3 } }}>
                            <Typography variant="h6" sx={{ fontWeight: 700, color: cores.textoForte }}>Campos do formulário</Typography>
                            <Typography variant="body2" sx={{ color: cores.textoSecundario, mb: 2 }}>
                                Ligado: o campo aparece e é obrigatório. Desligado: o campo não aparece no formulário.
                            </Typography>

                            <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap', gap: 1 }}>
                                {['Nome completo', 'CPF'].map(c => (
                                    <Chip key={c} icon={<TravadoIcon />} label={`${c} — sempre obrigatório`} size="small" variant="outlined" />
                                ))}
                            </Stack>

                            <Stack spacing={1.5}>
                                {CAMPOS.map(c => (
                                    <Box key={c.id}>
                                        <FormControlLabel
                                            control={<Switch checked={ligado(c.id)} onChange={(e) => { setCampos(prev => ({ ...prev, [c.id]: e.target.checked })); setAlterado(true); }} />}
                                            label={<Typography variant="body2" sx={{ fontWeight: 600, color: cores.textoForte }}>{c.label}</Typography>}
                                        />
                                        {c.ajuda && <Typography variant="caption" sx={{ display: 'block', color: cores.textoSecundario, ml: 6, mt: -0.5 }}>{c.ajuda}</Typography>}
                                    </Box>
                                ))}
                            </Stack>

                            <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
                                <NeonButton startIcon={<SaveIcon />} onClick={salvar} loading={salvando} disabled={!alterado}>
                                    Salvar formulário
                                </NeonButton>
                            </Box>
                        </GlassCard>
                    </Grid>

                    <Grid item xs={12} md={5}>
                        <Stack spacing={2}>
                            <GlassCard sx={{ p: 2.5 }}>
                                <Typography variant="subtitle1" sx={{ fontWeight: 700, color: cores.textoForte, display: 'flex', gap: 1, alignItems: 'center' }}>
                                    <DocIcon sx={{ color: cores.primaria }} /> Documentos pedidos
                                </Typography>
                                <Typography variant="body2" sx={{ color: cores.textoSecundario, my: 1 }}>
                                    Os documentos de &quot;Todos (padrão)&quot; (ex.: RG/CNH) impedem o envio sem eles; os de cada função são pedidos e podem vir depois.
                                </Typography>
                                <Button size="small" onClick={() => navigate('/config/documentos')}>Configurar documentos</Button>
                            </GlassCard>
                            <GlassCard sx={{ p: 2.5 }}>
                                <Typography variant="subtitle1" sx={{ fontWeight: 700, color: cores.textoForte, display: 'flex', gap: 1, alignItems: 'center' }}>
                                    <EmpresaIcon sx={{ color: cores.primaria }} /> Link de cada empresa
                                </Typography>
                                <Typography variant="body2" sx={{ color: cores.textoSecundario, my: 1 }}>
                                    Cada empresa recebe o próprio link em Empresas → &quot;Gerar convite de cadastro&quot;. Quem se cadastra pelo link fica pendente até um administrador aprovar.
                                </Typography>
                                <Button size="small" onClick={() => navigate('/empresas')}>Ir para Empresas</Button>
                            </GlassCard>
                        </Stack>
                    </Grid>
                </Grid>
            )}
        </Box>
    );
};

export default ConfigCredenciamento;
