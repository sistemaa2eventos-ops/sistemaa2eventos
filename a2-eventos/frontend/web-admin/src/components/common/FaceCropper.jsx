import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
    Box,
    Slider,
    Typography,
    Button,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Stack
} from '@mui/material';
import {
    Search as ZoomIcon,
    RestartAlt as ResetIcon
} from '@mui/icons-material';

const FaceCropper = ({ image, open, onClose, onCropComplete }) => {
    const [scale, setScale] = useState(1);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [dragging, setDragging] = useState(false);
    const [lastPos, setLastPos] = useState({ x: 0, y: 0 });
    const containerRef = useRef(null);
    const imgRef = useRef(null);

    // Proporção de enquadramento (3:4) - Visualização confortável
    const MASK_WIDTH = 320;
    const MASK_HEIGHT = 400;

    useEffect(() => {
        if (open) {
            setScale(1);
            setPosition({ x: 0, y: 0 });
        }
    }, [open, image]);

    const handleMouseDown = (e) => {
        setDragging(true);
        setLastPos({ x: e.clientX, y: e.clientY });
    };

    const handleMouseMove = useCallback((e) => {
        if (!dragging) return;
        const dx = e.clientX - lastPos.x;
        const dy = e.clientY - lastPos.y;
        setPosition(prev => ({ x: prev.x + dx, y: prev.y + dy }));
        setLastPos({ x: e.clientX, y: e.clientY });
    }, [dragging, lastPos]);

    const handleMouseUp = useCallback(() => {
        setDragging(false);
    }, []);

    useEffect(() => {
        if (dragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        } else {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [dragging, handleMouseMove, handleMouseUp]);

    const handleConfirm = () => {
        if (!imgRef.current) return;

        const img = imgRef.current;
        const canvas = document.createElement('canvas');
        // Resolução alvo para o leitor facial (ex: 450x600)
        canvas.width = 450;
        canvas.height = 600;
        const ctx = canvas.width > 0 ? canvas.getContext('2d') : null;
        if (!ctx) return;

        // Fundo branco
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Calcular o fator de escala real entre o preview e a imagem original
        // No preview, a imagem é exibida com transform: translate e scale
        // Área de visualização é 320x400 (MASK)

        const previewRatio = canvas.width / MASK_WIDTH;

        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.scale(scale * previewRatio, scale * previewRatio);
        ctx.translate(position.x / scale, position.y / scale);

        // Desenhar a imagem centralizada
        ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
        ctx.restore();

        const finalImage = canvas.toDataURL('image/jpeg', 0.9);
        onCropComplete(finalImage);
        onClose();
    };

    const handleReset = () => {
        setScale(1);
        setPosition({ x: 0, y: 0 });
    };

    // Estilo para o retículo (Brackets Cyan)
    const renderBrackets = () => (
        <>
            {/* Top Left */}
            <Box sx={{ position: 'absolute', top: 0, left: 0, width: 50, height: 50, borderTop: '6px solid #00D4FF', borderLeft: '6px solid #00D4FF', zIndex: 10 }} />
            {/* Top Right */}
            <Box sx={{ position: 'absolute', top: 0, right: 0, width: 50, height: 50, borderTop: '6px solid #00D4FF', borderRight: '6px solid #00D4FF', zIndex: 10 }} />
            {/* Bottom Left */}
            <Box sx={{ position: 'absolute', bottom: 0, left: 0, width: 50, height: 50, borderBottom: '6px solid #00D4FF', borderLeft: '6px solid #00D4FF', zIndex: 10 }} />
            {/* Bottom Right */}
            <Box sx={{ position: 'absolute', bottom: 0, right: 0, width: 50, height: 50, borderBottom: '6px solid #00D4FF', borderRight: '6px solid #00D4FF', zIndex: 10 }} />
        </>
    );

    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth="md"
            fullWidth
            PaperProps={{
                sx: {
                    bgcolor: '#050a14',
                    backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(0,212,255,0.05) 1px, transparent 0)',
                    backgroundSize: '24px 24px',
                    border: '1px solid rgba(0, 212, 255, 0.1)',
                    borderRadius: 4,
                    boxShadow: '0 0 50px rgba(0,0,0,0.8)',
                    overflow: 'hidden',
                    mx: { xs: 1, sm: 2 }
                }
            }}
            disableEnforceFocus
        >
            <DialogTitle sx={{ textAlign: 'center', pt: 6, pb: 2 }} component="div">
                <Typography variant="h4" sx={{
                    color: '#fff',
                    fontFamily: '"Orbitron", sans-serif',
                    fontWeight: 900,
                    letterSpacing: { xs: 2, sm: 4 },
                    textTransform: 'uppercase',
                    fontSize: { xs: '1.25rem', sm: '2.125rem' }
                }}>
                    ENQUADRAMENTO BIOMÉTRICO
                </Typography>
                <Typography variant="body2" sx={{
                    color: 'rgba(255,255,255,0.4)',
                    mt: 1,
                    fontWeight: 500,
                    letterSpacing: 0.5
                }}>
                    Sincronize o rosto com o retículo tecnológico para obter máxima performance facial
                </Typography>
            </DialogTitle>

            <DialogContent sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                overflow: 'hidden',
                py: 2
            }}>
                <Box
                    ref={containerRef}
                    sx={{
                        position: 'relative',
                        width: '100%',
                        maxWidth: 720,
                        aspectRatio: '3 / 2',
                        bgcolor: '#000',
                        borderRadius: 3,
                        border: '1px solid rgba(0, 212, 255, 0.2)',
                        overflow: 'hidden',
                        cursor: dragging ? 'grabbing' : 'grab',
                        touchAction: 'none',
                        boxShadow: '0 0 30px rgba(0,212,255,0.05)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}
                    onMouseDown={handleMouseDown}
                    onTouchStart={(e) => {
                        setDragging(true);
                        setLastPos({ x: e.touches[0].clientX, y: e.touches[0].clientY });
                    }}
                    onTouchMove={(e) => {
                        if (!dragging) return;
                        const dx = e.touches[0].clientX - lastPos.x;
                        const dy = e.touches[0].clientY - lastPos.y;
                        setPosition(prev => ({ x: prev.x + dx, y: prev.y + dy }));
                        setLastPos({ x: e.touches[0].clientX, y: e.touches[0].clientY });
                    }}
                    onTouchEnd={() => setDragging(false)}
                >
                    {/* Imagem com Transformação de Hardware */}
                    <img
                        ref={imgRef}
                        src={image}
                        alt="Preview"
                        style={{
                            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                            transition: dragging ? 'none' : 'transform 0.1s ease-out',
                            maxWidth: 'none',
                            userSelect: 'none',
                            pointerEvents: 'none'
                        }}
                    />

                    {/* Máscara de Enquadramento */}
                    <Box sx={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        pointerEvents: 'none',
                        zIndex: 5,
                        backgroundColor: 'rgba(5, 10, 20, 0.75)',
                        // Dinâmico baseado na largura do contêiner
                        clipPath: `polygon(
                            0% 0%, 0% 100%, 
                            calc(50% - ${MASK_WIDTH/2}px) 100%, 
                            calc(50% - ${MASK_WIDTH/2}px) calc(50% - ${MASK_HEIGHT/2}px), 
                            calc(50% + ${MASK_WIDTH/2}px) calc(50% - ${MASK_HEIGHT/2}px), 
                            calc(50% + ${MASK_WIDTH/2}px) calc(50% + ${MASK_HEIGHT/2}px), 
                            calc(50% - ${MASK_WIDTH/2}px) calc(50% + ${MASK_HEIGHT/2}px), 
                            calc(50% - ${MASK_WIDTH/2}px) 100%, 
                            100% 100%, 100% 0%
                        )`
                    }} />

                    {/* Retículo (Centralizado) */}
                    <Box sx={{
                        position: 'absolute',
                        width: MASK_WIDTH,
                        height: MASK_HEIGHT,
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        pointerEvents: 'none',
                        zIndex: 10
                    }}>
                        {renderBrackets()}
                    </Box>
                </Box>

                <Stack direction="row" spacing={3} alignItems="center" sx={{ width: '80%', mt: 6 }}>
                    <ZoomIcon sx={{ color: '#00D4FF', fontSize: 24 }} />
                    <Slider
                        value={scale}
                        min={0.1}
                        max={4}
                        step={0.01}
                        onChange={(e, val) => setScale(val)}
                        sx={{
                            color: '#00D4FF',
                            '& .MuiSlider-thumb': {
                                width: 22,
                                height: 22,
                                border: '2px solid currentColor',
                                bgcolor: '#00D4FF',
                                boxShadow: '0 0 15px rgba(0, 212, 255, 0.5)'
                            },
                            '& .MuiSlider-rail': { opacity: 0.2 },
                            '& .MuiSlider-track': { border: 'none' }
                        }}
                    />
                    <Button
                        onClick={handleReset}
                        startIcon={<ResetIcon />}
                        sx={{
                            color: '#00D4FF',
                            fontWeight: 700,
                            fontFamily: 'Inter',
                            textTransform: 'none',
                            fontSize: '0.9rem',
                            '&:hover': { bgcolor: 'rgba(0,212,255,0.1)' }
                        }}
                    >
                        Resetar
                    </Button>
                </Stack>
            </DialogContent>

            <DialogActions sx={{ p: { xs: 3, sm: 6 }, pt: 2, justifyContent: 'center', gap: { xs: 1, sm: 3 }, flexDirection: { xs: 'column', sm: 'row' } }}>
                <Button
                    variant="contained"
                    onClick={handleConfirm}
                    fullWidth
                    sx={{
                        bgcolor: '#00D4FF',
                        color: '#000',
                        fontWeight: 900,
                        maxWidth: { xs: '100%', sm: 300 },
                        py: 2,
                        borderRadius: 2,
                        fontFamily: '"Inter", sans-serif',
                        fontSize: '1.1rem',
                        letterSpacing: 1,
                        boxShadow: '0 4px 15px rgba(0, 212, 255, 0.4)',
                        '&:hover': { bgcolor: '#00b4d8' }
                    }}
                >
                    SALVAR
                </Button>
                <Button
                    variant="outlined"
                    onClick={onClose}
                    fullWidth
                    sx={{
                        color: '#fff',
                        borderColor: '#00D4FF',
                        maxWidth: { xs: '100%', sm: 300 },
                        py: 2,
                        borderRadius: 2,
                        fontWeight: 900,
                        fontFamily: '"Inter", sans-serif',
                        fontSize: '1.1rem',
                        letterSpacing: 1,
                        borderWidth: '2px',
                        '&:hover': {
                            borderWidth: '2px',
                            bgcolor: 'rgba(0, 212, 255, 0.05)',
                            borderColor: '#00D4FF'
                        }
                    }}
                >
                    TENTAR NOVAMENTE
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default FaceCropper;
