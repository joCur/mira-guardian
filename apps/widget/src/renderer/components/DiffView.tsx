import React from "react";
import { istBilddatei, type ChangeWithVotes } from "@guardian/shared";
import { diffBlocks, type DiffBlock } from "../diff/diff.js";
import { splitFrontmatter, parseFm, diffFmFields } from "../diff/frontmatter.js";
import { FrontmatterCard } from "./FrontmatterCard.js";
import { MarkdownBlock } from "./MarkdownBlock.js";
import { RenameNotice } from "./RenameNotice.js";
import { BaselineNotice } from "./BaselineNotice.js";
import { DiffUmfang } from "./DiffUmfang.js";
import { BildVergleich } from "./BildVergleich.js";
import { BildseiteProvider } from "../bild/kontext.js";

function wrap(changeId: string) {
  return function block(block: DiffBlock, i: number) {
    // Ein Bild im gelöschten Block gehört zur alten Fassung, überall sonst zur
    // neuen — sonst zeigte der Vergleich zweimal dasselbe Bild.
    const inner = (
      <BildseiteProvider changeId={changeId} seite={block.kind === "del" ? "vorher" : "nachher"}>
        <MarkdownBlock md={block.md} />
      </BildseiteProvider>
    );
    if (block.kind === "add") return <div key={i} className="bg-ctp-green/15 border-l-[3px] border-ctp-green rounded-r-lg px-3 py-0.5 my-2">{inner}</div>;
    if (block.kind === "del") return <div key={i} className="bg-ctp-red/15 border-l-[3px] border-ctp-red rounded-r-lg px-3 py-0.5 my-2 line-through opacity-80">{inner}</div>;
    if (block.kind === "changed") return <div key={i} className="border-l-[3px] border-ctp-surface1 px-3 my-2">{inner}</div>;
    return <div key={i} className="my-2">{inner}</div>;
  };
}

export function DiffView({ change }: { change: ChangeWithVotes }) {
  // Bilddateien haben keinen Text, den man zeilenweise vergleichen könnte.
  if (istBilddatei(change.filePath)) {
    return (
      <div>
        {change.previousPath && (
          <RenameNotice previousPath={change.previousPath} filePath={change.filePath} changeKind={change.changeKind} />
        )}
        <BildVergleich change={change} />
      </div>
    );
  }
  return <DokumentDiff change={change} />;
}

function DokumentDiff({ change }: { change: ChangeWithVotes }) {
  // Beim reinen Verschieben ist der Inhalt nachweislich derselbe (gleiche
  // Blob-Id in ADO). Ihn als "alles neu" zu zeigen wäre falsch — er wird
  // unmarkiert dargestellt, damit man nachlesen kann, worum es geht.
  const nurVerschoben = change.changeKind === "rename";
  // Sammelt der Eintrag mehrere Commits, lässt sich der jüngste für sich
  // zeigen — aber nur, wenn der Stand davor auch festgehalten wurde. Bei
  // Einträgen aus der Zeit davor fehlt er, dann bleibt es beim Gesamtdiff.
  const [nurLetzter, setNurLetzter] = React.useState(false);
  const gestaffelt = !nurVerschoben && change.commitCount > 1 && change.previousNewMd !== null;
  const zeigeLetzten = gestaffelt && nurLetzter;
  const basisMd = zeigeLetzten ? change.previousNewMd : change.oldMd;
  const isNew = !nurVerschoben && !basisMd?.trim();
  // Neu angelegt heißt: es gibt keinen Vorgängerstand. Bei allem anderen müsste
  // einer da sein — fehlt er, ist der unmarkierte Text kein "alles neu",
  // sondern eine Lücke, die benannt werden muss. In der Ausschnittsansicht ist
  // die fehlende Basis dagegen kein Thema: dort wird gar nicht gegen sie
  // verglichen.
  const basisFehlt = !zeigeLetzten && isNew && change.changeKind !== "add";
  const oldSplit = splitFrontmatter(basisMd ?? "");
  const newSplit = splitFrontmatter(change.newMd ?? "");
  const oldFm = parseFm(oldSplit.fm);
  const newFm = parseFm(newSplit.fm);
  const fmBroken = newSplit.fm !== null && newFm === null;
  const fields = fmBroken ? [] : diffFmFields(isNew || nurVerschoben ? null : oldFm, newFm);

  const blocks: DiffBlock[] = isNew || nurVerschoben
    ? (newSplit.body.trim() ? [{ kind: "same" as const, md: newSplit.body }] : [])
    : diffBlocks(oldSplit.body, newSplit.body);

  return (
    <div>
      {change.previousPath && (
        <RenameNotice previousPath={change.previousPath} filePath={change.filePath} changeKind={change.changeKind} />
      )}
      {basisFehlt && <BaselineNotice changeKind={change.changeKind} adoLink={change.adoLink} />}
      {gestaffelt && (
        <DiffUmfang commitCount={change.commitCount} nurLetzter={nurLetzter} onChange={setNurLetzter} />
      )}
      <FrontmatterCard fields={fields} />
      {fmBroken && <MarkdownBlock md={"```yaml\n" + newSplit.fm + "\n```"} />}
      {blocks.map(wrap(change.id))}
    </div>
  );
}
