import { describe, it, expect } from "vitest";
import { splitFrontmatter, parseFm, diffFmFields } from "../src/renderer/diff/frontmatter.js";

const FM = "---\nstatus: Active\ndate: 2026-07-23\npaths:\n  - \"apps/**\"\n---\n\n# Titel\nText";

describe("splitFrontmatter", () => {
  it("splits fence and body", () => {
    const s = splitFrontmatter(FM);
    expect(s.fm).toContain("status: Active");
    expect(s.body.trim().startsWith("# Titel")).toBe(true);
  });
  it("returns null fm when there is no fence", () => {
    expect(splitFrontmatter("# Nur Inhalt").fm).toBeNull();
  });
  it("returns null fm when the fence is unclosed", () => {
    expect(splitFrontmatter("---\nstatus: Active\n# kein Ende").fm).toBeNull();
  });
});

describe("parseFm", () => {
  it("parses yaml mapping", () => {
    expect(parseFm("status: Active")).toEqual({ status: "Active" });
  });
  it("returns null for broken yaml", () => {
    expect(parseFm("status: [unclosed")).toBeNull();
  });
  it("returns null for non-object yaml", () => {
    expect(parseFm("nur ein string")).toBeNull();
  });
});

describe("diffFmFields", () => {
  it("marks changed values with old and new", () => {
    const f = diffFmFields({ status: "Active" }, { status: "Superseded" });
    expect(f).toEqual([{ key: "status", oldValues: ["Active"], newValues: ["Superseded"], changed: true }]);
  });
  it("keeps arrays element-wise and flattens nested keys", () => {
    const f = diffFmFields(null, { paths: ["a/**", "b/**"], metadata: { type: "rule" } });
    expect(f).toEqual([
      { key: "paths", oldValues: null, newValues: ["a/**", "b/**"], changed: false },
      { key: "metadata.type", oldValues: null, newValues: ["rule"], changed: false },
    ]);
  });
  it("serializes empty yaml values as empty strings, not 'null'", () => {
    const f = diffFmFields(null, { deciders: null });
    expect(f).toEqual([{ key: "deciders", oldValues: null, newValues: [""], changed: false }]);
  });

  it("reports removed keys", () => {
    const f = diffFmFields({ deciders: "Jonas" }, { status: "Active" });
    expect(f).toEqual([
      { key: "status", oldValues: null, newValues: ["Active"], changed: true },
      { key: "deciders", oldValues: ["Jonas"], newValues: null, changed: true },
    ]);
  });
});
