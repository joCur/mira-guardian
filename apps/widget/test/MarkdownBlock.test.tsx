import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { MarkdownBlock } from "../src/renderer/components/MarkdownBlock.js";

describe("MarkdownBlock", () => {
  it("renders fenced code blocks as pre>code", () => {
    const { container } = render(<MarkdownBlock md={"```\nconst a = 1;\n```"} />);
    expect(container.querySelector("pre code")?.textContent).toContain("const a = 1;");
  });

  it("wraps tables in a horizontal scroll container", () => {
    const { container } = render(<MarkdownBlock md={"| A | B |\n| - | - |\n| 1 | 2 |"} />);
    expect(container.querySelector(".overflow-x-auto table")).toBeTruthy();
  });

  it("strips diff markers inside fenced code", () => {
    const { container } = render(<MarkdownBlock md={"```\nconst a = ⟦-1⟧ ⟦+2⟧;\n```"} />);
    const pre = container.querySelector("pre");
    expect(pre?.textContent).toContain("const a =");
    expect(pre?.textContent).not.toMatch(/[⟦⟧]/);
  });

  it("renders gfm tables", () => {
    const { container } = render(<MarkdownBlock md={"| A | B |\n| - | - |\n| 1 | 2 |"} />);
    expect(container.querySelector("table td")?.textContent).toBe("1");
  });

  it("renders h4 headings", () => {
    const { container } = render(<MarkdownBlock md={"#### Tief"} />);
    expect(container.querySelector("h4")?.textContent).toBe("Tief");
  });

  it("escapes raw html instead of rendering it", () => {
    const { container } = render(<MarkdownBlock md={"<script>alert(1)</script>"} />);
    expect(container.querySelector("script")).toBeNull();
  });

  it("does not render images", () => {
    const { container } = render(<MarkdownBlock md={"![alt](https://x.de/a.png)"} />);
    expect(container.querySelector("img")).toBeNull();
  });

  it("opens http links via guardian bridge instead of navigating", () => {
    const open = vi.fn();
    (window as any).guardian = { openExternal: open };
    const { container } = render(<MarkdownBlock md={"[link](https://x.de)"} />);
    (container.querySelector("a") as HTMLAnchorElement).click();
    expect(open).toHaveBeenCalledTimes(1);
    expect(String(open.mock.calls[0][0])).toContain("https://x.de");
  });

  it("renders ⟦+…⟧ as ins and ⟦-…⟧ as del", () => {
    const { container } = render(<MarkdownBlock md={"Zeile mit ⟦-alt⟧ ⟦+neu⟧ Ende"} />);
    expect(container.querySelector("ins")?.textContent).toBe("neu");
    expect(container.querySelector("del")?.textContent).toBe("alt");
  });

  it("keeps inline formatting inside diff marks", () => {
    const { container } = render(<MarkdownBlock md={"⟦+mit **fett** innen⟧"} />);
    const ins = container.querySelector("ins");
    expect(ins?.textContent).toBe("mit fett innen");
    expect(ins?.querySelector("strong")?.textContent).toBe("fett");
  });

  it("handles diff marks in list items", () => {
    const { container } = render(<MarkdownBlock md={"- Punkt ⟦+ergänzt⟧"} />);
    expect(container.querySelector("li ins")?.textContent).toBe("ergänzt");
  });

  it("tracks markers across nesting depths (asymmetric split)", () => {
    const { container } = render(<MarkdownBlock md={"**bold ⟦-text**⟧ ⟦+text⟧ ⟦+changed**⟧end"} />);
    expect(container.querySelector("del")?.textContent).toBe("text");
    const ins = [...container.querySelectorAll("ins")].map(n => n.textContent);
    expect(ins.join(" ")).toContain("text");
    expect(container.textContent).not.toMatch(/[⟦⟧]/);
  });

  it("shares marker state across sibling containers", () => {
    const { container } = render(<MarkdownBlock md={"**bold⟦-text**_more⟧end_"} />);
    const dels = [...container.querySelectorAll("del")].map(n => n.textContent);
    expect(dels).toContain("text");
    expect(dels).toContain("more");
    expect(container.textContent).not.toMatch(/[⟦⟧]/);
  });

  it("does not double-wrap containers inside an open marker", () => {
    const { container } = render(<MarkdownBlock md={"⟦+mit **fett** innen⟧"} />);
    expect(container.querySelectorAll("ins").length).toBe(1);
    expect(container.querySelector("ins strong")?.textContent).toBe("fett");
  });
});
