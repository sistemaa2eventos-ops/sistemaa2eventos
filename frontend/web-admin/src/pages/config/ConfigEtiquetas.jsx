import React, { useState, useEffect } from 'react';
import { Box, Typography, Grid, TextField, IconButton, Paper, Stack } from '@mui/material';
import { Save as SaveIcon, Add as AddIcon, Delete as DeleteIcon, Style as StyleIcon } from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import { Rnd } from 'react-rnd';
import { useSearchParams } from 'react-router-dom';
import api from '../../services/api';
import GlassCard from '../../components/common/GlassCard';
import NeonButton from '../../components/common/NeonButton';
import PageHeader from '../../components/common/PageHeader';

const ConfigEtiquetas = () => {
    const [searchParams] = useSearchParams();
    const eventoId = searchParams.get('evento_id') || localStorage.getItem('active_evento_id');

    const [config, setConfig] = useState({
        layout: 'zebra_tlp2844',
        width: 100, // em mm
        height: 150 // em mm
    });

    const [elements, setElements] = useState([
        { id: '1', type: 'text', content: '{nome_pessoa}', x: 10, y: 10, width: 200, height: 30, fontSize: 16, fontWeight: 'bold' },
        { id: '2', type: 'text', content: '{empresa}', x: 10, y: 45, width: 200, height: 25, fontSize: 14, fontWeight: 'normal' },
        { id: '3', type: 'qrcode', content: '{qr_code}', x: 50, y: 80, width: 100, height: 100 }
    ]);

    const [selectedId, setSelectedId] = useState(null);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const { enqueueSnackbar } = useSnackbar();

    useEffect(() => {
        if (!eventoId) return;
        const fetchLayout = async () => {
            try {
                setLoading(true);
                const response = await api.get('/config/etiquetas', { params: { evento_id: eventoId } });
                if (response.data.data) {
                    setConfig(response.data.data.papel_config);
                    setElements(response.data.data.elementos);
                }
            } catch (error) {
                console.error('Erro ao buscar layout da etiqueta:', error);
                enqueueSnackbar('Falha ao carregar layout de etiqueta.', { variant: 'error' });
            } finally {
                setLoading(false);
            }
        };
        fetchLayout();
    }, [eventoId]);

    const handleChangeConfig = (field, value) => {
        setConfig(prev => ({ ...prev, [field]: value }));
    };

    const addElement = (type) => {
        const newEl = {
            id: Date.now().toString(),
            type,
            content: type === 'text' ? 'Novo Texto' : '{qr_code}',
            x: 20, y: 20,
            width: type === 'qrcode' ? 80 : 150,
            height: type === 'qrcode' ? 80 : 30,
            fontSize: 14,
            fontWeight: 'normal'
        };
        setElements([...elements, newEl]);
        setSelectedId(newEl.id);
    };

    const updateElement = (id, newProps) => {
        setElements(elements.map(el => el.id === id ? { ...el, ...newProps } : el));
    };

    const deleteElement = (id) => {
        setElements(elements.filter(el => el.id !== id));
        if (selectedId === id) setSelectedId(null);
    };

    // Fator de proporção para exibição em tela (1mm = ~3.78px - simplificando para 3x visualmente)
    const scaleFactor = 3;

    const handleSave = async () => {
        if (!eventoId) {
            enqueueSnackbar('Selecione primeiro um evento ativo no menu superior.', { variant: 'warning' });
            return;
        }

        const payload = {
            evento_id: eventoId,
            papel_config: config,
            elementos: elements
        };

        try {
            setSaving(true);
            await api.post('/config/etiquetas', payload);
            enqueueSnackbar(`Layout salvo com sucesso para ${localStorage.getItem('active_evento_nome') || 'o evento'}!`, { variant: 'success' });
        } catch (error) {
            console.error('Erro ao salvar:', error);
            enqueueSnackbar('Falha ao salvar o layout da etiqueta. ' + (error.response?.data?.details || ''), { variant: 'error' });
        } finally {
            setSaving(false);
        }
    };

    return (
        <Box sx={{ p: { xs: 2, md: 4 } }}>
            <PageHeader
                title="Impressão & Etiquetas"
                subtitle="Configure os drivers de impressão térmica e layout de credenciais."
                breadcrumbs={[{ text: 'Sistema' }, { text: 'Configurações' }, { text: 'Impressão' }]}
            />
            <Grid container spacing={4} sx={{ mt: 1 }}>
                {/* COLUNA ESQUERDA: CONFIGURAÇÕES GERAIS E MENU DE ELEMENTOS */}
                <Grid item xs={12} md={4}>
                    <Stack spacing={3}>
                        <GlassCard sx={{ p: 3 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', mb: 3, gap: 2 }}>
                                <StyleIcon sx={{ color: '#00D4FF' }} />
                                <Typography variant="h6" sx={{ fontWeight: 700, color: '#fff' }}>PARÂMETROS DE PAPEL</Typography>
                            </Box>

                            <Grid container spacing={2}>
                                <Grid item xs={12}>
                                    <TextField
                                        label="Modelo"
                                        fullWidth size="small"
                                        value={config.layout}
                                        onChange={(e) => handleChangeConfig('layout', e.target.value)}
                                        select SelectProps={{ native: true }}
                                    >
                                        <option value="custom">Tamanho Customizado</option>
                                        <option value="zebra_tlp2844">Zebra TLP (100x150mm)</option>
                                        <option value="argox_cracha">Argox Crachá (54x86mm)</option>
                                    </TextField>
                                </Grid>
                                <Grid item xs={6}>
                                    <TextField
                                        label="Largura (mm)" type="number" fullWidth size="small"
                                        value={config.width}
                                        onChange={(e) => handleChangeConfig('width', Number(e.target.value))}
                                    />
                                </Grid>
                                <Grid item xs={6}>
                                    <TextField
                                        label="Altura (mm)" type="number" fullWidth size="small"
                                        value={config.height}
                                        onChange={(e) => handleChangeConfig('height', Number(e.target.value))}
                                    />
                                </Grid>
                            </Grid>
                        </GlassCard>

                        <GlassCard sx={{ p: 3 }}>
                            <Typography variant="subtitle2" sx={{ color: '#00D4FF', fontWeight: 800, mb: 2 }}>ADICIONAR ELEMENTOS</Typography>
                            <Stack direction="row" spacing={2} sx={{ mb: 3 }}>
                                <NeonButton size="small" variant="outlined" startIcon={<AddIcon />} onClick={() => addElement('text')}>TEXTO / VARIÁVEL</NeonButton>
                                <NeonButton size="small" variant="outlined" startIcon={<AddIcon />} color="secondary" onClick={() => addElement('qrcode')}>QR CODE</NeonButton>
                            </Stack>

                            {/* PAINEL DO ELEMENTO SELECIONADO */}
                            <Typography variant="subtitle2" sx={{ color: 'text.secondary', fontWeight: 700, mb: 1 }}>PROPRIEDADES DA SELEÇÃO</Typography>

                            {selectedId ? (
                                <Box sx={{ p: 2, background: 'rgba(255,255,255,0.05)', borderRadius: 2 }}>
                                    {elements.filter(el => el.id === selectedId).map(el => (
                                        <Grid container spacing={2} key={el.id}>
                                            <Grid item xs={12}>
                                                <TextField
                                                    label="Conteúdo (Ex: {nome_pessoa})"
                                                    fullWidth size="small" value={el.content}
                                                    onChange={e => updateElement(el.id, { content: e.target.value })}
                                                />
                                            </Grid>
                                            {el.type === 'text' && (
                                                <Grid item xs={6}>
                                                    <TextField
                                                        label="Tamanho Fonte" type="number"
                                                        fullWidth size="small" value={el.fontSize}
                                                        onChange={e => updateElement(el.id, { fontSize: Number(e.target.value) })}
                                                    />
                                                </Grid>
                                            )}
                                            {el.type === 'text' && (
                                                <Grid item xs={6}>
                                                    <TextField
                                                        label="Peso Fonte" select SelectProps={{ native: true }}
                                                        fullWidth size="small" value={el.fontWeight}
                                                        onChange={e => updateElement(el.id, { fontWeight: e.target.value })}
                                                    >
                                                        <option value="normal">Normal</option>
                                                        <option value="bold">Negrito</option>
                                                    </TextField>
                                                </Grid>
                                            )}
                                            <Grid item xs={12} sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
                                                <IconButton color="error" size="small" onClick={() => deleteElement(el.id)}>
                                                    <DeleteIcon />
                                                </IconButton>
                                            </Grid>
                                        </Grid>
                                    ))}
                                </Box>
                            ) : (
                                <Typography variant="caption" sx={{ opacity: 0.5 }}>Clique em um elemento no canvas para editar.</Typography>
                            )}

                            <Box sx={{ mt: 4, display: 'flex', justifyContent: 'center' }}>
                                <NeonButton startIcon={<SaveIcon />} fullWidth onClick={handleSave} loading={saving}>
                                    SALVAR LAYOUT DO EVENTO
                                </NeonButton>
                            </Box>
                        </GlassCard>
                    </Stack>
                </Grid>

                {/* COLUNA DIREITA: CANVAS EDITOR */}
                <Grid item xs={12} md={8}>
                    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '600px', p: 4, background: 'rgba(0,0,0,0.5)', borderRadius: 4, border: '1px dashed rgba(255,255,255,0.2)', overflow: 'auto' }}>

                        <Paper elevation={10} sx={{
                            width: config.width * scaleFactor,
                            height: config.height * scaleFactor,
                            backgroundColor: '#fff',
                            position: 'relative',
                            overflow: 'hidden'
                        }}>
                            {elements.map(el => (
                                <Rnd
                                    key={el.id}
                                    size={{ width: el.width, height: el.height }}
                                    position={{ x: el.x, y: el.y }}
                                    onDragStop={(e, d) => updateElement(el.id, { x: d.x, y: d.y })}
                                    onResizeStop={(e, direction, ref, delta, position) => {
                                        updateElement(el.id, {
                                            width: parseInt(ref.style.width, 10),
                                            height: parseInt(ref.style.height, 10),
                                            ...position
                                        });
                                    }}
                                    bounds="parent"
                                    onClick={() => setSelectedId(el.id)}
                                    style={{
                                        border: selectedId === el.id ? '2px dashed #00D4FF' : '1px dashed transparent',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        overflow: 'hidden',
                                        backgroundColor: el.type === 'qrcode' ? 'rgba(0,0,0,0.1)' : 'transparent',
                                        color: '#000',
                                        cursor: 'move',
                                        fontWeight: el.fontWeight || 'normal',
                                        fontSize: el.fontSize || 14
                                    }}
                                >
                                    {el.type === 'text' && (
                                        <Typography variant="body1" sx={{ width: '100%', height: '100%', fontSize: 'inherit', fontWeight: 'inherit', wordWrap: 'break-word', p: 0.5 }}>
                                            {el.content}
                                        </Typography>
                                    )}
                                    {el.type === 'qrcode' && (
                                        <Box sx={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                                            <span style={{ fontSize: 10, opacity: 0.5 }}>QR</span>
                                            <Typography variant="caption" sx={{ fontSize: 8 }}>{el.content}</Typography>
                                        </Box>
                                    )}
                                </Rnd>
                            ))}
                        </Paper>

                    </Box>
                </Grid>
            </Grid>
        </Box>
    );
};

export default ConfigEtiquetas;
