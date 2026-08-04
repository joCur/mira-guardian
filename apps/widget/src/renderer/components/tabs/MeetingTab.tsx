import React from "react";
import type { ChangeWithVotes, Guardian } from "@guardian/shared";
import { STATUS_LABELS } from "@guardian/shared";
import { statusText, statusBorder, aggregateDot } from "../../theme.js";
import type { MeetingResponse } from "../../api/client.js";
import { EmptyState, ICON_CIRCLE_CHECK } from "../EmptyState.js";

function worstStatus(c: ChangeWithVotes) {
  if (c.votes.some(v => v.status === "abgelehnt")) return "abgelehnt" as const;
  if (c.votes.some(v => v.status === "klaerung")) return "klaerung" as const;
  return "offen" as const;
}

function Card({ c, onOpen, byId }:
  { c: ChangeWithVotes; onOpen: (id: string) => void; byId: Map<string, Guardian> }) {
  return (
    <div className={`bg-ctp-mantle border border-ctp-surface0 rounded-[10px] px-[18px] py-4 mb-3 border-l-[3px] ${statusBorder(worstStatus(c))}`}>
      <div className="flex items-baseline gap-2.5 flex-wrap">
        <span className="font-mono text-sm font-semibold text-ctp-text break-all">{c.filePath}</span>
        <span className="text-xs text-ctp-subtext0">{c.commitShort} · {c.authorName}</span>
        <span className="flex-1" />
        <span onClick={() => onOpen(c.id)} className="text-xs text-ctp-blue cursor-pointer hover:underline whitespace-nowrap">Änderung ansehen →</span>
      </div>
      <div className="text-xs text-ctp-subtext1 mt-1">{c.summary}</div>

      {/* Stand aller Hüter — im Meeting ist so sichtbar, auf wen gewartet wird. */}
      <div className="flex gap-1.5 flex-wrap mt-2.5">
        {c.votes.map(v => (
          <span key={v.guardianId} title={v.comment ?? ""}
            className="flex items-center gap-1.5 bg-ctp-base border border-ctp-surface0 rounded-full py-1 pl-2 pr-2.5">
            <span className={`w-[7px] h-[7px] rounded-full shrink-0 ${aggregateDot([v.status])}`} />
            <span className="text-xs text-ctp-subtext1">{byId.get(v.guardianId)?.name.split(" ")[0] ?? "?"}</span>
            <span className={`text-xs font-semibold ${statusText(v.status)}`}>{STATUS_LABELS[v.status]}</span>
          </span>
        ))}
      </div>

      {c.votes.filter(v => v.comment).map(v => (
        <div key={v.guardianId} className={`border-l-2 ${statusBorder(v.status)} pl-3 py-1.5 mt-2.5 bg-ctp-base rounded-r-lg`}>
          <div className={`text-xs font-semibold ${statusText(v.status)}`}>
            {byId.get(v.guardianId) ? `${byId.get(v.guardianId)!.name} · ` : ""}{STATUS_LABELS[v.status]}
          </div>
          <div className="text-xs text-ctp-subtext1 mt-0.5 leading-normal">{v.comment}</div>
        </div>
      ))}
    </div>
  );
}

export function MeetingTab({ meeting, guardians, onOpen }:
  { meeting: MeetingResponse; guardians?: Guardian[]; onOpen: (id: string) => void }) {
  const byId = new Map((guardians ?? []).map(g => [g.id, g]));
  const { changes, counts } = meeting;

  // Ausstehende Bewertungen sind kein Gesprächsthema, sondern eine Zahl —
  // sie stehen als Hinweis über der Liste statt darin.
  const pendingHint = counts.offen > 0 && (
    <div className="text-xs text-ctp-subtext1 bg-ctp-surface0/50 border border-ctp-surface1 rounded-lg px-3 py-2 inline-flex w-fit">
      ⏳ {counts.offen} {counts.offen === 1 ? "Änderung wartet" : "Änderungen warten"} noch auf Bestätigungen — im Tab „Änderungen" zu finden
    </div>
  );

  if (changes.length === 0) return (
    <div className="flex-1 overflow-y-auto px-8 py-6">
      <div className="max-w-[820px] mx-auto flex flex-col items-center">
        <EmptyState paths={ICON_CIRCLE_CHECK} title="Nichts zu besprechen">
          Keine Ablehnungen und kein Klärungsbedarf. Sobald ein Hüter eine
          Änderung ablehnt oder zur Klärung stellt, erscheint sie hier.
        </EmptyState>
        {pendingHint}
      </div>
    </div>
  );

  const parts = [
    counts.abgelehnt > 0 && `${counts.abgelehnt} abgelehnt`,
    counts.klaerung > 0 && `${counts.klaerung} mit Klärungsbedarf`,
  ].filter(Boolean) as string[];

  return (
    <div className="flex-1 overflow-y-auto px-8 py-6">
      <div className="max-w-[820px] mx-auto">
        <div className="flex items-baseline gap-3.5 flex-wrap">
          <span className="text-lg font-bold text-ctp-text">Offene Punkte</span>
          <span className="text-xs text-ctp-subtext0">{parts.join(" · ")}</span>
        </div>
        {pendingHint && <div className="mt-2.5 mb-4">{pendingHint}</div>}
        {!pendingHint && <div className="mb-4" />}
        {changes.map(c => <Card key={c.id} c={c} onOpen={onOpen} byId={byId} />)}
      </div>
    </div>
  );
}
