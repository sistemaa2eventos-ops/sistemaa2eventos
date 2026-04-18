'use client';

import React, { useState, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import type { Area } from 'react-easy-crop';
import { getCroppedImg } from '../utils/cropImage';
import { X, Check, RotateCw, ZoomIn, ZoomOut, Maximize2, Move } from 'lucide-react';

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
        <div className="fixed inset-0 z-[100] bg-slate-950/95 backdrop-blur-2xl flex flex-col animate-in fade-in duration-300">
            
            {/* Header */}
            <div className="p-6 flex justify-between items-center bg-slate-900/50 border-b border-white/5 backdrop-blur-md">
                <div className="flex items-center gap-4">
                    <div className="p-2 bg-cyan-500/10 rounded-xl">
                        <Maximize2 className="w-5 h-5 text-cyan-400" />
                    </div>
                    <div>
                        <h2 className="text-white font-black uppercase tracking-widest text-sm">Refinamento Facial</h2>
                        <p className="text-slate-500 text-[10px] font-bold uppercase tracking-tight">Padrão biométrico 3:4</p>
                    </div>
                </div>
                <button
                    onClick={onCancel}
                    className="p-3 text-slate-400 hover:text-white hover:bg-white/5 rounded-2xl transition-all"
                >
                    <X className="w-6 h-6" />
                </button>
            </div>

            {/* Editor Console */}
            <div className="flex-1 relative bg-black overflow-hidden flex items-center justify-center">
                <div className="w-full h-full max-w-4xl max-h-[60vh] sm:max-h-[70vh] relative shadow-[0_0_100px_rgba(0,0,0,0.8)]">
                    <Cropper
                        image={image}
                        crop={crop}
                        zoom={zoom}
                        rotation={rotation}
                        aspect={3/4}
                        onCropChange={setCrop}
                        onZoomChange={setZoom}
                        onRotationChange={setRotation}
                        onCropComplete={onCropComplete}
                        cropShape="rect"
                        showGrid={true}
                        classes={{
                            containerClassName: "bg-slate-950",
                            cropAreaClassName: "border-2 border-cyan-400/50 shadow-[0_0_0_9999px_rgba(2,6,23,0.85)]",
                        }}
                    />

                    {/* Interaction Guide Overlay */}
                    <div className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center">
                        <div className="w-3/4 h-3/4 border border-dashed border-white/10 opacity-30"></div>
                        <div className="absolute bottom-4 sm:bottom-6 flex items-center gap-2 px-4 py-2 bg-black/60 backdrop-blur-md rounded-full text-white/50 text-[9px] sm:text-[10px] font-bold tracking-widest uppercase">
                            <Move className="w-3 h-3" /> Arraste para ajustar
                        </div>
                    </div>
                </div>
            </div>

            {/* Control Dashboard */}
            <div className="p-4 sm:p-8 pb-4 sm:pb-10 bg-slate-900/80 border-t border-white/5 space-y-4 sm:space-y-8 animate-in slide-in-from-bottom-6 duration-500">
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-8 max-w-4xl mx-auto">
                    {/* Zoom Control */}
                    <div className="space-y-2 sm:space-y-4">
                        <div className="flex justify-between items-center text-[9px] sm:text-xs font-bold tracking-widest text-slate-400 uppercase">
                            <div className="flex items-center gap-2">
                                <ZoomIn className="w-3.5 h-3.5 text-cyan-400" />
                                <span>Zoom</span>
                            </div>
                            <span className="text-white">{zoom.toFixed(1)}x</span>
                        </div>
                        <div className="flex items-center gap-2 sm:gap-4">
                            <ZoomOut className="w-4 h-4 text-slate-600" />
                            <input
                                type="range"
                                value={zoom}
                                min={1}
                                max={3}
                                step={0.1}
                                onChange={(e) => setZoom(Number(e.target.value))}
                                className="flex-1 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                            />
                            <ZoomIn className="w-4 h-4 text-slate-600" />
                        </div>
                    </div>

                    {/* Rotation Control */}
                    <div className="space-y-2 sm:space-y-4">
                        <div className="flex justify-between items-center text-[9px] sm:text-xs font-bold tracking-widest text-slate-400 uppercase">
                            <div className="flex items-center gap-2">
                                <RotateCw className="w-3.5 h-3.5 text-blue-400" />
                                <span>Rotação</span>
                            </div>
                            <span className="text-white">{rotation}°</span>
                        </div>
                        <div className="flex items-center gap-2 sm:gap-4">
                            <RotateCw className="w-4 h-4 text-slate-600 -scale-x-100" />
                            <input
                                type="range"
                                value={rotation}
                                min={-180}
                                max={180}
                                step={1}
                                onChange={(e) => setRotation(Number(e.target.value))}
                                className="flex-1 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                            />
                            <RotateCw className="w-4 h-4 text-slate-600" />
                        </div>
                    </div>
                </div>

                <div className="flex gap-2 sm:gap-4 max-w-md mx-auto">
                    <button
                        onClick={onCancel}
                        className="flex-1 py-3 sm:py-4 bg-slate-800/50 text-slate-300 rounded-xl sm:rounded-2xl font-black text-[10px] sm:text-xs tracking-[0.15em] sm:tracking-[0.2em] border border-white/5 hover:bg-slate-800 transition-all active:scale-95"
                    >
                        DESCARTAR
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={loading}
                        className="flex-[2] py-3 sm:py-4 bg-gradient-to-r from-emerald-500 to-cyan-600 text-white rounded-xl sm:rounded-2xl font-black text-[10px] sm:text-xs tracking-[0.15em] sm:tracking-[0.2em] shadow-xl shadow-emerald-600/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2 sm:gap-3"
                    >
                        {loading ? (
                            <RotateCw className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
                        ) : (
                            <>
                                <Check className="w-4 h-4 sm:w-5 sm:h-5" />
                                FINALIZAR AJUSTE
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
