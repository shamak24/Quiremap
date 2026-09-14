import type { AnalyzeRequest } from "./types.ts";
import { parseGitHubRepoUrl } from "./parseUrl.ts";
import { detectMonorepo, selectFilesForAnalysis, type TreeEntry } from "./selectFiles.ts";

export class GithubError extends Error {
  code: "NOT_FOUND" | "RATE_LIMIT" | "EMPTY" | "INTERNAL";
  constructor(message: string, code: GithubError["code"]) {
    super(message);
    this.code = code;
  }
}

function githubHeaders(token?: string): HeadersInit {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "CodebaseExplainer",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function githubFetch(url: string, signal?: AbortSignal, token?: string): Promise<Response> {
  const response = await fetch(url, { headers: githubHeaders(token), signal });
  const remaining = response.headers.get("x-ratelimit-remaining");
  if (response.status === 429 || (response.status === 403 && remaining === "0")) {
    throw new GithubError(
      "GitHub’s unauthenticated API limit (60 requests/hour) is exhausted. Wait until it resets, or try again later. Recent lookups in this tab are cached.",
      "RATE_LIMIT",
    );
  }
  if (response.status === 403) {
    const body = await response.text();
    if (/rate limit/i.test(body)) {
      throw new GithubError(
        "GitHub’s unauthenticated API limit (60 requests/hour) is exhausted. Try again later.",
        "RATE_LIMIT",
      );
    }
    throw new GithubError("GitHub could not return this repository right now.", "INTERNAL");
  }
  if (response.status === 404) {
    throw new GithubError(
      "This repository was not found. It may be private, renamed, or the URL might be wrong.",
      "NOT_FOUND",
    );
  }
  if (!response.ok) {
    throw new GithubError("GitHub could not return this repository right now.", "INTERNAL");
  }
  return response;
}

function encodeRepoPath(path: string): string {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

async function mapPool<T, R>(items: T[], limit: number, mapper: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await mapper(items[current]!);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

export async function collectRepoForAnalysis(
  inputUrl: string,
  options?: {
    signal?: AbortSignal;
    token?: string;
    onStage?: (stage: "structure" | "files") => void;
  },
): Promise<AnalyzeRequest> {
  const parsed = parseGitHubRepoUrl(inputUrl);
  if (!parsed) {
    throw new GithubError("Enter a valid GitHub repository URL.", "INTERNAL");
  }

  const signal = options?.signal;
  const token = options?.token;
  options?.onStage?.("structure");
  const repoRes = await githubFetch(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}`, signal, token);
  const repoJson = (await repoRes.json()) as {
    default_branch?: string;
    description?: string | null;
    language?: string | null;
    message?: string;
  };

  const branch = repoJson.default_branch || "main";
  const treeRes = await githubFetch(
    `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
    signal,
    token,
  );
  const treeJson = (await treeRes.json()) as {
    tree?: TreeEntry[];
    truncated?: boolean;
    message?: string;
  };

  const tree = (treeJson.tree ?? []).filter((entry) => entry.path);
  if (tree.length === 0) {
    throw new GithubError("This repository looks empty, so there is nothing to explain yet.", "EMPTY");
  }

  const selected = selectFilesForAnalysis(tree, repoJson.language ?? null);
  if (selected.files.length === 0) {
    throw new GithubError(
      "No recognizable source files were found. Binary-only or generated repos cannot be summarized.",
      "EMPTY",
    );
  }

  options?.onStage?.("files");
  const blobs = await mapPool(selected.files, 6, async (file) => {
    const rawUrl = `https://raw.githubusercontent.com/${parsed.owner}/${parsed.repo}/${encodeURIComponent(branch)}/${encodeRepoPath(file.path)}`;
    const res = await fetch(rawUrl, { signal });
    if (!res.ok) return null;
    const text = await res.text();
    if (!text.trim()) return null;
    const content = text.length > 80_000 ? `${text.slice(0, 80_000)}\n... [truncated]` : text;
    return { path: file.path, content };
  });

  const files = blobs.filter((file): file is { path: string; content: string } => Boolean(file));
  if (files.length === 0) {
    throw new GithubError("The repository exists, but file contents could not be read.", "EMPTY");
  }

  const blobCount = tree.filter((e) => e.type === "blob").length;
  return {
    owner: parsed.owner,
    repo: parsed.repo,
    repoUrl: parsed.url,
    defaultBranch: branch,
    description: repoJson.description ?? "",
    primaryLanguage: repoJson.language ?? null,
    totalFiles: blobCount,
    truncatedTree: Boolean(treeJson.truncated),
    likelyMonorepo: detectMonorepo(tree.map((e) => e.path)),
    files,
  };
}
