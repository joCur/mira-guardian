# Guardian Widget Implementation Plan (Electron Desktop App)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Build the `guardian-server` plan first** — this app consumes its REST + WebSocket API.

**Goal:** Build the `guardian-widget`: an Electron tray app (React + Tailwind + Catppuccin) that notifies Hüter of Memory-Bank changes, renders the markdown diff, and drives the per-guardian voting workflow against `guardian-server`.

**Architecture:** `electron-vite` project under `apps/widget` with three layers — `main` (Electron: tray, bottom-right window, single instance, device-token persistence), `preload` (typed IPC bridge), `renderer` (React UI). Business logic lives in pure, unit-tested renderer modules: a deterministic markdown **diff engine**, a typed **API/WebSocket client**, a **Zustand store**, and a **theme mapper**. Screens reproduce the Claude design 1:1 in structure/copy; colours come from Catppuccin (Mocha) via Tailwind.

**Tech Stack:** Electron 31+, electron-vite, React 18, TypeScript 5 (strict), Tailwind CSS 3, `@catppuccin/tailwindcss` (flavor Mocha), Zustand 4, Vitest + @testing-library/react + jsdom, electron-store 10 (device token). Shared types from `@guardian/shared` (workspace).

## Global Constraints

- Monorepo package: `@guardian/widget` under `apps/widget`. Node 22, ESM, TypeScript `strict`.
- **The Claude design is the binding form/function reference** (layout, structure, German copy, interaction). Reproduce it faithfully.
- **Colours come from Catppuccin (Mocha) via Tailwind — never the mockup's raw hex.** Use the `theme.ts` mapper (Task 2) for every semantic colour.
- German UI copy verbatim: `Memory-Bank Hüter`, `Angemeldet als …`, `wechseln`, `Akzeptiert`, `Klärungsbedarf`, `Abgelehnt`, `ausstehend`, `Meeting-Übersicht`, `Verlauf`, `Hüter`, `Gerät verknüpfen`, `Instanz initialisieren`, `Zugangscode erzeugen`, `Neu bewerten`, `von allen Hütern bestätigt`, `deine Bestätigung fehlt`.
- Vote statuses: `offen`, `akzeptiert`, `klaerung`, `abgelehnt` (from `@guardian/shared`).
- **Comment mandatory (≥5 trimmed chars) for `klaerung`/`abgelehnt`; `akzeptiert` sends no comment.** The button for saving a comment vote is disabled until valid.
- Notifications v1 = **in-app toast + tray badge only** (no OS notifications, no email).
- Device token + server URL persist locally (electron-store); never hard-coded.
- Test runner: **Vitest**. Logic modules are TDD; UI components get behaviour tests (`jsdom`).

---

## File Structure

```
apps/widget/
  package.json                 # @guardian/widget
  tsconfig.json
  electron.vite.config.ts
  tailwind.config.js
  postcss.config.js
  vitest.config.ts
  index.html
  src/
    main/
      index.ts                 # Electron main: tray, window, single instance
      tokenStore.ts            # electron-store wrapper (token + serverUrl)
      ipc.ts                   # IPC handlers (get/set token, position)
    preload/
      index.ts                 # contextBridge -> window.guardian
    renderer/
      main.tsx                 # React entry
      index.css                # tailwind + @layer
      theme.ts                 # semantic -> catppuccin class mapper
      diff/
        diff.ts                # pure LCS diff engine
      api/
        client.ts              # REST client (bearer token)
        ws.ts                  # WebSocket subscription
      store.ts                 # Zustand store
      components/
        DiffView.tsx
        SetupDialog.tsx
        TrayWidget.tsx
        Toast.tsx
        MainWindow.tsx
        tabs/
          ChangesTab.tsx
          MeetingTab.tsx
          HistoryTab.tsx
          GuardiansTab.tsx
    types/
      bridge.d.ts              # window.guardian typing
  test/
    theme.test.ts
    diff.test.ts
    DiffView.test.tsx
    client.test.ts
    ws.test.ts
    store.test.ts
    SetupDialog.test.tsx
    TrayWidget.test.tsx
    ChangesTab.test.tsx
    MeetingTab.test.tsx
```

---

### Task 1: Widget scaffold (electron-vite + React + Tailwind + Catppuccin)

**Files:**
- Create: `apps/widget/package.json`, `tsconfig.json`, `electron.vite.config.ts`, `vitest.config.ts`, `tailwind.config.js`, `postcss.config.js`, `index.html`
- Create: `src/renderer/main.tsx`, `src/renderer/index.css`
- Test: `apps/widget/test/smoke.test.tsx`

**Interfaces:**
- Consumes: `@guardian/shared`.
- Produces: a buildable Electron app + a working Vitest/jsdom setup other tasks rely on.

- [ ] **Step 1: Manifests + config**

`apps/widget/package.json`:
```json
{
  "name": "@guardian/widget",
  "version": "0.1.0",
  "type": "module",
  "main": "out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "test": "vitest run"
  },
  "dependencies": {
    "@guardian/shared": "workspace:*",
    "electron-store": "^10.0.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "react-markdown": "^9.0.0",
    "zustand": "^4.5.0"
  },
  "devDependencies": {
    "@catppuccin/tailwindcss": "^0.1.6",
    "@testing-library/react": "^16.0.0",
    "@testing-library/user-event": "^14.5.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.0",
    "electron": "^31.0.0",
    "electron-vite": "^2.3.0",
    "jsdom": "^24.0.0",
    "tailwindcss": "^3.4.0"
  }
}
```

`apps/widget/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: { environment: "jsdom", globals: true, include: ["test/**/*.test.{ts,tsx}"] },
});
```

`apps/widget/tailwind.config.js`:
```js
import catppuccin from "@catppuccin/tailwindcss";

export default {
  content: ["./index.html", "./src/renderer/**/*.{ts,tsx}"],
  theme: { extend: {} },
  plugins: [catppuccin({ defaultFlavour: "mocha" })],
};
```

`apps/widget/postcss.config.js`:
```js
export default { plugins: { tailwindcss: {}, autoprefixer: {} } };
```

`apps/widget/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "jsx": "react-jsx", "types": ["node"], "lib": ["ES2022", "DOM", "DOM.Iterable"] },
  "include": ["src", "test"]
}
```

`apps/widget/electron.vite.config.ts`:
```ts
import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  main: { build: { outDir: "out/main" } },
  preload: { build: { outDir: "out/preload" } },
  renderer: { plugins: [react()], build: { outDir: "out/renderer" } },
});
```

`apps/widget/index.html`:
```html
<!doctype html>
<html class="ctp-mocha">
  <head><meta charset="utf-8" /><title>Memory-Bank Hüter</title></head>
  <body class="bg-ctp-base text-ctp-text">
    <div id="root"></div>
    <script type="module" src="/src/renderer/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Renderer entry + CSS**

`apps/widget/src/renderer/index.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

`apps/widget/src/renderer/main.tsx`:
```tsx
import React from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

export function App() {
  return <div className="p-4 text-ctp-text">Memory-Bank Hüter</div>;
}

const el = document.getElementById("root");
if (el) createRoot(el).render(<App />);
```

- [ ] **Step 3: Write the failing smoke test**

`apps/widget/test/smoke.test.tsx`:
```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { App } from "../src/renderer/main.js";

describe("App", () => {
  it("renders the app name", () => {
    render(<App />);
    expect(screen.getByText("Memory-Bank Hüter")).toBeTruthy();
  });
});
```

- [ ] **Step 4: Run test to verify it fails, then passes after install**

Run: `pnpm install && pnpm --filter @guardian/shared build && pnpm --filter @guardian/widget test`
Expected: initially FAIL (deps/module), PASS after install (1 test).

- [ ] **Step 5: Commit**

```bash
git add apps/widget
git commit -m "feat(widget): electron-vite + react + tailwind + catppuccin scaffold"
```

---

### Task 2: Theme mapper (semantic → Catppuccin)

**Files:**
- Create: `apps/widget/src/renderer/theme.ts`
- Test: `apps/widget/test/theme.test.ts`

**Interfaces:**
- Consumes: `VoteStatus` from `@guardian/shared`.
- Produces:
  - `statusText(status: VoteStatus): string` — Catppuccin text class (`text-ctp-green` etc.).
  - `statusDot(status: VoteStatus): string` — background class for the guardian dot; `offen` → `bg-ctp-surface2`.
  - `typeBadge(label: string): { text: string; bg: string }` — Decision→blue, Learning→mauve, Kontext→teal, Sonstige→overlay.

- [ ] **Step 1: Write the failing test**

`apps/widget/test/theme.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { statusText, statusDot, typeBadge } from "../src/renderer/theme.js";

describe("theme mapper", () => {
  it("maps vote status to catppuccin text classes", () => {
    expect(statusText("akzeptiert")).toBe("text-ctp-green");
    expect(statusText("klaerung")).toBe("text-ctp-yellow");
    expect(statusText("abgelehnt")).toBe("text-ctp-red");
    expect(statusText("offen")).toBe("text-ctp-subtext0");
  });
  it("maps pending dot to a muted surface", () => {
    expect(statusDot("offen")).toBe("bg-ctp-surface2");
    expect(statusDot("akzeptiert")).toBe("bg-ctp-green");
  });
  it("maps file type labels to badge colours", () => {
    expect(typeBadge("Decision").text).toBe("text-ctp-blue");
    expect(typeBadge("Learning").text).toBe("text-ctp-mauve");
    expect(typeBadge("Kontext").text).toBe("text-ctp-teal");
    expect(typeBadge("Sonstige").text).toBe("text-ctp-overlay1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @guardian/widget test theme`
Expected: FAIL — `theme.js` not found.

- [ ] **Step 3: Implement theme.ts**

`apps/widget/src/renderer/theme.ts`:
```ts
import type { VoteStatus } from "@guardian/shared";

const TEXT: Record<VoteStatus, string> = {
  akzeptiert: "text-ctp-green",
  klaerung: "text-ctp-yellow",
  abgelehnt: "text-ctp-red",
  offen: "text-ctp-subtext0",
};
const DOT: Record<VoteStatus, string> = {
  akzeptiert: "bg-ctp-green",
  klaerung: "bg-ctp-yellow",
  abgelehnt: "bg-ctp-red",
  offen: "bg-ctp-surface2",
};
export function statusText(s: VoteStatus) { return TEXT[s]; }
export function statusDot(s: VoteStatus) { return DOT[s]; }

const TYPE: Record<string, { text: string; bg: string }> = {
  Decision: { text: "text-ctp-blue", bg: "bg-ctp-blue/15" },
  Learning: { text: "text-ctp-mauve", bg: "bg-ctp-mauve/15" },
  Kontext: { text: "text-ctp-teal", bg: "bg-ctp-teal/15" },
};
export function typeBadge(label: string) {
  return TYPE[label] ?? { text: "text-ctp-overlay1", bg: "bg-ctp-surface1" };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @guardian/widget test theme`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/widget/src/renderer/theme.ts apps/widget/test/theme.test.ts
git commit -m "feat(widget): semantic-to-catppuccin theme mapper"
```

---

### Task 3: Diff engine (pure, deterministic)

**Files:**
- Create: `apps/widget/src/renderer/diff/diff.ts`
- Test: `apps/widget/test/diff.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type DiffBlock = { kind: "same" | "add" | "del" | "changed"; md: string }`
  - `diffBlocks(oldMd: string, newMd: string): DiffBlock[]` — paragraph-level LCS; `changed` blocks carry inline `⟦+added⟧` / `⟦-removed⟧` markers.
  - `type InlineToken = { kind: "text" | "ins" | "del" | "code" | "strong"; value: string }`
  - `tokenizeInline(text: string): InlineToken[]` — parses the markers plus `**bold**` and `` `code` ``.

- [ ] **Step 1: Write the failing test**

`apps/widget/test/diff.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { diffBlocks, tokenizeInline } from "../src/renderer/diff/diff.js";

describe("diffBlocks", () => {
  it("marks an added paragraph", () => {
    const b = diffBlocks("# Titel", "# Titel\n\nNeuer Absatz.");
    expect(b).toContainEqual({ kind: "add", md: "Neuer Absatz." });
    expect(b[0]).toEqual({ kind: "same", md: "# Titel" });
  });
  it("marks a deleted paragraph", () => {
    const b = diffBlocks("# Titel\n\nAlt.", "# Titel");
    expect(b).toContainEqual({ kind: "del", md: "Alt." });
  });
  it("produces inline word markers for a changed paragraph", () => {
    const b = diffBlocks("Node 20 base", "Node 22 base");
    const changed = b.find(x => x.kind === "changed")!;
    expect(changed.md).toContain("⟦-20⟧");
    expect(changed.md).toContain("⟦+22⟧");
  });
});

describe("tokenizeInline", () => {
  it("splits ins/del/code/strong from text", () => {
    const t = tokenizeInline("Node ⟦-20⟧ ⟦+22⟧ via `docker` and **bold**");
    expect(t).toContainEqual({ kind: "del", value: "20" });
    expect(t).toContainEqual({ kind: "ins", value: "22" });
    expect(t).toContainEqual({ kind: "code", value: "docker" });
    expect(t).toContainEqual({ kind: "strong", value: "bold" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @guardian/widget test diff`
Expected: FAIL — `diff.js` not found.

- [ ] **Step 3: Implement diff.ts**

`apps/widget/src/renderer/diff/diff.ts`:
```ts
export type DiffBlock = { kind: "same" | "add" | "del" | "changed"; md: string };
export type InlineToken = { kind: "text" | "ins" | "del" | "code" | "strong"; value: string };

type Op = { t: "s" | "d" | "a"; v: string };

function lcs(a: string[], b: string[]): Op[] {
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const ops: Op[] = []; let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { ops.push({ t: "s", v: b[j] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push({ t: "d", v: a[i] }); i++; }
    else { ops.push({ t: "a", v: b[j] }); j++; }
  }
  while (i < n) ops.push({ t: "d", v: a[i++] });
  while (j < m) ops.push({ t: "a", v: b[j++] });
  return ops;
}

const PREFIX = /^(\s*(?:[-*+]\s+|\d+\.\s+|#{1,6}\s+|>\s+)?)([\s\S]*)$/;

function wordDiff(a: string, b: string): string {
  const ops = lcs(a.split(/(\s+)/).filter(Boolean), b.split(/(\s+)/).filter(Boolean));
  let out = "", i = 0;
  while (i < ops.length) {
    if (ops[i].t === "s") { out += ops[i].v; i++; continue; }
    let del = "", add = "";
    while (i < ops.length && ops[i].t !== "s") { if (ops[i].t === "d") del += ops[i].v; else add += ops[i].v; i++; }
    if (del.trim()) out += "⟦-" + del.trim() + "⟧";
    if (del.trim() && add.trim()) out += " ";
    if (add.trim()) out += "⟦+" + add.trim() + "⟧";
  }
  return out;
}

function lineDiff(oldB: string, newB: string): string {
  const ops = lcs(oldB.split("\n"), newB.split("\n"));
  const out: string[] = []; let i = 0;
  while (i < ops.length) {
    if (ops[i].t === "s") { out.push(ops[i].v); i++; continue; }
    const dels: string[] = [], adds: string[] = [];
    while (i < ops.length && ops[i].t !== "s") { (ops[i].t === "d" ? dels : adds).push(ops[i].v); i++; }
    const n = Math.max(dels.length, adds.length);
    for (let k = 0; k < n; k++) {
      if (k < dels.length && k < adds.length) {
        const m1 = dels[k].match(PREFIX)!, m2 = adds[k].match(PREFIX)!;
        out.push(m2[1] + wordDiff(m1[2], m2[2]));
      } else if (k < dels.length) { const m = dels[k].match(PREFIX)!; out.push(m[2] ? m[1] + "⟦-" + m[2] + "⟧" : dels[k]); }
      else { const m = adds[k].match(PREFIX)!; out.push(m[2] ? m[1] + "⟦+" + m[2] + "⟧" : adds[k]); }
    }
  }
  return out.join("\n");
}

export function diffBlocks(oldMd: string, newMd: string): DiffBlock[] {
  const ops = lcs(oldMd.trim().split(/\n{2,}/), newMd.trim().split(/\n{2,}/));
  const res: DiffBlock[] = []; let i = 0;
  while (i < ops.length) {
    if (ops[i].t === "s") { res.push({ kind: "same", md: ops[i].v }); i++; continue; }
    const dels: string[] = [], adds: string[] = [];
    while (i < ops.length && ops[i].t !== "s") { (ops[i].t === "d" ? dels : adds).push(ops[i].v); i++; }
    const n = Math.max(dels.length, adds.length);
    for (let k = 0; k < n; k++) {
      if (k < dels.length && k < adds.length) res.push({ kind: "changed", md: lineDiff(dels[k], adds[k]) });
      else if (k < dels.length) res.push({ kind: "del", md: dels[k] });
      else res.push({ kind: "add", md: adds[k] });
    }
  }
  return res;
}

export function tokenizeInline(text: string): InlineToken[] {
  const out: InlineToken[] = [];
  const re = /⟦([+-])([^⟧]*)⟧|\*\*([^*]+)\*\*|`([^`]+)`/g;
  let last = 0, m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ kind: "text", value: text.slice(last, m.index) });
    if (m[1]) out.push({ kind: m[1] === "+" ? "ins" : "del", value: m[2] });
    else if (m[3]) out.push({ kind: "strong", value: m[3] });
    else out.push({ kind: "code", value: m[4] });
    last = re.lastIndex;
  }
  if (last < text.length) out.push({ kind: "text", value: text.slice(last) });
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @guardian/widget test diff`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/widget/src/renderer/diff/diff.ts apps/widget/test/diff.test.ts
git commit -m "feat(widget): deterministic markdown diff engine"
```

---

### Task 4: DiffView renderer

**Files:**
- Create: `apps/widget/src/renderer/components/DiffView.tsx`
- Test: `apps/widget/test/DiffView.test.tsx`

**Interfaces:**
- Consumes: `diffBlocks`, `tokenizeInline` (Task 3), `ChangeWithVotes` from shared.
- Produces: `<DiffView change={ChangeWithVotes} />`. New file (`oldMd == null`) → "Neue Datei" banner + full `newMd` as added. Otherwise render `diffBlocks(oldMd, newMd)` with ctp ins/del styling; deletions strikethrough.

- [ ] **Step 1: Write the failing test**

`apps/widget/test/DiffView.test.tsx`:
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

describe("DiffView", () => {
  it("shows the new-file banner when oldMd is null", () => {
    render(<DiffView change={change({ oldMd: null, newMd: "# ADR", changeKind: "add" })} />);
    expect(screen.getByText(/Neue Datei/)).toBeTruthy();
  });
  it("renders inserted and deleted words", () => {
    const { container } = render(<DiffView change={change({})} />);
    expect(container.querySelector("ins")).toBeTruthy();
    expect(container.querySelector("del")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @guardian/widget test DiffView`
Expected: FAIL — `DiffView.js` not found.

- [ ] **Step 3: Implement DiffView.tsx**

`apps/widget/src/renderer/components/DiffView.tsx`:
```tsx
import React from "react";
import type { ChangeWithVotes } from "@guardian/shared";
import { diffBlocks, tokenizeInline, type DiffBlock } from "../diff/diff.js";

function Inline({ text }: { text: string }) {
  return (
    <>
      {tokenizeInline(text).map((t, i) => {
        if (t.kind === "ins") return <ins key={i} className="bg-ctp-green/25 text-ctp-green no-underline rounded px-0.5">{t.value}</ins>;
        if (t.kind === "del") return <del key={i} className="bg-ctp-red/20 text-ctp-red rounded px-0.5">{t.value}</del>;
        if (t.kind === "code") return <code key={i} className="bg-ctp-surface0 text-ctp-subtext1 rounded px-1 text-[12px] font-mono">{t.value}</code>;
        if (t.kind === "strong") return <strong key={i} className="text-ctp-text">{t.value}</strong>;
        return <React.Fragment key={i}>{t.value}</React.Fragment>;
      })}
    </>
  );
}

function Block({ md }: { md: string }) {
  const lines = md.split("\n");
  const h = lines[0].match(/^(#{1,3})\s+(.*)$/);
  if (h && lines.length === 1) {
    const Tag = (`h${h[1].length}`) as "h1" | "h2" | "h3";
    return <Tag className="font-semibold text-ctp-text"><Inline text={h[2]} /></Tag>;
  }
  if (lines.every(l => /^\s*[-*+]\s+/.test(l)))
    return <ul className="list-disc pl-5">{lines.map((l, i) => <li key={i}><Inline text={l.replace(/^\s*[-*+]\s+/, "")} /></li>)}</ul>;
  if (lines.every(l => /^\s*\d+\.\s+/.test(l)))
    return <ol className="list-decimal pl-5">{lines.map((l, i) => <li key={i}><Inline text={l.replace(/^\s*\d+\.\s+/, "")} /></li>)}</ol>;
  return <p className="text-ctp-subtext1 leading-relaxed">{lines.map((l, i) => <React.Fragment key={i}>{i > 0 && <br />}<Inline text={l} /></React.Fragment>)}</p>;
}

function wrap(block: DiffBlock, i: number) {
  const inner = <Block md={block.md} />;
  if (block.kind === "add") return <div key={i} className="bg-ctp-green/15 border-l-2 border-ctp-green rounded-r px-3 my-2">{inner}</div>;
  if (block.kind === "del") return <div key={i} className="bg-ctp-red/15 border-l-2 border-ctp-red rounded-r px-3 my-2 line-through opacity-80">{inner}</div>;
  if (block.kind === "changed") return <div key={i} className="border-l-2 border-ctp-surface2 px-3 my-2">{inner}</div>;
  return <div key={i} className="my-2">{inner}</div>;
}

export function DiffView({ change }: { change: ChangeWithVotes }) {
  if (!change.oldMd?.trim()) {
    const body = (change.newMd ?? "").trim().split(/\n{2,}/);
    return (
      <div>
        <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-ctp-green bg-ctp-green/20 border border-ctp-green/40 rounded-full px-2.5 py-0.5 mb-3">
          ＋ Neue Datei — gesamter Inhalt ist neu
        </div>
        <div className="border-l-2 border-ctp-green bg-ctp-green/10 rounded-r px-3">
          {body.map((b, i) => <Block key={i} md={b} />)}
        </div>
      </div>
    );
  }
  return <div>{diffBlocks(change.oldMd, change.newMd ?? "").map(wrap)}</div>;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @guardian/widget test DiffView`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/widget/src/renderer/components/DiffView.tsx apps/widget/test/DiffView.test.tsx
git commit -m "feat(widget): diff renderer with catppuccin ins/del styling"
```

---

### Task 5: API + WebSocket client

**Files:**
- Create: `apps/widget/src/renderer/api/client.ts`, `apps/widget/src/renderer/api/ws.ts`
- Test: `apps/widget/test/client.test.ts`, `apps/widget/test/ws.test.ts`

**Interfaces:**
- Consumes: shared DTO types.
- Produces:
  - `class ApiClient` `(baseUrl: string, token: string | null, fetchFn?)`:
    - `init(setupCode, name, email)`, `redeem(code)` → `{ deviceToken, guardian }`
    - `getChanges()` → `{ cycle, active, accepted, badge }`
    - `getChange(id)` → `ChangeWithVotes`
    - `vote(id, status, comment)` → `ChangeWithVotes`
    - `getGuardians()`, `invite(name, email)`, `getMeeting()`, `closeCycle(id, note)`, `getHistory()`
    - throws `ApiError` with `{ status, message }` on non-2xx.
  - `subscribe(baseUrl, token, onEvent, WsCtor?)` → `() => void` — opens `/ws?token=`, parses `HubEvent`, returns an unsubscribe.

- [ ] **Step 1: Write the failing client test**

`apps/widget/test/client.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { ApiClient, ApiError } from "../src/renderer/api/client.js";

function fake(status: number, body: unknown, capture?: (u: string, init?: any) => void): typeof fetch {
  return (async (u: string, init?: any) => { capture?.(u, init); return {
    ok: status >= 200 && status < 300, status, json: async () => body,
  } as Response; }) as unknown as typeof fetch;
}

describe("ApiClient", () => {
  it("sends the bearer token and returns changes", async () => {
    let seen = "";
    const c = new ApiClient("http://s", "tok", fake(200, { cycle: null, active: [], accepted: [], badge: 0 },
      (_u, init) => { seen = init?.headers?.Authorization ?? ""; }));
    const r = await c.getChanges();
    expect(seen).toBe("Bearer tok");
    expect(r.badge).toBe(0);
  });
  it("throws ApiError on 400", async () => {
    const c = new ApiClient("http://s", "tok", fake(400, { error: "Kommentar erforderlich" }));
    await expect(c.vote("c1", "abgelehnt", "no")).rejects.toBeInstanceOf(ApiError);
  });
  it("posts init without a token", async () => {
    let seenBody: any;
    const c = new ApiClient("http://s", null, fake(200, { deviceToken: "t", guardian: { id: "g" } },
      (_u, init) => { seenBody = JSON.parse(init.body); }));
    const r = await c.init("MB-INIT-7743", "Anna", "a@x.de");
    expect(seenBody.setupCode).toBe("MB-INIT-7743");
    expect(r.deviceToken).toBe("t");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @guardian/widget test client`
Expected: FAIL — `client.js` not found.

- [ ] **Step 3: Implement client.ts**

`apps/widget/src/renderer/api/client.ts`:
```ts
import type { ChangeWithVotes, Guardian, Cycle, VoteStatus } from "@guardian/shared";

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export interface ChangesResponse { cycle: Cycle | null; active: ChangeWithVotes[]; accepted: ChangeWithVotes[]; badge: number }
export interface MeetingResponse { cycle: Cycle | null; rejected: ChangeWithVotes[]; klaerung: ChangeWithVotes[]; accepted: ChangeWithVotes[]; outstanding: number }
export interface AuthResponse { deviceToken: string; guardian: Guardian }

export class ApiClient {
  constructor(private baseUrl: string, private token: string | null, private fetchFn: typeof fetch = fetch) {}

  private async req<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    const res = await this.fetchFn(`${this.baseUrl}${path}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(res.status, (data as any).error ?? `HTTP ${res.status}`);
    return data as T;
  }

  init(setupCode: string, name: string, email: string) { return this.req<AuthResponse>("POST", "/auth/init", { setupCode, name, email }); }
  redeem(code: string) { return this.req<AuthResponse>("POST", "/auth/redeem", { code }); }
  getChanges() { return this.req<ChangesResponse>("GET", "/changes"); }
  getChange(id: string) { return this.req<ChangeWithVotes>("GET", `/changes/${id}`); }
  vote(id: string, status: VoteStatus, comment: string) { return this.req<ChangeWithVotes>("POST", `/changes/${id}/vote`, { status, comment }); }
  getGuardians() { return this.req<{ guardians: Guardian[]; pending: { code: string; name: string; email: string }[] }>("GET", "/guardians"); }
  invite(name: string, email: string) { return this.req<{ code: string }>("POST", "/guardians/invite", { name, email }); }
  getMeeting() { return this.req<MeetingResponse>("GET", "/meeting"); }
  closeCycle(id: string, note: string | null) { return this.req<{ ok: true }>("POST", `/cycles/${id}/close`, { note }); }
  getHistory() { return this.req<{ cycles: Cycle[] }>("GET", "/history"); }
}
```

- [ ] **Step 4: Write + run the failing ws test**

`apps/widget/test/ws.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { subscribe } from "../src/renderer/api/ws.js";

class FakeWs {
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  closed = false;
  constructor(public url: string) {}
  close() { this.closed = true; this.onclose?.(); }
  emit(data: string) { this.onmessage?.({ data }); }
}

describe("subscribe", () => {
  it("delivers parsed events and unsubscribes", () => {
    let created: FakeWs | null = null;
    const events: unknown[] = [];
    const off = subscribe("http://s", "tok", (e) => events.push(e),
      ((url: string) => (created = new FakeWs(url)) as any) as any);
    expect(created!.url).toBe("ws://s/ws?token=tok");
    created!.emit(JSON.stringify({ type: "change:new", changeId: "c1" }));
    expect(events[0]).toEqual({ type: "change:new", changeId: "c1" });
    off();
    expect(created!.closed).toBe(true);
  });
});
```

Run: `pnpm --filter @guardian/widget test ws`
Expected: FAIL — `ws.js` not found.

- [ ] **Step 5: Implement ws.ts**

`apps/widget/src/renderer/api/ws.ts`:
```ts
export type HubEvent = {
  type: "change:new" | "change:updated" | "vote:updated" | "guardian:added";
  changeId?: string;
};

type WsCtor = (url: string) => {
  onmessage: ((e: { data: string }) => void) | null;
  onclose: (() => void) | null;
  close(): void;
};

export function subscribe(
  baseUrl: string, token: string, onEvent: (e: HubEvent) => void,
  WsCtor: WsCtor = (url) => new WebSocket(url) as any,
): () => void {
  const wsUrl = baseUrl.replace(/^http/, "ws") + `/ws?token=${encodeURIComponent(token)}`;
  const ws = WsCtor(wsUrl);
  ws.onmessage = (e) => { try { onEvent(JSON.parse(e.data) as HubEvent); } catch { /* ignore malformed */ } };
  return () => ws.close();
}
```

- [ ] **Step 6: Run both test files to verify they pass**

Run: `pnpm --filter @guardian/widget test client && pnpm --filter @guardian/widget test ws`
Expected: PASS (client 3, ws 1).

- [ ] **Step 7: Commit**

```bash
git add apps/widget/src/renderer/api apps/widget/test/client.test.ts apps/widget/test/ws.test.ts
git commit -m "feat(widget): REST + WebSocket client"
```

---

### Task 6: Zustand store

**Files:**
- Create: `apps/widget/src/renderer/store.ts`
- Test: `apps/widget/test/store.test.ts`

**Interfaces:**
- Consumes: `ApiClient`, `ChangesResponse`, shared types.
- Produces: `createGuardianStore(api: ApiClient)` → a Zustand store with state `{ cycle, active, accepted, badge, selectedId, toast }` and actions:
  - `refresh(): Promise<void>` — loads `/changes`, keeps `selectedId` valid.
  - `select(id: string): void`
  - `castVote(id, status, comment): Promise<void>` — calls api, updates the change in place.
  - `onWsEvent(e): void` — `change:new` sets `toast` + triggers refresh; others refresh.
  - `dismissToast(): void`
  - selectors are plain (compute in components), but expose `myVote(guardianId, changeId)` helper.

- [ ] **Step 1: Write the failing test**

`apps/widget/test/store.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { createGuardianStore } from "../src/renderer/store.js";
import type { ChangeWithVotes } from "@guardian/shared";

function ch(id: string, over: Partial<ChangeWithVotes> = {}): ChangeWithVotes {
  return { id, repo: "r", branch: "main", filePath: `memory-bank/${id}.md`, changeKind: "modify",
    commitId: "x", commitShort: "x", authorName: "A", authorEmail: "a@x.de", committedAt: "t",
    summary: "s", oldMd: "o", newMd: "n", cycleId: "cy", firstSeenAt: "t",
    votes: [], adoLink: "http://x", ...over };
}

function fakeApi(over: Partial<any> = {}) {
  return {
    getChanges: vi.fn(async () => ({ cycle: { id: "cy" }, active: [ch("c1"), ch("c2")], accepted: [], badge: 2 })),
    vote: vi.fn(async (id: string) => ch(id, { votes: [{ changeId: id, guardianId: "g1", status: "akzeptiert", comment: null, updatedAt: "t" }] })),
    ...over,
  } as any;
}

describe("guardian store", () => {
  it("refresh loads changes and picks a default selection", async () => {
    const store = createGuardianStore(fakeApi());
    await store.getState().refresh();
    expect(store.getState().active).toHaveLength(2);
    expect(store.getState().badge).toBe(2);
    expect(store.getState().selectedId).toBe("c1");
  });

  it("castVote updates the change in place", async () => {
    const store = createGuardianStore(fakeApi());
    await store.getState().refresh();
    await store.getState().castVote("c1", "akzeptiert", "");
    const c1 = store.getState().active.find(c => c.id === "c1")!;
    expect(c1.votes[0].status).toBe("akzeptiert");
  });

  it("change:new sets a toast", async () => {
    const store = createGuardianStore(fakeApi());
    store.getState().onWsEvent({ type: "change:new", changeId: "c9" });
    expect(store.getState().toast?.changeId).toBe("c9");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @guardian/widget test store`
Expected: FAIL — `store.js` not found.

- [ ] **Step 3: Implement store.ts**

`apps/widget/src/renderer/store.ts`:
```ts
import { createStore } from "zustand/vanilla";
import type { Cycle, ChangeWithVotes, Vote, VoteStatus } from "@guardian/shared";
import type { ApiClient } from "./api/client.js";
import type { HubEvent } from "./api/ws.js";

export interface GuardianState {
  cycle: Cycle | null;
  active: ChangeWithVotes[];
  accepted: ChangeWithVotes[];
  badge: number;
  selectedId: string | null;
  toast: { changeId: string } | null;
  refresh: () => Promise<void>;
  select: (id: string) => void;
  castVote: (id: string, status: VoteStatus, comment: string) => Promise<void>;
  onWsEvent: (e: HubEvent) => void;
  dismissToast: () => void;
}

export function myVote(change: ChangeWithVotes, guardianId: string): Vote | undefined {
  return change.votes.find(v => v.guardianId === guardianId);
}

export function createGuardianStore(api: ApiClient) {
  return createStore<GuardianState>((set, get) => ({
    cycle: null, active: [], accepted: [], badge: 0, selectedId: null, toast: null,

    async refresh() {
      const r = await api.getChanges();
      const sel = get().selectedId;
      const stillValid = sel && [...r.active, ...r.accepted].some(c => c.id === sel);
      set({ cycle: r.cycle, active: r.active, accepted: r.accepted, badge: r.badge,
        selectedId: stillValid ? sel : (r.active[0]?.id ?? r.accepted[0]?.id ?? null) });
    },
    select(id) { set({ selectedId: id }); },
    async castVote(id, status, comment) {
      const updated = await api.vote(id, status, comment);
      set(s => ({
        active: s.active.map(c => c.id === id ? updated : c),
        accepted: s.accepted.map(c => c.id === id ? updated : c),
      }));
      await get().refresh();
    },
    onWsEvent(e) {
      if (e.type === "change:new" && e.changeId) set({ toast: { changeId: e.changeId } });
      void get().refresh();
    },
    dismissToast() { set({ toast: null }); },
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @guardian/widget test store`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/widget/src/renderer/store.ts apps/widget/test/store.test.ts
git commit -m "feat(widget): zustand store for changes, votes, toast"
```

---

### Task 7: Setup dialog

**Files:**
- Create: `apps/widget/src/renderer/components/SetupDialog.tsx`
- Test: `apps/widget/test/SetupDialog.test.tsx`

**Interfaces:**
- Consumes: `ApiClient`.
- Produces: `<SetupDialog api={ApiClient} onLinked={(token, guardian) => void} />`. Two modes: "Gerät verknüpfen" (code → `api.redeem`) and "Instanz initialisieren" (setup code + name + email → `api.init`). Shows the returned `ApiError.message`. Reproduces the design's two-panel dialog.

- [ ] **Step 1: Write the failing test**

`apps/widget/test/SetupDialog.test.tsx`:
```tsx
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @guardian/widget test SetupDialog`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement SetupDialog.tsx** (structure per design §10.2 "Setup-Dialog"; colours via Tailwind/ctp)

`apps/widget/src/renderer/components/SetupDialog.tsx`:
```tsx
import React, { useState } from "react";
import type { Guardian } from "@guardian/shared";
import type { ApiClient } from "../api/client.js";

export function SetupDialog({ api, onLinked }: { api: ApiClient; onLinked: (token: string, g: Guardian) => void }) {
  const [mode, setMode] = useState<"code" | "init">("code");
  const [code, setCode] = useState("");
  const [initCode, setInitCode] = useState(""), [name, setName] = useState(""), [email, setEmail] = useState("");
  const [error, setError] = useState("");

  async function redeem() {
    setError("");
    try { const r = await api.redeem(code.trim().toUpperCase()); onLinked(r.deviceToken, r.guardian); }
    catch (e) { setError((e as Error).message); }
  }
  async function init() {
    setError("");
    try { const r = await api.init(initCode.trim(), name.trim(), email.trim()); onLinked(r.deviceToken, r.guardian); }
    catch (e) { setError((e as Error).message); }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-ctp-crust/60 p-6">
      <div className="w-[440px] max-w-full bg-ctp-mantle border border-ctp-surface0 rounded-2xl shadow-2xl overflow-hidden">
        {mode === "code" ? (
          <div className="p-5">
            <h2 className="text-base font-bold text-ctp-text">Gerät verknüpfen</h2>
            <p className="text-xs text-ctp-subtext0 mt-2 leading-relaxed">
              Du wurdest von einem Hüter angelegt und hast einen einmaligen Zugangscode bekommen.
            </p>
            <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="MB-XXXX"
              className="w-full mt-3 bg-ctp-base border border-ctp-surface1 rounded-lg text-ctp-text text-center tracking-widest font-mono p-3 outline-none" />
            {error && <div className="text-xs text-ctp-red text-center mt-2">{error}</div>}
            <button onClick={redeem} disabled={code.trim().length < 4}
              className="w-full mt-2 rounded-lg py-2.5 font-semibold bg-ctp-green/25 text-ctp-green border border-ctp-green/40 disabled:opacity-40">Verknüpfen</button>
            <p className="text-xs text-ctp-subtext0 mt-3">Frische Installation?{" "}
              <span onClick={() => setMode("init")} className="text-ctp-blue cursor-pointer">Instanz initialisieren →</span></p>
          </div>
        ) : (
          <div className="p-5">
            <h2 className="text-base font-bold text-ctp-text">Instanz initialisieren</h2>
            <p className="text-xs text-ctp-subtext0 mt-2 leading-relaxed">
              Der Server gibt beim ersten Start einen Erst-Setup-Code in der Konsole aus.
            </p>
            <div className="flex flex-col gap-2 mt-3">
              <input value={initCode} onChange={e => setInitCode(e.target.value)} placeholder="Setup-Code aus der Konsole"
                className="bg-ctp-base border border-ctp-surface1 rounded-lg text-ctp-text text-center font-mono p-2.5 outline-none" />
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Dein Name"
                className="bg-ctp-base border border-ctp-surface1 rounded-lg text-ctp-text p-2.5 outline-none" />
              <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Deine E-Mail"
                className="bg-ctp-base border border-ctp-surface1 rounded-lg text-ctp-text p-2.5 outline-none" />
              {error && <div className="text-xs text-ctp-red text-center">{error}</div>}
              <button onClick={init} disabled={!name.trim() || !email.includes("@")}
                className="rounded-lg py-2.5 font-semibold bg-ctp-green/25 text-ctp-green border border-ctp-green/40 disabled:opacity-40">Als Gründungs-Hüter starten</button>
              <span onClick={() => setMode("code")} className="text-xs text-ctp-blue cursor-pointer text-center">← Zurück</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @guardian/widget test SetupDialog`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/widget/src/renderer/components/SetupDialog.tsx apps/widget/test/SetupDialog.test.tsx
git commit -m "feat(widget): setup dialog (redeem + init)"
```

---

### Task 8: Tray widget + toast

**Files:**
- Create: `apps/widget/src/renderer/components/TrayWidget.tsx`, `apps/widget/src/renderer/components/Toast.tsx`
- Test: `apps/widget/test/TrayWidget.test.tsx`

**Interfaces:**
- Consumes: store state, `theme.ts`, shared `fileType`/`STATUS_LABELS`, current guardian id.
- Produces:
  - `<TrayWidget active={ChangeWithVotes[]} accepted={ChangeWithVotes[]} badge={number} guardianId={string} guardianName={string} onOpen={(id)=>void} onOpenMeeting={()=>void} onOpenHistory={()=>void} collapsed={boolean} onToggle={()=>void} />`
  - `<Toast change={ChangeWithVotes} onView={()=>void} onDismiss={()=>void} />`
  - Rows show: type badge, `NEU` when `changeKind === "add"`, one dot per guardian (colour = their vote), and "deine Bestätigung fehlt" when the current guardian is `offen`. Footer shows accepted side-note. Reproduces design collapsed/expanded/toast.

- [ ] **Step 1: Write the failing test**

`apps/widget/test/TrayWidget.test.tsx`:
```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TrayWidget } from "../src/renderer/components/TrayWidget.js";
import type { ChangeWithVotes } from "@guardian/shared";

const active: ChangeWithVotes[] = [{
  id: "c1", repo: "r", branch: "main", filePath: "docs/decisions/adr-013.md", changeKind: "add",
  commitId: "x", commitShort: "x", authorName: "Anna", authorEmail: "a@x.de", committedAt: "t",
  summary: "Neue Decision", oldMd: null, newMd: "# ADR", cycleId: "cy", firstSeenAt: "t",
  votes: [{ changeId: "c1", guardianId: "g1", status: "offen", comment: null, updatedAt: "t" }],
  adoLink: "http://x",
}];

describe("TrayWidget", () => {
  it("shows the row with NEU and pending hint for the current guardian", () => {
    render(<TrayWidget active={active} accepted={[]} badge={1} guardianId="g1" guardianName="Anna"
      collapsed={false} onOpen={vi.fn()} onOpenMeeting={vi.fn()} onOpenHistory={vi.fn()} onToggle={vi.fn()} />);
    expect(screen.getByText("adr-013.md")).toBeTruthy();
    expect(screen.getByText("NEU")).toBeTruthy();
    expect(screen.getByText(/deine Bestätigung fehlt/)).toBeTruthy();
  });

  it("shows the accepted side-note", () => {
    render(<TrayWidget active={[]} accepted={active} badge={0} guardianId="g1" guardianName="Anna"
      collapsed={false} onOpen={vi.fn()} onOpenMeeting={vi.fn()} onOpenHistory={vi.fn()} onToggle={vi.fn()} />);
    expect(screen.getByText(/von allen Hütern bestätigt/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @guardian/widget test TrayWidget`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement Toast.tsx + TrayWidget.tsx** (structure per design; colours via ctp)

`apps/widget/src/renderer/components/Toast.tsx`:
```tsx
import React from "react";
import type { ChangeWithVotes } from "@guardian/shared";
import { fileType } from "@guardian/shared";
import { typeBadge } from "../theme.js";

export function Toast({ change, onView, onDismiss }: { change: ChangeWithVotes; onView: () => void; onDismiss: () => void }) {
  const t = typeBadge(fileType(change.filePath).label);
  return (
    <div className="w-[352px] bg-ctp-surface0 border border-ctp-surface1 rounded-xl shadow-2xl overflow-hidden">
      <div className="flex gap-3 p-3">
        <div className="flex-1 min-w-0">
          <div className="text-[12.5px] font-semibold text-ctp-text">Memory-Bank geändert</div>
          <div className="font-mono text-xs text-ctp-subtext1 truncate">{change.filePath.split("/").pop()}
            <span className={`ml-1.5 text-[9px] rounded px-1.5 ${t.text} ${t.bg}`}>{fileType(change.filePath).label}</span></div>
          <div className="text-[11.5px] text-ctp-subtext0">{change.summary} · {change.authorName}</div>
        </div>
        <div onClick={onDismiss} className="text-ctp-overlay0 cursor-pointer">✕</div>
      </div>
      <div className="flex border-t border-ctp-surface1">
        <div onClick={onView} className="flex-1 text-center py-2 text-xs font-semibold text-ctp-green cursor-pointer border-r border-ctp-surface1">Ansehen</div>
        <div onClick={onDismiss} className="flex-1 text-center py-2 text-xs text-ctp-subtext0 cursor-pointer">Später</div>
      </div>
    </div>
  );
}
```

`apps/widget/src/renderer/components/TrayWidget.tsx`:
```tsx
import React from "react";
import type { ChangeWithVotes } from "@guardian/shared";
import { fileType, STATUS_LABELS } from "@guardian/shared";
import { statusDot, typeBadge } from "../theme.js";

interface Props {
  active: ChangeWithVotes[]; accepted: ChangeWithVotes[]; badge: number;
  guardianId: string; guardianName: string; collapsed: boolean;
  onOpen: (id: string) => void; onOpenMeeting: () => void; onOpenHistory: () => void; onToggle: () => void;
}

export function TrayWidget(p: Props) {
  if (p.collapsed) {
    return (
      <div onClick={p.onToggle} className="flex items-center gap-2.5 bg-ctp-mantle border border-ctp-surface0 rounded-full py-2.5 pl-3 pr-4 cursor-pointer shadow-xl w-fit">
        <span className="text-[13px] text-ctp-subtext1">Memory-Bank</span>
        {p.badge > 0 && <span className="min-w-[20px] h-5 rounded-full bg-ctp-red text-ctp-crust text-[11px] font-semibold flex items-center justify-center px-1.5">{p.badge}</span>}
      </div>
    );
  }
  return (
    <div className="w-[352px] bg-ctp-mantle border border-ctp-surface0 rounded-2xl shadow-2xl overflow-hidden">
      <div className="flex items-center gap-2.5 p-3 border-b border-ctp-surface0">
        <div className="flex-1">
          <div className="text-[13px] font-semibold text-ctp-text">Memory-Bank Hüter</div>
          <div className="text-[11px] text-ctp-subtext0">Angemeldet als {p.guardianName}</div>
        </div>
        {p.badge > 0 && <span className="min-w-[20px] h-5 rounded-full bg-ctp-red text-ctp-crust text-[11px] font-semibold flex items-center justify-center px-1.5">{p.badge}</span>}
        <div onClick={p.onToggle} className="w-6 h-6 rounded-md flex items-center justify-center text-ctp-subtext0 cursor-pointer">–</div>
      </div>
      <div className="max-h-[340px] overflow-y-auto">
        {p.active.map(c => {
          const t = typeBadge(fileType(c.filePath).label);
          const mine = c.votes.find(v => v.guardianId === p.guardianId);
          return (
            <div key={c.id} onClick={() => p.onOpen(c.id)} className="flex gap-2.5 p-3 border-b border-ctp-surface0/60 cursor-pointer hover:bg-ctp-surface0/40">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="font-mono text-xs text-ctp-subtext1 truncate">{c.filePath.split("/").pop()}</span>
                  <span className={`text-[9px] rounded px-1.5 ${t.text} ${t.bg}`}>{fileType(c.filePath).label}</span>
                  {c.changeKind === "add" && <span className="text-[9px] font-bold text-ctp-green bg-ctp-green/20 rounded px-1.5">NEU</span>}
                </div>
                <div className="text-[11.5px] text-ctp-subtext0 truncate">{c.summary}</div>
                <div className="flex items-center gap-1.5 mt-1.5">
                  {c.votes.map(v => <span key={v.guardianId} title={`${STATUS_LABELS[v.status]}`} className={`w-2 h-2 rounded-full ${statusDot(v.status)}`} />)}
                  <span className={`text-[10.5px] ml-0.5 ${mine?.status === "offen" ? "text-ctp-peach" : "text-ctp-subtext0"}`}>
                    {mine?.status === "offen" ? "deine Bestätigung fehlt" : `du: ${STATUS_LABELS[mine?.status ?? "offen"]}`}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
        {p.active.length === 0 && <div className="p-4 text-xs text-ctp-subtext0 text-center">Keine offenen Änderungen 🎉</div>}
      </div>
      {p.accepted.length > 0 && (
        <div className="px-3 py-2 bg-ctp-crust border-t border-ctp-surface0 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-ctp-green" />
          <span className="text-[11px] text-ctp-subtext0">{p.accepted.length} {p.accepted.length === 1 ? "Änderung" : "Änderungen"} von allen Hütern bestätigt</span>
        </div>
      )}
      <div className="flex border-t border-ctp-surface0">
        <div onClick={p.onOpenMeeting} className="flex-1 text-center py-2 text-[11.5px] text-ctp-subtext1 cursor-pointer border-r border-ctp-surface0">Meeting-Übersicht</div>
        <div onClick={p.onOpenHistory} className="flex-1 text-center py-2 text-[11.5px] text-ctp-subtext1 cursor-pointer">Verlauf</div>
      </div>
    </div>
  );
}
```
_(`ctp-peach` is a valid Catppuccin colour used for the pending hint.)_

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @guardian/widget test TrayWidget`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/widget/src/renderer/components/TrayWidget.tsx apps/widget/src/renderer/components/Toast.tsx apps/widget/test/TrayWidget.test.tsx
git commit -m "feat(widget): tray widget and toast"
```

---

### Task 9: Änderungen tab (diff + vote flow with mandatory comment)

**Files:**
- Create: `apps/widget/src/renderer/components/tabs/ChangesTab.tsx`
- Test: `apps/widget/test/ChangesTab.test.tsx`

**Interfaces:**
- Consumes: store, `DiffView`, `theme.ts`, shared types.
- Produces: `<ChangesTab active accepted selected guardianId onSelect onVote />` where `onVote(id, status, comment)`. Behaviour:
  - Sidebar lists active (selectable) + accepted (dimmed).
  - Detail: header (file, type, NEUE DATEI, commit, summary/author, per-guardian vote chips), `<DiffView>`, comments section.
  - Footer: if the guardian's vote is `offen`, show 3 buttons. `Klärungsbedarf`/`Abgelehnt` open a textarea; **"Bewertung speichern" is disabled until the comment has ≥5 trimmed chars**. `Akzeptiert` votes immediately with empty comment. If already voted, show the value + "Neu bewerten".

- [ ] **Step 1: Write the failing test** (the mandatory-comment rule is the critical assertion)

`apps/widget/test/ChangesTab.test.tsx`:
```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChangesTab } from "../src/renderer/components/tabs/ChangesTab.js";
import type { ChangeWithVotes } from "@guardian/shared";

function change(): ChangeWithVotes {
  return { id: "c1", repo: "r", branch: "main", filePath: "memory-bank/a.md", changeKind: "modify",
    commitId: "abc1234", commitShort: "abc1234", authorName: "Anna", authorEmail: "a@x.de", committedAt: "t",
    summary: "s", oldMd: "Node 20", newMd: "Node 22", cycleId: "cy", firstSeenAt: "t",
    votes: [{ changeId: "c1", guardianId: "g1", status: "offen", comment: null, updatedAt: "t" }],
    adoLink: "http://x" };
}

describe("ChangesTab vote flow", () => {
  it("accept votes immediately with no comment", async () => {
    const onVote = vi.fn();
    render(<ChangesTab active={[change()]} accepted={[]} selectedId="c1" guardianId="g1" onSelect={vi.fn()} onVote={onVote} />);
    await userEvent.click(screen.getByRole("button", { name: /Akzeptiert/ }));
    expect(onVote).toHaveBeenCalledWith("c1", "akzeptiert", "");
  });

  it("blocks a rejection until a comment of >=5 chars is entered", async () => {
    const onVote = vi.fn();
    render(<ChangesTab active={[change()]} accepted={[]} selectedId="c1" guardianId="g1" onSelect={vi.fn()} onVote={onVote} />);
    await userEvent.click(screen.getByRole("button", { name: /Abgelehnt/ }));
    const save = screen.getByRole("button", { name: "Bewertung speichern" });
    expect(save).toHaveProperty("disabled", true);
    await userEvent.type(screen.getByRole("textbox"), "nein");        // 4 chars
    expect(save).toHaveProperty("disabled", true);
    await userEvent.type(screen.getByRole("textbox"), "!");           // 5 chars
    expect(save).toHaveProperty("disabled", false);
    await userEvent.click(save);
    expect(onVote).toHaveBeenCalledWith("c1", "abgelehnt", "nein!");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @guardian/widget test ChangesTab`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement ChangesTab.tsx**

`apps/widget/src/renderer/components/tabs/ChangesTab.tsx`:
```tsx
import React, { useState } from "react";
import type { ChangeWithVotes, VoteStatus } from "@guardian/shared";
import { fileType, STATUS_LABELS } from "@guardian/shared";
import { statusText, typeBadge } from "../../theme.js";
import { DiffView } from "../DiffView.js";

interface Props {
  active: ChangeWithVotes[]; accepted: ChangeWithVotes[]; selectedId: string | null;
  guardianId: string; onSelect: (id: string) => void;
  onVote: (id: string, status: VoteStatus, comment: string) => void;
}

export function ChangesTab(p: Props) {
  const sel = [...p.active, ...p.accepted].find(c => c.id === p.selectedId) ?? p.active[0] ?? p.accepted[0];
  const [draft, setDraft] = useState<{ status: VoteStatus; comment: string } | null>(null);

  if (!sel) return <div className="p-6 text-ctp-subtext0">Keine Änderungen.</div>;
  const mine = sel.votes.find(v => v.guardianId === p.guardianId);
  const t = typeBadge(fileType(sel.filePath).label);
  const draftValid = !!draft && draft.comment.trim().length >= 5;

  return (
    <div className="flex-1 flex min-h-0">
      <div className="w-[264px] border-r border-ctp-surface0 overflow-y-auto">
        <div className="px-3.5 pt-3 pb-1.5 text-[10.5px] tracking-wider text-ctp-subtext0 font-semibold">DIESE WOCHE</div>
        {p.active.map(c => (
          <div key={c.id} onClick={() => { p.onSelect(c.id); setDraft(null); }}
            className={`px-3.5 py-2.5 cursor-pointer border-l-2 ${c.id === sel.id ? "border-ctp-teal bg-ctp-surface0/60" : "border-transparent"}`}>
            <span className="font-mono text-[11.5px] text-ctp-subtext1">{c.filePath.split("/").pop()}</span>
            <div className="text-[11px] text-ctp-subtext0 truncate">{c.summary}</div>
          </div>
        ))}
        {p.accepted.length > 0 && <div className="px-3.5 pt-3.5 pb-1.5 text-[10.5px] tracking-wider text-ctp-subtext0 font-semibold">VON ALLEN BESTÄTIGT</div>}
        {p.accepted.map(c => (
          <div key={c.id} onClick={() => { p.onSelect(c.id); setDraft(null); }} className="px-3.5 py-2 cursor-pointer opacity-60">
            <span className="text-ctp-green text-[11px]">✓ </span><span className="font-mono text-[11.5px] text-ctp-subtext1">{c.filePath.split("/").pop()}</span>
          </div>
        ))}
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <div className="px-5 pt-3.5 pb-3 border-b border-ctp-surface0">
          <div className="flex items-baseline gap-3 flex-wrap">
            <span className="font-mono text-[15px] font-semibold text-ctp-text">{sel.filePath}</span>
            <span className={`text-[10px] rounded px-1.5 py-0.5 ${t.text} ${t.bg}`}>{fileType(sel.filePath).label}</span>
            {sel.changeKind === "add" && <span className="text-[10px] font-bold text-ctp-green bg-ctp-green/20 rounded px-1.5 py-0.5">NEUE DATEI</span>}
            <span className="font-mono text-[11px] text-ctp-subtext0 bg-ctp-surface0 rounded px-1.5">{sel.commitShort}</span>
          </div>
          <div className="text-xs text-ctp-subtext0 mt-1">{sel.summary} · {sel.authorName}</div>
          <div className="flex gap-2 mt-2.5 flex-wrap">
            {sel.votes.map(v => (
              <span key={v.guardianId} title={v.comment ?? ""} className="flex items-center gap-1.5 bg-ctp-surface0 rounded-full px-2.5 py-1">
                <span className={`text-[11px] font-semibold ${statusText(v.status)}`}>{STATUS_LABELS[v.status]}</span>
              </span>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="max-w-[660px]"><DiffView change={sel} /></div>
          {sel.votes.some(v => v.comment) && (
            <div className="max-w-[660px] mt-6">
              <div className="text-[10.5px] tracking-wider text-ctp-subtext0 font-semibold mb-2">KOMMENTARE</div>
              {sel.votes.filter(v => v.comment).map(v => (
                <div key={v.guardianId} className="border-l-2 border-ctp-surface2 pl-3 py-1.5 mb-2 bg-ctp-mantle rounded-r">
                  <div className={`text-[11px] font-semibold ${statusText(v.status)}`}>{STATUS_LABELS[v.status]}</div>
                  <div className="text-[12.5px] text-ctp-subtext1 mt-0.5">{v.comment}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-ctp-surface0 bg-ctp-mantle px-5 py-3">
          {mine?.status === "offen" && !draft && (
            <div className="flex items-center gap-2.5">
              <span className="text-xs text-ctp-subtext0 flex-1">Deine Bestätigung steht aus:</span>
              <button onClick={() => p.onVote(sel.id, "akzeptiert", "")} className="rounded-lg px-4 py-2 text-[12.5px] font-semibold bg-ctp-green/25 text-ctp-green border border-ctp-green/40">✓ Akzeptiert</button>
              <button onClick={() => setDraft({ status: "klaerung", comment: "" })} className="rounded-lg px-4 py-2 text-[12.5px] font-semibold bg-ctp-yellow/20 text-ctp-yellow border border-ctp-yellow/40">? Klärungsbedarf</button>
              <button onClick={() => setDraft({ status: "abgelehnt", comment: "" })} className="rounded-lg px-4 py-2 text-[12.5px] font-semibold bg-ctp-red/20 text-ctp-red border border-ctp-red/40">✕ Abgelehnt</button>
            </div>
          )}
          {draft && mine?.status === "offen" && (
            <div>
              <div className={`text-xs font-semibold mb-1.5 ${statusText(draft.status)}`}>{STATUS_LABELS[draft.status]} — Kommentar erforderlich</div>
              <textarea value={draft.comment} onChange={e => setDraft({ ...draft, comment: e.target.value })}
                placeholder="Warum? Dieser Kommentar wird im Wochen-Meeting besprochen…"
                className="w-full h-16 bg-ctp-base border border-ctp-surface1 rounded-lg text-ctp-subtext1 p-2.5 resize-none outline-none" />
              <div className="flex gap-2.5 justify-end mt-2">
                <button onClick={() => setDraft(null)} className="rounded-lg px-3.5 py-1.5 text-[12.5px] text-ctp-subtext0 border border-ctp-surface1">Abbrechen</button>
                <button disabled={!draftValid} onClick={() => { p.onVote(sel.id, draft.status, draft.comment.trim()); setDraft(null); }}
                  className="rounded-lg px-4 py-1.5 text-[12.5px] font-semibold border border-ctp-surface1 bg-ctp-surface0 text-ctp-text disabled:opacity-40 disabled:cursor-not-allowed">Bewertung speichern</button>
              </div>
            </div>
          )}
          {mine && mine.status !== "offen" && (
            <div className="flex items-center gap-3">
              <span className="text-[12.5px] text-ctp-subtext0">Deine Bewertung:</span>
              <span className={`text-[12.5px] font-semibold ${statusText(mine.status)}`}>{STATUS_LABELS[mine.status]}</span>
              {mine.comment && <span className="text-xs text-ctp-subtext0 italic flex-1 truncate">„{mine.comment}"</span>}
              <button onClick={() => p.onVote(sel.id, "offen", "")} className="rounded-lg px-3 py-1.5 text-xs text-ctp-subtext0 border border-ctp-surface1">Neu bewerten</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @guardian/widget test ChangesTab`
Expected: PASS (2 tests — accept path and mandatory-comment gating).

- [ ] **Step 5: Commit**

```bash
git add apps/widget/src/renderer/components/tabs/ChangesTab.tsx apps/widget/test/ChangesTab.test.tsx
git commit -m "feat(widget): changes tab with diff and mandatory-comment vote flow"
```

---

### Task 10: Meeting, Verlauf, Hüter tabs + MainWindow shell

**Files:**
- Create: `apps/widget/src/renderer/components/tabs/MeetingTab.tsx`, `tabs/HistoryTab.tsx`, `tabs/GuardiansTab.tsx`, `MainWindow.tsx`
- Test: `apps/widget/test/MeetingTab.test.tsx`

**Interfaces:**
- Consumes: `MeetingResponse`, `Cycle`, guardians/pending, `theme.ts`, shared types.
- Produces:
  - `<MeetingTab meeting={MeetingResponse} onOpen={(id)=>void} />` — prominent ABGELEHNT (red) then KLÄRUNGSBEDARF (yellow) cards with per-guardian comments; small "von allen bestätigt" line; outstanding banner.
  - `<HistoryTab cycles={Cycle[]} />`, `<GuardiansTab guardians pending onInvite />`.
  - `<MainWindow tab onTab ...panels />` — the 1080×720 frame with the four tabs (Änderungen/Meeting-Übersicht/Verlauf/Hüter) and close.

- [ ] **Step 1: Write the failing test** (meeting prominence is the key assertion)

`apps/widget/test/MeetingTab.test.tsx`:
```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MeetingTab } from "../src/renderer/components/tabs/MeetingTab.js";
import type { ChangeWithVotes } from "@guardian/shared";

function ch(id: string, status: "klaerung" | "abgelehnt", comment: string): ChangeWithVotes {
  return { id, repo: "r", branch: "main", filePath: `memory-bank/${id}.md`, changeKind: "modify",
    commitId: "x", commitShort: "x", authorName: "A", authorEmail: "a@x.de", committedAt: "t",
    summary: "s", oldMd: "o", newMd: "n", cycleId: "cy", firstSeenAt: "t",
    votes: [{ changeId: id, guardianId: "g1", status, comment, updatedAt: "t" }], adoLink: "http://x" };
}

describe("MeetingTab", () => {
  it("shows rejected and klaerung sections with comments", () => {
    const meeting = {
      cycle: { id: "cy", isoWeek: "2026-W30", startsAt: "t", endsAt: null, closedAt: null, note: null },
      rejected: [ch("c1", "abgelehnt", "Specs hängen daran")],
      klaerung: [ch("c2", "klaerung", "Widerspricht ADR-009?")],
      accepted: [], outstanding: 1,
    };
    render(<MeetingTab meeting={meeting as any} onOpen={vi.fn()} />);
    expect(screen.getByText("ABGELEHNT")).toBeTruthy();
    expect(screen.getByText("KLÄRUNGSBEDARF")).toBeTruthy();
    expect(screen.getByText(/Specs hängen daran/)).toBeTruthy();
    expect(screen.getByText(/1 Bestätigung/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @guardian/widget test MeetingTab`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement MeetingTab.tsx**

`apps/widget/src/renderer/components/tabs/MeetingTab.tsx`:
```tsx
import React from "react";
import type { ChangeWithVotes } from "@guardian/shared";
import { STATUS_LABELS } from "@guardian/shared";
import { statusText } from "../../theme.js";
import type { MeetingResponse } from "../../api/client.js";

function Card({ c, onOpen, accent }: { c: ChangeWithVotes; onOpen: (id: string) => void; accent: string }) {
  return (
    <div className={`bg-ctp-mantle border border-ctp-surface0 rounded-xl p-4 mb-3 border-l-[3px] ${accent}`}>
      <div className="flex items-baseline gap-2.5 flex-wrap">
        <span className="font-mono text-[13.5px] font-semibold text-ctp-text">{c.filePath}</span>
        <span className="text-[11.5px] text-ctp-subtext0">{c.commitShort} · {c.authorName}</span>
        <span className="flex-1" />
        <span onClick={() => onOpen(c.id)} className="text-[11.5px] text-ctp-blue cursor-pointer">Änderung ansehen →</span>
      </div>
      <div className="text-[12.5px] text-ctp-subtext1 mt-1">{c.summary}</div>
      {c.votes.filter(v => v.comment).map(v => (
        <div key={v.guardianId} className="border-l-2 border-ctp-surface2 pl-3 py-1.5 mt-2.5 bg-ctp-base rounded-r">
          <div className={`text-[11px] font-semibold ${statusText(v.status)}`}>{STATUS_LABELS[v.status]}</div>
          <div className="text-[12.5px] text-ctp-subtext1 mt-0.5">{v.comment}</div>
        </div>
      ))}
    </div>
  );
}

export function MeetingTab({ meeting, onOpen }: { meeting: MeetingResponse; onOpen: (id: string) => void }) {
  return (
    <div className="flex-1 overflow-y-auto px-8 py-6">
      <div className="max-w-[760px] mx-auto">
        <div className="flex items-baseline gap-3.5 flex-wrap">
          <span className="text-[19px] font-bold text-ctp-text">Wochen-Meeting · {meeting.cycle?.isoWeek ?? "—"}</span>
          <span className="text-[12.5px] text-ctp-subtext0">{meeting.rejected.length} abgelehnt · {meeting.klaerung.length} mit Klärungsbedarf</span>
        </div>
        {meeting.outstanding > 0 && (
          <div className="mt-2.5 text-xs text-ctp-yellow bg-ctp-yellow/15 border border-ctp-yellow/30 rounded-lg px-3 py-2 inline-flex w-fit">
            ⏳ {meeting.outstanding} {meeting.outstanding === 1 ? "Bestätigung steht" : "Bestätigungen stehen"} noch aus
          </div>
        )}
        {meeting.rejected.length > 0 && (
          <div className="mt-6">
            <div className="flex items-center gap-2 mb-3"><span className="w-2 h-2 rounded-full bg-ctp-red" />
              <span className="text-[13px] font-bold text-ctp-red tracking-wide">ABGELEHNT</span></div>
            {meeting.rejected.map(c => <Card key={c.id} c={c} onOpen={onOpen} accent="border-l-ctp-red" />)}
          </div>
        )}
        {meeting.klaerung.length > 0 && (
          <div className="mt-6">
            <div className="flex items-center gap-2 mb-3"><span className="w-2 h-2 rounded-full bg-ctp-yellow" />
              <span className="text-[13px] font-bold text-ctp-yellow tracking-wide">KLÄRUNGSBEDARF</span></div>
            {meeting.klaerung.map(c => <Card key={c.id} c={c} onOpen={onOpen} accent="border-l-ctp-yellow" />)}
          </div>
        )}
        {meeting.accepted.length > 0 && (
          <div className="mt-7 px-3.5 py-2.5 bg-ctp-mantle border border-ctp-surface0 rounded-lg flex items-center gap-2.5">
            <span className="text-ctp-green">✓</span>
            <span className="text-xs text-ctp-subtext0">{meeting.accepted.length} Änderungen von allen bestätigt:{" "}
              <span className="font-mono text-[11px] text-ctp-subtext1">{meeting.accepted.map(c => c.filePath.split("/").pop()).join(", ")}</span></span>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Implement HistoryTab.tsx, GuardiansTab.tsx, MainWindow.tsx**

`apps/widget/src/renderer/components/tabs/HistoryTab.tsx`:
```tsx
import React from "react";
import type { Cycle } from "@guardian/shared";

export function HistoryTab({ cycles }: { cycles: Cycle[] }) {
  return (
    <div className="flex-1 overflow-y-auto px-8 py-6">
      <div className="max-w-[760px] mx-auto">
        <div className="text-[19px] font-bold text-ctp-text mb-4">Verlauf</div>
        {cycles.map(w => (
          <div key={w.id} className="flex items-center gap-4 bg-ctp-mantle border border-ctp-surface0 rounded-xl px-4 py-3.5 mb-2.5">
            <div className="w-[76px] shrink-0"><div className="font-mono text-[13px] font-semibold text-ctp-subtext1">{w.isoWeek}</div></div>
            <div className="flex-1 text-[12.5px] text-ctp-subtext1">{w.note ?? "abgeschlossen"}</div>
          </div>
        ))}
        {cycles.length === 0 && <div className="text-xs text-ctp-subtext0">Noch keine abgeschlossenen Wochen.</div>}
      </div>
    </div>
  );
}
```

`apps/widget/src/renderer/components/tabs/GuardiansTab.tsx`:
```tsx
import React, { useState } from "react";
import type { Guardian } from "@guardian/shared";

interface Props {
  guardians: Guardian[];
  pending: { code: string; name: string; email: string }[];
  onInvite: (name: string, email: string) => void;
}

export function GuardiansTab({ guardians, pending, onInvite }: Props) {
  const [name, setName] = useState(""), [email, setEmail] = useState("");
  return (
    <div className="flex-1 overflow-y-auto px-8 py-6">
      <div className="max-w-[640px] mx-auto">
        <div className="text-[19px] font-bold text-ctp-text">Hüter</div>
        <div className="text-[12.5px] text-ctp-subtext0 mt-1">Jede Änderung braucht die Bestätigung aller verknüpften Hüter.</div>
        <div className="mt-4 flex flex-col gap-2">
          {guardians.map(g => (
            <div key={g.id} className="flex items-center gap-3 bg-ctp-mantle border border-ctp-surface0 rounded-xl px-4 py-3">
              <div className="flex-1"><div className="text-[13px] font-semibold text-ctp-text">{g.name}</div>
                <div className="font-mono text-[10.5px] text-ctp-subtext0">{g.email}</div></div>
              <span className="text-[11px] font-semibold text-ctp-green bg-ctp-green/15 rounded-full px-2.5 py-0.5">✓ Verknüpft</span>
            </div>
          ))}
          {pending.map(p => (
            <div key={p.code} className="flex items-center gap-3 bg-ctp-base border border-dashed border-ctp-surface1 rounded-xl px-4 py-3">
              <div className="flex-1"><div className="text-[13px] font-semibold text-ctp-subtext1">{p.name}</div>
                <div className="font-mono text-[10.5px] text-ctp-subtext0">{p.email}</div></div>
              <span className="text-[11px] font-semibold text-ctp-yellow bg-ctp-yellow/15 rounded-full px-2.5 py-0.5">Code offen</span>
              <span className="font-mono text-xs text-ctp-text bg-ctp-surface0 border border-ctp-surface1 rounded px-2 py-0.5 tracking-wider">{p.code}</span>
            </div>
          ))}
        </div>
        <div className="mt-5 bg-ctp-mantle border border-ctp-surface0 rounded-xl px-4 py-4">
          <div className="text-[10.5px] tracking-wider text-ctp-subtext0 font-semibold mb-2.5">NEUEN HÜTER ANLEGEN</div>
          <div className="flex gap-2 flex-wrap">
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Name" className="flex-1 min-w-[150px] bg-ctp-base border border-ctp-surface1 rounded-lg text-ctp-subtext1 p-2.5 outline-none" />
            <input value={email} onChange={e => setEmail(e.target.value)} placeholder="E-Mail" className="flex-1 min-w-[170px] bg-ctp-base border border-ctp-surface1 rounded-lg text-ctp-subtext1 p-2.5 outline-none" />
            <button disabled={!name.trim() || !email.includes("@")} onClick={() => { onInvite(name.trim(), email.trim()); setName(""); setEmail(""); }}
              className="rounded-lg px-4 py-2 text-[12.5px] font-semibold bg-ctp-green/25 text-ctp-green border border-ctp-green/40 disabled:opacity-40">Zugangscode erzeugen</button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

`apps/widget/src/renderer/components/MainWindow.tsx`:
```tsx
import React from "react";

export type Tab = "changes" | "meeting" | "history" | "guardians";
const TABS: { id: Tab; label: string }[] = [
  { id: "changes", label: "Änderungen" }, { id: "meeting", label: "Meeting-Übersicht" },
  { id: "history", label: "Verlauf" }, { id: "guardians", label: "Hüter" },
];

export function MainWindow({ tab, onTab, onClose, children }:
  { tab: Tab; onTab: (t: Tab) => void; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-ctp-crust/60 z-30 flex items-center justify-center p-8">
      <div className="w-[1080px] max-w-full h-full max-h-[720px] bg-ctp-base border border-ctp-surface1 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center gap-3.5 px-4.5 py-3 border-b border-ctp-surface0 bg-ctp-mantle">
          <span className="text-[13px] font-semibold text-ctp-text">Memory-Bank Hüter</span>
          <div className="flex gap-0.5 ml-3">
            {TABS.map(t => (
              <div key={t.id} onClick={() => onTab(t.id)}
                className={`px-3.5 py-1.5 rounded-md text-[12.5px] cursor-pointer ${tab === t.id ? "text-ctp-text bg-ctp-surface0" : "text-ctp-subtext0"}`}>{t.label}</div>
            ))}
          </div>
          <div className="flex-1" />
          <div onClick={onClose} className="w-6.5 h-6.5 rounded-md flex items-center justify-center text-ctp-subtext0 cursor-pointer">✕</div>
        </div>
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @guardian/widget test MeetingTab`
Expected: PASS (1 test).

- [ ] **Step 6: Commit**

```bash
git add apps/widget/src/renderer/components apps/widget/test/MeetingTab.test.tsx
git commit -m "feat(widget): meeting, history, guardians tabs and main window shell"
```

---

### Task 11: Electron main process (tray, window, token persistence)

**Files:**
- Create: `apps/widget/src/main/index.ts`, `apps/widget/src/main/tokenStore.ts`, `apps/widget/src/main/ipc.ts`
- Create: `apps/widget/src/preload/index.ts`, `apps/widget/src/types/bridge.d.ts`

**Interfaces:**
- Consumes: nothing from the renderer directly; exposes IPC.
- Produces:
  - `window.guardian` bridge: `getConfig(): Promise<{ token: string | null; serverUrl: string }>`, `setToken(token: string): Promise<void>`, `clearToken(): Promise<void>`, `setServerUrl(url: string): Promise<void>`.
  - Main process: a single-instance app, a `Tray` whose click toggles a small frameless window pinned bottom-right, and persistence via electron-store.

- [ ] **Step 1: tokenStore.ts**

`apps/widget/src/main/tokenStore.ts`:
```ts
import Store from "electron-store";

interface Schema { token: string | null; serverUrl: string }
const store = new Store<Schema>({ defaults: { token: null, serverUrl: "http://localhost:4000" } });

export const tokenStore = {
  get(): Schema { return { token: store.get("token"), serverUrl: store.get("serverUrl") }; },
  setToken(token: string) { store.set("token", token); },
  clearToken() { store.set("token", null); },
  setServerUrl(url: string) { store.set("serverUrl", url); },
};
```

- [ ] **Step 2: ipc.ts + preload + bridge typing**

`apps/widget/src/main/ipc.ts`:
```ts
import { ipcMain } from "electron";
import { tokenStore } from "./tokenStore.js";

export function registerIpc() {
  ipcMain.handle("guardian:getConfig", () => tokenStore.get());
  ipcMain.handle("guardian:setToken", (_e, token: string) => tokenStore.setToken(token));
  ipcMain.handle("guardian:clearToken", () => tokenStore.clearToken());
  ipcMain.handle("guardian:setServerUrl", (_e, url: string) => tokenStore.setServerUrl(url));
}
```

`apps/widget/src/preload/index.ts`:
```ts
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("guardian", {
  getConfig: () => ipcRenderer.invoke("guardian:getConfig"),
  setToken: (token: string) => ipcRenderer.invoke("guardian:setToken", token),
  clearToken: () => ipcRenderer.invoke("guardian:clearToken"),
  setServerUrl: (url: string) => ipcRenderer.invoke("guardian:setServerUrl", url),
});
```

`apps/widget/src/types/bridge.d.ts`:
```ts
export interface GuardianBridge {
  getConfig(): Promise<{ token: string | null; serverUrl: string }>;
  setToken(token: string): Promise<void>;
  clearToken(): Promise<void>;
  setServerUrl(url: string): Promise<void>;
}
declare global { interface Window { guardian: GuardianBridge } }
```

- [ ] **Step 3: main/index.ts (tray + bottom-right window + single instance)**

`apps/widget/src/main/index.ts`:
```ts
import { app, BrowserWindow, Tray, nativeImage, screen } from "electron";
import { join } from "node:path";
import { registerIpc } from "./ipc.js";

let win: BrowserWindow | null = null;
let tray: Tray | null = null;

function createWindow() {
  win = new BrowserWindow({
    width: 380, height: 560, show: false, frame: false, resizable: false, skipTaskbar: true,
    webPreferences: { preload: join(import.meta.dirname, "../preload/index.js"), contextIsolation: true },
  });
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else win.loadFile(join(import.meta.dirname, "../renderer/index.html"));
  win.on("blur", () => win?.hide());
}

function positionBottomRight() {
  if (!win) return;
  const { workArea } = screen.getPrimaryDisplay();
  const b = win.getBounds();
  win.setPosition(workArea.x + workArea.width - b.width - 24, workArea.y + workArea.height - b.height - 24);
}

function toggle() {
  if (!win) return;
  if (win.isVisible()) { win.hide(); return; }
  positionBottomRight(); win.show(); win.focus();
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", () => toggle());
  app.whenReady().then(() => {
    registerIpc();
    createWindow();
    const icon = nativeImage.createEmpty();
    tray = new Tray(icon);
    tray.setToolTip("Memory-Bank Hüter");
    tray.on("click", () => toggle());
  });
  app.on("window-all-closed", () => { /* keep running in tray */ });
}
```

- [ ] **Step 4: Verify the app builds**

Run: `pnpm --filter @guardian/widget build`
Expected: `electron-vite build` completes; `out/main/index.js`, `out/preload/index.js`, `out/renderer/index.html` exist.

- [ ] **Step 5: Commit**

```bash
git add apps/widget/src/main apps/widget/src/preload apps/widget/src/types
git commit -m "feat(widget): electron main process with tray and token persistence"
```

---

### Task 12: Wire renderer to bridge + store, and manual run

**Files:**
- Modify: `apps/widget/src/renderer/main.tsx`
- Create: `apps/widget/src/renderer/AppRoot.tsx`

**Interfaces:**
- Consumes: `window.guardian`, `ApiClient`, `subscribe`, store, all components.
- Produces: the composed app — on mount, read config; if no token show `<SetupDialog>`, else build `ApiClient`, `refresh()`, `subscribe()` to WS, render `<TrayWidget>` + optional `<Toast>` + `<MainWindow>` with the four tabs; "wechseln" clears the token.

- [ ] **Step 1: Implement AppRoot.tsx**

`apps/widget/src/renderer/AppRoot.tsx`:
```tsx
import React, { useEffect, useMemo, useState } from "react";
import { useStore } from "zustand";
import type { Guardian } from "@guardian/shared";
import { ApiClient } from "./api/client.js";
import { subscribe } from "./api/ws.js";
import { createGuardianStore } from "./store.js";
import { SetupDialog } from "./components/SetupDialog.js";
import { TrayWidget } from "./components/TrayWidget.js";
import { Toast } from "./components/Toast.js";
import { MainWindow, type Tab } from "./components/MainWindow.js";
import { ChangesTab } from "./components/tabs/ChangesTab.js";
import { MeetingTab } from "./components/tabs/MeetingTab.js";
import { HistoryTab } from "./components/tabs/HistoryTab.js";
import { GuardiansTab } from "./components/tabs/GuardiansTab.js";

// AppRoot only loads config and decides setup-vs-linked. It must NOT create the
// store or call useStore, because the store only exists once a token is present —
// a conditional hook would violate React's Rules of Hooks. The linked UI (with its
// store hook) lives in LinkedApp, which is only mounted when a token exists.
export function AppRoot() {
  const [cfg, setCfg] = useState<{ token: string | null; serverUrl: string } | null>(null);
  useEffect(() => { window.guardian.getConfig().then(setCfg); }, []);

  if (!cfg) return null;
  if (!cfg.token) {
    return <SetupDialog api={new ApiClient(cfg.serverUrl, null)} onLinked={async (token) => {
      await window.guardian.setToken(token);
      setCfg(await window.guardian.getConfig());
    }} />;
  }
  // Token present → linked app. `key={cfg.token}` remounts cleanly on a re-link.
  return <LinkedApp key={cfg.token} serverUrl={cfg.serverUrl} token={cfg.token} />;
}

// Only mounted when a token exists, so api/store are always defined and every hook
// (useMemo, useStore, useState, useEffect) is called unconditionally on every render.
function LinkedApp({ serverUrl, token }: { serverUrl: string; token: string }) {
  const api = useMemo(() => new ApiClient(serverUrl, token), [serverUrl, token]);
  const store = useMemo(() => createGuardianStore(api), [api]);
  const state = useStore(store);
  const [me, setMe] = useState<Guardian | null>(null);
  const [collapsed, setCollapsed] = useState(true);
  const [windowOpen, setWindowOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("changes");

  useEffect(() => {
    let alive = true;
    api.getMe().then((r) => { if (alive) setMe(r.guardian); }).catch(() => {});
    void store.getState().refresh();
    const off = subscribe(serverUrl, token, (e) => store.getState().onWsEvent(e));
    return () => { alive = false; off(); };
  }, [api, store, serverUrl, token]);

  const guardianId = me?.id ?? "";
  const openChange = (id: string) => { store.getState().select(id); setTab("changes"); setWindowOpen(true); };

  return (
    <div className="fixed right-6 bottom-6 flex flex-col items-end gap-3">
      {state.toast && (() => {
        const c = [...state.active, ...state.accepted].find((x) => x.id === state.toast!.changeId);
        return c ? <Toast change={c} onView={() => openChange(c.id)} onDismiss={() => store.getState().dismissToast()} /> : null;
      })()}
      <TrayWidget active={state.active} accepted={state.accepted} badge={state.badge}
        guardianId={guardianId} guardianName={me?.name ?? "…"} collapsed={collapsed}
        onOpen={openChange} onOpenMeeting={() => { setTab("meeting"); setWindowOpen(true); }}
        onOpenHistory={() => { setTab("history"); setWindowOpen(true); }} onToggle={() => setCollapsed((c) => !c)} />

      {windowOpen && (
        <MainWindow tab={tab} onTab={setTab} onClose={() => setWindowOpen(false)}>
          {tab === "changes" && <ChangesTab active={state.active} accepted={state.accepted} selectedId={state.selectedId}
            guardianId={guardianId} onSelect={(id) => store.getState().select(id)}
            onVote={(id, s, c) => store.getState().castVote(id, s, c)} />}
          {tab === "meeting" && <MeetingPanel api={api} />}
          {tab === "history" && <HistoryPanel api={api} />}
          {tab === "guardians" && <GuardiansPanel api={api} />}
        </MainWindow>
      )}
    </div>
  );
}

function MeetingPanel({ api }: { api: ApiClient }) {
  const [m, setM] = useState<any>(null);
  useEffect(() => { api.getMeeting().then(setM); }, [api]);
  return m ? <MeetingTab meeting={m} onOpen={() => {}} /> : null;
}
function HistoryPanel({ api }: { api: ApiClient }) {
  const [c, setC] = useState<any>(null);
  useEffect(() => { api.getHistory().then(r => setC(r.cycles)); }, [api]);
  return c ? <HistoryTab cycles={c} /> : null;
}
function GuardiansPanel({ api }: { api: ApiClient }) {
  const [d, setD] = useState<any>(null);
  const load = () => api.getGuardians().then(setD);
  useEffect(() => { load(); }, [api]);
  return d ? <GuardiansTab guardians={d.guardians} pending={d.pending} onInvite={(n, e) => api.invite(n, e).then(load)} /> : null;
}
```
_Note: `LinkedApp` uses `api.getMe()` (added to `ApiClient` in Task 5) to learn the current guardian. The two-component split (`AppRoot` → `LinkedApp`) exists specifically so the store hook (`useStore`) is only ever called in a component that always has a store — never conditionally. Do not collapse them back into one component with a `store ? useStore(store) : null` guard; that breaks the Rules of Hooks._

- [ ] **Step 2: Wire main.tsx to AppRoot**

`apps/widget/src/renderer/main.tsx` (replace the placeholder App):
```tsx
import React from "react";
import { createRoot } from "react-dom/client";
import { AppRoot } from "./AppRoot.js";
import "./index.css";

export function App() { return <AppRoot />; }

const el = document.getElementById("root");
if (el) createRoot(el).render(<App />);
```
_Update `test/smoke.test.tsx`: it now needs a `window.guardian` stub. Add at the top of the test:_
```tsx
(globalThis as any).window.guardian = {
  getConfig: async () => ({ token: null, serverUrl: "http://s" }),
  setToken: async () => {}, clearToken: async () => {}, setServerUrl: async () => {},
};
```
_and — because `AppRoot` now loads config asynchronously (`getConfig()` is a promise) — make the smoke test `async` and use `await screen.findByText("Gerät verknüpfen")` (not the synchronous `getByText`), so it waits for the config-driven first render._

- [ ] **Step 3: Confirm getMe() exists on ApiClient**

`getMe()` was already added to `apps/widget/src/renderer/api/client.ts` in Task 5:
```ts
getMe() { return this.req<{ guardian: import("@guardian/shared").Guardian }>("GET", "/me"); }
```
Verify it is present (it is called by `LinkedApp`). No new change to `client.ts` is needed in this task; if for any reason it is missing, add it now.

- [ ] **Step 4: Full suite + build**

Run: `pnpm install && pnpm -r build && pnpm --filter @guardian/widget test`
Expected: build succeeds; all widget tests PASS.

- [ ] **Step 5: Manual run against the server**

With `guardian-server` running (see its plan, Task 10) and reachable at `http://localhost:4000`:
```bash
pnpm --filter @guardian/widget dev
```
Verify: tray icon appears; clicking it shows the bottom-right widget; first run shows the setup dialog; entering the server's setup code founds a guardian; the widget then lists changes and voting works (mandatory comment enforced), with the toast appearing on a new change (trigger by committing to the watched branch or via a test push).

- [ ] **Step 6: Commit**

```bash
git add apps/widget/src/renderer/main.tsx apps/widget/src/renderer/AppRoot.tsx apps/widget/test/smoke.test.tsx
git commit -m "feat(widget): compose app, wire store, WS, and IPC bridge"
```

---

## Self-Review

**Spec coverage (widget-relevant sections):**

- §7 mechanical diff (block + word LCS, rendered markdown, new-file banner) → Tasks 3–4. ✓
- §8 onboarding UI (redeem + init) → Task 7. ✓
- §9 vote flow with mandatory comment, "Neu bewerten", all-accepted side-note → Task 9. ✓
- §10 all screens (setup, tray collapsed/expanded/toast, main window 4 tabs) + Catppuccin mapping → Tasks 2, 7–10. ✓
- §11 REST + WS client → Task 5; store consumes events → Task 6. ✓
- §12/§14 server URL + device token persisted locally, PAT never touches the client → Task 11. ✓
- §13 API errors surfaced (ApiError → dialog/message) → Tasks 5, 7. ✓

**Placeholder scan:** No TBD/TODO. The `AppRoot` `getMe` detail is resolved explicitly in Task 12 Step 3 (add `getMe()` to `ApiClient`). Two intentional simplifications, both stated: the collapsed/expanded toggle keeps the same window (no separate OS-native mini-window), and `HistoryTab` renders the note line rather than the mockup's per-week result chips (chips are a visual nicety; add later if wanted).

**Type consistency:** All components consume `@guardian/shared` (`ChangeWithVotes`, `Vote`, `VoteStatus`, `Guardian`, `Cycle`, `STATUS_LABELS`, `fileType`). `ApiClient` response types (`ChangesResponse`, `MeetingResponse`, `AuthResponse`) are defined in Task 5 and reused in the store and panels. `HubEvent` type matches the server's broadcast payload (server plan Task 8). Store action names (`refresh`, `select`, `castVote`, `onWsEvent`, `dismissToast`) match their call sites in `AppRoot`. Theme helper names (`statusText`, `statusDot`, `typeBadge`) match every consumer.

**Cross-plan contract:** This app depends only on the server's public HTTP/WS surface (server plan Task 9–10) and `@guardian/shared`. No server internals are imported. If the server's `/me`, `/changes`, `/meeting`, `/guardians`, `/history`, `/cycles/:id/close` shapes change, update `ApiClient` (Task 5) and the panels (Task 12) together.
