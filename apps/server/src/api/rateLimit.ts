/**
 * Versuchslimit für die Code-Eingabe. Ein Zugangscode ist kurz genug, dass er
 * ohne Bremse durchprobiert werden kann: vier Zeichen aus 18 sind ~105.000
 * Möglichkeiten, die eine Schleife in Minuten abarbeitet. Mit zehn Versuchen
 * pro Viertelstunde dauert derselbe Durchlauf Jahre.
 *
 * Absichtlich im Arbeitsspeicher und ohne Aufräum-Timer: der Server ist ein
 * einzelner Prozess, und die Einträge verfallen beim Nachschlagen. Ein
 * Neustart setzt die Zähler zurück — das kostet einen Angreifer mehr, als es
 * ihm hilft.
 */
export interface Limiter {
  /** true = Versuch erlaubt und gezählt. */
  take(key: string): boolean;
  reset(key: string): void;
}

export function createLimiter(
  { limit = 10, windowMs = 15 * 60 * 1000, now = () => Date.now() } = {},
): Limiter {
  const hits = new Map<string, number[]>();
  return {
    take(key) {
      const t = now();
      const recent = (hits.get(key) ?? []).filter(ts => t - ts < windowMs);
      if (recent.length >= limit) { hits.set(key, recent); return false; }
      recent.push(t);
      hits.set(key, recent);
      return true;
    },
    reset(key) { hits.delete(key); },
  };
}
