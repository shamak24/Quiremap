import { handleAnalyze } from "../server/handler.ts";
import { readGeminiApiKey } from "../server/gemini.ts";

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === "GET" || request.method === "HEAD") {
      return Response.json({
        ok: true,
        hasGeminiKey: Boolean(readGeminiApiKey()),
      });
    }
    return handleAnalyze(request);
  },
};
