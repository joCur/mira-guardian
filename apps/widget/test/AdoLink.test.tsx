import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdoLink } from "../src/renderer/components/AdoLink.js";

const URL_ = "https://ado.x/MI/P/_git/R/commit/abc123?path=%2Fmemory-bank%2Fa.md";

describe("AdoLink", () => {
  it("öffnet den Commit im Browser statt im Widget-Fenster", async () => {
    const open = vi.fn();
    (window as any).guardian = { openExternal: open };
    render(<AdoLink href={URL_} />);
    await userEvent.click(screen.getByRole("button", { name: /In ADO ansehen/ }));
    expect(open).toHaveBeenCalledWith(URL_);
  });

  // Ein Widget kann neuer sein als der Server, der es bedient.
  it("zeigt nichts, wenn der Server keinen Link mitschickt", () => {
    const { container } = render(<AdoLink href={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it("übernimmt nur http und https", () => {
    const { container } = render(<AdoLink href="file:///etc/passwd" />);
    expect(container.firstChild).toBeNull();
  });
});
