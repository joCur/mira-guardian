import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HistoryTab } from "../src/renderer/components/tabs/HistoryTab.js";
import type { HistoryEntry } from "../src/renderer/api/client.js";

function entry(changeId: string, filePath: string, over: Partial<HistoryEntry> = {}): HistoryEntry {
  return { changeId, filePath, status: "akzeptiert", comment: null, updatedAt: "2026-07-30T09:00:00Z",
    commitShort: "abc1234", summary: "Absatz geändert", ...over };
}

const eintraege = [
  entry("c1", "apps/web/docs/decisions/adr.md", { summary: "Icons vereinheitlicht" }),
  entry("c2", "services/nlp/docs/learnings/tokenizer.md", { status: "abgelehnt", comment: "So nicht" }),
  entry("c3", "docs/processes/release.md"),
];

describe("HistoryTab", () => {
  it("shows the empty state without any rating", () => {
    render(<HistoryTab entries={[]} onOpen={vi.fn()} />);
    expect(screen.getByText("Noch nichts bewertet")).toBeTruthy();
    expect(screen.queryByLabelText("Suchen")).toBeNull();
  });

  it("lists the ratings with their count", () => {
    render(<HistoryTab entries={eintraege} onOpen={vi.fn()} />);
    expect(screen.getByText("3 insgesamt")).toBeTruthy();
    expect(screen.getByText("Abgelehnt")).toBeTruthy();
    expect(screen.getByText("„So nicht\"")).toBeTruthy();
  });

  it("opens the change that was clicked", async () => {
    const onOpen = vi.fn();
    render(<HistoryTab entries={eintraege} onOpen={onOpen} />);
    await userEvent.click(screen.getAllByText("Ansehen →")[1]);
    expect(onOpen).toHaveBeenCalledWith("c2");
  });

  it("names the level of every entry", () => {
    render(<HistoryTab entries={eintraege} onOpen={vi.fn()} />);
    expect(screen.getByText("apps/web")).toBeTruthy();
    expect(screen.getByText("services/nlp")).toBeTruthy();
    expect(screen.getByText("Repo")).toBeTruthy();
  });

  it("narrows the list by search text and counts the hits", async () => {
    render(<HistoryTab entries={eintraege} onOpen={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Suchen"), "icons");
    expect(screen.getByText("apps/web/docs/decisions/adr.md")).toBeTruthy();
    expect(screen.queryByText("docs/processes/release.md")).toBeNull();
    expect(screen.getByText("1 von 3")).toBeTruthy();
  });

  it("finds an entry by its own comment", async () => {
    render(<HistoryTab entries={eintraege} onOpen={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Suchen"), "so nicht");
    expect(screen.getByText("services/nlp/docs/learnings/tokenizer.md")).toBeTruthy();
    expect(screen.getByText("1 von 3")).toBeTruthy();
  });

  it("narrows the list by level", async () => {
    render(<HistoryTab entries={eintraege} onOpen={vi.fn()} />);
    await userEvent.selectOptions(screen.getByLabelText("Ebene"), "lvl:");
    expect(screen.getByText("docs/processes/release.md")).toBeTruthy();
    expect(screen.queryByText("apps/web/docs/decisions/adr.md")).toBeNull();
  });

  it("says so when nothing matches and resets", async () => {
    render(<HistoryTab entries={eintraege} onOpen={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Suchen"), "zzz");
    expect(screen.getByText("Keine Bewertung passt zur Suche.")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Zurücksetzen" }));
    expect(screen.getByText("3 insgesamt")).toBeTruthy();
  });
});
