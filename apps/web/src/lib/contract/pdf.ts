/**
 * The contract document (ProseMirror JSON) drawn as a PDF with pdfmake, in the browser: A4, justified
 * text, the clause headings kept with their first paragraph, each signature block on one page, and a
 * footer with the contract's name and "Página x de y". Real text (selectable, searchable), Roboto
 * embedded — what the parties download and sign on gov.br.
 *
 * `contractPdfDefinition` is pure (tested); `renderContractPdf` loads pdfmake (~2 MB with the font)
 * only when a PDF is asked for.
 */
import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";
import { FIELD_MARK, type PMNode } from "./doc";

type Run = { text: string; bold?: boolean; italics?: boolean; decoration?: "underline" | "lineThrough"; background?: string; noWrap?: boolean };

/**
 * pdfmake breaks lines after "-" and "/" and, when justifying, spreads space there too ("e- mail",
 * "Antônio/ SP"): a word holding either is its own run that never wraps.
 */
function keepJoinedWords(run: Run): Run[] {
    if (!/[-/]/.test(run.text)) return [run];
    const joined = /[^\s\-/][-/]+[^\s\-/]/;
    const out: Run[] = [];
    for (const piece of run.text.split(/(\S*[^\s\-/][-/]+[^\s\-/]\S*)/)) {
        if (!piece) continue;
        out.push(joined.test(piece) ? { ...run, text: piece, noWrap: true } : { ...run, text: piece });
    }
    return out;
}

const ALIGN: Record<string, "left" | "center" | "right" | "justify"> = { left: "left", center: "center", right: "right", justify: "justify" };

function runs(nodes: PMNode[] | undefined): Run[] {
    const out: Run[] = [];
    for (const n of nodes ?? []) {
        if (n.type === "hardBreak") {
            out.push({ text: "\n" });
            continue;
        }
        if (n.type !== "text" || !n.text) continue;
        const run: Run = { text: n.text };
        const decorations: Run["decoration"][] = [];
        for (const m of n.marks ?? []) {
            if (m.type === "bold") run.bold = true;
            else if (m.type === "italic") run.italics = true;
            else if (m.type === "underline") decorations.push("underline");
            else if (m.type === "strike") decorations.push("lineThrough");
            else if (m.type === "highlight") run.background = "#fff3a3";
            else if (m.type === FIELD_MARK) run.background = "#fff3a3";
        }
        if (decorations.length) run.decoration = decorations[0];
        out.push(...keepJoinedWords(run));
    }
    return out;
}

const alignOf = (node: PMNode, fallback: "left" | "justify" = "left") => ALIGN[String(node.attrs?.textAlign ?? "")] ?? fallback;

function block(node: PMNode): Content | null {
    switch (node.type) {
        case "heading": {
            const level = Number(node.attrs?.level) || 1;
            return { text: runs(node.content), style: `h${Math.min(3, Math.max(1, level))}`, alignment: alignOf(node, level === 1 ? "left" : "left"), headlineLevel: level } as Content;
        }
        case "paragraph": {
            const indent = Math.max(0, Number(node.attrs?.indent) || 0);
            const content = runs(node.content);
            return { text: content.length ? content : " ", alignment: alignOf(node), margin: [indent * 18, 0, 0, 6] } as Content;
        }
        case "bulletList":
        case "orderedList": {
            const items = (node.content ?? []).map(li => ({ stack: (li.content ?? []).map(block).filter((c): c is Content => c !== null) }));
            return (node.type === "bulletList" ? { ul: items, margin: [0, 0, 0, 6] } : { ol: items, margin: [0, 0, 0, 6] }) as Content;
        }
        case "blockquote":
            return { stack: (node.content ?? []).map(block).filter((c): c is Content => c !== null), margin: [18, 0, 0, 6], italics: true } as Content;
        case "horizontalRule":
            return { canvas: [{ type: "line", x1: 0, y1: 0, x2: 471, y2: 0, lineWidth: 0.5, lineColor: "#999999" }], margin: [0, 6, 0, 10] } as Content;
        default:
            return node.content ? { stack: node.content.map(block).filter((c): c is Content => c !== null) } as Content : null;
    }
}

/** The document's blocks: signature groups kept on one page, a clause heading kept with what follows it. */
export function contractContent(doc: PMNode): Content[] {
    const nodes = doc.content ?? [];
    // 1. consecutive paragraphs of one group become one unbreakable stack; signature blocks go two to a row
    const grouped: { node: PMNode | null; content: Content; signature?: boolean }[] = [];
    for (let i = 0; i < nodes.length; i++) {
        const group = nodes[i].type === "paragraph" ? nodes[i].attrs?.group : null;
        if (group) {
            const stack: Content[] = [];
            while (i < nodes.length && nodes[i].type === "paragraph" && nodes[i].attrs?.group === group) {
                const c = block(nodes[i]);
                if (c) stack.push(c);
                i++;
            }
            i--;
            const signature = String(group).startsWith("sig-");
            const previous = grouped[grouped.length - 1];
            if (signature && previous?.signature && !(previous.content as { columns?: unknown[] }).columns) {
                // the second block of a pair: side by side with the first
                previous.content = { columns: [previous.content, { stack }], columnGap: 24, unbreakable: true } as Content;
                previous.signature = false;
                continue;
            }
            grouped.push({ node: null, content: { stack, unbreakable: true } as Content, signature });
            continue;
        }
        const c = block(nodes[i]);
        if (c) grouped.push({ node: nodes[i], content: c });
    }
    // 2. a section or clause heading never ends a page alone
    const out: Content[] = [];
    for (let i = 0; i < grouped.length; i++) {
        const g = grouped[i];
        const level = g.node?.type === "heading" ? Number(g.node.attrs?.level) || 1 : 0;
        if (level >= 2 && i + 1 < grouped.length) {
            const keep: Content[] = [g.content];
            // a section heading followed by a clause heading: both stay with the clause's first paragraph
            let j = i + 1;
            while (j < grouped.length && grouped[j].node?.type === "heading" && j - i < 3) keep.push(grouped[j++].content);
            if (j < grouped.length) keep.push(grouped[j].content);
            out.push({ stack: keep, unbreakable: true } as Content);
            i = j;
            continue;
        }
        out.push(g.content);
    }
    return out;
}

export interface ContractPdfMeta {
    /** "SANTO ANTONIO · Kitnet 35B" */
    reference: string;
    author: string | null;
}

export function contractPdfDefinition(doc: PMNode, meta: ContractPdfMeta): TDocumentDefinitions {
    return {
        pageSize: "A4",
        pageMargins: [62, 56, 62, 60],
        info: { title: `Contrato de locação – ${meta.reference}`, author: meta.author ?? undefined, subject: "Contrato de locação residencial", creator: "Kitnets", producer: "Kitnets" },
        content: contractContent(doc),
        footer: (currentPage: number, pageCount: number) => ({
            columns: [
                { text: `Contrato de locação · ${meta.reference}`, alignment: "left" },
                { text: `Página ${currentPage} de ${pageCount}`, alignment: "right" },
            ],
            margin: [62, 24, 62, 0],
            fontSize: 8,
            color: "#6b7280",
        }),
        defaultStyle: { font: "Roboto", fontSize: 10.5, lineHeight: 1.3 },
        styles: {
            h1: { fontSize: 14, bold: true, margin: [0, 0, 0, 14] },
            h2: { fontSize: 11.5, bold: true, margin: [0, 12, 0, 6] },
            h3: { fontSize: 10.5, bold: true, margin: [0, 8, 0, 4] },
        },
    };
}

/** The PDF as a Blob (browser only). */
export async function renderContractPdf(doc: PMNode, meta: ContractPdfMeta): Promise<Blob> {
    const [pdfModule, vfsModule] = await Promise.all([import("pdfmake/build/pdfmake"), import("pdfmake/build/vfs_fonts")]);
    const pdfMake = ((pdfModule as unknown as { default?: typeof pdfModule }).default ?? pdfModule) as typeof pdfModule;
    const vfs = ((vfsModule as unknown as { default?: unknown }).default ?? vfsModule) as Parameters<typeof pdfModule.addVirtualFileSystem>[0];
    pdfMake.addVirtualFileSystem(vfs);
    return pdfMake.createPdf(contractPdfDefinition(doc, meta)).getBlob();
}
