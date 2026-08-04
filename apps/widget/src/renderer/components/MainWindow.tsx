import React from "react";

export type Tab = "changes" | "meeting" | "history" | "guardians";
const TABS: { id: Tab; label: string }[] = [
  { id: "changes", label: "Änderungen" }, { id: "meeting", label: "Offene Punkte" },
  { id: "history", label: "Verlauf" }, { id: "guardians", label: "Hüter" },
];

export function MainWindow({ tab, onTab, onClose, titleBarExtra, children }:
  { tab: Tab; onTab: (t: Tab) => void; onClose: () => void;
    /** Platz rechts in der Titelleiste — dort sitzt der Update-Hinweis. */
    titleBarExtra?: React.ReactNode; children: React.ReactNode }) {
  // macOS zeigt native Ampel-Buttons (titleBarStyle "hidden" im Main-Prozess):
  // links Platz dafür lassen und das eigene ✕ weglassen. Andere Plattformen
  // sind rahmenlos und brauchen den eigenen Schließen-Button.
  const isMac = navigator.platform.startsWith("Mac");
  return (
    <div className="w-screen h-screen bg-ctp-base flex flex-col overflow-hidden">
      {/* relative/z-20: die Karte des Update-Hinweises klappt aus der
          Titelleiste heraus und muss über dem Tab-Inhalt liegen. */}
      <div style={{ WebkitAppRegion: "drag" } as any}
        className={`relative z-20 flex items-center gap-3.5 ${isMac ? "pl-[80px]" : "pl-[18px]"} pr-[18px] py-2 border-b border-ctp-surface0 bg-ctp-mantle`}>
        <span className="text-[14px] font-semibold text-ctp-text">Memory-Bank Hüter</span>
        <div className="flex gap-0.5 ml-3">
          {TABS.map(t => (
            <div key={t.id} onClick={() => onTab(t.id)} style={{ WebkitAppRegion: "no-drag" } as any}
              className={`px-3.5 py-1 rounded-[7px] text-[14px] cursor-pointer transition-colors ${
                tab === t.id ? "text-ctp-text bg-ctp-surface0" : "text-ctp-subtext0 hover:text-ctp-subtext1 hover:bg-ctp-surface0/50"
              }`}>{t.label}</div>
          ))}
        </div>
        <div className="flex-1" />
        {titleBarExtra}
        {!isMac && (
          <div onClick={onClose} style={{ WebkitAppRegion: "no-drag" } as any}
            className="w-[26px] h-[26px] rounded-[7px] flex items-center justify-center text-[16px] text-ctp-subtext0 cursor-pointer hover:bg-ctp-surface0 hover:text-ctp-text transition-colors">✕</div>
        )}
      </div>
      {children}
    </div>
  );
}
