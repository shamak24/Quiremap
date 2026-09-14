export type ErrorCode =
  | "INVALID_URL"
  | "NOT_FOUND"
  | "RATE_LIMIT"
  | "EMPTY"
  | "TOO_LARGE"
  | "GEMINI"
  | "THROTTLED"
  | "INTERNAL";

export type GraphNode = {
  id: string;
  label: string;
  group: string;
  importance: number;
};

export type GraphEdge = {
  source: string;
  target: string;
  relation: string;
};

export type ArchitectureResult = {
  repoName: string;
  tagline: string;
  architectureSummary: string[];
  languages: string[];
  monorepo: {
    isMonorepo: boolean;
    projects: string[];
  };
  sampled: boolean;
  sampleNote: string;
  components: { name: string; responsibility: string }[];
  graph: {
    nodes: GraphNode[];
    edges: GraphEdge[];
    clustered: boolean;
  } | null;
};

export type SelectedFile = {
  path: string;
  content: string;
};

export type AnalyzeRequest = {
  owner: string;
  repo: string;
  repoUrl: string;
  defaultBranch: string;
  description: string;
  primaryLanguage: string | null;
  totalFiles: number;
  truncatedTree: boolean;
  likelyMonorepo: boolean;
  files: SelectedFile[];
};

export type AnalyzeSuccess = ArchitectureResult & {
  owner: string;
  repo: string;
  repoUrl: string;
};

export type AnalyzeFailure = {
  error: string;
  code: ErrorCode;
};
