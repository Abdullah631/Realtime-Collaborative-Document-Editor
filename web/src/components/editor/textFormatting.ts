/**
 * Font family, font size, text color and highlight as attributes on the `textStyle` mark.
 *
 * Every value is sanitized on parse AND on render: style attributes arrive from
 * other clients over Yjs, so a tampered client could otherwise inject arbitrary
 * CSS (e.g. `red; background-image:url(https://tracker)`) into everyone's editor.
 *
 * KEEP IDENTICAL: server/src/textFormatting.ts and web/src/components/editor/textFormatting.ts
 * (a server test fails if they drift).
 */
import { Extension, type Editor } from "@tiptap/core";
import { TextStyle } from "@tiptap/extension-text-style";

export const FONT_FAMILIES = [
  { label: "Inter", value: "Inter" },
  { label: "Arial", value: "Arial" },
  { label: "Georgia", value: "Georgia" },
  { label: "Times New Roman", value: "Times New Roman" },
  { label: "Courier New", value: "Courier New" },
  { label: "Verdana", value: "Verdana" },
] as const;

const FAMILY_CSS: Record<string, string> = {
  Inter: "var(--font-inter), Inter, sans-serif",
  Arial: "Arial, Helvetica, sans-serif",
  Georgia: "Georgia, serif",
  "Times New Roman": '"Times New Roman", Times, serif',
  "Courier New": '"Courier New", Courier, monospace',
  Verdana: "Verdana, Geneva, sans-serif",
};

/** Google-Docs-like steps used by the − / + buttons. */
export const FONT_SIZE_STEPS = [6, 7, 8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 30, 36, 48, 60, 72, 96];
export const MIN_FONT_SIZE = 6;
export const MAX_FONT_SIZE = 96;
/** Rendered size of unstyled text, in pt (must match the editor CSS). */
export const BASE_FONT_SIZE = 11;
export const HEADING_FONT_SIZES: Record<number, number> = { 1: 20, 2: 16, 3: 14 };

/** Accepts "12", "12pt" or "16px"; returns a clamped point size, or null. */
export function sanitizeFontSize(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const m = /^\s*(\d+(?:\.\d+)?)\s*(pt|px)?\s*$/i.exec(String(value));
  if (!m) return null;
  let pt = parseFloat(m[1]);
  if (m[2]?.toLowerCase() === "px") pt *= 0.75;
  if (!Number.isFinite(pt) || pt <= 0) return null;
  return Math.round(Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, pt)) * 2) / 2;
}

/** Only #hex and rgb()/rgba() with plain numbers survive. */
export function sanitizeColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (/^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v)) return v.toLowerCase();
  if (/^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(?:,\s*(?:0|1|0?\.\d+)\s*)?\)$/i.test(v)) return v;
  return null;
}

/** Maps a CSS font-family list to one of our allowlisted families. */
export function sanitizeFontFamily(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const first = value.split(",")[0]?.trim().replace(/^["']|["']$/g, "").toLowerCase();
  return FONT_FAMILIES.find((f) => f.value.toLowerCase() === first)?.value ?? null;
}

/** Effective size at the cursor: explicit size if set, otherwise the block's default. */
export function currentFontSize(editor: Editor): number {
  const explicit = sanitizeFontSize(editor.getAttributes("textStyle").fontSize);
  if (explicit !== null) return explicit;
  if (!editor.isActive("heading")) return BASE_FONT_SIZE;
  return HEADING_FONT_SIZES[editor.getAttributes("heading").level as number] ?? BASE_FONT_SIZE;
}

/** Next size up (+1) or down (-1) on the step scale. */
export function stepFontSize(current: number, direction: 1 | -1): number {
  if (direction === 1) return FONT_SIZE_STEPS.find((s) => s > current) ?? MAX_FONT_SIZE;
  return [...FONT_SIZE_STEPS].reverse().find((s) => s < current) ?? MIN_FONT_SIZE;
}

const styleAttr = <T>(
  css: string,
  sanitize: (v: unknown) => T | null,
  format: (v: T) => string,
  read: (el: HTMLElement) => string,
) => ({
  default: null,
  parseHTML: (el: HTMLElement) => sanitize(read(el)),
  renderHTML: (attrs: Record<string, unknown>) => {
    const v = sanitize(attrs[css]);
    return v === null ? {} : { style: `${cssName[css]}: ${format(v)}` };
  },
});

const cssName: Record<string, string> = {
  fontSize: "font-size",
  fontFamily: "font-family",
  color: "color",
  backgroundColor: "background-color",
};

export const TextFormatting = Extension.create({
  name: "textFormatting",
  addGlobalAttributes() {
    return [
      {
        types: ["textStyle"],
        attributes: {
          fontSize: styleAttr("fontSize", sanitizeFontSize, (pt) => `${pt}pt`, (el) => el.style.fontSize),
          fontFamily: styleAttr("fontFamily", sanitizeFontFamily, (f) => FAMILY_CSS[f], (el) => el.style.fontFamily),
          color: styleAttr("color", sanitizeColor, (c) => c, (el) => el.style.color),
          backgroundColor: styleAttr("backgroundColor", sanitizeColor, (c) => c, (el) => el.style.backgroundColor),
        },
      },
    ];
  },
  addKeyboardShortcuts() {
    const step = (direction: 1 | -1) => () =>
      this.editor
        .chain()
        .setMark("textStyle", { fontSize: stepFontSize(currentFontSize(this.editor), direction) })
        .run();
    // Google Docs: Ctrl/Cmd + Shift + > and <
    return { "Mod->": step(1), "Mod-Shift-.": step(1), "Mod-<": step(-1), "Mod-Shift-,": step(-1) };
  },
});

/** Extensions to add next to StarterKit (both server and client). */
export const textFormattingExtensions = [TextStyle, TextFormatting];
