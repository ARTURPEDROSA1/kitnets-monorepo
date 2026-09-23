/**
 * Which section an uploaded picture belongs to — the pure half of the AI classification the
 * documents route runs on every image the owner sends to Fotos, Plantas, Divulgação or Outros.
 *
 * Why: a floor plan dropped under Fotos rotates into the card's carousel and is missing from
 * Plantas. The model looks at the picture once and says what it is; the route keeps the owner's
 * choice unless the model is sure of a different one.
 */
import type { DocumentKind } from "./new-investments";

/** The kinds a picture can be sorted into. Contracts are chosen deliberately and never re-sorted. */
export const CLASSIFIABLE_KINDS = ["PHOTO", "LAYOUT", "MARKETING", "OTHER"] as const satisfies readonly DocumentKind[];
export type ClassifiableKind = (typeof CLASSIFIABLE_KINDS)[number];

/** Below this the model's opinion is not worth moving a file over the owner's own choice. */
export const CLASSIFY_MIN_CONFIDENCE = 0.7;
/** Pictures above this are not sent to the model: the cost is not worth it for a wallpaper. */
export const CLASSIFY_MAX_BYTES = 8 * 1024 * 1024;

export const IMAGE_CLASSIFY_PROMPT = `Você classifica uma imagem enviada por um investidor para a pasta de um imóvel comprado na planta.

Diga em qual seção ela deve ficar:
- "PHOTO": fotografia real ou imagem 3D (render/perspectiva) do empreendimento, da unidade, da fachada, das áreas de lazer, da obra ou da vista. Predomina a imagem, não o texto.
- "LAYOUT": planta baixa, planta humanizada, planta de implantação, corte, croqui de cômodos com medidas, plantas de andar/pavimento. Desenho técnico ou esquemático de ambientes.
- "MARKETING": folder, anúncio, tabela de preços, post, banner, apresentação de vendas — peça publicitária em que o texto (preços, slogans, condições, logotipo grande) é parte essencial.
- "OTHER": qualquer outra coisa (documento, print de tela, comprovante, foto sem relação).

Retorne SOMENTE um JSON válido (sem markdown) com esta estrutura:
{
    "kind": "PHOTO | LAYOUT | MARKETING | OTHER",
    "confidence": "número entre 0 e 1: sua certeza",
    "reason": "uma frase curta em português dizendo o que a imagem mostra"
}`;

export interface ImageClassification {
    kind: ClassifiableKind;
    confidence: number;
    reason: string | null;
}

/** The model's JSON as a classification; null when it is not one. */
export function normalizeClassification(data: unknown): ImageClassification | null {
    if (!data || typeof data !== "object") return null;
    const { kind, confidence, reason } = data as { kind?: unknown; confidence?: unknown; reason?: unknown };
    const k = typeof kind === "string" ? kind.trim().toUpperCase() : "";
    if (!(CLASSIFIABLE_KINDS as readonly string[]).includes(k)) return null;
    const c = typeof confidence === "number" ? confidence : typeof confidence === "string" ? Number(confidence.replace(",", ".")) : NaN;
    return {
        kind: k as ClassifiableKind,
        confidence: Number.isFinite(c) ? Math.min(1, Math.max(0, c)) : 0,
        reason: typeof reason === "string" && reason.trim() ? reason.trim().slice(0, 200) : null,
    };
}

/**
 * Where the file should go: the model's kind when it disagrees with the owner and is sure enough,
 * otherwise where the owner put it.
 */
export function resolveKind(chosen: DocumentKind, guess: ImageClassification | null): DocumentKind {
    if (!guess || guess.kind === chosen || guess.confidence < CLASSIFY_MIN_CONFIDENCE) return chosen;
    return guess.kind;
}
