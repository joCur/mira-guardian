import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UpdateBadge } from "../src/renderer/components/UpdateBadge.js";
import type { UpdateStatus } from "../src/types/update.js";

const base: UpdateStatus = { phase: "idle", version: null, percent: 0, notesUrl: null, message: null };

function setup(status: Partial<UpdateStatus>) {
  const onInstall = vi.fn();
  const onOpenNotes = vi.fn();
  render(<UpdateBadge status={{ ...base, ...status }} currentVersion="0.1.7"
    onInstall={onInstall} onOpenNotes={onOpenNotes} />);
  return { onInstall, onOpenNotes };
}

// Der Hinweis sitzt in der Titelleiste und ist damit immer im Blick. Er darf
// nur auftauchen, wenn es wirklich etwas zu tun gibt — sonst wird er zum
// Dauerzustand, den niemand mehr liest.
describe("UpdateBadge — Sichtbarkeit", () => {
  it("schweigt, solange nichts gefunden ist", () => {
    setup({ phase: "idle" });
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("schweigt während der Suche", () => {
    setup({ phase: "checking" });
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("schweigt beim neuesten Stand", () => {
    setup({ phase: "current" });
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("schweigt im Entwicklungsstart", () => {
    setup({ phase: "unsupported" });
    expect(screen.queryByRole("button")).toBeNull();
  });

  // Ein Fehler ohne bekannte Zielversion ist ein Netz- oder Serverproblem der
  // Prüfung selbst. Daraus einen Update-Hinweis zu machen, würde eine neue
  // Version behaupten, von der niemand weiß, ob sie existiert.
  it("schweigt bei einem Fehler ohne bekannte Version", () => {
    setup({ phase: "error", message: "getaddrinfo ENOTFOUND" });
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("UpdateBadge — Hinweis und Karte", () => {
  it("meldet die bereitliegende Version", () => {
    setup({ phase: "ready", version: "0.1.9" });
    expect(screen.getByRole("button", { name: /Update bereit/ })).toBeTruthy();
  });

  it("zeigt den Fortschritt beim Laden", () => {
    setup({ phase: "downloading", version: "0.1.9", percent: 42 });
    expect(screen.getByRole("button", { name: /42 %/ })).toBeTruthy();
  });

  it("nennt in der Karte den Sprung von der eigenen zur neuen Version", async () => {
    setup({ phase: "ready", version: "0.1.9" });
    await userEvent.click(screen.getByRole("button", { name: /Update bereit/ }));
    expect(screen.getByText("0.1.7 → 0.1.9")).toBeTruthy();
  });

  it("installiert erst nach dem Klick in der Karte", async () => {
    const { onInstall } = setup({ phase: "ready", version: "0.1.9" });
    await userEvent.click(screen.getByRole("button", { name: /Update bereit/ }));
    expect(onInstall).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: /Neu starten/ }));
    expect(onInstall).toHaveBeenCalledTimes(1);
  });

  it("führt zu den Änderungshinweisen des Releases", async () => {
    const { onOpenNotes } = setup({
      phase: "ready", version: "0.1.9",
      notesUrl: "https://github.com/joCur/mira-guardian/releases/tag/v0.1.9",
    });
    await userEvent.click(screen.getByRole("button", { name: /Update bereit/ }));
    await userEvent.click(screen.getByRole("button", { name: /Was ist neu/ }));
    expect(onOpenNotes).toHaveBeenCalledWith("https://github.com/joCur/mira-guardian/releases/tag/v0.1.9");
  });

  // Scheitert das Einspielen — auf macOS etwa an der Signaturprüfung —, ist der
  // Weg über die Release-Seite der einzige, der bleibt.
  it("verweist bei einem gescheiterten Download weiter auf das Release", async () => {
    const { onOpenNotes } = setup({
      phase: "error", version: "0.1.9", message: "did not pass validation",
      notesUrl: "https://github.com/joCur/mira-guardian/releases/tag/v0.1.9",
    });
    await userEvent.click(screen.getByRole("button", { name: /Update verfügbar/ }));
    expect(screen.getByText(/did not pass validation/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Neu starten/ })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /Was ist neu/ }));
    expect(onOpenNotes).toHaveBeenCalled();
  });

  it("schließt die Karte mit Escape wieder", async () => {
    setup({ phase: "ready", version: "0.1.9" });
    await userEvent.click(screen.getByRole("button", { name: /Update bereit/ }));
    expect(screen.getByText("0.1.7 → 0.1.9")).toBeTruthy();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByText("0.1.7 → 0.1.9")).toBeNull();
  });
});
