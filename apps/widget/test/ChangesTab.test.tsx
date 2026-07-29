import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChangesTab } from "../src/renderer/components/tabs/ChangesTab.js";
import type { ChangeWithVotes } from "@guardian/shared";

function change(id: string = "c1", over: Partial<ChangeWithVotes> = {}): ChangeWithVotes {
  return { id, repo: "r", branch: "main", filePath: "memory-bank/a.md", changeKind: "modify",
    commitId: "abc1234", commitShort: "abc1234", authorName: "Anna", authorEmail: "a@x.de", committedAt: "t",
    summary: "s", oldMd: "Node 20", newMd: "Node 22", previousPath: null, cycleId: "cy", firstSeenAt: "t",
    votes: [{ changeId: id, guardianId: "g1", status: "offen", comment: null, updatedAt: "t" }],
    adoLink: "http://x", ...over };
}

// Eine Änderung, die alle Hüter akzeptiert haben: steht in keiner Arbeitsliste
// mehr, wird aber aus dem Verlauf heraus geöffnet.
function abgeschlossen(id = "c9"): ChangeWithVotes {
  return change(id, { filePath: "memory-bank/alt.md",
    votes: [{ changeId: id, guardianId: "g1", status: "akzeptiert", comment: null, updatedAt: "t" }] });
}

describe("ChangesTab empty state", () => {
  it("shows the shield empty state when there are no changes", () => {
    render(<ChangesTab toRate={[]} acceptedByMe={[]} selectedId={null} guardianId="g1" onSelect={vi.fn()} onVote={vi.fn()} />);
    expect(screen.getByText("Keine offenen Änderungen")).toBeTruthy();
    expect(screen.getByText(/erscheinen hier automatisch/)).toBeTruthy();
  });
});

describe("ChangesTab vote flow", () => {
  it("accept votes immediately with no comment", async () => {
    const onVote = vi.fn();
    render(<ChangesTab toRate={[change()]} acceptedByMe={[]} selectedId="c1" guardianId="g1" onSelect={vi.fn()} onVote={onVote} />);
    await userEvent.click(screen.getByRole("button", { name: /Akzeptiert/ }));
    expect(onVote).toHaveBeenCalledWith("c1", "akzeptiert", "");
  });

  it("blocks a rejection until a comment of >=5 chars is entered", async () => {
    const onVote = vi.fn();
    render(<ChangesTab toRate={[change()]} acceptedByMe={[]} selectedId="c1" guardianId="g1" onSelect={vi.fn()} onVote={onVote} />);
    await userEvent.click(screen.getByRole("button", { name: /Abgelehnt/ }));
    const save = screen.getByRole("button", { name: "Bewertung speichern" });
    expect(save).toHaveProperty("disabled", true);
    await userEvent.type(screen.getByRole("textbox"), "nein");        // 4 chars
    expect(save).toHaveProperty("disabled", true);
    await userEvent.type(screen.getByRole("textbox"), "!");           // 5 chars
    expect(save).toHaveProperty("disabled", false);
    await userEvent.click(save);
    expect(onVote).toHaveBeenCalledWith("c1", "abgelehnt", "nein!");
  });

  // Ohne eigene Bewertungszeile war die Fußleiste leer und man konnte nichts
  // anklicken. Keine Zeile bedeutet fachlich "noch nicht bewertet".
  it("still offers the vote buttons when no vote row exists for me", async () => {
    const onVote = vi.fn();
    const ohneMich = { ...change(), votes: [] };
    render(<ChangesTab toRate={[ohneMich]} acceptedByMe={[]} selectedId="c1" guardianId="g1" onSelect={vi.fn()} onVote={onVote} />);
    await userEvent.click(screen.getByRole("button", { name: /Akzeptiert/ }));
    expect(onVote).toHaveBeenCalledWith("c1", "akzeptiert", "");
  });

  it("shows the move badge and the old path in the header", () => {
    const verschoben = { ...change(), changeKind: "rename" as const,
      filePath: "apps/mira-desktop/docs/decisions/adr.md", previousPath: "docs/decisions/adr.md" };
    render(<ChangesTab toRate={[verschoben]} acceptedByMe={[]} selectedId="c1" guardianId="g1" onSelect={vi.fn()} onVote={vi.fn()} />);
    expect(screen.getByText("VERSCHOBEN")).toBeTruthy();
  });

  it("clears draft when selected change changes externally", async () => {
    const c1 = change("c1");
    const c2 = change("c2");
    const { rerender } = render(<ChangesTab toRate={[c1, c2]} acceptedByMe={[]} selectedId="c1" guardianId="g1" onSelect={vi.fn()} onVote={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /Abgelehnt/ }));
    expect(screen.getByRole("textbox")).toBeTruthy();
    rerender(<ChangesTab toRate={[c1, c2]} acceptedByMe={[]} selectedId="c2" guardianId="g1" onSelect={vi.fn()} onVote={vi.fn()} />);
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});

// Der Fehler: der Verlauf öffnete eine abgeschlossene Änderung, angezeigt wurde
// aber die erste offene aus der Liste.
describe("ChangesTab mit einer Änderung aus dem Verlauf", () => {
  it("shows the change from the history, not the first open one", () => {
    render(<ChangesTab toRate={[change("c1")]} acceptedByMe={[]} fromHistory={abgeschlossen()}
      selectedId="c9" guardianId="g1" onSelect={vi.fn()} onVote={vi.fn()} />);
    expect(screen.getByText("memory-bank/alt.md")).toBeTruthy();
    expect(screen.queryByText("memory-bank/a.md")).toBeNull();
  });

  it("names it in the sidebar and marks it as accepted by everyone", () => {
    render(<ChangesTab toRate={[change("c1")]} acceptedByMe={[]} fromHistory={abgeschlossen()}
      selectedId="c9" guardianId="g1" onSelect={vi.fn()} onVote={vi.fn()} />);
    expect(screen.getByText("AUS DEM VERLAUF")).toBeTruthy();
    expect(screen.getByText("VON ALLEN AKZEPTIERT")).toBeTruthy();
  });

  it("shows it even when both lists are empty", () => {
    render(<ChangesTab toRate={[]} acceptedByMe={[]} fromHistory={abgeschlossen()}
      selectedId="c9" guardianId="g1" onSelect={vi.fn()} onVote={vi.fn()} />);
    expect(screen.queryByText("Keine offenen Änderungen")).toBeNull();
    expect(screen.getByText("memory-bank/alt.md")).toBeTruthy();
  });

  // Wieder ins Team holen muss von hier aus möglich bleiben.
  it("offers a re-vote for it", async () => {
    const onVote = vi.fn();
    render(<ChangesTab toRate={[]} acceptedByMe={[]} fromHistory={abgeschlossen()}
      selectedId="c9" guardianId="g1" onSelect={vi.fn()} onVote={onVote} />);
    await userEvent.click(screen.getByRole("button", { name: "Neu bewerten" }));
    expect(onVote).toHaveBeenCalledWith("c9", "offen", "");
  });

  it("keeps the badge off a normal open change", () => {
    render(<ChangesTab toRate={[change("c1")]} acceptedByMe={[]} selectedId="c1"
      guardianId="g1" onSelect={vi.fn()} onVote={vi.fn()} />);
    expect(screen.queryByText("VON ALLEN AKZEPTIERT")).toBeNull();
    expect(screen.queryByText("AUS DEM VERLAUF")).toBeNull();
  });
});
