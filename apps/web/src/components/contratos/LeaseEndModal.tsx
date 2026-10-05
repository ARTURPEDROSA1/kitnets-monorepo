"use client";

/**
 * How a contract ends, from its row or its dashboard. Two ways:
 *
 * - **Aviso de desocupação** — the tenant told the owner (an e-mail, a letter) that they will leave: the day
 *   they gave notice, how many days of notice (30 by default) and the planned move-out day. The contract
 *   stays in force until then and closes as rescinded the day after (lib/lease-notice-server.ts). The
 *   notice itself can be attached. Sent again, it changes the notice.
 * - **Rescisão** — it ends today or ended already (the keys came back): closed now, the closing term
 *   (termo de encerramento) can be attached.
 *
 * Both go through POST /api/leases/[id]/terminate, which tells them apart by the date.
 */
import React, { useEffect, useState } from "react";
import { AlertTriangle, Ban, DoorOpen, FileText, Loader2, X } from "lucide-react";
import { Button } from "@kitnets/ui";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DateInput } from "@/components/ui/DateInput";
import { cn } from "@/lib/utils";
import { daysBetween } from "@/lib/lease-summary";
import { titleOf } from "@/lib/lease-dashboard";
import { attachLeaseDocument, checkLeaseFile, LEASE_UPLOAD_ACCEPT } from "@/lib/lease-upload-client";
import type { LeaseWithDetails } from "@/types/lease";

interface Props {
    lease: LeaseWithDetails;
    today: string;
    onClose: () => void;
    /** done: what the API said ("o contrato segue vigente até …") */
    onDone: (message: string | null) => void;
}

type Mode = "notice" | "now";

const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const br = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
/** whole months from the start to a day */
const monthsBetween = (from: string, to: string) => {
    const [fy, fm, fd] = from.slice(0, 10).split("-").map(Number);
    const [ty, tm, td] = to.slice(0, 10).split("-").map(Number);
    return (ty - fy) * 12 + (tm - fm) - (td < fd ? 1 : 0);
};

export default function LeaseEndModal({ lease, today, onClose, onDone }: Props) {
    // a notice already given opens on itself, to be changed
    const existing = lease.termination_date && lease.status !== "TERMINATED" ? lease.termination_date.slice(0, 10) : null;
    const [mode, setMode] = useState<Mode>("notice");
    const [noticeDate, setNoticeDate] = useState(lease.notice_date?.slice(0, 10) ?? today);
    const [days, setDays] = useState(() => (existing && lease.notice_date ? String(Math.max(0, daysBetween(lease.notice_date.slice(0, 10), existing))) : "30"));
    const [moveOut, setMoveOut] = useState(existing ?? addDays(lease.notice_date?.slice(0, 10) ?? today, 30));
    const [moveOutTyped, setMoveOutTyped] = useState(!!existing);
    const [endDate, setEndDate] = useState(today);
    const [reason, setReason] = useState(lease.termination_reason ?? "");
    const [file, setFile] = useState<File | null>(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !saving) onClose(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [saving, onClose]);

    // the move-out follows the notice and its days until the user types it
    const changeNotice = (date: string, d: string) => {
        setNoticeDate(date);
        setDays(d);
        const n = parseInt(d, 10);
        if (!moveOutTyped && date && n >= 0) setMoveOut(addDays(date, n));
    };

    const start = lease.start_date.slice(0, 10);
    const date = mode === "notice" ? moveOut : endDate;
    const left = date ? daysBetween(today, date) : null;
    const monthsIn = date ? monthsBetween(start, date) : null;

    const save = async () => {
        setError(null);
        if (!date) { setError(mode === "notice" ? "Informe a data prevista da desocupação." : "Informe a data da rescisão."); return; }
        if (date <= start) { setError("A data deve ser posterior ao início do contrato."); return; }
        if (mode === "notice" && !noticeDate) { setError("Informe a data do aviso."); return; }
        if (mode === "notice" && noticeDate > date) { setError("O aviso vem antes da desocupação."); return; }
        if (mode === "now" && date > today) { setError("Para uma data futura, registre o aviso de desocupação."); return; }
        if (file) {
            const problem = checkLeaseFile(file);
            if (problem) { setError(problem); return; }
        }
        setSaving(true);
        try {
            const res = await fetch(`/api/leases/${lease.id}/terminate`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    termination_date: date,
                    termination_reason: reason.trim() || (mode === "notice" ? "Aviso de desocupação" : null),
                    ...(mode === "notice" && noticeDate ? { notice_date: noticeDate } : {}),
                }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                setError(typeof json.error === "string" ? json.error : (Object.values(json.errors ?? {})[0] as string | undefined) ?? "Não foi possível salvar.");
                return;
            }
            let message = typeof json.message === "string" ? json.message : null;
            if (file) {
                const attached = await attachLeaseDocument(lease.id, file, mode === "notice" ? "NOTICE" : "TERMINATION");
                if (!("document" in attached)) message = `${message ?? "Salvo."} O arquivo não pôde ser anexado: ${attached.error}`;
            }
            onDone(message);
        } catch {
            setError("Erro de conexão. Tente novamente.");
        } finally {
            setSaving(false);
        }
    };

    const name = titleOf(lease);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !saving && onClose()} />
            <div className="relative flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
                <button type="button" onClick={onClose} disabled={saving} className="absolute right-4 top-4 rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Fechar">
                    <X className="h-5 w-5" />
                </button>
                <div className="space-y-1 p-6 pb-4 pr-12">
                    <h3 className="inline-flex items-center gap-2 text-lg font-semibold text-foreground"><DoorOpen className="h-5 w-5 text-orange-600" /> Encerrar contrato</h3>
                    <p className="text-sm text-muted-foreground">{name}</p>
                </div>

                <div className="flex-1 space-y-4 overflow-y-auto px-6 pb-4">
                    {/* which way it ends */}
                    <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Como o contrato termina">
                        {([
                            { value: "notice", title: "Aviso de desocupação", hint: "O inquilino avisou que vai sair numa data", icon: <DoorOpen className="h-4 w-4" /> },
                            { value: "now", title: "Rescisão", hint: "Termina hoje ou já terminou", icon: <Ban className="h-4 w-4" /> },
                        ] as { value: Mode; title: string; hint: string; icon: React.ReactNode }[]).map(o => {
                            const on = mode === o.value;
                            return (
                                <button
                                    key={o.value}
                                    type="button"
                                    role="radio"
                                    aria-checked={on}
                                    onClick={() => { setMode(o.value); setError(null); }}
                                    className={cn("flex items-start gap-2.5 rounded-xl border p-3 text-left transition-colors",
                                        on ? (o.value === "notice" ? "border-orange-500 bg-orange-500/10" : "border-rose-500 bg-rose-500/10") : "border-border hover:bg-muted/50")}
                                >
                                    <span className={cn("mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg", on ? (o.value === "notice" ? "bg-orange-500 text-white" : "bg-rose-500 text-white") : "bg-muted text-muted-foreground")}>{o.icon}</span>
                                    <span>
                                        <span className="block text-sm font-semibold text-foreground">{o.title}</span>
                                        <span className="block text-xs text-muted-foreground">{o.hint}</span>
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    {mode === "notice" ? (
                        <div className="grid gap-3 sm:grid-cols-3">
                            <div>
                                <Label className="mb-1.5 block text-xs text-muted-foreground">Data do aviso *</Label>
                                <DateInput value={noticeDate} onChange={iso => changeNotice(iso, days)} className="h-10 rounded-lg text-sm" />
                            </div>
                            <div>
                                <Label className="mb-1.5 block text-xs text-muted-foreground">Prazo do aviso (dias)</Label>
                                <Input type="number" min={0} value={days} onChange={e => changeNotice(noticeDate, e.target.value)} className="h-10 rounded-lg text-sm" />
                            </div>
                            <div>
                                <Label className="mb-1.5 block text-xs text-muted-foreground">Desocupação prevista *</Label>
                                <DateInput value={moveOut} onChange={iso => { setMoveOut(iso); setMoveOutTyped(true); }} className="h-10 rounded-lg text-sm" />
                            </div>
                        </div>
                    ) : (
                        <div>
                            <Label className="mb-1.5 block text-xs text-muted-foreground">Data da rescisão (entrega das chaves) *</Label>
                            <DateInput value={endDate} onChange={setEndDate} className="h-10 rounded-lg text-sm" />
                        </div>
                    )}

                    {/* what happens */}
                    {date && left !== null && (
                        <div className={cn("rounded-xl px-3 py-2.5 text-sm", mode === "notice" && left > 0 ? "bg-orange-500/[0.08] text-foreground" : "bg-rose-500/[0.07] text-foreground")}>
                            {mode === "notice" && left > 0
                                ? <>O contrato segue <strong>vigente até {br(date)}</strong> ({plural(left, "dia", "dias")}): aparece em Vencendo e na Atenção, e no dia seguinte passa a rescindido. {noticeDate && <>Sem reajuste a partir de {br(noticeDate)}.</>}</>
                                : <>O contrato é <strong>encerrado agora</strong>, rescindido em {br(date)}.</>}
                            {monthsIn !== null && monthsIn < 12 && (
                                <span className="mt-1 flex items-start gap-1.5 text-xs text-amber-800 dark:text-amber-300">
                                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Antes de 12 meses de contrato: confira a multa por devolução antecipada prevista no contrato.
                                </span>
                            )}
                        </div>
                    )}

                    <div>
                        <Label className="mb-1.5 block text-xs text-muted-foreground">{mode === "notice" ? "Aviso do inquilino (e-mail ou carta)" : "Termo de encerramento"}</Label>
                        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground hover:bg-muted/40">
                            <FileText className="h-4 w-4 shrink-0" />
                            <span className="min-w-0 flex-1 truncate">{file ? file.name : "Anexar arquivo (opcional) — PDF ou imagem"}</span>
                            {file && <button type="button" onClick={e => { e.preventDefault(); setFile(null); }} className="text-xs hover:text-foreground">remover</button>}
                            <input type="file" accept={LEASE_UPLOAD_ACCEPT} className="hidden" onChange={e => { setFile(e.target.files?.[0] ?? null); e.target.value = ""; }} />
                        </label>
                    </div>

                    <div>
                        <Label className="mb-1.5 block text-xs text-muted-foreground">{mode === "notice" ? "Observação" : "Motivo"}</Label>
                        <textarea
                            className="flex min-h-[72px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/30"
                            value={reason}
                            onChange={e => setReason(e.target.value)}
                            placeholder={mode === "notice" ? "Ex: avisou por e-mail; vistoria marcada para o dia da entrega" : "Motivo (opcional)…"}
                        />
                    </div>

                    {error && <p className="flex items-start gap-1.5 text-sm text-rose-600"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}</p>}
                </div>

                <div className="flex justify-end gap-2 border-t border-border p-4">
                    <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
                    <Button onClick={() => void save()} disabled={saving} className={mode === "notice" ? "bg-orange-600 text-white hover:bg-orange-700" : "bg-rose-600 text-white hover:bg-rose-700"}>
                        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : mode === "notice" ? <DoorOpen className="mr-2 h-4 w-4" /> : <Ban className="mr-2 h-4 w-4" />}
                        {mode === "notice" ? (existing ? "Salvar aviso" : "Registrar aviso") : "Rescindir agora"}
                    </Button>
                </div>
            </div>
        </div>
    );
}
