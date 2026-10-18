/**
 * Preset rules for pruning GitHub MCP server responses.
 * Targets bloated metadata such as redundant API URLs, node IDs, permissions,
 * and internal tracking fields that waste LLM context tokens.
 */

export const GITHUB_JUNK_KEYS = new Set([
  "node_id",
  "gravatar_id",
  "permissions",
  "_links",
  "site_admin",
  "user_view_type",
  "performed_via_github_app",
]);

/**
 * Checks whether a JSON key in a GitHub API payload is redundant metadata.
 * Strips keys ending with `_url`, generic `url`, and known metadata keys.
 */
export function isGithubJunkKey(key: string): boolean {
  if (GITHUB_JUNK_KEYS.has(key)) {
    return true;
  }

  // Remove `url` and all `*_url` fields (e.g., avatar_url, followers_url, etc.)
  if (key === "url" || key.endsWith("_url")) {
    return true;
  }

  return false;
}
