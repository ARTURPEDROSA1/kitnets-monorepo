/**
 * Motor de lançamentos do extrato (Contábil & Fiscal, Etapa 2) — pure part.
 *
 * Every row of the holding's bank ledger (bank_transactions) becomes one journal entry:
 * the bank account against a counterpart account. The counterpart comes, in order, from
 *   1. the owner's (or contador's) answer stored on the row;
 *   2. the routing the row already has (income month → aluguéis a receber; investment
 *      kind → the account for that kind);
 *   3. a row with the same memo shape answered before (learning);
 *   4. memo rules — only the unambiguous ones post by themselves (tarifa, IPTU,
 *      condomínio, consumo, rendimento…); ambiguous ones (DARF, PIX to a person, reforma
 *      or manutenção?) become a question with the likely answer preselected.
 * The owner answers in plain language (`BANK_OPTIONS`); the contador may pick any account.
 *
 * Rent deposits settle "aluguéis a receber": the revenue itself (gross rent, agency fee)
 * is recognised by competência in Etapa 3.
 */
import type { AccountingAccount } from "./accounting-chart";
import { normalizeMemo, type BankTransaction } from "./bank-ledger";
import { classifyMemo } from "./bank-statement";
import type { TransactionKind } from "./property-investment";

export type BankDirection = "IN" | "OUT";

export interface BankOption {
    id: string;
    label: string;
    direction: BankDirection;
    systemKey: string;
    hint?: string;
}

/** What the owner is asked, in plain language, with the account each answer posts to. */
export const BANK_OPTIONS: BankOption[] = [
    { id: "ALUGUEL", direction: "IN", label: "Aluguel recebido (do inquilino ou da imobiliária)", systemKey: "ALUGUEIS_A_RECEBER" },
    { id: "REEMBOLSO", direction: "IN", label: "Reembolso de IPTU, condomínio ou consumo que eu paguei", systemKey: "REEMBOLSOS_A_RECEBER" },
    { id: "CAUCAO_RECEBIDA", direction: "IN", label: "Caução (depósito de garantia) do inquilino", systemKey: "CAUCOES_INQUILINOS" },
    { id: "APORTE", direction: "IN", label: "Aporte de capital do sócio", systemKey: "CAPITAL_SUBSCRITO" },
    { id: "MUTUO_RECEBIDO", direction: "IN", label: "Empréstimo do sócio para a holding", systemKey: "MUTUO_SOCIOS_CP" },
    { id: "RENDIMENTO", direction: "IN", label: "Rendimento de aplicação financeira", systemKey: "RECEITA_APLICACOES" },
    { id: "RESGATE", direction: "IN", label: "Resgate de aplicação financeira", systemKey: "APLICACOES_FINANCEIRAS" },
    { id: "JUROS_MULTA", direction: "IN", label: "Juros ou multa por atraso recebidos", systemKey: "RECEITA_JUROS_MULTAS" },
    { id: "OUTRA_ENTRADA", direction: "IN", label: "Outra entrada", systemKey: "OUTRAS_RECEITAS" },

    { id: "MANUTENCAO", direction: "OUT", label: "Manutenção ou reparo", systemKey: "DESP_MANUTENCAO" },
    { id: "BENFEITORIA", direction: "OUT", label: "Reforma ou melhoria que valoriza o imóvel", systemKey: "PPI_BENFEITORIAS", hint: "Fica no imóvel (ativo), não é despesa do mês" },
    { id: "IPTU", direction: "OUT", label: "IPTU ou taxa municipal", systemKey: "DESP_IPTU" },
    { id: "CONDOMINIO", direction: "OUT", label: "Condomínio", systemKey: "DESP_CONDOMINIO" },
    { id: "CONSUMO", direction: "OUT", label: "Energia, água ou gás", systemKey: "DESP_UTILIDADES" },
    { id: "SEGURO", direction: "OUT", label: "Seguro", systemKey: "DESP_SEGUROS" },
    { id: "TARIFA", direction: "OUT", label: "Tarifa bancária", systemKey: "DESP_TARIFAS" },
    { id: "HONORARIOS", direction: "OUT", label: "Contador, advogado ou despachante", systemKey: "DESP_HONORARIOS" },
    { id: "SOFTWARE", direction: "OUT", label: "Software e serviços", systemKey: "DESP_SOFTWARE" },
    { id: "COMISSAO", direction: "OUT", label: "Comissão de locação (corretor)", systemKey: "DESP_COMISSAO_LOCACAO" },
    { id: "FINANCIAMENTO", direction: "OUT", label: "Parcela de financiamento", systemKey: "FINANCIAMENTOS_CP", hint: "Os juros são separados quando o financiamento for lançado" },
    { id: "DARF_IRPJ", direction: "OUT", label: "DARF de IRPJ", systemKey: "IRPJ_A_RECOLHER" },
    { id: "DARF_CSLL", direction: "OUT", label: "DARF de CSLL", systemKey: "CSLL_A_RECOLHER" },
    { id: "DARF_PIS", direction: "OUT", label: "DARF de PIS", systemKey: "PIS_A_RECOLHER" },
    { id: "DARF_COFINS", direction: "OUT", label: "DARF de COFINS", systemKey: "COFINS_A_RECOLHER" },
    { id: "DARF_IRRF", direction: "OUT", label: "DARF de IR retido (dividendos)", systemKey: "IRRF_A_RECOLHER" },
    { id: "DISTRIBUICAO", direction: "OUT", label: "Distribuição de lucros ao sócio", systemKey: "LUCROS_A_DISTRIBUIR" },
    { id: "MUTUO_PAGO", direction: "OUT", label: "Devolução de empréstimo ao sócio", systemKey: "MUTUO_SOCIOS_CP" },
    { id: "APLICACAO", direction: "OUT", label: "Aplicação financeira", systemKey: "APLICACOES_FINANCEIRAS" },
    { id: "CAUCAO_DEVOLVIDA", direction: "OUT", label: "Devolução de caução ao inquilino", systemKey: "CAUCOES_INQUILINOS" },
    { id: "COMPRA_IMOVEL", direction: "OUT", label: "Compra de imóvel (entrada, ITBI, escritura)", systemKey: "PPI_A_CLASSIFICAR", hint: "O contador separa terreno e edificação" },
    { id: "OUTRA_SAIDA", direction: "OUT", label: "Outra despesa com os imóveis", systemKey: "DESP_OUTRAS_IMOVEIS" },
];

export const BANK_OPTION_BY_ID = new Map(BANK_OPTIONS.map(o => [o.id, o]));

/** Investment-ledger kinds (property_transactions) → counterpart account. */
export const KIND_TO_KEY: Record<TransactionKind, string> = {
    ENTRADA: "PPI_A_CLASSIFICAR",
    CUSTOS_AQUISICAO: "PPI_A_CLASSIFICAR",
    PRESTACAO: "FINANCIAMENTOS_CP",
    AMORTIZACAO: "FINANCIAMENTOS_CP",
    QUITACAO: "FINANCIAMENTOS_CP",
    TARIFA: "DESP_TARIFAS",
    IPTU: "DESP_IPTU",
    UTILIDADES: "DESP_UTILIDADES",
    REFORMA: "PPI_BENFEITORIAS",
    ENERGIA_SOLAR: "PPI_BENFEITORIAS",
    OUTROS: "DESP_OUTRAS_IMOVEIS",
};

export type BankRowForPosting = Pick<BankTransaction, "id" | "occurred_on" | "amount" | "memo" | "destination" | "property_id" | "kind"> & {
    account_id: string | null;
    account_option: string | null;
};

export type CounterpartSource = "ANSWER" | "ROUTING" | "HISTORY" | "RULE";

export interface Counterpart {
    accountId: string;
    source: CounterpartSource;
    optionId: string | null;
}

export interface Suggestion {
    /** posts without asking */
    counterpart: Counterpart | null;
    /** preselected answer when the row becomes a question */
    suggestedOptionId: string | null;
}

export const direction = (amount: number): BankDirection => (amount >= 0 ? "IN" : "OUT");

interface Rule { re: RegExp; option: string; confident: boolean }

const OUT_RULES: Rule[] = [
    { re: /\bdarf\b|receita federal|\brfb\b/, option: "DARF_IRPJ", confident: false },
    { re: /\biptu\b/, option: "IPTU", confident: true },
    { re: /condomin/, option: "CONDOMINIO", confident: true },
    { re: /\bseguro/, option: "SEGURO", confident: false },
    { re: /honorario|contabil|escritorio contab|despachante|advocacia/, option: "HONORARIOS", confident: true },
    { re: /\baplicacao\b|\baplic\b|\bcdb\b|\brdb\b|\blci\b|\blca\b|tesouro direto/, option: "APLICACAO", confident: true },
    { re: /financiamento|prestacao|habitacional|credito imobiliario/, option: "FINANCIAMENTO", confident: false },
    { re: /distribuicao de lucro|lucros|dividend/, option: "DISTRIBUICAO", confident: false },
    { re: /comissao|corretagem/, option: "COMISSAO", confident: false },
];

const IN_RULES: Rule[] = [
    { re: /rendimento|remuneracao|\brend\b|juros sobre saldo/, option: "RENDIMENTO", confident: true },
    { re: /\bresgate\b/, option: "RESGATE", confident: true },
    { re: /aluguel|locacao|\brepasse\b/, option: "ALUGUEL", confident: true },
    { re: /aporte|integralizacao/, option: "APORTE", confident: false },
    { re: /\bcaucao\b|deposito de garantia/, option: "CAUCAO_RECEBIDA", confident: false },
    { re: /estorno|devolucao/, option: "OUTRA_ENTRADA", confident: false },
];

/** Memo rules → { option, confident }; classifyMemo covers consumo, tarifa, reforma and solar. */
export function ruleFor(memo: string, dir: BankDirection): { option: string; confident: boolean } | null {
    const m = normalizeMemo(memo);
    if (!m) return null;
    const rules = dir === "IN" ? IN_RULES : OUT_RULES;
    for (const r of rules) if (r.re.test(m)) return { option: r.option, confident: r.confident };
    if (dir === "OUT") {
        const kind = classifyMemo(memo);
        if (kind === "UTILIDADES") return { option: "CONSUMO", confident: true };
        if (kind === "TARIFA") return { option: "TARIFA", confident: true };
        if (kind === "REFORMA" || kind === "ENERGIA_SOLAR") return { option: "BENFEITORIA", confident: false };
    }
    return null;
}

export interface SuggestContext {
    accountsByKey: Map<string, Pick<AccountingAccount, "id" | "analytic" | "active">>;
    accountsById: Map<string, Pick<AccountingAccount, "id" | "analytic" | "active">>;
    /** memo shape → the last answer given for it */
    history: Map<string, { accountId: string; optionId: string | null }>;
}

const usable = (a: Pick<AccountingAccount, "analytic" | "active"> | undefined) => Boolean(a && a.analytic && a.active);

export function suggestCounterpart(row: BankRowForPosting, ctx: SuggestContext): Suggestion {
    const dir = direction(row.amount);
    const byKey = (key: string, source: CounterpartSource, optionId: string | null): Counterpart | null => {
        const a = ctx.accountsByKey.get(key);
        return usable(a) ? { accountId: a!.id, source, optionId } : null;
    };

    if (row.account_id) {
        const a = ctx.accountsById.get(row.account_id);
        if (usable(a)) return { counterpart: { accountId: a!.id, source: "ANSWER", optionId: row.account_option }, suggestedOptionId: row.account_option };
    }
    if (dir === "OUT" && row.destination === "INVESTMENT" && row.kind) {
        const cp = byKey(KIND_TO_KEY[row.kind], "ROUTING", null);
        if (cp) return { counterpart: cp, suggestedOptionId: null };
    }
    if (dir === "IN" && row.destination === "INCOME") {
        const cp = byKey("ALUGUEIS_A_RECEBER", "ROUTING", "ALUGUEL");
        if (cp) return { counterpart: cp, suggestedOptionId: "ALUGUEL" };
    }
    const learned = ctx.history.get(normalizeMemo(row.memo));
    if (learned) {
        const a = ctx.accountsById.get(learned.accountId);
        const option = learned.optionId ? BANK_OPTION_BY_ID.get(learned.optionId) : undefined;
        if (usable(a) && (!option || option.direction === dir)) {
            return { counterpart: { accountId: a!.id, source: "HISTORY", optionId: learned.optionId }, suggestedOptionId: learned.optionId };
        }
    }
    const rule = ruleFor(row.memo, dir);
    if (rule) {
        const option = BANK_OPTION_BY_ID.get(rule.option)!;
        const cp = rule.confident ? byKey(option.systemKey, "RULE", option.id) : null;
        return { counterpart: cp, suggestedOptionId: option.id };
    }
    // money in tied to a property (tenant name, street) is most likely rent: ask, with rent preselected
    if (dir === "IN" && row.property_id) return { counterpart: null, suggestedOptionId: "ALUGUEL" };
    return { counterpart: null, suggestedOptionId: null };
}

/** Rows answered before, indexed by memo shape (latest answer wins). */
export function answerHistory(rows: Array<Pick<BankRowForPosting, "memo" | "account_id" | "account_option" | "occurred_on">>): Map<string, { accountId: string; optionId: string | null }> {
    const out = new Map<string, { accountId: string; optionId: string | null }>();
    const sorted = rows.filter(r => r.account_id).sort((a, b) => (a.occurred_on < b.occurred_on ? -1 : 1));
    for (const r of sorted) {
        const key = normalizeMemo(r.memo);
        if (key) out.set(key, { accountId: r.account_id!, optionId: r.account_option });
    }
    return out;
}

export interface BankPostingPayload {
    entry: { entry_date: string; description: string; source: "BANK"; source_ref: string; created_by: string };
    lines: Array<{ account_id: string; debit: number; credit: number; property_id: string | null; unit_id: null; memo: string | null }>;
}

/** Bank against counterpart: money in debits the bank, money out credits it. */
export function bankEntryPayload(row: BankRowForPosting, bankAccountId: string, counterpartAccountId: string): BankPostingPayload {
    const value = Math.round(Math.abs(Number(row.amount)) * 100) / 100;
    const memo = String(row.memo ?? "").replace(/\s+/g, " ").trim();
    const bankLine = { account_id: bankAccountId, property_id: null, unit_id: null, memo: null } as const;
    const cpLine = { account_id: counterpartAccountId, property_id: row.property_id ?? null, unit_id: null, memo: null } as const;
    const lines = row.amount >= 0
        ? [{ ...bankLine, debit: value, credit: 0 }, { ...cpLine, debit: 0, credit: value }]
        : [{ ...cpLine, debit: value, credit: 0 }, { ...bankLine, debit: 0, credit: value }];
    return {
        entry: {
            entry_date: row.occurred_on,
            description: (memo ? `Extrato: ${memo}` : "Lançamento do extrato").slice(0, 300),
            source: "BANK",
            source_ref: row.id,
            created_by: "Automação (extrato)",
        },
        lines,
    };
}

export type BankRowStatus = "POSTED" | "READY" | "QUESTION" | "NO_START" | "BEFORE_OPENING" | "CLOSED_MONTH";

export const BANK_STATUS_LABELS: Record<BankRowStatus, string> = {
    POSTED: "Contabilizado",
    READY: "Pronto para contabilizar",
    QUESTION: "Dúvida",
    NO_START: "Aguardando o início da escrituração",
    BEFORE_OPENING: "Antes do início da escrituração",
    CLOSED_MONTH: "Mês fechado",
};

/** Validates an answer: an option for the row's direction, or an account the contador picked. */
export function resolveAnswer(
    amount: number,
    answer: { option?: string | null; account_id?: string | null },
    ctx: Pick<SuggestContext, "accountsByKey" | "accountsById">
): { accountId: string; optionId: string | null } | { error: string } {
    if (answer.option) {
        const o = BANK_OPTION_BY_ID.get(answer.option);
        if (!o) return { error: "Opção inválida" };
        if (o.direction !== direction(amount)) return { error: o.direction === "IN" ? "Essa opção é para entradas de dinheiro" : "Essa opção é para saídas de dinheiro" };
        const a = ctx.accountsByKey.get(o.systemKey);
        if (!usable(a)) return { error: "A conta dessa opção está inativa no plano de contas" };
        return { accountId: a!.id, optionId: o.id };
    }
    if (answer.account_id) {
        const a = ctx.accountsById.get(answer.account_id);
        if (!a) return { error: "Conta não encontrada" };
        if (!a.analytic) return { error: "Escolha uma conta analítica" };
        if (!a.active) return { error: "Conta inativa" };
        return { accountId: a.id, optionId: null };
    }
    return { error: "Escolha uma opção ou uma conta" };
}
