import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import type { AnalyzeRequest, ArchitectureResult, GraphEdge, GraphNode } from "../shared/types.ts";

const MODELS = ["gemini-3.6-flash", "gemini-3.8-flash", "gemini-3.5-flash"] as const;
const MAX_GRAPH_NODES = 36;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function readGeminiApiKey(): string | undefined {
  let raw = process.env.GEMINI_API_KEY?.trim();
  if (!raw) return undefined;
  raw = raw.replace(/^["']+|["']+$/g, "").trim();
  raw = raw.replace(/^GEMINI_API_KEY\s*=\s*/i, "").trim();
  raw = raw.replace(/^Bearer\s+/i, "").trim();
  return raw || undefined;
}

export function errorStatus(error: unknown): number | undefined {
  if (error && typeof error === "object" && "status" in error) {
    const status = Number((error as { status: unknown }).status);
    return Number.isFinite(status) ? status : undefined;
  }
  return undefined;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function geminiApiMessage(error: unknown): string {
  const text = errorText(error);
  try {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const parsed = JSON.parse(text.slice(start, end + 1)) as {
        error?: { message?: string; status?: string };
        message?: string;
      };
      return parsed.error?.message || parsed.message || text;
    }
  } catch {
    /* use raw text */
  }
  return text;
}

function isInvalidApiKey(status: number | undefined, message: string): boolean {
  if (/API_KEY_INVALID|API key not valid|invalid api key|unregistered callers|FAILED_PRECONDITION.*key/i.test(message)) {
    return true;
  }
  if (status === 400 || status === 401) {
    return /api.?key/i.test(message);
  }
  return false;
}

export function geminiUserMessage(error: unknown): string {
  const status = errorStatus(error);
  const text = geminiApiMessage(error);

  if (/GEMINI_API_KEY is not configured/i.test(errorText(error))) {
    return "This server has no Gemini API key. Set GEMINI_API_KEY in Vercel env (Production and Preview), then redeploy.";
  }
  if (status === 503 || /high demand|UNAVAILABLE|overloaded/i.test(text)) {
    return "Gemini is busy right now (high demand). Wait a minute and try again.";
  }
  if (status === 429 || /resource exhausted|RESOURCE_EXHAUSTED|quota/i.test(text)) {
    return "The Gemini quota for this API key is exhausted. Check usage in Google AI Studio and try later.";
  }
  if (/referer|referrer|Requests from .* are blocked|ip address/i.test(text)) {
    return "This Gemini key has HTTP-referrer or IP restrictions, which block Vercel. In AI Studio, set Application restrictions to None (or IP addresses, not HTTP referrers).";
  }
  if (isInvalidApiKey(status, text)) {
    return "Gemini rejected this API key. In Vercel, set GEMINI_API_KEY to an AI Studio key with no extra quotes or GEMINI_API_KEY= prefix, then redeploy.";
  }
  if (status === 403 || /PERMISSION_DENIED/i.test(text)) {
    return `Gemini denied the request (${text.slice(0, 180)}). The Generative Language API may be disabled for this key, or the model isn’t allowed.`;
  }
  if (status === 400) {
    return `Gemini rejected the request: ${text.slice(0, 220)}`;
  }
  return text.length < 220
    ? text
    : "The architecture model failed after a retry. Wait a moment and try again.";
}

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fence ? fence[1] : trimmed;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("Model did not return JSON");
  }
  return JSON.parse(raw.slice(start, end + 1));
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => asString(item)).filter(Boolean);
}

function normalizeGraph(
  raw: unknown,
  sampled: boolean,
): ArchitectureResult["graph"] {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  if (!Array.isArray(record.nodes) || record.nodes.length < 2) return null;

  const nodes: GraphNode[] = [];
  for (const node of record.nodes) {
    if (!node || typeof node !== "object") continue;
    const n = node as Record<string, unknown>;
    const id = asString(n.id || n.label);
    if (!id) continue;
    const importance = typeof n.importance === "number" ? n.importance : 1;
    nodes.push({
      id,
      label: asString(n.label, id),
      group: asString(n.group, "module"),
      importance: Number.isFinite(importance) ? importance : 1,
    });
  }

  if (nodes.length < 2) return null;

  nodes.sort((a, b) => b.importance - a.importance);
  const clustered = nodes.length > MAX_GRAPH_NODES;
  const kept = clustered ? nodes.slice(0, MAX_GRAPH_NODES) : nodes;
  const ids = new Set(kept.map((n) => n.id));

  const edges: GraphEdge[] = [];
  const seen = new Set<string>();
  if (Array.isArray(record.edges)) {
    for (const edge of record.edges) {
      if (!edge || typeof edge !== "object") continue;
      const e = edge as Record<string, unknown>;
      const source = asString(e.source);
      const target = asString(e.target);
      if (!source || !target || source === target) continue;
      if (!ids.has(source) || !ids.has(target)) continue;
      const key = `${source}->${target}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({
        source,
        target,
        relation: asString(e.relation, "depends on"),
      });
    }
  }

  if (edges.length === 0) return null;

  return { nodes: kept, edges, clustered: clustered || sampled };
}

function normalizeResult(raw: unknown, sampled: boolean, likelyMonorepo: boolean): ArchitectureResult {
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const paragraphs = asStringArray(record.architectureSummary).slice(0, 6);
  const fallbackSummary = asString(record.summary);
  const architectureSummary =
    paragraphs.length > 0
      ? paragraphs
      : fallbackSummary
        ? [fallbackSummary]
        : ["The model returned a partial analysis without a usable summary."];

  const componentsRaw = Array.isArray(record.components) ? record.components : [];
  const components = componentsRaw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const c = item as Record<string, unknown>;
      const name = asString(c.name);
      const responsibility = asString(c.responsibility);
      if (!name || !responsibility) return null;
      return { name, responsibility };
    })
    .filter((item): item is { name: string; responsibility: string } => item !== null)
    .slice(0, 16);

  const monorepoRaw = record.monorepo && typeof record.monorepo === "object"
    ? (record.monorepo as Record<string, unknown>)
    : {};

  const graph = normalizeGraph(record.graph, sampled);
  const isMonorepo = Boolean(monorepoRaw.isMonorepo) || likelyMonorepo;

  return {
    repoName: asString(record.repoName, "Repository"),
    tagline: asString(record.tagline, "Architecture overview"),
    architectureSummary,
    languages: asStringArray(record.languages).slice(0, 8),
    monorepo: {
      isMonorepo,
      projects: asStringArray(monorepoRaw.projects).slice(0, 12),
    },
    sampled,
    sampleNote: asString(
      record.sampleNote,
      sampled
        ? "This overview is based on a representative sample of files, not the entire repository."
        : "",
    ),
    components,
    graph,
  };
}

function buildPrompt(payload: AnalyzeRequest): string {
  const fileBlock = payload.files
    .map((file) => `### ${file.path}\n${file.content}`)
    .join("\n\n");

  return `You are a principal engineer producing a concise architecture briefing for a GitHub repository.
Write the summary in clear English even if READMEs or source comments are in another language.
Do not invent files, services, or libraries that are not evidenced in the provided material.
If this looks like a monorepo, say so and list distinct subprojects.

Repository: ${payload.owner}/${payload.repo}
URL: ${payload.repoUrl}
Default branch: ${payload.defaultBranch}
GitHub description: ${payload.description || "(none)"}
Primary language: ${payload.primaryLanguage || "unknown"}
Files in tree (approx): ${payload.totalFiles}
Tree truncated by GitHub: ${payload.truncatedTree}
Likely monorepo from layout: ${payload.likelyMonorepo}
Sampled files sent to you: ${payload.files.length}

Return ONLY JSON matching this shape:
{
  "repoName": string,
  "tagline": string (max 140 chars),
  "architectureSummary": string[] (2-5 short paragraphs, no markdown),
  "languages": string[],
  "monorepo": { "isMonorepo": boolean, "projects": string[] },
  "sampleNote": string,
  "components": [{ "name": string, "responsibility": string }],
  "graph": {
    "nodes": [{ "id": string, "label": string, "group": string, "importance": number }],
    "edges": [{ "source": string, "target": string, "relation": string }]
  }
}

Graph rules:
- Nodes are modules/packages/directories/key files, not every function.
- id must be stable and referenced by edges.source / edges.target exactly.
- Prefer 8-28 of the most important nodes. importance is 1-10.
- group is a short category such as "app", "api", "core", "ui", "data", "infra", "tooling".
- Edges are dependency or call-flow relationships evidenced by imports, config, or structure.
- Do not create disconnected decorative nodes.

File contents:
${fileBlock}`;
}

async function generateWithModel(
  ai: GoogleGenAI,
  model: string,
  prompt: string,
  signal?: AbortSignal,
): Promise<string> {
  const isGemini3 = /gemini-3/i.test(model);
  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      abortSignal: signal,
      responseMimeType: "application/json",
      thinkingConfig: isGemini3 ? { thinkingLevel: ThinkingLevel.LOW } : undefined,
    },
  });
  const text = response.text;
  if (!text) throw new Error("Empty model response");
  return text;
}

function isMissingModel(error: unknown): boolean {
  const status = errorStatus(error);
  const message = errorText(error);
  return status === 404 || /not found|NOT_FOUND|no longer available|is not supported/i.test(message);
}

function isRetryable(error: unknown): boolean {
  const status = errorStatus(error);
  if (status === 404 || status === 400 || status === 401 || status === 403) return false;
  return status === 503 || status === 429 || status === 500 || /high demand|UNAVAILABLE|overloaded/i.test(errorText(error));
}

export async function analyzeWithGemini(
  payload: AnalyzeRequest,
  signal?: AbortSignal,
): Promise<ArchitectureResult> {
  const apiKey = readGeminiApiKey();
  if (!apiKey) {
    throw Object.assign(new Error("GEMINI_API_KEY is not configured"), { code: "GEMINI" as const });
  }

  const ai = new GoogleGenAI({ apiKey });
  const prompt = buildPrompt(payload);
  const sampled =
    payload.truncatedTree ||
    payload.files.length < payload.totalFiles ||
    payload.totalFiles > 80;

  let lastError: unknown;
  for (const model of MODELS) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      try {
        const text = await generateWithModel(ai, model, prompt, signal);
        const parsed = extractJson(text);
        return normalizeResult(parsed, sampled, payload.likelyMonorepo);
      } catch (error) {
        lastError = error;
        if (signal?.aborted) throw error;
        if (isMissingModel(error)) break;
        if (attempt === 0 && isRetryable(error)) {
          await sleep(2000);
          continue;
        }
        break;
      }
    }
  }

  const message = geminiUserMessage(lastError);
  throw Object.assign(new Error(message), { code: "GEMINI" as const, status: errorStatus(lastError) });
}
