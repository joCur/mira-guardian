import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SetupDialog } from "../src/renderer/components/SetupDialog.js";

describe("SetupDialog", () => {
  it("redeems a code and reports the linked guardian", async () => {
    const api = { redeem: vi.fn(async () => ({ deviceToken: "tok", guardian: { id: "g", name: "Ben" } })) } as any;
    const onLinked = vi.fn();
    render(<SetupDialog api={api} onLinked={onLinked} />);
    await userEvent.type(screen.getByPlaceholderText("MB-XXXX"), "MB-B9Q4");
    await userEvent.click(screen.getByRole("button", { name: "Verknüpfen" }));
    expect(api.redeem).toHaveBeenCalledWith("MB-B9Q4");
    expect(onLinked).toHaveBeenCalledWith("tok", { id: "g", name: "Ben" });
  });

  it("shows an error message on a bad code", async () => {
    const api = { redeem: vi.fn(async () => { throw Object.assign(new Error("Code unbekannt oder bereits eingelöst."), { status: 400 }); }) } as any;
    render(<SetupDialog api={api} onLinked={vi.fn()} />);
    await userEvent.type(screen.getByPlaceholderText("MB-XXXX"), "MB-XXXX");
    await userEvent.click(screen.getByRole("button", { name: "Verknüpfen" }));
    expect(await screen.findByText(/Code unbekannt/)).toBeTruthy();
  });
});
