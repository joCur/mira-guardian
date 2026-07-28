import { describe, it, expect } from "vitest";
import { loadConfig, deepLink } from "../src/config.js";

const base = {
  ADO_BASE_URL: "https://ado.example.com",
  ADO_COLLECTION: "DefaultCollection",
  ADO_PROJECT: "mira",
  ADO_REPO: "mira",
  ADO_PAT: "secret",
};

describe("config", () => {
  it("applies defaults and parses scan paths", () => {
    const cfg = loadConfig({ ...base, SCAN_PATHS: "docs/decisions,docs/learnings,memory-bank" } as any);
    expect(cfg.adoBranch).toBe("main");
    expect(cfg.pollIntervalSeconds).toBe(60);
    expect(cfg.scanPaths).toEqual(["docs/decisions", "docs/learnings", "memory-bank"]);
    expect(cfg.dbPath).toBe("guardian.sqlite");
    expect(cfg.httpPort).toBe(4000);
  });

  // Die Version kommt beim Container-Bau herein. Ohne sie läuft ein lokaler
  // Build — der soll als solcher erkennbar sein und nicht wie ein Release
  // aussehen.
  it("falls back to a recognisable dev version", () => {
    expect(loadConfig({ ...base } as any).version).toBe("0.0.0-dev");
  });

  it("takes the version from the environment", () => {
    expect(loadConfig({ ...base, GUARDIAN_VERSION: "0.1.9" } as any).version).toBe("0.1.9");
  });

  it("throws when a required var is missing", () => {
    expect(() => loadConfig({ ADO_BASE_URL: "x" } as any)).toThrow();
  });

  it("parses valid TYPE_MAP and sets typeRules", () => {
    const cfg = loadConfig({ ...base, TYPE_MAP: '[{"pattern":"^\\\\.claude/rules/","label":"Konvention"}]' } as any);
    expect(cfg.typeRules).toEqual([{ pattern: "^\\.claude/rules/", label: "Konvention" }]);
  });

  it("throws when TYPE_MAP has invalid shape", () => {
    expect(() => loadConfig({ ...base, TYPE_MAP: '[{"pattern":123}]' } as any)).toThrow();
  });

  it("builds a commit deep-link", () => {
    const cfg = loadConfig(base as any);
    expect(deepLink(cfg, "abc123", "docs/decisions/adr.md")).toBe(
      "https://ado.example.com/DefaultCollection/mira/_git/mira/commit/abc123?path=/docs/decisions/adr.md"
    );
  });
});
