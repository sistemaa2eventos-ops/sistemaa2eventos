import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
    Box, TextField, Typography, Stack, Chip, InputAdornment,
    CircularProgress, Tooltip, Fade, IconButton, Button
} from '@mui/material';
import {
    QrCodeScanner as BarcodeIcon,
    Keyboard as KeyboardIcon,
    WarningAmber as WarningIcon,
    FlashOn as FlashIcon,
    Close as ClearIcon
} from '@mui/icons-material';

/**
 * UniversalPulseiraInput
 * Campo único padronizado para Check-in, Check-out, Credenciamento e Fiscalização.
 * Suporta:
 * 1. Leitor de Código de Barras / QR Code via USB/Bluetooth (< 50ms/char) -> Disparo AUTOMÁTICO sem precisar de Enter
 * 2. Leitor de QR Code / Código de Barras pela Câmera Mobile/Web -> Exibe o código lido e dispara AUTOMÁTICO
 * 3. Digitação Manual de número da pulseira ou CPF -> Exige Enter ou clique no botão OK
 * 4. Busca por Nome no mesmo campo -> Dispara busca em tempo real conforme digita
 */

// Confirmação automática (leitor sem Enter) só a partir destes tamanhos: digitação rápida não confirma pela metade.
// Só dígitos: 2 (pulseiras de numeração curta). Com letras ou outros sinais: 4.
const TAMANHO_MINIMO_AUTOMATICO_DIGITOS = 2;
const TAMANHO_MINIMO_AUTOMATICO = 4;
// Enter do mesmo valor logo depois da confirmação automática é o Enter do próprio leitor: ignora
const JANELA_ENTER_REPETIDO_MS = 1500;
const temLetras = (texto) => /[A-Za-zÀ-ÿ]/.test(texto);
const minimoAutomatico = (texto) => (/^\d+$/.test(texto) ? TAMANHO_MINIMO_AUTOMATICO_DIGITOS : TAMANHO_MINIMO_AUTOMATICO);
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
    ultimoCodigoLido = ''
}) => {
    const inputRef = useRef(null);
    const keyTimestampsRef = useRef([]);
    const autoScanTimerRef = useRef(null);
    const ultimaAutomaticaRef = useRef({ valor: '', em: 0 });
    // `loading` é só da AÇÃO (registro/consulta), nunca da busca por nome. Durante a ação o campo continua
    // aceitando teclas (sem readOnly, que descartaria o bipe seguinte); só a confirmação espera:
    // fica guardada em pendenteRef e dispara quando a ação termina.
    const loadingRef = useRef(loading);
    const pendenteRef = useRef(null);
    const dispararRef = useRef(null);
    const valueRef = useRef(value);
    const ultimaConfirmadaRef = useRef('');
    const [origemLeitura, setOrigemLeitura] = useState(null); // 'barcode' | 'camera' | 'manual' | null
    const [codigoLidoBadge, setCodigoLidoBadge] = useState('');
    const [pulseAnimation, setPulseAnimation] = useState(false);

    // Quando o componente pai informa um código lido pela câmera/leitor, exibe o badge
    useEffect(() => {
        if (ultimoCodigoLido) {
            setCodigoLidoBadge(String(ultimoCodigoLido).trim());
            setOrigemLeitura('barcode');
            setPulseAnimation(true);
            const t = setTimeout(() => setPulseAnimation(false), 600);
            return () => clearTimeout(t);
        }
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

    // Identificar tipo de pulseira correspondente à faixa numérica
    const tipoPulseiraCorrespondente = useMemo(() => {
        if (!value) return null;
        const limpo = String(value).trim();
        if (!/^\d+$/.test(limpo)) return null;
        const num = parseInt(limpo, 10);
        if (isNaN(num)) return null;

        return (pulseiraTypes || []).find(tipo => {
            const ini = tipo.numero_inicial != null ? parseInt(tipo.numero_inicial, 10) : null;
            const fim = tipo.numero_final != null ? parseInt(tipo.numero_final, 10) : null;
            if (ini != null && fim != null) {
                return num >= ini && num <= fim;
            }
            return false;
        });
    }, [value, pulseiraTypes]);

    const dispararConfirmacao = useCallback((textoBruto, tipoOrigem, automatica = false) => {
        if (autoScanTimerRef.current) {
            clearTimeout(autoScanTimerRef.current);
            autoScanTimerRef.current = null;
        }
        const val = String(textoBruto || '').trim();
        if (!val || disabled) return;
        // Ação em curso: guarda a confirmação (a última vence) e dispara quando a ação terminar
        if (loadingRef.current) {
            pendenteRef.current = { val, tipoOrigem, automatica };
            return;
        }

        ultimaConfirmadaRef.current = val;
        if (automatica) ultimaAutomaticaRef.current = { valor: val, em: Date.now() };
        setOrigemLeitura(tipoOrigem);
        // "Código lido" só para código: nome digitado não é código
        setCodigoLidoBadge(tipoOrigem === 'manual' && temLetras(val) ? '' : val);
        setPulseAnimation(true);
        setTimeout(() => setPulseAnimation(false), 500);
        keyTimestampsRef.current = [];

        if (onConfirm) {
            onConfirm(val, tipoOrigem, tipoPulseiraCorrespondente);
        }
    }, [disabled, onConfirm, tipoPulseiraCorrespondente]);

    useEffect(() => { valueRef.current = value; }, [value]);
    useEffect(() => { dispararRef.current = dispararConfirmacao; }, [dispararConfirmacao]);

    // Fim da ação: dispara a confirmação que chegou enquanto ela rodava
    useEffect(() => {
        loadingRef.current = loading;
        if (loading || !pendenteRef.current) return;
        const { val, tipoOrigem, automatica } = pendenteRef.current;
        pendenteRef.current = null;
        dispararRef.current?.(val, tipoOrigem, automatica);
    }, [loading]);

    const handleKeyDown = (e) => {
        // Sem checar loading: teclas durante a ação entram no campo e a confirmação vai para a fila
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
            const val = String(value || '').trim();
            if (!val) return;

            // Leitor que manda Enter depois da pausa: a confirmação automática já foi feita
            const ultima = ultimaAutomaticaRef.current;
            if (ultima.valor === val && now - ultima.em < JANELA_ENTER_REPETIDO_MS) {
                keyTimestampsRef.current = [];
                return;
            }

            let isScanner = false;
            const ts = keyTimestampsRef.current;
            if (ts.length >= 3) {
                const diffTotal = ts[ts.length - 1] - ts[0];
                const mediaDiff = diffTotal / (ts.length - 1);
                if (mediaDiff < 55) {
                    isScanner = true;
                }
            }

            dispararConfirmacao(val, isScanner ? 'barcode' : 'manual');
        }
    };

    const handleChange = (e) => {
        const val = e.target.value;
        if (onChange) onChange(val);

        if (autoScanTimerRef.current) {
            clearTimeout(autoScanTimerRef.current);
            autoScanTimerRef.current = null;
        }

        const limpo = String(val || '').trim();
        if (!limpo) {
            setCodigoLidoBadge('');
            setOrigemLeitura(null);
            return;
        }

        // Detecção automática de leitor de código de barras / QR Code que NÃO envia Enter ao final:
        // Se pelo menos o mínimo de caracteres (2 só dígitos, 4 com letras) chegou em rajada (< 48ms por tecla)
        // e não é um nome com espaço, dispara a confirmação automaticamente após 130ms de silêncio da rajada.
        const ts = keyTimestampsRef.current;
        const minimo = minimoAutomatico(limpo);
        if (ts.length >= minimo && limpo.length >= minimo && !/\s/.test(limpo)) {
            const diffTotal = ts[ts.length - 1] - ts[0];
            const mediaDiff = diffTotal / (ts.length - 1);
            const ehApenasLetrasCurto = /^[A-Za-zÀ-ÿ]{1,5}$/.test(limpo);
            if (mediaDiff < 48 && !ehApenasLetrasCurto) {
                autoScanTimerRef.current = setTimeout(() => {
                    dispararConfirmacao(limpo, 'barcode', true);
                }, 130);
            }
        }
    };

    const handleClear = () => {
        if (autoScanTimerRef.current) {
            clearTimeout(autoScanTimerRef.current);
            autoScanTimerRef.current = null;
        }
        keyTimestampsRef.current = [];
        setCodigoLidoBadge('');
        setOrigemLeitura(null);
        if (onChange) onChange('');
        if (onClear) onClear();
        inputRef.current?.focus();
    };

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

            <TextField
                inputRef={inputRef}
                fullWidth
                value={value}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                // Durante a leitura fica só leitura (não desabilitado): desabilitar tira o foco do campo
                disabled={disabled}
                // Sem readOnly durante a ação: o leitor não perde caracteres (a confirmação espera a ação terminar)
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
                                {onAbrirCamera ? (
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
                                                onClick={() => dispararConfirmacao(value, 'manual')}
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
