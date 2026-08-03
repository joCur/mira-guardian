import { describe, it, expect } from "vitest";
import { NO_FILTER, isFiltering, matches, applyFilter, filterOptions, fundstelle, type Filterable } from "../src/renderer/filter.js";

const eintrag = (filePath: string, over: Partial<Filterable> = {}): Filterable => ({
  filePath, summary: "Absatz geändert", authorName: "Anna Berg", commitShort: "abc1234", ...over,
});

describe("filter/matches", () => {
  it("lets everything through without a filter", () => {
    expect(matches(eintrag("docs/decisions/x.md"), NO_FILTER)).toBe(true);
    expect(isFiltering(NO_FILTER)).toBe(false);
  });

  it("searches path, summary, author and commit alike", () => {
    const e = eintrag("apps/web/docs/decisions/2026-07-23-adr.md");
    expect(matches(e, { ...NO_FILTER, text: "adr" })).toBe(true);
    expect(matches(e, { ...NO_FILTER, text: "absatz" })).toBe(true);
    expect(matches(e, { ...NO_FILTER, text: "anna" })).toBe(true);
    expect(matches(e, { ...NO_FILTER, text: "abc1234" })).toBe(true);
    expect(matches(e, { ...NO_FILTER, text: "nlp" })).toBe(false);
  });

  it("ignores case and finds the comment too", () => {
    const e = eintrag("docs/learnings/x.md", { comment: "Bitte vorher besprechen" });
    expect(matches(e, { ...NO_FILTER, text: "BESPRECHEN" })).toBe(true);
  });

  // Mehrere Wörter grenzen ein, statt zu veroderten Treffern zu führen.
  it("requires every word to match", () => {
    const e = eintrag("apps/web/docs/decisions/adr.md");
    expect(matches(e, { ...NO_FILTER, text: "adr anna" })).toBe(true);
    expect(matches(e, { ...NO_FILTER, text: "adr bernd" })).toBe(false);
  });

  it("filters by level", () => {
    const web = eintrag("apps/web/docs/decisions/x.md");
    const root = eintrag("docs/decisions/x.md");
    expect(matches(web, { ...NO_FILTER, level: "apps/web" })).toBe(true);
    expect(matches(root, { ...NO_FILTER, level: "apps/web" })).toBe(false);
    // Die Wurzel ist eine echte Auswahl, keine „alles"-Auswahl.
    expect(matches(root, { ...NO_FILTER, level: "" })).toBe(true);
    expect(matches(web, { ...NO_FILTER, level: "" })).toBe(false);
  });

  it("filters by type", () => {
    expect(matches(eintrag("docs/decisions/x.md"), { ...NO_FILTER, type: "Decision" })).toBe(true);
    expect(matches(eintrag("docs/learnings/x.md"), { ...NO_FILTER, type: "Decision" })).toBe(false);
  });

  it("combines level, type and text", () => {
    const e = eintrag("apps/web/docs/decisions/adr.md");
    expect(matches(e, { text: "adr", level: "apps/web", type: "Decision" })).toBe(true);
    expect(matches(e, { text: "adr", level: "apps/web", type: "Learning" })).toBe(false);
  });
});

describe("filter/Volltext im Dokument", () => {
  const doc = eintrag("docs/decisions/x.md", {
    summary: "Schwelle angepasst",
    newMd: "---\ntitel: Tabellen virtualisieren\n---\n\nAb 200 Zeilen virtualisieren wir.",
    oldMd: "---\ntitel: Tabellen virtualisieren\n---\n\nAb 500 Zeilen virtualisieren wir.",
  });

  it("finds a word that only exists in the document", () => {
    expect(matches(doc, { ...NO_FILTER, text: "virtualisieren" })).toBe(true);
    // Der Frontmatter-Titel steht in keiner Zeile der Liste.
    expect(matches(doc, { ...NO_FILTER, text: "tabellen" })).toBe(true);
  });

  it("finds a word that only exists in the previous version", () => {
    expect(matches(doc, { ...NO_FILTER, text: "500" })).toBe(true);
  });

  it("still respects level and type next to the full text", () => {
    expect(matches(doc, { text: "virtualisieren", level: "", type: "Decision" })).toBe(true);
    expect(matches(doc, { text: "virtualisieren", level: "apps/web", type: null })).toBe(false);
  });

  it("does not invent hits", () => {
    expect(matches(doc, { ...NO_FILTER, text: "kubernetes" })).toBe(false);
  });

  // Ohne Dokumentinhalt — so kommen die Verlaufseinträge an.
  it("works unchanged when no content is present", () => {
    const ohne = eintrag("docs/decisions/x.md");
    expect(matches(ohne, { ...NO_FILTER, text: "absatz" })).toBe(true);
    expect(matches(ohne, { ...NO_FILTER, text: "virtualisieren" })).toBe(false);
  });
});

describe("filter/fundstelle", () => {
  const doc = eintrag("docs/decisions/tabellen.md", {
    summary: "Schwelle angepasst", authorName: "Anna Berg",
    newMd: "---\ntitel: Tabellen virtualisieren\n---\n\nAb 200 Zeilen virtualisieren wir. Darunter kostet es mehr als es bringt.",
    oldMd: "Ab 500 Zeilen virtualisieren wir.",
  });

  it("shows the passage for a hit that is only in the document", () => {
    const f = fundstelle(doc, { ...NO_FILTER, text: "darunter" });
    expect(f).not.toBeNull();
    // Hervorgehoben wird, wie es im Dokument steht — nicht, wie es getippt wurde.
    expect(f!.treffer).toBe("Darunter");
    expect(`${f!.vor}${f!.treffer}${f!.nach}`).toContain("kostet es mehr");
    expect(f!.imAltenStand).toBe(false);
  });

  // Steht der Begriff schon in der Zeile, erklärt eine Fundstelle nichts.
  it("stays silent when the hit is visible anyway", () => {
    expect(fundstelle(doc, { ...NO_FILTER, text: "schwelle" })).toBeNull();
    expect(fundstelle(doc, { ...NO_FILTER, text: "anna" })).toBeNull();
    expect(fundstelle(doc, { ...NO_FILTER, text: "tabellen.md" })).toBeNull();
  });

  it("marks a hit that only exists in the previous version", () => {
    const f = fundstelle(doc, { ...NO_FILTER, text: "500" });
    expect(f!.imAltenStand).toBe(true);
  });

  it("collapses line breaks so the passage fits one line", () => {
    const f = fundstelle(doc, { ...NO_FILTER, text: "titel" });
    expect(`${f!.vor}${f!.treffer}${f!.nach}`).not.toContain("\n");
  });

  // Die Zeile ist schmal und schneidet rechts ab — steht zu viel Kontext vor
  // dem Treffer, ist ausgerechnet er nicht mehr zu sehen.
  it("keeps the hit near the start of the passage", () => {
    const f = fundstelle(doc, { ...NO_FILTER, text: "darunter" });
    expect(f!.vor.length).toBeLessThanOrEqual(14);
    expect(f!.nach.length).toBeGreaterThan(f!.vor.length);
  });

  it("has nothing to show without a search or without content", () => {
    expect(fundstelle(doc, NO_FILTER)).toBeNull();
    expect(fundstelle(eintrag("docs/decisions/x.md"), { ...NO_FILTER, text: "zzz" })).toBeNull();
  });
});

describe("filter/applyFilter", () => {
  it("keeps the order of the list", () => {
    const list = [eintrag("docs/decisions/a.md"), eintrag("apps/web/docs/decisions/b.md"), eintrag("docs/decisions/c.md")];
    const r = applyFilter(list, { ...NO_FILTER, level: "" });
    expect(r.map(e => e.filePath)).toEqual(["docs/decisions/a.md", "docs/decisions/c.md"]);
  });
});

describe("filter/filterOptions", () => {
  const list = [
    eintrag("docs/decisions/a.md"),
    eintrag("apps/web/docs/decisions/b.md"),
    eintrag("apps/web/docs/learnings/c.md"),
    eintrag("services/nlp/docs/decisions/d.md"),
  ];

  it("counts the levels and puts the root first", () => {
    const { levels } = filterOptions(list);
    expect(levels.map(l => [l.value, l.count])).toEqual([["", 1], ["apps/web", 2], ["services/nlp", 1]]);
    expect(levels[0].label).toBe("Repo");
  });

  it("counts the types alphabetically", () => {
    const { types } = filterOptions(list);
    expect(types.map(t => [t.value, t.count])).toEqual([["Decision", 3], ["Learning", 1]]);
  });

  it("offers only what is actually in the list", () => {
    const { levels, types } = filterOptions([eintrag("docs/decisions/a.md")]);
    expect(levels).toHaveLength(1);
    expect(types).toHaveLength(1);
  });

  // Die Zahl neben einer Ebene muss beantworten „wie viele bleiben, wenn ich
  // das hier wähle" — sonst steht dort die Gesamtzahl, während die Liste
  // längst kürzer ist.
  it("counts what the current search leaves over", () => {
    const { levels, types } = filterOptions(list, { ...NO_FILTER, text: "b.md" });
    expect(levels.map(l => [l.value, l.count])).toEqual([["", 0], ["apps/web", 1], ["services/nlp", 0]]);
    expect(types.map(t => [t.value, t.count])).toEqual([["Decision", 1], ["Learning", 0]]);
  });

  // Sonst könnte man von einer gewählten Ebene nicht mehr auf eine andere
  // wechseln, weil daneben überall 0 stünde.
  it("ignores its own dimension when counting", () => {
    const { levels } = filterOptions(list, { ...NO_FILTER, level: "apps/web" });
    expect(levels.map(l => [l.value, l.count])).toEqual([["", 1], ["apps/web", 2], ["services/nlp", 1]]);
  });

  it("lets the other dimension narrow the counts", () => {
    const { types } = filterOptions(list, { ...NO_FILTER, level: "apps/web" });
    expect(types.map(t => [t.value, t.count])).toEqual([["Decision", 1], ["Learning", 1]]);
  });

  // Beim Tippen darf die Auswahl nicht schrumpfen — sonst springt das Feld.
  it("keeps every option even at zero", () => {
    const { levels, types } = filterOptions(list, { ...NO_FILTER, text: "kubernetes" });
    expect(levels).toHaveLength(3);
    expect(types).toHaveLength(2);
    expect(levels.every(l => l.count === 0)).toBe(true);
  });
});
