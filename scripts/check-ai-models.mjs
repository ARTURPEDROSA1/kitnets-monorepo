#!/usr/bin/env node
// Weekly health check for the AI models named in apps/web/src/lib/ai-models.ts.
//
// The app falls back from Gemini to OpenAI when a call fails, which keeps the
// features working and hides a retired model for months. This script makes one
// tiny real call per configured model and exits non-zero when a provider says
// the model no longer exists, so the scheduled workflow fails and someone is
// told. A busy provider (503/429) is retried and is never a failure by itself.
//
// Env: GEMINI_API_KEY (required), OPENAI_API_KEY (optional),
//      GEMINI_MODEL / OPENAI_MODEL / OPENAI_MINI_MODEL (optional overrides,
//      keep them equal to what is set in Vercel).
// Exit: 0 healthy or only transient trouble, 1 a configured model is gone,
//       2 misconfiguration (missing key, file not found).

import { readFileSync, appendFileSync } from "node:fs";

const MODELS_FILE = new URL("../apps/web/src/lib/ai-models.ts", import.meta.url);
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const ATTEMPTS = 5;
const WAIT_MS = 20_000;
const REQUEST_TIMEOUT_MS = 30_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lines = [];
const say = (s = "") => { console.log(s); lines.push(s); };

function defaultsFromSource() {
    const src = readFileSync(MODELS_FILE, "utf8");
    const pick = (envName) => {
        const m = src.match(new RegExp(`process\\.env\\.${envName} \\|\\| "([^"]+)"`));
        if (!m) throw new Error(`default for ${envName} not found in lib/ai-models.ts`);
        return m[1];
    };
    return { gemini: pick("GEMINI_MODEL"), openai: pick("OPENAI_MODEL"), openaiMini: pick("OPENAI_MINI_MODEL") };
}

const isGone = (status, message) =>
    status === 404 || /not[ _]found|no longer available|is not supported for generateContent|deprecated|does not exist/i.test(message || "");

/** @returns {{state: "ok"|"gone"|"busy"|"error", detail: string}} */
async function probeGemini(model, key) {
    let last = "";
    for (let i = 1; i <= ATTEMPTS; i++) {
        const started = Date.now();
        let status = 0, message = "";
        try {
            const res = await fetch(`${GEMINI_BASE}/models/${model}:generateContent`, {
                signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
                method: "POST",
                headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: 'Devolva JSON {"ok": true}' }] }],
                    generationConfig: { responseMimeType: "application/json", temperature: 0 },
                }),
            });
            status = res.status;
            const json = await res.json().catch(() => ({}));
            if (res.ok && json.candidates?.[0]?.content?.parts?.[0]?.text) {
                return { state: "ok", detail: `answered in ${Date.now() - started} ms (attempt ${i})` };
            }
            message = json.error?.message || `HTTP ${status}`;
        } catch (err) {
            message = String(err?.message || err);
        }
        last = `${status || "network"}: ${message.replace(/\s+/g, " ").slice(0, 160)}`;
        if (isGone(status, message)) return { state: "gone", detail: last };
        if (status === 401 || status === 403) return { state: "error", detail: last };
        if (i < ATTEMPTS) await sleep(WAIT_MS);
    }
    return { state: /^(503|429|500|network)/.test(last) ? "busy" : "error", detail: last };
}

async function suggestGemini(key, current) {
    const res = await fetch(`${GEMINI_BASE}/models?pageSize=200`, { headers: { "x-goog-api-key": key }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    const json = await res.json().catch(() => ({}));
    const candidates = (json.models || [])
        .filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
        .map((m) => m.name.replace("models/", ""))
        .filter((n) => /^gemini-[\d.]+-flash$/.test(n) && n !== current)
        .sort((a, b) => parseFloat(b.split("-")[1]) - parseFloat(a.split("-")[1]))
        .slice(0, 4);
    const working = [];
    for (const name of candidates) {
        const r = await probeGemini(name, key);
        say(`    candidate ${name.padEnd(20)} ${r.state}  (${r.detail})`);
        if (r.state === "ok") working.push(name);
    }
    return working;
}

async function probeOpenAI(model, key) {
    try {
        const res = await fetch(`https://api.openai.com/v1/models/${encodeURIComponent(model)}`, {
            headers: { Authorization: `Bearer ${key}` },
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if (res.ok) return { state: "ok", detail: "listed for this key" };
        const json = await res.json().catch(() => ({}));
        const message = json.error?.message || `HTTP ${res.status}`;
        return { state: isGone(res.status, message) ? "gone" : "error", detail: `${res.status}: ${message.slice(0, 160)}` };
    } catch (err) {
        return { state: "busy", detail: String(err?.message || err) };
    }
}

async function main() {
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) { say("GEMINI_API_KEY is not set (add it as a repository secret)."); return 2; }

    const defaults = defaultsFromSource();
    const models = {
        gemini: process.env.GEMINI_MODEL || defaults.gemini,
        openai: process.env.OPENAI_MODEL || defaults.openai,
        openaiMini: process.env.OPENAI_MINI_MODEL || defaults.openaiMini,
    };

    say("## AI models check");
    say("");
    let gone = false;

    const g = await probeGemini(models.gemini, geminiKey);
    say(`- Gemini \`${models.gemini}\`: **${g.state}** (${g.detail})`);
    if (g.state === "gone") {
        gone = true;
        say("  - The provider says this model no longer exists. Every Gemini call in the app is falling back to OpenAI.");
        say("  - Testing replacements:");
        const working = await suggestGemini(geminiKey, models.gemini);
        say(working.length
            ? `  - **Fix:** set \`GEMINI_MODEL=${working[0]}\` in Vercel (and as a repository variable), or change the default in \`apps/web/src/lib/ai-models.ts\`. Working now: ${working.join(", ")}.`
            : "  - No replacement answered right now; run this workflow again later.");
    } else if (g.state === "busy") {
        say("  - Busy after several retries. Not a retirement; the app's OpenAI fallback covers this.");
    } else if (g.state === "error") {
        say("  - Unexpected error (key revoked or restricted?). Check the GEMINI_API_KEY secret.");
        gone = true;
    }

    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey) {
        for (const [role, name] of [["fallback", models.openai], ["mini", models.openaiMini]]) {
            const o = await probeOpenAI(name, openaiKey);
            say(`- OpenAI ${role} \`${name}\`: **${o.state}** (${o.detail})`);
            if (o.state === "gone") {
                gone = true;
                say(`  - **Fix:** set \`${role === "mini" ? "OPENAI_MINI_MODEL" : "OPENAI_MODEL"}\` to a current model, or change the default in \`apps/web/src/lib/ai-models.ts\`.`);
            }
        }
    } else {
        say("- OpenAI: skipped (OPENAI_API_KEY secret not set).");
    }

    say("");
    say(gone ? "**Result: action needed.**" : "**Result: healthy.**");
    return gone ? 1 : 0;
}

const code = await main().catch((err) => { say(`check crashed: ${err?.stack || err}`); return 2; });
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join("\n") + "\n");
process.exit(code);
