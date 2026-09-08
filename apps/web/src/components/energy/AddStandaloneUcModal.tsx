"use client";

import React, { useState } from "react";
import { Button } from "@kitnets/ui";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    X,
    Home,
    Users,
    Zap,
    Building2,
    Loader2,
    CheckCircle2,
    AlertCircle,
    MapPin,
    Search,
    Sparkles,
    SunMedium
} from "lucide-react";
import type { OwnerPropertySummary, UcCategory } from "@/app/api/energy-bills/properties/route";
import { EnergyDistributorLogo } from "./EnergyDistributorLogo";

interface AddStandaloneUcModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: (newProperty: OwnerPropertySummary) => void;
}

const CATEGORY_OPTIONS: {
    id: UcCategory;
    title: string;
    description: string;
    icon: typeof Home;
    color: string;
    bgClass: string;
    badgeText: string;
}[] = [
    {
        id: "residencia_propria",
        title: "Minha Residência",
        description: "Minha casa ou apartamento próprio (não é locado)",
        icon: Home,
        color: "text-blue-600",
        bgClass: "border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-950/20",
        badgeText: "Casa Própria",
    },
    {
        id: "parente",
        title: "Casa de Parente / Familiar",
        description: "Casa de parente a quem forneço energia solar e acompanho o consumo",
        icon: Users,
        color: "text-emerald-600",
        bgClass: "border-emerald-300 dark:border-emerald-700 bg-emerald-50/50 dark:bg-emerald-950/20",
        badgeText: "Familiar / Parente",
    },
    {
        id: "beneficiaria",
        title: "Unidade Beneficiária (GD)",
        description: "UC receptora de créditos compensados de autoconsumo remoto",
        icon: Zap,
        color: "text-amber-600",
        bgClass: "border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20",
        badgeText: "Beneficiária GD",
    },
    {
        id: "outro",
        title: "Outro (Comércio / Sítio)",
        description: "Sítio, chácara, escritório ou espaço comercial pessoal",
        icon: Building2,
        color: "text-purple-600",
        bgClass: "border-purple-300 dark:border-purple-700 bg-purple-50/50 dark:bg-purple-950/20",
        badgeText: "Outro Imóvel",
    },
];

const UTILITY_OPTIONS = [
    "CEMIG",
    "CPFL",
    "Enel",
    "Equatorial",
    "Neoenergia",
    "Copel",
    "EDP",
    "Light",
    "Celesc",
    "Outra",
];

export function AddStandaloneUcModal({
    isOpen,
    onClose,
    onSuccess,
}: AddStandaloneUcModalProps) {
    const [name, setName] = useState("");
    const [category, setCategory] = useState<UcCategory>("residencia_propria");
    const [utilityCompany, setUtilityCompany] = useState("CEMIG");
    const [consumerUnit, setConsumerUnit] = useState("");
    const [cep, setCep] = useState("");
    const [street, setStreet] = useState("");
    const [number, setNumber] = useState("");
    const [neighborhood, setNeighborhood] = useState("");
    const [city, setCity] = useState("");
    const [state, setState] = useState("MG");
    const [notes, setNotes] = useState("");

    const [loadingCep, setLoadingCep] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!isOpen) return null;

    const handleCepChange = async (val: string) => {
        const clean = val.replace(/\D/g, "").slice(0, 8);
        setCep(clean);

        if (clean.length === 8) {
            setLoadingCep(true);
            try {
                const res = await fetch(`/api/cep?code=${clean}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.street) setStreet(data.street);
                    if (data.neighborhood) setNeighborhood(data.neighborhood);
                    if (data.city) setCity(data.city);
                    if (data.state) setState(data.state);
                }
            } catch (err) {
                console.error("[AddStandaloneUcModal] CEP fetch error:", err);
            } finally {
                setLoadingCep(false);
            }
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!name.trim()) {
            setError("Por favor, informe um nome ou identificação para esta Unidade Consumidora.");
            return;
        }

        setSubmitting(true);
        try {
            const formattedAddress = [
                street ? `${street}${number ? `, ${number}` : ""}` : "",
                neighborhood,
            ]
                .filter(Boolean)
                .join(" - ");

            const res = await fetch("/api/energy-bills/properties", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: name.trim(),
                    category,
                    utilityCompany,
                    consumerUnit: consumerUnit.trim() || undefined,
                    address: formattedAddress || undefined,
                    city: city.trim() || undefined,
                    state: state.trim() || undefined,
                    zip: cep || undefined,
                    notes: notes.trim() || undefined,
                }),
            });

            const data = await res.json();
            if (!res.ok || !data.success) {
                throw new Error(data.error || "Erro ao cadastrar Unidade Consumidora.");
            }

            onSuccess(data.property);
            onClose();
        } catch (err: any) {
            console.error("[AddStandaloneUcModal] Submit error:", err);
            setError(err.message || "Erro de conexão ao salvar.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div
                className="relative w-full max-w-2xl bg-card border border-border rounded-2xl shadow-2xl max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
                role="dialog"
                aria-modal="true"
            >
                {/* Modal Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/40">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-amber-100 dark:bg-amber-900/50 rounded-xl text-amber-600">
                            <SunMedium className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-foreground">
                                Adicionar UC Avulsa
                            </h2>
                            <p className="text-xs text-muted-foreground">
                                Monitore o consumo e a energia solar da sua casa ou de parentes (não é imóvel de aluguel)
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={submitting}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                        aria-label="Fechar"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Modal Form Content */}
                <form onSubmit={handleSubmit} className="overflow-y-auto px-6 py-5 space-y-6 flex-1 custom-scrollbar">
                    {error && (
                        <div className="p-3.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl flex items-center gap-3 text-sm text-red-600 dark:text-red-300">
                            <AlertCircle className="w-5 h-5 shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    {/* Step 1: Category Selection */}
                    <div className="space-y-2.5">
                        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            1. Finalidade da Unidade Consumidora (UC)
                        </Label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            {CATEGORY_OPTIONS.map((opt) => {
                                const Icon = opt.icon;
                                const isSelected = category === opt.id;
                                return (
                                    <button
                                        type="button"
                                        key={opt.id}
                                        onClick={() => setCategory(opt.id)}
                                        className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                                            isSelected
                                                ? `${opt.bgClass} ring-2 ring-amber-500/50`
                                                : "border-border hover:border-muted-foreground/30 bg-card"
                                        }`}
                                    >
                                        <div className={`p-2 rounded-lg bg-background shadow-2xs ${opt.color}`}>
                                            <Icon className="w-4 h-4" />
                                        </div>
                                        <div className="space-y-0.5">
                                            <div className="flex items-center gap-1.5">
                                                <p className="text-xs font-bold text-foreground">{opt.title}</p>
                                                {isSelected && (
                                                    <CheckCircle2 className="w-3.5 h-3.5 text-amber-600" />
                                                )}
                                            </div>
                                            <p className="text-[11px] text-muted-foreground leading-snug">
                                                {opt.description}
                                            </p>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Step 2: Identification & Utility */}
                    <div className="space-y-3 pt-2 border-t border-border">
                        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            2. Identificação da UC & Concessionária
                        </Label>

                        <div className="space-y-1.5">
                            <Label htmlFor="uc-name" className="text-xs font-medium">
                                Nome / Identificação da Unidade <span className="text-red-500">*</span>
                            </Label>
                            <Input
                                id="uc-name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="ex: Minha Casa, Casa da Minha Mãe, Sítio Betim, etc."
                                className="h-10 text-sm"
                                required
                            />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label htmlFor="uc-distributor" className="text-xs font-medium">
                                    Concessionária de Energia
                                </Label>
                                <select
                                    id="uc-distributor"
                                    value={utilityCompany}
                                    onChange={(e) => setUtilityCompany(e.target.value)}
                                    className="w-full h-10 px-3 bg-background border border-border rounded-md text-sm font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                                >
                                    {UTILITY_OPTIONS.map((util) => (
                                        <option key={util} value={util}>
                                            {util}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="uc-number" className="text-xs font-medium">
                                    Número da UC (Instalação)
                                </Label>
                                <Input
                                    id="uc-number"
                                    value={consumerUnit}
                                    onChange={(e) => setConsumerUnit(e.target.value)}
                                    placeholder="ex: 9.978.440.018-98"
                                    className="h-10 text-sm font-mono"
                                />
                                <p className="text-[10px] text-muted-foreground">
                                    Opcional. Se preferir, pode enviar a conta depois para extração automática.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Step 3: Address (Optional) */}
                    <div className="space-y-3 pt-2 border-t border-border">
                        <div className="flex items-center justify-between">
                            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                3. Localização da UC (Opcional)
                            </Label>
                            {loadingCep && (
                                <span className="text-xs text-amber-600 flex items-center gap-1">
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                    Buscando CEP...
                                </span>
                            )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div className="space-y-1.5">
                                <Label htmlFor="uc-cep" className="text-xs font-medium">
                                    CEP
                                </Label>
                                <div className="relative">
                                    <Input
                                        id="uc-cep"
                                        value={cep}
                                        onChange={(e) => handleCepChange(e.target.value)}
                                        placeholder="00000-000"
                                        maxLength={9}
                                        className="h-10 text-sm font-mono pr-8"
                                    />
                                    <Search className="w-3.5 h-3.5 absolute right-2.5 top-3 text-muted-foreground pointer-events-none" />
                                </div>
                            </div>

                            <div className="sm:col-span-2 space-y-1.5">
                                <Label htmlFor="uc-street" className="text-xs font-medium">
                                    Logradouro (Rua / Avenida)
                                </Label>
                                <Input
                                    id="uc-street"
                                    value={street}
                                    onChange={(e) => setStreet(e.target.value)}
                                    placeholder="Rua, Alameda, Avenida..."
                                    className="h-10 text-sm"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div className="space-y-1.5">
                                <Label htmlFor="uc-number-addr" className="text-xs font-medium">
                                    Número
                                </Label>
                                <Input
                                    id="uc-number-addr"
                                    value={number}
                                    onChange={(e) => setNumber(e.target.value)}
                                    placeholder="ex: 120"
                                    className="h-10 text-sm"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="uc-neighborhood" className="text-xs font-medium">
                                    Bairro
                                </Label>
                                <Input
                                    id="uc-neighborhood"
                                    value={neighborhood}
                                    onChange={(e) => setNeighborhood(e.target.value)}
                                    placeholder="Bairro"
                                    className="h-10 text-sm"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="uc-city" className="text-xs font-medium">
                                    Cidade
                                </Label>
                                <Input
                                    id="uc-city"
                                    value={city}
                                    onChange={(e) => setCity(e.target.value)}
                                    placeholder="Cidade"
                                    className="h-10 text-sm"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="uc-state" className="text-xs font-medium">
                                    UF
                                </Label>
                                <Input
                                    id="uc-state"
                                    value={state}
                                    onChange={(e) => setState(e.target.value.toUpperCase().slice(0, 2))}
                                    placeholder="MG"
                                    maxLength={2}
                                    className="h-10 text-sm uppercase text-center font-bold"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Step 4: Notes (Optional) */}
                    <div className="space-y-1.5 pt-2 border-t border-border">
                        <Label htmlFor="uc-notes" className="text-xs font-medium">
                            Observações / Detalhes do Fornecimento (Opcional)
                        </Label>
                        <Input
                            id="uc-notes"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="ex: Recebe 35% dos créditos solares gerados na usina de Nova Lima"
                            className="h-10 text-sm"
                        />
                    </div>
                </form>

                {/* Modal Footer Actions */}
                <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-muted/30">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={onClose}
                        disabled={submitting}
                        className="text-sm font-medium"
                    >
                        Cancelar
                    </Button>

                    <Button
                        onClick={handleSubmit}
                        disabled={submitting || !name.trim()}
                        className="bg-amber-600 hover:bg-amber-700 text-white gap-2 text-sm font-medium shadow-sm"
                    >
                        {submitting ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Cadastrando UC...
                            </>
                        ) : (
                            <>
                                <CheckCircle2 className="w-4 h-4" />
                                Cadastrar UC Avulsa
                            </>
                        )}
                    </Button>
                </div>
            </div>
        </div>
    );
}
