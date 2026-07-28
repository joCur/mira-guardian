import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { fileType } from "@guardian/shared";
import { typeBadge } from "../theme.js";
import type { ToastData } from "../../types/bridge.js";

// Mehr als 5 ungelesene Karten stapeln wir nicht — die ältesten fallen raus;
// die Liste im Hauptfenster bleibt ohnehin die vollständige Wahrheit.
const MAX_STACK = 5;

export function Toast({ data, onView, onDismiss }:
  { data: ToastData; onView: () => void; onDismiss: () => void }) {
  const label = fileType(data.filePath).label;
  const t = typeBadge(label);
  return (
    <div className="w-[352px] bg-ctp-mantle border border-ctp-surface1 rounded-xl shadow-2xl overflow-hidden animate-toast-in">
      <div className="px-3.5 py-3">
        <div className="flex items-center gap-1.5">
          <span className="text-[12.5px] font-semibold text-ctp-text">Memory-Bank geändert</span>
          <span className="flex-1" />
          <span onClick={onDismiss} aria-label="Schließen"
            className="text-[13px] leading-none text-ctp-overlay0 hover:text-ctp-text cursor-pointer p-0.5">✕</span>
        </div>
        <div className="flex items-center gap-1.5 mt-1 min-w-0">
          <span className="font-mono text-xs text-ctp-text truncate">{data.filePath.split("/").pop()}</span>
          <span className={`text-[9px] font-semibold tracking-wide rounded px-1 py-px shrink-0 ${t.text} ${t.bg}`}>{label}</span>
          {data.changeKind === "add" && (
            <span className="text-[9px] font-bold tracking-wide text-ctp-green bg-ctp-green/20 rounded px-1 py-px shrink-0">NEU</span>
          )}
        </div>
        <div className="text-[11.5px] text-ctp-subtext0 truncate mt-0.5">{data.summary} · {data.authorName}</div>
      </div>
      <div className="flex border-t border-ctp-surface0">
        <div onClick={onView}
          className="flex-1 text-center py-2 text-xs font-semibold text-ctp-green cursor-pointer border-r border-ctp-surface0 hover:bg-ctp-surface0/60 transition-colors">Ansehen</div>
        <div onClick={onDismiss}
          className="flex-1 text-center py-2 text-xs text-ctp-subtext0 cursor-pointer hover:bg-ctp-surface0/60 hover:text-ctp-text transition-colors">Später</div>
      </div>
    </div>
  );
}

// Eigenständige Route (#toast) im Toast-Fenster: sammelt eingehende Karten zu
// einem Stapel (kein Auto-Dismiss) — jede Karte wird einzeln geöffnet oder
// weggeklickt, das Fenster wächst/schrumpft über guardian.toastResize mit.
export function ToastApp() {
  const [toasts, setToasts] = useState<ToastData[]>([]); // älteste zuerst
  const ref = useRef<HTMLDivElement>(null);
  const isMac = navigator.platform.startsWith("Mac");

  useEffect(() => {
    // Das Toast-Fenster ist transparent — die Karten bringen ihren eigenen Hintergrund mit.
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    return window.guardian.onToastData((d) => {
      setToasts((list) => [...list.filter(t => t.changeId !== d.changeId), d].slice(-MAX_STACK));
    });
  }, []);

  // Fensterhöhe dem Inhalt nachführen — der Main-Prozess ankert das Fenster
  // plattformabhängig (macOS oben rechts, sonst unten rechts).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const report = () => void window.guardian.toastResize(Math.ceil(el.getBoundingClientRect().height));
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const remove = (id: string, view: boolean) => {
    const next = toasts.filter(t => t.changeId !== id);
    setToasts(next);
    if (view) void window.guardian.toastAction("view", id);
    if (next.length === 0) void window.guardian.toastAction("dismiss", null);
  };

  // macOS stapelt neue Benachrichtigungen oben, Windows unten an der Ecke.
  const ordered = isMac ? [...toasts].reverse() : toasts;
  return (
    <div ref={ref} className="p-3 flex flex-col gap-2 items-end">
      {ordered.map(t => (
        <Toast key={t.changeId} data={t}
          onView={() => remove(t.changeId, true)}
          onDismiss={() => remove(t.changeId, false)} />
      ))}
    </div>
  );
}
