import type { AnalyzeSuccess } from "../../shared/types";

const PREFIX = "explain:";

export function cacheKey(owner: string, repo: string): string {
  return `${PREFIX}${owner}/${repo}`.toLowerCase();
}

export function readCache(owner: string, repo: string): AnalyzeSuccess | null {
  try {
    const raw = sessionStorage.getItem(cacheKey(owner, repo));
    if (!raw) return null;
    return JSON.parse(raw) as AnalyzeSuccess;
  } catch {
    return null;
  }
}

export function writeCache(result: AnalyzeSuccess) {
  try {
    sessionStorage.setItem(cacheKey(result.owner, result.repo), JSON.stringify(result));
  } catch {
    // sessionStorage may be full or disabled
  }
}
