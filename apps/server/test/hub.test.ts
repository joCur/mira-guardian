import { describe, it, expect } from "vitest";
import { RealtimeHub } from "../src/realtime/hub.js";

describe("RealtimeHub", () => {
  it("broadcasts JSON to all sinks", () => {
    const hub = new RealtimeHub();
    const got: string[] = [];
    hub.add({ send: d => got.push(d) });
    hub.broadcast({ type: "change:new", changeId: "c1" });
    expect(JSON.parse(got[0])).toEqual({ type: "change:new", changeId: "c1" });
  });

  it("drops a sink that throws and keeps others", () => {
    const hub = new RealtimeHub();
    const good: string[] = [];
    hub.add({ send: () => { throw new Error("dead"); } });
    hub.add({ send: d => good.push(d) });
    hub.broadcast({ type: "vote:updated", changeId: "c1" });
    hub.broadcast({ type: "vote:updated", changeId: "c2" });
    expect(good).toHaveLength(2);
  });
});
