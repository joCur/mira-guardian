import Fastify, { type FastifyInstance } from "fastify";
import type { ChangeWithVotes, VoteStatus } from "@guardian/shared";
import type { Store } from "../db/store.js";
import type { ChangeService } from "../domain/changeService.js";
import { AuthService, AuthError } from "../domain/authService.js";
import type { RealtimeHub } from "../realtime/hub.js";
import { type Config, deepLink } from "../config.js";
import { makeAuthHook } from "./auth.js";
import { istBildseite, type BildDienst } from "./bilder.js";
import { createLimiter, type Limiter } from "./rateLimit.js";

export interface ApiDeps {
  store: Store; changeService: ChangeService; authService: AuthService;
  hub: RealtimeHub; config: Config; now: () => string;
  /** Fehlt in Tests, die ohne ADO auskommen — dann gibt es keine Bilder. */
  bildDienst?: BildDienst;
  /** Nur für Tests: ein Limiter mit kontrollierbarer Uhr und Grenze. */
  limiter?: Limiter;
}

const COMMENT_REQUIRED: VoteStatus[] = ["klaerung", "abgelehnt"];
const TOO_MANY = "Zu viele Versuche. Warte 15 Minuten und probiere es dann erneut.";

export function buildApp(deps: ApiDeps): FastifyInstance {
  const { store, changeService, authService, hub, config, now, bildDienst } = deps;
  const app = Fastify({ logger: false });
  const authHook = makeAuthHook(authService);
  const limiter = deps.limiter ?? createLimiter();

  // Ein POST ohne Nutzlast (Code ausstellen, Gerät entziehen) trägt beim
  // Renderer trotzdem den JSON-Content-Type aus dem gemeinsamen Anfrage-Kopf.
  // Fastify beantwortet den leeren Body von sich aus mit 400, obwohl nichts
  // fehlt — hier wird er zum leeren Objekt.
  app.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) => {
    const raw = body as string;
    if (raw.trim() === "") return done(null, {});
    try { done(null, JSON.parse(raw)); }
    catch { done(Object.assign(new Error("Body ist kein gültiges JSON."), { statusCode: 400 })); }
  });

  // CORS: the widget renderer is always a different origin than this server
  // (dev = the vite dev server, prod = a file:// page), so cross-origin fetches
  // need permissive CORS headers and OPTIONS-preflight handling — without them
  // Chromium in the renderer blocks the response ("Failed to fetch"). This is a
  // localhost-only internal tool with bearer-token (not cookie) auth, so "*" is safe.
  app.addHook("onRequest", async (req, reply) => {
    reply.header("Access-Control-Allow-Origin", "*");
    reply.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    reply.header("Access-Control-Allow-Headers", "Content-Type,Authorization");
    if (req.method === "OPTIONS") {
      reply.code(204).send();
      return reply;
    }
  });

  const withVotes = (id: string): ChangeWithVotes | undefined => {
    const c = store.getChange(id);
    if (!c) return undefined;
    return { ...c, votes: store.listVotesByChange(id), adoLink: deepLink(config, c.commitId, c.filePath) };
  };

  // Die Version gehört hierher und nicht hinter den Zugang: das Widget zeigt
  // sie neben seiner eigenen, und Monitoring sieht mit, welcher Stand läuft.
  app.get("/health", async () => ({ ok: true, version: config.version }));

  app.post("/auth/init", async (req, reply) => {
    const { setupCode, name, email, deviceLabel } = req.body as any;
    if (!limiter.take(req.ip)) return reply.code(429).send({ error: TOO_MANY });
    try {
      const r = authService.initFounder(setupCode, name, email, deviceLabel);
      limiter.reset(req.ip);
      return r;
    }
    catch (e) { if (e instanceof AuthError) return reply.code(400).send({ error: e.message }); throw e; }
  });
  app.post("/auth/redeem", async (req, reply) => {
    const { code, deviceLabel } = req.body as any;
    // Gezählt wird vor dem Einlösen: sonst wäre das Limit für einen Angreifer
    // wirkungslos, der nur falsche Codes schickt.
    if (!limiter.take(req.ip)) return reply.code(429).send({ error: TOO_MANY });
    try {
      const r = authService.redeem(code, deviceLabel);
      limiter.reset(req.ip);
      // Ein Code auf ein bestehendes Profil fügt keinen Hüter hinzu, sondern nur
      // ein Gerät — dann gibt es für die anderen nichts neu zu laden.
      if (r.created) hub.broadcast({ type: "guardian:added" });
      return r;
    }
    catch (e) { if (e instanceof AuthError) return reply.code(400).send({ error: e.message }); throw e; }
  });

  app.register(async (secured) => {
    secured.addHook("preHandler", authHook);

    secured.get("/me", async (req) => ({ guardian: req.guardian }));

    secured.get("/changes", async (req) => {
      const me = req.guardian!.id;
      const ratedByMe = changeService.ratedByMe(me).map(c => withVotes(c.id)!);
      return {
        toRate: changeService.toRate(me).map(c => withVotes(c.id)!),
        ratedByMe,
        // Widgets von vor dieser Aufteilung lesen "acceptedByMe" und würden ohne
        // das Feld beim Laden abbrechen. Sie zeigen die Einwände dann unter ihrer
        // alten Überschrift — sichtbar bleibt alles.
        acceptedByMe: ratedByMe,
        badge: changeService.badgeCount(me),
      };
    });

    secured.get("/changes/:id", async (req, reply) => {
      const c = withVotes((req.params as any).id);
      return c ?? reply.code(404).send({ error: "unbekannt" });
    });

    secured.post("/changes/:id/vote", async (req, reply) => {
      const id = (req.params as any).id;
      const { status, comment } = req.body as { status: VoteStatus; comment?: string };
      if (!store.getChange(id)) return reply.code(404).send({ error: "unbekannt" });
      const trimmed = (comment ?? "").trim();
      if (COMMENT_REQUIRED.includes(status) && trimmed.length < 5)
        return reply.code(400).send({ error: "Kommentar erforderlich (min. 5 Zeichen)." });
      store.upsertVote({ changeId: id, guardianId: req.guardian!.id, status,
        comment: COMMENT_REQUIRED.includes(status) ? trimmed : null, updatedAt: now() });
      hub.broadcast({ type: "vote:updated", changeId: id });
      return withVotes(id)!;
    });

    // Ein Bild zur Änderung: die geänderte Bilddatei selbst, oder — mit
    // ?pfad=… — ein Bild, das das geänderte Dokument einbettet. Der Inhalt
    // kommt direkt aus ADO, deshalb kann die Antwort auch leer ausfallen (kein
    // Vorgängerstand, gelöschte Datei). Das ist kein Fehler, sondern die
    // Auskunft "diese Seite gibt es nicht".
    secured.get("/changes/:id/bild/:seite", async (req, reply) => {
      const { id, seite } = req.params as { id: string; seite: string };
      if (!istBildseite(seite)) return reply.code(400).send({ error: "Seite muss vorher oder nachher sein." });
      const change = store.getChange(id);
      if (!change) return reply.code(404).send({ error: "unbekannt" });
      if (!bildDienst) return reply.code(404).send({ error: "Bilder nicht verfügbar" });

      const pfad = (req.query as { pfad?: string }).pfad;
      let bild;
      try {
        bild = await bildDienst.hole(change, seite, pfad);
      } catch (e) {
        req.log?.error?.(e);
        return reply.code(502).send({ error: "Bild ist gerade nicht abrufbar." });
      }
      if (!bild) return reply.code(404).send({ error: "kein Bild" });
      // Kurz zwischenspeichern reicht: holt ein neuer Commit die Änderung ein,
      // bleibt die Adresse dieselbe, während sich der Inhalt ändert.
      return reply.header("Cache-Control", "private, max-age=60").type(bild.contentType).send(bild.bytes);
    });

    secured.get("/guardians", async () => ({
      guardians: store.listGuardians(), pending: store.listOpenInviteCodes(),
    }));
    secured.post("/guardians/invite", async (req, reply) => {
      const { name, email } = req.body as any;
      try { return authService.invite(req.guardian!.id, name, email); }
      catch (e) { if (e instanceof AuthError) return reply.code(400).send({ error: e.message }); throw e; }
    });

    // Zugangscode für ein weiteres Gerät eines *bestehenden* Hüters — der Weg
    // für einen neuen Rechner und für eine verlorene Anmeldung.
    secured.post("/guardians/:id/relink", async (req, reply) => {
      try { return authService.relink(req.guardian!.id, (req.params as any).id); }
      catch (e) { if (e instanceof AuthError) return reply.code(400).send({ error: e.message }); throw e; }
    });

    // Eigene Geräte verwalten. Der Token selbst wird nie ausgeliefert.
    secured.get("/me/devices", async (req) => ({
      devices: authService.listDevices(req.guardian!.id, req.deviceId!),
    }));
    secured.post("/me/devices/:id/revoke", async (req, reply) => {
      try { authService.revokeDevice(req.guardian!.id, (req.params as any).id); return { ok: true }; }
      catch (e) { if (e instanceof AuthError) return reply.code(404).send({ error: e.message }); throw e; }
    });

    // Hüter-Übersicht: alles, was das Team noch gemeinsam durchgehen muss.
    secured.get("/meeting", async () => ({
      changes: changeService.meetingChanges().map(c => withVotes(c.id)!),
      counts: changeService.meetingCounts(),
    }));

    // Persönlicher Bewertungsverlauf.
    secured.get("/me/history", async (req) => ({
      entries: store.listVotesByGuardian(req.guardian!.id).map(e => ({
        changeId: e.changeId, status: e.status, comment: e.comment, updatedAt: e.updatedAt,
        filePath: e.change.filePath, commitShort: e.change.commitShort, summary: e.change.summary,
      })),
    }));
  });

  return app;
}
