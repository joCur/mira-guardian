import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Toast } from "../src/renderer/components/Toast.js";

const data = {
  changeId: "c1", filePath: "docs/decisions/adr-014-caching-strategie.md",
  summary: "Neue Decision: Caching-Strategie", authorName: "Anna Roth", changeKind: "add",
};

describe("Toast", () => {
  it("shows file, type badge and NEU marker for added files", () => {
    render(<Toast data={data} onView={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.getByText("Memory-Bank geändert")).toBeTruthy();
    expect(screen.getByText("adr-014-caching-strategie.md")).toBeTruthy();
    expect(screen.getByText("Decision")).toBeTruthy();
    expect(screen.getByText("NEU")).toBeTruthy();
  });

  it("fires onView for Ansehen and onDismiss for Später and ✕", async () => {
    const onView = vi.fn(), onDismiss = vi.fn();
    render(<Toast data={{ ...data, changeKind: "modify" }} onView={onView} onDismiss={onDismiss} />);
    expect(screen.queryByText("NEU")).toBeNull();
    await userEvent.click(screen.getByText("Ansehen"));
    expect(onView).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByText("Später"));
    await userEvent.click(screen.getByLabelText("Schließen"));
    expect(onDismiss).toHaveBeenCalledTimes(2);
  });
});
