'use client';

import React, { useState, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import type { Area } from 'react-easy-crop';
import { getCroppedImg } from '../utils/cropImage';
import { X, Check, RotateCw, ZoomIn, ZoomOut } from 'lucide-react';

interface PhotoEditorProps {
    image: string;
    onSave: (croppedImage: string) => void;
    onCancel: () => void;
}

export default function PhotoEditor({ image, onSave, onCancel }: PhotoEditorProps) {
    const [crop, setCrop] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [rotation, setRotation] = useState(0);
    const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
    const [loading, setLoading] = useState(false);

    const onCropComplete = useCallback((_croppedArea: Area, nextCroppedAreaPixels: Area) => {
        setCroppedAreaPixels(nextCroppedAreaPixels);
    }, []);

    const handleSave = async () => {
        if (!croppedAreaPixels) return;
        try {
            setLoading(true);
            const croppedImage = await getCroppedImg(image, croppedAreaPixels, rotation);
            if (croppedImage) {
                onSave(croppedImage);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] bg-black bg-opacity-90 flex flex-col">
            <div className="p-4 flex justify-between items-center bg-gray-900 border-b border-gray-800">
                <h2 className="text-white font-bold uppercase tracking-wider text-sm flex items-center gap-2">
                    <RotateCw className="w-4 h-4 text-blue-400" />
                    Ajustar Foto Biométrica
                </h2>
                <button
                    onClick={onCancel}
                    className="p-2 text-gray-400 hover:text-white transition"
                >
                    <X className="w-6 h-6" />
                </button>
            </div>

            <div className="flex-1 relative bg-black">
                <Cropper
                    image={image}
                    crop={crop}
                    zoom={zoom}
                    rotation={rotation}
                    aspect={1}
                    onCropChange={setCrop}
                    onZoomChange={setZoom}
                    onRotationChange={setRotation}
                    onCropComplete={onCropComplete}
                    cropShape="round"
                    showGrid={false}
                />
            </div>

            <div className="p-6 bg-gray-900 space-y-6">
                <div className="flex items-center gap-4">
                    <ZoomOut className="w-5 h-5 text-gray-500" />
                    <input
                        type="range"
                        value={zoom}
                        min={1}
                        max={3}
                        step={0.1}
                        aria-labelledby="Zoom"
                        onChange={(e) => setZoom(Number(e.target.value))}
                        className="flex-1 accent-blue-500"
                    />
                    <ZoomIn className="w-5 h-5 text-gray-500" />
                </div>

                <div className="flex items-center gap-4">
                    <RotateCw className="w-5 h-5 text-gray-500" />
                    <input
                        type="range"
                        value={rotation}
                        min={0}
                        max={360}
                        step={1}
                        aria-labelledby="Rotation"
                        onChange={(e) => setRotation(Number(e.target.value))}
                        className="flex-1 accent-blue-500"
                    />
                </div>

                <div className="flex gap-4">
                    <button
                        onClick={onCancel}
                        className="flex-1 py-3 bg-gray-800 text-white rounded-xl font-bold hover:bg-gray-700 transition"
                    >
                        CANCELAR
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={loading}
                        className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition flex items-center justify-center gap-2"
                    >
                        {loading ? (
                            <RotateCw className="w-5 h-5 animate-spin" />
                        ) : (
                            <>
                                <Check className="w-5 h-5" />
                                CONFIRMAR RECORTE
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
