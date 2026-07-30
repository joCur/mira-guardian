import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DiffView } from "../src/renderer/components/DiffView.js";
import type { ChangeWithVotes } from "@guardian/shared";

function change(over: Partial<ChangeWithVotes>): ChangeWithVotes {
  return { id: "c", repo: "r", branch: "main", filePath: "memory-bank/a.md", changeKind: "modify",
    commitId: "x", commitShort: "x", authorName: "A", authorEmail: "a@x.de", committedAt: "t",
    summary: "s", oldMd: "Node 20 base", newMd: "Node 22 base", previousPath: null,
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
