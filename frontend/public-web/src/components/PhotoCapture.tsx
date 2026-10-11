'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import Image from 'next/image';
import Webcam from 'react-webcam';
import { Camera, RefreshCw, Trash2, CheckCircle, AlertCircle, Upload, ShieldCheck, Sparkles } from 'lucide-react';
import { FaceValidator } from '../utils/FaceValidator';

interface PhotoCaptureProps {
    onPhotoCaptured: (base64: string | null, source?: 'camera' | 'upload') => void;
    initialPhoto?: string | null;
}

export default function PhotoCapture({ onPhotoCaptured, initialPhoto = null }: PhotoCaptureProps) {
    const webcamRef = useRef<Webcam>(null);
    const [imgSrc, setImgSrc] = useState<string | null>(initialPhoto);
    const [isCameraOpen, setIsCameraOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [faceDetected, setFaceDetected] = useState(false);
    const [guidance, setGuidance] = useState("Aguardando câmera...");

    const videoConstraints = {
        width: 640,
        height: 480,
        facingMode: "user"
    };

    // Sync imgSrc with prop when it changes (e.g. if cleared by parent)
    useEffect(() => {
        setImgSrc(initialPhoto);
    }, [initialPhoto]);

    // Real-time detection loop
    useEffect(() => {
        let animationFrame: number;
        let isActive = true;

        const detectLoop = async () => {
            if (!isActive) return;

            try {
                if (isCameraOpen && webcamRef.current?.video) {
                    const video = webcamRef.current.video;
                    if (video.readyState === 4) {
                        const detection = await FaceValidator.detect(video);
                        if (isActive) {
                            if (detection) {
                                setFaceDetected(true);
                                setGuidance("Rosto detectado! Mantenha a posição.");
                                setError(null);
                            } else {
                                setFaceDetected(false);
                                setGuidance("Posicione seu rosto dentro do quadro.");
                            }
                        }
                    }
                }
            } catch (err) {
                console.error("Erro na detecção em tempo real:", err);
            }
            
            if (isActive && isCameraOpen) {
                animationFrame = requestAnimationFrame(detectLoop);
            }
        };

        if (isCameraOpen) {
            detectLoop();
        }

        return () => {
            isActive = false;
            if (animationFrame) cancelAnimationFrame(animationFrame);
        };
    }, [isCameraOpen]);

    const capture = useCallback(async () => {
        if (webcamRef.current) {
            const imageSrc = webcamRef.current.getScreenshot();
            if (imageSrc) {
                setLoading(true);
                try {
                    const validation = await FaceValidator.validate(imageSrc);

                    if (validation.isValid && validation.croppedBase64) {
                        setImgSrc(validation.croppedBase64);
                        setIsCameraOpen(false);
                        setError(null);
                        onPhotoCaptured(validation.croppedBase64, 'camera');
                    } else {
                        setError(validation.errors[0] || "Rosto não reconhecido");
                    }
                } catch (err) {
                    setError("Erro ao processar a biometria facial.");
                } finally {
                    setLoading(false);
                }
            }
        }
    }, [webcamRef, onPhotoCaptured]);

    const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = async () => {
                const base64 = reader.result as string;
                setLoading(true);
                try {
                    const validation = await FaceValidator.validate(base64);
                    if (validation.isValid && validation.croppedBase64) {
                        setImgSrc(validation.croppedBase64);
                        setError(null);
                        onPhotoCaptured(validation.croppedBase64, 'upload');
                    } else {
                        setError(validation.errors[0] || "Rosto não reconhecido");
                    }
                } catch (err) {
                    setError("Erro ao processar o arquivo enviado.");
                } finally {
                    setLoading(false);
                }
            };
            reader.readAsDataURL(file);
        }
    };

    const clearPhoto = () => {
        setImgSrc(null);
        setError(null);
        onPhotoCaptured(null);
    };

    return (
        <div className="w-full space-y-4">
            {imgSrc ? (
                <div className="flex flex-col items-center animate-in fade-in zoom-in duration-500">
                    <div className="relative group">
                        <div className="absolute -inset-1 bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-2xl blur opacity-30 group-hover:opacity-100 transition duration-1000 group-hover:duration-200"></div>
                        <div className="relative flex flex-col items-center">
                            <Image
                                src={imgSrc}
                                alt="Preview"
                                width={240}
                                height={320}
                                className="w-60 h-80 rounded-2xl object-cover border-4 border-emerald-500/50 shadow-2xl"
                                unoptimized
                            />
                            <button
                                type="button"
                                onClick={clearPhoto}
                                className="absolute -top-3 -right-3 p-3 bg-red-600 text-white rounded-full hover:bg-red-500 shadow-lg transition-all hover:scale-110 z-20 backdrop-blur-md"
                            >
                                <Trash2 className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                    <div className="mt-6 flex flex-col items-center gap-2">
                        <div className="flex items-center gap-2 text-emerald-400 font-bold bg-emerald-500/10 px-6 py-3 rounded-2xl border border-emerald-500/20 backdrop-blur-sm">
                            <ShieldCheck className="w-6 h-6" />
                            <span className="tracking-wider uppercase text-sm">Validado</span>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="w-full max-w-lg mx-auto aspect-[3/4] sm:h-[500px] bg-slate-950 rounded-[2rem] border border-slate-800/50 flex flex-col items-center justify-center overflow-hidden relative shadow-2xl">
                    
                    {isCameraOpen ? (
                        <>
                            <Webcam
                                audio={false}
                                ref={webcamRef}
                                screenshotFormat="image/jpeg"
                                videoConstraints={videoConstraints}
                                mirrored={true}
                                className="w-full h-full object-cover"
                            />

                            {/* Cyber Scanner Overlay */}
                            <div className="absolute inset-0 z-10 pointer-events-none overflow-hidden">
                                {/* Face Silhouette Guide */}
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <div className={`w-[240px] h-[320px] xs:w-64 xs:h-80 rounded-[100%] border-2 ${faceDetected ? 'border-emerald-400' : 'border-cyan-400/50'} relative flex items-center justify-center transition-colors duration-500`}>
                                        <div className={`absolute inset-0 rounded-[100%] border-4 border-white/10 ${faceDetected ? 'animate-pulse' : ''}`}></div>
                                        
                                        {/* Corner Markers */}
                                        <div className="absolute top-10 left-0 w-8 h-8 border-t-2 border-l-2 border-cyan-400/30 rounded-tl-2xl"></div>
                                        <div className="absolute top-10 right-0 w-8 h-8 border-t-2 border-r-2 border-cyan-400/30 rounded-tr-2xl"></div>
                                        <div className="absolute bottom-10 left-0 w-8 h-8 border-b-2 border-l-2 border-cyan-400/30 rounded-bl-2xl"></div>
                                        <div className="absolute bottom-10 right-0 w-8 h-8 border-b-2 border-r-2 border-cyan-400/30 rounded-br-2xl"></div>
                                    </div>
                                </div>

                                {/* Status and Guidance */}
                                <div className="absolute top-6 left-1/2 -translate-x-1/2 z-20 w-[80%]">
                                    <div className={`glass-panel px-4 py-2 rounded-full border text-center transition-all duration-500 ${faceDetected ? 'border-emerald-500/50 bg-emerald-500/20' : 'border-cyan-500/30'}`}>
                                        <span className="text-[10px] uppercase font-bold tracking-[0.2em] text-white">{guidance}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Control Bar */}
                            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-4 bg-slate-900/80 backdrop-blur-xl p-3 rounded-3xl border border-white/10 shadow-2xl">
                                <button
                                    type="button"
                                    onClick={() => setIsCameraOpen(false)}
                                    className="p-3 bg-white/5 text-slate-400 rounded-2xl hover:bg-white/10"
                                >
                                    <Trash2 className="w-6 h-6" />
                                </button>
                                
                                <button
                                    type="button"
                                    onClick={capture}
                                    disabled={loading}
                                    className={`px-8 py-3 rounded-2xl font-black tracking-widest text-xs flex items-center gap-3 transition-all
                                        ${faceDetected 
                                            ? 'bg-cyan-600 text-white hover:bg-cyan-500' 
                                            : 'bg-slate-800 text-slate-500 cursor-not-allowed opacity-50'}`}
                                >
                                    {loading ? (
                                        <><RefreshCw className="w-4 h-4 animate-spin" /> PROCESSANDO</>
                                    ) : (
                                        <><Camera className="w-5 h-5" /> CAPTURAR</>
                                    )}
                                </button>
                            </div>
                        </>
                    ) : (
                        <div className="flex flex-col items-center gap-6 p-10 text-center relative z-10">
                            <div className="w-20 h-20 bg-cyan-600 rounded-2xl flex items-center justify-center shadow-xl">
                                <Camera className="w-10 h-10 text-white" />
                            </div>

                            <div className="space-y-2">
                                <h3 className="text-xl font-bold text-white uppercase tracking-tight">Biometria Facial</h3>
                                <p className="text-slate-400 text-sm leading-relaxed">Capture uma foto para sua credencial.</p>
                            </div>

                            <div className="flex flex-col w-full gap-3">
                                <button
                                    type="button"
                                    onClick={() => setIsCameraOpen(true)}
                                    className="w-full bg-white text-slate-950 font-bold py-3.5 rounded-xl text-sm"
                                >
                                    ATIVAR CÂMERA
                                </button>
                                <label className="w-full bg-slate-900 text-white font-bold py-3.5 rounded-xl text-sm border border-slate-800 cursor-pointer">
                                    UPLOAD DE FOTO
                                    <input type="file" className="hidden" accept="image/*" onChange={handleFileUpload} />
                                </label>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {error && (
                <div className="p-4 bg-red-950/20 border border-red-500/30 text-red-400 rounded-xl text-xs flex items-center gap-3">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{error}</span>
                </div>
            )}
        </div>
    );
}

