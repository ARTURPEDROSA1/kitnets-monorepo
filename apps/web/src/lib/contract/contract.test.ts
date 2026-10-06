import { describe, expect, it } from "vitest";
import { countWithWords, moneyInWords, moneyWithWords, numberInWords, percentWithWords } from "./extenso";
import { fieldsIn, fillField, plainText, type PMNode } from "./doc";
import {
    buildContract, contractSupport, contractWarnings, defaultContractOptions, readContractOptions, requiredSignatures,
    type ContractData, type ContractOptions,
} from "./template";
import { contractContent, contractPdfDefinition } from "./pdf";
import { readPdfSignatures, looksLikePdf } from "./signatures";

describe("numbers in words", () => {
    it.each([
        [0, "zero"], [1, "um"], [16, "dezesseis"], [21, "vinte e um"], [100, "cem"], [101, "cento e um"], [110, "cento e dez"],
        [999, "novecentos e noventa e nove"], [1000, "mil"], [1001, "mil e um"], [1100, "mil e cem"], [1050, "mil e cinquenta"],
        [1324, "mil trezentos e vinte e quatro"], [2000, "dois mil"], [21000, "vinte e um mil"], [100000, "cem mil"],
        [1000000, "um milhão"], [1500000, "um milhão e quinhentos mil"], [2300000, "dois milhões e trezentos mil"],
    ])("%i → %s", (n, words) => expect(numberInWords(n)).toBe(words));

    it("speaks feminine where the noun asks", () => {
        expect(countWithWords(2, "f")).toBe("2 (duas)");
        expect(numberInWords(1, "f")).toBe("uma");
        expect(numberInWords(200, "f")).toBe("duzentas");
    });
    it("writes money as a contract quotes it", () => {
        expect(moneyInWords(1324.31)).toBe("mil trezentos e vinte e quatro reais e trinta e um centavos");
        expect(moneyInWords(1)).toBe("um real");
        expect(moneyInWords(0.01)).toBe("um centavo");
        expect(moneyInWords(0.5)).toBe("cinquenta centavos");
        expect(moneyInWords(1000000)).toBe("um milhão de reais");
        expect(moneyWithWords(2648.62)).toBe("R$ 2.648,62 (dois mil seiscentos e quarenta e oito reais e sessenta e dois centavos)");
    });
    it("writes percentages", () => {
        expect(percentWithWords(10)).toBe("10% (dez por cento)");
        expect(percentWithWords(2.5)).toBe("2,5% (dois vírgula cinco por cento)");
        expect(percentWithWords(1)).toBe("1% (um por cento)");
    });
});

/** Kitnet 35B: a kitnet of the owner's building, 30 months from 15/09/2025, two rents of deposit, IVAR. */
function kitnet(over: Partial<ContractData> = {}, lease: Partial<ContractData["lease"]> = {}): ContractData {
    return {
        reference: "SANTO ANTONIO · Kitnet 35B",
        owner: { name: "PEDROSA PARTICIPACOES LTDA", cnpj: "12.345.678/0001-90", address: "Rua das Flores, 100, Centro, Santo Antônio/SP, CEP 01000-000", representative: "Artur Pedrosa", email: "dono@example.com", phone: "(11) 99999-0000" },
        agency: null,
        tenants: [{ name: "Pedro Machado", cpf: "123.456.789-01", rg: null, occupation: "Analista", email: "pedro@example.com", phone: "(11) 98888-0000", address: null }],
        occupants: [],
        property: { type: "multi", unitName: "Kitnet 35B", unitType: "kitnet", address: "Rua Santo Antônio, 35, Centro, Santo Antônio/SP, CEP 01000-100", city: "Santo Antônio", state: "SP", matricula: "12.345", inscricao: null, parkingSpaces: 0 },
        lease: { start: "2025-09-15", end: "2028-03-15", rent: 1324.31, dueDay: 10, deposit: 2648.62, depositMonths: 2, index: "IVAR", frequencyMonths: 12, management: "SELF_MANAGED", ...lease },
        charges: [{ type: "CONDOMINIUM", label: null, responsibility: "TENANT", amount: 150, collectedBy: "OWNER", adjustsWithRent: true }],
        iptuPaidBy: null,
        billing: { finePct: null, interestPctMonth: null },
        ...over,
    };
}

const textOf = (doc: PMNode) => (doc.content ?? []).map(plainText).join("\n");

describe("the contract", () => {
    const data = kitnet();
    const options = defaultContractOptions(data);
    const doc = buildContract(data, options);
    const text = textOf(doc);

    it("starts from the landlord's side of what the law allows", () => {
        expect(options).toMatchObject({ guarantee: "CAUCAO", earlyExitFineRents: 3, fineWaivedAfterMonths: 12, noticeDays: 30, lateFeePct: 10, interestPctMonth: 1, saleClause: "TERMINATE", fireInsurance: "TENANT", witnesses: false });
    });
    it("names the parties from the app's records and leaves blanks for what it does not know", () => {
        expect(text).toContain("LOCADOR: PEDROSA PARTICIPACOES LTDA, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº 12.345.678/0001-90");
        expect(text).toContain("LOCATÁRIO: Pedro Machado, [NACIONALIDADE DE PEDRO], [ESTADO CIVIL DE PEDRO], Analista");
        const keys = fieldsIn(doc).map(f => f.key);
        expect(keys).toEqual(expect.arrayContaining(["owner.representativeCpf", "tenant.0.nationality", "tenant.0.maritalStatus", "tenant.0.rg", "tenant.0.address", "property.inscricao"]));
        expect(keys).not.toContain("tenant.0.cpf");
        expect(keys).not.toContain("property.matricula");
    });
    it("writes the term, the rent and the first payment pro rata like the app's schedule", () => {
        expect(text).toContain("a unidade Kitnet 35B (kitnet) do imóvel situado na Rua Santo Antônio, 35");
        expect(text).toContain("pelo prazo de 30 (trinta) meses, com início em 15/09/2025 e término em 15/03/2028, data em que o LOCATÁRIO restituirá o imóvel livre e desocupado");
        expect(text).toContain("R$ 1.324,31 (mil trezentos e vinte e quatro reais e trinta e um centavos)");
        expect(text).toContain("O primeiro pagamento, com vencimento em 10/10/2025, será proporcional ao período de 15/09/2025 a 09/10/2025, no valor de R$ 1.103,59");
        expect(text).toContain("IVAR (Índice de Variação de Aluguéis Residenciais, da FGV)");
        expect(text).toContain("Se a variação acumulada for negativa, o aluguel permanecerá inalterado");
    });
    it("numbers the clauses and points to them", () => {
        expect(text).toContain("Cláusula 1ª – Do objeto");
        expect(text).toContain("Cláusula 19ª – Do foro");
        expect(text).not.toContain("Da administração");
        expect(text).toContain("A devolução antecipada pelo LOCATÁRIO segue a Cláusula 12ª.");
        expect(text).toContain("12.1. O LOCATÁRIO poderá devolver o imóvel");
        expect(text).toContain("Decorridos 12 (doze) meses de locação, o LOCATÁRIO ficará isento da multa");
        expect(text).toContain("A multa será calculada assim: 3 × aluguel vigente × (meses que faltam ÷ 30 meses do prazo). Exemplo: com o aluguel de R$ 1.324,31 e a devolução após 10 meses, a multa é de 3 × R$ 1.324,31 × (20 ÷ 30) = R$ 2.648,62.");
    });
    it("puts the kitnet's condominium with the rent and keeps the building's IPTU with the landlord", () => {
        expect(text).toContain("a taxa de condomínio de R$ 150,00 mensais, paga junto com o aluguel");
        expect(text).toContain("será corrigida na data e pelo índice de reajuste do aluguel");
        expect(text).toContain("Cabem exclusivamente ao LOCADOR o IPTU e as taxas municipais do imóvel, as despesas extraordinárias de condomínio");
        expect(text).toContain("o consumo de energia elétrica e água e esgoto das ligações individuais do imóvel");
    });
    it("holds the deposit within the law", () => {
        expect(text).toContain("caução em dinheiro de R$ 2.648,62 (dois mil seiscentos e quarenta e oito reais e sessenta e dois centavos), equivalente a 2 (dois) aluguéis, que o LOCADOR depositará em até 5 (cinco) dias úteis em caderneta de poupança");
        expect(contractWarnings(data, options)).toEqual([]);
        const tooMuch = kitnet({}, { deposit: 5000 });
        expect(contractWarnings(tooMuch, defaultContractOptions(tooMuch)).map(w => w.level)).toContain("error");
    });
    it("is signed on gov.br without witnesses, by each party", () => {
        expect(text).toContain("assinatura eletrônica avançada da plataforma gov.br");
        expect(text).toContain("dispensada a assinatura de testemunhas (art. 784, § 4º, do Código de Processo Civil)");
        expect(text).toContain("Santo Antônio/SP, na data da última assinatura eletrônica.");
        expect(requiredSignatures(data, options)).toBe(2);
        expect(requiredSignatures(data, { ...options, guarantee: "FIANCA", guarantorSpouse: true, witnesses: true })).toBe(6);
    });
    it("fills a blank everywhere at once", () => {
        const filled = fillField(doc, "tenant.0.nationality", "brasileiro");
        expect(textOf(filled)).toContain("LOCATÁRIO: Pedro Machado, brasileiro, [ESTADO CIVIL DE PEDRO]");
        expect(fieldsIn(filled).map(f => f.key)).not.toContain("tenant.0.nationality");
    });
});

describe("the contract's variants", () => {
    it("tells a short term renews by itself (art. 47)", () => {
        const data = kitnet({}, { end: "2026-09-14" });
        const text = textOf(buildContract(data, defaultContractOptions(data)));
        expect(text).toContain("pelo prazo de 12 (doze) meses");
        expect(text).toContain("o LOCADOR somente poderá retomar o imóvel nas hipóteses do art. 47");
        expect(contractWarnings(data, defaultContractOptions(data))[0]).toMatchObject({ level: "info" });
    });
    it("has no early-exit clause in an open-ended lease", () => {
        const data = kitnet({}, { end: null });
        const text = textOf(buildContract(data, defaultContractOptions(data)));
        expect(text).toContain("A locação é por prazo indeterminado, com início em 15/09/2025.");
        expect(text).not.toContain("Da devolução antecipada");
        expect(text).toContain("Cláusula 18ª – Do foro");
    });
    it("adds the agency as the landlord's agent and a clause for it", () => {
        const data = kitnet({ agency: { name: "BASTOS BRAGA NEGOCIOS IMOBILIARIOS LTDA", cnpj: "11.111.111/0001-11", creci: "J-12345", address: "Av. Brasil, 1", representative: null, email: null, phone: null } }, { management: "AGENCY" });
        const text = textOf(buildContract(data, defaultContractOptions(data)));
        expect(text).toContain("ADMINISTRADORA: BASTOS BRAGA NEGOCIOS IMOBILIARIOS LTDA");
        expect(text).toContain("Os pagamentos serão feitos à ADMINISTRADORA");
        expect(text).toContain("Cláusula 16ª – Da administração");
        expect(text).toContain("Cláusula 20ª – Do foro");
    });
    it("without a guarantee, tells the owner may ask the 15-day eviction injunction", () => {
        const data = kitnet({}, { deposit: null, depositMonths: null });
        const options = defaultContractOptions(data);
        expect(options.guarantee).toBe("NENHUMA");
        expect(textOf(buildContract(data, options))).toContain("art. 59, § 1º, IX");
    });
    it("follows the Faturas late fee and warns when the two differ", () => {
        const data = kitnet({ billing: { finePct: 2, interestPctMonth: 1 } });
        const options = defaultContractOptions(data);
        expect(options.lateFeePct).toBe(2);
        expect(textOf(buildContract(data, options))).toContain("multa moratória de 2% (dois por cento)");
        expect(contractWarnings(data, { ...options, lateFeePct: 10 }).some(w => w.text.includes("As Faturas cobram multa de 2%"))).toBe(true);
    });
    it("lets a single-family tenant pay IPTU and energy in their own name", () => {
        const data = kitnet({ property: { ...kitnet().property, type: "single", unitName: null, unitType: null }, charges: [], iptuPaidBy: "tenant" });
        const text = textOf(buildContract(data, defaultContractOptions(data)));
        expect(text).toContain("o IPTU e as taxas municipais incidentes sobre o imóvel, pagos diretamente nos respectivos vencimentos");
        expect(text).toContain("o imóvel residencial situado na");
    });
    it("does not write a garage or a commercial room", () => {
        expect(contractSupport({ property: { ...kitnet().property, type: "garage" } }).ok).toBe(false);
        expect(contractSupport({ property: { ...kitnet().property, unitType: "commercial_room" } }).ok).toBe(false);
        expect(contractSupport(kitnet()).ok).toBe(true);
    });
    it("reads options back, keeping only valid values", () => {
        const data = kitnet();
        const read = readContractOptions({ guarantee: "X", earlyExitFineRents: 50, pets: "NONE", maxOccupants: "2", pixKey: "  chave  " }, data);
        expect(read).toMatchObject({ guarantee: "CAUCAO", earlyExitFineRents: 3, pets: "NONE", maxOccupants: 2, pixKey: "chave" } satisfies Partial<ContractOptions>);
    });
});

describe("the contract's PDF", () => {
    const data = kitnet();
    const doc = buildContract(data, defaultContractOptions(data));

    it("keeps each signature block and each clause heading together", () => {
        const content = contractContent(doc) as unknown as Array<Record<string, unknown>>;
        const stacks = content.filter(c => c.unbreakable);
        expect(stacks.length).toBeGreaterThan(20);
        // the two signature blocks side by side, five lines each
        const last = content[content.length - 1] as { columns: { stack: unknown[] }[] };
        expect(last.columns.map(c => c.stack.length)).toEqual([5, 5]);
    });
    it("is A4 with the contract's name in the footer", () => {
        const def = contractPdfDefinition(doc, { reference: data.reference, author: "PEDROSA" });
        expect(def.pageSize).toBe("A4");
        const footer = (def.footer as (p: number, n: number) => { columns: { text: string }[] })(2, 9);
        expect(footer.columns.map(c => c.text)).toEqual(["Contrato de locação · SANTO ANTONIO · Kitnet 35B", "Página 2 de 9"]);
    });
});

describe("signatures in a PDF", () => {
    const pdf = (body: string) => new Uint8Array(Buffer.from(`%PDF-1.7\n${body}\n%%EOF`, "latin1"));
    // a commonName attribute as a certificate encodes it: OID 2.5.4.3, UTF8String, length, value
    const cnAttr = (cn: string) => {
        const value = Buffer.from(cn, "utf8");
        return Buffer.concat([Buffer.from([0x30, 0x2b, 0x06, 0x03, 0x55, 0x04, 0x03, 0x0c, value.length]), value]);
    };

    it("counts the signature dictionaries and reads the certificate names", () => {
        // the envelope: junk, the CA's common name (no CPF: ignored), the signer's
        const envelope = (cn: string) => Buffer.concat([Buffer.from([0x30, 0x82, 0x41, 0x2d]), cnAttr("AC Final do Governo Federal do Brasil v1"), cnAttr(cn)]).toString("hex");
        const sig = (cn: string) => `<< /Type /Sig /Filter /Adobe.PPKLite /ByteRange [0 100 200 300] /Contents <${envelope(cn)}> >>`;
        const bytes = pdf(`${sig("ARTUR PEDROSA:12345678901")}\n${sig("JOÃO DA SILVA:98765432100")}`);
        expect(looksLikePdf(bytes)).toBe(true);
        const read = readPdfSignatures(bytes);
        expect(read.count).toBe(2);
        expect(read.signers).toEqual([{ name: "ARTUR PEDROSA", cpf: "12345678901" }, { name: "JOÃO DA SILVA", cpf: "98765432100" }]);
    });
    it("answers zero for a PDF nobody signed, and knows a file that is not a PDF", () => {
        expect(readPdfSignatures(pdf("1 0 obj << /Type /Page >> endobj"))).toEqual({ count: 0, signers: [] });
        expect(looksLikePdf(new Uint8Array(Buffer.from("PK\u0003\u0004 zip")))).toBe(false);
    });
});
