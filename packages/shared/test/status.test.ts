import { describe, it, expect } from "vitest";
import { VOTE_STATUSES, STATUS_LABELS, fileType, memoryLevel } from "../src/index.js";

describe("shared/status", () => {
  it("exposes the four vote statuses in order", () => {
    expect(VOTE_STATUSES).toEqual(["offen", "akzeptiert", "klaerung", "abgelehnt"]);
  });

  it("labels are the German UI strings", () => {
    expect(STATUS_LABELS.akzeptiert).toBe("Akzeptiert");
    expect(STATUS_LABELS.klaerung).toBe("Klärungsbedarf");
    expect(STATUS_LABELS.abgelehnt).toBe("Abgelehnt");
    expect(STATUS_LABELS.offen).toBe("ausstehend");
  });

  it("detects file types by path with defaults", () => {
    expect(fileType("docs/decisions/adr-013.md").label).toBe("Decision");
    expect(fileType("docs/learnings/x.md").label).toBe("Learning");
    expect(fileType("memory-bank/activeContext.md").label).toBe("Kontext");
    expect(fileType(".claude/rules/self-contained.md").label).toBe("Convention");
  });

  it("detects file types on app level (Memory-Bank-Levels)", () => {
    expect(fileType("apps/mira-desktop/docs/decisions/2026-07-23-adr.md").label).toBe("Decision");
    expect(fileType("services/nlp/docs/learnings/x.md").label).toBe("Learning");
    expect(fileType("apps/web/.claude/rules/icons.md").label).toBe("Convention");
  });

  it("tags docs/processes as Process", () => {
    expect(fileType("docs/processes/release-freigabe.md").label).toBe("Process");
    expect(fileType("apps/mira-desktop/docs/processes/x.md").label).toBe("Process");
  });

  it("does not match type paths outside segment boundaries", () => {
    expect(fileType("mydocs/decisions/x.md").label).toBe("Sonstige");
    expect(fileType("docs/decisions-archive/x.md").label).toBe("Sonstige");
  });

  it("honours a custom type map", () => {
    const map = [{ pattern: "^\\.claude/rules/", label: "Konvention" }];
    expect(fileType(".claude/rules/x.md", map).label).toBe("Konvention");
  });
});

describe("shared/memoryLevel", () => {
  it("puts records in the repo root on the root level", () => {
    expect(memoryLevel("docs/decisions/adr-013.md")).toEqual({ id: "", label: "Repo" });
    expect(memoryLevel(".claude/rules/self-contained.md")).toEqual({ id: "", label: "Repo" });
    expect(memoryLevel("memory-bank/activeContext.md")).toEqual({ id: "", label: "Repo" });
  });

  it("names the app or service a record belongs to", () => {
    expect(memoryLevel("apps/mira-desktop/docs/decisions/2026-07-23-adr.md"))
      .toEqual({ id: "apps/mira-desktop", label: "apps/mira-desktop" });
    expect(memoryLevel("services/nlp/docs/learnings/x.md"))
      .toEqual({ id: "services/nlp", label: "services/nlp" });
    expect(memoryLevel("apps/web/.claude/rules/icons.md"))
      .toEqual({ id: "apps/web", label: "apps/web" });
  });

  // Zwei Records desselben Typs auf verschiedenen Ebenen müssen sich trennen
  // lassen — das ist der Zweck der Ebene.
  it("separates the same type on different levels", () => {
    const a = memoryLevel("apps/web/docs/decisions/x.md");
    const b = memoryLevel("services/web/docs/decisions/x.md");
    expect(a.id).not.toBe(b.id);
  });

  it("derives the level from a custom type map as well", () => {
    const map = [{ pattern: "(^|/)entscheidungen/", label: "Entscheidung" }];
    expect(memoryLevel("apps/web/entscheidungen/x.md", map).id).toBe("apps/web");
    expect(memoryLevel("entscheidungen/x.md", map).id).toBe("");
  });

  // Eine Regel ohne Segment-Anker matcht erst hinter dem Trenner — der darf
  // nicht in der Ebene landen.
  it("keeps no trailing separator when the rule has no segment anchor", () => {
    const map = [{ pattern: "docs/decisions/", label: "Decision" }];
    expect(memoryLevel("apps/web/docs/decisions/x.md", map).id).toBe("apps/web");
  });

  it("falls back to the root level for paths outside the memory bank", () => {
    expect(memoryLevel("apps/web/README.md")).toEqual({ id: "", label: "Repo" });
  });
});
