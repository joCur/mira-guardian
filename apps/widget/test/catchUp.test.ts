import { describe, it, expect } from "vitest";
import { catchUpChanges, TOAST_DECKEL } from "../src/renderer/api/catchUp.js";
import type { ChangeWithVotes } from "@guardian/shared";

const NOW = "2026-07-21T12:00:00.000Z";

function ch(id: string, firstSeenAt: string, myStatus: "offen" | "akzeptiert"): ChangeWithVotes {
  return { id, repo: "r", branch: "main", filePath: `memory-bank/${id}.md`, changeKind: "modify",
    commitId: "x", commitShort: "x", authorName: "A", authorEmail: "a@x.de", committedAt: firstSeenAt,
    summary: "s", oldMd: "o", newMd: "n", previousPath: null, baselineCommitId: null, cycleId: "cy", firstSeenAt,
    votes: [{ changeId: id, guardianId: "me", status: myStatus, comment: null, updatedAt: firstSeenAt, seenAt: null }],
    adoLink: "http://x" };
}

describe("catchUpChanges", () => {
  it("first run of a device: no retro toasts, watermark set to newest", () => {
    const all = [ch("c1", "2026-07-20T10:00:00Z", "offen")];
    const r = catchUpChanges(all, "me", null, NOW);
    expect(r.toToast).toHaveLength(0);
    expect(r.watermark).toBe("2026-07-20T10:00:00Z");
  });

  it("first run with empty server: watermark falls back to now", () => {
    const r = catchUpChanges([], "me", null, NOW);
    expect(r.toToast).toHaveLength(0);
    expect(r.watermark).toBe(NOW);
  });

  it("toasts only unvoted changes behind the watermark, oldest first", () => {
    const all = [
      ch("new2", "2026-07-21T09:00:00Z", "offen"),
      ch("new1", "2026-07-21T08:00:00Z", "offen"),
      ch("voted", "2026-07-21T10:00:00Z", "akzeptiert"),
      ch("old", "2026-07-19T10:00:00Z", "offen"),
    ];
    const r = catchUpChanges(all, "me", "2026-07-20T00:00:00Z", NOW);
    expect(r.toToast.map(c => c.id)).toEqual(["new1", "new2"]);
    expect(r.watermark).toBe("2026-07-21T10:00:00Z");
  });

  it("watermark never moves backwards", () => {
    const all = [ch("c1", "2026-07-10T10:00:00Z", "offen")];
    const r = catchUpChanges(all, "me", "2026-07-20T00:00:00Z", NOW);
    expect(r.toToast).toHaveLength(0);
    expect(r.watermark).toBe("2026-07-20T00:00:00Z");
  });

  // Nach einem Urlaub wären es dutzende Meldungen, von denen der Stapel ohnehin
  // nur die letzten fünf zeigt.
  it("deckelt auf die neuesten fünf und nennt den Rest", () => {
    const all = Array.from({ length: 8 }, (_, i) =>
      ch(`c${i}`, `2026-07-2${i + 1}T10:00:00Z`, "offen"));
    const r = catchUpChanges(all, "me", "2026-07-20T00:00:00Z", NOW);
    expect(r.toToast).toHaveLength(TOAST_DECKEL);
    expect(r.toToast.map(c => c.id)).toEqual(["c3", "c4", "c5", "c6", "c7"]);
    expect(r.weitere).toBe(3);
  });

  it("unter dem Deckel bleibt nichts übrig", () => {
    const all = [ch("c1", "2026-07-21T10:00:00Z", "offen")];
    const r = catchUpChanges(all, "me", "2026-07-20T00:00:00Z", NOW);
    expect(r.toToast).toHaveLength(1);
    expect(r.weitere).toBe(0);
  });
});
