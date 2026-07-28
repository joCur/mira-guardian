import { z } from "zod";
import type { TypeRule } from "@guardian/shared";

const typeRuleSchema = z.array(z.object({ pattern: z.string().min(1), label: z.string().min(1) }));

const schema = z.object({
  ADO_BASE_URL: z.string().url(),
  ADO_COLLECTION: z.string().min(1),
  ADO_PROJECT: z.string().min(1),
  ADO_REPO: z.string().min(1),
  ADO_BRANCH: z.string().default("main"),
  ADO_PAT: z.string().min(1),
  POLL_INTERVAL_SECONDS: z.coerce.number().int().positive().default(60),
  BACKFILL_DAYS: z.coerce.number().int().positive().default(7),
  SCAN_PATHS: z.string().default("docs/decisions,docs/learnings,memory-bank"),
  TYPE_MAP: z.string().optional(),
  DB_PATH: z.string().default("guardian.sqlite"),
  HTTP_PORT: z.coerce.number().int().positive().default(4000),
});

export interface Config {
  adoBaseUrl: string; adoCollection: string; adoProject: string; adoRepo: string;
  adoBranch: string; adoPat: string; pollIntervalSeconds: number; backfillDays: number;
  scanPaths: string[]; typeRules: TypeRule[] | undefined; dbPath: string; httpPort: number;
}

export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const e = schema.parse(env);

  let typeRules: TypeRule[] | undefined;
  if (e.TYPE_MAP) {
    try {
      const parsed = JSON.parse(e.TYPE_MAP);
      typeRules = typeRuleSchema.parse(parsed);
    } catch (err) {
      if (err instanceof SyntaxError) {
        throw new Error("TYPE_MAP is not valid JSON");
      }
      throw err;
    }
  }

  return {
    adoBaseUrl: e.ADO_BASE_URL.replace(/\/+$/, ""),
    adoCollection: e.ADO_COLLECTION, adoProject: e.ADO_PROJECT, adoRepo: e.ADO_REPO,
    adoBranch: e.ADO_BRANCH, adoPat: e.ADO_PAT, pollIntervalSeconds: e.POLL_INTERVAL_SECONDS,
    backfillDays: e.BACKFILL_DAYS,
    scanPaths: e.SCAN_PATHS.split(",").map(s => s.trim()).filter(Boolean),
    typeRules,
    dbPath: e.DB_PATH, httpPort: e.HTTP_PORT,
  };
}

export function deepLink(cfg: Config, commitId: string, filePath: string): string {
  return `${cfg.adoBaseUrl}/${cfg.adoCollection}/${cfg.adoProject}/_git/${cfg.adoRepo}/commit/${commitId}?path=/${filePath}`;
}
