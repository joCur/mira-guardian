import React, { useEffect, useMemo, useState } from "react";
import { useStore } from "zustand";
import type { Guardian } from "@guardian/shared";
import { ApiClient, type MeetingResponse, type HistoryEntry } from "./api/client.js";
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
    return <SetupDialog api={new ApiClient(cfg.serverUrl, null)} serverUrl={cfg.serverUrl}
      onServerUrl={async (url) => { await window.guardian.setServerUrl(url); setCfg(await window.guardian.getConfig()); }}
      onLinked={async (token) => {
        await window.guardian.setToken(token);
        setCfg(await window.guardian.getConfig());
      }} />;
  }
  // Token present → linked app. `key={cfg.token}` remounts cleanly on a re-link.
  // key enthält die Server-URL, damit ein Adresswechsel Client und Store
  // sauber neu aufbaut (neue Verbindung, frischer Stand).
  return <LinkedApp key={`${cfg.token}@${cfg.serverUrl}`} serverUrl={cfg.serverUrl} token={cfg.token}
    onSignOut={async () => { await window.guardian.clearToken(); setCfg(await window.guardian.getConfig()); }} />;
}

// Only mounted when a token exists, so api/store are always defined and every hook
// (useMemo, useStore, useState, useEffect) is called unconditionally on every render.
function LinkedApp({ serverUrl, token, onSignOut }: { serverUrl: string; token: string; onSignOut: () => Promise<void> }) {
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
        [...st.toRate, ...st.acceptedByMe], meR.guardian.id, lastSeen, new Date().toISOString());
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
      {tab === "changes" && <ChangesTab toRate={state.toRate} acceptedByMe={state.acceptedByMe} selectedId={state.selectedId}
        guardianId={guardianId} guardians={guardians} onSelect={(id) => store.getState().select(id)}
        onVote={(id, s, c) => store.getState().castVote(id, s, c)} />}
      {tab === "meeting" && <MeetingPanel api={api} guardians={guardians} onOpen={openChange} />}
      {tab === "history" && <HistoryPanel api={api} onOpen={openChange} />}
      {tab === "guardians" && <GuardiansPanel api={api} serverUrl={serverUrl} onSignOut={onSignOut} />}
    </MainWindow>
  );
}

function MeetingPanel({ api, guardians, onOpen }:
  { api: ApiClient; guardians: Guardian[]; onOpen: (id: string) => void }) {
  const [m, setM] = useState<MeetingResponse | null>(null);
  useEffect(() => { void api.getMeeting().then(setM).catch(() => {}); }, [api]);
  return m ? <MeetingTab meeting={m} guardians={guardians} onOpen={onOpen} /> : null;
}
function HistoryPanel({ api, onOpen }: { api: ApiClient; onOpen: (id: string) => void }) {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  useEffect(() => { void api.getMyHistory().then(r => setEntries(r.entries)).catch(() => {}); }, [api]);
  return entries ? <HistoryTab entries={entries} onOpen={onOpen} /> : null;
}
function GuardiansPanel({ api, serverUrl, onSignOut }:
  { api: ApiClient; serverUrl: string; onSignOut: () => Promise<void> }) {
  const [d, setD] = useState<any>(null);
  const load = () => api.getGuardians().then(setD);
  useEffect(() => { load(); }, [api]);
  return d ? <GuardiansTab guardians={d.guardians} pending={d.pending} serverUrl={serverUrl}
    onSignOut={onSignOut} onInvite={(n, e) => api.invite(n, e).then(load)} /> : null;
}
