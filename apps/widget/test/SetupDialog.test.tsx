import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SetupDialog, normalizeServerUrl } from "../src/renderer/components/SetupDialog.js";

const URL_DEFAULT = "http://localhost:4000";

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
    const api = { redeem: vi.fn(async () => ({ deviceToken: "tok", guardian: { id: "g", name: "Ben" } })) } as any;
    const onLinked = vi.fn();
    render(<SetupDialog api={api} serverUrl={URL_DEFAULT} onServerUrl={vi.fn()} onLinked={onLinked} />);
    await userEvent.type(screen.getByPlaceholderText("MB-XXXX"), "MB-B9Q4");
    await userEvent.click(screen.getByRole("button", { name: "Verknüpfen" }));
    expect(api.redeem).toHaveBeenCalledWith("MB-B9Q4");
    expect(onLinked).toHaveBeenCalledWith("tok", { id: "g", name: "Ben" });
  });

  it("shows an error message on a bad code", async () => {
    const api = { redeem: vi.fn(async () => { throw Object.assign(new Error("Code unbekannt oder bereits eingelöst."), { status: 400 }); }) } as any;
    render(<SetupDialog api={api} serverUrl={URL_DEFAULT} onServerUrl={vi.fn()} onLinked={vi.fn()} />);
    await userEvent.type(screen.getByPlaceholderText("MB-XXXX"), "MB-XXXX");
    await userEvent.click(screen.getByRole("button", { name: "Verknüpfen" }));
    expect(await screen.findByText(/Code unbekannt/)).toBeTruthy();
  });

  it("saves a changed server address instead of connecting to the old one", async () => {
    const api = { redeem: vi.fn() } as any;
    const onServerUrl = vi.fn(async () => {});
    render(<SetupDialog api={api} serverUrl={URL_DEFAULT} onServerUrl={onServerUrl} onLinked={vi.fn()} />);
    const field = screen.getByLabelText("Server-Adresse");
    await userEvent.clear(field);
    await userEvent.type(field, "https://guardian.example.com/");
    await userEvent.type(screen.getByPlaceholderText("MB-XXXX"), "MB-B9Q4");
    await userEvent.click(screen.getByRole("button", { name: "Verknüpfen" }));
    expect(onServerUrl).toHaveBeenCalledWith("https://guardian.example.com");
    expect(api.redeem).not.toHaveBeenCalled();
  });

  it("rejects an address without a scheme", async () => {
    const api = { redeem: vi.fn() } as any;
    render(<SetupDialog api={api} serverUrl={URL_DEFAULT} onServerUrl={vi.fn()} onLinked={vi.fn()} />);
    const field = screen.getByLabelText("Server-Adresse");
    await userEvent.clear(field);
    await userEvent.type(field, "guardian.example.com");
    await userEvent.type(screen.getByPlaceholderText("MB-XXXX"), "MB-B9Q4");
    await userEvent.click(screen.getByRole("button", { name: "Verknüpfen" }));
    expect(await screen.findByText(/http:\/\/ oder https:\/\//)).toBeTruthy();
    expect(api.redeem).not.toHaveBeenCalled();
  });
});
