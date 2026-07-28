import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MeetingTab } from "../src/renderer/components/tabs/MeetingTab.js";
import type { ChangeWithVotes } from "@guardian/shared";

function ch(id: string, status: "klaerung" | "abgelehnt", comment: string): ChangeWithVotes {
  return { id, repo: "r", branch: "main", filePath: `memory-bank/${id}.md`, changeKind: "modify",
    commitId: "x", commitShort: "x", authorName: "A", authorEmail: "a@x.de", committedAt: "t",
    summary: "s", oldMd: "o", newMd: "n", cycleId: "cy", firstSeenAt: "t",
    votes: [{ changeId: id, guardianId: "g1", status, comment, updatedAt: "t" }], adoLink: "http://x" };
}

describe("MeetingTab", () => {
  it("shows the empty state when no cycle is open", () => {
    const meeting = { cycle: null, rejected: [], klaerung: [], accepted: [], outstanding: 0 };
    render(<MeetingTab meeting={meeting as any} onOpen={vi.fn()} />);
    expect(screen.getByText("Kein aktiver Wochen-Zyklus")).toBeTruthy();
  });

  it("shows the nothing-to-discuss banner when no rejections or klaerung exist", () => {
    const meeting = {
      cycle: { id: "cy", isoWeek: "2026-W30", startsAt: "t", endsAt: null, closedAt: null, note: null },
      rejected: [], klaerung: [], accepted: [], outstanding: 0,
    };
    render(<MeetingTab meeting={meeting as any} onOpen={vi.fn()} />);
    expect(screen.getByText("Nichts zu besprechen")).toBeTruthy();
  });

  it("shows rejected and klaerung sections with comments", () => {
    const meeting = {
      cycle: { id: "cy", isoWeek: "2026-W30", startsAt: "t", endsAt: null, closedAt: null, note: null },
      rejected: [ch("c1", "abgelehnt", "Specs hängen daran")],
      klaerung: [ch("c2", "klaerung", "Widerspricht ADR-009?")],
      accepted: [], outstanding: 1,
    };
    render(<MeetingTab meeting={meeting as any} onOpen={vi.fn()} />);
    expect(screen.getByText("ABGELEHNT")).toBeTruthy();
    expect(screen.getByText("KLÄRUNGSBEDARF")).toBeTruthy();
    expect(screen.getByText(/Specs hängen daran/)).toBeTruthy();
    expect(screen.getByText(/1 Bestätigung/)).toBeTruthy();
  });

  it("clicking Meeting abgeschlossen calls onClose with the entered note", async () => {
    const user = userEvent.setup();
    const meeting = {
      cycle: { id: "cy", isoWeek: "2026-W30", startsAt: "t", endsAt: null, closedAt: null, note: null },
      rejected: [], klaerung: [], accepted: [], outstanding: 0,
    };
    const onClose = vi.fn();
    render(<MeetingTab meeting={meeting as any} onOpen={vi.fn()} onClose={onClose} />);
    await user.type(screen.getByPlaceholderText("Notiz (optional)"), "Alles besprochen");
    await user.click(screen.getByText("Meeting abgeschlossen"));
    expect(onClose).toHaveBeenCalledWith("Alles besprochen");
  });
});
