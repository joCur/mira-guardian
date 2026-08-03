import { describe, it, expect } from "vitest";
import { deviceLabel } from "../src/main/deviceLabel.js";

describe("deviceLabel", () => {
  it("nennt Rechnernamen und System", () => {
    expect(deviceLabel("MacBook-Pro", "darwin")).toBe("MacBook-Pro (macOS)");
    expect(deviceLabel("PC-42", "win32")).toBe("PC-42 (Windows)");
    expect(deviceLabel("thinkpad", "linux")).toBe("thinkpad (Linux)");
  });

  // Ein angehängtes .local oder Firmen-Suffix sagt über das Gerät nichts und
  // macht die Zeile in der Geräteliste nur unleserlich.
  it("schneidet die Domain ab", () => {
    expect(deviceLabel("MacBook-Pro.local", "darwin")).toBe("MacBook-Pro (macOS)");
    expect(deviceLabel("pc-42.intern.example.com", "win32")).toBe("pc-42 (Windows)");
  });

  it("bleibt brauchbar, wenn es keinen Rechnernamen gibt", () => {
    expect(deviceLabel("", "darwin")).toBe("macOS");
  });

  it("gibt eine unbekannte Plattform unverändert weiter", () => {
    expect(deviceLabel("box", "freebsd")).toBe("box (freebsd)");
  });
});
