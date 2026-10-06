"use client";

/**
 * After the text is accepted: getting it signed on gov.br. Download the PDF, sign it, send the tenant
 * the signing link (copy, WhatsApp, e-mail), receive the signed copies — from the tenant through the
 * link, or uploaded here — and close the contract when every party signed.
 */
import React, { useRef, useState } from "react";
import {
    AlertTriangle, CheckCircle2, Copy, ExternalLink, FileDown, Link2, Loader2, Mail, MessageCircle, RotateCcw, ShieldCheck, UploadCloud, XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
    GOVBR_SIGNER_URL, GOVBR_VALIDATOR_URL, MAX_SIGNED_PDF_BYTES, whatsappLink, whatsappMessage, type ContractDocumentView,
} from "@/lib/contract/document";
import type { ContractSigner } from "@/lib/contract/template";
import { plainText, textNodes } from "@/lib/contract/doc";

interface Props {
    leaseId: string;
    reference: string;
    document: ContractDocumentView;
    signers: ContractSigner[];
    tenant: { name: string | null; email: string | null; phone: string | null };
    emailAvailable: boolean;
    onDocument: (doc: ContractDocumentView) => void;
    onReopen: () => void;
}

const when = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const inlineText = (v: ContractSigner["name"]) => plainText({ type: "paragraph", content: textNodes([v]) });

function Step({ n, title, done, children }: { n: number; title: string; done?: boolean; children: React.ReactNode }) {
    return (
        <li className="relative flex gap-3">
            <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold", done ? "bg-emerald-600 text-white" : "bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300")}>
                {done ? <CheckCircle2 className="h-4 w-4" /> : n}
            </span>
            <div className="min-w-0 flex-1 space-y-2 pb-1">
                <p className="text-sm font-semibold text-foreground">{title}</p>
                {children}
            </div>
        </li>
    );
}

const btn = "inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground hover:bg-accent disabled:opacity-50";

export default function ContractSigningPanel({ leaseId, reference, document: doc, signers, tenant, emailAvailable, onDocument, onReopen }: Props) {
    const input = useRef<HTMLInputElement>(null);
    const [busy, setBusy] = useState<null | "link" | "email" | "upload" | "finish" | "revoke">(null);
    const [message, setMessage] = useState<{ tone: "ok" | "warn" | "error"; text: string } | null>(null);
    const [copied, setCopied] = useState(false);

    const signed = doc.status === "SIGNED";
    const latestUrl = doc.signedUrl ?? doc.pdfUrl;
    const allCounted = doc.signatureCount >= doc.requiredSignatures;

    const call = async (kind: NonNullable<typeof busy>, url: string, init: RequestInit): Promise<Record<string, unknown> | null> => {
        setBusy(kind);
        setMessage(null);
        try {
            const res = await fetch(url, init);
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                setMessage({ tone: "error", text: json.error || "Não foi possível concluir. Tente novamente." });
                return null;
            }
            if (json.document) onDocument(json.document as ContractDocumentView);
            return json;
        } catch {
            setMessage({ tone: "error", text: "Erro de conexão. Tente novamente." });
            return null;
        } finally {
            setBusy(null);
        }
    };

    const createLink = (email: boolean) => call(email ? "email" : "link", `/api/leases/${leaseId}/contrato/link`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }),
    }).then(json => {
        if (!json) return;
        if (email) setMessage(json.emailed ? { tone: "ok", text: `Link enviado para ${tenant.email}.` } : { tone: "warn", text: String(json.emailError ?? "O e-mail não foi enviado.") });
    });

    const copyLink = async () => {
        if (!doc.share) return;
        try {
            await navigator.clipboard.writeText(doc.share.url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            setMessage({ tone: "warn", text: "Não foi possível copiar. Selecione o link e copie." });
        }
    };

    const upload = async (file: File) => {
        if (file.size > MAX_SIGNED_PDF_BYTES) return setMessage({ tone: "error", text: "Arquivo grande demais (máximo 4 MB)." });
        const form = new FormData();
        form.append("file", file);
        const json = await call("upload", `/api/leases/${leaseId}/contrato/assinado`, { method: "POST", body: form });
        if (input.current) input.current.value = "";
        if (!json) return;
        if (json.complete) setMessage({ tone: "ok", text: "Todas as assinaturas recebidas: contrato assinado e guardado nos arquivos do contrato." });
        else if (json.needsReview) setMessage({ tone: "warn", text: "Todas as assinaturas estão no arquivo, mas ele não parte do PDF aceito aqui. Confira em validar.iti.gov.br e clique em Concluir." });
        else setMessage({ tone: "ok", text: `Recebido: ${json.count} assinatura${json.count === 1 ? "" : "s"} no arquivo.` });
    };

    const finish = () => {
        if (!window.confirm("Concluir o contrato como assinado por todas as partes? O PDF mais recente vai para os arquivos do contrato.")) return;
        void call("finish", `/api/leases/${leaseId}/contrato/concluir`, { method: "POST" });
    };
    const revoke = () => {
        if (!window.confirm("Desativar o link de assinatura? Quem tiver o link não conseguirá mais abrir o contrato.")) return;
        void call("revoke", `/api/leases/${leaseId}/contrato/link`, { method: "DELETE" }).then(json => json && onDocument({ ...doc, share: null }));
    };

    if (signed) {
        return (
            <div className="space-y-3">
                <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
                    <p className="flex items-center gap-2 text-sm font-semibold"><CheckCircle2 className="h-5 w-5" /> Contrato assinado</p>
                    <p className="mt-1 text-xs">{doc.signedAt ? `Concluído em ${when(doc.signedAt)} · ` : ""}{doc.signatureCount} assinatura{doc.signatureCount === 1 ? "" : "s"}. O PDF assinado está nos arquivos do contrato.</p>
                </div>
                {doc.signedUrl && <a href={doc.signedUrl} className={btn}><FileDown className="h-4 w-4" /> Baixar o contrato assinado</a>}
                <a href={GOVBR_VALIDATOR_URL} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-sky-700 hover:underline dark:text-sky-400"><ShieldCheck className="h-3.5 w-3.5" /> Conferir as assinaturas em validar.iti.gov.br</a>
                {message && <p className={cn("text-xs", message.tone === "error" ? "text-rose-600" : "text-muted-foreground")}>{message.text}</p>}
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div>
                <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                    <span>Assinaturas</span>
                    <span className="font-semibold text-foreground">{doc.signatureCount} de {doc.requiredSignatures}</span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${Math.min(100, (doc.signatureCount / Math.max(1, doc.requiredSignatures)) * 100)}%` }} />
                </div>
                <ul className="mt-2 space-y-1">
                    {signers.map((s, i) => (
                        <li key={i} className="flex items-center justify-between gap-2 text-xs">
                            <span className="truncate text-foreground"><span className="font-medium">{s.role}</span> · {inlineText(s.name)}</span>
                        </li>
                    ))}
                </ul>
                {doc.signers.length > 0 && (
                    <p className="mt-2 text-[11px] text-muted-foreground">Identificados no PDF: {doc.signers.map(s => s.name).join(", ")}</p>
                )}
            </div>

            <ol className="space-y-4">
                <Step n={1} title="Baixe o PDF para assinar">
                    {latestUrl ? <a href={latestUrl} className={btn}><FileDown className="h-4 w-4" /> {doc.signatureCount ? `Baixar a versão com ${doc.signatureCount} assinatura${doc.signatureCount === 1 ? "" : "s"}` : "Baixar o PDF"}</a> : <p className="text-xs text-muted-foreground">PDF indisponível. Recarregue a página.</p>}
                </Step>
                <Step n={2} title="Assine no gov.br">
                    <p className="text-xs leading-relaxed text-muted-foreground">
                        Quem representa a holding entra no assinador com a conta gov.br (prata ou ouro), envia o PDF, posiciona a assinatura na página de assinaturas, confirma com o código e baixa o arquivo assinado.
                    </p>
                    <a href={GOVBR_SIGNER_URL} target="_blank" rel="noopener noreferrer" className={btn}><ShieldCheck className="h-4 w-4 text-sky-600" /> Abrir assinador.iti.br <ExternalLink className="h-3 w-3 opacity-60" /></a>
                </Step>
                <Step n={3} title="Envie ao inquilino">
                    <p className="text-xs leading-relaxed text-muted-foreground">O link abre uma página onde o inquilino baixa a versão mais recente, assina no gov.br e devolve o PDF assinado — que chega aqui sozinho.</p>
                    {doc.share ? (
                        <div className="space-y-2">
                            <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/40 px-2 py-1.5">
                                <Link2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                <input readOnly value={doc.share.url} onFocus={e => e.currentTarget.select()} className="min-w-0 flex-1 bg-transparent text-[11px] text-foreground outline-none" aria-label="Link de assinatura" />
                                <button type="button" onClick={copyLink} className="rounded p-1 hover:bg-accent" title="Copiar link" aria-label="Copiar link">{copied ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}</button>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <a href={whatsappLink(tenant.phone, whatsappMessage(tenant.name, reference, doc.share.url))} target="_blank" rel="noopener noreferrer" className={btn}><MessageCircle className="h-4 w-4 text-emerald-600" /> WhatsApp</a>
                                {emailAvailable && tenant.email && (
                                    <button type="button" className={btn} disabled={busy !== null} onClick={() => createLink(true)}>{busy === "email" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4 text-sky-600" />} E-mail</button>
                                )}
                                <button type="button" className={cn(btn, "text-muted-foreground")} disabled={busy !== null} onClick={revoke}><XCircle className="h-4 w-4" /> Desativar</button>
                            </div>
                            <p className="text-[11px] text-muted-foreground">Válido até {new Date(doc.share.expiresAt).toLocaleDateString("pt-BR")}.{!tenant.email && emailAvailable ? " O inquilino não tem e-mail no cadastro." : ""}</p>
                        </div>
                    ) : (
                        <button type="button" className={btn} disabled={busy !== null} onClick={() => createLink(false)}>{busy === "link" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />} Criar link de assinatura</button>
                    )}
                </Step>
                <Step n={4} title="Recebeu um PDF assinado por outro caminho?">
                    <input ref={input} type="file" accept="application/pdf,.pdf" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
                    <button type="button" className={btn} disabled={busy !== null} onClick={() => input.current?.click()}>{busy === "upload" ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />} Enviar PDF assinado</button>
                    <p className="text-[11px] text-muted-foreground">Cada envio precisa ter mais assinaturas que o anterior. Com todas, o contrato fecha sozinho.</p>
                </Step>
            </ol>

            {message && (
                <p role="status" className={cn("flex items-start gap-1.5 rounded-lg px-3 py-2 text-xs", message.tone === "ok" && "bg-emerald-50 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200", message.tone === "warn" && "bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200", message.tone === "error" && "bg-rose-50 text-rose-800 dark:bg-rose-950/30 dark:text-rose-200")}>
                    {message.tone === "ok" ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}{message.text}
                </p>
            )}

            {doc.versions.length > 0 && (
                <div className="space-y-1.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Cópias recebidas</p>
                    <ul className="space-y-1">
                        {[...doc.versions].reverse().map((v, i) => (
                            <li key={i} className="flex items-center justify-between gap-2 text-xs">
                                <span className="text-foreground">{when(v.at)} · {v.by === "TENANT" ? "pelo link" : "enviado aqui"}</span>
                                <span className={cn("shrink-0", v.fromAccepted === false ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground")} title={v.fromAccepted === false ? "O arquivo não parte do PDF aceito aqui: confira em validar.iti.gov.br" : undefined}>
                                    {v.count} assin.{v.fromAccepted === false ? " · conferir" : ""}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
                {doc.signatureCount > 0 && (
                    <button type="button" className={cn(btn, allCounted && "border-emerald-400 bg-emerald-600 text-white hover:bg-emerald-700")} disabled={busy !== null} onClick={finish}>
                        {busy === "finish" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Concluir
                    </button>
                )}
                <button type="button" className={cn(btn, "text-muted-foreground")} disabled={busy !== null} onClick={onReopen}><RotateCcw className="h-4 w-4" /> Reabrir edição</button>
                <a href={GOVBR_VALIDATOR_URL} target="_blank" rel="noopener noreferrer" className="ml-auto flex items-center gap-1 text-[11px] text-sky-700 hover:underline dark:text-sky-400"><ShieldCheck className="h-3.5 w-3.5" /> Validar assinaturas</a>
            </div>
        </div>
    );
}
