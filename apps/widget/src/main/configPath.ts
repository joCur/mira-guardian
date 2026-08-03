import { existsSync, copyFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

// Der Ablageort der Anmeldung ist bewusst fest verdrahtet statt aus dem
// App-Namen abgeleitet. electron-store schreibt seine config.json sonst nach
// app.getPath("userData"), und das ist app.getName() — den nimmt Electron aus
// der package.json des Bundles, also "@guardian/widget". electron-builders
// productName landet nur im Info.plist und ändert daran nichts. Der
// entscheidende Nebeneffekt: `pnpm dev` und die installierte App liefen damit
// auf derselben Datei. Ein Abmelden oder ein Umstellen auf localhost im
// Entwicklungsbetrieb hat die installierte App mit abgemeldet.
//
// Der Name hier darf sich nicht mehr ändern — jede installierte App würde
// danach als abgemeldet starten.
export const CONFIG_DIR = "de.mediainterface.mira-guardian";

// Getrennte Ordner für Dev und installierte App: sie dürfen sich nicht mehr
// gegenseitig abmelden.
export function configDir(appDataDir: string, isPackaged: boolean): string {
  return join(appDataDir, isPackaged ? CONFIG_DIR : `${CONFIG_DIR}-dev`);
}

// Der Ordner aus app.getName() — bis hierher der Ablageort *beider* Instanzen.
// Aus ihm übernehmen deshalb auch beide, jede in ihren eigenen Ordner.
export const LEGACY_DIR = join("@guardian", "widget");

export function findLegacyConfig(appDataDir: string): string | undefined {
  const legacy = join(appDataDir, LEGACY_DIR, "config.json");
  return existsSync(legacy) ? legacy : undefined;
}

// Übernimmt die Anmeldung eines früheren Ordners und gibt den Quellpfad zurück.
// Kopiert nur, solange am Zielort noch keine Datei liegt: ein bewusstes
// Abmelden darf nicht durch einen alten Token wieder aufgehoben werden. Das
// Original bleibt als Rückfalloption liegen.
export function migrateLegacyConfig(appDataDir: string, isPackaged: boolean): string | undefined {
  const target = join(configDir(appDataDir, isPackaged), "config.json");
  if (existsSync(target)) return undefined;
  const source = findLegacyConfig(appDataDir);
  if (!source) return undefined;
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
  return source;
}
