"use client";

/**
 * /proprietario — the holding's record read flat, the way a property's ficha is: identification,
 * CNAEs, the head office, the administrator and the access account as summaries, "Editar" opening
 * the editor in place; then the holding's files, where a Cartão CNPJ is read by the AI and fills
 * the record (and the natureza jurídica and porte of /contabil/politicas); then the notification
 * preferences and the account deletion; last, for the pilot accounts only, "Meus Gateways". PJ only:
 * the owner is the holding.
 */
import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Bell, Briefcase, Building2, Check, FileText, Image as ImageIcon, Loader2, MapPin, PenLine, ShieldAlert, Sparkles, Trash2, Upload, UserCog, UserRound, X } from "lucide-react";
import { Button } from "@kitnets/ui";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/DateInput";
import { PdfViewerModal } from "@/components/ui/PdfViewerModal";
import { Sensitive } from "@/components/privacy";
import GatewaysSection from "@/components/proprietario/GatewaysSection";
import { Field, dash, muted } from "@/components/profile/PropertyRegisterSection";
import { formatFileSize } from "@/components/profile/PropertyDocumentsCard";
import { deleteAccount } from "@/app/[lang]/profile/actions";
import { readByFromJson, readerLabel } from "@/lib/ai-reader-label";
import { BRAZIL_UFS, COMPANY_SIZE_LABELS, LEGAL_NATURE_LABELS, type CompanySize, type LegalNature } from "@/lib/accounting-policies";
import { formatDateBR } from "@/lib/dates";
import type { GatewayView } from "@/lib/gateway-views";
import { addressLine, type HoldingAddress, type HoldingAdmin, type HoldingProfile } from "@/lib/profile-holding";
import { MAX_PROFILE_DOCUMENT_BYTES, PROFILE_DOC_CATEGORIES, type ProfileDocCategory, type ProfileDocument } from "@/lib/profile-documents";
import { NOTIFICATIONS_KEY, type NotificationPrefs } from "@/lib/ui-preferences";
import { loadAccountPreferences, readLocalPreference, saveAccountPreference, writeLocalPreference } from "@/lib/ui-preferences-client";
import { maskCEP, maskCNPJ, maskPhone } from "@/lib/validators";
import { cn } from "@/lib/utils";

export interface OwnerPageInitial {
    holding: HoldingProfile;
    documents: ProfileDocument[];
}

interface Props {
    lang: string;
    /** preloaded by the server page; null before the profile row exists (first visit) */
    initial: OwnerPageInitial | null;
    /** the IoT gateways of the founder-only pilot; null = this account is not on the pilot list */
    gateways: GatewayView[] | null;
}

type BlockKey = "identity" | "address" | "admin" | "account";

/** The editable copy of the record while a block is open. */
interface Draft {
    full_name: string;
    phone: string;
    cnpj: string;
    business_name: string;
    trade_name: string;
    registration_status_date: string;
    address: HoldingAddress;
    admin: HoldingAdmin;
}

const draftFrom = (h: HoldingProfile): Draft => ({
    full_name: h.full_name,
    phone: h.phone,
    cnpj: h.cnpj,
    business_name: h.business_name,
    trade_name: h.trade_name,
    registration_status_date: h.registration_status_date,
    address: { ...h.address },
    admin: { ...h.admin, address: { ...h.admin.address } },
});

/** What each block sends to PATCH /api/profiles/me when it closes. */
const BLOCK_FIELDS: Record<BlockKey, (d: Draft) => Record<string, unknown>> = {
    identity: d => ({ cnpj: d.cnpj, business_name: d.business_name, trade_name: d.trade_name, registration_status_date: d.registration_status_date, phone: d.phone }),
    address: d => ({ address: d.address }),
    admin: d => ({ admin: d.admin }),
    account: d => ({ full_name: d.full_name }),
};

const NO_BLOCKS: Record<BlockKey, boolean> = { identity: false, address: false, admin: false, account: false };
const DEFAULT_NOTIFICATIONS: NotificationPrefs = { marketing: false, security: true };

const INPUT = "h-10 rounded-lg text-sm";
const SELECT = "h-10 w-full rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";
const btn = "inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs hover:border-emerald-400 disabled:opacity-50";
const isImageName = (name: string | null) => /\.(jpe?g|png|webp|gif)$/i.test(name ?? "");

async function readError(res: Response, fallback: string): Promise<string> {
    const d = await res.json().catch(() => ({}));
    return (d && typeof d.error === "string" && d.error) || fallback;
}

/** One block of the flat record: a summary, or the editor in place; "Editar" only where the owner can type. */
function Block({ icon, title, filled, editing, onToggle, saving, summary, editor, hint }: { icon: React.ReactNode; title: string; filled: boolean; editing?: boolean; onToggle?: (open: boolean) => void; saving?: boolean; summary: React.ReactNode; editor?: React.ReactNode; hint?: string }) {
    return (
        <div className="space-y-3 px-4 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="inline-flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
                    <span className="text-emerald-600">{icon}</span> {title}
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider", filled ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300" : "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300")}>
                        {filled ? "preenchido" : "a preencher"}
                    </span>
                    {hint && <span className="text-[11px] font-normal text-muted-foreground">{hint}</span>}
                </h3>
                {onToggle && (
                    <Button variant={editing ? "default" : "outline"} size="sm" onClick={() => onToggle(!editing)} disabled={saving} className="gap-1.5">
                        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : editing ? <Check className="h-3.5 w-3.5" /> : <PenLine className="h-3.5 w-3.5" />}
                        {editing ? "Concluir" : "Editar"}
                    </Button>
                )}
            </div>
            {editing && editor ? <div className="space-y-3">{editor}</div> : summary}
        </div>
    );
}

function Labeled({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
    return (
        <label className={cn("block space-y-1", className)}>
            <span className="text-xs font-medium text-muted-foreground">{label}</span>
            {children}
        </label>
    );
}

/** The address fields, with the CEP filling the street, the bairro and the city (ViaCEP via /api/cep). */
function AddressEditor({ value, onChange, idPrefix }: { value: HoldingAddress; onChange: (next: HoldingAddress) => void; idPrefix: string }) {
    const [looking, setLooking] = useState(false);
    const set = (patch: Partial<HoldingAddress>) => onChange({ ...value, ...patch });

    const onCep = async (raw: string) => {
        const cep = maskCEP(raw);
        set({ cep });
        const digits = cep.replace(/\D/g, "");
        if (digits.length !== 8) return;
        setLooking(true);
        try {
            const res = await fetch(`/api/cep?code=${digits}`);
            if (!res.ok) return;
            const d = await res.json();
            onChange({ ...value, cep, street: d.street || value.street, neighborhood: d.neighborhood || value.neighborhood, city: d.city || value.city, state: d.state || value.state });
        } catch {
            // the owner types the rest
        } finally {
            setLooking(false);
        }
    };

    return (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Labeled label={looking ? "CEP · buscando…" : "CEP"}>
                <Input id={`${idPrefix}-cep`} value={value.cep} onChange={e => void onCep(e.target.value)} placeholder="00000-000" inputMode="numeric" className={INPUT} />
            </Labeled>
            <Labeled label="Logradouro" className="lg:col-span-2">
                <Input id={`${idPrefix}-street`} value={value.street} onChange={e => set({ street: e.target.value })} className={INPUT} />
            </Labeled>
            <Labeled label="Número">
                <Input id={`${idPrefix}-number`} value={value.number} onChange={e => set({ number: e.target.value })} className={INPUT} />
            </Labeled>
            <Labeled label="Complemento">
                <Input id={`${idPrefix}-complement`} value={value.complement} onChange={e => set({ complement: e.target.value })} className={INPUT} />
            </Labeled>
            <Labeled label="Bairro">
                <Input id={`${idPrefix}-neighborhood`} value={value.neighborhood} onChange={e => set({ neighborhood: e.target.value })} className={INPUT} />
            </Labeled>
            <Labeled label="Cidade">
                <Input id={`${idPrefix}-city`} value={value.city} onChange={e => set({ city: e.target.value })} className={INPUT} />
            </Labeled>
            <Labeled label="UF">
                <select id={`${idPrefix}-state`} value={value.state} onChange={e => set({ state: e.target.value })} className={SELECT}>
                    <option value="">—</option>
                    {BRAZIL_UFS.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                </select>
            </Labeled>
        </div>
    );
}

export default function OwnerPage({ lang, initial, gateways }: Props) {
    const href = (path: string) => (lang === "pt" ? path : `/${lang}${path}`);
    const router = useRouter();

    const [holding, setHolding] = useState<HoldingProfile | null>(initial?.holding ?? null);
    const [documents, setDocuments] = useState<ProfileDocument[]>(initial?.documents ?? []);
    const [loading, setLoading] = useState(!initial);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: React.ReactNode } | null>(null);

    const [open, setOpen] = useState<Record<BlockKey, boolean>>(NO_BLOCKS);
    const [draft, setDraft] = useState<Draft | null>(null);
    const [saving, setSaving] = useState<BlockKey | null>(null);

    const inputs = useRef<Partial<Record<ProfileDocCategory, HTMLInputElement | null>>>({});
    const [uploading, setUploading] = useState<ProfileDocCategory | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const [viewer, setViewer] = useState<{ url: string; title: string; fileName: string } | null>(null);

    const [notifications, setNotifications] = useState<NotificationPrefs>(() => readLocalPreference("notifications", NOTIFICATIONS_KEY) ?? DEFAULT_NOTIFICATIONS);
    const [showDelete, setShowDelete] = useState(false);
    const [deleting, setDeleting] = useState(false);

    // First visit: the profile row does not exist yet — create it, then load the record.
    useEffect(() => {
        if (initial) return;
        let cancelled = false;
        (async () => {
            try {
                await fetch("/api/profiles/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
                const res = await fetch("/api/profiles/me");
                if (!res.ok) throw new Error(await readError(res, "Não foi possível carregar o proprietário."));
                const d = await res.json();
                if (cancelled) return;
                setHolding(d.holding);
                setDocuments(d.documents ?? []);
            } catch (err) {
                if (!cancelled) setLoadError(err instanceof Error ? err.message : "Não foi possível carregar o proprietário.");
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [initial]);

    // The notification preferences live in the account (user_ui_preferences), like the sidebar's groups.
    useEffect(() => {
        let cancelled = false;
        void loadAccountPreferences().then(all => {
            const saved = all.notifications[NOTIFICATIONS_KEY];
            if (saved && !cancelled) { setNotifications(saved); writeLocalPreference("notifications", NOTIFICATIONS_KEY, saved); }
        });
        return () => { cancelled = true; };
    }, []);

    const setNotification = (patch: Partial<NotificationPrefs>) => {
        const next = { ...notifications, ...patch };
        setNotifications(next);
        writeLocalPreference("notifications", NOTIFICATIONS_KEY, next);
        saveAccountPreference("notifications", NOTIFICATIONS_KEY, next);
    };

    const toggle = async (key: BlockKey, openIt: boolean) => {
        if (!holding) return;
        if (openIt) {
            setDraft(d => d ?? draftFrom(holding));
            setOpen(o => ({ ...o, [key]: true }));
            return;
        }
        const next = { ...open, [key]: false };
        if (!draft) { setOpen(next); return; }
        setSaving(key);
        setNotice(null);
        try {
            const res = await fetch("/api/profiles/me", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(BLOCK_FIELDS[key](draft)) });
            if (!res.ok) throw new Error(await readError(res, "Não foi possível salvar."));
            const d = await res.json();
            setHolding(d.holding);
            setOpen(next);
            if (!Object.values(next).some(Boolean)) setDraft(null);
        } catch (err) {
            setNotice({ kind: "error", text: err instanceof Error ? err.message : "Não foi possível salvar." });
        } finally {
            setSaving(null);
        }
    };

    const patchDraft = (patch: Partial<Draft>) => setDraft(d => (d ? { ...d, ...patch } : d));

    const importNotice = (d: { read_by?: unknown; policies?: { legal_nature: LegalNature | null; company_size: CompanySize | null; filled: boolean } | null }): React.ReactNode => {
        const reader = readerLabel(readByFromJson(d.read_by));
        const p = d.policies;
        return (
            <>
                Cartão CNPJ lido{reader ? ` por ${reader}` : " pelo texto do PDF"}: ficha preenchida.
                {p?.filled && (p.legal_nature || p.company_size) && (
                    <> Natureza jurídica e porte levados para <Link href={href("/contabil/politicas")} className="underline">Políticas contábeis</Link>: {[p.legal_nature ? LEGAL_NATURE_LABELS[p.legal_nature] : null, p.company_size ? COMPANY_SIZE_LABELS[p.company_size] : null].filter(Boolean).join(" · ")}.</>
                )}
            </>
        );
    };

    const upload = async (category: ProfileDocCategory, files: File[]) => {
        if (files.length === 0) return;
        setUploading(category);
        setNotice(null);
        try {
            for (const file of files) {
                if (file.size > MAX_PROFILE_DOCUMENT_BYTES) throw new Error(`"${file.name}" passa de ${Math.round(MAX_PROFILE_DOCUMENT_BYTES / (1024 * 1024))} MB.`);
                const form = new FormData();
                form.append("file", file);
                form.append("category", category);
                const res = await fetch("/api/profiles/documents", { method: "POST", body: form });
                if (!res.ok) throw new Error(await readError(res, "Não foi possível enviar o arquivo."));
                const d = await res.json();
                setDocuments(list => [d.document, ...list]);
                if (d.holding) {
                    setHolding(d.holding);
                    setDraft(null);
                    setOpen(NO_BLOCKS);
                    setNotice({ kind: "ok", text: importNotice(d) });
                } else if (d.import_error) {
                    setNotice({ kind: "error", text: d.import_error });
                }
            }
        } catch (err) {
            setNotice({ kind: "error", text: err instanceof Error ? err.message : "Não foi possível enviar o arquivo." });
        } finally {
            setUploading(null);
        }
    };

    const reread = async (doc: ProfileDocument) => {
        setBusy(doc.id);
        setNotice(null);
        try {
            const res = await fetch("/api/profiles/company-import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ document_id: doc.id }) });
            if (!res.ok) throw new Error(await readError(res, "A leitura do cartão falhou."));
            const d = await res.json();
            setHolding(d.holding);
            setDraft(null);
            setOpen(NO_BLOCKS);
            setNotice({ kind: "ok", text: importNotice(d) });
        } catch (err) {
            setNotice({ kind: "error", text: err instanceof Error ? err.message : "A leitura do cartão falhou." });
        } finally {
            setBusy(null);
        }
    };

    const openDocument = async (doc: ProfileDocument) => {
        setBusy(doc.id);
        try {
            const res = await fetch(`/api/profiles/documents/${doc.id}`);
            if (!res.ok) throw new Error(await readError(res, "Não foi possível abrir o arquivo."));
            const { url } = await res.json();
            const name = doc.original_name || "documento.pdf";
            if (isImageName(name)) window.open(url, "_blank", "noopener");
            else setViewer({ url, title: name, fileName: name.toLowerCase().endsWith(".pdf") ? name : `${name}.pdf` });
        } catch (err) {
            setNotice({ kind: "error", text: err instanceof Error ? err.message : "Não foi possível abrir o arquivo." });
        } finally {
            setBusy(null);
        }
    };

    const removeDocument = async (doc: ProfileDocument) => {
        if (!window.confirm(`Remover “${doc.original_name || "este arquivo"}”? A ficha mantém o que ele preencheu.`)) return;
        setBusy(doc.id);
        try {
            const res = await fetch(`/api/profiles/documents/${doc.id}`, { method: "DELETE" });
            if (!res.ok) throw new Error(await readError(res, "Não foi possível excluir o arquivo."));
            setDocuments(list => list.filter(d => d.id !== doc.id));
        } catch (err) {
            setNotice({ kind: "error", text: err instanceof Error ? err.message : "Não foi possível excluir o arquivo." });
        } finally {
            setBusy(null);
        }
    };

    const handleDeleteAccount = async () => {
        setDeleting(true);
        try {
            await deleteAccount();
            router.push("/");
            router.refresh();   // the Clerk session is gone with the user
        } catch (err) {
            console.error("[Proprietário] delete account failed", err);
            setDeleting(false);
            setShowDelete(false);
            setNotice({ kind: "error", text: "Não foi possível excluir a conta. Tente novamente." });
        }
    };

    const uploadButton = (category: ProfileDocCategory, label: string, opts: { icon?: React.ReactNode; title?: string; className?: string } = {}) => (
        <React.Fragment key={category}>
            <button type="button" onClick={() => inputs.current[category]?.click()} disabled={uploading !== null || !holding} title={opts.title} className={opts.className ?? btn}>
                {uploading === category ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : (opts.icon ?? <Upload className="h-3.5 w-3.5" />)}
                {label}
            </button>
            <input
                ref={el => { inputs.current[category] = el; }}
                type="file"
                multiple={category !== "cnpj_card"}
                accept="application/pdf,image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={e => { const picked = Array.from(e.target.files ?? []); e.target.value = ""; void upload(category, picked); }}
            />
        </React.Fragment>
    );

    if (loading) {
        return (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
            </div>
        );
    }
    if (!holding) {
        return (
            <div className="mx-auto max-w-[1600px] p-4 sm:p-6">
                <div className="flex items-center gap-2 rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-800 dark:bg-rose-950/30 dark:text-rose-200">
                    <AlertTriangle className="h-4 w-4 shrink-0" /> {loadError ?? "Não foi possível carregar o proprietário."}
                </div>
            </div>
        );
    }

    const r = holding.registry;
    const identityFilled = Boolean(holding.cnpj && holding.business_name);
    const cnaesFilled = Boolean(r?.cnae_principal);
    const addressFilled = Boolean(holding.address.street || holding.address.cep);
    const adminFilled = Boolean(holding.admin.name);
    const accountFilled = Boolean(holding.full_name);
    const readAt = holding.registry_read_at ? formatDateBR(holding.registry_read_at.slice(0, 10)) : null;
    const readBy = readerLabel(readByFromJson((holding.registry as { read_by?: unknown } | null)?.read_by));
    const cardHint = r ? `Cartão CNPJ lido${readAt ? ` em ${readAt}` : ""}${readBy ? ` por ${readBy}` : ""}` : undefined;
    const byCategory = new Map<ProfileDocCategory, ProfileDocument[]>();
    for (const doc of documents) byCategory.set(doc.category, [...(byCategory.get(doc.category) ?? []), doc]);
    const d = draft ?? draftFrom(holding);

    return (
        <div className="mx-auto max-w-[1600px] space-y-5 p-4 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                    <h1 className="inline-flex items-center gap-2 text-2xl font-bold text-foreground">
                        <Building2 className="h-6 w-6 text-emerald-600" /> Proprietário
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        A ficha da holding: CNPJ, razão social, atividades (CNAE), sede, administrador e os documentos da empresa. Envie o Cartão CNPJ e a IA preenche tudo, inclusive as políticas contábeis.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {r?.situacao_cadastral && (
                        <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider", r.situacao_cadastral === "ATIVA" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300" : "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300")}>
                            {r.situacao_cadastral}
                        </span>
                    )}
                    {uploadButton("cnpj_card", r ? "Atualizar Cartão CNPJ" : "Importar Cartão CNPJ", {
                        icon: <Sparkles className="h-4 w-4" />,
                        title: "Comprovante de Inscrição e de Situação Cadastral (PDF da Receita Federal)",
                        className: "inline-flex h-10 items-center gap-2 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 px-4 text-sm font-semibold text-white shadow-md shadow-emerald-500/20 transition-all hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50",
                    })}
                </div>
            </div>

            {notice && (
                <div className={cn("flex items-start gap-2 rounded-xl border p-3 text-sm", notice.kind === "ok" ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100" : "border-rose-300 bg-rose-50 text-rose-900 dark:bg-rose-950/30 dark:text-rose-100")} role="status">
                    {notice.kind === "ok" ? <Check className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
                    <span className="flex-1">{notice.text}</span>
                    <button type="button" onClick={() => setNotice(null)} aria-label="Fechar" className="rounded p-0.5 opacity-70 hover:opacity-100"><X className="h-4 w-4" /></button>
                </div>
            )}

            <section className="divide-y divide-border/60 rounded-xl border border-border/80 bg-card">
                <header className="px-4 py-3">
                    <h2 className="text-sm font-semibold text-foreground">Ficha da holding</h2>
                    <p className="text-xs text-muted-foreground">Edite no lugar. O que vem do Cartão CNPJ (abertura, situação, natureza jurídica, porte, CNAEs) se atualiza a cada cartão enviado.</p>
                </header>

                <Block
                    icon={<Building2 className="h-4 w-4" />} title="Identificação" filled={identityFilled} editing={open.identity} onToggle={o => void toggle("identity", o)} saving={saving === "identity"} hint={cardHint}
                    summary={(
                        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
                            <Field label="CNPJ" value={holding.cnpj ? <Sensitive>{holding.cnpj}</Sensitive> : muted("—")} />
                            <Field label="Razão social" value={dash(holding.business_name)} />
                            <Field label="Nome fantasia" value={dash(holding.trade_name)} />
                            <Field label="Situação cadastral" value={r?.situacao_cadastral ? `${r.situacao_cadastral}${holding.registration_status_date ? ` · desde ${formatDateBR(holding.registration_status_date)}` : ""}` : holding.registration_status_date ? `desde ${formatDateBR(holding.registration_status_date)}` : muted("—")} />
                            <Field label="Data de abertura" value={r?.data_abertura ? formatDateBR(r.data_abertura) : muted("—")} />
                            <Field label="Natureza jurídica" value={r?.natureza_juridica ? `${r.natureza_juridica.codigo ? `${r.natureza_juridica.codigo} · ` : ""}${r.natureza_juridica.descricao}` : muted("—")} />
                            <Field label="Porte" value={dash(r?.porte)} />
                            <Field label="Telefone" value={dash(holding.phone)} />
                            <Field label="E-mail da empresa" value={dash(r?.email)} />
                            {r?.ente_federativo && <Field label="Ente federativo responsável" value={r.ente_federativo} />}
                            {r?.situacao_especial && <Field label="Situação especial" value={`${r.situacao_especial}${r.data_situacao_especial ? ` · ${formatDateBR(r.data_situacao_especial)}` : ""}`} />}
                        </dl>
                    )}
                    editor={(
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            <Labeled label="CNPJ">
                                <Input id="holding-cnpj" value={d.cnpj} onChange={e => patchDraft({ cnpj: maskCNPJ(e.target.value) })} placeholder="00.000.000/0000-00" className={cn(INPUT, "privacy-sensitive")} />
                            </Labeled>
                            <Labeled label="Razão social" className="lg:col-span-2">
                                <Input id="holding-business-name" value={d.business_name} onChange={e => patchDraft({ business_name: e.target.value })} className={INPUT} />
                            </Labeled>
                            <Labeled label="Nome fantasia">
                                <Input id="holding-trade-name" value={d.trade_name} onChange={e => patchDraft({ trade_name: e.target.value })} className={INPUT} />
                            </Labeled>
                            <Labeled label="Data da situação cadastral">
                                <DateInput id="holding-status-date" value={d.registration_status_date} onChange={iso => patchDraft({ registration_status_date: iso })} variant="bare" className={cn("flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm", "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")} />
                            </Labeled>
                            <Labeled label="Telefone">
                                <Input id="holding-phone" value={d.phone} onChange={e => patchDraft({ phone: maskPhone(e.target.value) })} placeholder="(00) 00000-0000" inputMode="tel" className={INPUT} />
                            </Labeled>
                            <p className="text-[11px] text-muted-foreground sm:col-span-2 lg:col-span-3">Abertura, situação, natureza jurídica, porte e CNAEs vêm do Cartão CNPJ: envie um cartão novo para atualizá-los.</p>
                        </div>
                    )}
                />

                <Block
                    icon={<Briefcase className="h-4 w-4" />} title="Atividades econômicas (CNAE)" filled={cnaesFilled}
                    summary={cnaesFilled && r?.cnae_principal ? (
                        <ul className="space-y-1.5 text-sm text-foreground">
                            <li className="flex flex-wrap items-baseline gap-x-2">
                                <span className="font-mono text-xs text-muted-foreground">{r.cnae_principal.codigo}</span>
                                <span>{r.cnae_principal.descricao}</span>
                                <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">principal</span>
                            </li>
                            {r.cnaes_secundarios.map(c => (
                                <li key={c.codigo} className="flex flex-wrap items-baseline gap-x-2">
                                    <span className="font-mono text-xs text-muted-foreground">{c.codigo}</span>
                                    <span>{c.descricao}</span>
                                </li>
                            ))}
                            {r.cnaes_secundarios.length === 0 && <li className="text-xs text-muted-foreground">Sem atividades secundárias.</li>}
                        </ul>
                    ) : <p className="text-sm text-muted-foreground">Nenhuma atividade ainda. Envie o Cartão CNPJ — a IA lê a atividade principal e as secundárias.</p>}
                />

                <Block
                    icon={<MapPin className="h-4 w-4" />} title="Endereço da sede" filled={addressFilled} editing={open.address} onToggle={o => void toggle("address", o)} saving={saving === "address"}
                    summary={addressFilled ? <Sensitive as="p" className="text-sm text-foreground">{addressLine(holding.address)}</Sensitive> : <p className="text-sm text-muted-foreground">Nenhum endereço ainda. O Cartão CNPJ traz o endereço da sede, ou clique em Editar.</p>}
                    editor={<AddressEditor idPrefix="holding" value={d.address} onChange={address => patchDraft({ address })} />}
                />

                <Block
                    icon={<UserCog className="h-4 w-4" />} title="Administrador" filled={adminFilled} editing={open.admin} onToggle={o => void toggle("admin", o)} saving={saving === "admin"}
                    summary={adminFilled ? (
                        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
                            <Field label="Nome" value={holding.admin.name} />
                            <Field label="E-mail" value={dash(holding.admin.email)} />
                            <Field label="Telefone" value={dash(holding.admin.phone)} />
                            <Field label="Endereço" value={addressLine(holding.admin.address) ? <Sensitive>{addressLine(holding.admin.address)}</Sensitive> : muted("—")} />
                        </dl>
                    ) : <p className="text-sm text-muted-foreground">Quem responde pela holding: o sócio-administrador do contrato social. Clique em Editar.</p>}
                    editor={(
                        <div className="space-y-3">
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                <Labeled label="Nome">
                                    <Input id="admin-name" value={d.admin.name} onChange={e => patchDraft({ admin: { ...d.admin, name: e.target.value } })} className={INPUT} />
                                </Labeled>
                                <Labeled label="E-mail">
                                    <Input id="admin-email" type="email" value={d.admin.email} onChange={e => patchDraft({ admin: { ...d.admin, email: e.target.value } })} className={INPUT} />
                                </Labeled>
                                <Labeled label="Telefone">
                                    <Input id="admin-phone" value={d.admin.phone} onChange={e => patchDraft({ admin: { ...d.admin, phone: maskPhone(e.target.value) } })} inputMode="tel" className={INPUT} />
                                </Labeled>
                            </div>
                            <AddressEditor idPrefix="admin" value={d.admin.address} onChange={address => patchDraft({ admin: { ...d.admin, address } })} />
                        </div>
                    )}
                />

                <Block
                    icon={<UserRound className="h-4 w-4" />} title="Conta de acesso" filled={accountFilled} editing={open.account} onToggle={o => void toggle("account", o)} saving={saving === "account"}
                    summary={(
                        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
                            <Field label="Nome" value={dash(holding.full_name)} />
                            <Field label="E-mail de acesso" value={holding.email || muted("—")} />
                        </dl>
                    )}
                    editor={(
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <Labeled label="Nome">
                                <Input id="account-name" value={d.full_name} onChange={e => patchDraft({ full_name: e.target.value })} className={INPUT} />
                            </Labeled>
                            <Labeled label="E-mail de acesso">
                                <Input id="account-email" value={holding.email} readOnly className={cn(INPUT, "opacity-70")} title="O e-mail de acesso é o do login" />
                            </Labeled>
                        </div>
                    )}
                />
            </section>

            <section className="rounded-xl border border-border/80 bg-card">
                <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-3">
                    <div>
                        <h2 className="text-sm font-semibold text-foreground">Arquivos do proprietário</h2>
                        <p className="text-xs text-muted-foreground">O Cartão CNPJ, o contrato social e o que mais for da empresa. Os documentos de cada imóvel ficam na ficha do imóvel.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {PROFILE_DOC_CATEGORIES.map(c => uploadButton(c.id, c.label, { title: c.description }))}
                    </div>
                </header>
                <div className="space-y-5 p-4">
                    {documents.length === 0 && (
                        <p className="py-6 text-center text-sm text-muted-foreground">Nenhum arquivo ainda. Comece pelo Cartão CNPJ: a IA lê o cartão e preenche a ficha e as políticas contábeis.</p>
                    )}
                    {PROFILE_DOC_CATEGORIES.map(c => {
                        const list = byCategory.get(c.id);
                        if (!list || list.length === 0) return null;
                        return (
                            <div key={c.id} className="space-y-2">
                                <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{c.label} ({list.length})</h3>
                                <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                    {list.map(doc => {
                                        const name = doc.original_name || "arquivo";
                                        return (
                                            <li key={doc.id} className="group relative overflow-hidden rounded-lg border border-border/70 bg-muted/20">
                                                <button type="button" onClick={() => void openDocument(doc)} disabled={busy === doc.id} className="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-60" title={`Abrir ${name}`}>
                                                    <span className="flex items-center gap-2 px-3 py-3 text-sm text-foreground">
                                                        {isImageName(name) ? <ImageIcon className="h-4 w-4 shrink-0 text-blue-600" /> : <FileText className="h-4 w-4 shrink-0 text-rose-600" />}
                                                        <span className="line-clamp-1 break-all">{name}</span>
                                                    </span>
                                                    <span className="block px-3 pb-2 text-[10px] tabular-nums text-muted-foreground">
                                                        {formatDateBR(doc.created_at.slice(0, 10))}{doc.file_size ? ` · ${formatFileSize(doc.file_size)}` : ""}
                                                    </span>
                                                </button>
                                                <span className="absolute right-1 top-1 flex gap-0.5 opacity-0 focus-within:opacity-100 group-hover:opacity-100">
                                                    {doc.category === "cnpj_card" && (
                                                        <button type="button" onClick={() => void reread(doc)} disabled={busy === doc.id} title="Ler o cartão de novo e atualizar a ficha" aria-label={`Reler ${name}`} className="rounded bg-background/90 p-1 text-muted-foreground hover:text-emerald-600 disabled:opacity-50">
                                                            {busy === doc.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                                                        </button>
                                                    )}
                                                    <button type="button" onClick={() => void removeDocument(doc)} disabled={busy === doc.id} title="Excluir arquivo" aria-label={`Excluir ${name}`} className="rounded bg-background/90 p-1 text-muted-foreground hover:text-rose-600 disabled:opacity-50">
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </button>
                                                </span>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </div>
                        );
                    })}
                </div>
            </section>

            <section className="rounded-xl border border-border/80 bg-card">
                <header className="px-4 py-3">
                    <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-foreground"><Bell className="h-4 w-4 text-emerald-600" /> Preferências de notificação</h2>
                    <p className="text-xs text-muted-foreground">Salvas na sua conta: valem em qualquer dispositivo.</p>
                </header>
                <div className="space-y-3 border-t border-border/60 px-4 py-4">
                    <label className="flex items-center justify-between gap-3 text-sm text-foreground">
                        <span>Receber e-mails de novidades e dicas</span>
                        <input type="checkbox" checked={notifications.marketing} onChange={e => setNotification({ marketing: e.target.checked })} className="h-4 w-4 accent-emerald-600" />
                    </label>
                    <label className="flex items-center justify-between gap-3 text-sm text-foreground">
                        <span>Receber alertas de segurança da conta</span>
                        <input type="checkbox" checked={notifications.security} onChange={e => setNotification({ security: e.target.checked })} className="h-4 w-4 accent-emerald-600" />
                    </label>
                </div>
            </section>

            <section className="rounded-xl border border-rose-200 bg-card dark:border-rose-900/60">
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
                    <div>
                        <h2 className="inline-flex items-center gap-2 text-sm font-semibold text-rose-700 dark:text-rose-300"><ShieldAlert className="h-4 w-4" /> Excluir conta</h2>
                        <p className="text-xs text-muted-foreground">Apaga a holding, os imóveis, os contratos e todos os dados. Não dá para desfazer.</p>
                    </div>
                    <Button variant="destructive" size="sm" onClick={() => setShowDelete(true)}>Excluir conta</Button>
                </div>
            </section>

            {gateways && <GatewaysSection gateways={gateways} href={href} />}

            {showDelete && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="delete-account-title">
                    <div className="w-full max-w-md space-y-4 rounded-lg border border-border bg-background p-6 shadow-xl">
                        <h3 id="delete-account-title" className="text-xl font-bold text-foreground">Excluir conta?</h3>
                        <p className="text-muted-foreground">Esta ação é irreversível: a holding, os imóveis, os contratos e todos os seus dados serão apagados.</p>
                        <div className="flex justify-end gap-3">
                            <Button variant="outline" onClick={() => setShowDelete(false)} disabled={deleting}>Cancelar</Button>
                            <Button variant="destructive" onClick={() => void handleDeleteAccount()} disabled={deleting}>
                                {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                Excluir conta
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {viewer && <PdfViewerModal isOpen onClose={() => setViewer(null)} url={viewer.url} title={viewer.title} fileName={viewer.fileName} />}
        </div>
    );
}
