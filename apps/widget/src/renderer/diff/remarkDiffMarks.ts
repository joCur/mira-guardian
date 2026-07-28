import { visit } from "unist-util-visit";

interface MdNode { type: string; value?: string; children?: MdNode[]; data?: { hName?: string } }
interface State { sign: "+" | "-" | null }

const MARK = /⟦([+-])|⟧/g;
const BLOCKS = new Set(["paragraph", "heading", "tableCell"]);

function containsMarker(n: MdNode): boolean {
  if (n.type === "text") return /⟦[+-]|⟧/.test(n.value ?? "");
  return (n.children ?? []).some(containsMarker);
}

function walkChildren(parent: MdNode, state: State): void {
  const out: MdNode[] = [];
  let wrapper: MdNode | null = null;
  const target = (): MdNode[] => {
    if (!state.sign) { wrapper = null; return out; }
    const hName = state.sign === "+" ? "ins" : "del";
    if (!wrapper || wrapper.data?.hName !== hName) {
      wrapper = { type: "diffMark", data: { hName }, children: [] };
      out.push(wrapper);
    }
    return wrapper.children!;
  };

  for (const child of parent.children ?? []) {
    if (child.type === "text") {
      const text = child.value ?? "";
      let last = 0; let m: RegExpExecArray | null;
      MARK.lastIndex = 0;
      while ((m = MARK.exec(text))) {
        if (m.index > last) target().push({ type: "text", value: text.slice(last, m.index) });
        state.sign = m[1] ? (m[1] as "+" | "-") : null;
        wrapper = null;
        last = MARK.lastIndex;
      }
      if (last < text.length) target().push({ type: "text", value: text.slice(last) });
    } else if (child.children && containsMarker(child)) {
      walkChildren(child, state);
      wrapper = null;
      out.push(child);
    } else {
      target().push(child);
    }
  }
  parent.children = out;
}

export default function remarkDiffMarks() {
  return (tree: MdNode) => {
    visit(tree as never, (node: MdNode) => {
      // In Code kann kein ins/del eingebettet werden — Marker dort nur
      // entfernen, die Block-Färbung des Diffs trägt den Kontext.
      if ((node.type === "code" || node.type === "inlineCode") && node.value && /⟦[+-]|⟧/.test(node.value)) {
        node.value = node.value.replace(/⟦[+-]|⟧/g, "");
        return;
      }
      if (!BLOCKS.has(node.type) || !node.children) return;
      if (!containsMarker(node)) return;
      walkChildren(node, { sign: null });
    });
  };
}
