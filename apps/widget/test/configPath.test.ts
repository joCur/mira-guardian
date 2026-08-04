import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CONFIG_DIR, LEGACY_DIR, configDir, findLegacyConfig, migrateLegacyConfig } from "../src/main/configPath.js";

let appData: string;

function writeConfig(dirName: string, body: Record<string, unknown>) {
  const dir = join(appData, dirName);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "config.json"), JSON.stringify(body));
}
const readToken = (dirName: string) => JSON.parse(readFileSync(join(appData, dirName, "config.json"), "utf8")).token;

beforeEach(() => { appData = mkdtempSync(join(tmpdir(), "guardian-cfg-")); });
afterEach(() => { rmSync(appData, { recursive: true, force: true }); });

describe("configDir", () => {
  it("ist ein fester Ordner, nicht der App-Name aus app.getName()", () => {
    expect(configDir("/base", true)).toBe(join("/base", "de.mediainterface.mira-guardian"));
  });

  // Der Ordnername ist ein Kompatibilitätsversprechen: ändert er sich, startet
  // jede installierte App als abgemeldet.
  it("Ordnername bleibt fest", () => {
    expect(CONFIG_DIR).toBe("de.mediainterface.mira-guardian");
  });

  it("trennt die Dev-Instanz von der installierten App", () => {
    expect(configDir("/base", false)).not.toBe(configDir("/base", true));
  });
});

describe("migrateLegacyConfig", () => {
  it("übernimmt die Anmeldung aus dem Ordner des Paketnamens", () => {
    writeConfig(LEGACY_DIR, { token: "alt", serverUrl: "http://server:4000" });
    expect(migrateLegacyConfig(appData, true)).toBe(join(appData, LEGACY_DIR, "config.json"));
    expect(readToken(CONFIG_DIR)).toBe("alt");
  });

  // Beide Instanzen lagen bisher in derselben Datei, also darf auch beide
  // daraus übernehmen — danach sind sie getrennt.
  it("bedient Dev und installierte App aus derselben Altdatei", () => {
    writeConfig(LEGACY_DIR, { token: "geteilt" });
    migrateLegacyConfig(appData, true);
    migrateLegacyConfig(appData, false);
    expect(readToken(CONFIG_DIR)).toBe("geteilt");
    expect(readToken(`${CONFIG_DIR}-dev`)).toBe("geteilt");
  });

  it("lässt eine vorhandene Anmeldung unangetastet — auch ein Abmelden bleibt bestehen", () => {
    writeConfig(LEGACY_DIR, { token: "alt" });
    writeConfig(CONFIG_DIR, { token: null });
    expect(migrateLegacyConfig(appData, true)).toBeUndefined();
    expect(readToken(CONFIG_DIR)).toBeNull();
  });

  it("lässt das Original als Rückfalloption liegen", () => {
    writeConfig(LEGACY_DIR, { token: "alt" });
    migrateLegacyConfig(appData, true);
    expect(existsSync(join(appData, LEGACY_DIR, "config.json"))).toBe(true);
  });

  it("tut nichts, wenn es keinen Altordner gibt", () => {
    expect(findLegacyConfig(appData)).toBeUndefined();
    expect(migrateLegacyConfig(appData, true)).toBeUndefined();
    expect(existsSync(configDir(appData, true))).toBe(false);
  });
});
