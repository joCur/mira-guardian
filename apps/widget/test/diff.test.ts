import { describe, it, expect } from "vitest";
import { diffBlocks, tokenizeInline } from "../src/renderer/diff/diff.js";

describe("diffBlocks fence handling", () => {
  it("keeps fenced code with blank lines in one block", () => {
    const md = "# T\n\n```ts\nconst a = 1;\n\nconst b = 2;\n```\n\nEnde";
    const blocks = diffBlocks(md, md);
    expect(blocks.every(b => b.kind === "same")).toBe(true);
    const fence = blocks.find(b => b.md.includes("```"));
    expect(fence?.md).toContain("const a = 1;");
    expect(fence?.md).toContain("const b = 2;");
  });
});

describe("diffBlocks", () => {
  it("marks an added paragraph", () => {
    const b = diffBlocks("# Titel", "# Titel\n\nNeuer Absatz.");
    expect(b).toContainEqual({ kind: "add", md: "Neuer Absatz." });
    expect(b[0]).toEqual({ kind: "same", md: "# Titel" });
  });
  it("marks a deleted paragraph", () => {
    const b = diffBlocks("# Titel\n\nAlt.", "# Titel");
    expect(b).toContainEqual({ kind: "del", md: "Alt." });
  });
  it("produces inline word markers for a changed paragraph", () => {
    const b = diffBlocks("Node 20 base", "Node 22 base");
    const changed = b.find(x => x.kind === "changed")!;
    expect(changed.md).toContain("⟦-20⟧");
    expect(changed.md).toContain("⟦+22⟧");
  });
});

describe("tokenizeInline", () => {
  it("splits ins/del/code/strong from text", () => {
    const t = tokenizeInline("Node ⟦-20⟧ ⟦+22⟧ via `docker` and **bold**");
    expect(t).toContainEqual({ kind: "del", value: "20" });
    expect(t).toContainEqual({ kind: "ins", value: "22" });
    expect(t).toContainEqual({ kind: "code", value: "docker" });
    expect(t).toContainEqual({ kind: "strong", value: "bold" });
  });
});
