export interface Sink { send(data: string): void }
export type HubEvent = {
  type: "change:new" | "change:updated" | "vote:updated" | "guardian:added";
  changeId?: string;
};

export class RealtimeHub {
  private sinks = new Set<Sink>();
  add(sink: Sink) { this.sinks.add(sink); }
  remove(sink: Sink) { this.sinks.delete(sink); }
  broadcast(ev: HubEvent) {
    const data = JSON.stringify(ev);
    for (const sink of [...this.sinks]) {
      try { sink.send(data); } catch { this.sinks.delete(sink); }
    }
  }
}
