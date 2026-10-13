import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { htmlToYState, yDocToHTML } from "./editorSchema.js";
import { sanitizeColor, sanitizeFontFamily, sanitizeFontSize, stepFontSize } from "./textFormatting.js";

const roundTrip = (html: string) => {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, htmlToYState(html));
  return yDocToHTML(doc);
};

describe("text formatting sanitizers", () => {
  it("font size: accepts pt/px/number, clamps, rejects junk", () => {
    expect(sanitizeFontSize("12pt")).toBe(12);
    expect(sanitizeFontSize("16px")).toBe(12);
    expect(sanitizeFontSize(14)).toBe(14);
    expect(sanitizeFontSize("2")).toBe(6);
    expect(sanitizeFontSize("500pt")).toBe(96);
    expect(sanitizeFontSize("12pt; background:url(x)")).toBeNull();
    expect(sanitizeFontSize("calc(1px)")).toBeNull();
  });

  it("color: only hex and rgb()", () => {
    expect(sanitizeColor("#FF0000")).toBe("#ff0000");
    expect(sanitizeColor("rgb(1, 2, 3)")).toBe("rgb(1, 2, 3)");
    expect(sanitizeColor("red; background-image:url(https://evil)")).toBeNull();
    expect(sanitizeColor("url(https://evil)")).toBeNull();
    expect(sanitizeColor("expression(alert(1))")).toBeNull();
  });

  it("font family: allowlist only", () => {
    expect(sanitizeFontFamily('"Times New Roman", serif')).toBe("Times New Roman");
    expect(sanitizeFontFamily("georgia")).toBe("Georgia");
    expect(sanitizeFontFamily("Comic Sans MS")).toBeNull();
    expect(sanitizeFontFamily("x; background:url(y)")).toBeNull();
  });
});

describe("text formatting in documents", () => {
  it("preserves size, family, color and highlight through the Yjs round trip", () => {
    const out = roundTrip(
      '<p><span style="font-size: 18pt; font-family: Georgia; color: #ff0000; background-color: #ffff00">styled</span></p>',
    );
    expect(out).toContain("font-size: 18pt");
    expect(out).toContain("font-family: Georgia, serif");
    expect(out).toContain("color: #ff0000");
    expect(out).toContain("background-color: #ffff00");
  });

  it("drops tampered values instead of rendering them", () => {
    const doc = new Y.Doc();
    Y.applyUpdate(doc, htmlToYState("<p>x</p>"));
    // Simulate a malicious client writing a raw attribute straight into the Yjs doc.
    const text = (doc.getXmlFragment("default").get(0) as Y.XmlElement).get(0) as Y.XmlText;
    text.format(0, 1, { textStyle: { color: "red;background-image:url(https://evil)", fontSize: "9999px;x:y" } });
    const out = yDocToHTML(doc);
    expect(out).not.toContain("evil");
    expect(out).not.toContain("x:y");
  });
});

describe("client/server schema sync", () => {
  it("web and server textFormatting.ts are identical", () => {
    const server = fileURLToPath(new URL("./textFormatting.ts", import.meta.url));
    const web = fileURLToPath(new URL("../../web/src/components/editor/textFormatting.ts", import.meta.url));
    if (!existsSync(web)) return; // server deployed alone
    expect(readFileSync(web, "utf8")).toBe(readFileSync(server, "utf8"));
  });
});

describe("font size steps", () => {
  it("moves along the Google-Docs-like scale and clamps at the ends", () => {
    expect(stepFontSize(11, 1)).toBe(12);
    expect(stepFontSize(11, -1)).toBe(10);
    expect(stepFontSize(13, 1)).toBe(14); // typed custom size snaps to next step
    expect(stepFontSize(13, -1)).toBe(12);
    expect(stepFontSize(96, 1)).toBe(96);
    expect(stepFontSize(6, -1)).toBe(6);
  });
});
