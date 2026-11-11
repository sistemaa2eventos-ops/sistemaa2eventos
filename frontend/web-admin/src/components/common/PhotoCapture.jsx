import React, { useState, useRef, useEffect, useCallback } from 'react';
import Webcam from 'react-webcam';
import { useSnackbar } from 'notistack';
import {
    Box,
    Button,
    Typography,
    IconButton,
    Stack,
    CircularProgress,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Tooltip,
    Grid,
    Select,
    MenuItem
} from '@mui/material';
import {
    CameraAlt as CameraIcon,
    Videocam as VideoIcon,
    CloudUpload as UploadIcon,
    Delete as DeleteIcon,
    CheckCircle as CheckIcon,
    RadioButtonUnchecked as UncheckedIcon,
    ReplayRounded as RetryIcon,
    SaveAlt as SaveIcon,
    Cameraswitch as SwitchCameraIcon,
} from '@mui/icons-material';
import { FaceValidator } from '../../utils/FaceValidator';
import FaceCropper from './FaceCropper';
import { keyframes } from '@mui/material/styles';

const traduzirErroCamera = (err) => {
    const nome = err?.name || '';
    const msg = String(err?.message || err || '');
    if (nome === 'NotAllowedError' || /permission|denied/i.test(msg)) {
        return 'Permissão da câmera bloqueada. Clique no ícone de cadeado/câmera na barra de endereço do navegador, permita o acesso e tente de novo.';
    }
    if (nome === 'NotFoundError' || /not found|no camera|requested device/i.test(msg)) {
        return 'Nenhuma câmera foi encontrada conectada a este computador.';
    }
    if (nome === 'NotReadableError' || /in use|could not start|hardware/i.test(msg)) {
        return 'A câmera está ocupada por outro programa (como OBS, Teams, Zoom ou outra aba) ou falhou ao iniciar. Feche o outro app ou troque a câmera abaixo.';
    }
    if (typeof window !== 'undefined' && !window.isSecureContext) {
        return 'A câmera só pode ser aberta em conexão segura (HTTPS ou localhost).';
    }
    return 'Não foi possível iniciar o vídeo da câmera. Tente trocar de câmera abaixo ou enviar arquivo.';
};

const scanLine = keyframes`
  0%   { top: 8%; opacity: 0.7; }
  50%  { top: 88%; opacity: 1; }
  100% { top: 8%; opacity: 0.7; }
`;

const pulse = keyframes`
  0%, 100% { opacity: 0.5; }
  50%       { opacity: 1; }
`;

/* ────────────────────────────────────────────────
   Máscara de enquadramento facial
   ──────────────────────────────────────────────── */
const FaceMask = ({ active }) => (
    <Box
        sx={{
            position: 'absolute',
            inset: 0,
            zIndex: 3,
            pointerEvents: 'none',
        }}
    >
        {/* Sombra lateral — deixa só a oval visível */}
        <Box sx={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(5, 11, 24, 0.55)',
            WebkitMaskImage: 'radial-gradient(ellipse 62% 72% at 50% 46%, transparent 98%, black 100%)',
            maskImage:        'radial-gradient(ellipse 62% 72% at 50% 46%, transparent 98%, black 100%)',
        }} />

        {/* Borda oval */}
        <Box sx={{
            position: 'absolute',
            left: '50%',
            top: '46%',
            transform: 'translate(-50%, -50%)',
            width: '62%',
            paddingTop: '74%',   /* aspect-ratio aproximado de rosto */
            borderRadius: '50%',
            border: active
                ? '2px solid rgba(0, 212, 255, 0.9)'
                : '2px solid rgba(255,255,255,0.25)',
            boxShadow: active ? '0 0 12px rgba(0,212,255,0.4)' : 'none',
            transition: 'border-color 0.3s, box-shadow 0.3s',
            animation: active ? `${pulse} 2s ease-in-out infinite` : 'none',
        }} />

        {/* Linha de scan (só quando câmera ativa) */}
        {active && (
            <Box sx={{
                position: 'absolute',
                left: '19%',
                right: '19%',
                height: '1px',
                bgcolor: 'rgba(0,212,255,0.7)',
                boxShadow: '0 0 8px rgba(0,212,255,0.6)',
                animation: `${scanLine} 2.8s ease-in-out infinite`,
            }} />
        )}

        {/* Cantos de enquadramento */}
        {[
            { top: '6%',  left: '8%',  borderTop: true,  borderLeft: true  },
            { top: '6%',  right: '8%', borderTop: true,  borderRight: true },
            { bottom: '6%', left: '8%', borderBottom: true, borderLeft: true },
            { bottom: '6%', right: '8%', borderBottom: true, borderRight: true },
        ].map((corner, i) => (
            <Box key={i} sx={{
                position: 'absolute',
                width: 18,
                height: 18,
                ...corner,
                borderTopWidth:    corner.borderTop    ? '2px' : 0,
                borderLeftWidth:   corner.borderLeft   ? '2px' : 0,
                borderRightWidth:  corner.borderRight  ? '2px' : 0,
                borderBottomWidth: corner.borderBottom ? '2px' : 0,
                borderStyle: 'solid',
                borderColor: 'rgba(0,212,255,0.6)',
                borderRadius: 0,
            }} />
        ))}
    </Box>
);

// Critérios conferidos pelo FaceValidator (só aparecem os que foram medidos)
const CRITERIOS = [
    ['faceDetected', 'Rosto detectado'],
    ['singleFace', 'Só uma pessoa na foto'],
    ['faceSize', 'Rosto grande o bastante'],
    ['sharpness', 'Foto nítida'],
    ['centered', 'Rosto centralizado'],
    ['contrast', 'Contraste adequado'],
    ['illumination', 'Iluminação adequada'],
];

/* ────────────────────────────────────────────────
   Item de checklist de validação
   ──────────────────────────────────────────────── */
const ChecklistItem = ({ label, passed }) => (
    <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1.5 }}>
        {passed
            ? <CheckIcon sx={{ color: '#00FF88', fontSize: 18, flexShrink: 0 }} />
            : <UncheckedIcon sx={{ color: 'rgba(255,255,255,0.2)', fontSize: 18, flexShrink: 0 }} />
        }
        <Typography variant="body2" sx={{
            color: passed ? 'text.primary' : 'text.disabled',
            fontWeight: passed ? 600 : 400,
            transition: 'color 0.2s',
        }}>
            {label}
        </Typography>
    </Stack>
);

/* ────────────────────────────────────────────────
   Diálogo de verificação biométrica
   ──────────────────────────────────────────────── */
const VerificationDialog = ({ image, result, onSave, onRetry }) => (
    <Dialog
        open
        onClose={onRetry}
        maxWidth="sm"
        fullWidth
    >
        <DialogTitle sx={{
            fontFamily: '"Space Grotesk", sans-serif',
            fontWeight: 700,
            fontSize: '1rem',
            color: 'text.primary',
            pb: 1,
            borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}>
            Verificação de qualidade biométrica
        </DialogTitle>

        <DialogContent sx={{ pt: 3 }}>
            <Grid container spacing={3} alignItems="flex-start">
                {/* Foto capturada */}
                <Grid item xs={12} sm={5}>
                    <Box sx={{
                        position: 'relative',
                        borderRadius: '50%',
                        overflow: 'hidden',
                        width: '100%',
                        maxWidth: 180,
                        aspectRatio: '1 / 1',
                        mx: 'auto',
                        border: '3px solid rgba(0, 212, 255, 0.3)',
                        boxShadow: '0 0 24px rgba(0,212,255,0.15)',
                    }}>
                        <Box
                            component="img"
                            src={image}
                            alt="Foto capturada"
                            sx={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top' }}
                        />
                    </Box>
                </Grid>

                {/* Checklist */}
                <Grid item xs={12} sm={7}>
                    <Typography variant="caption" sx={{
                        color: 'text.disabled',
                        letterSpacing: '0.08em',
                        fontWeight: 600,
                        display: 'block',
                        mb: 2,
                    }}>
                        Critérios de qualidade
                    </Typography>

                    {CRITERIOS.filter(([chave]) => result?.checklist?.[chave] !== undefined).map(([chave, label]) => (
                        <ChecklistItem key={chave} label={label} passed={result.checklist[chave]} />
                    ))}

                    {result?.errors?.length > 0 && (
                        <Box sx={{ mt: 1, mb: 1 }}>
                            {result.errors.map(e => (
                                <Typography key={e} variant="caption" sx={{ display: 'block', color: '#FF8A80' }}>• {e}</Typography>
                            ))}
                        </Box>
                    )}

                    <Box sx={{
                        mt: 2, p: 1.5,
                        bgcolor: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.07)',
                        borderRadius: 1.5,
                    }}>
                        <Typography variant="caption" sx={{ color: 'text.disabled', lineHeight: 1.5 }}>
                            Foto ruim gera biometria ruim: a pessoa deixa de ser reconhecida pelas câmeras e pelos leitores.
                        </Typography>
                    </Box>
                </Grid>
            </Grid>
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
            <Button
                startIcon={<RetryIcon />}
                variant="outlined"
                onClick={onRetry}
                sx={{ borderColor: 'rgba(255,255,255,0.15)', color: 'text.secondary' }}
            >
                Repetir
            </Button>
            <Button
                startIcon={<SaveIcon />}
                variant="contained"
                onClick={onSave}
                color="primary"
                disabled={!result?.isValid}
            >
                Usar esta foto
            </Button>
        </DialogActions>
    </Dialog>
);

/* ────────────────────────────────────────────────
   Componente principal
   ──────────────────────────────────────────────── */
const PhotoCapture = ({ onPhotoCaptured, initialPhoto, modoDocumento = false, autoOpen = false }) => {
    const webcamRef  = useRef(null);
    const [imgSrc, setImgSrc]                 = useState(initialPhoto || null);
    const [isCameraOpen, setIsCameraOpen]     = useState(Boolean(autoOpen));
    const [cameraReady, setCameraReady]       = useState(false);
    const [cameraError, setCameraError]       = useState(null);
    const [fallbackMode, setFallbackMode]     = useState(false);
    const [devices, setDevices]               = useState([]);
    const [selectedDeviceId, setSelectedDeviceId] = useState('');
    const [loading, setLoading]               = useState(false);
    const [cropperOpen, setCropperOpen]       = useState(false);
    const [tempImage, setTempImage]           = useState(null);
    const [showVerification, setShowVerification] = useState(false);
    const [validationResult, setValidationResult] = useState(null);

    const { enqueueSnackbar } = useSnackbar();

    useEffect(() => {
        setImgSrc(initialPhoto || null);
    }, [initialPhoto]);

    const atualizarListaCameras = useCallback(async () => {
        if (!navigator.mediaDevices?.enumerateDevices) return;
        try {
            const all = await navigator.mediaDevices.enumerateDevices();
            const cams = all.filter(d => d.kind === 'videoinput');
            setDevices(cams);
            setSelectedDeviceId(prev => {
                if (prev && cams.some(c => c.deviceId === prev)) return prev;
                // Prioriza webcam física se houver câmera virtual (ex: OBS) desligada
                const fisica = cams.find(c => !/obs|virtual/i.test(c.label || ''));
                return (fisica || cams[0])?.deviceId || '';
            });
        } catch {
            // ignorar erro de enumeração
        }
    }, []);

    useEffect(() => {
        if (autoOpen) {
            atualizarListaCameras();
        }
    }, [autoOpen, atualizarListaCameras]);

    const abrirCamera = () => {
        setCameraError(null);
        setCameraReady(false);
        setFallbackMode(false);
        setIsCameraOpen(true);
        atualizarListaCameras();
    };

    const handleUserMedia = () => {
        setCameraReady(true);
        setCameraError(null);
        atualizarListaCameras();
    };

    const handleUserMediaError = (err) => {
        console.warn('Webcam erro:', err);
        if (!fallbackMode) {
            // Fallback: remove restrições de resolução/deviceId e pede qualquer vídeo disponível no PC
            setFallbackMode(true);
            setSelectedDeviceId('');
            return;
        }
        setCameraReady(false);
        const msg = traduzirErroCamera(err);
        setCameraError(msg);
        enqueueSnackbar(msg, { variant: 'error' });
    };

    const trocarCamera = () => {
        if (devices.length < 2) return;
        const idx = devices.findIndex(d => d.deviceId === selectedDeviceId);
        const next = devices[(idx + 1) % devices.length];
        if (next) {
            setCameraReady(false);
            setCameraError(null);
            setFallbackMode(false);
            setSelectedDeviceId(next.deviceId);
        }
    };

    const videoConstraints = React.useMemo(() => {
        if (fallbackMode) return true;
        const idealW = modoDocumento ? 1280 : 640;
        const idealH = modoDocumento ? 720 : 480;
        if (selectedDeviceId) {
            return {
                deviceId: { exact: selectedDeviceId },
                width: { ideal: idealW },
                height: { ideal: idealH }
            };
        }
        return {
            width: { ideal: idealW },
            height: { ideal: idealH },
            facingMode: modoDocumento ? 'environment' : 'user'
        };
    }, [fallbackMode, selectedDeviceId, modoDocumento]);

    const handleCapture = async () => {
        if (!webcamRef.current || !cameraReady) return;
        
        try {
            setLoading(true);
            const imageSrc = webcamRef.current.getScreenshot();
            if (!imageSrc) {
                enqueueSnackbar('A câmera ainda está iniciando. Aguarde a imagem aparecer e tente novamente.', { variant: 'warning' });
                return;
            }

            if (modoDocumento) {
                setImgSrc(imageSrc);
                onPhotoCaptured(imageSrc);
                setIsCameraOpen(false);
                setCameraReady(false);
                enqueueSnackbar('Foto do documento capturada com sucesso.', { variant: 'success' });
                return;
            }
            
            // Bypass manual cropper for webcam: Use Automated Smart Crop
            const validation = await FaceValidator.validate(imageSrc);
            
            if (validation.isValid && validation.croppedBase64) {
                // INSTANT SAVE FOR SELFIES: Skip cropper AND verification dialog
                setImgSrc(validation.croppedBase64);
                onPhotoCaptured(validation.croppedBase64);
                setIsCameraOpen(false);
                setCameraReady(false);
                enqueueSnackbar('Biometria capturada com sucesso.', { variant: 'success' });
            } else {
                enqueueSnackbar(validation.errors[0] || 'Falha na detecção facial. Tente novamente.', { variant: 'error' });
            }
        } catch (err) {
            console.error("Capture Error:", err);
            enqueueSnackbar('Erro ao processar a captura biométrica.', { variant: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            if (modoDocumento) {
                setImgSrc(reader.result);
                onPhotoCaptured(reader.result);
                setIsCameraOpen(false);
                return;
            }
            setTempImage(reader.result);
            setCropperOpen(true);
        };
        reader.readAsDataURL(file);
    };

    const handleCropComplete = async (croppedImage) => {
        setLoading(true);
        const validation = await FaceValidator.validate(croppedImage);
        setValidationResult(validation);
        setTempImage(croppedImage);
        setCropperOpen(false);
        setShowVerification(true);
        setLoading(false);
    };

    const handleSavePhoto = () => {
        setImgSrc(tempImage);
        onPhotoCaptured(tempImage);
        setShowVerification(false);
        setIsCameraOpen(false);
    };

    const handleDelete = () => {
        setImgSrc(null);
        onPhotoCaptured(null);
        setTempImage(null);
        setIsCameraOpen(false);
        setCameraReady(false);
        setCameraError(null);
    };

    if (showVerification) {
        return (
            <VerificationDialog
                image={tempImage}
                result={validationResult}
                onSave={handleSavePhoto}
                onRetry={() => setShowVerification(false)}
            />
        );
    }

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 1 }}>

            {/* Container da foto / câmera */}
            <Box sx={{
                position: 'relative',
                width: '100%',
                maxWidth: modoDocumento ? 420 : 260,
                aspectRatio: modoDocumento ? '4 / 3' : '3 / 4',
                bgcolor: 'rgba(0,0,0,0.4)',
                borderRadius: 1.5,
                border: '1px solid rgba(0,212,255,0.15)',
                overflow: 'hidden',
                boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
            }}>
                {/* Conteúdo */}
                {isCameraOpen ? (
                    <>
                        <Webcam
                            key={fallbackMode ? 'fallback' : (selectedDeviceId || 'default')}
                            audio={false}
                            ref={webcamRef}
                            mirrored={!modoDocumento}
                            screenshotFormat="image/jpeg"
                            screenshotQuality={0.92}
                            forceScreenshotSourceSize={true}
                            videoConstraints={videoConstraints}
                            onUserMedia={handleUserMedia}
                            onUserMediaError={handleUserMediaError}
                            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                        />
                        {!cameraReady && !cameraError && (
                            <Box sx={{
                                position: 'absolute', inset: 0, zIndex: 5,
                                bgcolor: 'rgba(5, 11, 24, 0.78)',
                                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                gap: 1.5, p: 2, textAlign: 'center'
                            }}>
                                <CircularProgress size={28} sx={{ color: '#00D4FF' }} />
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.8)' }}>
                                    Iniciando câmera...
                                </Typography>
                            </Box>
                        )}
                        {cameraError && (
                            <Box sx={{
                                position: 'absolute', inset: 0, zIndex: 6,
                                bgcolor: 'rgba(5, 11, 24, 0.92)',
                                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                gap: 1.5, p: 2, textAlign: 'center'
                            }}>
                                <Typography variant="caption" sx={{ color: '#FF8A80', lineHeight: 1.4 }}>
                                    {cameraError}
                                </Typography>
                                <Button size="small" variant="outlined" onClick={abrirCamera} sx={{ color: '#00D4FF', borderColor: '#00D4FF', fontSize: '0.72rem' }}>
                                    Tentar novamente
                                </Button>
                            </Box>
                        )}
                    </>
                ) : imgSrc ? (
                    <Box
                        component="img"
                        src={imgSrc}
                        alt="Foto do participante"
                        sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                ) : (
                    <Box sx={{
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'rgba(255,255,255,0.12)',
                        gap: 1,
                    }}>
                        <svg width="56" height="56" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                            <circle cx="12" cy="7" r="4" />
                        </svg>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.2)', fontSize: '0.75rem' }}>
                            Sem foto
                        </Typography>
                    </Box>
                )}

                {/* Máscara oval (apenas para captura facial) */}
                {!modoDocumento && <FaceMask active={isCameraOpen && cameraReady} />}

                {/* Spinner de processamento */}
                {loading && (
                    <Box sx={{
                        position: 'absolute', inset: 0, zIndex: 10,
                        bgcolor: 'rgba(0,0,0,0.6)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <CircularProgress size={32} thickness={3} sx={{ color: 'primary.main' }} />
                    </Box>
                )}
            </Box>

            {/* Seletor de câmera quando houver mais de 1 câmera no PC */}
            {isCameraOpen && devices.length > 1 && (
                <Select
                    size="small"
                    value={selectedDeviceId}
                    onChange={(e) => {
                        setCameraReady(false);
                        setCameraError(null);
                        setFallbackMode(false);
                        setSelectedDeviceId(e.target.value);
                    }}
                    sx={{
                        mt: 1.5,
                        maxWidth: 260,
                        width: '100%',
                        height: 32,
                        fontSize: '0.75rem',
                        color: '#FFFFFF',
                        bgcolor: 'rgba(0,0,0,0.35)',
                        '.MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(0,212,255,0.25)' }
                    }}
                >
                    {devices.map((d, idx) => (
                        <MenuItem key={d.deviceId || idx} value={d.deviceId} sx={{ fontSize: '0.75rem' }}>
                            {d.label || `Câmera ${idx + 1}`}
                        </MenuItem>
                    ))}
                </Select>
            )}

            {/* Barra de ações */}
            <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
                {!isCameraOpen ? (
                    <Tooltip title="Abrir câmera" placement="bottom">
                        <IconButton
                            onClick={abrirCamera}
                            size="medium"
                            sx={{
                                color: 'primary.main',
                                bgcolor: 'rgba(0,212,255,0.08)',
                                border: '1px solid rgba(0,212,255,0.2)',
                                '&:hover': { bgcolor: 'rgba(0,212,255,0.16)' },
                            }}
                        >
                            <VideoIcon />
                        </IconButton>
                    </Tooltip>
                ) : (
                    <>
                        <Tooltip title="Tirar foto" placement="bottom">
                            <span>
                                <IconButton
                                    onClick={handleCapture}
                                    disabled={!cameraReady || loading}
                                    size="medium"
                                    sx={{
                                        color: '#00FF88',
                                        bgcolor: 'rgba(0,255,136,0.08)',
                                        border: '1px solid rgba(0,255,136,0.25)',
                                        '&:hover': { bgcolor: 'rgba(0,255,136,0.16)' },
                                        '&.Mui-disabled': { opacity: 0.35 },
                                    }}
                                >
                                    <CameraIcon />
                                </IconButton>
                            </span>
                        </Tooltip>
                        {devices.length > 1 && (
                            <Tooltip title="Trocar câmera" placement="bottom">
                                <IconButton
                                    onClick={trocarCamera}
                                    size="medium"
                                    sx={{
                                        color: '#00D4FF',
                                        bgcolor: 'rgba(0,212,255,0.08)',
                                        border: '1px solid rgba(0,212,255,0.2)',
                                        '&:hover': { bgcolor: 'rgba(0,212,255,0.16)' },
                                    }}
                                >
                                    <SwitchCameraIcon />
                                </IconButton>
                            </Tooltip>
                        )}
                    </>
                )}

                <Tooltip title="Enviar arquivo" placement="bottom">
                    <IconButton
                        component="label"
                        size="medium"
                        sx={{
                            color: 'text.secondary',
                            bgcolor: 'rgba(255,255,255,0.04)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            '&:hover': { bgcolor: 'rgba(255,255,255,0.08)', color: 'text.primary' },
                        }}
                    >
                        <input type="file" hidden accept="image/*" onChange={handleFileUpload} />
                        <UploadIcon />
                    </IconButton>
                </Tooltip>

                <Tooltip title="Remover foto" placement="bottom">
                    <span>
                        <IconButton
                            onClick={handleDelete}
                            disabled={!imgSrc && !isCameraOpen}
                            size="medium"
                            sx={{
                                color: 'error.main',
                                bgcolor: 'rgba(255,51,102,0.05)',
                                border: '1px solid rgba(255,51,102,0.15)',
                                '&:hover': { bgcolor: 'rgba(255,51,102,0.12)' },
                                '&.Mui-disabled': { opacity: 0.3 },
                            }}
                        >
                            <DeleteIcon />
                        </IconButton>
                    </span>
                </Tooltip>
            </Stack>

            {/* Status */}
            <Typography variant="caption" sx={{
                mt: 1.5,
                color: imgSrc ? '#00FF88' : 'text.disabled',
                fontWeight: imgSrc ? 600 : 400,
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                transition: 'color 0.3s',
            }}>
                {imgSrc
                    ? <><CheckIcon sx={{ fontSize: 14 }} /> Foto vinculada</>
                    : 'Nenhuma foto cadastrada'
                }
            </Typography>

            <FaceCropper
                open={cropperOpen}
                image={tempImage}
                onClose={() => setCropperOpen(false)}
                onCropComplete={handleCropComplete}
            />
        </Box>
    );
};

export default PhotoCapture;
