/**
 * Holding chart of accounts (Contábil & Fiscal › Plano de contas).
 *
 * The template below is what a pure rental holding needs: rented properties as
 * "propriedades para investimento" (CPC 28 / NBC TG 1002 Seção 17) split into land and
 * building, an own-use "imobilizado" (CPC 27) and a "estoque de imóveis" (CPC 16) kept
 * inactive until the holding really holds property for sale. Accounts whose use depends on
 * the measurement model (depreciation under cost, fair-value adjustments under fair value)
 * are switched on and off by `modelAccountActivation`.
 *
 * `systemKey` is the stable handle the automation posts to; codes and names may be edited
 * by the contador. The Receita's Plano Referencial (`referential_code`) is mapped when the
 * ECD/ECF are generated.
 */

export type AccountType = "ATIVO" | "PASSIVO" | "PL" | "RECEITA" | "DESPESA";
export type AccountNature = "D" | "C";
export type PropertyMeasurement = "COST" | "FAIR_VALUE";

export interface AccountingAccount {
    id: string;
    code: string;
    name: string;
    account_type: AccountType;
    nature: AccountNature;
    analytic: boolean;
    system_key: string | null;
    referential_code: string | null;
    active: boolean;
}

export interface TemplateAccount {
    code: string;
    name: string;
    type: AccountType;
    nature: AccountNature;
    analytic: boolean;
    systemKey: string | null;
    active: boolean;
}

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
    ATIVO: "Ativo",
    PASSIVO: "Passivo",
    PL: "Patrimônio líquido",
    RECEITA: "Receita",
    DESPESA: "Despesa",
};

export const CODE_REGEX = /^\d+(\.\d+)*$/;

/** "1.2.2.01" → "1.2.2"; top level → null. */
export function parentCode(code: string): string | null {
    const i = code.lastIndexOf(".");
    return i < 0 ? null : code.slice(0, i);
}

export function codeLevel(code: string): number {
    return code.split(".").length;
}

/** Sort key that orders "1.10" after "1.9". */
export function compareCodes(a: string, b: string): number {
    const pa = a.split(".").map(Number), pb = b.split(".").map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const x = pa[i] ?? -1, y = pb[i] ?? -1;
        if (x !== y) return x - y;
    }
    return 0;
}

/** Account type from the code: 1 ativo, 2.3 PL, 2 passivo, 3 receitas, 4 despesas. */
export function typeFromCode(code: string): AccountType | null {
    if (code === "2.3" || code.startsWith("2.3.")) return "PL";
    switch (code.split(".")[0]) {
        case "1": return "ATIVO";
        case "2": return "PASSIVO";
        case "3": return "RECEITA";
        case "4": return "DESPESA";
        default: return null;
    }
}

export function defaultNature(type: AccountType): AccountNature {
    return type === "ATIVO" || type === "DESPESA" ? "D" : "C";
}

// code, name, systemKey (analytic) or null (group), options
type Row = [string, string, string | null, { nature?: AccountNature; active?: boolean }?];

const ROWS: Row[] = [
    ["1", "Ativo", null],
    ["1.1", "Ativo circulante", null],
    ["1.1.1", "Disponível", null],
    ["1.1.1.01", "Caixa", "CAIXA"],
    ["1.1.1.02", "Bancos conta movimento", "BANCOS"],
    ["1.1.1.03", "Aplicações financeiras de liquidez imediata", "APLICACOES_FINANCEIRAS"],
    ["1.1.2", "Créditos", null],
    ["1.1.2.01", "Aluguéis a receber", "ALUGUEIS_A_RECEBER"],
    ["1.1.2.02", "Repasses a receber de imobiliárias", "REPASSES_A_RECEBER"],
    ["1.1.2.03", "Reembolsos a receber de inquilinos", "REEMBOLSOS_A_RECEBER"],
    ["1.1.2.04", "Outros créditos", "OUTROS_CREDITOS"],
    ["1.1.3", "Tributos a recuperar", null],
    ["1.1.3.01", "IRRF a compensar", "IRRF_A_COMPENSAR"],
    ["1.1.3.02", "CBS a recuperar", "CBS_A_RECUPERAR"],
    ["1.1.3.03", "IBS a recuperar", "IBS_A_RECUPERAR"],
    ["1.1.3.04", "Outros tributos a recuperar", "OUTROS_TRIBUTOS_A_RECUPERAR"],
    ["1.1.4", "Despesas antecipadas", null],
    ["1.1.4.01", "Seguros a apropriar", "SEGUROS_A_APROPRIAR"],
    ["1.1.4.02", "Outras despesas antecipadas", "DESPESAS_ANTECIPADAS"],
    ["1.1.5", "Estoques", null],
    ["1.1.5.01", "Imóveis para revenda", "ESTOQUE_IMOVEIS", { active: false }],
    ["1.2", "Ativo não circulante", null],
    ["1.2.1", "Realizável a longo prazo", null],
    ["1.2.1.01", "Depósitos judiciais e cauções dadas", "DEPOSITOS_CAUCOES"],
    ["1.2.2", "Propriedades para investimento", null],
    ["1.2.2.01", "Terrenos", "PPI_TERRENOS"],
    ["1.2.2.02", "Edificações", "PPI_EDIFICACOES"],
    ["1.2.2.03", "Benfeitorias", "PPI_BENFEITORIAS"],
    ["1.2.2.04", "Obras e reformas em andamento", "PPI_EM_ANDAMENTO"],
    ["1.2.2.05", "(−) Depreciação acumulada", "PPI_DEPRECIACAO_ACUMULADA", { nature: "C" }],
    ["1.2.2.06", "Ajuste a valor justo", "PPI_AJUSTE_VALOR_JUSTO"],
    ["1.2.2.07", "Aquisições a classificar (terreno × edificação)", "PPI_A_CLASSIFICAR"],
    ["1.2.3", "Imobilizado", null],
    ["1.2.3.01", "Imóveis de uso próprio", "IMOB_IMOVEIS_USO"],
    ["1.2.3.02", "Móveis, utensílios e equipamentos", "IMOB_MOVEIS"],
    ["1.2.3.03", "(−) Depreciação acumulada do imobilizado", "IMOB_DEPRECIACAO_ACUMULADA", { nature: "C" }],

    ["2", "Passivo", null],
    ["2.1", "Passivo circulante", null],
    ["2.1.1", "Fornecedores e contas a pagar", null],
    ["2.1.1.01", "Fornecedores", "FORNECEDORES"],
    ["2.1.1.02", "Taxa de administração a pagar", "TAXA_ADM_A_PAGAR"],
    ["2.1.1.03", "Condomínio a pagar", "CONDOMINIO_A_PAGAR"],
    ["2.1.1.04", "Contas de consumo a pagar", "CONSUMO_A_PAGAR"],
    ["2.1.2", "Obrigações tributárias", null],
    ["2.1.2.01", "IRPJ a recolher", "IRPJ_A_RECOLHER"],
    ["2.1.2.02", "CSLL a recolher", "CSLL_A_RECOLHER"],
    ["2.1.2.03", "PIS a recolher", "PIS_A_RECOLHER"],
    ["2.1.2.04", "COFINS a recolher", "COFINS_A_RECOLHER"],
    ["2.1.2.05", "CBS a recolher", "CBS_A_RECOLHER"],
    ["2.1.2.06", "IBS a recolher", "IBS_A_RECOLHER"],
    ["2.1.2.07", "IRRF a recolher", "IRRF_A_RECOLHER"],
    ["2.1.2.08", "IPTU e taxas a pagar", "IPTU_A_PAGAR"],
    ["2.1.3", "Empréstimos e financiamentos", null],
    ["2.1.3.01", "Financiamentos imobiliários", "FINANCIAMENTOS_CP"],
    ["2.1.4", "Obrigações com sócios", null],
    ["2.1.4.01", "Lucros a distribuir", "LUCROS_A_DISTRIBUIR"],
    ["2.1.4.02", "Mútuos de sócios", "MUTUO_SOCIOS_CP"],
    ["2.1.5", "Outras obrigações", null],
    ["2.1.5.01", "Aluguéis recebidos antecipadamente", "ALUGUEIS_ANTECIPADOS"],
    ["2.1.5.02", "Valores de terceiros a repassar", "VALORES_A_REPASSAR"],
    ["2.2", "Passivo não circulante", null],
    ["2.2.1", "Empréstimos e financiamentos", null],
    ["2.2.1.01", "Financiamentos imobiliários", "FINANCIAMENTOS_LP"],
    ["2.2.1.02", "Mútuos de sócios", "MUTUO_SOCIOS_LP"],
    ["2.2.2", "Outras obrigações", null],
    ["2.2.2.01", "Cauções de inquilinos", "CAUCOES_INQUILINOS"],
    ["2.3", "Patrimônio líquido", null],
    ["2.3.1", "Capital social", null],
    ["2.3.1.01", "Capital subscrito", "CAPITAL_SUBSCRITO"],
    ["2.3.1.02", "(−) Capital a integralizar", "CAPITAL_A_INTEGRALIZAR", { nature: "D" }],
    ["2.3.2", "Reservas", null],
    ["2.3.2.01", "Reserva legal", "RESERVA_LEGAL"],
    ["2.3.2.02", "Reserva de ajuste a valor justo a realizar", "RESERVA_AVJ"],
    ["2.3.3", "Lucros ou prejuízos acumulados", null],
    ["2.3.3.01", "Lucros acumulados", "LUCROS_ACUMULADOS"],
    ["2.3.3.02", "(−) Prejuízos acumulados", "PREJUIZOS_ACUMULADOS", { nature: "D" }],

    ["3", "Receitas", null],
    ["3.1", "Receita bruta", null],
    ["3.1.1", "Locação de imóveis", null],
    ["3.1.1.01", "Receita de aluguéis", "RECEITA_ALUGUEL"],
    ["3.1.1.02", "Receita de reembolsos de encargos", "RECEITA_REEMBOLSOS"],
    ["3.2", "(−) Deduções da receita bruta", null, { nature: "D" }],
    ["3.2.1", "Tributos sobre a receita", null, { nature: "D" }],
    ["3.2.1.01", "PIS", "DED_PIS", { nature: "D" }],
    ["3.2.1.02", "COFINS", "DED_COFINS", { nature: "D" }],
    ["3.2.1.03", "CBS", "DED_CBS", { nature: "D" }],
    ["3.2.1.04", "IBS", "DED_IBS", { nature: "D" }],
    ["3.3", "Receitas financeiras", null],
    ["3.3.1", "Receitas financeiras", null],
    ["3.3.1.01", "Rendimentos de aplicações financeiras", "RECEITA_APLICACOES"],
    ["3.3.1.02", "Juros e multas recebidos", "RECEITA_JUROS_MULTAS"],
    ["3.4", "Outras receitas", null],
    ["3.4.1", "Outras receitas", null],
    ["3.4.1.01", "Ganho na alienação de propriedades", "GANHO_ALIENACAO"],
    ["3.4.1.02", "Ganho de ajuste a valor justo", "GANHO_AVJ"],
    ["3.4.1.03", "Dividendos recebidos", "DIVIDENDOS_RECEBIDOS"],
    ["3.4.1.04", "Outras receitas", "OUTRAS_RECEITAS"],

    ["4", "Despesas", null],
    ["4.1", "Despesas com os imóveis", null],
    ["4.1.1", "Despesas operacionais", null],
    ["4.1.1.01", "Taxa de administração imobiliária", "DESP_TAXA_ADM"],
    ["4.1.1.02", "Manutenção e reparos", "DESP_MANUTENCAO"],
    ["4.1.1.03", "Condomínio", "DESP_CONDOMINIO"],
    ["4.1.1.04", "IPTU e taxas municipais", "DESP_IPTU"],
    ["4.1.1.05", "Energia, água e gás", "DESP_UTILIDADES"],
    ["4.1.1.06", "Seguros", "DESP_SEGUROS"],
    ["4.1.1.07", "Comissões de locação", "DESP_COMISSAO_LOCACAO"],
    ["4.1.1.08", "Perdas com aluguéis", "DESP_PERDAS_ALUGUEIS"],
    ["4.1.1.09", "Outras despesas com os imóveis", "DESP_OUTRAS_IMOVEIS"],
    ["4.1.2", "Depreciação e valor justo", null],
    ["4.1.2.01", "Depreciação de propriedades para investimento", "DESP_DEPRECIACAO_PPI"],
    ["4.1.2.02", "Perda de ajuste a valor justo", "PERDA_AVJ"],
    ["4.2", "Despesas administrativas", null],
    ["4.2.1", "Despesas administrativas", null],
    ["4.2.1.01", "Honorários contábeis e jurídicos", "DESP_HONORARIOS"],
    ["4.2.1.02", "Software e serviços", "DESP_SOFTWARE"],
    ["4.2.1.03", "Tarifas bancárias", "DESP_TARIFAS"],
    ["4.2.1.04", "Taxas e contribuições diversas", "DESP_TAXAS_DIVERSAS"],
    ["4.2.1.05", "Depreciação do imobilizado", "DESP_DEPRECIACAO_IMOB"],
    ["4.3", "Despesas financeiras", null],
    ["4.3.1", "Despesas financeiras", null],
    ["4.3.1.01", "Juros de financiamentos", "DESP_JUROS_FINANCIAMENTO"],
    ["4.3.1.02", "Outras despesas financeiras", "DESP_FINANCEIRAS_OUTRAS"],
    ["4.4", "Outras despesas", null],
    ["4.4.1", "Outras despesas", null],
    ["4.4.1.01", "Perda na alienação de propriedades", "PERDA_ALIENACAO"],
    ["4.5", "Tributos sobre o lucro", null],
    ["4.5.1", "IRPJ e CSLL", null],
    ["4.5.1.01", "IRPJ", "DESP_IRPJ"],
    ["4.5.1.02", "CSLL", "DESP_CSLL"],
];

/** Accounts that only make sense under one measurement model of the rented properties. */
export const COST_MODEL_KEYS = ["PPI_DEPRECIACAO_ACUMULADA", "DESP_DEPRECIACAO_PPI"] as const;
export const FAIR_VALUE_MODEL_KEYS = ["PPI_AJUSTE_VALOR_JUSTO", "GANHO_AVJ", "PERDA_AVJ", "RESERVA_AVJ"] as const;

/** system_key → active for the model-dependent accounts. */
export function modelAccountActivation(measurement: PropertyMeasurement): Record<string, boolean> {
    const out: Record<string, boolean> = {};
    for (const k of COST_MODEL_KEYS) out[k] = measurement === "COST";
    for (const k of FAIR_VALUE_MODEL_KEYS) out[k] = measurement === "FAIR_VALUE";
    return out;
}

/** The template for a holding, with the model-dependent accounts set for `measurement`. */
export function chartTemplate(measurement: PropertyMeasurement = "COST"): TemplateAccount[] {
    const activation = modelAccountActivation(measurement);
    return ROWS.map(([code, name, systemKey, opts]) => {
        const type = typeFromCode(code)!;
        const analytic = systemKey !== null;
        return {
            code,
            name,
            type,
            nature: opts?.nature ?? defaultNature(type),
            analytic,
            systemKey,
            active: systemKey && systemKey in activation ? activation[systemKey] : opts?.active ?? true,
        };
    });
}

export interface NewAccountInput {
    code: string;
    name: string;
    analytic: boolean;
    nature?: AccountNature;
}

/**
 * Checks an account the contador adds under an existing group. Returns the row to insert
 * or a message. Groups (synthetic) can hold groups or analytic accounts; analytic accounts
 * hold nothing.
 */
export function validateNewAccount(input: NewAccountInput, existing: Pick<AccountingAccount, "code" | "analytic" | "nature" | "account_type">[]):
    { row: { code: string; name: string; account_type: AccountType; nature: AccountNature; analytic: boolean } } | { error: string } {
    const code = String(input.code ?? "").trim();
    const name = String(input.name ?? "").trim();
    if (!CODE_REGEX.test(code)) return { error: "Código inválido: use números separados por ponto (ex.: 4.1.1.09)" };
    if (!name) return { error: "Informe o nome da conta" };
    if (name.length > 120) return { error: "Nome muito longo (máx. 120 caracteres)" };
    const type = typeFromCode(code);
    if (!type) return { error: "O código deve começar por 1 (ativo), 2 (passivo e PL), 3 (receitas) ou 4 (despesas)" };
    if (existing.some(a => a.code === code)) return { error: "Já existe uma conta com esse código" };
    const parent = parentCode(code);
    if (!parent) return { error: "Crie a conta dentro de um grupo existente" };
    const p = existing.find(a => a.code === parent);
    if (!p) return { error: `O grupo ${parent} não existe` };
    if (p.analytic) return { error: `${parent} é uma conta analítica: contas novas ficam dentro de grupos` };
    if (typeFromCode(parent) !== type) return { error: "O tipo da conta não combina com o grupo" };
    const nature = input.nature === "D" || input.nature === "C" ? input.nature : p.nature;
    return { row: { code, name, account_type: type, nature, analytic: Boolean(input.analytic) } };
}
