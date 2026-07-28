import { describe, it, expect } from "vitest";
import { catchUpChanges } from "../src/renderer/api/catchUp.js";
import type { ChangeWithVotes } from "@guardian/shared";

const NOW = "2026-07-21T12:00:00.000Z";

function ch(id: string, firstSeenAt: string, myStatus: "offen" | "akzeptiert"): ChangeWithVotes {
  return { id, repo: "r", branch: "main", filePath: `memory-bank/${id}.md`, changeKind: "modify",
    commitId: "x", commitShort: "x", authorName: "A", authorEmail: "a@x.de", committedAt: firstSeenAt,
    summary: "s", oldMd: "o", newMd: "n", cycleId: "cy", firstSeenAt,
    votes: [{ changeId: id, guardianId: "me", status: myStatus, comment: null, updatedAt: firstSeenAt }],
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
});
