import Fastify, { type FastifyInstance } from "fastify";
import type { ChangeWithVotes, VoteStatus } from "@guardian/shared";
import type { Store } from "../db/store.js";
import type { ChangeService } from "../domain/changeService.js";
import { AuthService, AuthError } from "../domain/authService.js";
import type { RealtimeHub } from "../realtime/hub.js";
import { type Config, deepLink } from "../config.js";
import { makeAuthHook } from "./auth.js";

export interface ApiDeps {
  store: Store; changeService: ChangeService; authService: AuthService;
  hub: RealtimeHub; config: Config; now: () => string;
}

const COMMENT_REQUIRED: VoteStatus[] = ["klaerung", "abgelehnt"];

export function buildApp(deps: ApiDeps): FastifyInstance {
  const { store, changeService, authService, hub, config, now } = deps;
  const app = Fastify({ logger: false });
  const authHook = makeAuthHook(authService);

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

  app.get("/health", async () => ({ ok: true }));

  app.post("/auth/init", async (req, reply) => {
    const { setupCode, name, email } = req.body as any;
    try { return authService.initFounder(setupCode, name, email); }
    catch (e) { if (e instanceof AuthError) return reply.code(400).send({ error: e.message }); throw e; }
  });
  app.post("/auth/redeem", async (req, reply) => {
    const { code } = req.body as any;
    try { const r = authService.redeem(code); hub.broadcast({ type: "guardian:added" }); return r; }
    catch (e) { if (e instanceof AuthError) return reply.code(400).send({ error: e.message }); throw e; }
  });

  app.register(async (secured) => {
    secured.addHook("preHandler", authHook);

    secured.get("/me", async (req) => ({ guardian: req.guardian }));

    secured.get("/changes", async (req) => {
      const me = req.guardian!.id;
      return {
        toRate: changeService.toRate(me).map(c => withVotes(c.id)!),
        acceptedByMe: changeService.acceptedByMe(me).map(c => withVotes(c.id)!),
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

    secured.get("/guardians", async () => ({
      guardians: store.listGuardians(), pending: store.listOpenInviteCodes(),
    }));
    secured.post("/guardians/invite", async (req, reply) => {
      const { name, email } = req.body as any;
      try { return authService.invite(req.guardian!.id, name, email); }
      catch (e) { if (e instanceof AuthError) return reply.code(400).send({ error: e.message }); throw e; }
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
