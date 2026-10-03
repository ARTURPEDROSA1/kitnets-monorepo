"use client";

/**
 * The owner's Stripe account connected to the Kitnets platform (Connect): "Conectar com Stripe"
 * sends the owner to Stripe to sign in to their own account (or open one) and come back; the card
 * shows how the account stands as Stripe reports it — never a key, there is none to show.
 */
import React, { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, CheckCircle2, CreditCard, ExternalLink, Loader2, RefreshCw, Trash2, X } from "lucide-react";
import { Button } from "@kitnets/ui";
import { cn } from "@/lib/utils";
import { Sensitive } from "@/components/privacy";
import { CONNECTION_STATUS_META, type ConnectionsView, type StripeConnectionView } from "@/lib/billing/connections";
import SettingsGroup from "./SettingsGroup";

interface Props {
    connections: ConnectionsView;
    onChange: (connections: ConnectionsView) => void;
}

const stamp = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(iso));

/** Stripe's requirement codes, in words the owner understands; anything else is shown as Stripe names it. */
const REQUIREMENT_LABELS: Record<string, string> = {
    external_account: "conta bancária para receber",
    "business_profile.url": "site ou descrição do negócio",
    "business_profile.mcc": "ramo de atividade",
    "tos_acceptance.date": "aceite dos termos da Stripe",
    "representative.verification.document": "documento do representante",
    "company.verification.document": "documento da empresa",
};

function Standing({ stripe }: { stripe: StripeConnectionView }) {
    const line = (ok: boolean, text: string) => (
        <span className={cn("inline-flex items-center gap-1.5 text-sm", ok ? "text-foreground" : "text-muted-foreground")}>
            {ok ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <AlertCircle className="h-4 w-4 text-amber-600" />} {text}
        </span>
    );
    return (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-4">
            <div>
                <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Conta</dt>
                <dd className="mt-0.5 text-sm text-foreground">{stripe.name ? <Sensitive>{stripe.name}</Sensitive> : "—"} <Sensitive className="text-xs text-muted-foreground">{stripe.accountTail ?? ""}</Sensitive></dd>
            </div>
            <div>
                <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">País</dt>
                <dd className="mt-0.5 text-sm text-foreground">{stripe.country ?? "—"}</dd>
            </div>
            <div>
                <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Última leitura</dt>
                <dd className="mt-0.5 text-sm text-foreground">{stripe.lastCheckedAt ? stamp(stripe.lastCheckedAt) : "—"}</dd>
            </div>
            <div>
                <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Conectada em</dt>
                <dd className="mt-0.5 text-sm text-foreground">{stripe.configuredAt ? stamp(stripe.configuredAt) : "—"}</dd>
            </div>
            <div className="col-span-2 md:col-span-4">
                <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Situação na Stripe</dt>
                <dd className="mt-1 flex flex-col gap-1">
                    {line(stripe.chargesEnabled, stripe.chargesEnabled ? "pode receber pagamentos por cartão" : "a Stripe ainda não liberou pagamentos nesta conta")}
                    {line(stripe.payoutsEnabled, stripe.payoutsEnabled ? "pode transferir o saldo para a sua conta bancária" : "as transferências para a sua conta bancária ainda não foram liberadas")}
                    {stripe.requirementsDue.length > 0 && (
                        <span className="text-xs text-amber-700 dark:text-amber-400">A Stripe ainda pede: {stripe.requirementsDue.map(r => REQUIREMENT_LABELS[r] ?? r).join(", ")}. Complete no painel da Stripe e clique em &ldquo;Atualizar&rdquo;.</span>
                    )}
                    {stripe.lastError && <span role="alert" className="text-xs text-rose-600">{stripe.lastError}</span>}
                </dd>
            </div>
        </dl>
    );
}

export default function StripeConnectionCard({ connections, onChange }: Props) {
    const { stripe = null, stripeAvailable = false } = connections;
    const router = useRouter();
    const searchParams = useSearchParams();
    const [busy, setBusy] = useState<"connect" | "refresh" | "delete" | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const meta = stripe ? CONNECTION_STATUS_META[stripe.status] : null;

    // what the return from Stripe left in the URL
    useEffect(() => {
        const outcome = searchParams.get("stripe");
        if (!outcome) return;
        if (outcome === "ok") setNotice("Conta Stripe conectada.");
        else if (outcome === "cancelado") setError("A conexão com a Stripe não foi concluída.");
        else setError(searchParams.get("motivo") || "A conexão com a Stripe falhou.");
        const params = new URLSearchParams(searchParams.toString());
        params.delete("stripe");
        params.delete("motivo");
        router.replace(`?${params.toString()}`, { scroll: false });
    }, [searchParams, router]);

    const call = async (kind: "refresh" | "delete", init: RequestInit) => {
        setBusy(kind);
        setError(null);
        setNotice(null);
        try {
            const res = await fetch("/api/faturas/conexoes/stripe", init);
            const json = await res.json().catch(() => ({}));
            if (!res.ok) { setError(typeof json.error === "string" ? json.error : "Não foi possível concluir."); return false; }
            onChange(json as ConnectionsView);
            return true;
        } catch {
            setError("Erro de conexão. Tente novamente.");
            return false;
        } finally {
            setBusy(null);
        }
    };
    const connect = async () => {
        setBusy("connect");
        setError(null);
        setNotice(null);
        try {
            const res = await fetch("/api/faturas/conexoes/stripe/iniciar", { method: "POST" });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || typeof json.url !== "string") { setError(typeof json.error === "string" ? json.error : "Não foi possível iniciar a conexão."); setBusy(null); return; }
            window.location.assign(json.url as string);
        } catch {
            setError("Erro de conexão. Tente novamente.");
            setBusy(null);
        }
    };

    return (
        <SettingsGroup
            tone="violet"
            icon={<CreditCard className="h-4 w-4" />}
            title="Stripe — cartão de crédito"
            badges={<>
                {meta && <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider", meta.pill)}>{meta.label}</span>}
                {stripe?.environment === "SANDBOX" && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">Conta de teste</span>}
                {!stripe && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-700 dark:bg-slate-800 dark:text-slate-300">Não conectado</span>}
            </>}
            description={<>O inquilino paga com cartão numa página da Stripe e o dinheiro cai na <span className="font-medium text-foreground">sua</span> conta Stripe, que transfere para o seu banco. A taxa do cartão é somada à fatura (Configuração), então você recebe o valor cheio.</>}
            actions={stripeAvailable ? (
                        stripe ? (
                            <>
                                <Button variant="outline" size="sm" onClick={() => void call("refresh", { method: "POST" })} disabled={busy !== null}>
                                    {busy === "refresh" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />} Atualizar
                                </Button>
                                <Button variant="outline" size="sm" onClick={connect} disabled={busy !== null} title="Conectar outra conta Stripe">
                                    {busy === "connect" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ExternalLink className="mr-1 h-4 w-4" />} Trocar conta
                                </Button>
                                <Button variant="ghost" size="icon" onClick={() => setConfirmDelete(true)} disabled={busy !== null} title="Desconectar" aria-label="Desconectar a conta Stripe" className="text-muted-foreground hover:text-rose-600">
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </>
                        ) : (
                            <Button onClick={connect} disabled={busy !== null}>
                                {busy === "connect" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ExternalLink className="mr-1 h-4 w-4" />} Conectar com Stripe
                            </Button>
                        )
            ) : undefined}
            bodyClassName="space-y-3 p-4"
        >
                {!stripeAvailable && <p className="text-sm text-muted-foreground">O pagamento por cartão não está configurado neste servidor.</p>}
                {notice && <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">{notice}</p>}
                {error && <p role="alert" className="inline-flex items-center gap-1 text-sm text-rose-600"><AlertCircle className="h-4 w-4" /> {error}</p>}
                {stripe ? <Standing stripe={stripe} /> : stripeAvailable && (
                    <p className="text-sm text-muted-foreground">
                        Você será levado à Stripe para entrar na sua conta (ou criar uma, em nome da sua empresa) e autorizar o Kitnets a abrir cobranças nela. Nenhuma senha ou chave da Stripe passa pelo Kitnets.
                    </p>
                )}

            {confirmDelete && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Desconectar a conta Stripe">
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => busy === null && setConfirmDelete(false)} />
                    <div className="relative w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
                        <button type="button" onClick={() => setConfirmDelete(false)} disabled={busy !== null} className="absolute right-4 top-4 text-muted-foreground hover:text-foreground" aria-label="Fechar"><X className="h-5 w-5" /></button>
                        <h2 className="mb-2 text-lg font-bold text-foreground">Desconectar a conta Stripe?</h2>
                        <p className="text-sm text-muted-foreground">O Kitnets deixa de abrir pagamentos por cartão na sua conta. A conta Stripe em si continua existindo, com o saldo e o histórico; você pode conectá-la de novo quando quiser.</p>
                        <div className="mt-5 flex gap-3">
                            <Button variant="outline" className="flex-1" onClick={() => setConfirmDelete(false)} disabled={busy !== null}>Voltar</Button>
                            <Button variant="destructive" className="flex-1" onClick={async () => { if (await call("delete", { method: "DELETE" })) setConfirmDelete(false); }} disabled={busy !== null}>
                                {busy === "delete" ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Desconectando…</> : "Desconectar"}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </SettingsGroup>
    );
}
