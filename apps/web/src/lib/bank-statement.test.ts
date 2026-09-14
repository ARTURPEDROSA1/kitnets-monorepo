import { describe, expect, it } from "vitest";
import { classifyMemo, classifyStatement, parseOfx, parseStatement, parseStatementCsv } from "./bank-statement";

const OFX = `OFXHEADER:100
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260905120000[-3:BRT]<TRNAMT>-3850.04<FITID>2026090501<MEMO>PARC CRED IMOB 906687</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260906<TRNAMT>3950.00<FITID>2026090602<NAME>PIX RECEBIDO<MEMO>ALUGUEL VALE DO SOL</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260910<TRNAMT>-29,90<FITID>2026091003<MEMO>TARIFA BANCARIA CESTA</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260912<TRNAMT>-410.55<FITID>2026091204<MEMO>CEMIG DISTRIBUICAO</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260915<TRNAMT>-120.00<FITID>2026091505<MEMO>COMPRA CARTAO SUPERMERCADO</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

describe("parseOfx", () => {
    it("reads STMTTRN blocks with date, signed amount, memo and FITID", () => {
        const rows = parseOfx(OFX);
        expect(rows).toHaveLength(5);
        expect(rows[0]).toMatchObject({ date: "2026-09-05", amount: -3850.04, reference: "2026090501" });
        expect(rows[1].memo).toBe("PIX RECEBIDO · ALUGUEL VALE DO SOL");
        expect(rows[2].amount).toBe(-29.9);
    });
});

describe("parseStatementCsv", () => {
    it("finds date, amount and description columns", () => {
        const csv = "Data;Histórico;Valor\n05/09/2026;Parc Cred Imob;-3.850,04\n06/09/2026;Pix recebido;3.950,00\n;;\n";
        const rows = parseStatementCsv(csv);
        expect(rows).toHaveLength(2);
        expect(rows[0]).toMatchObject({ date: "2026-09-05", amount: -3850.04, memo: "Parc Cred Imob" });
        expect(rows[0].reference).toMatch(/^csv:2026-09-05:/);
    });
    it("handles separate debit / credit columns", () => {
        const csv = "Data\tLançamento\tDébito\tCrédito\n10/09/2026\tTarifa\t29,90\t\n11/09/2026\tAluguel\t\t3.950,00\n";
        const rows = parseStatementCsv(csv);
        expect(rows.map(r => r.amount)).toEqual([-29.9, 3950]);
    });
    it("parseStatement picks the format by name or content", () => {
        expect(parseStatement(OFX, "extrato.ofx")).toHaveLength(5);
        expect(parseStatement("Data;Valor;Histórico\n01/09/2026;-10,00;x\n", "extrato.csv")).toHaveLength(1);
    });
});

describe("classifyStatement", () => {
    it("suggests ledger kinds for outflows and leaves the rest for review", () => {
        const rows = classifyStatement(parseOfx(OFX));
        expect(rows.map(r => r.kind)).toEqual(["PRESTACAO", null, "TARIFA", "UTILIDADES", null]);
        expect(rows[1].inflow).toBe(true);
        expect(classifyMemo("IPTU 2026 PARC 1")).toBe("IPTU");
        expect(classifyMemo("Ant Par Financ")).toBe("AMORTIZACAO");
        expect(classifyMemo("Leroy Merlin material")).toBe("REFORMA");
    });
});
