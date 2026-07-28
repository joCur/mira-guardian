import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DiffView } from "../src/renderer/components/DiffView.js";
import type { ChangeWithVotes } from "@guardian/shared";

function change(over: Partial<ChangeWithVotes>): ChangeWithVotes {
  return { id: "c", repo: "r", branch: "main", filePath: "memory-bank/a.md", changeKind: "modify",
    commitId: "x", commitShort: "x", authorName: "A", authorEmail: "a@x.de", committedAt: "t",
    summary: "s", oldMd: "Node 20 base", newMd: "Node 22 base", cycleId: "cy", firstSeenAt: "t",
    votes: [], adoLink: "http://x", ...over };
}

const NEW_MD = "---\nstatus: Active\ncategory: Review\n---\n\n# Titel\n\nInhalt der neuen Datei";

describe("DiffView", () => {
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
