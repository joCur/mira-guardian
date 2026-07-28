import React, { useEffect, useMemo, useState } from "react";
import { useStore } from "zustand";
import type { Guardian } from "@guardian/shared";
import { ApiClient } from "./api/client.js";
import { subscribe } from "./api/ws.js";
import { catchUpChanges } from "./api/catchUp.js";
import { createGuardianStore } from "./store.js";
import { SetupDialog } from "./components/SetupDialog.js";
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
  const [guardians, setGuardians] = useState<Guardian[]>([]);
  const [tab, setTab] = useState<Tab>("changes");

  useEffect(() => {
    let alive = true;
    api.getGuardians().then((r) => { if (alive) setGuardians(r.guardians); }).catch(() => {});

    // Beim Start und nach jedem Reconnect: Stand laden und verpasste Änderungen
    // nachträglich toasten. Die Wasserlinie (lastSeenChangeAt) lebt im
    // electron-store, damit sie App-Neustarts überlebt.
    const sync = async () => {
      const [meR, lastSeen] = await Promise.all([api.getMe(), window.guardian.getLastSeenChange()]);
      if (!alive) return;
      setMe(meR.guardian);
      await store.getState().refresh();
      if (!alive) return;
      const st = store.getState();
      const { toToast, watermark } = catchUpChanges(
        [...st.active, ...st.accepted], meR.guardian.id, lastSeen, new Date().toISOString());
      for (const c of toToast) {
        void window.guardian.showToast({
          changeId: c.id, filePath: c.filePath, summary: c.summary,
          authorName: c.authorName, changeKind: c.changeKind,
        });
      }
      void window.guardian.bumpLastSeenChange(watermark);
    };
    sync().catch(() => { /* Server (noch) nicht erreichbar — Reconnect holt nach */ });

    const off = subscribe(serverUrl, token, (e) => {
      if (e.type === "change:new" && e.changeId) {
        // Custom-Toast im eigenen Fenster: Details der frischen Änderung direkt
        // vom Server holen, nicht aus dem noch nicht aktualisierten Store.
        void api.getChange(e.changeId)
          .then((c) => {
            void window.guardian.showToast({
              changeId: c.id, filePath: c.filePath, summary: c.summary,
              authorName: c.authorName, changeKind: c.changeKind,
            });
            void window.guardian.bumpLastSeenChange(c.firstSeenAt);
          })
          .catch(() => {});
      }
      store.getState().onWsEvent(e);
    }, () => { void sync().catch(() => {}); });
    // "Ansehen" im Toast → Main-Prozess zeigt das Fenster und meldet die Change-Id.
    const offOpen = window.guardian.onOpenChange((id) => { store.getState().select(id); setTab("changes"); });
    return () => { alive = false; off(); offOpen(); };
  }, [api, store, serverUrl, token]);

  const guardianId = me?.id ?? "";
  const openChange = (id: string) => { store.getState().select(id); setTab("changes"); };

  return (
    <MainWindow tab={tab} onTab={setTab} onClose={() => void window.guardian.hideWindow()}>
      {tab === "changes" && <ChangesTab active={state.active} accepted={state.accepted} selectedId={state.selectedId}
        guardianId={guardianId} guardians={guardians} onSelect={(id) => store.getState().select(id)}
        onVote={(id, s, c) => store.getState().castVote(id, s, c)} />}
      {tab === "meeting" && <MeetingPanel api={api} guardians={guardians} onOpen={openChange} onClosed={() => store.getState().refresh()} />}
      {tab === "history" && <HistoryPanel api={api} />}
      {tab === "guardians" && <GuardiansPanel api={api} />}
    </MainWindow>
  );
}

function MeetingPanel({ api, guardians, onOpen, onClosed }:
  { api: ApiClient; guardians: Guardian[]; onOpen: (id: string) => void; onClosed: () => void }) {
  const [m, setM] = useState<any>(null);
  const load = () => api.getMeeting().then(setM);
  useEffect(() => { load(); }, [api]);
  const handleClose = async (note: string) => {
    if (!m?.cycle) return;
    await api.closeCycle(m.cycle.id, note.trim() || null);
    await load();
    onClosed();
  };
  return m ? <MeetingTab meeting={m} guardians={guardians} onOpen={onOpen} onClose={handleClose} /> : null;
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
