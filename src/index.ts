import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { startProxy } from "./proxy.js";
import { printStatsSummary, sanitizeServerName } from "./stats.js";
import type { PrunerOptions } from "./pruner.js";

/**
 * Displays CLI usage and options to stderr to prevent stdout pollution.
 */
function printHelp(): void {
  console.error(`
mcp-shave - Transparent JSON-RPC proxy for MCP servers that prunes noisy payloads and saves tokens.

Usage:
  mcp-shave [options] -- <command> [args...]

Examples:
  npx mcp-shave -- npx -y @modelcontextprotocol/server-github
  npx mcp-shave --preset github -- npx -y @modelcontextprotocol/server-github
  npx mcp-shave -- node ./dist/server.js

Options:
  --preset <preset>   Pruning preset: auto, github, playwright, none (default: auto)
  --quiet, -q         Suppress savings notifications printed to stderr
  --stats             Display cumulative saved token metrics and exit
  --help, -h          Display this help message
`);
}

/**
 * Validates and safely resolves target commands without allowing shell injection.
 */
function resolveSafeCommand(
  command: string,
  args: string[]
): { cmd: string; args: string[]; useShell: boolean } {
  // Disallow control characters and dangerous shell metacharacters in command name
  if (/[\r\n;&|`$><]/.test(command)) {
    console.error(`[mcp-shave] Security Error: Command contains forbidden shell characters: "${command}"`);
    process.exit(1);
  }

  if (process.platform === "win32") {
    // If target is npx or npm, invoke via node process directly with shell: false
    if (command === "npx" || command === "npm") {
      const cliName = command === "npx" ? "npx-cli.js" : "npm-cli.js";
      const cliPath = path.join(
        path.dirname(process.execPath),
        "node_modules",
        "npm",
        "bin",
        cliName
      );
      if (fs.existsSync(cliPath)) {
        return {
          cmd: process.execPath,
          args: [cliPath, ...args],
          useShell: false,
        };
      }
    }

    // If command ends with .cmd or .bat, Node on Windows requires shell or cmd.exe
    const ext = path.extname(command).toLowerCase();
    if (ext === ".cmd" || ext === ".bat") {
      // Validate that arguments do not contain shell injection operators
      for (const arg of args) {
        if (/[\r\n&|;`><]/.test(arg)) {
          console.error(`[mcp-shave] Security Error: Argument contains forbidden shell characters: "${arg}"`);
          process.exit(1);
        }
      }
      return { cmd: command, args, useShell: true };
    }

    // Default to shell: false for Windows executables (.exe, node, etc.)
    return { cmd: command, args, useShell: false };
  }

  // Linux & macOS: Always run with shell: false for zero shell injection risk
  return { cmd: command, args, useShell: false };
}

function main(): void {
  const args = process.argv.slice(2);

  // Check for standalone helper flags
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    process.exit(0);
  }

  if (args.includes("--stats")) {
    printStatsSummary();
    process.exit(0);
  }

  const dashIndex = args.indexOf("--");
  if (dashIndex === -1 || dashIndex === args.length - 1) {
    console.error("[mcp-shave] Error: Target command missing after '--'.");
    printHelp();
    process.exit(1);
  }

  const flags = args.slice(0, dashIndex);
  const targetCommand = args[dashIndex + 1];
  const targetArgs = args.slice(dashIndex + 2);

  let preset: PrunerOptions["preset"] = "auto";
  const presetIndex = flags.indexOf("--preset");
  if (presetIndex !== -1 && flags[presetIndex + 1]) {
    const specifiedPreset = flags[presetIndex + 1].toLowerCase();
    if (["auto", "github", "playwright", "none"].includes(specifiedPreset)) {
      preset = specifiedPreset as PrunerOptions["preset"];
    } else {
      console.error(
        `[mcp-shave] Warning: Unknown preset "${specifiedPreset}", falling back to "auto".`
      );
    }
  }

  const quiet = flags.includes("--quiet") || flags.includes("-q");
  const serverName = sanitizeServerName(targetArgs[0] || targetCommand);

  // Safely resolve command without arbitrary shell injection
  const { cmd, args: finalArgs, useShell } = resolveSafeCommand(targetCommand, targetArgs);

  // Spawn the target MCP server with piped stdin/stdout and inherited stderr
  const child: ChildProcess = spawn(cmd, finalArgs, {
    stdio: ["pipe", "pipe", "inherit"],
    shell: useShell,
  });

  child.on("error", (err) => {
    console.error(`[mcp-shave] Error launching target process "${targetCommand}":`, err.message);
    process.exit(1);
  });

  // Clean signal forwarding and zombie cleanup
  const cleanExit = (signal: NodeJS.Signals) => {
    if (!child.killed) {
      try {
        child.kill(signal);
      } catch {
        // Child process may already have terminated
      }
    }
  };

  process.on("SIGINT", () => cleanExit("SIGINT"));
  process.on("SIGTERM", () => cleanExit("SIGTERM"));
  process.on("SIGHUP", () => cleanExit("SIGHUP"));

  // Ensure child process is never left as a zombie on parent exit
  process.on("exit", () => {
    if (!child.killed) {
      try {
        child.kill();
      } catch {
        // Child already closed
      }
    }
  });

  child.on("close", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
    } else {
      process.exit(code ?? 0);
    }
  });

  // Start the transparent proxy
  startProxy(process.stdin, process.stdout, child, {
    prunerOptions: { preset },
    quiet,
    serverName,
  });
}

main();
