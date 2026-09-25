"use client";

/**
 * "Importar contratos antigos": the PDFs of contracts that already ran (the previous tenant, the
 * contract before the renewal) go in as a batch. Each file goes through the same AI reading and
 * party matching as a new contract (LeaseImportModal), then a short settle step — which unit,
 * which status — and the lease is created with the PDF attached. Nothing is created without a
 * click per contract; a file can be skipped.
 */
import React, { useMemo, useRef, useState } from "react";
import { AlertTriangle, Archive, CheckCircle2, FileText, Loader2, SkipForward, Sparkles, Trash2, Upload, X } from "lucide-react";
import { Button } from "@kitnets/ui";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { formatDateBR } from "@/lib/dates";
import { checkLeaseFile, LEASE_UPLOAD_ACCEPT } from "@/lib/lease-upload-client";
import { createLeaseFromImport, type ImportedLeaseOutcome } from "@/lib/lease-import-client";
import { brl, guessUnit, referenceNameFor, todayBRT } from "@/lib/lease-dashboard";
import type { LeaseStatus } from "@/types/lease";
import LeaseImportModal, { type LeaseImportResult } from "./LeaseImportModal";
import type { LeaseFormDropdowns } from "./LeaseForm";

interface Props {
    dropdowns: LeaseFormDropdowns | null;
    /** The import may create properties, agencies and tenants: the lists are refreshed after each reading. */
    refreshDropdowns: () => Promise<LeaseFormDropdowns | null>;
    /** Closes the modal; the ids of the contracts created, so the caller refreshes the list. */
    onClose: (createdIds: string[]) => void;
    onOpenLease: (id: string) => void;
    /** "history" (default): old contracts, registered as closed unless unticked; "current": contracts that may well be in force */
    mode?: "history" | "current";
    /** Import started from a property's page (Imóveis): every contract is that property's (the unit is settled per contract) */
    fixedProperty?: { id: string; label: string };
    /** Import started from an agency's dashboard (Imobiliárias): every contract is that agency's */
    fixedAgency?: { id: string; label: string };
}

type Step = "pick" | "review" | "settle" | "done";

interface Outcome {
    file: File;
    result: "created" | "existed" | "skipped" | "failed";
    leaseId?: string;
    fileSkipped?: boolean;
    errors?: string[];
}

export default function LeaseBatchImportModal({ dropdowns, refreshDropdowns, onClose, onOpenLease, mode = "history", fixedAgency, fixedProperty }: Props) {
    const [step, setStep] = useState<Step>("pick");
    const [files, setFiles] = useState<File[]>([]);
    const [fileErrors, setFileErrors] = useState<string[]>([]);
    const [asHistory, setAsHistory] = useState(mode === "history");
    const [dragging, setDragging] = useState(false);
    const [index, setIndex] = useState(0);
    const [outcomes, setOutcomes] = useState<Outcome[]>([]);
    /** the lists refreshed after a reading (the import creates records); until then the caller's */
    const [refreshed, setRefreshed] = useState<LeaseFormDropdowns | null>(null);
    const lists = refreshed ?? dropdowns;
    /** what the AI read and the user settled for the current file, waiting for the unit and the status */
    const [pending, setPending] = useState<LeaseImportResult | null>(null);
    const [unitId, setUnitId] = useState("");
    const [status, setStatus] = useState<LeaseStatus>("EXPIRED");
    const [reference, setReference] = useState("");
    const [creating, setCreating] = useState(false);
    const [createError, setCreateError] = useState<string[]>([]);
    const input = useRef<HTMLInputElement>(null);

    const current = files[index] ?? null;
    const createdIds = useMemo(() => outcomes.filter(o => o.result === "created" && o.leaseId).map(o => o.leaseId as string), [outcomes]);

    const addFiles = (picked: File[]) => {
        const errors: string[] = [];
        const ok: File[] = [];
        for (const f of picked) {
            const problem = checkLeaseFile(f);
            if (problem) errors.push(`${f.name}: ${problem}`);
            else if (!files.some(x => x.name === f.name && x.size === f.size)) ok.push(f);
        }
        setFiles(prev => [...prev, ...ok]);
        setFileErrors(errors);
    };

    const advance = (outcome: Outcome) => {
        setOutcomes(prev => [...prev, outcome]);
        setPending(null);
        setCreateError([]);
        if (index + 1 < files.length) {
            setIndex(index + 1);
            setStep("review");
        } else {
            setStep("done");
        }
    };

    /** The AI read the file and the parties are settled: pick the unit and the status before creating. */
    const settle = async (result: LeaseImportResult) => {
        const fresh = (await refreshDropdowns()) ?? lists;
        if (fresh) setRefreshed(fresh);
        const property = fresh?.properties.find(p => p.id === result.propertyId);
        const tenant = fresh?.tenants.find(t => t.id === result.primaryTenantId);
        const units = property?.units ?? [];
        const guess = units.length > 0 ? guessUnit(units, [result.data.property?.name, result.data.property?.address_complement]) : null;
        const endsBeforeToday = Boolean(result.data.lease.end_date && result.data.lease.end_date < todayBRT());
        setPending(result);
        setUnitId(guess?.id ?? "");
        setStatus(asHistory || endsBeforeToday ? "EXPIRED" : "ACTIVE");
        setReference(referenceNameFor(property?.name, guess?.name, tenant?.full_name, result.data.lease.start_date));
        setStep("settle");
    };

    const create = async () => {
        if (!pending || !current) return;
        const property = lists?.properties.find(p => p.id === pending.propertyId);
        const units = property?.units ?? [];
        if (units.length > 0 && !unitId) {
            setCreateError(["Escolha a unidade deste contrato (ou o imóvel inteiro)."]);
            return;
        }
        setCreating(true);
        setCreateError([]);
        const unit = units.find(u => u.id === unitId) ?? null;
        const tenant = lists?.tenants.find(t => t.id === pending.primaryTenantId);
        const outcome: ImportedLeaseOutcome = await createLeaseFromImport(pending, {
            unitId: unit?.id ?? null,
            referenceName: reference.trim() || referenceNameFor(property?.name, unit?.name, tenant?.full_name, pending.data.lease.start_date),
            status,
        });
        setCreating(false);
        if (!outcome.ok) {
            setCreateError(outcome.errors ?? ["Não foi possível criar o contrato."]);
            return;
        }
        advance({ file: current, result: outcome.alreadyExisted ? "existed" : "created", leaseId: outcome.leaseId, fileSkipped: outcome.fileSkipped });
    };

    const skip = () => { if (current) advance({ file: current, result: "skipped" }); };

    // ── The AI step is the same modal as "Novo Contrato" ─────────
    if (step === "review" && current && lists) {
        return (
            <LeaseImportModal
                key={`${index}-${current.name}`}
                properties={lists.properties}
                agencies={lists.agencies}
                initialFile={current}
                createsLease
                fixedAgency={fixedAgency}
                fixedProperty={fixedProperty}
                onClose={skip}
                onComplete={result => { void settle(result); }}
            />
        );
    }

    const property = pending ? lists?.properties.find(p => p.id === pending.propertyId) : undefined;
    const units = property?.units ?? [];
    const tenant = pending ? lists?.tenants.find(t => t.id === pending.primaryTenantId) : undefined;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !creating && onClose(createdIds)} />
            <div className="relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
                {!creating && (
                    <button type="button" onClick={() => onClose(createdIds)} className="absolute right-4 top-4 z-10 rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Fechar">
                        <X className="h-5 w-5" />
                    </button>
                )}

                <div className="flex items-start gap-3.5 p-6 pb-4 sm:p-7 sm:pb-4">
                    <div className="shrink-0 rounded-xl bg-amber-100 p-2.5 text-amber-600 dark:bg-amber-900/40">
                        {step === "done" ? <CheckCircle2 className="h-6 w-6" /> : <Archive className="h-6 w-6" />}
                    </div>
                    <div className="space-y-1 pr-6">
                        <h2 className="text-xl font-bold tracking-tight text-foreground">
                            {step === "pick" ? (mode === "current" ? "Importar contratos de locação" : "Importar contratos antigos") : step === "settle" ? `Contrato ${index + 1} de ${files.length}` : "Importação concluída"}
                        </h2>
                        <p className="text-xs leading-relaxed text-muted-foreground sm:text-sm">
                            {step === "pick"
                                ? (mode === "current"
                                    ? <>Envie os contratos de locação{fixedProperty ? <> de <strong className="text-foreground">{fixedProperty.label}</strong></> : fixedAgency ? <> da <strong className="text-foreground">{fixedAgency.label}</strong></> : null}. A IA lê cada um, você confirma imóvel, inquilinos e corretor, e o contrato é criado com o arquivo guardado — o que já estiver cadastrado não é criado de novo.</>
                                    : <>Envie os PDFs de contratos que já rodaram (o inquilino anterior, o contrato antes da renovação). A IA lê cada um, você confirma as partes e o contrato entra no histórico com o arquivo guardado.</>)
                                : step === "settle"
                                    ? <>Confira a unidade e o status e crie o contrato. O arquivo <strong className="text-foreground">{current?.name}</strong> fica anexado a ele.</>
                                    : <>O que foi criado aparece em Contratos{mode === "current" ? " → Vigentes (ou Encerrados, quando já terminou)" : " → Encerrados (ou Vigentes, quando ainda em vigor)"}.</>}
                        </p>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto px-6 pb-4 sm:px-7">
                    {step === "pick" && (
                        <div className="space-y-4">
                            <div
                                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                                onDragLeave={e => { e.preventDefault(); setDragging(false); }}
                                onDrop={e => { e.preventDefault(); setDragging(false); addFiles(Array.from(e.dataTransfer.files ?? [])); }}
                                onClick={() => input.current?.click()}
                                className={cn("group flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center transition-all", dragging ? "border-amber-500 bg-amber-500/10" : "border-border hover:border-amber-500/60 hover:bg-muted/30")}
                            >
                                <input ref={input} type="file" multiple accept={LEASE_UPLOAD_ACCEPT} className="hidden" onChange={e => { const picked = Array.from(e.target.files ?? []); e.target.value = ""; addFiles(picked); }} />
                                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-200/60 bg-amber-50 text-amber-600 dark:border-amber-800/40 dark:bg-amber-950/40">
                                    <Upload className="h-6 w-6" />
                                </div>
                                <p className="mb-1 text-sm font-semibold text-foreground">Arraste os contratos aqui ou <span className="text-amber-600 underline underline-offset-2">clique para selecionar</span></p>
                                <p className="text-xs text-muted-foreground">Vários de uma vez · PDF, PNG, JPG ou WebP (máx. 10 MB cada)</p>
                            </div>

                            {fileErrors.length > 0 && (
                                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400">
                                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                    <div>{fileErrors.map(e => <p key={e}>{e}</p>)}</div>
                                </div>
                            )}

                            {files.length > 0 && (
                                <ul className="divide-y divide-border/60 rounded-xl border border-border">
                                    {files.map((f, i) => (
                                        <li key={`${f.name}-${f.size}`} className="flex items-center gap-2 px-3 py-2 text-sm">
                                            <FileText className="h-4 w-4 shrink-0 text-rose-600" />
                                            <span className="min-w-0 flex-1 break-words text-foreground">{f.name}</span>
                                            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
                                            <button type="button" onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))} className="rounded p-1 text-muted-foreground hover:text-rose-600" aria-label={`Remover ${f.name}`}>
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}

                            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-border p-3 text-sm">
                                <input type="checkbox" className="mt-0.5" checked={asHistory} onChange={e => setAsHistory(e.target.checked)} />
                                <span>
                                    <span className="font-medium text-foreground">Registrar como encerrados</span>
                                    <span className="block text-xs text-muted-foreground">São contratos que já terminaram: entram no histórico sem contar como vigentes, mesmo que a data de término lida esteja no futuro. Desmarque para decidir contrato a contrato.</span>
                                </span>
                            </label>
                        </div>
                    )}

                    {step === "settle" && pending && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl border border-border bg-muted/30 p-3 text-xs sm:grid-cols-4">
                                <div><p className="text-muted-foreground">Aluguel</p><p className="font-semibold text-foreground">{pending.data.lease.monthly_rent != null ? brl(pending.data.lease.monthly_rent) : "—"}</p></div>
                                <div><p className="text-muted-foreground">Início</p><p className="font-semibold text-foreground">{formatDateBR(pending.data.lease.start_date)}</p></div>
                                <div><p className="text-muted-foreground">Término</p><p className="font-semibold text-foreground">{formatDateBR(pending.data.lease.end_date)}</p></div>
                                <div><p className="text-muted-foreground">Inquilino</p><p className="break-words font-semibold text-foreground">{tenant?.full_name ?? "—"}</p></div>
                            </div>

                            <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
                                <CheckCircle2 className="h-4 w-4 shrink-0" />
                                <span>Imóvel: <strong>{property?.name ?? "não definido"}</strong></span>
                            </div>

                            {units.length > 0 && (
                                <div>
                                    <Label className="text-xs">Unidade deste contrato *</Label>
                                    <select className="flex h-9 w-full rounded-md border bg-background px-2 py-1 text-sm" value={unitId} onChange={e => {
                                        setUnitId(e.target.value);
                                        const u = units.find(x => x.id === e.target.value);
                                        setReference(referenceNameFor(property?.name, u?.name, tenant?.full_name, pending.data.lease.start_date));
                                    }}>
                                        <option value="">Selecione a unidade…</option>
                                        {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                                        <option value="__whole__">Imóvel inteiro (todas as unidades)</option>
                                    </select>
                                    {unitId && units.some(u => u.id === unitId) && guessUnit(units, [pending.data.property?.name, pending.data.property?.address_complement])?.id === unitId && (
                                        <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><Sparkles className="h-3 w-3 text-amber-500" /> Sugerida pelo que a IA leu no contrato — confira.</p>
                                    )}
                                </div>
                            )}

                            <div className="grid gap-3 sm:grid-cols-2">
                                <div>
                                    <Label className="text-xs">Status</Label>
                                    <select className="flex h-9 w-full rounded-md border bg-background px-2 py-1 text-sm" value={status} onChange={e => setStatus(e.target.value as LeaseStatus)}>
                                        <option value="EXPIRED">Encerrado (histórico)</option>
                                        <option value="ACTIVE">Ativo (ainda em vigor)</option>
                                    </select>
                                </div>
                                <div>
                                    <Label className="text-xs">Referência</Label>
                                    <Input className="h-9" value={reference} onChange={e => setReference(e.target.value)} />
                                </div>
                            </div>

                            {createError.length > 0 && (
                                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400">
                                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                    <div>{createError.map(e => <p key={e}>{e}</p>)}</div>
                                </div>
                            )}
                        </div>
                    )}

                    {step === "done" && (
                        <ul className="divide-y divide-border/60 rounded-xl border border-border">
                            {outcomes.map((o, i) => (
                                <li key={`${o.file.name}-${i}`} className="flex items-center gap-2 px-3 py-2 text-sm">
                                    {o.result === "failed" ? <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" /> : o.result === "skipped" ? <SkipForward className="h-4 w-4 shrink-0 text-muted-foreground" /> : <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />}
                                    <span className="min-w-0 flex-1">
                                        <span className="block break-words text-foreground">{o.file.name}</span>
                                        <span className="block text-xs text-muted-foreground">
                                            {o.result === "created" ? `Contrato criado${o.fileSkipped ? " · o arquivo não pôde ser anexado" : " com o arquivo anexado"}`
                                                : o.result === "existed" ? "Já estava cadastrado (mesma unidade, inquilino e início)"
                                                : o.result === "skipped" ? "Pulado" : (o.errors ?? []).join(" ")}
                                        </span>
                                    </span>
                                    {o.leaseId && (
                                        <button type="button" onClick={() => { onClose(createdIds); onOpenLease(o.leaseId as string); }} className="shrink-0 text-xs font-medium text-emerald-700 underline underline-offset-2 dark:text-emerald-400">Abrir</button>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <div className="flex flex-col gap-3 border-t border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:px-7">
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        {step === "pick" && (files.length > 0 ? `${files.length} ${files.length === 1 ? "arquivo" : "arquivos"} · lidos um a um, você confirma cada contrato.` : "Nenhum arquivo selecionado.")}
                        {step === "settle" && `${outcomes.length} de ${files.length} já processados.`}
                        {step === "done" && `${createdIds.length} ${createdIds.length === 1 ? "contrato criado" : "contratos criados"}.`}
                    </p>
                    <div className="flex shrink-0 justify-end gap-2">
                        {step === "pick" && (
                            <>
                                <Button type="button" variant="outline" onClick={() => onClose(createdIds)}>Cancelar</Button>
                                <Button type="button" onClick={() => { setIndex(0); setStep("review"); }} disabled={files.length === 0 || !lists}>
                                    {!lists ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                                    Ler com IA
                                </Button>
                            </>
                        )}
                        {step === "settle" && (
                            <>
                                <Button type="button" variant="outline" onClick={skip} disabled={creating}><SkipForward className="mr-1 h-4 w-4" /> Pular</Button>
                                <Button type="button" onClick={() => void create()} disabled={creating}>
                                    {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                                    Criar contrato
                                </Button>
                            </>
                        )}
                        {step === "done" && <Button type="button" onClick={() => onClose(createdIds)}>Concluir</Button>}
                    </div>
                </div>
            </div>
        </div>
    );
}
