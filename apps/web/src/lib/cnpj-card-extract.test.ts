import { describe, expect, it } from "vitest";
import { companySizeFromRegistry, isoDate, legalNatureFromRegistry, normalizeCompanyRegistry, readCardText } from "./cnpj-card-extract";

// 11.222.333/0001-81 is the textbook valid CNPJ
const CARD_TEXT = `REPÚBLICA FEDERATIVA DO BRASIL
CADASTRO NACIONAL DA PESSOA JURÍDICA
NÚMERO DE INSCRIÇÃO
11.222.333/0001-81
MATRIZ
COMPROVANTE DE INSCRIÇÃO E DE SITUAÇÃO CADASTRAL
DATA DE ABERTURA
15/07/2021
NOME EMPRESARIAL
PEDROSA PARTICIPACOES LTDA
TÍTULO DO ESTABELECIMENTO (NOME DE FANTASIA)
********
PORTE
ME
CÓDIGO E DESCRIÇÃO DA ATIVIDADE ECONÔMICA PRINCIPAL
68.10-2-02 - Aluguel de imóveis próprios
CÓDIGO E DESCRIÇÃO DAS ATIVIDADES ECONÔMICAS SECUNDÁRIAS
68.21-8-01 - Corretagem na compra e venda e avaliação de imóveis
68.22-6-00 - Gestão e administração da propriedade imobiliária
CÓDIGO E DESCRIÇÃO DA NATUREZA JURÍDICA
206-2 - Sociedade Empresária Limitada
LOGRADOURO
R DAS FLORES
NÚMERO
100
COMPLEMENTO
SALA 2
CEP
80.000-000
BAIRRO/DISTRITO
CENTRO
MUNICÍPIO
CURITIBA
UF
PR
ENDEREÇO ELETRÔNICO
CONTATO@PEDROSA.COM.BR
TELEFONE
(41) 3333-4444
ENTE FEDERATIVO RESPONSÁVEL (EFR)
*****
SITUAÇÃO CADASTRAL
ATIVA
DATA DA SITUAÇÃO CADASTRAL
15/07/2021
MOTIVO DE SITUAÇÃO CADASTRAL
SITUAÇÃO ESPECIAL
********
DATA DA SITUAÇÃO ESPECIAL
********`;

describe("readCardText", () => {
    it("reads the CNPJ, the CNAEs, the natureza jurídica and the porte from the card's text", () => {
        const facts = readCardText(CARD_TEXT);
        expect(facts.cnpj).toBe("11.222.333/0001-81");
        expect(facts.cnae_principal).toEqual({ codigo: "68.10-2-02", descricao: "Aluguel de imóveis próprios" });
        expect(facts.cnaes_secundarios).toEqual([
            { codigo: "68.21-8-01", descricao: "Corretagem na compra e venda e avaliação de imóveis" },
            { codigo: "68.22-6-00", descricao: "Gestão e administração da propriedade imobiliária" },
        ]);
        expect(facts.natureza_juridica).toEqual({ codigo: "206-2", descricao: "Sociedade Empresária Limitada" });
        expect(facts.porte).toBe("ME");
    });

    it("reads the name, the dates and the situação; asterisks mean nothing", () => {
        const facts = readCardText(CARD_TEXT);
        expect(facts.razao_social).toBe("PEDROSA PARTICIPACOES LTDA");
        expect(facts.nome_fantasia).toBeNull();
        expect(facts.data_abertura).toBe("2021-07-15");
        expect(facts.situacao_cadastral).toBe("ATIVA");
        expect(facts.data_situacao_cadastral).toBe("2021-07-15");
    });

    it("copes with a text layer that merged the lines", () => {
        const merged = CARD_TEXT.replace(/\n/g, " ");
        const facts = readCardText(merged);
        expect(facts.cnae_principal?.codigo).toBe("68.10-2-02");
        expect(facts.cnae_principal?.descricao).toBe("Aluguel de imóveis próprios");
        expect(facts.cnaes_secundarios.map((c) => c.codigo)).toEqual(["68.21-8-01", "68.22-6-00"]);
        expect(facts.cnaes_secundarios[1].descricao).toBe("Gestão e administração da propriedade imobiliária");
        expect(facts.natureza_juridica?.descricao).toBe("Sociedade Empresária Limitada");
    });

    it("rejects a CNPJ whose check digits do not match", () => {
        expect(readCardText("NÚMERO DE INSCRIÇÃO\n11.222.333/0001-82").cnpj).toBeNull();
    });

    it("says 'Não informada' as an empty list", () => {
        const facts = readCardText("CÓDIGO E DESCRIÇÃO DAS ATIVIDADES ECONÔMICAS SECUNDÁRIAS\nNão informada\nCÓDIGO E DESCRIÇÃO DA NATUREZA JURÍDICA\n213-5 - Empresário (Individual)");
        expect(facts.cnaes_secundarios).toEqual([]);
        expect(facts.natureza_juridica).toEqual({ codigo: "213-5", descricao: "Empresário (Individual)" });
    });
});

describe("normalizeCompanyRegistry", () => {
    const answer = {
        cnpj: "11222333000181",
        razao_social: " Pedrosa Participações Ltda ",
        nome_fantasia: "****",
        data_abertura: "15/07/2021",
        situacao_cadastral: "Ativa",
        data_situacao_cadastral: "2021-07-15",
        natureza_juridica: { codigo: "206-2", descricao: "Sociedade Empresária Limitada" },
        porte: "me",
        cnae_principal: { codigo: "68.10-2-02", descricao: "Aluguel de imóveis próprios" },
        cnaes_secundarios: [
            { codigo: "68.21-8-01", descricao: "Corretagem na compra e venda e avaliação de imóveis" },
            { codigo: "68.21-8-01", descricao: "repeated" },
            { codigo: "bad", descricao: "no code" },
        ],
        endereco: { logradouro: "R DAS FLORES", numero: "100", complemento: null, bairro: "CENTRO", municipio: "CURITIBA", uf: "pr", cep: "80000000" },
        telefone: "(41) 3333-4444",
        email: "CONTATO@PEDROSA.COM.BR",
        ente_federativo: "*****",
        situacao_especial: null,
        data_situacao_especial: null,
    };

    it("cleans the reader's answer", () => {
        const reg = normalizeCompanyRegistry(answer)!;
        expect(reg.cnpj).toBe("11.222.333/0001-81");
        expect(reg.razao_social).toBe("Pedrosa Participações Ltda");
        expect(reg.nome_fantasia).toBeNull();
        expect(reg.data_abertura).toBe("2021-07-15");
        expect(reg.situacao_cadastral).toBe("ATIVA");
        expect(reg.porte).toBe("ME");
        expect(reg.cnaes_secundarios).toHaveLength(1);
        expect(reg.endereco).toEqual({ logradouro: "R DAS FLORES", numero: "100", complemento: null, bairro: "CENTRO", municipio: "CURITIBA", uf: "PR", cep: "80000-000" });
        expect(reg.email).toBe("contato@pedrosa.com.br");
        expect(reg.ente_federativo).toBeNull();
    });

    it("lets the card's text win for the codes and fill what the reader left out", () => {
        const reg = normalizeCompanyRegistry({ ...answer, cnpj: "00.000.000/0000-00", cnaes_secundarios: [], razao_social: null, porte: null }, CARD_TEXT)!;
        expect(reg.cnpj).toBe("11.222.333/0001-81");
        expect(reg.cnaes_secundarios).toHaveLength(2);
        expect(reg.razao_social).toBe("PEDROSA PARTICIPACOES LTDA");
        expect(reg.porte).toBe("ME");
    });

    it("works from the text alone (no model configured) and from a wrapped answer", () => {
        const fromText = normalizeCompanyRegistry({}, CARD_TEXT)!;
        expect(fromText.cnpj).toBe("11.222.333/0001-81");
        expect(fromText.cnae_principal?.codigo).toBe("68.10-2-02");
        expect(fromText.data_abertura).toBe("2021-07-15");
        const wrapped = normalizeCompanyRegistry({ extracted_data: answer })!;
        expect(wrapped.razao_social).toBe("Pedrosa Participações Ltda");
    });

    it("is null when nothing usable came back", () => {
        expect(normalizeCompanyRegistry({ cnpj: "12", razao_social: "" })).toBeNull();
        expect(normalizeCompanyRegistry(null)).toBeNull();
        expect(normalizeCompanyRegistry("garbage")).toBeNull();
    });

    it("accepts the natureza as a plain string", () => {
        expect(normalizeCompanyRegistry({ razao_social: "X", natureza_juridica: "206-2 - Sociedade Empresária Limitada" })!.natureza_juridica).toEqual({ codigo: "206-2", descricao: "Sociedade Empresária Limitada" });
    });
});

describe("the policies' options", () => {
    const nat = (descricao: string, razao_social: string | null = null) => ({ natureza_juridica: { codigo: null, descricao }, razao_social });

    it("maps the natureza jurídica", () => {
        expect(legalNatureFromRegistry(nat("Sociedade Empresária Limitada"))).toBe("LTDA");
        expect(legalNatureFromRegistry(nat("Sociedade Empresária Limitada", "PEDROSA PARTICIPACOES LTDA UNIPESSOAL"))).toBe("SLU");
        expect(legalNatureFromRegistry(nat("Sociedade Limitada Unipessoal"))).toBe("SLU");
        expect(legalNatureFromRegistry(nat("Sociedade Anônima Fechada"))).toBe("SA");
        expect(legalNatureFromRegistry(nat("Empresário (Individual)"))).toBe("EI");
        expect(legalNatureFromRegistry(nat("Sociedade Simples Pura"))).toBe("OUTRA");
        expect(legalNatureFromRegistry({ natureza_juridica: null, razao_social: "X" })).toBeNull();
    });

    it("maps the porte", () => {
        expect(companySizeFromRegistry("ME")).toBe("ME");
        expect(companySizeFromRegistry("EPP")).toBe("EPP");
        expect(companySizeFromRegistry("DEMAIS")).toBe("DEMAIS");
        expect(companySizeFromRegistry("Microempresa")).toBe("ME");
        expect(companySizeFromRegistry("Empresa de Pequeno Porte")).toBe("EPP");
        expect(companySizeFromRegistry(null)).toBeNull();
        expect(companySizeFromRegistry("GRANDE")).toBeNull();
    });
});

describe("isoDate", () => {
    it("takes ISO and Brazilian dates", () => {
        expect(isoDate("2021-07-15")).toBe("2021-07-15");
        expect(isoDate("2021-07-15T00:00:00Z")).toBe("2021-07-15");
        expect(isoDate("15/07/2021")).toBe("2021-07-15");
        expect(isoDate("julho de 2021")).toBeNull();
        expect(isoDate(null)).toBeNull();
    });
});
