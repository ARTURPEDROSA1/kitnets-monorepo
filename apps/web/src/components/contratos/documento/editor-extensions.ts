/**
 * The contract editor's own pieces on top of TipTap's StarterKit (lib/contract/doc.ts says what they
 * mean): the `field` mark — a blank still to fill in — and the paragraph attributes indent and group.
 */
import { Extension, Mark, mergeAttributes, type Editor } from "@tiptap/react";
import type { Mark as PMMark } from "@tiptap/pm/model";
import { FIELD_MARK } from "@/lib/contract/doc";

export const FieldMark = Mark.create({
    name: FIELD_MARK,
    inclusive: false,
    excludes: "",
    addAttributes() {
        return {
            key: { default: null, parseHTML: el => el.getAttribute("data-field"), renderHTML: attrs => ({ "data-field": attrs.key }) },
            label: { default: null, parseHTML: el => el.getAttribute("data-label"), renderHTML: attrs => ({ "data-label": attrs.label, title: attrs.label ? `Preencher: ${attrs.label}` : null }) },
        };
    },
    parseHTML() {
        return [{ tag: "span[data-field]" }];
    },
    renderHTML({ HTMLAttributes }) {
        return ["span", mergeAttributes(HTMLAttributes, { class: "contract-field" }), 0];
    },
});

export const ParagraphAttrs = Extension.create({
    name: "contractParagraphAttrs",
    addGlobalAttributes() {
        return [
            {
                types: ["paragraph"],
                attributes: {
                    indent: {
                        default: 0,
                        parseHTML: el => Number(el.getAttribute("data-indent")) || 0,
                        renderHTML: attrs => (attrs.indent ? { "data-indent": attrs.indent, style: `margin-left: ${Number(attrs.indent) * 1.5}em` } : {}),
                    },
                    group: {
                        default: null,
                        parseHTML: el => el.getAttribute("data-group"),
                        renderHTML: attrs => (attrs.group ? { "data-group": attrs.group } : {}),
                    },
                },
            },
        ];
    },
});

/** Every copy of the blank `key` replaced by `value` (plain text, the run's other marks kept), as one undo step. */
export function fillFieldInEditor(editor: Editor, key: string, value: string): number {
    const { state } = editor;
    const ranges: { from: number; to: number; marks: readonly PMMark[] }[] = [];
    state.doc.descendants((node, pos) => {
        if (node.isText && node.marks.some(m => m.type.name === FIELD_MARK && m.attrs.key === key)) {
            ranges.push({ from: pos, to: pos + node.nodeSize, marks: node.marks.filter(m => m.type.name !== FIELD_MARK) });
        }
    });
    if (!ranges.length || !value) return 0;
    let tr = state.tr;
    for (const r of [...ranges].reverse()) tr = tr.replaceWith(r.from, r.to, state.schema.text(value, r.marks));
    // the screen saves it as a filled blank, not as a hand edit
    editor.view.dispatch(tr.setMeta("programmatic", true));
    return ranges.length;
}

/** Selects the next blank after the cursor (wrapping to the first) and scrolls to it; false when none is left. */
export function selectNextField(editor: Editor): boolean {
    const { state } = editor;
    const found: { from: number; to: number }[] = [];
    state.doc.descendants((node, pos) => {
        if (node.isText && node.marks.some(m => m.type.name === FIELD_MARK)) found.push({ from: pos, to: pos + node.nodeSize });
    });
    if (!found.length) return false;
    const after = found.find(f => f.from > state.selection.from) ?? found[0];
    editor.chain().focus().setTextSelection(after).scrollIntoView().run();
    return true;
}
