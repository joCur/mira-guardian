import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { App } from "../src/renderer/main.js";

(globalThis as any).window.guardian = {
  getConfig: async () => ({ token: null, serverUrl: "http://s" }),
  setToken: async () => {}, clearToken: async () => {}, setServerUrl: async () => {},
};

describe("App", () => {
  it("renders the setup dialog", async () => {
    render(<App />);
    expect(await screen.findByText("Gerät verknüpfen")).toBeTruthy();
  });
});
