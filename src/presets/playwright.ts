/**
 * Preset rules for pruning Playwright / browser automation MCP server responses.
 * Targets invisible DOM elements, empty nodes, unnecessary SVG paths,
 * and hidden accessibility nodes.
 */

export const PLAYWRIGHT_JUNK_KEYS = new Set([
  "boundingBox",
  "clientRects",
  "computedStyle",
  "backendNodeId",
]);

/**
 * Checks whether an object represents a hidden or empty DOM node in Playwright snapshots.
 */
export function isPlaywrightHiddenOrEmpty(node: Record<string, unknown>): boolean {
  // Check for explicitly hidden elements
  if (
    node.hidden === true ||
    node["aria-hidden"] === true ||
    node.isVisible === false ||
    node.visible === false
  ) {
    return true;
  }

  // Check for styles indicating invisible elements
  if (
    node.display === "none" ||
    node.visibility === "hidden" ||
    node.opacity === 0 ||
    node.opacity === "0"
  ) {
    return true;
  }

  // Check for empty generic/presentation containers with no children and no text
  const role = typeof node.role === "string" ? node.role.toLowerCase() : "";
  if (
    (role === "none" || role === "presentation" || role === "generic") &&
    (!node.name || (typeof node.name === "string" && node.name.trim() === "")) &&
    (!node.text || (typeof node.text === "string" && node.text.trim() === "")) &&
    (!Array.isArray(node.children) || node.children.length === 0)
  ) {
    return true;
  }

  return false;
}

/**
 * Checks whether a key in Playwright DOM node is redundant.
 */
export function isPlaywrightJunkKey(key: string, value: unknown): boolean {
  if (PLAYWRIGHT_JUNK_KEYS.has(key)) {
    return true;
  }

  // Strip massive SVG path data or base64 data URLs
  if (typeof value === "string") {
    if (value.startsWith("data:image/") || (key === "d" && value.length > 50)) {
      return true;
    }
  }

  return false;
}
