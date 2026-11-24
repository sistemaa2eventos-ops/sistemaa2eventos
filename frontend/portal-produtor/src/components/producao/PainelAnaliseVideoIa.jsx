import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
    Alert,
    Box,
    Button,
    Chip,
    FormControl,
    Grid,
    InputLabel,
    LinearProgress,
    MenuItem,
    Select,
    Stack,
    TextField,
    Typography
} from '@mui/material';
import {
    AutoAwesome as IaIcon,
    CheckCircle as SalvarIcon,
    RestartAlt as LimparIcon,
    UploadFile as UploadVideoIcon
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import GlassCard from '../common/GlassCard';
import NeonButton from '../common/NeonButton';
import { botaoSecundario, cores, funcao, tamanhos, tom } from '../../styles/tokens';

function formatarTempoSeg(seg) {
    const total = Math.max(0, Math.round(Number(seg || 0)));
    const min = Math.floor(total / 60);
    const s = total % 60;
    return `${String(min).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function desenharRetanguloArredondado(ctx, x, y, w, h, r) {
    const raio = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + raio, y);
    ctx.arcTo(x + w, y, x + w, y + h, raio);
    ctx.arcTo(x + w, y + h, x, y + h, raio);
    ctx.arcTo(x, y + h, x, y, raio);
    ctx.arcTo(x, y, x + w, y, raio);
    ctx.closePath();
}

/**
 * Extrai N quadros-chave espaçados uniformemente de um arquivo de vídeo local
 * diretamente no navegador (sem subir o arquivo MP4 inteiro).
 */
async function extrairQuadrosDeVideo(file, qtdQuadros = 10, aoProgresso = null) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const video = document.createElement('video');
        video.muted = true;
        video.playsInline = true;
        video.preload = 'auto';

        const limpar = () => {
            video.removeAttribute('src');
            video.load();
            URL.revokeObjectURL(url);
        };

        video.onerror = () => {
            limpar();
            reject(new Error('Não foi possível decodificar o vídeo selecionado neste navegador.'));
        };

        video.onloadedmetadata = async () => {
            try {
                const duracao = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 5;
                const totalAlvo = Math.max(3, Math.min(14, qtdQuadros));
                const maxW = 960;
                const vw = video.videoWidth || 960;
                const vh = video.videoHeight || 540;
                const esc = Math.min(1, maxW / Math.max(1, vw, vh));
                const cw = Math.max(320, Math.round(vw * esc));
                const ch = Math.max(180, Math.round(vh * esc));

                const canvas = document.createElement('canvas');
                canvas.width = cw;
                canvas.height = ch;
                const ctx = canvas.getContext('2d');

                const quadros = [];
                for (let i = 0; i < totalAlvo; i += 1) {
                    const fracao = (i + 0.5) / totalAlvo;
                    const tempo = Math.min(Math.max(0.1, duracao * fracao), Math.max(0.1, duracao - 0.1));

                    await new Promise((resSeek) => {
                        let resolvido = false;
                        const finalizar = () => {
                            if (resolvido) return;
                            resolvido = true;
                            video.removeEventListener('seeked', finalizar);
                            resSeek();
                        };
                        video.addEventListener('seeked', finalizar);
                        video.currentTime = tempo;
                        setTimeout(finalizar, 1800);
                    });

                    ctx.drawImage(video, 0, 0, cw, ch);
                    const imagemBase64 = canvas.toDataURL('image/jpeg', 0.78);
                    quadros.push({
                        indice: i + 1,
                        tempo_segundos: Math.round(tempo * 10) / 10,
                        imagem_base64: imagemBase64
                    });
                    if (aoProgresso) aoProgresso(Math.round(((i + 1) / totalAlvo) * 100), i + 1, totalAlvo);
                }

                limpar();
                resolve({ quadros, duracao_segundos: Math.round(duracao) });
            } catch (err) {
                limpar();
                reject(err);
            }
        };

        video.src = url;
    });
}

/**
 * Painel de Análise Real de Vídeo Gravado com Gemini Vision:
 * extrai quadros-chave no navegador, conta unidades únicas ao longo do vídeo
 * sem duplicidade e desenha caixas verdes nos quadros de evidência.
 */
const PainelAnaliseVideoIa = ({
    materiais = [],
    areas = [],
    httpClient,
    headersExtra,
    aoAtualizar
}) => {
    const { enqueueSnackbar } = useSnackbar();
    const canvasRef = useRef(null);

    const [arquivoVideo, setArquivoVideo] = useState(null);
    const [quadrosExtraidos, setQuadrosExtraidos] = useState([]);
    const [duracaoVideo, setDuracaoVideo] = useState(0);
    const [quadroSelecionadoIdx, setQuadroSelecionadoIdx] = useState(0);

    const [escopoMaterialId, setEscopoMaterialId] = useState('todos');
    const [tipoOperacao, setTipoOperacao] = useState('descarga_entrada');
    const [contextoLocal, setContextoLocal] = useState('Doca / Descarga');
    const [qtdQuadrosAlvo, setQtdQuadrosAlvo] = useState(10);
    const [observacaoOperador, setObservacaoOperador] = useState('');

    const [statusTexto, setStatusTexto] = useState('');
    const [progressoExtracao, setProgressoExtracao] = useState(0);
    const [analisando, setAnalisando] = useState(false);
    const [salvando, setSalvando] = useState(false);
    const [erroIa, setErroIa] = useState('');
    const [resultadoIa, setResultadoIa] = useState(null);
    const [ajustesQtd, setAjustesQtd] = useState({});

    const renderizarQuadroSelecionado = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const quadro = quadrosExtraidos[quadroSelecionadoIdx];

        if (!quadro) {
            canvas.width = 960;
            canvas.height = 540;
            ctx.fillStyle = cores.fundo;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.strokeStyle = 'rgba(148,163,184,0.12)';
            ctx.lineWidth = 1;
            for (let x = 0; x < canvas.width; x += 64) {
                ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
            }
            ctx.fillStyle = cores.textoSecundario;
            ctx.font = '600 18px Inter, sans-serif';
            ctx.fillText('Carregue um vídeo gravado pelo celular (descarga, caminhão ou galpão)', 40, 265);
            ctx.font = '14px Inter, sans-serif';
            ctx.fillText('O sistema extrai quadros-chave leves, conta itens únicos sem duplicar e gera evidências.', 40, 295);
            return;
        }

        const img = new Image();
        img.onload = () => {
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            const cw = canvas.width;
            const ch = canvas.height;
            const scaleFont = Math.max(0.85, cw / 960);

            if (resultadoIa) {
                const idxAtual = quadro.indice;
                (resultadoIa.itens_identificados || []).forEach((item) => {
                    (item.deteccoes_quadros || [])
                        .filter((d) => d.quadro_indice === idxAtual && Array.isArray(d.box_2d))
                        .forEach((d) => {
                            const [ymin, xmin, ymax, xmax] = d.box_2d;
                            const x = (xmin / 1000) * cw;
                            const y = (ymin / 1000) * ch;
                            const w = ((xmax - xmin) / 1000) * cw;
                            const h = ((ymax - ymin) / 1000) * ch;

                            ctx.save();
                            desenharRetanguloArredondado(ctx, x, y, w, h, 8);
                            ctx.fillStyle = 'rgba(16, 185, 129, 0.14)';
                            ctx.fill();
                            ctx.lineWidth = Math.max(2.5, 3 * scaleFont);
                            ctx.strokeStyle = '#10B981';
                            ctx.stroke();

                            const texto = d.rotulo || `${d.quantidade_no_quadro} ${item.unidade || 'un'}`;
                            ctx.font = `700 ${Math.round(15 * scaleFont)}px Inter, sans-serif`;
                            const textW = ctx.measureText(texto).width;
                            const pillW = textW + 18 * scaleFont;
                            const pillH = 26 * scaleFont;
                            const pillX = Math.max(6, Math.min(cw - pillW - 6, x + (w - pillW) / 2));
                            const pillY = Math.max(6, y - pillH - 4);

                            desenharRetanguloArredondado(ctx, pillX, pillY, pillW, pillH, 6);
                            ctx.fillStyle = '#10B981';
                            ctx.fill();
                            ctx.fillStyle = '#06281E';
                            ctx.textBaseline = 'middle';
                            ctx.fillText(texto, pillX + 9 * scaleFont, pillY + pillH / 2 + 1);
                            ctx.restore();
                        });
                });

                (resultadoIa.itens_nao_catalogados || [])
                    .filter((nr) => nr.quadro_indice === idxAtual && Array.isArray(nr.box_2d))
                    .forEach((nr) => {
                        const [ymin, xmin, ymax, xmax] = nr.box_2d;
                        const x = (xmin / 1000) * cw;
                        const y = (ymin / 1000) * ch;
                        const w = ((xmax - xmin) / 1000) * cw;
                        const h = ((ymax - ymin) / 1000) * ch;

                        ctx.save();
                        desenharRetanguloArredondado(ctx, x, y, w, h, 8);
                        ctx.fillStyle = 'rgba(245, 158, 11, 0.12)';
                        ctx.fill();
                        ctx.lineWidth = 2.5;
                        ctx.strokeStyle = '#F59E0B';
                        ctx.stroke();
                        ctx.restore();
                    });
            }

            // Badges topo (CAM/VÍDEO + Tempo e TOTAL)
            const badgeH = 32 * scaleFont;
            ctx.save();
            ctx.font = `700 ${Math.round(14 * scaleFont)}px Inter, sans-serif`;
            const esqTxt = `VÍDEO • ${formatarTempoSeg(quadro.tempo_segundos)} (#${quadro.indice}/${quadrosExtraidos.length})`;
            const esqW = ctx.measureText(esqTxt).width + 38 * scaleFont;
            desenharRetanguloArredondado(ctx, 14, 14, esqW, badgeH, badgeH / 2);
            ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
            ctx.fill();
            ctx.beginPath();
            ctx.arc(14 + 16 * scaleFont, 14 + badgeH / 2, 4.5 * scaleFont, 0, Math.PI * 2);
            ctx.fillStyle = '#10B981';
            ctx.fill();
            ctx.fillStyle = '#F8FAFC';
            ctx.textBaseline = 'middle';
            ctx.fillText(esqTxt, 14 + 28 * scaleFont, 14 + badgeH / 2 + 1);

            if (resultadoIa) {
                const dirTxt = `TOTAL ${resultadoIa.total_geral || 0} PÇ`;
                const dirW = ctx.measureText(dirTxt).width + 26 * scaleFont;
                desenharRetanguloArredondado(ctx, cw - dirW - 14, 14, dirW, badgeH, badgeH / 2);
                ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
                ctx.fill();
                ctx.fillStyle = '#F8FAFC';
                ctx.fillText(dirTxt, cw - dirW - 1, 14 + badgeH / 2 + 1);
            }
            ctx.restore();
        };
        img.src = quadro.imagem_base64;
    }, [quadrosExtraidos, quadroSelecionadoIdx, resultadoIa]);

    useEffect(() => {
        renderizarQuadroSelecionado();
    }, [renderizarQuadroSelecionado]);

    const handleSelecionarVideo = async (evt) => {
        const file = evt.target.files?.[0];
        evt.target.value = '';
        if (!file) return;

        setArquivoVideo(file);
        setResultadoIa(null);
        setErroIa('');
        setAjustesQtd({});
        setQuadrosExtraidos([]);
        setQuadroSelecionadoIdx(0);
        setProgressoExtracao(0);

        try {
            setStatusTexto('Extraindo quadros-chave do vídeo...');
            const { quadros, duracao_segundos: dur } = await extrairQuadrosDeVideo(
                file,
                qtdQuadrosAlvo,
                (pct, atual, total) => {
                    setProgressoExtracao(pct);
                    setStatusTexto(`Extraindo quadros-chave do vídeo (${atual}/${total})...`);
                }
            );
            setQuadrosExtraidos(quadros);
            setDuracaoVideo(dur);
            setStatusTexto('');
            enqueueSnackbar(`${quadros.length} quadros-chave extraídos de "${file.name}" (${formatarTempoSeg(dur)}). Pronto para contar com IA!`, { variant: 'info' });
        } catch (err) {
            setStatusTexto('');
            const msg = err?.message || 'Erro ao ler o vídeo.';
            setErroIa(msg);
            enqueueSnackbar(msg, { variant: 'error' });
        }
    };

    const handleAnalisarVideoComGemini = async () => {
        if (quadrosExtraidos.length === 0) {
            enqueueSnackbar('Selecione um vídeo primeiro para extrair os quadros.', { variant: 'warning' });
            return;
        }
        try {
            setAnalisando(true);
            setErroIa('');
            setStatusTexto('Analisando sequência temporal no Gemini Vision...');
            const res = await httpClient.post('/producao/materiais/analisar-video-ia', {
                quadros: quadrosExtraidos.map((q) => ({
                    tempo_segundos: q.tempo_segundos,
                    imagem_base64: q.imagem_base64
                })),
                material_ids: escopoMaterialId === 'todos' ? [] : [escopoMaterialId],
                contexto_local: contextoLocal,
                tipo_operacao: tipoOperacao,
                duracao_segundos: duracaoVideo,
                observacao_operador: observacaoOperador
            }, { headers: headersExtra });

            const dados = res?.data?.data || res?.data || null;
            setResultadoIa(dados);

            const iniciais = {};
            (dados?.itens_identificados || []).forEach((it, idx) => {
                iniciais[it.material_id || `idx-${idx}`] = it.quantidade;
            });
            setAjustesQtd(iniciais);

            // Pula automaticamente para o primeiro quadro que tenha detecção marcada
            const primeiraDet = dados?.itens_identificados?.[0]?.deteccoes_quadros?.[0];
            if (primeiraDet?.quadro_indice) {
                setQuadroSelecionadoIdx(Math.max(0, primeiraDet.quadro_indice - 1));
            }

            enqueueSnackbar(`Análise de vídeo concluída: ${dados?.total_geral || 0} unidade(s) única(s) contada(s).`, { variant: 'success' });
        } catch (err) {
            const msg = err.response?.data?.error || err.response?.data?.message || err.message || 'Falha ao analisar vídeo com IA.';
            setErroIa(msg);
            enqueueSnackbar(msg, { variant: 'error' });
        } finally {
            setAnalisando(false);
            setStatusTexto('');
        }
    };

    const handleSalvarConferenciaVideo = async () => {
        if (!resultadoIa) return;
        const itensCatalogo = (resultadoIa.itens_identificados || []).map((it, idx) => {
            const chave = it.material_id || `idx-${idx}`;
            const qtdFinal = Number(ajustesQtd[chave] ?? it.quantidade ?? 0);
            return {
                material_id: it.material_id || null,
                classe_identificada: it.nome_material,
                quantidade_esperada: Number(it.quantidade_esperada || 0),
                quantidade_ia: qtdFinal,
                confianca_media: it.confianca || 0.88,
                quadro_chave_evidencia_url: null,
                acao_aplicada: tipoOperacao === 'carregamento_saida' ? 'contar_saida' : 'contar_entrada'
            };
        }).filter((i) => i.quantidade_ia > 0);

        const itensNaoCat = (resultadoIa.itens_nao_catalogados || []).map((nr) => ({
            material_id: null,
            classe_identificada: nr.descricao,
            quantidade_esperada: 0,
            quantidade_ia: Number(nr.quantidade || 1),
            confianca_media: nr.confianca || 0.72,
            quadro_chave_evidencia_url: null,
            acao_aplicada: 'nao_reconhecido'
        }));

        const todosItens = [...itensCatalogo, ...itensNaoCat];
        if (todosItens.length === 0) {
            enqueueSnackbar('Nenhum item com quantidade válida para salvar.', { variant: 'warning' });
            return;
        }

        let evidenciaUrl = null;
        try {
            const canvas = canvasRef.current;
            if (canvas) {
                const temp = document.createElement('canvas');
                const esc = Math.min(1, 720 / Math.max(1, canvas.width));
                temp.width = Math.round(canvas.width * esc);
                temp.height = Math.round(canvas.height * esc);
                temp.getContext('2d').drawImage(canvas, 0, 0, temp.width, temp.height);
                evidenciaUrl = temp.toDataURL('image/jpeg', 0.76);
            }
        } catch {
            evidenciaUrl = null;
        }
        todosItens.forEach((it) => { it.quadro_chave_evidencia_url = evidenciaUrl; });

        try {
            setSalvando(true);
            const matRef = materiais.find((m) => m.id === itensCatalogo[0]?.material_id);
            await httpClient.post('/producao/materiais/conferencia-ia', {
                fornecedor_nome: matRef?.fornecedor_nome || contextoLocal || 'Vídeo de descarga',
                numero_nota_romaneio: `VID-IA-${Date.now().toString().slice(-5)}`,
                origem_midia: 'video_gravado',
                modo_contagem: 'video_quadros_ia',
                modelo_ia_versao: resultadoIa.modelo_ia_versao || 'gemini-3.1-flash-lite',
                observacoes: resultadoIa.observacao_geral || '',
                itens: todosItens,
                acoes_executadas: [{
                    id: `vid-ia-${Date.now()}`,
                    tipo: tipoOperacao === 'carregamento_saida' ? 'contar_saida' : 'contar_entrada',
                    mensagem: `Vídeo analisado (${resultadoIa.quadros_analisados} quadros, ${formatarTempoSeg(duracaoVideo)}): ${resultadoIa.total_geral} un. únicas.`,
                    timestamp: new Date().toISOString()
                }]
            }, { headers: headersExtra });

            enqueueSnackbar('Contagem por vídeo registrada na auditoria de recebimento!', { variant: 'success' });
            await aoAtualizar();
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Erro ao salvar conferência.', { variant: 'error' });
        } finally {
            setSalvando(false);
        }
    };

    return (
        <GlassCard sx={{ p: 2.5 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1, mb: 2 }}>
                <Box>
                    <Typography variant="subtitle1" sx={{ color: cores.textoForte, fontWeight: 700 }}>
                        Contagem por Vídeo Gravado (Gemini Vision IA — Sem Duplicidade)
                    </Typography>
                    <Typography sx={{ fontSize: tamanhos.xs, color: cores.textoSecundario }}>
                        Ideal para vídeos gravados no celular durante descarga de caminhão, passagem no portão ou caminhando pelo galpão — funciona mesmo com a câmera na mão.
                    </Typography>
                </Box>
                <Chip
                    size="small"
                    label="IA Real • Vídeo Gravado"
                    sx={{ bgcolor: tom(funcao.acao, 0.14), color: funcao.acao, fontWeight: 700 }}
                />
            </Box>

            <Grid container spacing={2.5} alignItems="flex-start">
                <Grid item xs={12} lg={7}>
                    <Box
                        sx={{
                            borderRadius: 2,
                            overflow: 'hidden',
                            border: `1px solid ${resultadoIa ? funcao.liberado : cores.borda}`,
                            bgcolor: cores.fundo
                        }}
                    >
                        <canvas ref={canvasRef} style={{ width: '100%', height: 'auto', display: 'block' }} />
                    </Box>

                    {statusTexto && (
                        <Box sx={{ mt: 1.25 }}>
                            <Typography sx={{ fontSize: tamanhos.xs, color: cores.primaria, mb: 0.5 }}>
                                {statusTexto}
                            </Typography>
                            <LinearProgress
                                variant={analisando ? 'indeterminate' : 'determinate'}
                                value={progressoExtracao}
                                sx={{ borderRadius: 1 }}
                            />
                        </Box>
                    )}

                    {quadrosExtraidos.length > 0 && (
                        <Box sx={{ mt: 1.5 }}>
                            <Typography sx={{ fontSize: tamanhos.xs, color: cores.textoSecundario, mb: 0.75 }}>
                                Quadros-chave extraídos ({quadrosExtraidos.length}) — clique para inspecionar as caixas detectadas:
                            </Typography>
                            <Stack direction="row" spacing={1} sx={{ overflowX: 'auto', pb: 0.5 }}>
                                {quadrosExtraidos.map((q, idx) => {
                                    const ativo = idx === quadroSelecionadoIdx;
                                    const temDeteccao = Boolean(
                                        resultadoIa?.itens_identificados?.some((it) =>
                                            (it.deteccoes_quadros || []).some((d) => d.quadro_indice === q.indice)
                                        )
                                    );
                                    return (
                                        <Box
                                            key={q.indice}
                                            onClick={() => setQuadroSelecionadoIdx(idx)}
                                            sx={{
                                                position: 'relative',
                                                flexShrink: 0,
                                                width: 96,
                                                borderRadius: 1.25,
                                                overflow: 'hidden',
                                                cursor: 'pointer',
                                                border: `2px solid ${ativo ? cores.primaria : (temDeteccao ? funcao.liberado : cores.borda)}`
                                            }}
                                        >
                                            <Box
                                                component="img"
                                                src={q.imagem_base64}
                                                alt={`Quadro ${q.indice}`}
                                                sx={{ width: '100%', height: 54, objectFit: 'cover', display: 'block' }}
                                            />
                                            <Typography
                                                sx={{
                                                    fontSize: '0.68rem',
                                                    textAlign: 'center',
                                                    py: 0.2,
                                                    bgcolor: ativo ? cores.primaria : cores.superficieElevada,
                                                    color: ativo ? cores.fundo : cores.textoSecundario,
                                                    fontWeight: 700
                                                }}
                                            >
                                                {formatarTempoSeg(q.tempo_segundos)}{temDeteccao ? ' ✓' : ''}
                                            </Typography>
                                        </Box>
                                    );
                                })}
                            </Stack>
                        </Box>
                    )}

                    {resultadoIa?.observacao_geral && (
                        <Alert severity="info" sx={{ mt: 1.5 }}>
                            <strong>Resumo do vídeo:</strong> {resultadoIa.observacao_geral}
                        </Alert>
                    )}
                </Grid>

                <Grid item xs={12} lg={5}>
                    <Stack spacing={1.5}>
                        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                            <Button component="label" variant="outlined" size="small" startIcon={<UploadVideoIcon />} sx={botaoSecundario}>
                                {arquivoVideo ? 'Trocar vídeo' : 'Selecionar vídeo gravado'}
                                <input type="file" accept="video/*" hidden onChange={handleSelecionarVideo} />
                            </Button>
                            {quadrosExtraidos.length > 0 && (
                                <Button
                                    variant="outlined"
                                    size="small"
                                    startIcon={<LimparIcon />}
                                    onClick={() => {
                                        setArquivoVideo(null);
                                        setQuadrosExtraidos([]);
                                        setResultadoIa(null);
                                        setErroIa('');
                                    }}
                                    sx={botaoSecundario}
                                >
                                    Limpar
                                </Button>
                            )}
                        </Stack>

                        {arquivoVideo && (
                            <Typography sx={{ fontSize: tamanhos.xs, color: cores.textoSecundario }}>
                                Arquivo: <strong>{arquivoVideo.name}</strong> ({formatarTempoSeg(duracaoVideo)})
                            </Typography>
                        )}

                        <Grid container spacing={1.25}>
                            <Grid item xs={12} sm={7}>
                                <FormControl fullWidth size="small">
                                    <InputLabel>Tipo de gravação</InputLabel>
                                    <Select
                                        label="Tipo de gravação"
                                        value={tipoOperacao}
                                        onChange={(e) => setTipoOperacao(e.target.value)}
                                    >
                                        <MenuItem value="descarga_entrada">Descarga / Entrada no evento</MenuItem>
                                        <MenuItem value="carregamento_saida">Carregamento / Saída</MenuItem>
                                        <MenuItem value="inventario_caminhando">Caminhando pelo galpão / carga</MenuItem>
                                    </Select>
                                </FormControl>
                            </Grid>
                            <Grid item xs={12} sm={5}>
                                <FormControl fullWidth size="small">
                                    <InputLabel>Quadros analisados</InputLabel>
                                    <Select
                                        label="Quadros analisados"
                                        value={qtdQuadrosAlvo}
                                        onChange={(e) => setQtdQuadrosAlvo(Number(e.target.value))}
                                    >
                                        <MenuItem value={6}>6 quadros (vídeo curto)</MenuItem>
                                        <MenuItem value={10}>10 quadros (padrão)</MenuItem>
                                        <MenuItem value={14}>14 quadros (vídeo longo)</MenuItem>
                                    </Select>
                                </FormControl>
                            </Grid>
                        </Grid>

                        <FormControl fullWidth size="small">
                            <InputLabel>Materiais para procurar no vídeo</InputLabel>
                            <Select
                                label="Materiais para procurar no vídeo"
                                value={escopoMaterialId}
                                onChange={(e) => setEscopoMaterialId(e.target.value)}
                            >
                                <MenuItem value="todos">Todos os materiais do catálogo ({materiais.length})</MenuItem>
                                {materiais.map((m) => (
                                    <MenuItem key={m.id} value={m.id}>{m.nome}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>

                        <Grid container spacing={1.25}>
                            <Grid item xs={12} sm={7}>
                                <TextField
                                    fullWidth
                                    size="small"
                                    label="Local / Portão"
                                    value={contextoLocal}
                                    onChange={(e) => setContextoLocal(e.target.value)}
                                />
                            </Grid>
                            <Grid item xs={12} sm={5}>
                                <FormControl fullWidth size="small">
                                    <InputLabel>Setor</InputLabel>
                                    <Select label="Setor" value="" onChange={(e) => { if (e.target.value) setContextoLocal(e.target.value); }}>
                                        <MenuItem value="Doca / Descarga">Doca / Descarga</MenuItem>
                                        <MenuItem value="Portão de Carga">Portão de Carga</MenuItem>
                                        {areas.map((a) => <MenuItem key={a.id} value={a.nome}>{a.nome}</MenuItem>)}
                                    </Select>
                                </FormControl>
                            </Grid>
                        </Grid>

                        <TextField
                            fullWidth
                            size="small"
                            label="Dica opcional para a IA (opcional)"
                            placeholder="Ex.: Cada carrinho leva 10 grades"
                            value={observacaoOperador}
                            onChange={(e) => setObservacaoOperador(e.target.value)}
                        />

                        <NeonButton
                            loading={analisando}
                            disabled={quadrosExtraidos.length === 0}
                            startIcon={<IaIcon />}
                            onClick={handleAnalisarVideoComGemini}
                        >
                            {analisando ? 'Analisando vídeo com Gemini Vision...' : 'Contar itens no vídeo com IA'}
                        </NeonButton>

                        {erroIa && <Alert severity="warning">{erroIa}</Alert>}

                        {resultadoIa && (
                            <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: cores.superficieElevada, border: `1px solid ${cores.borda}` }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.25 }}>
                                    <Typography sx={{ fontSize: tamanhos.sm, fontWeight: 700, color: cores.textoForte }}>
                                        Total no vídeo ({resultadoIa.modelo_ia_versao})
                                    </Typography>
                                    <Chip
                                        size="small"
                                        label={`${resultadoIa.total_geral} un. únicas`}
                                        sx={{ bgcolor: tom(funcao.liberado, 0.16), color: funcao.liberado, fontWeight: 700 }}
                                    />
                                </Box>

                                <Stack spacing={1}>
                                    {(resultadoIa.itens_identificados || []).map((it, idx) => {
                                        const chave = it.material_id || `idx-${idx}`;
                                        return (
                                            <Box key={chave} sx={{ p: 1, borderRadius: 1.5, bgcolor: cores.fundo, border: `1px solid ${cores.borda}` }}>
                                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
                                                    <Box sx={{ minWidth: 0, flex: 1 }}>
                                                        <Typography sx={{ fontSize: tamanhos.sm, fontWeight: 700, color: cores.textoForte }} noWrap>
                                                            {it.nome_material}
                                                        </Typography>
                                                        <Typography sx={{ fontSize: tamanhos.xs, color: cores.textoSecundario }}>
                                                            Previsto: {it.quantidade_esperada || 0} {it.unidade} • Confiança {Math.round((it.confianca || 0) * 100)}%
                                                        </Typography>
                                                    </Box>
                                                    <TextField
                                                        type="number"
                                                        size="small"
                                                        label="Qtd."
                                                        value={ajustesQtd[chave] ?? it.quantidade}
                                                        onChange={(e) => setAjustesQtd((prev) => ({ ...prev, [chave]: e.target.value }))}
                                                        sx={{ width: 88 }}
                                                    />
                                                </Box>
                                                {it.raciocinio_contagem && (
                                                    <Typography sx={{ fontSize: tamanhos.xs, color: funcao.liberado, mt: 0.5 }}>
                                                        {it.raciocinio_contagem}
                                                    </Typography>
                                                )}
                                            </Box>
                                        );
                                    })}

                                    {(resultadoIa.itens_nao_catalogados || []).map((nr) => (
                                        <Box key={nr.id} sx={{ p: 1, borderRadius: 1.5, bgcolor: tom(funcao.alerta, 0.08), border: `1px solid ${tom(funcao.alerta, 0.35)}` }}>
                                            <Typography sx={{ fontSize: tamanhos.xs, fontWeight: 700, color: funcao.alerta }}>
                                                Não catalogado: {nr.descricao} — {nr.quantidade} un.
                                            </Typography>
                                        </Box>
                                    ))}
                                </Stack>

                                <NeonButton
                                    fullWidth
                                    size="small"
                                    loading={salvando}
                                    startIcon={<SalvarIcon />}
                                    onClick={handleSalvarConferenciaVideo}
                                    sx={{ mt: 1.5 }}
                                >
                                    Salvar contagem do vídeo na conferência oficial
                                </NeonButton>
                            </Box>
                        )}
                    </Stack>
                </Grid>
            </Grid>
        </GlassCard>
    );
};

export default PainelAnaliseVideoIa;
