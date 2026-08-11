import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ChangeWithVotes } from "@guardian/shared";
import { DiffView } from "../src/renderer/components/DiffView.js";
import { ApiProvider } from "../src/renderer/bild/kontext.js";
import type { ApiClient } from "../src/renderer/api/client.js";

function change(over: Partial<ChangeWithVotes> = {}): ChangeWithVotes {
  return { id: "c", repo: "r", branch: "main", filePath: "docs/decisions/diagrams/flow.png",
    changeKind: "modify", commitId: "x", commitShort: "x", authorName: "A", authorEmail: "a@x.de",
    committedAt: "t", summary: "s", oldMd: null, newMd: null, previousPath: null, baselineCommitId: "x", previousNewMd: null, commitCount: 1,
    cycleId: "cy", firstSeenAt: "t", votes: [], adoLink: "http://x", ...over };
}

/** Api-Ersatz, der Bilder liefert und mitschreibt, welche Seite gefragt wurde. */
function fakeApi(antwort: (seite: string, pfad?: string) => Blob | null = () => new Blob(["x"], { type: "image/png" })) {
  const gefragt: Array<[string, string | undefined]> = [];
  const api = {
    async ladeBild(_id: string, seite: "vorher" | "nachher", pfad?: string) {
      gefragt.push([seite, pfad]);
      return antwort(seite, pfad);
    },
  } as unknown as ApiClient;
  return { api, gefragt };
}

function zeige(c: ChangeWithVotes, api: ApiClient) {
  return render(<ApiProvider api={api}><DiffView change={c} /></ApiProvider>);
}

describe("Bildvergleich", () => {
  beforeEach(() => {
    // jsdom kennt keine Blob-Adressen.
    globalThis.URL.createObjectURL = vi.fn(() => "blob:bild");
    globalThis.URL.revokeObjectURL = vi.fn();
  });

  // Vorher stand hier der Markdown-Renderer und zeigte den Binärinhalt als
  // Text — für die Hüter nicht bewertbar.
  it("stellt bei einer geänderten Bilddatei beide Fassungen nebeneinander", async () => {
    const { api, gefragt } = fakeApi();
    zeige(change(), api);
    await waitFor(() => expect(screen.getAllByRole("img")).toHaveLength(2));
    expect(screen.getByText("VORHER")).toBeTruthy();
    expect(screen.getByText("NACHHER")).toBeTruthy();
    expect(gefragt.map(([seite]) => seite).sort()).toEqual(["nachher", "vorher"]);
  });

  it("zeigt bei einem neu angelegten Bild nur die neue Fassung", async () => {
    const { api, gefragt } = fakeApi();
    zeige(change({ changeKind: "add" }), api);
    await waitFor(() => expect(screen.getAllByRole("img")).toHaveLength(1));
    expect(screen.queryByText("VORHER")).toBeNull();
    expect(gefragt.map(([seite]) => seite)).toEqual(["nachher"]);
  });

  it("zeigt bei einem gelöschten Bild nur die alte Fassung", async () => {
    const { api, gefragt } = fakeApi();
    zeige(change({ changeKind: "delete" }), api);
    await waitFor(() => expect(screen.getAllByRole("img")).toHaveLength(1));
    expect(gefragt.map(([seite]) => seite)).toEqual(["vorher"]);
  });

  // Beim reinen Verschieben ist der Inhalt nachweislich derselbe — zwei
  // identische Bilder nebeneinander behaupteten eine Änderung, die es nicht gibt.
  it("zeigt ein nur verschobenes Bild einmal, mit Hinweis auf den Pfadwechsel", async () => {
    const { api, gefragt } = fakeApi();
    zeige(change({ changeKind: "rename", previousPath: "docs/learnings/flow.png" }), api);
    await waitFor(() => expect(screen.getAllByRole("img")).toHaveLength(1));
    expect(screen.getByText(/Verschoben/)).toBeTruthy();
    expect(gefragt.map(([seite]) => seite)).toEqual(["nachher"]);
  });

  it("benennt eine fehlende Vergleichsfassung, statt eine leere Fläche zu zeigen", async () => {
    const { api } = fakeApi(seite => (seite === "vorher" ? null : new Blob(["x"], { type: "image/png" })));
    zeige(change(), api);
    expect(await screen.findByText("Kein Vorgängerstand")).toBeTruthy();
  });

  it("sagt es, wenn das Bild nicht abrufbar ist", async () => {
    const api = { async ladeBild() { throw new Error("502"); } } as unknown as ApiClient;
    zeige(change(), api);
    await waitFor(() => expect(screen.getAllByText("Bild nicht abrufbar")).toHaveLength(2));
  });

  it("öffnet ein Bild groß und schließt es per Escape", async () => {
    const { api } = fakeApi();
    zeige(change(), api);
    const bilder = await screen.findAllByRole("img");
    await userEvent.click(bilder[0]);
    expect(screen.getByRole("dialog", { name: "Bild groß" })).toBeTruthy();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Bild groß" })).toBeNull());
  });
});

describe("Bilder in Dokumenten", () => {
  beforeEach(() => {
    globalThis.URL.createObjectURL = vi.fn(() => "blob:bild");
    globalThis.URL.revokeObjectURL = vi.fn();
  });

  const doku = (over: Partial<ChangeWithVotes> = {}) => change({
    filePath: "docs/processes/sdd/sdd.md", changeKind: "modify",
    oldMd: "# Ablauf\n\nAlter Text.", newMd: "# Ablauf\n\n![Ablaufdiagramm](diagrams/flow.png)", ...over });

  // Bisher stand hier `img: () => null` — eingebettete Diagramme waren im
  // Review schlicht unsichtbar.
  it("zeigt ein eingebettetes Bild samt Beschriftung", async () => {
    const { api, gefragt } = fakeApi();
    zeige(doku(), api);
    const bild = await screen.findByRole("img", { name: "Ablaufdiagramm" });
    expect(bild.getAttribute("src")).toBe("blob:bild");
    expect(gefragt).toEqual([["nachher", "diagrams/flow.png"]]);
  });

  it("holt ein Bild aus einem gelöschten Absatz in der alten Fassung", async () => {
    const { api, gefragt } = fakeApi();
    zeige(doku({ oldMd: "# Ablauf\n\n![Altes Bild](diagrams/alt.png)", newMd: "# Ablauf\n\nJetzt ohne Bild." }), api);
    await waitFor(() => expect(gefragt).toEqual([["vorher", "diagrams/alt.png"]]));
  });

  // Sonst kontaktierte das Widget beim bloßen Ansehen einer Doku fremde Server.
  it("lädt Bilder von fremden Adressen nicht, sondern benennt sie", async () => {
    const { api, gefragt } = fakeApi();
    zeige(doku({ newMd: "# Ablauf\n\n![Extern](https://example.com/x.png)" }), api);
    expect(await screen.findByText(/Bild von außerhalb/)).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
    expect(gefragt).toEqual([]);
  });

  it("sagt es, wenn das Bild in der alten Fassung fehlt", async () => {
    const { api } = fakeApi(() => null);
    zeige(doku(), api);
    expect(await screen.findByText(/Bild in dieser Fassung nicht vorhanden/)).toBeTruthy();
  });
});
