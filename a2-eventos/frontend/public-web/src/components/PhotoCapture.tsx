'use client';

import React, { useState, useRef, useCallback } from 'react';
import Image from 'next/image';
import Webcam from 'react-webcam';
import { Camera, RefreshCw, Trash2, CheckCircle, AlertCircle, Upload } from 'lucide-react';
import { FaceValidator } from '../utils/FaceValidator';

interface PhotoCaptureProps {
    onPhotoCaptured: (base64: string | null) => void;
    initialPhoto?: string | null;
}

export default function PhotoCapture({ onPhotoCaptured, initialPhoto = null }: PhotoCaptureProps) {
    const webcamRef = useRef<Webcam>(null);
    const [imgSrc, setImgSrc] = useState<string | null>(initialPhoto);
    const [isCameraOpen, setIsCameraOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const videoConstraints = {
        width: 480,
        height: 640,
        facingMode: "user"
    };

    const capture = useCallback(async () => {
        if (webcamRef.current) {
            const imageSrc = webcamRef.current.getScreenshot();
            if (imageSrc) {
                setLoading(true);
                const validation = await FaceValidator.validate(imageSrc);

                if (validation.isValid && validation.croppedBase64) {
                    setImgSrc(validation.croppedBase64);
                    setIsCameraOpen(false);
                    setError(null);
                    onPhotoCaptured(validation.croppedBase64);
                } else {
                    setError(validation.errors[0] || "Rosto não reconhecido");
                }
                setLoading(false);
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
                const validation = await FaceValidator.validate(base64);
                if (validation.isValid && validation.croppedBase64) {
                    setImgSrc(validation.croppedBase64);
                    setError(null);
                    onPhotoCaptured(validation.croppedBase64);
                } else {
                    setError(validation.errors[0] || "Rosto não reconhecido");
                }
                setLoading(false);
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
                <div className="flex flex-col items-center">
                    <div className="relative inline-block">
                        <Image
                            src={imgSrc}
                            alt="Preview"
                            width={192}
                            height={256}
                            className="w-48 h-64 rounded-xl object-cover border-4 border-emerald-500 shadow-xl"
                            unoptimized
                        />
                        <button
                            type="button"
                            onClick={clearPhoto}
                            className="absolute -top-3 -right-3 p-2 bg-red-600 text-white rounded-full hover:bg-red-700 shadow-lg transition-transform hover:scale-110 z-10"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                    <div className="mt-4 flex items-center gap-2 text-emerald-500 font-bold bg-emerald-500/10 px-4 py-2 rounded-full">
                        <CheckCircle className="w-5 h-5" />
                        <span>FOTO VALIDADA PELA IA</span>
                    </div>
                </div>
            ) : (
                <div className="w-full max-w-sm mx-auto h-[480px] bg-slate-900 rounded-2xl border-2 border-dashed border-slate-700 flex flex-col items-center justify-center overflow-hidden relative shadow-inner">
                    {isCameraOpen ? (
                        <>
                            <Webcam
                                audio={false}
                                ref={webcamRef}
                                screenshotFormat="image/jpeg"
                                videoConstraints={videoConstraints}
                                mirrored={true}
                                className="w-full h-full object-cover scale-105"
                            />
                            {/* Overlay Silhouette for Face Guide */}
                            <div className="absolute inset-0 z-10 pointer-events-none flex flex-col items-center justify-center">
                                <div className="w-56 h-72 rounded-[100%] border-2 border-cyan-400/70 shadow-[0_0_0_9999px_rgba(15,23,42,0.85)] relative flex items-center justify-center">
                                    <div className="absolute opacity-50 px-2 py-1 text-[10px] uppercase font-bold tracking-widest text-cyan-400 bg-slate-900/80 rounded top-2">Enquadre o Rosto</div>
                                </div>
                            </div>

                            <div className="absolute bottom-6 flex gap-3 z-20">
                                <button
                                    type="button"
                                    onClick={capture}
                                    disabled={loading}
                                    className="px-6 py-3 bg-cyan-600 text-white rounded-xl font-bold flex items-center gap-2 hover:bg-cyan-500 hover:scale-105 transition-all shadow-lg shadow-cyan-600/30 disabled:opacity-70 disabled:scale-100"
                                >
                                    {loading ? (
                                        <><RefreshCw className="w-5 h-5 animate-spin" /> ANALISANDO...</>
                                    ) : (
                                        <><Camera className="w-5 h-5" /> CAPTURAR</>
                                    )}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setIsCameraOpen(false)}
                                    disabled={loading}
                                    className="px-4 py-3 bg-slate-800 text-slate-300 rounded-xl font-bold flex items-center hover:bg-slate-700 transition"
                                >
                                    <Trash2 className="w-5 h-5" />
                                </button>
                            </div>
                        </>
                    ) : (
                        <div className="flex flex-col items-center gap-4 p-4 text-center">
                            <Camera className="w-12 h-12 text-gray-400" />
                            <div>
                                <p className="text-sm font-bold text-gray-600">Captura Facial Obrigatória</p>
                                <p className="text-xs text-gray-400">Posicione-se em local iluminado</p>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => setIsCameraOpen(true)}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-blue-700"
                                >
                                    <Camera className="w-4 h-4" />
                                    ABRIR CÂMERA
                                </button>
                                <label className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-bold flex items-center gap-2 hover:bg-purple-700 cursor-pointer">
                                    <Upload className="w-4 h-4" />
                                    UPLOAD
                                    <input type="file" className="hidden" accept="image/*" onChange={handleFileUpload} />
                                </label>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {error && (
                <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm flex items-center gap-2 border border-red-100">
                    <AlertCircle className="w-4 h-4" />
                    {error}
                </div>
            )}
        </div>
    );
}
