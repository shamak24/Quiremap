import type { AnalyzeFailure, AnalyzeRequest, AnalyzeSuccess } from "../shared/types.ts";
import { analyzeWithGemini, errorStatus, geminiUserMessage } from "./gemini.ts";
import { consumeRateLimit, getClientIp } from "./rateLimit.ts";
import { collectRepoForAnalysis, GithubError } from "../shared/githubCollect.ts";

const MAX_FILES = 80;
const MAX_FILE_CHARS = 80_000;
const MAX_TOTAL_CHARS = 280_000;

function json(data: unknown, status = 200, extraHeaders?: HeadersInit): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}

function fail(code: AnalyzeFailure["code"], error: string, status: number, extra?: HeadersInit) {
  return json({ error, code } satisfies AnalyzeFailure, status, extra);
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

function validatePayload(
  body: unknown,
): AnalyzeRequest | AnalyzeFailure | { fetchOnServer: true; repoUrl: string } {
  if (!body || typeof body !== "object") {
    return { error: "Request body must be JSON.", code: "INVALID_URL" };
  }
  const raw = body as Record<string, unknown>;
  const repoUrl = typeof raw.repoUrl === "string" ? raw.repoUrl.trim() : "";
  if (raw.fetchOnServer === true) {
    if (!repoUrl) return { error: "That GitHub repository URL looks invalid.", code: "INVALID_URL" };
    return { fetchOnServer: true, repoUrl };
  }

  const owner = typeof raw.owner === "string" ? raw.owner.trim() : "";
  const repo = typeof raw.repo === "string" ? raw.repo.trim() : "";
  const defaultBranch = typeof raw.defaultBranch === "string" ? raw.defaultBranch.trim() : "main";
  const files = Array.isArray(raw.files) ? raw.files : null;

  if (!owner || !repo || !/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repo)) {
    return { error: "That GitHub repository URL looks invalid.", code: "INVALID_URL" };
  }
  if (!files || files.length === 0) {
    return { error: "No source files were available to analyze.", code: "EMPTY" };
  }
  if (files.length > MAX_FILES) {
    return { error: "Too many files were submitted for analysis.", code: "TOO_LARGE" };
  }

  const selected = [];
  let totalChars = 0;
  for (const file of files) {
    if (!file || typeof file !== "object") continue;
    const f = file as Record<string, unknown>;
    const path = typeof f.path === "string" ? f.path : "";
    let content = typeof f.content === "string" ? f.content : "";
    if (!path || !content) continue;
    if (content.length > MAX_FILE_CHARS) content = `${content.slice(0, MAX_FILE_CHARS)}\n... [truncated]`;
    totalChars += content.length;
    if (totalChars > MAX_TOTAL_CHARS) {
      return { error: "The sampled codebase is too large to send for analysis.", code: "TOO_LARGE" };
    }
    selected.push({ path, content });
  }

  if (selected.length === 0) {
    return { error: "No readable source files were found in this repository.", code: "EMPTY" };
  }

  return {
    owner,
    repo,
    repoUrl: repoUrl || `https://github.com/${owner}/${repo}`,
    defaultBranch,
    description: typeof raw.description === "string" ? raw.description : "",
    primaryLanguage: typeof raw.primaryLanguage === "string" ? raw.primaryLanguage : null,
    totalFiles: typeof raw.totalFiles === "number" ? raw.totalFiles : selected.length,
    truncatedTree: Boolean(raw.truncatedTree),
    likelyMonorepo: Boolean(raw.likelyMonorepo),
    files: selected,
  };
}

export async function handleAnalyze(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }
  if (request.method !== "POST") {
    return fail("INTERNAL", "Use POST.", 405);
  }

  const ip = getClientIp(request);
  const limit = consumeRateLimit(ip);
  if (!limit.ok) {
    return fail(
      "THROTTLED",
      `This IP has reached the analysis limit. Try again in about ${Math.ceil(limit.retryAfterSec / 60)} minute(s).`,
      429,
      { "Retry-After": String(limit.retryAfterSec) },
    );
  }

  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return fail("INVALID_URL", "Request body must be JSON.", 400);
  }

  const payload = validatePayload(parsed);
  if ("code" in payload && "error" in payload && !("files" in payload) && !("fetchOnServer" in payload)) {
    const status = payload.code === "EMPTY" ? 422 : payload.code === "TOO_LARGE" ? 413 : 400;
    return fail(payload.code, payload.error, status);
  }

  try {
    let requestPayload: AnalyzeRequest;
    if ("fetchOnServer" in payload && "repoUrl" in payload && payload.fetchOnServer === true) {
      requestPayload = await collectRepoForAnalysis(payload.repoUrl, {
        signal: request.signal,
        token: process.env.GITHUB_TOKEN,
      });
    } else {
      requestPayload = payload as AnalyzeRequest;
    }
    const result = await analyzeWithGemini(requestPayload, request.signal);
    const body: AnalyzeSuccess = {
      ...result,
      owner: requestPayload.owner,
      repo: requestPayload.repo,
      repoUrl: requestPayload.repoUrl,
    };
    return json(body);
  } catch (error) {
    if (isAbortError(error) || request.signal.aborted) {
      return fail("INTERNAL", "Request cancelled.", 499);
    }
    if (error instanceof GithubError) {
      const status =
        error.code === "RATE_LIMIT" ? 429 : error.code === "NOT_FOUND" ? 404 : error.code === "EMPTY" ? 422 : 502;
      return fail(error.code, error.message, status);
    }
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "GEMINI";
    if (code === "GEMINI") {
      return fail("GEMINI", geminiUserMessage(error), errorStatus(error) === 429 ? 429 : 502);
    }
    return fail("INTERNAL", "Something went wrong while analyzing this repository.", 500);
  }
}
