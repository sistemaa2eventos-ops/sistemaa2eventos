import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
    Box, TextField, Typography, Stack, Chip, InputAdornment,
    CircularProgress, Tooltip, Fade
} from '@mui/material';
import {
    QrCodeScanner as BarcodeIcon,
    Keyboard as KeyboardIcon,
    CheckCircle as CheckCircleIcon,
    WarningAmber as WarningIcon,
    FlashOn as FlashIcon
} from '@mui/icons-material';

/**
 * UniversalPulseiraInput
 * Input universal para credenciamento de pulseiras no evento.
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
    placeholder = 'Bipe com o leitor ou digite o número da pulseira...',
    disabled = false,
    helperText
}) => {
    const inputRef = useRef(null);
    const keyTimestampsRef = useRef([]);
    const [origemLeitura, setOrigemLeitura] = useState(null); // 'barcode' | 'manual' | null
    const [pulseAnimation, setPulseAnimation] = useState(false);

    // Auto-focus agressivo e persistente para linha de montagem
    useEffect(() => {
        if (autoFocus && inputRef.current && !disabled) {
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
                // Barcode scanners enviam teclas em rajada rápida (< 45ms de intervalo)
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
            <TextField
                inputRef={inputRef}
                fullWidth
                value={value}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                disabled={disabled || loading}
                placeholder={placeholder}
                label="CÓDIGO / NÚMERO DA PULSEIRA"
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
                                    color: origemLeitura === 'barcode' ? '#00FF88' : '#00D4FF'
                                }}
                            >
                                <BarcodeIcon sx={{ fontSize: 26 }} />
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
                                <CircularProgress size={22} sx={{ color: '#00D4FF' }} />
                            ) : tipoPulseiraCorrespondente ? (
                                <Fade in>
                                    <Chip
                                        label={tipoPulseiraCorrespondente.nome_tipo}
                                        size="small"
                                        sx={{
                                            fontWeight: 800,
                                            fontSize: '0.75rem',
                                            bgcolor: tipoPulseiraCorrespondente.cor_hex 
                                                ? `${tipoPulseiraCorrespondente.cor_hex}33` 
                                                : 'rgba(0, 212, 255, 0.2)',
                                            color: tipoPulseiraCorrespondente.cor_hex || '#00D4FF',
                                            border: `1px solid ${tipoPulseiraCorrespondente.cor_hex || '#00D4FF'}`
                                        }}
                                    />
                                </Fade>
                            ) : value && !isNaN(parseInt(value, 10)) && pulseiraTypes.length > 0 ? (
                                <Tooltip title="Número não coincide com nenhuma faixa de lote pré-cadastrada">
                                    <Chip
                                        icon={<WarningIcon sx={{ fontSize: '14px !important' }} />}
                                        label="Faixa Avulsa"
                                        size="small"
                                        sx={{
                                            fontSize: '0.7rem',
                                            bgcolor: 'rgba(255, 170, 0, 0.15)',
                                            color: '#FFAA00'
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
                        color: '#fff',
                        fontSize: '1.25rem',
                        fontWeight: 700,
                        letterSpacing: '1.5px',
                        fontFamily: 'monospace, monospace',
                        borderRadius: 3,
                        transition: 'all 0.25s ease',
                        boxShadow: pulseAnimation 
                            ? '0 0 25px rgba(0, 255, 136, 0.6)' 
                            : '0 0 10px rgba(0, 212, 255, 0.15)',
                        border: pulseAnimation 
                            ? '2px solid #00FF88' 
                            : '1px solid rgba(0, 212, 255, 0.3)',
                        '& fieldset': { border: 'none' },
                        '&:hover': {
                            boxShadow: '0 0 18px rgba(0, 212, 255, 0.35)',
                            borderColor: '#00D4FF'
                        },
                        '&.Mui-focused': {
                            boxShadow: '0 0 22px rgba(0, 212, 255, 0.5)',
                            borderColor: '#00D4FF'
                        }
                    },
                    '& .MuiInputLabel-root': {
                        color: '#00D4FF',
                        fontWeight: 800,
                        fontSize: '0.85rem',
                        letterSpacing: '1px'
                    }
                }}
            />

            {/* Sub-informações e feedback */}
            <Stack direction="row" justifyContent="space-between" alignItems="center" mt={0.8} px={1}>
                <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.5)', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <KeyboardIcon sx={{ fontSize: 14 }} /> 
                    {helperText || 'Pressione Enter ↵ após bipe ou digitação para vincular e autorizar'}
                </Typography>

                {origemLeitura === 'barcode' && (
                    <Typography variant="caption" sx={{ color: '#00FF88', fontWeight: 700 }}>
                        ⚡ Leitura de scanner confirmada
                    </Typography>
                )}
            </Stack>
        </Box>
    );
};

export default UniversalPulseiraInput;
