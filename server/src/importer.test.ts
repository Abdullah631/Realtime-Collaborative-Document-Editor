import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { htmlToYState, schema, yDocToHTML } from "./editorSchema.js";
import { fileToHtml, titleFromFilename } from "./importer.js";

const roundTrip = (html: string) => {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, htmlToYState(html));
  return yDocToHTML(doc);
};

describe("editor schema", () => {
  it("supports the formatting the assignment requires", () => {
    const nodes = Object.keys(schema.nodes);
    const marks = Object.keys(schema.marks);
    expect(nodes).toEqual(expect.arrayContaining(["heading", "bulletList", "orderedList", "listItem", "paragraph"]));
    expect(marks).toEqual(expect.arrayContaining(["bold", "italic", "underline"]));
  });
});

describe("file import", () => {
  it("converts markdown and preserves structure through the Yjs round trip", async () => {
    const md = "# Title\n\nSome **bold** and *italic* text.\n\n- one\n- two\n\n1. first\n2. second\n";
    const { html, title } = await fileToHtml("Meeting_notes.md", Buffer.from(md));
    const out = roundTrip(html);

    expect(title).toBe("Meeting notes");
    expect(out).toContain("<h1>Title</h1>");
    expect(out).toContain("<strong>bold</strong>");
    expect(out).toContain("<em>italic</em>");
    expect(out).toMatch(/<ul><li><p>one<\/p><\/li><li><p>two<\/p><\/li><\/ul>/);
    expect(out).toContain("<ol");
  });

  it("strips scripts, event handlers and unknown elements", async () => {
    const md = 'Hello <script>alert(1)</script><img src=x onerror="alert(2)"><iframe src="https://evil"></iframe>';
    const { html } = await fileToHtml("x.md", Buffer.from(md));
    const out = roundTrip(html);
    expect(out).toContain("Hello");
    expect(out).not.toMatch(/script|onerror|iframe|<img/i);
  });

  it("escapes plain text instead of interpreting it as HTML", async () => {
    const { html } = await fileToHtml("a.txt", Buffer.from("line 1\n<b>not bold</b>"));
    const out = roundTrip(html);
    expect(out).toContain("<p>line 1</p>");
    expect(out).toContain("&lt;b&gt;not bold&lt;/b&gt;");
  });

  it("rejects unsupported extensions", async () => {
    await expect(fileToHtml("a.pdf", Buffer.from("%PDF"))).rejects.toMatchObject({ status: 415 });
  });

  it("rejects a .docx that is not actually a zip/docx", async () => {
    await expect(fileToHtml("a.docx", Buffer.from("plain text"))).rejects.toMatchObject({ status: 422 });
  });

  it("rejects binary data disguised as text", async () => {
    await expect(fileToHtml("a.txt", Buffer.from([0xff, 0xfe, 0xfd]))).rejects.toMatchObject({ status: 422 });
  });

  it("derives a safe title", () => {
    expect(titleFromFilename("../../etc/passwd.txt")).toBe("passwd");
    expect(titleFromFilename(".md")).toBe("Imported document");
  });
});
