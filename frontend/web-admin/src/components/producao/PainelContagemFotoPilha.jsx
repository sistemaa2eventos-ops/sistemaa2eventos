import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
    Alert,
    Box,
    Button,
    Chip,
    FormControl,
    Grid,
    InputLabel,
    MenuItem,
    Select,
    Stack,
    TextField,
    Typography
} from '@mui/material';
import {
    AutoAwesome as IaIcon,
    CheckCircle as SalvarIcon,
    PhotoCamera as CameraIcon,
    RestartAlt as LimparIcon,
    UploadFile as UploadIcon
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import GlassCard from '../common/GlassCard';
import NeonButton from '../common/NeonButton';
import ModalCameraCaptura from './ModalCameraCaptura';
import { comprimirImagemCliente } from '../../services/ProducaoSyncService';
import { botaoSecundario, cores, funcao, tamanhos, tom } from '../../styles/tokens';

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
 * Painel de contagem por Foto Estática (Pilha, Pallet, Caminhão ou Estoque)
 * usando Gemini Vision no backend e renderização de caixas verdes estilo industrial.
 */
const PainelContagemFotoPilha = ({
    materiais = [],
    areas = [],
    httpClient,
    headersExtra,
    aoAtualizar
}) => {
    const { enqueueSnackbar } = useSnackbar();
    const canvasRef = useRef(null);

    const [fotoDataUrl, setFotoDataUrl] = useState('');
    const [escopoMaterialId, setEscopoMaterialId] = useState('todos');
    const [contextoLocal, setContextoLocal] = useState('Armazém / Carga');
    const [observacaoOperador, setObservacaoOperador] = useState('');
    const [analisando, setAnalisando] = useState(false);
    const [salvando, setSalvando] = useState(false);
    const [erroIa, setErroIa] = useState('');
    const [resultadoIa, setResultadoIa] = useState(null);
    const [ajustesQtd, setAjustesQtd] = useState({});
    const [cameraAberta, setCameraAberta] = useState(false);

    const renderizarCanvasAnotado = useCallback((imgUrl, resultado) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        if (!imgUrl) {
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
            ctx.fillText('Tire uma foto ou carregue uma imagem de pilha, pallet ou caminhão', 40, 265);
            ctx.font = '14px Inter, sans-serif';
            ctx.fillText('A IA identifica cada bloco/unidade e desenha as caixas verdes com o total automaticamente.', 40, 295);
            return;
        }

        const img = new Image();
        img.onload = () => {
            const maxW = 1200;
            const escala = Math.min(1, maxW / Math.max(1, img.width));
            const cw = Math.max(480, Math.round(img.width * escala));
            const ch = Math.max(270, Math.round(img.height * escala));
            canvas.width = cw;
            canvas.height = ch;

            ctx.drawImage(img, 0, 0, cw, ch);

            if (!resultado) return;

            const scaleFont = Math.max(0.85, cw / 960);

            // Caixas verdes para itens do catálogo
            const itens = Array.isArray(resultado.itens_identificados) ? resultado.itens_identificados : [];
            itens.forEach((item) => {
                const grupos = Array.isArray(item.grupos) ? item.grupos : [];
                grupos.forEach((g) => {
                    if (!Array.isArray(g.box_2d) || g.box_2d.length !== 4) return;
                    const [ymin, xmin, ymax, xmax] = g.box_2d;
                    const x = (xmin / 1000) * cw;
                    const y = (ymin / 1000) * ch;
                    const w = ((xmax - xmin) / 1000) * cw;
                    const h = ((ymax - ymin) / 1000) * ch;

                    // Caixa verde neon
                    ctx.save();
                    desenharRetanguloArredondado(ctx, x, y, w, h, 8);
                    ctx.fillStyle = 'rgba(16, 185, 129, 0.12)';
                    ctx.fill();
                    ctx.lineWidth = Math.max(2.5, 3.2 * scaleFont);
                    ctx.strokeStyle = cores.sucesso;
                    ctx.stroke();

                    // Etiqueta pill verde acima da caixa
                    const texto = g.rotulo || `${g.quantidade} ${item.unidade || 'un'}`;
                    ctx.font = `700 ${Math.round(16 * scaleFont)}px Inter, sans-serif`;
                    const textW = ctx.measureText(texto).width;
                    const pillW = textW + 20 * scaleFont;
                    const pillH = 28 * scaleFont;
                    const pillX = Math.max(6, Math.min(cw - pillW - 6, x + (w - pillW) / 2));
                    const pillY = Math.max(6, y - pillH - 4);

                    desenharRetanguloArredondado(ctx, pillX, pillY, pillW, pillH, 7);
                    ctx.fillStyle = cores.sucesso;
                    ctx.fill();
                    ctx.fillStyle = '#06281E';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(texto, pillX + 10 * scaleFont, pillY + pillH / 2 + 1);
                    ctx.restore();
                });
            });

            // Caixas âmbar para itens não catalogados
            const naoCat = Array.isArray(resultado.itens_nao_catalogados) ? resultado.itens_nao_catalogados : [];
            naoCat.forEach((nr) => {
                if (!Array.isArray(nr.box_2d) || nr.box_2d.length !== 4) return;
                const [ymin, xmin, ymax, xmax] = nr.box_2d;
                const x = (xmin / 1000) * cw;
                const y = (ymin / 1000) * ch;
                const w = ((xmax - xmin) / 1000) * cw;
                const h = ((ymax - ymin) / 1000) * ch;

                ctx.save();
                desenharRetanguloArredondado(ctx, x, y, w, h, 8);
                ctx.fillStyle = 'rgba(245, 158, 11, 0.12)';
                ctx.fill();
                ctx.lineWidth = Math.max(2, 2.5 * scaleFont);
                ctx.strokeStyle = cores.alerta;
                ctx.stroke();

                const texto = `${nr.quantidade}x ${nr.descricao}`;
                ctx.font = `700 ${Math.round(13 * scaleFont)}px Inter, sans-serif`;
                const textW = ctx.measureText(texto).width;
                const pillW = textW + 16 * scaleFont;
                const pillH = 24 * scaleFont;
                const pillX = Math.max(6, Math.min(cw - pillW - 6, x));
                const pillY = Math.max(6, y - pillH - 4);

                desenharRetanguloArredondado(ctx, pillX, pillY, pillW, pillH, 6);
                ctx.fillStyle = cores.alerta;
                ctx.fill();
                ctx.fillStyle = '#1C1917';
                ctx.textBaseline = 'middle';
                ctx.fillText(texto, pillX + 8 * scaleFont, pillY + pillH / 2 + 1);
                ctx.restore();
            });

            // Badge superior esquerdo (Local) — estilo industrial
            const localTxt = (resultado.local_identificado || contextoLocal || 'ARMAZÉM').toUpperCase();
            ctx.save();
            ctx.font = `700 ${Math.round(15 * scaleFont)}px Inter, sans-serif`;
            const localW = ctx.measureText(localTxt).width + 42 * scaleFont;
            const badgeH = 34 * scaleFont;
            desenharRetanguloArredondado(ctx, 16, 16, localW, badgeH, badgeH / 2);
            ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
            ctx.fill();
            ctx.beginPath();
            ctx.arc(16 + 18 * scaleFont, 16 + badgeH / 2, 5 * scaleFont, 0, Math.PI * 2);
            ctx.fillStyle = cores.sucesso;
            ctx.fill();
            ctx.fillStyle = cores.textoForte;
            ctx.textBaseline = 'middle';
            ctx.fillText(localTxt, 16 + 30 * scaleFont, 16 + badgeH / 2 + 1);

            // Badge superior direito (TOTAL)
            const totalTxt = `TOTAL ${resultado.total_geral || 0} UN.`;
            const totalW = ctx.measureText(totalTxt).width + 28 * scaleFont;
            desenharRetanguloArredondado(ctx, cw - totalW - 16, 16, totalW, badgeH, badgeH / 2);
            ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
            ctx.fill();
            ctx.fillStyle = cores.textoForte;
            ctx.fillText(totalTxt, cw - totalW - 2, 16 + badgeH / 2 + 1);
            ctx.restore();
        };
        img.src = imgUrl;
    }, [contextoLocal]);

    useEffect(() => {
        renderizarCanvasAnotado(fotoDataUrl, resultadoIa);
    }, [fotoDataUrl, resultadoIa, renderizarCanvasAnotado]);

    const handleSelecionarArquivoFoto = async (evt) => {
        const file = evt.target.files?.[0];
        evt.target.value = '';
        if (!file) return;
        try {
            const comprimida = await comprimirImagemCliente(file, 1280, 0.86);
            setFotoDataUrl(comprimida);
            setResultadoIa(null);
            setErroIa('');
            setAjustesQtd({});
        } catch {
            enqueueSnackbar('Não foi possível ler a imagem selecionada.', { variant: 'error' });
        }
    };

    const handleFotoCapturadaCamera = ({ dataUrl }) => {
        if (!dataUrl) return;
        setFotoDataUrl(dataUrl);
        setResultadoIa(null);
        setErroIa('');
        setAjustesQtd({});
    };

    const handleAnalisarComGemini = async () => {
        if (!fotoDataUrl) {
            enqueueSnackbar('Tire ou carregue uma foto da pilha antes de iniciar a contagem.', { variant: 'warning' });
            return;
        }
        try {
            setAnalisando(true);
            setErroIa('');
            const res = await httpClient.post('/producao/materiais/analisar-foto-ia', {
                imagem_base64: fotoDataUrl,
                material_ids: escopoMaterialId === 'todos' ? [] : [escopoMaterialId],
                contexto_local: contextoLocal,
                observacao_operador: observacaoOperador
            }, { headers: headersExtra });

            const dados = res?.data?.data || res?.data || null;
            setResultadoIa(dados);
            const iniciais = {};
            (dados?.itens_identificados || []).forEach((it, idx) => {
                iniciais[it.material_id || `idx-${idx}`] = it.quantidade;
            });
            setAjustesQtd(iniciais);
            enqueueSnackbar(`Contagem IA concluída: ${dados?.total_geral || 0} unidade(s) identificada(s).`, { variant: 'success' });
        } catch (err) {
            const msg = err.response?.data?.error || err.response?.data?.message || err.message || 'Falha ao analisar foto com IA.';
            setErroIa(msg);
            enqueueSnackbar(msg, { variant: 'error' });
        } finally {
            setAnalisando(false);
        }
    };

    const handleEnviarParaConferencia = async () => {
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
                acao_aplicada: 'contar_entrada'
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
            enqueueSnackbar('Nenhum item com quantidade válida para enviar.', { variant: 'warning' });
            return;
        }

        // Captura miniatura do canvas já com as caixas verdes como evidência oficial
        let evidenciaAnotada = null;
        try {
            const canvas = canvasRef.current;
            if (canvas) {
                const temp = document.createElement('canvas');
                const esc = Math.min(1, 720 / Math.max(1, canvas.width));
                temp.width = Math.round(canvas.width * esc);
                temp.height = Math.round(canvas.height * esc);
                temp.getContext('2d').drawImage(canvas, 0, 0, temp.width, temp.height);
                evidenciaAnotada = temp.toDataURL('image/jpeg', 0.78);
            }
        } catch {
            evidenciaAnotada = null;
        }

        todosItens.forEach((it) => {
            it.quadro_chave_evidencia_url = evidenciaAnotada;
        });

        try {
            setSalvando(true);
            const matRef = materiais.find((m) => m.id === itensCatalogo[0]?.material_id);
            await httpClient.post('/producao/materiais/conferencia-ia', {
                fornecedor_nome: matRef?.fornecedor_nome || contextoLocal || 'Inventário por foto',
                numero_nota_romaneio: `FOTO-${Date.now().toString().slice(-5)}`,
                origem_midia: 'foto_pilha_ia',
                modo_contagem: 'sahi_estatico',
                modelo_ia_versao: resultadoIa.modelo_ia_versao || 'gemini-2.5-flash',
                observacoes: resultadoIa.observacao_geral || '',
                itens: todosItens,
                acoes_executadas: [{
                    id: `foto-${Date.now()}`,
                    tipo: 'contar_entrada',
                    mensagem: `Contagem por foto (${resultadoIa.local_identificado || contextoLocal}): ${resultadoIa.total_geral} un. via ${resultadoIa.modelo_ia_versao || 'Gemini Vision'}.`,
                    timestamp: new Date().toISOString()
                }]
            }, { headers: headersExtra });

            enqueueSnackbar('Contagem por foto registrada na auditoria de recebimento!', { variant: 'success' });
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
                        Contagem por Foto da Pilha / Caminhão (Gemini Vision IA)
                    </Typography>
                    <Typography sx={{ fontSize: tamanhos.xs, color: cores.textoSecundario }}>
                        Ideal para pilhas paradas, pallets, grades, treliças, cadeiras ou carga no caminhão. A IA usa as fotos do seu catálogo e marca cada pilha com caixas verdes.
                    </Typography>
                </Box>
                <Chip
                    size="small"
                    label="IA Real • Foto Estática"
                    sx={{ bgcolor: tom(funcao.liberado, 0.14), color: funcao.liberado, fontWeight: 700 }}
                />
            </Box>

            <Grid container spacing={2.5} alignItems="flex-start">
                <Grid item xs={12} lg={7}>
                    <Box
                        sx={{
                            borderRadius: 1.5,
                            overflow: 'hidden',
                            border: `1px solid ${resultadoIa ? funcao.liberado : cores.borda}`,
                            bgcolor: cores.fundo
                        }}
                    >
                        <canvas
                            ref={canvasRef}
                            style={{ width: '100%', height: 'auto', display: 'block' }}
                        />
                    </Box>

                    {resultadoIa?.observacao_geral && (
                        <Alert severity="info" sx={{ mt: 1.5 }}>
                            <strong>Análise da IA:</strong> {resultadoIa.observacao_geral}
                        </Alert>
                    )}
                </Grid>

                <Grid item xs={12} lg={5}>
                    <Stack spacing={1.5}>
                        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                            <Button component="label" variant="outlined" size="small" startIcon={<UploadIcon />} sx={botaoSecundario}>
                                Subir foto da pilha
                                <input type="file" accept="image/*" hidden onChange={handleSelecionarArquivoFoto} />
                            </Button>
                            <Button
                                variant="outlined"
                                size="small"
                                startIcon={<CameraIcon />}
                                onClick={() => setCameraAberta(true)}
                                sx={botaoSecundario}
                            >
                                Fotografar com câmera
                            </Button>
                            {fotoDataUrl && (
                                <Button
                                    variant="outlined"
                                    size="small"
                                    startIcon={<LimparIcon />}
                                    onClick={() => {
                                        setFotoDataUrl('');
                                        setResultadoIa(null);
                                        setErroIa('');
                                    }}
                                    sx={botaoSecundario}
                                >
                                    Limpar
                                </Button>
                            )}
                        </Stack>

                        <FormControl fullWidth size="small">
                            <InputLabel>Materiais para procurar na foto</InputLabel>
                            <Select
                                label="Materiais para procurar na foto"
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
                            <Grid item xs={12} sm={6}>
                                <TextField
                                    fullWidth
                                    size="small"
                                    label="Local / Setor da foto"
                                    placeholder="Ex.: Armazém, Caminhão 01, Doca Palco"
                                    value={contextoLocal}
                                    onChange={(e) => setContextoLocal(e.target.value)}
                                />
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <FormControl fullWidth size="small">
                                    <InputLabel>Atalho de setor</InputLabel>
                                    <Select
                                        label="Atalho de setor"
                                        value=""
                                        onChange={(e) => {
                                            if (e.target.value) setContextoLocal(e.target.value);
                                        }}
                                    >
                                        <MenuItem value="Armazém">Armazém</MenuItem>
                                        <MenuItem value="Doca de Descarga">Doca de Descarga</MenuItem>
                                        <MenuItem value="Caminhão">Caminhão</MenuItem>
                                        {areas.map((a) => (
                                            <MenuItem key={a.id} value={a.nome}>{a.nome}</MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                            </Grid>
                        </Grid>

                        <TextField
                            fullWidth
                            size="small"
                            label="Dica opcional para a IA (opcional)"
                            placeholder="Ex.: Cada pallet tem 2 fileiras de profundidade"
                            value={observacaoOperador}
                            onChange={(e) => setObservacaoOperador(e.target.value)}
                        />

                        <NeonButton
                            loading={analisando}
                            disabled={!fotoDataUrl}
                            startIcon={<IaIcon />}
                            onClick={handleAnalisarComGemini}
                        >
                            {analisando ? 'Analisando foto com Gemini Vision...' : 'Contar itens na foto com IA'}
                        </NeonButton>

                        {erroIa && (
                            <Alert severity="warning">
                                {erroIa}
                            </Alert>
                        )}

                        {resultadoIa && (
                            <Box sx={{ p: 1.5, borderRadius: 1.5, bgcolor: cores.superficieElevada, border: `1px solid ${cores.borda}` }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.25 }}>
                                    <Typography sx={{ fontSize: tamanhos.sm, fontWeight: 700, color: cores.textoForte }}>
                                        Resultado identificado ({resultadoIa.modelo_ia_versao})
                                    </Typography>
                                    <Chip
                                        size="small"
                                        label={`Total: ${resultadoIa.total_geral} un.`}
                                        sx={{ bgcolor: tom(funcao.liberado, 0.16), color: funcao.liberado, fontWeight: 700 }}
                                    />
                                </Box>

                                <Stack spacing={1}>
                                    {(resultadoIa.itens_identificados || []).map((it, idx) => {
                                        const chave = it.material_id || `idx-${idx}`;
                                        return (
                                            <Box
                                                key={chave}
                                                sx={{
                                                    p: 1,
                                                    borderRadius: 1.5,
                                                    bgcolor: cores.fundo,
                                                    border: `1px solid ${cores.borda}`
                                                }}
                                            >
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
                                        <Box
                                            key={nr.id}
                                            sx={{
                                                p: 1,
                                                borderRadius: 1.5,
                                                bgcolor: tom(funcao.alerta, 0.08),
                                                border: `1px solid ${tom(funcao.alerta, 0.35)}`
                                            }}
                                        >
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
                                    onClick={handleEnviarParaConferencia}
                                    sx={{ mt: 1.5 }}
                                >
                                    Salvar contagem na conferência oficial
                                </NeonButton>
                            </Box>
                        )}
                    </Stack>
                </Grid>
            </Grid>

            <ModalCameraCaptura
                aberto={cameraAberta}
                titulo="Fotografar pilha ou carga para contagem IA"
                subtitulo="Enquadre toda a pilha/pallet com clareza e clique em Capturar foto."
                maxLargura={1280}
                qualidade={0.86}
                aoFechar={() => setCameraAberta(false)}
                aoCapturar={handleFotoCapturadaCamera}
            />
        </GlassCard>
    );
};

export default PainelContagemFotoPilha;
