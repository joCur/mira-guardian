import { randomUUID } from "node:crypto";
import type { Cycle } from "@guardian/shared";
import type { Store } from "../db/store.js";

export function isoWeek(iso: string): string {
  const d = new Date(iso);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

// Returns the current open cycle, creating one if none exists. Used both at
// founder setup and by the ADO poller, which must (re)open a cycle on the
// first new change after a manual close (spec §9).
export function ensureOpenCycle(store: Store, now: () => string): Cycle {
  const existing = store.getOpenCycle();
  if (existing) return existing;
  const ts = now();
  const cycle: Cycle = { id: randomUUID(), isoWeek: isoWeek(ts === "" ? new Date().toISOString() : ts),
    startsAt: ts, endsAt: null, closedAt: null, note: null };
  store.insertCycle(cycle);
  return cycle;
}
