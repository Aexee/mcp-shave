import readline from "node:readline";

/**
 * Creates a realistic, bloated GitHub Pull Request JSON response object.
 * Typical GitHub REST API responses return dozens of hypermedia URLs, node IDs,
 * null values, empty arrays, and redundant permission metadata.
 */
export function createBloatedGitHubPR(): Record<string, unknown> {
  const createUser = (login: string, id: number) => ({
    login,
    id,
    node_id: `MDQ6VXNlcjE${id}=`,
    avatar_url: `https://avatars.githubusercontent.com/u/${id}?v=4`,
    gravatar_id: "",
    url: `https://api.github.com/users/${login}`,
    html_url: `https://github.com/${login}`,
    followers_url: `https://api.github.com/users/${login}/followers`,
    following_url: `https://api.github.com/users/${login}/following{/other_user}`,
    gists_url: `https://api.github.com/users/${login}/gists{/gist_id}`,
    starred_url: `https://api.github.com/users/${login}/starred{/owner}{/repo}`,
    subscriptions_url: `https://api.github.com/users/${login}/subscriptions`,
    organizations_url: `https://api.github.com/users/${login}/orgs`,
    repos_url: `https://api.github.com/users/${login}/repos`,
    events_url: `https://api.github.com/users/${login}/events{/privacy}`,
    received_events_url: `https://api.github.com/users/${login}/received_events`,
    type: "User",
    user_view_type: "public",
    site_admin: false,
  });

  const createRepo = (name: string, owner: string) => ({
    id: 98765432,
    node_id: "MDEwOlJlcG9zaXRvcnk5ODc2NTQzMg==",
    name,
    full_name: `${owner}/${name}`,
    private: false,
    owner: createUser(owner, 100),
    html_url: `https://github.com/${owner}/${name}`,
    description: "An open source repository demonstrating MCP token savings",
    fork: false,
    url: `https://api.github.com/repos/${owner}/${name}`,
    forks_url: `https://api.github.com/repos/${owner}/${name}/forks`,
    keys_url: `https://api.github.com/repos/${owner}/${name}/keys{/key_id}`,
    collaborators_url: `https://api.github.com/repos/${owner}/${name}/collaborators{/collaborator}`,
    teams_url: `https://api.github.com/repos/${owner}/${name}/teams`,
    hooks_url: `https://api.github.com/repos/${owner}/${name}/hooks`,
    issue_events_url: `https://api.github.com/repos/${owner}/${name}/issues/events{/number}`,
    events_url: `https://api.github.com/repos/${owner}/${name}/events`,
    assignees_url: `https://api.github.com/repos/${owner}/${name}/assignees{/user}`,
    branches_url: `https://api.github.com/repos/${owner}/${name}/branches{/branch}`,
    tags_url: `https://api.github.com/repos/${owner}/${name}/tags`,
    blobs_url: `https://api.github.com/repos/${owner}/${name}/git/blobs{/sha}`,
    git_tags_url: `https://api.github.com/repos/${owner}/${name}/git/tags{/sha}`,
    git_refs_url: `https://api.github.com/repos/${owner}/${name}/git/refs{/sha}`,
    trees_url: `https://api.github.com/repos/${owner}/${name}/git/trees{/sha}`,
    statuses_url: `https://api.github.com/repos/${owner}/${name}/statuses/{sha}`,
    languages_url: `https://api.github.com/repos/${owner}/${name}/languages`,
    stargazers_url: `https://api.github.com/repos/${owner}/${name}/stargazers`,
    contributors_url: `https://api.github.com/repos/${owner}/${name}/contributors`,
    subscribers_url: `https://api.github.com/repos/${owner}/${name}/subscribers`,
    subscription_url: `https://api.github.com/repos/${owner}/${name}/subscription`,
    commits_url: `https://api.github.com/repos/${owner}/${name}/commits{/sha}`,
    git_commits_url: `https://api.github.com/repos/${owner}/${name}/git/commits{/sha}`,
    comments_url: `https://api.github.com/repos/${owner}/${name}/comments{/number}`,
    issue_comment_url: `https://api.github.com/repos/${owner}/${name}/issues/comments{/number}`,
    contents_url: `https://api.github.com/repos/${owner}/${name}/contents/{+path}`,
    compare_url: `https://api.github.com/repos/${owner}/${name}/compare/{base}...{head}`,
    merges_url: `https://api.github.com/repos/${owner}/${name}/merges`,
    archive_url: `https://api.github.com/repos/${owner}/${name}/{archive_format}{/ref}`,
    downloads_url: `https://api.github.com/repos/${owner}/${name}/downloads`,
    issues_url: `https://api.github.com/repos/${owner}/${name}/issues{/number}`,
    pulls_url: `https://api.github.com/repos/${owner}/${name}/pulls{/number}`,
    milestones_url: `https://api.github.com/repos/${owner}/${name}/milestones{/number}`,
    notifications_url: `https://api.github.com/repos/${owner}/${name}/notifications{?since,all,participating}`,
    labels_url: `https://api.github.com/repos/${owner}/${name}/labels{/name}`,
    releases_url: `https://api.github.com/repos/${owner}/${name}/releases{/id}`,
    deployments_url: `https://api.github.com/repos/${owner}/${name}/deployments`,
    permissions: {
      admin: false,
      maintain: false,
      push: false,
      triage: false,
      pull: true,
    },
  });

  return {
    url: "https://api.github.com/repos/octocat/Hello-World/pulls/1347",
    id: 13470001,
    node_id: "MDExOlB1bGxSZXF1ZXN0MTM0NzAwMDE=",
    html_url: "https://github.com/octocat/Hello-World/pull/1347",
    diff_url: "https://github.com/octocat/Hello-World/pull/1347.diff",
    patch_url: "https://github.com/octocat/Hello-World/pull/1347.patch",
    issue_url: "https://api.github.com/repos/octocat/Hello-World/issues/1347",
    number: 1347,
    state: "open",
    locked: false,
    title: "Feature: Optimize token usage for MCP JSON-RPC messages",
    user: createUser("octocat", 1),
    body: "This PR introduces transparent pruning of redundant hypermedia links and metadata to save valuable LLM tokens.",
    created_at: "2026-10-18T10:00:00Z",
    updated_at: "2026-10-18T10:30:00Z",
    closed_at: null,
    merged_at: null,
    merge_commit_sha: "e5bd3914e2e596debea16f433f57875b5b90bcd6",
    assignee: null,
    assignees: [],
    requested_reviewers: [],
    requested_teams: [],
    labels: [],
    milestone: null,
    draft: false,
    commits_url: "https://api.github.com/repos/octocat/Hello-World/pulls/1347/commits",
    review_comments_url: "https://api.github.com/repos/octocat/Hello-World/pulls/1347/comments",
    review_comment_url: "https://api.github.com/repos/octocat/Hello-World/pulls/comments{/number}",
    comments_url: "https://api.github.com/repos/octocat/Hello-World/pulls/1347/comments",
    statuses_url: "https://api.github.com/repos/octocat/Hello-World/statuses/e5bd3914e2e596debea16f433f57875b5b90bcd6",
    head: {
      label: "octocat:token-optimization",
      ref: "token-optimization",
      sha: "6dcb09b5b57875f334f61aebed695e2e4193db5e",
      user: createUser("octocat", 1),
      repo: createRepo("Hello-World", "octocat"),
    },
    base: {
      label: "octocat:main",
      ref: "main",
      sha: "7dcb09b5b57875f334f61aebed695e2e4193db5f",
      user: createUser("octocat", 1),
      repo: createRepo("Hello-World", "octocat"),
    },
    _links: {
      self: { href: "https://api.github.com/repos/octocat/Hello-World/pulls/1347" },
      html: { href: "https://github.com/octocat/Hello-World/pull/1347" },
      issue: { href: "https://api.github.com/repos/octocat/Hello-World/issues/1347" },
      comments: { href: "https://api.github.com/repos/octocat/Hello-World/pulls/1347/comments" },
      review_comments: { href: "https://api.github.com/repos/octocat/Hello-World/pulls/1347/comments" },
      review_comment: { href: "https://api.github.com/repos/octocat/Hello-World/pulls/comments{/number}" },
      commits: { href: "https://api.github.com/repos/octocat/Hello-World/pulls/1347/commits" },
      statuses: { href: "https://api.github.com/repos/octocat/Hello-World/statuses/e5bd3914e2e596debea16f433f57875b5b90bcd6" },
    },
    author_association: "OWNER",
    auto_merge: null,
    active_lock_reason: null,
  };
}

/**
 * Runs a standalone mock MCP server reading from stdin and writing strictly to stdout.
 */
function runMockServer(): void {
  const rl = readline.createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
    terminal: false,
  });

  rl.on("line", (line: string) => {
    if (!line.trim()) return;

    try {
      const request = JSON.parse(line);
      const { id, method } = request;

      if (method === "initialize") {
        const response = {
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: "2024-11-05",
            capabilities: { tools: {} },
            serverInfo: { name: "mock-github-server", version: "1.0.0" },
          },
        };
        process.stdout.write(JSON.stringify(response) + "\n");
        return;
      }

      if (method === "tools/list") {
        const response = {
          jsonrpc: "2.0",
          id,
          result: {
            tools: [
              {
                name: "get_pull_request",
                description: "Get details for a GitHub pull request",
                inputSchema: {
                  type: "object",
                  properties: {
                    owner: { type: "string" },
                    repo: { type: "string" },
                    pull_number: { type: "number" },
                  },
                },
              },
            ],
          },
        };
        process.stdout.write(JSON.stringify(response) + "\n");
        return;
      }

      if (method === "tools/call") {
        const bloatedPR = createBloatedGitHubPR();
        // Return CallToolResult with formatted JSON text payload
        const response = {
          jsonrpc: "2.0",
          id,
          result: {
            content: [
              {
                type: "text",
                text: JSON.stringify(bloatedPR, null, 2),
              },
            ],
            isError: false,
          },
        };
        process.stdout.write(JSON.stringify(response) + "\n");
        return;
      }

      // Default response for other methods
      if (id !== undefined) {
        process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result: {} }) + "\n");
      }
    } catch (err) {
      console.error("[mock-server] Error processing line:", err);
    }
  });
}

// When executed directly, run the server
if (process.argv[1]?.endsWith("mock-server.ts") || process.argv[1]?.endsWith("mock-server.js")) {
  runMockServer();
}
