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
import { AlertCircle, FileUp, Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@kitnets/ui";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
    INDEX_LABELS,
    INVESTMENT_KIND_LABELS,
    PAYMENT_KINDS,
    PERIODICITY_LABELS,
    formatBRL,
    type IndexCode,
    type InvestmentKind,
    type PaymentKind,
    type Periodicity,
} from "@/lib/new-investments";
import type { ExtractedInvestment } from "@/lib/new-investment-extract";
import { checkInvestmentFile, stageInvestmentFile } from "@/lib/new-investment-upload-client";

export interface ScheduleDraft {
    label: string;
    kind: PaymentKind;
    installments: number;
    amount: number;
    first_due_on: string;
    periodicity: Periodicity;
    index_code: IndexCode;
}

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
    total_price: "", down_payment: "", financed_amount: "", contract_date: "", keys_expected_on: "",
    index_before_keys: "NONE", index_after_keys: "NONE", estimated_rent: "", schedules: [],
};

const INDEX_CODES: IndexCode[] = ["NONE", "INCC", "IGPM", "IPCA", "CUB", "OTHER"];
const PERIODICITIES: Periodicity[] = ["SINGLE", "MONTHLY", "QUARTERLY", "SEMIANNUAL", "ANNUAL"];

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
            setNotice(
                next.schedules.length > 0
                    ? `Quadro resumo lido: ${next.schedules.length} bloco${next.schedules.length === 1 ? "" : "s"} de parcelas. Confira antes de salvar.`
                    : "Contrato lido. Nenhum bloco de parcelas foi identificado — cadastre-os abaixo."
            );
        } catch {
            setError("Erro de conexão ao ler o contrato.");
        } finally {
            setExtracting(false);
        }
    };

    const addSchedule = () =>
        set("schedules", [
            ...values.schedules,
            { label: "Parcelas mensais", kind: "PARCELA", installments: 12, amount: 0, first_due_on: "", periodicity: "MONTHLY", index_code: values.index_before_keys },
        ]);

    const patchSchedule = (index: number, patch: Partial<ScheduleDraft>) =>
        set("schedules", values.schedules.map((s, i) => (i === index ? { ...s, ...patch } : s)));

    const scheduleTotal = values.schedules.reduce(
        (sum, s) => sum + s.amount * (s.periodicity === "SINGLE" ? 1 : Math.max(1, s.installments)),
        0
    );

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
                            <Label htmlFor="inv-contract-date">Data do contrato</Label>
                            <Input id="inv-contract-date" type="date" value={values.contract_date} onChange={e => set("contract_date", e.target.value)} />
                        </div>
                        <div className="space-y-1">
                            <Label htmlFor="inv-keys">Entrega das chaves</Label>
                            <Input id="inv-keys" type="date" value={values.keys_expected_on} onChange={e => set("keys_expected_on", e.target.value)} />
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

                    <div className="space-y-2 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                            <div>
                                <h3 className="text-sm font-semibold text-foreground">Plano de pagamento</h3>
                                <p className="text-xs text-muted-foreground">
                                    Cada linha é um bloco do quadro resumo: quantas parcelas, de quanto, a partir de quando.
                                </p>
                            </div>
                            <Button variant="outline" size="sm" onClick={addSchedule}>
                                <Plus className="w-4 h-4 mr-1" /> Bloco
                            </Button>
                        </div>

                        {values.schedules.length === 0 ? (
                            <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                                Nenhum bloco cadastrado. Sem ele não há previsão de parcelas no gráfico.
                            </p>
                        ) : (
                            <div className="w-full min-w-0 overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                                            <th className="text-left font-semibold px-2 py-1">Descrição</th>
                                            <th className="text-left font-semibold px-2 py-1">Tipo</th>
                                            <th className="text-right font-semibold px-2 py-1">Parcelas</th>
                                            <th className="text-right font-semibold px-2 py-1">Valor</th>
                                            <th className="text-left font-semibold px-2 py-1">1º vencimento</th>
                                            <th className="text-left font-semibold px-2 py-1">Periodicidade</th>
                                            <th className="text-left font-semibold px-2 py-1">Índice</th>
                                            <th className="px-1" />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {values.schedules.map((s, index) => (
                                            <tr key={index} className="border-t border-border/50">
                                                <td className="px-2 py-1">
                                                    <Input value={s.label} onChange={e => patchSchedule(index, { label: e.target.value })} className="h-8 text-xs min-w-[8rem]" />
                                                </td>
                                                <td className="px-2 py-1">
                                                    <select
                                                        value={s.kind}
                                                        onChange={e => patchSchedule(index, { kind: e.target.value as PaymentKind })}
                                                        className="h-8 rounded-md border border-input bg-background px-1 text-xs"
                                                    >
                                                        {PAYMENT_KINDS.map(k => <option key={k.kind} value={k.kind}>{k.label}</option>)}
                                                    </select>
                                                </td>
                                                <td className="px-2 py-1">
                                                    <Input
                                                        type="number"
                                                        min={1}
                                                        value={s.installments}
                                                        disabled={s.periodicity === "SINGLE"}
                                                        onChange={e => patchSchedule(index, { installments: Number(e.target.value) || 1 })}
                                                        className="h-8 w-20 text-xs text-right tabular-nums"
                                                    />
                                                </td>
                                                <td className="px-2 py-1">
                                                    <Input
                                                        inputMode="decimal"
                                                        value={s.amount || ""}
                                                        onChange={e => patchSchedule(index, { amount: Number(e.target.value.replace(/\./g, "").replace(",", ".")) || 0 })}
                                                        className="h-8 w-28 text-xs text-right tabular-nums"
                                                    />
                                                </td>
                                                <td className="px-2 py-1">
                                                    <Input
                                                        type="date"
                                                        value={s.first_due_on}
                                                        onChange={e => patchSchedule(index, { first_due_on: e.target.value })}
                                                        className="h-8 text-xs tabular-nums"
                                                    />
                                                </td>
                                                <td className="px-2 py-1">
                                                    <select
                                                        value={s.periodicity}
                                                        onChange={e => patchSchedule(index, { periodicity: e.target.value as Periodicity })}
                                                        className="h-8 rounded-md border border-input bg-background px-1 text-xs"
                                                    >
                                                        {PERIODICITIES.map(p => <option key={p} value={p}>{PERIODICITY_LABELS[p]}</option>)}
                                                    </select>
                                                </td>
                                                <td className="px-2 py-1">
                                                    <select
                                                        value={s.index_code}
                                                        onChange={e => patchSchedule(index, { index_code: e.target.value as IndexCode })}
                                                        className="h-8 rounded-md border border-input bg-background px-1 text-xs"
                                                    >
                                                        {INDEX_CODES.map(c => <option key={c} value={c}>{INDEX_LABELS[c]}</option>)}
                                                    </select>
                                                </td>
                                                <td className="px-1 py-1">
                                                    <button
                                                        type="button"
                                                        onClick={() => set("schedules", values.schedules.filter((_, i) => i !== index))}
                                                        title="Remover bloco"
                                                        aria-label="Remover bloco"
                                                        className="p-1 rounded text-muted-foreground hover:text-rose-600"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot>
                                        <tr>
                                            <td colSpan={3} className="px-2 py-2 text-right text-[10px] uppercase tracking-wider text-muted-foreground">Total do plano</td>
                                            <td colSpan={5} className="px-2 py-2 text-left text-sm font-semibold tabular-nums">{formatBRL(scheduleTotal)}</td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        )}
                    </div>

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
