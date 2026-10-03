"use client";

/**
 * "Histórico de reajustes" on the contract's dashboard: what the contract started at, what each
 * adjustment changed and where it came from — an addendum ("aditivo", the truth when there is one) or
 * Kitnets' calculation by the contract's index — then what is waiting for its index and the next one.
 */
import React, { useState } from "react";
import { FilePlus2, FileText, Loader2, Trash2 } from "lucide-react";
import { Button } from "@kitnets/ui";
import { cn } from "@/lib/utils";
import { Money } from "@/components/privacy";
import { formatDateBR } from "@/lib/dates";
import { brl } from "@/lib/lease-dashboard";
import { LEASE_INDEX_LABELS, type LeaseSummary } from "@/lib/lease-summary";
import { rentChangePct, type StoredAdjustment } from "@/lib/lease-adjustments";
import type { LeaseAdjustmentsView } from "@/lib/lease-views";
import type { LeaseDocument } from "@/types/lease";

interface Props {
    leaseId: string;
    startDate: string;
    adjustments: LeaseAdjustmentsView;
    /** the current cycle, for the line of the next adjustment */
    summary: LeaseSummary;
    indexLabel: string;
    inForce: boolean;
    documents: LeaseDocument[];
    onView: (url: string, name: string) => void;
    onAddendum: () => void;
    /** an addendum was removed: the dashboard reloads */
    onChanged: () => void;
}

const pctText = (v: number) => `${v > 0 ? "+" : ""}${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

const SOURCE_PILL: Record<StoredAdjustment["source"], string> = {
    ADDENDUM: "bg-violet-100 text-violet-800 dark:bg-violet-950/50 dark:text-violet-300",
    CALCULATED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
};
const pill = "inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider";
const cell = "px-3 py-2 align-top";

export default function LeaseAdjustmentHistory({ leaseId, startDate, adjustments, summary, indexLabel, inForce, documents, onView, onAddendum, onChanged }: Props) {
    const [removing, setRemoving] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const { rows, initial, waiting } = adjustments;
    const hasCondo = initial.condo !== null || rows.some(r => r.new_condo !== null);
    const latest = rows[rows.length - 1] ?? null;
    const previewKnown = summary.accumulatedPct !== null && summary.monthsCounted > 0 && summary.adjustedRent !== null;

    const remove = async (row: StoredAdjustment) => {
        if (!window.confirm(`Remover o aditivo de ${formatDateBR(row.effective_date)}? O aluguel volta ao valor anterior e, sem aditivo, vale o cálculo do Kitnets.`)) return;
        setRemoving(row.id); setError(null);
        try {
            const res = await fetch(`/api/leases/${leaseId}/reajustes?id=${row.id}`, { method: "DELETE" });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) { setError(json.error || "Não foi possível remover o aditivo."); return; }
            onChanged();
        } catch {
            setError("Não foi possível remover o aditivo.");
        } finally {
            setRemoving(null);
        }
    };

    return (
        <section className="overflow-hidden rounded-xl border border-border/80 bg-card">
            <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 px-4 py-3">
                <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-foreground">Histórico de reajustes</h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                        O que cada reajuste mudou, um a partir do outro. Com aditivo, vale o que ele diz; sem aditivo, vale o cálculo do Kitnets pelo índice do contrato.
                    </p>
                </div>
                {adjustments.available && (
                    <Button variant="outline" size="sm" onClick={onAddendum}>
                        <FilePlus2 className="mr-1 h-4 w-4" /> Registrar aditivo
                    </Button>
                )}
            </header>

            {!adjustments.available ? (
                <p className="px-4 py-3 text-xs text-muted-foreground">O histórico de reajustes não pôde ser lido agora. Recarregue a página em instantes.</p>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                        <thead className="border-b border-border/60 bg-muted/30 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            <tr>
                                <th className="px-3 py-2">Data</th>
                                <th className="px-3 py-2">Origem</th>
                                <th className="px-3 py-2 text-right">Índice do ciclo</th>
                                <th className="px-3 py-2 text-right">Aluguel</th>
                                <th className="px-3 py-2 text-right">Variação</th>
                                {hasCondo && <th className="px-3 py-2 text-right">Condomínio</th>}
                                <th className="px-3 py-2">Documento</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr className="border-b border-border/50">
                                <td className={cn(cell, "whitespace-nowrap font-medium text-foreground")}>{formatDateBR(startDate)}</td>
                                <td className={cell}><span className={cn(pill, "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300")}>Início do contrato</span></td>
                                <td className={cn(cell, "text-right text-muted-foreground")}>—</td>
                                <td className={cn(cell, "whitespace-nowrap text-right tabular-nums text-foreground")}><Money>{brl(initial.rent)}</Money></td>
                                <td className={cn(cell, "text-right text-muted-foreground")}>—</td>
                                {hasCondo && <td className={cn(cell, "whitespace-nowrap text-right tabular-nums text-foreground")}>{initial.condo !== null ? <Money>{brl(initial.condo)}</Money> : "—"}</td>}
                                <td className={cell} />
                            </tr>

                            {rows.map(row => {
                                const change = rentChangePct(row);
                                const doc = row.document_id ? documents.find(d => d.id === row.document_id) ?? null : null;
                                const indexName = row.index_code ? LEASE_INDEX_LABELS[row.index_code] ?? row.index_code : null;
                                return (
                                    <tr key={row.id} className="border-b border-border/50">
                                        <td className={cn(cell, "whitespace-nowrap font-medium text-foreground")}>{formatDateBR(row.effective_date)}</td>
                                        <td className={cell}>
                                            <span className={cn(pill, SOURCE_PILL[row.source])}>{row.source === "ADDENDUM" ? (row.document_id ? "Aditivo" : "Acordo sem aditivo") : "Calculado pelo Kitnets"}</span>
                                            {row.notes && <span className="mt-1 block max-w-[280px] text-[11px] leading-snug text-muted-foreground">{row.notes}</span>}
                                        </td>
                                        <td className={cn(cell, "whitespace-nowrap text-right tabular-nums text-muted-foreground")}>
                                            {indexName || row.index_pct !== null ? <>{indexName}{indexName && row.index_pct !== null ? " " : ""}{row.index_pct !== null ? pctText(row.index_pct) : ""}</> : "—"}
                                        </td>
                                        <td className={cn(cell, "whitespace-nowrap text-right tabular-nums")}>
                                            <span className="text-muted-foreground"><Money>{brl(row.previous_rent)}</Money> → </span>
                                            <span className="font-semibold text-foreground"><Money>{brl(row.new_rent)}</Money></span>
                                        </td>
                                        <td className={cn(cell, "whitespace-nowrap text-right tabular-nums font-medium", change === null || change === 0 ? "text-muted-foreground" : change < 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400")}>
                                            {change === null ? "—" : change === 0 ? "sem alteração" : pctText(change)}
                                        </td>
                                        {hasCondo && (
                                            <td className={cn(cell, "whitespace-nowrap text-right tabular-nums")}>
                                                {row.new_condo !== null
                                                    ? <><span className="text-muted-foreground">{row.previous_condo !== null ? <><Money>{brl(row.previous_condo)}</Money> → </> : null}</span><span className="font-semibold text-foreground"><Money>{brl(row.new_condo)}</Money></span></>
                                                    : <span className="text-muted-foreground">sem alteração</span>}
                                            </td>
                                        )}
                                        <td className={cell}>
                                            <span className="flex items-center gap-1.5">
                                                {doc && (
                                                    <button type="button" onClick={() => onView(doc.file_url, doc.file_name)} className="inline-flex items-center gap-1 rounded-md border border-input bg-background px-2 py-1 text-[11px] font-medium hover:bg-muted" title={doc.file_name}>
                                                        <FileText className="h-3.5 w-3.5" /> Ver aditivo
                                                    </button>
                                                )}
                                                {row.source === "ADDENDUM" && row.id === latest?.id && (
                                                    <button type="button" onClick={() => void remove(row)} disabled={removing !== null} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-rose-600" title="Remover o aditivo" aria-label={`Remover o aditivo de ${formatDateBR(row.effective_date)}`}>
                                                        {removing === row.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                                    </button>
                                                )}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}

                            {waiting && (
                                <tr className="border-b border-border/50 bg-amber-50/60 dark:bg-amber-950/20">
                                    <td className={cn(cell, "whitespace-nowrap font-medium text-foreground")}>{formatDateBR(waiting.date)}</td>
                                    <td className={cell}><span className={cn(pill, "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300")}>Aguardando</span></td>
                                    <td className={cn(cell, "text-amber-900 dark:text-amber-200")} colSpan={hasCondo ? 5 : 4}>
                                        {waiting.reason === "NO_SERIES"
                                            ? "O índice deste contrato não tem série no Kitnets: registre o aditivo (ou o valor acordado) para este reajuste."
                                            : `O ${indexLabel} do ciclo ainda não foi todo divulgado: o reajuste entra sozinho quando sair. Se houve aditivo, registre-o.`}
                                    </td>
                                </tr>
                            )}

                            {inForce && summary.nextAdjustmentDate && (
                                <tr className="text-muted-foreground">
                                    <td className={cn(cell, "whitespace-nowrap font-medium")}>{formatDateBR(summary.nextAdjustmentDate)}</td>
                                    <td className={cell}><span className={cn(pill, "border border-border bg-background")}>Próximo reajuste</span></td>
                                    <td className={cn(cell, "whitespace-nowrap text-right tabular-nums")}>{previewKnown ? <>{indexLabel} {pctText(summary.accumulatedPct as number)} até agora</> : "—"}</td>
                                    <td className={cn(cell, "whitespace-nowrap text-right tabular-nums")}>{previewKnown ? <>prévia <Money>{brl(summary.adjustedRent as number)}</Money></> : "—"}</td>
                                    <td className={cell} colSpan={hasCondo ? 3 : 2} />
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}
            {error && <p className="border-t border-border/60 px-4 py-2 text-xs text-rose-600">{error}</p>}
        </section>
    );
}
