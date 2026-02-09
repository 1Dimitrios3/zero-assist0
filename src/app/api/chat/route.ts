import { openai } from "@ai-sdk/openai";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  safeValidateUIMessages,
  streamText,
  UIMessage,
  stepCountIs
} from "ai";
import { calendarTools } from "@/lib/calendar-tools";
import { isAuthenticated } from "@/lib/google-calendar";
import { getSystemPrompt, MODEL_ID, MAX_TOOL_STEPS } from "./prompts";
import { getCompletedToolCallIds, filterSupersededToolParts } from "@/app/utils/message-utils";
import { checkForSchedulingConflict } from "@/lib/conflict-detection";

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function POST(req: Request) {
  const body: {
    messages: UIMessage[];
  } = await req.json();

  // Filter out messages with empty parts (can happen during automatic continuation)
  const nonEmptyMessages = body.messages.filter(
    (msg) => msg.parts && msg.parts.length > 0
  );

  // Collect tool call IDs that have reached "output-available" state
  const completedToolCallIds = getCompletedToolCallIds(nonEmptyMessages);

  // Remove superseded tool parts from messages and filter empty messages
  const filteredMessages = filterSupersededToolParts(nonEmptyMessages, completedToolCallIds);

  const validatedMessagesResult = await safeValidateUIMessages({
    messages: filteredMessages,
  });

  if (!validatedMessagesResult.success) {
    return new Response(validatedMessagesResult.error.message, { status: 400 });
  }

  const messages = validatedMessagesResult.data;

  if (messages.length === 0) {
    return new Response("No messages provided", { status: 400 });
  }

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const googleConnected = isAuthenticated();
      const modelMessages = await convertToModelMessages(messages);
      const { hasConflict, conflictContext } =
        await checkForSchedulingConflict(messages, googleConnected);

      const result = streamText({
        model: openai(MODEL_ID as string),
        system: getSystemPrompt(googleConnected) + conflictContext,
        messages: modelMessages,
        tools: googleConnected ? calendarTools : undefined,
        toolChoice: hasConflict ? { type: "tool", toolName: "conflictWarning" } : undefined,
        stopWhen: stepCountIs(MAX_TOOL_STEPS),
      });

      writer.merge(result.toUIMessageStream());
    },
    generateId: () => crypto.randomUUID(),
  });

  return createUIMessageStreamResponse({
    stream,
  });
}
