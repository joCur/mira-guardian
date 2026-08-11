import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DiffView } from "../src/renderer/components/DiffView.js";
import type { ChangeWithVotes } from "@guardian/shared";

function change(over: Partial<ChangeWithVotes>): ChangeWithVotes {
  return { id: "c", repo: "r", branch: "main", filePath: "memory-bank/a.md", changeKind: "modify",
    commitId: "x", commitShort: "x", authorName: "A", authorEmail: "a@x.de", committedAt: "t",
    summary: "s", oldMd: "Node 20 base", newMd: "Node 22 base", previousPath: null, baselineCommitId: null, previousNewMd: null, commitCount: 1,
    cycleId: "cy", firstSeenAt: "t", votes: [], adoLink: "http://x", ...over };
}

const NEW_MD = "---\nstatus: Active\ncategory: Review\n---\n\n# Titel\n\nInhalt der neuen Datei";

describe("DiffView", () => {
  // Eine geänderte Datei ohne Vergleichsstand sah bisher aus wie ein frisch
  // angelegtes Dokument — der Hüter hätte den Unterschied nie bemerkt.
  it("weist darauf hin, wenn zu einer Änderung der Vergleichsstand fehlt", () => {
    render(<DiffView change={change({ oldMd: null, newMd: NEW_MD, changeKind: "modify" })} />);
    expect(screen.getByText(/Vergleichsstand fehlt/)).toBeTruthy();
  });

  // Der Hinweis allein rettet eine kleine Änderung nicht: ohne den Unterschied
  // bleibt offen, was geändert wurde. Der Weg dahin steht deshalb daneben.
  it("bietet beim fehlenden Vergleichsstand den Unterschied in ADO an", () => {
    render(<DiffView change={change({ oldMd: null, newMd: NEW_MD, changeKind: "modify",
      adoLink: "https://ado.x/MI/P/_git/R/commit/abc123" })} />);
    expect(screen.getByRole("button", { name: /Unterschied in ADO ansehen/ })).toBeTruthy();
  });

  it("zeigt den Hinweis nicht bei einem neu angelegten Dokument", () => {
    render(<DiffView change={change({ oldMd: null, newMd: NEW_MD, changeKind: "add" })} />);
    expect(screen.queryByText(/Vergleichsstand fehlt/)).toBeNull();
  });

  it("zeigt den Hinweis nicht, wenn ein Vergleichsstand vorliegt", () => {
    render(<DiffView change={change({})} />);
    expect(screen.queryByText(/Vergleichsstand fehlt/)).toBeNull();
  });

  it("zeigt den Hinweis nicht beim reinen Verschieben", () => {
    render(<DiffView change={change({ oldMd: null, newMd: NEW_MD, changeKind: "rename",
      previousPath: "memory-bank/alt.md" })} />);
    expect(screen.queryByText(/Vergleichsstand fehlt/)).toBeNull();
  });

  it("renders new files as a normal document without the green box", () => {
    const { container } = render(<DiffView change={change({ oldMd: null, newMd: NEW_MD, changeKind: "add" })} />);
    expect(screen.queryByText(/gesamter Inhalt ist neu/)).toBeNull();
    expect(container.querySelector(".bg-ctp-green\\/10")).toBeNull();
    expect(container.querySelector("h1")?.textContent).toBe("Titel");
  });
  it("shows the frontmatter card instead of raw frontmatter", () => {
    render(<DiffView change={change({ oldMd: null, newMd: NEW_MD, changeKind: "add" })} />);
    expect(screen.getByText("Active")).toBeTruthy();
    expect(screen.queryByText(/status:/)).toBeNull();
  });
  it("renders inserted and deleted words for modified files", () => {
    const { container } = render(<DiffView change={change({})} />);
    expect(container.querySelector("ins")).toBeTruthy();
    expect(container.querySelector("del")).toBeTruthy();
  });
  it("shows changed frontmatter fields as old/new in the card", () => {
    const { container } = render(<DiffView change={change({
      oldMd: "---\nstatus: Active\n---\n\nText", newMd: "---\nstatus: Deprecated\n---\n\nText" })} />);
    expect(container.querySelector("del")?.textContent).toBe("Active");
    expect(container.querySelector("ins")?.textContent).toBe("Deprecated");
  });
  it("falls back to a code block for broken frontmatter", () => {
    const { container } = render(<DiffView change={change({ oldMd: null, newMd: "---\nstatus: [kaputt\n---\n\nText" })} />);
    expect(container.querySelector("pre code")?.textContent).toContain("status: [kaputt");
  });
  it("keeps fenced code with blank lines intact in new files", () => {
    const md = "---\nstatus: Active\n---\n\n# T\n\n```ts\nconst a = 1;\n\nconst b = 2;\n```";
    const { container } = render(<DiffView change={change({ oldMd: null, newMd: md, changeKind: "add" })} />);
    const pres = container.querySelectorAll("pre");
    expect(pres.length).toBe(1);
    expect(pres[0].textContent).toContain("const a = 1;");
    expect(pres[0].textContent).toContain("const b = 2;");
  });
  it("suppresses the card when the new frontmatter is broken on a modified file", () => {
    const { container } = render(<DiffView change={change({
      oldMd: "---\nstatus: Active\n---\n\nText", newMd: "---\nstatus: [kaputt\n---\n\nText" })} />);
    expect(container.textContent).not.toContain("entfernt");
    expect(container.querySelector("pre code")?.textContent).toContain("status: [kaputt");
  });
});

// Ohne inhaltliche Änderung gab es nichts zu sehen — der Hüter konnte nicht
// erkennen, was passiert ist, und die Verschiebung nicht guten Gewissens
// akzeptieren oder hinterfragen.
describe("DiffView bei Umbenennung und Verschiebung", () => {
  it("nennt alten und neuen Pfad und dass der Inhalt gleich blieb", () => {
    const { container } = render(<DiffView change={change({
      changeKind: "rename", filePath: "apps/mira-desktop/docs/decisions/2026-06-15-adr.md",
      previousPath: "docs/decisions/0001-adr.md", oldMd: null, newMd: NEW_MD })} />);
    expect(container.textContent).toContain("docs/decisions/0001-adr.md");
    expect(container.textContent).toContain("apps/mira-desktop/docs/decisions/2026-06-15-adr.md");
    expect(container.textContent).toMatch(/Inhalt unverändert/);
    // Kein Inhaltsdiff behaupten, wo keiner ist.
    expect(container.querySelector("ins")).toBeNull();
    expect(container.querySelector("del")).toBeNull();
    // Der Inhalt bleibt lesbar, damit man weiß, worum es geht.
    expect(container.querySelector("h1")?.textContent).toBe("Titel");
  });

  it("unterscheidet Umbenennen im selben Ordner von Verschieben", () => {
    const umbenannt = render(<DiffView change={change({
      changeKind: "rename", filePath: "docs/decisions/2026-06-15-adr.md",
      previousPath: "docs/decisions/0001-adr.md", oldMd: null, newMd: "# T" })} />);
    expect(umbenannt.container.textContent).toMatch(/Umbenannt/);

    const verschoben = render(<DiffView change={change({
      changeKind: "rename", filePath: "apps/x/docs/decisions/adr.md",
      previousPath: "docs/decisions/adr.md", oldMd: null, newMd: "# T" })} />);
    expect(verschoben.container.textContent).toMatch(/Verschoben/);
  });

  it("zeigt Hinweis und Diff, wenn zusätzlich der Inhalt geändert wurde", () => {
    const { container } = render(<DiffView change={change({
      changeKind: "modify", filePath: "docs/decisions/neu.md", previousPath: "docs/decisions/alt.md",
      oldMd: "Node 20 base", newMd: "Node 22 base" })} />);
    expect(container.textContent).toContain("docs/decisions/alt.md");
    expect(container.textContent).toMatch(/Inhalt (wurde )?(ebenfalls|zusätzlich) geändert/);
    expect(container.querySelector("ins")).toBeTruthy();
    expect(container.querySelector("del")).toBeTruthy();
  });

  it("hält sich raus, wenn nichts verschoben wurde", () => {
    const { container } = render(<DiffView change={change({})} />);
    expect(container.textContent).not.toMatch(/Verschoben|Umbenannt/);
  });
});

// Sammelt ein Eintrag mehrere Commits, wächst der Diff mit jeder Runde. Ohne
// Umschalter müsste ein Hüter, der die vorigen Runden längst gelesen hat, sie
// erneut durchgehen, um das Neue zu finden.
describe("DiffView bei mehreren Commits", () => {
  // Runde 1 übersetzte den Absatz, Runde 2 hängte einen Nachtrag an. Geprüft
  // wird auf einzelne Wörter: der Zeilenvergleich mischt Alt und Neu ineinander,
  // ganze Sätze stehen danach nicht mehr am Stück da.
  const gestaffelt = (over: Partial<ChangeWithVotes> = {}) => change({
    oldMd: "Deutscher Absatz", previousNewMd: "English paragraph",
    newMd: "English paragraph mit Nachtrag", commitCount: 2, ...over });

  it("bietet den Umschalter erst ab dem zweiten Commit an", () => {
    const einer = render(<DiffView change={change({})} />);
    expect(einer.queryByRole("group", { name: /Umfang/ })).toBeNull();
    einer.unmount();
    render(<DiffView change={gestaffelt()} />);
    expect(screen.getByRole("group", { name: /Umfang/ })).toBeTruthy();
    expect(screen.getByText(/Fasst 2 Commits zusammen/)).toBeTruthy();
  });

  // Bestandsdaten: Der Zähler steht schon auf zwei, der Stand davor fehlt aber.
  // Dann gibt es nichts umzuschalten — ein Schalter ins Leere wäre schlimmer
  // als keiner.
  it("hält sich raus, wenn der Stand vor dem letzten Commit fehlt", () => {
    render(<DiffView change={gestaffelt({ previousNewMd: null })} />);
    expect(screen.queryByRole("group", { name: /Umfang/ })).toBeNull();
  });

  it("zeigt standardmäßig alles seit der Basis", () => {
    const { container } = render(<DiffView change={gestaffelt()} />);
    expect(container.textContent).toContain("Deutscher");
  });

  it("zeigt auf Wunsch nur den jüngsten Commit — und wieder zurück", () => {
    const { container } = render(<DiffView change={gestaffelt()} />);
    fireEvent.click(screen.getByRole("button", { name: /Nur letzter Commit/ }));
    // Der Stand vor dem jüngsten Commit ist jetzt die Vergleichsseite; die
    // Übersetzung aus der Runde davor steht nicht mehr im Weg.
    expect(container.textContent).not.toContain("Deutscher");
    expect(container.textContent).toContain("Nachtrag");

    fireEvent.click(screen.getByRole("button", { name: /Alles seit Basis/ }));
    expect(container.textContent).toContain("Deutscher");
  });

  // Die gemeinsame Grundlage ist der ganze Diff — sonst reden im Meeting zwei
  // Hüter über verschiedene Stände.
  it("sagt dazu, dass die Bewertung der ganzen Änderung gilt", () => {
    render(<DiffView change={gestaffelt()} />);
    fireEvent.click(screen.getByRole("button", { name: /Nur letzter Commit/ }));
    expect(screen.getByText(/bewertet wird die Änderung als Ganzes/)).toBeTruthy();
  });

  // Ohne Vergleichsbasis fehlt sie nur im Gesamtdiff. Im Ausschnitt wird gar
  // nicht gegen sie verglichen, da wäre der Hinweis schlicht falsch.
  it("verschweigt die fehlende Basis im Ausschnitt", () => {
    render(<DiffView change={gestaffelt({ oldMd: null })} />);
    expect(screen.getByText(/Vergleichsstand fehlt/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Nur letzter Commit/ }));
    expect(screen.queryByText(/Vergleichsstand fehlt/)).toBeNull();
  });
});
