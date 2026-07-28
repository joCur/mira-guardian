import { createStore } from "zustand/vanilla";
import type { ChangeWithVotes, VoteStatus } from "@guardian/shared";
import type { ApiClient } from "./api/client.js";
import type { HubEvent } from "./api/ws.js";
import { nextSelection } from "./nextSelection.js";

export interface GuardianState {
  /** Noch nicht von mir akzeptiert — meine Arbeitsliste. */
  toRate: ChangeWithVotes[];
  /** Von mir akzeptiert, wartet auf die übrigen Hüter. */
  acceptedByMe: ChangeWithVotes[];
  badge: number;
  selectedId: string | null;
  refresh: () => Promise<void>;
  select: (id: string) => void;
  castVote: (id: string, status: VoteStatus, comment: string) => Promise<void>;
  onWsEvent: (e: HubEvent) => void;
}

export function createGuardianStore(api: ApiClient) {
  return createStore<GuardianState>((set, get) => ({
    toRate: [], acceptedByMe: [], badge: 0, selectedId: null,

    async refresh() {
      const r = await api.getChanges();
      const sel = get().selectedId;
      const stillValid = sel && [...r.toRate, ...r.acceptedByMe].some(c => c.id === sel);
      set({
        toRate: r.toRate, acceptedByMe: r.acceptedByMe, badge: r.badge,
        selectedId: stillValid ? sel : (r.toRate[0]?.id ?? r.acceptedByMe[0]?.id ?? null),
      });
    },
    select(id) { set({ selectedId: id }); },

    async castVote(id, status, comment) {
      const before = get().toRate;
      await api.vote(id, status, comment);
      const r = await api.getChanges();
      // Auswahl weiterrücken, bevor der neue Stand die Liste ersetzt.
      const next = nextSelection(before, id, r.toRate);
      set({
        toRate: r.toRate, acceptedByMe: r.acceptedByMe, badge: r.badge,
        selectedId: next ?? r.acceptedByMe[0]?.id ?? null,
      });
    },

    onWsEvent() {
      void get().refresh();
    },
  }));
}
