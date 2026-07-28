import React from "react";
import type { ChangeWithVotes } from "@guardian/shared";
import { diffBlocks, type DiffBlock } from "../diff/diff.js";
import { splitFrontmatter, parseFm, diffFmFields } from "../diff/frontmatter.js";
import { FrontmatterCard } from "./FrontmatterCard.js";
import { MarkdownBlock } from "./MarkdownBlock.js";
import { RenameNotice } from "./RenameNotice.js";

function wrap(block: DiffBlock, i: number) {
  const inner = <MarkdownBlock md={block.md} />;
  if (block.kind === "add") return <div key={i} className="bg-ctp-green/15 border-l-[3px] border-ctp-green rounded-r-lg px-3 py-0.5 my-2">{inner}</div>;
  if (block.kind === "del") return <div key={i} className="bg-ctp-red/15 border-l-[3px] border-ctp-red rounded-r-lg px-3 py-0.5 my-2 line-through opacity-80">{inner}</div>;
  if (block.kind === "changed") return <div key={i} className="border-l-[3px] border-ctp-surface1 px-3 my-2">{inner}</div>;
  return <div key={i} className="my-2">{inner}</div>;
}

export function DiffView({ change }: { change: ChangeWithVotes }) {
  // Beim reinen Verschieben ist der Inhalt nachweislich derselbe (gleiche
  // Blob-Id in ADO). Ihn als "alles neu" zu zeigen wäre falsch — er wird
  // unmarkiert dargestellt, damit man nachlesen kann, worum es geht.
  const nurVerschoben = change.changeKind === "rename";
  const isNew = !nurVerschoben && !change.oldMd?.trim();
  const oldSplit = splitFrontmatter(change.oldMd ?? "");
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
      <FrontmatterCard fields={fields} />
      {fmBroken && <MarkdownBlock md={"```yaml\n" + newSplit.fm + "\n```"} />}
      {blocks.map(wrap)}
    </div>
  );
}
