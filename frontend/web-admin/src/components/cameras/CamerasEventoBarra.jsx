import React, { useCallback, useEffect, useState } from 'react';
import {
    Box, Stack, Switch, FormControlLabel, Chip, TextField, Tooltip, Typography, CircularProgress, Button,
    FormControl, InputLabel, Select, MenuItem, Collapse
} from '@mui/material';
import {
    Computer as PcIcon,
    Save as SaveIcon,
    Tune as TuneIcon,
    ExpandMore as ExpandMoreIcon,
    ExpandLess as ExpandLessIcon,
    CloudDone as CloudIcon,
    FlashOn as FlashIcon
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import api from '../../services/api';
import { useConfirmacao } from '../../contexts/ConfirmacaoContext';
import SeletorArquiteturaIa from './SeletorArquiteturaIa';

const gb = (bytes) => (bytes == null ? '—' : `${(bytes / 1024 ** 3).toFixed(bytes > 10 * 1024 ** 3 ? 0 : 1)} GB`);

const MENSAGENS_MODO = {
    local: 'Reconhecimento 100% no PC do evento (Super Operação Local).',
    auto: 'Reconhecimento Híbrido no Servidor Central (com reserva no PC do evento).',
    direto_servidor: 'Câmeras configuradas para envio direto ao Servidor Central (Central Remota / Fibra).'
};

/**
 * Chaves gerais das câmeras do evento: motor de IA, gravação, limite de espaço e prazo de guarda,
 * e a situação do PC do evento (vídeo sem IA instalado, espaço usado).
 * Desligar aqui não apaga as escolhas de cada câmera; religar volta como estava.
 */
const CamerasEventoBarra = ({ podeEditar = true }) => {
    const { enqueueSnackbar } = useSnackbar();
    const confirmar = useConfirmacao();
    const [cfg, setCfg] = useState(null);
    const [pc, setPc] = useState(null);
    const [disco, setDisco] = useState(null);
    const [reconhecimento, setReconhecimento] = useState(null);
    const [salvando, setSalvando] = useState(false);
    const [limites, setLimites] = useState({ gravacao_limite_gb: 40, gravacao_retencao_dias: 30 });
    const [mostrarArquitetura, setMostrarArquitetura] = useState(false);

    const carregar = useCallback(async () => {
        try {
            const { data } = await api.get('/cameras/evento-config', { hideDefaultError: true });
            setCfg(data.data);
            setPc(data.pc);
            setLimites({ gravacao_limite_gb: data.data.gravacao_limite_gb, gravacao_retencao_dias: data.data.gravacao_retencao_dias });
        } catch {
            setCfg(null);
        }
        api.get('/gravacoes/status', { hideDefaultError: true, timeout: 12000 })
            .then(({ data }) => setDisco(data.data))
            .catch(() => setDisco(null));
        // Onde o reconhecimento está acontecendo agora (servidor central, reserva ou PC do evento)
        api.get('/cameras/ia-status', { hideDefaultError: true, timeout: 10000 })
            .then(({ data }) => setReconhecimento(data.data?.reconhecimento || null))
            .catch(() => setReconhecimento(null));
    }, []);

    useEffect(() => {
        carregar();
        const t = setInterval(carregar, 30000);
        return () => clearInterval(t);
    }, [carregar]);

    const salvar = async (campos, mensagem) => {
        setSalvando(true);
        try {
            const { data } = await api.put('/cameras/evento-config', campos);
            setCfg(data.data);
            enqueueSnackbar(mensagem || 'Configuração salva.', { variant: 'success' });
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Não foi possível salvar.', { variant: 'error' });
        } finally {
            setSalvando(false);
        }
    };

    const alternarModoArquitetura = (novoModo) => {
        salvar({ ia_onde: novoModo }, MENSAGENS_MODO[novoModo] || 'Modo de arquitetura alterado.');
    };

    const alternarMotor = async (ligar) => {
        if (!ligar && !(await confirmar({
            titulo: 'Desligar o motor de IA',
            mensagem: 'O reconhecimento facial para em todas as câmeras deste evento e o motor é desligado no PC do evento. O vídeo das câmeras, a gravação e os leitores faciais continuam funcionando; leitores com "confirmação da IA" passam a valer só pelo reconhecimento do próprio leitor.',
            textoConfirmar: 'Desligar motor'
        }))) return;
        salvar({ motor_ia_ativo: ligar }, ligar ? 'Motor de IA ligando no PC do evento.' : 'Motor de IA desligado. As câmeras seguem com vídeo.');
    };

    const alternarGravacao = async (ligar) => {
        if (!ligar && !(await confirmar({
            titulo: 'Pausar a gravação',
            mensagem: 'Nenhuma câmera do evento vai gravar até você ligar de novo. O que já foi gravado continua guardado no PC do evento.',
            textoConfirmar: 'Pausar gravação'
        }))) return;
        salvar({ gravacao_ativa: ligar }, ligar ? 'Gravação ligada.' : 'Gravação pausada.');
    };

    if (!cfg) return null;
    const recursos = pc?.recursos || {};
    const limitesMudaram = limites.gravacao_limite_gb !== cfg.gravacao_limite_gb || limites.gravacao_retencao_dias !== cfg.gravacao_retencao_dias;

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Stack direction="row" useFlexGap flexWrap="wrap" spacing={1.5} alignItems="center">
                <FormControlLabel
                    disabled={!podeEditar || salvando}
                    control={<Switch id="evento-motor-ia" checked={cfg.motor_ia_ativo} onChange={(e) => alternarMotor(e.target.checked)} />}
                    label={<Typography fontWeight={700} fontSize="0.875rem">Motor de IA do evento</Typography>}
                />
                <FormControlLabel
                    disabled={!podeEditar || salvando}
                    control={<Switch id="evento-gravacao" checked={cfg.gravacao_ativa} onChange={(e) => alternarGravacao(e.target.checked)} />}
                    label={<Typography fontWeight={700} fontSize="0.875rem">Gravação do evento</Typography>}
                />
                <FormControl size="small" sx={{ minWidth: 290 }} disabled={!podeEditar || salvando || !cfg.motor_ia_ativo}>
                    <InputLabel id="evento-ia-onde-rotulo">Onde roda o reconhecimento</InputLabel>
                    <Select
                        labelId="evento-ia-onde-rotulo"
                        id="evento-ia-onde"
                        label="Onde roda o reconhecimento"
                        value={cfg.ia_onde || 'local'}
                        onChange={(e) => alternarModoArquitetura(e.target.value)}
                    >
                        <MenuItem value="local">🖥️ Servidor no Evento (Local 100% Offline)</MenuItem>
                        <MenuItem value="auto">⚡ Híbrido Inteligente (Notebook + Servidor)</MenuItem>
                        <MenuItem value="direto_servidor">🌐 Central Remota / Fibra (Câmeras no Servidor)</MenuItem>
                    </Select>
                </FormControl>

                <Button
                    size="small"
                    variant={mostrarArquitetura ? 'contained' : 'outlined'}
                    startIcon={<TuneIcon />}
                    endIcon={mostrarArquitetura ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                    onClick={() => setMostrarArquitetura(v => !v)}
                    sx={{
                        fontSize: '0.78rem',
                        textTransform: 'none',
                        fontWeight: 700,
                        height: 38,
                        borderColor: 'rgba(255,255,255,0.18)'
                    }}
                >
                    {mostrarArquitetura ? 'Ocultar Modos de IA' : 'Configurar 3 Modos de Operação'}
                </Button>

                {salvando && <CircularProgress size={16} />}
            </Stack>

            {/* Painel expansível com os 3 cards visuais de arquitetura */}
            <Collapse in={mostrarArquitetura} unmountOnExit>
                <Box sx={{ pt: 1, pb: 0.5 }}>
                    <SeletorArquiteturaIa
                        valor={cfg.ia_onde || 'local'}
                        onChange={alternarModoArquitetura}
                        disabled={!podeEditar || salvando || !cfg.motor_ia_ativo}
                    />
                </Box>
            </Collapse>

            <Stack direction="row" useFlexGap flexWrap="wrap" spacing={1} alignItems="center">
                <Chip size="small" icon={<PcIcon sx={{ fontSize: 15 }} />}
                    label={pc?.conectado ? 'PC do evento conectado' : 'PC do evento desconectado'}
                    color={pc?.conectado ? 'success' : 'error'} variant="outlined" sx={{ fontWeight: 700 }} />
                {pc?.conectado && (
                    <Tooltip title={recursos.video_local ? 'O vídeo das câmeras chega sem passar pelo motor de IA.' : 'Rode ligar-ia-facial.bat no PC do evento para instalar o vídeo sem IA.'}>
                        <Chip size="small" variant="outlined" sx={{ fontWeight: 700 }}
                            color={recursos.video_local ? 'success' : 'warning'}
                            label={recursos.video_local ? 'Vídeo sem IA: pronto' : 'Vídeo sem IA: não instalado'} />
                    </Tooltip>
                )}

                {/* Status específico do modo de arquitetura ativo */}
                {cfg.motor_ia_ativo && cfg.ia_onde === 'local' && (
                    <Tooltip title="O processamento de IA roda diretamente na placa de vídeo do computador local no evento. Não depende de internet.">
                        <Chip size="small" variant="outlined" icon={<PcIcon sx={{ fontSize: 14 }} />}
                            color="success" sx={{ fontWeight: 700 }}
                            label="Modo Local: Reconhecimento 100% no PC do Evento" />
                    </Tooltip>
                )}

                {cfg.motor_ia_ativo && cfg.ia_onde === 'direto_servidor' && (
                    <Tooltip title="As câmeras transmitem os vídeos diretamente via internet fibra até o Servidor de IA Central na sede.">
                        <Chip size="small" variant="outlined" icon={<CloudIcon sx={{ fontSize: 14 }} />}
                            sx={{ fontWeight: 700, borderColor: '#A855F7', color: '#C084FC' }}
                            label="Modo Fibra: Câmeras conectadas ao Servidor Central" />
                    </Tooltip>
                )}

                {pc?.conectado && cfg.ia_onde === 'auto' && cfg.motor_ia_ativo && (
                    <Tooltip title={reconhecimento?.modo !== 'auto'
                        ? 'O PC do evento ainda não recebeu a escolha (agente antigo ou motor reiniciando): rode ligar-ia-facial.bat nele.'
                        : 'O PC do evento acha os rostos e o servidor de IA central diz quem é. Sem resposta do servidor, o PC do evento reconhece sozinho.'}>
                        <Chip size="small" variant="outlined" sx={{ fontWeight: 700 }}
                            icon={<FlashIcon sx={{ fontSize: 14 }} />}
                            color={reconhecimento?.usando_servidor ? 'success' : 'warning'}
                            label={reconhecimento?.usando_servidor ? 'Híbrido: Reconhecendo no Servidor Central'
                                : reconhecimento?.modo === 'auto' ? 'Híbrido: Servidor indisponível (Reserva Local no PC)'
                                    : 'Híbrido: Conectando motor no PC do evento'} />
                    </Tooltip>
                )}

                {pc?.conectado && !recursos.gravacao && (
                    <Chip size="small" variant="outlined" color="warning" sx={{ fontWeight: 700 }} label="Gravação: ffmpeg não instalado" />
                )}
                {disco?.usado_bytes != null && (
                    <Tooltip title={disco.pasta ? `Pasta no PC do evento: ${disco.pasta}` : ''}>
                        <Chip size="small" variant="outlined" sx={{ fontWeight: 700 }}
                            label={`Gravações: ${gb(disco.usado_bytes)} de ${cfg.gravacao_limite_gb} GB · ${gb(disco.livre_bytes)} livres no disco`} />
                    </Tooltip>
                )}
                {disco?.cameras?.filter(c => c.erro).map(c => (
                    <Tooltip key={c.id} title={c.erro}><Chip size="small" color="error" variant="outlined" label="Câmera com falha na gravação" /></Tooltip>
                ))}
            </Stack>

            <Stack direction="row" useFlexGap flexWrap="wrap" spacing={1.5} alignItems="center">
                <TextField id="evento-limite-gb" size="small" type="number" label="Espaço máximo (GB)" sx={{ width: 160 }}
                    disabled={!podeEditar} inputProps={{ min: 2, max: 4000 }}
                    value={limites.gravacao_limite_gb}
                    onChange={(e) => setLimites(l => ({ ...l, gravacao_limite_gb: Number(e.target.value) }))} />
                <TextField id="evento-retencao" size="small" type="number" label="Guardar por (dias)" sx={{ width: 160 }}
                    disabled={!podeEditar} inputProps={{ min: 1, max: 365 }}
                    value={limites.gravacao_retencao_dias}
                    onChange={(e) => setLimites(l => ({ ...l, gravacao_retencao_dias: Number(e.target.value) }))} />
                {limitesMudaram && (
                    <Button size="small" variant="outlined" startIcon={<SaveIcon />} disabled={salvando}
                        onClick={() => salvar(limites, 'Limites de gravação salvos.')}>
                        Salvar limites
                    </Button>
                )}
                <Typography variant="caption" color="text.secondary" sx={{ maxWidth: 420 }}>
                    Passou do espaço ou do prazo: as gravações mais antigas são apagadas primeiro. Avise no local que há gravação de imagens.
                </Typography>
            </Stack>
        </Box>
    );
};

export default CamerasEventoBarra;
