import type { FastifyRequest, FastifyReply } from "fastify";
import type { Guardian } from "@guardian/shared";
import type { AuthService } from "../domain/authService.js";

declare module "fastify" {
  interface FastifyRequest { guardian?: Guardian }
}

export function makeAuthHook(authService: AuthService) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const header = req.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    const guardian = token ? authService.guardianForToken(token) : undefined;
    if (!guardian) { reply.code(401).send({ error: "nicht angemeldet" }); return; }
    req.guardian = guardian;
  };
}
