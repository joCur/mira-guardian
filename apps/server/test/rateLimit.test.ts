import { describe, it, expect } from "vitest";
import { createLimiter } from "../src/api/rateLimit.js";

describe("createLimiter", () => {
  it("lässt bis zur Grenze durch und bremst danach", () => {
    const l = createLimiter({ limit: 3, windowMs: 1000, now: () => 0 });
    expect([l.take("a"), l.take("a"), l.take("a")]).toEqual([true, true, true]);
    expect(l.take("a")).toBe(false);
  });

  it("zählt je Absender getrennt", () => {
    const l = createLimiter({ limit: 1, windowMs: 1000, now: () => 0 });
    expect(l.take("a")).toBe(true);
    expect(l.take("b")).toBe(true);
    expect(l.take("a")).toBe(false);
  });

  it("gibt nach dem Zeitfenster wieder frei", () => {
    let t = 0;
    const l = createLimiter({ limit: 1, windowMs: 1000, now: () => t });
    expect(l.take("a")).toBe(true);
    t = 999;
    expect(l.take("a")).toBe(false);
    t = 1001;
    expect(l.take("a")).toBe(true);
  });

  // Ein geglückter Zugang soll den Zähler nicht belasten: sonst sperrt sich ein
  // Hüter aus, der mehrere Geräte hintereinander verknüpft.
  it("reset löscht den Zähler", () => {
    const l = createLimiter({ limit: 1, windowMs: 1000, now: () => 0 });
    l.take("a");
    l.reset("a");
    expect(l.take("a")).toBe(true);
  });

  // Ein blockierter Versuch verlängert das Fenster nicht — sonst wäre eine
  // Sperre nach genügend Versuchen dauerhaft.
  it("blockierte Versuche verlängern die Sperre nicht", () => {
    let t = 0;
    const l = createLimiter({ limit: 1, windowMs: 1000, now: () => t });
    l.take("a");
    t = 500; expect(l.take("a")).toBe(false);
    t = 1001; expect(l.take("a")).toBe(true);
  });
});
