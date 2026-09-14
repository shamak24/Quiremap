import type { AnalyzeFailure, AnalyzeRequest, AnalyzeSuccess } from "../../shared/types";

function serviceError(status: number, body: string): Error {
  if (status === 404) {
    return Object.assign(
      new Error(
        "The analyze API is missing on this host. Redeploy with api/analyze.ts at the repo root, and set GEMINI_API_KEY in Vercel (Production + Preview), not as VITE_GEMINI_API_KEY.",
      ),
      { code: "INTERNAL" },
    );
  }
  if (status === 413) {
    return Object.assign(new Error("The sampled repo is too large to send to the analysis service."), {
      code: "TOO_LARGE",
    });
  }
  const snippet = body.replace(/\s+/g, " ").trim().slice(0, 160);
  return Object.assign(
    new Error(
      snippet
        ? `The analysis service failed (${status}). ${snippet}`
        : `The analysis service failed with HTTP ${status}. Check Vercel function logs and that GEMINI_API_KEY is set.`,
    ),
    { code: "INTERNAL" },
  );
}

async function parseResponse(response: Response): Promise<AnalyzeSuccess> {
  const raw = await response.text();
  let data: AnalyzeSuccess | AnalyzeFailure | null = null;
  try {
    data = raw ? (JSON.parse(raw) as AnalyzeSuccess | AnalyzeFailure) : null;
  } catch {
    throw serviceError(response.status, raw);
  }

  if (!response.ok || !data || "error" in data) {
    const failure = data && "error" in data ? data : null;
    if (failure?.error) {
      throw Object.assign(new Error(failure.error), { code: failure.code ?? "INTERNAL" });
    }
    throw serviceError(response.status, raw);
  }
  return data;
}

export async function requestAnalysis(
  payload: AnalyzeRequest,
  signal?: AbortSignal,
): Promise<AnalyzeSuccess> {
  const response = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  return parseResponse(response);
}

export async function requestAnalysisFromUrl(
  repoUrl: string,
  signal?: AbortSignal,
): Promise<AnalyzeSuccess> {
  const response = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ repoUrl, fetchOnServer: true }),
    signal,
  });
  return parseResponse(response);
}
