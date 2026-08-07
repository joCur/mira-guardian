import { useCallback, useEffect, useRef, useState } from "react";
import { applyZoom, clampZoom, zoomCommandFor, zoomFaktor } from "./zoom.js";

export interface Lesezoom {
  /** Stufe; 0 ist die unveränderte Größe. */
  stufe: number;
  /** Skalierung als Prozentwert für die Anzeige, z. B. 120. */
  prozent: number;
  zuruecksetzen: () => void;
}

/**
 * Hält die Zoomstufe des Lesebereichs und legt sie als CSS-Variable
 * `--lesezoom` auf das Wurzelelement. Die Container, die mitwachsen sollen,
 * tragen dafür die Klasse `lesezoom` (siehe index.css) — so braucht der Faktor
 * nicht durch den halben Komponentenbaum gereicht zu werden.
 *
 * Der Tastendruck wird auf `window` abgefangen, in der Capture-Phase: Sonst
 * verschluckt ein fokussiertes Eingabefeld das Kürzel, und der Zoom bliebe im
 * Kommentarfeld wirkungslos.
 */
export function useLesezoom(): Lesezoom {
  const [stufe, setStufe] = useState(0);
  // Der Tastatur-Handler wird einmal registriert und dürfte sonst nur die
  // Stufe aus seiner Closure sehen — dieser Ref hält den aktuellen Wert.
  const aktuell = useRef(0);

  const anwenden = useCallback((level: number, speichern: boolean) => {
    const neu = clampZoom(level);
    aktuell.current = neu;
    setStufe(neu);
    document.documentElement.style.setProperty("--lesezoom", String(zoomFaktor(neu)));
    if (speichern) void window.guardian.setZoomLevel(neu);
  }, []);

  useEffect(() => {
    // Beim Start die gespeicherte Stufe übernehmen: Wer die Schrift einmal
    // größer gestellt hat, soll das nicht bei jedem Öffnen wiederholen müssen.
    void window.guardian.getZoomLevel().then(l => anwenden(l ?? 0, false)).catch(() => {});

    const onKey = (e: KeyboardEvent) => {
      const cmd = zoomCommandFor(e);
      if (!cmd) return;
      e.preventDefault();
      const neu = applyZoom(aktuell.current, cmd);
      if (neu !== aktuell.current) anwenden(neu, true);
    };
    window.addEventListener("keydown", onKey, true);
    return () => { window.removeEventListener("keydown", onKey, true); };
  }, [anwenden]);

  const zuruecksetzen = useCallback(() => { anwenden(0, true); }, [anwenden]);

  return { stufe, prozent: Math.round(zoomFaktor(stufe) * 100), zuruecksetzen };
}
