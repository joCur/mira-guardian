import { describe, it, expect, vi, afterEach } from "vitest";
import { subscribe } from "../src/renderer/api/ws.js";

class FakeWs {
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  closed = false;
  constructor(public url: string) {}
  close() { this.closed = true; this.onclose?.(); }
  open() { this.onopen?.(); }
  emit(data: string) { this.onmessage?.({ data }); }
  drop() { this.onclose?.(); } // Verbindungsabriss ohne close()-Aufruf des Clients
}

afterEach(() => { vi.useRealTimers(); });

describe("subscribe", () => {
  it("delivers parsed events and unsubscribes", () => {
    let created: FakeWs | null = null;
    const events: unknown[] = [];
    const off = subscribe("http://s", "tok", (e) => events.push(e), undefined,
      (url: string) => (created = new FakeWs(url)));
    expect(created!.url).toBe("ws://s/ws?token=tok");
    created!.emit(JSON.stringify({ type: "change:new", changeId: "c1" }));
    expect(events[0]).toEqual({ type: "change:new", changeId: "c1" });
    off();
    expect(created!.closed).toBe(true);
  });

  it("reconnects after a dropped connection and fires onReconnect", () => {
    vi.useFakeTimers();
    const sockets: FakeWs[] = [];
    const onReconnect = vi.fn();
    const off = subscribe("http://s", "tok", () => {}, onReconnect,
      (url: string) => { const w = new FakeWs(url); sockets.push(w); return w; }, 5000);
    expect(sockets).toHaveLength(1);

    sockets[0].drop();
    vi.advanceTimersByTime(5000);
    expect(sockets).toHaveLength(2);
    expect(onReconnect).not.toHaveBeenCalled(); // erst nach erfolgreichem open
    sockets[1].open();
    expect(onReconnect).toHaveBeenCalledTimes(1);

    // Events der neuen Verbindung kommen weiter an
    off();
    expect(sockets[1].closed).toBe(true);
  });

  it("does not reconnect after an intentional unsubscribe", () => {
    vi.useFakeTimers();
    const sockets: FakeWs[] = [];
    const off = subscribe("http://s", "tok", () => {}, undefined,
      (url: string) => { const w = new FakeWs(url); sockets.push(w); return w; }, 5000);
    off();
    vi.advanceTimersByTime(20_000);
    expect(sockets).toHaveLength(1);
  });
});
