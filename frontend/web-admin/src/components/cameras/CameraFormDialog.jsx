import React, { useEffect, useState } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions, Button, Stack, Grid, TextField,
    FormControl, InputLabel, Select, MenuItem, Switch, FormControlLabel, Typography, Alert, Collapse
} from '@mui/material';
import { Save as SaveIcon, ExpandMore as MaisIcon, ExpandLess as MenosIcon } from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import api from '../../services/api';
import NeonButton from '../common/NeonButton';
import SeletorModo from './SeletorModo';
import { MODOS_IA, MODOS_GRAVACAO, modoIaDe, camposDoModoIa, NOVA_CAMERA, payloadCamera, gbPorDia } from './opcoesCamera';
import { botaoSecundario } from '../../styles/tokens';

const FABRICANTES = ['RTSP / OBS / Webcam', 'Intelbras', 'Hikvision', 'Genérica'];

/**
 * Cadastro/edição de câmera — o MESMO formulário em Configurações › Câmeras e no Monitor
 * (antes eram dois, com campos diferentes).
 */
const CameraFormDialog = ({ open, camera, areas = [], eventoId, onClose, onSalvo }) => {
    const { enqueueSnackbar } = useSnackbar();
    const [cam, setCam] = useState(null);
    const [salvando, setSalvando] = useState(false);
    const [avancado, setAvancado] = useState(false);

    useEffect(() => {
        if (!open) return;
        setCam(camera ? { ...NOVA_CAMERA(), ...camera, senha: '' } : NOVA_CAMERA(areas[0]?.id || ''));
        setAvancado(false);
    }, [open, camera, areas]);

    if (!cam) return null;
    const mudar = (campos) => setCam(c => ({ ...c, ...campos }));
    const desativada = cam.status === 'desativada' || cam.status === 'inativa';

    const salvar = async () => {
        if (!cam.nome?.trim() || !cam.ip_address?.trim()) {
            enqueueSnackbar('Preencha o nome e o endereço IP da câmera.', { variant: 'warning' });
            return;
        }
        setSalvando(true);
        try {
            const payload = payloadCamera(cam, eventoId);
            if (camera?.id) await api.put(`/cameras/${camera.id}`, payload);
            else await api.post('/cameras', payload);
            enqueueSnackbar(camera?.id ? 'Câmera salva.' : 'Câmera cadastrada.', { variant: 'success' });
            onSalvo?.();
            onClose();
        } catch (err) {
            enqueueSnackbar(`Não foi possível salvar a câmera: ${err.response?.data?.error || err.message}`, { variant: 'error' });
        } finally {
            setSalvando(false);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
            <DialogTitle sx={{ fontWeight: 700, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                {camera?.id ? 'Editar câmera' : 'Cadastrar câmera'}
            </DialogTitle>
            <DialogContent sx={{ pt: 2.5 }}>
                <Stack spacing={2.5} sx={{ pt: 1 }}>
                    <TextField id="camera-nome" label="Nome da câmera" fullWidth required
                        placeholder="Ex.: Portão 1 - entrada principal"
                        value={cam.nome || ''} onChange={(e) => mudar({ nome: e.target.value })} />

                    <Grid container spacing={2}>
                        <Grid item xs={12} sm={6}>
                            <FormControl fullWidth>
                                <InputLabel id="camera-fabricante-rotulo">Fabricante / tipo</InputLabel>
                                <Select labelId="camera-fabricante-rotulo" id="camera-fabricante" label="Fabricante / tipo"
                                    value={cam.fabricante || 'RTSP / OBS / Webcam'}
                                    onChange={(e) => {
                                        const fab = e.target.value;
                                        const extra = fab === 'RTSP / OBS / Webcam'
                                            ? { porta: 8554, protocolo: 'rtsp' }
                                            : (fab === 'Intelbras' || fab === 'Hikvision') ? { porta: 554, protocolo: 'rtsp' } : {};
                                        mudar({ fabricante: fab, ...extra });
                                    }}>
                                    {FABRICANTES.map(f => <MenuItem key={f} value={f}>{f}</MenuItem>)}
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <FormControl fullWidth>
                                <InputLabel id="camera-area-rotulo">Área do evento</InputLabel>
                                <Select labelId="camera-area-rotulo" id="camera-area" label="Área do evento"
                                    value={cam.area_id || ''} onChange={(e) => mudar({ area_id: e.target.value })}>
                                    <MenuItem value=""><em>Nenhuma / geral</em></MenuItem>
                                    {areas.map(a => <MenuItem key={a.id} value={a.id}>{a.nome_area || a.nome}</MenuItem>)}
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid item xs={12} sm={8}>
                            <TextField id="camera-ip" label="Endereço IP na rede" fullWidth required placeholder="Ex.: 192.168.1.108"
                                value={cam.ip_address || ''} onChange={(e) => mudar({ ip_address: e.target.value })} />
                        </Grid>
                        <Grid item xs={12} sm={4}>
                            <TextField id="camera-porta" label="Porta RTSP" type="number" fullWidth
                                value={cam.porta || 554} onChange={(e) => mudar({ porta: e.target.value })} />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField id="camera-usuario" label="Usuário da câmera" fullWidth placeholder="Ex.: admin"
                                value={cam.usuario || ''} onChange={(e) => mudar({ usuario: e.target.value })} />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField id="camera-senha" label="Senha da câmera" type="password" fullWidth
                                placeholder={camera?.tem_senha ? 'Deixe vazio para manter a atual' : 'Senha de acesso'}
                                value={cam.senha || ''} onChange={(e) => mudar({ senha: e.target.value })} />
                        </Grid>
                    </Grid>

                    <TextField id="camera-stream" label="Endereço RTSP (opcional)" fullWidth
                        placeholder="rtsp://usuario:senha@ip:554/cam/realmonitor?channel=1&subtype=0"
                        value={cam.stream_url || ''} onChange={(e) => mudar({ stream_url: e.target.value })}
                        helperText="Vazio: o sistema monta o endereço com o IP, a porta e o usuário." />

                    <FormControlLabel
                        control={<Switch id="camera-ativa" checked={!desativada}
                            onChange={(e) => mudar({ status: e.target.checked ? 'offline' : 'desativada' })} />}
                        label="Câmera ativa (desligada: sem vídeo, IA e gravação)" />

                    <SeletorModo id="camera-modo-ia" rotulo="Inteligência" opcoes={MODOS_IA} valor={modoIaDe(cam)}
                        disabled={desativada} onChange={(m) => mudar(camposDoModoIa(m))} />
                    <Typography variant="caption" color="text.secondary" sx={{ mt: -1.5 }}>
                        {MODOS_IA.find(m => m.valor === modoIaDe(cam))?.ajuda}
                    </Typography>

                    <SeletorModo id="camera-modo-gravacao" rotulo="Gravação" opcoes={MODOS_GRAVACAO} valor={cam.gravacao_modo || 'desligada'}
                        disabled={desativada} onChange={(m) => mudar({ gravacao_modo: m })} />
                    <Typography variant="caption" color="text.secondary" sx={{ mt: -1.5 }}>
                        {MODOS_GRAVACAO.find(m => m.valor === (cam.gravacao_modo || 'desligada'))?.ajuda}
                        {' '}O vídeo fica guardado no PC do evento.
                    </Typography>

                    {cam.gravacao_modo === 'continua' && (
                        <Alert severity="info" variant="outlined">
                            Gravação contínua ocupa cerca de {gbPorDia(cam.gravacao_stream)} GB por dia nesta câmera
                            ({cam.gravacao_stream === 'principal' ? 'qualidade máxima' : 'qualidade reduzida'}).
                        </Alert>
                    )}

                    <Button size="small" onClick={() => setAvancado(v => !v)} endIcon={avancado ? <MenosIcon /> : <MaisIcon />}
                        sx={{ alignSelf: 'flex-start', textTransform: 'none', fontWeight: 700 }}>
                        Opções avançadas
                    </Button>
                    <Collapse in={avancado} unmountOnExit>
                        <Stack spacing={2.5}>
                            <Grid container spacing={2}>
                                <Grid item xs={12} sm={6}>
                                    <FormControl fullWidth disabled={cam.gravacao_modo === 'desligada'}>
                                        <InputLabel id="camera-gravacao-stream-rotulo">Qualidade da gravação</InputLabel>
                                        <Select labelId="camera-gravacao-stream-rotulo" id="camera-gravacao-stream" label="Qualidade da gravação"
                                            value={cam.gravacao_stream || 'sub'} onChange={(e) => mudar({ gravacao_stream: e.target.value })}>
                                            <MenuItem value="sub">Reduzida (sub-stream, ~4 GB/dia)</MenuItem>
                                            <MenuItem value="principal">Máxima (stream principal, ~21 GB/dia)</MenuItem>
                                        </Select>
                                    </FormControl>
                                </Grid>
                                <Grid item xs={12} sm={6}>
                                    <FormControl fullWidth disabled={cam.ia_ativa !== true}>
                                        <InputLabel id="camera-prioridade-rotulo">Prioridade da IA</InputLabel>
                                        <Select labelId="camera-prioridade-rotulo" id="camera-prioridade" label="Prioridade da IA"
                                            value={cam.prioridade ?? 1} onChange={(e) => mudar({ prioridade: e.target.value })}>
                                            <MenuItem value={0}>Baixa</MenuItem>
                                            <MenuItem value={1}>Normal</MenuItem>
                                            <MenuItem value={2}>Alta</MenuItem>
                                            <MenuItem value={3}>Crítica (entrada principal)</MenuItem>
                                        </Select>
                                    </FormControl>
                                </Grid>
                            </Grid>
                            <FormControlLabel
                                disabled={cam.gravacao_modo !== 'alertas'}
                                control={<Switch id="camera-gravacao-drive" checked={cam.gravacao_drive === true}
                                    onChange={(e) => mudar({ gravacao_drive: e.target.checked })} />}
                                label="Copiar os trechos de alerta para o Google Drive (prova fora do PC)" />
                            <TextField id="camera-substream" label="Sub-stream (opcional)" fullWidth
                                placeholder="rtsp://usuario:senha@ip:554/cam/realmonitor?channel=1&subtype=1"
                                value={cam.url_substream || ''} onChange={(e) => mudar({ url_substream: e.target.value })}
                                helperText="Vídeo leve usado nas miniaturas, na IA e na gravação reduzida. Vazio: deduzido para Intelbras e Hikvision." />
                        </Stack>
                    </Collapse>
                </Stack>
            </DialogContent>
            <DialogActions sx={{ p: 2.5, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                <Button variant="outlined" onClick={onClose} sx={botaoSecundario}>Cancelar</Button>
                <NeonButton loading={salvando} startIcon={<SaveIcon />} onClick={salvar}>
                    {camera?.id ? 'Salvar alterações' : 'Cadastrar câmera'}
                </NeonButton>
            </DialogActions>
        </Dialog>
    );
};

export default CameraFormDialog;
