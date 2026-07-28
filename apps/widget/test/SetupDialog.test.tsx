import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SetupDialog, normalizeServerUrl } from "../src/renderer/components/SetupDialog.js";
import { ApiClient } from "../src/renderer/api/client.js";

const URL_DEFAULT = "http://localhost:4000";
const LINKED = { deviceToken: "tok", guardian: { id: "g", name: "Ben" } };

// Echter ApiClient mit aufgezeichnetem fetch statt eines Client-Mocks: nur so
// prüfen die Tests, gegen welche Adresse der Dialog tatsächlich spricht.
function recordingApi(res: { ok?: boolean; status?: number; body?: unknown } = {}) {
  const calls: { url: string; body: any }[] = [];
  const fetchFn = vi.fn(async (url: any, init: any) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : undefined });
    return {
      ok: res.ok ?? true, status: res.status ?? 200,
      json: async () => res.body ?? LINKED,
    } as any;
  });
  return { api: new ApiClient(URL_DEFAULT, null, fetchFn as any), calls };
}

async function enterUrl(value: string) {
  const field = screen.getByLabelText("Server-Adresse");
  await userEvent.clear(field);
  await userEvent.type(field, value);
}

async function fillInitForm() {
  await userEvent.type(screen.getByPlaceholderText("Setup-Code aus der Konsole"), "MB-INIT-XJAM");
  await userEvent.type(screen.getByPlaceholderText("Dein Name"), "Test Person");
  await userEvent.type(screen.getByPlaceholderText("Deine E-Mail"), "test@example.com");
}

describe("normalizeServerUrl", () => {
  it("trims and drops a trailing slash", () => {
    expect(normalizeServerUrl("  https://guardian.example.com/  ")).toBe("https://guardian.example.com");
  });
  it("rejects anything that is not http(s)", () => {
    expect(normalizeServerUrl("guardian.example.com")).toBeNull();
    expect(normalizeServerUrl("ftp://x.de")).toBeNull();
    expect(normalizeServerUrl("")).toBeNull();
  });
});

describe("SetupDialog", () => {
  it("redeems a code and reports the linked guardian", async () => {
    const { api, calls } = recordingApi();
    const onLinked = vi.fn();
    render(<SetupDialog api={api} serverUrl={URL_DEFAULT} onServerUrl={vi.fn()} onLinked={onLinked} />);
    await userEvent.type(screen.getByPlaceholderText("MB-XXXX"), "MB-B9Q4");
    await userEvent.click(screen.getByRole("button", { name: "Verknüpfen" }));
    expect(calls).toEqual([{ url: `${URL_DEFAULT}/auth/redeem`, body: { code: "MB-B9Q4" } }]);
    expect(onLinked).toHaveBeenCalledWith("tok", LINKED.guardian);
  });

  it("shows an error message on a bad code", async () => {
    const { api } = recordingApi({ ok: false, status: 400, body: { error: "Code unbekannt oder bereits eingelöst." } });
    render(<SetupDialog api={api} serverUrl={URL_DEFAULT} onServerUrl={vi.fn()} onLinked={vi.fn()} />);
    await userEvent.type(screen.getByPlaceholderText("MB-XXXX"), "MB-XXXX");
    await userEvent.click(screen.getByRole("button", { name: "Verknüpfen" }));
    expect(await screen.findByText(/Code unbekannt/)).toBeTruthy();
  });

  it("redeems against the newly entered address, not the stored one", async () => {
    const { api, calls } = recordingApi();
    const onServerUrl = vi.fn(async () => {});
    render(<SetupDialog api={api} serverUrl={URL_DEFAULT} onServerUrl={onServerUrl} onLinked={vi.fn()} />);
    await enterUrl("https://guardian.example.com/");
    await userEvent.type(screen.getByPlaceholderText("MB-XXXX"), "MB-B9Q4");
    await userEvent.click(screen.getByRole("button", { name: "Verknüpfen" }));
    expect(onServerUrl).toHaveBeenCalledWith("https://guardian.example.com");
    expect(calls.map(c => c.url)).toEqual(["https://guardian.example.com/auth/redeem"]);
  });

  it("rejects an address without a scheme", async () => {
    const { api, calls } = recordingApi();
    render(<SetupDialog api={api} serverUrl={URL_DEFAULT} onServerUrl={vi.fn()} onLinked={vi.fn()} />);
    await enterUrl("guardian.example.com");
    await userEvent.type(screen.getByPlaceholderText("MB-XXXX"), "MB-B9Q4");
    await userEvent.click(screen.getByRole("button", { name: "Verknüpfen" }));
    expect(await screen.findByText(/http:\/\/ oder https:\/\//)).toBeTruthy();
    expect(calls).toEqual([]);
  });

  it("lets the founding guardian set the server address", async () => {
    const { api } = recordingApi();
    const onServerUrl = vi.fn(async () => {});
    render(<SetupDialog api={api} serverUrl={URL_DEFAULT} onServerUrl={onServerUrl} onLinked={vi.fn()} />);
    await userEvent.click(screen.getByText("Instanz initialisieren →"));
    await enterUrl("https://guardian.example.com");
    await fillInitForm();
    await userEvent.click(screen.getByRole("button", { name: "Als Gründungs-Hüter starten" }));
    expect(onServerUrl).toHaveBeenCalledWith("https://guardian.example.com");
  });

  it("initialises against the address just entered, without a second attempt", async () => {
    const { api, calls } = recordingApi();
    const onLinked = vi.fn();
    render(<SetupDialog api={api} serverUrl={URL_DEFAULT} onServerUrl={vi.fn(async () => {})} onLinked={onLinked} />);
    await userEvent.click(screen.getByText("Instanz initialisieren →"));
    await enterUrl("http://guardian.example.com:8080");
    await fillInitForm();
    await userEvent.click(screen.getByRole("button", { name: "Als Gründungs-Hüter starten" }));
    expect(calls).toEqual([{
      url: "http://guardian.example.com:8080/auth/init",
      body: { setupCode: "MB-INIT-XJAM", name: "Test Person", email: "test@example.com" },
    }]);
    expect(onLinked).toHaveBeenCalledWith("tok", LINKED.guardian);
  });

  it("names the entered address when the connection fails", async () => {
    const fetchFn = vi.fn(async () => { throw new Error("fetch failed"); });
    const api = new ApiClient(URL_DEFAULT, null, fetchFn as any);
    render(<SetupDialog api={api} serverUrl={URL_DEFAULT} onServerUrl={vi.fn(async () => {})} onLinked={vi.fn()} />);
    await userEvent.click(screen.getByText("Instanz initialisieren →"));
    await enterUrl("http://guardian.example.com:8080");
    await fillInitForm();
    await userEvent.click(screen.getByRole("button", { name: "Als Gründungs-Hüter starten" }));
    expect(await screen.findByText(/guardian\.example\.com:8080/)).toBeTruthy();
  });
});
