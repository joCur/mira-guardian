export type HubEvent = {
  type: "change:new" | "change:updated" | "vote:updated" | "guardian:added" | "guardian:updated";
  changeId?: string;
};

type Ws = {
  onopen: (() => void) | null;
  onmessage: ((e: { data: string }) => void) | null;
  onclose: (() => void) | null;
  close(): void;
};
type WsCtor = (url: string) => Ws;

// Verbindet zum Hub und hält die Verbindung am Leben: reißt sie ab (Server-
// Neustart, Netzwerk), wird nach retryMs neu verbunden. Nach einem geglückten
// Reconnect feuert onReconnect — der Client holt darüber verpassten Stand nach.
export function subscribe(
  baseUrl: string, token: string, onEvent: (e: HubEvent) => void,
  onReconnect?: () => void,
  WsCtor: WsCtor = (url) => new WebSocket(url) as unknown as Ws,
  retryMs = 5000,
): () => void {
  const wsUrl = baseUrl.replace(/^http/, "ws") + `/ws?token=${encodeURIComponent(token)}`;
  let closed = false;
  let ws: Ws;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const connect = (isRetry: boolean) => {
    ws = WsCtor(wsUrl);
    ws.onopen = () => { if (isRetry) onReconnect?.(); };
    ws.onmessage = (e) => { try { onEvent(JSON.parse(e.data) as HubEvent); } catch { /* ignore malformed */ } };
    ws.onclose = () => { if (!closed) timer = setTimeout(() => connect(true), retryMs); };
  };
  connect(false);

  return () => { closed = true; clearTimeout(timer); ws.close(); };
}
