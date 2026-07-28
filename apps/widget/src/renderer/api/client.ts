import type { ChangeWithVotes, Guardian, VoteStatus } from "@guardian/shared";

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export interface ChangesResponse { toRate: ChangeWithVotes[]; acceptedByMe: ChangeWithVotes[]; badge: number }
export interface MeetingCounts { abgelehnt: number; klaerung: number; offen: number; gesamt: number }
export interface MeetingResponse { changes: ChangeWithVotes[]; counts: MeetingCounts }
export interface HistoryEntry {
  changeId: string; status: VoteStatus; comment: string | null; updatedAt: string;
  filePath: string; commitShort: string; summary: string;
}
export interface AuthResponse { deviceToken: string; guardian: Guardian }

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
    const headers: Record<string, string> = { "Content-Type": "application/json" };
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

  init(setupCode: string, name: string, email: string) { return this.req<AuthResponse>("POST", "/auth/init", { setupCode, name, email }); }
  redeem(code: string) { return this.req<AuthResponse>("POST", "/auth/redeem", { code }); }
  getChanges() { return this.req<ChangesResponse>("GET", "/changes"); }
  getChange(id: string) { return this.req<ChangeWithVotes>("GET", `/changes/${id}`); }
  vote(id: string, status: VoteStatus, comment: string) { return this.req<ChangeWithVotes>("POST", `/changes/${id}/vote`, { status, comment }); }
  getGuardians() { return this.req<{ guardians: Guardian[]; pending: { code: string; name: string; email: string }[] }>("GET", "/guardians"); }
  invite(name: string, email: string) { return this.req<{ code: string }>("POST", "/guardians/invite", { name, email }); }
  getMeeting() { return this.req<MeetingResponse>("GET", "/meeting"); }
  getMyHistory() { return this.req<{ entries: HistoryEntry[] }>("GET", "/me/history"); }
  getMe() { return this.req<{ guardian: Guardian }>("GET", "/me"); }
}
