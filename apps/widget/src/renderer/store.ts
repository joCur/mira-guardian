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
  /**
   * Einzeln nachgeladene Änderung, die in keiner der beiden Listen steht, weil
   * alle Hüter sie akzeptiert haben. Der Verlauf öffnet genau solche — ohne
   * diesen Platz fiel der Änderungen-Tab auf die erste offene Änderung zurück.
   */
  fromHistory: ChangeWithVotes | null;
  badge: number;
  selectedId: string | null;
  refresh: () => Promise<void>;
  select: (id: string) => Promise<void>;
  castVote: (id: string, status: VoteStatus, comment: string) => Promise<void>;
  onWsEvent: (e: HubEvent) => void;
}

type Lists = { toRate: ChangeWithVotes[]; acceptedByMe: ChangeWithVotes[] };
const listed = (l: Lists, id: string) => [...l.toRate, ...l.acceptedByMe].some(c => c.id === id);

export function createGuardianStore(api: ApiClient) {
  return createStore<GuardianState>((set, get) => ({
    toRate: [], acceptedByMe: [], fromHistory: null, badge: 0, selectedId: null,

    async refresh() {
      const r = await api.getChanges();
      const sel = get().selectedId;
      // Steht die einzeln geladene Änderung wieder in einer Liste (jemand hat sie
      // neu bewertet), gehört sie dorthin — sonst stünde sie zweimal da.
      const held = get().fromHistory;
      const fromHistory = held && !listed(r, held.id) ? held : null;
      const stillValid = sel && (listed(r, sel) || fromHistory?.id === sel);
      set({
        toRate: r.toRate, acceptedByMe: r.acceptedByMe, badge: r.badge, fromHistory,
        selectedId: stillValid ? sel : (r.toRate[0]?.id ?? r.acceptedByMe[0]?.id ?? null),
      });
    },

    // Aus dem Verlauf und aus einem Toast kommen Ids, die nicht in der
    // Arbeitsliste stehen müssen. Dann wird die Änderung einzeln nachgeladen.
    // Scheitert das, bleibt die bisherige Auswahl stehen — besser als eine
    // fremde Änderung zu zeigen, die wie die angeklickte aussieht.
    async select(id) {
      if (listed(get(), id)) { set({ selectedId: id, fromHistory: null }); return; }
      if (get().fromHistory?.id === id) { set({ selectedId: id }); return; }
      try { set({ selectedId: id, fromHistory: await api.getChange(id) }); }
      catch { /* Auswahl unverändert lassen */ }
    },

    async castVote(id, status, comment) {
      const before = get().toRate;
      const wasFromHistory = get().fromHistory?.id === id;
      const updated = await api.vote(id, status, comment);
      const r = await api.getChanges();
      // Aus dem Verlauf geöffnet: die Auswahl bleibt auf dieser Änderung, denn
      // ihretwegen ist man hier. Weiterrücken gilt nur fürs Abarbeiten der Liste.
      const next = wasFromHistory ? id : nextSelection(before, id, r.toRate);
      set({
        toRate: r.toRate, acceptedByMe: r.acceptedByMe, badge: r.badge,
        fromHistory: wasFromHistory ? (listed(r, id) ? null : updated) : get().fromHistory,
        selectedId: next ?? r.acceptedByMe[0]?.id ?? null,
      });
    },

    onWsEvent() {
      void get().refresh();
    },
  }));
}
