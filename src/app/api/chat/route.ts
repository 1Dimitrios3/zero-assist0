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
import {
  extractEventIntent,
  detectConflict,
  getExistingEvents,
} from "@/lib/conflict-detection";

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
      let conflictContext = "";
      let hasConflict = false;

      // Check if this is a fresh user message or a tool approval follow-up.
      // When the user types a new message, the last message is a user message.
      // When sendAutomaticallyWhen fires after tool approval, the last message is an assistant message.
      const lastMessage = messages[messages.length - 1];
      const isFreshUserMessage = lastMessage?.role === "user";

      const lastAssistantMessage = [...messages]
        .reverse()
        .find((m) => m.role === "assistant");
      const isRespondingToConflict = lastAssistantMessage?.parts?.some(
        (p) => p.type === "tool-conflictWarning"
      ) ?? false;

      if (googleConnected && isFreshUserMessage) {
        const lastUserMessage = [...messages]
          .reverse()
          .find((m) => m.role === "user");
        const userText = lastUserMessage?.parts
          ?.filter((p) => p.type === "text")
          .map((p) => p.text)
          .join(" ");

        if (userText) {
          try {
            const currentDate = new Date().toISOString();
            const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
            const { isCreateEvent, proposedStartTime, proposedEndTime } =
              await extractEventIntent(userText, currentDate, timeZone);
            console.log('intent.isCreateEvent ---<><><>', isCreateEvent)

            if (
              isCreateEvent &&
              proposedStartTime &&
              proposedEndTime
            ) {
              const existingEvents = await getExistingEvents(
                proposedStartTime,
                proposedEndTime
              );
              console.log('existingEvents >>>>>>>>>>', existingEvents)

              if (existingEvents.length > 0) {
                const { output: conflictResult } = await detectConflict(
                  existingEvents,
                  proposedStartTime,
                  proposedEndTime
                );

                console.log('conflictResult ><><><', conflictResult)

                if (conflictResult?.decision === "1") {
                  hasConflict = true;
                  const eventsJson = JSON.stringify(conflictResult.conflictingEvents);
                  conflictContext = `\n\n<conflict-detected>
            A scheduling conflict was found. You MUST call the conflictWarning tool with this data:
            - summary: "${conflictResult.summary}"
            - conflictingEvents: ${eventsJson}
            Do NOT call createEvent. After the user responds to the conflict warning, follow their instructions.
            </conflict-detected>`;
                }
              }
            }
          } catch (error) {
            console.error("[conflict-detection] Error:", error);
          }
        }
      }

      // When the user already responded to a conflict, tell the LLM to proceed
      if (isRespondingToConflict) {
        conflictContext = `\n\nIMPORTANT: The user was just shown a scheduling conflict warning and has APPROVED creating the event anyway. You MUST now call createEvent with the exact time the user originally requested. Do NOT suggest alternative times, do NOT warn about conflicts again, do NOT refuse. The user has made their decision and you must respect it.`;
      }

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
