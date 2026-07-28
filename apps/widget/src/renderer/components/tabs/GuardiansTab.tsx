import React, { useState } from "react";
import type { Guardian } from "@guardian/shared";

interface Props {
  guardians: Guardian[];
  pending: { code: string; name: string; email: string }[];
  onInvite: (name: string, email: string) => void;
}

const initialsOf = (name: string) =>
  name.split(/\s+/).filter(Boolean).map(p => p[0]!.toUpperCase()).slice(0, 2).join("");

export function GuardiansTab({ guardians, pending, onInvite, serverUrl, onSignOut }:
  Props & { serverUrl: string; onSignOut: () => Promise<void> }) {
  const [name, setName] = useState(""), [email, setEmail] = useState("");
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const valid = !!name.trim() && email.includes("@");
  return (
    <div className="flex-1 overflow-y-auto px-8 py-6">
      <div className="max-w-[640px] mx-auto">
        <div className="text-[19px] font-bold text-ctp-text">Hüter</div>
        <div className="text-[12.5px] text-ctp-subtext0 mt-1">Jede Änderung an der Memory-Bank braucht die Bestätigung aller verknüpften Hüter.</div>
        <div className="mt-[18px] flex flex-col gap-2">
          {guardians.map(g => (
            <div key={g.id} className="flex items-center gap-3 bg-ctp-mantle border border-ctp-surface0 rounded-[10px] px-4 py-3">
              <span className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-ctp-crust shrink-0"
                style={{ backgroundColor: g.avatarColor }}>{g.initials}</span>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-ctp-text truncate">{g.name}</div>
                <div className="font-mono text-[10.5px] text-ctp-subtext0 truncate">{g.email}</div>
              </div>
              <span className="text-[11px] font-semibold text-ctp-green bg-ctp-green/15 rounded-full px-2.5 py-[3px] shrink-0">✓ Verknüpft</span>
            </div>
          ))}
          {pending.map(p => (
            <div key={p.code} className="flex items-center gap-3 bg-ctp-base border border-dashed border-ctp-surface2 rounded-[10px] px-4 py-3">
              <span className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-ctp-subtext0 border border-dashed border-ctp-overlay0 shrink-0">{initialsOf(p.name)}</span>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-ctp-subtext1 truncate">{p.name}</div>
                <div className="font-mono text-[10.5px] text-ctp-subtext0 truncate">{p.email}</div>
              </div>
              <span className="text-[11px] font-semibold text-ctp-yellow bg-ctp-yellow/15 rounded-full px-2.5 py-[3px] shrink-0">Code offen</span>
              <span className="font-mono text-xs text-ctp-text bg-ctp-surface0 border border-ctp-surface1 rounded-md px-2 py-[3px] tracking-widest shrink-0">{p.code}</span>
            </div>
          ))}
        </div>
        <div className="mt-[22px] bg-ctp-mantle border border-ctp-surface0 rounded-[10px] px-[18px] py-4">
          <div className="text-[10.5px] tracking-[0.08em] text-ctp-subtext0 font-semibold mb-2.5">NEUEN HÜTER ANLEGEN</div>
          <div className="flex gap-2 flex-wrap">
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Name"
              className="flex-1 min-w-[150px] bg-ctp-crust border border-ctp-surface1 focus:border-ctp-overlay0 rounded-lg text-[13px] text-ctp-text placeholder:text-ctp-overlay0 px-3 py-2 outline-none" />
            <input value={email} onChange={e => setEmail(e.target.value)} placeholder="E-Mail"
              className="flex-1 min-w-[170px] bg-ctp-crust border border-ctp-surface1 focus:border-ctp-overlay0 rounded-lg text-[13px] text-ctp-text placeholder:text-ctp-overlay0 px-3 py-2 outline-none" />
            <button disabled={!valid} onClick={() => { onInvite(name.trim(), email.trim()); setName(""); setEmail(""); }}
              className="rounded-lg px-[18px] py-2 text-[12.5px] font-semibold whitespace-nowrap transition-colors bg-ctp-green/25 text-ctp-green border border-ctp-green/40 hover:bg-ctp-green/30 disabled:bg-ctp-surface0/40 disabled:text-ctp-overlay0 disabled:border-ctp-surface0 disabled:cursor-not-allowed">Zugangscode erzeugen</button>
          </div>
          <div className="text-[11px] text-ctp-overlay0 mt-2 leading-normal">Erzeugt einen einmaligen Zugangscode. Der neue Hüter gibt ihn beim ersten Start ein — erst danach zählt seine Bestätigung bei Änderungen.</div>
        </div>

        <div className="mt-[22px] bg-ctp-mantle border border-ctp-surface0 rounded-[10px] px-[18px] py-4">
          <div className="text-[10.5px] tracking-[0.08em] text-ctp-subtext0 font-semibold mb-2.5">VERBINDUNG</div>
          <div className="flex items-center gap-3 flex-wrap">
            {/* Die Adresse ist an den Zugang gebunden: Der Token gilt nur für
                diesen Server. Ändern geht deshalb nur über Abmelden und neu
                verknüpfen — sonst liefe die App in stumme 401er. */}
            <span className="font-mono text-[12.5px] text-ctp-subtext1 break-all flex-1 min-w-[200px]">{serverUrl}</span>
            <button onClick={() => setConfirmSignOut(true)}
              className="rounded-lg px-[18px] py-2 text-[12.5px] font-semibold whitespace-nowrap transition-colors bg-ctp-red/15 text-ctp-red border border-ctp-red/40 hover:bg-ctp-red/25">Abmelden</button>
          </div>
          <div className="text-[11px] text-ctp-overlay0 mt-2 leading-normal">
            Adresse des Guardian-Servers. Sie gehört zu deinem Zugang und lässt
            sich nur beim Verknüpfen festlegen — melde dich ab, um dieses Gerät
            mit einem anderen Server zu verbinden.
          </div>
          {confirmSignOut && (
            <div className="mt-3 rounded-lg border border-ctp-red/40 bg-ctp-red/10 px-3.5 py-3">
              <div className="text-[12.5px] font-semibold text-ctp-red">Wirklich abmelden?</div>
              <div className="text-[11.5px] text-ctp-subtext1 mt-1 leading-relaxed">
                Der Zugang dieses Geräts wird gelöscht. Zum Wiederverbinden
                brauchst du einen neuen Zugangscode von einem anderen Hüter —
                bist du der einzige Hüter, kommst du nur über eine neue
                Server-Einrichtung zurück.
              </div>
              <div className="flex gap-2.5 justify-end mt-2.5">
                <button onClick={() => setConfirmSignOut(false)}
                  className="rounded-lg px-3.5 py-[7px] text-[12.5px] text-ctp-subtext0 border border-ctp-surface1 hover:text-ctp-text transition-colors">Abbrechen</button>
                <button onClick={() => void onSignOut()}
                  className="rounded-lg px-4 py-[7px] text-[12.5px] font-semibold bg-ctp-red/25 text-ctp-red border border-ctp-red/40 hover:bg-ctp-red/30 transition-colors">Abmelden</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
