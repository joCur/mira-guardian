import React, { useState } from "react";
import type { ChangeWithVotes, Guardian, VoteStatus } from "@guardian/shared";
import { fileType, STATUS_LABELS, STATUS_MARK } from "@guardian/shared";
import { statusText, statusBorder, aggregateDot, typeBadge } from "../../theme.js";
import { AdoLink } from "../AdoLink.js";
import { DiffView } from "../DiffView.js";
import { moveLabel } from "../RenameNotice.js";
import { EmptyState, ICON_SHIELD_CHECK } from "../EmptyState.js";
import { FilterBar, LevelPill } from "../FilterBar.js";
import { NO_FILTER, applyFilter, filterOptions, fundstelle, isFiltering, type Filter } from "../../filter.js";

interface Props {
  toRate: ChangeWithVotes[]; ratedByMe: ChangeWithVotes[]; selectedId: string | null;
  /** Aus dem Verlauf geöffnet und in keiner der beiden Listen — siehe store.ts. */
  fromHistory?: ChangeWithVotes | null;
  guardianId: string; guardians?: Guardian[]; onSelect: (id: string) => void;
  onVote: (id: string, status: VoteStatus, comment: string) => void;
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d.toLocaleDateString("de-DE", { day: "numeric", month: "long" });
}

/**
 * Warum dieser Eintrag trotz Suche in der Liste steht, wenn der Grund weder im
 * Namen noch in der Zusammenfassung sichtbar ist: der Treffer steckt im
 * Dokument. Dann zeigt die Zeile die Stelle.
 */
function FundstelleZeile({ change, filter }: { change: ChangeWithVotes; filter: Filter }) {
  const f = fundstelle(change, filter);
  if (!f) return null;
  return (
    <div title={f.imAltenStand ? "Fundstelle im bisherigen Stand" : "Fundstelle im Dokument"}
      className="flex items-baseline gap-1.5 min-w-0 mt-1 ml-[15px]">
      <span className="text-2xs px-1 py-px font-semibold tracking-wide rounded shrink-0 text-ctp-teal bg-ctp-teal/15">
        {f.imAltenStand ? "ALT" : "TEXT"}
      </span>
      <span className="text-xs text-ctp-subtext0 truncate">
        {f.vor}<span className="text-ctp-yellow bg-ctp-yellow/15 rounded-sm">{f.treffer}</span>{f.nach}
      </span>
    </div>
  );
}

/**
 * Abschnittskopf der Änderungsliste, zum Auf- und Zuklappen. Die Anzahl steht
 * daneben, damit ein zugeklappter Abschnitt trotzdem sagt, was in ihm steckt.
 */
function AbschnittKopf({ titel, anzahl, offen, onToggle, className = "pt-3.5" }: {
  titel: string; anzahl: number; offen: boolean; onToggle: () => void; className?: string;
}) {
  return (
    <button type="button" onClick={onToggle} aria-expanded={offen} title={offen ? "Zuklappen" : "Aufklappen"}
      className={`w-full flex items-center gap-1.5 px-3.5 pb-1.5 ${className} text-ctp-subtext0 hover:text-ctp-text transition-colors`}>
      {/* Gedrehtes Dreieck statt zweier Zeichen: eine Drehung, kein Sprung. */}
      <span className={`text-2xs shrink-0 transition-transform ${offen ? "rotate-90" : ""}`}>▶</span>
      <span className="text-xs tracking-[0.08em] font-semibold">{titel}</span>
      <span className="text-2xs font-semibold text-ctp-overlay0">{anzahl}</span>
    </button>
  );
}

function TypePill({ filePath, size }: { filePath: string; size: "sm" | "md" }) {
  const label = fileType(filePath).label;
  const t = typeBadge(label);
  // "sm" sitzt in der schmalen Änderungsliste neben dem Dateinamen.
  const cls = size === "sm" ? "text-2xs px-1 py-px" : "text-xs px-1.5 py-0.5";
  return <span className={`${cls} font-semibold tracking-wide rounded shrink-0 ${t.text} ${t.bg}`}>{label}</span>;
}

/** Klappzustand der drei Listenabschnitte. */
interface Klapp { zuBewerten: boolean; bewertet: boolean; verlauf: boolean }
// Offen steht nur die Arbeitsliste. Der Rest ist Nachschlagewerk und würde beim
// Durcharbeiten bloß scrollen lassen.
const KLAPP_START: Klapp = { zuBewerten: true, bewertet: false, verlauf: true };

export function ChangesTab(p: Props) {
  const [filter, setFilter] = useState<Filter>(NO_FILTER);
  const [aufgeklappt, setAufgeklappt] = useState<Klapp>(KLAPP_START);

  // Die aus dem Verlauf geöffnete Änderung gehört mit in die Auswahl, sonst
  // landet der Fallback auf der ersten offenen Änderung — also einer anderen
  // als der angeklickten.
  const alle = [...p.toRate, ...p.ratedByMe, ...(p.fromHistory ? [p.fromHistory] : [])];
  const optionen = filterOptions(alle, filter);
  const toRate = applyFilter(p.toRate, filter);
  const ratedByMe = applyFilter(p.ratedByMe, filter);
  // Gefiltert wird die Liste, nicht die Anzeige: eine offene Änderung bleibt
  // sichtbar, auch wenn sie gerade nicht zur Suche passt.
  const sel = alle.find(c => c.id === p.selectedId) ?? toRate[0] ?? ratedByMe[0] ?? p.fromHistory ?? undefined;

  if (alle.length === 0) return (
    <EmptyState paths={ICON_SHIELD_CHECK} title="Keine offenen Änderungen">
      Die Memory-Bank ist auf dem Stand, den alle Hüter bestätigt haben.
      Neue Änderungen erscheinen hier automatisch — du bekommst eine Benachrichtigung.
    </EmptyState>
  );

  const leer = toRate.length === 0 && ratedByMe.length === 0;
  const auswahl = (id: string) => p.onSelect(id);

  // Eine laufende Suche schlägt den Klappzustand: Treffer zu verstecken sieht
  // aus wie "nichts gefunden".
  const offen = (a: keyof Klapp, treffer: number) =>
    aufgeklappt[a] || (isFiltering(filter) && treffer > 0);
  // Ist nichts zu bewerten, wäre die Liste sonst leer, obwohl Bewertetes da ist.
  const bewertetOffen = offen("bewertet", ratedByMe.length) || toRate.length === 0;
  const umschalten = (a: keyof Klapp) => setAufgeklappt({ ...aufgeklappt, [a]: !aufgeklappt[a] });

  return (
    <div className="flex-1 flex min-h-0">
      {/* 320 statt 264 px: Monospace baut breiter, und in der Liste steht der
          Dateiname — abgeschnitten ist er wertlos, anders als der Pfad in der
          Detailüberschrift, der umbrechen darf. */}
      <div className="w-[320px] border-r border-ctp-surface0 overflow-y-auto shrink-0">
        <div className="px-3 py-2.5 border-b border-ctp-surface0">
          <FilterBar stacked placeholder="Suchen, auch im Text…" value={filter} onChange={setFilter}
            levels={optionen.levels} types={optionen.types} />
        </div>
        {toRate.length > 0 && <AbschnittKopf titel="ZU BEWERTEN" anzahl={toRate.length} className="pt-3"
          offen={offen("zuBewerten", toRate.length)} onToggle={() => umschalten("zuBewerten")} />}
        {offen("zuBewerten", toRate.length) && toRate.map(c => (
          <div key={c.id} onClick={() => auswahl(c.id)}
            className={`px-3.5 py-2 cursor-pointer border-l-2 transition-colors ${
              c.id === sel?.id ? "border-ctp-teal bg-ctp-surface0/60" : "border-transparent hover:bg-ctp-surface0/40"}`}>
            <div className="flex items-center gap-2 min-w-0">
              <span className={`w-[7px] h-[7px] rounded-full shrink-0 ${aggregateDot(c.votes.map(v => v.status))}`} />
              <span className="font-mono text-xs text-ctp-subtext1 truncate">{c.filePath.split("/").pop()}</span>
              <TypePill filePath={c.filePath} size="sm" />
            </div>
            {/* Der Dateiname allein sagt nicht, zu welcher App der Record gehört. */}
            <div className="flex items-center gap-1.5 min-w-0 mt-0.5 ml-[15px]">
              <LevelPill filePath={c.filePath} />
              <span className="text-xs text-ctp-subtext0 truncate">{c.summary}</span>
            </div>
            <FundstelleZeile change={c} filter={filter} />
          </div>
        ))}
        {/* Alles, wozu ich Stellung genommen habe — akzeptiert wie abgelehnt.
            Hier steht es nur noch zum Nachsehen, bewerten muss ich es nicht
            wieder. Erledigt ist es damit aber nicht: das Zeichen sagt, was ich
            gesagt habe. */}
        {ratedByMe.length > 0 && <AbschnittKopf titel="VON MIR BEWERTET" anzahl={ratedByMe.length}
          offen={bewertetOffen} onToggle={() => umschalten("bewertet")} />}
        {bewertetOffen && ratedByMe.map(c => {
          const mein = c.votes.find(v => v.guardianId === p.guardianId)?.status ?? "offen";
          return (
            <div key={c.id} onClick={() => auswahl(c.id)}
              className={`px-3.5 py-2 cursor-pointer border-l-2 transition-colors ${
                c.id === sel?.id ? "border-ctp-teal bg-ctp-surface0/60" : "border-transparent hover:bg-ctp-surface0/40"}`}>
              {/* Akzeptiertes darf zurücktreten; ein Einwand wartet aufs Meeting
                  und bleibt darum voll lesbar. */}
              <div className={`flex items-center gap-2 min-w-0 ${mein === "akzeptiert" ? "opacity-60" : ""}`}>
                <span title={STATUS_LABELS[mein]} className={`text-xs shrink-0 ${statusText(mein)}`}>{STATUS_MARK[mein]}</span>
                <span className="font-mono text-xs text-ctp-subtext1 truncate">{c.filePath.split("/").pop()}</span>
                <LevelPill filePath={c.filePath} />
              </div>
              <FundstelleZeile change={c} filter={filter} />
            </div>
          );
        })}
        {leer && (
          <div className="px-3.5 py-4 text-xs text-ctp-subtext0 leading-relaxed">
            Keine Änderung passt zur Suche.
          </div>
        )}
        {/* Eigener Abschnitt, damit sichtbar ist, warum diese Änderung in keiner
            der beiden Listen steht: sie ist längst durch. Sie wird nicht
            gefiltert — sie wurde gezielt aus dem Verlauf geöffnet. */}
        {p.fromHistory && (
          <>
            <AbschnittKopf titel="AUS DEM VERLAUF" anzahl={1}
              offen={aufgeklappt.verlauf} onToggle={() => umschalten("verlauf")} />
            {aufgeklappt.verlauf && <div onClick={() => auswahl(p.fromHistory!.id)}
              className={`px-3.5 py-2 cursor-pointer border-l-2 transition-colors ${
                p.fromHistory.id === sel?.id ? "border-ctp-teal bg-ctp-surface0/60" : "border-transparent hover:bg-ctp-surface0/40"}`}>
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-ctp-green text-xs shrink-0">✓✓</span>
                <span className="font-mono text-xs text-ctp-subtext1 truncate">{p.fromHistory.filePath.split("/").pop()}</span>
                <LevelPill filePath={p.fromHistory.filePath} />
              </div>
            </div>}
          </>
        )}
      </div>

      {sel
        ? <Detail key={sel.id} sel={sel} guardianId={p.guardianId} guardians={p.guardians}
            ausDemVerlauf={!!p.fromHistory && p.fromHistory.id === sel.id} onVote={p.onVote} />
        : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center px-6 pb-12">
              <div className="text-xs text-ctp-subtext0">Keine Änderung passt zur Suche.</div>
              {isFiltering(filter) && (
                <button onClick={() => setFilter(NO_FILTER)}
                  className="mt-3 rounded-lg px-3.5 py-1.5 text-xs text-ctp-subtext0 border border-ctp-surface1 hover:text-ctp-text transition-colors">
                  Filter zurücksetzen
                </button>
              )}
            </div>
          </div>
        )}
    </div>
  );
}

function Detail({ sel, guardianId, guardians, ausDemVerlauf, onVote }: {
  sel: ChangeWithVotes; guardianId: string; guardians?: Guardian[]; ausDemVerlauf: boolean;
  onVote: (id: string, status: VoteStatus, comment: string) => void;
}) {
  // Der Entwurf hängt an genau dieser Änderung — der key beim Aufruf sorgt
  // dafür, dass er beim Wechsel verschwindet statt mitzuwandern.
  const [draft, setDraft] = useState<{ status: VoteStatus; comment: string } | null>(null);

  const byId = new Map((guardians ?? []).map(g => [g.id, g]));
  const mine = sel.votes.find(v => v.guardianId === guardianId);
  // Keine Bewertungszeile heißt fachlich "noch nicht bewertet". Sonst stünde
  // eine leere Fußleiste da und die Änderung wäre nicht bewertbar.
  const meineBewertungSteht = !mine || mine.status === "offen";
  const draftValid = !!draft && draft.comment.trim().length >= 5;
  const selDate = fmtDate(sel.committedAt);

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <div className="px-5 pt-3.5 pb-3 border-b border-ctp-surface0">
        <div className="flex items-baseline gap-3 flex-wrap">
          <span className="font-mono text-sm font-semibold text-ctp-text break-all">{sel.filePath}</span>
          <TypePill filePath={sel.filePath} size="md" />
          {sel.changeKind === "add" && <span className="text-xs font-bold tracking-wide text-ctp-green bg-ctp-green/20 rounded px-1.5 py-0.5 shrink-0">NEUE DATEI</span>}
          {sel.changeKind === "delete" && <span className="text-xs font-bold tracking-wide text-ctp-red bg-ctp-red/20 rounded px-1.5 py-0.5 shrink-0">GELÖSCHT</span>}
          {sel.previousPath && <span className="text-xs font-bold tracking-wide text-ctp-blue bg-ctp-blue/20 rounded px-1.5 py-0.5 shrink-0">
            {moveLabel(sel.previousPath, sel.filePath).toUpperCase()}</span>}
          {ausDemVerlauf && <span className="text-xs font-bold tracking-wide text-ctp-green bg-ctp-green/20 rounded px-1.5 py-0.5 shrink-0">VON ALLEN AKZEPTIERT</span>}
          <span className="font-mono text-xs text-ctp-subtext0 bg-ctp-surface0 border border-ctp-surface1 rounded px-1.5 py-0.5 shrink-0">{sel.commitShort}</span>
          {/* Neben dem Commit, weil der Knopf genau dorthin führt: zum Diff
              dieses Commits in ADO. */}
          <AdoLink href={sel.adoLink} />
        </div>
        <div className="text-xs text-ctp-subtext0 mt-1">{sel.summary} · {sel.authorName}{selDate ? ` · ${selDate}` : ""}</div>
        <div className="flex gap-2 mt-2.5 flex-wrap">
          {sel.votes.map(v => {
            const g = byId.get(v.guardianId);
            return (
              <span key={v.guardianId} title={v.comment ?? ""}
                className={`flex items-center gap-1.5 bg-ctp-mantle border border-ctp-surface0 rounded-full py-1 ${g ? "pl-[5px] pr-2.5" : "px-2.5"}`}>
                {/* text-2xs: zwei Initialen bei 12 px füllen den 18-px-Kreis randlos. */}
                {g && (
                  <span className="w-[18px] h-[18px] rounded-full flex items-center justify-center text-2xs font-bold text-ctp-crust shrink-0"
                    style={{ backgroundColor: g.avatarColor }}>{g.initials}</span>
                )}
                {g && <span className="text-xs text-ctp-subtext1">{g.name.split(" ")[0]}</span>}
                <span className={`text-xs font-semibold ${statusText(v.status)}`}>{STATUS_LABELS[v.status]}</span>
              </span>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="max-w-[820px] mx-auto"><DiffView change={sel} /></div>
        {sel.votes.some(v => v.comment) && (
          <div className="max-w-[820px] mx-auto mt-6">
            <div className="text-xs tracking-[0.08em] text-ctp-subtext0 font-semibold mb-2">KOMMENTARE</div>
            {sel.votes.filter(v => v.comment).map(v => (
              <div key={v.guardianId} className={`border-l-2 ${statusBorder(v.status)} pl-3 py-1.5 mb-2 bg-ctp-mantle rounded-r-lg`}>
                <div className={`text-xs font-semibold ${statusText(v.status)}`}>
                  {byId.get(v.guardianId) ? `${byId.get(v.guardianId)!.name} · ` : ""}{STATUS_LABELS[v.status]}
                </div>
                <div className="text-xs text-ctp-subtext1 mt-0.5 leading-normal">{v.comment}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-ctp-surface0 bg-ctp-mantle px-5 py-3">
        {meineBewertungSteht && !draft && (
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="text-xs text-ctp-subtext0 flex-1 whitespace-nowrap">Deine Bestätigung steht aus:</span>
            <button onClick={() => onVote(sel.id, "akzeptiert", "")}
              className="rounded-lg px-4 py-2 text-xs font-semibold bg-ctp-green/25 text-ctp-green border border-ctp-green/40 hover:bg-ctp-green/30 transition-colors whitespace-nowrap">✓ Akzeptiert</button>
            <button onClick={() => setDraft({ status: "klaerung", comment: "" })}
              className="rounded-lg px-4 py-2 text-xs font-semibold bg-ctp-yellow/20 text-ctp-yellow border border-ctp-yellow/40 hover:bg-ctp-yellow/25 transition-colors whitespace-nowrap">? Klärungsbedarf</button>
            <button onClick={() => setDraft({ status: "abgelehnt", comment: "" })}
              className="rounded-lg px-4 py-2 text-xs font-semibold bg-ctp-red/20 text-ctp-red border border-ctp-red/40 hover:bg-ctp-red/25 transition-colors whitespace-nowrap">✕ Abgelehnt</button>
          </div>
        )}
        {draft && meineBewertungSteht && (
          <div>
            <div className={`text-xs font-semibold mb-1.5 ${statusText(draft.status)}`}>{STATUS_LABELS[draft.status]} — Kommentar erforderlich</div>
            {/* autoFocus: Wer „Klärungsbedarf" oder „Abgelehnt" drückt, will
                sofort tippen — ein zweiter Klick ins Feld wäre nur Reibung. */}
            <textarea autoFocus value={draft.comment} onChange={e => setDraft({ ...draft, comment: e.target.value })}
              placeholder="Warum? Dieser Kommentar wird im Wochen-Meeting besprochen…"
              className="w-full h-16 bg-ctp-crust border border-ctp-surface1 focus:border-ctp-overlay0 rounded-lg text-xs text-ctp-text placeholder:text-ctp-overlay0 px-2.5 py-2 resize-none outline-none" />
            <div className="flex gap-2.5 justify-end mt-2">
              <button onClick={() => setDraft(null)}
                className="rounded-lg px-3.5 py-[7px] text-xs text-ctp-subtext0 border border-ctp-surface1 hover:text-ctp-text transition-colors">Abbrechen</button>
              <button disabled={!draftValid} onClick={() => { onVote(sel.id, draft.status, draft.comment.trim()); setDraft(null); }}
                className="rounded-lg px-4 py-[7px] text-xs font-semibold border border-ctp-surface1 bg-ctp-surface0 text-ctp-text hover:bg-ctp-surface1 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-ctp-surface0">Bewertung speichern</button>
            </div>
          </div>
        )}
        {mine && mine.status !== "offen" && (
          <div className="flex items-center gap-3">
            <span className="text-xs text-ctp-subtext0 whitespace-nowrap">Deine Bewertung:</span>
            <span className={`text-xs font-semibold whitespace-nowrap ${statusText(mine.status)}`}>{STATUS_LABELS[mine.status]}</span>
            {mine.comment && <span className="text-xs text-ctp-subtext0 italic flex-1 truncate">„{mine.comment}"</span>}
            {!mine.comment && <span className="flex-1" />}
            <button onClick={() => onVote(sel.id, "offen", "")}
              className="rounded-lg px-3 py-1.5 text-xs text-ctp-subtext0 border border-ctp-surface1 hover:text-ctp-text transition-colors whitespace-nowrap">Neu bewerten</button>
          </div>
        )}
      </div>
    </div>
  );
}
