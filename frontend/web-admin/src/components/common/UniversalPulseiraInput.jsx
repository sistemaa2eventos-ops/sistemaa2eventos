import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
    Box, TextField, Typography, Stack, Chip, InputAdornment,
    CircularProgress, Tooltip, Fade, IconButton, Button, Alert
} from '@mui/material';
import {
    QrCodeScanner as BarcodeIcon,
    Keyboard as KeyboardIcon,
    WarningAmber as WarningIcon,
    FlashOn as FlashIcon,
    Close as ClearIcon,
    CameraAlt as CameraAltIcon
} from '@mui/icons-material';

/**
 * UniversalPulseiraInput
 * Campo único padronizado para Check-in, Check-out, Credenciamento e Fiscalização.
 * Suporta:
 * 1. Leitor de Código de Barras / QR Code via USB/Bluetooth (< 50ms/char) -> Disparo AUTOMÁTICO sem precisar de Enter
 * 2. Leitor de QR Code / Código de Barras pela Câmera Mobile/Web -> Exibe o código lido e dispara AUTOMÁTICO
 * 3. Digitação Manual de número da pulseira ou CPF -> Exige Enter ou clique no botão OK
 * 4. Busca por Nome no mesmo campo -> Dispara busca em tempo real conforme digita
 *
 * Fila de leituras: cada bipe vira um item da fila e o campo é limpo na hora. Uma leitura só é entregue
 * ao pai (onConfirm) quando a anterior terminou (a promessa devolvida por onConfirm, ou o loading do pai).
 * Se onConfirm devolver { success: false, error }, a recusa aparece na tela com o código recusado.
 */

// Confirmação automática (leitor sem Enter) só a partir de 4 caracteres: digitação rápida não confirma pela metade.
// Pulseira com menos de 4 dígitos precisa de Enter ou do botão.
const TAMANHO_MINIMO_AUTOMATICO_DIGITOS = 4;
const TAMANHO_MINIMO_AUTOMATICO = 4;
// Enter do mesmo valor logo depois da confirmação automática é o Enter do próprio leitor: ignora
const JANELA_ENTER_REPETIDO_MS = 1500;
// Teclas de uma mesma leitura chegam em menos de 48 ms (rajada do leitor)
const INTERVALO_RAJADA_MS = 48;
// Pausa acima disto entre duas teclas separa leituras; abaixo, pode ser só oscilação do leitor no meio do código
const QUEBRA_ENTRE_LEITURAS_MS = 100;
// Silêncio do leitor (sem Enter) até a leitura ser confirmada sozinha
const SILENCIO_LEITOR_MS = 130;
// Acima disso o operador é avisado na tela (nenhuma leitura é descartada)
const LIMITE_FILA_AVISO = 20;
const MAX_RECUSAS_NA_TELA = 5;

const temLetras = (texto) => /[A-Za-zÀ-ÿ]/.test(texto);
const minimoAutomatico = (texto) => (/^\d+$/.test(texto) ? TAMANHO_MINIMO_AUTOMATICO_DIGITOS : TAMANHO_MINIMO_AUTOMATICO);

// Faixa de lote de pulseira que contém o número digitado/lido (ou null)
const tipoDaFaixa = (texto, tipos = []) => {
    const limpo = String(texto || '').trim();
    if (!/^\d+$/.test(limpo)) return null;
    const num = parseInt(limpo, 10);
    if (isNaN(num)) return null;
    return (tipos || []).find(tipo => {
        const ini = tipo.numero_inicial != null ? parseInt(tipo.numero_inicial, 10) : null;
        const fim = tipo.numero_final != null ? parseInt(tipo.numero_final, 10) : null;
        if (ini != null && fim != null) {
            return num >= ini && num <= fim;
        }
        return false;
    }) || null;
};

export const UniversalPulseiraInput = ({
    value = '',
    onChange,
    onConfirm,
    onClear,
    pulseiraTypes = [],
    loading = false,
    autoFocus = true,
    // Padrões antigos (campo de pulseira); telas de busca passam os textos delas
    placeholder = 'Aproxime o leitor ou digite o código...',
    label = 'Código ou número da pulseira',
    disabled = false,
    helperText,
    accentColor = '#00D4FF',
    // Quando informado, o ícone dentro da caixa abre a câmera do aparelho
    onAbrirCamera,
    mostrarBotaoCamera = true,
    ultimoCodigoLido = '',
    // Recebe o total de leituras pendentes (na fila + em andamento), para o pai segurar o que depende disso
    onFilaChange
}) => {
    const inputRef = useRef(null);
    const keyTimestampsRef = useRef([]);
    const ultimaTeclaRef = useRef(0);
    const autoScanTimerRef = useRef(null);
    const autoPendenteRef = useRef(null); // { texto }: leitura que confirma sozinha após o silêncio do leitor
    const ultimaAutomaticaRef = useRef({ valor: '', em: 0 });
    const valueRef = useRef(value);
    const ultimaConfirmadaRef = useRef('');
    // Fila: uma entrada por leitura, na ordem em que chegou
    const filaRef = useRef([]);
    const ocupadoRef = useRef(false); // a leitura atual ainda não terminou no pai
    const loadingRef = useRef(loading);
    const disabledRef = useRef(disabled);
    const onConfirmRef = useRef(onConfirm);
    const onChangeRef = useRef(onChange);
    const onFilaChangeRef = useRef(onFilaChange);
    const pulseiraTypesRef = useRef(pulseiraTypes);
    const processarRef = useRef(null);
    const recusaSeqRef = useRef(0);

    const [origemLeitura, setOrigemLeitura] = useState(null); // 'barcode' | 'camera' | 'manual' | null
    const [codigoLidoBadge, setCodigoLidoBadge] = useState('');
    const [pulseAnimation, setPulseAnimation] = useState(false);
    const [pendentes, setPendentes] = useState(0);
    const [recusas, setRecusas] = useState([]); // { id, codigo, motivo }

    // Sempre a versão mais nova das props: a fila pode disparar uma leitura depois do render em que nasceu
    onConfirmRef.current = onConfirm;
    onChangeRef.current = onChange;
    onFilaChangeRef.current = onFilaChange;
    pulseiraTypesRef.current = pulseiraTypes;

    // Quando o componente pai informa um código lido pela câmera/leitor, exibe o badge.
    // Quando o pai zera o código (ex.: saída registrada), o badge some junto.
    useEffect(() => {
        if (ultimoCodigoLido) {
            setCodigoLidoBadge(String(ultimoCodigoLido).trim());
            setOrigemLeitura('barcode');
            setPulseAnimation(true);
            const t = setTimeout(() => setPulseAnimation(false), 600);
            return () => clearTimeout(t);
        }
        setCodigoLidoBadge('');
        setOrigemLeitura(null);
    }, [ultimoCodigoLido]);

    // Limpar timer ao desmontar
    useEffect(() => () => {
        if (autoScanTimerRef.current) clearTimeout(autoScanTimerRef.current);
    }, []);

    // No celular/touch, evita abrir o teclado virtual automaticamente sem o operador tocar no campo
    useEffect(() => {
        const isTouchMobile = typeof window !== 'undefined' && (
            window.innerWidth < 768 || window.matchMedia?.('(pointer: coarse)').matches
        );
        // Também ao terminar uma leitura (loading → false): devolve o foco ao campo. Só seleciona o texto se ele
        // ainda for o código já confirmado (o próximo bipe sobrescreve); texto novo digitado não é selecionado.
        if (autoFocus && !isTouchMobile && inputRef.current && !disabled && !loading) {
            const timer = setTimeout(() => {
                inputRef.current?.focus();
                const atual = String(valueRef.current || '').trim();
                if (atual && atual === ultimaConfirmadaRef.current) inputRef.current?.select();
            }, 80);
            return () => clearTimeout(timer);
        }
    }, [autoFocus, disabled, loading]);

    useEffect(() => { valueRef.current = value; }, [value]);
    useEffect(() => { onFilaChangeRef.current?.(pendentes); }, [pendentes]);

    // Identificar tipo de pulseira correspondente à faixa numérica
    const tipoPulseiraCorrespondente = useMemo(() => tipoDaFaixa(value, pulseiraTypes), [value, pulseiraTypes]);

    const atualizarPendentes = useCallback(() => {
        setPendentes(filaRef.current.length + (ocupadoRef.current ? 1 : 0));
    }, []);

    const registrarRecusa = useCallback((codigo, motivo) => {
        recusaSeqRef.current += 1;
        const id = recusaSeqRef.current;
        setRecusas(prev => [{ id, codigo, motivo: motivo || 'Não autorizado pelo servidor' }, ...prev].slice(0, MAX_RECUSAS_NA_TELA));
    }, []);

    // Entrega uma leitura por vez ao pai. Só segue quando a anterior terminou e o pai não está em ação.
    const processarFila = useCallback(() => {
        if (ocupadoRef.current || loadingRef.current || disabledRef.current) return;
        const item = filaRef.current.shift();
        if (!item) {
            atualizarPendentes();
            return;
        }

        ocupadoRef.current = true;
        atualizarPendentes();
        ultimaConfirmadaRef.current = item.val;
        setOrigemLeitura(item.origem);
        // "Código lido" só para código: nome digitado não é código
        setCodigoLidoBadge(item.origem === 'manual' && temLetras(item.val) ? '' : item.val);
        setPulseAnimation(true);
        setTimeout(() => setPulseAnimation(false), 500);

        let retorno;
        try {
            retorno = onConfirmRef.current?.(item.val, item.origem, tipoDaFaixa(item.val, pulseiraTypesRef.current));
        } catch (err) {
            retorno = Promise.reject(err);
        }
        Promise.resolve(retorno)
            .then((res) => {
                if (res && res.success === false) registrarRecusa(item.val, res.error);
            })
            .catch((err) => registrarRecusa(item.val, err?.message))
            .finally(() => {
                ocupadoRef.current = false;
                atualizarPendentes();
                processarRef.current?.();
            });
    }, [atualizarPendentes, registrarRecusa]);

    processarRef.current = processarFila;

    // Fim da ação do pai (loading → false) ou da desabilitação: segue a fila
    useEffect(() => {
        loadingRef.current = loading;
        disabledRef.current = disabled;
        processarRef.current?.();
    }, [loading, disabled]);

    const cancelarAutoLeitura = () => {
        if (autoScanTimerRef.current) {
            clearTimeout(autoScanTimerRef.current);
            autoScanTimerRef.current = null;
        }
        autoPendenteRef.current = null;
    };

    const enfileirarLeitura = (val, origem, automatica) => {
        if (automatica) ultimaAutomaticaRef.current = { valor: val, em: Date.now() };
        filaRef.current.push({ val, origem, automatica });
        atualizarPendentes();
        processarRef.current?.();
    };

    // Campo limpo no momento do bipe: a próxima leitura começa vazia
    const limparCampo = () => {
        keyTimestampsRef.current = [];
        cancelarAutoLeitura();
        valueRef.current = '';
        onChangeRef.current?.('');
    };

    // Uma leitura (bipe, Enter ou OK). Nome digitado (com letras) não limpa o campo: o pai cuida dele.
    const confirmarLeitura = (texto, origem, automatica = false) => {
        const val = String(texto || '').trim();
        if (!val || disabledRef.current) return;
        cancelarAutoLeitura();
        keyTimestampsRef.current = [];
        const ehNome = origem === 'manual' && temLetras(val);
        if (!ehNome) limparCampo();
        enfileirarLeitura(val, origem, automatica);
    };

    const handleKeyDown = (e) => {
        if (disabled) return;

        const now = Date.now();
        const timestamps = keyTimestampsRef.current;

        // Se for uma tecla de caractere imprimível, registra o tempo da tecla na rajada atual
        if (e.key && e.key.length === 1) {
            const lastTs = timestamps.length > 0 ? timestamps[timestamps.length - 1] : 0;
            // Se demorou mais de 120ms desde a última tecla, inicia uma nova sequência
            if (lastTs && (now - lastTs) > 120) {
                keyTimestampsRef.current = [now];
            } else {
                timestamps.push(now);
                if (timestamps.length > 12) timestamps.shift();
            }
        }

        if (e.key === 'Enter') {
            e.preventDefault();
            const val = String(valueRef.current || '').trim();

            // Enter do leitor depois da leitura automática: o campo já foi limpo (ou é o mesmo código). Ignora.
            const ultima = ultimaAutomaticaRef.current;
            if (ultima.em && (now - ultima.em) < JANELA_ENTER_REPETIDO_MS && (!val || val === ultima.valor)) {
                keyTimestampsRef.current = [];
                return;
            }
            if (!val) return;

            let isScanner = false;
            const ts = keyTimestampsRef.current;
            if (ts.length >= 3) {
                const diffTotal = ts[ts.length - 1] - ts[0];
                const mediaDiff = diffTotal / (ts.length - 1);
                if (mediaDiff < 55) {
                    isScanner = true;
                }
            }

            confirmarLeitura(val, isScanner ? 'barcode' : 'manual');
        }
    };

    const handleChange = (e) => {
        const agora = Date.now();
        const pausa = agora - ultimaTeclaRef.current;
        ultimaTeclaRef.current = agora;
        let val = e.target.value;

        // Leitura anterior ainda esperando o silêncio do leitor, e esta tecla veio depois de uma pausa:
        // a anterior já estava completa. Ela entra na fila agora e a tecla nova começa outra leitura.
        const pendente = autoPendenteRef.current;
        if (pendente && pausa > QUEBRA_ENTRE_LEITURAS_MS && val.length > pendente.texto.length && val.startsWith(pendente.texto)) {
            const resto = val.slice(pendente.texto.length);
            cancelarAutoLeitura();
            keyTimestampsRef.current = [agora];
            enfileirarLeitura(pendente.texto, 'barcode', true);
            val = resto;
        }

        if (onChangeRef.current) onChangeRef.current(val);

        cancelarAutoLeitura();
        const limpo = String(val || '').trim();
        if (!limpo) {
            setCodigoLidoBadge('');
            setOrigemLeitura(null);
            return;
        }

        // Detecção automática de leitor de código de barras / QR Code que NÃO envia Enter ao final:
        // Se pelo menos o mínimo de caracteres (2 só dígitos, 4 com letras) chegou em rajada (< 48ms por tecla)
        // e não é um nome com espaço, confirma a leitura após o silêncio do leitor.
        const ts = keyTimestampsRef.current;
        const minimo = minimoAutomatico(limpo);
        if (ts.length >= minimo && limpo.length >= minimo && !/\s/.test(limpo)) {
            const diffTotal = ts[ts.length - 1] - ts[0];
            const mediaDiff = diffTotal / (ts.length - 1);
            const ehApenasLetrasCurto = /^[A-Za-zÀ-ÿ]{1,5}$/.test(limpo);
            if (mediaDiff < INTERVALO_RAJADA_MS && !ehApenasLetrasCurto) {
                autoPendenteRef.current = { texto: limpo };
                autoScanTimerRef.current = setTimeout(() => {
                    autoScanTimerRef.current = null;
                    autoPendenteRef.current = null;
                    confirmarLeitura(limpo, 'barcode', true);
                }, SILENCIO_LEITOR_MS);
            }
        }
    };

    const handleClear = () => {
        cancelarAutoLeitura();
        keyTimestampsRef.current = [];
        setCodigoLidoBadge('');
        setOrigemLeitura(null);
        if (onChange) onChange('');
        if (onClear) onClear();
        inputRef.current?.focus();
    };

    const leiturasAguardando = Math.max(0, pendentes - 1);

    return (
        <Box sx={{ width: '100%' }}>
            {/* Rótulo superior limpo e destacado - Sem sobreposição de texto */}
            <Box sx={{ mb: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 0.5 }}>
                <Typography
                    variant="caption"
                    sx={{
                        color: accentColor,
                        fontWeight: 700,
                        fontSize: { xs: '0.8125rem', sm: '0.875rem' },
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.8
                    }}
                >
                    <BarcodeIcon sx={{ fontSize: 18, color: accentColor }} />
                    {label}
                </Typography>

                <Stack direction="row" spacing={0.75} alignItems="center">
                    {leiturasAguardando > 0 && (
                        <Chip
                            label={`Aguardando: ${leiturasAguardando}`}
                            size="small"
                            aria-live="polite"
                            sx={{ bgcolor: 'rgba(255, 184, 0, 0.15)', color: '#FFB800', fontWeight: 700, fontSize: '0.75rem', height: 22, border: '1px solid rgba(255, 184, 0, 0.4)' }}
                        />
                    )}
                    {codigoLidoBadge && (
                        <Fade in>
                            <Chip
                                icon={<FlashIcon sx={{ fontSize: '13px !important', color: '#00FF88 !important' }} />}
                                label={`Código lido: ${codigoLidoBadge}`}
                                size="small"
                                sx={{
                                    bgcolor: 'rgba(0, 255, 136, 0.15)',
                                    color: '#00FF88',
                                    fontWeight: 700,
                                    fontSize: '0.75rem',
                                    height: 22,
                                    border: '1px solid rgba(0, 255, 136, 0.4)'
                                }}
                            />
                        </Fade>
                    )}
                </Stack>
            </Box>

            <Box sx={{ display: 'flex', gap: { xs: 1, sm: 1.5 }, alignItems: 'stretch', width: '100%' }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <TextField
                inputRef={inputRef}
                fullWidth
                value={value}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                // Durante a leitura fica só leitura (não desabilitado): desabilitar tira o foco do campo
                disabled={disabled}
                // Sem readOnly durante a ação: o leitor não perde caracteres (a leitura entra na fila)
                inputProps={{ 'aria-busy': loading }}
                placeholder={placeholder}
                variant="outlined"
                autoComplete="off"
                InputProps={{
                    startAdornment: (
                        <InputAdornment position="start">
                            <Box
                                sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 0.5,
                                    color: origemLeitura === 'barcode' ? '#00FF88' : accentColor
                                }}
                            >
                                {onAbrirCamera && !mostrarBotaoCamera ? (
                                    <Tooltip title="Ler QR Code ou Código de Barras pela câmera">
                                        <span>
                                            <IconButton
                                                onClick={onAbrirCamera}
                                                disabled={disabled || loading}
                                                aria-label="Ler QR Code ou Código de Barras pela câmera"
                                                sx={{
                                                    width: 44, height: 44, ml: -1.25,
                                                    color: 'inherit',
                                                    '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' }
                                                }}
                                            >
                                                <BarcodeIcon sx={{ fontSize: { xs: 22, sm: 26 } }} />
                                            </IconButton>
                                        </span>
                                    </Tooltip>
                                ) : (
                                    <BarcodeIcon sx={{ fontSize: { xs: 22, sm: 26 } }} />
                                )}
                                {origemLeitura === 'barcode' && (
                                    <Tooltip title="Leitura automática via QR Code / Código de Barras">
                                        <FlashIcon sx={{ fontSize: 16, color: '#00FF88' }} />
                                    </Tooltip>
                                )}
                            </Box>
                        </InputAdornment>
                    ),
                    endAdornment: (
                        <InputAdornment position="end">
                            <Stack direction="row" spacing={0.75} alignItems="center">
                                {loading ? (
                                    <CircularProgress size={22} sx={{ color: accentColor }} />
                                ) : tipoPulseiraCorrespondente ? (
                                    <Fade in>
                                        <Chip
                                            label={tipoPulseiraCorrespondente.nome_tipo}
                                            size="small"
                                            sx={{
                                                fontWeight: 700,
                                                fontSize: '0.75rem',
                                                bgcolor: tipoPulseiraCorrespondente.cor_hex
                                                    ? `${tipoPulseiraCorrespondente.cor_hex}33`
                                                    : `${accentColor}33`,
                                                color: tipoPulseiraCorrespondente.cor_hex || accentColor,
                                                border: `1px solid ${tipoPulseiraCorrespondente.cor_hex || accentColor}`
                                            }}
                                        />
                                    </Fade>
                                ) : value && /^\d+$/.test(String(value).trim()) && pulseiraTypes.length > 0 ? (
                                    <Tooltip title="Número não coincide com nenhuma faixa de lote pré-cadastrada">
                                        <Chip
                                            icon={<WarningIcon sx={{ fontSize: '14px !important' }} />}
                                            label="Faixa avulsa"
                                            size="small"
                                            sx={{
                                                fontSize: '0.75rem',
                                                bgcolor: 'rgba(255, 170, 0, 0.15)',
                                                color: '#FFB800'
                                            }}
                                        />
                                    </Tooltip>
                                ) : null}

                                {Boolean(value) && !loading && (
                                    <>
                                        <Tooltip title="Limpar campo">
                                            <IconButton
                                                size="small"
                                                onClick={handleClear}
                                                disabled={disabled}
                                                sx={{ color: 'rgba(255,255,255,0.5)', '&:hover': { color: '#FFFFFF' } }}
                                            >
                                                <ClearIcon fontSize="small" />
                                            </IconButton>
                                        </Tooltip>
                                        <Tooltip title="Confirmar código / número digitado manualmente (Enter)">
                                            <Button
                                                variant="contained"
                                                size="small"
                                                onClick={() => confirmarLeitura(value, 'manual')}
                                                disabled={disabled || !String(value).trim()}
                                                sx={{
                                                    minWidth: 44,
                                                    height: 34,
                                                    px: 1.5,
                                                    fontWeight: 800,
                                                    fontSize: '0.78rem',
                                                    borderRadius: 1,
                                                    bgcolor: accentColor,
                                                    color: '#000000',
                                                    boxShadow: 'none',
                                                    '&:hover': { bgcolor: accentColor, filter: 'brightness(1.1)', boxShadow: 'none' }
                                                }}
                                            >
                                                OK
                                            </Button>
                                        </Tooltip>
                                    </>
                                )}
                            </Stack>
                        </InputAdornment>
                    )
                }}
                sx={{
                    '& .MuiOutlinedInput-root': {
                        bgcolor: 'rgba(0, 0, 0, 0.35)',
                        color: '#FFFFFF',
                        fontSize: { xs: '1rem', sm: '1.25rem' },
                        fontWeight: 700,
                        letterSpacing: { xs: '0.75px', sm: '1.5px' },
                        fontFamily: '"Inter", sans-serif',
                        borderRadius: 1.5,
                        height: { xs: 48, sm: 58 },
                        // O código digitado fica grande; o texto de ajuda, menor (antes saía cortado)
                        '& input::placeholder': { fontSize: { xs: '0.8125rem', sm: '0.9375rem' }, fontWeight: 500, letterSpacing: 0, opacity: 0.6 },
                        transition: 'all 0.25s ease',
                        boxShadow: pulseAnimation
                            ? '0 0 25px rgba(0, 255, 136, 0.6)'
                            : `0 0 10px ${accentColor}25`,
                        border: pulseAnimation
                            ? '2px solid #00FF88'
                            : `1px solid ${accentColor}55`,
                        '& fieldset': { border: 'none' },
                        '&:hover': {
                            boxShadow: `0 0 18px ${accentColor}40`,
                            borderColor: accentColor
                        },
                        '&.Mui-focused': {
                            boxShadow: `0 0 24px ${accentColor}60`,
                            borderColor: accentColor
                        }
                    }
                }}
            />
                </Box>

                {onAbrirCamera && mostrarBotaoCamera && (
                    <Button
                        variant="contained"
                        onClick={onAbrirCamera}
                        disabled={disabled || loading}
                        startIcon={<CameraAltIcon />}
                        sx={{
                            height: { xs: 48, sm: 58 },
                            px: { xs: 1.75, sm: 2.75 },
                            borderRadius: 1.5,
                            bgcolor: accentColor,
                            color: '#000000',
                            fontWeight: 700,
                            fontSize: { xs: '0.8125rem', sm: '0.9375rem' },
                            fontFamily: '"Space Grotesk", sans-serif',
                            whiteSpace: 'nowrap',
                            flexShrink: 0,
                            boxShadow: `0 0 14px ${accentColor}33`,
                            '&:hover': {
                                bgcolor: accentColor,
                                filter: 'brightness(1.15)',
                                boxShadow: `0 0 20px ${accentColor}66`
                            }
                        }}
                    >
                        Ler pela câmera
                    </Button>
                )}
            </Box>

            {pendentes > LIMITE_FILA_AVISO && (
                <Alert severity="warning" sx={{ mt: 1, py: 0, bgcolor: 'rgba(255, 184, 0, 0.12)', color: '#FFD27A' }}>
                    {`${pendentes} leituras na fila. Cada uma será processada em ordem; nenhuma foi perdida.`}
                </Alert>
            )}

            {recusas.length > 0 && (
                <Stack spacing={0.75} mt={1} aria-live="polite">
                    {recusas.map((r) => (
                        <Alert
                            key={r.id}
                            severity="error"
                            onClose={() => setRecusas(prev => prev.filter(x => x.id !== r.id))}
                            sx={{ py: 0, bgcolor: 'rgba(255, 51, 102, 0.12)', color: '#FFB3C6', fontSize: '0.8125rem' }}
                        >
                            <strong>Recusado: {r.codigo}</strong> — {r.motivo}
                        </Alert>
                    ))}
                </Stack>
            )}

            {/* Sub-informações e instrução de confirmação */}
            <Stack direction="row" justifyContent="space-between" alignItems="center" mt={0.85} px={0.5}>
                <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.55)', display: 'flex', alignItems: 'center', gap: 0.6, fontSize: '0.75rem', lineHeight: 1.3 }}>
                    <KeyboardIcon sx={{ fontSize: 15, color: 'rgba(255,255,255,0.4)', flexShrink: 0 }} />
                    {helperText || 'Pressione Enter ↵ após bipe ou digitação para confirmar'}
                </Typography>
            </Stack>
        </Box>
    );
};

export default UniversalPulseiraInput;
