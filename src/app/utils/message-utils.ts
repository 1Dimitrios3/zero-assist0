import { UIMessage } from "ai";

// Final states for tool calls (no more state transitions expected)
const FINAL_TOOL_STATES = ["output-available", "output-error", "output-denied"];

/**
 * Collects tool call IDs that have reached a final state (output-available or output-error).
 *
 * @param messages - Array of UI messages to scan
 * @returns Set of completed tool call IDs
 */
export function getCompletedToolCallIds(messages: UIMessage[]): Set<string> {
  const completedToolCallIds = new Set<string>();
  for (const msg of messages) {
    for (const part of msg.parts) {
      if (
        part.type.startsWith("tool-") &&
        "state" in part &&
        FINAL_TOOL_STATES.includes(part.state as string) &&
        "toolCallId" in part
      ) {
        completedToolCallIds.add(part.toolCallId as string);
      }
    }
  }
  return completedToolCallIds;
}

/**
 * Removes superseded tool parts from assistant messages and filters out empty messages.
 *
 * For completed tool calls, only keeps the final "output-available" state and removes
 * intermediate states (approval-requested, approval-responded). Also deduplicates to
 * ensure each tool call ID only appears once. User messages and non-tool parts are kept as-is.
 *
 * @param messages - Array of UI messages to filter
 * @param completedToolCallIds - Set of tool call IDs that have completed
 * @returns Filtered messages with superseded tool parts removed
 */
export function filterSupersededToolParts(
  messages: UIMessage[],
  completedToolCallIds: Set<string>
): UIMessage[] {
  // Track which tool calls we've already included to avoid duplicates
  const includedToolCallIds = new Set<string>();

  // Find the last assistant message index — non-completed tool parts
  // in this message may be from the CURRENT stream (pending approval).
  // Only remove non-completed parts from OLDER messages (true orphans).
  const lastAssistantIdx = messages.findLastIndex(
    (m) => m.role === "assistant"
  );

  return messages
    .map((msg, idx) => {
      // Keep non-assistant messages as-is
      if (msg.role !== "assistant") return msg;

      // Track whether this message had completed tool parts (whose final
      // state lives in a subsequent message, meaning text is duplicated).
      const hadCompletedToolParts = msg.parts.some(
        (p) =>
          p.type.startsWith("tool-") &&
          "toolCallId" in p &&
          completedToolCallIds.has(p.toolCallId as string)
      );

      const filteredParts = msg.parts.filter((part) => {
        // Keep non-tool parts
        if (!part.type.startsWith("tool-")) return true;

        // For tool parts, check if superseded, orphaned, or duplicate
        if ("toolCallId" in part && "state" in part) {
          const toolCallId = part.toolCallId as string;
          const state = part.state as string;

          if (!completedToolCallIds.has(toolCallId)) {
            // Keep non-completed tool parts in the LAST assistant message
            // (they might be pending approval from the current stream).
            // Remove from older messages — they're orphans from past
            // interrupted interactions.
            if (idx === lastAssistantIdx) {
              if (includedToolCallIds.has(toolCallId)) return false;
              includedToolCallIds.add(toolCallId);
              return true;
            }
            return false;
          }

          // For completed tools, only keep final state and only once
          if (FINAL_TOOL_STATES.includes(state)) {
            if (includedToolCallIds.has(toolCallId)) {
              return false; // Already included, skip duplicate
            }
            includedToolCallIds.add(toolCallId);
            return true;
          }

          // Remove intermediate states (approval-requested, approval-responded)
          return false;
        }

        return true;
      });

      const hasToolPartsAfterFilter = filteredParts.some((p) => p.type.startsWith("tool-"));

      // Drop "husk" messages whose COMPLETED tool parts were all superseded
      // (their final state lives in a subsequent message, so text is
      // duplicated there). Don't husk messages that only had orphaned
      // (non-completed) tool parts removed — their text isn't duplicated.
      if (hadCompletedToolParts && !hasToolPartsAfterFilter) {
        return { ...msg, parts: [] };
      }

      return { ...msg, parts: filteredParts };
    })
    .filter((msg) => msg.parts.length > 0);
}
