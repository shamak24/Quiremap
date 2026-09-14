const MANIFEST_NAMES = new Set([
  "package.json",
  "package.json5",
  "pnpm-workspace.yaml",
  "lerna.json",
  "turbo.json",
  "nx.json",
  "cargo.toml",
  "go.mod",
  "go.work",
  "pyproject.toml",
  "requirements.txt",
  "pipfile",
  "poetry.lock",
  "gemfile",
  "composer.json",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "mix.exs",
  "package.swift",
  "cmakelists.txt",
  "makefile",
  "dockerfile",
  "docker-compose.yml",
  "docker-compose.yaml",
  "tsconfig.json",
  "jsconfig.json",
  "deno.json",
  "bunfig.toml",
  "mod.rs",
]);

const ENTRY_NAMES = new Set([
  "index.ts",
  "index.tsx",
  "index.js",
  "index.jsx",
  "index.mjs",
  "main.ts",
  "main.tsx",
  "main.js",
  "main.go",
  "main.rs",
  "main.py",
  "app.ts",
  "app.tsx",
  "app.js",
  "app.py",
  "server.ts",
  "server.js",
  "mod.rs",
  "__init__.py",
  "lib.rs",
  "page.tsx",
  "layout.tsx",
  "route.ts",
]);

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "out",
  ".next",
  ".nuxt",
  ".output",
  "coverage",
  "vendor",
  "target",
  "__pycache__",
  ".venv",
  "venv",
  ".cache",
  ".turbo",
  ".yarn",
  "pods",
  "deriveddata",
  "min",
  "umd",
]);

const SKIP_EXT = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "ico",
  "svg",
  "pdf",
  "zip",
  "gz",
  "tgz",
  "wasm",
  "exe",
  "dll",
  "so",
  "dylib",
  "woff",
  "woff2",
  "ttf",
  "eot",
  "mp3",
  "mp4",
  "webm",
  "mov",
  "lock",
  "map",
  "min.js",
  "min.css",
]);

const SOURCE_EXT = new Set([
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "py",
  "go",
  "rs",
  "java",
  "kt",
  "rb",
  "php",
  "cs",
  "cpp",
  "c",
  "h",
  "hpp",
  "swift",
  "scala",
  "ex",
  "exs",
  "erl",
  "hs",
  "lua",
  "r",
  "jl",
  "vue",
  "svelte",
  "astro",
  "md",
  "mdx",
  "toml",
  "yml",
  "yaml",
  "json",
  "sql",
  "proto",
  "graphql",
  "gradle",
]);

export type TreeEntry = {
  path: string;
  type: "blob" | "tree" | string;
  size?: number;
};

export function isSkippedPath(path: string): boolean {
  const parts = path.split("/");
  if (parts.some((part) => SKIP_DIRS.has(part.toLowerCase()))) return true;
  const base = parts[parts.length - 1] ?? "";
  if (base.startsWith(".") && !MANIFEST_NAMES.has(base.toLowerCase())) return true;
  const lower = base.toLowerCase();
  if (SKIP_EXT.has(lower.split(".").pop() ?? "")) return true;
  if (lower.endsWith(".min.js") || lower.endsWith(".min.css")) return true;
  return false;
}

function extension(path: string): string {
  const base = path.split("/").pop() ?? "";
  const idx = base.lastIndexOf(".");
  return idx >= 0 ? base.slice(idx + 1).toLowerCase() : "";
}

function basename(path: string): string {
  return (path.split("/").pop() ?? "").toLowerCase();
}

function scoreFile(path: string, primaryLanguage: string | null): number {
  const name = basename(path);
  const ext = extension(path);
  const depth = path.split("/").length;
  let score = 0;

  if (name.startsWith("readme")) score += 120;
  if (MANIFEST_NAMES.has(name)) score += 95;
  if (ENTRY_NAMES.has(name)) score += 80;
  if (name === "license" || name.startsWith("license.")) score -= 20;
  if (/test|spec|mock|fixture|__tests__|stories\./i.test(path)) score -= 45;
  if (depth <= 2) score += 18;
  else if (depth <= 4) score += 8;
  else score -= depth;

  if (SOURCE_EXT.has(ext)) score += 12;
  if (primaryLanguage) {
    const lang = primaryLanguage.toLowerCase();
    const map: Record<string, string[]> = {
      typescript: ["ts", "tsx"],
      javascript: ["js", "jsx", "mjs"],
      python: ["py"],
      go: ["go"],
      rust: ["rs"],
      java: ["java"],
      ruby: ["rb"],
      php: ["php"],
      "c#": ["cs"],
      "c++": ["cpp", "cc", "hpp"],
    };
    if (map[lang]?.includes(ext)) score += 16;
  }

  return score;
}

export function detectMonorepo(paths: string[]): boolean {
  const manifests = paths.filter((p) => basename(p) === "package.json");
  if (manifests.length > 1) return true;
  const top = new Set(paths.map((p) => p.split("/")[0]?.toLowerCase()));
  if (top.has("packages") && top.has("apps")) return true;
  if (paths.some((p) => basename(p) === "pnpm-workspace.yaml" || basename(p) === "go.work" || basename(p) === "lerna.json")) {
    return true;
  }
  return false;
}

export function selectFilesForAnalysis(
  tree: TreeEntry[],
  primaryLanguage: string | null,
  options?: { maxFiles?: number; maxBytes?: number },
): { files: TreeEntry[]; sampled: boolean; totalEligible: number } {
  const maxFiles = options?.maxFiles ?? 48;
  const maxBytes = options?.maxBytes ?? 220_000;

  const blobs = tree.filter((entry) => entry.type === "blob" && entry.path && !isSkippedPath(entry.path));
  const ranked = blobs
    .map((entry) => ({ entry, score: scoreFile(entry.path, primaryLanguage) }))
    .filter((item) => item.score > -20)
    .sort((a, b) => b.score - a.score);

  const chosen: TreeEntry[] = [];
  let bytes = 0;
  for (const item of ranked) {
    const size = item.entry.size ?? 0;
    if (size > 80_000) continue;
    if (chosen.length >= maxFiles) break;
    if (bytes + size > maxBytes && chosen.length >= 12) break;
    chosen.push(item.entry);
    bytes += size;
  }

  return {
    files: chosen,
    sampled: chosen.length < ranked.length,
    totalEligible: ranked.length,
  };
}
