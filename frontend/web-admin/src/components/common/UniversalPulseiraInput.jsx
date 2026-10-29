import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
    Box, TextField, Typography, Stack, Chip, InputAdornment,
    CircularProgress, Tooltip, Fade, IconButton
} from '@mui/material';
import {
    QrCodeScanner as BarcodeIcon,
    Keyboard as KeyboardIcon,
    WarningAmber as WarningIcon,
    FlashOn as FlashIcon
} from '@mui/icons-material';

/**
 * UniversalPulseiraInput
 * Input universal para credenciamento e baixa de pulseiras no evento.
 * Suporta:
 * 1. Leitor de Código de Barras (CODE39 / CODE128 / 2D) via USB HID (< 50ms/char + Enter)
 * 2. Leitor QR Code
 * 3. Digitação Manual convencional
 * Identifica em tempo real a faixa numérica e o tipo/cor do lote correspondente.
 */
export const UniversalPulseiraInput = ({
    value = '',
    onChange,
    onConfirm,
    pulseiraTypes = [],
    loading = false,
    autoFocus = true,
    placeholder = 'Aproxime o leitor ou digite o código...',
    label = 'Código ou número da pulseira',
    disabled = false,
    helperText,
    accentColor = '#00D4FF',
    // Quando informado, o ícone dentro da caixa vira o botão que abre a câmera do aparelho
    onAbrirCamera
}) => {
    const inputRef = useRef(null);
    const keyTimestampsRef = useRef([]);
    const [origemLeitura, setOrigemLeitura] = useState(null); // 'barcode' | 'manual' | null
    const [pulseAnimation, setPulseAnimation] = useState(false);

    // No celular/touch, evita abrir o teclado virtual automaticamente sem o operador tocar no campo
    useEffect(() => {
        const isTouchMobile = typeof window !== 'undefined' && (
            window.innerWidth < 768 || window.matchMedia?.('(pointer: coarse)').matches
        );
        if (autoFocus && !isTouchMobile && inputRef.current && !disabled) {
            const timer = setTimeout(() => {
                inputRef.current?.focus();
                inputRef.current?.select();
            }, 80);
            return () => clearTimeout(timer);
        }
    }, [autoFocus, disabled]);

    // Identificar tipo de pulseira correspondente à faixa numérica
    const tipoPulseiraCorrespondente = useMemo(() => {
        if (!value) return null;
        const num = parseInt(String(value).trim(), 10);
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

    const handleKeyDown = (e) => {
        if (disabled || loading) return;

        const now = Date.now();
        const timestamps = keyTimestampsRef.current;
        timestamps.push(now);

        // Manter apenas os últimos 8 timestamps para média móvel
        if (timestamps.length > 8) timestamps.shift();

        if (e.key === 'Enter') {
            e.preventDefault();
            const val = String(value || '').trim();
            if (!val) return;

            // Calcular intervalo médio entre teclas para detecção de scanner
            let isScanner = false;
            if (timestamps.length >= 3) {
                const diffTotal = timestamps[timestamps.length - 1] - timestamps[0];
                const mediaDiff = diffTotal / (timestamps.length - 1);
                // Barcode scanners enviam teclas em rajada rápida (< 55ms de intervalo)
                if (mediaDiff < 55) {
                    isScanner = true;
                }
            }

            const tipoOrigem = isScanner ? 'barcode' : 'manual';
            setOrigemLeitura(tipoOrigem);
            setPulseAnimation(true);
            setTimeout(() => setPulseAnimation(false), 500);

            keyTimestampsRef.current = [];

            if (onConfirm) {
                onConfirm(val, tipoOrigem, tipoPulseiraCorrespondente);
            }
        }
    };

    const handleChange = (e) => {
        const val = e.target.value;
        if (onChange) onChange(val);
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

                {origemLeitura === 'barcode' && (
                    <Fade in>
                        <Chip
                            icon={<FlashIcon sx={{ fontSize: '13px !important', color: '#00FF88 !important' }} />}
                            label="Leitor detectado"
                            size="small"
                            sx={{
                                bgcolor: 'rgba(0, 255, 136, 0.15)',
                                color: '#00FF88',
                                fontWeight: 700,
                                fontSize: '0.75rem',
                                height: 20,
                                border: '1px solid rgba(0, 255, 136, 0.4)'
                            }}
                        />
                    </Fade>
                )}
            </Box>

            <TextField
                inputRef={inputRef}
                fullWidth
                value={value}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                disabled={disabled || loading}
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
                                    <Tooltip title="Ler pela câmera">
                                        <span>
                                            <IconButton
                                                onClick={onAbrirCamera}
                                                disabled={disabled || loading}
                                                aria-label="Ler pela câmera"
                                                sx={{
                                                    // Só o ícone; a área de toque de 44px fica invisível
                                                    width: 44, height: 44, ml: -1.25,
                                                    color: 'inherit'
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
                                    <Tooltip title="Leitura ultra-rápida via código de barras">
                                        <FlashIcon sx={{ fontSize: 16, color: '#00FF88' }} />
                                    </Tooltip>
                                )}
                            </Box>
                        </InputAdornment>
                    ),
                    endAdornment: (
                        <InputAdornment position="end">
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
                            ) : value && !isNaN(parseInt(value, 10)) && pulseiraTypes.length > 0 ? (
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
