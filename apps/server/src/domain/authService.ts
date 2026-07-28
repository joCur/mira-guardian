import { randomUUID } from "node:crypto";
import type { Guardian } from "@guardian/shared";
import type { Store } from "../db/store.js";
import type { ChangeService } from "./changeService.js";
import { generateCode, initialsOf, avatarFor } from "./codes.js";
import { ensureOpenCycle } from "./cycles.js";

export class AuthError extends Error {}

export class AuthService {
  constructor(private store: Store, private changes: ChangeService, private now: () => string) {}

  private newGuardian(name: string, email: string, isFounder: boolean): Guardian {
    const idx = this.store.listGuardians().length;
    return { id: randomUUID(), name: name.trim(), email: email.trim(),
      initials: initialsOf(name), avatarColor: avatarFor(idx), createdAt: this.now(), isFounder };
  }
  private issueDevice(guardianId: string): string {
    const token = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
    this.store.insertDevice({ id: randomUUID(), guardianId, token, label: "device", lastSeenAt: this.now() });
    return token;
  }
  initFounder(setupCode: string, name: string, email: string) {
    const state = this.store.getSetupState();
    if (state.initializedAt) throw new AuthError("Instanz ist bereits initialisiert.");
    if (setupCode.trim().toUpperCase() !== state.setupCode) throw new AuthError("Setup-Code stimmt nicht.");
    if (!email.includes("@")) throw new AuthError("E-Mail ungültig.");
    const guardian = this.newGuardian(name, email, true);
    this.store.insertGuardian(guardian);
    this.store.setInitialized(this.now());
    ensureOpenCycle(this.store, this.now);
    return { deviceToken: this.issueDevice(guardian.id), guardian };
  }

  invite(createdBy: string, name: string, email: string) {
    if (!name.trim() || !email.includes("@")) throw new AuthError("Name/E-Mail ungültig.");
    let code = generateCode("MB");
    while (this.store.getInviteCode(code)) code = generateCode("MB");
    this.store.insertInviteCode({ code, name: name.trim(), email: email.trim(), createdBy, createdAt: this.now() });
    return { code };
  }

  redeem(code: string) {
    const invite = this.store.getInviteCode(code.trim().toUpperCase());
    if (!invite || invite.redeemedAt) throw new AuthError("Code unbekannt oder bereits eingelöst.");
    const guardian = this.newGuardian(invite.name, invite.email, false);
    this.store.insertGuardian(guardian);
    this.store.markInviteRedeemed(invite.code, guardian.id, this.now());
    this.changes.backfillVotesForGuardian(guardian.id, this.now());
    return { deviceToken: this.issueDevice(guardian.id), guardian };
  }

  guardianForToken(token: string): Guardian | undefined {
    const d = this.store.getDeviceByToken(token);
    return d ? this.store.getGuardian(d.guardianId) : undefined;
  }
}
