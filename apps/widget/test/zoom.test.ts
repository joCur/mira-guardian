import { describe, it, expect } from "vitest";
import { applyZoom, clampZoom, zoomCommandFor, ZOOM_MIN, ZOOM_MAX } from "../src/main/zoom.js";

const taste = (over: Partial<Parameters<typeof zoomCommandFor>[0]>) =>
  ({ type: "keyDown", control: false, meta: false, key: "", code: "", ...over });

describe("zoomCommandFor", () => {
  it("erkennt Plus auf deutschem Layout, US-Layout und Ziffernblock", () => {
    expect(zoomCommandFor(taste({ control: true, key: "+" }))).toBe("in");
    expect(zoomCommandFor(taste({ control: true, key: "=" }))).toBe("in");
    expect(zoomCommandFor(taste({ control: true, code: "NumpadAdd" }))).toBe("in");
  });

  it("erkennt Minus und Null", () => {
    expect(zoomCommandFor(taste({ control: true, key: "-" }))).toBe("out");
    expect(zoomCommandFor(taste({ control: true, code: "NumpadSubtract" }))).toBe("out");
    expect(zoomCommandFor(taste({ control: true, key: "0" }))).toBe("reset");
    expect(zoomCommandFor(taste({ control: true, code: "Numpad0" }))).toBe("reset");
  });

  it("nimmt Cmd genauso wie Strg", () => {
    expect(zoomCommandFor(taste({ meta: true, key: "+" }))).toBe("in");
  });

  it("lässt Tasten ohne Strg/Cmd durch, damit ein '+' im Kommentarfeld ankommt", () => {
    expect(zoomCommandFor(taste({ key: "+" }))).toBeNull();
    expect(zoomCommandFor(taste({ key: "0" }))).toBeNull();
  });

  it("reagiert nur auf keyDown, sonst zoomt ein Tastendruck zweimal", () => {
    expect(zoomCommandFor(taste({ type: "keyUp", control: true, key: "+" }))).toBeNull();
  });

  it("ignoriert fremde Tastenkürzel wie Strg+A", () => {
    expect(zoomCommandFor(taste({ control: true, key: "a" }))).toBeNull();
  });
});

describe("applyZoom", () => {
  it("stuft hoch und runter", () => {
    expect(applyZoom(0, "in")).toBe(1);
    expect(applyZoom(0, "out")).toBe(-1);
  });

  it("setzt mit Null auf 100 % zurück", () => {
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

describe("clampZoom", () => {
  it("fängt eine verfälschte config.json ab", () => {
    // NaN und Infinity sind beide kein sinnvoller Zoom — zurück auf 100 %,
    // statt Chromium einen unbrauchbar skalierten Renderer zu geben.
    expect(clampZoom(NaN)).toBe(0);
    expect(clampZoom(Infinity)).toBe(0);
    // Eine bloß zu große Zahl ist dagegen eine Stufe, nur außerhalb der Grenzen.
    expect(clampZoom(99)).toBe(ZOOM_MAX);
    expect(clampZoom(-99)).toBe(ZOOM_MIN);
  });
});
