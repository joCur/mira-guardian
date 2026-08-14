import { describe, it, expect } from "vitest";
import type { Change } from "@guardian/shared";
import { BildDienst, istBildseite } from "../src/api/bilder.js";
import type { AdoBytes, AdoClient } from "../src/ado/adoClient.js";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

interface Abruf { pfad: string; commitId: string; vorher: boolean }

/** ADO-Ersatz, der mitschreibt, wonach gefragt wurde. */
function fakeAdo(vorhanden: (a: Abruf) => boolean = () => true) {
  const abrufe: Abruf[] = [];
  const ado = {
    async getItemBytes(pfad: string, commitId: string, vorher = false): Promise<AdoBytes | null> {
      const a = { pfad, commitId, vorher };
      abrufe.push(a);
      return vorhanden(a) ? { bytes: PNG, contentType: "image/png" } : null;
    },
  } as unknown as AdoClient;
  return { ado, abrufe };
}

function change(over: Partial<Change> = {}): Change {
  return {
    id: "c1", repo: "R", branch: "main", filePath: "docs/decisions/diagrams/flow.png",
    changeKind: "modify", commitId: "c9", commitShort: "c9", authorName: "A", authorEmail: "a@x.de",
    committedAt: "t", summary: "s", oldMd: null, newMd: null, previousPath: null,
    baselineCommitId: "c9", previousNewMd: null, commitCount: 1, cycleId: "cy", firstSeenAt: "t", ...over,
  };
}

describe("istBildseite", () => {
  it("kennt nur vorher und nachher", () => {
    expect(istBildseite("vorher")).toBe(true);
    expect(istBildseite("nachher")).toBe(true);
    expect(istBildseite("beides")).toBe(false);
  });
});

describe("BildDienst", () => {
  it("holt die neue Fassung aus dem Commit der Änderung", async () => {
    const { ado, abrufe } = fakeAdo();
    const bild = await new BildDienst(ado).hole(change(), "nachher");
    expect(bild?.contentType).toBe("image/png");
    expect(abrufe[0]).toEqual({ pfad: "docs/decisions/diagrams/flow.png", commitId: "c9", vorher: false });
  });

  // Die Vorher-Seite hängt am zuerst erfassten Commit, nicht am jüngsten. Sonst
  // verkürzte eine Folgeänderung den Vergleich auf den letzten Zwischenstand,
  // und die Hüter sähen nicht mehr, was sich seit ihrem letzten Blick getan hat.
  it("fragt die alte Fassung gegen den festgehaltenen Bezugscommit", async () => {
    const { ado, abrufe } = fakeAdo();
    await new BildDienst(ado).hole(change({ commitId: "c12", baselineCommitId: "c9" }), "vorher");
    expect(abrufe[0]).toEqual({ pfad: "docs/decisions/diagrams/flow.png", commitId: "c9", vorher: true });
  });

  it("fällt auf den Commit der Änderung zurück, wenn kein Bezugscommit vermerkt ist", async () => {
    const { ado, abrufe } = fakeAdo();
    await new BildDienst(ado).hole(change({ commitId: "c12", baselineCommitId: null }), "vorher");
    expect(abrufe[0].commitId).toBe("c12");
  });

  it("kennt zu einem neu angelegten Bild kein Vorher und fragt ADO gar nicht erst", async () => {
    const { ado, abrufe } = fakeAdo();
    expect(await new BildDienst(ado).hole(change({ changeKind: "add" }), "vorher")).toBeNull();
    expect(abrufe).toEqual([]);
  });

  it("kennt zu einem gelöschten Bild kein Nachher", async () => {
    const { ado, abrufe } = fakeAdo();
    expect(await new BildDienst(ado).hole(change({ changeKind: "delete" }), "nachher")).toBeNull();
    expect(abrufe).toEqual([]);
  });

  it("sucht die alte Fassung eines verschobenen Bildes unter dem alten Pfad", async () => {
    const { ado, abrufe } = fakeAdo();
    await new BildDienst(ado).hole(
      change({ filePath: "docs/learnings/flow.png", previousPath: "docs/decisions/flow.png" }), "vorher");
    expect(abrufe[0].pfad).toBe("docs/decisions/flow.png");
  });

  it("gibt zu einem geänderten Dokument kein Bild heraus", async () => {
    const { ado } = fakeAdo();
    expect(await new BildDienst(ado).hole(change({ filePath: "docs/decisions/adr.md" }), "nachher")).toBeNull();
  });

  describe("eingebettete Bilder", () => {
    const doku = change({ filePath: "docs/processes/sdd/sdd.md", newMd: "# Doku" });

    it("löst den relativen Pfad gegen das Dokument auf", async () => {
      const { ado, abrufe } = fakeAdo();
      await new BildDienst(ado).hole(doku, "nachher", "diagrams/flow.png");
      expect(abrufe[0].pfad).toBe("docs/processes/sdd/diagrams/flow.png");
    });

    // Ein Bild muss im Commit des Dokuments nicht mitgeändert worden sein. Dann
    // kennt ADO dazu keinen Vorgängerstand — und der Stand im Commit selbst ist
    // zugleich der von vorher.
    it("zeigt ein unverändertes Bild auch auf der Vorher-Seite", async () => {
      const { ado, abrufe } = fakeAdo(a => !a.vorher);
      const bild = await new BildDienst(ado).hole(doku, "vorher", "diagrams/flow.png");
      expect(bild?.contentType).toBe("image/png");
      expect(abrufe.map(a => a.vorher)).toEqual([true, false]);
    });

    it("weist Pfade ab, die aus dem Repo hinausführen oder kein Bild sind", async () => {
      const { ado, abrufe } = fakeAdo();
      const d = new BildDienst(ado);
      expect(await d.hole(doku, "nachher", "../../../../etc/passwd.png")).toBeNull();
      expect(await d.hole(doku, "nachher", "geheim.md")).toBeNull();
      expect(await d.hole(doku, "nachher", "https://example.com/x.png")).toBeNull();
      expect(abrufe).toEqual([]);
    });
  });

  it("holt dasselbe Bild kein zweites Mal aus ADO", async () => {
    const { ado, abrufe } = fakeAdo();
    const dienst = new BildDienst(ado);
    await dienst.hole(change(), "nachher");
    await dienst.hole(change(), "nachher");
    expect(abrufe).toHaveLength(1);
  });

  it("hält den Speicher klein: der Cache wächst nicht unbegrenzt", async () => {
    const { ado, abrufe } = fakeAdo();
    const dienst = new BildDienst(ado, 2);
    for (const p of ["a.png", "b.png", "c.png", "a.png"]) {
      await dienst.hole(change({ filePath: `docs/decisions/${p}` }), "nachher");
    }
    expect(abrufe).toHaveLength(4); // a wurde verdrängt und neu geholt
  });

  it("legt übergroße Bilder nicht in den Cache", async () => {
    const { ado, abrufe } = fakeAdo();
    const dienst = new BildDienst(ado, 40, 2); // PNG-Rumpf ist 4 Bytes groß
    await dienst.hole(change(), "nachher");
    await dienst.hole(change(), "nachher");
    expect(abrufe).toHaveLength(2);
  });
});
