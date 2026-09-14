import { handleAnalyze } from "../server/handler.ts";

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === "GET" || request.method === "HEAD") {
      return Response.json({
        ok: true,
        hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
      });
    }
    return handleAnalyze(request);
  },
};
