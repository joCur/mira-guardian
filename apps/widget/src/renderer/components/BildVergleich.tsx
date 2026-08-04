import React, { useState } from "react";
import type { ChangeWithVotes } from "@guardian/shared";
import { useBild, type Bildseite, type BildStand } from "../bild/kontext.js";
import { Lupe } from "./Lupe.js";

const AKZENT: Record<Bildseite, { rand: string; text: string; titel: string }> = {
  vorher: { rand: "border-ctp-red", text: "text-ctp-red", titel: "VORHER" },
  nachher: { rand: "border-ctp-green", text: "text-ctp-green", titel: "NACHHER" },
};

const FLAECHE = "rounded-md flex items-center justify-center overflow-hidden";
/**
 * Diagramme werden fast immer für hellen Grund gezeichnet und sind oft
 * transparent. Auf der dunklen Oberfläche wären dunkle Linien auf
 * durchsichtigem Grund unsichtbar — deshalb steht jedes Bild auf Weiß. Wo
 * kein Bild ist, bleibt die Fläche dunkel: ein weißer Kasten sähe aus wie ein
 * leeres Bild.
 */
const BILDFLAECHE = `${FLAECHE} bg-white`;

function Platzhalter({ text, ton }: { text: string; ton: "warten" | "leer" }) {
  return (
    <div className={`${FLAECHE} h-[140px] ${ton === "warten" ? "animate-pulse bg-ctp-surface0" : "bg-ctp-surface0/50 border border-ctp-surface0"}`}>
      <span className="text-[13px] text-ctp-subtext0">{text}</span>
    </div>
  );
}

function Tafel({ seite, stand, alt, onGross, einzeln }:
  { seite: Bildseite; stand: BildStand; alt: string; onGross: (url: string) => void; einzeln: boolean }) {
  const a = AKZENT[seite];
  const [masse, setMasse] = useState<string | null>(null);

  return (
    <div className={`border-l-[3px] ${a.rand} pl-3 min-w-0`}>
      <div className="flex items-baseline gap-2 mb-1.5">
        {!einzeln && <span className={`text-[12px] tracking-[0.08em] font-semibold ${a.text}`}>{a.titel}</span>}
        {masse && <span className="text-[12px] text-ctp-subtext0 font-mono">{masse}</span>}
      </div>
      {stand.status === "laedt" && <Platzhalter text="lädt…" ton="warten" />}
      {stand.status === "fehlt" && (
        <Platzhalter text={seite === "vorher" ? "Kein Vorgängerstand" : "Nicht mehr vorhanden"} ton="leer" />
      )}
      {stand.status === "fehler" && <Platzhalter text="Bild nicht abrufbar" ton="leer" />}
      {stand.status === "da" && (
        <>
          <button type="button" onClick={() => onGross(stand.url)}
            className={`${BILDFLAECHE} w-full cursor-zoom-in`} title="Klicken zum Vergrößern">
            <img src={stand.url} alt={alt} className="max-h-[420px] w-full object-contain"
              onLoad={e => {
                const el = e.currentTarget;
                if (el.naturalWidth) setMasse(`${el.naturalWidth} × ${el.naturalHeight}`);
              }} />
          </button>
          {/* Auch über die volle Spaltenbreite bleibt ein Diagramm mit vielen
              Kästchen klein — der Weg zur großen Ansicht muss dastehen. */}
          <span className="block text-[12px] text-ctp-overlay0 mt-1">Klicken zum Vergrößern</span>
        </>
      )}
    </div>
  );
}

/**
 * Bilder lassen sich nicht zeilenweise vergleichen. Statt eines Textdiffs
 * stehen hier beide Fassungen untereinander — und wo es nur eine gibt (neu
 * angelegt, gelöscht, nur verschoben), eben nur diese.
 *
 * Untereinander statt nebeneinander, weil Diagramme breit sind: Auf halber
 * Spaltenbreite schrumpfen sie so weit, dass die Beschriftungen der Kästchen
 * nicht mehr zu lesen sind.
 */
export function BildVergleich({ change }: { change: ChangeWithVotes }) {
  const [gross, setGross] = useState<string | null>(null);
  // Nur verschoben heißt: derselbe Inhalt an anderer Stelle. Zwei identische
  // Bilder nebeneinander zu stellen würde eine Änderung vortäuschen.
  const nurVerschoben = change.changeKind === "rename";
  const zeigeVorher = !nurVerschoben && change.changeKind !== "add";
  const zeigeNachher = change.changeKind !== "delete";
  const einzeln = !(zeigeVorher && zeigeNachher);

  const vorher = useBild(zeigeVorher ? change.id : null, "vorher");
  const nachher = useBild(zeigeNachher ? change.id : null, "nachher");
  const name = change.filePath.split("/").pop() ?? change.filePath;

  return (
    <div>
      <div className={einzeln ? "" : "space-y-4"}>
        {zeigeVorher && <Tafel seite="vorher" stand={vorher} alt={`${name} vorher`} onGross={setGross} einzeln={einzeln} />}
        {zeigeNachher && <Tafel seite="nachher" stand={nachher} alt={`${name} nachher`} onGross={setGross} einzeln={einzeln} />}
      </div>
      {gross && <Lupe url={gross} onZu={() => setGross(null)} />}
    </div>
  );
}
