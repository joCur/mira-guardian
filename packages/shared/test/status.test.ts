import { describe, it, expect } from "vitest";
import { VOTE_STATUSES, STATUS_LABELS, fileType } from "../src/index.js";

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
