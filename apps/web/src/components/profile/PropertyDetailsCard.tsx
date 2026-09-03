"use client";

import React, { useState, useMemo, useEffect } from "react";
import Image from "next/image";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    ChevronDown, ChevronUp, Settings2, Sun, Droplets, Zap, Flame,
    Landmark, Wifi, Plus, Trash2, Home, BedDouble, Car, Shirt, Wind, CookingPot,
    DoorOpen, Building2, Camera, Video, Bath, FileText, Wand2, Loader2, UploadCloud, ArrowRight, Copy
} from "lucide-react";
import { Button } from "@kitnets/ui";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────
export interface PropertyDetails {
    propertyName: string;
    cadastroImobiliario: string;
    inscricaoImobiliaria: string;
    matricula: string;
    areaLote: string;
    areaEdificada: string;
    numberOfUnits: number;
    totalSqMeters: string;
    solarEnergy: boolean;
    solarKwp: string;
    mainMeters: {
        water: boolean;
        energy: boolean;
        gas: boolean;
    };
    internetBill: boolean;
}

export type UnitType = 'kitnet' | 'studio' | 'apartment' | 'house' | 'bedroom' | 'commercial_room' | 'garage' | 'other' | '';

export interface SubUnit {
    name: string;
    unitType: UnitType;
    sqMeters: string;
    rooms: string;
    bedrooms: string;
    bathrooms: string;
    description: string;
    garage: boolean;
    laundry: "none" | "individual" | "shared";
    ac: "none" | "cold" | "cold_hot";
    cooktop: "none" | "gas" | "electric" | "induction";
    kitchenCabinets: boolean;
    condominium: boolean;
    condominiumValue: string;
    condominiumIncludes: {
        energy: boolean;
        water: boolean;
        internet: boolean;
        iptu: boolean;
        gas: boolean;
    };
    photos: string[];      // URLs of saved photos (max 10)
    videos: string[];      // URLs of saved videos (max 2)
    newPhotos: File[];     // New photos pending upload
    newVideos: File[];     // New videos pending upload
}

export const defaultSubUnit = (index: number): SubUnit => ({
    name: `Unidade ${index + 1}`,
    unitType: '',
    sqMeters: "",
    rooms: "",
    bedrooms: "",
    bathrooms: "",
    description: "",
    garage: false,
    laundry: "none",
    ac: "none",
    cooktop: "none",
    kitchenCabinets: false,
    condominium: false,
    condominiumValue: "",
    condominiumIncludes: {
        energy: false,
        water: false,
        internet: false,
        iptu: false,
        gas: false,
    },
    photos: [],
    videos: [],
    newPhotos: [],
    newVideos: [],
});

// ── Checkbox Component ─────────────────────────────────────────────
export function Checkbox({
    checked,
    onChange,
    label,
    icon,
}: {
    checked: boolean;
    onChange: (val: boolean) => void;
    label: string;
    icon?: React.ReactNode;
}) {
    return (
        <label className="flex items-center gap-2.5 cursor-pointer group select-none">
            <div
                className={cn(
                    "w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all duration-200",
                    checked
                        ? "bg-emerald-500 border-emerald-500 text-white"
                        : "border-border bg-background group-hover:border-muted-foreground/50"
                )}
                onClick={() => onChange(!checked)}
            >
                {checked && (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M2.5 6L5 8.5L9.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                )}
            </div>
            {icon && <span className="text-muted-foreground">{icon}</span>}
            <span className="text-sm font-medium text-foreground">{label}</span>
        </label>
    );
}

// ── Select Component ───────────────────────────────────────────────
function SelectField({
    label,
    value,
    onChange,
    options,
    icon,
}: {
    label: string;
    value: string;
    onChange: (val: string) => void;
    options: { value: string; label: string }[];
    icon?: React.ReactNode;
}) {
    return (
        <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
                {icon}
                {label}
            </Label>
            <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
                {options.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                        {opt.label}
                    </option>
                ))}
            </select>
        </div>
    );
}

// ── File Preview Component ─────────────────────────────────────────
function FilePreview({ file, onRemove, isVideo }: { file: File; onRemove: () => void; isVideo?: boolean }) {
    const preview = useMemo(() => URL.createObjectURL(file), [file]);

    useEffect(() => {
        return () => URL.revokeObjectURL(preview);
    }, [preview]);

    return (
        <div className="aspect-square rounded-lg border border-border relative group overflow-hidden bg-muted">
            {isVideo ? (
                <video src={preview} className="w-full h-full object-cover" muted />
            ) : (
                <Image src={preview} alt="Preview" width={200} height={200} className="w-full h-full object-cover" />
            )}
            <div className="absolute top-1 right-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button size="icon" variant="destructive" className="h-6 w-6" onClick={onRemove}>
                    <Trash2 className="w-3 h-3" />
                </Button>
            </div>
            <div className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-[10px] p-1 truncate text-center">
                {isVideo && <Video className="w-3 h-3 inline mr-1" />}
                {file.name}
            </div>
        </div>
    );
}


// ══════════════════════════════════════════════════════════════════
//  PropertyDetailsCard — Only the "Detalhes" section
// ══════════════════════════════════════════════════════════════════
interface DetailsProps {
    details: PropertyDetails;
    units: SubUnit[];
    onDetailsChange: (details: PropertyDetails) => void;
    onUnitsChange: (units: SubUnit[]) => void;
    propertyType: "single" | "multi";
    initialOpen?: boolean;
    onOpenChange?: (open: boolean) => void;
    onContinue?: () => void;
}

export default function PropertyDetailsCard({
    details,
    units,
    onDetailsChange,
    onUnitsChange,
    propertyType,
    initialOpen = true,
    onOpenChange,
    onContinue,
}: DetailsProps) {
    const [isOpen, setIsOpen] = useState(initialOpen);

    const toggleOpen = () => {
        const next = !isOpen;
        setIsOpen(next);
        onOpenChange?.(next);
    };

    const updateDetail = <K extends keyof PropertyDetails>(key: K, val: PropertyDetails[K]) => {
        const updated = { ...details, [key]: val };

        // When numberOfUnits changes, adjust the units array
        if (key === "numberOfUnits") {
            const count = val as number;
            const currentUnits = [...units];
            if (count > currentUnits.length) {
                for (let i = currentUnits.length; i < count; i++) {
                    currentUnits.push(defaultSubUnit(i));
                }
            } else if (count < currentUnits.length) {
                currentUnits.length = count;
            }
            onUnitsChange(currentUnits);
        }

        onDetailsChange(updated);
    };

    const updateMainMeter = (meter: keyof PropertyDetails["mainMeters"], val: boolean) => {
        onDetailsChange({
            ...details,
            mainMeters: { ...details.mainMeters, [meter]: val },
        });
    };

    return (
        <div className="bg-card border border-border p-6 rounded-xl shadow-sm space-y-4">
            <button
                type="button"
                onClick={toggleOpen}
                className="flex items-center justify-between w-full"
            >
                <div className="flex items-center gap-2">
                    <div className="p-2 bg-violet-100 dark:bg-violet-900/50 rounded-lg text-violet-600">
                        <Settings2 className="w-5 h-5" />
                    </div>
                    <h3 className="text-lg font-semibold text-foreground">Detalhes</h3>
                    {!isOpen && (details.propertyName || details.totalSqMeters) && (
                        <span className="ml-2 text-xs bg-violet-100 dark:bg-violet-900/50 text-violet-700 dark:text-violet-300 px-2 py-0.5 rounded-full">
                            {details.propertyName ? `${details.propertyName} · ` : ''}{details.totalSqMeters ? `${details.totalSqMeters} m²` : ''}{propertyType === 'multi' && details.numberOfUnits > 0 ? ` · ${details.numberOfUnits} unidades` : ''} ✓
                        </span>
                    )}
                </div>
                {isOpen ? (
                    <ChevronUp className="w-5 h-5 text-muted-foreground" />
                ) : (
                    <ChevronDown className="w-5 h-5 text-muted-foreground" />
                )}
            </button>

            {isOpen && (
                <div className="space-y-6 pt-2">
                    {/* Property Name */}
                    <div className="space-y-1.5">
                        <Label className="flex items-center gap-1.5">
                            <Building2 className="w-4 h-4 text-muted-foreground" />
                            Nome da Propriedade <span className="text-red-500">*</span>
                        </Label>
                        <Input
                            value={details.propertyName || ''}
                            onChange={(e) => updateDetail("propertyName", e.target.value)}
                            placeholder="ex: Casa Principal, Edifício Aurora"
                        />
                    </div>

                    {/* IPTU Fields */}
                    <div className="space-y-2">
                        <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                            <Landmark className="w-4 h-4 text-muted-foreground" />
                            Dados do IPTU / Registro
                        </p>
                        <p className="text-xs text-muted-foreground">Estes dados podem ser extraídos automaticamente do IPTU ou digitados manualmente.</p>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="space-y-1.5">
                                <Label>Cadastro Imobiliário</Label>
                                <Input
                                    value={details.cadastroImobiliario || ''}
                                    onChange={(e) => updateDetail("cadastroImobiliario", e.target.value)}
                                    placeholder="Nº do cadastro"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label>Inscrição Imobiliária</Label>
                                <Input
                                    value={details.inscricaoImobiliaria || ''}
                                    onChange={(e) => updateDetail("inscricaoImobiliaria", e.target.value)}
                                    placeholder="Nº da inscrição"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label>Matrícula</Label>
                                <Input
                                    value={details.matricula || ''}
                                    onChange={(e) => updateDetail("matricula", e.target.value)}
                                    placeholder="Nº da matrícula"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label>Área Lote (m²)</Label>
                                <Input
                                    type="number"
                                    min={0}
                                    value={details.areaLote || ''}
                                    onChange={(e) => updateDetail("areaLote", e.target.value)}
                                    placeholder="ex: 500"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label>Área Edif. (m²)</Label>
                                <Input
                                    type="number"
                                    min={0}
                                    value={details.areaEdificada || ''}
                                    onChange={(e) => updateDetail("areaEdificada", e.target.value)}
                                    placeholder="ex: 350"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Number of Units + Total sqm */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {propertyType === "multi" && (
                            <div className="space-y-1.5">
                                <Label className="flex items-center gap-1.5">
                                    <Building2 className="w-4 h-4 text-muted-foreground" />
                                    Número de Unidades <span className="text-red-500">*</span>
                                </Label>
                                <Input
                                    type="number"
                                    min={0}
                                    max={50}
                                    value={details.numberOfUnits || ""}
                                    onChange={(e) => updateDetail("numberOfUnits", Math.max(0, parseInt(e.target.value) || 0))}
                                    placeholder="ex: 5"
                                />
                            </div>
                        )}
                        <div className="space-y-1.5">
                            <Label className="flex items-center gap-1.5">
                                <DoorOpen className="w-4 h-4 text-muted-foreground" />
                                Área Total (m²) <span className="text-red-500">*</span>
                            </Label>
                            <Input
                                type="number"
                                min={0}
                                value={details.totalSqMeters}
                                onChange={(e) => updateDetail("totalSqMeters", e.target.value)}
                                placeholder="ex: 250"
                            />
                        </div>
                    </div>

                    {/* Solar Energy */}
                    <div className="space-y-3">
                        <Checkbox
                            checked={details.solarEnergy}
                            onChange={(val) => updateDetail("solarEnergy", val)}
                            label="Energia Solar"
                            icon={<Sun className="w-4 h-4" />}
                        />
                        {details.solarEnergy && (
                            <div className="ml-9 space-y-1.5 max-w-xs animate-in fade-in slide-in-from-top-1 duration-200">
                                <Label>Capacidade de Geração (kWp)</Label>
                                <Input
                                    type="number"
                                    min={0}
                                    step={0.1}
                                    value={details.solarKwp}
                                    onChange={(e) => updateDetail("solarKwp", e.target.value)}
                                    placeholder="ex: 5.5"
                                />
                            </div>
                        )}
                    </div>

                    {/* Main Meters */}
                    <div className="space-y-2">
                        <p className="text-sm font-semibold text-foreground">Medidores Principais do Imóvel <span className="font-normal text-muted-foreground">(pagos pelo Proprietário)</span></p>
                        <div className="flex flex-wrap gap-4">
                            <Checkbox
                                checked={details.mainMeters.water}
                                onChange={(val) => updateMainMeter("water", val)}
                                label="Água"
                                icon={<Droplets className="w-4 h-4" />}
                            />
                            <Checkbox
                                checked={details.mainMeters.energy}
                                onChange={(val) => updateMainMeter("energy", val)}
                                label="Energia"
                                icon={<Zap className="w-4 h-4" />}
                            />
                            <Checkbox
                                checked={details.mainMeters.gas}
                                onChange={(val) => updateMainMeter("gas", val)}
                                label="Gás"
                                icon={<Flame className="w-4 h-4" />}
                            />
                        </div>
                    </div>

                    {/* Internet Bill */}
                    <Checkbox
                        checked={details.internetBill}
                        onChange={(val) => updateDetail("internetBill", val)}
                        label="Conta de Internet"
                        icon={<Wifi className="w-4 h-4" />}
                    />
                    {onContinue && (
                        <div className="flex justify-end pt-4">
                            <Button
                                variant="outline"
                                size="sm"
                                className="gap-1.5 text-emerald-600 border-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                                onClick={onContinue}
                            >
                                Continuar <ArrowRight className="w-4 h-4" />
                            </Button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}


// ══════════════════════════════════════════════════════════════════
//  SubUnitsSection — Rendered separately in profile page
// ══════════════════════════════════════════════════════════════════
interface SubUnitsSectionProps {
    details: PropertyDetails;
    units: SubUnit[];
    onDetailsChange: (details: PropertyDetails) => void;
    onUnitsChange: (units: SubUnit[]) => void;
    onGenerateDescription?: (unitIndex: number) => void;
    generatingDescriptionIdx?: number | null;
    onImportContract?: (unitIndex: number, file: File) => void;
    importingContractIdx?: number | null;
    initialOpenIdx?: number | null;
    propertyIndex?: number;
}

const UNIT_TYPE_OPTIONS = [
    { value: '', label: 'Selecione o tipo' },
    { value: 'kitnet', label: 'Kitnet' },
    { value: 'studio', label: 'Studio' },
    { value: 'apartment', label: 'Apartamento' },
    { value: 'house', label: 'Casa' },
    { value: 'bedroom', label: 'Quarto' },
    { value: 'commercial_room', label: 'Sala Comercial' },
    { value: 'garage', label: 'Garagem' },
    { value: 'other', label: 'Outro' },
];

export function SubUnitsSection({
    details,
    units,
    onDetailsChange,
    onUnitsChange,
    onGenerateDescription,
    generatingDescriptionIdx,
    onImportContract,
    importingContractIdx,
    initialOpenIdx,
    propertyIndex,
}: SubUnitsSectionProps) {
    // A unit is "complete" when all mandatory fields are filled
    const isUnitComplete = (unit: SubUnit): boolean => {
        const totalPhotos = (unit.photos?.length || 0) + (unit.newPhotos?.length || 0);
        return !!(
            unit.unitType &&
            unit.name?.trim() &&
            unit.sqMeters?.trim() &&
            unit.rooms?.trim() &&
            unit.bedrooms?.trim() &&
            unit.bathrooms?.trim() &&
            unit.description?.trim() &&
            totalPhotos >= 2
        );
    };

    // Compute a stable key representing unit completion states
    const allComplete = useMemo(() =>
        units.length > 0 && units.every(u => isUnitComplete(u)),
        [units]
    );

    // Use initialOpenIdx from parent if provided (number or null = explicit), otherwise auto-pick
    const [openUnitIndex, setOpenUnitIndex] = useState<number | null>(() => {
        if (initialOpenIdx !== undefined) return initialOpenIdx; // null = all collapsed, number = open that one
        // Auto-pick: all collapsed if complete, else first incomplete
        if (allComplete) return null;
        const firstIncomplete = units.findIndex(u => !isUnitComplete(u));
        return firstIncomplete >= 0 ? firstIncomplete : null;
    });

    const updateUnit = (index: number, partial: Partial<SubUnit>) => {
        const updated = [...units];
        updated[index] = { ...updated[index], ...partial };
        onUnitsChange(updated);
    };

    const updateUnitCondo = (index: number, field: keyof SubUnit["condominiumIncludes"], val: boolean) => {
        const updated = [...units];
        updated[index] = {
            ...updated[index],
            condominiumIncludes: { ...updated[index].condominiumIncludes, [field]: val },
        };
        onUnitsChange(updated);
    };

    const removeUnit = (index: number) => {
        const updated = units.filter((_, i) => i !== index);
        onDetailsChange({ ...details, numberOfUnits: updated.length });
        onUnitsChange(updated);
    };

    const duplicateUnit = (index: number) => {
        const source = units[index];
        const cloned: SubUnit = {
            ...source,
            name: `${source.name || `Unidade ${index + 1}`} (cópia)`,
            // Clone amenity/condo objects so they're independent
            condominiumIncludes: { ...source.condominiumIncludes },
            // Clear file-based fields to avoid duplicate references
            photos: [],
            videos: [],
            newPhotos: [],
            newVideos: [],
        };
        const newUnits = [...units];
        newUnits.splice(index + 1, 0, cloned);
        onDetailsChange({ ...details, numberOfUnits: newUnits.length });
        onUnitsChange(newUnits);
        setOpenUnitIndex(index + 1);
    };

    const handleUnitPhotoSelect = (idx: number, e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;
        const unit = units[idx];
        const totalPhotos = (unit.photos?.length || 0) + (unit.newPhotos?.length || 0);
        const remaining = 10 - totalPhotos;
        if (remaining <= 0) { alert("Máximo de 10 fotos por unidade."); return; }
        const newFiles = Array.from(e.target.files).slice(0, remaining);
        updateUnit(idx, { newPhotos: [...(unit.newPhotos || []), ...newFiles] });
        e.target.value = '';
    };

    const handleUnitVideoSelect = (idx: number, e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;
        const unit = units[idx];
        const totalVideos = (unit.videos?.length || 0) + (unit.newVideos?.length || 0);
        const remaining = 2 - totalVideos;
        if (remaining <= 0) { alert("Máximo de 2 vídeos por unidade."); return; }
        const newFiles = Array.from(e.target.files).slice(0, remaining);
        updateUnit(idx, { newVideos: [...(unit.newVideos || []), ...newFiles] });
        e.target.value = '';
    };

    const removeUnitNewPhoto = (unitIdx: number, photoIdx: number) => {
        const unit = units[unitIdx];
        updateUnit(unitIdx, { newPhotos: (unit.newPhotos || []).filter((_, i) => i !== photoIdx) });
    };

    const removeUnitNewVideo = (unitIdx: number, videoIdx: number) => {
        const unit = units[unitIdx];
        updateUnit(unitIdx, { newVideos: (unit.newVideos || []).filter((_, i) => i !== videoIdx) });
    };

    const removeUnitSavedPhoto = (unitIdx: number, url: string) => {
        const unit = units[unitIdx];
        updateUnit(unitIdx, { photos: (unit.photos || []).filter(u => u !== url) });
    };

    const removeUnitSavedVideo = (unitIdx: number, url: string) => {
        const unit = units[unitIdx];
        updateUnit(unitIdx, { videos: (unit.videos || []).filter(u => u !== url) });
    };

    if (details.numberOfUnits <= 0) return null;

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                    <Home className="w-5 h-5 text-primary" />
                    Sub-unidades ({units.length})
                </h3>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                        const newUnits = [...units, defaultSubUnit(units.length)];
                        onUnitsChange(newUnits);
                        onDetailsChange({ ...details, numberOfUnits: newUnits.length });
                        setOpenUnitIndex(newUnits.length - 1);
                    }}
                >
                    <Plus className="w-4 h-4 mr-1" />
                    Adicionar
                </Button>
            </div>

            {units.map((unit, idx) => (
                <div
                    key={idx}
                    id={propertyIndex !== undefined ? `prop-${propertyIndex}-unit-${idx}` : undefined}
                    className="bg-card border border-border rounded-xl shadow-sm overflow-hidden"
                >
                    {/* Unit Header */}
                    <button
                        type="button"
                        onClick={() => setOpenUnitIndex(openUnitIndex === idx ? null : idx)}
                        className="flex items-center justify-between w-full px-5 py-4 hover:bg-muted/30 transition-colors"
                    >
                        <div className="flex items-center gap-3">
                            <div className="p-1.5 bg-primary/10 rounded-lg">
                                <Home className="w-4 h-4 text-primary" />
                            </div>
                            <div className="text-left">
                                <div className="flex items-center gap-2">
                                    <p className="text-sm font-semibold text-foreground">{unit.name || `Unidade ${idx + 1}`}</p>
                                    {openUnitIndex !== idx && isUnitComplete(unit) && (
                                        <span className="text-xs bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-full">
                                            Preenchido ✓
                                        </span>
                                    )}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    {unit.sqMeters ? `${unit.sqMeters} m²` : "Sem dados"}
                                    {unit.bedrooms ? ` · ${unit.bedrooms} quartos` : ""}
                                    {unit.bathrooms ? ` · ${unit.bathrooms} banheiros` : ""}
                                    {(unit.photos?.length || 0) + (unit.newPhotos?.length || 0) > 0 ? ` · ${(unit.photos?.length || 0) + (unit.newPhotos?.length || 0)} fotos` : ""}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="ghost"
                                size="sm"
                                className="text-blue-500 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 h-8 w-8 p-0"
                                title="Duplicar unidade"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    duplicateUnit(idx);
                                }}
                            >
                                <Copy className="w-4 h-4" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive h-8 w-8 p-0"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    removeUnit(idx);
                                }}
                            >
                                <Trash2 className="w-4 h-4" />
                            </Button>
                            {openUnitIndex === idx ? (
                                <ChevronUp className="w-4 h-4 text-muted-foreground" />
                            ) : (
                                <ChevronDown className="w-4 h-4 text-muted-foreground" />
                            )}
                        </div>
                    </button>

                    {/* Unit Content */}
                    {openUnitIndex === idx && (
                        <div className="px-5 pb-5 space-y-5 border-t border-border pt-4 animate-in fade-in slide-in-from-top-1 duration-200">
                            {/* Import Contract Button — at very top */}
                            {onImportContract && (
                                <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                                    <UploadCloud className="w-5 h-5 text-blue-600 flex-shrink-0" />
                                    <div className="flex-1">
                                        <p className="text-sm font-medium text-blue-900 dark:text-blue-100">Importar Contrato de Aluguel</p>
                                        <p className="text-xs text-blue-600 dark:text-blue-400">Envie um PDF ou imagem do contrato — a IA extrairá os dados automaticamente</p>
                                    </div>
                                    <div className="relative">
                                        <input
                                            type="file"
                                            accept="application/pdf,image/jpeg,image/png,image/webp"
                                            onChange={(e) => {
                                                const f = e.target.files?.[0];
                                                if (f) onImportContract(idx, f);
                                                e.target.value = '';
                                            }}
                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                            disabled={importingContractIdx === idx}
                                        />
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="text-blue-600 border-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/30 gap-1"
                                            disabled={importingContractIdx === idx}
                                        >
                                            {importingContractIdx === idx ? (
                                                <><Loader2 className="w-4 h-4 animate-spin" /> Extraindo...</>
                                            ) : (
                                                <><UploadCloud className="w-4 h-4" /> Enviar Contrato</>
                                            )}
                                        </Button>
                                    </div>
                                </div>
                            )}

                            {/* Unit Type Dropdown */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="space-y-1.5">
                                    <Label className="flex items-center gap-1.5">
                                        <Home className="w-4 h-4 text-muted-foreground" />
                                        Tipo da Unidade
                                    </Label>
                                    <select
                                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                        value={unit.unitType || ''}
                                        onChange={(e) => updateUnit(idx, { unitType: e.target.value as SubUnit['unitType'] })}
                                    >
                                        {UNIT_TYPE_OPTIONS.map(opt => (
                                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Unit Name + SqM */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="space-y-1.5">
                                    <Label>Nome da Unidade</Label>
                                    <Input
                                        value={unit.name}
                                        onChange={(e) => updateUnit(idx, { name: e.target.value })}
                                        placeholder="ex: Kitnet 35A"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="flex items-center gap-1.5">
                                        <DoorOpen className="w-4 h-4 text-muted-foreground" />
                                        Área (m²)
                                    </Label>
                                    <Input
                                        type="number"
                                        min={0}
                                        value={unit.sqMeters}
                                        onChange={(e) => updateUnit(idx, { sqMeters: e.target.value })}
                                        placeholder="ex: 30"
                                    />
                                </div>
                            </div>

                            {/* Rooms + Bedrooms + Bathrooms */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="space-y-1.5">
                                    <Label className="flex items-center gap-1.5">
                                        <DoorOpen className="w-4 h-4 text-muted-foreground" />
                                        Cômodos
                                    </Label>
                                    <Input
                                        type="number"
                                        min={0}
                                        value={unit.rooms}
                                        onChange={(e) => updateUnit(idx, { rooms: e.target.value })}
                                        placeholder="ex: 4"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="flex items-center gap-1.5">
                                        <BedDouble className="w-4 h-4 text-muted-foreground" />
                                        Quartos
                                    </Label>
                                    <Input
                                        type="number"
                                        min={0}
                                        value={unit.bedrooms}
                                        onChange={(e) => updateUnit(idx, { bedrooms: e.target.value })}
                                        placeholder="ex: 1"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="flex items-center gap-1.5">
                                        <Bath className="w-4 h-4 text-muted-foreground" />
                                        Banheiros
                                    </Label>
                                    <Input
                                        type="number"
                                        min={0}
                                        value={unit.bathrooms}
                                        onChange={(e) => updateUnit(idx, { bathrooms: e.target.value })}
                                        placeholder="ex: 1"
                                    />
                                </div>
                            </div>

                            {/* Garage + Kitchen Cabinets */}
                            <div className="flex flex-wrap gap-5">
                                <Checkbox
                                    checked={unit.garage}
                                    onChange={(val) => updateUnit(idx, { garage: val })}
                                    label="Garagem"
                                    icon={<Car className="w-4 h-4" />}
                                />
                                <Checkbox
                                    checked={unit.kitchenCabinets}
                                    onChange={(val) => updateUnit(idx, { kitchenCabinets: val })}
                                    label="Armários de Cozinha"
                                    icon={<CookingPot className="w-4 h-4" />}
                                />
                            </div>

                            {/* Selects: Laundry, AC, Cooktop */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <SelectField
                                    label="Lavanderia"
                                    value={unit.laundry}
                                    onChange={(val) => updateUnit(idx, { laundry: val as SubUnit["laundry"] })}
                                    icon={<Shirt className="w-4 h-4 text-muted-foreground" />}
                                    options={[
                                        { value: "none", label: "Não possui" },
                                        { value: "individual", label: "Individual" },
                                        { value: "shared", label: "Compartilhada" },
                                    ]}
                                />
                                <SelectField
                                    label="Ar-Condicionado"
                                    value={unit.ac}
                                    onChange={(val) => updateUnit(idx, { ac: val as SubUnit["ac"] })}
                                    icon={<Wind className="w-4 h-4 text-muted-foreground" />}
                                    options={[
                                        { value: "none", label: "Não possui" },
                                        { value: "cold", label: "Frio" },
                                        { value: "cold_hot", label: "Quente e Frio" },
                                    ]}
                                />
                                <SelectField
                                    label="Cooktop"
                                    value={unit.cooktop}
                                    onChange={(val) => updateUnit(idx, { cooktop: val as SubUnit["cooktop"] })}
                                    icon={<CookingPot className="w-4 h-4 text-muted-foreground" />}
                                    options={[
                                        { value: "none", label: "Não possui" },
                                        { value: "gas", label: "Gás" },
                                        { value: "electric", label: "Elétrico" },
                                        { value: "induction", label: "Indução" },
                                    ]}
                                />
                            </div>

                            {/* Condominium — below Lavanderia/AC/Cooktop */}
                            <div className="space-y-3 pt-2 border-t border-border">
                                <Checkbox
                                    checked={unit.condominium}
                                    onChange={(val) => updateUnit(idx, { condominium: val })}
                                    label="Condomínio"
                                    icon={<Building2 className="w-4 h-4" />}
                                />
                                {unit.condominium && (
                                    <div className="ml-9 space-y-4 animate-in fade-in slide-in-from-top-1 duration-200">
                                        <div className="space-y-1.5 max-w-xs">
                                            <Label>Valor do Condomínio (R$)</Label>
                                            <Input
                                                type="number"
                                                min={0}
                                                step={0.01}
                                                value={unit.condominiumValue}
                                                onChange={(e) => updateUnit(idx, { condominiumValue: e.target.value })}
                                                placeholder="ex: 350.00"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <p className="text-sm font-medium text-foreground">Incluso no condomínio:</p>
                                            <div className="flex flex-wrap gap-4">
                                                <Checkbox
                                                    checked={unit.condominiumIncludes.energy}
                                                    onChange={(val) => updateUnitCondo(idx, "energy", val)}
                                                    label="Energia"
                                                    icon={<Zap className="w-3.5 h-3.5" />}
                                                />
                                                <Checkbox
                                                    checked={unit.condominiumIncludes.water}
                                                    onChange={(val) => updateUnitCondo(idx, "water", val)}
                                                    label="Água"
                                                    icon={<Droplets className="w-3.5 h-3.5" />}
                                                />
                                                <Checkbox
                                                    checked={unit.condominiumIncludes.internet}
                                                    onChange={(val) => updateUnitCondo(idx, "internet", val)}
                                                    label="Internet"
                                                    icon={<Wifi className="w-3.5 h-3.5" />}
                                                />
                                                <Checkbox
                                                    checked={unit.condominiumIncludes.iptu}
                                                    onChange={(val) => updateUnitCondo(idx, "iptu", val)}
                                                    label="IPTU"
                                                />
                                                <Checkbox
                                                    checked={unit.condominiumIncludes.gas}
                                                    onChange={(val) => updateUnitCondo(idx, "gas", val)}
                                                    label="Gás"
                                                    icon={<Flame className="w-3.5 h-3.5" />}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Photos (up to 10) */}
                            <div className="space-y-2 pt-2 border-t border-border">
                                <div className="flex items-center justify-between">
                                    <Label className="flex items-center gap-1.5">
                                        <Camera className="w-4 h-4 text-muted-foreground" />
                                        Fotos da Unidade
                                    </Label>
                                    <span className="text-xs text-muted-foreground">
                                        {(unit.photos?.length || 0) + (unit.newPhotos?.length || 0)}/10
                                    </span>
                                </div>
                                <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
                                    {/* Upload button */}
                                    {(unit.photos?.length || 0) + (unit.newPhotos?.length || 0) < 10 && (
                                        <div className="aspect-square rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center cursor-pointer hover:bg-muted/50 transition-colors relative">
                                            <input
                                                type="file"
                                                multiple
                                                accept="image/*"
                                                onChange={(e) => handleUnitPhotoSelect(idx, e)}
                                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                            />
                                            <Camera className="w-6 h-6 text-muted-foreground mb-1" />
                                            <span className="text-[10px] text-muted-foreground">Adicionar</span>
                                        </div>
                                    )}
                                    {/* New photos */}
                                    {(unit.newPhotos || []).map((file, pi) => (
                                        <FilePreview key={`np-${pi}`} file={file} onRemove={() => removeUnitNewPhoto(idx, pi)} />
                                    ))}
                                    {/* Saved photos */}
                                    {(unit.photos || []).map((url, pi) => (
                                        <div key={`sp-${pi}`} className="aspect-square rounded-lg border border-border relative group overflow-hidden">
                                            <Image src={url} alt="Unit" width={200} height={200} className="w-full h-full object-cover" />
                                            <div className="absolute top-1 right-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <Button size="icon" variant="destructive" className="h-5 w-5" onClick={() => removeUnitSavedPhoto(idx, url)}>
                                                    <Trash2 className="w-2.5 h-2.5" />
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Videos (up to 2) */}
                            <div className="space-y-2 pt-2 border-t border-border">
                                <div className="flex items-center justify-between">
                                    <Label className="flex items-center gap-1.5">
                                        <Video className="w-4 h-4 text-muted-foreground" />
                                        Vídeos da Unidade
                                    </Label>
                                    <span className="text-xs text-muted-foreground">
                                        {(unit.videos?.length || 0) + (unit.newVideos?.length || 0)}/2
                                    </span>
                                </div>
                                <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
                                    {(unit.videos?.length || 0) + (unit.newVideos?.length || 0) < 2 && (
                                        <div className="aspect-square rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center cursor-pointer hover:bg-muted/50 transition-colors relative">
                                            <input
                                                type="file"
                                                accept="video/*"
                                                onChange={(e) => handleUnitVideoSelect(idx, e)}
                                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                            />
                                            <Video className="w-6 h-6 text-muted-foreground mb-1" />
                                            <span className="text-[10px] text-muted-foreground">Adicionar</span>
                                        </div>
                                    )}
                                    {(unit.newVideos || []).map((file, vi) => (
                                        <FilePreview key={`nv-${vi}`} file={file} onRemove={() => removeUnitNewVideo(idx, vi)} isVideo />
                                    ))}
                                    {(unit.videos || []).map((url, vi) => (
                                        <div key={`sv-${vi}`} className="aspect-square rounded-lg border border-border relative group overflow-hidden">
                                            <video src={url} className="w-full h-full object-cover" muted />
                                            <div className="absolute top-1 right-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <Button size="icon" variant="destructive" className="h-5 w-5" onClick={() => removeUnitSavedVideo(idx, url)}>
                                                    <Trash2 className="w-2.5 h-2.5" />
                                                </Button>
                                            </div>
                                            <div className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-[10px] p-1 text-center flex items-center justify-center gap-1">
                                                <Video className="w-3 h-3" /> Vídeo
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Description — at the very bottom */}
                            <div className="space-y-2 pt-2 border-t border-border">
                                <div className="flex items-center justify-between">
                                    <Label className="flex items-center gap-1.5">
                                        <FileText className="w-4 h-4 text-muted-foreground" />
                                        Descrição da Unidade
                                    </Label>
                                    {onGenerateDescription && (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-7 text-xs gap-1 text-violet-600 border-violet-300 hover:bg-violet-50 dark:hover:bg-violet-900/20"
                                            onClick={() => onGenerateDescription(idx)}
                                            disabled={generatingDescriptionIdx === idx}
                                        >
                                            {generatingDescriptionIdx === idx ? (
                                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                            ) : (
                                                <Wand2 className="w-3.5 h-3.5" />
                                            )}
                                            {generatingDescriptionIdx === idx ? 'Gerando...' : 'Gerar com IA'}
                                        </Button>
                                    )}
                                </div>
                                <textarea
                                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 min-h-[80px]"
                                    placeholder="Ex: Kitnet com vista para o jardim, piso laminado, banheiro com box..."
                                    value={unit.description || ''}
                                    onChange={(e) => updateUnit(idx, { description: e.target.value })}
                                />
                            </div>

                            {/* Continuar → next sub-unit */}
                            {idx < units.length - 1 && (
                                <div className="flex justify-end pt-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="gap-1.5 text-emerald-600 border-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                                        onClick={() => {
                                            setOpenUnitIndex(idx + 1);
                                            if (propertyIndex !== undefined) {
                                                setTimeout(() => document.getElementById(`prop-${propertyIndex}-unit-${idx + 1}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
                                            }
                                        }}
                                    >
                                        Próxima Unidade <ArrowRight className="w-4 h-4" />
                                    </Button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}
