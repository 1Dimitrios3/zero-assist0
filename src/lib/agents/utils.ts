/**
 * Shared utilities for agent configurations.
 */

import { UIMessage, convertToModelMessages } from "ai";
import type { Tool } from "ai";
import { listDocs } from "../google-docs";

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
 * Extracts the concatenated text content from a message's text parts.
 */
export function extractTextFromMessage(message: UIMessage): string {
  return (
    message.parts
      ?.filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join(" ") ?? ""
  );
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
 * Extracts document metadata (id, name, webViewLink) from headless agent
 * tool results. Returns a formatted string to append to priorAgentResult
 * so the next agent has reliable access to doc links — regardless of whether
 * the LLM included them in its text output.
 */
export function extractDocMetadataFromSteps(
  steps: Array<{ toolResults: Array<Record<string, unknown>> }>
): string | null {
  const docs: Array<{ id: string; name: string; webViewLink: string }> = [];
  const seenIds = new Set<string>();

  console.log("[extractDocMetadata] scanning", steps.length, "steps");

  for (const step of steps) {
    for (const tr of step.toolResults) {
      const toolName = tr.toolName as string | undefined;
      const toolResult = tr.result ?? tr.output;
      console.log("[extractDocMetadata] tool:", toolName);
      if (!toolName || !["searchDocs", "readDoc", "listDocs", "createDoc"].includes(toolName)) continue;

      const items = Array.isArray(toolResult) ? toolResult : [toolResult];
      console.log("[extractDocMetadata] items from", tr.toolName, ":", items.length);
      for (const item of items) {
        if (item && typeof item === "object" && "id" in item && "webViewLink" in item) {
          const doc = item as { id: string; name?: string; title?: string; webViewLink: string };
          const docName = doc.name ?? doc.title ?? "Untitled";
          if (!seenIds.has(doc.id)) {
            seenIds.add(doc.id);
            docs.push({ id: doc.id, name: docName, webViewLink: doc.webViewLink });
            console.log("[extractDocMetadata] found doc:", docName, "->", doc.webViewLink);
          }
        }
      }
    }
  }

  console.log("[extractDocMetadata] total docs extracted:", docs.length);

  if (docs.length === 0) return null;

  const lines = docs.map((d) => `- "${d.name}" (ID: ${d.id}) — ${d.webViewLink}`);
  return `\n\nDocuments found:\n${lines.join("\n")}`;
}

/**
 * Cleans up converted model messages:
 * 1. Deduplicate tool-call and tool-result entries by toolCallId
 * 2. Add synthetic results for orphaned tool-calls (calls without results)
 *    to prevent "No tool output found for function call" API errors —
 *    unlike removing orphans, this preserves the call so the agent knows
 *    the tool was attempted and won't retry in a loop
 * 3. Remove content-level duplicate messages to prevent
 *    "Duplicate item found with id" API errors
 */
export function deduplicateModelMessages(messages: ModelMessages): ModelMessages {
  // --- Pass 1: deduplicate by toolCallId ---
  const seenCalls = new Set<string>();
  const seenResults = new Set<string>();

  const deduped = messages
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
    });

  // --- Pass 2: add synthetic results for orphaned tool-calls ---
  // Collect all surviving call IDs (with tool names) and result IDs
  const callInfo = new Map<string, string>(); // callId → toolName
  const resultIds = new Set<string>();
  const approvalToCallId = new Map<string, string>(); // approvalId → toolCallId

  for (const msg of deduped) {
    if (msg.role === "assistant" && Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part.type === "tool-call") {
          callInfo.set(part.toolCallId, part.toolName);
        }
        // Map approval requests to their tool calls so we can recognise
        // approval responses as valid "results" for orphan detection
        if (
          part.type === "tool-approval-request" &&
          "toolCallId" in part &&
          "approvalId" in part
        ) {
          approvalToCallId.set(
            part.approvalId,
            part.toolCallId,
          );
        }
      }
    }
    if (msg.role === "tool") {
      for (const part of msg.content) {
        if (part.type === "tool-result") {
          resultIds.add(part.toolCallId);
        }
        // Approval responses (approve or reject) also count as a response
        // to a tool call — don't treat these calls as orphaned
        if (
          part.type === "tool-approval-response" &&
          "approvalId" in part
        ) {
          const callId = approvalToCallId.get(
            part.approvalId,
          );
          if (callId) resultIds.add(callId);
        }
      }
    }
  }

  const orphanedCallIds = [...callInfo.keys()].filter(
    (id) => !resultIds.has(id)
  );

  let result: ModelMessages[number][];

  if (orphanedCallIds.length > 0) {
    const remainingOrphans = new Set(orphanedCallIds);
    result = [];

    for (const msg of deduped) {
      result.push(msg);

      // After assistant messages containing orphaned calls, insert synthetic results
      if (
        msg.role === "assistant" &&
        Array.isArray(msg.content) &&
        remainingOrphans.size > 0
      ) {
        const orphansHere = msg.content
          .filter(
            (p) => p.type === "tool-call" && remainingOrphans.has(p.toolCallId)
          )
          .map((p) => (p as { toolCallId: string; toolName: string }).toolCallId);

        if (orphansHere.length > 0) {
          result.push({
            role: "tool",
            content: orphansHere.map((id) => ({
              type: "tool-result" as const,
              toolCallId: id,
              toolName: callInfo.get(id) ?? "unknown",
              output: {
                type: "text" as const,
                value:
                  "This tool call was not completed. The action was interrupted or not approved by the user. Do not retry.",
              },
            })),
          } as ModelMessages[number]);

          for (const id of orphansHere) remainingOrphans.delete(id);
        }
      }
    }
  } else {
    result = deduped;
  }

  // --- Pass 3: remove duplicate messages by content ---
  const seenMessages = new Set<string>();
  return result.filter((msg) => {
    const key = `${msg.role}:${JSON.stringify(msg.content)}`;
    if (seenMessages.has(key)) return false;
    seenMessages.add(key);
    return true;
  }) as ModelMessages;
}

/**
 * Strips `needsApproval` from all tool definitions so they execute
 * unconditionally in headless (generateText) mode. Only used for
 * non-final agents in chained pipelines — the final streaming agent
 * still has full approval dialogs.
 */
export function stripToolApprovals(
  tools: Record<string, Tool> | undefined
): Record<string, Tool> | undefined {
  if (!tools) return tools;
  const stripped: Record<string, Tool> = {};
  for (const [name, t] of Object.entries(tools)) {
    stripped[name] = { ...t, needsApproval: false };
  }
  return stripped;
}

/**
 * Fetches the most recently modified Google Doc and returns a formatted
 * priorAgentResult string with its metadata. Used to recover doc context
 * across requests (headless results are ephemeral and lost between requests).
 */
export async function recoverDocMetadata(): Promise<string | null> {
  try {
    const recentDocs = await listDocs(1);
    if (recentDocs.length > 0) {
      const doc = recentDocs[0];
      console.log("[orchestrator] recovered doc metadata:", doc.name, "->", doc.webViewLink);
      return `Document previously created/found:\n- "${doc.name}" (ID: ${doc.id}) — ${doc.webViewLink}`;
    }
  } catch {
    console.log("[orchestrator] could not recover doc metadata");
  }
  return null;
}

/**
 * Extracts recent conversation context (last few exchanges) for the classifier.
 * Returns a summary of the last 2-3 user/assistant text exchanges.
 */
export function getRecentContext(messages: UIMessage[]): string | undefined {
  const recent: string[] = [];
  let count = 0;

  // Walk backwards, collect up to 3 recent text exchanges (excluding the last user message)
  for (let i = messages.length - 2; i >= 0 && count < 3; i--) {
    const text = extractTextFromMessage(messages[i]);

    if (text) {
      recent.unshift(`${messages[i].role}: ${text.slice(0, 300)}`);
      count++;
    }
  }

  return recent.length > 0 ? recent.join("\n") : undefined;
}

/**
 * Checks if a Google Doc has already been created/found in this conversation.
 * Since docs tools run headlessly (via generateText), their tool parts never
 * appear in UIMessages. Checks conversation HISTORY (excluding the last user
 * message, which is the current request) for:
 * 1. Google Docs URLs (e.g., docs.google.com/document/d/...)
 * 2. Doc work phrases in assistant text (e.g., "create the document",
 *    "document created") — catches natural phrasing where the assistant
 *    mentions a completed or planned doc operation
 * 3. User references to a known document in earlier messages (e.g.,
 *    "the document is already created", "add the doc link")
 *
 * IMPORTANT: The last user message is excluded because it contains the
 * current request (e.g., "Create a new document..."), not evidence of
 * prior doc work. Matching it would falsely skip the headless docs agent.
 */
export function hasDocContextInConversation(messages: UIMessage[]): boolean {
  const docsUrlPattern = /docs\.google\.com\/document\/d\//;
  // Matches "create the document", "created a doc", "document was created", etc.
  const docWorkPattern = /\bcreate[ds]?\b[^.!?]*\bdoc(?:ument)?\b|\bdoc(?:ument)?\b[^.!?]*\b(?:created?|found|titled|named)\b/i;
  // Matches user references to a known document ("the document", "the doc", "my doc")
  const docReferencePattern = /\b(?:the|this|that|my)\s+doc(?:ument)?\b/i;

  // Only check conversation history — exclude the last user message
  // (it's the current request, not evidence of prior doc work)
  const lastUserIdx = messages.findLastIndex((m) => m.role === "user");
  const historyMessages = lastUserIdx >= 0 ? messages.slice(0, lastUserIdx) : messages;

  for (const msg of historyMessages) {
    const text = extractTextFromMessage(msg);
    if (!text) continue;

    if (docsUrlPattern.test(text)) {
      console.log("[orchestrator] found doc context in conversation (URL)");
      return true;
    }
    if (docWorkPattern.test(text)) {
      console.log("[orchestrator] found doc context in conversation (doc work)");
      return true;
    }
    if (msg.role === "user" && docReferencePattern.test(text)) {
      console.log("[orchestrator] found doc context in conversation (user reference)");
      return true;
    }
  }
  console.log("[orchestrator] no doc context in conversation");
  return false;
}

/**
 * Detects if this request is a tool-approval continuation rather than a new
 * user request. When the frontend auto-sends after a tool approval, the
 * messages array contains assistant messages (with tool calls) after the
 * last user text message. In that case headless agents have already run
 * and should not re-execute.
 */
export function isToolApprovalContinuation(messages: UIMessage[]): boolean {
  const lastUserIdx = messages.findLastIndex((m) => m.role === "user");
  if (lastUserIdx === -1) return false;
  // If there are assistant messages after the last user message,
  // this is a continuation (approval response), not a new request
  return messages.slice(lastUserIdx + 1).some((m) => m.role === "assistant");
}

/**
 * Extracts the text content from the last user message.
 */
export function getLastUserText(messages: UIMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      return extractTextFromMessage(messages[i]) || null;
    }
  }
  return null;
}
