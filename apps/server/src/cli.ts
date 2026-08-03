/**
 * Betreiber-Kommandos für den laufenden Server. Gedacht für den einen Fall, den
 * das Widget nicht lösen kann: es ist kein Gerät mehr angemeldet, das einen
 * Zugangscode ausstellen könnte — etwa beim Gründungs-Hüter, dessen Setup-Code
 * verbraucht ist. Wer Zugriff auf die Datenbank hat, ist hier der
 * Vertrauensanker.
 *
 *   docker compose exec server node dist/cli.js guardians
 *   docker compose exec server node dist/cli.js relink <e-mail>
 *
 * Läuft absichtlich ohne loadConfig: die ADO-Pflichtfelder haben mit der
 * Geräteverwaltung nichts zu tun.
 */
import { Store } from "./db/store.js";
import { ChangeService } from "./domain/changeService.js";
import { AuthService, AuthError } from "./domain/authService.js";

const now = () => new Date().toISOString();

function usage(): never {
  console.error(`Verwendung:
  node dist/cli.js guardians           Hüter mit E-Mail und Geräteanzahl auflisten
  node dist/cli.js relink <e-mail>     Zugangscode für ein weiteres Gerät dieses Hüters

Die Datenbank kommt aus DB_PATH (im Container: /data/guardian.sqlite).`);
  process.exit(1);
}

function open() {
  const dbPath = process.env.DB_PATH;
  if (!dbPath) {
    console.error("DB_PATH ist nicht gesetzt — ohne Datenbank geht hier nichts.");
    process.exit(1);
  }
  const store = new Store(dbPath);
  return { store, auth: new AuthService(store, new ChangeService(store), now) };
}

function guardians() {
  const { store } = open();
  const list = store.listGuardians();
  if (list.length === 0) { console.log("Noch keine Hüter — die Instanz ist nicht initialisiert."); return; }
  for (const g of list) {
    const devices = store.listDevices(g.id);
    const rolle = g.isFounder ? " (Gründung)" : "";
    console.log(`${g.email}${rolle} — ${g.name}, ${devices.length} Gerät(e)`);
    for (const d of devices) console.log(`    ${d.label} — letzter Kontakt ${d.lastSeenAt}`);
  }
}

function relink(email: string) {
  const { store, auth } = open();
  const guardian = store.listGuardians().find(g => g.email.toLowerCase() === email.toLowerCase());
  if (!guardian) {
    console.error(`Kein Hüter mit der E-Mail ${email}. "node dist/cli.js guardians" zeigt alle.`);
    process.exit(1);
  }
  try {
    const { code, expiresAt } = auth.relink("cli", guardian.id);
    console.log(`Zugangscode für ${guardian.name}: ${code}`);
    console.log(`Gültig bis ${expiresAt}, einmalig einlösbar.`);
    console.log(`Im Widget unter "Gerät verknüpfen" eingeben — das Profil bleibt dasselbe.`);
  } catch (e) {
    console.error(e instanceof AuthError ? e.message : e);
    process.exit(1);
  }
}

const [command, arg] = process.argv.slice(2);
if (command === "guardians") guardians();
else if (command === "relink" && arg) relink(arg);
else usage();
