import type { Config } from "../config.js";

export interface AdoCommit { commitId: string; comment: string; author: { name: string; email: string; date: string } }
export interface AdoFileChange { path: string; changeType: "add" | "edit" | "delete" }

const API = "api-version=7.1";

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
    const body = await res.json() as { changes: { item: { path: string; isFolder?: boolean }; changeType: string }[] };
    return body.changes
      .filter(c => !c.item.isFolder)
      .map(c => ({ path: c.item.path.replace(/^\//, ""), changeType: c.changeType as AdoFileChange["changeType"] }));
  }

  async getItemContent(path: string, commitId: string): Promise<string | null> {
    const url = `${this.base}/items?path=/${encodeURIComponent(path)}` +
      `&versionDescriptor.version=${commitId}&versionDescriptor.versionType=commit&includeContent=true&${API}`;
    const res = await this.fetchFn(url, { headers: this.headers() });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`ADO item ${res.status}`);
    const body = await res.json() as { content?: string };
    return body.content ?? null;
  }
}
