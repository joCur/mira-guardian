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
    serverUrl="http://localhost:4000" onSignOut={onSignOut} {...over} />);
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
