import React, { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "zustand";
import type { Device, Guardian } from "@guardian/shared";
import { tagAus, wirksamAbwesende } from "@guardian/shared";
import type { UpdateStatus } from "../types/update.js";
import { ApiClient, type MeetingResponse, type HistoryEntry } from "./api/client.js";
import { subscribe } from "./api/ws.js";
import { catchUpChanges } from "./api/catchUp.js";
import { createGuardianStore } from "./store.js";
import { ApiProvider } from "./bild/kontext.js";
import { useUpdateStatus } from "./useUpdateStatus.js";
import { SetupDialog } from "./components/SetupDialog.js";
import { UpdateBadge } from "./components/UpdateBadge.js";
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
  // Update-Zustand und eigene Version sitzen hier, weil beide an zwei Stellen
  // gebraucht werden: im Hinweis der Titelleiste und in der Versionsanzeige
  // des Hüter-Tabs.
  const update = useUpdateStatus();
  const [appVersion, setAppVersion] = useState("");
  // Der WS-Handler lebt länger als ein Render — eigene Id und Abwesenheit liegen
  // deshalb in Refs und nicht im State, den der Handler nur veraltet sähe.
  const meIdRef = useRef("");
  const abwesendRef = useRef(false);
  useEffect(() => { void window.guardian.getAppVersion().then(setAppVersion).catch(() => {}); }, []);

  useEffect(() => {
    let alive = true;
    const ladeHueter = () => api.getGuardians()
      .then((r) => {
        if (!alive) return;
        setGuardians(r.guardians);
        if (meIdRef.current) {
          abwesendRef.current = wirksamAbwesende(r.guardians, tagAus(new Date().toISOString()))
            .some(g => g.id === meIdRef.current);
        }
      })
      .catch(() => {});
    void ladeHueter();

    // Beim Start und nach jedem Reconnect: Stand laden und verpasste Änderungen
    // nachträglich toasten. Die Wasserlinie (lastSeenChangeAt) lebt im
    // electron-store, damit sie App-Neustarts überlebt.
    const sync = async () => {
      const [meR, lastSeen, gs] = await Promise.all([
        api.getMe(), window.guardian.getLastSeenChange(), api.getGuardians().catch(() => null),
      ]);
      if (!alive) return;
      setMe(meR.guardian);
      meIdRef.current = meR.guardian.id;
      if (gs) setGuardians(gs.guardians);
      await store.getState().refresh();
      if (!alive) return;
      const st = store.getState();
      const { toToast, watermark } = catchUpChanges(
        [...st.toRate, ...st.acceptedByMe], meR.guardian.id, lastSeen, new Date().toISOString());
      // Wer abwesend ist, wird nicht benachrichtigt: die Liste wartet nicht auf
      // ihn. Nach der Rückkehr steht die Leseliste bereit.
      const abwesend = wirksamAbwesende(gs?.guardians ?? [], tagAus(new Date().toISOString()))
        .some(g => g.id === meR.guardian.id);
      abwesendRef.current = abwesend;
      if (!abwesend) {
        for (const c of toToast) {
          void window.guardian.showToast({
            changeId: c.id, filePath: c.filePath, summary: c.summary,
            authorName: c.authorName, changeKind: c.changeKind,
          });
        }
      }
      void window.guardian.bumpLastSeenChange(watermark);
    };
    sync().catch(() => { /* Server (noch) nicht erreichbar — Reconnect holt nach */ });

    const off = subscribe(serverUrl, token, (e) => {
      // Eine geänderte Abwesenheit verschiebt Zuständigkeiten: die Hüterzeile
      // im Meeting und die Chips im Hüter-Tab müssen den neuen Stand zeigen.
      if (e.type === "guardian:added" || e.type === "guardian:updated") void ladeHueter();
      if (e.type === "change:new" && e.changeId && !abwesendRef.current) {
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
    const offOpen = window.guardian.onOpenChange((id) => { void store.getState().select(id); setTab("changes"); });
    return () => { alive = false; off(); offOpen(); };
  }, [api, store, serverUrl, token]);

  const guardianId = me?.id ?? "";
  // Auf den Änderungen-Tab wird erst gewechselt, wenn die Änderung da ist —
  // sonst zeigte der Tab kurz die vorige Auswahl.
  const openChange = (id: string) => { void store.getState().select(id).then(() => setTab("changes")); };

  return (
    <ApiProvider api={api}>
    <MainWindow tab={tab} onTab={setTab} onClose={() => void window.guardian.hideWindow()}
      titleBarExtra={<UpdateBadge status={update} currentVersion={appVersion}
        onInstall={() => void window.guardian.installUpdate()}
        onOpenNotes={(url) => void window.guardian.openExternal(url)} />}>
      {tab === "changes" && <ChangesTab toRate={state.toRate} acceptedByMe={state.acceptedByMe} selectedId={state.selectedId}
        fromHistory={state.fromHistory} decidedWithoutMe={state.decidedWithoutMe}
        guardianId={guardianId} guardians={guardians} onSelect={(id) => void store.getState().select(id)}
        onVote={(id, s, c) => store.getState().castVote(id, s, c)}
        onSeen={(ids) => void store.getState().markSeen(ids)} />}
      {tab === "meeting" && <MeetingPanel api={api} guardians={guardians} onOpen={openChange} />}
      {tab === "history" && <HistoryPanel api={api} onOpen={openChange} />}
      {tab === "guardians" && <GuardiansPanel api={api} serverUrl={serverUrl} onSignOut={onSignOut}
        appVersion={appVersion} update={update}
        onAbsence={async (id, from, until) => {
          await api.setAbsence(id, from, until);
          // Die eigene Abwesenheit ändert Badge und Listen sofort mit.
          await store.getState().refresh();
        }} />}
    </MainWindow>
    </ApiProvider>
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
function GuardiansPanel({ api, serverUrl, onSignOut, appVersion, update, onAbsence }:
  { api: ApiClient; serverUrl: string; onSignOut: () => Promise<void>;
    appVersion: string; update: UpdateStatus;
    onAbsence: (guardianId: string, from: string | null, until: string | null) => Promise<void> }) {
  const [d, setD] = useState<any>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  // null heißt "nicht bekannt" — der Server ist nicht erreichbar oder älter als
  // diese Anzeige. Beides darf den Tab nicht aufhalten.
  const [serverVersion, setServerVersion] = useState<string | null>(null);
  const load = () => api.getGuardians().then(setD);
  // Ein Server ohne Geräteverwaltung antwortet hier mit 404 — dann bleibt der
  // Abschnitt leer statt den Tab zu blockieren.
  const loadDevices = () => api.getMyDevices().then(r => setDevices(r.devices)).catch(() => setDevices([]));
  useEffect(() => {
    load();
    void loadDevices();
    void api.getServerVersion().then(setServerVersion).catch(() => setServerVersion(null));
  }, [api]);
  return d ? <GuardiansTab guardians={d.guardians} pending={d.pending} serverUrl={serverUrl}
    onSignOut={onSignOut} onInvite={(n, e) => api.invite(n, e).then(load)}
    devices={devices} onRelink={(id) => api.relink(id)}
    onRevoke={(id) => api.revokeDevice(id).then(() => { void loadDevices(); })}
    onAbsence={(id, from, until) => onAbsence(id, from, until).then(load)}
    appVersion={appVersion} serverVersion={serverVersion}
    update={update} onCheckUpdate={() => void window.guardian.checkForUpdate()} /> : null;
}
