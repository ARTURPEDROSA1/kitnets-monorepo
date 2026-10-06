"use client";

/**
 * The choices the contract is written from (lib/contract/template.ts ContractOptions), with the
 * landlord-friendly defaults already set. Changing them does not touch the text until "Reescrever o
 * texto" — so a hand edit is never lost by surprise.
 */
import React from "react";
import { cn } from "@/lib/utils";
import { GUARANTEE_LABELS, type ContractOptions, type GuaranteeKind } from "@/lib/contract/template";

interface Props {
    options: ContractOptions;
    onChange: (next: ContractOptions) => void;
    disabled: boolean;
    /** a fixed term (the early-exit clause exists) */
    fixedTerm: boolean;
    /** the lease is managed by an agency (payments go to it) */
    agency: boolean;
}

const inputCls = "h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm text-foreground disabled:opacity-60";

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
    return (
        <label className="block space-y-1">
            <span className="text-xs font-medium text-foreground">{label}</span>
            {children}
            {hint && <span className="block text-[11px] leading-snug text-muted-foreground">{hint}</span>}
        </label>
    );
}

function NumberField({ value, onChange, disabled, min, max, step = 1, suffix }: { value: number | null; onChange: (v: number | null) => void; disabled: boolean; min: number; max: number; step?: number; suffix?: string }) {
    return (
        <div className="relative">
            <input
                type="number" inputMode="decimal" min={min} max={max} step={step} disabled={disabled}
                value={value ?? ""} onChange={e => onChange(e.target.value === "" ? null : Math.min(max, Math.max(min, Number(e.target.value))))}
                className={cn(inputCls, suffix && "pr-14")}
            />
            {suffix && <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-xs text-muted-foreground">{suffix}</span>}
        </div>
    );
}

function Check({ checked, onChange, disabled, children }: { checked: boolean; onChange: (v: boolean) => void; disabled: boolean; children: React.ReactNode }) {
    return (
        <label className="flex items-start gap-2 text-sm text-foreground">
            <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-input accent-emerald-600" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} />
            <span>{children}</span>
        </label>
    );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <fieldset className="space-y-3 rounded-xl border border-border/80 bg-background/60 p-3">
            <legend className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</legend>
            {children}
        </fieldset>
    );
}

export default function ContractOptionsPanel({ options: o, onChange, disabled, fixedTerm, agency }: Props) {
    const set = <K extends keyof ContractOptions>(key: K, value: ContractOptions[K]) => onChange({ ...o, [key]: value });
    return (
        <div className="space-y-3">
            <Group title="Garantia">
                <Row label="Modalidade" hint="A lei admite uma só garantia por contrato (art. 37).">
                    <select className={inputCls} disabled={disabled} value={o.guarantee} onChange={e => set("guarantee", e.target.value as GuaranteeKind)}>
                        {(Object.keys(GUARANTEE_LABELS) as GuaranteeKind[]).map(g => <option key={g} value={g}>{GUARANTEE_LABELS[g]}</option>)}
                    </select>
                </Row>
                {o.guarantee === "FIANCA" && <Check checked={o.guarantorSpouse} disabled={disabled} onChange={v => set("guarantorSpouse", v)}>Fiador casado ou em união estável (o cônjuge assina)</Check>}
                {o.guarantee === "NENHUMA" && <p className="text-[11px] leading-snug text-muted-foreground">Sem garantia, a falta de pagamento permite pedir liminar de despejo em 15 dias (art. 59, § 1º, IX).</p>}
            </Group>

            {fixedTerm && (
                <Group title="Saída antes do prazo">
                    <div className="grid grid-cols-2 gap-2">
                        <Row label="Multa"><NumberField value={o.earlyExitFineRents} min={0} max={12} disabled={disabled} suffix="aluguéis" onChange={v => set("earlyExitFineRents", v ?? 0)} /></Row>
                        <Row label="Aviso prévio"><NumberField value={o.noticeDays} min={0} max={180} disabled={disabled} suffix="dias" onChange={v => set("noticeDays", v ?? 30)} /></Row>
                    </div>
                    <Row label="Sem multa depois de" hint="0 = a multa vale até o fim do prazo. A multa é sempre proporcional ao tempo que falta (art. 4º).">
                        <NumberField value={o.fineWaivedAfterMonths} min={0} max={120} disabled={disabled} suffix="meses" onChange={v => set("fineWaivedAfterMonths", v ?? 0)} />
                    </Row>
                </Group>
            )}

            <Group title="Atraso no pagamento">
                <div className="grid grid-cols-2 gap-2">
                    <Row label="Multa"><NumberField value={o.lateFeePct} min={0} max={20} step={0.5} disabled={disabled} suffix="%" onChange={v => set("lateFeePct", v ?? 0)} /></Row>
                    <Row label="Juros"><NumberField value={o.interestPctMonth} min={0} max={10} step={0.1} disabled={disabled} suffix="% a.m." onChange={v => set("interestPctMonth", v ?? 0)} /></Row>
                </div>
                <Row label="Honorários na cobrança extrajudicial" hint="0 = sem a cláusula.">
                    <NumberField value={o.collectionFeePct} min={0} max={20} disabled={disabled} suffix="%" onChange={v => set("collectionFeePct", v ?? 0)} />
                </Row>
            </Group>

            {!agency && (
                <Group title="Pagamento">
                    <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
                        {(["INVOICE", "PIX"] as const).map(p => (
                            <button key={p} type="button" disabled={disabled} onClick={() => set("payment", p)}
                                className={cn("rounded-md px-2 py-1.5 text-xs font-medium", o.payment === p ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                                {p === "INVOICE" ? "Boleto/PIX por e-mail" : "Chave PIX"}
                            </button>
                        ))}
                    </div>
                    {o.payment === "PIX" && <Row label="Chave PIX do locador"><input className={inputCls} disabled={disabled} value={o.pixKey} maxLength={140} onChange={e => set("pixKey", e.target.value)} placeholder="CNPJ, e-mail, telefone ou chave aleatória" /></Row>}
                </Group>
            )}

            <Group title="Uso do imóvel">
                <Row label="Animais de estimação">
                    <select className={inputCls} disabled={disabled} value={o.pets} onChange={e => set("pets", e.target.value as ContractOptions["pets"])}>
                        <option value="SMALL">Permitidos, de pequeno porte</option>
                        <option value="ALLOWED">Permitidos</option>
                        <option value="NONE">Só com autorização escrita</option>
                    </select>
                </Row>
                <Row label="Moradores, no máximo" hint="Em branco = sem limite no contrato.">
                    <NumberField value={o.maxOccupants} min={1} max={20} disabled={disabled} suffix="pessoas" onChange={v => set("maxOccupants", v)} />
                </Row>
                <Check checked={o.furnished} disabled={disabled} onChange={v => set("furnished", v)}>Mobiliado (inventário como anexo)</Check>
            </Group>

            <Group title="Seguro e venda">
                <Row label="Seguro contra incêndio">
                    <select className={inputCls} disabled={disabled} value={o.fireInsurance} onChange={e => set("fireInsurance", e.target.value as ContractOptions["fireInsurance"])}>
                        <option value="TENANT">Pago pelo inquilino</option>
                        <option value="LANDLORD">Pago pelo proprietário</option>
                    </select>
                </Row>
                <Row label="Se o imóvel for vendido">
                    <select className={inputCls} disabled={disabled} value={o.saleClause} onChange={e => set("saleClause", e.target.value as ContractOptions["saleClause"])}>
                        <option value="TERMINATE">O comprador pode encerrar (90 dias)</option>
                        <option value="KEEP">O contrato continua valendo</option>
                    </select>
                </Row>
            </Group>

            <Group title="Assinatura">
                <Check checked={o.witnesses} disabled={disabled} onChange={v => set("witnesses", v)}>Com 2 testemunhas</Check>
                <p className="text-[11px] leading-snug text-muted-foreground">Assinado pelo gov.br, o contrato dispensa testemunhas (art. 784, § 4º, do CPC).</p>
            </Group>
        </div>
    );
}
