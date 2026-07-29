import React, { useState, useEffect } from "react";
import type { ChangeWithVotes, Guardian, VoteStatus } from "@guardian/shared";
import { fileType, STATUS_LABELS } from "@guardian/shared";
import { statusText, statusBorder, aggregateDot, typeBadge } from "../../theme.js";
import { DiffView } from "../DiffView.js";
import { moveLabel } from "../RenameNotice.js";
import { EmptyState, ICON_SHIELD_CHECK } from "../EmptyState.js";

interface Props {
  toRate: ChangeWithVotes[]; acceptedByMe: ChangeWithVotes[]; selectedId: string | null;
  /** Aus dem Verlauf geöffnet und in keiner der beiden Listen — siehe store.ts. */
  fromHistory?: ChangeWithVotes | null;
  guardianId: string; guardians?: Guardian[]; onSelect: (id: string) => void;
  onVote: (id: string, status: VoteStatus, comment: string) => void;
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d.toLocaleDateString("de-DE", { day: "numeric", month: "long" });
}

function TypePill({ filePath, size }: { filePath: string; size: "sm" | "md" }) {
  const label = fileType(filePath).label;
  const t = typeBadge(label);
  const cls = size === "sm" ? "text-[8.5px] px-1 py-px" : "text-[10px] px-1.5 py-0.5";
  return <span className={`${cls} font-semibold tracking-wide rounded shrink-0 ${t.text} ${t.bg}`}>{label}</span>;
}

export function ChangesTab(p: Props) {
  // Die aus dem Verlauf geöffnete Änderung gehört mit in die Auswahl, sonst
  // landet der Fallback auf der ersten offenen Änderung — also einer anderen
  // als der angeklickten.
  const alle = [...p.toRate, ...p.acceptedByMe, ...(p.fromHistory ? [p.fromHistory] : [])];
  const sel = alle.find(c => c.id === p.selectedId) ?? p.toRate[0] ?? p.acceptedByMe[0] ?? p.fromHistory ?? undefined;
  const [draft, setDraft] = useState<{ status: VoteStatus; comment: string } | null>(null);
  useEffect(() => { setDraft(null); }, [p.selectedId]);

  if (!sel) return (
    <EmptyState paths={ICON_SHIELD_CHECK} title="Keine offenen Änderungen">
      Die Memory-Bank ist auf dem Stand, den alle Hüter bestätigt haben.
      Neue Änderungen erscheinen hier automatisch — du bekommst eine Benachrichtigung.
    </EmptyState>
  );
  const byId = new Map((p.guardians ?? []).map(g => [g.id, g]));
  const ausDemVerlauf = !!p.fromHistory && p.fromHistory.id === sel.id;
  const mine = sel.votes.find(v => v.guardianId === p.guardianId);
  // Keine Bewertungszeile heißt fachlich "noch nicht bewertet". Sonst stünde
  // eine leere Fußleiste da und die Änderung wäre nicht bewertbar.
  const meineBewertungSteht = !mine || mine.status === "offen";
  const draftValid = !!draft && draft.comment.trim().length >= 5;
  const selDate = fmtDate(sel.committedAt);

  return (
    <div className="flex-1 flex min-h-0">
      <div className="w-[264px] border-r border-ctp-surface0 overflow-y-auto shrink-0">
        <div className="px-3.5 pt-3 pb-1.5 text-[10.5px] tracking-[0.08em] text-ctp-subtext0 font-semibold">ZU BEWERTEN</div>
        {p.toRate.map(c => (
          <div key={c.id} onClick={() => { p.onSelect(c.id); setDraft(null); }}
            className={`px-3.5 py-2 cursor-pointer border-l-2 transition-colors ${
              c.id === sel.id ? "border-ctp-teal bg-ctp-surface0/60" : "border-transparent hover:bg-ctp-surface0/40"}`}>
            <div className="flex items-center gap-2 min-w-0">
              <span className={`w-[7px] h-[7px] rounded-full shrink-0 ${aggregateDot(c.votes.map(v => v.status))}`} />
              <span className="font-mono text-[11.5px] text-ctp-subtext1 truncate">{c.filePath.split("/").pop()}</span>
              <TypePill filePath={c.filePath} size="sm" />
            </div>
            <div className="text-[11px] text-ctp-subtext0 truncate mt-0.5 ml-[15px]">{c.summary}</div>
          </div>
        ))}
        {p.acceptedByMe.length > 0 && <div className="px-3.5 pt-3.5 pb-1.5 text-[10.5px] tracking-[0.08em] text-ctp-subtext0 font-semibold">VON MIR AKZEPTIERT</div>}
        {p.acceptedByMe.map(c => (
          <div key={c.id} onClick={() => { p.onSelect(c.id); setDraft(null); }}
            className={`px-3.5 py-2 cursor-pointer border-l-2 transition-colors ${
              c.id === sel.id ? "border-ctp-teal bg-ctp-surface0/60" : "border-transparent hover:bg-ctp-surface0/40"}`}>
            <div className="flex items-center gap-2 opacity-60 min-w-0">
              <span className="text-ctp-green text-[11px] shrink-0">✓</span>
              <span className="font-mono text-[11.5px] text-ctp-subtext1 truncate">{c.filePath.split("/").pop()}</span>
            </div>
          </div>
        ))}
        {/* Eigener Abschnitt, damit sichtbar ist, warum diese Änderung in keiner
            der beiden Listen steht: sie ist längst durch. */}
        {p.fromHistory && (
          <>
            <div className="px-3.5 pt-3.5 pb-1.5 text-[10.5px] tracking-[0.08em] text-ctp-subtext0 font-semibold">AUS DEM VERLAUF</div>
            <div onClick={() => { p.onSelect(p.fromHistory!.id); setDraft(null); }}
              className={`px-3.5 py-2 cursor-pointer border-l-2 transition-colors ${
                p.fromHistory.id === sel.id ? "border-ctp-teal bg-ctp-surface0/60" : "border-transparent hover:bg-ctp-surface0/40"}`}>
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-ctp-green text-[11px] shrink-0">✓✓</span>
                <span className="font-mono text-[11.5px] text-ctp-subtext1 truncate">{p.fromHistory.filePath.split("/").pop()}</span>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <div className="px-5 pt-3.5 pb-3 border-b border-ctp-surface0">
          <div className="flex items-baseline gap-3 flex-wrap">
            <span className="font-mono text-[15px] font-semibold text-ctp-text break-all">{sel.filePath}</span>
            <TypePill filePath={sel.filePath} size="md" />
            {sel.changeKind === "add" && <span className="text-[10px] font-bold tracking-wide text-ctp-green bg-ctp-green/20 rounded px-1.5 py-0.5 shrink-0">NEUE DATEI</span>}
            {sel.changeKind === "delete" && <span className="text-[10px] font-bold tracking-wide text-ctp-red bg-ctp-red/20 rounded px-1.5 py-0.5 shrink-0">GELÖSCHT</span>}
            {sel.previousPath && <span className="text-[10px] font-bold tracking-wide text-ctp-blue bg-ctp-blue/20 rounded px-1.5 py-0.5 shrink-0">
              {moveLabel(sel.previousPath, sel.filePath).toUpperCase()}</span>}
            {ausDemVerlauf && <span className="text-[10px] font-bold tracking-wide text-ctp-green bg-ctp-green/20 rounded px-1.5 py-0.5 shrink-0">VON ALLEN AKZEPTIERT</span>}
            <span className="font-mono text-[11px] text-ctp-subtext0 bg-ctp-surface0 border border-ctp-surface1 rounded px-1.5 py-0.5 shrink-0">{sel.commitShort}</span>
          </div>
          <div className="text-xs text-ctp-subtext0 mt-1">{sel.summary} · {sel.authorName}{selDate ? ` · ${selDate}` : ""}</div>
          <div className="flex gap-2 mt-2.5 flex-wrap">
            {sel.votes.map(v => {
              const g = byId.get(v.guardianId);
              return (
                <span key={v.guardianId} title={v.comment ?? ""}
                  className={`flex items-center gap-1.5 bg-ctp-mantle border border-ctp-surface0 rounded-full py-1 ${g ? "pl-[5px] pr-2.5" : "px-2.5"}`}>
                  {g && (
                    <span className="w-[18px] h-[18px] rounded-full flex items-center justify-center text-[9px] font-bold text-ctp-crust shrink-0"
                      style={{ backgroundColor: g.avatarColor }}>{g.initials}</span>
                  )}
                  {g && <span className="text-[11px] text-ctp-subtext1">{g.name.split(" ")[0]}</span>}
                  <span className={`text-[11px] font-semibold ${statusText(v.status)}`}>{STATUS_LABELS[v.status]}</span>
                </span>
              );
            })}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="max-w-[820px] mx-auto"><DiffView change={sel} /></div>
          {sel.votes.some(v => v.comment) && (
            <div className="max-w-[820px] mx-auto mt-6">
              <div className="text-[10.5px] tracking-[0.08em] text-ctp-subtext0 font-semibold mb-2">KOMMENTARE</div>
              {sel.votes.filter(v => v.comment).map(v => (
                <div key={v.guardianId} className={`border-l-2 ${statusBorder(v.status)} pl-3 py-1.5 mb-2 bg-ctp-mantle rounded-r-lg`}>
                  <div className={`text-[11px] font-semibold ${statusText(v.status)}`}>
                    {byId.get(v.guardianId) ? `${byId.get(v.guardianId)!.name} · ` : ""}{STATUS_LABELS[v.status]}
                  </div>
                  <div className="text-[12.5px] text-ctp-subtext1 mt-0.5 leading-normal">{v.comment}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-ctp-surface0 bg-ctp-mantle px-5 py-3">
          {meineBewertungSteht && !draft && (
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="text-xs text-ctp-subtext0 flex-1 whitespace-nowrap">Deine Bestätigung steht aus:</span>
              <button onClick={() => p.onVote(sel.id, "akzeptiert", "")}
                className="rounded-lg px-4 py-2 text-[12.5px] font-semibold bg-ctp-green/25 text-ctp-green border border-ctp-green/40 hover:bg-ctp-green/30 transition-colors whitespace-nowrap">✓ Akzeptiert</button>
              <button onClick={() => setDraft({ status: "klaerung", comment: "" })}
                className="rounded-lg px-4 py-2 text-[12.5px] font-semibold bg-ctp-yellow/20 text-ctp-yellow border border-ctp-yellow/40 hover:bg-ctp-yellow/25 transition-colors whitespace-nowrap">? Klärungsbedarf</button>
              <button onClick={() => setDraft({ status: "abgelehnt", comment: "" })}
                className="rounded-lg px-4 py-2 text-[12.5px] font-semibold bg-ctp-red/20 text-ctp-red border border-ctp-red/40 hover:bg-ctp-red/25 transition-colors whitespace-nowrap">✕ Abgelehnt</button>
            </div>
          )}
          {draft && meineBewertungSteht && (
            <div>
              <div className={`text-xs font-semibold mb-1.5 ${statusText(draft.status)}`}>{STATUS_LABELS[draft.status]} — Kommentar erforderlich</div>
              <textarea value={draft.comment} onChange={e => setDraft({ ...draft, comment: e.target.value })}
                placeholder="Warum? Dieser Kommentar wird im Wochen-Meeting besprochen…"
                className="w-full h-16 bg-ctp-crust border border-ctp-surface1 focus:border-ctp-overlay0 rounded-lg text-[13px] text-ctp-text placeholder:text-ctp-overlay0 px-2.5 py-2 resize-none outline-none" />
              <div className="flex gap-2.5 justify-end mt-2">
                <button onClick={() => setDraft(null)}
                  className="rounded-lg px-3.5 py-[7px] text-[12.5px] text-ctp-subtext0 border border-ctp-surface1 hover:text-ctp-text transition-colors">Abbrechen</button>
                <button disabled={!draftValid} onClick={() => { p.onVote(sel.id, draft.status, draft.comment.trim()); setDraft(null); }}
                  className="rounded-lg px-4 py-[7px] text-[12.5px] font-semibold border border-ctp-surface1 bg-ctp-surface0 text-ctp-text hover:bg-ctp-surface1 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-ctp-surface0">Bewertung speichern</button>
              </div>
            </div>
          )}
          {mine && mine.status !== "offen" && (
            <div className="flex items-center gap-3">
              <span className="text-[12.5px] text-ctp-subtext0 whitespace-nowrap">Deine Bewertung:</span>
              <span className={`text-[12.5px] font-semibold whitespace-nowrap ${statusText(mine.status)}`}>{STATUS_LABELS[mine.status]}</span>
              {mine.comment && <span className="text-xs text-ctp-subtext0 italic flex-1 truncate">„{mine.comment}"</span>}
              {!mine.comment && <span className="flex-1" />}
              <button onClick={() => p.onVote(sel.id, "offen", "")}
                className="rounded-lg px-3 py-1.5 text-xs text-ctp-subtext0 border border-ctp-surface1 hover:text-ctp-text transition-colors whitespace-nowrap">Neu bewerten</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
