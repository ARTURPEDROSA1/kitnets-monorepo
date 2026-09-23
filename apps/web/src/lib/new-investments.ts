/**
 * Novos Investimentos — an off-plan property ("na planta") from the contract to the keys.
 *
 * Three pieces, all pure here so the API, the dashboard and the tests share one definition:
 *
 *   schedules  the contract's quadro resumo: "36 parcelas de R$ 3.547,50 a partir de 20/10/2026".
 *              Expanding one gives the forecast instalments — money that is *due*, never money paid.
 *   payments   what the owner actually paid (or plans to), one receipt each.
 *   matching   a payment answers a forecast instalment when it falls in the same month with the
 *              same kind, so the chart never counts a month twice (realised replaces forecast).
 */
import { addMonthsClamped, parseISODateLocal, toISODate } from "./dates";
import { round2 } from "./property-income";

export type PaymentKind =
    | "SINAL"
    | "ENTRADA"
    | "PARCELA"
    | "PARCELA_ANUAL"
    | "INTERCALADA"
    | "INICIO_OBRAS"
    | "CHAVES"
    | "AMORTIZACAO"
    | "CORRECAO"
    | "TAXAS"
    | "OUTROS";

export type Periodicity = "SINGLE" | "MONTHLY" | "QUARTERLY" | "SEMIANNUAL" | "ANNUAL";
export type IndexCode = "NONE" | "INCC" | "IGPM" | "IPCA" | "CUB" | "OTHER";
export type PaymentStatus = "PLANNED" | "PAID";
export type InvestmentStatus = "ACTIVE" | "COMPLETED" | "ARCHIVED";
export type InvestmentKind = "APARTMENT" | "STUDIO" | "HOUSE" | "PARKING" | "LOT" | "COMMERCIAL" | "OTHER";
export type DocumentKind = "CONTRACT" | "MARKETING" | "PHOTO" | "LAYOUT" | "RECEIPT" | "OTHER";

export const PAYMENT_KINDS: ReadonlyArray<{ kind: PaymentKind; label: string; short: string; hint: string }> = [
    { kind: "SINAL", label: "Sinal / reserva", short: "Sinal", hint: "Valor pago para reservar a unidade, antes do contrato" },
    { kind: "ENTRADA", label: "Entrada", short: "Entrada", hint: "Entrada do contrato, à vista ou em poucas parcelas" },
    { kind: "PARCELA", label: "Parcela mensal", short: "Mensais", hint: "Parcela do parcelamento direto com a construtora" },
    { kind: "PARCELA_ANUAL", label: "Parcela anual", short: "Anuais", hint: "Parcela anual (balão) prevista no contrato" },
    { kind: "INTERCALADA", label: "Intercalada", short: "Intercaladas", hint: "Reforço semestral ou parcela fora do fluxo mensal" },
    { kind: "INICIO_OBRAS", label: "Início de obras", short: "Início de obras", hint: "Valor devido quando a obra começa, antes das chaves" },
    { kind: "CHAVES", label: "Parcela das chaves", short: "Chaves", hint: "Valor pago na entrega das chaves" },
    { kind: "AMORTIZACAO", label: "Amortização", short: "Amortizações", hint: "Pagamento extra que reduz o saldo devedor" },
    { kind: "CORRECAO", label: "Correção do índice", short: "Correções", hint: "INCC, IGP-M ou CUB cobrado à parte da parcela" },
    { kind: "TAXAS", label: "Taxas e impostos", short: "Taxas", hint: "ITBI, registro, escritura, taxa de interveniência" },
    { kind: "OUTROS", label: "Outros", short: "Outros", hint: "Qualquer outro desembolso do investimento" },
];

export const PAYMENT_KIND_VALUES = PAYMENT_KINDS.map(k => k.kind) as PaymentKind[];

export const PAYMENT_KIND_LABELS: Record<PaymentKind, string> = Object.fromEntries(
    PAYMENT_KINDS.map(k => [k.kind, k.label])
) as Record<PaymentKind, string>;

export const PERIODICITY_LABELS: Record<Periodicity, string> = {
    SINGLE: "parcela única",
    MONTHLY: "mensal",
    QUARTERLY: "trimestral",
    SEMIANNUAL: "semestral",
    ANNUAL: "anual",
};

export const PERIODICITY_MONTHS: Record<Periodicity, number> = {
    SINGLE: 0,
    MONTHLY: 1,
    QUARTERLY: 3,
    SEMIANNUAL: 6,
    ANNUAL: 12,
};

export const INDEX_LABELS: Record<IndexCode, string> = {
    NONE: "Sem correção",
    INCC: "INCC-M",
    IGPM: "IGP-M",
    IPCA: "IPCA",
    CUB: "CUB",
    OTHER: "Outro",
};

export const INVESTMENT_KIND_LABELS: Record<InvestmentKind, string> = {
    APARTMENT: "Apartamento",
    STUDIO: "Studio",
    HOUSE: "Casa",
    PARKING: "Vaga de garagem",
    LOT: "Lote / terreno",
    COMMERCIAL: "Sala comercial",
    OTHER: "Outro",
};

export const DOCUMENT_KIND_LABELS: Record<DocumentKind, string> = {
    CONTRACT: "Contrato",
    MARKETING: "Material de divulgação",
    PHOTO: "Fotos",
    LAYOUT: "Plantas",
    RECEIPT: "Comprovante",
    OTHER: "Outros",
};

// ── Row shapes (what the API returns) ────────────────────────────────

export interface NewInvestment {
    id: string;
    name: string;
    description: string | null;
    developer: string | null;
    unit_label: string | null;
    kind: InvestmentKind;
    address: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    total_price: number;
    down_payment: number;
    financed_amount: number;
    contract_date: string | null;
    keys_expected_on: string | null;
    keys_delivered_on: string | null;
    index_before_keys: IndexCode;
    index_after_keys: IndexCode;
    estimated_rent: number | null;
    rent_start_on: string | null;
    rent_adjustment_pct: number;
    rent_vacancy_pct: number;
    rent_costs_pct: number;
    status: InvestmentStatus;
    promoted_property_id: string | null;
    promoted_at: string | null;
    cover_path: string | null;
    notes: string | null;
    created_at: string;
    updated_at: string;
}

export interface InvestmentSchedule {
    id: string;
    investment_id: string;
    label: string;
    kind: PaymentKind;
    installments: number;
    amount: number;
    first_due_on: string;
    periodicity: Periodicity;
    index_code: IndexCode;
    position: number;
}

export interface InvestmentPayment {
    id: string;
    investment_id: string;
    due_on: string;
    paid_on: string | null;
    kind: PaymentKind;
    amount: number;
    correction_amount: number;
    installment_number: number | null;
    status: PaymentStatus;
    receipt_path: string | null;
    receipt_name: string | null;
    notes: string | null;
    source: "MANUAL" | "SCHEDULE" | "IMPORT";
    created_at: string;
    updated_at: string;
}

export interface InvestmentDocument {
    id: string;
    investment_id: string;
    kind: DocumentKind;
    storage_path: string;
    file_name: string | null;
    mime_type: string | null;
    size_bytes: number | null;
    created_at: string;
}

// ── Schedule expansion ───────────────────────────────────────────────

export interface ScheduledInstalment {
    scheduleId: string;
    label: string;
    kind: PaymentKind;
    /** 1-based within its own schedule */
    number: number;
    dueOn: string;
    amount: number;
    indexCode: IndexCode;
}

/**
 * The instalments a quadro resumo block stands for.
 *
 * `SINGLE` ignores `installments` and yields one. The due day follows the first date and is
 * clamped on short months, so a 31/08 first due date lands on 30/09, exactly like the
 * contracts that say "todo dia 31".
 */
export function expandSchedule(schedule: InvestmentSchedule): ScheduledInstalment[] {
    const start = parseISODateLocal(schedule.first_due_on);
    if (!start) return [];
    const step = PERIODICITY_MONTHS[schedule.periodicity] ?? 1;
    const count = schedule.periodicity === "SINGLE" ? 1 : Math.max(1, schedule.installments);
    const anchorDay = start.getDate();

    const out: ScheduledInstalment[] = [];
    for (let i = 0; i < count; i++) {
        out.push({
            scheduleId: schedule.id,
            label: schedule.label,
            kind: schedule.kind,
            number: i + 1,
            dueOn: toISODate(step === 0 ? start : addMonthsClamped(start, i * step, anchorDay)),
            amount: round2(schedule.amount),
            indexCode: schedule.index_code,
        });
    }
    return out;
}

/** Every instalment of every block, oldest first. */
export function expandSchedules(schedules: InvestmentSchedule[]): ScheduledInstalment[] {
    return schedules
        .flatMap(expandSchedule)
        .sort((a, b) => (a.dueOn < b.dueOn ? -1 : a.dueOn > b.dueOn ? 1 : 0));
}

/** The last month a schedule reaches, `YYYY-MM`, or null when there is none. */
export function scheduleHorizon(schedules: InvestmentSchedule[]): string | null {
    const all = expandSchedules(schedules);
    return all.length > 0 ? all[all.length - 1].dueOn.slice(0, 7) : null;
}

/** Contracted total of the blocks (before any index correction). */
export function scheduledTotal(schedules: InvestmentSchedule[]): number {
    return round2(expandSchedules(schedules).reduce((sum, i) => sum + i.amount, 0));
}

// ── Payments ─────────────────────────────────────────────────────────

/** `YYYY-MM` of the date a payment belongs to: when it was paid, else when it is due. */
export function paymentMonth(payment: Pick<InvestmentPayment, "due_on" | "paid_on" | "status">): string {
    const date = payment.status === "PAID" && payment.paid_on ? payment.paid_on : payment.due_on;
    return date.slice(0, 7);
}

/** What a payment cost in total: the instalment plus the index correction charged on top. */
export function paymentTotal(payment: Pick<InvestmentPayment, "amount" | "correction_amount">): number {
    return round2((payment.amount || 0) + (payment.correction_amount || 0));
}

/**
 * Forecast instalments that no payment covers yet.
 *
 * A payment answers an instalment when their **due** months and kinds match; a month with more
 * payments than instalments simply consumes them all. Everything left is what the owner still
 * owes, and that is what the chart draws as forecast.
 *
 * It has to be the due date, not the date the money moved: anticipating is the whole point of
 * paying ahead, and a 2036 instalment settled in 2026 would otherwise stay open forever while the
 * payment sat in the ledger.
 */
export function pendingInstalments(
    schedules: InvestmentSchedule[],
    payments: InvestmentPayment[]
): ScheduledInstalment[] {
    const taken = new Map<string, number>();
    for (const p of payments) {
        const key = `${p.due_on.slice(0, 7)}|${p.kind}`;
        taken.set(key, (taken.get(key) ?? 0) + 1);
    }
    const pending: ScheduledInstalment[] = [];
    for (const inst of expandSchedules(schedules)) {
        const key = `${inst.dueOn.slice(0, 7)}|${inst.kind}`;
        const left = taken.get(key) ?? 0;
        if (left > 0) {
            taken.set(key, left - 1);
            continue;
        }
        pending.push(inst);
    }
    return pending;
}

/** The least a thing needs to be groupable: a forecast instalment or a payment typed as planned. */
export interface OpenInstalment {
    kind: PaymentKind;
    dueOn: string;
    amount: number;
}

/** One line per kind still owed: what an investor picks from when deciding what to anticipate. */
export interface PendingKindSummary {
    kind: PaymentKind;
    label: string;
    /** Compact plural for a KPI row or a filter chip ("Mensais"). */
    short: string;
    count: number;
    /** Contracted total still open for this kind, before any index correction. */
    total: number;
    /** Earliest due date still open. */
    nextDueOn: string;
}

/**
 * Groups open instalments by kind, in the order the kinds are listed.
 *
 * Paying ahead is how an off-plan buyer avoids the INCC/CUB correction on the instalments they
 * anticipate, and a plan of 140 monthly instalments plus 11 annual ones is impossible to act on as
 * one flat list — so the dashboard offers the kinds, with what each one still costs.
 */
export function pendingByKind(instalments: OpenInstalment[]): PendingKindSummary[] {
    const byKind = new Map<PaymentKind, { count: number; total: number; nextDueOn: string }>();
    for (const inst of instalments) {
        const current = byKind.get(inst.kind);
        if (current) {
            current.count += 1;
            current.total = round2(current.total + inst.amount);
            if (inst.dueOn < current.nextDueOn) current.nextDueOn = inst.dueOn;
        } else {
            byKind.set(inst.kind, { count: 1, total: round2(inst.amount), nextDueOn: inst.dueOn });
        }
    }
    return PAYMENT_KINDS.filter(k => byKind.has(k.kind)).map(k => ({
        kind: k.kind,
        label: k.label,
        short: k.short,
        ...byKind.get(k.kind)!,
    }));
}

// ── Formatting ───────────────────────────────────────────────────────

export const formatBRL = (value: number, fractionDigits = 2): string =>
    value.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
    });

export const formatBRLShort = (value: number): string =>
    Math.abs(value) >= 1000
        ? `R$ ${(value / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}k`
        : `R$ ${value.toFixed(0)}`;

/** The investment's own title: "Studio 204 — Sun Place" when both are known. */
export function investmentTitle(investment: Pick<NewInvestment, "name" | "unit_label">): string {
    const unit = investment.unit_label?.trim();
    return unit && unit.toLowerCase() !== investment.name.trim().toLowerCase()
        ? `${unit} — ${investment.name}`
        : investment.name;
}

/** Months between two `YYYY-MM` keys (b − a); negative when `b` is earlier. */
export function monthsBetween(a: string, b: string): number {
    const [ay, am] = a.split("-").map(Number);
    const [by, bm] = b.split("-").map(Number);
    return (by - ay) * 12 + (bm - am);
}

/** `YYYY-MM` `count` months after `key`. */
export function addMonthsToKey(key: string, count: number): string {
    const [y, m] = key.split("-").map(Number);
    const total = y * 12 + (m - 1) + count;
    const year = Math.floor(total / 12);
    const month = total % 12;
    return `${String(year).padStart(4, "0")}-${String(month + 1).padStart(2, "0")}`;
}
