import { generateText, Output, UIMessage } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { listEvents } from "../../google-calendar";

/**
 * Result of the high-level conflict check.
 */
export interface ConflictCheckResult {
  hasConflict: boolean;
  conflictContext: string;
}

const eventIntentSchema = z.object({
  isCreateEvent: z
    .boolean()
    .describe(
      "Whether the user is requesting to create/schedule a new calendar event"
    ),
  proposedStartTime: z
    .string()
    .nullable()
    .describe(
      "The proposed start time in ISO 8601 format, if detectable from the message. Null if not detectable."
    ),
  proposedEndTime: z
    .string()
    .nullable()
    .describe(
      "The proposed end time in ISO 8601 format, if detectable. If only start time is mentioned, assume 1 hour duration. Null if not detectable."
    ),
});

const conflictDetectionSchema = z.object({
  decision: z.enum(["0", "1"]),
  conflictingEvents: z
    .array(
      z.object({
        title: z.string(),
        startTime: z.string(),
        endTime: z.string(),
      })
    )
    .nullable()
    .describe("Array of overlapping events when decision is 1, null otherwise"),
  summary: z
    .string()
    .nullable()
    .describe("Brief description of conflicts when decision is 1, null otherwise"),
});

export const extractEventIntent = async (
  userMessage: string,
  currentDate: string,
  timeZone: string
) => {
  const result = await generateText({
    model: openai("gpt-4o-mini"),
    output: Output.object({ schema: eventIntentSchema }),
    prompt: `You are analyzing a user message to determine if they want to create or schedule a new calendar event.

Current date/time: ${currentDate}
User's timezone: ${timeZone}

User message: "${userMessage}"

Determine:
1. Is this a request to CREATE or SCHEDULE a new event? (not list, search, update, or delete)
2. If yes, extract the proposed start and end times in ISO 8601 format with the correct timezone offset for ${timeZone}. For example, if the timezone is Europe/Athens (UTC+2), "10am" should be "2026-02-15T10:00:00+02:00", NOT "2026-02-15T10:00:00Z".
3. If only a start time is mentioned, assume a 1-hour duration.
4. If times cannot be determined, set them to null.`,
  });

  return result.output;
};

export const getExistingEvents = async (
  proposedStart: string,
  proposedEnd: string
) => {
  const events = await listEvents(proposedStart, proposedEnd);

  return events.map((event: any) => ({
    title: event.summary || "Untitled Event",
    start: event.start?.dateTime || event.start?.date,
    end: event.end?.dateTime || event.end?.date,
  }));
};

export const detectConflict = async (
  existingEvents: Array<{ title: string; start: string; end: string }>,
  proposedStart: string,
  proposedEnd: string
) => {
  const conflictRouterResult = await generateText({
    model: openai("gpt-4o-mini"),
    output: Output.object({ schema: conflictDetectionSchema }),
    prompt: `You are a calendar conflict detection router.
Your job is to determine if a proposed event time overlaps with any existing events.

<existing-events>
  ${JSON.stringify(existingEvents, null, 2)}
</existing-events>

<proposed-time>
  Start: ${proposedStart}
  End: ${proposedEnd}
</proposed-time>

<rules>
  - Return "1" if ANY existing event overlaps with the proposed time range (even partial overlap).
  - Return "0" if the proposed time slot is completely free with no overlapping events.
  - If decision is "1", populate conflictingEvents with the details of ALL overlapping events.
  - If decision is "1", provide a brief human-readable summary of the conflicts.
  - A conflict exists when: existingStart < proposedEnd AND existingEnd > proposedStart.
</rules>

<output-format>
  Return a JSON object with:
  - decision: strictly "0" or "1"
  - conflictingEvents: array of overlapping events (only when decision is "1")
  - summary: brief description of conflicts (only when decision is "1")
</output-format>`,
  });

  console.log(
    "conflictRouterResult.output.decision --->",
    conflictRouterResult.output?.decision
  );
  return conflictRouterResult;
};

export const formatConflictMessage = (result: {
  conflictingEvents?: Array<{
    title: string;
    startTime: string;
    endTime: string;
  }> | null;
  summary?: string | null;
}): string => {
  let message = `**Scheduling Conflict Detected**\n\n`;

  if (result.summary) {
    message += `${result.summary}\n\n`;
  }

  if (result.conflictingEvents && result.conflictingEvents.length > 0) {
    message += `Conflicting events:\n`;
    for (const event of result.conflictingEvents) {
      message += `- **${event.title}**: ${event.startTime} → ${event.endTime}\n`;
    }
  }

  message += `\nWould you like to:\n`;
  message += `• Choose a different time?\n`;
  message += `• See available slots for this day?\n`;
  message += `• Create the event anyway (override)?\n`;

  return message;
};

// ---------------------------------------------------------------------------
// High-level conflict check
// ---------------------------------------------------------------------------

/**
 * Finds the last message with the given role.
 */
function findLastMessageByRole(
  messages: UIMessage[],
  role: "user" | "assistant"
): UIMessage | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === role) return messages[i];
  }
  return undefined;
}

/**
 * Extracts the concatenated text from a message's text parts.
 */
function extractTextFromParts(message: UIMessage): string {
  return (
    message.parts
      ?.filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join(" ") ?? ""
  );
}

/**
 * Checks whether the last assistant message contains a conflictWarning tool part,
 * indicating the user is currently responding to a conflict prompt.
 */
function isRespondingToConflictWarning(messages: UIMessage[]): boolean {
  const lastAssistantMessage = findLastMessageByRole(messages, "assistant");
  return (
    lastAssistantMessage?.parts?.some(
      (p) => p.type === "tool-conflictWarning"
    ) ?? false
  );
}

/**
 * Builds the system-prompt context string that tells the LLM to proceed
 * after the user has already approved a conflict.
 */
function buildConflictApprovedContext(): string {
  return `\n\nIMPORTANT: The user was just shown a scheduling conflict warning and has APPROVED creating the event anyway. You MUST now call createEvent with the exact time the user originally requested. Do NOT suggest alternative times, do NOT warn about conflicts again, do NOT refuse. The user has made their decision and you must respect it.`;
}

/**
 * Builds the system-prompt context string that instructs the LLM to call the
 * conflictWarning tool with the detected conflict data.
 */
function buildConflictDetectedContext(
  summary: string,
  conflictingEvents: Array<{ title: string; startTime: string; endTime: string }>
): string {
  const eventsJson = JSON.stringify(conflictingEvents);
  return `\n\n<conflict-detected>
            A scheduling conflict was found. You MUST call the conflictWarning tool with this data:
            - summary: "${summary}"
            - conflictingEvents: ${eventsJson}
            Do NOT call createEvent. After the user responds to the conflict warning, follow their instructions.
            </conflict-detected>`;
}

/**
 * High-level function that encapsulates all conflict detection logic.
 *
 * It determines whether the user is creating a new event, checks for
 * scheduling conflicts with existing calendar events, and returns the
 * appropriate context to inject into the system prompt.
 *
 * @param messages - The validated UIMessage array from the chat request
 * @param googleConnected - Whether the user has connected their Google Calendar
 * @returns An object with `hasConflict` (boolean) and `conflictContext` (string)
 */
export async function checkForSchedulingConflict(
  messages: UIMessage[],
  googleConnected: boolean
): Promise<ConflictCheckResult> {
  let conflictContext = "";
  let hasConflict = false;

  // When the user types a new message, the last message is a user message.
  // When sendAutomaticallyWhen fires after tool approval, the last message is an assistant message.
  const lastMessage = messages[messages.length - 1];
  const isFreshUserMessage = lastMessage?.role === "user";

  if (googleConnected && isFreshUserMessage) {
    const lastUserMessage = findLastMessageByRole(messages, "user");
    const userText = lastUserMessage ? extractTextFromParts(lastUserMessage) : "";

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
              conflictContext = buildConflictDetectedContext(
                conflictResult.summary ?? "",
                conflictResult.conflictingEvents ?? []
              );
            }
          }
        }
      } catch (error) {
        console.error("[conflict-detection] Error:", error);
      }
    }
  }

  // When the user already responded to a conflict, tell the LLM to proceed
  if (isRespondingToConflictWarning(messages)) {
    conflictContext = buildConflictApprovedContext();
  }

  return { hasConflict, conflictContext };
}
