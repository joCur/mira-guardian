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
    const scalar = (x: unknown) => (x === null || x === undefined ? "" : String(x));
    if (Array.isArray(v)) out.set(key, v.map(scalar));
    else if (v && typeof v === "object") for (const [k2, v2] of flatten(v as Record<string, unknown>, key)) out.set(k2, v2);
    else out.set(key, [scalar(v)]);
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
