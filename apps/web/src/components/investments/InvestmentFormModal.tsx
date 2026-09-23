"use client";

/**
 * "Novo investimento": read the purchase contract with AI, check what it found, save.
 *
 * The AI step is optional but it is the point of the flow — a quadro resumo is a table of numbers
 * (preço total, entrada, N parcelas de X a partir de tal data, índice de correção) and typing it
 * by hand is where the mistakes come from. The contract the user picked is uploaded once and, when
 * the investment is created, adopted as its CONTRACT document.
 */
import React, { useRef, useState } from "react";
import { AlertCircle, FileUp, Loader2, Sparkles } from "lucide-react";
import { Button } from "@kitnets/ui";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/DateInput";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
    INDEX_LABELS,
    INVESTMENT_KIND_LABELS,
    type IndexCode,
    type InvestmentKind,
} from "@/lib/new-investments";
import InvestmentScheduleEditor, { INDEX_CODES, type ScheduleDraft } from "./InvestmentScheduleEditor";
import type { ExtractedInvestment } from "@/lib/new-investment-extract";
import { checkInvestmentFile, stageInvestmentFile } from "@/lib/new-investment-upload-client";
import { readByFromJson, readerLabel } from "@/lib/ai-reader-label";

export interface InvestmentFormValues {
    name: string;
    unit_label: string;
    developer: string;
    kind: InvestmentKind;
    description: string;
    street: string;
    street_number: string;
    neighborhood: string;
    city: string;
    state: string;
    postal_code: string;
    total_price: string;
    down_payment: string;
    financed_amount: string;
    area_m2: string;
    contract_date: string;
    keys_expected_on: string;
    index_before_keys: IndexCode;
    index_after_keys: IndexCode;
    estimated_rent: string;
    schedules: ScheduleDraft[];
}

const EMPTY: InvestmentFormValues = {
    name: "", unit_label: "", developer: "", kind: "STUDIO", description: "",
    street: "", street_number: "", neighborhood: "", city: "", state: "", postal_code: "",
    total_price: "", down_payment: "", financed_amount: "", area_m2: "", contract_date: "", keys_expected_on: "",
    index_before_keys: "NONE", index_after_keys: "NONE", estimated_rent: "", schedules: [],
};

const numberOrEmpty = (v: number | null): string => (v === null ? "" : String(v));

/** The extraction, as the form's fields. */
function fromExtraction(data: ExtractedInvestment, inferredTotal: number | null): InvestmentFormValues {
    const i = data.investment;
    return {
        name: i.name ?? "",
        unit_label: i.unit_label ?? "",
        developer: i.developer ?? "",
        kind: i.kind,
        description: i.description ?? "",
        street: i.street ?? "",
        street_number: i.street_number ?? "",
        neighborhood: i.neighborhood ?? "",
        city: i.city ?? "",
        state: i.state ?? "",
        postal_code: i.postal_code ?? "",
        total_price: numberOrEmpty(i.total_price ?? inferredTotal),
        down_payment: numberOrEmpty(i.down_payment),
        financed_amount: numberOrEmpty(i.financed_amount),
        area_m2: numberOrEmpty(i.area_m2),
        contract_date: i.contract_date ?? "",
        keys_expected_on: i.keys_expected_on ?? "",
        index_before_keys: i.index_before_keys,
        index_after_keys: i.index_after_keys,
        estimated_rent: "",
        schedules: data.schedules
            .filter(s => s.first_due_on !== null)
            .map(s => ({
                label: s.label,
                kind: s.kind,
                installments: s.periodicity === "SINGLE" ? 1 : s.installments,
                amount: s.amount ?? 0,
                first_due_on: s.first_due_on as string,
                periodicity: s.periodicity,
                index_code: s.index_code,
            })),
    };
}

interface Props {
    open: boolean;
    onClose: () => void;
    /** Returns the created investment's id, or null when it failed. */
    onSubmit: (values: InvestmentFormValues, contractPath: string | null, contractName: string | null) => Promise<string | null>;
}

export default function InvestmentFormModal({ open, onClose, onSubmit }: Props) {
    const [values, setValues] = useState<InvestmentFormValues>(EMPTY);
    const [extracting, setExtracting] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [contract, setContract] = useState<{ path: string; name: string } | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    const set = <K extends keyof InvestmentFormValues>(key: K, value: InvestmentFormValues[K]) =>
        setValues(prev => ({ ...prev, [key]: value }));

    const reset = () => {
        setValues(EMPTY);
        setContract(null);
        setError(null);
        setNotice(null);
    };

    const importContract = async (file: File) => {
        const invalid = checkInvestmentFile(file);
        if (invalid) {
            setError(invalid);
            return;
        }
        setExtracting(true);
        setError(null);
        setNotice(null);

        const staged = await stageInvestmentFile(file);
        if ("error" in staged) {
            setExtracting(false);
            setError(staged.error);
            return;
        }
        setContract({ path: staged.path, name: file.name.slice(0, 200) });

        try {
            const res = await fetch("/api/investments/extract", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ storage_path: staged.path }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || !json.success) {
                setError(typeof json.error === "string" ? json.error : "Não foi possível ler o contrato.");
                return;
            }
            const next = fromExtraction(json.data as ExtractedInvestment, json.inferred_total ?? null);
            setValues(prev => ({ ...next, estimated_rent: prev.estimated_rent }));
            const reader = readerLabel(readByFromJson(json.read_by));
            const by = reader ? ` pelo ${reader}` : "";
            setNotice(
                next.schedules.length > 0
                    ? `Quadro resumo lido${by}: ${next.schedules.length} bloco${next.schedules.length === 1 ? "" : "s"} de parcelas. Confira antes de salvar.`
                    : `Contrato lido${by}. Nenhum bloco de parcelas foi identificado — cadastre-os abaixo.`
            );
        } catch {
            setError("Erro de conexão ao ler o contrato.");
        } finally {
            setExtracting(false);
        }
    };

    const submit = async () => {
        if (!values.name.trim()) {
            setError("Informe o nome do empreendimento.");
            return;
        }
        if (values.schedules.some(s => !s.first_due_on)) {
            setError("Informe o primeiro vencimento de cada bloco de parcelas.");
            return;
        }
        setSaving(true);
        setError(null);
        const id = await onSubmit(values, contract?.path ?? null, contract?.name ?? null);
        setSaving(false);
        if (id) {
            reset();
        } else {
            setError("Não foi possível salvar o investimento.");
        }
    };

    return (
        <Dialog open={open} onOpenChange={o => { if (!o && !saving && !extracting) { reset(); onClose(); } }}>
            <DialogContent className="sm:max-w-4xl max-h-[92vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Novo investimento</DialogTitle>
                    <DialogDescription>
                        Imóvel comprado na planta. Envie o contrato e a IA preenche o quadro resumo para você conferir.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-5 min-w-0">
                    <div className="rounded-xl border border-dashed border-emerald-400/60 bg-emerald-50/40 dark:bg-emerald-950/20 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="space-y-0.5">
                                <p className="text-sm font-semibold text-foreground inline-flex items-center gap-2">
                                    <Sparkles className="w-4 h-4 text-emerald-600" /> Importar contrato com IA
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    {contract ? contract.name : "PDF ou foto do contrato de compra e venda (até 20MB)."}
                                </p>
                            </div>
                            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={extracting || saving}>
                                {extracting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <FileUp className="w-4 h-4 mr-1" />}
                                {extracting ? "Lendo contrato…" : contract ? "Trocar arquivo" : "Escolher contrato"}
                            </Button>
                            <input
                                ref={fileRef}
                                type="file"
                                accept=".pdf,.jpg,.jpeg,.png,.webp"
                                className="sr-only"
                                onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) importContract(f); }}
                            />
                        </div>
                        {notice && <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-400">{notice}</p>}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        <div className="space-y-1 lg:col-span-2">
                            <Label htmlFor="inv-name">Empreendimento *</Label>
                            <Input id="inv-name" value={values.name} onChange={e => set("name", e.target.value)} placeholder="Sun Place" />
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="inv-unit">Unidade</Label>
                            <Input id="inv-unit" value={values.unit_label} onChange={e => set("unit_label", e.target.value)} placeholder="Studio 204" />
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="inv-kind">Tipo</Label>
                            <select
                                id="inv-kind"
                                value={values.kind}
                                onChange={e => set("kind", e.target.value as InvestmentKind)}
                                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                            >
                                {(Object.keys(INVESTMENT_KIND_LABELS) as InvestmentKind[]).map(k => (
                                    <option key={k} value={k}>{INVESTMENT_KIND_LABELS[k]}</option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-1 lg:col-span-2">
                            <Label htmlFor="inv-developer">Construtora</Label>
                            <Input id="inv-developer" value={values.developer} onChange={e => set("developer", e.target.value)} placeholder="Acácio SPE" />
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="inv-city">Cidade</Label>
                            <Input id="inv-city" value={values.city} onChange={e => set("city", e.target.value)} />
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="inv-state">UF</Label>
                            <Input id="inv-state" maxLength={2} value={values.state} onChange={e => set("state", e.target.value.toUpperCase())} />
                        </div>
                        <div className="space-y-1 lg:col-span-2">
                            <Label htmlFor="inv-street">Endereço</Label>
                            <Input id="inv-street" value={values.street} onChange={e => set("street", e.target.value)} placeholder="Rua 208" />
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="inv-number">Número</Label>
                            <Input id="inv-number" value={values.street_number} onChange={e => set("street_number", e.target.value)} />
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="inv-neighborhood">Bairro</Label>
                            <Input id="inv-neighborhood" value={values.neighborhood} onChange={e => set("neighborhood", e.target.value)} />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        <div className="space-y-1">
                            <Label htmlFor="inv-total">Preço total (R$)</Label>
                            <Input id="inv-total" inputMode="decimal" value={values.total_price} onChange={e => set("total_price", e.target.value)} placeholder="141900,00" />
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="inv-down">Entrada / sinal (R$)</Label>
                            <Input id="inv-down" inputMode="decimal" value={values.down_payment} onChange={e => set("down_payment", e.target.value)} />
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="inv-financed">Valor a parcelar (R$)</Label>
                            <Input id="inv-financed" inputMode="decimal" value={values.financed_amount} onChange={e => set("financed_amount", e.target.value)} />
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="inv-rent">Aluguel estimado (R$)</Label>
                            <Input id="inv-rent" inputMode="decimal" value={values.estimated_rent} onChange={e => set("estimated_rent", e.target.value)} placeholder="1800,00" />
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="inv-area">Área privativa (m²)</Label>
                            <Input id="inv-area" inputMode="decimal" value={values.area_m2} onChange={e => set("area_m2", e.target.value)} placeholder="27,5" />
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="inv-contract-date">Data do contrato</Label>
                            <DateInput id="inv-contract-date" value={values.contract_date} onChange={iso => set("contract_date", iso)} />
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="inv-keys">Entrega das chaves</Label>
                            <DateInput id="inv-keys" value={values.keys_expected_on} onChange={iso => set("keys_expected_on", iso)} />
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="inv-index-before">Índice até as chaves</Label>
                            <select
                                id="inv-index-before"
                                value={values.index_before_keys}
                                onChange={e => set("index_before_keys", e.target.value as IndexCode)}
                                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                            >
                                {INDEX_CODES.map(c => <option key={c} value={c}>{INDEX_LABELS[c]}</option>)}
                            </select>
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="inv-index-after">Índice após as chaves</Label>
                            <select
                                id="inv-index-after"
                                value={values.index_after_keys}
                                onChange={e => set("index_after_keys", e.target.value as IndexCode)}
                                className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
                            >
                                {INDEX_CODES.map(c => <option key={c} value={c}>{INDEX_LABELS[c]}</option>)}
                            </select>
                        </div>
                    </div>

                    <InvestmentScheduleEditor
                        schedules={values.schedules}
                        onChange={next => set("schedules", next)}
                        defaultIndex={values.index_before_keys}
                        disabled={saving || extracting}
                    />

                    {error && (
                        <p className="flex items-start gap-2 text-sm text-rose-600">
                            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> {error}
                        </p>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => { reset(); onClose(); }} disabled={saving || extracting}>Cancelar</Button>
                    <Button onClick={submit} disabled={saving || extracting}>
                        {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Criar investimento
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
