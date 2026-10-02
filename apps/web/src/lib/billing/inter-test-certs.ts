/**
 * Throwaway certificates for the tests of the Banco Inter client: a private authority, a server that
 * plays the bank, a client integration it trusts and another it does not. Made with the `openssl`
 * binary at test time (never committed), in a temporary folder; null when openssl is not around, and
 * the tests that need them skip.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface TestCertificates {
    ca: string;
    server: { cert: string; key: string };
    /** signed by the authority: the bank knows it */
    client: { cert: string; key: string; subject: string };
    /** signed by someone else: the bank refuses it */
    stranger: { cert: string; key: string };
    cleanup: () => void;
}

const openssl = (dir: string, args: string[]) => execFileSync("openssl", args, { cwd: dir, stdio: ["ignore", "ignore", "ignore"] });

export function makeTestCertificates(): TestCertificates | null {
    try {
        execFileSync("openssl", ["version"], { stdio: "ignore" });
    } catch {
        return null;
    }
    const dir = mkdtempSync(join(tmpdir(), "kitnets-inter-"));
    const read = (name: string) => readFileSync(join(dir, name), "utf8");
    const keyArgs = ["-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:prime256v1", "-nodes"];
    const subject = "Kitnets Teste";
    try {
        writeFileSync(join(dir, "server.ext"), "subjectAltName=DNS:localhost,IP:127.0.0.1\n");
        openssl(dir, ["req", "-x509", ...keyArgs, "-keyout", "ca.key", "-out", "ca.crt", "-days", "2", "-subj", "/CN=Kitnets Test CA"]);
        openssl(dir, ["req", "-x509", ...keyArgs, "-keyout", "other-ca.key", "-out", "other-ca.crt", "-days", "2", "-subj", "/CN=Other CA"]);
        openssl(dir, ["req", ...keyArgs, "-keyout", "server.key", "-out", "server.csr", "-subj", "/CN=localhost"]);
        openssl(dir, ["x509", "-req", "-in", "server.csr", "-CA", "ca.crt", "-CAkey", "ca.key", "-CAcreateserial", "-out", "server.crt", "-days", "2", "-extfile", "server.ext"]);
        openssl(dir, ["req", ...keyArgs, "-keyout", "client.key", "-out", "client.csr", "-subj", `/CN=${subject}`]);
        openssl(dir, ["x509", "-req", "-in", "client.csr", "-CA", "ca.crt", "-CAkey", "ca.key", "-CAcreateserial", "-out", "client.crt", "-days", "2"]);
        openssl(dir, ["req", ...keyArgs, "-keyout", "stranger.key", "-out", "stranger.csr", "-subj", "/CN=Stranger"]);
        openssl(dir, ["x509", "-req", "-in", "stranger.csr", "-CA", "other-ca.crt", "-CAkey", "other-ca.key", "-CAcreateserial", "-out", "stranger.crt", "-days", "2"]);
    } catch {
        rmSync(dir, { recursive: true, force: true });
        return null;
    }
    return {
        ca: read("ca.crt"),
        server: { cert: read("server.crt"), key: read("server.key") },
        client: { cert: read("client.crt"), key: read("client.key"), subject },
        stranger: { cert: read("stranger.crt"), key: read("stranger.key") },
        cleanup: () => rmSync(dir, { recursive: true, force: true }),
    };
}
