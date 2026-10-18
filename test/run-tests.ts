import { spawn, execSync } from "node:child_process";
import readline from "node:readline";
import path from "node:path";
import assert from "node:assert";
import { PassThrough } from "node:stream";
import { createBloatedGitHubPR } from "./mock-server.js";
import {
  pruneJsonRpcMessage,
  pruneJsonString,
  pruneValue,
  MAX_PAYLOAD_SIZE,
  MAX_RECURSION_DEPTH,
} from "../src/pruner.js";
import { loadStats, sanitizeServerName } from "../src/stats.js";
import { startProxy } from "../src/proxy.js";

const CLI_PATH = path.resolve("./dist/index.js");
const MOCK_SERVER_PATH = path.resolve("./test/mock-server.ts");

async function runUnitTests() {
  console.error("\n--- Running GitHub Pruner Unit Tests ---");

  const bloatedPR = createBloatedGitHubPR();
  const rawOriginalPR = JSON.stringify(bloatedPR, null, 2);

  const mockRpcResponse = {
    jsonrpc: "2.0",
    id: 101,
    result: {
      content: [
        {
          type: "text",
          text: rawOriginalPR,
        },
      ],
      isError: false,
    },
  };

  const pruneResult = pruneJsonRpcMessage(mockRpcResponse, { preset: "auto" });

  assert.strictEqual(pruneResult.didPrune, true, "pruneJsonRpcMessage should return didPrune = true");
  assert.ok(pruneResult.savedChars > 0, "savedChars must be positive");
  console.error(`Original size: ${pruneResult.originalChars} chars`);
  console.error(`Pruned size:   ${pruneResult.prunedChars} chars`);
  console.error(`Saved tokens:  ~${pruneResult.savedTokens}`);
  console.error(`Savings:       ${pruneResult.percent}%`);

  assert.ok(
    pruneResult.percent >= 50,
    `Savings must be at least 50%, received: ${pruneResult.percent}%`
  );

  const prunedContentText = (
    pruneResult.prunedMessage.result as { content: Array<{ text: string }> }
  ).content[0].text;

  const parsedPrunedPR = JSON.parse(prunedContentText);

  // Assert essential fields are preserved
  assert.strictEqual(parsedPrunedPR.id, 13470001, "PR ID must be preserved");
  assert.strictEqual(parsedPrunedPR.number, 1347, "PR number must be preserved");
  assert.strictEqual(parsedPrunedPR.title, "Feature: Optimize token usage for MCP JSON-RPC messages");
  assert.strictEqual(parsedPrunedPR.user.login, "octocat", "Author login must be preserved");

  // Assert noisy fields are stripped
  assert.strictEqual(parsedPrunedPR.node_id, undefined, "node_id must be stripped");
  assert.strictEqual(parsedPrunedPR.user.avatar_url, undefined, "avatar_url must be stripped");
  assert.strictEqual(parsedPrunedPR.user.followers_url, undefined, "followers_url must be stripped");
  assert.strictEqual(parsedPrunedPR.user.gravatar_id, undefined, "gravatar_id must be stripped");
  assert.strictEqual(parsedPrunedPR.user.node_id, undefined, "user.node_id must be stripped");
  assert.strictEqual(parsedPrunedPR.user.url, undefined, "user.url must be stripped");
  assert.strictEqual(parsedPrunedPR.closed_at, undefined, "null values must be stripped");
  assert.strictEqual(parsedPrunedPR.assignee, undefined, "null values must be stripped");
  assert.strictEqual(parsedPrunedPR.assignees, undefined, "empty arrays must be stripped");
  assert.strictEqual(parsedPrunedPR.labels, undefined, "empty arrays must be stripped");
  assert.strictEqual(parsedPrunedPR._links, undefined, "_links hypermedia object must be stripped");

  console.error("✓ Unit test passed: Bloated payload successfully pruned by > 50% with clean schema.");
}

async function runPlaywrightPresetUnitTests() {
  console.error("\n--- Running Playwright DOM Pruner Unit Tests ---");

  const domSnapshot = {
    role: "WebArea",
    name: "Dashboard",
    children: [
      {
        role: "heading",
        name: "Welcome",
        level: 1,
      },
      {
        role: "none", // Presentation node without name or text -> should be stripped
        children: [],
      },
      {
        role: "button",
        name: "Hidden Button",
        hidden: true, // Hidden node -> should be stripped
      },
      {
        role: "generic",
        display: "none", // Display none -> should be stripped
        children: [{ role: "text", text: "Invisible" }],
      },
      {
        role: "button",
        name: "Submit",
        boundingBox: { x: 10, y: 20, width: 100, height: 30 }, // boundingBox -> should be stripped
      },
    ],
  };

  const mockRpcResponse = {
    jsonrpc: "2.0",
    id: 102,
    result: {
      content: [
        {
          type: "text",
          text: JSON.stringify(domSnapshot, null, 2),
        },
      ],
    },
  };

  const pruneResult = pruneJsonRpcMessage(mockRpcResponse, { preset: "playwright" });
  assert.strictEqual(pruneResult.didPrune, true);

  const prunedText = (
    pruneResult.prunedMessage.result as { content: Array<{ text: string }> }
  ).content[0].text;
  const prunedDom = JSON.parse(prunedText);

  // Verify visible nodes remain
  assert.strictEqual(prunedDom.name, "Dashboard");
  assert.strictEqual(prunedDom.children.length, 2, "Only visible nodes should remain");
  assert.strictEqual(prunedDom.children[0].name, "Welcome");
  assert.strictEqual(prunedDom.children[1].name, "Submit");
  // Verify boundingBox was stripped from button
  assert.strictEqual(prunedDom.children[1].boundingBox, undefined);

  console.error("✓ Playwright DOM unit test passed: Hidden nodes and empty DOM elements pruned.");
}

async function runSecurityAndDeepNestingTests() {
  console.error("\n--- Running Security, Max Depth & Prototype Pollution Tests ---");

  // 1. Prototype Pollution Defense
  const maliciousPayload = JSON.parse(
    '{"__proto__": {"polluted": true}, "constructor": {"prototype": {"admin": true}}, "safe": "value"}'
  );
  const prunedMalicious = pruneValue(maliciousPayload) as Record<string, unknown>;

  assert.strictEqual(
    (Object.prototype as any).polluted,
    undefined,
    "Object.prototype must NOT be polluted"
  );
  assert.strictEqual(
    (Object.prototype as any).admin,
    undefined,
    "Object.prototype must NOT be polluted via constructor"
  );
  assert.strictEqual(
    Object.prototype.hasOwnProperty.call(prunedMalicious, "__proto__"),
    false,
    "__proto__ own property must be removed"
  );
  assert.strictEqual(
    Object.prototype.hasOwnProperty.call(prunedMalicious, "constructor"),
    false,
    "constructor own property must be removed"
  );
  assert.strictEqual(
    Object.prototype.hasOwnProperty.call(prunedMalicious, "prototype"),
    false,
    "prototype own property must be removed"
  );
  assert.strictEqual(prunedMalicious.safe, "value", "Legitimate fields must be preserved");
  console.error("✓ Prototype pollution defense verified");

  // 2. Deeply Nested Structure (exceeding MAX_RECURSION_DEPTH = 50)
  let deepObj: any = { value: "deepest" };
  for (let i = 0; i < 70; i++) {
    deepObj = { level: i, child: deepObj };
  }

  // Must not throw RangeError: Maximum call stack size exceeded
  assert.doesNotThrow(() => {
    const result = pruneValue(deepObj);
    assert.ok(result, "Deeply nested object should return successfully");
  }, "Pruner must handle deeply nested structures without call stack overflow");
  console.error(`✓ Handled 70-level deeply nested object gracefully (limit: ${MAX_RECURSION_DEPTH})`);

  // 3. Circular Object References
  const circularObj: any = { name: "cycle", normal: "ok" };
  circularObj.self = circularObj;
  circularObj.nested = { backToRoot: circularObj };

  assert.doesNotThrow(() => {
    const prunedCircular = pruneValue(circularObj);
    assert.ok(prunedCircular, "Circular structure must not throw");
  }, "Pruner must not enter infinite loop on circular references");
  console.error("✓ Circular reference protection verified");

  // 4. Payload Size Bypass (> 25MB)
  const giantJson = "A".repeat(MAX_PAYLOAD_SIZE + 100);
  const bypassResult = pruneJsonString(giantJson);
  assert.strictEqual(bypassResult.didPrune, false, "Should bypass payloads > 25MB");
  assert.strictEqual(bypassResult.prunedStr.length, giantJson.length);
  console.error(`✓ 25MB payload size bypass verified (${(MAX_PAYLOAD_SIZE / 1024 / 1024).toFixed(0)}MB limit)`);

  // 5. Server Name Sanitization & Secret Redaction
  const dirtyNames = [
    "https://ghp_secretToken123456@github.com/repo?auth=token#frag",
    "../../etc/passwd",
    "server-github --token=super-secret-pat-xyz",
    "@modelcontextprotocol/server-github",
  ];
  const sanitized = dirtyNames.map(sanitizeServerName);
  assert.ok(!sanitized[0].includes("secretToken"), "Sanitized server name must NOT contain secrets");
  assert.ok(!sanitized[0].includes("auth="), "Sanitized server name must NOT contain query params");
  assert.ok(!sanitized[1].includes(".."), "Sanitized server name must NOT contain path traversal");
  assert.ok(!sanitized[2].includes("secret-pat"), "Sanitized server name must NOT contain CLI flags");
  assert.strictEqual(sanitized[3], "@modelcontextprotocol/server-github", "Scoped package names preserved");
  console.error("✓ Server name sanitization and secret redaction verified");
}

async function runMalformedAndChunkedStreamTests(): Promise<void> {
  console.error("\n--- Running Malformed & Chunked Stream Edge-Case Tests ---");

  // Test (a): Malformed / Non-JSON Lines Pass-Through
  {
    const clientStdin = new PassThrough();
    const clientStdout = new PassThrough();
    const mockChildStdin = new PassThrough();
    const mockChildStdout = new PassThrough();

    const mockChild: any = {
      stdin: mockChildStdin,
      stdout: mockChildStdout,
      killed: false,
      kill: () => {
        mockChild.killed = true;
      },
    };

    const stdoutLines: string[] = [];
    const rl = readline.createInterface({ input: clientStdout, crlfDelay: Infinity });
    rl.on("line", (l) => stdoutLines.push(l));

    startProxy(clientStdin, clientStdout, mockChild, { quiet: true });

    // Send malformed non-JSON lines and debug noise from child
    mockChildStdout.write("Initializing server...\n");
    mockChildStdout.write("DEBUG: [internal] connecting to db...\n");
    mockChildStdout.write("{malformed json line: true\n");

    // Send a valid JSON-RPC message
    mockChildStdout.write(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 55,
        result: { content: [{ type: "text", text: "hello" }] },
      }) + "\n"
    );

    await new Promise((r) => setTimeout(r, 100));

    assert.strictEqual(stdoutLines.length, 4, "All 4 lines should pass through without crashing");
    assert.strictEqual(stdoutLines[0], "Initializing server...");
    assert.strictEqual(stdoutLines[1], "DEBUG: [internal] connecting to db...");
    assert.strictEqual(stdoutLines[2], "{malformed json line: true");
    const parsedValid = JSON.parse(stdoutLines[3]);
    assert.strictEqual(parsedValid.id, 55);
    console.error("✓ Malformed non-JSON lines passed through transparently without crashing");
  }

  // Test (b): Chunked / Split JSON-RPC Messages across data events
  {
    const clientStdin = new PassThrough();
    const clientStdout = new PassThrough();
    const mockChildStdin = new PassThrough();
    const mockChildStdout = new PassThrough();

    const mockChild: any = {
      stdin: mockChildStdin,
      stdout: mockChildStdout,
      killed: false,
      kill: () => {
        mockChild.killed = true;
      },
    };

    const stdoutLines: string[] = [];
    const rl = readline.createInterface({ input: clientStdout, crlfDelay: Infinity });
    rl.on("line", (l) => stdoutLines.push(l));

    startProxy(clientStdin, clientStdout, mockChild, { quiet: true });

    // Emulate fragmented packet delivery over stdio stream
    mockChildStdout.write('{"jsonrpc": "2.0", ');
    await new Promise((r) => setTimeout(r, 10));
    mockChildStdout.write('"id": 88, "result": {"content": [{"type": "text", ');
    await new Promise((r) => setTimeout(r, 10));
    mockChildStdout.write(
      '"text": "{\\"title\\": \\"Split Test\\", \\"avatar_url\\": \\"junk\\"}"}'
    );
    await new Promise((r) => setTimeout(r, 10));
    mockChildStdout.write("]}}\n"); // Line terminator arrives in final chunk

    await new Promise((r) => setTimeout(r, 100));

    assert.strictEqual(stdoutLines.length, 1, "Should reassemble into exactly 1 JSON-RPC line");
    const reassembled = JSON.parse(stdoutLines[0]);
    assert.strictEqual(reassembled.id, 88);
    const parsedText = JSON.parse(reassembled.result.content[0].text);
    assert.strictEqual(parsedText.title, "Split Test");
    assert.strictEqual(parsedText.avatar_url, undefined, "avatar_url should still be pruned");
    console.error("✓ Chunked/split JSON-RPC message correctly buffered, reassembled, and pruned");
  }
}

async function runEndToEndProxyTest(): Promise<void> {
  console.error("\n--- Running End-to-End Proxy Integration Test ---");

  const initialStats = loadStats();

  return new Promise((resolve, reject) => {
    // Spawn mcp-shave proxy running the mock-server
    // mcp-shave -- node --import tsx test/mock-server.ts
    const child = spawn(
      process.execPath,
      [CLI_PATH, "--", process.execPath, "--import", "tsx", MOCK_SERVER_PATH],
      {
        stdio: ["pipe", "pipe", "pipe"],
      }
    );

    const stdoutLines: string[] = [];
    const stderrLines: string[] = [];

    const stdoutRl = readline.createInterface({
      input: child.stdout,
      crlfDelay: Infinity,
    });

    const stderrRl = readline.createInterface({
      input: child.stderr,
      crlfDelay: Infinity,
    });

    stdoutRl.on("line", (line) => {
      stdoutLines.push(line);

      // Verify NO stdout pollution: every line written to stdout MUST be valid JSON
      try {
        const msg = JSON.parse(line);

        if (msg.id === 1) {
          // Initialize response received, now send tool call
          const toolCallReq = {
            jsonrpc: "2.0",
            id: 2,
            method: "tools/call",
            params: {
              name: "get_pull_request",
              arguments: { owner: "octocat", repo: "Hello-World", pull_number: 1347 },
            },
          };
          child.stdin.write(JSON.stringify(toolCallReq) + "\n");
        } else if (msg.id === 2) {
          // Tool call response received!
          verifyToolCallResponse(msg);
          child.kill();
        }
      } catch (err) {
        reject(
          new Error(
            `[STDOUT POLLUTION DETECTED] stdout output must ONLY contain valid JSON. Received non-JSON line: "${line}"`
          )
        );
      }
    });

    stderrRl.on("line", (line) => {
      stderrLines.push(line);
    });

    function verifyToolCallResponse(msg: any) {
      try {
        assert.strictEqual(msg.jsonrpc, "2.0", "Output must be valid JSON-RPC 2.0");
        assert.strictEqual(msg.id, 2, "Response ID must match request ID 2");
        assert.ok(msg.result, "Response must contain result object");
        assert.ok(Array.isArray(msg.result.content), "result.content must be an array");

        const textContent = msg.result.content[0].text;
        const parsed = JSON.parse(textContent);

        // Verify preserved fields
        assert.strictEqual(parsed.number, 1347);
        assert.strictEqual(parsed.user.login, "octocat");
        assert.strictEqual(parsed.title, "Feature: Optimize token usage for MCP JSON-RPC messages");

        // Verify stripped junk fields
        assert.strictEqual(parsed.node_id, undefined, "node_id was not stripped");
        assert.strictEqual(parsed.user.avatar_url, undefined, "avatar_url was not stripped");
        assert.strictEqual(parsed.user.followers_url, undefined, "followers_url was not stripped");
        assert.strictEqual(parsed.user.gravatar_id, undefined, "gravatar_id was not stripped");
        assert.strictEqual(parsed.closed_at, undefined, "null value was not stripped");
        assert.strictEqual(parsed.labels, undefined, "empty array was not stripped");
        assert.strictEqual(parsed._links, undefined, "_links was not stripped");

        // Verify reduction ratio
        const bloatedPR = createBloatedGitHubPR();
        const originalBloatedSize = JSON.stringify(bloatedPR, null, 2).length;
        const prunedSize = textContent.length;
        const reductionPercent = Math.round(
          ((originalBloatedSize - prunedSize) / originalBloatedSize) * 100
        );

        console.error(`E2E Original Size: ${originalBloatedSize} chars`);
        console.error(`E2E Pruned Size:   ${prunedSize} chars`);
        console.error(`E2E Reduction:     ${reductionPercent}%`);

        assert.ok(
          reductionPercent >= 50,
          `End-to-End reduction must be >= 50%, got ${reductionPercent}%`
        );

        // Verify stderr received the notification
        const hasSavingsNotice = stderrLines.some((l) => l.includes("⚡ [mcp-shave]"));
        assert.ok(hasSavingsNotice, "Stderr should contain the savings notification");

        // Verify NO stdout pollution occurred
        for (const outLine of stdoutLines) {
          assert.doesNotThrow(() => JSON.parse(outLine), "All stdout lines must be valid JSON");
        }

        // Verify stats file was updated
        const updatedStats = loadStats();
        assert.ok(
          updatedStats.totalRequestsPruned > initialStats.totalRequestsPruned,
          "Cumulative stats totalRequestsPruned should increment"
        );
        assert.ok(
          updatedStats.totalSavedChars > initialStats.totalSavedChars,
          "Cumulative stats totalSavedChars should increase"
        );

        console.error("✓ End-to-End proxy test passed with 0 stdout pollution and full JSON-RPC compliance!");
        resolve();
      } catch (e) {
        reject(e);
      }
    }

    child.on("error", (err) => {
      reject(err);
    });

    child.on("close", (code) => {
      // If closed before tool response was verified, fail
      if (stdoutLines.length < 2) {
        reject(
          new Error(
            `Proxy exited prematurely with code ${code}. Stderr: ${stderrLines.join("\n")}`
          )
        );
      }
    });

    // Start communication: send initialize request
    const initReq = {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "test-client", version: "1.0.0" },
      },
    };
    child.stdin.write(JSON.stringify(initReq) + "\n");
  });
}

async function runNpmPackVerificationTest() {
  console.error("\n--- Running npm pack --dry-run Hygiene Verification ---");

  // Run npm pack --dry-run --json
  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  const packOutput = execSync(`${npmCmd} pack --dry-run --json`, {
    encoding: "utf-8",
  });

  const packData = JSON.parse(packOutput);
  const files: Array<{ path: string }> = packData[0]?.files || [];
  const filePaths = files.map((f) => f.path);

  console.error(`Tarball files count: ${filePaths.length}`);
  for (const fp of filePaths) {
    console.error(`  📦 ${fp}`);
  }

  // Ensure crucial files exist
  assert.ok(filePaths.includes("LICENSE"), "Tarball must include LICENSE");
  assert.ok(filePaths.includes("README.md"), "Tarball must include README.md");
  assert.ok(filePaths.includes("package.json"), "Tarball must include package.json");
  assert.ok(
    filePaths.some((p) => p.startsWith("dist/")),
    "Tarball must include dist/ files"
  );

  // Ensure forbidden files are excluded
  for (const fp of filePaths) {
    assert.ok(!fp.startsWith("test/"), `Tarball must NOT contain test files: ${fp}`);
    assert.ok(!fp.startsWith("src/"), `Tarball must NOT contain src/ files: ${fp}`);
    assert.ok(!fp.includes("tsconfig.json"), `Tarball must NOT contain tsconfig.json: ${fp}`);
    assert.ok(!fp.includes("tsup.config.ts"), `Tarball must NOT contain tsup.config.ts: ${fp}`);
  }

  console.error("✓ NPM package hygiene verified: clean tarball containing only dist, license, readme");
}

async function main() {
  try {
    await runUnitTests();
    await runPlaywrightPresetUnitTests();
    await runSecurityAndDeepNestingTests();
    await runMalformedAndChunkedStreamTests();
    await runEndToEndProxyTest();
    await runNpmPackVerificationTest();
    console.error("\n🎉 All edge-case, security, and integration tests passed successfully!");
    process.exit(0);
  } catch (err) {
    console.error("\n❌ Test failed:", err);
    process.exit(1);
  }
}

main();
