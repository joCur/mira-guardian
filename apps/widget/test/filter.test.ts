import { describe, it, expect } from "vitest";
import { NO_FILTER, isFiltering, matches, applyFilter, filterOptions, type Filterable } from "../src/renderer/filter.js";

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
});
