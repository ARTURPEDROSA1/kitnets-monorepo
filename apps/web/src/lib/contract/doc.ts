/**
 * The contract as the editor keeps it: a ProseMirror (TipTap) JSON document. The template writes it,
 * the editor changes it, the PDF is drawn from it and the database stores it as is.
 *
 * Nodes used: doc, heading (levels 1–3), paragraph, bulletList / orderedList / listItem, blockquote,
 * hardBreak, horizontalRule and text. Marks: bold, italic, underline, strike, highlight and `field` — a
 * blank still to be filled in ("[CPF DO REPRESENTANTE]"), keyed so the side panel fills every copy of
 * it at once. Paragraph attributes: textAlign, indent (steps of 1.5em) and group (paragraphs sharing a
 * group stay together on one PDF page: a signature block).
 */

export interface PMMark {
    type: string;
    attrs?: Record<string, unknown>;
}

export interface PMNode {
    type: string;
    attrs?: Record<string, unknown>;
    content?: PMNode[];
    text?: string;
    marks?: PMMark[];
}

export interface ContractDoc extends PMNode {
    type: "doc";
    content: PMNode[];
}

/** A run of text: plain, or with marks; a `field` is a blank to fill in. */
export type Inline = string | { text: string; bold?: boolean; italic?: boolean; underline?: boolean; field?: { key: string; label: string } } | null | false | undefined;

export type Align = "left" | "center" | "right" | "justify";

export const FIELD_MARK = "field";

export function textNodes(inlines: Inline[]): PMNode[] {
    const out: PMNode[] = [];
    for (const piece of inlines) {
        if (!piece) continue;
        if (typeof piece === "string") {
            if (!piece) continue;
            const last = out[out.length - 1];
            // plain runs next to each other become one text node
            if (last && !last.marks && last.type === "text") last.text += piece;
            else out.push({ type: "text", text: piece });
            continue;
        }
        if (!piece.text) continue;
        const marks: PMMark[] = [];
        if (piece.bold) marks.push({ type: "bold" });
        if (piece.italic) marks.push({ type: "italic" });
        if (piece.underline) marks.push({ type: "underline" });
        if (piece.field) marks.push({ type: FIELD_MARK, attrs: { key: piece.field.key, label: piece.field.label } });
        out.push(marks.length ? { type: "text", text: piece.text, marks } : { type: "text", text: piece.text });
    }
    return out;
}

export function paragraph(inlines: Inline[], opts: { align?: Align; indent?: number; group?: string } = {}): PMNode {
    const attrs: Record<string, unknown> = { textAlign: opts.align ?? "justify" };
    if (opts.indent) attrs.indent = opts.indent;
    if (opts.group) attrs.group = opts.group;
    const content = textNodes(inlines);
    return content.length ? { type: "paragraph", attrs, content } : { type: "paragraph", attrs };
}

export function heading(level: 1 | 2 | 3, inlines: Inline[], align: Align = level === 1 ? "center" : "left"): PMNode {
    return { type: "heading", attrs: { level, textAlign: align }, content: textNodes(inlines) };
}

/** Plain text of a node and everything inside it. */
export function plainText(node: PMNode): string {
    if (node.type === "text") return node.text ?? "";
    if (node.type === "hardBreak") return "\n";
    return (node.content ?? []).map(plainText).join("");
}

export interface FieldInfo {
    key: string;
    label: string;
    /** the text the blank shows now ("[CPF]") */
    text: string;
    count: number;
}

const fieldMarkOf = (node: PMNode): PMMark | undefined => node.marks?.find(m => m.type === FIELD_MARK);

/** The blanks still in the document, in reading order, one entry per key. */
export function fieldsIn(doc: PMNode): FieldInfo[] {
    const byKey = new Map<string, FieldInfo>();
    const walk = (node: PMNode) => {
        const mark = node.type === "text" ? fieldMarkOf(node) : undefined;
        if (mark) {
            const key = String(mark.attrs?.key ?? "");
            const found = byKey.get(key);
            if (found) found.count++;
            else byKey.set(key, { key, label: String(mark.attrs?.label ?? key), text: node.text ?? "", count: 1 });
        }
        node.content?.forEach(walk);
    };
    walk(doc);
    return [...byKey.values()];
}

/** Every copy of a blank replaced by `value`, as plain text (the other marks of the run are kept). */
export function fillField<T extends PMNode>(doc: T, key: string, value: string): T {
    const walk = (node: PMNode): PMNode => {
        if (node.type === "text") {
            const mark = fieldMarkOf(node);
            if (!mark || mark.attrs?.key !== key) return node;
            const marks = node.marks!.filter(m => m.type !== FIELD_MARK);
            return marks.length ? { ...node, text: value, marks } : { type: "text", text: value };
        }
        if (!node.content) return node;
        return { ...node, content: node.content.map(walk) };
    };
    return walk(doc) as T;
}

/** A valid, empty document. */
export const EMPTY_DOC: ContractDoc = { type: "doc", content: [{ type: "paragraph" }] };

/** Is this a document the editor can open? (what comes back from the database or a request) */
export function isContractDoc(v: unknown): v is ContractDoc {
    if (!v || typeof v !== "object") return false;
    const d = v as PMNode;
    return d.type === "doc" && Array.isArray(d.content);
}
