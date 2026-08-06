import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChangesTab } from "../src/renderer/components/tabs/ChangesTab.js";
import type { ChangeWithVotes } from "@guardian/shared";

function change(id: string = "c1", over: Partial<ChangeWithVotes> = {}): ChangeWithVotes {
  return { id, repo: "r", branch: "main", filePath: "memory-bank/a.md", changeKind: "modify",
    commitId: "abc1234", commitShort: "abc1234", authorName: "Anna", authorEmail: "a@x.de", committedAt: "t",
    summary: "s", oldMd: "Node 20", newMd: "Node 22", previousPath: null, baselineCommitId: null, cycleId: "cy", firstSeenAt: "t",
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
    render(<ChangesTab toRate={[]} ratedByMe={[]} selectedId={null} guardianId="g1" onSelect={vi.fn()} onVote={vi.fn()} />);
    expect(screen.getByText("Keine offenen Änderungen")).toBeTruthy();
    expect(screen.getByText(/erscheinen hier automatisch/)).toBeTruthy();
  });
});

describe("ChangesTab vote flow", () => {
  it("accept votes immediately with no comment", async () => {
    const onVote = vi.fn();
    render(<ChangesTab toRate={[change()]} ratedByMe={[]} selectedId="c1" guardianId="g1" onSelect={vi.fn()} onVote={onVote} />);
    await userEvent.click(screen.getByRole("button", { name: /Akzeptiert/ }));
    expect(onVote).toHaveBeenCalledWith("c1", "akzeptiert", "");
  });

  it("blocks a rejection until a comment of >=5 chars is entered", async () => {
    const onVote = vi.fn();
    render(<ChangesTab toRate={[change()]} ratedByMe={[]} selectedId="c1" guardianId="g1" onSelect={vi.fn()} onVote={onVote} />);
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

  // Wer eine Begründung verlangt bekommt, soll ohne zweiten Klick lostippen können.
  it("focuses the comment field as soon as it opens", async () => {
    render(<ChangesTab toRate={[change()]} acceptedByMe={[]} selectedId="c1" guardianId="g1" onSelect={vi.fn()} onVote={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /Klärungsbedarf/ }));
    expect(document.activeElement).toBe(screen.getByRole("textbox"));
    await userEvent.keyboard("bitte klären");
    expect(screen.getByRole("textbox")).toHaveProperty("value", "bitte klären");
    // Auch beim zweiten Anlauf, nicht nur beim allerersten Öffnen.
    await userEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    await userEvent.click(screen.getByRole("button", { name: /Abgelehnt/ }));
    expect(document.activeElement).toBe(screen.getByRole("textbox"));
  });

  // Ohne eigene Bewertungszeile war die Fußleiste leer und man konnte nichts
  // anklicken. Keine Zeile bedeutet fachlich "noch nicht bewertet".
  it("still offers the vote buttons when no vote row exists for me", async () => {
    const onVote = vi.fn();
    const ohneMich = { ...change(), votes: [] };
    render(<ChangesTab toRate={[ohneMich]} ratedByMe={[]} selectedId="c1" guardianId="g1" onSelect={vi.fn()} onVote={onVote} />);
    await userEvent.click(screen.getByRole("button", { name: /Akzeptiert/ }));
    expect(onVote).toHaveBeenCalledWith("c1", "akzeptiert", "");
  });

  it("shows the move badge and the old path in the header", () => {
    const verschoben = { ...change(), changeKind: "rename" as const,
      filePath: "apps/mira-desktop/docs/decisions/adr.md", previousPath: "docs/decisions/adr.md" };
    render(<ChangesTab toRate={[verschoben]} ratedByMe={[]} selectedId="c1" guardianId="g1" onSelect={vi.fn()} onVote={vi.fn()} />);
    expect(screen.getByText("VERSCHOBEN")).toBeTruthy();
  });

  // Neben dem Commit-Kürzel, weil der Knopf genau dorthin führt.
  it("führt aus der Überschrift zum Commit in ADO", async () => {
    const open = vi.fn();
    (window as any).guardian = { openExternal: open };
    const c = change("c1", { adoLink: "https://ado.x/MI/P/_git/R/commit/abc1234" });
    render(<ChangesTab toRate={[c]} ratedByMe={[]} selectedId="c1" guardianId="g1" onSelect={vi.fn()} onVote={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /In ADO ansehen/ }));
    expect(open).toHaveBeenCalledWith("https://ado.x/MI/P/_git/R/commit/abc1234");
  });

  it("clears draft when selected change changes externally", async () => {
    const c1 = change("c1");
    const c2 = change("c2");
    const { rerender } = render(<ChangesTab toRate={[c1, c2]} ratedByMe={[]} selectedId="c1" guardianId="g1" onSelect={vi.fn()} onVote={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /Abgelehnt/ }));
    expect(screen.getByRole("textbox")).toBeTruthy();
    rerender(<ChangesTab toRate={[c1, c2]} ratedByMe={[]} selectedId="c2" guardianId="g1" onSelect={vi.fn()} onVote={vi.fn()} />);
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});

// Bewertet ist bewertet: der Eintrag steht nicht mehr unter "zu bewerten",
// bleibt aber sichtbar — mit dem Zeichen, das sagt, was ich gesagt habe.
describe("ChangesTab mit von mir bewerteten Änderungen", () => {
  const bewertet = (id: string, status: "akzeptiert" | "klaerung" | "abgelehnt", filePath: string) =>
    change(id, { filePath, votes: [{ changeId: id, guardianId: "g1", status, comment: "weil", updatedAt: "t" }] });

  it("lists them under their own heading, not under ZU BEWERTEN", () => {
    render(<ChangesTab toRate={[]} ratedByMe={[bewertet("c2", "klaerung", "memory-bank/streit.md")]}
      selectedId="c2" guardianId="g1" onSelect={vi.fn()} onVote={vi.fn()} />);
    expect(screen.getByText("VON MIR BEWERTET")).toBeTruthy();
    expect(screen.queryByText("ZU BEWERTEN")).toBeNull();
  });

  it("marks each entry with my own verdict", () => {
    render(<ChangesTab toRate={[]} guardianId="g1" onSelect={vi.fn()} onVote={vi.fn()} selectedId="c2"
      ratedByMe={[bewertet("c2", "abgelehnt", "memory-bank/nein.md"), bewertet("c3", "akzeptiert", "memory-bank/ja.md")]} />);
    expect(screen.getByTitle("Abgelehnt").textContent).toBe("✕");
    expect(screen.getByTitle("Akzeptiert").textContent).toBe("✓");
  });

  // Ohne offene Änderung darf nicht der "alles erledigt"-Zustand erscheinen —
  // die Einwände warten ja noch aufs Meeting.
  it("does not fall back to the empty state", () => {
    render(<ChangesTab toRate={[]} ratedByMe={[bewertet("c2", "klaerung", "memory-bank/streit.md")]}
      selectedId="c2" guardianId="g1" onSelect={vi.fn()} onVote={vi.fn()} />);
    expect(screen.queryByText("Keine offenen Änderungen")).toBeNull();
    expect(screen.getByText("memory-bank/streit.md")).toBeTruthy();
  });
});

// Der Fehler: der Verlauf öffnete eine abgeschlossene Änderung, angezeigt wurde
// aber die erste offene aus der Liste.
describe("ChangesTab mit einer Änderung aus dem Verlauf", () => {
  it("shows the change from the history, not the first open one", () => {
    render(<ChangesTab toRate={[change("c1")]} ratedByMe={[]} fromHistory={abgeschlossen()}
      selectedId="c9" guardianId="g1" onSelect={vi.fn()} onVote={vi.fn()} />);
    expect(screen.getByText("memory-bank/alt.md")).toBeTruthy();
    expect(screen.queryByText("memory-bank/a.md")).toBeNull();
  });

  it("names it in the sidebar and marks it as accepted by everyone", () => {
    render(<ChangesTab toRate={[change("c1")]} ratedByMe={[]} fromHistory={abgeschlossen()}
      selectedId="c9" guardianId="g1" onSelect={vi.fn()} onVote={vi.fn()} />);
    expect(screen.getByText("AUS DEM VERLAUF")).toBeTruthy();
    expect(screen.getByText("VON ALLEN AKZEPTIERT")).toBeTruthy();
  });

  it("shows it even when both lists are empty", () => {
    render(<ChangesTab toRate={[]} ratedByMe={[]} fromHistory={abgeschlossen()}
      selectedId="c9" guardianId="g1" onSelect={vi.fn()} onVote={vi.fn()} />);
    expect(screen.queryByText("Keine offenen Änderungen")).toBeNull();
    expect(screen.getByText("memory-bank/alt.md")).toBeTruthy();
  });

  // Wieder ins Team holen muss von hier aus möglich bleiben.
  it("offers a re-vote for it", async () => {
    const onVote = vi.fn();
    render(<ChangesTab toRate={[]} ratedByMe={[]} fromHistory={abgeschlossen()}
      selectedId="c9" guardianId="g1" onSelect={vi.fn()} onVote={onVote} />);
    await userEvent.click(screen.getByRole("button", { name: "Neu bewerten" }));
    expect(onVote).toHaveBeenCalledWith("c9", "offen", "");
  });

  it("keeps the badge off a normal open change", () => {
    render(<ChangesTab toRate={[change("c1")]} ratedByMe={[]} selectedId="c1"
      guardianId="g1" onSelect={vi.fn()} onVote={vi.fn()} />);
    expect(screen.queryByText("VON ALLEN AKZEPTIERT")).toBeNull();
    expect(screen.queryByText("AUS DEM VERLAUF")).toBeNull();
  });
});

// Records desselben Typs liegen auf verschiedenen Ebenen — in der Liste steht
// nur der Dateiname, die Ebene muss also dazu.
describe("ChangesTab mit Ebenen, Suche und Filter", () => {
  const web = change("c1", { filePath: "apps/web/docs/decisions/adr.md", summary: "Icons vereinheitlicht" });
  const nlp = change("c2", { filePath: "services/nlp/docs/learnings/tokenizer.md", summary: "Tokenizer-Falle", authorName: "Bernd" });
  const root = change("c3", { filePath: "docs/processes/release.md", summary: "Freigabe angepasst" });
  const drei = (selectedId: string | null = "c1") =>
    render(<ChangesTab toRate={[web, nlp, root]} ratedByMe={[]} selectedId={selectedId}
      guardianId="g1" onSelect={vi.fn()} onVote={vi.fn()} />);

  it("names the level of every record", () => {
    drei();
    expect(screen.getAllByText("apps/web").length).toBeGreaterThan(0);
    expect(screen.getAllByText("services/nlp").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Repo").length).toBeGreaterThan(0);
  });

  it("narrows the list by search text", async () => {
    drei();
    await userEvent.type(screen.getByLabelText("Suchen"), "tokenizer");
    expect(screen.getByText("tokenizer.md")).toBeTruthy();
    expect(screen.queryByText("adr.md")).toBeNull();
    expect(screen.queryByText("release.md")).toBeNull();
  });

  it("searches the author as well", async () => {
    drei();
    await userEvent.type(screen.getByLabelText("Suchen"), "bernd");
    expect(screen.getByText("tokenizer.md")).toBeTruthy();
    expect(screen.queryByText("adr.md")).toBeNull();
  });

  it("narrows the list by level", async () => {
    drei();
    await userEvent.selectOptions(screen.getByLabelText("Ebene"), "lvl:services/nlp");
    expect(screen.getByText("tokenizer.md")).toBeTruthy();
    expect(screen.queryByText("adr.md")).toBeNull();
  });

  it("narrows the list by type", async () => {
    drei();
    await userEvent.selectOptions(screen.getByLabelText("Typ"), "typ:Process");
    expect(screen.getByText("release.md")).toBeTruthy();
    expect(screen.queryByText("adr.md")).toBeNull();
  });

  // Die Repo-Wurzel hat die leere Ebenen-Id — sie darf nicht mit „alle
  // Ebenen" zusammenfallen, in keiner Richtung.
  it("tells the repo root apart from all levels", async () => {
    drei();
    const ebene = screen.getByLabelText("Ebene");
    await userEvent.selectOptions(ebene, "lvl:");
    expect(screen.getByText("release.md")).toBeTruthy();
    expect(screen.queryByText("adr.md")).toBeNull();
    await userEvent.selectOptions(ebene, "alle");
    expect(screen.getByText("release.md")).toBeTruthy();
    expect(screen.getByText("adr.md")).toBeTruthy();
    expect(screen.getByText("tokenizer.md")).toBeTruthy();
  });

  // Der Filter räumt die Liste auf, nicht die Anzeige — sonst verschwindet die
  // Änderung, an der man gerade arbeitet.
  it("keeps the open change visible even when it does not match", async () => {
    drei("c1");
    await userEvent.type(screen.getByLabelText("Suchen"), "tokenizer");
    expect(screen.getByText("apps/web/docs/decisions/adr.md")).toBeTruthy();
  });

  it("stays operable when nothing matches", async () => {
    drei(null);
    await userEvent.type(screen.getByLabelText("Suchen"), "zzz");
    expect(screen.getAllByText("Keine Änderung passt zur Suche.").length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole("button", { name: "Filter zurücksetzen" }));
    expect(screen.getByText("adr.md")).toBeTruthy();
    expect(screen.queryByText("Keine Änderung passt zur Suche.")).toBeNull();
  });

  // Die Zahl neben einer Ebene zeigte die Gesamtmenge weiter an, obwohl die
  // Suche die Liste längst eingegrenzt hatte.
  it("counts the dropdown entries under the running search", async () => {
    drei();
    const ebene = screen.getByLabelText("Ebene") as HTMLSelectElement;
    expect([...ebene.options].map(o => o.textContent?.trim()))
      .toEqual(["Alle Ebenen", "Repo (1)", "apps/web (1)", "services/nlp (1)"]);
    await userEvent.type(screen.getByLabelText("Suchen"), "tokenizer");
    expect([...ebene.options].map(o => o.textContent?.trim()))
      .toEqual(["Alle Ebenen", "Repo (0)", "apps/web (0)", "services/nlp (1)"]);
  });

  it("keeps an empty level selectable only where it is the current choice", async () => {
    drei();
    const ebene = screen.getByLabelText("Ebene") as HTMLSelectElement;
    await userEvent.type(screen.getByLabelText("Suchen"), "tokenizer");
    const leer = [...ebene.options].find(o => o.textContent?.includes("Repo"))!;
    expect(leer.disabled).toBe(true);
    expect([...ebene.options].find(o => o.textContent?.includes("services/nlp"))!.disabled).toBe(false);
  });

  it("hides a dropdown that has only one choice", () => {
    render(<ChangesTab toRate={[root]} ratedByMe={[]} selectedId="c3"
      guardianId="g1" onSelect={vi.fn()} onVote={vi.fn()} />);
    expect(screen.queryByLabelText("Ebene")).toBeNull();
    expect(screen.queryByLabelText("Typ")).toBeNull();
    expect(screen.getByLabelText("Suchen")).toBeTruthy();
  });

  // Sie wurde gezielt geöffnet — ein Filter darf sie nicht verschlucken.
  it("never filters away the change opened from the history", async () => {
    render(<ChangesTab toRate={[web]} ratedByMe={[]} fromHistory={abgeschlossen()}
      selectedId="c9" guardianId="g1" onSelect={vi.fn()} onVote={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Suchen"), "zzz");
    expect(screen.getByText("AUS DEM VERLAUF")).toBeTruthy();
    expect(screen.getByText("alt.md")).toBeTruthy();
  });

  // Die Suche reicht bis in das Dokument — dann muss die Zeile auch zeigen,
  // warum der Eintrag stehen blieb.
  it("finds a word that only exists in the document and shows the passage", async () => {
    const doc = change("c1", { filePath: "docs/decisions/tabellen.md", summary: "Schwelle angepasst",
      oldMd: "Ab 500 Zeilen virtualisieren wir.",
      newMd: "Ab 200 Zeilen virtualisieren wir. Darunter kostet es mehr als es bringt." });
    render(<ChangesTab toRate={[doc, nlp]} ratedByMe={[]} selectedId="c1"
      guardianId="g1" onSelect={vi.fn()} onVote={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Suchen"), "darunter");
    expect(screen.getByText("tabellen.md")).toBeTruthy();
    expect(screen.queryByText("tokenizer.md")).toBeNull();
    expect(screen.getByText("TEXT")).toBeTruthy();
    // Hervorgehoben in der Schreibweise des Dokuments.
    expect(screen.getByText("Darunter")).toBeTruthy();
  });

  it("marks a passage that only exists in the previous version", async () => {
    const doc = change("c1", { filePath: "docs/decisions/tabellen.md", summary: "Schwelle angepasst",
      oldMd: "Ab 500 Zeilen virtualisieren wir.", newMd: "Ab 200 Zeilen virtualisieren wir." });
    render(<ChangesTab toRate={[doc]} ratedByMe={[]} selectedId="c1"
      guardianId="g1" onSelect={vi.fn()} onVote={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Suchen"), "500");
    expect(screen.getByText("ALT")).toBeTruthy();
  });

  it("shows no passage when the hit is visible in the row anyway", async () => {
    const doc = change("c1", { filePath: "docs/decisions/tabellen.md", summary: "Schwelle angepasst",
      newMd: "Ab 200 Zeilen virtualisieren wir." });
    render(<ChangesTab toRate={[doc]} ratedByMe={[]} selectedId="c1"
      guardianId="g1" onSelect={vi.fn()} onVote={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Suchen"), "schwelle");
    expect(screen.getByText("tabellen.md")).toBeTruthy();
    expect(screen.queryByText("TEXT")).toBeNull();
  });

  it("shows the empty state, not the filter, when there is nothing at all", () => {
    render(<ChangesTab toRate={[]} ratedByMe={[]} selectedId={null} guardianId="g1" onSelect={vi.fn()} onVote={vi.fn()} />);
    expect(screen.getByText("Keine offenen Änderungen")).toBeTruthy();
    expect(screen.queryByLabelText("Suchen")).toBeNull();
  });
});
