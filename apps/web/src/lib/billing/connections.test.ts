import { describe, expect, it } from "vitest";
import { NO_CONNECTIONS, certificateStanding, connectionAttention, type ConnectionsView, type InterConnectionView } from "./connections";

const TODAY = "2026-10-02";

const inter = (over: Partial<InterConnectionView> = {}): InterConnectionView => ({
    status: "CONNECTED", environment: "PRODUCTION", account: "123456", clientIdTail: "…5c4d", certificateSubject: "Kitnets", certificateExpiresAt: "2027-09-30T12:00:00.000Z",
    scopes: ["boleto-cobranca.read", "boleto-cobranca.write"], configuredAt: "2026-10-01T10:00:00.000Z", lastCheckedAt: "2026-10-01T10:00:05.000Z", lastError: null, usable: true, ...over,
});
const view = (over: Partial<ConnectionsView> = {}): ConnectionsView => ({ available: true, sandboxAllowed: false, inter: inter(), ...over });

describe("certificateStanding", () => {
    it("counts the days and says when to renew", () => {
        expect(certificateStanding("2027-09-30T12:00:00.000Z", TODAY)).toEqual({ daysLeft: 363, state: "ok" });
        expect(certificateStanding("2026-12-15T00:00:00.000Z", TODAY)).toEqual({ daysLeft: 74, state: "renew" });
        expect(certificateStanding("2026-10-10T00:00:00.000Z", TODAY)).toEqual({ daysLeft: 8, state: "urgent" });
        expect(certificateStanding("2026-10-01T00:00:00.000Z", TODAY)).toEqual({ daysLeft: -1, state: "expired" });
        expect(certificateStanding(null, TODAY)).toBeNull();
    });
});

describe("connectionAttention", () => {
    it("is quiet for a healthy connection, and for an account that collects nothing", () => {
        expect(connectionAttention(view(), TODAY, true)).toEqual([]);
        expect(connectionAttention({ ...NO_CONNECTIONS, available: true }, TODAY, false)).toEqual([]);
    });

    it("asks an account that collects something to connect, unless the server cannot keep secrets", () => {
        expect(connectionAttention({ ...NO_CONNECTIONS, available: true }, TODAY, true)).toMatchObject([{ kind: "not_connected", tone: "slate" }]);
        expect(connectionAttention(NO_CONNECTIONS, TODAY, true)).toEqual([]);
    });

    it("says why a connection is not working", () => {
        expect(connectionAttention(view({ inter: inter({ status: "ERROR", lastError: "O Banco Inter recusou o certificado." }) }), TODAY, true))
            .toMatchObject([{ kind: "error", tone: "rose", text: "a conexão falhou: O Banco Inter recusou o certificado." }]);
        expect(connectionAttention(view({ inter: inter({ status: "PENDING", lastCheckedAt: null }) }), TODAY, true)).toMatchObject([{ kind: "error", tone: "amber" }]);
        expect(connectionAttention(view({ inter: inter({ environment: "SANDBOX", usable: false }) }), TODAY, true)).toMatchObject([{ kind: "sandbox", tone: "amber" }]);
        // the sandbox is fine where it is allowed
        expect(connectionAttention(view({ sandboxAllowed: true, inter: inter({ environment: "SANDBOX" }) }), TODAY, true)).toEqual([]);
    });

    it("warns about the certificate from the day the bank lets it be renewed", () => {
        expect(connectionAttention(view({ inter: inter({ certificateExpiresAt: "2026-12-15T00:00:00.000Z" }) }), TODAY, true))
            .toMatchObject([{ kind: "certificate", tone: "amber", text: "o certificado vence em 74 dias: renove a integração no Internet Banking" }]);
        expect(connectionAttention(view({ inter: inter({ certificateExpiresAt: "2026-10-10T00:00:00.000Z" }) }), TODAY, true)).toMatchObject([{ kind: "certificate", tone: "rose" }]);
        expect(connectionAttention(view({ inter: inter({ certificateExpiresAt: "2026-09-01T00:00:00.000Z", usable: false }) }), TODAY, true))
            .toMatchObject([{ kind: "certificate", tone: "rose", text: expect.stringContaining("venceu") }]);
    });
});
