import { aufloesenBildPfad, istBilddatei, type Change } from "@guardian/shared";
import type { AdoBytes, AdoClient } from "../ado/adoClient.js";

export type Bildseite = "vorher" | "nachher";

export function istBildseite(s: string): s is Bildseite {
  return s === "vorher" || s === "nachher";
}

/**
 * Liefert die Bilder zu einer Änderung — die geänderte Bilddatei selbst oder
 * ein Bild, das ein geändertes Dokument einbettet.
 *
 * Bilder liegen bewusst nicht in der Datenbank: sie würden sie pro Fassung um
 * hunderte Kilobyte wachsen lassen, und ADO ist zur Anzeigezeit ohnehin
 * erreichbar. Damit dieselbe Änderung nicht bei jedem Klick neu übertragen
 * wird, hält dieser Dienst die zuletzt geholten Bilder im Speicher.
 */
export class BildDienst {
  private cache = new Map<string, AdoBytes>();

  constructor(
    private ado: AdoClient,
    private maxEintraege = 40,
    private maxBytesJeBild = 8 * 1024 * 1024,
  ) {}

  async hole(change: Change, seite: Bildseite, eingebettet?: string): Promise<AdoBytes | null> {
    const ziel = this.zielpfad(change, seite, eingebettet);
    if (!ziel) return null;

    const schluessel = `${ziel.commitId}|${seite}|${ziel.pfad}`;
    const gecacht = this.cache.get(schluessel);
    if (gecacht) return gecacht;

    let bild = await this.ado.getItemBytes(ziel.pfad, ziel.commitId, seite === "vorher");
    // Ein eingebettetes Bild muss im selben Commit nicht mitgeändert worden
    // sein — dann kennt ADO zu diesem Commit keinen Vorgängerstand, und der
    // Stand im Commit selbst ist zugleich der Stand von vorher.
    if (!bild && seite === "vorher" && eingebettet) {
      bild = await this.ado.getItemBytes(ziel.pfad, ziel.commitId, false);
    }
    if (!bild) return null;

    if (bild.bytes.length <= this.maxBytesJeBild) {
      if (this.cache.size >= this.maxEintraege) {
        const aeltester = this.cache.keys().next().value;
        if (aeltester !== undefined) this.cache.delete(aeltester);
      }
      this.cache.set(schluessel, bild);
    }
    return bild;
  }

  private zielpfad(change: Change, seite: Bildseite, eingebettet?: string):
    { pfad: string; commitId: string } | null {
    // Die Vorher-Seite wird gegen den Commit gefragt, mit dem die Änderung
    // zuerst erfasst wurde — genauso, wie oldMd bei Dokumenten stehen bleibt.
    const commitId = seite === "vorher" ? (change.baselineCommitId ?? change.commitId) : change.commitId;
    // Nach einer Verschiebung liegt die alte Fassung noch unter dem alten Pfad.
    const dokument = seite === "vorher" ? (change.previousPath ?? change.filePath) : change.filePath;

    if (eingebettet) {
      const pfad = aufloesenBildPfad(dokument, eingebettet);
      if (!pfad || !istBilddatei(pfad)) return null;
      return { pfad, commitId };
    }

    if (!istBilddatei(dokument)) return null;
    // Gelöscht heißt: im Commit gibt es kein Nachher. Neu angelegt heißt:
    // davor gab es kein Vorher.
    if (seite === "nachher" && change.changeKind === "delete") return null;
    if (seite === "vorher" && change.changeKind === "add") return null;
    return { pfad: dokument, commitId };
  }
}
