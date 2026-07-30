import type { Config } from "../config.js";

export interface AdoCommit { commitId: string; comment: string; author: { name: string; email: string; date: string } }
export interface AdoFileChange {
  path: string;
  changeType: "add" | "edit" | "delete";
  /** Pfad vor dem Commit, wenn ADO die Änderung als Umbenennung meldet. */
  previousPath?: string;
  /** Blob-Id vor und nach dem Commit sind gleich — reines Umbenennen/Verschieben. */
  contentUnchanged?: boolean;
  /** Quellseite einer Umbenennung: die Datei lebt unter dem neuen Pfad weiter. */
  renameSource?: boolean;
}

interface AdoChangeEntry {
  item: { path: string; isFolder?: boolean; gitObjectType?: string; objectId?: string; originalObjectId?: string };
  sourceServerItem?: string;
  changeType: string;
}

const API = "api-version=7.1";

const strip = (p: string) => p.replace(/^\//, "");

// Ordner tragen kein isFolder, wenn ADO sie als Rename-Quelle meldet — dann
// verrät nur gitObjectType, dass es ein Baum und keine Datei ist.
function isFile(c: AdoChangeEntry): boolean {
  return !c.item.isFolder && c.item.gitObjectType !== "tree";
}

// ADO setzt changeType als Flag-Kombination zusammen: "edit", "add",
// "edit, rename" (Zielseite einer Umbenennung), "delete, sourceRename"
// (Quellseite). Wer nur die drei Basiswerte kennt, hält die Quellseite für eine
// normale Änderung und liest zu einem Pfad ein, der im Commit nicht mehr
// existiert — heraus kommt eine Änderung ohne jeden Inhalt.
function toFileChange(c: AdoChangeEntry): AdoFileChange {
  const flags = new Set(c.changeType.split(",").map(f => f.trim().toLowerCase()));
  const changeType = flags.has("delete") ? "delete" : flags.has("add") ? "add" : "edit";
  const out: AdoFileChange = { path: strip(c.item.path), changeType };

  if (flags.has("sourcerename") && changeType === "delete") out.renameSource = true;
  if ((flags.has("rename") || flags.has("targetrename")) && c.sourceServerItem) {
    out.previousPath = strip(c.sourceServerItem);
    // Gleiche Blob-Id vor und nach dem Commit heißt: nur der Pfad hat sich
    // geändert. Ohne beide Ids bleiben wir vorsichtig und nehmen eine
    // Inhaltsänderung an.
    out.contentUnchanged = !!c.item.objectId && c.item.objectId === c.item.originalObjectId;
  }
  return out;
}

export class AdoClient {
  constructor(private cfg: Config, private fetchFn: typeof fetch = fetch) {}

  private get base() {
    const c = this.cfg;
    return `${c.adoBaseUrl}/${c.adoCollection}/${c.adoProject}/_apis/git/repositories/${c.adoRepo}`;
  }
  private headers() {
    const token = Buffer.from(`:${this.cfg.adoPat}`).toString("base64");
    return { Authorization: `Basic ${token}`, Accept: "application/json" };
  }

  async listCommits(branch: string, top = 100): Promise<AdoCommit[]> {
    const url = `${this.base}/commits?searchCriteria.itemVersion.version=${encodeURIComponent(branch)}` +
      `&searchCriteria.$top=${top}&${API}`;
    const res = await this.fetchFn(url, { headers: this.headers() });
    if (!res.ok) throw new Error(`ADO commits ${res.status}`);
    const body = await res.json() as { value: AdoCommit[] };
    return body.value;
  }

  async listCommitChanges(commitId: string): Promise<AdoFileChange[]> {
    const url = `${this.base}/commits/${commitId}/changes?${API}`;
    const res = await this.fetchFn(url, { headers: this.headers() });
    if (!res.ok) throw new Error(`ADO changes ${res.status}`);
    const body = await res.json() as { changes: AdoChangeEntry[] };
    return body.changes.filter(isFile).map(toFileChange);
  }

  async getItemContent(path: string, commitId: string): Promise<string | null> {
    return this.itemContent(path, commitId);
  }

  /**
   * Der Stand der Datei so, wie er vor diesem Commit war — die Vergleichsbasis
   * für den Diff. `previousChange` liefert den Inhalt aus der vorhergehenden
   * Änderung an genau dieser Datei; existierte sie davor nicht, antwortet ADO
   * mit 404 und wir haben keine Basis (null).
   */
  async getItemContentBefore(path: string, commitId: string): Promise<string | null> {
    return this.itemContent(path, commitId, "previousChange");
  }

  private async itemContent(path: string, commitId: string, versionOptions?: string): Promise<string | null> {
    const url = `${this.base}/items?path=/${encodeURIComponent(path)}` +
      `&versionDescriptor.version=${commitId}&versionDescriptor.versionType=commit` +
      (versionOptions ? `&versionDescriptor.versionOptions=${versionOptions}` : "") +
      `&includeContent=true&${API}`;
    const res = await this.fetchFn(url, { headers: this.headers() });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`ADO item ${res.status}`);
    const body = await res.json() as { content?: string };
    return body.content ?? null;
  }
}
