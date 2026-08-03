import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CONFIG_DIR, configDir, findLegacyConfig, migrateLegacyConfig } from "../src/main/configPath.js";

let appData: string;

function writeConfig(dirName: string, body: Record<string, unknown>) {
  const dir = join(appData, dirName);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "config.json"), JSON.stringify(body));
}
const readToken = (file: string) => JSON.parse(readFileSync(file, "utf8")).token;

beforeEach(() => { appData = mkdtempSync(join(tmpdir(), "guardian-cfg-")); });
afterEach(() => { rmSync(appData, { recursive: true, force: true }); });

describe("configDir", () => {
  it("hängt am appId-Ordner, nicht am Anzeigenamen der App", () => {
    expect(configDir("/base", true)).toBe(join("/base", "de.mediainterface.mira-guardian"));
  });

  // Der Ordnername ist ein Kompatibilitätsversprechen: ändert er sich, gilt
  // jede installierte App als abgemeldet.
  it("Ordnername bleibt fest", () => {
    expect(CONFIG_DIR).toBe("de.mediainterface.mira-guardian");
  });

  it("trennt die Dev-Instanz von der installierten App", () => {
    expect(configDir("/base", false)).not.toBe(configDir("/base", true));
  });
});

describe("migrateLegacyConfig", () => {
  it("übernimmt die Anmeldung aus dem Ordner des früheren Anzeigenamens", () => {
    writeConfig("Guardian", { token: "alt", serverUrl: "http://server:4000" });
    const source = migrateLegacyConfig(appData, true);
    expect(source).toBe(join(appData, "Guardian", "config.json"));
    expect(readToken(join(configDir(appData, true), "config.json"))).toBe("alt");
  });

  it("findet auch den Ordner mit Umlaut aus der ersten Version", () => {
    writeConfig("Memory-Bank Hüter", { token: "ganz-alt", serverUrl: "http://server:4000" });
    expect(findLegacyConfig(appData, true)).toBeDefined();
    migrateLegacyConfig(appData, true);
    expect(readToken(join(configDir(appData, true), "config.json"))).toBe("ganz-alt");
  });

  it("nimmt den neusten Altordner, wenn mehrere daliegen", () => {
    writeConfig("mira-guardian", { token: "ganz-alt" });
    writeConfig("Guardian", { token: "neuer" });
    migrateLegacyConfig(appData, true);
    expect(readToken(join(configDir(appData, true), "config.json"))).toBe("neuer");
  });

  it("lässt eine vorhandene Anmeldung unangetastet — auch ein Abmelden bleibt bestehen", () => {
    writeConfig("Guardian", { token: "alt" });
    writeConfig(CONFIG_DIR, { token: null });
    expect(migrateLegacyConfig(appData, true)).toBeUndefined();
    expect(readToken(join(configDir(appData, true), "config.json"))).toBeNull();
  });

  it("lässt das Original als Rückfalloption liegen", () => {
    writeConfig("Guardian", { token: "alt" });
    migrateLegacyConfig(appData, true);
    expect(existsSync(join(appData, "Guardian", "config.json"))).toBe(true);
  });

  it("tut nichts, wenn es keinen Altordner gibt", () => {
    expect(migrateLegacyConfig(appData, true)).toBeUndefined();
    expect(existsSync(configDir(appData, true))).toBe(false);
  });

  it("zieht im Dev-Modus aus dem Paketnamen-Ordner, nicht aus dem der App", () => {
    writeConfig(join("@guardian", "widget"), { token: "dev" });
    writeConfig("Guardian", { token: "installiert" });
    migrateLegacyConfig(appData, false);
    expect(readToken(join(configDir(appData, false), "config.json"))).toBe("dev");
  });
});
