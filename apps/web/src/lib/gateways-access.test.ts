import { describe, expect, it } from "vitest";
import { DEFAULT_GATEWAY_PILOT_EMAILS, canSeeGateways, gatewayPilotEmails } from "./gateways-access";

describe("gatewayPilotEmails", () => {
    it("falls back to the founder when the variable is empty", () => {
        expect(gatewayPilotEmails(undefined)).toEqual(DEFAULT_GATEWAY_PILOT_EMAILS);
        expect(gatewayPilotEmails("")).toEqual(DEFAULT_GATEWAY_PILOT_EMAILS);
        expect(gatewayPilotEmails(" , ")).toEqual(DEFAULT_GATEWAY_PILOT_EMAILS);
    });
    it("reads a comma-separated list, trimmed and lowercased", () => {
        expect(gatewayPilotEmails(" A@x.com , b@Y.com")).toEqual(["a@x.com", "b@y.com"]);
    });
});

describe("canSeeGateways", () => {
    it("lets only the listed accounts in, case-insensitively", () => {
        expect(canSeeGateways("pedrosa.ac@gmail.com")).toBe(true);
        expect(canSeeGateways("PEDROSA.AC@GMAIL.COM")).toBe(true);
        expect(canSeeGateways("b@y.com", "a@x.com,b@y.com")).toBe(true);
        expect(canSeeGateways("pedrosa.ac@gmail.com", "a@x.com")).toBe(false);
        expect(canSeeGateways("someone@else.com")).toBe(false);
    });
    it("does not accept a padded variant or a missing e-mail", () => {
        expect(canSeeGateways(" pedrosa.ac@gmail.com")).toBe(false);
        expect(canSeeGateways("pedrosa.ac@gmail.com ")).toBe(false);
        expect(canSeeGateways(null)).toBe(false);
        expect(canSeeGateways("")).toBe(false);
    });
});
