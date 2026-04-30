'use client';

import React, { useState, useRef, useCallback } from 'react';
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
        width: 1280,
        height: 720,
        facingMode: "user"
    };

    const capture = useCallback(async () => {
        if (webcamRef.current) {
            const imageSrc = webcamRef.current.getScreenshot();
            if (imageSrc) {
                setLoading(true);
                const validation = await FaceValidator.validate(imageSrc);

                if (validation.isValid) {
                    setImgSrc(imageSrc);
                    setIsCameraOpen(false);
                    setError(null);
                    onPhotoCaptured(imageSrc);
                } else {
                    setError(validation.errors[0]);
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
                if (validation.isValid) {
                    setImgSrc(base64);
                    setError(null);
                    onPhotoCaptured(base64);
                } else {
                    setError(validation.errors[0]);
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
                        <img
                            src={imgSrc}
                            alt="Preview"
                            className="w-48 h-48 rounded-full object-cover border-4 border-blue-500 shadow-xl"
                        />
                        <button
                            type="button"
                            onClick={clearPhoto}
                            className="absolute top-0 right-0 p-1.5 bg-red-600 text-white rounded-full hover:bg-red-700 shadow-lg"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                    <div className="mt-2 flex items-center gap-1.5 text-green-600 font-bold text-sm">
                        <CheckCircle className="w-4 h-4" />
                        <span>FOTO VALIDADA</span>
                    </div>
                </div>
            ) : (
                <div className="w-full h-64 bg-gray-100 rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center overflow-hidden relative">
                    {isCameraOpen ? (
                        <>
                            <Webcam
                                audio={false}
                                ref={webcamRef}
                                screenshotFormat="image/jpeg"
                                videoConstraints={videoConstraints}
                                className="w-full h-full object-cover"
                            />
                            <div className="absolute bottom-4 flex gap-2">
                                <button
                                    type="button"
                                    onClick={capture}
                                    disabled={loading}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg font-bold flex items-center gap-2 hover:bg-blue-700"
                                >
                                    {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Camera className="w-5 h-5" />}
                                    CAPTURAR
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setIsCameraOpen(false)}
                                    className="px-4 py-2 bg-white text-gray-700 rounded-lg font-bold border hover:bg-gray-50"
                                >
                                    CANCELAR
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
