import readline from "node:readline";
import type { ChildProcess } from "node:child_process";
import type { Readable, Writable } from "node:stream";
import { pruneJsonRpcMessage, MAX_PAYLOAD_SIZE, type PrunerOptions } from "./pruner.js";
import { recordSavings, sanitizeServerName } from "./stats.js";

export interface ProxyOptions {
  prunerOptions?: PrunerOptions;
  quiet?: boolean;
  serverName?: string;
}

/**
 * Creates and runs the transparent JSON-RPC stdio proxy between client and target child process.
 *
 * CRITICAL RULES:
 * 1. `process.stdout` is strictly reserved for valid JSON-RPC protocol lines.
 * 2. All logging, diagnostic info, and token saving metrics MUST use `console.error` (stderr).
 * 3. Any non-JSON output from child server is passed through transparently without crashing.
 * 4. Stdio stream closure cleans up the child process to avoid zombie processes.
 */
export function startProxy(
  clientStdin: Readable,
  clientStdout: Writable,
  child: ChildProcess,
  options: ProxyOptions = {}
): void {
  const { quiet = false, prunerOptions = { preset: "auto" }, serverName } = options;
  const cleanServerName = serverName ? sanitizeServerName(serverName) : undefined;

  if (!child.stdin || !child.stdout) {
    console.error("[mcp-shave] Error: Child process must have piped stdin and stdout.");
    process.exit(1);
  }

  const childStdin = child.stdin;
  const childStdout = child.stdout;

  // Track pending tool call requests by JSON-RPC id
  const pendingRequests = new Map<string | number, { method: string; toolName?: string }>();

  // 1. Process clientStdin -> childStdin
  const clientRl = readline.createInterface({
    input: clientStdin,
    crlfDelay: Infinity,
    terminal: false,
  });

  clientRl.on("line", (line: string) => {
    if (!line.trim()) {
      return;
    }

    // Pass through without parsing if payload exceeds max size (25MB)
    if (line.length <= MAX_PAYLOAD_SIZE) {
      try {
        const parsed = JSON.parse(line);
        if (parsed && typeof parsed === "object" && parsed.id !== undefined && parsed.method) {
          const toolName =
            parsed.method === "tools/call" &&
            parsed.params &&
            typeof parsed.params.name === "string"
              ? parsed.params.name
              : undefined;

          pendingRequests.set(parsed.id, {
            method: parsed.method,
            toolName,
          });
        }
      } catch {
        // Pass-through non-JSON lines intact
      }
    }

    if (!childStdin.destroyed && childStdin.writable) {
      childStdin.write(line + "\n");
    }
  });

  // When client closes stdin (e.g. Claude Code or Cursor terminates connection),
  // close child stdin and ensure child process is terminated to prevent zombies
  clientRl.on("close", () => {
    if (!childStdin.destroyed) {
      childStdin.end();
    }

    // Give child process a grace period to exit cleanly, then terminate if still running
    const graceTimer = setTimeout(() => {
      if (!child.killed) {
        try {
          child.kill("SIGTERM");
        } catch {
          // Process already ended
        }
      }
    }, 2000);
    graceTimer.unref();
  });

  // 2. Process childStdout -> clientStdout
  const childRl = readline.createInterface({
    input: childStdout,
    crlfDelay: Infinity,
    terminal: false,
  });

  childRl.on("line", (line: string) => {
    if (!line.trim()) {
      return;
    }

    // Bypass JSON parsing for huge payloads (> 25MB) to prevent memory crashes
    if (line.length > MAX_PAYLOAD_SIZE) {
      clientStdout.write(line + "\n");
      return;
    }

    let message: Record<string, unknown>;
    try {
      message = JSON.parse(line);
    } catch {
      // If output is not JSON (or malformed), forward raw line to client stdout to maintain transparency
      clientStdout.write(line + "\n");
      return;
    }

    // Check if line is a JSON-RPC response with a result
    if (message && typeof message === "object" && "result" in message) {
      const reqId = message.id as string | number | undefined;
      const reqInfo = reqId !== undefined ? pendingRequests.get(reqId) : undefined;
      if (reqId !== undefined) {
        pendingRequests.delete(reqId);
      }

      const pruneResult = pruneJsonRpcMessage(message, prunerOptions);

      if (pruneResult.didPrune && pruneResult.savedChars > 0) {
        // Record metrics to ~/.mcp-shave/stats.json
        recordSavings(pruneResult.originalChars, pruneResult.prunedChars, cleanServerName);

        if (!quiet) {
          const targetName = reqInfo?.toolName ? ` (${reqInfo.toolName})` : "";
          console.error(
            `⚡ [mcp-shave] Pruned response${targetName}: saved ${pruneResult.savedChars.toLocaleString()} chars (~${pruneResult.savedTokens.toLocaleString()} tokens, -${pruneResult.percent}%)`
          );
        }

        // Send pruned JSON-RPC message strictly on client stdout
        clientStdout.write(JSON.stringify(pruneResult.prunedMessage) + "\n");
        return;
      }
    }

    // Forward original message if not pruned
    clientStdout.write(line + "\n");
  });
}
