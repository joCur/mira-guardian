import React, { useEffect, useRef, useState } from "react";
import type { UpdateStatus } from "../../types/update.js";

/**
 * Sichtbar wird der Hinweis erst, wenn es wirklich etwas zu holen gibt: beim
 * Laden, wenn die neue Version bereitliegt, und bei einem Fehler zu einer
 * bekannten Version — dann führt der Weg über die Release-Seite. "aktuell",
 * "suche" und der Entwicklungsmodus sind Zustände ohne Handlungsbedarf und
 * bleiben der Versionsanzeige im Hüter-Tab überlassen.
 */
export function isUpdateVisible(s: UpdateStatus): boolean {
  if (s.phase === "downloading" || s.phase === "ready") return true;
  return s.phase === "error" && s.version !== null;
}

function labelFor(s: UpdateStatus): string {
  if (s.phase === "ready") return "Update bereit";
  if (s.phase === "downloading") return `Update … ${s.percent} %`;
  return "Update verfügbar";
}

export function UpdateBadge({ status, currentVersion, onInstall, onOpenNotes }: {
  status: UpdateStatus;
  currentVersion: string;
  onInstall: () => void;
  onOpenNotes: (url: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // Der Hinweis sitzt in der Titelleiste: ein Klick daneben oder Escape muss
  // ihn wieder schließen, sonst verdeckt die Karte den Inhalt darunter.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!isUpdateVisible(status)) return null;

  const ready = status.phase === "ready";
  const failed = status.phase === "error";
  const tone = ready
    ? "bg-ctp-green/20 text-ctp-green border-ctp-green/40 hover:bg-ctp-green/30"
    : failed
      ? "bg-ctp-yellow/15 text-ctp-yellow border-ctp-yellow/40 hover:bg-ctp-yellow/25"
      : "bg-ctp-surface0/60 text-ctp-subtext0 border-ctp-surface1 hover:text-ctp-subtext1";

  return (
    <div ref={box} className="relative" style={{ WebkitAppRegion: "no-drag" } as any}>
      <button onClick={() => setOpen(o => !o)} aria-expanded={open}
        title={ready ? `Version ${status.version} ist bereit` : labelFor(status)}
        className={`flex items-center gap-1.5 h-[26px] px-2.5 rounded-[7px] border text-sm font-semibold transition-colors ${tone}`}>
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M6 1.5v6m0 0L3.5 5m2.5 2.5L8.5 5M2 10h8" stroke="currentColor" strokeWidth="1.4"
            strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {labelFor(status)}
      </button>

      {open && (
        <div className="absolute right-0 top-[32px] z-30 w-[296px] bg-ctp-mantle border border-ctp-surface1 rounded-[10px] shadow-lg shadow-ctp-crust/50 px-4 py-3.5">
          <div className="text-base font-semibold text-ctp-text">
            {ready ? `Version ${status.version} ist bereit` : failed ? "Update nicht eingespielt" : `Version ${status.version} wird geladen`}
          </div>
          <div className="font-mono text-xs text-ctp-subtext0 mt-1">
            {currentVersion || "unbekannt"} → {status.version ?? "unbekannt"}
          </div>

          {status.phase === "downloading" && (
            <div className="mt-3 h-[5px] rounded-full bg-ctp-surface0 overflow-hidden">
              <div className="h-full bg-ctp-blue transition-all" style={{ width: `${status.percent}%` }} />
            </div>
          )}

          {ready && (
            <div className="text-sm text-ctp-subtext1 mt-2 leading-normal">
              Die neue Version ist heruntergeladen. Sie wird beim nächsten Start
              aktiv — die App startet dafür einmal neu.
            </div>
          )}

          {failed && (
            <div className="text-sm text-ctp-subtext1 mt-2 leading-normal">
              Das Update ließ sich nicht einspielen. Hol die neue Version aus dem
              Release und ersetze die App von Hand.
              <div className="font-mono text-xs text-ctp-overlay0 mt-1.5 break-words">{status.message}</div>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 mt-3">
            {status.notesUrl
              ? <button onClick={() => onOpenNotes(status.notesUrl!)}
                  className="text-sm text-ctp-blue hover:underline">Was ist neu ↗</button>
              : <span />}
            {ready && (
              <button onClick={onInstall}
                className="rounded-lg px-3.5 py-[7px] text-sm font-semibold bg-ctp-green/25 text-ctp-green border border-ctp-green/40 hover:bg-ctp-green/30 transition-colors whitespace-nowrap">
                Neu starten &amp; installieren
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
