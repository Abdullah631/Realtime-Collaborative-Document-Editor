import type { HocuspocusProvider } from "@hocuspocus/provider";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import { Placeholder } from "@tiptap/extensions";
import StarterKit from "@tiptap/starter-kit";
import type * as Y from "yjs";
import { textFormattingExtensions } from "./textFormatting";

export interface CollabUser {
  name: string;
  email: string;
  color: string;
}

/**
 * Schema-affecting options MUST match server/src/editorSchema.ts, which converts
 * imported files and renders HTML snapshots with the same node/mark set.
 */
export function buildExtensions(ydoc: Y.Doc, provider: HocuspocusProvider, user: CollabUser, placeholder: string) {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      link: false,
      // The auto-appended empty last line made list toggles on a select-all keep growing the list instead of toggling off.
      trailingNode: false,
      undoRedo: false, // Collaboration provides a Yjs-aware undo stack (only undoes your own edits)
    }),
    ...textFormattingExtensions,
    Placeholder.configure({ placeholder }),
    Collaboration.configure({ document: ydoc, field: "default" }),
    CollaborationCaret.configure({ provider, user }),
  ];
}
