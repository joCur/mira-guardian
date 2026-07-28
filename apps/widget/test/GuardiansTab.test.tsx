import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GuardiansTab } from "../src/renderer/components/tabs/GuardiansTab.js";

const guardians = [
  { id: "g1", name: "Jonas Curth", email: "j@x.de", initials: "JC", avatarColor: "#89b4fa", createdAt: "t", isFounder: true },
];

function setup(over: Partial<Parameters<typeof GuardiansTab>[0]> = {}) {
  const onSignOut = vi.fn(async () => {});
  render(<GuardiansTab guardians={guardians} pending={[]} onInvite={vi.fn()}
    serverUrl="http://localhost:4000" onSignOut={onSignOut}
    appVersion="0.1.0" serverVersion={null} {...over} />);
  return { onSignOut };
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

  it("names the consequence: a new access code is needed", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "Abmelden" }));
    expect(screen.getByText(/neuen Zugangscode/)).toBeTruthy();
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
