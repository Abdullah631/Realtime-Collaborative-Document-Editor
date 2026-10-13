import { getSchema, type JSONContent } from "@tiptap/core";
import { generateHTML, generateJSON } from "@tiptap/html/server";
import StarterKit from "@tiptap/starter-kit";
import { prosemirrorJSONToYDoc, yDocToProsemirrorJSON } from "@tiptap/y-tiptap";
import * as Y from "yjs";
import { textFormattingExtensions } from "./textFormatting.js";

/**
 * MUST stay in sync with the browser editor (web/src/components/editor/extensions.ts).
 * Only schema-affecting options matter here: which nodes/marks exist.
 */
export const extensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    link: false,
    // The auto-appended empty last line made list toggles on a select-all keep growing the list instead of toggling off.
    trailingNode: false,
    undoRedo: false, // history comes from Yjs on the client
  }),
  ...textFormattingExtensions,
];

export const schema = getSchema(extensions);

/** Name of the Y.XmlFragment the Tiptap Collaboration extension binds to. */
export const YJS_FIELD = "default";

/**
 * Parses HTML against the editor schema. Anything the schema doesn't know
 * (script, style, iframes, event handlers, images...) is dropped, which is
 * what makes imported files safe to render.
 */
export function htmlToJSON(html: string): JSONContent {
  return generateJSON(html, extensions);
}

export function htmlToYState(html: string): Uint8Array {
  const ydoc = prosemirrorJSONToYDoc(schema, htmlToJSON(html), YJS_FIELD);
  return Y.encodeStateAsUpdate(ydoc);
}

export function yDocToHTML(ydoc: Y.Doc): string {
  return generateHTML(yDocToProsemirrorJSON(ydoc, YJS_FIELD) as JSONContent, extensions);
}
