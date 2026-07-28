import { describe, it, expect } from "vitest";
import { nextSelection } from "../src/renderer/nextSelection.js";

const ids = (xs: string[]) => xs.map(id => ({ id }));

describe("nextSelection", () => {
  it("moves to the entry that took the place of an accepted change", () => {
    // b wurde akzeptiert und verlässt die Liste — c rückt auf Position 1.
    expect(nextSelection(ids(["a", "b", "c"]), "b", ids(["a", "c"]))).toBe("c");
  });

  it("moves to the next entry when the change stays in the list", () => {
    // b wurde abgelehnt und bleibt stehen — Auswahl geht trotzdem weiter.
    expect(nextSelection(ids(["a", "b", "c"]), "b", ids(["a", "b", "c"]))).toBe("c");
  });

  it("wraps to the first entry at the end of the list", () => {
    expect(nextSelection(ids(["a", "b"]), "b", ids(["a", "b"]))).toBe("a");
  });

  it("takes the last entry when the accepted change was at the end", () => {
    expect(nextSelection(ids(["a", "b"]), "b", ids(["a"]))).toBe("a");
  });

  it("returns null when nothing is left to rate", () => {
    expect(nextSelection(ids(["a"]), "a", ids([]))).toBeNull();
  });

  it("falls back to the first entry when the voted change was not in the list", () => {
    expect(nextSelection(ids(["a", "b"]), "zzz", ids(["a", "b"]))).toBe("a");
  });
});
