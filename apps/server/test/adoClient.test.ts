import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { AdoClient } from "../src/ado/adoClient.js";
import { loadConfig } from "../src/config.js";

const dir = dirname(fileURLToPath(import.meta.url));
const fx = (n: string) => JSON.parse(readFileSync(join(dir, "fixtures", n), "utf8"));

const cfg = loadConfig({
  ADO_BASE_URL: "https://ado.example.com", ADO_COLLECTION: "DefaultCollection",
  ADO_PROJECT: "mira", ADO_REPO: "mira", ADO_PAT: "secret",
} as any);

function fakeFetch(routes: Record<string, unknown>): typeof fetch {
  return (async (url: string) => {
    for (const key of Object.keys(routes)) {
      if (url.includes(key)) return { ok: true, status: 200, json: async () => routes[key] } as Response;
    }
    return { ok: false, status: 404, json: async () => ({}) } as Response;
  }) as unknown as typeof fetch;
}

describe("AdoClient", () => {
  it("lists commits newest first", async () => {
    const c = new AdoClient(cfg, fakeFetch({ "/commits": fx("ado-commits.json") }));
    const commits = await c.listCommits("main");
    expect(commits[0].commitId).toBe("def456");
    expect(commits[0].author.name).toBe("Anna Roth");
  });

  it("lists commit file changes with normalized paths", async () => {
    const c = new AdoClient(cfg, fakeFetch({ "/changes": fx("ado-changes.json") }));
    const changes = await c.listCommitChanges("def456");
    expect(changes).toContainEqual({ path: "docs/decisions/adr-013.md", changeType: "add" });
  });

  // ADO liefert changeType als Flag-Kombination ("edit, rename",
  // "delete, sourceRename"). Wer nur auf die drei Basiswerte prüft, hält die
  // Quellseite einer Umbenennung für eine normale Änderung und liest zu einem
  // Pfad ein, den es im Commit nicht mehr gibt.
  it("parses composite changeType flags from a rename commit", async () => {
    const c = new AdoClient(cfg, fakeFetch({ "/changes": fx("ado-changes-rename.json") }));
    const changes = await c.listCommitChanges("def456");

    // Reine Umbenennung: gleicher Blob vor und nach dem Commit.
    expect(changes).toContainEqual({
      path: "docs/decisions/2026-06-15-electron-react-stack.md", changeType: "edit",
      previousPath: "docs/decisions/0001-electron-react-stack.md", contentUnchanged: true,
    });
    // Umbenennung mit Inhaltsänderung: Blob-Id wechselt.
    expect(changes).toContainEqual({
      path: "docs/decisions/2026-06-15-build-tooling.md", changeType: "edit",
      previousPath: "docs/decisions/0002-build-tooling.md", contentUnchanged: false,
    });
    // Quellseiten sind als solche erkennbar und kein echtes Löschen.
    expect(changes.filter(c => c.renameSource).map(c => c.path)).toEqual([
      "docs/decisions/0001-electron-react-stack.md",
      "docs/decisions/0002-build-tooling.md",
    ]);
    // Ein echtes Löschen bleibt ein Löschen.
    expect(changes).toContainEqual({ path: "docs/decisions/0099-aufgeloest.md", changeType: "delete" });
  });

  it("skips tree entries even when isFolder is absent", async () => {
    const c = new AdoClient(cfg, fakeFetch({ "/changes": fx("ado-changes-rename.json") }));
    const changes = await c.listCommitChanges("def456");
    expect(changes.map(c => c.path)).not.toContain("docs");
  });

  it("returns item content, or null on 404", async () => {
    const ok = new AdoClient(cfg, fakeFetch({ "/items": fx("ado-item.json") }));
    expect(await ok.getItemContent("docs/decisions/adr-013.md", "def456")).toBe("# ADR-013\n\nInhalt.");
    const missing = new AdoClient(cfg, fakeFetch({}));
    expect(await missing.getItemContent("x.md", "def456")).toBeNull();
  });
});
