export type ParsedRepo = {
  owner: string;
  repo: string;
  url: string;
};

const GITHUB_REPO =
  /^(?:https?:\/\/)?(?:www\.)?github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?(?:\/(?:tree|blob|commit|releases|issues|pull|actions|wiki|pulse|security|projects|settings)\/.*)?\/?$/i;

export function parseGitHubRepoUrl(input: string): ParsedRepo | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (/\s/.test(trimmed)) return null;
  if (/gist\.github\.com/i.test(trimmed)) return null;

  const match = trimmed.match(GITHUB_REPO);
  if (!match) return null;

  const owner = match[1];
  const repo = match[2];
  if (!owner || !repo) return null;
  if (owner.toLowerCase() === "orgs" || owner.toLowerCase() === "settings") return null;
  if (["tree", "blob", "issues", "pulls", "actions"].includes(repo.toLowerCase())) return null;

  return {
    owner,
    repo,
    url: `https://github.com/${owner}/${repo}`,
  };
}
