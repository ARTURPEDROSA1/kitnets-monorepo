"use client";

/**
 * "Registrar aditivo": the owner sends the addendum the agency drew up at an adjustment (or a
 * renegotiation), the AI reads the date and the new values, the owner reviews them and saves. What is
 * saved is the truth of that date — the parties negotiate freely, whatever the index did — and takes
 * the place of Kitnets' calculation. An agreement without a document can be registered too.
 */
import React, { useRef, useState } from "react";
import { AlertTriangle, FilePlus2, FileText, Loader2, Sparkles, Upload, X } from "lucide-react";
import { Button } from "@kitnets/ui";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Money } from "@/components/privacy";
import { formatDateBR } from "@/lib/dates";
import { brl } from "@/lib/lease-dashboard";
import { daysBetween, LEASE_INDEX_LABELS } from "@/lib/lease-summary";
import { COVER_DAYS, type AdjustedChargeType, type StoredAdjustment } from "@/lib/lease-adjustments";
import type { ExtractedAddendum } from "@/lib/lease-addendum-extract";
import { attachLeaseDocument, checkLeaseFile, LEASE_UPLOAD_ACCEPT, ROUTE_BODY_SAFE_SIZE, stageLeaseFile } from "@/lib/lease-upload-client";
import { formatDateBR as isoToMasked, maskCurrency, maskDate, moneyToMask, parseDateBR } from "./LeaseForm";

interface Props {
    leaseId: string;
    /** the contract's original amounts and the adjustments recorded, oldest first: what was in force before the addendum's date */
    initial: { rent: number; condo: number | null };
    rows: StoredAdjustment[];
    /** the charge adjusted next to the rent — the condominium, or a house's energy; null leaves the field out */
    charge: { type: AdjustedChargeType; label: string } | null;
    /** the lease's adjustment dates already behind today, oldest first: the dates an addendum usually refers to */
    adjustmentDates: string[];
    /** the adjustment the addendum is for, when it was opened from its line */
    initialDate?: string | null;
    onClose: () => void;
    onSaved: () => void;
}

type FieldErrors = Record<string, string>;

/** The anniversary an addendum's date refers to, when it sits next to one. */
const snapToAnniversary = (date: string, anniversaries: string[]): string =>
    anniversaries.find(a => Math.abs(daysBetween(a, date)) < COVER_DAYS) ?? date;

const INDEX_OPTIONS = ["", "IPCA", "IGP_M", "INPC", "IVAR", "CUSTOM"] as const;

/** The amounts in force just before a date — what an addendum of that date changes (the calculated row it replaces is left out). */
function before(date: string, initial: Props["initial"], rows: StoredAdjustment[]): { rent: number; condo: number | null } {
    let rent = initial.rent, condo = initial.condo;
    for (const r of rows) {
        const replaced = r.effective_date === date || (r.source === "CALCULATED" && Math.abs(daysBetween(r.effective_date, date)) < COVER_DAYS);
        if (replaced || r.effective_date > date) break;
        rent = r.new_rent;
        condo = r.new_condo ?? condo;
    }
    return { rent, condo };
}

export default function LeaseAddendumModal({ leaseId, initial, rows, charge, adjustmentDates, initialDate = null, onClose, onSaved }: Props) {
    const hasCondo = charge !== null;
    const chargeName = (charge?.label ?? "Condomínio").toLowerCase();
    const input = useRef<HTMLInputElement>(null);
    const [file, setFile] = useState<File | null>(null);
    const [storagePath, setStoragePath] = useState<string | null>(null);
    /** the file already attached to the lease by a save that then failed: not attached twice */
    const [documentId, setDocumentId] = useState<string | null>(null);
    const [reading, setReading] = useState(false);
    const [read, setRead] = useState<ExtractedAddendum | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [saving, setSaving] = useState(false);
    const [errors, setErrors] = useState<FieldErrors>({});
    const [error, setError] = useState<string | null>(null);

    const latest = adjustmentDates[adjustmentDates.length - 1] ?? "";
    const [date, setDate] = useState(isoToMasked(initialDate || latest || null));
    const [rent, setRent] = useState("");
    const [condo, setCondo] = useState("");
    const [index, setIndex] = useState("");
    const [pct, setPct] = useState("");
    const [notes, setNotes] = useState("");
    // the amounts before the adjustment, when the contract was registered with today's (the first adjustment only)
    const [previousRent, setPreviousRent] = useState("");
    const [previousCondo, setPreviousCondo] = useState("");

    const busy = reading || saving;

    const fill = (data: ExtractedAddendum) => {
        if (data.effective_date) setDate(isoToMasked(snapToAnniversary(data.effective_date, adjustmentDates)));
        if (data.new_rent !== null) setRent(moneyToMask(data.new_rent));
        if (data.new_condominium !== null && charge?.type === "CONDOMINIUM") setCondo(moneyToMask(data.new_condominium));
        if (data.index) setIndex(data.index);
        if (data.percent !== null) setPct(String(data.percent).replace(".", ","));
        if (data.summary) setNotes(data.summary);
    };

    const pick = async (picked: File | null) => {
        if (!picked) return;
        const problem = checkLeaseFile(picked);
        if (problem) { setError(problem); return; }
        setError(null); setNotice(null); setErrors({}); setRead(null); setDocumentId(null);
        setFile(picked); setShowForm(true); setReading(true);
        try {
            // past Vercel's body limit the file goes straight to storage and the route reads it from there
            const staged = await stageLeaseFile(picked);
            let res: Response;
            if ("path" in staged) {
                setStoragePath(staged.path);
                res = await fetch(`/api/leases/${leaseId}/reajustes/extrair`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ storage_path: staged.path }) });
            } else if (picked.size <= ROUTE_BODY_SAFE_SIZE) {
                setStoragePath(null);
                const form = new FormData();
                form.append("file", picked);
                res = await fetch(`/api/leases/${leaseId}/reajustes/extrair`, { method: "POST", body: form });
            } else {
                setNotice(`${staged.error} Preencha os valores do aditivo abaixo.`);
                return;
            }
            const json = await res.json().catch(() => ({}));
            if (!res.ok || !json.data) {
                setNotice(json.error || "Não foi possível ler o aditivo. Preencha os valores abaixo.");
                return;
            }
            setRead(json.data as ExtractedAddendum);
            fill(json.data as ExtractedAddendum);
        } catch {
            setNotice("Não foi possível ler o aditivo. Preencha os valores abaixo.");
        } finally {
            setReading(false);
        }
    };

    const save = async () => {
        const e: FieldErrors = {};
        const iso = parseDateBR(date);
        if (!iso) e.effective_date = "Informe a data em dd/mm/aaaa.";
        if (!rent || Number(rent.replace(/\D/g, "")) <= 0) e.new_rent = "Informe o novo valor do aluguel.";
        setErrors(e);
        if (Object.keys(e).length > 0) return;

        setSaving(true); setError(null);
        try {
            let docId = documentId;
            if (file && !docId) {
                const attached = await attachLeaseDocument(leaseId, file, "ADDENDUM", storagePath);
                if ("error" in attached) { setError(attached.error); return; }
                docId = typeof attached.document.id === "string" ? attached.document.id : null;
                setDocumentId(docId);
            }
            const res = await fetch(`/api/leases/${leaseId}/reajustes`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ effective_date: iso, new_rent: rent, new_condo: condo || null, index_code: index || null, index_pct: pct || null, previous_rent: first ? previousRent || null : null, previous_condo: first ? previousCondo || null : null, document_id: docId, notes: notes || null }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                if (json.errors && typeof json.errors === "object") setErrors(json.errors as FieldErrors);
                setError(json.error || (json.errors ? "Confira os campos destacados." : "Não foi possível salvar o aditivo."));
                return;
            }
            onSaved();
        } catch {
            setError("Não foi possível salvar o aditivo.");
        } finally {
            setSaving(false);
        }
    };

    const prior = before(parseDateBR(date) || latest || "9999-12-31", initial, rows);
    const newRent = Number(rent.replace(/\D/g, "")) / 100;
    const isoDate = parseDateBR(date) || latest;
    const first = !rows.some(r => r.effective_date < isoDate);
    const typedPrevious = Number(previousRent.replace(/\D/g, "")) / 100;
    const baseRent = first && typedPrevious > 0 ? typedPrevious : prior.rent;
    const change = newRent > 0 && baseRent > 0 ? (newRent / baseRent - 1) * 100 : null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !busy && onClose()} />
            <div role="dialog" aria-modal="true" aria-label="Registrar aditivo" className="relative flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
                {!busy && (
                    <button type="button" onClick={onClose} className="absolute right-4 top-4 z-10 rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Fechar">
                        <X className="h-5 w-5" />
                    </button>
                )}

                <div className="flex items-start gap-3.5 p-6 pb-4">
                    <div className="shrink-0 rounded-xl bg-violet-100 p-2.5 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300"><FilePlus2 className="h-6 w-6" /></div>
                    <div className="space-y-1 pr-6">
                        <h2 className="text-xl font-bold tracking-tight text-foreground">Registrar aditivo</h2>
                        <p className="text-xs leading-relaxed text-muted-foreground sm:text-sm">
                            Envie o aditivo do reajuste: a IA lê a data e os novos valores e você confere. O que o aditivo diz é o que vale — as partes podem negociar um valor diferente do índice — e substitui o cálculo do Kitnets naquela data.
                        </p>
                    </div>
                </div>

                <div className="flex-1 space-y-4 overflow-y-auto px-6 pb-4">
                    <input ref={input} type="file" accept={LEASE_UPLOAD_ACCEPT} className="hidden" onChange={e => { void pick(e.target.files?.[0] ?? null); e.target.value = ""; }} />

                    {!file ? (
                        <div className="space-y-2">
                            <button
                                type="button"
                                onClick={() => input.current?.click()}
                                onDragOver={e => e.preventDefault()}
                                onDrop={e => { e.preventDefault(); void pick(e.dataTransfer.files?.[0] ?? null); }}
                                className="group flex w-full cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border p-6 text-center transition-all hover:border-violet-500/60 hover:bg-muted/30"
                            >
                                <Upload className="mb-2 h-6 w-6 text-muted-foreground group-hover:text-violet-600" />
                                <span className="text-sm font-medium text-foreground">Selecionar o aditivo</span>
                                <span className="text-xs text-muted-foreground">PDF, JPG, PNG ou WebP, até 10 MB</span>
                            </button>
                            {!showForm && (
                                <button type="button" onClick={() => setShowForm(true)} className="text-xs font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground">
                                    Não tenho o arquivo: registrar o valor acordado
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 rounded-lg border border-border/80 bg-muted/30 px-3 py-2 text-sm">
                            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <span className="min-w-0 flex-1 truncate text-foreground">{file.name}</span>
                            {reading
                                ? <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Lendo o aditivo…</span>
                                : !documentId && <button type="button" onClick={() => input.current?.click()} className="text-xs font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground">Trocar</button>}
                        </div>
                    )}

                    {read && !reading && (
                        <p className="flex items-start gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-900 dark:border-violet-800 dark:bg-violet-950/30 dark:text-violet-200">
                            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <span>Valores lidos do aditivo{read.confidence !== null ? ` (confiança ${Math.round(read.confidence * 100)}%)` : ""}. Confira antes de salvar{read.new_end_date ? <>; o aditivo também leva o término do contrato para {formatDateBR(read.new_end_date)} — ajuste o prazo em Editar, se for o caso</> : ""}.</span>
                        </p>
                    )}
                    {notice && (
                        <p className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200">
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> <span>{notice}</span>
                        </p>
                    )}

                    {showForm && !reading && (
                        <div className="space-y-3">
                            {first && (
                                <div className="rounded-lg border border-dashed border-border p-3">
                                    <p className="mb-2 text-xs text-muted-foreground">
                                        Primeiro reajuste do histórico. Se o contrato foi cadastrado com os valores de hoje, informe os valores de antes deste reajuste: eles passam a ser o valor inicial do contrato.
                                    </p>
                                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                        <div>
                                            <Label className="text-xs">Aluguel antes (R$)</Label>
                                            <Input value={previousRent} onChange={e => setPreviousRent(maskCurrency(e.target.value))} placeholder={moneyToMask(prior.rent)} className={cn("h-9", errors.previous_rent && "border-red-500")} />
                                            {errors.previous_rent && <p className="mt-1 text-xs text-red-500">{errors.previous_rent}</p>}
                                        </div>
                                        {hasCondo && (
                                            <div>
                                                <Label className="text-xs">{charge?.label ?? "Condomínio"} antes (R$)</Label>
                                                <Input value={previousCondo} onChange={e => setPreviousCondo(maskCurrency(e.target.value))} placeholder={prior.condo !== null ? moneyToMask(prior.condo) : "0,00"} className={cn("h-9", errors.previous_condo && "border-red-500")} />
                                                {errors.previous_condo && <p className="mt-1 text-xs text-red-500">{errors.previous_condo}</p>}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <div>
                                    <Label className="text-xs">Vale a partir de *</Label>
                                    <Input value={date} onChange={e => setDate(maskDate(e.target.value))} placeholder="DD/MM/AAAA" maxLength={10} className={cn("h-9", errors.effective_date && "border-red-500")} />
                                    {errors.effective_date && <p className="mt-1 text-xs text-red-500">{errors.effective_date}</p>}
                                    {adjustmentDates.length > 0 && (
                                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                                            {adjustmentDates.slice(-4).map(d => (
                                                <button key={d} type="button" onClick={() => setDate(isoToMasked(d))} className={cn("rounded-full border px-2 py-0.5 text-[11px]", parseDateBR(date) === d ? "border-violet-500 bg-violet-50 text-violet-800 dark:bg-violet-950/40 dark:text-violet-200" : "border-border text-muted-foreground hover:bg-muted")}>
                                                    Reajuste de {formatDateBR(d)}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <Label className="text-xs">Novo aluguel (R$) *</Label>
                                    <Input value={rent} onChange={e => setRent(maskCurrency(e.target.value))} placeholder="0,00" className={cn("h-9", errors.new_rent && "border-red-500")} />
                                    {errors.new_rent && <p className="mt-1 text-xs text-red-500">{errors.new_rent}</p>}
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        Antes: <Money>{brl(baseRent)}</Money>
                                        {change !== null && <> · {change > 0 ? "+" : ""}{change.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%</>}
                                    </p>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                {hasCondo && (
                                    <div>
                                        <Label className="text-xs">{charge?.type === "ELECTRICITY" ? "Nova energia" : `Novo ${chargeName}`} (R$)</Label>
                                        <Input value={condo} onChange={e => setCondo(maskCurrency(e.target.value))} placeholder="Sem alteração" className={cn("h-9", errors.new_condo && "border-red-500")} />
                                        {errors.new_condo && <p className="mt-1 text-xs text-red-500">{errors.new_condo}</p>}
                                        {prior.condo !== null && <p className="mt-1 text-xs text-muted-foreground">Antes: <Money>{brl(prior.condo)}</Money></p>}
                                    </div>
                                )}
                                <div>
                                    <Label className="text-xs">Índice citado</Label>
                                    <select className="flex h-9 w-full rounded-md border bg-background px-2 py-1 text-sm" value={index} onChange={e => setIndex(e.target.value)}>
                                        {INDEX_OPTIONS.map(o => <option key={o} value={o}>{o === "" ? "Não informado" : o === "CUSTOM" ? "Valor negociado" : LEASE_INDEX_LABELS[o] ?? o}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <Label className="text-xs">Percentual citado (%)</Label>
                                    <Input value={pct} onChange={e => setPct(e.target.value.replace(/[^\d,.-]/g, ""))} placeholder="Ex: 4,83" className={cn("h-9", errors.index_pct && "border-red-500")} />
                                    {errors.index_pct && <p className="mt-1 text-xs text-red-500">{errors.index_pct}</p>}
                                </div>
                            </div>
                            <div>
                                <Label className="text-xs">Observação</Label>
                                <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ex: valor negociado abaixo do índice" maxLength={1000} className="h-9" />
                            </div>
                            {errors.document_id && <p className="text-xs text-red-500">{errors.document_id}</p>}
                        </div>
                    )}

                    {error && <p className="text-sm text-rose-600">{error}</p>}
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-border/60 px-6 py-3">
                    <Button variant="ghost" onClick={onClose} disabled={busy}>Cancelar</Button>
                    <Button onClick={() => void save()} disabled={busy || !showForm} className="bg-emerald-600 text-white hover:bg-emerald-700">
                        {saving ? <><Loader2 className="mr-1 h-4 w-4 animate-spin" /> Salvando…</> : "Salvar aditivo"}
                    </Button>
                </div>
            </div>
        </div>
    );
}
