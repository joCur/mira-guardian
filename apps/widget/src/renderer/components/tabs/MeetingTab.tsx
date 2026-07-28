import React, { useState } from "react";
import type { ChangeWithVotes, Guardian } from "@guardian/shared";
import { STATUS_LABELS } from "@guardian/shared";
import { statusText, statusBorder } from "../../theme.js";
import type { MeetingResponse } from "../../api/client.js";
import { EmptyState, ICON_CIRCLE_CHECK } from "../EmptyState.js";

function Card({ c, onOpen, accent, byId }:
  { c: ChangeWithVotes; onOpen: (id: string) => void; accent: string; byId: Map<string, Guardian> }) {
  return (
    <div className={`bg-ctp-mantle border border-ctp-surface0 rounded-[10px] px-[18px] py-4 mb-3 border-l-[3px] ${accent}`}>
      <div className="flex items-baseline gap-2.5 flex-wrap">
        <span className="font-mono text-[13.5px] font-semibold text-ctp-text break-all">{c.filePath}</span>
        <span className="text-[11.5px] text-ctp-subtext0">{c.commitShort} · {c.authorName}</span>
        <span className="flex-1" />
        <span onClick={() => onOpen(c.id)} className="text-[11.5px] text-ctp-blue cursor-pointer hover:underline whitespace-nowrap">Änderung ansehen →</span>
      </div>
      <div className="text-[12.5px] text-ctp-subtext1 mt-1">{c.summary}</div>
      {c.votes.filter(v => v.comment).map(v => (
        <div key={v.guardianId} className={`border-l-2 ${statusBorder(v.status)} pl-3 py-1.5 mt-2.5 bg-ctp-base rounded-r-lg`}>
          <div className={`text-[11px] font-semibold ${statusText(v.status)}`}>
            {byId.get(v.guardianId) ? `${byId.get(v.guardianId)!.name} · ` : ""}{STATUS_LABELS[v.status]}
          </div>
          <div className="text-[12.5px] text-ctp-subtext1 mt-0.5 leading-normal">{v.comment}</div>
        </div>
      ))}
    </div>
  );
}

export function MeetingTab({ meeting, guardians, onOpen, onClose }:
  { meeting: MeetingResponse; guardians?: Guardian[]; onOpen: (id: string) => void; onClose?: (note: string) => void }) {
  const [note, setNote] = useState("");
  const byId = new Map((guardians ?? []).map(g => [g.id, g]));

  // Ohne offenen Zyklus gibt es kein Meeting — der nächste startet automatisch
  // mit der ersten neuen Änderung.
  if (!meeting.cycle) return (
    <EmptyState paths={ICON_CIRCLE_CHECK} title="Kein aktiver Wochen-Zyklus">
      Der letzte Zyklus ist abgeschlossen. Der nächste startet automatisch,
      sobald die erste neue Änderung an der Memory-Bank eintrifft.
    </EmptyState>
  );

  const nothingToDiscuss = meeting.rejected.length === 0 && meeting.klaerung.length === 0;
  return (
    <div className="flex-1 overflow-y-auto px-8 py-6">
      <div className="max-w-[760px] mx-auto">
        <div className="flex items-baseline gap-3.5 flex-wrap justify-between">
          <div className="flex items-baseline gap-3.5 flex-wrap">
            <span className="text-[19px] font-bold text-ctp-text">Wochen-Meeting · {meeting.cycle?.isoWeek ?? "—"}</span>
            <span className="text-[12.5px] text-ctp-subtext0">{meeting.rejected.length} abgelehnt · {meeting.klaerung.length} mit Klärungsbedarf</span>
          </div>
          {meeting.cycle && (
            <div className="flex items-center gap-2">
              <input value={note} onChange={e => setNote(e.target.value)} placeholder="Notiz (optional)"
                className="bg-ctp-crust border border-ctp-surface1 focus:border-ctp-overlay0 rounded-lg text-[12px] text-ctp-text placeholder:text-ctp-overlay0 px-2.5 py-1.5 outline-none w-48" />
              <button onClick={() => onClose?.(note)}
                className="rounded-lg px-3.5 py-1.5 text-[12.5px] font-semibold bg-ctp-green/25 text-ctp-green border border-ctp-green/40 hover:bg-ctp-green/30 transition-colors whitespace-nowrap">
                Meeting abgeschlossen
              </button>
            </div>
          )}
        </div>
        {meeting.outstanding > 0 && (
          <div className="mt-2.5 text-xs text-ctp-yellow bg-ctp-yellow/15 border border-ctp-yellow/30 rounded-lg px-3 py-2 inline-flex w-fit">
            ⏳ {meeting.outstanding} {meeting.outstanding === 1 ? "Bestätigung steht" : "Bestätigungen stehen"} noch aus
          </div>
        )}
        {nothingToDiscuss && (
          <div className="mt-6 rounded-[10px] border border-ctp-green/30 bg-ctp-green/10 px-4 py-3 flex items-center gap-2.5">
            <span className="text-ctp-green text-[15px]">✓</span>
            <div className="text-[12.5px] text-ctp-subtext1">
              <span className="font-semibold text-ctp-green">Nichts zu besprechen</span> — keine Ablehnungen und kein Klärungsbedarf in dieser Woche.
            </div>
          </div>
        )}
        {meeting.rejected.length > 0 && (
          <div className="mt-[26px]">
            <div className="flex items-center gap-2 mb-3"><span className="w-2 h-2 rounded-full bg-ctp-red" />
              <span className="text-[13px] font-bold text-ctp-red tracking-wide">ABGELEHNT</span></div>
            {meeting.rejected.map(c => <Card key={c.id} c={c} onOpen={onOpen} accent="border-l-ctp-red" byId={byId} />)}
          </div>
        )}
        {meeting.klaerung.length > 0 && (
          <div className="mt-[26px]">
            <div className="flex items-center gap-2 mb-3"><span className="w-2 h-2 rounded-full bg-ctp-yellow" />
              <span className="text-[13px] font-bold text-ctp-yellow tracking-wide">KLÄRUNGSBEDARF</span></div>
            {meeting.klaerung.map(c => <Card key={c.id} c={c} onOpen={onOpen} accent="border-l-ctp-yellow" byId={byId} />)}
          </div>
        )}
        {meeting.accepted.length > 0 && (
          <div className="mt-7 px-3.5 py-2.5 bg-ctp-mantle border border-ctp-surface0 rounded-[9px] flex items-center gap-2.5">
            <span className="text-ctp-green text-[13px]">✓</span>
            <span className="text-xs text-ctp-subtext0">{meeting.accepted.length} {meeting.accepted.length === 1 ? "Änderung" : "Änderungen"} von allen bestätigt:{" "}
              <span className="font-mono text-[11px] text-ctp-subtext1">{meeting.accepted.map(c => c.filePath.split("/").pop()).join(", ")}</span></span>
          </div>
        )}
      </div>
    </div>
  );
}
