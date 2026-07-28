import type { ChangeWithVotes } from "@guardian/shared";

// Ermittelt beim Start bzw. nach einem Reconnect, welche Änderungen dieses
// Gerät verpasst hat: alles mit firstSeenAt hinter der Wasserlinie, das noch
// auf die eigene Bestätigung wartet. lastSeen === null heißt "dieses Gerät war
// noch nie da" — dann wird nichts nachträglich getoastet (das Hauptfenster
// zeigt den Bestand ohnehin), nur die Wasserlinie gesetzt.
export function catchUpChanges(
  all: ChangeWithVotes[], guardianId: string, lastSeen: string | null, nowIso: string,
): { toToast: ChangeWithVotes[]; watermark: string } {
  const toToast = lastSeen
    ? all
        .filter(c => c.firstSeenAt > lastSeen &&
          c.votes.some(v => v.guardianId === guardianId && v.status === "offen"))
        .sort((a, b) => a.firstSeenAt.localeCompare(b.firstSeenAt))
    : [];
  const newest = all.reduce<string | null>((m, c) => (!m || c.firstSeenAt > m ? c.firstSeenAt : m), null);
  const watermark = newest && (!lastSeen || newest > lastSeen) ? newest : (lastSeen ?? nowIso);
  return { toToast, watermark };
}
