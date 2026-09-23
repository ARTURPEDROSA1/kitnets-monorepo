/**
 * Which model answered a document read — the one fact the owner asked to see after each receipt.
 *
 * Pure and dependency-free so the client components can print it; the server runner produces it.
 */
export interface ReadBy {
    provider: "gemini" | "openai";
    model: string;
}

const PROVIDER_NAMES: Record<ReadBy["provider"], string> = { gemini: "Gemini", openai: "OpenAI" };

/** "Gemini (gemini-3.5-flash)" — the name people know, the id for anyone checking the config. */
export function readerLabel(readBy: ReadBy | null | undefined): string | null {
    if (!readBy) return null;
    return `${PROVIDER_NAMES[readBy.provider] ?? readBy.provider} (${readBy.model})`;
}

/** The lenient parse of whatever a route returned under `read_by`. */
export function readByFromJson(value: unknown): ReadBy | null {
    if (!value || typeof value !== "object") return null;
    const v = value as Record<string, unknown>;
    const provider = v.provider === "gemini" || v.provider === "openai" ? v.provider : null;
    const model = typeof v.model === "string" && v.model ? v.model : null;
    return provider && model ? { provider, model } : null;
}
