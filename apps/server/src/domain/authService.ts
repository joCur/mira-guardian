import { randomUUID } from "node:crypto";
import type { Device, Guardian } from "@guardian/shared";
import type { Store } from "../db/store.js";
import type { ChangeService } from "./changeService.js";
import { generateCode, initialsOf, avatarFor } from "./codes.js";
import { ensureOpenCycle } from "./cycles.js";

export class AuthError extends Error {}

/** Gültigkeitsdauer eines Zugangscodes. Kurz, weil er per Zuruf weitergegeben wird. */
export const CODE_TTL_MS = 24 * 60 * 60 * 1000;

// Der letzte Kontakt eines Geräts wird höchstens einmal pro Minute
// geschrieben. Er dient der Geräteliste als Orientierung; auf jede Abfrage ein
// UPDATE zu setzen, würde die Datenbank ohne Nutzen beschäftigen.
const TOUCH_INTERVAL_MS = 60 * 1000;

const MAX_LABEL = 60;
function cleanLabel(label: string | undefined): string {
  const v = (label ?? "").trim().replace(/\s+/g, " ").slice(0, MAX_LABEL);
  return v || "Unbenanntes Gerät";
}

export class AuthService {
  constructor(private store: Store, private changes: ChangeService, private now: () => string,
    private nowMs: () => number = () => Date.now()) {}

  private newGuardian(name: string, email: string, isFounder: boolean): Guardian {
    const idx = this.store.listGuardians().length;
    return { id: randomUUID(), name: name.trim(), email: email.trim(),
      initials: initialsOf(name), avatarColor: avatarFor(idx), createdAt: this.now(), isFounder };
  }
  private issueDevice(guardianId: string, label?: string): string {
    const token = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
    const at = this.now();
    this.store.insertDevice({ id: randomUUID(), guardianId, token, label: cleanLabel(label),
      lastSeenAt: at, createdAt: at });
    return token;
  }
  private expiry(): string {
    return new Date(this.nowMs() + CODE_TTL_MS).toISOString();
  }
  // Codes aus der Zeit ohne Ablaufdatum bleiben gültig: sie nachträglich zu
  // entwerten würde offene Einladungen stillschweigend kaputt machen.
  private isExpired(expiresAt: string | null): boolean {
    if (!expiresAt) return false;
    const t = Date.parse(expiresAt);
    return !Number.isNaN(t) && this.nowMs() > t;
  }
  private freshCode(chars: number): string {
    let code = generateCode("MB", chars);
    while (this.store.getInviteCode(code)) code = generateCode("MB", chars);
    return code;
  }

  initFounder(setupCode: string, name: string, email: string, deviceLabel?: string) {
    const state = this.store.getSetupState();
    if (state.initializedAt) throw new AuthError("Instanz ist bereits initialisiert.");
    if (setupCode.trim().toUpperCase() !== state.setupCode) throw new AuthError("Setup-Code stimmt nicht.");
    if (!email.includes("@")) throw new AuthError("E-Mail ungültig.");
    const guardian = this.newGuardian(name, email, true);
    this.store.insertGuardian(guardian);
    this.store.setInitialized(this.now());
    ensureOpenCycle(this.store, this.now);
    // Der Poller läuft ab Serverstart, das Erst-Setup passiert später. Was
    // vorher hereinkam, hat noch keine Bewertungszeile — ohne Nachziehen könnte
    // der Gründer diese Änderungen nie bewerten.
    this.changes.backfillVotesForGuardian(guardian.id, this.now());
    return { deviceToken: this.issueDevice(guardian.id, deviceLabel), guardian };
  }

  /** Lädt einen neuen Hüter ein: der Code legt beim Einlösen ein Profil an. */
  invite(createdBy: string, name: string, email: string) {
    if (!name.trim() || !email.includes("@")) throw new AuthError("Name/E-Mail ungültig.");
    const code = this.freshCode(4);
    const expiresAt = this.expiry();
    this.store.insertInviteCode({ code, name: name.trim(), email: email.trim(), createdBy,
      createdAt: this.now(), expiresAt });
    return { code, expiresAt };
  }

  /**
   * Verknüpft ein weiteres Gerät mit einem bestehenden Profil — für den
   * Rechnerwechsel und für eine verlorene Anmeldung. Ohne diesen Weg bliebe nur
   * eine Einladung, und die legt ein zweites Profil an: Bewertungshistorie und
   * Gründungsrolle blieben am alten hängen.
   *
   * Jeder Hüter darf den Code für jeden ausstellen — dasselbe Vertrauensmodell
   * wie bei einer Einladung. Ein zuvor ausgestellter, noch offener Code für
   * dasselbe Profil verfällt dabei, damit nie zwei gültig sind.
   */
  relink(createdBy: string, guardianId: string) {
    const guardian = this.store.getGuardian(guardianId);
    if (!guardian) throw new AuthError("Hüter unbekannt.");
    this.store.deleteOpenRelinkCodes(guardianId);
    const code = this.freshCode(8);
    const expiresAt = this.expiry();
    this.store.insertInviteCode({ code, name: guardian.name, email: guardian.email, createdBy,
      createdAt: this.now(), guardianId, expiresAt });
    return { code, expiresAt, guardianName: guardian.name };
  }

  redeem(code: string, deviceLabel?: string) {
    const invite = this.store.getInviteCode(code.trim().toUpperCase());
    if (!invite || invite.redeemedAt) throw new AuthError("Code unbekannt oder bereits eingelöst.");
    if (this.isExpired(invite.expiresAt)) throw new AuthError("Code ist abgelaufen — lass dir einen neuen ausstellen.");

    // Code auf ein bestehendes Profil: nur ein Gerät dazu. Kein neues Profil
    // und kein Vote-Backfill — die Bewertungen des Hüters gibt es schon.
    if (invite.guardianId) {
      const guardian = this.store.getGuardian(invite.guardianId);
      if (!guardian) throw new AuthError("Das Hüter-Profil zu diesem Code gibt es nicht mehr.");
      this.store.markInviteRedeemed(invite.code, guardian.id, this.now());
      return { deviceToken: this.issueDevice(guardian.id, deviceLabel), guardian, created: false };
    }

    const guardian = this.newGuardian(invite.name, invite.email, false);
    this.store.insertGuardian(guardian);
    this.store.markInviteRedeemed(invite.code, guardian.id, this.now());
    this.changes.backfillVotesForGuardian(guardian.id, this.now());
    return { deviceToken: this.issueDevice(guardian.id, deviceLabel), guardian, created: true };
  }

  guardianForToken(token: string): Guardian | undefined {
    return this.sessionForToken(token)?.guardian;
  }

  /** Wie guardianForToken, gibt aber auch das Gerät zurück — die Geräteliste markiert damit „dieses Gerät". */
  sessionForToken(token: string): { guardian: Guardian; deviceId: string } | undefined {
    const d = this.store.getDeviceByToken(token);
    if (!d) return undefined;
    const guardian = this.store.getGuardian(d.guardianId);
    if (!guardian) return undefined;
    const seen = Date.parse(d.lastSeenAt);
    if (Number.isNaN(seen) || this.nowMs() - seen > TOUCH_INTERVAL_MS) this.store.touchDevice(d.id, this.now());
    return { guardian, deviceId: d.id };
  }

  listDevices(guardianId: string, currentDeviceId: string): Device[] {
    return this.store.listDevices(guardianId)
      .map(d => ({ ...d, current: d.id === currentDeviceId }));
  }

  /**
   * Entzieht einem Gerät den Zugang. Nur eigene Geräte: ein fremdes abzumelden
   * wäre ein Eingriff in dessen Zugang, den niemand hier braucht.
   */
  revokeDevice(guardianId: string, deviceId: string) {
    if (!this.store.deleteDevice(deviceId, guardianId)) throw new AuthError("Gerät unbekannt.");
  }
}
