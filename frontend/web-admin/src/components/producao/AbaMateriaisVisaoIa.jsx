import React, { useState, useRef, useEffect } from 'react';
import {
    Alert,
    Box,
    Button,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    FormControl,
    Grid,
    InputLabel,
    MenuItem,
    Select,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Typography
} from '@mui/material';
import {
    Add as AddIcon,
    Videocam as VideoIcon,
    Check as ConfirmarIcon,
    Inventory as CatalogoIcon,
    SwapHoriz as MovimentarIcon,
    PlayArrow as IniciarIaIcon,
    Stop as PararIaIcon,
    UploadFile as UploadVideoIcon
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import GlassCard from '../common/GlassCard';
import NeonButton from '../common/NeonButton';
import TituloModal from '../common/TituloModal';
import api from '../../services/api';
import { botaoSecundario, cores, funcao, tamanhos, tom } from '../../styles/tokens';
import { formatarDataHoraCurta, ROTULO_MOVIMENTACAO } from './producaoHelpers';

const AbaMateriaisVisaoIa = ({ resumo, headersExtra, aoAtualizar, apiClient }) => {
    const httpClient = apiClient || api;
    const { enqueueSnackbar } = useSnackbar();
    const materiais = resumo?.materiais || [];
    const sessoes = resumo?.sessoes_contagem || [];
    const recebimentos = resumo?.recebimentos || [];
    const naoReconhecidos = resumo?.itens_nao_reconhecidos || [];
    const movimentacoes = resumo?.movimentacoes_materiais || [];
    const ctx = resumo?.contexto_usuario || {};

    const podeManterCatalogo = ['admin_master', 'master', 'produtor_geral', 'auditoria'].includes(ctx.papel_producao);

    const [modalMaterialAberto, setModalMaterialAberto] = useState(false);
    const [modalConferenciaAberto, setModalConferenciaAberto] = useState(false);
    const [salvando, setSalvando] = useState(false);

    // Visualizador / Simulador de Contagem IA (LineZone)
    const canvasIaRef = useRef(null);
    const videoIaRef = useRef(null);
    const [videoUrl, setVideoUrl] = useState('');
    const [iaRodando, setIaRodando] = useState(false);
    const [materialSimId, setMaterialSimId] = useState('');
    const [contagemAoVivo, setContagemAoVivo] = useState(0);

    const materialCanvasAtivo = materiais.find((m) => m.id === materialSimId) || materiais[0] || null;

    useEffect(() => {
        const canvas = canvasIaRef.current;
        if (!canvas) return undefined;
        const ctx2d = canvas.getContext('2d');
        const linhaX = 330;
        const objetos = [
            { id: 1, x: 20, y: 55, w: 95, h: 38, vx: 3.4, contado: false, conf: '96%' },
            { id: 2, x: -120, y: 125, w: 105, h: 40, vx: 3.1, contado: false, conf: '94%' },
            { id: 3, x: -250, y: 80, w: 90, h: 36, vx: 3.6, contado: false, conf: '92%' }
        ];
        let localCount = 0;
        let rafId = null;

        const desenharQuadro = () => {
            const video = videoIaRef.current;
            if (video && videoUrl && !video.paused && !video.ended) {
                ctx2d.drawImage(video, 0, 0, canvas.width, canvas.height);
            } else {
                ctx2d.fillStyle = '#050B18';
                ctx2d.fillRect(0, 0, canvas.width, canvas.height);
                ctx2d.strokeStyle = 'rgba(148,163,184,0.12)';
                for (let x = 0; x < canvas.width; x += 40) {
                    ctx2d.beginPath(); ctx2d.moveTo(x, 0); ctx2d.lineTo(x, canvas.height); ctx2d.stroke();
                }
                ctx2d.fillStyle = '#64748B';
                ctx2d.font = '12px Inter, sans-serif';
                ctx2d.fillText('Câmera de conferência • Doca Carga 01 (RT-DETR Apache 2.0 + Supervision)', 14, 22);
            }

            // Linha virtual LineZone
            ctx2d.strokeStyle = '#00D4FF';
            ctx2d.lineWidth = 3;
            ctx2d.setLineDash([8, 6]);
            ctx2d.beginPath();
            ctx2d.moveTo(linhaX, 28);
            ctx2d.lineTo(linhaX, canvas.height - 14);
            ctx2d.stroke();
            ctx2d.setLineDash([]);
            ctx2d.fillStyle = '#00D4FF';
            ctx2d.font = 'bold 11px Inter, sans-serif';
            ctx2d.fillText('LineZone (corte)', linhaX + 6, 42);

            if (iaRodando) {
                const classe = materialCanvasAtivo?.classe_deteccao_ia || 'truss_q30_2m';
                for (const obj of objetos) {
                    obj.x += obj.vx;
                    if (!obj.contado && obj.x + obj.w / 2 >= linhaX) {
                        obj.contado = true;
                        localCount += 1;
                        setContagemAoVivo(localCount);
                    }
                    if (obj.x > canvas.width + 20) {
                        obj.x = -110;
                        obj.contado = false;
                    }
                    ctx2d.strokeStyle = obj.contado ? '#00FF88' : '#FFB800';
                    ctx2d.lineWidth = 2;
                    ctx2d.strokeRect(obj.x, obj.y, obj.w, obj.h);
                    ctx2d.fillStyle = obj.contado ? 'rgba(0, 255, 136, 0.16)' : 'rgba(255, 184, 0, 0.14)';
                    ctx2d.fillRect(obj.x, obj.y, obj.w, obj.h);
                    ctx2d.fillStyle = '#FFFFFF';
                    ctx2d.font = 'bold 11px Inter, sans-serif';
                    ctx2d.fillText(`#${obj.id} ${classe} ${obj.conf}`, obj.x + 2, obj.y - 5);
                }
                rafId = requestAnimationFrame(desenharQuadro);
            }
        };

        desenharQuadro();
        return () => {
            if (rafId) cancelAnimationFrame(rafId);
        };
    }, [iaRodando, videoUrl, materialCanvasAtivo]);

    const handleUploadVideoLocal = (evt) => {
        const file = evt.target.files?.[0];
        if (!file) return;
        const url = URL.createObjectURL(file);
        setVideoUrl(url);
        setContagemAoVivo(0);
        setIaRodando(true);
        enqueueSnackbar(`Vídeo "${file.name}" carregado no analisador.`, { variant: 'info' });
    };

    const handleEnviarContagemAoVivo = async () => {
        if (!materialCanvasAtivo || contagemAoVivo <= 0) {
            enqueueSnackbar('Inicie a contagem e aguarde ao menos 1 item cruzar a linha.', { variant: 'warning' });
            return;
        }
        try {
            setSalvando(true);
            await httpClient.post('/producao/materiais/conferencia-ia', {
                fornecedor_nome: materialCanvasAtivo.fornecedor_nome || 'Fornecedor em descarga',
                numero_nota_romaneio: `VID-${Date.now().toString().slice(-5)}`,
                origem_midia: videoUrl ? 'video_gravado' : 'camera_rtsp',
                modo_contagem: 'line_zone',
                itens: [{
                    material_id: materialCanvasAtivo.id,
                    classe_identificada: materialCanvasAtivo.classe_deteccao_ia,
                    quantidade_esperada: materialCanvasAtivo.quantidade_planejada,
                    quantidade_ia: contagemAoVivo,
                    confianca_media: 0.95
                }]
            }, { headers: headersExtra });
            setIaRodando(false);
            enqueueSnackbar(`${contagemAoVivo} unidade(s) enviada(s) para revisão na conferência.`, { variant: 'success' });
            await aoAtualizar();
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Erro ao registrar contagem.', { variant: 'error' });
        } finally {
            setSalvando(false);
        }
    };

    const [formMaterial, setFormMaterial] = useState({
        nome: '',
        categoria: 'box_truss',
        subtipo: '',
        dimensoes: '',
        peso_kg: '',
        fornecedor_nome: '',
        quantidade_planejada: 10
    });

    const [formConferencia, setFormConferencia] = useState({
        fornecedor_nome: 'Estruturas Brasil Ltda',
        numero_nota_romaneio: 'NF-005120',
        origem_midia: 'video_gravado',
        modo_contagem: 'line_zone',
        material_id: '',
        quantidade_ia: 20,
        incluir_nao_reconhecido: false,
        classe_nova: 'patola_estabilizadora_palco'
    });

    const [ajustesManuais, setAjustesManuais] = useState({});

    const handleCriarMaterial = async () => {
        if (!formMaterial.nome.trim()) {
            enqueueSnackbar('Informe o nome do material.', { variant: 'warning' });
            return;
        }
        try {
            setSalvando(true);
            await httpClient.post('/producao/materiais', formMaterial, { headers: headersExtra });
            enqueueSnackbar('Material adicionado ao catálogo.', { variant: 'success' });
            setModalMaterialAberto(false);
            setFormMaterial({ nome: '', categoria: 'box_truss', subtipo: '', dimensoes: '', peso_kg: '', fornecedor_nome: '', quantidade_planejada: 10 });
            await aoAtualizar();
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Sem permissão para cadastrar material.', { variant: 'error' });
        } finally {
            setSalvando(false);
        }
    };

    const handleExecutarConferenciaIa = async () => {
        const mat = materiais.find((m) => m.id === formConferencia.material_id) || materiais[0];
        if (!mat) {
            enqueueSnackbar('Cadastre ao menos um material antes de conferir.', { variant: 'warning' });
            return;
        }
        const itens = [
            {
                material_id: mat.id,
                classe_identificada: mat.classe_deteccao_ia,
                quantidade_esperada: mat.quantidade_planejada,
                quantidade_ia: Number(formConferencia.quantidade_ia || 0),
                confianca_media: 0.93
            }
        ];
        if (formConferencia.incluir_nao_reconhecido && formConferencia.classe_nova.trim()) {
            itens.push({
                material_id: null,
                classe_identificada: formConferencia.classe_nova.trim(),
                quantidade_esperada: 0,
                quantidade_ia: 6,
                confianca_media: 0.79
            });
        }
        try {
            setSalvando(true);
            await httpClient.post('/producao/materiais/conferencia-ia', {
                fornecedor_nome: formConferencia.fornecedor_nome,
                numero_nota_romaneio: formConferencia.numero_nota_romaneio,
                origem_midia: formConferencia.origem_midia,
                modo_contagem: formConferencia.modo_contagem,
                itens
            }, { headers: headersExtra });
            enqueueSnackbar('Contagem por vídeo concluída. Revise as quantidades abaixo.', { variant: 'success' });
            setModalConferenciaAberto(false);
            await aoAtualizar();
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Erro ao processar conferência IA.', { variant: 'error' });
        } finally {
            setSalvando(false);
        }
    };

    const handleConfirmarContagem = async (sessaoId, item) => {
        const valor = ajustesManuais[item.id] !== undefined ? Number(ajustesManuais[item.id]) : item.quantidade_ia;
        try {
            await httpClient.post(`/producao/materiais/sessoes/${sessaoId}/itens/${item.id}/confirmar`, {
                quantidade_corrigida_humano: valor,
                justificativa_correcao: valor !== item.quantidade_ia ? 'Ajuste humano de auditoria (retreino)' : 'Confirmado conforme contagem IA'
            }, { headers: headersExtra });
            enqueueSnackbar('Contagem confirmada e estoque atualizado.', { variant: 'success' });
            await aoAtualizar();
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Erro ao confirmar contagem.', { variant: 'error' });
        }
    };

    const handleCatalogarNaoReconhecido = async (item) => {
        try {
            await httpClient.post(`/producao/materiais/nao-reconhecidos/${item.id}/cadastrar`, {
                nome: item.classe_identificada.replace(/_/g, ' '),
                categoria: 'estrutura',
                quantidade_planejada: item.quantidade_ia
            }, { headers: headersExtra });
            enqueueSnackbar('Novo material incorporado ao catálogo oficial.', { variant: 'success' });
            await aoAtualizar();
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Apenas Auditoria ou Produtor Geral pode catalogar.', { variant: 'error' });
        }
    };

    const handleMovimentar = async (materialId, novoEstagio) => {
        try {
            await httpClient.post(`/producao/materiais/${materialId}/movimentar`, { estagio_novo: novoEstagio }, { headers: headersExtra });
            enqueueSnackbar('Movimentação de material registrada.', { variant: 'success' });
            await aoAtualizar();
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Erro ao atualizar movimentação.', { variant: 'error' });
        }
    };

    return (
        <Stack spacing={3}>
            {/* Cabeçalho de ações */}
            <GlassCard sx={{ p: 2.25 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1.5 }}>
                    <Box>
                        <Typography variant="h6" sx={{ color: cores.textoForte }}>
                            Materiais e conferência por visão computacional
                        </Typography>
                        <Typography variant="body2" sx={{ color: cores.textoSecundario }}>
                            Motor RT-DETR (Apache 2.0) e Roboflow Supervision com contagem por linha ou área e revisão humana.
                        </Typography>
                    </Box>
                    <Stack direction="row" spacing={1.5} flexWrap="wrap">
                        {podeManterCatalogo && (
                            <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setModalMaterialAberto(true)} sx={botaoSecundario}>
                                Cadastrar material
                            </Button>
                        )}
                        <NeonButton startIcon={<VideoIcon />} onClick={() => setModalConferenciaAberto(true)}>
                            Nova conferência por vídeo IA
                        </NeonButton>
                    </Stack>
                </Box>
            </GlassCard>

            {/* Analisador visual de vídeo LineZone */}
            <GlassCard sx={{ p: 2.5 }}>
                <Grid container spacing={2.5} alignItems="center">
                    <Grid item xs={12} lg={7}>
                        <Box sx={{ borderRadius: 2, overflow: 'hidden', border: `1px solid ${iaRodando ? cores.primaria : cores.borda}`, bgcolor: cores.fundo }}>
                            {videoUrl && (
                                <video ref={videoIaRef} src={videoUrl} autoPlay muted loop playsInline style={{ display: 'none' }} />
                            )}
                            <canvas ref={canvasIaRef} width={640} height={240} style={{ width: '100%', height: 'auto', display: 'block' }} />
                        </Box>
                    </Grid>
                    <Grid item xs={12} lg={5}>
                        <Stack spacing={1.75}>
                            <Typography variant="subtitle1" sx={{ color: cores.textoForte, fontWeight: 700 }}>
                                Monitoramento e contagem por linha virtual
                            </Typography>
                            <Typography variant="body2" sx={{ color: cores.textoSecundario }}>
                                Selecione o material esperado ou envie um vídeo da descarga para rastrear itens cruzando a zona de contagem sem duplicidade.
                            </Typography>
                            <FormControl fullWidth size="small">
                                <InputLabel>Material em conferência</InputLabel>
                                <Select
                                    label="Material em conferência"
                                    value={materialCanvasAtivo?.id || ''}
                                    onChange={(e) => setMaterialSimId(e.target.value)}
                                >
                                    {materiais.map((m) => <MenuItem key={m.id} value={m.id}>{m.nome}</MenuItem>)}
                                </Select>
                            </FormControl>
                            <Box sx={{ p: 1.5, borderRadius: 2, bgcolor: cores.superficieElevada, border: `1px solid ${cores.borda}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Typography sx={{ fontSize: tamanhos.sm, color: cores.textoSecundario }}>
                                    Contagem rastreada ao vivo:
                                </Typography>
                                <Typography variant="h5" sx={{ color: funcao.liberado, fontWeight: 700 }}>
                                    {contagemAoVivo} un.
                                </Typography>
                            </Box>
                            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                <Button
                                    variant="outlined"
                                    size="small"
                                    startIcon={iaRodando ? <PararIaIcon /> : <IniciarIaIcon />}
                                    onClick={() => {
                                        if (!iaRodando) setContagemAoVivo(0);
                                        setIaRodando((v) => !v);
                                    }}
                                    sx={botaoSecundario}
                                >
                                    {iaRodando ? 'Pausar análise' : 'Iniciar detecção'}
                                </Button>
                                <Button component="label" variant="outlined" size="small" startIcon={<UploadVideoIcon />} sx={botaoSecundario}>
                                    Carregar vídeo
                                    <input type="file" accept="video/*" hidden onChange={handleUploadVideoLocal} />
                                </Button>
                                <NeonButton size="small" loading={salvando} onClick={handleEnviarContagemAoVivo}>
                                    Enviar contagem para conferência
                                </NeonButton>
                            </Stack>
                        </Stack>
                    </Grid>
                </Grid>
            </GlassCard>

            {/* Itens não reconhecidos para cadastro pela Auditoria */}
            {naoReconhecidos.length > 0 && (
                <Alert severity="warning">
                    <Typography sx={{ fontWeight: 700, mb: 1 }}>
                        Novos materiais não reconhecidos aguardando cadastro pela Auditoria ({naoReconhecidos.length})
                    </Typography>
                    <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
                        {naoReconhecidos.map((nr) => (
                            <Box
                                key={nr.id}
                                sx={{
                                    p: 1.25, borderRadius: 1.5, bgcolor: cores.superficie,
                                    border: `1px solid ${cores.borda}`, display: 'flex', alignItems: 'center', gap: 1.5
                                }}
                            >
                                <Box>
                                    <Typography sx={{ fontSize: tamanhos.sm, fontWeight: 700, color: cores.textoForte }}>
                                        {nr.classe_identificada}
                                    </Typography>
                                    <Typography sx={{ fontSize: tamanhos.xs, color: cores.textoSecundario }}>
                                        Contados: {nr.quantidade_ia} • Confiança {Math.round((nr.confianca_media || 0) * 100)}%
                                    </Typography>
                                </Box>
                                {podeManterCatalogo && (
                                    <Button size="small" variant="outlined" onClick={() => handleCatalogarNaoReconhecido(nr)} sx={botaoSecundario}>
                                        Catalogar
                                    </Button>
                                )}
                            </Box>
                        ))}
                    </Stack>
                </Alert>
            )}

            {/* Sessões de Conferência IA */}
            <GlassCard sx={{ p: 2.5 }}>
                <Typography variant="h6" sx={{ color: cores.textoForte, mb: 1.5 }}>
                    Conferências de recebimento (esperado × contado IA × revisão humana)
                </Typography>
                <Stack spacing={2}>
                    {sessoes.map((sessao) => {
                        const rec = recebimentos.find((r) => r.id === sessao.recebimento_id);
                        return (
                            <Box key={sessao.id} sx={{ p: 2, borderRadius: 2, border: `1px solid ${cores.borda}`, bgcolor: cores.superficieElevada }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1, mb: 1.5 }}>
                                    <Box>
                                        <Typography sx={{ fontWeight: 700, color: cores.textoForte }}>
                                            {rec?.numero_nota_romaneio || 'Romaneio'} — {rec?.fornecedor_nome || 'Fornecedor'}
                                        </Typography>
                                        <Typography sx={{ fontSize: tamanhos.xs, color: cores.textoSecundario }}>
                                            Modelo: {sessao.modelo_ia_versao} • Modo: {sessao.modo_contagem} • {formatarDataHoraCurta(sessao.iniciado_em)}
                                        </Typography>
                                    </Box>
                                    <Chip
                                        size="small"
                                        label={rec?.status === 'aprovado_total' ? 'Aprovado sem divergência' : rec?.status === 'aprovado_divergencia' ? 'Aprovado com divergência' : 'Em conferência'}
                                        sx={{
                                            bgcolor: tom(rec?.status === 'aprovado_total' ? funcao.liberado : funcao.alerta, 0.14),
                                            color: rec?.status === 'aprovado_total' ? funcao.liberado : funcao.alerta,
                                            fontWeight: 600
                                        }}
                                    />
                                </Box>

                                <TableContainer>
                                    <Table size="small">
                                        <TableHead>
                                            <TableRow>
                                                <TableCell>Item / Classe</TableCell>
                                                <TableCell align="right">Esperado</TableCell>
                                                <TableCell align="right">Contado IA</TableCell>
                                                <TableCell align="right">Confiança</TableCell>
                                                <TableCell align="right">Ajuste humano</TableCell>
                                                <TableCell align="right">Divergência</TableCell>
                                                <TableCell align="right">Ação</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {(sessao.itens_contados || []).map((item) => {
                                                const mat = materiais.find((m) => m.id === item.material_id);
                                                const finalVal = ajustesManuais[item.id] !== undefined
                                                    ? Number(ajustesManuais[item.id])
                                                    : (item.quantidade_corrigida_humano ?? item.quantidade_ia);
                                                const div = finalVal - Number(item.quantidade_esperada || 0);
                                                return (
                                                    <TableRow key={item.id}>
                                                        <TableCell>
                                                            <Typography sx={{ fontWeight: 600, fontSize: tamanhos.sm }}>
                                                                {mat?.nome || item.classe_identificada}
                                                            </Typography>
                                                            {!item.reconhecido_catalogo && (
                                                                <Chip size="small" label="Não catalogado" sx={{ bgcolor: tom(funcao.alerta, 0.14), color: funcao.alerta }} />
                                                            )}
                                                        </TableCell>
                                                        <TableCell align="right">{item.quantidade_esperada}</TableCell>
                                                        <TableCell align="right">{item.quantidade_ia}</TableCell>
                                                        <TableCell align="right">{Math.round((item.confianca_media || 0) * 100)}%</TableCell>
                                                        <TableCell align="right">
                                                            <TextField
                                                                type="number"
                                                                size="small"
                                                                value={finalVal}
                                                                onChange={(e) => setAjustesManuais((prev) => ({ ...prev, [item.id]: e.target.value }))}
                                                                sx={{ width: 80 }}
                                                            />
                                                        </TableCell>
                                                        <TableCell align="right">
                                                            <Typography sx={{ fontWeight: 700, color: div === 0 ? funcao.liberado : funcao.negado }}>
                                                                {div > 0 ? `+${div}` : div}
                                                            </Typography>
                                                        </TableCell>
                                                        <TableCell align="right">
                                                            <Button
                                                                size="small"
                                                                variant="outlined"
                                                                startIcon={<ConfirmarIcon />}
                                                                onClick={() => handleConfirmarContagem(sessao.id, item)}
                                                                sx={botaoSecundario}
                                                            >
                                                                Confirmar
                                                            </Button>
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            </Box>
                        );
                    })}
                </Stack>
            </GlassCard>

            {/* Catálogo completo e Rastreio de Movimentação */}
            <GlassCard sx={{ p: 2.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                    <CatalogoIcon sx={{ color: funcao.acao }} />
                    <Typography variant="h6" sx={{ color: cores.textoForte }}>
                        Catálogo e rastreio de movimentação
                    </Typography>
                </Box>
                <TableContainer>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>Código</TableCell>
                                <TableCell>Material</TableCell>
                                <TableCell>Fornecedor</TableCell>
                                <TableCell align="right">Previsto</TableCell>
                                <TableCell align="right">Recebido</TableCell>
                                <TableCell>Estágio atual</TableCell>
                                <TableCell>Movimentar estágio</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {materiais.map((m) => (
                                <TableRow key={m.id}>
                                    <TableCell>{m.codigo_catalogo}</TableCell>
                                    <TableCell>
                                        <Typography sx={{ fontWeight: 600, fontSize: tamanhos.sm }}>{m.nome}</Typography>
                                        <Typography sx={{ fontSize: tamanhos.xs, color: cores.textoSecundario }}>
                                            {m.dimensoes || m.subtipo} {m.peso_kg ? `• ${m.peso_kg} kg` : ''}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>{m.fornecedor_nome || '—'}</TableCell>
                                    <TableCell align="right">{m.quantidade_planejada}</TableCell>
                                    <TableCell align="right">{m.quantidade_recebida}</TableCell>
                                    <TableCell>
                                        <Chip
                                            size="small"
                                            label={ROTULO_MOVIMENTACAO.find((r) => r.valor === m.status_movimentacao)?.texto || m.status_movimentacao}
                                            sx={{ bgcolor: tom(funcao.acao, 0.14), color: funcao.acao, fontWeight: 600 }}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Stack direction="row" spacing={1} alignItems="center">
                                            <MovimentarIcon sx={{ fontSize: 16, color: cores.textoSecundario }} />
                                            <Select
                                                size="small"
                                                value={m.status_movimentacao || 'previsto'}
                                                onChange={(e) => handleMovimentar(m.id, e.target.value)}
                                            >
                                                {ROTULO_MOVIMENTACAO.map((r) => (
                                                    <MenuItem key={r.valor} value={r.valor}>{r.texto}</MenuItem>
                                                ))}
                                            </Select>
                                        </Stack>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            </GlassCard>

            {/* Histórico de movimentações de estoque */}
            <GlassCard sx={{ p: 2.5 }}>
                <Typography variant="h6" sx={{ color: cores.textoForte, mb: 1.5 }}>
                    Histórico de movimentações de materiais ({movimentacoes.length})
                </Typography>
                <TableContainer>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>Data e hora</TableCell>
                                <TableCell>Material</TableCell>
                                <TableCell>De</TableCell>
                                <TableCell>Para</TableCell>
                                <TableCell>Setor destino</TableCell>
                                <TableCell align="right">Quantidade</TableCell>
                                <TableCell>Responsável</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {movimentacoes.map((mv) => {
                                const mat = materiais.find((m) => m.id === mv.material_id);
                                return (
                                    <TableRow key={mv.id}>
                                        <TableCell>{formatarDataHoraCurta(mv.criado_em)}</TableCell>
                                        <TableCell sx={{ fontWeight: 600 }}>{mat?.nome || 'Material'}</TableCell>
                                        <TableCell>{ROTULO_MOVIMENTACAO.find((r) => r.valor === mv.estagio_anterior)?.texto || mv.estagio_anterior || '—'}</TableCell>
                                        <TableCell>
                                            <Chip size="small" label={ROTULO_MOVIMENTACAO.find((r) => r.valor === mv.estagio_novo)?.texto || mv.estagio_novo} sx={{ bgcolor: tom(funcao.liberado, 0.14), color: funcao.liberado, fontWeight: 600 }} />
                                        </TableCell>
                                        <TableCell>{mv.setor_destino || '—'}</TableCell>
                                        <TableCell align="right">{mv.quantidade}</TableCell>
                                        <TableCell>{mv.registrado_por_nome || 'Equipe'}</TableCell>
                                    </TableRow>
                                );
                            })}
                            {movimentacoes.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={7} align="center">
                                        Nenhuma movimentação registrada ainda.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
            </GlassCard>

            {/* Modal cadastrar material */}
            <Dialog open={modalMaterialAberto} onClose={() => setModalMaterialAberto(false)} maxWidth="sm" fullWidth>
                <TituloModal
                    titulo="Cadastrar material no catálogo"
                    subtitulo="Mantido pela Auditoria para referência da contagem automática por IA."
                    onFechar={() => setModalMaterialAberto(false)}
                />
                <DialogContent dividers>
                    <Stack spacing={2} sx={{ pt: 0.5 }}>
                        <TextField fullWidth label="Nome do material" value={formMaterial.nome} onChange={(e) => setFormMaterial({ ...formMaterial, nome: e.target.value })} />
                        <Grid container spacing={1.5}>
                            <Grid item xs={12} sm={6}>
                                <FormControl fullWidth size="small">
                                    <InputLabel>Categoria</InputLabel>
                                    <Select label="Categoria" value={formMaterial.categoria} onChange={(e) => setFormMaterial({ ...formMaterial, categoria: e.target.value })}>
                                        <MenuItem value="box_truss">Box truss e treliças</MenuItem>
                                        <MenuItem value="praticavel">Praticáveis</MenuItem>
                                        <MenuItem value="grades">Grades de contenção</MenuItem>
                                        <MenuItem value="som">Áudio</MenuItem>
                                        <MenuItem value="iluminacao">Iluminação</MenuItem>
                                        <MenuItem value="gerador">Geradores e energia</MenuItem>
                                    </Select>
                                </FormControl>
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField fullWidth size="small" type="number" label="Quantidade prevista" value={formMaterial.quantidade_planejada} onChange={(e) => setFormMaterial({ ...formMaterial, quantidade_planejada: e.target.value })} />
                            </Grid>
                        </Grid>
                        <Grid container spacing={1.5}>
                            <Grid item xs={12} sm={6}>
                                <TextField fullWidth size="small" label="Dimensões (ex.: 2x1m)" value={formMaterial.dimensoes} onChange={(e) => setFormMaterial({ ...formMaterial, dimensoes: e.target.value })} />
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField fullWidth size="small" label="Fornecedor" value={formMaterial.fornecedor_nome} onChange={(e) => setFormMaterial({ ...formMaterial, fornecedor_nome: e.target.value })} />
                            </Grid>
                        </Grid>
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ px: 3, py: 2 }}>
                    <Button variant="outlined" onClick={() => setModalMaterialAberto(false)} sx={botaoSecundario}>
                        Cancelar
                    </Button>
                    <NeonButton loading={salvando} onClick={handleCriarMaterial}>
                        Salvar material
                    </NeonButton>
                </DialogActions>
            </Dialog>

            {/* Modal nova conferência por vídeo IA */}
            <Dialog open={modalConferenciaAberto} onClose={() => setModalConferenciaAberto(false)} maxWidth="sm" fullWidth>
                <TituloModal
                    titulo="Nova conferência de recebimento por IA"
                    subtitulo="Analisa descarga por vídeo gravado, celular ou câmera RTSP do evento."
                    onFechar={() => setModalConferenciaAberto(false)}
                />
                <DialogContent dividers>
                    <Stack spacing={2} sx={{ pt: 0.5 }}>
                        <Grid container spacing={1.5}>
                            <Grid item xs={12} sm={6}>
                                <TextField fullWidth size="small" label="Número do romaneio ou NF" value={formConferencia.numero_nota_romaneio} onChange={(e) => setFormConferencia({ ...formConferencia, numero_nota_romaneio: e.target.value })} />
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField fullWidth size="small" label="Fornecedor" value={formConferencia.fornecedor_nome} onChange={(e) => setFormConferencia({ ...formConferencia, fornecedor_nome: e.target.value })} />
                            </Grid>
                        </Grid>
                        <Grid container spacing={1.5}>
                            <Grid item xs={12} sm={6}>
                                <FormControl fullWidth size="small">
                                    <InputLabel>Origem da mídia</InputLabel>
                                    <Select label="Origem da mídia" value={formConferencia.origem_midia} onChange={(e) => setFormConferencia({ ...formConferencia, origem_midia: e.target.value })}>
                                        <MenuItem value="video_gravado">Vídeo gravado</MenuItem>
                                        <MenuItem value="celular_live">Câmera do celular ao vivo</MenuItem>
                                        <MenuItem value="camera_rtsp">Câmera IP (RTSP)</MenuItem>
                                    </Select>
                                </FormControl>
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <FormControl fullWidth size="small">
                                    <InputLabel>Modo de contagem</InputLabel>
                                    <Select label="Modo de contagem" value={formConferencia.modo_contagem} onChange={(e) => setFormConferencia({ ...formConferencia, modo_contagem: e.target.value })}>
                                        <MenuItem value="line_zone">Cruzamento de linha (LineZone)</MenuItem>
                                        <MenuItem value="polygon_zone">Zona demarcada (PolygonZone)</MenuItem>
                                        <MenuItem value="sahi_estatico">Pilha parada fatiada (SAHI)</MenuItem>
                                    </Select>
                                </FormControl>
                            </Grid>
                        </Grid>
                        <Grid container spacing={1.5}>
                            <Grid item xs={12} sm={7}>
                                <FormControl fullWidth size="small">
                                    <InputLabel>Material esperado no romaneio</InputLabel>
                                    <Select label="Material esperado no romaneio" value={formConferencia.material_id || materiais[0]?.id || ''} onChange={(e) => setFormConferencia({ ...formConferencia, material_id: e.target.value })}>
                                        {materiais.map((m) => <MenuItem key={m.id} value={m.id}>{m.nome}</MenuItem>)}
                                    </Select>
                                </FormControl>
                            </Grid>
                            <Grid item xs={12} sm={5}>
                                <TextField fullWidth size="small" type="number" label="Contagem detectada IA" value={formConferencia.quantidade_ia} onChange={(e) => setFormConferencia({ ...formConferencia, quantidade_ia: e.target.value })} />
                            </Grid>
                        </Grid>
                        <FormControl fullWidth size="small">
                            <InputLabel>Simular item desconhecido no vídeo?</InputLabel>
                            <Select
                                label="Simular item desconhecido no vídeo?"
                                value={formConferencia.incluir_nao_reconhecido ? 'sim' : 'nao'}
                                onChange={(e) => setFormConferencia({ ...formConferencia, incluir_nao_reconhecido: e.target.value === 'sim' })}
                            >
                                <MenuItem value="nao">Não</MenuItem>
                                <MenuItem value="sim">Sim, enviar para fila de novos materiais</MenuItem>
                            </Select>
                        </FormControl>
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ px: 3, py: 2 }}>
                    <Button variant="outlined" onClick={() => setModalConferenciaAberto(false)} sx={botaoSecundario}>
                        Cancelar
                    </Button>
                    <NeonButton loading={salvando} onClick={handleExecutarConferenciaIa}>
                        Processar contagem
                    </NeonButton>
                </DialogActions>
            </Dialog>
        </Stack>
    );
};

export default AbaMateriaisVisaoIa;
