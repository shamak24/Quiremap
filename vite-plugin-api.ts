import type { IncomingMessage } from "node:http";
import type { Plugin } from "vite";

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export function localApiPlugin(): Plugin {
  return {
    name: "local-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const path = req.url?.split("?")[0];
        if (path !== "/api/analyze") {
          next();
          return;
        }

        try {
          const { handleAnalyze } = (await server.ssrLoadModule("./server/handler.ts")) as {
            handleAnalyze: (request: Request) => Promise<Response>;
          };
          const body = req.method === "POST" || req.method === "PUT" ? await readBody(req) : undefined;
          const headers = new Headers();
          for (const [key, value] of Object.entries(req.headers)) {
            if (typeof value === "string") headers.set(key, value);
            else if (Array.isArray(value)) headers.set(key, value.join(", "));
          }

          const origin = `http://${req.headers.host ?? "localhost"}`;
          const init: RequestInit & { duplex?: "half" } = {
            method: req.method ?? "GET",
            headers,
          };
          if (body && body.length > 0) {
            init.body = new Uint8Array(body);
            init.duplex = "half";
          }

          const request = new Request(`${origin}${req.url}`, init);
          const response = await handleAnalyze(request);
          res.statusCode = response.status;
          response.headers.forEach((value, key) => {
            res.setHeader(key, value);
          });
          const bytes = Buffer.from(await response.arrayBuffer());
          res.end(bytes);
        } catch {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Internal server error", code: "INTERNAL" }));
        }
      });
    },
  };
}
