// Bilder in der Memory Bank: Diagramme liegen als eigene Dateien neben den
// Dokumenten und werden von ihnen eingebettet. Beide Seiten — Server wie
// Widget — müssen dieselbe Vorstellung davon haben, was ein Bild ist und wohin
// ein relativer Bildpfad zeigt, sonst holt der Server etwas anderes, als die
// Anzeige anfragt.

const BILD_TYPEN: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  webp: "image/webp",
  avif: "image/avif",
  bmp: "image/bmp",
  ico: "image/x-icon",
};

/** Der Bildtyp zur Dateiendung, oder null für alles, was kein Bild ist. */
export function bildMimeTyp(pfad: string): string | null {
  const endung = pfad.split(".").pop()?.toLowerCase();
  return (endung && BILD_TYPEN[endung]) ?? null;
}

export function istBilddatei(pfad: string): boolean {
  return bildMimeTyp(pfad) !== null;
}

/**
 * Löst den Bildpfad aus einer Markdown-Einbettung zu einem Repo-Pfad auf.
 *
 * Bilder werden relativ zum Dokument eingebettet (`diagrams/flow.png`), der
 * Server braucht aber den Pfad ab Repo-Wurzel. Externe Adressen (http, data)
 * gehören nicht hierher — sie werden direkt geladen, nicht über den Server.
 * Ein Ziel, das über die Repo-Wurzel hinausführt, ist ungültig: darüber ließe
 * sich sonst der Pfad manipulieren, den der Server bei ADO anfragt.
 */
export function aufloesenBildPfad(dokumentPfad: string, ziel: string): string | null {
  const roh = ziel.trim().split("#")[0].split("?")[0];
  if (!roh) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(roh) || roh.startsWith("//")) return null; // http:, data:, …

  let pfad: string;
  try { pfad = decodeURIComponent(roh); } catch { pfad = roh; }

  // Ein Ziel, das auf einen Ordner zeigt ("./", "bilder/"), ist keine Datei.
  const letztes = pfad.split("/").pop();
  if (letztes === "" || letztes === "." || letztes === "..") return null;

  const basis = pfad.startsWith("/") ? [] : dokumentPfad.split("/").slice(0, -1);
  const teile: string[] = [...basis];
  for (const segment of pfad.replace(/^\//, "").split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (teile.length === 0) return null; // Ausbruch über die Repo-Wurzel
      teile.pop();
      continue;
    }
    teile.push(segment);
  }
  return teile.length ? teile.join("/") : null;
}
