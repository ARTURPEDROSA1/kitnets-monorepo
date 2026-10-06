"use client";

/**
 * /contratos/documento?id= — the lease's contract as a document: Kitnets writes it from the lease
 * (lib/contract/template.ts), the owner reads, fills the blanks, edits like in a word processor,
 * accepts it (the PDF is drawn here and stored) and gets it signed on gov.br — by the tenant through a
 * link, by the owner here. Draft changes save by themselves.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Editor } from "@tiptap/react";
import {
    AlertTriangle, ArrowLeft, CheckCircle2, Eye, FileDown, FileSignature, Info, Loader2, PenLine, RefreshCw, Settings2, TextCursorInput, XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { fieldsIn, fillField, type ContractDoc, type FieldInfo } from "@/lib/contract/doc";
import {
    buildContract, contractFileName, contractSigners, contractWarnings, defaultContractOptions, readContractOptions, readFieldValues,
    type ContractData, type ContractOptions,
} from "@/lib/contract/template";
import { STATUS_LABELS, type ContractDocumentView, type ContractScreenData } from "@/lib/contract/document";
import { termMonths } from "@/lib/lease-dashboard";
import ContractEditor from "./ContractEditor";
import ContractOptionsPanel from "./ContractOptionsPanel";
import ContractSigningPanel from "./ContractSigningPanel";
import { fillFieldInEditor, selectNextField } from "./editor-extensions";

/** The contract written from the options, with the blanks the owner already filled in. */
function compose(data: ContractData, options: ContractOptions, fields: Record<string, string>): ContractDoc {
    let doc = buildContract(data, options);
    for (const [key, value] of Object.entries(fields)) doc = fillField(doc, key, value);
    return doc;
}

const STATUS_TONES: Record<ContractDocumentView["status"], string> = {
    NONE: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
    DRAFT: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
    ACCEPTED: "bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300",
    SIGNED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
};

type SaveState = "idle" | "saving" | "saved" | "error";
type MobileView = "doc" | "panel";
type PanelTab = "campos" | "clausulas";

function FieldsPanel({ fields, editor, onFill }: { fields: FieldInfo[]; editor: Editor | null; onFill: (key: string, value: string) => void }) {
    const [values, setValues] = useState<Record<string, string>>({});
    if (!fields.length) {
        return <p className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-3 text-sm text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200"><CheckCircle2 className="h-4 w-4" /> Nenhum campo em branco.</p>;
    }
    const apply = (key: string) => {
        const v = (values[key] ?? "").trim();
        if (!v) return;
        onFill(key, v);
        setValues(s => ({ ...s, [key]: "" }));
    };
    const locate = (key: string) => {
        if (!editor) return;
        let target: { from: number; to: number } | null = null;
        editor.state.doc.descendants((node, pos) => {
            if (!target && node.isText && node.marks.some(m => m.type.name === "field" && m.attrs.key === key)) target = { from: pos, to: pos + node.nodeSize };
        });
        if (target) editor.chain().focus().setTextSelection(target).scrollIntoView().run();
    };
    return (
        <ul className="space-y-2.5">
            {fields.map(f => (
                <li key={f.key} className="space-y-1">
                    <button type="button" onClick={() => locate(f.key)} className="text-left text-xs font-medium text-foreground hover:text-sky-700 hover:underline dark:hover:text-sky-400">
                        {f.label}{f.count > 1 ? <span className="text-muted-foreground"> · {f.count}×</span> : null}
                    </button>
                    <div className="flex gap-1.5">
                        <input
                            value={values[f.key] ?? ""} onChange={e => setValues(s => ({ ...s, [f.key]: e.target.value }))}
                            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); apply(f.key); } }}
                            placeholder={f.text.replace(/^\[|\]$/g, "").toLowerCase()}
                            className="h-9 min-w-0 flex-1 rounded-lg border border-input bg-background px-2.5 text-sm text-foreground"
                        />
                        <button type="button" onClick={() => apply(f.key)} disabled={!(values[f.key] ?? "").trim()} className="h-9 shrink-0 rounded-lg bg-amber-500 px-3 text-xs font-semibold text-white hover:bg-amber-600 disabled:opacity-40">OK</button>
                    </div>
                </li>
            ))}
        </ul>
    );
}

export default function ContractDocumentScreen({ leaseId, lang, isNew = false }: { leaseId: string; lang: string; isNew?: boolean }) {
    const [screen, setScreen] = useState<ContractScreenData | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [initialDoc, setInitialDoc] = useState<ContractDoc | null>(null);
    const [options, setOptions] = useState<ContractOptions | null>(null);
    const [draftOptions, setDraftOptions] = useState<ContractOptions | null>(null);
    const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
    const [manualEdits, setManualEdits] = useState(false);
    const [fieldList, setFieldList] = useState<FieldInfo[]>([]);
    const [saveState, setSaveState] = useState<SaveState>("idle");
    const [busy, setBusy] = useState<null | "accept" | "preview" | "reopen">(null);
    const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
    const [mobileView, setMobileView] = useState<MobileView>("doc");
    const [tab, setTab] = useState<PanelTab>("campos");
    const editorRef = useRef<Editor | null>(null);
    const [editor, setEditor] = useState<Editor | null>(null);
    const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const latest = useRef({ options: null as ContractOptions | null, fieldValues: {} as Record<string, string>, manualEdits: false });
    latest.current = { options, fieldValues, manualEdits };

    const data = screen?.data ?? null;
    const document = screen?.document ?? null;
    const editable = document?.status === "DRAFT" || document?.status === "NONE";

    const refreshFields = useCallback(() => {
        const ed = editorRef.current;
        if (ed) setFieldList(fieldsIn(ed.getJSON() as ContractDoc));
    }, []);

    const saveNow = useCallback(async (content?: ContractDoc) => {
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = null;
        const ed = editorRef.current;
        const doc = content ?? (ed?.getJSON() as ContractDoc | undefined);
        const { options: opts, fieldValues: fields, manualEdits: edited } = latest.current;
        if (!doc || !opts) return;
        setSaveState("saving");
        try {
            const res = await fetch(`/api/leases/${leaseId}/contrato`, {
                method: "PUT", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content: doc, options: { ...opts, fields, manualEdits: edited } }),
            });
            setSaveState(res.ok ? "saved" : "error");
            if (res.ok) setScreen(s => (s && s.document.status === "NONE" ? { ...s, document: { ...s.document, status: "DRAFT" } } : s));
        } catch {
            setSaveState("error");
        }
    }, [leaseId]);

    const scheduleSave = useCallback(() => {
        if (saveTimer.current) clearTimeout(saveTimer.current);
        setSaveState("saving");
        saveTimer.current = setTimeout(() => void saveNow(), 1200);
    }, [saveNow]);

    // load: the stored document, or a new one written from the lease
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(`/api/leases/${leaseId}/contrato`);
                const json = await res.json().catch(() => ({}));
                if (cancelled) return;
                if (!res.ok) return setLoadError(json.error || "Não foi possível abrir o contrato.");
                const s = json as ContractScreenData;
                const stored = s.document.options ?? {};
                const opts = s.document.status === "NONE" ? defaultContractOptions(s.data) : readContractOptions(stored, s.data);
                const fields = readFieldValues((stored as Record<string, unknown>).fields);
                const doc = s.document.content ?? compose(s.data, opts, fields);
                setScreen(s);
                setOptions(opts);
                setDraftOptions(opts);
                setFieldValues(fields);
                setManualEdits(!!(stored as Record<string, unknown>).manualEdits);
                setInitialDoc(doc);
                setFieldList(fieldsIn(doc));
                if (s.document.status !== "DRAFT" && s.document.status !== "NONE") setTab("campos");
                if (s.document.status === "NONE" && s.support.ok) {
                    latest.current = { options: opts, fieldValues: fields, manualEdits: false };
                    void saveNow(doc);
                }
            } catch {
                if (!cancelled) setLoadError("Erro de conexão. Recarregue a página.");
            }
        })();
        return () => { cancelled = true; };
    }, [leaseId, saveNow]);

    // a pending change is saved before leaving
    useEffect(() => {
        const flush = () => { if (saveTimer.current) void saveNow(); };
        window.addEventListener("beforeunload", flush);
        return () => { window.removeEventListener("beforeunload", flush); flush(); };
    }, [saveNow]);

    const onReady = useCallback((ed: Editor | null) => {
        editorRef.current = ed;
        setEditor(ed);
    }, []);

    const onUserChange = useCallback(() => {
        setManualEdits(true);
        latest.current.manualEdits = true;
        refreshFields();
        scheduleSave();
    }, [refreshFields, scheduleSave]);

    const fill = (key: string, value: string) => {
        const ed = editorRef.current;
        if (!ed) return;
        fillFieldInEditor(ed, key, value);
        const next = { ...fieldValues, [key]: value };
        setFieldValues(next);
        latest.current.fieldValues = next;
        refreshFields();
        scheduleSave();
        if (fieldsIn(ed.getJSON() as ContractDoc).length) selectNextField(ed);
    };

    const optionsChanged = !!options && !!draftOptions && JSON.stringify(options) !== JSON.stringify(draftOptions);

    const rewrite = () => {
        const ed = editorRef.current;
        if (!ed || !data || !draftOptions) return;
        if (manualEdits && !window.confirm("Reescrever o texto a partir das opções? As mudanças que você fez à mão no texto serão perdidas (os campos preenchidos continuam).")) return;
        const doc = compose(data, draftOptions, fieldValues);
        ed.commands.setContent(doc, { emitUpdate: false });
        setOptions(draftOptions);
        setManualEdits(false);
        latest.current = { options: draftOptions, fieldValues, manualEdits: false };
        refreshFields();
        void saveNow(doc);
        setNotice({ tone: "ok", text: "Texto reescrito com as opções escolhidas." });
    };

    const owner = data?.owner.name ?? null;
    const pdfOf = async (content: ContractDoc): Promise<Blob> => {
        const { renderContractPdf } = await import("@/lib/contract/pdf");
        return renderContractPdf(content, { reference: data!.reference, author: owner });
    };

    const downloadBlob = (blob: Blob, name: string) => {
        const url = URL.createObjectURL(blob);
        const a = window.document.createElement("a");
        a.href = url;
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
    };

    const preview = async () => {
        const ed = editorRef.current;
        if (!ed || !data) return;
        // the tab opens on the click (popup blockers allow it), the PDF arrives a moment later
        const tabWindow = window.open("", "_blank");
        setBusy("preview");
        try {
            const blob = await pdfOf(ed.getJSON() as ContractDoc);
            const url = URL.createObjectURL(blob);
            if (tabWindow) tabWindow.location.href = url;
            else downloadBlob(blob, contractFileName(data.reference, "prévia"));
        } catch {
            tabWindow?.close();
            setNotice({ tone: "error", text: "Não foi possível gerar a prévia do PDF." });
        } finally {
            setBusy(null);
        }
    };

    const accept = async () => {
        const ed = editorRef.current;
        if (!ed || !data || !options) return;
        const content = ed.getJSON() as ContractDoc;
        const left = fieldsIn(content);
        const errors = contractWarnings(data, options).filter(w => w.level === "error");
        const lines = [
            "Aceitar o contrato e gerar o PDF para assinatura? O texto fica travado (dá para reabrir a edição antes das assinaturas).",
            left.length ? `\n• Ainda há ${left.length} campo${left.length === 1 ? "" : "s"} em branco (${left.slice(0, 3).map(f => f.label).join(", ")}${left.length > 3 ? "…" : ""}): saem destacados no PDF.` : "",
            errors.length ? `\n• ${errors.map(e => e.text).join("\n• ")}` : "",
        ];
        if (!window.confirm(lines.join(""))) return;
        if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
        setBusy("accept");
        setNotice(null);
        try {
            const blob = await pdfOf(content);
            const form = new FormData();
            form.append("file", new File([blob], contractFileName(data.reference, "para assinatura"), { type: "application/pdf" }));
            form.append("content", JSON.stringify(content));
            form.append("options", JSON.stringify({ ...options, fields: fieldValues, manualEdits }));
            const res = await fetch(`/api/leases/${leaseId}/contrato/aceitar`, { method: "POST", body: form });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) return setNotice({ tone: "error", text: json.error || "Não foi possível aceitar o contrato." });
            setScreen(s => (s ? { ...s, document: json.document as ContractDocumentView } : s));
            setMobileView("panel");
            downloadBlob(blob, contractFileName(data.reference, "para assinatura"));
            setNotice({ tone: "ok", text: "Contrato aceito: o PDF foi baixado. Agora é assinar no gov.br e enviar ao inquilino." });
        } catch {
            setNotice({ tone: "error", text: "Não foi possível gerar o PDF. Tente novamente." });
        } finally {
            setBusy(null);
        }
    };

    const reopen = async () => {
        if (!window.confirm("Reabrir a edição? O PDF aceito e as assinaturas recebidas até agora deixam de valer, e o link do inquilino é desativado.")) return;
        setBusy("reopen");
        try {
            const res = await fetch(`/api/leases/${leaseId}/contrato/reabrir`, { method: "POST" });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) return setNotice({ tone: "error", text: json.error || "Não foi possível reabrir." });
            setScreen(s => (s ? { ...s, document: json.document as ContractDocumentView } : s));
            setMobileView("doc");
            setNotice({ tone: "ok", text: "Edição reaberta." });
        } finally {
            setBusy(null);
        }
    };

    const warnings = useMemo(() => (data && options ? contractWarnings(data, options) : []), [data, options]);
    const signers = useMemo(() => (data && options ? contractSigners(data, options) : []), [data, options]);
    const prefix = lang === "pt" ? "" : `/${lang}`;
    const back = `${prefix}/contratos?id=${leaseId}`;

    if (loadError) {
        return (
            <div className="mx-auto max-w-lg py-16 text-center">
                <XCircle className="mx-auto h-10 w-10 text-rose-500" />
                <p className="mt-3 text-sm text-foreground">{loadError}</p>
                <Link href={`${prefix}/contratos`} className="mt-4 inline-block text-sm text-sky-700 hover:underline">Voltar aos contratos</Link>
            </div>
        );
    }
    if (!screen || !data || !document || !initialDoc || !options || !draftOptions) {
        return <div className="flex items-center justify-center gap-2 py-24 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Abrindo o contrato…</div>;
    }
    if (!screen.support.ok) {
        return (
            <div className="mx-auto max-w-lg space-y-3 py-16 text-center">
                <FileSignature className="mx-auto h-10 w-10 text-muted-foreground" />
                <h1 className="text-lg font-semibold text-foreground">Modelo indisponível para este contrato</h1>
                <p className="text-sm text-muted-foreground">{isNew ? "O contrato foi salvo normalmente. " : ""}{screen.support.reason}</p>
                <Link href={back} className="inline-block text-sm text-sky-700 hover:underline">{isNew ? "Ir para o contrato" : "Voltar ao contrato"}</Link>
            </div>
        );
    }

    const fixedTerm = (termMonths(data.lease.start, data.lease.end) ?? 0) > 0;
    const downloadUrl = document.signedUrl ?? document.pdfUrl;
    const status = document.status === "NONE" ? "DRAFT" : document.status;

    const panel = editable ? (
        <div className="space-y-4 p-4">
            <div className="rounded-xl border border-border/80 bg-background p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Próximos passos</p>
                <ol className="mt-2 space-y-1.5 text-sm">
                    <li className="flex items-center gap-2">{fieldList.length ? <TextCursorInput className="h-4 w-4 text-amber-600" /> : <CheckCircle2 className="h-4 w-4 text-emerald-600" />} Revise o texto e preencha os campos{fieldList.length ? ` (${fieldList.length})` : ""}</li>
                    <li className="flex items-center gap-2"><FileDown className="h-4 w-4 text-sky-600" /> Aceite: o PDF é gerado e baixado</li>
                    <li className="flex items-center gap-2"><FileSignature className="h-4 w-4 text-sky-600" /> Assine e envie ao inquilino pelo gov.br</li>
                </ol>
                <button type="button" onClick={accept} disabled={busy !== null} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
                    {busy === "accept" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Aceitar e gerar PDF
                </button>
            </div>

            {warnings.length > 0 && (
                <ul className="space-y-2">
                    {warnings.map((w, i) => (
                        <li key={i} className={cn("flex items-start gap-2 rounded-lg px-3 py-2 text-xs leading-snug",
                            w.level === "error" && "bg-rose-50 text-rose-800 dark:bg-rose-950/30 dark:text-rose-200",
                            w.level === "warning" && "bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200",
                            w.level === "info" && "bg-sky-50 text-sky-900 dark:bg-sky-950/30 dark:text-sky-200")}>
                            {w.level === "info" ? <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}{w.text}
                        </li>
                    ))}
                </ul>
            )}

            <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
                {(["campos", "clausulas"] as const).map(t => (
                    <button key={t} type="button" onClick={() => setTab(t)} className={cn("flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold", tab === t ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                        {t === "campos" ? <><TextCursorInput className="h-3.5 w-3.5" /> Campos{fieldList.length ? ` (${fieldList.length})` : ""}</> : <><Settings2 className="h-3.5 w-3.5" /> Cláusulas</>}
                    </button>
                ))}
            </div>

            {tab === "campos" ? (
                <div className="space-y-3">
                    <p className="text-xs leading-relaxed text-muted-foreground">O que o Kitnets não tem no cadastro fica em amarelo no texto. Preencha aqui (vale para todas as ocorrências) ou direto no documento.</p>
                    <FieldsPanel fields={fieldList} editor={editor} onFill={fill} />
                    <p className="text-[11px] text-muted-foreground">Algum dado do contrato errado (valor, datas, inquilino)? Corrija no <Link href={back} className="underline">cadastro do contrato</Link> e use “Reescrever o texto” em Cláusulas.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    <ContractOptionsPanel options={draftOptions} onChange={setDraftOptions} disabled={false} fixedTerm={fixedTerm} agency={!!data.agency} />
                    <button type="button" onClick={rewrite} className={cn("flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold", optionsChanged ? "bg-sky-600 text-white hover:bg-sky-700" : "border border-border bg-background text-foreground hover:bg-accent")}>
                        <RefreshCw className="h-4 w-4" /> Reescrever o texto{optionsChanged ? " com as novas opções" : ""}
                    </button>
                    {manualEdits && <p className="text-[11px] text-amber-700 dark:text-amber-400">Você mudou o texto à mão: reescrever desfaz essas mudanças (os campos preenchidos continuam).</p>}
                </div>
            )}
        </div>
    ) : (
        <div className="p-4">
            <ContractSigningPanel
                leaseId={leaseId} reference={data.reference} document={document} signers={signers} tenant={screen.tenant} emailAvailable={screen.emailAvailable}
                onDocument={doc => setScreen(s => (s ? { ...s, document: doc } : s))} onReopen={reopen}
            />
        </div>
    );

    return (
        // on a desktop the editor fills the content area beside the sidebar, like a word processor: only the
        // sheet and the panel scroll (the app footer below would otherwise scroll the page under the header)
        <div className="-m-4 flex flex-col bg-background lg:fixed lg:inset-y-0 lg:left-[var(--sidebar-width)] lg:right-0 lg:z-30 lg:m-0">
            <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-card px-4 py-2.5">
                <Link href={back} className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-accent" title="Voltar ao contrato" aria-label="Voltar ao contrato"><ArrowLeft className="h-4 w-4" /></Link>
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <h1 className="truncate text-base font-semibold text-foreground sm:text-lg">Documento do contrato</h1>
                        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", STATUS_TONES[status])}>{STATUS_LABELS[status]}</span>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{data.reference}</p>
                </div>
                {editable && (
                    <span className="hidden text-xs text-muted-foreground sm:inline" aria-live="polite">
                        {saveState === "saving" ? "Salvando…" : saveState === "saved" ? "Salvo" : saveState === "error" ? <span className="text-rose-600">Erro ao salvar</span> : ""}
                    </span>
                )}
                <div className="flex items-center gap-2">
                    <button type="button" onClick={preview} disabled={busy !== null} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground hover:bg-accent disabled:opacity-50">
                        {busy === "preview" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}<span className="hidden sm:inline">Ver PDF</span>
                    </button>
                    {editable ? (
                        <button type="button" onClick={accept} disabled={busy !== null} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
                            {busy === "accept" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Aceitar<span className="hidden sm:inline"> e gerar PDF</span>
                        </button>
                    ) : downloadUrl ? (
                        <a href={downloadUrl} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-sky-600 px-3 text-sm font-semibold text-white hover:bg-sky-700"><FileDown className="h-4 w-4" /> Baixar PDF</a>
                    ) : null}
                </div>
            </header>

            {notice && (
                <div role="status" className={cn("flex items-center gap-2 border-b px-4 py-2 text-sm", notice.tone === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200" : "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200")}>
                    {notice.tone === "ok" ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
                    <span className="flex-1">{notice.text}</span>
                    <button type="button" onClick={() => setNotice(null)} className="rounded p-1 hover:bg-black/5" aria-label="Fechar aviso"><XCircle className="h-4 w-4 opacity-60" /></button>
                </div>
            )}

            <div className="grid shrink-0 grid-cols-2 gap-1 border-b border-border bg-card p-1.5 lg:hidden">
                {(["doc", "panel"] as const).map(v => (
                    <button key={v} type="button" onClick={() => setMobileView(v)} className={cn("flex items-center justify-center gap-1.5 rounded-md py-2 text-sm font-semibold", mobileView === v ? "bg-muted text-foreground" : "text-muted-foreground")}>
                        {v === "doc" ? <><PenLine className="h-4 w-4" /> Documento</> : editable ? <><TextCursorInput className="h-4 w-4" /> Preencher{fieldList.length ? ` (${fieldList.length})` : ""}</> : <><FileSignature className="h-4 w-4" /> Assinaturas</>}
                    </button>
                ))}
            </div>

            <div className="flex flex-1 flex-col lg:min-h-0 lg:flex-row">
                <main className={cn("min-w-0 flex-1 flex-col lg:flex lg:overflow-y-auto", mobileView === "doc" ? "flex" : "hidden")}>
                    <ContractEditor content={initialDoc} editable={editable} onUserChange={onUserChange} onReady={onReady} fieldCount={fieldList.length} />
                </main>
                <aside className={cn("w-full shrink-0 bg-card lg:block lg:w-[380px] lg:overflow-y-auto lg:border-l lg:border-border", mobileView === "panel" ? "block" : "hidden")}>
                    {panel}
                </aside>
            </div>
        </div>
    );
}
