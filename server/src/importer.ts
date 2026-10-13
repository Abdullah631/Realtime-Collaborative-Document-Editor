import path from "node:path";
import mammoth from "mammoth";
import { marked } from "marked";
import { HttpError } from "./errors.js";

export const SUPPORTED_EXTENSIONS = [".txt", ".md", ".markdown", ".docx"] as const;
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]; // .docx files are zip archives

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function decodeUtf8(buffer: Buffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer).replace(/^﻿/, "");
  } catch {
    throw new HttpError(422, "File is not valid UTF-8 text.");
  }
}

export function titleFromFilename(filename: string): string {
  const base = path.basename(filename).replace(/\.[^.]*$/, "").replace(/[_-]+/g, " ").trim();
  return base.slice(0, 200) || "Imported document";
}

/**
 * Converts an uploaded file to HTML. The HTML is NOT trusted: it is parsed
 * against the editor schema afterwards (see editorSchema.htmlToJSON),
 * which drops everything the editor can't represent.
 */
export async function fileToHtml(filename: string, buffer: Buffer): Promise<{ title: string; html: string }> {
  const ext = path.extname(filename).toLowerCase();
  if (!(SUPPORTED_EXTENSIONS as readonly string[]).includes(ext)) {
    throw new HttpError(415, `Unsupported file type. Supported: ${SUPPORTED_EXTENSIONS.join(", ")}`);
  }
  if (buffer.length === 0) throw new HttpError(422, "File is empty.");

  let html: string;
  if (ext === ".docx") {
    if (!ZIP_MAGIC.every((b, i) => buffer[i] === b)) throw new HttpError(422, "File is not a valid .docx document.");
    try {
      const result = await mammoth.convertToHtml({ buffer }, { styleMap: ["u => u"] });
      html = result.value;
    } catch {
      throw new HttpError(422, "Could not read this .docx file.");
    }
  } else if (ext === ".txt") {
    html = decodeUtf8(buffer)
      .split(/\r?\n/)
      .map((line) => `<p>${escapeHtml(line)}</p>`)
      .join("");
  } else {
    html = await marked.parse(decodeUtf8(buffer), { gfm: true });
  }

  return { title: titleFromFilename(filename), html };
}
