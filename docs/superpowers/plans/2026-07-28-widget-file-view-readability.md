# Widget-Dateiansicht: Lesbarkeit — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Dateiansicht im Änderungen-Tab rendert echtes Markdown (react-markdown), zeigt Frontmatter als Metadaten-Karte, stellt neue Dateien ohne grüne Vollflächen-Box dar und nutzt 820 px Lesebreite.

**Architecture:** Die bestehende Diff-Pipeline (`diffBlocks()` mit `⟦+…⟧`/`⟦-…⟧`-Wortmarkern) bleibt unverändert; nur der Block-Renderer wird durch `react-markdown` ersetzt. Ein eigenes remark-Plugin wandelt die Marker in `ins`/`del`-Knoten. Frontmatter wird vor dem Diffen abgetrennt und als eigene Karte gerendert.

**Tech Stack:** React 18, react-markdown, remark-gfm, yaml, unist-util-visit, Tailwind (Catppuccin-Tokens `ctp-*`), vitest + @testing-library/react, Electron IPC (contextBridge).

**Spec:** `docs/superpowers/specs/2026-07-28-widget-file-view-readability-design.md`

## Global Constraints

- Kein `rehype-raw`, kein `dangerouslySetInnerHTML` — Inhalte kommen aus ADO, HTML muss escaped bleiben.
- Catppuccin-Farbtokens (`ctp-*`) beibehalten; keine neuen Farbwerte außerhalb des Schemas.
- Bilder werden nicht gerendert (`img` → `null`).
- Nur `http(s)`-Links sind klickbar; Öffnen ausschließlich über `shell.openExternal` im Main-Prozess.
- Alle Kommandos im Worktree-Root ausführen (`pnpm …`), Tests: `pnpm vitest run apps/widget/test/<datei>`.
- Deutsch für UI-Texte und Commit-Messages.

---

### Task 1: IPC-Brücke `openExternal`

**Files:**
- Modify: `apps/widget/src/main/ipc.ts`
- Modify: `apps/widget/src/preload/index.ts`
- Modify: `apps/widget/src/types/bridge.d.ts`

**Interfaces:**
- Produces: `window.guardian.openExternal(url: string): Promise<void>` — öffnet `http(s)`-URLs im Standard-Browser, ignoriert alles andere. Wird in Task 2 von der Link-Komponente konsumiert.

Es gibt kein Test-Harness für den Main-Prozess (Repo-Muster: `ipc.ts` ist untestet); das Renderer-seitige Verhalten wird in Task 2 getestet. Deshalb hier kein TDD-Zyklus, aber Typ-Check als Verifikation.

- [ ] **Step 1: Handler in `apps/widget/src/main/ipc.ts` ergänzen**

```ts
import { ipcMain, shell } from "electron";
```

und in `registerIpc()`:

```ts
  ipcMain.handle("guardian:openExternal", (_e, url: string) => {
    if (/^https?:\/\//.test(url)) return shell.openExternal(url);
  });
```

- [ ] **Step 2: Preload in `apps/widget/src/preload/index.ts` ergänzen** (in das `exposeInMainWorld`-Objekt, nach `hideWindow`):

```ts
  openExternal: (url: string) => ipcRenderer.invoke("guardian:openExternal", url),
```

- [ ] **Step 3: Typ in `apps/widget/src/types/bridge.d.ts` ergänzen** (im `GuardianBridge`-Interface, nach `hideWindow`):

```ts
  openExternal(url: string): Promise<void>;
```

- [ ] **Step 4: Typ-Check**

Run: `pnpm --filter @guardian/widget exec tsc --noEmit -p tsconfig.json 2>&1 | tail -5` — falls das Projekt kein eigenes tsconfig-Check-Script hat und der Befehl scheitert, stattdessen: `pnpm build` (electron-vite baut main+preload). Expected: kein Typfehler.

- [ ] **Step 5: Commit**

```bash
git add apps/widget/src/main/ipc.ts apps/widget/src/preload/index.ts apps/widget/src/types/bridge.d.ts
git commit -m "feat(widget): IPC-Brücke openExternal für Links im Standard-Browser"
```

---

### Task 2: `MarkdownBlock` — echtes Markdown-Rendering

**Files:**
- Create: `apps/widget/src/renderer/components/MarkdownBlock.tsx`
- Test: `apps/widget/test/MarkdownBlock.test.tsx`

**Interfaces:**
- Consumes: `window.guardian.openExternal` (Task 1).
- Produces: `MarkdownBlock({ md }: { md: string })` — rendert einen Markdown-String mit remark-gfm und Catppuccin-Styling. Wird in Task 3 (Plugin-Integration) und Task 6 (DiffView) konsumiert.

- [ ] **Step 1: Abhängigkeiten installieren**

```bash
pnpm --filter @guardian/widget add react-markdown remark-gfm yaml unist-util-visit
```

- [ ] **Step 2: Failing Tests schreiben** — `apps/widget/test/MarkdownBlock.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { MarkdownBlock } from "../src/renderer/components/MarkdownBlock.js";

describe("MarkdownBlock", () => {
  it("renders fenced code blocks as pre>code", () => {
    const { container } = render(<MarkdownBlock md={"```\nconst a = 1;\n```"} />);
    expect(container.querySelector("pre code")?.textContent).toContain("const a = 1;");
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
});
```

- [ ] **Step 3: Tests laufen lassen — Fail erwartet**

Run: `pnpm vitest run apps/widget/test/MarkdownBlock.test.tsx`
Expected: FAIL („Failed to resolve import … MarkdownBlock“).

- [ ] **Step 4: Implementierung** — `apps/widget/src/renderer/components/MarkdownBlock.tsx`:

```tsx
import React from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

function LinkOut({ href, children }: { href?: string; children?: React.ReactNode }) {
  const ok = !!href && /^https?:\/\//.test(href);
  if (!ok) return <span className="text-ctp-subtext1">{children}</span>;
  return (
    <a href={href} onClick={e => { e.preventDefault(); window.guardian.openExternal(href!); }}
      className="text-ctp-blue underline decoration-ctp-blue/40 hover:decoration-ctp-blue cursor-pointer">
      {children}
    </a>
  );
}

const components: Components = {
  h1: p => <h1 className="text-[17px] font-semibold text-ctp-text mt-3 mb-1.5">{p.children}</h1>,
  h2: p => <h2 className="text-[15px] font-semibold text-ctp-text mt-3 mb-1.5">{p.children}</h2>,
  h3: p => <h3 className="text-[13.5px] font-semibold text-ctp-text mt-2.5 mb-1">{p.children}</h3>,
  h4: p => <h4 className="text-[12.5px] font-semibold text-ctp-subtext1 mt-2 mb-1">{p.children}</h4>,
  h5: p => <h5 className="text-[12px] font-semibold text-ctp-subtext1 mt-2 mb-1">{p.children}</h5>,
  h6: p => <h6 className="text-[12px] font-semibold text-ctp-subtext0 mt-2 mb-1">{p.children}</h6>,
  p: p => <p className="text-[13px] text-ctp-subtext1 leading-relaxed my-1.5">{p.children}</p>,
  ul: p => <ul className="list-disc pl-5 my-1.5 text-[13px] text-ctp-subtext1">{p.children}</ul>,
  ol: p => <ol className="list-decimal pl-5 my-1.5 text-[13px] text-ctp-subtext1">{p.children}</ol>,
  li: p => <li className="my-0.5 leading-relaxed">{p.children}</li>,
  strong: p => <strong className="text-ctp-text">{p.children}</strong>,
  blockquote: p => <blockquote className="border-l-[3px] border-ctp-surface1 pl-3 my-2 text-ctp-subtext0 italic">{p.children}</blockquote>,
  hr: () => <hr className="border-ctp-surface1 my-3" />,
  pre: p => <pre className="bg-ctp-mantle border border-ctp-surface0 rounded-lg p-3 overflow-x-auto my-2 text-[12px] leading-relaxed">{p.children}</pre>,
  code: p => {
    const isBlock = /language-/.test(p.className ?? "") || String(p.children).includes("\n");
    return isBlock
      ? <code className={`font-mono text-ctp-subtext1 ${p.className ?? ""}`}>{p.children}</code>
      : <code className="bg-ctp-surface0 text-ctp-subtext1 rounded px-1 text-[12px] font-mono">{p.children}</code>;
  },
  table: p => <table className="border-collapse my-2 text-[12.5px]">{p.children}</table>,
  th: p => <th className="border border-ctp-surface1 bg-ctp-surface0 px-2 py-1 text-left text-ctp-text font-semibold">{p.children}</th>,
  td: p => <td className="border border-ctp-surface0 px-2 py-1 text-ctp-subtext1">{p.children}</td>,
  a: p => <LinkOut href={p.href}>{p.children}</LinkOut>,
  img: () => null,
};

export function MarkdownBlock({ md }: { md: string }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{md}</ReactMarkdown>;
}
```

Hinweis: `String(children)` bei `code` kann bei verschachtelten Kindern ungenau sein — für die Block-Erkennung reicht `language-`-Klasse plus Zeilenumbruch-Heuristik; kein Perfektionismus nötig.

- [ ] **Step 5: Tests laufen lassen — Pass erwartet**

Run: `pnpm vitest run apps/widget/test/MarkdownBlock.test.tsx`
Expected: 6 passed.

- [ ] **Step 6: Commit**

```bash
git add apps/widget/package.json pnpm-lock.yaml apps/widget/src/renderer/components/MarkdownBlock.tsx apps/widget/test/MarkdownBlock.test.tsx
git commit -m "feat(widget): MarkdownBlock — echtes Markdown-Rendering mit remark-gfm"
```

---

### Task 3: remark-Plugin `remarkDiffMarks` — `⟦+…⟧`/`⟦-…⟧` → `ins`/`del`

**Files:**
- Create: `apps/widget/src/renderer/diff/remarkDiffMarks.ts`
- Modify: `apps/widget/src/renderer/components/MarkdownBlock.tsx`
- Test: `apps/widget/test/MarkdownBlock.test.tsx` (erweitern)

**Interfaces:**
- Produces: default-Export `remarkDiffMarks` (remark-Plugin). `MarkdownBlock` bindet es zusätzlich ein und stylt `ins`/`del` wie die bisherige Diff-Darstellung.

Die Marker kommen aus `diff.ts` (`wordDiff`) und können Markdown-Inline-Syntax umschließen (z. B. `⟦+neuer **fetter** Text⟧`). Der Parser splittet solche Stellen in mehrere Knoten — das Plugin muss offene Marker über Knoten-Grenzen hinweg tracken.

- [ ] **Step 1: Failing Tests ergänzen** — in `apps/widget/test/MarkdownBlock.test.tsx`:

```tsx
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
```

- [ ] **Step 2: Tests laufen lassen — die 3 neuen müssen fehlschlagen**

Run: `pnpm vitest run apps/widget/test/MarkdownBlock.test.tsx`
Expected: 3 failed (Marker erscheinen als Literaltext), 6 passed.

- [ ] **Step 3: Plugin implementieren** — `apps/widget/src/renderer/diff/remarkDiffMarks.ts`:

```ts
import { visit } from "unist-util-visit";

interface MdNode { type: string; value?: string; children?: MdNode[]; data?: { hName?: string } }

const MARK = /⟦([+-])|⟧/g;

function transformChildren(children: MdNode[]): MdNode[] {
  const out: MdNode[] = [];
  let wrapper: MdNode | null = null;
  const push = (n: MdNode) => { (wrapper ? wrapper.children! : out).push(n); };
  const open = (sign: string) => {
    wrapper = { type: "diffMark", data: { hName: sign === "+" ? "ins" : "del" }, children: [] };
    out.push(wrapper);
  };
  const close = () => { wrapper = null; };

  for (const child of children) {
    if (child.type !== "text") {
      // Nicht-Text-Inline-Knoten (strong, inlineCode, …) wandern komplett
      // in einen offenen Wrapper.
      push(child);
      continue;
    }
    const text = child.value ?? "";
    let last = 0; let m: RegExpExecArray | null;
    MARK.lastIndex = 0;
    while ((m = MARK.exec(text))) {
      if (m.index > last) push({ type: "text", value: text.slice(last, m.index) });
      if (m[1]) { close(); open(m[1]); } else close();
      last = MARK.lastIndex;
    }
    if (last < text.length) push({ type: "text", value: text.slice(last) });
  }
  return out;
}

export default function remarkDiffMarks() {
  return (tree: MdNode) => {
    visit(tree as never, (node: MdNode) => {
      if (!node.children) return;
      if (node.children.some(c => c.type === "text" && /⟦[+-]|⟧/.test(c.value ?? "")))
        node.children = transformChildren(node.children);
    });
  };
}
```

- [ ] **Step 4: In `MarkdownBlock.tsx` einbinden**

```tsx
import remarkDiffMarks from "../diff/remarkDiffMarks.js";
```

`remarkPlugins={[remarkGfm]}` → `remarkPlugins={[remarkGfm, remarkDiffMarks]}` und in der components-Map ergänzen:

```tsx
  ins: p => <ins className="bg-ctp-green/25 text-ctp-green no-underline rounded px-0.5">{p.children}</ins>,
  del: p => <del className="bg-ctp-red/20 text-ctp-red rounded px-0.5">{p.children}</del>,
```

Achtung: `del` wird auch von GFM-`~~strikethrough~~` erzeugt — die gemeinsame Darstellung (rot, durchgestrichen) ist gewollt und deckt beide Fälle ab.

- [ ] **Step 5: Tests laufen lassen — Pass erwartet**

Run: `pnpm vitest run apps/widget/test/MarkdownBlock.test.tsx`
Expected: 9 passed.

- [ ] **Step 6: Commit**

```bash
git add apps/widget/src/renderer/diff/remarkDiffMarks.ts apps/widget/src/renderer/components/MarkdownBlock.tsx apps/widget/test/MarkdownBlock.test.tsx
git commit -m "feat(widget): remarkDiffMarks — Diff-Wortmarker als ins/del rendern"
```

---

### Task 4: Frontmatter abtrennen, parsen, feldweise diffen

**Files:**
- Create: `apps/widget/src/renderer/diff/frontmatter.ts`
- Test: `apps/widget/test/frontmatter.test.ts`

**Interfaces:**
- Produces (konsumiert von Task 5 und 6):

```ts
export interface FmSplit { fm: string | null; body: string }
export function splitFrontmatter(md: string): FmSplit
export function parseFm(fm: string | null): Record<string, unknown> | null
export interface FmField { key: string; oldValues: string[] | null; newValues: string[] | null; changed: boolean }
export function diffFmFields(oldFm: Record<string, unknown> | null, newFm: Record<string, unknown> | null): FmField[]
```

Semantik: `splitFrontmatter` erkennt nur ein `---`-Fence in Zeile 1 mit schließendem `---`; sonst `fm: null`, `body` = ganzer Text. `parseFm` liefert `null` bei `null`-Input, kaputtem YAML oder Nicht-Objekt-Ergebnis. `diffFmFields` flacht verschachtelte Objekte mit Punktnotation ab (`metadata.type`), serialisiert Skalare mit `String()`, Arrays elementweise; Key-Reihenfolge: erst Keys aus `newFm`, dann nur-alte Keys. `changed` ist nur `true`, wenn **beide** FM existieren und sich der Wert unterscheidet (bei neuer Datei ist nichts „geändert“).

- [ ] **Step 1: Failing Tests schreiben** — `apps/widget/test/frontmatter.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { splitFrontmatter, parseFm, diffFmFields } from "../src/renderer/diff/frontmatter.js";

const FM = "---\nstatus: Active\ndate: 2026-07-23\npaths:\n  - \"apps/**\"\n---\n\n# Titel\nText";

describe("splitFrontmatter", () => {
  it("splits fence and body", () => {
    const s = splitFrontmatter(FM);
    expect(s.fm).toContain("status: Active");
    expect(s.body.trim().startsWith("# Titel")).toBe(true);
  });
  it("returns null fm when there is no fence", () => {
    expect(splitFrontmatter("# Nur Inhalt").fm).toBeNull();
  });
  it("returns null fm when the fence is unclosed", () => {
    expect(splitFrontmatter("---\nstatus: Active\n# kein Ende").fm).toBeNull();
  });
});

describe("parseFm", () => {
  it("parses yaml mapping", () => {
    expect(parseFm("status: Active")).toEqual({ status: "Active" });
  });
  it("returns null for broken yaml", () => {
    expect(parseFm("status: [unclosed")).toBeNull();
  });
  it("returns null for non-object yaml", () => {
    expect(parseFm("nur ein string")).toBeNull();
  });
});

describe("diffFmFields", () => {
  it("marks changed values with old and new", () => {
    const f = diffFmFields({ status: "Active" }, { status: "Superseded" });
    expect(f).toEqual([{ key: "status", oldValues: ["Active"], newValues: ["Superseded"], changed: true }]);
  });
  it("keeps arrays element-wise and flattens nested keys", () => {
    const f = diffFmFields(null, { paths: ["a/**", "b/**"], metadata: { type: "rule" } });
    expect(f).toEqual([
      { key: "paths", oldValues: null, newValues: ["a/**", "b/**"], changed: false },
      { key: "metadata.type", oldValues: null, newValues: ["rule"], changed: false },
    ]);
  });
  it("reports removed keys", () => {
    const f = diffFmFields({ deciders: "Jonas" }, { status: "Active" });
    expect(f).toEqual([
      { key: "status", oldValues: null, newValues: ["Active"], changed: true },
      { key: "deciders", oldValues: ["Jonas"], newValues: null, changed: true },
    ]);
  });
});
```

- [ ] **Step 2: Tests laufen lassen — Fail erwartet**

Run: `pnpm vitest run apps/widget/test/frontmatter.test.ts`
Expected: FAIL („Failed to resolve import … frontmatter“).

- [ ] **Step 3: Implementierung** — `apps/widget/src/renderer/diff/frontmatter.ts`:

```ts
import { parse } from "yaml";

export interface FmSplit { fm: string | null; body: string }
export interface FmField { key: string; oldValues: string[] | null; newValues: string[] | null; changed: boolean }

export function splitFrontmatter(md: string): FmSplit {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { fm: null, body: md };
  return { fm: m[1], body: md.slice(m[0].length) };
}

export function parseFm(fm: string | null): Record<string, unknown> | null {
  if (!fm) return null;
  try {
    const v = parse(fm);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch { return null; }
}

function flatten(obj: Record<string, unknown>, prefix = ""): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (Array.isArray(v)) out.set(key, v.map(x => String(x)));
    else if (v && typeof v === "object") for (const [k2, v2] of flatten(v as Record<string, unknown>, key)) out.set(k2, v2);
    else out.set(key, [String(v)]);
  }
  return out;
}

export function diffFmFields(oldFm: Record<string, unknown> | null, newFm: Record<string, unknown> | null): FmField[] {
  const o = oldFm ? flatten(oldFm) : new Map<string, string[]>();
  const n = newFm ? flatten(newFm) : new Map<string, string[]>();
  const both = oldFm !== null && newFm !== null;
  const fields: FmField[] = [];
  for (const [key, newValues] of n) {
    const oldValues = o.get(key) ?? null;
    const changed = both && JSON.stringify(oldValues) !== JSON.stringify(newValues);
    fields.push({ key, oldValues: changed ? oldValues : null, newValues, changed });
  }
  for (const [key, oldValues] of o)
    if (!n.has(key)) fields.push({ key, oldValues, newValues: null, changed: both });
  return fields;
}
```

- [ ] **Step 4: Tests laufen lassen — Pass erwartet**

Run: `pnpm vitest run apps/widget/test/frontmatter.test.ts`
Expected: 9 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/widget/src/renderer/diff/frontmatter.ts apps/widget/test/frontmatter.test.ts
git commit -m "feat(widget): Frontmatter abtrennen, parsen und feldweise diffen"
```

---

### Task 5: `FrontmatterCard` — Metadaten-Karte

**Files:**
- Create: `apps/widget/src/renderer/components/FrontmatterCard.tsx`
- Test: `apps/widget/test/FrontmatterCard.test.tsx`

**Interfaces:**
- Consumes: `FmField` aus Task 4.
- Produces: `FrontmatterCard({ fields }: { fields: FmField[] })` — konsumiert von Task 6.

Darstellung: `status` und `category` als farbige Badges in einer Kopfzeile (status: Active/Resolved → grün, Declined/Deprecated → rot, Superseded → gelb, sonst neutral; category immer blau); `description` — falls vorhanden — als prominenter Text; Arrays als Monospace-Zeilen; alle übrigen Felder als Key-Value-Zeilen. Geänderte Werte: alt rot durchgestrichen, neu grün.

- [ ] **Step 1: Failing Tests schreiben** — `apps/widget/test/FrontmatterCard.test.tsx`:

```tsx
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
});
```

- [ ] **Step 2: Tests laufen lassen — Fail erwartet**

Run: `pnpm vitest run apps/widget/test/FrontmatterCard.test.tsx`
Expected: FAIL („Failed to resolve import … FrontmatterCard“).

- [ ] **Step 3: Implementierung** — `apps/widget/src/renderer/components/FrontmatterCard.tsx`:

```tsx
import React from "react";
import type { FmField } from "../diff/frontmatter.js";

const STATUS_COLORS: Record<string, string> = {
  active: "text-ctp-green bg-ctp-green/15 border-ctp-green/40",
  resolved: "text-ctp-green bg-ctp-green/15 border-ctp-green/40",
  declined: "text-ctp-red bg-ctp-red/15 border-ctp-red/40",
  deprecated: "text-ctp-red bg-ctp-red/15 border-ctp-red/40",
};
const NEUTRAL = "text-ctp-subtext1 bg-ctp-surface0 border-ctp-surface1";
const CATEGORY = "text-ctp-blue bg-ctp-blue/15 border-ctp-blue/40";

function badgeColor(key: string, value: string): string {
  if (key === "category") return CATEGORY;
  const v = value.toLowerCase();
  if (STATUS_COLORS[v]) return STATUS_COLORS[v];
  if (v.startsWith("superseded")) return "text-ctp-yellow bg-ctp-yellow/15 border-ctp-yellow/40";
  return NEUTRAL;
}

function Value({ field }: { field: FmField }) {
  return (
    <>
      {field.changed && field.oldValues && (
        <del className="text-ctp-red mr-1.5">{field.oldValues.join(", ")}</del>
      )}
      {field.newValues && (
        field.changed
          ? <ins className="text-ctp-green no-underline">{field.newValues.join(", ")}</ins>
          : <span>{field.newValues.join(", ")}</span>
      )}
      {!field.newValues && <span className="italic text-ctp-overlay0">entfernt</span>}
    </>
  );
}

export function FrontmatterCard({ fields }: { fields: FmField[] }) {
  if (fields.length === 0) return null;
  const badges = fields.filter(x => (x.key === "status" || x.key === "category") && !x.changed && x.newValues?.length === 1);
  const description = fields.find(x => x.key === "description" && !x.changed);
  const rest = fields.filter(x => !badges.includes(x) && x !== description);
  return (
    <div className="bg-ctp-mantle border border-ctp-surface0 rounded-lg px-3.5 py-2.5 mb-4">
      {badges.length > 0 && (
        <div className="flex gap-1.5 flex-wrap mb-1.5">
          {badges.map(b => (
            <span key={b.key} className={`text-[10px] font-semibold tracking-wide border rounded-full px-2 py-[2px] ${badgeColor(b.key, b.newValues![0])}`}>
              {b.newValues![0]}
            </span>
          ))}
        </div>
      )}
      {description?.newValues && <div className="text-[12.5px] text-ctp-text leading-snug mb-1.5">{description.newValues.join(", ")}</div>}
      {rest.map(field => (
        <div key={field.key} className="flex gap-2 text-[11.5px] leading-relaxed">
          <span className="text-ctp-subtext0 shrink-0 min-w-[92px]">{field.key}</span>
          {field.newValues && field.newValues.length > 1 && !field.changed
            ? <span className="min-w-0">{field.newValues.map((v, i) => <span key={i} className="font-mono text-ctp-subtext1 block truncate">{v}</span>)}</span>
            : <span className="text-ctp-subtext1 min-w-0"><Value field={field} /></span>}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Tests laufen lassen — Pass erwartet**

Run: `pnpm vitest run apps/widget/test/FrontmatterCard.test.tsx`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/widget/src/renderer/components/FrontmatterCard.tsx apps/widget/test/FrontmatterCard.test.tsx
git commit -m "feat(widget): FrontmatterCard — Metadaten-Karte mit Badges und Feld-Diff"
```

---

### Task 6: `DiffView` umbauen — Karte + MarkdownBlock, neue Dateien ohne grüne Box

**Files:**
- Modify: `apps/widget/src/renderer/components/DiffView.tsx` (vollständig ersetzen)
- Test: `apps/widget/test/DiffView.test.tsx` (anpassen/erweitern)

**Interfaces:**
- Consumes: `MarkdownBlock` (Task 2/3), `splitFrontmatter`/`parseFm`/`diffFmFields` (Task 4), `FrontmatterCard` (Task 5), `diffBlocks` (unverändert aus `../diff/diff.js`).
- Produces: `DiffView({ change }: { change: ChangeWithVotes })` — Signatur unverändert, `ChangesTab` braucht keine Anpassung.

- [ ] **Step 1: Tests anpassen** — `apps/widget/test/DiffView.test.tsx` vollständig ersetzen:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DiffView } from "../src/renderer/components/DiffView.js";
import type { ChangeWithVotes } from "@guardian/shared";

function change(over: Partial<ChangeWithVotes>): ChangeWithVotes {
  return { id: "c", repo: "r", branch: "main", filePath: "memory-bank/a.md", changeKind: "modify",
    commitId: "x", commitShort: "x", authorName: "A", authorEmail: "a@x.de", committedAt: "t",
    summary: "s", oldMd: "Node 20 base", newMd: "Node 22 base", cycleId: "cy", firstSeenAt: "t",
    votes: [], adoLink: "http://x", ...over };
}

const NEW_MD = "---\nstatus: Active\ncategory: Review\n---\n\n# Titel\n\nInhalt der neuen Datei";

describe("DiffView", () => {
  it("renders new files as a normal document without the green box", () => {
    const { container } = render(<DiffView change={change({ oldMd: null, newMd: NEW_MD, changeKind: "add" })} />);
    expect(screen.queryByText(/gesamter Inhalt ist neu/)).toBeNull();
    expect(container.querySelector(".bg-ctp-green\\/10")).toBeNull();
    expect(container.querySelector("h1")?.textContent).toBe("Titel");
  });
  it("shows the frontmatter card instead of raw frontmatter", () => {
    render(<DiffView change={change({ oldMd: null, newMd: NEW_MD, changeKind: "add" })} />);
    expect(screen.getByText("Active")).toBeTruthy();
    expect(screen.queryByText(/status:/)).toBeNull();
  });
  it("renders inserted and deleted words for modified files", () => {
    const { container } = render(<DiffView change={change({})} />);
    expect(container.querySelector("ins")).toBeTruthy();
    expect(container.querySelector("del")).toBeTruthy();
  });
  it("shows changed frontmatter fields as old/new in the card", () => {
    const { container } = render(<DiffView change={change({
      oldMd: "---\nstatus: Active\n---\n\nText", newMd: "---\nstatus: Deprecated\n---\n\nText" })} />);
    expect(container.querySelector("del")?.textContent).toBe("Active");
    expect(container.querySelector("ins")?.textContent).toBe("Deprecated");
  });
  it("falls back to a code block for broken frontmatter", () => {
    const { container } = render(<DiffView change={change({ oldMd: null, newMd: "---\nstatus: [kaputt\n---\n\nText" })} />);
    expect(container.querySelector("pre code")?.textContent).toContain("status: [kaputt");
  });
});
```

- [ ] **Step 2: Tests laufen lassen — die neuen Erwartungen müssen fehlschlagen**

Run: `pnpm vitest run apps/widget/test/DiffView.test.tsx`
Expected: mindestens die Tests 1, 2, 4, 5 FAIL (grüne Box existiert noch, Karte existiert nicht).

- [ ] **Step 3: Implementierung** — `apps/widget/src/renderer/components/DiffView.tsx` vollständig ersetzen:

```tsx
import React from "react";
import type { ChangeWithVotes } from "@guardian/shared";
import { diffBlocks, type DiffBlock } from "../diff/diff.js";
import { splitFrontmatter, parseFm, diffFmFields } from "../diff/frontmatter.js";
import { FrontmatterCard } from "./FrontmatterCard.js";
import { MarkdownBlock } from "./MarkdownBlock.js";

function wrap(block: DiffBlock, i: number) {
  const inner = <MarkdownBlock md={block.md} />;
  if (block.kind === "add") return <div key={i} className="bg-ctp-green/15 border-l-[3px] border-ctp-green rounded-r-lg px-3 py-0.5 my-2">{inner}</div>;
  if (block.kind === "del") return <div key={i} className="bg-ctp-red/15 border-l-[3px] border-ctp-red rounded-r-lg px-3 py-0.5 my-2 line-through opacity-80">{inner}</div>;
  if (block.kind === "changed") return <div key={i} className="border-l-[3px] border-ctp-surface1 px-3 my-2">{inner}</div>;
  return <div key={i} className="my-2">{inner}</div>;
}

export function DiffView({ change }: { change: ChangeWithVotes }) {
  const isNew = !change.oldMd?.trim();
  const oldSplit = splitFrontmatter(change.oldMd ?? "");
  const newSplit = splitFrontmatter(change.newMd ?? "");
  const oldFm = parseFm(oldSplit.fm);
  const newFm = parseFm(newSplit.fm);
  const fields = diffFmFields(isNew ? null : oldFm, newFm);
  const fmBroken = newSplit.fm !== null && newFm === null;

  const blocks: DiffBlock[] = isNew
    ? newSplit.body.trim().split(/\n{2,}/).filter(Boolean).map(md => ({ kind: "same" as const, md }))
    : diffBlocks(oldSplit.body, newSplit.body);

  return (
    <div>
      <FrontmatterCard fields={fields} />
      {fmBroken && <MarkdownBlock md={"```yaml\n" + newSplit.fm + "\n```"} />}
      {blocks.map(wrap)}
    </div>
  );
}
```

Hinweis: Bei gelöschten Dateien (`newMd === null`) ist `newSplit.fm === null` → keine Karte aus altem FM nötig; `diffFmFields(oldFm, null)`-Felder erscheinen als „entfernt“. Das ist akzeptables Verhalten und braucht keinen Sonderpfad.

- [ ] **Step 4: Tests laufen lassen — Pass erwartet**

Run: `pnpm vitest run apps/widget/test/DiffView.test.tsx`
Expected: 5 passed.

- [ ] **Step 5: Volle Widget-Suite**

Run: `pnpm vitest run apps/widget`
Expected: alle Dateien grün — insbesondere `ChangesTab.test.tsx` und `smoke.test.tsx`, die `DiffView` indirekt rendern. Schlägt dort etwas fehl, die Erwartungen an die neue Darstellung anpassen (nicht die Implementierung verbiegen), z. B. wenn ein Test das alte „Neue Datei“-Inline-Badge sucht.

- [ ] **Step 6: Commit**

```bash
git add apps/widget/src/renderer/components/DiffView.tsx apps/widget/test/DiffView.test.tsx
git commit -m "feat(widget): DiffView mit MarkdownBlock und Frontmatter-Karte, neue Dateien ohne grüne Box"
```

---

### Task 7: Lesebreite 820 px + Gesamtsuite

**Files:**
- Modify: `apps/widget/src/renderer/components/tabs/ChangesTab.tsx:99,101`

**Interfaces:** keine neuen.

- [ ] **Step 1: Breite anpassen**

In `apps/widget/src/renderer/components/tabs/ChangesTab.tsx` beide Vorkommen von `max-w-[660px]` durch `max-w-[820px]` ersetzen (Zeile 99: Dateiinhalt, Zeile 101: Kommentare).

- [ ] **Step 2: Volle Suite im Worktree**

Run: `pnpm --filter @guardian/shared build && pnpm test`
Expected: alle Tests grün (Server + Widget; die shared-lib muss im frischen Worktree einmal gebaut sein).

- [ ] **Step 3: Commit**

```bash
git add apps/widget/src/renderer/components/tabs/ChangesTab.tsx
git commit -m "style(widget): Lesebreite der Dateiansicht auf 820px erhöht"
```

---

### Abschluss (führt die Session selbst aus, nicht der Task-Agent)

- [ ] Merge nach `main` (Fast-Forward), Worktree entfernen.
- [ ] `pnpm install && pnpm build` im Haupt-Checkout, Server/Widget neu starten.
- [ ] Verifikation in der echten Electron-App (Playwright `_electron`, Screenshot der Dateiansicht mit einem echten Record) — Achtung Single-Instance-Lock: vorher die laufende Widget-Instanz stoppen, danach wieder starten.
