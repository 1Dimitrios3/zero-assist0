import { UIMessage } from "ai";
import { calendarTools } from "@/lib/agents/calendar/tools";

/**
 * Tool part with approval state - matches AI SDK's tool invocation structure
 */
export type ToolInvocationPart = {
  type: `tool-${string}`;
  toolCallId: string;
  state: "approval-requested" | "approval-responded" | "output-available" | "output-error" | "output-denied";
  input: Record<string, unknown>;
  output?: unknown;
  approval?: { id: string };
};

/**
 * Text part in a message
 */
export type TextPart = {
  type: "text";
  text: string;
};

/**
 * Union of all possible message parts
 */
export type MessagePart = TextPart | ToolInvocationPart;

/**
 * Type guard to check if a part is a tool invocation
 */
export function isToolPart(part: MessagePart): part is ToolInvocationPart {
  return part.type.startsWith("tool-");
}

/**
 * Type guard to check if a part is a text part
 */
export function isTextPart(part: MessagePart): part is TextPart {
  return part.type === "text";
}

/**
 * Type guard to check if a tool part needs approval
 */
export function needsApproval(part: ToolInvocationPart): boolean {
  return part.state === "approval-requested" && !!part.approval;
}

/**
 * Available calendar tool names
 */
export type CalendarToolName = keyof typeof calendarTools;

/**
 * Custom message type with better typing for parts
 * Note: This is a convenience type - the actual UIMessage from AI SDK
 * uses a more complex generic structure
 */
export type ChatMessage = UIMessage;
