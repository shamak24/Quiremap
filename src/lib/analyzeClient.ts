import type { AnalyzeFailure, AnalyzeRequest, AnalyzeSuccess } from "../../shared/types";

async function parseResponse(response: Response): Promise<AnalyzeSuccess> {
  const data = (await response.json().catch(() => null)) as AnalyzeSuccess | AnalyzeFailure | null;
  if (!response.ok || !data || "error" in data) {
    const failure = data && "error" in data ? data : null;
    throw Object.assign(
      new Error(failure?.error ?? "The analysis service could not complete this request."),
      { code: failure?.code ?? "INTERNAL" },
    );
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
