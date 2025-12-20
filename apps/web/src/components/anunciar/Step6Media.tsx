"use client";

import React, { useRef } from "react";
import { useAnunciar } from "./AnunciarContext";
import { StepLayout } from "./StepLayout";
import { Button } from "@kitnets/ui";
import { ImagePlus, X, FileText, Video } from "lucide-react";

export function Step6Media() {
    const { state, updateData, nextStep } = useAnunciar();
    const { photos } = state.data.media;
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const newFiles = Array.from(e.target.files);
            updateData({ media: { ...state.data.media, photos: [...photos, ...newFiles] } });
        }
    };

    const removePhoto = (index: number) => {
        const newPhotos = [...photos];
        newPhotos.splice(index, 1);
        updateData({ media: { ...state.data.media, photos: newPhotos } });
    };

    return (
        <StepLayout title="Fotos e Vídeos" subtitle="Imóveis com boas fotos recebem 5x mais visitas.">
            <div className="space-y-6">

                {/* Dropzone / Upload Area */}
                <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-border rounded-xl p-8 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-accent/50 transition-colors"
                >
                    <input
                        type="file"
                        multiple
                        accept="image/*"
                        className="hidden"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                    />
                    <div className="w-16 h-16 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-4">
                        <ImagePlus className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-semibold text-foreground">Clique ou arraste fotos aqui</h3>
                    <p className="text-sm text-muted-foreground mt-2">Formatos: JPG, PNG</p>
                </div>

                {/* Photo List */}
                {photos.length > 0 && (
                    <div className="grid grid-cols-3 gap-4">
                        {photos.map((file, index) => (
                            <div key={index} className="relative aspect-square rounded-lg overflow-hidden bg-muted border">
                                <img src={URL.createObjectURL(file)} alt="preview" className="w-full h-full object-cover" />
                                <button
                                    onClick={(e) => { e.stopPropagation(); removePhoto(index); }}
                                    className="absolute top-1 right-1 bg-black/50 hover:bg-destructive text-white rounded-full p-1 transition-colors"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                {/* Other Media Options */}
                <div className="flex gap-4">
                    <Button variant="outline" className="flex-1 gap-2 h-12">
                        <Video className="w-4 h-4" />
                        Adicionar Vídeo
                    </Button>
                    <Button variant="outline" className="flex-1 gap-2 h-12">
                        <FileText className="w-4 h-4" />
                        Planta / PDF
                    </Button>
                </div>

            </div>

            <div className="pt-6">
                <Button
                    className="w-full h-12 text-lg bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-lg shadow-emerald-900/20"
                    disabled={photos.length === 0}
                    onClick={nextStep}
                >
                    Continuar
                </Button>
                <p className="text-center text-xs text-gray-500 mt-3">Mínimo de 1 foto para continuar</p>
            </div>
        </StepLayout>
    );
}
