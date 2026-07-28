import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChangesTab } from "../src/renderer/components/tabs/ChangesTab.js";
import type { ChangeWithVotes } from "@guardian/shared";

function change(id: string = "c1"): ChangeWithVotes {
  return { id, repo: "r", branch: "main", filePath: "memory-bank/a.md", changeKind: "modify",
    commitId: "abc1234", commitShort: "abc1234", authorName: "Anna", authorEmail: "a@x.de", committedAt: "t",
    summary: "s", oldMd: "Node 20", newMd: "Node 22", cycleId: "cy", firstSeenAt: "t",
    votes: [{ changeId: id, guardianId: "g1", status: "offen", comment: null, updatedAt: "t" }],
    adoLink: "http://x" };
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
