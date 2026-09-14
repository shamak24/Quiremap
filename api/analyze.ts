import { handleAnalyze } from "../server/handler.ts";

export const config = {
  maxDuration: 60,
};

export async function POST(request: Request): Promise<Response> {
  return handleAnalyze(request);
}
