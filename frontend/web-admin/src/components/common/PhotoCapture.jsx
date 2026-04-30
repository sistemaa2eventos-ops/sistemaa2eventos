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
    Checkbox,
    FormControlLabel,
    Grid
} from '@mui/material';
import {
    CameraAlt as CameraIcon,
    Videocam as VideoIcon,
    CloudUpload as UploadIcon,
    Delete as DeleteIcon,
    CheckCircle as CheckIcon,
    Warning as WarningIcon
} from '@mui/icons-material';
import { FaceValidator } from '../../utils/FaceValidator';
import FaceCropper from './FaceCropper';
import { keyframes } from '@mui/material/styles';

const scanAnimation = keyframes`
  0% { top: 0% }
  50% { top: 100% }
  100% { top: 0% }
`;

const VerificationItem = ({ label, passed }) => (
    <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
        <CheckIcon sx={{ color: passed ? '#00FF88' : 'rgba(255,255,255,0.1)', filter: passed ? 'drop-shadow(0 0 5px #00FF88)' : 'none' }} />
        <Typography sx={{ color: passed ? '#fff' : 'rgba(255,255,255,0.4)', fontWeight: 500 }}>
            {label}
        </Typography>
    </Stack>
);

const VerificationView = ({ image, result, onSave, onRetry }) => (
    <Dialog
        open={true}
        maxWidth="md"
        fullWidth
        PaperProps={{
            sx: {
                bgcolor: '#0a1628',
                border: '1px solid rgba(0, 212, 255, 0.2)',
                backdropFilter: 'blur(10px)',
                backgroundImage: 'linear-gradient(rgba(0, 212, 255, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 212, 255, 0.05) 1px, transparent 1px)',
                backgroundSize: '20px 20px'
            }
        }}
    >
        <DialogTitle sx={{ color: '#fff', fontFamily: 'Orbitron', textAlign: 'center', pt: 4 }}>
            VALIDAÇÃO BIOMÉTRICA
        </DialogTitle>
        <DialogContent>
            <Grid container spacing={4} sx={{ mt: 1 }}>
                <Grid item xs={12} md={5} sx={{ display: 'flex', justifyContent: 'center' }}>
                    <Box sx={{ position: 'relative', width: 280, height: 350, border: '1px solid #00D4FF', borderRadius: 2, overflow: 'hidden' }}>
                        <Box component="img" src={image} sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        <Box sx={{
                            position: 'absolute',
                            left: 0,
                            right: 0,
                            height: '2px',
                            bgcolor: '#00D4FF',
                            boxShadow: '0 0 15px #00D4FF',
                            animation: `${scanAnimation} 3s infinite linear`,
                            zIndex: 2
                        }} />
                    </Box>
                </Grid>
                <Grid item xs={12} md={7}>
                    <Box sx={{ pl: 2 }}>
                        <VerificationItem label="Detecção Facial" passed={result?.checklist?.faceDetected} />
                        <VerificationItem label="Qualidade Ocular" passed={result?.checklist?.eyeQuality} />
                        <VerificationItem label="Expressão Neutra" passed={result?.checklist?.neutralExpression} />
                        <VerificationItem label="Contraste de Imagem" passed={result?.checklist?.contrast} />
                        <VerificationItem label="Nível de Iluminação" passed={result?.checklist?.illumination} />
                        <VerificationItem label="Centralização" passed={result?.checklist?.centered} />

                        <Box sx={{
                            mt: 4,
                            p: 2,
                            bgcolor: 'rgba(255,255,255,0.05)',
                            borderRadius: 1,
                            border: '1px solid rgba(255,255,255,0.1)'
                        }}>
                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', display: 'block' }}>
                                A verificação de qualidade é um guia assistente. A aceitação final será realizada pelos dispositivos de reconhecimento facial.
                            </Typography>
                        </Box>
                    </Box>
                </Grid>
            </Grid>
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'center', pb: 4, gap: 2 }}>
            <Button
                variant="contained"
                onClick={onSave}
                sx={{ bgcolor: '#00D4FF', color: '#000', px: 6, fontWeight: 'bold', '&:hover': { bgcolor: '#00b4d8' } }}
            >
                SALVAR
            </Button>
            <Button
                variant="outlined"
                onClick={onRetry}
                sx={{ color: '#fff', borderColor: '#00D4FF', px: 4 }}
            >
                REPETIR
            </Button>
        </DialogActions>
    </Dialog>
);

const PhotoCapture = ({ onPhotoCaptured, initialPhoto }) => {
    const webcamRef = useRef(null);
    const [imgSrc, setImgSrc] = useState(initialPhoto || null);
    const [isCameraOpen, setIsCameraOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [cropperOpen, setCropperOpen] = useState(false);
    const [tempImage, setTempImage] = useState(null);
    const [showVerification, setShowVerification] = useState(false);
    const [validationResult, setValidationResult] = useState(null);

    const handleCapture = async () => {
        const imageSrc = webcamRef.current.getScreenshot();
        setTempImage(imageSrc);
        setCropperOpen(true);
    };

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = () => {
                setTempImage(reader.result);
                setCropperOpen(true);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleCropComplete = async (croppedImage) => {
        setLoading(true);
        const validation = await FaceValidator.validate(croppedImage);
        setValidationResult(validation);
        setTempImage(croppedImage);
        setShowVerification(true);
        setLoading(false);
        setCropperOpen(false);
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
            <VerificationView
                image={tempImage}
                result={validationResult}
                onSave={handleSavePhoto}
                onRetry={() => setShowVerification(false)}
            />
        );
    }

    return (
        <Box sx={{ position: 'relative', textAlign: 'center', py: 2 }}>
            {/* Frame da Foto */}
            <Box sx={{
                position: 'relative',
                width: 280,
                height: 350,
                margin: '0 auto',
                bgcolor: 'rgba(0,0,0,0.3)',
                borderRadius: 2,
                border: '1px solid rgba(0, 212, 255, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                zIndex: 1,
                boxShadow: '0 4px 15px rgba(0,0,0,0.3)'
            }}>
                {isCameraOpen ? (
                    <Webcam
                        audio={false}
                        ref={webcamRef}
                        screenshotFormat="image/jpeg"
                        videoConstraints={{ width: 450, height: 600, facingMode: "user" }}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                ) : imgSrc ? (
                    <img src={imgSrc} alt="Pessoa" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                    <Box sx={{ color: 'rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                            <circle cx="12" cy="7" r="4"></circle>
                        </svg>
                    </Box>
                )}

                {loading && (
                    <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, bgcolor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}>
                        <CircularProgress size={30} sx={{ color: '#00D4FF' }} />
                    </Box>
                )}
            </Box>

            {/* Apenas ícones reais: Ligar Câmera/Capturar, Upload e Excluir */}
            <Stack direction="row" spacing={2} justifyContent="center" sx={{ mt: 3, zIndex: 2, position: 'relative' }}>
                {!isCameraOpen ? (
                    <IconButton
                        size="small"
                        onClick={() => setIsCameraOpen(true)}
                        sx={{ color: '#00D4FF', bgcolor: 'rgba(0, 212, 255, 0.1)', '&:hover': { bgcolor: 'rgba(0, 212, 255, 0.2)' } }}
                        title="Ativar Câmera"
                    >
                        <VideoIcon fontSize="small" />
                    </IconButton>
                ) : (
                    <IconButton
                        size="small"
                        onClick={handleCapture}
                        sx={{ color: '#00FF88', bgcolor: 'rgba(0, 255, 136, 0.1)', '&:hover': { bgcolor: 'rgba(0, 255, 136, 0.2)' } }}
                        title="Tirar Foto"
                    >
                        <CameraIcon fontSize="small" />
                    </IconButton>
                )}

                <IconButton
                    size="small"
                    component="label"
                    sx={{ color: '#fff', bgcolor: 'rgba(255, 255, 255, 0.05)', '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.1)' } }}
                    title="Upload de Foto"
                >
                    <input type="file" hidden accept="image/*" onChange={handleFileUpload} />
                    <UploadIcon fontSize="small" />
                </IconButton>

                <IconButton
                    size="small"
                    onClick={handleDelete}
                    disabled={!imgSrc && !isCameraOpen}
                    sx={{ color: '#FF3366', bgcolor: 'rgba(255, 51, 102, 0.05)', '&:hover': { bgcolor: 'rgba(255, 51, 102, 0.1)' } }}
                    title="Excluir"
                >
                    <DeleteIcon fontSize="small" />
                </IconButton>
            </Stack>

            <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                <FormControlLabel
                    control={
                        <Checkbox
                            size="small"
                            checked={!!imgSrc}
                            sx={{ color: 'rgba(255,255,255,0.2)', '&.Mui-checked': { color: '#00FF88' } }}
                        />
                    }
                    label={<Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)' }}>Imagem facial vinculada</Typography>}
                />

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2 }}>
                    <WarningIcon sx={{ color: '#FFB800', fontSize: 14 }} />
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.6rem' }}>
                        A foto será sincronizada com os terminais de acesso.
                    </Typography>
                </Box>
            </Box>

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
