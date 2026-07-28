import websocket from "@fastify/websocket";
import { loadConfig } from "./config.js";
import { Store } from "./db/store.js";
import { ChangeService } from "./domain/changeService.js";
import { AuthService } from "./domain/authService.js";
import { RealtimeHub, type Sink } from "./realtime/hub.js";
import { AdoClient } from "./ado/adoClient.js";
import { AdoPoller } from "./ado/adoPoller.js";
import { buildApp } from "./api/httpApi.js";
import { generateCode } from "./domain/codes.js";

const now = () => new Date().toISOString();

async function bootstrap() {
  const config = loadConfig(process.env);
  const store = new Store(config.dbPath);

  // Ensure a setup code exists; log it while the instance is uninitialized.
  const state = store.getSetupState();
  if (!state.setupCode) store.ensureSetupCode(generateCode("MB-INIT"));
  const fresh = store.getSetupState();
  if (!fresh.initializedAt) {
    console.log(`▸ Keine Hüter gefunden — Erst-Setup aktiv`);
    console.log(`▸ Setup-Code: ${fresh.setupCode} (einmalig gültig)`);
  }

  const changeService = new ChangeService(store);
  const authService = new AuthService(store, changeService, now);

  // Bestand in Ordnung bringen, bevor Hüter danach greifen: Einträge ohne
  // jeden Inhalt (früher die Quellseite jeder Verschiebung) sind nicht
  // bewertbar, und fehlende Bewertungszeilen machen die Fußleiste im Widget
  // unbenutzbar.
  const purged = changeService.purgeContentlessChanges();
  if (purged > 0) console.log(`▸ ${purged} Änderungen ohne Inhalt entfernt`);
  const repaired = changeService.repairMissingVotes(now());
  if (repaired > 0) console.log(`▸ ${repaired} fehlende Bewertungen nachgezogen`);
  const hub = new RealtimeHub();
  const ado = new AdoClient(config);
  const poller = new AdoPoller(config, store, changeService, ado, now,
    (changeId, isNew) => hub.broadcast({ type: isNew ? "change:new" : "change:updated", changeId }));

  const app = buildApp({ store, changeService, authService, hub, config, now });
  await app.register(websocket);
  app.get("/ws", { websocket: true }, (socket, req) => {
    const token = new URL(req.url ?? "", "http://x").searchParams.get("token") ?? "";
    if (!authService.guardianForToken(token)) { socket.close(); return; }
    const sink: Sink = { send: (d) => socket.send(d) };
    hub.add(sink);
    socket.on("close", () => hub.remove(sink));
  });

  const tick = async () => {
    try { await poller.pollOnce(); }
    catch (e) { console.error("Poll fehlgeschlagen:", (e as Error).message); }
  };
  setInterval(tick, config.pollIntervalSeconds * 1000);
  void tick();

  await app.listen({ port: config.httpPort, host: "0.0.0.0" });
  console.log(`guardian-server hört auf :${config.httpPort}`);
}

bootstrap().catch((e) => { console.error(e); process.exit(1); });
