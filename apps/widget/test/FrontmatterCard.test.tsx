import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FrontmatterCard } from "../src/renderer/components/FrontmatterCard.js";
import type { FmField } from "../src/renderer/diff/frontmatter.js";

const f = (over: Partial<FmField>): FmField =>
  ({ key: "k", oldValues: null, newValues: ["v"], changed: false, ...over });

describe("FrontmatterCard", () => {
  it("renders status and category as badges, not as key-value rows", () => {
    render(<FrontmatterCard fields={[f({ key: "status", newValues: ["Active"] }), f({ key: "category", newValues: ["Review"] })]} />);
    expect(screen.getByText("Active")).toBeTruthy();
    expect(screen.getByText("Review")).toBeTruthy();
    expect(screen.queryByText("status")).toBeNull();
  });
  it("renders array values as monospace lines", () => {
    const { container } = render(<FrontmatterCard fields={[f({ key: "paths", newValues: ["a/**", "b/**"] })]} />);
    expect(container.querySelectorAll(".font-mono").length).toBeGreaterThanOrEqual(2);
  });
  it("shows old value struck through when changed", () => {
    const { container } = render(<FrontmatterCard fields={[f({ key: "status", oldValues: ["Active"], newValues: ["Superseded"], changed: true })]} />);
    expect(container.querySelector("del")?.textContent).toBe("Active");
    expect(container.querySelector("ins")?.textContent).toBe("Superseded");
  });
  it("renders nothing for empty fields", () => {
    const { container } = render(<FrontmatterCard fields={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders a dimmed dash for empty values", () => {
    render(<FrontmatterCard fields={[f({ key: "deciders", newValues: [""] })]} />);
    expect(screen.getByText("–")).toBeTruthy();
  });

  it("orders known fields consistently regardless of yaml order", () => {
    const { container } = render(<FrontmatterCard fields={[
      f({ key: "paths", newValues: ["a/**"] }),
      f({ key: "last-modified", newValues: ["2026-07-24"] }),
      f({ key: "date", newValues: ["2026-07-23"] }),
    ]} />);
    const labels = [...container.querySelectorAll(".uppercase")].map(n => n.textContent);
    expect(labels).toEqual(["date", "last-modified", "paths"]);
  });

  it("formats ISO date values in German", () => {
    render(<FrontmatterCard fields={[f({ key: "date", newValues: ["2026-07-23"] })]} />);
    expect(screen.getByText("23. Juli 2026")).toBeTruthy();
  });
});
