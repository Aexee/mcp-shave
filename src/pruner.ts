import { isGithubJunkKey } from "./presets/github.js";
import { isPlaywrightHiddenOrEmpty, isPlaywrightJunkKey } from "./presets/playwright.js";

export const MAX_PAYLOAD_SIZE = 25 * 1024 * 1024; // 25 MB bypass limit
export const MAX_RECURSION_DEPTH = 50; // Maximum traversal depth

export interface PruneResult {
  prunedMessage: Record<string, unknown>;
  originalChars: number;
  prunedChars: number;
  savedChars: number;
  savedTokens: number;
  percent: number;
  didPrune: boolean;
}

export interface PrunerOptions {
  preset?: "auto" | "github" | "playwright" | "none";
  stripNulls?: boolean;
  stripEmptyArrays?: boolean;
  stripEmptyObjects?: boolean;
}

const DEFAULT_OPTIONS: Required<PrunerOptions> = {
  preset: "auto",
  stripNulls: true,
  stripEmptyArrays: true,
  stripEmptyObjects: true,
};

/**
 * Checks if a key represents prototype pollution attack vectors.
 */
export function isDangerousKey(key: string): boolean {
  return key === "__proto__" || key === "constructor" || key === "prototype";
}

/**
 * Determines whether a given key should be considered junk based on preset.
 */
function shouldStripKey(key: string, value: unknown, preset: string): boolean {
  if (isDangerousKey(key)) {
    return true;
  }

  if (preset === "github" || preset === "auto") {
    if (isGithubJunkKey(key)) {
      return true;
    }
  }

  if (preset === "playwright" || preset === "auto") {
    if (isPlaywrightJunkKey(key, value)) {
      return true;
    }
  }

  // Common noisy fields across REST/RPC APIs
  if (
    key === "avatar_url" ||
    key === "followers_url" ||
    key === "gravatar_id" ||
    key === "node_id"
  ) {
    return true;
  }

  return false;
}

/**
 * Recursively prunes an arbitrary JSON-compatible value:
 * - Guards against prototype pollution (__proto__, constructor, prototype)
 * - Guards against infinite recursion via depth limit and cycle detection
 * - Removes null and undefined values
 * - Removes empty arrays
 * - Removes specified junk keys (*_url, node_id, gravatar_id, permissions, etc.)
 * - Removes hidden/empty DOM nodes for Playwright
 * - Removes empty objects resulting from pruning
 */
export function pruneValue(
  value: unknown,
  options: Required<PrunerOptions> = DEFAULT_OPTIONS,
  depth = 0,
  seen: WeakSet<object> = new WeakSet(),
  isRoot = true
): unknown {
  // Guard against excessive nesting (depth limit)
  if (depth >= MAX_RECURSION_DEPTH) {
    return value;
  }

  if (value === null || value === undefined) {
    return undefined;
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return undefined; // Cycle break
    }
    seen.add(value);

    const prunedList: unknown[] = [];
    for (const item of value) {
      const prunedItem = pruneValue(item, options, depth + 1, seen, false);
      if (prunedItem !== undefined) {
        prunedList.push(prunedItem);
      }
    }

    if (options.stripEmptyArrays && prunedList.length === 0) {
      return undefined;
    }

    return prunedList;
  }

  if (typeof value === "object") {
    if (seen.has(value)) {
      return undefined; // Cycle break
    }
    seen.add(value);

    const record = value as Record<string, unknown>;

    // Playwright preset: strip hidden or empty DOM nodes
    if (
      (options.preset === "playwright" || options.preset === "auto") &&
      isPlaywrightHiddenOrEmpty(record)
    ) {
      return undefined;
    }

    const prunedObj: Record<string, unknown> = {};

    for (const key of Object.keys(record)) {
      // Guard against prototype pollution
      if (isDangerousKey(key)) {
        continue;
      }

      if (!Object.prototype.hasOwnProperty.call(record, key)) {
        continue;
      }

      const val = record[key];

      if (val === null || val === undefined) {
        if (options.stripNulls) continue;
      }

      if (shouldStripKey(key, val, options.preset)) {
        continue;
      }

      const prunedVal = pruneValue(val, options, depth + 1, seen, false);
      if (prunedVal !== undefined) {
        prunedObj[key] = prunedVal;
      }
    }

    // Strip empty objects if not root
    if (options.stripEmptyObjects && !isRoot && Object.keys(prunedObj).length === 0) {
      return undefined;
    }

    return prunedObj;
  }

  return value;
}

/**
 * Attempts to parse and prune JSON payloads within text strings.
 * Includes size bypass to prevent memory crashes on oversized payloads (> 25MB).
 */
export function pruneJsonString(
  jsonStr: string,
  options: Required<PrunerOptions> = DEFAULT_OPTIONS
): { prunedStr: string; didPrune: boolean } {
  // Payload size bypass: if payload exceeds 25MB, pass through safely without JSON parsing
  if (jsonStr.length > MAX_PAYLOAD_SIZE) {
    return { prunedStr: jsonStr, didPrune: false };
  }

  const trimmed = jsonStr.trim();
  if (
    (!trimmed.startsWith("{") && !trimmed.startsWith("[")) ||
    (!trimmed.endsWith("}") && !trimmed.endsWith("]"))
  ) {
    return { prunedStr: jsonStr, didPrune: false };
  }

  try {
    const parsed = JSON.parse(trimmed);
    const pruned = pruneValue(parsed, options, 0, new WeakSet(), true);
    // If the entire payload was pruned to undefined, preserve an empty object
    const finalVal = pruned === undefined ? {} : pruned;
    const prunedStr = JSON.stringify(finalVal);
    return { prunedStr, didPrune: true };
  } catch {
    // If it's not valid JSON, leave it as is
    return { prunedStr: jsonStr, didPrune: false };
  }
}

/**
 * Intercepts JSON-RPC responses (specifically tools/call results) and recursively
 * strips noisy fields from result.content[].text and calculates character/token savings.
 */
export function pruneJsonRpcMessage(
  message: Record<string, unknown>,
  opts: PrunerOptions = {}
): PruneResult {
  const options: Required<PrunerOptions> = { ...DEFAULT_OPTIONS, ...opts };
  const rawOriginal = JSON.stringify(message);
  const originalChars = rawOriginal.length;

  // Bypass pruning if entire message exceeds 25MB
  if (originalChars > MAX_PAYLOAD_SIZE) {
    return {
      prunedMessage: message,
      originalChars,
      prunedChars: originalChars,
      savedChars: 0,
      savedTokens: 0,
      percent: 0,
      didPrune: false,
    };
  }

  let didPrune = false;
  const prunedMessage = { ...message };

  if (
    prunedMessage.result &&
    typeof prunedMessage.result === "object" &&
    prunedMessage.result !== null
  ) {
    const resultObj = { ...(prunedMessage.result as Record<string, unknown>) };
    prunedMessage.result = resultObj;

    // Standard MCP CallToolResult format: result.content = [{ type: 'text', text: '...' }]
    if (Array.isArray(resultObj.content)) {
      resultObj.content = resultObj.content.map((contentItem) => {
        if (
          contentItem &&
          typeof contentItem === "object" &&
          contentItem.type === "text" &&
          typeof contentItem.text === "string"
        ) {
          const { prunedStr, didPrune: itemDidPrune } = pruneJsonString(contentItem.text, options);
          if (itemDidPrune) {
            didPrune = true;
            return {
              ...contentItem,
              text: prunedStr,
            };
          }
        }
        return contentItem;
      });
    }

    // Also prune if result itself has structured data (e.g. non-content fields or data objects)
    for (const key of Object.keys(resultObj)) {
      if (isDangerousKey(key)) {
        delete resultObj[key];
        continue;
      }
      const value = resultObj[key];
      if (key !== "content" && typeof value === "object" && value !== null) {
        const pruned = pruneValue(value, options, 0, new WeakSet(), false);
        if (pruned !== value) {
          resultObj[key] = pruned;
          didPrune = true;
        }
      }
    }
  }

  const rawPruned = JSON.stringify(prunedMessage);
  const prunedChars = rawPruned.length;
  const savedChars = Math.max(0, originalChars - prunedChars);
  const savedTokens = Math.max(0, Math.ceil(savedChars / 4));
  const percent = originalChars > 0 ? Math.round((savedChars / originalChars) * 100) : 0;

  return {
    prunedMessage,
    originalChars,
    prunedChars,
    savedChars,
    savedTokens,
    percent,
    didPrune,
  };
}
