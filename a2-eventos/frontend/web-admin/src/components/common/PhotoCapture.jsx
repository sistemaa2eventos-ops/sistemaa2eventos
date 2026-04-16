import React, { useState, useRef } from 'react';
import Webcam from 'react-webcam';
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
    Grid
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
} from '@mui/icons-material';
import { FaceValidator } from '../../utils/FaceValidator';
import FaceCropper from './FaceCropper';
import { keyframes } from '@mui/material/styles';

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
        maxWidth="sm"
        fullWidth
        PaperProps={{
            sx: {
                bgcolor: 'background.paper',
                border: '1px solid rgba(0, 212, 255, 0.15)',
                borderRadius: 3,
            }
        }}
    >
        <DialogTitle sx={{
            fontFamily: '"Space Grotesk", sans-serif',
            fontWeight: 700,
            fontSize: '1rem',
            letterSpacing: 0,
            color: 'text.primary',
            pb: 1,
            borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}>
            Verificação de Qualidade Biométrica
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
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                        fontWeight: 600,
                        display: 'block',
                        mb: 2,
                    }}>
                        Critérios de Qualidade
                    </Typography>

                    <ChecklistItem label="Rosto detectado" passed={result?.checklist?.faceDetected} />
                    <ChecklistItem label="Olhos visíveis" passed={result?.checklist?.eyeQuality} />
                    <ChecklistItem label="Expressão neutra" passed={result?.checklist?.neutralExpression} />
                    <ChecklistItem label="Contraste adequado" passed={result?.checklist?.contrast} />
                    <ChecklistItem label="Iluminação uniforme" passed={result?.checklist?.illumination} />
                    <ChecklistItem label="Rosto centralizado" passed={result?.checklist?.centered} />

                    <Box sx={{
                        mt: 2, p: 1.5,
                        bgcolor: 'rgba(255,255,255,0.03)',
                        border: '1px solid rgba(255,255,255,0.07)',
                        borderRadius: 2,
                    }}>
                        <Typography variant="caption" sx={{ color: 'text.disabled', lineHeight: 1.5 }}>
                            A verificação é assistida. A aceitação final ocorre nos terminais biométricos.
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
            >
                Usar esta foto
            </Button>
        </DialogActions>
    </Dialog>
);

/* ────────────────────────────────────────────────
   Componente principal
   ──────────────────────────────────────────────── */
const PhotoCapture = ({ onPhotoCaptured, initialPhoto }) => {
    const webcamRef  = useRef(null);
    const [imgSrc, setImgSrc]                 = useState(initialPhoto || null);
    const [isCameraOpen, setIsCameraOpen]     = useState(false);
    const [loading, setLoading]               = useState(false);
    const [cropperOpen, setCropperOpen]       = useState(false);
    const [tempImage, setTempImage]           = useState(null);
    const [showVerification, setShowVerification] = useState(false);
    const [validationResult, setValidationResult] = useState(null);

    const handleCapture = () => {
        const imageSrc = webcamRef.current.getScreenshot();
        setTempImage(imageSrc);
        setCropperOpen(true);
    };

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
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
                maxWidth: 260,
                aspectRatio: '3 / 4',
                bgcolor: 'rgba(0,0,0,0.4)',
                borderRadius: 3,
                border: '1px solid rgba(0,212,255,0.15)',
                overflow: 'hidden',
                boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
            }}>
                {/* Conteúdo */}
                {isCameraOpen ? (
                    <Webcam
                        audio={false}
                        ref={webcamRef}
                        screenshotFormat="image/jpeg"
                        videoConstraints={{ width: 480, height: 640, facingMode: 'user' }}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
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
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.2)', fontSize: '0.7rem' }}>
                            Sem foto
                        </Typography>
                    </Box>
                )}

                {/* Máscara oval */}
                <FaceMask active={isCameraOpen} />

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

            {/* Barra de ações */}
            <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
                {!isCameraOpen ? (
                    <Tooltip title="Abrir câmera" placement="bottom">
                        <IconButton
                            onClick={() => setIsCameraOpen(true)}
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
                    <Tooltip title="Tirar foto" placement="bottom">
                        <IconButton
                            onClick={handleCapture}
                            size="medium"
                            sx={{
                                color: '#00FF88',
                                bgcolor: 'rgba(0,255,136,0.08)',
                                border: '1px solid rgba(0,255,136,0.25)',
                                '&:hover': { bgcolor: 'rgba(0,255,136,0.16)' },
                            }}
                        >
                            <CameraIcon />
                        </IconButton>
                    </Tooltip>
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
