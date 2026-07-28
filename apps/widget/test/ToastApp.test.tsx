import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastApp } from "../src/renderer/components/Toast.js";
import type { ToastData } from "../src/types/bridge.js";

let pushToast: (d: ToastData) => void;
const toastAction = vi.fn(async () => {});
const toastResize = vi.fn(async () => {});

(globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };

beforeEach(() => {
  toastAction.mockClear(); toastResize.mockClear();
  (globalThis as any).window.guardian = {
    onToastData: (cb: (d: ToastData) => void) => { pushToast = cb; return () => {}; },
    toastAction, toastResize,
  };
});

const data = (id: string): ToastData => ({
  changeId: id, filePath: `docs/decisions/${id}.md`, summary: `Summary ${id}`,
  authorName: "Anna Roth", changeKind: "add",
});

describe("ToastApp stacking", () => {
  it("stacks multiple notifications and removes them individually", async () => {
    render(<ToastApp />);
    act(() => { pushToast(data("c1")); });
    act(() => { pushToast(data("c2")); });
    expect(screen.getAllByText("Memory-Bank geändert")).toHaveLength(2);

    // Eine Karte schließen → die andere bleibt, Fenster bleibt offen
    await userEvent.click(screen.getAllByLabelText("Schließen")[0]);
    expect(screen.getAllByText("Memory-Bank geändert")).toHaveLength(1);
    expect(toastAction).not.toHaveBeenCalledWith("dismiss", null);

    // Letzte Karte schließen → Fenster wird versteckt
    await userEvent.click(screen.getByLabelText("Schließen"));
    expect(screen.queryByText("Memory-Bank geändert")).toBeNull();
    expect(toastAction).toHaveBeenCalledWith("dismiss", null);
  });

  it("view removes only the clicked card and keeps the rest", async () => {
    render(<ToastApp />);
    act(() => { pushToast(data("c1")); });
    act(() => { pushToast(data("c2")); });
    await userEvent.click(screen.getAllByText("Ansehen")[0]);
    expect(toastAction).toHaveBeenCalledWith("view", expect.any(String));
    expect(screen.getAllByText("Memory-Bank geändert")).toHaveLength(1);
    expect(toastAction).not.toHaveBeenCalledWith("dismiss", null);
  });

  it("replaces a re-notified change instead of duplicating it", () => {
    render(<ToastApp />);
    act(() => { pushToast(data("c1")); });
    act(() => { pushToast({ ...data("c1"), summary: "aktualisiert" }); });
    expect(screen.getAllByText("Memory-Bank geändert")).toHaveLength(1);
    expect(screen.getByText(/aktualisiert/)).toBeTruthy();
  });
});
