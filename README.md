# mcp-shave ⚡

A high-performance, transparent stdio JSON-RPC proxy for MCP (Model Context Protocol) servers. It automatically prunes bloated metadata, hypermedia URLs, redundant null values, empty arrays, and invisible DOM elements from tool responses before forwarding them to LLMs (Claude Code, Codex, Cursor, etc.), saving **50% to 90%+** of context tokens.

---

## 🚀 Why mcp-shave?

MCP servers (like GitHub, GitLab, or browser automation servers) often return huge raw REST/DOM payloads:
- **GitHub MCP Server**: Single PR or issue queries return dozens of hypermedia API URLs (`*_url`), `node_id`, `gravatar_id`, `permissions`, empty arrays, and null fields (~15–50 KB).
- **Playwright MCP Server**: DOM accessibility trees and element snapshots often contain hidden elements, presentation nodes, and massive SVG paths.

These fields waste LLM context windows, slow down generation speed, and increase API costs without providing any value to the reasoning model.

`mcp-shave` acts as a zero-configuration, drop-in transparent stdio wrapper that intercepts responses, strips noisy metadata, and sends clean, token-efficient JSON to your LLM.

---

## 🔒 Stdout Pollution Guarantee

In the MCP protocol, **`stdout` is strictly reserved for JSON-RPC messages**. Any stray `console.log` or debug message corrupts the stream and causes MCP clients (Claude Code, Codex) to immediately disconnect.

`mcp-shave` strictly guarantees:
- **`process.stdout`**: Exclusively receives pure, valid JSON-RPC lines.
- **`process.stderr`**: Used for all metrics, savings notifications (`⚡ [mcp-shave] Pruned response: saved 15,580 chars (~3,895 tokens, -91%)`), and error logging.

---

## 📦 Installation & Usage

### Direct Usage via `npx`

Simply prepend `npx mcp-shave --` to your existing MCP server command:

```bash
# With GitHub MCP server
npx mcp-shave -- npx -y @modelcontextprotocol/server-github

# With Playwright MCP server
npx mcp-shave --preset playwright -- npx -y @modelcontextprotocol/server-playwright

# With any custom MCP server
npx mcp-shave -- node ./path/to/server.js
```

### In Claude Desktop / Claude Code Configuration

In your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-shave",
        "--",
        "npx",
        "-y",
        "@modelcontextprotocol/server-github"
      ],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "your-token-here"
      }
    }
  }
}
```

---

## ⚙️ Options & Flags

Options can be specified before the `--` separator:

| Flag | Description | Default |
| --- | --- | --- |
| `--preset <name>` | Pruning preset: `auto`, `github`, `playwright`, `none` | `auto` |
| `--quiet`, `-q` | Suppress savings notifications on stderr | `false` |
| `--stats` | Display cumulative token savings recorded in `~/.mcp-shave/stats.json` | - |
| `--help`, `-h` | Display help and usage information | - |

---

## 📊 Cumulative Stats

`mcp-shave` tracks cumulative tokens and characters saved in `~/.mcp-shave/stats.json`. You can inspect your total savings at any time:

```bash
npx mcp-shave --stats
```

Output:
```text
--- mcp-shave Cumulative Savings ---
Total Requests Pruned: 14
Original Size:        245,820 characters
Pruned Size:          28,410 characters
Characters Saved:     217,410 characters
Tokens Saved:         ~54,353 tokens
Overall Reduction:    88%
Stats File:           /Users/username/.mcp-shave/stats.json
-----------------------------------
```

---

## 🛠 Project Architecture

```
mcp-shave/
├── package.json          # "bin": { "mcp-shave": "./dist/index.js" }
├── tsconfig.json
├── tsup.config.ts        # Fast bundling with tsup
├── src/
│   ├── index.ts          # CLI entry point and child_process (stdio) management
│   ├── proxy.ts          # JSON-RPC newline stream reader and response interceptor
│   ├── pruner.ts         # Recursive JSON pruning engine and token calculation
│   ├── presets/
│   │   ├── github.ts     # Junk fields (*_url, node_id, permissions, _links, etc.)
│   │   └── playwright.ts # Invisible DOM nodes and empty element filter
│   └── stats.ts          # Counter recording saved tokens to ~/.mcp-shave/stats.json
└── test/
    ├── mock-server.ts    # Fake MCP server returning realistic bloated GitHub PR responses
    └── run-tests.ts      # Automated unit and end-to-end integration test runner
```

---

## 🧪 Testing

Run the automated test suite:

```bash
npm test
```

The test runner verifies:
1. Recursive pruning of bloated payloads (nulls, empty arrays, `node_id`, `*_url`, `gravatar_id`, etc.).
2. At least **50% size reduction** (typically **80–92%** on GitHub responses).
3. Playwright hidden DOM node and empty element filtering.
4. End-to-end stdio proxying with child processes.
5. Strict **zero stdout pollution** verification.
6. Persistent metrics recording in `~/.mcp-shave/stats.json`.

---

## 📄 License

MIT
