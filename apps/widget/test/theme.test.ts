import { describe, it, expect } from "vitest";
import { statusText, typeBadge } from "../src/renderer/theme.js";

describe("theme mapper", () => {
  it("maps vote status to catppuccin text classes", () => {
    expect(statusText("akzeptiert")).toBe("text-ctp-green");
    expect(statusText("klaerung")).toBe("text-ctp-yellow");
    expect(statusText("abgelehnt")).toBe("text-ctp-red");
    expect(statusText("offen")).toBe("text-ctp-subtext0");
  });
  it("maps file type labels to badge colours", () => {
    expect(typeBadge("Decision").text).toBe("text-ctp-blue");
    expect(typeBadge("Learning").text).toBe("text-ctp-mauve");
    expect(typeBadge("Kontext").text).toBe("text-ctp-teal");
    expect(typeBadge("Sonstige").text).toBe("text-ctp-overlay1");
  });
});
