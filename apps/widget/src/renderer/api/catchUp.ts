import type { ChangeWithVotes } from "@guardian/shared";

/**
 * Wie viele verpasste Änderungen höchstens getoastet werden — die neuesten.
 * Nach einem Urlaub wären es sonst dutzende Meldungen, von denen der
 * Toast-Stapel ohnehin nur die letzten fünf zeigt (MAX_STACK in Toast.tsx).
 * Der Deckel spart also nichts an Sichtbarkeit, aber viel Leerlauf.
 */
export const TOAST_DECKEL = 5;

// Ermittelt beim Start bzw. nach einem Reconnect, welche Änderungen dieses
// Gerät verpasst hat: alles mit firstSeenAt hinter der Wasserlinie, das noch
// auf die eigene Bestätigung wartet. lastSeen === null heißt "dieses Gerät war
// noch nie da" — dann wird nichts nachträglich getoastet (das Hauptfenster
// zeigt den Bestand ohnehin), nur die Wasserlinie gesetzt.
export function catchUpChanges(
  all: ChangeWithVotes[], guardianId: string, lastSeen: string | null, nowIso: string,
): { toToast: ChangeWithVotes[]; weitere: number; watermark: string } {
  const verpasst = lastSeen
    ? all
        .filter(c => c.firstSeenAt > lastSeen &&
          c.votes.some(v => v.guardianId === guardianId && v.status === "offen"))
        .sort((a, b) => a.firstSeenAt.localeCompare(b.firstSeenAt))
    : [];
  const newest = all.reduce<string | null>((m, c) => (!m || c.firstSeenAt > m ? c.firstSeenAt : m), null);
  const watermark = newest && (!lastSeen || newest > lastSeen) ? newest : (lastSeen ?? nowIso);
  return {
    // Die neuesten, nicht die ältesten: der Stapel zeigt die letzten Karten, und
    // was zuletzt geschah, ist beim Wiederkommen das Interessantere.
    toToast: verpasst.slice(-TOAST_DECKEL),
    weitere: Math.max(0, verpasst.length - TOAST_DECKEL),
    watermark,
  };
}
