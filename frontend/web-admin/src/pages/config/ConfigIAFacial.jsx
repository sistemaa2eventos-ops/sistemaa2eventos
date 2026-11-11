import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
    Box, Typography, Grid, Slider, Switch, FormControlLabel, CircularProgress, Stack, Chip, Alert,
    MenuItem, Select, TextField, Table, TableHead, TableRow, TableCell, TableBody, TableContainer,
    Tooltip, IconButton, Collapse, Button, Dialog, DialogTitle, DialogContent, DialogActions, Divider
} from '@mui/material';
import {
    Save as SaveIcon, Memory as GpuIcon, Speed as SpeedIcon, Tune as TuneIcon,
    Videocam as CameraIcon, Refresh as RefreshIcon, RestartAlt as RestaurarIcon,
    ExpandMore as ExpandIcon, ExpandLess as CollapseIcon, PlayArrow as PlayIcon,
    CheckCircle as CheckIcon, WarningAmber as WarnIcon, ErrorOutline as ErrorIcon,
    Download as DownloadIcon, Computer as PcIcon, AutoFixHigh as RecommendIcon
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import api from '../../services/api';
import PageHeader from '../../components/common/PageHeader';
import GlassCard from '../../components/common/GlassCard';
import NeonButton from '../../components/common/NeonButton';
import { carregarIaConfig, definirIaConfig, useIaConfig, useIaStatus, statusDaCamera, NOMES_PERFIL } from '../../hooks/useIaConfig';
import { MODOS_IA, modoIaDe, camposDoModoIa } from '../../components/cameras/opcoesCamera';

// Mesma tabela do motor (backend/microservice-face-python/src/main.py → PERFIS e COMUNS)
const PERFIS_IA = {
    leve: { ia_fps_total: 15, ia_fps_foco: 6, ia_fps_mini: 3, ia_fps_vigilancia: 2, ia_stream: 'sub', limiar: 0.50, margem: 0.06, confirmacoes: 2 },
    equilibrado: { ia_fps_total: 30, ia_fps_foco: 10, ia_fps_mini: 4, ia_fps_vigilancia: 3, ia_stream: 'auto', limiar: 0.48, margem: 0.06, confirmacoes: 2 },
    maximo: { ia_fps_total: 45, ia_fps_foco: 15, ia_fps_mini: 6, ia_fps_vigilancia: 5, ia_stream: 'principal', limiar: 0.46, margem: 0.05, confirmacoes: 2 }
};
const COMUNS_IA = { min_face_px: 36, min_nitidez: 25, max_yaw: 45, reconhecer_s: 1, movimento: true, aprender: true };
const DESCRICAO_PERFIL = {
    leve: 'Para computador modesto ou internet fraca: menos análises por segundo e vídeo mais leve.',
    equilibrado: 'Recomendado. Boa precisão sem pesar: IA no stream principal só quando alguém olha a câmera em tela grande.',
    maximo: 'Para placa de vídeo forte e boa internet: mais análises, vídeo mais nítido e IA sempre no stream principal.'
};
const NOMES_STREAM = { sub: 'Sempre o sub-stream (leve)', auto: 'Automático', principal: 'Sempre o stream principal (nítido)' };

const Campo = ({ titulo, ajuda, children }) => (
    <Box sx={{ mb: 2.5 }}>
        <Typography variant="body2" fontWeight={700}>{titulo}</Typography>
        {ajuda && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>{ajuda}</Typography>}
        {children}
    </Box>
);

/** Extrai o modelo limpo da placa de vídeo via WebGL no computador do operador */
function detectarGpuWebGL() {
    try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (!gl) return { nome: 'Não identificada pelo navegador', bruto: '', categoria: 'integrada' };
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const bruto = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '') : String(gl.getParameter(gl.RENDERER) || '');
        // Extrai de "ANGLE (NVIDIA, NVIDIA GeForce MX110 (0x...), Direct3D11...)"
        let limpo = bruto;
        const mAngle = bruto.match(/ANGLE\s*\([^,]+,\s*([^,(]+(?:\([^)]*?(?:TM|R)\))?[^,(]*)/i);
        if (mAngle?.[1]) limpo = mAngle[1].trim();
        limpo = limpo.replace(/\s+Direct3D.*$/i, '').replace(/\s+vs_\d+.*$/i, '').trim() || bruto || 'GPU Padrão';

        let categoria = 'integrada';
        if (/RTX|GTX\s*1[0678]|GTX\s*[2345]|Radeon\s*RX/i.test(bruto)) categoria = 'forte';
        else if (/GeForce\s*MX|GTX|Quadro|Radeon\s*(Pro|R[579]|HD)/i.test(bruto)) categoria = 'entrada';
        else if (/SwiftShader|Basic Render|llvmpipe|Software/i.test(bruto)) categoria = 'cpu';
        return { nome: limpo, bruto, categoria };
    } catch {
        return { nome: 'Placa de vídeo padrão', bruto: '', categoria: 'integrada' };
    }
}

/** Inspeciona compatibilidade de hardware/software do PC local e calcula recomendações antes de iniciar */
async function diagnosticarComputadorLocal(perfisServidor) {
    const ua = navigator.userAgent || '';
    const isWindows = /Windows/i.test(ua) || /Win/i.test(navigator.platform || '');
    const is64 = /Win64|x64|WOW64|amd64/i.test(ua) || isWindows;
    const osNome = isWindows ? `Windows ${is64 ? '64-bit' : '32-bit'}` : (navigator.platform || 'Outro Sistema');
    const cpuThreads = Number(navigator.hardwareConcurrency) || 4;
    const ramGb = Number(navigator.deviceMemory) || null;
    const gpu = detectarGpuWebGL();
    const downlinkMbps = navigator.connection?.downlink || null;

    // Medir latência até o servidor e consultar motor local (http://127.0.0.1:8000) se já estiver aberto neste PC
    const t0 = performance.now();
    const [, motorLocalRes] = await Promise.allSettled([
        api.get('/cameras/ia-config', { hideDefaultError: true, timeout: 5000 }),
        fetch('http://127.0.0.1:8000/api/pc-compatibilidade', { signal: AbortSignal.timeout(2500) }).then(r => r.ok ? r.json() : null)
    ]);
    const latenciaMs = Math.round(performance.now() - t0);
    const motorLocal = motorLocalRes.status === 'fulfilled' ? motorLocalRes.value : null;

    // Classificação e cálculo das recomendações de configuração para este PC
    let perfilRecomendado = 'leve';
    let fpsTotalRecomendado = 15;
    let streamRecomendado = 'sub';
    let maxStreamsAoVivo = 6;
    let limiarRecomendado = 0.50;
    let resumoMotivo = '';

    if (gpu.categoria === 'forte' && cpuThreads >= 8 && (!ramGb || ramGb >= 8)) {
        perfilRecomendado = 'maximo';
        fpsTotalRecomendado = 45;
        streamRecomendado = 'principal';
        maxStreamsAoVivo = 16;
        limiarRecomendado = 0.46;
        resumoMotivo = `Placa de vídeo dedicada forte (${gpu.nome}) e processador com ${cpuThreads} threads detectados. Este computador suporta máxima nitidez e até 45 análises/s.`;
    } else if ((gpu.categoria === 'forte' || gpu.categoria === 'entrada') && cpuThreads >= 6 && (!ramGb || ramGb >= 8)) {
        perfilRecomendado = 'equilibrado';
        fpsTotalRecomendado = 30;
        streamRecomendado = 'auto';
        maxStreamsAoVivo = 9;
        limiarRecomendado = 0.48;
        resumoMotivo = `Boa combinação de placa de vídeo (${gpu.nome}) e ${cpuThreads} threads. O perfil Equilibrado usa o sub-stream no mosaico e o stream principal apenas na câmera em foco.`;
    } else if (gpu.categoria === 'entrada' && cpuThreads <= 4) {
        perfilRecomendado = 'leve';
        fpsTotalRecomendado = 18;
        streamRecomendado = 'sub';
        maxStreamsAoVivo = 6;
        limiarRecomendado = 0.49;
        resumoMotivo = `Notebook/PC com GPU de entrada (${gpu.nome}) e processador de ${cpuThreads} threads. Recomendamos o perfil Leve (com 18 análises/s em sub-stream e até 6 vídeos ao vivo) para manter o reconhecimento rápido via DirectML sem travar o processador.`;
    } else {
        perfilRecomendado = 'leve';
        fpsTotalRecomendado = 15;
        streamRecomendado = 'sub';
        maxStreamsAoVivo = 6;
        limiarRecomendado = 0.50;
        resumoMotivo = gpu.categoria === 'cpu'
            ? `Sem aceleração 3D detectada (${gpu.nome}). Use o perfil Leve para economizar processador.`
            : `Placa gráfica integrada (${gpu.nome}) e ${cpuThreads} threads. O perfil Leve com sub-stream garante estabilidade contínua durante o evento.`;
    }

    const baseVideo = perfisServidor?.[perfilRecomendado]?.video || {
        mini: { fps: 4, max_width: 480, quality: 50 },
        foco: { fps: 10, max_width: 960, quality: 65 }
    };

    const checks = [
        {
            id: 'os',
            titulo: 'Sistema Operacional',
            valor: motorLocal?.os || osNome,
            status: isWindows && is64 ? 'ok' : 'warn',
            detalhe: isWindows ? 'Compatível com o script ligar-ia-facial e aceleração DirectML.' : 'O ativador automático ligar-ia-facial.bat requer Windows 10/11 64-bit.'
        },
        {
            id: 'gpu',
            titulo: 'Placa de Vídeo (GPU)',
            valor: gpu.nome,
            status: gpu.categoria === 'forte' ? 'ok' : (gpu.categoria === 'cpu' ? 'error' : 'warn'),
            detalhe: gpu.categoria === 'forte'
                ? 'GPU dedicada de alto desempenho (compatível com ONNX DirectML).'
                : gpu.categoria === 'entrada'
                    ? 'GPU dedicada de entrada/notebook (compatível com DirectML; evite abrir mais de 6 câmeras em alta definição).'
                    : gpu.categoria === 'integrada'
                        ? 'GPU integrada (compartilha memória RAM do sistema; recomendado usar sub-stream nas câmeras).'
                        : 'Sem aceleração por placa de vídeo detectada (o reconhecimento na CPU é ~10x mais lento).'
        },
        {
            id: 'cpu',
            titulo: 'Processador (CPU) e Memória',
            valor: `${motorLocal?.cpu_threads || cpuThreads} threads lógicos${ramGb ? ` • ~${ramGb} GB RAM` : ''}`,
            status: cpuThreads >= 8 ? 'ok' : (cpuThreads >= 4 ? 'warn' : 'error'),
            detalhe: cpuThreads >= 8
                ? 'Folga excelente para decodificar múltiplos streams RTSP e rodar o agente local.'
                : `Processador de ${cpuThreads} threads: mantenha a decodificação no sub-stream para não atingir 100% de CPU.`
        },
        {
            id: 'rede',
            titulo: 'Rede e Conexão com o Painel',
            valor: `Ping ${latenciaMs} ms${downlinkMbps ? ` • ~${downlinkMbps} Mbps` : ''}`,
            status: latenciaMs < 250 ? 'ok' : 'warn',
            detalhe: latenciaMs < 250
                ? 'Boa resposta com o servidor para envio de alertas e vídeo ao vivo.'
                : 'Latência elevada: reduza o número de vídeos ao vivo simultâneos no mosaico.'
        },
        {
            id: 'motor',
            titulo: 'Motor de IA Local (porta 8000)',
            valor: motorLocal ? `Ativo neste PC (${motorLocal.hardware_acceleration})` : 'Desligado neste PC (pronto para ligar)',
            status: motorLocal ? 'ok' : 'info',
            detalhe: motorLocal
                ? `${motorLocal.registered_faces_indexed ?? 0} rosto(s) indexado(s) • Provedor: ${(motorLocal.active_providers || []).join(', ')}`
                : 'Será iniciado automaticamente na porta 8000 ao clicar em "Ligar IA Facial neste PC".'
        }
    ];

    const recomendacoesLista = [
        { rotulo: 'Perfil recomendado', valor: NOMES_PERFIL[perfilRecomendado] || perfilRecomendado },
        { rotulo: 'Teto de análises da IA', valor: `${fpsTotalRecomendado} análises/s (somando todas as câmeras)` },
        { rotulo: 'Vídeo analisado pela IA', valor: NOMES_STREAM[streamRecomendado] },
        { rotulo: 'Limite de vídeos ao vivo no CFTV', valor: `Até ${maxStreamsAoVivo} câmeras simultâneas` },
        { rotulo: 'Exigência de semelhança (limiar)', valor: `${limiarRecomendado.toFixed(2)} (2 confirmações seguidas)` },
        { rotulo: 'Aceleração gráfica', valor: gpu.categoria === 'cpu' ? 'CPU (instale driver de vídeo para DirectML)' : `DirectML (${gpu.nome})` }
    ];

    return {
        isWindows,
        osNome,
        cpuThreads,
        ramGb,
        gpu,
        latenciaMs,
        motorLocal,
        checks,
        recomendacao: {
            perfil: perfilRecomendado,
            resumoMotivo,
            itens: recomendacoesLista,
            configPayload: {
                perfil: perfilRecomendado,
                ajustes: {
                    ia_fps_total: fpsTotalRecomendado,
                    ia_stream: streamRecomendado,
                    limiar: limiarRecomendado,
                    confirmacoes: 2,
                    movimento: true,
                    aprender: true
                },
                video: JSON.parse(JSON.stringify(baseVideo)),
                painel: {
                    max_streams_ao_vivo: maxStreamsAoVivo,
                    som_alerta: true,
                    alerta_repetir_s: 30,
                    rastreamento_expira_min: 120
                }
            }
        }
    };
}

// embutido: aparece como aba de Câmeras (sem cabeçalho e margem próprios)
const ConfigIAFacial = ({ embutido = false }) => {
    const { enqueueSnackbar } = useSnackbar();
    const [cfg, setCfg] = useState(null);
    const [saving, setSaving] = useState(false);
    const [avancado, setAvancado] = useState(false);
    const [cameras, setCameras] = useState([]);
    const [salvandoCam, setSalvandoCam] = useState(null);
    const { status, erro: erroStatus, recarregar: recarregarStatus } = useIaStatus(true, 10000);
    const { perfis: perfisServidor } = useIaConfig(); // vídeo e painel de cada perfil
    const eventoId = localStorage.getItem('active_evento_id');

    // Modal de verificação de compatibilidade + recomendações + ativação da IA neste PC
    const [modalDiagAberto, setModalDiagAberto] = useState(false);
    const [diagnosticando, setDiagnosticando] = useState(false);
    const [diagnostico, setDiagnostico] = useState(null);
    const [aplicarRecAoLigar, setAplicarRecAoLigar] = useState(true);
    const [nomePc, setNomePc] = useState(() => localStorage.getItem('nzt_nome_pc_ia') || 'PC IA Facial do Evento');
    const [ligandoIa, setLigandoIa] = useState(false);
    const [dadosAtivacao, setDadosAtivacao] = useState(null);
    const [etapaAtivacao, setEtapaAtivacao] = useState('');
    const pollTimerRef = useRef(null);

    useEffect(() => () => {
        if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    }, []);

    const executarDiagnostico = useCallback(async () => {
        setDiagnosticando(true);
        try {
            const res = await diagnosticarComputadorLocal(perfisServidor);
            setDiagnostico(res);
        } finally {
            setDiagnosticando(false);
        }
    }, [perfisServidor]);

    const abrirModalVerificarELigar = () => {
        setDadosAtivacao(null);
        setEtapaAtivacao('');
        setModalDiagAberto(true);
        executarDiagnostico();
    };

    const fecharModalDiag = () => {
        if (pollTimerRef.current) {
            clearInterval(pollTimerRef.current);
            pollTimerRef.current = null;
        }
        setLigandoIa(false);
        setModalDiagAberto(false);
    };

    const aplicarSomenteRecomendacoes = async () => {
        if (!diagnostico?.recomendacao?.configPayload) return;
        setSaving(true);
        try {
            const payload = {
                ...cfg,
                ...diagnostico.recomendacao.configPayload,
                painel: { ...cfg?.painel, ...diagnostico.recomendacao.configPayload.painel }
            };
            const { data } = await api.put('/cameras/ia-config', payload);
            setCfg(JSON.parse(JSON.stringify(data.data)));
            definirIaConfig(data.data);
            enqueueSnackbar(`Recomendações aplicadas (Perfil ${NOMES_PERFIL[data.data.perfil] || data.data.perfil}).`, { variant: 'success' });
        } catch (e) {
            enqueueSnackbar(e.response?.data?.error || 'Erro ao aplicar recomendações', { variant: 'error' });
        } finally {
            setSaving(false);
        }
    };

    const baixarAtivadorBat = (dados) => {
        const info = dados || dadosAtivacao;
        const vpsUrl = info?.vps_url || (import.meta.env.VITE_API_URL || window.location.origin).replace(/\/api\/?$/, '');
        const token = info?.token || '';
        const agentName = info?.agent_name || nomePc || 'PC IA Facial';
        const linhas = [
            '@echo off',
            'chcp 65001 >nul',
            'title NZT - Ativador da IA Facial neste PC',
            'echo ==========================================================',
            'echo   NZT Intelligent Control System - Ativador da IA Facial',
            'echo ==========================================================',
            'set "PROJETO_DIR=%~dp0"',
            'if not exist "%PROJETO_DIR%scripts\\ligar-ia-facial.ps1" (',
            '  if exist "C:\\Users\\%USERNAME%\\Desktop\\Projeto_A2_Eventos\\scripts\\ligar-ia-facial.ps1" set "PROJETO_DIR=C:\\Users\\%USERNAME%\\Desktop\\Projeto_A2_Eventos\\"',
            ')',
            'if exist "%PROJETO_DIR%scripts\\ligar-ia-facial.ps1" (',
            `  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%PROJETO_DIR%scripts\\ligar-ia-facial.ps1" -Acao ligar ${token ? `-Token "${token}"` : ''} -VpsUrl "${vpsUrl}" -AgentName "${agentName}"`,
            ') else (',
            '  echo Coloque este arquivo na pasta raiz do Projeto_A2_Eventos e execute novamente.',
            '  pause',
            ')'
        ];
        const blob = new Blob([linhas.join('\r\n')], { type: 'application/bat;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'ligar-ia-neste-pc.bat';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    };

    const confirmarELigarIaNestePc = async () => {
        if (!eventoId) {
            enqueueSnackbar('Selecione um evento ativo no menu lateral antes de ligar a IA facial.', { variant: 'warning' });
            return;
        }
        setLigandoIa(true);
        setEtapaAtivacao('Aplicando recomendações e preparando conexão do evento...');
        localStorage.setItem('nzt_nome_pc_ia', nomePc || 'PC IA Facial do Evento');

        try {
            const configParaSalvar = aplicarRecAoLigar && diagnostico?.recomendacao?.configPayload
                ? {
                    ...cfg,
                    ...diagnostico.recomendacao.configPayload,
                    painel: { ...cfg?.painel, ...diagnostico.recomendacao.configPayload.painel }
                }
                : undefined;

            const { data: resp } = await api.post('/cameras/ia-iniciar', {
                evento_id: eventoId,
                nome_pc: nomePc || 'PC IA Facial do Evento',
                config: configParaSalvar
            });

            const info = resp?.data || {};
            setDadosAtivacao(info);
            if (info.config) {
                setCfg(JSON.parse(JSON.stringify(info.config)));
                definirIaConfig(info.config);
            }

            // Se o agente já estava conectado para este evento e subiu o motor
            if (info.agente_conectado) {
                setEtapaAtivacao('Agente local já conectado! Verificando inicialização do motor de IA...');
            } else {
                // O motor não aceita mais troca de token pelo navegador (qualquer site podia fazê-lo):
                // a ativação no PC passa pelo protocolo nzt-ia://, que o Windows confirma
                if (!info.iniciado_localmente && info.protocolo_url) {
                    setEtapaAtivacao('Solicitando ao Windows a abertura do "ligar-ia-facial" neste computador...');
                    const link = document.createElement('a');
                    link.href = info.protocolo_url;
                    link.style.display = 'none';
                    document.body.appendChild(link);
                    link.click();
                    link.remove();
                } else {
                    setEtapaAtivacao('Iniciando Motor de IA Facial (porta 8000) e Agente Local neste PC...');
                }
            }

            // Monitora a cada 3 s se o motor local (127.0.0.1:8000) e o status do evento conectaram
            if (pollTimerRef.current) clearInterval(pollTimerRef.current);
            let tentativas = 0;
            pollTimerRef.current = setInterval(async () => {
                tentativas += 1;
                const [stPainel, stLocal] = await Promise.allSettled([
                    api.get('/cameras/ia-status', { hideDefaultError: true, timeout: 4000 }),
                    fetch('http://127.0.0.1:8000/api/pc-compatibilidade', { signal: AbortSignal.timeout(2000) }).then(r => r.ok ? r.json() : null)
                ]);
                if (stLocal.status === 'fulfilled' && stLocal.value) {
                    setDiagnostico(d => d ? { ...d, motorLocal: stLocal.value } : d);
                }
                if (stPainel.status === 'fulfilled' && stPainel.value?.data?.data) {
                    clearInterval(pollTimerRef.current);
                    pollTimerRef.current = null;
                    setLigandoIa(false);
                    setEtapaAtivacao('CONECTADO');
                    recarregarStatus?.();
                    executarDiagnostico();
                    enqueueSnackbar('IA Facial e Agente Local conectados com sucesso neste computador!', { variant: 'success' });
                    return;
                }
                if (tentativas >= 30) {
                    clearInterval(pollTimerRef.current);
                    pollTimerRef.current = null;
                    setLigandoIa(false);
                    setEtapaAtivacao('AGUARDANDO_BAT');
                }
            }, 3000);
        } catch (e) {
            setLigandoIa(false);
            setEtapaAtivacao('');
            enqueueSnackbar(e.response?.data?.error || 'Erro ao iniciar a IA facial neste PC', { variant: 'error' });
        }
    };

    useEffect(() => {
        carregarIaConfig(true).then(c => setCfg(JSON.parse(JSON.stringify(c))));
    }, []);

    const carregarCameras = useCallback(async () => {
        if (!eventoId) return;
        try {
            const { data } = await api.get('/cameras', { params: { evento_id: eventoId }, hideDefaultError: true });
            setCameras(data.data || []);
        } catch {
            setCameras([]);
        }
    }, [eventoId]);
    useEffect(() => { carregarCameras(); }, [carregarCameras]);

    // Valor efetivo de um ajuste da IA: o que foi mudado aqui, senão o padrão do perfil
    const padraoIa = useMemo(() => ({ ...COMUNS_IA, ...PERFIS_IA[cfg?.perfil || 'equilibrado'] }), [cfg?.perfil]);
    const ia = (k) => (cfg?.ajustes?.[k] ?? padraoIa[k]);
    const setIa = (k, v) => setCfg(c => ({ ...c, ajustes: { ...c.ajustes, [k]: v } }));
    const setVideo = (q, k, v) => setCfg(c => ({ ...c, video: { ...c.video, [q]: { ...c.video[q], [k]: v } } }));
    const setPainel = (k, v) => setCfg(c => ({ ...c, painel: { ...c.painel, [k]: v } }));

    const escolherPerfil = (perfil) => {
        // Trocar de perfil volta vídeo e IA aos valores dele (os ajustes finos eram do perfil anterior)
        const base = perfisServidor?.[perfil];
        setCfg(c => ({
            ...c,
            perfil,
            ajustes: {},
            video: base?.video ? JSON.parse(JSON.stringify(base.video)) : c.video,
            painel: { ...c.painel, max_streams_ao_vivo: base?.painel?.max_streams_ao_vivo ?? c.painel?.max_streams_ao_vivo }
        }));
    };

    const salvar = async () => {
        setSaving(true);
        try {
            const { data } = await api.put('/cameras/ia-config', cfg);
            setCfg(JSON.parse(JSON.stringify(data.data)));
            definirIaConfig(data.data);
            enqueueSnackbar('Configuração da IA salva e enviada ao computador do evento.', { variant: 'success' });
        } catch (e) {
            enqueueSnackbar(e.response?.data?.error || 'Erro ao salvar a configuração da IA', { variant: 'error' });
        } finally {
            setSaving(false);
        }
    };

    const video = cfg?.video || { mini: {}, foco: {} };

    const salvarCamera = async (cam, campos) => {
        setSalvandoCam(cam.id);
        setCameras(lista => lista.map(c => (c.id === cam.id ? { ...c, ...campos } : c)));
        try {
            await api.put(`/cameras/${cam.id}`, campos);
        } catch (e) {
            enqueueSnackbar(e.response?.data?.error || 'Erro ao salvar a câmera', { variant: 'error' });
            carregarCameras();
        } finally {
            setSalvandoCam(null);
        }
    };

    if (!cfg) {
        return <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50dvh' }}><CircularProgress /></Box>;
    }

    const avisos = [];
    if (erroStatus) avisos.push({ sev: 'error', txt: `${erroStatus}. Confira se o "ligar-ia-facial" está rodando no computador do evento.`, acaoLigar: true });
    if (status?.hardware_acceleration === 'CPU') avisos.push({ sev: 'warning', txt: 'A IA está rodando sem placa de vídeo (CPU): o reconhecimento fica bem mais lento. Prefira o perfil Leve ou instale o pacote de GPU.' });
    if (status && !status.registered_faces_indexed) avisos.push({ sev: 'warning', txt: 'Nenhum rosto cadastrado na base da IA. Confira se as pessoas têm foto e se a chave do Supabase está no computador do evento.' });
    if (status?.ia?.ocupacao > 0.9) avisos.push({ sev: 'info', txt: 'A IA está usando quase todo o orçamento de análises. Se notar atraso nos quadrados, reduza as análises por segundo ou use o perfil Leve.' });
    const semVideo = (status?.cameras || []).filter(c => c.camera_id && !c.conectada);
    if (semVideo.length) avisos.push({ sev: 'warning', txt: `Sem vídeo: ${semVideo.map(c => c.nome || c.camera).join(', ')}.` });

    return (
        <Box sx={embutido ? undefined : { p: { xs: 2, md: 4 } }}>
            {!embutido && (
                <PageHeader
                    title="IA facial e câmeras"
                    subtitle="Equilíbrio entre precisão do reconhecimento, fluidez do vídeo e peso no computador do evento."
                    breadcrumbs={[{ text: 'Sistema' }, { text: 'Configurações' }, { text: 'IA facial e câmeras' }]}
                />
            )}

            {avisos.map((a, i) => (
                <Alert
                    key={i}
                    severity={a.sev}
                    sx={{ mt: 2, alignItems: 'center' }}
                    action={a.acaoLigar ? (
                        <Button
                            color="inherit"
                            size="small"
                            variant="outlined"
                            startIcon={<PlayIcon />}
                            onClick={abrirModalVerificarELigar}
                            sx={{ fontWeight: 700, whiteSpace: 'nowrap', borderColor: 'rgba(255,255,255,0.4)' }}
                        >
                            Verificar compatibilidade e ligar IA neste PC
                        </Button>
                    ) : undefined}
                >
                    {a.txt}
                </Alert>
            ))}

            <Grid container spacing={3} sx={{ mt: 0.5 }}>
                {/* STATUS DO MOTOR */}
                <Grid item xs={12}>
                    <GlassCard sx={{ p: 2.5 }}>
                        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} spacing={1.5} sx={{ mb: status ? 1.5 : 0 }}>
                            <Stack direction="row" spacing={1} alignItems="center">
                                <GpuIcon color="primary" />
                                <Typography variant="h6" fontWeight={700}>Motor de IA do evento</Typography>
                            </Stack>
                            <NeonButton size="small" startIcon={<PlayIcon />} onClick={abrirModalVerificarELigar}>
                                {status ? 'Diagnosticar PC / Reiniciar IA local' : 'Verificar compatibilidade e ligar IA neste PC'}
                            </NeonButton>
                        </Stack>
                        {status ? (
                            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                <Chip label={status.hardware_acceleration} color={status.hardware_acceleration === 'CPU' ? 'warning' : 'success'} size="small" />
                                <Chip label={`Perfil em uso: ${NOMES_PERFIL[status.config?.perfil] || status.config?.perfil}`} size="small" />
                                <Chip label={`${status.ia?.ms_por_analise ?? 0} ms por análise`} size="small" />
                                <Chip label={`Ocupação ${Math.round((status.ia?.ocupacao || 0) * 100)}%`} size="small" />
                                <Chip label={`${status.registered_faces_indexed} pessoa(s) na base`} size="small" />
                                <Chip label={`${status.vetores_aprendidos || 0} vetor(es) aprendido(s) no CFTV`} size="small" />
                                <Chip label={`${(status.cameras || []).filter(c => c.conectada).length} câmera(s) com vídeo`} size="small" />
                            </Stack>
                        ) : !erroStatus && <CircularProgress size={20} />}
                    </GlassCard>
                </Grid>

                {/* PERFIL */}
                <Grid item xs={12}>
                    <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>Perfil</Typography>
                    <Grid container spacing={2}>
                        {Object.keys(PERFIS_IA).map(p => (
                            <Grid item xs={12} md={4} key={p}>
                                <GlassCard
                                    onClick={() => escolherPerfil(p)}
                                    sx={{
                                        p: 2.5, cursor: 'pointer', height: '100%',
                                        border: cfg.perfil === p ? '2px solid #00D4FF' : '1px solid rgba(255,255,255,0.08)'
                                    }}
                                >
                                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                                        <Typography variant="h6" fontWeight={700}>{NOMES_PERFIL[p]}</Typography>
                                        {cfg.perfil === p && <Chip label="Selecionado" color="primary" size="small" />}
                                    </Stack>
                                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{DESCRICAO_PERFIL[p]}</Typography>
                                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                                        IA: até {PERFIS_IA[p].ia_fps_total} análises/s no total • sensibilidade {PERFIS_IA[p].limiar}
                                    </Typography>
                                </GlassCard>
                            </Grid>
                        ))}
                    </Grid>
                </Grid>

                {/* RECONHECIMENTO */}
                <Grid item xs={12} md={6}>
                    <GlassCard sx={{ p: 3, height: '100%' }}>
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
                            <TuneIcon color="primary" />
                            <Typography variant="h6" fontWeight={700}>Reconhecimento</Typography>
                        </Stack>
                        <Campo
                            titulo={`Exigência para reconhecer: ${Number(ia('limiar')).toFixed(2)}`}
                            ajuda="Mais alto: menos chance de confundir pessoas, mas reconhece menos de longe. Mais baixo: reconhece mais, com mais risco de engano."
                        >
                            <Slider value={Number(ia('limiar'))} min={0.35} max={0.65} step={0.01} onChange={(_, v) => setIa('limiar', v)}
                                marks={[{ value: 0.4, label: 'Tolerante' }, { value: 0.48, label: 'Padrão' }, { value: 0.6, label: 'Rigoroso' }]} />
                        </Campo>
                        <Campo titulo="Confirmações antes de alertar" ajuda="Quantas leituras seguidas do mesmo rosto (de 3) precisam concordar. 2 evita alertas falsos de um quadro só.">
                            <Select size="small" value={ia('confirmacoes')} onChange={e => setIa('confirmacoes', e.target.value)}>
                                <MenuItem value={1}>1 (mais rápido)</MenuItem>
                                <MenuItem value={2}>2 de 3 (recomendado)</MenuItem>
                                <MenuItem value={3}>3 de 3 (mais seguro)</MenuItem>
                            </Select>
                        </Campo>
                        <Campo titulo={`Tamanho mínimo do rosto: ${ia('min_face_px')} px`} ajuda="Rostos menores que isso aparecem como 'distante' e não são comparados (evita erro com pessoas longe da câmera).">
                            <Slider value={Number(ia('min_face_px'))} min={20} max={120} step={2} onChange={(_, v) => setIa('min_face_px', v)} />
                        </Campo>
                        <FormControlLabel
                            control={<Switch checked={!!ia('aprender')} onChange={e => setIa('aprender', e.target.checked)} />}
                            label="Aprender o rosto pelas câmeras (melhora o acerto com a iluminação e o ângulo do local)"
                        />
                    </GlassCard>
                </Grid>

                {/* VÍDEO E ALERTAS */}
                <Grid item xs={12} md={6}>
                    <GlassCard sx={{ p: 3, height: '100%' }}>
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
                            <CameraIcon color="primary" />
                            <Typography variant="h6" fontWeight={700}>Vídeo e alertas</Typography>
                        </Stack>
                        <Campo
                            titulo={`Vídeos ao vivo ao mesmo tempo: ${cfg.painel?.max_streams_ao_vivo ?? 'padrão do perfil'}`}
                            ajuda="Acima disso, as câmeras do mosaico mostram uma imagem a cada 5 s. Cada vídeo usa a internet do evento."
                        >
                            <Slider value={cfg.painel?.max_streams_ao_vivo ?? 9} min={1} max={16} step={1} marks
                                onChange={(_, v) => setPainel('max_streams_ao_vivo', v)} />
                        </Campo>
                        {['mini', 'foco'].map(q => (
                            <Campo key={q} titulo={q === 'mini' ? 'Miniaturas do mosaico' : 'Câmera em tela grande'}
                                ajuda={q === 'mini' ? 'Usa o sub-stream da câmera (resolução baixa).' : 'Usa o stream principal da câmera.'}>
                                <Stack direction="row" spacing={2} useFlexGap flexWrap="wrap">
                                    <TextField size="small" type="number" label="Quadros/s" value={video[q]?.fps ?? ''} inputProps={{ min: 1, max: 30 }}
                                        onChange={e => setVideo(q, 'fps', Number(e.target.value))} sx={{ width: 110 }} />
                                    <TextField size="small" type="number" label="Largura (px)" value={video[q]?.max_width ?? ''} inputProps={{ min: 320, max: 1920, step: 160 }}
                                        onChange={e => setVideo(q, 'max_width', Number(e.target.value))} sx={{ width: 130 }} />
                                    <TextField size="small" type="number" label="Qualidade" value={video[q]?.quality ?? ''} inputProps={{ min: 30, max: 90 }}
                                        onChange={e => setVideo(q, 'quality', Number(e.target.value))} sx={{ width: 110 }} />
                                </Stack>
                            </Campo>
                        ))}
                        <Campo titulo={`Repetir alerta da mesma pessoa na mesma câmera: a cada ${cfg.painel?.alerta_repetir_s ?? 30} s`}>
                            <Slider value={cfg.painel?.alerta_repetir_s ?? 30} min={10} max={600} step={10} onChange={(_, v) => setPainel('alerta_repetir_s', v)} />
                        </Campo>
                        <Campo
                            titulo={`Alvo da watchlist volta a alertar após: ${cfg.painel?.rastreamento_expira_min ?? 120} min`}
                            ajuda="Se ninguém clicar em 'Alvo localizado', o rastreamento expira e a pessoa volta a gerar alerta."
                        >
                            <Slider value={cfg.painel?.rastreamento_expira_min ?? 120} min={10} max={720} step={10} onChange={(_, v) => setPainel('rastreamento_expira_min', v)} />
                        </Campo>
                        <FormControlLabel
                            control={<Switch checked={cfg.painel?.som_alerta !== false} onChange={e => setPainel('som_alerta', e.target.checked)} />}
                            label="Som nos alertas (cada tela ainda pode silenciar)"
                        />
                    </GlassCard>
                </Grid>

                {/* AVANÇADO */}
                <Grid item xs={12}>
                    <GlassCard sx={{ p: 3 }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                            <Stack direction="row" spacing={1} alignItems="center">
                                <SpeedIcon color="primary" />
                                <Typography variant="h6" fontWeight={700}>Desempenho da IA (avançado)</Typography>
                            </Stack>
                            <Stack direction="row" spacing={1}>
                                <Button size="small" startIcon={<RestaurarIcon />} onClick={() => setCfg(c => ({ ...c, ajustes: {} }))}>
                                    Padrões do perfil
                                </Button>
                                <IconButton onClick={() => setAvancado(a => !a)}>{avancado ? <CollapseIcon /> : <ExpandIcon />}</IconButton>
                            </Stack>
                        </Stack>
                        <Collapse in={avancado}>
                            <Grid container spacing={3} sx={{ mt: 0.5 }}>
                                <Grid item xs={12} md={6}>
                                    <Campo titulo={`Análises por segundo, somando todas as câmeras: ${ia('ia_fps_total')}`}
                                        ajuda="Teto de trabalho da IA no computador do evento; é dividido entre as câmeras (a de maior prioridade primeiro).">
                                        <Slider value={Number(ia('ia_fps_total'))} min={5} max={60} step={1} onChange={(_, v) => setIa('ia_fps_total', v)} />
                                    </Campo>
                                    <Campo titulo={`Por câmera em tela grande: ${ia('ia_fps_foco')}/s`}>
                                        <Slider value={Number(ia('ia_fps_foco'))} min={1} max={20} step={1} onChange={(_, v) => setIa('ia_fps_foco', v)} />
                                    </Campo>
                                    <Campo titulo={`Por miniatura: ${ia('ia_fps_mini')}/s`}>
                                        <Slider value={Number(ia('ia_fps_mini'))} min={1} max={10} step={1} onChange={(_, v) => setIa('ia_fps_mini', v)} />
                                    </Campo>
                                    <Campo titulo={`Vigilância (ninguém assistindo, com movimento): ${ia('ia_fps_vigilancia')}/s`}>
                                        <Slider value={Number(ia('ia_fps_vigilancia'))} min={1} max={10} step={1} onChange={(_, v) => setIa('ia_fps_vigilancia', v)} />
                                    </Campo>
                                </Grid>
                                <Grid item xs={12} md={6}>
                                    <Campo titulo="Qual vídeo a IA analisa" ajuda="Automático: sub-stream, e o principal quando alguém abre a câmera em tela grande.">
                                        <Select size="small" value={ia('ia_stream')} onChange={e => setIa('ia_stream', e.target.value)}>
                                            {Object.entries(NOMES_STREAM).map(([k, v]) => <MenuItem key={k} value={k}>{v}</MenuItem>)}
                                        </Select>
                                    </Campo>
                                    <Campo titulo={`Diferença mínima para a 2ª pessoa mais parecida: ${Number(ia('margem')).toFixed(2)}`}
                                        ajuda="Evita confundir pessoas parecidas (irmãos, por exemplo).">
                                        <Slider value={Number(ia('margem'))} min={0} max={0.15} step={0.01} onChange={(_, v) => setIa('margem', v)} />
                                    </Campo>
                                    <Campo titulo={`Nitidez mínima do rosto: ${ia('min_nitidez')}`} ajuda="Rosto borrado (movimento rápido) não é comparado.">
                                        <Slider value={Number(ia('min_nitidez'))} min={0} max={100} step={5} onChange={(_, v) => setIa('min_nitidez', v)} />
                                    </Campo>
                                    <Campo titulo={`Rosto virado até: ${ia('max_yaw')}°`}>
                                        <Slider value={Number(ia('max_yaw'))} min={20} max={70} step={5} onChange={(_, v) => setIa('max_yaw', v)} />
                                    </Campo>
                                    <FormControlLabel
                                        control={<Switch checked={!!ia('movimento')} onChange={e => setIa('movimento', e.target.checked)} />}
                                        label="Economia por movimento: câmera parada sem ninguém assistindo não usa IA"
                                    />
                                </Grid>
                            </Grid>
                        </Collapse>
                    </GlassCard>
                </Grid>

                <Grid item xs={12}>
                    <Stack direction="row" justifyContent="flex-end" spacing={2} alignItems="center">
                        {cfg.atualizado_em && (
                            <Typography variant="caption" color="text.secondary">
                                Última alteração: {new Date(cfg.atualizado_em).toLocaleString()} {cfg.atualizado_por ? `por ${cfg.atualizado_por}` : ''}
                            </Typography>
                        )}
                        <NeonButton onClick={salvar} disabled={saving} startIcon={<SaveIcon />}>
                            {saving ? 'Salvando...' : 'Salvar e aplicar'}
                        </NeonButton>
                    </Stack>
                </Grid>

                {/* POR CÂMERA */}
                <Grid item xs={12}>
                    <GlassCard sx={{ p: 3 }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                            <Typography variant="h6" fontWeight={700}>Câmeras do evento</Typography>
                            <Tooltip title="Atualizar"><IconButton onClick={carregarCameras}><RefreshIcon /></IconButton></Tooltip>
                        </Stack>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2 }}>
                            Alterações aqui valem na hora. Sub-stream vazio: deduzido da câmera (Intelbras/Dahua e Hikvision).
                        </Typography>
                        {!eventoId ? (
                            <Alert severity="info">Selecione um evento para ver as câmeras.</Alert>
                        ) : (
                            <TableContainer>
                                <Table size="small">
                                    <TableHead>
                                        <TableRow>
                                            <TableCell>Câmera</TableCell>
                                            <TableCell>Agora</TableCell>
                                            <TableCell align="center">Ativa</TableCell>
                                            <TableCell>Inteligência</TableCell>
                                            <TableCell>Prioridade</TableCell>
                                            <TableCell>Sub-stream (opcional)</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {cameras.map(cam => {
                                            const isDesativada = cam.status === 'desativada' || cam.status === 'inativa';
                                            const st = isDesativada ? null : statusDaCamera(status, cam.id);
                                            return (
                                                <TableRow key={cam.id} sx={{ opacity: isDesativada ? 0.65 : 1 }}>
                                                    <TableCell>
                                                        <Typography variant="body2" fontWeight={700}>{cam.nome}</Typography>
                                                        <Typography variant="caption" color="text.secondary">{cam.area?.nome_area || cam.ip_address}</Typography>
                                                    </TableCell>
                                                    <TableCell>
                                                        {isDesativada ? (
                                                            <Chip label="Desativada" size="small" color="warning" sx={{ height: 20, fontSize: '0.7rem', fontWeight: 700 }} />
                                                        ) : st ? (
                                                            <Typography variant="caption">
                                                                {st.conectada ? `${Math.round(st.video_fps)} fps` : 'sem vídeo'}
                                                                {st.ia_analisando ? ` • IA ${st.ia_fps_alvo}/s` : ' • IA em espera'}
                                                                {st.rostos ? ` • ${st.rostos} rosto(s)` : ''}
                                                                {st.sub_stream ? ' • sub-stream' : ''}
                                                            </Typography>
                                                        ) : <Typography variant="caption" color="text.secondary">—</Typography>}
                                                    </TableCell>
                                                    <TableCell align="center">
                                                        <Switch size="small" color="success" checked={!isDesativada} disabled={salvandoCam === cam.id}
                                                            onChange={e => salvarCamera(cam, { status: e.target.checked ? 'offline' : 'desativada' })} />
                                                    </TableCell>
                                                    <TableCell sx={{ minWidth: 160 }}>
                                                        {/* Mesma regra do cartão em Câmeras (opcoesCamera.js) */}
                                                        <Select size="small" fullWidth value={modoIaDe(cam)} disabled={salvandoCam === cam.id || isDesativada}
                                                            inputProps={{ 'aria-label': `Inteligência da câmera ${cam.nome}` }}
                                                            onChange={e => salvarCamera(cam, camposDoModoIa(e.target.value))}>
                                                            {MODOS_IA.map(m => <MenuItem key={m.valor} value={m.valor}>{m.rotulo}</MenuItem>)}
                                                        </Select>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Select size="small" value={cam.prioridade ?? 1} disabled={salvandoCam === cam.id || isDesativada}
                                                            onChange={e => salvarCamera(cam, { prioridade: e.target.value })}>
                                                            <MenuItem value={0}>Baixa</MenuItem>
                                                            <MenuItem value={1}>Normal</MenuItem>
                                                            <MenuItem value={2}>Alta</MenuItem>
                                                            <MenuItem value={3}>Crítica</MenuItem>
                                                        </Select>
                                                    </TableCell>
                                                    <TableCell sx={{ minWidth: 260 }}>
                                                        <TextField
                                                            size="small" fullWidth placeholder="rtsp://... (deduzido)"
                                                            disabled={isDesativada}
                                                            defaultValue={cam.url_substream || ''}
                                                            onBlur={e => {
                                                                const v = e.target.value.trim();
                                                                if (v !== (cam.url_substream || '')) salvarCamera(cam, { url_substream: v });
                                                            }}
                                                        />
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                        {cameras.length === 0 && (
                                            <TableRow><TableCell colSpan={7}><Typography variant="body2" color="text.secondary">Nenhuma câmera cadastrada neste evento.</Typography></TableCell></TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        )}
                    </GlassCard>
                </Grid>
            </Grid>

            {/* MODAL DE VERIFICAÇÃO DE COMPATIBILIDADE, RECOMENDAÇÕES E ATIVAÇÃO DA IA NESTE PC */}
            <Dialog open={modalDiagAberto} onClose={fecharModalDiag} maxWidth="md" fullWidth>
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                    <Stack direction="row" spacing={1} alignItems="center">
                        <PcIcon color="primary" />
                        <Typography variant="h6" fontWeight={700}>
                            Verificação de Compatibilidade e Ativação da IA Facial neste PC
                        </Typography>
                    </Stack>
                    <Tooltip title="Refazer verificação de hardware">
                        <IconButton size="small" onClick={executarDiagnostico} disabled={diagnosticando}>
                            <RefreshIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                </DialogTitle>
                <DialogContent dividers>
                    {diagnosticando && !diagnostico ? (
                        <Stack direction="row" spacing={2} alignItems="center" justifyContent="center" sx={{ py: 5 }}>
                            <CircularProgress size={28} />
                            <Typography variant="body2">Verificando placa de vídeo, processador, memória e rede deste computador...</Typography>
                        </Stack>
                    ) : diagnostico && (
                        <Stack spacing={2.5}>
                            {/* 1. CHECKLIST DE COMPATIBILIDADE */}
                            <Box>
                                <Typography variant="subtitle2" fontWeight={700} color="primary" sx={{ mb: 1 }}>
                                    1. Verificação de Compatibilidade deste Computador
                                </Typography>
                                <Grid container spacing={1.5}>
                                    {diagnostico.checks.map(ch => {
                                        const Icone = ch.status === 'ok' ? CheckIcon : (ch.status === 'error' ? ErrorIcon : WarnIcon);
                                        const cor = ch.status === 'ok' ? '#00FF88' : (ch.status === 'error' ? '#FF3366' : '#FFB800');
                                        return (
                                            <Grid item xs={12} md={6} key={ch.id}>
                                                <Box sx={{
                                                    p: 1.5,
                                                    borderRadius: 1.5,
                                                    height: '100%',
                                                    bgcolor: 'rgba(255,255,255,0.03)',
                                                    border: `1px solid ${cor}33`
                                                }}>
                                                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                                                        <Icone sx={{ color: cor, fontSize: 18 }} />
                                                        <Typography variant="caption" color="text.secondary" fontWeight={700}>
                                                            {ch.titulo}
                                                        </Typography>
                                                    </Stack>
                                                    <Typography variant="body2" fontWeight={700} sx={{ mb: 0.25 }}>
                                                        {ch.valor}
                                                    </Typography>
                                                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.35 }}>
                                                        {ch.detalhe}
                                                    </Typography>
                                                </Box>
                                            </Grid>
                                        );
                                    })}
                                </Grid>
                            </Box>

                            <Divider />

                            {/* 2. RECOMENDAÇÕES DE CONFIGURAÇÃO ANTES DE LIGAR */}
                            <Box sx={{
                                p: 2,
                                borderRadius: 2,
                                bgcolor: 'rgba(0, 212, 255, 0.05)',
                                border: '1px solid rgba(0, 212, 255, 0.25)'
                            }}>
                                <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} spacing={1} sx={{ mb: 1 }}>
                                    <Stack direction="row" spacing={1} alignItems="center">
                                        <RecommendIcon sx={{ color: '#00D4FF' }} />
                                        <Typography variant="subtitle2" fontWeight={700} sx={{ color: '#00D4FF' }}>
                                            2. Recomendações de Configuração para este PC
                                        </Typography>
                                    </Stack>
                                    <Chip
                                        size="small"
                                        color="primary"
                                        label={`Perfil Recomendado: ${NOMES_PERFIL[diagnostico.recomendacao.perfil]}`}
                                        sx={{ fontWeight: 700 }}
                                    />
                                </Stack>
                                <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                                    {diagnostico.recomendacao.resumoMotivo}
                                </Typography>
                                <Grid container spacing={1}>
                                    {diagnostico.recomendacao.itens.map((item, idx) => (
                                        <Grid item xs={12} sm={6} key={idx}>
                                            <Box sx={{ p: 1, borderRadius: 1, bgcolor: 'rgba(0,0,0,0.25)' }}>
                                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                                                    {item.rotulo}
                                                </Typography>
                                                <Typography variant="body2" fontWeight={700}>
                                                    {item.valor}
                                                </Typography>
                                            </Box>
                                        </Grid>
                                    ))}
                                </Grid>
                                <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} sx={{ mt: 1.5 }}>
                                    <FormControlLabel
                                        control={<Switch checked={aplicarRecAoLigar} onChange={e => setAplicarRecAoLigar(e.target.checked)} color="primary" />}
                                        label={<Typography variant="body2" fontWeight={600}>Aplicar configurações recomendadas antes de ligar o arquivo</Typography>}
                                    />
                                    <Button size="small" variant="outlined" onClick={aplicarSomenteRecomendacoes} disabled={saving}>
                                        Apenas salvar recomendações
                                    </Button>
                                </Stack>
                            </Box>

                            <Divider />

                            {/* 3. IDENTIFICAÇÃO E INICIALIZAÇÃO NESTE PC */}
                            <Box>
                                <Typography variant="subtitle2" fontWeight={700} color="primary" sx={{ mb: 1 }}>
                                    3. Iniciar &quot;ligar-ia-facial&quot; neste Computador
                                </Typography>
                                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ xs: 'stretch', sm: 'center' }}>
                                    <TextField
                                        size="small"
                                        fullWidth
                                        label="Identificação deste computador no evento"
                                        value={nomePc}
                                        onChange={e => setNomePc(e.target.value)}
                                        placeholder="Ex.: Notebook Portaria / Servidor CFTV"
                                    />
                                </Stack>

                                {etapaAtivacao && etapaAtivacao !== 'CONECTADO' && etapaAtivacao !== 'AGUARDANDO_BAT' && (
                                    <Alert severity="info" icon={<CircularProgress size={18} />} sx={{ mt: 2 }}>
                                        <Typography variant="body2" fontWeight={700}>{etapaAtivacao}</Typography>
                                        <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>
                                            Se o navegador exibir o aviso <b>&quot;Abrir Windows PowerShell?&quot;</b>, clique em <b>Abrir</b>. Caso seja a primeira vez neste computador, você também pode baixar e executar o ativador abaixo:
                                        </Typography>
                                        {dadosAtivacao && (
                                            <Button
                                                size="small"
                                                variant="outlined"
                                                startIcon={<DownloadIcon />}
                                                onClick={() => baixarAtivadorBat(dadosAtivacao)}
                                                sx={{ mt: 1 }}
                                            >
                                                Baixar ativador configurado (ligar-ia-neste-pc.bat)
                                            </Button>
                                        )}
                                    </Alert>
                                )}

                                {etapaAtivacao === 'AGUARDANDO_BAT' && (
                                    <Alert severity="warning" sx={{ mt: 2 }}>
                                        <Typography variant="body2" fontWeight={700}>
                                            Ainda aguardando resposta do motor neste computador.
                                        </Typography>
                                        <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>
                                            Clique no botão abaixo para baixar o arquivo <b>ligar-ia-neste-pc.bat</b> já configurado com o token deste evento e dê um duplo clique nele na pasta do projeto:
                                        </Typography>
                                        <Button
                                            size="small"
                                            variant="contained"
                                            color="warning"
                                            startIcon={<DownloadIcon />}
                                            onClick={() => baixarAtivadorBat(dadosAtivacao)}
                                            sx={{ mt: 1, fontWeight: 700 }}
                                        >
                                            Baixar e abrir ligar-ia-neste-pc.bat
                                        </Button>
                                    </Alert>
                                )}

                                {etapaAtivacao === 'CONECTADO' && (
                                    <Alert severity="success" sx={{ mt: 2 }}>
                                        <Typography variant="body2" fontWeight={700}>
                                            Motor de IA Facial e Agente Local estão ligados e conectados a este evento!
                                        </Typography>
                                    </Alert>
                                )}
                            </Box>
                        </Stack>
                    )}
                </DialogContent>
                <DialogActions sx={{ px: 3, py: 2, justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
                    <Button
                        size="small"
                        startIcon={<DownloadIcon />}
                        onClick={() => baixarAtivadorBat(dadosAtivacao)}
                        sx={{ color: 'text.secondary' }}
                    >
                        Baixar script .bat para este PC
                    </Button>
                    <Stack direction="row" spacing={1.5}>
                        <Button onClick={fecharModalDiag} color="inherit">
                            Fechar
                        </Button>
                        <NeonButton
                            onClick={confirmarELigarIaNestePc}
                            disabled={ligandoIa || diagnosticando}
                            startIcon={ligandoIa ? <CircularProgress size={16} color="inherit" /> : <PlayIcon />}
                        >
                            {ligandoIa ? 'Iniciando IA neste PC...' : 'Verificar e Ligar IA Facial neste PC'}
                        </NeonButton>
                    </Stack>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default ConfigIAFacial;
