import { randomUUID } from "node:crypto";
import { istBilddatei, type Change, type ChangeKind } from "@guardian/shared";
import type { Config } from "../config.js";
import type { Store } from "../db/store.js";
import type { ChangeService } from "../domain/changeService.js";
import { ensureOpenCycle } from "../domain/cycles.js";
import type { AdoClient, AdoCommit, AdoFileChange } from "./adoClient.js";

const KIND: Record<AdoFileChange["changeType"], ChangeKind> = { add: "add", edit: "modify", delete: "delete" };

export class AdoPoller {
  constructor(
    private cfg: Config,
    private store: Store,
    private changes: ChangeService,
    private ado: AdoClient,
    private now: () => string,
    private onChange: (changeId: string, isNew: boolean) => void = () => {},
  ) {}

  // Bei einer Umbenennung liefert ADO beide Seiten: die Quellseite trägt den
  // alten Pfad, die Zielseite den neuen. Solange das Ziel in der Memory-Bank
  // landet, ist die Quellseite kein eigenes Ereignis — sie hätte im Commit
  // ohnehin keinen Inhalt mehr. Führt die Umbenennung dagegen aus den
  // Scan-Pfaden heraus, ist das Dokument für die Hüter wirklich weg: dann
  // bleibt die Quellseite als Löschung stehen.
  private withoutRenameSources(fileChanges: AdoFileChange[]): AdoFileChange[] {
    const movedWithin = new Set(
      fileChanges.filter(fc => fc.previousPath && this.matches(fc.path)).map(fc => fc.previousPath!));
    return fileChanges.filter(fc => !(fc.renameSource && movedWithin.has(fc.path)));
  }

  private matches(path: string): boolean {
    // Memory-Bank-Levels: Scan-Pfade gelten auf jeder Ebene (Repo-Root und
    // z. B. apps/<app>/…), aber nur auf Segmentgrenzen.
    return this.cfg.scanPaths.some(p => {
      const dir = p.replace(/\/+$/, "");
      return path === dir || path.startsWith(dir + "/") || path.includes("/" + dir + "/");
    });
  }

  /**
   * Zieht die Vergleichsbasis für Einträge nach, die noch ohne sie erfasst
   * wurden. Nötig, weil upsertChange old_md bewusst nicht überschreibt: ohne
   * diesen Schritt bliebe jede Änderung aus der Zeit davor als "neues
   * Dokument" stehen, statt den Diff zu zeigen. Liefert die Zahl der
   * ergänzten Einträge.
   */
  async ergaenzeFehlendeVergleichsbasen(): Promise<number> {
    let ergaenzt = 0;
    for (const c of this.store.listChangesWithoutBaseline()) {
      // Bilder tragen ihren Inhalt nicht in der Datenbank — für sie wird beide
      // Seiten erst beim Anzeigen geholt.
      if (istBilddatei(c.filePath)) continue;
      try {
        // Gegen den festgehaltenen Bezugspunkt, nicht gegen den jüngsten
        // Commit: sonst verkürzte der Nachtrag den Vergleich auf die letzte
        // Änderung, obwohl der Eintrag mehrere Commits umfasst.
        const basis = await this.ado.getItemContentBefore(
          c.previousPath ?? c.filePath, c.baselineCommitId ?? c.commitId);
        if (basis === null) continue; // ADO kennt keinen Vorgängerstand
        this.store.setBaseline(c.id, basis);
        ergaenzt++;
      } catch (e) {
        // Ein einzelner Ausfall darf die übrigen Einträge nicht mitreißen.
        console.error(`Vergleichsbasis für ${c.filePath} nicht ladbar:`, (e as Error).message);
      }
    }
    return ergaenzt;
  }

  /**
   * Der Stand, gegen den die Hüter vergleichen.
   *
   * Beim ersten Sichten ist das der Stand vor dem Commit. Solange die Änderung
   * im Review liegt, bleibt die einmal ermittelte Basis stehen — die Hüter
   * sollen alles sehen, was seit ihrem letzten Blick passiert ist, nicht nur
   * den jüngsten Commit.
   *
   * Haben dagegen alle Hüter akzeptiert, ist der Vorgang abgeschlossen: dann
   * wird der akzeptierte Stand zur neuen Basis. Sonst wüchse der Diff auf ewig
   * weiter und jede Folgeänderung zeigte erneut alles seit dem ersten Sichten
   * — das Review wäre nicht mehr zu gebrauchen.
   *
   * Fehlt die Basis dagegen, wird sie hier nachgeholt statt weitergeschleppt:
   * `upsertChange` schreibt `old_md` nur beim Anlegen, also bliebe so ein
   * Eintrag dauerhaft ohne Vergleich und zeigte das vollständige Dokument, als
   * wäre es neu angelegt. Genau das passiert Einträgen aus der Zeit vor der
   * Vergleichsbasis und solchen, die zuerst als reines Verschieben erfasst
   * wurden.
   */
  private async vergleichsbasis(
    existing: Change | undefined, fc: AdoFileChange, kind: ChangeKind,
    commitId: string, istBild: boolean, abgeschlossen: boolean,
  ): Promise<string | null> {
    if (existing?.oldMd != null && !abgeschlossen) return existing.oldMd;
    // Neu angelegt heißt: es gibt naturgemäß keinen Vorgängerstand. Beim reinen
    // Verschieben gibt es nichts zu vergleichen — und der alte Pfad ist im
    // Commit selbst schon weg, ADO kennt dazu keinen Stand. Bilder tragen ihren
    // Inhalt nicht in der Datenbank; beide Seiten holt die Bildroute.
    if (kind === "add" || kind === "rename" || istBild) return null;
    // Zwei Wege zum selben Schluss: Ist der Vorgang abgeschlossen, ist der
    // akzeptierte Stand die Basis. Wurde die Datei zuerst nur verschoben und
    // erst jetzt inhaltlich geändert, ist es der Stand aus dem
    // Verschiebe-Commit — dort war der Inhalt nachweislich derselbe wie davor
    // (gleiche Blob-Id in ADO).
    if ((abgeschlossen || existing?.changeKind === "rename") && existing?.newMd != null) return existing.newMd;
    // Ohne brauchbaren festgehaltenen Stand fragen wir ADO. Ein abgeschlossener
    // Vorgang fängt dabei von vorn an — Pfad und Bezugspunkt sind die des
    // aktuellen Commits, nicht die des alten Eintrags.
    if (!existing || abgeschlossen) {
      return this.ado.getItemContentBefore(fc.previousPath ?? fc.path, commitId);
    }
    return this.ado.getItemContentBefore(
      existing.previousPath ?? existing.filePath, existing.baselineCommitId ?? commitId);
  }

  async pollOnce(): Promise<string[]> {
    const { adoRepo: repo, adoBranch: branch } = this.cfg;
    const lastSeen = this.store.getLastSeenCommit(repo, branch);
    const all = await this.ado.listCommits(branch); // newest first
    const fresh: AdoCommit[] = [];
    if (lastSeen) {
      for (const c of all) { if (c.commitId === lastSeen) break; fresh.push(c); }
    } else {
      // Erststart ohne Cursor: nur die letzten backfillDays Tage übernehmen,
      // damit eine frische Instanz Kontext hat, aber nicht die gesamte
      // Repo-Historie als "neue" Änderungen einliest.
      const cutoffMs = Date.parse(this.now()) - this.cfg.backfillDays * 86_400_000;
      for (const c of all) {
        if (Number.isFinite(cutoffMs) && Date.parse(c.author.date) < cutoffMs) break;
        fresh.push(c);
      }
    }
    if (fresh.length === 0) return [];

    // oldest -> newest so newest content wins on repeated files
    const ordered = [...fresh].reverse();
    const matchedByCommit = new Map<string, AdoFileChange[]>();
    let hasMatch = false;
    for (const commit of ordered) {
      const fileChanges = this.withoutRenameSources(await this.ado.listCommitChanges(commit.commitId));
      // Idempotenz bei Re-Scans (Cursor-Rewind, Backfill): bereits eingelesene
      // Stände (gleiche Datei aus gleichem Commit) zählen nicht als Match —
      // sonst würde ein Re-Scan Votes resetten, Toasts auslösen oder einen
      // manuell geschlossenen Zyklus wiedereröffnen.
      const matched = fileChanges.filter(fc =>
        this.matches(fc.path) && !this.store.hasIngested(repo, branch, fc.path, commit.commitId));
      if (matched.length > 0) hasMatch = true;
      matchedByCommit.set(commit.commitId, matched);
    }

    if (!hasMatch) {
      // Nothing relevant landed; advance the cursor but don't touch the cycle
      // (a closed cycle stays closed until an actual matching change arrives).
      this.store.setLastSeenCommit(repo, branch, fresh[0].commitId);
      return [];
    }

    // A relevant change is about to be recorded: (re)open a cycle for it. This
    // is what lets a new week's cycle start on the first new change after a
    // manual close (spec §9) instead of leaving getOpenCycle() null forever.
    const cycle = ensureOpenCycle(this.store, this.now);

    const touched: string[] = [];
    for (const commit of ordered) {
      const fileChanges = matchedByCommit.get(commit.commitId) ?? [];
      for (const fc of fileChanges) {
        // Reines Umbenennen/Verschieben ist eine eigene Art von Änderung: es
        // gibt keinen Inhaltsdiff, aber es muss bestätigt werden können.
        const kind: ChangeKind = fc.previousPath && fc.contentUnchanged ? "rename" : KIND[fc.changeType];
        // Beim Verschieben wandert der bestehende Eintrag mit — gleiche
        // Identität, neuer Pfad. Sonst stünde dieselbe Datei doppelt in der
        // Liste, einmal unter dem alten und einmal unter dem neuen Pfad.
        const existing = (fc.previousPath ? this.store.getChangeByPath(repo, branch, fc.previousPath) : undefined)
          ?? this.store.getChangeByPath(repo, branch, fc.path);
        // Bilder werden nicht als Text eingelesen: über includeContent kommt
        // ein Binärinhalt nur beschädigt an. Beide Seiten holt stattdessen die
        // Bildroute beim Anzeigen direkt aus ADO.
        const istBild = istBilddatei(fc.path);
        // Von allen akzeptiert heißt: durch. Was jetzt kommt, ist ein eigener
        // Vorgang und fängt einen neuen Vergleich an — der Eintrag behält nur
        // seine Identität. Liegt dagegen noch eine Bewertung aus, sammelt er
        // weiter, damit niemand einen Zwischenstand übersieht.
        const abgeschlossen = existing !== undefined && this.changes.allAccepted(existing.id);
        const newMd = kind === "delete" || istBild
          ? null
          : await this.ado.getItemContent(fc.path, commit.commitId);
        const oldMd = await this.vergleichsbasis(existing, fc, kind, commit.commitId, istBild, abgeschlossen);
        const fortgesetzt = existing !== undefined && !abgeschlossen;
        const change: Change = {
          id: existing?.id ?? randomUUID(),
          repo, branch, filePath: fc.path, changeKind: kind,
          commitId: commit.commitId, commitShort: commit.commitId.slice(0, 7),
          authorName: commit.author.name, authorEmail: commit.author.email, committedAt: commit.author.date,
          summary: (commit.comment || "").split("\n")[0].trim(),
          oldMd, newMd, previousPath: fc.previousPath ?? null,
          // Bezugspunkt für die Vorher-Seite. Wie oldMd bleibt er beim ersten
          // erfassten Commit stehen, damit eine Folgeänderung den Vergleich
          // nicht auf den jüngsten Zwischenstand verkürzt — und rückt mit ihm
          // nach, sobald der Vorgang abgeschlossen war.
          baselineCommitId: (fortgesetzt ? existing.baselineCommitId : null) ?? commit.commitId,
          cycleId: cycle.id,
          // Ebenfalls neu beim abgeschlossenen Vorgang: sonst bliebe die neue
          // Änderung hinter der Wasserlinie des Catch-ups zurück und die Hüter
          // erführen beim nächsten Start nichts von ihr.
          firstSeenAt: fortgesetzt ? existing.firstSeenAt : this.now(),
        };
        this.store.upsertChange(change);
        if (existing) this.store.resetVotesForChange(change.id, this.now());
        this.changes.ensureVotesForChange(change.id, this.now());
        if (!touched.includes(change.id)) touched.push(change.id);
        // Ein abgeschlossener Vorgang, der wieder aufmacht, ist für die Hüter
        // eine neue Änderung — also auch mit Hinweis, nicht nur stiller
        // Aktualisierung einer Zeile, die sie längst abgehakt hatten.
        this.onChange(change.id, !fortgesetzt);
      }
    }
    this.store.setLastSeenCommit(repo, branch, fresh[0].commitId); // newest
    return touched;
  }
}
