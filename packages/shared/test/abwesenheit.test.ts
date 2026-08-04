import { describe, it, expect } from "vitest";
import type { Guardian } from "../src/index.js";
import {
  abwesenheitOhneWirkung, istAbwesendLaut, MINDESTENS_ANWESEND, tagAus, wirksamAbwesende,
} from "../src/index.js";

const g = (id: string, from: string | null = null, until: string | null = null): Guardian => ({
  id, name: id, email: `${id}@x.de`, initials: id.toUpperCase(), avatarColor: "#fff",
  createdAt: "t", isFounder: false, absentFrom: from, absentUntil: until,
});

describe("tagAus", () => {
  it("nimmt den Tagesanteil eines Zeitstempels", () => {
    expect(tagAus("2026-08-04T10:00:00.000Z")).toBe("2026-08-04");
  });
});

describe("istAbwesendLaut", () => {
  it("beide Ränder zählen mit", () => {
    const a = g("a", "2026-08-10", "2026-08-20");
    expect(istAbwesendLaut(a, "2026-08-10")).toBe(true);
    expect(istAbwesendLaut(a, "2026-08-20")).toBe(true);
    expect(istAbwesendLaut(a, "2026-08-15")).toBe(true);
  });

  it("davor und danach ist der Hüter anwesend", () => {
    const a = g("a", "2026-08-10", "2026-08-20");
    expect(istAbwesendLaut(a, "2026-08-09")).toBe(false);
    expect(istAbwesendLaut(a, "2026-08-21")).toBe(false);
  });

  // Ohne Enddatum wäre die Abwesenheit unbefristet — so wird ein Trio still
  // zum Duo. Deshalb zählt nur ein vollständiger Zeitraum.
  it("ein halb eingetragener Zeitraum gilt nicht", () => {
    expect(istAbwesendLaut(g("a", "2026-08-10", null), "2026-08-15")).toBe(false);
    expect(istAbwesendLaut(g("a", null, "2026-08-20"), "2026-08-15")).toBe(false);
    expect(istAbwesendLaut(g("a"), "2026-08-15")).toBe(false);
  });
});

describe("wirksamAbwesende", () => {
  const heute = "2026-08-15";
  const urlaub: [string, string] = ["2026-08-10", "2026-08-20"];

  it("einer von drei ist wirksam abwesend", () => {
    const alle = [g("a", ...urlaub), g("b"), g("c")];
    expect(wirksamAbwesende(alle, heute).map(x => x.id)).toEqual(["a"]);
  });

  it("Untergrenze: zwei von drei abwesend wirkt für niemanden", () => {
    const alle = [g("a", ...urlaub), g("b", ...urlaub), g("c")];
    expect(wirksamAbwesende(alle, heute)).toEqual([]);
  });

  it("im Duo wirkt eine Abwesenheit nicht — einer allein winkt nichts durch", () => {
    const alle = [g("a", ...urlaub), g("b")];
    expect(wirksamAbwesende(alle, heute)).toEqual([]);
  });

  it("bei vier Hütern dürfen zwei abwesend sein", () => {
    const alle = [g("a", ...urlaub), g("b", ...urlaub), g("c"), g("d")];
    expect(wirksamAbwesende(alle, heute).map(x => x.id)).toEqual(["a", "b"]);
    expect(MINDESTENS_ANWESEND).toBe(2);
  });
});

describe("abwesenheitOhneWirkung", () => {
  const heute = "2026-08-15";
  const urlaub: [string, string] = ["2026-08-10", "2026-08-20"];

  it("meldet die wirkungslose Abwesenheit, damit die Oberfläche es sagen kann", () => {
    expect(abwesenheitOhneWirkung([g("a", ...urlaub), g("b")], heute)).toBe(true);
  });

  it("ohne eingetragene Abwesenheit gibt es nichts zu melden", () => {
    expect(abwesenheitOhneWirkung([g("a"), g("b")], heute)).toBe(false);
  });

  it("eine wirksame Abwesenheit ist kein Hinweisfall", () => {
    expect(abwesenheitOhneWirkung([g("a", ...urlaub), g("b"), g("c")], heute)).toBe(false);
  });
});
