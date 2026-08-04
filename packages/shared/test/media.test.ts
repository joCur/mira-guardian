import { describe, it, expect } from "vitest";
import { istBilddatei, bildMimeTyp, aufloesenBildPfad } from "../src/media.js";

describe("istBilddatei", () => {
  it("erkennt die Bildformate, die in Dokus vorkommen", () => {
    for (const p of ["a/b/flow.png", "x.JPG", "x.jpeg", "x.gif", "x.svg", "x.webp", "x.avif"]) {
      expect(istBilddatei(p)).toBe(true);
    }
  });

  it("hält Dokumente nicht für Bilder", () => {
    for (const p of ["docs/decisions/adr.md", "README", "x.pngx", "bild.png.md"]) {
      expect(istBilddatei(p)).toBe(false);
    }
  });

  it("nennt den Typ, den der Server ausliefern muss", () => {
    expect(bildMimeTyp("diagrams/flow.PNG")).toBe("image/png");
    expect(bildMimeTyp("diagrams/flow.svg")).toBe("image/svg+xml");
    expect(bildMimeTyp("notiz.md")).toBeNull();
  });
});

describe("aufloesenBildPfad", () => {
  const doku = "docs/processes/spec-driven-development/spec-driven-development.md";

  it("löst den Pfad relativ zum Dokument auf", () => {
    expect(aufloesenBildPfad(doku, "diagrams/flow.png"))
      .toBe("docs/processes/spec-driven-development/diagrams/flow.png");
  });

  it("versteht ./ und ../", () => {
    expect(aufloesenBildPfad(doku, "./bilder/x.png")).toBe("docs/processes/spec-driven-development/bilder/x.png");
    expect(aufloesenBildPfad(doku, "../gemeinsam/x.png")).toBe("docs/processes/gemeinsam/x.png");
  });

  it("nimmt einen führenden Schrägstrich als Repo-Wurzel", () => {
    expect(aufloesenBildPfad(doku, "/docs/bilder/x.png")).toBe("docs/bilder/x.png");
  });

  it("dekodiert Leerzeichen und schneidet Anker und Query ab", () => {
    expect(aufloesenBildPfad(doku, "diagrams/mein%20bild.png?v=2#oben"))
      .toBe("docs/processes/spec-driven-development/diagrams/mein bild.png");
  });

  // Sonst ließe sich über eine Doku steuern, welchen Pfad der Server bei ADO
  // anfragt — der Bildabruf wäre ein Leseweg ins ganze Repo und darüber hinaus.
  it("weist Ziele ab, die über die Repo-Wurzel hinausführen", () => {
    expect(aufloesenBildPfad("docs/a.md", "../../../etc/passwd.png")).toBeNull();
    expect(aufloesenBildPfad("a.md", "../x.png")).toBeNull();
  });

  it("weist Adressen ins Netz ab — die gehören nicht über den Server geholt", () => {
    expect(aufloesenBildPfad(doku, "https://example.com/x.png")).toBeNull();
    expect(aufloesenBildPfad(doku, "data:image/png;base64,AAAA")).toBeNull();
    expect(aufloesenBildPfad(doku, "//example.com/x.png")).toBeNull();
  });

  it("gibt bei leerem Ziel nichts zurück", () => {
    expect(aufloesenBildPfad(doku, "  ")).toBeNull();
    expect(aufloesenBildPfad(doku, "./")).toBeNull();
  });
});
