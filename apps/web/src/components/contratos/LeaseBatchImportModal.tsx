"use client";

/**
 * "Importar contratos antigos": the PDFs of contracts that already ran (the previous tenant, the
 * contract before the renewal) go in as a batch. Each file goes through the same AI reading and
 * party matching as a new contract (LeaseImportModal), which here also settles the unit of a
 * multi-unit property and the Vigente | Encerrado toggle; its "Criar contrato" creates the lease with
 * the PDF attached. Nothing is created without a click per contract; a file can be skipped ("Pular
 * arquivo"), and closing the review stops the whole import. A contract registered as closed takes the
 * day it ended, and its closing term (termo de encerramento) can be one of the batch's files: read by
 * the AI for that day, attached to the contract and not read again as a contract of its own.
 */
import React, { useMemo, useRef, useState } from "react";
import { AlertTriangle, Archive, CheckCircle2, FileText, Loader2, SkipForward, Sparkles, Trash2, Upload, X } from "lucide-react";
import { Button } from "@kitnets/ui";
import { cn } from "@/lib/utils";
import { checkLeaseFile, LEASE_UPLOAD_ACCEPT } from "@/lib/lease-upload-client";
import { closeImportedLease, createLeaseFromImport, type ImportedLeaseOutcome } from "@/lib/lease-import-client";
import { referenceNameFor } from "@/lib/lease-dashboard";
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

type Step = "pick" | "review" | "done";

const formatBR = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

interface Outcome {
    file: File;
    /** attached: the closing term of a contract created in this batch */
    result: "created" | "existed" | "skipped" | "failed" | "attached";
    leaseId?: string;
    fileSkipped?: boolean;
    /** the day the contract ended, when it was registered as closed */
    closedOn?: string;
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
    const input = useRef<HTMLInputElement>(null);

    /** files taken as another contract's closing term: attached there, never read as a contract */
    const [consumed, setConsumed] = useState<Set<number>>(new Set());
    const current = files[index] ?? null;
    /** where a closing term may come from: the batch's other files, but those already made into a contract */
    const otherFiles = useMemo(
        () => files.filter((f, i) => i !== index && !consumed.has(i) && !outcomes.some(o => o.file === f && o.result !== "skipped")),
        [files, index, consumed, outcomes]
    );
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

    const advance = (outcome: Outcome, alsoConsumed: number[] = [], extras: Outcome[] = []) => {
        const taken = new Set([...consumed, ...alsoConsumed]);
        setConsumed(taken);
        setOutcomes(prev => [...prev, outcome, ...extras]);
        // the next file still to read: a closing term attached to a contract is not a contract
        let next = index + 1;
        while (next < files.length && taken.has(next)) next++;
        if (next < files.length) {
            setIndex(next);
            setStep("review");
        } else {
            setStep("done");
        }
    };

    /**
     * "Criar contrato" on the review: the parties, the unit and the status are settled there. Returns the
     * messages to show when the lease could not be created (the review then stays open), else moves on.
     */
    const create = async (result: LeaseImportResult): Promise<string[] | void> => {
        if (!current) return;
        // the import may have just created the property and the tenant: their names come from fresh lists
        const fresh = (await refreshDropdowns()) ?? lists;
        if (fresh) setRefreshed(fresh);
        const property = fresh?.properties.find(p => p.id === result.propertyId);
        const unit = property?.units?.find(u => u.id === result.unitId) ?? null;
        const tenant = fresh?.tenants.find(t => t.id === result.primaryTenantId);
        const outcome: ImportedLeaseOutcome = await createLeaseFromImport(result, {
            unitId: unit?.id ?? null,
            referenceName: referenceNameFor(property?.name, unit?.name, tenant?.full_name, result.data.lease.start_date),
            status: result.status ?? (asHistory ? "EXPIRED" : "ACTIVE"),
        });
        if (!outcome.ok) return outcome.errors ?? ["Não foi possível criar o contrato."];

        // a closed contract: the day it ended, and its closing term attached
        const termIndex = result.closing?.file ? files.indexOf(result.closing.file) : -1;
        const extra: Outcome[] = [];
        let closedOn: string | undefined;
        let closeErrors: string[] = [];
        if (result.closing && outcome.leaseId) {
            const closed = await closeImportedLease(outcome.leaseId, { date: result.closing.date, endDate: result.data.lease.end_date, file: result.closing.file, storagePath: result.closing.storagePath });
            closedOn = result.closing.date;
            closeErrors = closed.errors;
            if (result.closing.file) extra.push({ file: result.closing.file, result: closed.termSkipped ? "failed" : "attached", leaseId: outcome.leaseId, errors: closed.termSkipped ? ["O termo de encerramento não pôde ser anexado ao contrato."] : undefined });
        }
        advance(
            { file: current, result: outcome.alreadyExisted ? "existed" : "created", leaseId: outcome.leaseId, fileSkipped: outcome.fileSkipped, closedOn, errors: closeErrors.length > 0 ? closeErrors : undefined },
            termIndex >= 0 ? [termIndex] : [],
            extra
        );
    };

    const skip = () => { if (current) advance({ file: current, result: "skipped" }); };
    /** closing the review (X, Esc) stops the import: what was done so far, or nothing to show */
    const stop = () => { if (outcomes.length > 0) setStep("done"); else onClose(createdIds); };

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
                settleLease={{ defaultStatus: asHistory ? "EXPIRED" : "ACTIVE" }}
                otherFiles={otherFiles}
                progress={`Arquivo ${index + 1} de ${files.length} · ${current.name}`}
                onSkip={skip}
                onClose={stop}
                onComplete={create}
            />
        );
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => onClose(createdIds)} />
            <div className="relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
                <button type="button" onClick={() => onClose(createdIds)} className="absolute right-4 top-4 z-10 rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Fechar">
                    <X className="h-5 w-5" />
                </button>

                <div className="flex items-start gap-3.5 p-6 pb-4 sm:p-7 sm:pb-4">
                    <div className="shrink-0 rounded-xl bg-amber-100 p-2.5 text-amber-600 dark:bg-amber-900/40">
                        {step === "done" ? <CheckCircle2 className="h-6 w-6" /> : <Archive className="h-6 w-6" />}
                    </div>
                    <div className="space-y-1 pr-6">
                        <h2 className="text-xl font-bold tracking-tight text-foreground">
                            {step === "pick" ? (mode === "current" ? "Importar contratos de locação" : "Importar contratos antigos") : "Importação concluída"}
                        </h2>
                        <p className="text-xs leading-relaxed text-muted-foreground sm:text-sm">
                            {step === "pick"
                                ? (mode === "current"
                                    ? <>Envie os contratos de locação{fixedProperty ? <> de <strong className="text-foreground">{fixedProperty.label}</strong></> : fixedAgency ? <> da <strong className="text-foreground">{fixedAgency.label}</strong></> : null}. A IA lê cada um, você confirma imóvel, inquilinos e corretor, e o contrato é criado com o arquivo guardado — o que já estiver cadastrado não é criado de novo.</>
                                    : <>Envie os PDFs de contratos que já rodaram (o inquilino anterior, o contrato antes da renovação). A IA lê cada um, você confirma as partes e o contrato entra no histórico com o arquivo guardado.</>)
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
                                    <span className="block text-xs text-muted-foreground">São contratos que já terminaram: entram no histórico sem contar como vigentes, mesmo que a data de término lida esteja no futuro. Vale como padrão — na revisão de cada contrato dá para trocar entre vigente e encerrado.</span>
                                </span>
                            </label>
                        </div>
                    )}

                    {step === "done" && (
                        <ul className="divide-y divide-border/60 rounded-xl border border-border">
                            {outcomes.map((o, i) => (
                                <li key={`${o.file.name}-${i}`} className="flex items-center gap-2 px-3 py-2 text-sm">
                                    {o.result === "failed" || (o.errors && o.errors.length > 0) ? <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" /> : o.result === "skipped" ? <SkipForward className="h-4 w-4 shrink-0 text-muted-foreground" /> : <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />}
                                    <span className="min-w-0 flex-1">
                                        <span className="block break-words text-foreground">{o.file.name}</span>
                                        <span className="block text-xs text-muted-foreground">
                                            {o.result === "created" ? `Contrato criado${o.fileSkipped ? " · o arquivo não pôde ser anexado" : " com o arquivo anexado"}${o.closedOn ? ` · encerrado em ${formatBR(o.closedOn)}` : ""}`
                                                : o.result === "existed" ? `Já estava cadastrado (mesma unidade, inquilino e início)${o.closedOn ? ` · encerramento em ${formatBR(o.closedOn)}` : ""}`
                                                : o.result === "attached" ? "Anexado ao contrato como termo de encerramento"
                                                : o.result === "skipped" ? "Pulado" : ""}
                                            {o.errors && o.errors.length > 0 && <span className="block text-rose-600">{o.errors.join(" ")}</span>}
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
                        {step === "done" && <Button type="button" onClick={() => onClose(createdIds)}>Concluir</Button>}
                    </div>
                </div>
            </div>
        </div>
    );
}
