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

// Wird ein Absatz weitgehend umformuliert — etwa übersetzt —, wechselt der
// Wort-Diff zwischen beiden Fassungen hin und her und ist nicht mehr lesbar.
// Dann sind zwei Blöcke klarer: erst der alte Stand, dann der neue.
describe("diffBlocks bei weitgehender Umformulierung", () => {
  const DEUTSCH = "Die Hüter bewerten Änderungen an der Memory Bank. Dazu müssen sie sehen, " +
    "was sich gegenüber dem vorherigen Stand geändert hat.";
  const ENGLISCH = "The guardians review changes to the Memory Bank. To do that they must see " +
    "what changed compared to the previous state.";

  it("trennt einen übersetzten Absatz in vorher und nachher", () => {
    const b = diffBlocks(DEUTSCH, ENGLISCH);
    expect(b).toEqual([
      { kind: "del", md: DEUTSCH },
      { kind: "add", md: ENGLISCH },
    ]);
  });

  it("verschränkt Wörter weiterhin, wenn der Absatz überwiegend gleich bleibt", () => {
    const alt = "Der Server holt zu jeder Änderung den Stand vor dem Commit ab.";
    const neu = "Der Server holt zu jeder Änderung den Stand vor dem Merge ab.";
    const b = diffBlocks(alt, neu);
    expect(b.map(x => x.kind)).toEqual(["changed"]);
    expect(b[0].md).toContain("⟦-Commit");
    expect(b[0].md).toContain("⟦+Merge");
  });

  it("lässt kurze Zeilen verschränkt, dort ist die Gegenüberstellung lesbar", () => {
    const b = diffBlocks("## Kontext", "## Context");
    expect(b.map(x => x.kind)).toEqual(["changed"]);
    expect(b[0].md).toContain("⟦-Kontext⟧");
    expect(b[0].md).toContain("⟦+Context⟧");
  });

  it("trennt auch eine übersetzte Überschrift mit genug Wörtern", () => {
    const alt = "# Vergleichsbasis für Änderungen an der Memory Bank";
    const neu = "# Baseline for Memory Bank changes";
    const b = diffBlocks(alt, neu);
    expect(b).toEqual([{ kind: "del", md: alt }, { kind: "add", md: neu }]);
  });

  it("behält die Reihenfolge alt vor neu bei mehreren getrennten Blöcken", () => {
    const alt = `${DEUTSCH}\n\nZweiter deutscher Absatz mit ausreichend vielen Wörtern darin.`;
    const neu = `${ENGLISCH}\n\nSecond English paragraph containing quite a few words too.`;
    const kinds = diffBlocks(alt, neu).map(x => x.kind);
    expect(kinds).toEqual(["del", "add", "del", "add"]);
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
