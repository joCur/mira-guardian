import type { Guardian } from "./types.js";

/**
 * Wie viele Hüter mindestens anwesend sein müssen, damit eine Abwesenheit
 * überhaupt wirkt. Ein Hüter allein soll nichts durchwinken können.
 */
export const MINDESTENS_ANWESEND = 2;

/** Der Tagesanteil eines Zeitstempels: "2026-08-04T10:00:00Z" → "2026-08-04". */
export function tagAus(iso: string): string {
  return iso.slice(0, 10);
}

/** Kurz und deutsch für die Oberfläche: "2026-08-28" → "28.08." */
export function kurzesDatum(tag: string): string {
  const [, monat, t] = tag.split("-");
  return monat && t ? `${t}.${monat}.` : tag;
}

/**
 * Steht für heute eine Abwesenheit im Kalender? Reine Datumsangaben, beide
 * Ränder inklusive — der lexikographische Vergleich von "YYYY-MM-DD" ist
 * gleichbedeutend mit dem chronologischen. Ohne Enddatum gibt es keine
 * Abwesenheit; so wird ein Trio nicht still zum Duo.
 */
export function istAbwesendLaut(g: Guardian, heute: string): boolean {
  if (!g.absentFrom || !g.absentUntil) return false;
  return g.absentFrom <= heute && heute <= g.absentUntil;
}

/**
 * Wer heute wirksam abwesend ist. Blieben weniger als MINDESTENS_ANWESEND
 * Hüter übrig, wirkt die Abwesenheit für niemanden — der Stand fällt auf
 * Einstimmigkeit aller zurück. Die Regel gilt bewusst für alle statt eine
 * Abwesenheit auszuwählen: welche verfiele, wäre willkürlich.
 */
export function wirksamAbwesende(guardians: Guardian[], heute: string): Guardian[] {
  const abwesend = guardians.filter(g => istAbwesendLaut(g, heute));
  if (guardians.length - abwesend.length < MINDESTENS_ANWESEND) return [];
  return abwesend;
}

/** Greift die Untergrenze, ist eine eingetragene Abwesenheit derzeit wirkungslos. */
export function abwesenheitOhneWirkung(guardians: Guardian[], heute: string): boolean {
  const laut = guardians.filter(g => istAbwesendLaut(g, heute));
  return laut.length > 0 && wirksamAbwesende(guardians, heute).length === 0;
}
