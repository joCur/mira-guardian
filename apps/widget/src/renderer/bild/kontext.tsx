import React, { createContext, useContext, useEffect, useState } from "react";
import type { ApiClient } from "../api/client.js";

export type Bildseite = "vorher" | "nachher";

const ApiKontext = createContext<ApiClient | null>(null);

export function ApiProvider({ api, children }: { api: ApiClient; children: React.ReactNode }) {
  return <ApiKontext.Provider value={api}>{children}</ApiKontext.Provider>;
}

export function useApi(): ApiClient | null {
  return useContext(ApiKontext);
}

/**
 * Welche Änderung und welche Seite gerade gezeichnet wird. Ein Bild, das ein
 * Dokument einbettet, kennt nur seinen relativen Pfad — erst hierüber weiß es,
 * ob es die Fassung von vorher oder die von nachher zeigen soll.
 */
const SeitenKontext = createContext<{ changeId: string; seite: Bildseite } | null>(null);

export function BildseiteProvider({ changeId, seite, children }:
  { changeId: string; seite: Bildseite; children: React.ReactNode }) {
  const wert = React.useMemo(() => ({ changeId, seite }), [changeId, seite]);
  return <SeitenKontext.Provider value={wert}>{children}</SeitenKontext.Provider>;
}

export function useBildseite() {
  return useContext(SeitenKontext);
}

/**
 * Innerhalb eines umformulierten Absatzes stehen alte und neue Fassung
 * nebeneinander, als gelöschte und eingefügte Stellen. Ein Bild in einer
 * gelöschten Stelle gehört zur alten Fassung, auch wenn der Block als Ganzes
 * die neue zeigt.
 */
export function BildseiteUmschalten({ seite, children }:
  { seite: Bildseite; children: React.ReactNode }) {
  const k = useBildseite();
  if (!k) return <>{children}</>;
  return <BildseiteProvider changeId={k.changeId} seite={seite}>{children}</BildseiteProvider>;
}

export type BildStand =
  | { status: "laedt" }
  | { status: "da"; url: string }
  | { status: "fehlt" }
  | { status: "fehler" };

/**
 * Lädt ein Bild über den Server und gibt eine Blob-Adresse zurück. Der Abruf
 * geht nicht direkt an ADO: der braucht Zugangsdaten, die im Widget nichts zu
 * suchen haben. Die Adresse wird wieder freigegeben, sobald das Bild nicht
 * mehr angezeigt wird — sonst hält jeder Blick auf eine Änderung Speicher fest.
 */
export function useBild(changeId: string | null, seite: Bildseite, pfad?: string): BildStand {
  const api = useApi();
  const [stand, setStand] = useState<BildStand>({ status: "laedt" });

  useEffect(() => {
    if (!api || !changeId) { setStand({ status: "fehler" }); return; }
    let aktiv = true;
    let url: string | null = null;
    setStand({ status: "laedt" });
    api.ladeBild(changeId, seite, pfad)
      .then(blob => {
        if (!aktiv) return;
        if (!blob) { setStand({ status: "fehlt" }); return; }
        url = URL.createObjectURL(blob);
        setStand({ status: "da", url });
      })
      .catch(() => { if (aktiv) setStand({ status: "fehler" }); });
    return () => { aktiv = false; if (url) URL.revokeObjectURL(url); };
  }, [api, changeId, seite, pfad]);

  return stand;
}
