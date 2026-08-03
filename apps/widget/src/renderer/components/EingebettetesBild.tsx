import React, { useState } from "react";
import { useBild, useBildseite } from "../bild/kontext.js";
import { Lupe } from "./Lupe.js";

const istExtern = (src: string) => /^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith("//");

/**
 * Ein Bild, das ein Dokument einbettet. Der Markdown-Quelltext kennt nur einen
 * Pfad relativ zum Dokument; geholt wird es über den Server, und zwar in der
 * Fassung der Seite, auf der es steht — im gelöschten Block die alte, sonst die
 * neue.
 *
 * Adressen ins Netz werden nicht geladen, sondern nur benannt: Eine Doku darf
 * nicht dafür sorgen, dass das Widget beim bloßen Ansehen fremde Server
 * kontaktiert.
 */
export function EingebettetesBild({ src, alt }: { src?: string; alt?: string }) {
  const kontext = useBildseite();
  const relativ = src && !istExtern(src) ? src : undefined;
  const stand = useBild(kontext && relativ ? kontext.changeId : null, kontext?.seite ?? "nachher", relativ);
  const [gross, setGross] = useState(false);

  if (!src) return null;
  if (istExtern(src)) {
    return (
      <span className="inline-flex items-center gap-1.5 bg-ctp-surface0 border border-ctp-surface1 rounded px-2 py-1 my-1 text-[11.5px] text-ctp-subtext0">
        <span aria-hidden>🔗</span>
        <span>Bild von außerhalb: <span className="font-mono break-all">{src}</span></span>
      </span>
    );
  }
  if (!kontext) return null;

  const beschriftung = alt?.trim();
  return (
    <span className="block my-2">
      {stand.status === "laedt" && <span className="block h-[120px] rounded-md bg-ctp-surface0 animate-pulse" />}
      {(stand.status === "fehlt" || stand.status === "fehler") && (
        <span className="block bg-ctp-surface0/60 rounded-md px-3 py-2 text-[11.5px] text-ctp-subtext0">
          {stand.status === "fehlt" ? "Bild in dieser Fassung nicht vorhanden" : "Bild nicht abrufbar"}
          {beschriftung ? `: ${beschriftung}` : ""}
        </span>
      )}
      {stand.status === "da" && (
        <>
          <button type="button" onClick={() => setGross(true)}
            className="block w-full bg-white rounded-md overflow-hidden cursor-zoom-in" title="Klicken zum Vergrößern">
            <img src={stand.url} alt={beschriftung ?? ""} className="max-h-[340px] w-full object-contain" />
          </button>
          {beschriftung && <span className="block text-[11px] text-ctp-subtext0 mt-1">{beschriftung}</span>}
          {gross && <Lupe url={stand.url} onZu={() => setGross(false)} />}
        </>
      )}
    </span>
  );
}
