import React, { useState } from "react";
import type { Device, Guardian, RelinkCode } from "@guardian/shared";
import { abwesenheitOhneWirkung, istAbwesendLaut, kurzesDatum, MINDESTENS_ANWESEND, tagAus } from "@guardian/shared";
import type { UpdateStatus } from "../../../types/update.js";

interface Props {
  guardians: Guardian[];
  pending: { code: string; name: string; email: string }[];
  onInvite: (name: string, email: string) => void;
}

const initialsOf = (name: string) =>
  name.split(/\s+/).filter(Boolean).map(p => p[0]!.toUpperCase()).slice(0, 2).join("");

function zeitpunkt(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "unbekannt";
  return d.toLocaleDateString("de-DE", { day: "numeric", month: "long" }) +
    ", " + d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Abwesenheit eines Hüters — eintragen, ändern, löschen. Bewusst für *jeden*
 * Hüter bedienbar und nicht nur für einen selbst: wer krank ist, trägt sich
 * nicht selbst ein.
 */
function AbwesenheitZeile({ g, guardians, heute, onAbsence }: {
  g: Guardian; guardians: Guardian[]; heute: string;
  onAbsence: (guardianId: string, from: string | null, until: string | null) => Promise<void>;
}) {
  const [offen, setOffen] = useState(false);
  const [von, setVon] = useState(g.absentFrom ?? heute);
  const [bis, setBis] = useState(g.absentUntil ?? "");
  const [fehler, setFehler] = useState("");
  const abwesend = istAbwesendLaut(g, heute);
  const geplant = !abwesend && !!g.absentFrom && !!g.absentUntil && g.absentFrom > heute;
  const wirkungslos = abwesend && abwesenheitOhneWirkung(guardians, heute);

  async function speichern(from: string | null, until: string | null) {
    setFehler("");
    try { await onAbsence(g.id, from, until); setOffen(false); }
    catch (e) { setFehler((e as Error).message); }
  }

  return (
    <>
      <div className="flex items-center gap-2 mt-2 flex-wrap">
        {abwesend && (
          <span className="text-[11px] font-semibold text-ctp-mauve bg-ctp-mauve/15 rounded-full px-2.5 py-[3px]">
            abwesend bis {kurzesDatum(g.absentUntil!)}
          </span>
        )}
        {geplant && (
          <span className="text-[11px] text-ctp-subtext0">
            abwesend {kurzesDatum(g.absentFrom!)}–{kurzesDatum(g.absentUntil!)}
          </span>
        )}
        <button onClick={() => setOffen(!offen)}
          className="rounded-lg px-2.5 py-[5px] text-[11px] text-ctp-subtext0 border border-ctp-surface1 hover:text-ctp-text transition-colors">
          {abwesend || geplant ? "Abwesenheit ändern" : "Abwesenheit eintragen"}
        </button>
      </div>
      {wirkungslos && (
        <div className="text-[11.5px] text-ctp-yellow mt-1.5 leading-relaxed">
          Wirkt derzeit nicht: es müssen mindestens {MINDESTENS_ANWESEND} Hüter anwesend bleiben.
          Solange gilt weiter die Bestätigung aller.
        </div>
      )}
      {offen && (
        <div className="mt-2 rounded-lg border border-ctp-surface1 bg-ctp-crust/40 px-3.5 py-3">
          <div className="flex items-end gap-2.5 flex-wrap">
            <label className="flex flex-col gap-1">
              <span className="text-[10.5px] tracking-[0.06em] text-ctp-subtext0 font-semibold">VON</span>
              <input type="date" value={von} onChange={e => setVon(e.target.value)}
                className="bg-ctp-crust border border-ctp-surface1 focus:border-ctp-overlay0 rounded-lg text-[12.5px] text-ctp-text px-2.5 py-1.5 outline-none" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10.5px] tracking-[0.06em] text-ctp-subtext0 font-semibold">BIS</span>
              <input type="date" value={bis} onChange={e => setBis(e.target.value)}
                className="bg-ctp-crust border border-ctp-surface1 focus:border-ctp-overlay0 rounded-lg text-[12.5px] text-ctp-text px-2.5 py-1.5 outline-none" />
            </label>
            <button disabled={!von || !bis || bis < von} onClick={() => void speichern(von, bis)}
              className="rounded-lg px-3.5 py-2 text-[12px] font-semibold bg-ctp-mauve/20 text-ctp-mauve border border-ctp-mauve/40 hover:bg-ctp-mauve/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">Speichern</button>
            {(g.absentFrom || g.absentUntil) && (
              <button onClick={() => void speichern(null, null)}
                className="rounded-lg px-3 py-2 text-[12px] text-ctp-subtext0 border border-ctp-surface1 hover:text-ctp-text transition-colors">Löschen</button>
            )}
          </div>
          <div className="text-[11px] text-ctp-overlay0 mt-2 leading-relaxed">
            Beide Tage zählen mit. Während der Abwesenheit reicht die Bestätigung der anwesenden
            Hüter; die übersprungenen Änderungen stehen nach der Rückkehr zum Nachlesen bereit.
          </div>
          {fehler && <div className="text-[11.5px] text-ctp-red mt-2">{fehler}</div>}
        </div>
      )}
    </>
  );
}

/** Klartext zum Update-Zustand für die Versionsanzeige. */
export function updateSummary(u: UpdateStatus): string {
  switch (u.phase) {
    // Aus dem Entwicklungsstart heraus gibt es keine Installation, die sich
    // ersetzen ließe — die Suche würde nur ins Leere laufen.
    case "unsupported": return "Aktualisierung nur in der installierten App.";
    case "checking": return "Suche nach einer neueren Version …";
    case "downloading": return `Version ${u.version} wird geladen … ${u.percent} %`;
    case "ready": return `Version ${u.version} liegt bereit — der Hinweis oben startet die App neu.`;
    case "current": return "Dies ist der neueste Stand.";
    case "error": return `Die Suche ist gescheitert: ${u.message}`;
    default: return "Noch nicht nach Updates gesucht.";
  }
}

export function GuardiansTab({ guardians, pending, onInvite, serverUrl, onSignOut, appVersion, serverVersion,
  devices, onRelink, onRevoke, onAbsence, update, onCheckUpdate }:
  Props & { serverUrl: string; onSignOut: () => Promise<void>; appVersion: string; serverVersion: string | null;
    devices: Device[]; onRelink: (guardianId: string) => Promise<RelinkCode>; onRevoke: (deviceId: string) => Promise<void>;
    onAbsence?: (guardianId: string, from: string | null, until: string | null) => Promise<void>;
    update: UpdateStatus; onCheckUpdate: () => void }) {
  const heute = tagAus(new Date().toISOString());
  // Nur zwei bekannte, verschiedene Stände sind ein Hinweis. Ein Server, der
  // seine Version nicht nennt, ist älter als diese Anzeige, und die eigene
  // Version wird nachgeladen — beides sagt nichts darüber, ob die Stände
  // zusammenpassen.
  const laeuftAuseinander = !!appVersion && serverVersion !== null && serverVersion !== appVersion;
  const [name, setName] = useState(""), [email, setEmail] = useState("");
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const valid = !!name.trim() && email.includes("@");
  // Ausgestellter Code je Hüter — er wird einmalig angezeigt und nicht erneut
  // vom Server geholt, damit er nicht dauerhaft in der Oberfläche steht.
  const [relinkCodes, setRelinkCodes] = useState<Record<string, RelinkCode>>({});
  const [relinkError, setRelinkError] = useState<Record<string, string>>({});
  const [revoking, setRevoking] = useState<string | null>(null);

  async function relink(g: Guardian) {
    setRelinkError(e => ({ ...e, [g.id]: "" }));
    try {
      const code = await onRelink(g.id);
      setRelinkCodes(c => ({ ...c, [g.id]: code }));
    } catch (e) {
      setRelinkError(err => ({ ...err, [g.id]: (e as Error).message }));
    }
  }
  return (
    <div className="flex-1 overflow-y-auto px-8 py-6">
      <div className="max-w-[640px] mx-auto">
        <div className="text-[19px] font-bold text-ctp-text">Hüter</div>
        <div className="text-[12.5px] text-ctp-subtext0 mt-1">
          Jede Änderung an der Memory-Bank braucht die Bestätigung aller verknüpften Hüter —
          während einer eingetragenen Abwesenheit die der anwesenden.
        </div>
        <div className="mt-[18px] flex flex-col gap-2">
          {guardians.map(g => (
            <div key={g.id} className="bg-ctp-mantle border border-ctp-surface0 rounded-[10px] px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-ctp-crust shrink-0"
                  style={{ backgroundColor: g.avatarColor }}>{g.initials}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-ctp-text truncate">{g.name}</div>
                  <div className="font-mono text-[10.5px] text-ctp-subtext0 truncate">{g.email}</div>
                </div>
                <span className="text-[11px] font-semibold text-ctp-green bg-ctp-green/15 rounded-full px-2.5 py-[3px] shrink-0">✓ Verknüpft</span>
                {/* Der Code hängt am Profil, nicht am Gerät: er trägt Bewertungen
                    und Rolle auf den neuen Rechner mit. */}
                <button onClick={() => void relink(g)}
                  className="rounded-lg px-3 py-[6px] text-[11.5px] font-semibold whitespace-nowrap transition-colors bg-ctp-surface0/60 text-ctp-subtext1 border border-ctp-surface1 hover:text-ctp-text hover:border-ctp-overlay0 shrink-0">
                  Gerät verknüpfen
                </button>
              </div>
              {onAbsence && (
                <AbwesenheitZeile key={`${g.absentFrom}-${g.absentUntil}`}
                  g={g} guardians={guardians} heute={heute} onAbsence={onAbsence} />
              )}
              {relinkError[g.id] && (
                <div className="text-[11.5px] text-ctp-red mt-2">{relinkError[g.id]}</div>
              )}
              {relinkCodes[g.id] && (
                <div className="mt-2.5 rounded-lg border border-ctp-blue/30 bg-ctp-blue/10 px-3.5 py-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="font-mono text-[15px] tracking-[0.15em] text-ctp-text bg-ctp-surface0 border border-ctp-surface1 rounded-md px-2.5 py-1">
                      {relinkCodes[g.id].code}
                    </span>
                    <span className="text-[11px] text-ctp-subtext0">gültig bis {zeitpunkt(relinkCodes[g.id].expiresAt)}</span>
                  </div>
                  <div className="text-[11.5px] text-ctp-subtext1 mt-2 leading-relaxed">
                    Auf dem anderen Rechner beim Start unter <em>Gerät verknüpfen</em> eingeben.
                    Das Profil von {relinkCodes[g.id].guardianName} bleibt dasselbe — Bewertungen und Rolle
                    kommen mit. Der Code gilt einmalig; ein neuer entwertet diesen.
                  </div>
                </div>
              )}
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
          <div className="text-[10.5px] tracking-[0.08em] text-ctp-subtext0 font-semibold mb-2.5">MEINE GERÄTE</div>
          <div className="flex flex-col gap-2">
            {devices.map(d => (
              <div key={d.id} className="flex items-center gap-3 bg-ctp-base border border-ctp-surface0 rounded-lg px-3.5 py-2.5">
                <div className="flex-1 min-w-0">
                  <div className="text-[12.5px] font-semibold text-ctp-text truncate">{d.label}</div>
                  <div className="text-[10.5px] text-ctp-subtext0">letzter Kontakt {zeitpunkt(d.lastSeenAt)}</div>
                </div>
                {d.current
                  ? <span className="text-[11px] font-semibold text-ctp-green bg-ctp-green/15 rounded-full px-2.5 py-[3px] shrink-0">dieses Gerät</span>
                  : <button onClick={() => { setRevoking(d.id); void onRevoke(d.id).finally(() => setRevoking(null)); }}
                      disabled={revoking === d.id}
                      className="rounded-lg px-3 py-[6px] text-[11.5px] font-semibold whitespace-nowrap transition-colors bg-ctp-red/15 text-ctp-red border border-ctp-red/40 hover:bg-ctp-red/25 disabled:opacity-50 shrink-0">
                      Zugang entziehen
                    </button>}
              </div>
            ))}
          </div>
          <div className="text-[11px] text-ctp-overlay0 mt-2 leading-normal">
            Jedes verknüpfte Gerät bleibt angemeldet, bis du ihm den Zugang
            entziehst — beim Rechnerwechsel gehört der alte hier weg.
          </div>
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
                brauchst du einen neuen Zugangscode — den stellt dir jeder Hüter
                aus, auch du selbst auf einem anderen verknüpften Gerät. Dein
                Profil mit allen Bewertungen bleibt dabei erhalten. Ist kein
                Gerät mehr übrig, hilft der Betreiber am Server aus.
              </div>
              <div className="flex gap-2.5 justify-end mt-2.5">
                <button onClick={() => setConfirmSignOut(false)}
                  className="rounded-lg px-3.5 py-[7px] text-[12.5px] text-ctp-subtext0 border border-ctp-surface1 hover:text-ctp-text transition-colors">Abbrechen</button>
                <button onClick={() => void onSignOut()}
                  className="rounded-lg px-4 py-[7px] text-[12.5px] font-semibold bg-ctp-red/25 text-ctp-red border border-ctp-red/40 hover:bg-ctp-red/30 transition-colors">Abmelden</button>
              </div>
            </div>
          )}

          <div className="mt-4 pt-3.5 border-t border-ctp-surface0">
            <div className="text-[10.5px] tracking-[0.08em] text-ctp-subtext0 font-semibold mb-1.5">VERSION</div>
            <div className="font-mono text-[12.5px] text-ctp-subtext1">
              Widget {appVersion || "unbekannt"} · Server {serverVersion ?? "unbekannt"}
            </div>
            {laeuftAuseinander && (
              <div className="text-[11.5px] text-ctp-yellow mt-1.5 leading-normal">
                Die Stände laufen auseinander. Solange sie sich unterscheiden,
                kann die App Angaben anders auslegen als der Server sie meint —
                hol die fehlende Seite auf den gleichen Stand.
              </div>
            )}
            <div className="flex items-center gap-3 flex-wrap mt-2.5">
              <span className={`text-[11.5px] leading-normal flex-1 min-w-[200px] ${
                update.phase === "error" ? "text-ctp-yellow" : "text-ctp-overlay0"}`}>
                {updateSummary(update)}
              </span>
              {/* Im Entwicklungsstart gibt es nichts zu suchen; während Suche
                  und Download läuft die Prüfung schon. */}
              {update.phase !== "unsupported" && (
                <button onClick={onCheckUpdate}
                  disabled={update.phase === "checking" || update.phase === "downloading"}
                  className="rounded-lg px-3.5 py-[7px] text-[12px] font-semibold whitespace-nowrap transition-colors border border-ctp-surface1 text-ctp-subtext1 hover:text-ctp-text hover:bg-ctp-surface0 disabled:text-ctp-overlay0 disabled:hover:bg-transparent disabled:cursor-not-allowed">
                  Nach Updates suchen
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
