"use client";

/**
 * The owner's own connection to Banco Inter: the credentials of the integration the owner creates in the
 * Internet Banking PJ (client id, client secret, certificate and key). They are sent once, sealed on
 * the server and never shown again — this panel only ever sees what the server says about them (status,
 * account, the certificate's date, the permissions the bank granted) and what the bank answered when
 * the connection was last tested.
 */
import React, { useRef, useState } from "react";
import { AlertCircle, CheckCircle2, ChevronDown, ChevronUp, FileKey2, Landmark, Loader2, PlugZap, RefreshCw, ShieldCheck, Trash2, Upload, X } from "lucide-react";
import { Button } from "@kitnets/ui";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { formatDateBR } from "@/lib/dates";
import { Sensitive } from "@/components/privacy";
import { CONNECTION_STATUS_META, certificateStanding, type ConnectionsView, type InterConnectionView } from "@/lib/billing/connections";
import SettingsGroup from "./SettingsGroup";
import StripeConnectionCard from "./StripeConnectionCard";

interface Props {
    connections: ConnectionsView;
    /** `YYYY-MM-DD` in Brasília */
    today: string;
    onChange: (connections: ConnectionsView) => void;
}

type FieldErrors = Record<string, string>;

/** Permissions the integration needs, as the Internet Banking names the API. */
const PERMISSION_LABELS: Record<string, string> = {
    "boleto-cobranca.read": "API Cobrança — consultar cobranças",
    "boleto-cobranca.write": "API Cobrança — emitir e cancelar cobranças",
};
const REQUIRED = Object.keys(PERMISSION_LABELS);

const stamp = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
const plural = (n: number, one: string, many: string) => `${n.toLocaleString("pt-BR")} ${n === 1 ? one : many}`;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</dt>
            <dd className="mt-0.5 text-sm text-foreground">{children}</dd>
        </div>
    );
}

/** A .crt / .key picker: the file is read in the browser and travels as text, once, to be sealed. */
function PemFile({ id, label, accept, fileName, error, hint, onPick }: { id: string; label: string; accept: string; fileName: string | null; error?: string; hint: string; onPick: (name: string, text: string) => void }) {
    const input = useRef<HTMLInputElement>(null);
    return (
        <div>
            <Label htmlFor={id} className="text-xs">{label}</Label>
            <input
                ref={input}
                id={id}
                type="file"
                accept={accept}
                className="sr-only"
                onChange={async e => {
                    const file = e.target.files?.[0];
                    if (file) onPick(file.name, await file.text());
                    e.target.value = "";
                }}
            />
            <button
                type="button"
                onClick={() => input.current?.click()}
                className={cn("mt-1 flex h-9 w-full items-center gap-2 rounded-md border bg-background px-3 text-left text-sm hover:border-emerald-400", error ? "border-rose-400" : "border-input")}
            >
                {fileName ? <FileKey2 className="h-4 w-4 shrink-0 text-emerald-600" /> : <Upload className="h-4 w-4 shrink-0 text-muted-foreground" />}
                <span className={cn("truncate", !fileName && "text-muted-foreground")}>{fileName ?? "Escolher arquivo…"}</span>
            </button>
            <p className={cn("mt-1 text-xs", error ? "text-rose-600" : "text-muted-foreground")}>{error ?? hint}</p>
        </div>
    );
}

function InterDetails({ inter, today }: { inter: InterConnectionView; today: string }) {
    const cert = certificateStanding(inter.certificateExpiresAt, today);
    const lacking = REQUIRED.filter(s => !inter.scopes.includes(s));
    return (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-4">
            <Field label="Conta corrente">{inter.account ? <Sensitive>{inter.account}</Sensitive> : <span className="text-muted-foreground">não informada</span>}</Field>
            <Field label="Client ID"><Sensitive>{inter.clientIdTail ?? "—"}</Sensitive></Field>
            <Field label="Certificado">
                {inter.certificateExpiresAt ? (
                    <>
                        vence em {formatDateBR(inter.certificateExpiresAt.slice(0, 10))}
                        {cert && (
                            <span className={cn("block text-xs", cert.state === "ok" ? "text-muted-foreground" : cert.state === "renew" ? "text-amber-700 dark:text-amber-400" : "text-rose-600 dark:text-rose-400")}>
                                {cert.state === "expired" ? "vencido: renove a integração" : `${plural(cert.daysLeft, "dia", "dias")}${cert.state === "ok" ? "" : " — já pode ser renovado no Internet Banking"}`}
                            </span>
                        )}
                    </>
                ) : "—"}
            </Field>
            <Field label="Último teste">{inter.lastCheckedAt ? stamp(inter.lastCheckedAt) : <span className="text-muted-foreground">nunca</span>}</Field>
            <div className="col-span-2 md:col-span-4">
                <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Permissões</dt>
                <dd className="mt-1 flex flex-col gap-1 text-sm">
                    {REQUIRED.map(scope => {
                        const granted = inter.scopes.includes(scope);
                        return (
                            <span key={scope} className={cn("inline-flex items-center gap-1.5", granted ? "text-foreground" : "text-muted-foreground")}>
                                {granted ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <AlertCircle className={cn("h-4 w-4", inter.status === "CONNECTED" || lacking.length === REQUIRED.length ? "text-muted-foreground" : "text-rose-600")} />}
                                {PERMISSION_LABELS[scope]}
                                {!granted && <span className="text-xs">{inter.lastCheckedAt ? "— não concedida" : "— a confirmar no teste"}</span>}
                            </span>
                        );
                    })}
                </dd>
            </div>
        </dl>
    );
}

export default function ConnectionsPanel({ connections, today, onChange }: Props) {
    const { inter, available, sandboxAllowed } = connections;
    const [editing, setEditing] = useState(false);
    const [helpOpen, setHelpOpen] = useState(!inter);
    const [busy, setBusy] = useState<"save" | "test" | "delete" | null>(null);
    const [errors, setErrors] = useState<FieldErrors>({});
    const [confirmDelete, setConfirmDelete] = useState(false);
    // an update keeps the connection's environment unless the owner changes it
    const blank = () => ({ client_id: "", client_secret: "", account: "", environment: (inter?.environment ?? "PRODUCTION") as string });
    const [form, setForm] = useState(blank);
    const [certificate, setCertificate] = useState<{ name: string; text: string } | null>(null);
    const [privateKey, setPrivateKey] = useState<{ name: string; text: string } | null>(null);

    const formOpen = available && (editing || !inter);
    const meta = inter ? CONNECTION_STATUS_META[inter.status] : null;

    const call = async (kind: "save" | "test" | "delete", url: string, init: RequestInit) => {
        setBusy(kind);
        setErrors({});
        try {
            const res = await fetch(url, init);
            const json = await res.json().catch(() => ({}));
            if (!res.ok) {
                setErrors(json.errors ?? { _form: typeof json.error === "string" ? json.error : "Não foi possível concluir." });
                return false;
            }
            onChange(json as ConnectionsView);
            return true;
        } catch {
            setErrors({ _form: "Erro de conexão. Tente novamente." });
            return false;
        } finally {
            setBusy(null);
        }
    };

    const save = async () => {
        const ok = await call("save", "/api/faturas/conexoes/inter", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...form, certificate: certificate?.text ?? "", private_key: privateKey?.text ?? "" }),
        });
        if (!ok) return;
        // the secrets leave the page as soon as the server has them
        setForm(f => ({ ...blank(), environment: f.environment }));
        setCertificate(null);
        setPrivateKey(null);
        setEditing(false);
    };
    const test = () => void call("test", "/api/faturas/conexoes/inter/testar", { method: "POST" });
    const remove = async () => {
        if (await call("delete", "/api/faturas/conexoes/inter", { method: "DELETE" })) setConfirmDelete(false);
    };

    return (
        <div className="space-y-5">
            <SettingsGroup
                tone="orange"
                icon={<Landmark className="h-4 w-4" />}
                title="Banco Inter — boleto e PIX"
                badges={<>
                    {meta && <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider", meta.pill)}>{meta.label}</span>}
                    {inter?.environment === "SANDBOX" && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">Ambiente de testes</span>}
                    {!inter && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-700 dark:bg-slate-800 dark:text-slate-300">Não conectado</span>}
                </>}
                description="A cobrança sai pela integração da sua própria conta PJ no Inter: o dinheiro cai direto na sua conta. As credenciais ficam cifradas e nunca voltam a ser exibidas."
                actions={inter && available ? <>
                    <Button variant="outline" size="sm" onClick={test} disabled={busy !== null}>
                        {busy === "test" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <PlugZap className="mr-1 h-4 w-4" />} Testar conexão
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => { setEditing(v => !v); setErrors({}); }} disabled={busy !== null}>
                        <RefreshCw className="mr-1 h-4 w-4" /> Atualizar credenciais
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setConfirmDelete(true)} disabled={busy !== null} title="Remover as credenciais" aria-label="Remover as credenciais do Banco Inter" className="text-muted-foreground hover:text-rose-600">
                        <Trash2 className="h-4 w-4" />
                    </Button>
                </> : undefined}
                bodyClassName="space-y-4 p-4"
            >
                    {!available && (
                        <p role="note" className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200">
                            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                            A conexão ainda não pode ser feita neste servidor: falta configurar a chave que cifra as credenciais (BILLING_ENCRYPTION_KEY). Nada é guardado sem ela.
                        </p>
                    )}

                    {inter && <InterDetails inter={inter} today={today} />}

                    {inter?.status === "ERROR" && inter.lastError && (
                        <p role="alert" className="flex items-start gap-2 rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300">
                            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {inter.lastError}
                        </p>
                    )}
                    {inter?.status === "CONNECTED" && !inter.usable && inter.environment === "SANDBOX" && (
                        <p role="note" className="text-sm text-amber-700 dark:text-amber-400">Esta conexão é do ambiente de testes do banco e não emite cobranças aqui. Cadastre a integração de produção.</p>
                    )}
                    {inter?.status === "CONNECTED" && inter.usable && (
                        <p className="flex items-start gap-1.5 text-sm text-emerald-700 dark:text-emerald-400">
                            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /> O banco aceitou as credenciais. As faturas já podem ser emitidas por esta conexão: o boleto e o PIX saem pela sua conta e o banco avisa o Kitnets quando o inquilino paga.
                        </p>
                    )}

                    {formOpen && (
                        <div className="space-y-3 rounded-lg border border-border/70 p-3">
                            {inter && (
                                <p className="text-xs text-muted-foreground">
                                    Envie só o que mudou: o que ficar em branco continua como está. Ao renovar a integração, o Client ID e o Client Secret são os mesmos — bastam o novo .crt e o novo .key, juntos.
                                </p>
                            )}
                            <div className="grid gap-3 md:grid-cols-2">
                                <div>
                                    <Label htmlFor="inter-client-id" className="text-xs">Client ID</Label>
                                    <Input id="inter-client-id" value={form.client_id} onChange={e => setForm(f => ({ ...f, client_id: e.target.value }))} autoComplete="off" spellCheck={false} placeholder={inter ? "manter o atual" : ""} className="mt-1 h-9 font-mono text-xs" aria-invalid={Boolean(errors.client_id)} />
                                    {errors.client_id && <p className="mt-1 text-xs text-rose-600">{errors.client_id}</p>}
                                </div>
                                <div>
                                    <Label htmlFor="inter-client-secret" className="text-xs">Client Secret</Label>
                                    <Input id="inter-client-secret" type="password" value={form.client_secret} onChange={e => setForm(f => ({ ...f, client_secret: e.target.value }))} autoComplete="new-password" spellCheck={false} placeholder={inter ? "manter o atual" : ""} className="mt-1 h-9 font-mono text-xs" aria-invalid={Boolean(errors.client_secret)} />
                                    {errors.client_secret && <p className="mt-1 text-xs text-rose-600">{errors.client_secret}</p>}
                                </div>
                                <PemFile id="inter-certificate" label="Certificado (.crt)" accept=".crt,.cer,.pem" fileName={certificate?.name ?? null} error={errors.certificate} hint={inter ? "Em branco: mantém o certificado atual." : "O arquivo .crt do download da integração."} onPick={(name, text) => setCertificate({ name, text })} />
                                <PemFile id="inter-private-key" label="Chave privada (.key)" accept=".key,.pem" fileName={privateKey?.name ?? null} error={errors.private_key} hint={inter ? "Em branco: mantém a chave atual." : "O arquivo .key do mesmo download."} onPick={(name, text) => setPrivateKey({ name, text })} />
                                <div>
                                    <Label htmlFor="inter-account" className="text-xs">Conta corrente (opcional)</Label>
                                    <Input id="inter-account" value={form.account} onChange={e => setForm(f => ({ ...f, account: e.target.value.replace(/[^\d-]/g, "") }))} inputMode="numeric" placeholder={inter?.account ? "manter a atual" : "só números, com o dígito"} className="mt-1 h-9" aria-invalid={Boolean(errors.account)} />
                                    <p className={cn("mt-1 text-xs", errors.account ? "text-rose-600" : "text-muted-foreground")}>{errors.account ?? "Necessária quando a integração atende mais de uma conta."}</p>
                                </div>
                                {sandboxAllowed && (
                                    <div>
                                        <Label htmlFor="inter-environment" className="text-xs">Ambiente</Label>
                                        <select id="inter-environment" className="mt-1 flex h-9 w-full rounded-md border bg-background px-2 text-sm" value={form.environment} onChange={e => setForm(f => ({ ...f, environment: e.target.value }))}>
                                            <option value="PRODUCTION">Produção</option>
                                            <option value="SANDBOX">Testes (sandbox do banco)</option>
                                        </select>
                                        {errors.environment && <p className="mt-1 text-xs text-rose-600">{errors.environment}</p>}
                                    </div>
                                )}
                            </div>
                            <div className="flex flex-wrap items-center gap-3">
                                <Button onClick={save} disabled={busy !== null}>
                                    {busy === "save" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <PlugZap className="mr-1 h-4 w-4" />} Salvar e testar
                                </Button>
                                {inter && <Button variant="ghost" onClick={() => { setEditing(false); setErrors({}); }} disabled={busy !== null}>Cancelar</Button>}
                                <span className="text-xs text-muted-foreground">Ao salvar, o banco é consultado na hora para confirmar as credenciais.</span>
                            </div>
                        </div>
                    )}

                    {errors._form && (
                        <p role="alert" className="flex items-start gap-2 text-sm text-rose-600"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {errors._form}</p>
                    )}

                    <div className="rounded-lg border border-border/70">
                        <button type="button" onClick={() => setHelpOpen(v => !v)} className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-medium text-foreground" aria-expanded={helpOpen}>
                            Como criar a integração no Internet Banking do Inter
                            {helpOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                        </button>
                        {helpOpen && (
                            <ol className="list-decimal space-y-1.5 border-t border-border/60 px-3 py-3 pl-8 text-sm text-muted-foreground">
                                <li>Entre no Internet Banking PJ e abra o menu <span className="font-medium text-foreground">Integrar → Nova integração</span>.</li>
                                <li>Dê um nome (por exemplo, &ldquo;Kitnets — cobrança&rdquo;) e, em permissões, marque a <span className="font-medium text-foreground">API Cobrança (Boleto com Pix)</span>: emitir/cancelar e consultar cobranças.</li>
                                <li>Envie o formulário. O banco analisa o pedido; enquanto isso a integração fica &ldquo;Em validação&rdquo; e um e-mail avisa quando terminar.</li>
                                <li>Aprovada, vá em <span className="font-medium text-foreground">Integrar → Minhas integrações</span>, abra os três pontos da integração e escolha <span className="font-medium text-foreground">Download chave e certificado</span>.</li>
                                <li>Guarde o <span className="font-medium text-foreground">Client ID</span> e o <span className="font-medium text-foreground">Client Secret</span> que aparecem na tela — o banco não os mostra de novo — e os dois arquivos baixados (.crt e .key).</li>
                                <li>Quando o status passar a &ldquo;Ativo&rdquo;, preencha os campos acima e salve.</li>
                                <li>O certificado vale um ano. A partir de 90 dias antes do vencimento o banco libera &ldquo;Renovar&rdquo;: baixe os novos arquivos e envie-os aqui.</li>
                            </ol>
                        )}
                    </div>
            </SettingsGroup>

            <StripeConnectionCard connections={connections} onChange={onChange} />

            {confirmDelete && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Remover as credenciais do Banco Inter">
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => busy === null && setConfirmDelete(false)} />
                    <div className="relative w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl">
                        <button type="button" onClick={() => setConfirmDelete(false)} disabled={busy !== null} className="absolute right-4 top-4 text-muted-foreground hover:text-foreground" aria-label="Fechar"><X className="h-5 w-5" /></button>
                        <h2 className="mb-2 text-lg font-bold text-foreground">Remover as credenciais?</h2>
                        <p className="text-sm text-muted-foreground">As credenciais do Banco Inter são apagadas daqui e as faturas deixam de poder ser emitidas até uma nova conexão. A integração continua existindo no banco: para encerrá-la de vez, cancele-a no Internet Banking.</p>
                        <div className="mt-5 flex gap-3">
                            <Button variant="outline" className="flex-1" onClick={() => setConfirmDelete(false)} disabled={busy !== null}>Voltar</Button>
                            <Button variant="destructive" className="flex-1" onClick={remove} disabled={busy !== null}>
                                {busy === "delete" ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Removendo…</> : "Remover"}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
