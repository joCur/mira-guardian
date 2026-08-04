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

  // Ohne den Stand vor dem Commit gibt es keine Vergleichsbasis: eine geänderte
  // Datei sähe für die Hüter aus wie ein frisch angelegtes Dokument.
  it("holt den Stand vor dem Commit über versionOptions=previousChange", async () => {
    const urls: string[] = [];
    const recording = (async (url: string) => {
      urls.push(String(url));
      return { ok: true, status: 200, json: async () => fx("ado-item.json") } as Response;
    }) as unknown as typeof fetch;

    const c = new AdoClient(cfg, recording);
    expect(await c.getItemContentBefore("docs/decisions/adr-013.md", "def456")).toBe("# ADR-013\n\nInhalt.");
    expect(urls[0]).toContain("versionDescriptor.versionOptions=previousChange");
    expect(urls[0]).toContain("versionDescriptor.version=def456");
    expect(urls[0]).toContain("versionDescriptor.versionType=commit");
  });

  it("liefert null, wenn es vor dem Commit keinen Stand gab", async () => {
    const c = new AdoClient(cfg, fakeFetch({}));
    expect(await c.getItemContentBefore("neu.md", "def456")).toBeNull();
  });

  it("fragt den Stand im Commit selbst ohne versionOptions ab", async () => {
    const urls: string[] = [];
    const recording = (async (url: string) => {
      urls.push(String(url));
      return { ok: true, status: 200, json: async () => fx("ado-item.json") } as Response;
    }) as unknown as typeof fetch;

    await new AdoClient(cfg, recording).getItemContent("docs/decisions/adr-013.md", "def456");
    expect(urls[0]).not.toContain("versionOptions");
  });

  describe("getItemBytes", () => {
    function binaerFetch(status = 200, bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47])) {
      const urls: string[] = []; const accepts: string[] = [];
      const fn = (async (url: string, init?: RequestInit) => {
        urls.push(String(url));
        accepts.push((init?.headers as Record<string, string>)?.Accept ?? "");
        return {
          ok: status < 400, status,
          headers: new Headers({ "content-type": "image/png; api-version=7.1" }),
          arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
          json: async () => ({}),
        } as unknown as Response;
      }) as unknown as typeof fetch;
      return { fn, urls, accepts };
    }

    // Über includeContent kommt ein PNG nur beschädigt an (JSON-String statt
    // Bytes) — genau daran scheiterte die Bildanzeige vorher.
    it("lädt die Datei als Rohbytes statt als JSON-Inhalt", async () => {
      const { fn, urls, accepts } = binaerFetch();
      const bild = await new AdoClient(cfg, fn).getItemBytes("docs/decisions/flow.png", "def456");
      expect(bild?.bytes.subarray(0, 4).toString("hex")).toBe("89504e47");
      expect(bild?.contentType).toBe("image/png");
      expect(urls[0]).toContain("$format=octetStream");
      expect(urls[0]).toContain("download=true");
      expect(urls[0]).not.toContain("includeContent");
      expect(accepts[0]).toBe("application/octet-stream");
    });

    it("fragt die alte Fassung über versionOptions=previousChange", async () => {
      const { fn, urls } = binaerFetch();
      await new AdoClient(cfg, fn).getItemBytes("docs/decisions/flow.png", "def456", true);
      expect(urls[0]).toContain("versionDescriptor.versionOptions=previousChange");
    });

    it("meldet eine unbekannte Datei als 'nicht vorhanden'", async () => {
      const { fn } = binaerFetch(404);
      expect(await new AdoClient(cfg, fn).getItemBytes("x.png", "def456")).toBeNull();
    });

    // Fragt man nach dem Stand vor dem Commit, in dem eine Datei erst angelegt
    // wurde, antwortet ADO mit 400. Das heißt "kein Vorgängerstand" und darf den
    // Abruf nicht scheitern lassen.
    it("wertet 400 auf der Vorher-Seite als fehlenden Vorgängerstand", async () => {
      const { fn } = binaerFetch(400);
      expect(await new AdoClient(cfg, fn).getItemBytes("neu.png", "def456", true)).toBeNull();
    });

    it("lässt 400 auf der Nachher-Seite als Fehler durch", async () => {
      const { fn } = binaerFetch(400);
      await expect(new AdoClient(cfg, fn).getItemBytes("neu.png", "def456")).rejects.toThrow("400");
    });
  });
});
