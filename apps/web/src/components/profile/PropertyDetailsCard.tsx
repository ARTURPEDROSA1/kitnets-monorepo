"use client";

import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    ChevronDown, ChevronUp, Settings2, Sun, Droplets, Zap, Flame,
    Wifi, Plus, Trash2, Home, BedDouble, Car, Shirt, Wind, CookingPot,
    DoorOpen, Building2
} from "lucide-react";
import { Button } from "@kitnets/ui";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────
export interface PropertyDetails {
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

export interface SubUnit {
    name: string;
    sqMeters: string;
    rooms: string;
    bedrooms: string;
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
}

const defaultSubUnit = (index: number): SubUnit => ({
    name: `Unidade ${index + 1}`,
    sqMeters: "",
    rooms: "",
    bedrooms: "",
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
});

// ── Props ──────────────────────────────────────────────────────────
interface Props {
    details: PropertyDetails;
    units: SubUnit[];
    onDetailsChange: (details: PropertyDetails) => void;
    onUnitsChange: (units: SubUnit[]) => void;
    propertyType: "single" | "multi";
}

// ── Checkbox Component ─────────────────────────────────────────────
function Checkbox({
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

// ── Main Component ─────────────────────────────────────────────────
export default function PropertyDetailsCard({
    details,
    units,
    onDetailsChange,
    onUnitsChange,
    propertyType,
}: Props) {
    const [isOpen, setIsOpen] = useState(true);
    const [openUnitIndex, setOpenUnitIndex] = useState<number | null>(0);

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
        updateDetail("numberOfUnits", updated.length);
        onUnitsChange(updated);
    };

    return (
        <div className="space-y-4">
            {/* ── Detalhes Card ──────────────────────────────────────── */}
            <div className="bg-card border border-border p-6 rounded-xl shadow-sm space-y-4">
                <button
                    type="button"
                    onClick={() => setIsOpen((p) => !p)}
                    className="flex items-center justify-between w-full"
                >
                    <div className="flex items-center gap-2">
                        <div className="p-2 bg-violet-100 dark:bg-violet-900/50 rounded-lg text-violet-600">
                            <Settings2 className="w-5 h-5" />
                        </div>
                        <h3 className="text-lg font-semibold text-foreground">Detalhes</h3>
                    </div>
                    {isOpen ? (
                        <ChevronUp className="w-5 h-5 text-muted-foreground" />
                    ) : (
                        <ChevronDown className="w-5 h-5 text-muted-foreground" />
                    )}
                </button>

                {isOpen && (
                    <div className="space-y-6 pt-2">
                        {/* Number of Units + Total sqm */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {propertyType === "multi" && (
                                <div className="space-y-1.5">
                                    <Label className="flex items-center gap-1.5">
                                        <Building2 className="w-4 h-4 text-muted-foreground" />
                                        Número de Unidades
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
                                    Área Total (m²)
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
                            <p className="text-sm font-semibold text-foreground">Medidores Principais do Imóvel</p>
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
                    </div>
                )}
            </div>

            {/* ── Sub-Unit Cards ─────────────────────────────────────── */}
            {propertyType === "multi" && details.numberOfUnits > 0 && (
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
                                updateDetail("numberOfUnits", newUnits.length);
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
                                        <p className="text-sm font-semibold text-foreground">{unit.name || `Unidade ${idx + 1}`}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {unit.sqMeters ? `${unit.sqMeters} m²` : "Sem dados"}
                                            {unit.bedrooms ? ` · ${unit.bedrooms} quartos` : ""}
                                            {unit.condominium ? ` · Condomínio R$ ${unit.condominiumValue || "–"}` : ""}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
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

                                    {/* Rooms + Bedrooms */}
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

                                    {/* Condominium */}
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
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
