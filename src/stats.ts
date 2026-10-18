import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export interface ServerStats {
  requestsPruned: number;
  savedChars: number;
  savedTokens: number;
}

export interface StatsData {
  totalOriginalChars: number;
  totalPrunedChars: number;
  totalSavedChars: number;
  totalSavedTokens: number;
  totalRequestsPruned: number;
  lastUpdated: string;
  servers?: Record<string, ServerStats>;
}

const STATS_DIR = path.join(os.homedir(), ".mcp-shave");
const STATS_FILE = path.join(STATS_DIR, "stats.json");

/**
 * Sanitizes a target server name or command identifier to ensure no tokens,
 * passwords, file paths, or private query parameters are ever persisted.
 */
export function sanitizeServerName(rawName?: string): string {
  if (!rawName || typeof rawName !== "string") {
    return "unknown";
  }

  // Strip query parameters and hash fragments
  let clean = rawName.split("?")[0].split("#")[0].trim();

  // If multiple words were passed, take only the first token before flags
  clean = clean.split(/\s+/)[0];

  // If it's a scoped package name like @scope/package, preserve scope
  const scopedMatch = clean.match(/^@[a-zA-Z0-9_\-\.]+\/[a-zA-Z0-9_\-\.]+/);
  if (scopedMatch) {
    clean = scopedMatch[0];
  } else {
    // Use only package / binary basename
    clean = path.basename(clean);
  }

  // If the token itself is a CLI flag (e.g. -y or --token=xyz), discard
  if (/^--?[\w-]+(=.*)?$/.test(clean)) {
    return "unknown";
  }

  // Whitelist safe characters: alphanumeric, dots, dashes, underscores, slashes, and scoped package @
  clean = clean.replace(/[^a-zA-Z0-9_\-\.\/@]/g, "");

  // Truncate to reasonable length
  return clean.slice(0, 64) || "unknown";
}

/**
 * Loads the current stats from ~/.mcp-shave/stats.json safely.
 */
export function loadStats(): StatsData {
  try {
    if (fs.existsSync(STATS_FILE)) {
      const content = fs.readFileSync(STATS_FILE, "utf-8");
      const data = JSON.parse(content);
      return {
        totalOriginalChars: Number(data.totalOriginalChars) || 0,
        totalPrunedChars: Number(data.totalPrunedChars) || 0,
        totalSavedChars: Number(data.totalSavedChars) || 0,
        totalSavedTokens: Number(data.totalSavedTokens) || 0,
        totalRequestsPruned: Number(data.totalRequestsPruned) || 0,
        lastUpdated: data.lastUpdated || new Date().toISOString(),
        servers: typeof data.servers === "object" && data.servers !== null ? data.servers : {},
      };
    }
  } catch {
    // Silently fallback if stats file cannot be read
  }

  return {
    totalOriginalChars: 0,
    totalPrunedChars: 0,
    totalSavedChars: 0,
    totalSavedTokens: 0,
    totalRequestsPruned: 0,
    lastUpdated: new Date().toISOString(),
    servers: {},
  };
}

/**
 * Saves updated stats to ~/.mcp-shave/stats.json safely with 0o600 file permissions.
 * STRICT PRIVACY: NEVER writes payloads, CLI tokens, or environment variables.
 */
export function saveStats(stats: StatsData): void {
  try {
    if (!fs.existsSync(STATS_DIR)) {
      fs.mkdirSync(STATS_DIR, { recursive: true, mode: 0o700 });
    }

    // Prepare strictly sanitized record
    const sanitizedRecord: StatsData = {
      totalOriginalChars: Number(stats.totalOriginalChars) || 0,
      totalPrunedChars: Number(stats.totalPrunedChars) || 0,
      totalSavedChars: Number(stats.totalSavedChars) || 0,
      totalSavedTokens: Number(stats.totalSavedTokens) || 0,
      totalRequestsPruned: Number(stats.totalRequestsPruned) || 0,
      lastUpdated: new Date().toISOString(),
      servers: {},
    };

    if (stats.servers) {
      for (const [srv, srvData] of Object.entries(stats.servers)) {
        const cleanName = sanitizeServerName(srv);
        sanitizedRecord.servers![cleanName] = {
          requestsPruned: Number(srvData.requestsPruned) || 0,
          savedChars: Number(srvData.savedChars) || 0,
          savedTokens: Number(srvData.savedTokens) || 0,
        };
      }
    }

    // Write file strictly with 0o600 permissions (read/write by owner only)
    fs.writeFileSync(STATS_FILE, JSON.stringify(sanitizedRecord, null, 2), {
      encoding: "utf-8",
      mode: 0o600,
      flag: "w",
    });

    try {
      fs.chmodSync(STATS_FILE, 0o600);
    } catch {
      // chmodSync may be a no-op on some non-POSIX environments
    }
  } catch (err) {
    console.error("[mcp-shave] Warning: Failed to save stats safely:", err);
  }
}

/**
 * Records a single pruning savings event and updates cumulative stats.
 */
export function recordSavings(
  originalChars: number,
  prunedChars: number,
  serverName?: string
): { savedChars: number; savedTokens: number; percent: number } {
  const savedChars = Math.max(0, originalChars - prunedChars);
  // Estimate tokens (~4 characters per token for JSON/English)
  const savedTokens = Math.max(0, Math.ceil(savedChars / 4));
  const percent = originalChars > 0 ? Math.round((savedChars / originalChars) * 100) : 0;

  const current = loadStats();
  current.totalOriginalChars += originalChars;
  current.totalPrunedChars += prunedChars;
  current.totalSavedChars += savedChars;
  current.totalSavedTokens += savedTokens;
  current.totalRequestsPruned += 1;
  current.lastUpdated = new Date().toISOString();

  if (serverName) {
    const cleanSrv = sanitizeServerName(serverName);
    current.servers = current.servers || {};
    const srv = current.servers[cleanSrv] || {
      requestsPruned: 0,
      savedChars: 0,
      savedTokens: 0,
    };
    srv.requestsPruned += 1;
    srv.savedChars += savedChars;
    srv.savedTokens += savedTokens;
    current.servers[cleanSrv] = srv;
  }

  saveStats(current);

  return { savedChars, savedTokens, percent };
}

/**
 * Prints cumulative stats summary to stderr.
 */
export function printStatsSummary(): void {
  const stats = loadStats();
  const overallPercent =
    stats.totalOriginalChars > 0
      ? Math.round((stats.totalSavedChars / stats.totalOriginalChars) * 100)
      : 0;

  console.error("--- mcp-shave Cumulative Savings ---");
  console.error(`Total Requests Pruned: ${stats.totalRequestsPruned}`);
  console.error(`Original Size:        ${stats.totalOriginalChars.toLocaleString()} characters`);
  console.error(`Pruned Size:          ${stats.totalPrunedChars.toLocaleString()} characters`);
  console.error(`Characters Saved:     ${stats.totalSavedChars.toLocaleString()} characters`);
  console.error(`Tokens Saved:         ~${stats.totalSavedTokens.toLocaleString()} tokens`);
  console.error(`Overall Reduction:    ${overallPercent}%`);
  if (stats.servers && Object.keys(stats.servers).length > 0) {
    console.error("Servers breakdown:");
    for (const [srv, data] of Object.entries(stats.servers)) {
      console.error(
        `  • ${srv}: ${data.requestsPruned} requests, ~${data.savedTokens.toLocaleString()} tokens saved`
      );
    }
  }
  console.error(`Stats File:           ${STATS_FILE} (permissions: 0600)`);
  console.error("-----------------------------------");
}
