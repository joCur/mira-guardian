// Nach einer Bewertung rückt die Auswahl weiter, damit man die Liste
// durcharbeiten kann, ohne jedes Mal zu klicken.
//
// Verlässt die bewertete Änderung die Liste (Akzeptieren), rückt der
// nachfolgende Eintrag auf ihren Platz — die Position bleibt also gleich.
// Bleibt sie stehen (Ablehnen, Klärungsbedarf), geht es eine Position
// weiter. Am Listenende beginnt es von vorn.
export function nextSelection(
  before: Array<{ id: string }>,
  votedId: string,
  after: Array<{ id: string }>,
): string | null {
  if (after.length === 0) return null;
  const i = before.findIndex(c => c.id === votedId);
  if (i === -1) return after[0].id;
  const stayed = after.some(c => c.id === votedId);
  const target = stayed ? i + 1 : i;
  return after[target % after.length].id;
}
