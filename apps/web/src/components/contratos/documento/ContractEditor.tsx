"use client";

/**
 * The contract as a page to read and edit, like a word processor: a toolbar (undo, styles, bold,
 * italic, underline, alignment, lists, next blank) over a white A4-wide sheet. TipTap underneath; the
 * document is ProseMirror JSON (lib/contract/doc.ts). Read-only once the contract is accepted.
 */
import React, { useEffect, useReducer } from "react";
import { EditorContent, useEditor, type Editor, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import Highlight from "@tiptap/extension-highlight";
import {
    AlignCenter, AlignJustify, AlignLeft, AlignRight, Bold, Highlighter, Italic, List, ListOrdered, Redo2, Strikethrough, TextCursorInput, Underline, Undo2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ContractDoc } from "@/lib/contract/doc";
import { FieldMark, ParagraphAttrs, selectNextField } from "./editor-extensions";

interface Props {
    content: ContractDoc;
    editable: boolean;
    /** a change the owner made in the text (not a programmatic one) */
    onUserChange: (doc: ContractDoc) => void;
    onReady: (editor: Editor | null) => void;
    /** blanks left, shown on the "next blank" button */
    fieldCount: number;
}

type BlockStyle = "p" | "h1" | "h2" | "h3";
const STYLE_LABELS: Record<BlockStyle, string> = { h1: "Título", h2: "Seção", h3: "Cláusula", p: "Texto" };

function currentStyle(editor: Editor): BlockStyle {
    for (const level of [1, 2, 3] as const) if (editor.isActive("heading", { level })) return `h${level}`;
    return "p";
}

function ToolButton({ label, active = false, disabled = false, onClick, children }: { label: string; active?: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            type="button" title={label} aria-label={label} aria-pressed={active} disabled={disabled}
            onMouseDown={e => e.preventDefault()} onClick={onClick}
            className={cn("flex h-8 w-8 items-center justify-center rounded-md text-foreground/80 transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-35", active && "bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300")}
        >
            {children}
        </button>
    );
}

const Divider = () => <span className="mx-1 h-6 w-px shrink-0 bg-border" aria-hidden />;

export default function ContractEditor({ content, editable, onUserChange, onReady, fieldCount }: Props) {
    // re-render the toolbar on every selection / transaction so its active states follow the cursor
    const [, refresh] = useReducer((n: number) => n + 1, 0);
    const editor = useEditor({
        extensions: [
            StarterKit.configure({ heading: { levels: [1, 2, 3] }, code: false, codeBlock: false, link: false }),
            TextAlign.configure({ types: ["heading", "paragraph"], alignments: ["left", "center", "right", "justify"] }),
            Highlight,
            FieldMark,
            ParagraphAttrs,
        ],
        content: content as JSONContent,
        editable,
        immediatelyRender: false,
        editorProps: {
            attributes: { class: "contract-paper focus:outline-none", spellcheck: "true", lang: "pt-BR", "aria-label": "Texto do contrato" },
        },
        onUpdate: ({ editor: e, transaction }) => {
            if (!transaction.docChanged || transaction.getMeta("programmatic")) return;
            onUserChange(e.getJSON() as ContractDoc);
        },
        onSelectionUpdate: () => refresh(),
        onTransaction: () => refresh(),
    });

    useEffect(() => {
        onReady(editor);
        return () => onReady(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editor]);

    useEffect(() => {
        // false: switching modes is not an edit (setEditable emits "update" by default)
        if (editor && editor.isEditable !== editable) editor.setEditable(editable, false);
    }, [editor, editable]);

    const setStyle = (style: BlockStyle) => {
        if (!editor) return;
        const chain = editor.chain().focus();
        if (style === "p") chain.setParagraph().run();
        else chain.setHeading({ level: Number(style.slice(1)) as 1 | 2 | 3 }).run();
    };

    const can = !!editor && editable;
    return (
        <div className="flex min-h-0 flex-1 flex-col">
            {editable && (
                <div role="toolbar" aria-label="Formatação" className="sticky top-0 z-20 flex flex-wrap items-center gap-0.5 border-b border-border bg-card/95 px-2 py-1.5 backdrop-blur">
                    <ToolButton label="Desfazer (Ctrl+Z)" disabled={!can || !editor.can().undo()} onClick={() => editor?.chain().focus().undo().run()}><Undo2 className="h-4 w-4" /></ToolButton>
                    <ToolButton label="Refazer (Ctrl+Y)" disabled={!can || !editor.can().redo()} onClick={() => editor?.chain().focus().redo().run()}><Redo2 className="h-4 w-4" /></ToolButton>
                    <Divider />
                    <select
                        aria-label="Estilo do parágrafo" disabled={!can} value={editor ? currentStyle(editor) : "p"}
                        onChange={e => setStyle(e.target.value as BlockStyle)}
                        className="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground"
                    >
                        {(Object.keys(STYLE_LABELS) as BlockStyle[]).map(s => <option key={s} value={s}>{STYLE_LABELS[s]}</option>)}
                    </select>
                    <Divider />
                    <ToolButton label="Negrito (Ctrl+B)" active={editor?.isActive("bold")} disabled={!can} onClick={() => editor?.chain().focus().toggleBold().run()}><Bold className="h-4 w-4" /></ToolButton>
                    <ToolButton label="Itálico (Ctrl+I)" active={editor?.isActive("italic")} disabled={!can} onClick={() => editor?.chain().focus().toggleItalic().run()}><Italic className="h-4 w-4" /></ToolButton>
                    <ToolButton label="Sublinhado (Ctrl+U)" active={editor?.isActive("underline")} disabled={!can} onClick={() => editor?.chain().focus().toggleUnderline().run()}><Underline className="h-4 w-4" /></ToolButton>
                    <ToolButton label="Tachado" active={editor?.isActive("strike")} disabled={!can} onClick={() => editor?.chain().focus().toggleStrike().run()}><Strikethrough className="h-4 w-4" /></ToolButton>
                    <ToolButton label="Marca-texto" active={editor?.isActive("highlight")} disabled={!can} onClick={() => editor?.chain().focus().toggleHighlight().run()}><Highlighter className="h-4 w-4" /></ToolButton>
                    <Divider />
                    <ToolButton label="Alinhar à esquerda" active={editor?.isActive({ textAlign: "left" })} disabled={!can} onClick={() => editor?.chain().focus().setTextAlign("left").run()}><AlignLeft className="h-4 w-4" /></ToolButton>
                    <ToolButton label="Centralizar" active={editor?.isActive({ textAlign: "center" })} disabled={!can} onClick={() => editor?.chain().focus().setTextAlign("center").run()}><AlignCenter className="h-4 w-4" /></ToolButton>
                    <ToolButton label="Alinhar à direita" active={editor?.isActive({ textAlign: "right" })} disabled={!can} onClick={() => editor?.chain().focus().setTextAlign("right").run()}><AlignRight className="h-4 w-4" /></ToolButton>
                    <ToolButton label="Justificar" active={editor?.isActive({ textAlign: "justify" })} disabled={!can} onClick={() => editor?.chain().focus().setTextAlign("justify").run()}><AlignJustify className="h-4 w-4" /></ToolButton>
                    <Divider />
                    <ToolButton label="Lista com marcadores" active={editor?.isActive("bulletList")} disabled={!can} onClick={() => editor?.chain().focus().toggleBulletList().run()}><List className="h-4 w-4" /></ToolButton>
                    <ToolButton label="Lista numerada" active={editor?.isActive("orderedList")} disabled={!can} onClick={() => editor?.chain().focus().toggleOrderedList().run()}><ListOrdered className="h-4 w-4" /></ToolButton>
                    <Divider />
                    <button
                        type="button" disabled={!can || fieldCount === 0} onMouseDown={e => e.preventDefault()} onClick={() => editor && selectNextField(editor)}
                        className="flex h-8 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-amber-800 hover:bg-amber-50 disabled:pointer-events-none disabled:opacity-40 dark:text-amber-300 dark:hover:bg-amber-950/40"
                        title="Ir para o próximo campo em branco"
                    >
                        <TextCursorInput className="h-4 w-4" /> Próximo campo{fieldCount > 0 ? ` (${fieldCount})` : ""}
                    </button>
                </div>
            )}
            <div className="flex-1 overflow-x-auto bg-zinc-200/70 px-2 py-4 dark:bg-zinc-900 sm:px-6 sm:py-8">
                <div className="mx-auto w-full max-w-[816px] rounded-sm bg-white px-5 py-8 shadow-[0_1px_3px_rgba(0,0,0,0.12),0_8px_24px_rgba(0,0,0,0.08)] sm:px-[72px] sm:py-[64px]">
                    {editor ? <EditorContent editor={editor} /> : <div className="h-[60vh] animate-pulse rounded bg-zinc-100" />}
                </div>
            </div>
        </div>
    );
}
