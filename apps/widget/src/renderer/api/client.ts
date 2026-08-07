import type { ChangeWithVotes, Device, Guardian, RelinkCode, VoteStatus } from "@guardian/shared";

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export interface ChangesResponse {
  toRate: ChangeWithVotes[];
  ratedByMe: ChangeWithVotes[];
  /** Ein Server vor der Aufteilung kennt nur diese Liste — siehe store.ts. */
  acceptedByMe?: ChangeWithVotes[];
  badge: number;
}
export interface MeetingCounts {
  abgelehnt: number; klaerung: number; offen: number; gesamt: number;
  /** Wie viele der Ausstehenden auf *mich* warten. Ein älterer Server sagt es nicht. */
  offenBeiMir?: number;
}
export interface MeetingResponse { changes: ChangeWithVotes[]; counts: MeetingCounts }
export interface HistoryEntry {
  changeId: string; status: VoteStatus; comment: string | null; updatedAt: string;
  filePath: string; commitShort: string; summary: string;
}
export interface AuthResponse { deviceToken: string; guardian: Guardian }
/** Antwort eines Servers, der Codes für bestehende Profile noch nicht kennt, hat kein expiresAt. */
export interface InviteResponse { code: string; expiresAt?: string }

export class ApiClient {
  // Default wraps the global fetch in an arrow so it is always invoked with the
  // correct receiver. Passing the bare `fetch` reference and calling it as
  // `this.fetchFn(...)` sets `this` to the ApiClient and browsers throw
  // "Failed to execute 'fetch' on 'Window': Illegal invocation".
  constructor(
    private baseUrl: string,
    private token: string | null,
    private fetchFn: typeof fetch = (input, init) => fetch(input, init),
  ) {}

  private async req<T>(method: string, path: string, body?: unknown): Promise<T> {
    // Content-Type nur mit Nutzlast: ein leerer Body mit JSON-Header ist für
    // Fastify ein Fehler (400), und ohne Body ist der Header ohnehin falsch.
    const headers: Record<string, string> = body === undefined ? {} : { "Content-Type": "application/json" };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    const res = await this.fetchFn(`${this.baseUrl}${path}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(res.status, (data as any).error ?? `HTTP ${res.status}`);
    return data as T;
  }

  // Gleicher Client, andere Adresse: der Setup-Dialog verbindet sich mit der
  // gerade eingegebenen Adresse, noch bevor sie gespeichert und der Client von
  // AppRoot neu aufgebaut ist.
  withBaseUrl(baseUrl: string) { return new ApiClient(baseUrl, this.token, this.fetchFn); }

  /**
   * Ein Bild zur Änderung. `pfad` bezeichnet ein Bild, das ein geändertes
   * Dokument einbettet; ohne ihn kommt die geänderte Bilddatei selbst.
   * Antwortet der Server mit 404, gibt es diese Seite nicht (neu angelegt,
   * gelöscht) — das ist kein Fehler, sondern eine Auskunft: null.
   */
  async ladeBild(changeId: string, seite: "vorher" | "nachher", pfad?: string): Promise<Blob | null> {
    const headers: Record<string, string> = {};
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    const query = pfad ? `?pfad=${encodeURIComponent(pfad)}` : "";
    const res = await this.fetchFn(`${this.baseUrl}/changes/${changeId}/bild/${seite}${query}`, { headers });
    if (res.status === 404) return null;
    if (!res.ok) throw new ApiError(res.status, `HTTP ${res.status}`);
    return res.blob();
  }

  // deviceLabel benennt das Gerät in der Geräteliste des Hüters. Ein Server ohne
  // Geräteverwaltung ignoriert das Feld; ist der Name unbekannt, bleibt es weg
  // und der Server setzt selbst einen Platzhalter.
  private withLabel(body: Record<string, unknown>, deviceLabel?: string) {
    return deviceLabel ? { ...body, deviceLabel } : body;
  }
  init(setupCode: string, name: string, email: string, deviceLabel?: string) {
    return this.req<AuthResponse>("POST", "/auth/init", this.withLabel({ setupCode, name, email }, deviceLabel));
  }
  redeem(code: string, deviceLabel?: string) {
    return this.req<AuthResponse>("POST", "/auth/redeem", this.withLabel({ code }, deviceLabel));
  }
  getChanges() { return this.req<ChangesResponse>("GET", "/changes"); }
  getChange(id: string) { return this.req<ChangeWithVotes>("GET", `/changes/${id}`); }
  vote(id: string, status: VoteStatus, comment: string) { return this.req<ChangeWithVotes>("POST", `/changes/${id}/vote`, { status, comment }); }
  getGuardians() { return this.req<{ guardians: Guardian[]; pending: { code: string; name: string; email: string }[] }>("GET", "/guardians"); }
  invite(name: string, email: string) { return this.req<InviteResponse>("POST", "/guardians/invite", { name, email }); }
  /** Zugangscode für ein weiteres Gerät eines bestehenden Hüters. */
  relink(guardianId: string) { return this.req<RelinkCode>("POST", `/guardians/${guardianId}/relink`); }
  getMyDevices() { return this.req<{ devices: Device[] }>("GET", "/me/devices"); }
  revokeDevice(deviceId: string) { return this.req<{ ok: true }>("POST", `/me/devices/${deviceId}/revoke`); }
  getMeeting() { return this.req<MeetingResponse>("GET", "/meeting"); }
  getMyHistory() { return this.req<{ entries: HistoryEntry[] }>("GET", "/me/history"); }
  getMe() { return this.req<{ guardian: Guardian }>("GET", "/me"); }
  // Ein Server, der älter ist als diese Anzeige, liefert das Feld nicht — dann
  // bleibt die Version unbekannt statt undefined durch die Oberfläche zu tragen.
  async getServerVersion(): Promise<string | null> {
    const r = await this.req<{ ok: boolean; version?: string }>("GET", "/health");
    return r.version ?? null;
  }
}
