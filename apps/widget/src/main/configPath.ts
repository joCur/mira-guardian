import { existsSync, copyFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

// Der Ablageort der Anmeldung hängt bewusst an der appId und *nicht* am
// Anzeigenamen der App: electron-store schreibt seine config.json sonst nach
// app.getPath("userData"), und das ist auf macOS/Windows der productName aus
// electron-builder.yml. Eine Umbenennung (früher "Memory-Bank Hüter", jetzt
// "Guardian") zeigt danach auf einen leeren Ordner — die App sieht nach dem
// Update wie abgemeldet aus, obwohl die alte Datei noch daneben liegt.
// Dieser Name darf sich deshalb nicht mehr ändern, auch wenn die App später
// anders heißt.
export const CONFIG_DIR = "de.mediainterface.mira-guardian";

// Die Dev-Instanz bekommt einen eigenen Ordner, damit ein `pnpm dev` nicht die
// Anmeldung der installierten App überschreibt.
export function configDir(appDataDir: string, isPackaged: boolean): string {
  return join(appDataDir, isPackaged ? CONFIG_DIR : `${CONFIG_DIR}-dev`);
}

// Ordner früherer Versionen, neuste zuerst. Gepackt: die productName-Werte aus
// der Historie von electron-builder.yml. Dev: der Paketname aus package.json,
// den Electron ohne productName als App-Namen nimmt.
export const LEGACY_DIRS = {
  packaged: ["Guardian", "Memory-Bank Hüter", "mira-guardian"],
  dev: [join("@guardian", "widget")],
};

// macOS legt Dateinamen zerlegt ab (NFD: u + Umlautpunkte), unser Quelltext
// steht zusammengesetzt da (NFC). APFS findet beide Formen, andere
// Dateisysteme nicht — deshalb beide probieren.
function firstExisting(paths: string[]): string | undefined {
  for (const p of paths) {
    for (const form of [p, p.normalize("NFC"), p.normalize("NFD")]) if (existsSync(form)) return form;
  }
  return undefined;
}

export function findLegacyConfig(appDataDir: string, isPackaged: boolean): string | undefined {
  const names = isPackaged ? LEGACY_DIRS.packaged : LEGACY_DIRS.dev;
  return firstExisting(names.map(n => join(appDataDir, n, "config.json")));
}

// Übernimmt die Anmeldung eines früheren Ordners und gibt den Quellpfad zurück.
// Kopiert nur, solange am Zielort noch keine Datei liegt: ein bewusstes
// Abmelden darf nicht durch einen alten Token wieder aufgehoben werden. Das
// Original bleibt als Rückfalloption liegen.
export function migrateLegacyConfig(appDataDir: string, isPackaged: boolean): string | undefined {
  const target = join(configDir(appDataDir, isPackaged), "config.json");
  if (existsSync(target)) return undefined;
  const source = findLegacyConfig(appDataDir, isPackaged);
  if (!source) return undefined;
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
  return source;
}
