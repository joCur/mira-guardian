import React from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkDiffMarks from "../diff/remarkDiffMarks.js";

function LinkOut({ href, children }: { href?: string; children?: React.ReactNode }) {
  const ok = !!href && /^https?:\/\//.test(href);
  if (!ok) return <span className="text-ctp-subtext1">{children}</span>;
  return (
    <a href={href} onClick={e => { e.preventDefault(); Promise.resolve(window.guardian.openExternal(href!)).catch(() => {}); }}
      className="text-ctp-blue underline decoration-ctp-blue/40 hover:decoration-ctp-blue cursor-pointer">
      {children}
    </a>
  );
}

const components: Components = {
  h1: p => <h1 className="text-[17px] font-semibold text-ctp-text mt-3 mb-1.5">{p.children}</h1>,
  h2: p => <h2 className="text-[15px] font-semibold text-ctp-text mt-3 mb-1.5">{p.children}</h2>,
  h3: p => <h3 className="text-[13.5px] font-semibold text-ctp-text mt-2.5 mb-1">{p.children}</h3>,
  h4: p => <h4 className="text-[12.5px] font-semibold text-ctp-subtext1 mt-2 mb-1">{p.children}</h4>,
  h5: p => <h5 className="text-[12px] font-semibold text-ctp-subtext1 mt-2 mb-1">{p.children}</h5>,
  h6: p => <h6 className="text-[12px] font-semibold text-ctp-subtext0 mt-2 mb-1">{p.children}</h6>,
  p: p => <p className="text-[13px] text-ctp-subtext1 leading-relaxed my-1.5">{p.children}</p>,
  ul: p => <ul className="list-disc pl-5 my-1.5 text-[13px] text-ctp-subtext1">{p.children}</ul>,
  ol: p => <ol className="list-decimal pl-5 my-1.5 text-[13px] text-ctp-subtext1">{p.children}</ol>,
  li: p => <li className="my-0.5 leading-relaxed">{p.children}</li>,
  strong: p => <strong className="text-ctp-text">{p.children}</strong>,
  blockquote: p => <blockquote className="border-l-[3px] border-ctp-surface1 pl-3 my-2 text-ctp-subtext0 italic">{p.children}</blockquote>,
  hr: () => <hr className="border-ctp-surface1 my-3" />,
  pre: p => <pre className="bg-ctp-mantle border border-ctp-surface0 rounded-lg p-3 overflow-x-auto my-2 text-[12px] leading-relaxed">{p.children}</pre>,
  code: p => {
    const isBlock = /language-/.test(p.className ?? "") || String(p.children).includes("\n");
    return isBlock
      ? <code className={`font-mono text-ctp-subtext1 ${p.className ?? ""}`}>{p.children}</code>
      : <code className="bg-ctp-surface0 text-ctp-subtext1 rounded px-1 text-[12px] font-mono">{p.children}</code>;
  },
  table: p => <div className="overflow-x-auto my-2"><table className="border-collapse text-[12.5px]">{p.children}</table></div>,
  th: p => <th className="border border-ctp-surface1 bg-ctp-surface0 px-2 py-1 text-left text-ctp-text font-semibold">{p.children}</th>,
  td: p => <td className="border border-ctp-surface0 px-2 py-1 text-ctp-subtext1">{p.children}</td>,
  a: p => <LinkOut href={p.href}>{p.children}</LinkOut>,
  img: () => null,
  ins: p => <ins className="bg-ctp-green/25 text-ctp-green no-underline rounded px-0.5">{p.children}</ins>,
  del: p => <del className="bg-ctp-red/20 text-ctp-red rounded px-0.5">{p.children}</del>,
};

export function MarkdownBlock({ md }: { md: string }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm, remarkDiffMarks]} components={components}>{md}</ReactMarkdown>;
}
