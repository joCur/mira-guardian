import { describe, it, expect } from "vitest";
import { applyZoom, clampZoom, zoomCommandFor, zoomFaktor, ZOOM_MIN, ZOOM_MAX } from "../src/renderer/zoom.js";

const taste = (over: Partial<Parameters<typeof zoomCommandFor>[0]>) =>
  ({ ctrlKey: false, metaKey: false, key: "", code: "", ...over });

describe("zoomCommandFor", () => {
  it("erkennt Plus auf deutschem Layout, US-Layout und Ziffernblock", () => {
    expect(zoomCommandFor(taste({ ctrlKey: true, key: "+" }))).toBe("in");
    expect(zoomCommandFor(taste({ ctrlKey: true, key: "=" }))).toBe("in");
    expect(zoomCommandFor(taste({ ctrlKey: true, code: "NumpadAdd" }))).toBe("in");
  });

  it("erkennt Minus und Null", () => {
    expect(zoomCommandFor(taste({ ctrlKey: true, key: "-" }))).toBe("out");
    expect(zoomCommandFor(taste({ ctrlKey: true, code: "NumpadSubtract" }))).toBe("out");
    expect(zoomCommandFor(taste({ ctrlKey: true, key: "0" }))).toBe("reset");
    expect(zoomCommandFor(taste({ ctrlKey: true, code: "Numpad0" }))).toBe("reset");
  });

  it("nimmt Cmd genauso wie Strg", () => {
    expect(zoomCommandFor(taste({ metaKey: true, key: "+" }))).toBe("in");
  });

  it("lässt Tasten ohne Strg/Cmd durch, damit ein '+' im Kommentarfeld ankommt", () => {
    expect(zoomCommandFor(taste({ key: "+" }))).toBeNull();
    expect(zoomCommandFor(taste({ key: "0" }))).toBeNull();
  });

  it("ignoriert fremde Tastenkürzel wie Strg+A", () => {
    expect(zoomCommandFor(taste({ ctrlKey: true, key: "a" }))).toBeNull();
  });
});

describe("applyZoom", () => {
  it("stuft hoch und runter", () => {
    expect(applyZoom(0, "in")).toBe(1);
    expect(applyZoom(0, "out")).toBe(-1);
  });

  it("setzt mit Null auf die Ausgangsgröße zurück", () => {
    expect(applyZoom(4, "reset")).toBe(0);
    expect(applyZoom(-2, "reset")).toBe(0);
  });

  it("bleibt in den Grenzen", () => {
    expect(applyZoom(ZOOM_MAX, "in")).toBe(ZOOM_MAX);
    expect(applyZoom(ZOOM_MIN, "out")).toBe(ZOOM_MIN);
  });

  it("holt eine außerhalb liegende Stufe zurück in den Bereich", () => {
    expect(applyZoom(99, "out")).toBe(ZOOM_MAX - 1);
  });
});

describe("zoomFaktor", () => {
  it("lässt Stufe 0 unverändert", () => {
    expect(zoomFaktor(0)).toBe(1);
  });

  it("folgt der 1,2er-Reihe aus Browsern und VS Code", () => {
    expect(zoomFaktor(1)).toBe(1.2);
    expect(zoomFaktor(2)).toBe(1.44);
    expect(zoomFaktor(-1)).toBeCloseTo(0.833, 3);
  });

  it("bleibt eine kurze Zahl, damit der CSS-Wert nicht ausufert", () => {
    expect(String(zoomFaktor(5)).length).toBeLessThanOrEqual(6);
  });

  it("hält sich an die Grenzen", () => {
    expect(zoomFaktor(99)).toBe(zoomFaktor(ZOOM_MAX));
    // Eine verfälschte config.json darf nicht bis ins CSS durchschlagen.
    expect(zoomFaktor(NaN)).toBe(1);
  });
});

describe("clampZoom", () => {
  it("fängt eine verfälschte config.json ab", () => {
    expect(clampZoom(NaN)).toBe(0);
    expect(clampZoom(Infinity)).toBe(0);
    expect(clampZoom(99)).toBe(ZOOM_MAX);
    expect(clampZoom(-99)).toBe(ZOOM_MIN);
  });

  it("rundet Zwischenwerte auf ganze Stufen", () => {
    expect(clampZoom(1.4)).toBe(1);
  });
});
