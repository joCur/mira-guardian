import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GuardiansTab } from "../src/renderer/components/tabs/GuardiansTab.js";
import type { UpdateStatus } from "../src/types/update.js";

const guardians = [
  { id: "g1", name: "Jonas Curth", email: "j@x.de", initials: "JC", avatarColor: "#89b4fa", createdAt: "t", isFounder: true, absentFrom: null, absentUntil: null },
];

const CODE = { code: "MB-HWFT-NMR7", expiresAt: "2026-08-04T12:00:00.000Z", guardianName: "Jonas Curth" };
const noUpdate: UpdateStatus = { phase: "idle", version: null, percent: 0, notesUrl: null, message: null };

function setup(over: Partial<Parameters<typeof GuardiansTab>[0]> = {}) {
  const onSignOut = vi.fn(async () => {});
  const onRelink = vi.fn(async () => CODE);
  const onRevoke = vi.fn(async () => {});
  const onCheckUpdate = vi.fn();
  render(<GuardiansTab guardians={guardians} pending={[]} onInvite={vi.fn()}
    serverUrl="http://localhost:4000" onSignOut={onSignOut}
    devices={[]} onRelink={onRelink} onRevoke={onRevoke}
    appVersion="0.1.0" serverVersion={null}
    update={noUpdate} onCheckUpdate={onCheckUpdate} {...over} />);
  return { onSignOut, onRelink, onRevoke, onCheckUpdate };
}

describe("GuardiansTab — Verbindung", () => {
  it("shows the server address read-only, without an edit field", () => {
    setup();
    expect(screen.getByText("http://localhost:4000")).toBeTruthy();
    // Die Adresse gehört zum Zugang — hier darf sie nicht editierbar sein.
    expect(screen.queryByLabelText("Server-Adresse")).toBeNull();
    expect(screen.queryByText("Speichern")).toBeNull();
  });

  it("asks for confirmation before signing out", async () => {
    const { onSignOut } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Abmelden" }));
    expect(screen.getByText("Wirklich abmelden?")).toBeTruthy();
    expect(onSignOut).not.toHaveBeenCalled();
  });

  // Der Hinweis muss den Weg zurück nennen — und er stimmt erst, seit ein Code
  // ein bestehendes Profil verknüpfen kann statt ein zweites anzulegen.
  it("names the consequence: a new access code is needed", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Abmelden" }));
    expect(screen.getByText(/neuen Zugangscode/)).toBeTruthy();
    expect(screen.getByText(/Profil mit allen Bewertungen bleibt/)).toBeTruthy();
  });

  it("signs out only after confirming", async () => {
    const { onSignOut } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Abmelden" }));
    const buttons = screen.getAllByRole("button", { name: "Abmelden" });
    await userEvent.click(buttons[buttons.length - 1]);
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it("cancelling keeps the session", async () => {
    const { onSignOut } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Abmelden" }));
    await userEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(screen.queryByText("Wirklich abmelden?")).toBeNull();
    expect(onSignOut).not.toHaveBeenCalled();
  });
});

// Der Weg auf einen neuen Rechner. Vorher gab es dafür nur die Einladung, und
// die legte ein zweites Profil an: Bewertungen und Rolle blieben am alten.
describe("GuardiansTab — weiteres Gerät verknüpfen", () => {
  it("stellt für einen Hüter einen Code aus und zeigt ihn mit Ablauf", async () => {
    const { onRelink } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Gerät verknüpfen" }));
    expect(onRelink).toHaveBeenCalledWith("g1");
    expect(await screen.findByText("MB-HWFT-NMR7")).toBeTruthy();
    expect(screen.getByText(/gültig bis 4\. August/)).toBeTruthy();
  });

  it("sagt zu, dass Bewertungen und Rolle mitkommen", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Gerät verknüpfen" }));
    expect(await screen.findByText(/Bewertungen und Rolle/)).toBeTruthy();
  });

  it("zeigt keinen Code, solange keiner ausgestellt wurde", () => {
    setup();
    expect(screen.queryByText("MB-HWFT-NMR7")).toBeNull();
  });

  it("nennt den Grund, wenn der Server den Code ablehnt", async () => {
    setup({ onRelink: vi.fn(async () => { throw new Error("Hüter unbekannt."); }) });
    await userEvent.click(screen.getByRole("button", { name: "Gerät verknüpfen" }));
    expect(await screen.findByText("Hüter unbekannt.")).toBeTruthy();
  });
});

const devices = [
  { id: "d1", label: "MacBook (macOS)", createdAt: "2026-07-01T09:00:00.000Z", lastSeenAt: "2026-08-03T08:30:00.000Z", current: true },
  { id: "d2", label: "Alter Rechner (Windows)", createdAt: "2026-06-01T09:00:00.000Z", lastSeenAt: "2026-07-20T17:05:00.000Z", current: false },
];

// Ohne diese Liste sammelt jeder Rechnerwechsel einen dauerhaft gültigen
// Zugang an, den niemand mehr sieht.
describe("GuardiansTab — eigene Geräte", () => {
  it("listet die Geräte mit letztem Kontakt", () => {
    setup({ devices });
    expect(screen.getByText("MacBook (macOS)")).toBeTruthy();
    expect(screen.getByText("Alter Rechner (Windows)")).toBeTruthy();
    expect(screen.getByText(/letzter Kontakt 20\. Juli/)).toBeTruthy();
  });

  it("markiert das eigene Gerät und bietet dafür kein Entziehen an", () => {
    setup({ devices });
    expect(screen.getByText("dieses Gerät")).toBeTruthy();
    // Nur das fremde Gerät hat die Schaltfläche — für das eigene ist Abmelden der Weg.
    expect(screen.getAllByRole("button", { name: "Zugang entziehen" })).toHaveLength(1);
  });

  it("entzieht dem gewählten Gerät den Zugang", async () => {
    const { onRevoke } = setup({ devices });
    await userEvent.click(screen.getByRole("button", { name: "Zugang entziehen" }));
    expect(onRevoke).toHaveBeenCalledWith("d2");
  });
});

// Ohne Versionsanzeige war von außen nicht erkennbar, welcher Stand läuft —
// nach einem Server-Update blieb offen, ob die App dazu passt.
describe("GuardiansTab — Version", () => {
  it("nennt beide Versionen und schweigt, wenn sie übereinstimmen", () => {
    setup({ appVersion: "0.1.9", serverVersion: "0.1.9" });
    expect(screen.getByText(/Widget 0\.1\.9/)).toBeTruthy();
    expect(screen.getByText(/Server 0\.1\.9/)).toBeTruthy();
    expect(screen.queryByText(/auseinander/)).toBeNull();
  });

  it("weist auf auseinanderlaufende Stände hin", () => {
    setup({ appVersion: "0.1.7", serverVersion: "0.1.9" });
    expect(screen.getByText(/Widget 0\.1\.7/)).toBeTruthy();
    expect(screen.getByText(/Server 0\.1\.9/)).toBeTruthy();
    expect(screen.getByText(/auseinander/)).toBeTruthy();
  });

  // Beim Rollout trifft eine neue App zwangsläufig auf einen Server, dessen
  // /health noch keine Version liefert. Das ist kein Anlass für einen Hinweis.
  it("bleibt still, wenn der Server keine Version nennt", () => {
    setup({ appVersion: "0.1.9", serverVersion: null });
    expect(screen.getByText(/Server unbekannt/)).toBeTruthy();
    expect(screen.queryByText(/auseinander/)).toBeNull();
  });

  // Die eigene Version wird asynchron nachgeladen. Bis sie da ist, darf keine
  // Lücke stehen und erst recht kein Unterschied behauptet werden.
  it("nennt die eigene Version unbekannt, solange sie fehlt", () => {
    setup({ appVersion: "", serverVersion: "0.1.9" });
    expect(screen.getByText(/Widget unbekannt/)).toBeTruthy();
    expect(screen.queryByText(/auseinander/)).toBeNull();
  });
});

// Der Hinweis in der Titelleiste erscheint nur bei einem gefundenen Update.
// Wer wissen will, ob überhaupt geprüft wurde, schaut hier nach.
describe("GuardiansTab — Aktualisierung", () => {
  it("lässt von Hand nach Updates suchen", async () => {
    const { onCheckUpdate } = setup();
    expect(screen.getByText(/Noch nicht nach Updates gesucht/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Nach Updates suchen" }));
    expect(onCheckUpdate).toHaveBeenCalledTimes(1);
  });

  it("bestätigt den neuesten Stand", () => {
    setup({ update: { phase: "current", version: null, percent: 0, notesUrl: null, message: null } });
    expect(screen.getByText(/neueste Stand/)).toBeTruthy();
  });

  it("sperrt die Suche, solange sie läuft", () => {
    setup({ update: { phase: "checking", version: null, percent: 0, notesUrl: null, message: null } });
    expect(screen.getByRole("button", { name: "Nach Updates suchen" })).toHaveProperty("disabled", true);
  });

  // Ein Entwicklungsstart kann sich nicht selbst ersetzen — ein Knopf, der
  // nur in einen Fehler laufen kann, gehört dort nicht hin.
  it("bietet im Entwicklungsstart keine Suche an", () => {
    setup({ update: { phase: "unsupported", version: null, percent: 0, notesUrl: null, message: null } });
    expect(screen.queryByRole("button", { name: "Nach Updates suchen" })).toBeNull();
    expect(screen.getByText(/nur in der installierten App/)).toBeTruthy();
  });

  it("nennt die Version, die geladen wird", () => {
    setup({ update: { phase: "downloading", version: "0.1.9", percent: 30, notesUrl: null, message: null } });
    expect(screen.getByText(/0\.1\.9 wird geladen … 30 %/)).toBeTruthy();
  });
});
