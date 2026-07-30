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

// Ab wann zwei Fassungen eines Blocks zu weit auseinanderliegen, um sie Wort
// für Wort gegenüberzustellen: Bleibt weniger als die Hälfte der Wörter gleich
// — etwa weil der Absatz übersetzt wurde —, wechselt der Wort-Diff ständig
// zwischen beiden Sprachen und ist nicht mehr zu lesen. Kurze Zeilen sind davon
// ausgenommen: "⟦-Kontext⟧ ⟦+Context⟧" liest sich besser als zwei Blöcke.
const AEHNLICH_AB = 0.5;
const ERST_AB_WORTEN = 6;

function woerter(s: string): string[] {
  return s.split(/\s+/).filter(Boolean);
}

function zuWeitAuseinander(alt: string, neu: string): boolean {
  const a = woerter(alt), b = woerter(neu);
  const laenger = Math.max(a.length, b.length);
  if (laenger < ERST_AB_WORTEN) return false;
  const gleich = lcs(a, b).reduce((n, op) => n + (op.t === "s" ? 1 : 0), 0);
  return gleich / laenger < AEHNLICH_AB;
}

// Blöcke an Leerzeilen trennen — aber nie innerhalb eines ```/~~~-Fences,
// sonst zerreißt Code mit Leerzeilen in kaputte Teilblöcke.
function splitBlocks(md: string): string[] {
  const out: string[] = [];
  let buf: string[] = [];
  let inFence = false;
  for (const line of md.trim().split("\n")) {
    const isFence = /^\s*(```|~~~)/.test(line);
    if (!inFence && !isFence && line.trim() === "") {
      if (buf.length) { out.push(buf.join("\n")); buf = []; }
      continue;
    }
    buf.push(line);
    if (isFence) inFence = !inFence;
  }
  if (buf.length) out.push(buf.join("\n"));
  return out;
}

export function diffBlocks(oldMd: string, newMd: string): DiffBlock[] {
  const ops = lcs(splitBlocks(oldMd), splitBlocks(newMd));
  const res: DiffBlock[] = []; let i = 0;
  while (i < ops.length) {
    if (ops[i].t === "s") { res.push({ kind: "same", md: ops[i].v }); i++; continue; }
    const dels: string[] = [], adds: string[] = [];
    while (i < ops.length && ops[i].t !== "s") { (ops[i].t === "d" ? dels : adds).push(ops[i].v); i++; }
    const n = Math.max(dels.length, adds.length);
    for (let k = 0; k < n; k++) {
      if (k < dels.length && k < adds.length) {
        if (zuWeitAuseinander(dels[k], adds[k])) {
          res.push({ kind: "del", md: dels[k] });
          res.push({ kind: "add", md: adds[k] });
        } else {
          res.push({ kind: "changed", md: lineDiff(dels[k], adds[k]) });
        }
      }
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
