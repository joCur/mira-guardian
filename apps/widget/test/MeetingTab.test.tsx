import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MeetingTab } from "../src/renderer/components/tabs/MeetingTab.js";
import type { ChangeWithVotes, VoteStatus } from "@guardian/shared";
import type { MeetingResponse } from "../src/renderer/api/client.js";

function ch(id: string, votes: Array<[string, VoteStatus, string | null]>): ChangeWithVotes {
  return { id, repo: "r", branch: "main", filePath: `memory-bank/${id}.md`, changeKind: "modify",
    commitId: "x", commitShort: "x", authorName: "A", authorEmail: "a@x.de", committedAt: "t",
    summary: "s", oldMd: "o", newMd: "n", previousPath: null, baselineCommitId: null, cycleId: "cy", firstSeenAt: "t",
    votes: votes.map(([g, status, comment]) => ({ changeId: id, guardianId: g, status, comment, updatedAt: "t", seenAt: null })),
    adoLink: "http://x" };
}

const guardians = [
  { id: "g1", name: "Anna Beispiel", email: "a@x.de", initials: "AB", avatarColor: "#fff", createdAt: "t", isFounder: true, absentFrom: null, absentUntil: null },
  { id: "g2", name: "Bert Beispiel", email: "b@x.de", initials: "BB", avatarColor: "#fff", createdAt: "t", isFounder: false, absentFrom: null, absentUntil: null },
];

const meeting = (changes: ChangeWithVotes[], counts: Partial<MeetingResponse["counts"]> = {}): MeetingResponse => ({
  changes,
  counts: { abgelehnt: 0, klaerung: 0, offen: 0, gesamt: changes.length, ...counts },
});

describe("MeetingTab", () => {
  it("shows the empty state when there is nothing to discuss", () => {
    render(<MeetingTab meeting={meeting([])} onOpen={vi.fn()} />);
    expect(screen.getByText("Nichts zu besprechen")).toBeTruthy();
  });

  it("reports pending confirmations as a hint, not as list entries", () => {
    // 102 ausstehende Bewertungen dürfen die Liste nicht überschwemmen.
    const m = meeting([], { offen: 102, gesamt: 102 });
    render(<MeetingTab meeting={m} guardians={guardians} onOpen={vi.fn()} />);
    expect(screen.getByText(/102 Änderungen warten noch auf Bestätigungen/)).toBeTruthy();
    expect(screen.getByText("Nichts zu besprechen")).toBeTruthy();
  });

  it("shows the pending hint alongside real discussion items", () => {
    const m = meeting([ch("c1", [["g1", "abgelehnt", "nein"]])], { abgelehnt: 1, offen: 5, gesamt: 6 });
    render(<MeetingTab meeting={m} guardians={guardians} onOpen={vi.fn()} />);
    expect(screen.getByText("memory-bank/c1.md")).toBeTruthy();
    expect(screen.getByText(/5 Änderungen warten noch auf Bestätigungen/)).toBeTruthy();
    expect(screen.getByText(/1 abgelehnt/)).toBeTruthy();
  });

  it("shows each guardian's state so the team sees who is missing", () => {
    const m = meeting([ch("c1", [["g1", "akzeptiert", null], ["g2", "klaerung", "warum?"]])], { klaerung: 1 });
    render(<MeetingTab meeting={m} guardians={guardians} onOpen={vi.fn()} />);
    expect(screen.getByText("Anna")).toBeTruthy();
    expect(screen.getByText("Bert")).toBeTruthy();
    expect(screen.getByText("Akzeptiert")).toBeTruthy();
    expect(screen.getByText("Klärungsbedarf")).toBeTruthy();
  });

  it("shows comments of rejections and klaerung", () => {
    const m = meeting([
      ch("c1", [["g1", "abgelehnt", "Specs hängen daran"]]),
      ch("c2", [["g1", "klaerung", "Widerspricht ADR-009?"]]),
    ], { abgelehnt: 1, klaerung: 1 });
    render(<MeetingTab meeting={m} guardians={guardians} onOpen={vi.fn()} />);
    expect(screen.getByText(/Specs hängen daran/)).toBeTruthy();
    expect(screen.getByText(/Widerspricht ADR-009/)).toBeTruthy();
    expect(screen.getByText(/1 abgelehnt · 1 mit Klärungsbedarf/)).toBeTruthy();
  });

  it("has no cycle-close action any more", () => {
    render(<MeetingTab meeting={meeting([ch("c1", [["g1", "offen", null]])])} onOpen={vi.fn()} />);
    expect(screen.queryByText("Meeting abgeschlossen")).toBeNull();
    expect(screen.queryByPlaceholderText("Notiz (optional)")).toBeNull();
  });
});
