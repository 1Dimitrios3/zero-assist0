/**
 * Shared utilities for agent configurations.
 */

import { UIMessage, convertToModelMessages } from "ai";

/** Model messages type returned by the AI SDK's convertToModelMessages */
export type ModelMessages = Awaited<ReturnType<typeof convertToModelMessages>>;

/**
 * Strips all tool-related parts from messages, keeping only text parts.
 * Drops messages that become empty after stripping.
 * Used to prevent cross-agent tool call/result mismatches in headless execution.
 */
export function stripToolPartsFromMessages(messages: UIMessage[]): UIMessage[] {
  return messages
    .map((msg) => ({
      ...msg,
      parts: msg.parts.filter((part) => part.type === "text"),
    }))
    .filter((msg) => msg.parts.length > 0);
}

/**
 * Returns formatted current date, ISO date, and timezone for system prompts.
 */
export function getCurrentDateInfo(): string {
  const now = new Date();
  const options: Intl.DateTimeFormatOptions = {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  };
  const formattedDate = now.toLocaleDateString("en-US", options);
  const isoDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return `Current date: ${formattedDate} (${isoDate})\nUser's timezone: ${timeZone}`;
}

/**
 * Removes duplicate tool-call and tool-result entries from converted model
 * messages. Needed because convertToModelMessages reads internal UIMessage
 * state that our parts-level filtering cannot reach, so the same toolCallId
 * can appear multiple times in the output.
 */
export function deduplicateModelMessages(messages: ModelMessages): ModelMessages {
  const seenCalls = new Set<string>();
  const seenResults = new Set<string>();

  return messages
    .map((msg) => {
      if (msg.role === "assistant" && Array.isArray(msg.content)) {
        return {
          ...msg,
          content: msg.content.filter((part) => {
            if (part.type === "tool-call") {
              if (seenCalls.has(part.toolCallId)) return false;
              seenCalls.add(part.toolCallId);
            }
            return true;
          }),
        };
      }
      if (msg.role === "tool") {
        return {
          ...msg,
          content: msg.content.filter((part) => {
            if (part.type === "tool-result") {
              if (seenResults.has(part.toolCallId)) return false;
              seenResults.add(part.toolCallId);
            }
            return true;
          }),
        };
      }
      return msg;
    })
    .filter((msg) => {
      if (
        (msg.role === "assistant" || msg.role === "tool") &&
        Array.isArray(msg.content)
      ) {
        return msg.content.length > 0;
      }
      return true;
    }) as ModelMessages;
}
