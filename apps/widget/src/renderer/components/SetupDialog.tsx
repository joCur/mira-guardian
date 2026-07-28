import React, { useState } from "react";
import type { Guardian } from "@guardian/shared";
import type { ApiClient } from "../api/client.js";

const inputCls = "bg-ctp-crust border border-ctp-surface1 focus:border-ctp-green/50 rounded-lg text-[13px] text-ctp-text placeholder:text-ctp-overlay0 px-3 py-2.5 outline-none";
const primaryBtnCls = "w-full rounded-lg px-4 py-2.5 text-[13px] font-semibold transition-colors bg-ctp-green/25 text-ctp-green border border-ctp-green/40 hover:bg-ctp-green/30 disabled:bg-ctp-surface0/40 disabled:text-ctp-overlay0 disabled:border-ctp-surface0 disabled:cursor-not-allowed";

function LogoTitle({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-[30px] h-[30px] rounded-[9px] bg-ctp-teal/20 flex items-center justify-center font-mono text-[11px] font-semibold text-ctp-teal shrink-0">MB</span>
      <span className="text-base font-bold text-ctp-text">{title}</span>
    </div>
  );
}

// Server-Adresse säubern: trimmen, abschließenden / entfernen. Gibt null
// zurück, wenn es keine http(s)-URL ist.
export function normalizeServerUrl(raw: string): string | null {
  const v = raw.trim().replace(/\/+$/, "");
  if (!/^https?:\/\/\S+$/i.test(v)) return null;
  return v;
}

export function SetupDialog({ api, serverUrl, onServerUrl, onLinked }:
  { api: ApiClient; serverUrl: string; onServerUrl: (url: string) => Promise<void>;
    onLinked: (token: string, g: Guardian) => void }) {
  const [mode, setMode] = useState<"code" | "init">("code");
  const [url, setUrl] = useState(serverUrl);
  const [code, setCode] = useState("");
  const [initCode, setInitCode] = useState(""), [name, setName] = useState(""), [email, setEmail] = useState("");
  const [error, setError] = useState("");

  // Die eingegebene Adresse wird gespeichert und im selben Schritt verwendet:
  // Ein Client für genau diese Adresse, damit ein Klick genügt. Auf den von
  // AppRoot neu aufgebauten Client zu warten hieße, dass der erste Klick
  // scheinbar wirkungslos bleibt.
  async function apiForEnteredUrl(): Promise<{ client: ApiClient; url: string } | null> {
    const clean = normalizeServerUrl(url);
    if (!clean) { setError("Server-Adresse muss mit http:// oder https:// beginnen."); return null; }
    if (clean !== serverUrl) await onServerUrl(clean);
    return { client: api.withBaseUrl(clean), url: clean };
  }
  // Beide Wege verbinden sich mit dem Server, also braucht auch das Erst-Setup
  // die Adresse — sonst läuft die Initialisierung zwangsweise gegen den
  // vorbelegten localhost und der Gründungs-Hüter kommt nicht weiter.
  const urlField = (
    <>
      <label className="text-[10px] tracking-[0.08em] font-semibold uppercase text-ctp-subtext0">Server-Adresse</label>
      <input value={url} onChange={e => setUrl(e.target.value)} placeholder="http://localhost:4000"
        aria-label="Server-Adresse" className={inputCls} />
    </>
  );
  // Die Meldung nennt die eben eingegebene Adresse, nicht die gespeicherte —
  // sonst verweist ein Fehlschlag auf einen Server, der nie gefragt wurde.
  const connectHint = (e: Error, target: string) =>
    /fetch|network|failed/i.test(e.message)
      ? `${e.message} — erreichbar unter ${target}?`
      : e.message;

  async function redeem() {
    setError("");
    const target = await apiForEnteredUrl();
    if (!target) return;
    try { const r = await target.client.redeem(code.trim().toUpperCase()); onLinked(r.deviceToken, r.guardian); }
    catch (e) { setError(connectHint(e as Error, target.url)); }
  }
  async function init() {
    setError("");
    const target = await apiForEnteredUrl();
    if (!target) return;
    try { const r = await target.client.init(initCode.trim(), name.trim(), email.trim()); onLinked(r.deviceToken, r.guardian); }
    catch (e) { setError(connectHint(e as Error, target.url)); }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-ctp-crust/60 p-6">
      <div className="w-[440px] max-w-full bg-ctp-mantle border border-ctp-surface0 rounded-[14px] shadow-2xl overflow-hidden">
        {mode === "code" ? (
          <>
            <div className="px-[22px] pt-5 pb-3.5">
              <LogoTitle title="Gerät verknüpfen" />
              <p className="text-xs text-ctp-subtext0 mt-2.5 leading-relaxed">
                Du wurdest von einem Hüter angelegt und hast dabei einen{" "}
                <strong className="text-ctp-subtext1 font-semibold">einmaligen Zugangscode</strong> bekommen.
                Er verknüpft dieses Gerät mit deinem Hüter-Profil — danach ist keine Anmeldung mehr nötig.
              </p>
            </div>
            <div className="px-[22px] pb-[18px] pt-1 flex flex-col gap-2">
              {urlField}
              <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="MB-XXXX"
                className={`${inputCls} text-[17px] tracking-[0.2em] text-center font-mono p-3`} />
              {error && <div className="text-xs text-ctp-red text-center">{error}</div>}
              <button onClick={redeem} disabled={code.trim().length < 4} className={primaryBtnCls}>Verknüpfen</button>
            </div>
            <div className="px-[22px] py-3.5 bg-ctp-crust/50 border-t border-ctp-surface0">
              <p className="text-[11.5px] text-ctp-subtext0">Frische Installation, noch keine Hüter?{" "}
                <span onClick={() => { setMode("init"); setError(""); }} className="text-ctp-blue cursor-pointer hover:underline">Instanz initialisieren →</span></p>
            </div>
          </>
        ) : (
          <>
            <div className="px-[22px] pt-5 pb-3.5">
              <LogoTitle title="Instanz initialisieren" />
              <p className="text-xs text-ctp-subtext0 mt-2.5 leading-relaxed">
                Beim allerersten Start gibt der Server einmalig einen{" "}
                <strong className="text-ctp-subtext1 font-semibold">Erst-Setup-Code</strong> in der Konsole aus.
                Wer ihn eingibt, wird <strong className="text-ctp-subtext1 font-semibold">Gründungs-Hüter</strong>{" "}
                und lädt danach alle weiteren Hüter über Zugangscodes ein.
              </p>
              <div className="mt-3 bg-ctp-crust border border-ctp-surface0 rounded-lg px-3 py-2.5 font-mono text-[11px] leading-[1.7]">
                <div className="text-ctp-overlay0">$ docker compose up guardian-server</div>
                <div className="text-ctp-subtext0">▸ Keine Hüter gefunden — Erst-Setup aktiv</div>
                <div className="text-ctp-subtext1">▸ Setup-Code: <span className="text-ctp-green font-semibold">MB-XXXX-XXXX</span> <span className="text-ctp-overlay0">(einmalig gültig)</span></div>
              </div>
            </div>
            <div className="px-[22px] pb-[18px] pt-1 flex flex-col gap-2">
              {urlField}
              <input value={initCode} onChange={e => setInitCode(e.target.value)} placeholder="Setup-Code aus der Konsole"
                className={`${inputCls} text-center font-mono tracking-[0.1em]`} />
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Dein Name" className={inputCls} />
              <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Deine E-Mail" className={inputCls} />
              {error && <div className="text-xs text-ctp-red text-center">{error}</div>}
              <button onClick={init} disabled={!initCode.trim() || !name.trim() || !email.includes("@")} className={primaryBtnCls}>Als Gründungs-Hüter starten</button>
              <p className="text-[11.5px] text-ctp-subtext0 text-center">Du hast schon einen Zugangscode?{" "}
                <span onClick={() => { setMode("code"); setError(""); }} className="text-ctp-blue cursor-pointer hover:underline">← Zurück</span></p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
