import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MainWindow } from "../src/renderer/components/MainWindow.js";

function setPlatform(value: string) {
  Object.defineProperty(window.navigator, "platform", { value, configurable: true });
}

describe("MainWindow title bar", () => {
  it("shows the custom close button on non-mac platforms", async () => {
    setPlatform("Win32");
    const onClose = vi.fn();
    render(<MainWindow tab="changes" onTab={vi.fn()} onClose={onClose}>x</MainWindow>);
    await userEvent.click(screen.getByText("✕"));
    expect(onClose).toHaveBeenCalled();
  });

  it("hides the custom close button on macOS (native traffic lights instead)", () => {
    setPlatform("MacIntel");
    render(<MainWindow tab="changes" onTab={vi.fn()} onClose={vi.fn()}>x</MainWindow>);
    expect(screen.queryByText("✕")).toBeNull();
  });
});
