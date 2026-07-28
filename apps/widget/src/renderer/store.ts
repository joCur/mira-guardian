import { createStore } from "zustand/vanilla";
import type { Cycle, ChangeWithVotes, VoteStatus } from "@guardian/shared";
import type { ApiClient } from "./api/client.js";
import type { HubEvent } from "./api/ws.js";

export interface GuardianState {
  cycle: Cycle | null;
  active: ChangeWithVotes[];
  accepted: ChangeWithVotes[];
  badge: number;
  selectedId: string | null;
  refresh: () => Promise<void>;
  select: (id: string) => void;
  castVote: (id: string, status: VoteStatus, comment: string) => Promise<void>;
  onWsEvent: (e: HubEvent) => void;
}

export function createGuardianStore(api: ApiClient) {
  return createStore<GuardianState>((set, get) => ({
    cycle: null, active: [], accepted: [], badge: 0, selectedId: null,

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
    onWsEvent() {
      void get().refresh();
    },
  }));
}
