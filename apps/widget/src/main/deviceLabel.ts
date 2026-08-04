import { hostname } from "node:os";

const SYSTEMS: Record<string, string> = { darwin: "macOS", win32: "Windows", linux: "Linux" };

/**
 * Name, unter dem dieses Gerät in der eigenen Geräteliste steht. Er muss ohne
 * Nachfrage brauchbar sein: wer seinen Zugang entzieht, soll erkennen können,
 * welchen Rechner er da trifft. Vom Hostnamen bleibt nur der erste Teil — eine
 * angehängte Domain (`.local`, Firmen-Suffix) sagt über das Gerät nichts.
 */
export function deviceLabel(host: string = hostname(), platform: string = process.platform): string {
  const name = (host.split(".")[0] ?? "").trim();
  const system = SYSTEMS[platform] ?? platform;
  return name ? `${name} (${system})` : system;
}
