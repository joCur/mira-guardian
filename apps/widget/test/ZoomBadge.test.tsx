import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ZoomBadge } from "../src/renderer/components/ZoomBadge.js";
import type { Lesezoom } from "../src/renderer/useLesezoom.js";

function setup(stufe: number, prozent: number) {
  const zuruecksetzen = vi.fn();
  const zoom: Lesezoom = { stufe, prozent, zuruecksetzen };
  render(<ZoomBadge zoom={zoom} />);
  return { zuruecksetzen };
}

// Das Badge sitzt in der Titelleiste neben dem Update-Hinweis. Es beantwortet
// zwei Fragen — warum der Text anders aussieht und wie man das rückgängig
// macht — und darf deshalb nur dann da sein, wenn es die auch stellt.
describe("ZoomBadge", () => {
  it("bleibt bei 100 % unsichtbar, sonst wäre es Dauerrauschen", () => {
    setup(0, 100);
    expect(screen.queryByText(/%/)).toBeNull();
  });

  it("zeigt die Stufe an, sobald gezoomt ist", () => {
    setup(3, 173);
    expect(screen.getByText("173 %")).toBeTruthy();
  });

  it("zeigt auch das Verkleinern an", () => {
    setup(-2, 69);
    expect(screen.getByText("69 %")).toBeTruthy();
  });

  it("setzt per Klick zurück — ohne dass man das Tastenkürzel kennen muss", async () => {
    const { zuruecksetzen } = setup(2, 144);
    await userEvent.click(screen.getByText("144 %"));
    expect(zuruecksetzen).toHaveBeenCalledOnce();
  });

  it("nennt das Tastenkürzel im Titel, damit es auffindbar bleibt", () => {
    setup(1, 120);
    expect(screen.getByTitle(/Strg\/Cmd \+ 0/)).toBeTruthy();
  });
});
