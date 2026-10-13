"use client";

import { useEditorState, type Editor } from "@tiptap/react";
import {
  Baseline,
  Bold,
  Highlighter,
  Italic,
  List,
  ListOrdered,
  Minus,
  Plus,
  Redo2,
  RemoveFormatting,
  Strikethrough,
  Underline,
  Undo2,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  currentFontSize,
  FONT_FAMILIES,
  MAX_FONT_SIZE,
  MIN_FONT_SIZE,
  sanitizeColor,
  sanitizeFontFamily,
  sanitizeFontSize,
  stepFontSize,
} from "./textFormatting";

type BlockType = "paragraph" | "h1" | "h2" | "h3";

const DEFAULT_FAMILY = "Inter";

const TEXT_COLORS = [
  "#000000", "#434343", "#666666", "#999999", "#b7b7b7", "#ffffff",
  "#dc2626", "#ea580c", "#ca8a04", "#16a34a", "#0891b2", "#2563eb",
  "#7c3aed", "#c026d3", "#991b1b", "#9a3412", "#166534", "#1e3a8a",
];
const HIGHLIGHT_COLORS = [
  "#fef08a", "#fde68a", "#fed7aa", "#fecaca", "#fbcfe8", "#e9d5ff",
  "#c7d2fe", "#bfdbfe", "#a5f3fc", "#bbf7d0", "#d9f99d", "#e5e7eb",
];

export function Toolbar({ editor, disabled }: { editor: Editor; disabled: boolean }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const style = e.getAttributes("textStyle");
      return {
        bold: e.isActive("bold"),
        italic: e.isActive("italic"),
        underline: e.isActive("underline"),
        strike: e.isActive("strike"),
        bullet: e.isActive("bulletList"),
        ordered: e.isActive("orderedList"),
        block: (e.isActive("heading", { level: 1 })
          ? "h1"
          : e.isActive("heading", { level: 2 })
            ? "h2"
            : e.isActive("heading", { level: 3 })
              ? "h3"
              : "paragraph") as BlockType,
        fontSize: currentFontSize(e),
        fontFamily: sanitizeFontFamily(style.fontFamily) ?? DEFAULT_FAMILY,
        color: sanitizeColor(style.color),
        highlight: sanitizeColor(style.backgroundColor),
        canUndo: e.can().undo(),
        canRedo: e.can().redo(),
      };
    },
  });

  const chain = () => editor.chain().focus();
  /** Set (or clear with null) one textStyle attribute, dropping the mark when it becomes empty. */
  const setStyle = (attrs: Record<string, unknown>) => chain().setMark("textStyle", attrs).removeEmptyTextStyle().run();

  /**
   * List toggle that ignores empty lines at the start/end of the selection (unless they're
   * already list items). Otherwise a select-all that includes a blank last line can never
   * toggle the list off: each click would pull the blank line in and grow the list.
   */
  function toggleList(kind: "bulletList" | "orderedList") {
    const { doc, selection } = editor.state;
    let start: number | null = null;
    let end: number | null = null;
    doc.nodesBetween(selection.from, selection.to, (node, pos) => {
      if (!node.isTextblock) return true;
      const inList = doc.resolve(pos).parent.type.name === "listItem";
      if (node.content.size > 0 || inList) {
        start ??= pos + 1;
        end = pos + 1 + node.content.size;
      }
      return false;
    });
    let c = chain();
    if (!selection.empty && start !== null && end !== null) {
      c = c.setTextSelection({ from: Math.max(start, selection.from), to: Math.min(end, selection.to) });
    }
    (kind === "bulletList" ? c.toggleBulletList() : c.toggleOrderedList()).run();
  }

  function setBlock(value: BlockType) {
    if (value === "paragraph") chain().setParagraph().run();
    else chain().setHeading({ level: Number(value[1]) as 1 | 2 | 3 }).run();
  }

  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      className={`flex flex-wrap items-center gap-0.5 rounded-3xl bg-[#edf2fa] px-3 py-1 ${disabled ? "pointer-events-none opacity-50" : ""}`}
      aria-disabled={disabled}
    >
      <Btn label="Undo (Ctrl+Z)" onClick={() => chain().undo().run()} disabled={!s.canUndo}>
        <Undo2 className="size-4" />
      </Btn>
      <Btn label="Redo (Ctrl+Shift+Z)" onClick={() => chain().redo().run()} disabled={!s.canRedo}>
        <Redo2 className="size-4" />
      </Btn>
      <Divider />

      <select
        aria-label="Text style"
        title="Text style"
        value={s.block}
        onChange={(e) => setBlock(e.target.value as BlockType)}
        className="h-8 rounded-md bg-transparent px-1.5 text-sm hover:bg-black/5 focus:outline-none"
      >
        <option value="paragraph">Normal text</option>
        <option value="h1">Heading 1</option>
        <option value="h2">Heading 2</option>
        <option value="h3">Heading 3</option>
      </select>
      <Divider />

      <select
        aria-label="Font"
        title="Font"
        value={s.fontFamily}
        onChange={(e) => setStyle({ fontFamily: e.target.value === DEFAULT_FAMILY ? null : e.target.value })}
        className="h-8 w-32 rounded-md bg-transparent px-1.5 text-sm hover:bg-black/5 focus:outline-none"
      >
        {FONT_FAMILIES.map((f) => (
          <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>
            {f.label}
          </option>
        ))}
      </select>
      <Divider />

      <FontSizeControl size={s.fontSize} onChange={(size) => setStyle({ fontSize: size })} />
      <Divider />

      <Btn label="Bold (Ctrl+B)" active={s.bold} onClick={() => chain().toggleBold().run()}>
        <Bold className="size-4" />
      </Btn>
      <Btn label="Italic (Ctrl+I)" active={s.italic} onClick={() => chain().toggleItalic().run()}>
        <Italic className="size-4" />
      </Btn>
      <Btn label="Underline (Ctrl+U)" active={s.underline} onClick={() => chain().toggleUnderline().run()}>
        <Underline className="size-4" />
      </Btn>
      <Btn label="Strikethrough" active={s.strike} onClick={() => chain().toggleStrike().run()}>
        <Strikethrough className="size-4" />
      </Btn>
      <ColorMenu
        label="Text color"
        icon={<Baseline className="size-4" />}
        value={s.color}
        colors={TEXT_COLORS}
        resetLabel="Default"
        onPick={(color) => setStyle({ color })}
      />
      <ColorMenu
        label="Highlight color"
        icon={<Highlighter className="size-4" />}
        value={s.highlight}
        colors={HIGHLIGHT_COLORS}
        resetLabel="None"
        onPick={(backgroundColor) => setStyle({ backgroundColor })}
      />
      <Divider />

      <Btn label="Bulleted list" active={s.bullet} onClick={() => toggleList("bulletList")}>
        <List className="size-4" />
      </Btn>
      <Btn label="Numbered list" active={s.ordered} onClick={() => toggleList("orderedList")}>
        <ListOrdered className="size-4" />
      </Btn>
      <Divider />
      <Btn label="Clear formatting" onClick={() => chain().unsetAllMarks().run()}>
        <RemoveFormatting className="size-4" />
      </Btn>
    </div>
  );
}

/** Google-Docs-style "−  11  +" control. Typed values are clamped to 6–96. */
function FontSizeControl({ size, onChange }: { size: number; onChange: (size: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const apply = (value: string) => {
    setDraft(null);
    const next = sanitizeFontSize(value);
    if (next !== null && next !== size) onChange(next);
  };

  return (
    <div className="flex items-center" role="group" aria-label="Font size">
      <Btn label="Decrease font size (Ctrl+Shift+<)" onClick={() => onChange(stepFontSize(size, -1))} disabled={size <= MIN_FONT_SIZE}>
        <Minus className="size-3.5" />
      </Btn>
      <input
        aria-label="Font size"
        title="Font size"
        inputMode="decimal"
        value={draft ?? String(size)}
        onFocus={(e) => {
          setDraft(String(size));
          e.currentTarget.select();
        }}
        onChange={(e) => setDraft(e.target.value.replace(/[^\d.]/g, "").slice(0, 4))}
        onBlur={() => draft !== null && apply(draft)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (draft !== null) apply(draft);
          }
          if (e.key === "Escape") setDraft(null);
        }}
        className="h-7 w-10 rounded-md border border-neutral-400/60 bg-white text-center text-sm focus:border-blue-500 focus:outline-none"
      />
      <Btn label="Increase font size (Ctrl+Shift+>)" onClick={() => onChange(stepFontSize(size, 1))} disabled={size >= MAX_FONT_SIZE}>
        <Plus className="size-3.5" />
      </Btn>
    </div>
  );
}

function ColorMenu({
  label,
  icon,
  value,
  colors,
  resetLabel,
  onPick,
}: {
  label: string;
  icon: ReactNode;
  value: string | null;
  colors: string[];
  resetLabel: string;
  onPick: (color: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const pick = (color: string | null) => {
    onPick(color);
    setOpen(false);
  };

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        title={label}
        aria-label={label}
        aria-haspopup="true"
        aria-expanded={open}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((o) => !o)}
        className="flex h-8 w-8 flex-col items-center justify-center rounded-md text-neutral-700 hover:bg-black/5"
      >
        {icon}
        <span className="mt-0.5 h-[3px] w-4 rounded-sm border border-black/10" style={{ background: value ?? "transparent" }} />
      </button>
      {open && (
        <div role="menu" aria-label={label} className="absolute left-0 top-9 z-30 w-[184px] rounded-lg border border-neutral-200 bg-white p-2 shadow-lg">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => pick(null)}
            className="mb-2 w-full rounded-md px-2 py-1 text-left text-sm hover:bg-neutral-100"
          >
            {resetLabel}
          </button>
          <div className="grid grid-cols-6 gap-1.5">
            {colors.map((c) => (
              <button
                key={c}
                type="button"
                role="menuitemradio"
                aria-checked={value === c}
                aria-label={c}
                title={c}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(c)}
                className={`size-6 rounded-full border border-black/15 hover:scale-110 ${value === c ? "ring-2 ring-blue-500 ring-offset-1" : ""}`}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Btn({ label, active, disabled, onClick, children }: { label: string; active?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()} // keep the editor selection
      onClick={onClick}
      className={`flex size-8 items-center justify-center rounded-md text-neutral-700 hover:bg-black/5 disabled:opacity-35 ${active ? "bg-[#d3e3fd] text-[#0b57d0] hover:bg-[#d3e3fd]" : ""}`}
    >
      {children}
    </button>
  );
}

const Divider = () => <span className="mx-1 h-5 w-px bg-neutral-300" aria-hidden />;
